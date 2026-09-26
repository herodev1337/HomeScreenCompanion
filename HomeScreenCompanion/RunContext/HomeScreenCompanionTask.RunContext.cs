// Partial of HomeScreenCompanionTask — RunContext responsibilities (per-run state, context builders shared between Execute and RunSingleEntryInternalAsync).
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Users;
using MediaBrowser.Model.Querying;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using HomeScreenCompanion.Criteria;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        // Shared per-run state for Execute (full sync) and RunSingleEntryInternalAsync (single group).
        // Populated by BuildRunContext / BuildSingleEntryContext; phases take it as a parameter so
        // they no longer need closure-captured locals or instance fields.
        // Uses plain fields (no `required`) because the project targets netstandard2.0 where the
        // required-metadata runtime attribute is not available.
        internal sealed class RunContext
        {
            public PluginConfiguration Config;
            public bool Debug;
            public bool DryRun;
            public bool LogMissing;
            public RunLog Log;
            public DateTime StartTime;
            public Stopwatch RunTimer;
            public List<BaseItem> AllItems;
            public Dictionary<string, List<BaseItem>> ImdbLookup;
            public int MovieCount;
            public int SeriesCount;
            public List<GroupRunStats> StatsList;
            public Dictionary<string, GroupRunStats> StatsByGroupKey;
            public TagConfig? EntryConfig;
            public List<TagConfig>? GroupEntries;

            // Per-run accumulators — moved from HomeScreenCompanionTask instance fields.
            public Dictionary<Guid, HashSet<string>>? DesiredTagsMap;
            public Dictionary<Guid, BaseItem>? AllScannedEpisodeItems;
            public Dictionary<Guid, BaseItem>? AllScannedSeasonItems;
            public Dictionary<string, int>? TagAddedByTag;
            public Dictionary<string, int>? TagRemovedByTag;
            public HashSet<string>? ManagedTags;
            public HashSet<string>? FailedFetches;
            public Dictionary<string, HashSet<long>>? DesiredCollectionsMap;
            public Dictionary<string, string>? CollectionDescriptions;
            public Dictionary<string, string>? CollectionPosters;
            public HashSet<string>? ActiveCollections;
            public List<string>? PreviouslyManagedCollections;
            public HashSet<string>? CollCreatedSet;
            public Dictionary<string, int>? CollItemsAdded;
            public Dictionary<string, int>? CollItemsRemoved;
            public Dictionary<string, (TagConfig Owner, List<BaseItem> Items, HashSet<Guid> Seen)>? GroupPlaylistItems;
            public HashSet<string>? PlaylistGroupsToSkip;
        }

        // Builds the per-run context for RunSingleEntryInternalAsync (single group).
        // Returns false when validation fails or the group should be skipped — caller
        // inspects `isAiSkip` to decide whether to return (true, message) for the
        // intentional AI skip, or (false, message) for a hard failure.
        private bool BuildSingleEntryContext(string entryName, out RunContext ctx, out string message, out bool isAiSkip)
        {
            ctx = null!;
            message = null!;
            isAiSkip = false;

            var config = Plugin.Instance?.Configuration;
            if (config == null) { message = "Config not found"; return false; }

            var tagConfig = config.Tags.FirstOrDefault(t =>
                string.Equals(t.Name, entryName, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(t.Name) == false && string.Equals(t.Tag, entryName, StringComparison.OrdinalIgnoreCase)));
            if (tagConfig == null)
            {
                LastRunStatus = $"Failed: entry not found";
                _log.Error($"Group '{entryName}' was not found in the saved settings — save your settings and try again");
                message = $"Entry '{entryName}' not found in saved config";
                return false;
            }
            if (string.IsNullOrWhiteSpace(tagConfig.Tag))
            {
                LastRunStatus = "Failed: no tag name";
                _log.Error($"Group '{entryName}' has no tag name");
                message = "Entry has no tag name";
                return false;
            }

            // A group with several URLs / local sources is stored as one flat TagConfig per source
            // (same Name + Tag). tagConfig owns the shared settings; groupEntries supplies the sources.
            var groupEntryKey = GroupKey(tagConfig);
            var groupEntries = config.Tags
                .Where(t => string.Equals(GroupKey(t), groupEntryKey, StringComparison.OrdinalIgnoreCase))
                .ToList();

            string displayName = !string.IsNullOrWhiteSpace(tagConfig.Name) ? $"{tagConfig.Name} [{tagConfig.Tag.Trim()}]" : tagConfig.Tag.Trim();
            string srcLabel = string.IsNullOrEmpty(tagConfig.SourceType) ? "External" : tagConfig.SourceType;

            bool debug = config.ExtendedConsoleOutput;
            bool dryRun = config.DryRunMode;
            bool logMissing = config.LogMissingItems;
            var startTime = DateTime.Now;
            _log = new RunLog(ExecutionLog, _logger, "", debug);

            // AI early-exit — emit the standard single-group banner + skip message, set
            // LastRunStatus, and signal the caller to return (true, message) rather than
            // treat it as a failure.
            if (tagConfig.SourceType == "AI" && tagConfig.AiRefreshIntervalDays > 0 &&
                tagConfig.AiLastRunDate > DateTime.MinValue &&
                (DateTime.UtcNow - tagConfig.AiLastRunDate).TotalDays < tagConfig.AiRefreshIntervalDays)
            {
                var nextAiRun = tagConfig.AiLastRunDate.AddDays(tagConfig.AiRefreshIntervalDays);
                _log.Rule();
                _log.Info($"Home Screen Companion v{Plugin.Instance?.Version}  ·  {startTime:yyyy-MM-dd HH:mm}  ·  Single group: {displayName}");
                _log.Skip($"Skipped: AI refresh not due until {nextAiRun:yyyy-MM-dd}");
                _log.Rule();
                LastRunStatus = $"Skipped ({DateTime.Now:HH:mm})";
                message = $"Skipped — AI refresh not due until {nextAiRun:yyyy-MM-dd}";
                isAiSkip = true;
                return false;
            }

            var lib = LoadLibrarySnapshot(config);
            var allItems = lib.AllItems;
            var imdbLookup = lib.ImdbLookup;

            _log.Rule();
            _log.Info($"Home Screen Companion v{Plugin.Instance?.Version}  ·  {startTime:yyyy-MM-dd HH:mm}  ·  Single group: {displayName}");
            if (dryRun) _log.Warn("DRY RUN — nothing will be changed, the log shows what would happen");
            _log.Info($"  Library: {lib.MovieCount:N0} movies, {lib.SeriesCount:N0} series");
            _log.Rule();

            var gs = new GroupRunStats
            {
                DisplayName = displayName,
                SourceType = srcLabel,
                SourceLabel = DescribeSource(tagConfig),
                EnableTag = tagConfig.EnableTag && !tagConfig.OnlyCollection,
                EnableCollection = tagConfig.EnableCollection,
                EnableHomeSection = tagConfig.EnableHomeSection,
                EnablePlaylist = tagConfig.EnablePlaylist,
                PlaylistName = string.IsNullOrWhiteSpace(tagConfig.PlaylistName) ? tagConfig.Name : tagConfig.PlaylistName,
                PlaylistUsersTotal = tagConfig.PlaylistUserIds?.Count ?? 0,
                BoxSetHse = IsBoxSetHomeSectionEntry(tagConfig),
                TagName = tagConfig.Tag.Trim(),
                CollectionName = string.IsNullOrWhiteSpace(tagConfig.CollectionName) ? tagConfig.Tag.Trim() : tagConfig.CollectionName.Trim(),
                GroupIndex = 1,
                GroupTotal = 1
            };

            var runTimer = Stopwatch.StartNew();

            ctx = new RunContext
            {
                Config = config,
                Debug = debug,
                DryRun = dryRun,
                LogMissing = logMissing,
                Log = _log,
                StartTime = startTime,
                RunTimer = runTimer,
                AllItems = allItems,
                ImdbLookup = imdbLookup,
                MovieCount = lib.MovieCount,
                SeriesCount = lib.SeriesCount,
                StatsList = new List<GroupRunStats> { gs },
                StatsByGroupKey = new Dictionary<string, GroupRunStats>(StringComparer.OrdinalIgnoreCase) { [groupEntryKey] = gs },
                EntryConfig = tagConfig,
                GroupEntries = groupEntries
            };
            _currentRunContext = ctx;

            return true;
        }

        private struct LibrarySnapshot
        {
            public List<BaseItem> AllItems;
            public Dictionary<string, List<BaseItem>> ImdbLookup;
            public int MovieCount;
            public int SeriesCount;
        }

        private LibrarySnapshot LoadLibrarySnapshot(PluginConfiguration config)
        {
            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = BuildItemTypes(config),
                Recursive = true,
                IsVirtualItem = false
            }).ToList();

            // Items that live under the top-list folder are .strm virtual copies — never tag them
            // so they don't bleed into tag-based home screen sections.
            var topListsFolder = Path.Combine(Plugin.Instance.DataFolderPath, "toplists") + Path.DirectorySeparatorChar;

            var imdbLookup = new Dictionary<string, List<BaseItem>>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in allItems)
            {
                if (item.LocationType != LocationType.FileSystem) continue;
                if (!string.IsNullOrEmpty(item.Path) &&
                    item.Path.StartsWith(topListsFolder, StringComparison.OrdinalIgnoreCase))
                    continue;
                var imdb = item.GetProviderId("Imdb");
                if (!string.IsNullOrEmpty(imdb))
                {
                    if (!imdbLookup.ContainsKey(imdb)) imdbLookup[imdb] = new List<BaseItem>();
                    imdbLookup[imdb].Add(item);
                }
            }

            return new LibrarySnapshot
            {
                AllItems = allItems,
                ImdbLookup = imdbLookup,
                MovieCount = allItems.Count(i => i.GetType().Name.Contains("Movie")),
                SeriesCount = allItems.Count(i => i.GetType().Name.Contains("Series"))
            };
        }

        private bool BuildRunContext(out RunContext ctx)
        {
            var config = Plugin.Instance?.Configuration;
            if (config == null) { ctx = null!; return false; }

            bool debug = config.ExtendedConsoleOutput;
            bool dryRun = config.DryRunMode;
            bool logMissing = config.LogMissingItems;
            _log = new RunLog(ExecutionLog, _logger, "", debug);

            var startTime = DateTime.Now;
            var runTimer = Stopwatch.StartNew();
            _log.Rule();
            _log.Info($"Home Screen Companion v{Plugin.Instance?.Version}  ·  {startTime:yyyy-MM-dd HH:mm}  ·  Full sync");
            if (dryRun) _log.Warn("DRY RUN — nothing will be changed, the log shows what would happen");

            var lib = LoadLibrarySnapshot(config);

            int activeGroupTotal = config.Tags.Count(t => t.Active && !string.IsNullOrWhiteSpace(t.Tag));
            _log.Info($"  Library: {lib.MovieCount:N0} movies, {lib.SeriesCount:N0} series");
            _log.Info($"  Groups: {activeGroupTotal} active");
            _log.Rule();
            _log.Debug($"Library scan: {lib.AllItems.Count:N0} items, {lib.ImdbLookup.Count:N0} with IMDb id  ·  {RunLog.Elapsed(runTimer.Elapsed)}");

            ctx = new RunContext
            {
                Config = config,
                Debug = debug,
                DryRun = dryRun,
                LogMissing = logMissing,
                Log = _log,
                StartTime = startTime,
                RunTimer = runTimer,
                AllItems = lib.AllItems,
                ImdbLookup = lib.ImdbLookup,
                MovieCount = lib.MovieCount,
                SeriesCount = lib.SeriesCount,
                StatsList = new List<GroupRunStats>(),
                StatsByGroupKey = new Dictionary<string, GroupRunStats>(StringComparer.OrdinalIgnoreCase),
            };
            _currentRunContext = ctx;
            return true;
        }

        private struct MatchCaches
        {
            public Dictionary<long, BaseItem> SeriesEpisodeCache;
            public Dictionary<string, HashSet<long>> PersonCache;
            public Dictionary<string, HashSet<long>> CollectionMembershipCache;
            public Dictionary<long, CachedMediaInfo> MediaInfoCache;
            public Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)> UserDataCache;
            public Dictionary<(Guid, long), DateTimeOffset?> SeriesLastPlayedCache;
            public User[] PreloadedUsers;
            public Dictionary<long, List<string>>? SeriesEpisodeNamesCache;
        }

        private MatchCaches BuildMatchCaches(IReadOnlyCollection<TagConfig> tagSources, IReadOnlyCollection<BaseItem> allItems)
        {
            var caches = new MatchCaches
            {
                SeriesEpisodeCache = new Dictionary<long, BaseItem>(),
                PersonCache = new Dictionary<string, HashSet<long>>(StringComparer.OrdinalIgnoreCase),
                CollectionMembershipCache = new Dictionary<string, HashSet<long>>(StringComparer.OrdinalIgnoreCase),
                MediaInfoCache = new Dictionary<long, CachedMediaInfo>(),
                UserDataCache = new Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)>(),
                SeriesLastPlayedCache = new Dictionary<(Guid, long), DateTimeOffset?>(),
                SeriesEpisodeNamesCache = null
            };
            caches.PreloadedUsers = _userManager.GetUserList(new UserQuery { IsDisabled = false });

            var needsMediaInfoEval = tagSources.Any(t =>
                t.SourceType == "MediaInfo"
                || (t.MediaInfoFilters?.Count > 0 || t.MediaInfoConditions?.Count > 0));
            if (!needsMediaInfoEval) return caches;

            bool anyEpisodePersonCriteria = tagSources.Any(t =>
                TagConfigTargetsEpisodes(t)
                && GetAllCriteria(t).Any(c => { var s = c.TrimStart('!'); return s.StartsWith("Actor:") || s.StartsWith("Director:") || s.StartsWith("Writer:"); }));
            var allCriteria = tagSources
                .SelectMany(t => (t.MediaInfoFilters ?? new List<MediaInfoFilter>())
                    .SelectMany(f => f.Criteria ?? new List<string>())
                    .Concat(t.MediaInfoConditions ?? new List<string>()))
                .Select(c => c.Length > 0 && c[0] == '!' ? c.Substring(1) : c)
                .Distinct(StringComparer.OrdinalIgnoreCase);
            BaseItem[]? allPersons = null;
            foreach (var c in allCriteria)
            {
                var p = c.Split(':');
                if ((p.Length == 2 || (p.Length == 3 && (p[1] == "exact" || p[1] == "contains")))
                    && (p[0] == "Actor" || p[0] == "Director" || p[0] == "Writer")
                    && Enum.TryParse<MediaBrowser.Model.Entities.PersonType>(p[0], out var personTypeEnum))
                {
                    string matchOp = p.Length == 3 ? p[1] : "exact";
                    string personNameRaw = p.Length == 3 ? p[2].Trim() : p[1].Trim();
                    var personTypes = anyEpisodePersonCriteria && p[0] == "Actor"
                        ? new[] { personTypeEnum, MediaBrowser.Model.Entities.PersonType.GuestStar }
                        : new[] { personTypeEnum };
                    foreach (var singleName in personNameRaw.Split(new[] { ',', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).Select(n => n.Trim()).Where(n => n.Length > 0))
                    {
                        if (matchOp == "contains")
                        {
                            string containsKey = $"{p[0]}:contains:{singleName}";
                            if (caches.PersonCache.ContainsKey(containsKey)) continue;
                            allPersons ??= _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Person" } }).ToArray();
                            var combinedIds = new HashSet<long>();
                            foreach (var matchingPerson in allPersons.Where(person => person.Name?.IndexOf(singleName, StringComparison.OrdinalIgnoreCase) >= 0))
                            {
                                foreach (var mi in _libraryManager.GetItemList(new InternalItemsQuery
                                {
                                    PersonIds = new[] { matchingPerson.InternalId },
                                    PersonTypes = personTypes,
                                    IncludeItemTypes = anyEpisodePersonCriteria ? new[] { "Movie", "Series", "Episode" } : new[] { "Movie", "Series" },
                                    Recursive = true,
                                    IsVirtualItem = false
                                })) combinedIds.Add(mi.InternalId);
                            }
                            caches.PersonCache[containsKey] = combinedIds;
                        }
                        else
                        {
                            string indivKey = p.Length == 3 ? $"{p[0]}:{p[1]}:{singleName}" : $"{p[0]}:{singleName}";
                            if (caches.PersonCache.ContainsKey(indivKey)) continue;
                            var personItem = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Person" }, Name = singleName }).FirstOrDefault();
                            caches.PersonCache[indivKey] = personItem == null ? new HashSet<long>() :
                                _libraryManager.GetItemList(new InternalItemsQuery
                                {
                                    PersonIds = new[] { personItem.InternalId },
                                    PersonTypes = personTypes,
                                    IncludeItemTypes = anyEpisodePersonCriteria ? new[] { "Movie", "Series", "Episode" } : new[] { "Movie", "Series" },
                                    Recursive = true,
                                    IsVirtualItem = false
                                }).Select(x => x.InternalId).ToHashSet();
                        }
                    }
                }
            }
            foreach (var item in allItems)
            {
                if (item.LocationType != LocationType.FileSystem) continue;
                var resolved = ResolveItemForMediaInfo(item, caches.SeriesEpisodeCache);
                caches.MediaInfoCache[item.InternalId] = ExtractMediaInfo(resolved);
            }
            var collPlCriteria = tagSources
                .SelectMany(t => GetAllCriteria(t))
                .Select(c => c.Length > 0 && c[0] == '!' ? c.Substring(1) : c)
                .Where(c => c.StartsWith("Collection:", StringComparison.OrdinalIgnoreCase) || c.StartsWith("Playlist:", StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase);
            foreach (var crit in collPlCriteria)
            {
                var colonIdx = crit.IndexOf(':');
                if (colonIdx < 1) continue;
                var sourceKind = crit.Substring(0, colonIdx);
                var sourceNamesRaw = crit.Substring(colonIdx + 1).Trim();
                string[] folderTypes = sourceKind.Equals("Playlist", StringComparison.OrdinalIgnoreCase)
                    ? new[] { "Playlist" } : new[] { "BoxSet" };
                foreach (var singleName in SplitCommaValues(sourceNamesRaw))
                {
                    var indivKey = sourceKind + ":" + singleName;
                    if (caches.CollectionMembershipCache.ContainsKey(indivKey)) continue;
                    var folder = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        IncludeItemTypes = folderTypes,
                        Recursive = true
                    }).FirstOrDefault(i => string.Equals(i.Name, singleName, StringComparison.OrdinalIgnoreCase));
                    if (folder == null) { caches.CollectionMembershipCache[indivKey] = new HashSet<long>(); continue; }
                    var members = sourceKind.Equals("Playlist", StringComparison.OrdinalIgnoreCase)
                        ? _libraryManager.GetItemList(new InternalItemsQuery { ListIds = new[] { folder.InternalId } })
                        : _libraryManager.GetItemList(new InternalItemsQuery { CollectionIds = new[] { folder.InternalId }, IsVirtualItem = false });
                    var ids = new HashSet<long>();
                    foreach (var m in members)
                    {
                        ids.Add(m.InternalId);
                        if (m.GetType().Name.Contains("Series"))
                        {
                            foreach (var ep in _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Parent = m, Recursive = true, IsVirtualItem = false }))
                                ids.Add(ep.InternalId);
                        }
                    }
                    caches.CollectionMembershipCache[indivKey] = ids;
                }
            }

            bool needsItemUserData = tagSources
                .SelectMany(t => GetAllCriteria(t))
                .Any(c =>
                {
                    var cp = c.TrimStart('!').Split(':');
                    return (cp.Length == 4 && cp[0] == "LastPlayed") || cp[0] == "IsPlayed" || cp[0] == "PlayCount" || cp[0] == "WatchedByCount";
                });
            if (needsItemUserData && caches.PreloadedUsers?.Length > 0)
            {
                foreach (var user in caches.PreloadedUsers)
                {
                    foreach (var topItem in allItems)
                    {
                        var k = (user.Id, topItem.InternalId);
                        if (caches.UserDataCache.ContainsKey(k)) continue;
                        var ud0 = _userDataManager?.GetUserData(user, topItem);
                        caches.UserDataCache[k] = ud0 == null ? (false, (DateTimeOffset?)null, 0) : (ud0.Played, ud0.LastPlayedDate, ud0.PlayCount);
                    }
                }
            }

            bool needsSeriesLastPlayed = tagSources
                .SelectMany(t => GetAllCriteria(t))
                .Any(c =>
                    c.TrimStart('!').Split(':') is var p && p.Length == 4 && p[0] == "LastPlayed");
            bool needsEpisodeTitleCache = tagSources
                .SelectMany(t => GetAllCriteria(t))
                .Any(c =>
                    c.TrimStart('!').StartsWith("EpisodeTitle:", StringComparison.OrdinalIgnoreCase));
            List<BaseItem>? allEpisodes = null;
            if (needsSeriesLastPlayed || needsEpisodeTitleCache)
            {
                allEpisodes = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { "Episode" },
                    Recursive = true,
                    IsVirtualItem = false
                }).ToList();
            }

            if (needsSeriesLastPlayed && caches.PreloadedUsers?.Length > 0 && allEpisodes != null)
            {
                foreach (var user in caches.PreloadedUsers)
                {
                    foreach (var ep in allEpisodes)
                    {
                        var epCacheKey = (user.Id, ep.InternalId);
                        if (caches.UserDataCache.ContainsKey(epCacheKey)) continue;
                        var ud = _userDataManager?.GetUserData(user, ep);
                        caches.UserDataCache[epCacheKey] = ud == null ? (false, (DateTimeOffset?)null, 0) : (ud.Played, ud.LastPlayedDate, ud.PlayCount);
                    }

                    var episodesBySeriesInternalId = new Dictionary<long, List<BaseItem>>();
                    foreach (var ep in allEpisodes)
                    {
                        BaseItem? seriesItem = null;
                        var parent = ep.Parent;
                        if (parent != null)
                        {
                            if (parent.GetType().Name.Contains("Series")) seriesItem = parent;
                            else if (parent.GetType().Name.Contains("Season") && parent.Parent?.GetType().Name.Contains("Series") == true) seriesItem = parent.Parent;
                        }
                        if (seriesItem == null) continue;
                        if (!episodesBySeriesInternalId.ContainsKey(seriesItem.InternalId))
                            episodesBySeriesInternalId[seriesItem.InternalId] = new List<BaseItem>();
                        episodesBySeriesInternalId[seriesItem.InternalId].Add(ep);
                    }
                    foreach (var kvp in episodesBySeriesInternalId)
                    {
                        var seriesCacheKey = (user.Id, kvp.Key);
                        if (caches.SeriesLastPlayedCache.ContainsKey(seriesCacheKey)) continue;
                        DateTimeOffset? maxDate = null;
                        foreach (var ep in kvp.Value)
                        {
                            if (caches.UserDataCache.TryGetValue((user.Id, ep.InternalId), out var cd) && cd.LastPlayedDate.HasValue)
                                if (maxDate == null || cd.LastPlayedDate > maxDate) maxDate = cd.LastPlayedDate;
                        }
                        caches.SeriesLastPlayedCache[seriesCacheKey] = maxDate;
                    }
                }
            }

            if (needsEpisodeTitleCache && allEpisodes != null)
            {
                caches.SeriesEpisodeNamesCache = new Dictionary<long, List<string>>();
                foreach (var ep in allEpisodes)
                {
                    if (string.IsNullOrEmpty(ep.Name)) continue;
                    BaseItem? seriesItem = null;
                    var parent = ep.Parent;
                    if (parent != null)
                    {
                        if (parent.GetType().Name.Contains("Series")) seriesItem = parent;
                        else if (parent.GetType().Name.Contains("Season") && parent.Parent?.GetType().Name.Contains("Series") == true)
                            seriesItem = parent.Parent;
                    }
                    if (seriesItem == null) continue;
                    if (!caches.SeriesEpisodeNamesCache.TryGetValue(seriesItem.InternalId, out var nameList))
                    {
                        nameList = new List<string>();
                        caches.SeriesEpisodeNamesCache[seriesItem.InternalId] = nameList;
                    }
                    nameList.Add(ep.Name);
                }
            }
            return caches;
        }
    }
}
