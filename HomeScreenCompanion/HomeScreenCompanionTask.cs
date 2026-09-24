using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Collections;
using MediaBrowser.Controller.Playlists;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Tasks;
using MediaBrowser.Model.Users;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using HomeScreenCompanion.Criteria;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask : IScheduledTask
    {
        private readonly ILibraryManager _libraryManager;
        private readonly ICollectionManager _collectionManager;
        private readonly IUserManager _userManager;
        private readonly IUserViewManager _userViewManager;
        private readonly IUserDataManager _userDataManager;
        private readonly IHttpClient _httpClient;
        private readonly IJsonSerializer _jsonSerializer;
        private readonly ILogger _logger;
        private readonly ILibraryMonitor _libraryMonitor;
        private readonly IPlaylistManager _playlistManager;
        private readonly IProviderManager _providerManager;
        private readonly IFileSystem _fileSystem;
        private RunLog _log;

        // Per-run state shared with phase helpers (e.g. ApplyTagsPhase) without threading
        // the data through every signature. Populated at the top of Execute() and consumed
        // by phases called from within that single run. Nullable + null-forgiving at use
        // sites because Execute always assigns them before calling the phase.
        private Dictionary<Guid, HashSet<string>>? _runDesiredTagsMap;
        private Dictionary<Guid, BaseItem>? _runAllScannedEpisodeItems;
        private Dictionary<Guid, BaseItem>? _runAllScannedSeasonItems;
        private Dictionary<string, int>? _runTagAddedByTag;
        private Dictionary<string, int>? _runTagRemovedByTag;
        private HashSet<string>? _runManagedTags;
        private HashSet<string>? _runFailedFetches;
        private Dictionary<string, HashSet<long>>? _runDesiredCollectionsMap;
        private Dictionary<string, string>? _runCollectionDescriptions;
        private Dictionary<string, string>? _runCollectionPosters;
        private HashSet<string>? _runActiveCollections;
        private List<string>? _runPreviouslyManagedCollections;
        private HashSet<string>? _runCollCreatedSet;
        private Dictionary<string, int>? _runCollItemsAdded;
        private Dictionary<string, int>? _runCollItemsRemoved;

        public static HomeScreenCompanionTask? Instance { get; private set; }
        public static string LastRunStatus { get; private set; } = "Unknown (resets at server restart)";
        public static List<string> ExecutionLog { get; } = new List<string>();
        public static bool IsRunning { get; private set; } = false;
        public static DateTime? LastStartedUtc { get; private set; }

        private struct CachedMediaInfo
        {
            public bool Is4k, Is8k, Is1080, Is720, IsSd;
            public bool IsHevc, IsAv1, IsH264;
            public bool IsHdr, IsHdr10, IsDv;
            public bool IsAtmos, IsTrueHd, IsDtsHdMa, IsDts, IsAc3, IsAac;
            public bool Is71, Is51, IsStereo, IsMono;
            public HashSet<string> AudioLanguages;
            public double? DateModifiedDays;
            public double? FileSizeMb;
            // Music-specific fields
            public int? BitRate;       // kbps
            public int? SampleRate;    // Hz
            public int? BitsPerSample; // bit depth
            public int? TrackNumber;   // IndexNumber on the item
            public int? DiscNumber;    // ParentIndexNumber on the item
        }

        // ExtendedItemsQuery class moved to HomeSections/HomeScreenCompanionTask.cs
        // (used only by BuildContentSection, which is also there).

        private class GroupRunStats
        {
            public string? DisplayName;
            public string? SourceType;
            public bool Skipped;
            public string? SkipReason;
            public string? ErrorMessage;
            public int ListCount;
            public int MatchCount;
            public bool EnableTag;
            public int TagsAdded;
            public int TagsRemoved;
            public bool EnableCollection;
            public bool CollectionCreated;
            public int CollectionItemsAdded;
            public int CollectionItemsRemoved;
            public bool EnableHomeSection;
            public bool HomeSectionSynced;
            public int HomeSectionUserCount;
            public bool HomeSectionRemoved;
            public bool BoxSetHse;   // tag applied to BoxSet only, not to items
            public bool BoxSetFound; // the target BoxSet was found in the library
            public int BoxSetTaggedCount; // how many BoxSets were successfully tagged (for merged log display)
            public string? TagName;
            public string? CollectionName;
            public int GroupIndex;
            public int GroupTotal;
            // Display-only fields used by the execution log
            public string? SourceLabel;                 // "Trakt", "AI · OpenAI", "Smart playlist", ...
            public bool EnablePlaylist;
            public string? PlaylistName;
            public int PlaylistUsersTotal;
            public int PlaylistUsersCreated;
            public int PlaylistUsersUpdated;
            public int PlaylistUsersFailed;
            public bool ViewerOnly; // current-user-only filter — resolved per user by the home section
            public List<string> Warnings = new List<string>();
            public List<string> MissingItems = new List<string>(); // list titles not found in the library
            public long ElapsedMs;
        }

        public HomeScreenCompanionTask(ILibraryManager libraryManager, ICollectionManager collectionManager, IPlaylistManager playlistManager, IUserManager userManager, IUserViewManager userViewManager, IUserDataManager userDataManager, IHttpClient httpClient, IJsonSerializer jsonSerializer, ILogManager logManager, ILibraryMonitor libraryMonitor, IProviderManager providerManager, IFileSystem fileSystem)
        {
            _libraryManager = libraryManager;
            _collectionManager = collectionManager;
            _userManager = userManager;
            _userViewManager = userViewManager;
            _userDataManager = userDataManager;
            _httpClient = httpClient;
            _jsonSerializer = jsonSerializer;
            _logger = logManager.GetLogger("HomeScreenCompanion");
            _libraryMonitor = libraryMonitor;
            _playlistManager = playlistManager;
            _providerManager = providerManager;
            _fileSystem = fileSystem;
            _log = new RunLog(ExecutionLog, _logger, "", false);
            Instance = this;
        }

        public string Key => "HomeScreenCompanionSyncTask";
        public string Name => "Tag & Collection Sync";
        public string Description => "Syncs tags and collections from MDBList, Trakt, Playlists and Local Media.";
        public string Category => "Home Screen Companion";

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[] { new TaskTriggerInfo { Type = TaskTriggerInfo.TriggerDaily, TimeOfDayTicks = TimeSpan.FromHours(4).Ticks } };
        }

        // Builds the per-run context for Execute (full sync).
        // Returns false when no plugin config is available — caller should bail.
        private bool BuildRunContext(out RunContext ctx)
        {
            var config = Plugin.Instance?.Configuration;
            if (config == null) { ctx = null!; return false; }

            bool debug = config.ExtendedConsoleOutput;
            bool dryRun = config.DryRunMode;
            bool logMissing = config.LogMissingItems;
            _log = new RunLog(ExecutionLog, _logger, "", debug);

            var startTime = DateTime.Now;
            var runTimer = System.Diagnostics.Stopwatch.StartNew();
            _log.Rule();
            _log.Info($"Home Screen Companion v{Plugin.Instance?.Version}  ·  {startTime:yyyy-MM-dd HH:mm}  ·  Full sync");
            if (dryRun) _log.Warn("DRY RUN — nothing will be changed, the log shows what would happen");

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

            int movieCount = allItems.Count(i => i.GetType().Name.Contains("Movie"));
            int seriesCount = allItems.Count(i => i.GetType().Name.Contains("Series"));
            int activeGroupTotal = config.Tags.Count(t => t.Active && !string.IsNullOrWhiteSpace(t.Tag));
            _log.Info($"  Library: {movieCount:N0} movies, {seriesCount:N0} series");
            _log.Info($"  Groups: {activeGroupTotal} active");
            _log.Rule();
            _log.Debug($"Library scan: {allItems.Count:N0} items, {imdbLookup.Count:N0} with IMDb id  ·  {RunLog.Elapsed(runTimer.Elapsed)}");

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
                MovieCount = movieCount,
                SeriesCount = seriesCount,
                StatsList = new List<GroupRunStats>(),
                StatsByGroupKey = new Dictionary<string, GroupRunStats>(StringComparer.OrdinalIgnoreCase),
            };
            return true;
        }

        public async Task Execute(CancellationToken cancellationToken, IProgress<double> progress)
        {
            IsRunning = true;
            try
            {
                lock (ExecutionLog) ExecutionLog.Clear();
                LastStartedUtc = DateTime.UtcNow;
                LastRunStatus = "Running...";

                if (!BuildRunContext(out var ctx)) return;

                int activeGroupTotal = ctx.Config.Tags.Count(t => t.Active && !string.IsNullOrWhiteSpace(t.Tag));

                var fetcher = new ListFetcher(_httpClient, _jsonSerializer);
                _runDesiredTagsMap = new Dictionary<Guid, HashSet<string>>();
                _runAllScannedEpisodeItems = new Dictionary<Guid, BaseItem>();
                _runAllScannedSeasonItems = new Dictionary<Guid, BaseItem>();
                _runDesiredCollectionsMap = new Dictionary<string, HashSet<long>>(StringComparer.OrdinalIgnoreCase);
                _runCollectionDescriptions = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                _runCollectionPosters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                _runManagedTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                _runActiveCollections = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                _runFailedFetches = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                // A group with several sources (URLs / local sources) is stored as one flat TagConfig per
                // source. Playlists and rank files must be built from the union of all sources in the group,
                // so they are accumulated here and written once after the loop.
                var groupPlaylistItems = new Dictionary<string, (TagConfig Owner, List<BaseItem> Items, HashSet<Guid> Seen)>(StringComparer.OrdinalIgnoreCase);
                var rankIdsByTag = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
                // Groups where a source failed / returned nothing — their playlists are left untouched
                var playlistGroupsToSkip = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                var previouslyManagedTags = LoadFileHistory("homescreencompanion_history.txt");
                foreach (var t in previouslyManagedTags) _runManagedTags!.Add(t);

                _runPreviouslyManagedCollections = LoadFileHistory("homescreencompanion_collections.txt");
                // Also track collection names from inactive groups so they get cleaned up
                // even if the group was only ever run via single-entry sync (which doesn't update history)
                foreach (var tc in ctx.Config.Tags)
                {
                    if (tc.EnableCollection && !string.IsNullOrWhiteSpace(tc.Tag))
                    {
                        string cn = string.IsNullOrWhiteSpace(tc.CollectionName) ? tc.Tag.Trim() : tc.CollectionName.Trim();
                        if (!_runPreviouslyManagedCollections!.Contains(cn))
                            _runPreviouslyManagedCollections!.Add(cn);
                    }
                }

                TagCacheManager.Instance.Initialize(Plugin.Instance.DataFolderPath, _jsonSerializer);
                TagCacheManager.Instance.ClearCache();

                double step = 30.0 / (ctx.Config.Tags.Count > 0 ? ctx.Config.Tags.Count : 1);
                double currentProgress = 0;

                var seriesEpisodeCache = new Dictionary<long, BaseItem>();

                var personCache = new Dictionary<string, HashSet<long>>(StringComparer.OrdinalIgnoreCase);
                {
                    bool anyEpisodePersonCriteria = ctx.Config.Tags.Any(t => t.Active
                        && TagConfigTargetsEpisodes(t)
                        && GetAllCriteria(t).Any(c => { var s = c.TrimStart('!'); return s.StartsWith("Actor:") || s.StartsWith("Director:") || s.StartsWith("Writer:"); }));
                    var allPersonCriteria = ctx.Config.Tags
                        .Where(t => t.Active && (t.MediaInfoFilters?.Count > 0 || t.MediaInfoConditions?.Count > 0))
                        .SelectMany(t => (t.MediaInfoFilters ?? new List<MediaInfoFilter>())
                            .SelectMany(f => f.Criteria ?? new List<string>())
                            .Concat(t.MediaInfoConditions ?? new List<string>()))
                        .Select(c => c.Length > 0 && c[0] == '!' ? c.Substring(1) : c)
                        .Distinct(StringComparer.OrdinalIgnoreCase);
                    BaseItem[]? allPersonsGlobal = null;
                    foreach (var c in allPersonCriteria)
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
                                    if (personCache.ContainsKey(containsKey)) continue;
                                    allPersonsGlobal ??= _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Person" } }).ToArray();
                                    var combinedIds = new HashSet<long>();
                                    foreach (var matchingPerson in allPersonsGlobal.Where(person => person.Name?.IndexOf(singleName, StringComparison.OrdinalIgnoreCase) >= 0))
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
                                    personCache[containsKey] = combinedIds;
                                }
                                else
                                {
                                    string indivKey = p.Length == 3 ? $"{p[0]}:{p[1]}:{singleName}" : $"{p[0]}:{singleName}";
                                    if (personCache.ContainsKey(indivKey)) continue;
                                    var personItem = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Person" }, Name = singleName }).FirstOrDefault();
                                    personCache[indivKey] = personItem == null ? new HashSet<long>() :
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
                }

                var collectionMembershipCache = new Dictionary<string, HashSet<long>>(StringComparer.OrdinalIgnoreCase);
                {
                    var allCollPlCriteria = ctx.Config.Tags
                        .Where(t => t.Active && (t.MediaInfoFilters?.Count > 0 || t.MediaInfoConditions?.Count > 0))
                        .SelectMany(t => GetAllCriteria(t))
                        .Select(c => c.Length > 0 && c[0] == '!' ? c.Substring(1) : c)
                        .Where(c => c.StartsWith("Collection:", StringComparison.OrdinalIgnoreCase) || c.StartsWith("Playlist:", StringComparison.OrdinalIgnoreCase))
                        .Distinct(StringComparer.OrdinalIgnoreCase);
                    foreach (var crit in allCollPlCriteria)
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
                            if (collectionMembershipCache.ContainsKey(indivKey)) continue;
                            var folder = _libraryManager.GetItemList(new InternalItemsQuery
                            {
                                IncludeItemTypes = folderTypes,
                                Recursive = true
                            }).FirstOrDefault(i => string.Equals(i.Name, singleName, StringComparison.OrdinalIgnoreCase));
                            if (folder == null) { collectionMembershipCache[indivKey] = new HashSet<long>(); continue; }
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
                            collectionMembershipCache[indivKey] = ids;
                        }
                    }
                }

                var mediaInfoCache = new Dictionary<long, CachedMediaInfo>();
                if (ctx.Config.Tags.Any(t => t.Active && (t.MediaInfoFilters?.Count > 0 || t.MediaInfoConditions?.Count > 0)))
                {
                    foreach (var item in ctx.AllItems)
                    {
                        if (item.LocationType != LocationType.FileSystem) continue;
                        var resolved = ResolveItemForMediaInfo(item, seriesEpisodeCache);
                        mediaInfoCache[item.InternalId] = ExtractMediaInfo(resolved);
                    }
                }

                var userDataCache = new Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)>();
                var seriesLastPlayedCache = new Dictionary<(Guid, long), DateTimeOffset?>();
                var preloadedUsers = _userManager.GetUserList(new UserQuery { IsDisabled = false });

                var activeTagOverrides = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var activeCollectionOverrides = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var tc in ctx.Config.Tags)
                {
                    if (!tc.Active || !tc.OverrideWhenActive || string.IsNullOrWhiteSpace(tc.Tag)) continue;
                    if (!IsScheduleActive(tc.ActiveIntervals)) continue;
                    activeTagOverrides.Add(tc.Tag.Trim());
                    if (tc.EnableCollection)
                    {
                        var overrideCName = string.IsNullOrWhiteSpace(tc.CollectionName) ? tc.Tag.Trim() : tc.CollectionName.Trim();
                        activeCollectionOverrides.Add(overrideCName);
                    }
                }

                // Determine which pre-loads are needed based on active group criteria
                bool _needsSeriesLastPlayed = ctx.Config.Tags.Any(t => t.Active && GetAllCriteria(t).Any(c =>
                    c.TrimStart('!').Split(':') is var _p && _p.Length == 4 && _p[0] == "LastPlayed"));
                bool _needsItemUserData = _needsSeriesLastPlayed || ctx.Config.Tags.Any(t => t.Active && GetAllCriteria(t).Any(c =>
                {
                    var _p2 = c.TrimStart('!').Split(':');
                    return _p2[0] == "IsPlayed" || _p2[0] == "PlayCount" || _p2[0] == "WatchedByCount";
                }));

                if (_needsItemUserData && preloadedUsers?.Length > 0)
                {
                    // Pre-populate userDataCache for all top-level items (movies + series).
                    // Covers lazy GetUserData calls for IsPlayed / PlayCount / WatchedByCount / LastPlayed on movies.
                    foreach (var _user in preloadedUsers)
                    {
                        foreach (var _topItem in ctx.AllItems)
                        {
                            var _k = (_user.Id, _topItem.InternalId);
                            if (userDataCache.ContainsKey(_k)) continue;
                            var _ud0 = _userDataManager?.GetUserData(_user, _topItem);
                            userDataCache[_k] = _ud0 == null ? (false, (DateTimeOffset?)null, 0) : (_ud0.Played, _ud0.LastPlayedDate, _ud0.PlayCount);
                        }
                    }
                }

                if (_needsSeriesLastPlayed && preloadedUsers?.Length > 0)
                {
                    // Pre-populate userDataCache for all episodes + build seriesLastPlayedCache.
                    // Without this, Execute() falls back to O(series × users) lazy GetItemList calls during the scan.
                    var _allEps = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        IncludeItemTypes = new[] { "Episode" },
                        Recursive = true,
                        IsVirtualItem = false
                    });
                    foreach (var _user in preloadedUsers)
                    {
                        foreach (var _ep in _allEps)
                        {
                            var _epKey = (_user.Id, _ep.InternalId);
                            if (userDataCache.ContainsKey(_epKey)) continue;
                            var _ud = _userDataManager?.GetUserData(_user, _ep);
                            userDataCache[_epKey] = _ud == null ? (false, (DateTimeOffset?)null, 0) : (_ud.Played, _ud.LastPlayedDate, _ud.PlayCount);
                        }
                        var _epsBySeries = new Dictionary<long, List<BaseItem>>();
                        foreach (var _ep in _allEps)
                        {
                            BaseItem? _ser = null;
                            var _par = _ep.Parent;
                            if (_par != null)
                            {
                                if (_par.GetType().Name.Contains("Series")) _ser = _par;
                                else if (_par.GetType().Name.Contains("Season") && _par.Parent?.GetType().Name.Contains("Series") == true) _ser = _par.Parent;
                            }
                            if (_ser == null) continue;
                            if (!_epsBySeries.ContainsKey(_ser.InternalId)) _epsBySeries[_ser.InternalId] = new List<BaseItem>();
                            _epsBySeries[_ser.InternalId].Add(_ep);
                        }
                        foreach (var _kvp in _epsBySeries)
                        {
                            var _sKey = (_user.Id, _kvp.Key);
                            if (seriesLastPlayedCache.ContainsKey(_sKey)) continue;
                            DateTimeOffset? _max = null;
                            foreach (var _ep in _kvp.Value)
                            {
                                if (userDataCache.TryGetValue((_user.Id, _ep.InternalId), out var _cd) && _cd.LastPlayedDate.HasValue)
                                    if (_max == null || _cd.LastPlayedDate > _max) _max = _cd.LastPlayedDate;
                            }
                            seriesLastPlayedCache[_sKey] = _max;
                        }
                    }
                }

                _log.Debug($"Caches ready after {RunLog.Elapsed(ctx.RunTimer.Elapsed)}  ·  media-info {mediaInfoCache.Count:N0} items  ·  user-data {userDataCache.Count:N0} entries for {preloadedUsers?.Length ?? 0} users  ·  person lookups {personCache.Count}  ·  collection/playlist lookups {collectionMembershipCache.Count}");
                _log.Blank();
                _log.Info("» Fetching sources");
                var phaseTimer = System.Diagnostics.Stopwatch.StartNew();

                int activeGroupIdx = 0;
                bool aiConfigChanged = false;
                _runTagAddedByTag = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                _runTagRemovedByTag = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                _runCollCreatedSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                _runCollItemsAdded = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                _runCollItemsRemoved = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

                // Process OverrideWhenActive entries first so they can remove themselves from
                // activeTagOverrides before non-override entries for the same tag are evaluated.
                var orderedTags = ctx.Config.Tags
                    .Where(t => t.OverrideWhenActive)
                    .Concat(ctx.Config.Tags.Where(t => !t.OverrideWhenActive))
                    .ToList();

                foreach (var tagConfig in orderedTags)
                {
                    if (string.IsNullOrWhiteSpace(tagConfig.Tag)) continue;
                    string tagName = tagConfig.Tag.Trim();
                    _runManagedTags!.Add(tagName); // track all groups (active or inactive) so cleanup always runs

                    if (!tagConfig.Active) continue;

                    string displayName = !string.IsNullOrWhiteSpace(tagConfig.Name) ? $"{tagConfig.Name} [{tagName}]" : tagName;
                    string srcLabel = string.IsNullOrEmpty(tagConfig.SourceType) ? "External" : tagConfig.SourceType;
                    var ruleFeatures = new List<string>();
                    if (tagConfig.EnableTag && !tagConfig.OnlyCollection) ruleFeatures.Add("Tag");
                    if (tagConfig.EnableCollection) ruleFeatures.Add("Collection");
                    if (tagConfig.EnableHomeSection) ruleFeatures.Add("HS");
                    string featureStr = ruleFeatures.Count > 0 ? $"  ({string.Join(", ", ruleFeatures)})" : "";

                    activeGroupIdx++;
                    var gs = new GroupRunStats
                    {
                        DisplayName = displayName,
                        SourceType = srcLabel,
                        EnableTag = tagConfig.EnableTag && !tagConfig.OnlyCollection,
                        EnableCollection = tagConfig.EnableCollection,
                        EnableHomeSection = tagConfig.EnableHomeSection,
                        BoxSetHse = IsBoxSetHomeSectionEntry(tagConfig),
                        TagName = tagName,
                        GroupIndex = activeGroupIdx,
                        GroupTotal = activeGroupTotal,
                        SourceLabel = DescribeSource(tagConfig),
                        EnablePlaylist = tagConfig.EnablePlaylist,
                        PlaylistName = string.IsNullOrWhiteSpace(tagConfig.PlaylistName) ? tagConfig.Name : tagConfig.PlaylistName,
                        PlaylistUsersTotal = tagConfig.PlaylistUserIds?.Count ?? 0
                    };
                    // A multi-source group is stored as several flat entries; the playlist is synced once
                    // per group, so only the first entry's stats carry (and display) the playlist result.
                    if (!ctx.StatsByGroupKey.ContainsKey(GroupKey(tagConfig))) ctx.StatsByGroupKey[GroupKey(tagConfig)] = gs;
                    else gs.EnablePlaylist = false;

                    if (!IsScheduleActive(tagConfig.ActiveIntervals))
                    {
                        gs.Skipped = true;
                        gs.SkipReason = "not in schedule";
                        ctx.StatsList.Add(gs);
                        WriteFetchLine(gs);
                        continue;
                    }

                    if (tagConfig.SourceType == "AI" && tagConfig.AiRefreshIntervalDays > 0 &&
                        tagConfig.AiLastRunDate > DateTime.MinValue &&
                        (DateTime.UtcNow - tagConfig.AiLastRunDate).TotalDays < tagConfig.AiRefreshIntervalDays)
                    {
                        var _nextAiRun = tagConfig.AiLastRunDate.AddDays(tagConfig.AiRefreshIntervalDays);
                        gs.Skipped = true;
                        gs.SkipReason = $"AI refresh not due until {_nextAiRun:yyyy-MM-dd}";
                        ctx.StatsList.Add(gs);
                        WriteFetchLine(gs);
                        continue;
                    }

                    string cName = string.IsNullOrWhiteSpace(tagConfig.CollectionName) ? tagName : tagConfig.CollectionName.Trim();
                    gs.CollectionName = cName;

                    if (!tagConfig.OverrideWhenActive &&
                        (activeTagOverrides.Contains(tagName) ||
                         (tagConfig.EnableCollection && activeCollectionOverrides.Contains(cName))))
                    {
                        gs.Skipped = true;
                        gs.SkipReason = "overridden by a priority group with the same tag";
                        ctx.StatsList.Add(gs);
                        WriteFetchLine(gs);
                        continue;
                    }
                    if (tagConfig.EnableCollection)
                    {
                        _runActiveCollections!.Add(cName);
                        if (!string.IsNullOrWhiteSpace(tagConfig.CollectionDescription))
                            _runCollectionDescriptions![cName] = tagConfig.CollectionDescription;
                        if (!string.IsNullOrWhiteSpace(tagConfig.CollectionPosterPath) && File.Exists(tagConfig.CollectionPosterPath))
                            _runCollectionPosters![cName] = tagConfig.CollectionPosterPath;
                    }

                    var groupTimer = System.Diagnostics.Stopwatch.StartNew();
                    try
                    {
                        int effectiveLimit = tagConfig.Limit <= 0 ? 10000 : tagConfig.Limit;
                        _log.Section($"[{gs.GroupIndex}/{gs.GroupTotal}] {displayName}");
                        _log.Debug("  " + DescribeSourceDetail(tagConfig, effectiveLimit));
                        var blacklist = new HashSet<string>(tagConfig.Blacklist ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                        var matchedLocalItems = new List<BaseItem>();
                        List<BaseItem> tagOutputItems = matchedLocalItems;
                        List<BaseItem> collectionOutputItems = matchedLocalItems;
                        int matchCount = 0;
                        Dictionary<long, List<string>>? seriesEpisodeNamesCache = null;
                        if (GetAllCriteria(tagConfig).Any(c => c.TrimStart('!').StartsWith("EpisodeTitle:", StringComparison.OrdinalIgnoreCase)))
                        {
                            seriesEpisodeNamesCache = new Dictionary<long, List<string>>();
                            var allEpsForTitle = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Recursive = true, IsVirtualItem = false });
                            foreach (var ep in allEpsForTitle)
                            {
                                if (string.IsNullOrEmpty(ep.Name)) continue;
                                BaseItem? ser = null;
                                var par = ep.Parent;
                                if (par != null)
                                {
                                    if (par.GetType().Name.Contains("Series")) ser = par;
                                    else if (par.GetType().Name.Contains("Season") && par.Parent?.GetType().Name.Contains("Series") == true) ser = par.Parent;
                                }
                                if (ser == null) continue;
                                if (!seriesEpisodeNamesCache.TryGetValue(ser.InternalId, out var nl)) { nl = new List<string>(); seriesEpisodeNamesCache[ser.InternalId] = nl; }
                                nl.Add(ep.Name);
                            }
                        }

                        if (string.IsNullOrEmpty(tagConfig.SourceType) || tagConfig.SourceType == "External")
                        {
                            var fetchTimer = System.Diagnostics.Stopwatch.StartNew();
                            var items = await fetcher.FetchItems(tagConfig.Url, effectiveLimit, ctx.Config.TraktClientId, ctx.Config.MdblistApiKey, ctx.Config.TmdbApiKey, cancellationToken);
                            fetchTimer.Stop();
                            gs.ListCount = items.Count;
                            int _extBlacklisted = 0, _extNoImdb = 0;

                            if (items.Count > 0)
                            {
                                if (items.Count > effectiveLimit) items = items.Take(effectiveLimit).ToList();

                                foreach (var extItem in items)
                                {
                                    if (string.IsNullOrEmpty(extItem.Imdb)) { _extNoImdb++; continue; }

                                    if (blacklist.Contains(extItem.Imdb))
                                    {
                                        _extBlacklisted++;
                                        _log.Debug($"    Blacklisted: {extItem.Name} ({extItem.Imdb})");
                                        continue;
                                    }

                                    if (tagConfig.EnableTag && !tagConfig.OnlyCollection)
                                        TagCacheManager.Instance.AddToCache($"imdb_{extItem.Imdb}", tagName);

                                    if (ctx.ImdbLookup.TryGetValue(extItem.Imdb, out var localItems))
                                    {
                                        foreach (var localItem in localItems)
                                        {
                                            if (!matchedLocalItems.Contains(localItem)) matchedLocalItems.Add(localItem);
                                        }
                                    }
                                    else
                                    {
                                        gs.MissingItems.Add($"{extItem.Name}  {extItem.Imdb}");
                                    }
                                }
                            }
                            _log.Debug($"  Fetched {gs.ListCount} items in {fetchTimer.ElapsedMilliseconds} ms  ·  {matchedLocalItems.Count} matched by IMDb id  ·  {gs.MissingItems.Count} not in library  ·  {_extBlacklisted} blacklisted  ·  {_extNoImdb} without IMDb id");
                        }
                        else if (tagConfig.SourceType == "LocalCollection" || tagConfig.SourceType == "LocalPlaylist")
                        {
                            if (!string.IsNullOrEmpty(tagConfig.LocalSourceId))
                            {
                                string[] folderTypes = tagConfig.SourceType == "LocalPlaylist"
                                    ? new[] { "Playlist" }
                                    : new[] { "BoxSet" };
                                var allFolders = _libraryManager.GetItemList(new InternalItemsQuery
                                {
                                    IncludeItemTypes = folderTypes,
                                    Recursive = true
                                });
                                var localSourceFolder = allFolders.FirstOrDefault(i =>
                                    string.Equals(i.Name, tagConfig.LocalSourceId, StringComparison.OrdinalIgnoreCase)
                                );

                                if (localSourceFolder != null)
                                {
                                    var children = new List<BaseItem>();
                                    _log.Debug($"  Found source '{localSourceFolder.Name}'  ({localSourceFolder.GetType().Name})");

                                    if (tagConfig.SourceType == "LocalCollection")
                                    {
                                        children = _libraryManager.GetItemList(new InternalItemsQuery
                                        {
                                            CollectionIds = new[] { localSourceFolder.InternalId },
                                            IsVirtualItem = false
                                        }).ToList();
                                    }
                                    else
                                    {
                                        children = _libraryManager.GetItemList(new InternalItemsQuery
                                        {
                                            ListIds = new[] { localSourceFolder.InternalId }
                                        }).ToList();
                                    }

                                    gs.ListCount = children.Count;
                                    if (children.Count == 0)
                                        gs.Warnings.Add($"'{tagConfig.LocalSourceId}' is empty (or only contains virtual items)");
                                    else
                                        _log.Debug($"  Items in source: {children.Count}");

                                    foreach (var child in children)
                                    {
                                        if (child == null) continue;

                                        BaseItem itemToTag = child;

                                        if (child.GetType().Name.Contains("PlaylistItem"))
                                        {
                                            try
                                            {
                                                var inner = ((dynamic)child).Item;
                                                if (inner != null) itemToTag = inner;
                                            }
                                            catch { }
                                        }

                                        if (itemToTag.GetType().Name.Contains("Episode"))
                                        {
                                            try
                                            {
                                                var series = ((dynamic)itemToTag).Series;
                                                if (series != null) itemToTag = series;
                                            }
                                            catch { }
                                        }

                                        if (!IsTaggableTopLevelItem(itemToTag))
                                            continue;

                                        var imdb = itemToTag.GetProviderId("Imdb");
                                        if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb))
                                        {
                                            _log.Debug($"    Blacklisted: {itemToTag.Name} ({imdb})");
                                            continue;
                                        }

                                        if (!matchedLocalItems.Contains(itemToTag))
                                        {
                                            matchedLocalItems.Add(itemToTag);
                                        }
                                    }
                                    _log.Debug($"  {matchedLocalItems.Count} usable movies/series in source");
                                }
                                else
                                {
                                    gs.Warnings.Add($"{DescribeSource(tagConfig)} '{tagConfig.LocalSourceId}' was not found in the library");
                                }

                                if (effectiveLimit < 10000 && matchedLocalItems.Count > effectiveLimit)
                                    matchedLocalItems = matchedLocalItems.Take(effectiveLimit).ToList();
                            }
                        }
                        // Apply MediaInfo post-filter for non-MediaInfo source types
                        if (tagConfig.SourceType != "MediaInfo" && matchedLocalItems.Count > 0
                            && (tagConfig.MediaInfoFilters?.Count > 0 || tagConfig.MediaInfoConditions?.Count > 0))
                        {
                            var beforeCount = matchedLocalItems.Count;
                            matchedLocalItems = matchedLocalItems.Where(item =>
                            {
                                CachedMediaInfo? ci = mediaInfoCache.TryGetValue(item.InternalId, out var ciVal) ? ciVal : (CachedMediaInfo?)null;
                                return ItemMatchesMediaInfo(item, tagConfig, ctx.Debug, seriesEpisodeCache, personCache, userDataCache, ci, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache);
                            }).ToList();
                            _log.Debug($"  Filter conditions: {beforeCount} → {matchedLocalItems.Count} items");
                        }

                        bool _viewerOnlyGroup = IsViewerOnlyMediaInfoFilter(tagConfig);
                        if (tagConfig.SourceType == "MediaInfo" && _viewerOnlyGroup)
                        {
                            // Nothing to tag/collect — the home section query (IsPlayed / IsResumable)
                            // resolves the filter for each viewing user. Skip the expensive library scan.
                            gs.ListCount = 0;
                            _log.Debug("  Current-user filter — library scan skipped (the home section resolves it per user)");
                        }
                        else if (tagConfig.SourceType == "MediaInfo")
                        {
                            IList<BaseItem> itemsToScan;
                            if (TagConfigTargetsEpisodes(tagConfig))
                            {
                                var episodeQuery = new InternalItemsQuery
                                {
                                    IncludeItemTypes = new[] { "Episode" },
                                    Recursive = true,
                                    IsVirtualItem = false
                                };
                                var titleContains = ExtractTitleContains(tagConfig);
                                if (!string.IsNullOrEmpty(titleContains))
                                    episodeQuery.NameContains = titleContains;
                                itemsToScan = _libraryManager.GetItemList(episodeQuery).ToList();
                            }
                            else
                            {
                                itemsToScan = ctx.AllItems;
                            }

                            foreach (var item in itemsToScan)
                            {
                                if (item.LocationType != LocationType.FileSystem) continue;

                                var imdb = item.GetProviderId("Imdb");
                                if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb)) continue;

                                CachedMediaInfo? ci = mediaInfoCache.TryGetValue(item.InternalId, out var ciVal) ? ciVal : (CachedMediaInfo?)null;
                                if (ItemMatchesMediaInfo(item, tagConfig, ctx.Debug, seriesEpisodeCache, personCache, userDataCache, ci, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache))
                                {
                                    matchedLocalItems.Add(item);
                                    if (effectiveLimit < 10000 && matchedLocalItems.Count >= effectiveLimit) break;
                                }
                            }
                            gs.ListCount = itemsToScan.Count;
                            if (TagConfigTargetsEpisodes(tagConfig))
                            {
                                foreach (var ep in itemsToScan)
                                    _runAllScannedEpisodeItems!.TryAdd(ep.Id, ep);
                            }
                            // Redirect matched items to the selected output level (tag and collection independently)
                            tagOutputItems = matchedLocalItems;
                            collectionOutputItems = matchedLocalItems;
                            {
                                bool scannedEpisodes = TagConfigTargetsEpisodes(tagConfig);
                                var (tEp, tSea, tSer) = EffectiveTagTargets(tagConfig);
                                var (cEp, cSea, cSer) = EffectiveCollectionTargets(tagConfig);

                                List<BaseItem> BuildOutputList(bool ep, bool sea, bool ser, bool anyNew)
                                {
                                    if (!anyNew) return scannedEpisodes ? ResolveParentSeries(matchedLocalItems) : matchedLocalItems.ToList();
                                    var list = new List<BaseItem>();
                                    var seriesOnly = matchedLocalItems.Where(i => i.GetType().Name.Contains("Series")).ToList();
                                    if (scannedEpisodes)
                                    {
                                        // Collapse up: episodes → season/series
                                        if (ep) list.AddRange(matchedLocalItems);
                                        if (sea) { var s = ResolveParentSeasons(matchedLocalItems); _log.Debug($"  Output level: {matchedLocalItems.Count} episodes → {s.Count} seasons"); list.AddRange(s); foreach (var x in s) _runAllScannedSeasonItems!.TryAdd(x.Id, x); }
                                        if (ser) { var s = ResolveParentSeries(matchedLocalItems); _log.Debug($"  Output level: {matchedLocalItems.Count} episodes → {s.Count} series"); list.AddRange(s); }
                                    }
                                    else
                                    {
                                        // Expand down: series → seasons/episodes; movies stay as-is for any target
                                        var movies = matchedLocalItems.Where(i => !i.GetType().Name.Contains("Series")).ToList();
                                        if (ser) list.AddRange(matchedLocalItems);
                                        if (sea) { var s = ResolveChildSeasons(seriesOnly); _log.Debug($"  Output level: {seriesOnly.Count} series → {s.Count} seasons"); list.AddRange(s); foreach (var x in s) _runAllScannedSeasonItems!.TryAdd(x.Id, x); list.AddRange(movies); }
                                        if (ep) { var e = ResolveChildEpisodes(seriesOnly); _log.Debug($"  Output level: {seriesOnly.Count} series → {e.Count} episodes"); list.AddRange(e); foreach (var x in e) _runAllScannedEpisodeItems!.TryAdd(x.Id, x); list.AddRange(movies); }
                                    }
                                    return list;
                                }

                                tagOutputItems = BuildOutputList(tEp, tSea, tSer, tEp || tSea || tSer);
                                collectionOutputItems = BuildOutputList(cEp, cSea, cSer, cEp || cSea || cSer);
                            }
                            if (ctx.Debug)
                            {
                                _log.Debug($"  Scanned {itemsToScan.Count:N0} items in {groupTimer.ElapsedMilliseconds} ms  ·  {matchedLocalItems.Count} matched  (tag output {tagOutputItems.Count}, collection output {collectionOutputItems.Count})");
                                WriteMatchedItemsDebug(matchedLocalItems);
                            }
                        }
                        else if (tagConfig.SourceType == "AI")
                        {
                            var recentlyWatchedContext = BuildRecentlyWatchedContext(tagConfig);
                            var fetchTimer = System.Diagnostics.Stopwatch.StartNew();
                            var aiItems = await fetcher.FetchAiList(
                                tagConfig.AiProvider,
                                tagConfig.AiPrompt,
                                ctx.Config.OpenAiApiKey,
                                ctx.Config.OpenAiModel,
                                ctx.Config.GeminiApiKey,
                                ctx.Config.GeminiModel,
                                ctx.Config.ClaudeApiKey,
                                ctx.Config.ClaudeModel,
                                ctx.Config.OllamaBaseUrl,
                                ctx.Config.OllamaModel,
                                ctx.Config.AiSystemPrompt,
                                recentlyWatchedContext,
                                effectiveLimit,
                                cancellationToken);
                            fetchTimer.Stop();

                            gs.ListCount = aiItems.Count;
                            int _aiTitleMatched = 0, _aiBlacklisted = 0;

                            foreach (var aiItem in aiItems)
                            {
                                if (string.IsNullOrWhiteSpace(aiItem.title)) continue;
                                string _aiLabel = aiItem.year.HasValue ? $"{aiItem.title} ({aiItem.year})" : aiItem.title;

                                if (!string.IsNullOrEmpty(aiItem.imdb_id))
                                {
                                    var imdbId = aiItem.imdb_id.Trim();
                                    if (blacklist.Contains(imdbId))
                                    {
                                        _aiBlacklisted++;
                                        _log.Debug($"    Blacklisted: {_aiLabel} ({imdbId})");
                                        continue;
                                    }

                                    if (tagConfig.EnableTag && !tagConfig.OnlyCollection)
                                        TagCacheManager.Instance.AddToCache($"imdb_{imdbId}", tagName);

                                    if (ctx.ImdbLookup.TryGetValue(imdbId, out var localItems))
                                    {
                                        foreach (var localItem in localItems)
                                        {
                                            if (!matchedLocalItems.Contains(localItem))
                                                matchedLocalItems.Add(localItem);
                                        }
                                    }
                                    else
                                    {
                                        // IMDB ID not found in library — fall back to title+year match
                                        var titleMatches = FindByTitleAndYear(ctx.AllItems, aiItem.title, aiItem.year);
                                        if (titleMatches.Count > 0) { _aiTitleMatched++; _log.Debug($"    {imdbId} not in library — matched '{_aiLabel}' by title"); }
                                        else gs.MissingItems.Add($"{_aiLabel}  {imdbId}");
                                        foreach (var localItem in titleMatches)
                                        {
                                            var imdb = localItem.GetProviderId("Imdb");
                                            if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb)) continue;
                                            if (!matchedLocalItems.Contains(localItem))
                                                matchedLocalItems.Add(localItem);
                                        }
                                    }
                                }
                                else
                                {
                                    // Fallback: title+year match when AI didn't return an IMDB ID
                                    var titleMatches = FindByTitleAndYear(ctx.AllItems, aiItem.title, aiItem.year);
                                    if (titleMatches.Count > 0) _aiTitleMatched++;
                                    else gs.MissingItems.Add($"{_aiLabel}  (no IMDb id from AI)");
                                    foreach (var localItem in titleMatches)
                                    {
                                        var imdb = localItem.GetProviderId("Imdb");
                                        if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb))
                                        {
                                            _aiBlacklisted++;
                                            _log.Debug($"    Blacklisted: {localItem.Name} ({imdb})");
                                            continue;
                                        }
                                        if (!matchedLocalItems.Contains(localItem))
                                            matchedLocalItems.Add(localItem);
                                    }
                                }
                            }

                            _log.Debug($"  AI ({tagConfig.AiProvider}) returned {gs.ListCount} items in {fetchTimer.ElapsedMilliseconds} ms  ·  {matchedLocalItems.Count} matched ({_aiTitleMatched} by title only)  ·  {gs.MissingItems.Count} not in library  ·  {_aiBlacklisted} blacklisted");
                            if (tagConfig.AiRefreshIntervalDays > 0)
                            {
                                tagConfig.AiLastRunDate = DateTime.UtcNow;
                                aiConfigChanged = true;
                            }
                        }
                        // For non-MediaInfo sources, apply output level selection (expand down from Series/Movie)
                        if (tagConfig.SourceType != "MediaInfo")
                        {
                            var (tEp, tSea, tSer) = EffectiveTagTargets(tagConfig);
                            var (cEp, cSea, cSer) = EffectiveCollectionTargets(tagConfig);

                            List<BaseItem> BuildNonMiOutputList(bool ep, bool sea, bool ser, bool any)
                            {
                                if (!any) return matchedLocalItems.ToList();
                                var list = new List<BaseItem>();
                                var seriesOnly = matchedLocalItems.Where(i => i.GetType().Name.Contains("Series")).ToList();
                                var movies = matchedLocalItems.Where(i => !i.GetType().Name.Contains("Series")).ToList();
                                if (ser) list.AddRange(matchedLocalItems);
                                if (sea) { var s = ResolveChildSeasons(seriesOnly); list.AddRange(s); foreach (var x in s) _runAllScannedSeasonItems!.TryAdd(x.Id, x); list.AddRange(movies); }
                                if (ep) { var e = ResolveChildEpisodes(seriesOnly); list.AddRange(e); foreach (var x in e) _runAllScannedEpisodeItems!.TryAdd(x.Id, x); list.AddRange(movies); }
                                return list;
                            }

                            tagOutputItems = BuildNonMiOutputList(tEp, tSea, tSer, tEp || tSea || tSer);
                            collectionOutputItems = BuildNonMiOutputList(cEp, cSea, cSer, cEp || cSea || cSer);
                        }

                        // A current-user-only Smart-playlist group cannot produce tags/collections/playlists
                        // (those are server-wide). Only the per-viewer home section applies.
                        if (_viewerOnlyGroup)
                        {
                            tagOutputItems = new List<BaseItem>();
                            collectionOutputItems = new List<BaseItem>();
                            playlistGroupsToSkip.Add(GroupKey(tagConfig));
                            gs.ViewerOnly = true;
                            if (tagConfig.EnableTag || tagConfig.EnableCollection || tagConfig.EnablePlaylist)
                            {
                                gs.Warnings.Add("Current-user filter — tags, collections and playlists cannot be per-user, so only the home section is created. Disable those outputs or add a non-user condition (e.g. Media Type).");
                                _log.Warn($"  {displayName}: current-user filter — no tag/collection/playlist will be created");
                            }
                            else
                            {
                                _log.Debug($"  {displayName}: current-user filter — home section only");
                            }
                        }

                        var allOutputIds = new HashSet<Guid>(tagOutputItems.Select(i => i.Id));
                        foreach (var id in collectionOutputItems.Select(i => i.Id)) allOutputIds.Add(id);
                        gs.MatchCount = allOutputIds.Count;
                        matchCount += allOutputIds.Count;

                        // Collect rank order so top-list .strm files can be numbered in list order.
                        // Accumulated across all flat entries of the tag; written once after the loop.
                        if (!rankIdsByTag.TryGetValue(tagName, out var rankIds))
                        {
                            rankIds = new List<string>();
                            rankIdsByTag[tagName] = rankIds;
                        }
                        var rankSeen = new HashSet<string>(rankIds, StringComparer.OrdinalIgnoreCase);
                        foreach (var rankId in matchedLocalItems.Select(i => i.GetProviderId("Imdb") ?? "").Where(id => !string.IsNullOrEmpty(id)))
                            if (rankSeen.Add(rankId)) rankIds.Add(rankId);

                        // If this is a priority-override entry but produced zero results,
                        // remove it from the override sets so other entries for the same tag are not suppressed.
                        if (tagConfig.OverrideWhenActive && allOutputIds.Count == 0)
                        {
                            activeTagOverrides.Remove(tagName);
                            if (tagConfig.EnableCollection) activeCollectionOverrides.Remove(cName);
                        }

                        // For External and AI sources: if the remote returned zero items and the user has
                        // opted to preserve tags on empty results, treat it as a failed fetch.
                        bool isRemoteSource = string.IsNullOrEmpty(tagConfig.SourceType) || tagConfig.SourceType == "External" || tagConfig.SourceType == "AI";
                        if (isRemoteSource && gs.ListCount == 0 && ctx.Config.PreserveTagsOnEmptyResult)
                        {
                            gs.Warnings.Add(tagConfig.SourceType == "AI"
                                ? "The AI returned 0 items — existing tags, collection and playlist were kept. Check the prompt and the API key in Settings."
                                : "The list returned 0 items — existing tags, collection and playlist were kept. Check the list URL and the API key in Settings.");
                            _runFailedFetches!.Add(tagName);
                            if (tagConfig.EnableCollection) _runFailedFetches!.Add(cName);
                            playlistGroupsToSkip.Add(GroupKey(tagConfig));
                            gs.ElapsedMs = groupTimer.ElapsedMilliseconds;
                            ctx.StatsList.Add(gs);
                            WriteFetchLine(gs);
                            currentProgress += step;
                            progress.Report(currentProgress);
                            continue;
                        }
                        if (isRemoteSource && gs.ListCount == 0)
                            gs.Warnings.Add(tagConfig.SourceType == "AI"
                                ? "The AI returned 0 items — its tags, collection and playlist are being cleared (\"Preserve tags and collections on empty result\" is off in Settings)"
                                : "The list returned 0 items — its tags, collection and playlist are being cleared (\"Preserve tags and collections on empty result\" is off in Settings). Check the list URL and the API key.");

                        if (tagConfig.EnableTag && !tagConfig.OnlyCollection && !IsBoxSetHomeSectionEntry(tagConfig))
                        {
                            foreach (var localItem in tagOutputItems)
                            {
                                if (!_runDesiredTagsMap!.ContainsKey(localItem.Id))
                                    _runDesiredTagsMap[localItem.Id] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                                _runDesiredTagsMap[localItem.Id].Add(tagName);

                                var imdb = localItem.GetProviderId("Imdb");
                                if (!string.IsNullOrEmpty(imdb) && tagConfig.SourceType != "External")
                                    TagCacheManager.Instance.AddToCache($"imdb_{imdb}", tagName);
                            }
                        }

                        if (tagConfig.EnableCollection)
                        {
                            if (!_runDesiredCollectionsMap!.ContainsKey(cName))
                                _runDesiredCollectionsMap[cName] = new HashSet<long>();
                            foreach (var localItem in collectionOutputItems)
                                _runDesiredCollectionsMap[cName].Add(localItem.InternalId);
                        }

                        // Collect this entry's items for the group's playlist sync (done once per group after
                        // the loop so all sources of a multi-source group end up in the same playlist).
                        // Placed here so it inherits the loop's skip/preserve/override guards above.
                        if (tagConfig.EnablePlaylist)
                        {
                            var groupKey = GroupKey(tagConfig);
                            if (!groupPlaylistItems.TryGetValue(groupKey, out var plGroup))
                            {
                                plGroup = (tagConfig, new List<BaseItem>(), new HashSet<Guid>());
                                groupPlaylistItems[groupKey] = plGroup;
                            }
                            foreach (var localItem in collectionOutputItems)
                                if (plGroup.Seen.Add(localItem.Id)) plGroup.Items.Add(localItem);
                        }

                        gs.BoxSetFound = ApplyTagToSourceBoxSet(tagConfig, tagName, ctx.DryRun, cancellationToken);
                        gs.BoxSetTaggedCount = gs.BoxSetFound ? 1 : 0;
                        if (gs.BoxSetHse && !gs.BoxSetFound)
                            gs.Warnings.Add($"Collection '{tagConfig.LocalSourceId}' was not found in the library");
                        if (gs.MissingItems.Count > 0 && ctx.Debug)
                        {
                            _log.Debug($"  Not in library ({gs.MissingItems.Count}):");
                            foreach (var _missing in gs.MissingItems) _log.Debug("    " + _missing);
                        }
                        _log.Debug($"  Group done in {groupTimer.ElapsedMilliseconds} ms");
                    }
                    catch (Exception ex)
                    {
                        gs.ErrorMessage = ex.Message;
                        WriteExceptionDebug(ex);
                        _runFailedFetches!.Add(tagName);
                        if (tagConfig.EnableCollection) _runFailedFetches!.Add(cName);
                        playlistGroupsToSkip.Add(GroupKey(tagConfig));
                    }

                    gs.ElapsedMs = groupTimer.ElapsedMilliseconds;
                    ctx.StatsList.Add(gs);
                    WriteFetchLine(gs);
                    currentProgress += step;
                    progress.Report(currentProgress);
                }
                _log.Debug($"Fetch phase done in {RunLog.Elapsed(phaseTimer.Elapsed)}");

                // Playlist sync — once per group, with the union of all its sources.
                // Skipped for groups where any source failed, so a bad fetch never empties the playlist.
                if (groupPlaylistItems.Count > 0)
                {
                    _log.Blank();
                    _log.Info("» Playlists");
                    phaseTimer.Restart();
                    if (ctx.DryRun) _log.Skip("Dry run — playlists are not changed");
                }
                foreach (var kvp in groupPlaylistItems)
                {
                    ctx.StatsByGroupKey.TryGetValue(kvp.Key, out var plStats);
                    if (playlistGroupsToSkip.Contains(kvp.Key))
                    {
                        plStats?.Warnings.Add("Playlist left unchanged because the source failed or returned nothing");
                        _log.Skip($"Playlist for '{plStats?.DisplayName ?? kvp.Value.Owner.Name}' left unchanged — source failed or returned nothing");
                        continue;
                    }
                    await SyncPlaylistsForEntryAsync(kvp.Value.Owner, kvp.Value.Items, ctx.DryRun, plStats);
                }
                if (groupPlaylistItems.Count > 0 && !ctx.DryRun)
                {
                    int _plCreated = ctx.StatsList.Sum(g => g.PlaylistUsersCreated), _plUpdated = ctx.StatsList.Sum(g => g.PlaylistUsersUpdated), _plFailed = ctx.StatsList.Sum(g => g.PlaylistUsersFailed);
                    _log.Info($"    {_plCreated} created, {_plUpdated} updated{(_plFailed > 0 ? $", {_plFailed} failed" : "")}  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
                }

                if (!ctx.DryRun)
                {
                    foreach (var kvp in rankIdsByTag)
                        WriteRankFile(kvp.Key, kvp.Value);
                    TagCacheManager.Instance.Save();
                    SaveFileHistory("homescreencompanion_history.txt", _runManagedTags!.ToList());
                }

                // Collect episodes that currently carry managed tags so they can be cleaned up
                // even when the corresponding group is inactive or removed
                foreach (var managedTag in _runManagedTags!)
                {
                    var taggedEpisodes = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        IncludeItemTypes = new[] { "Episode" },
                        Tags = new[] { managedTag },
                        Recursive = true,
                        IsVirtualItem = false
                    });
                    foreach (var ep in taggedEpisodes)
                        _runAllScannedEpisodeItems!.TryAdd(ep.Id, ep);

                    // Collect seasons that currently carry managed tags for cleanup
                    var taggedSeasons = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        IncludeItemTypes = new[] { "Season" },
                        Tags = new[] { managedTag },
                        Recursive = true,
                        IsVirtualItem = false
                    });
                    foreach (var s in taggedSeasons)
                        _runAllScannedSeasonItems!.TryAdd(s.Id, s);
                }

                _log.Blank();
                _log.Info("» Applying tags");
                var (tagsAdded, tagsRemoved, itemsChanged) = await ApplyTagsPhase(ctx);

                _log.Blank();
                _log.Info("» Collections");
                var (collCreated, collUpdated, collWouldCreate, collWouldUpdate, collDeleted) = await CollectionsPhase(ctx, cancellationToken);

                tagsRemoved += CleanupBoxSetTags(ctx.Config, ctx.DryRun, cancellationToken);

                _log.Blank();
                _log.Info("» Home sections");
                phaseTimer.Restart();
                if (!ctx.DryRun) ManageHomeSections(ctx.Config, cancellationToken, ctx.Debug, ctx.StatsList);
                else _log.Skip("Dry run — home sections are not changed");
                if (!ctx.DryRun)
                    _log.Info($"    {ctx.StatsList.Count(g => g.HomeSectionSynced)} synced, {ctx.StatsList.Count(g => g.HomeSectionRemoved)} removed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");

                CleanupDisabledPlaylists(ctx.Config, ctx.DryRun);
                bool _hasTopLists = (ctx.Config.TopLists ?? new List<TopListHomeSection>()).Any(t => !string.IsNullOrWhiteSpace(t.TagName));
                if (_hasTopLists) { _log.Blank(); _log.Info("» Top-lists"); }
                SyncTopListFolders(ctx.Config, ctx.DryRun);
                if (!ctx.DryRun) TopListSyncTask.SyncAll(_libraryManager, _userViewManager, _userManager, _jsonSerializer, _logger, cancellationToken, _log);

                progress.Report(100);
                string elapsedStr = RunLog.Elapsed(DateTime.Now - ctx.StartTime);

                // Merge BoxSet HSE entries with the same DisplayName + TagName into one display block
                var displayStatsList = new List<GroupRunStats>();
                var boxSetMergeMap = new Dictionary<string, GroupRunStats>(StringComparer.OrdinalIgnoreCase);
                foreach (var gs in ctx.StatsList)
                {
                    if (gs.BoxSetHse)
                    {
                        var key = $"{gs.DisplayName}\x00{gs.TagName}";
                        if (boxSetMergeMap.TryGetValue(key, out var existing))
                        {
                            existing.BoxSetTaggedCount += gs.BoxSetTaggedCount;
                            existing.Warnings.AddRange(gs.Warnings);
                            existing.ElapsedMs += gs.ElapsedMs;
                            if (gs.HomeSectionSynced)
                            {
                                existing.HomeSectionSynced = true;
                                existing.HomeSectionUserCount = Math.Max(existing.HomeSectionUserCount, gs.HomeSectionUserCount);
                            }
                            if (gs.HomeSectionRemoved) existing.HomeSectionRemoved = true;
                        }
                        else
                        {
                            var merged = new GroupRunStats
                            {
                                DisplayName = gs.DisplayName,
                                SourceType = gs.SourceType,
                                Skipped = gs.Skipped,
                                SkipReason = gs.SkipReason,
                                ErrorMessage = gs.ErrorMessage,
                                EnableTag = gs.EnableTag,
                                EnableCollection = gs.EnableCollection,
                                EnableHomeSection = gs.EnableHomeSection,
                                HomeSectionSynced = gs.HomeSectionSynced,
                                HomeSectionUserCount = gs.HomeSectionUserCount,
                                HomeSectionRemoved = gs.HomeSectionRemoved,
                                BoxSetHse = true,
                                BoxSetFound = gs.BoxSetFound,
                                BoxSetTaggedCount = gs.BoxSetTaggedCount,
                                TagName = gs.TagName,
                                CollectionName = gs.CollectionName,
                                SourceLabel = gs.SourceLabel,
                                EnablePlaylist = gs.EnablePlaylist,
                                PlaylistName = gs.PlaylistName,
                                PlaylistUsersTotal = gs.PlaylistUsersTotal,
                                PlaylistUsersCreated = gs.PlaylistUsersCreated,
                                PlaylistUsersUpdated = gs.PlaylistUsersUpdated,
                                PlaylistUsersFailed = gs.PlaylistUsersFailed,
                                Warnings = new List<string>(gs.Warnings),
                                MissingItems = new List<string>(gs.MissingItems),
                                ElapsedMs = gs.ElapsedMs,
                            };
                            boxSetMergeMap[key] = merged;
                            displayStatsList.Add(merged);
                        }
                    }
                    else
                    {
                        displayStatsList.Add(gs);
                    }
                }
                int displayTotal = displayStatsList.Count;
                for (int i = 0; i < displayStatsList.Count; i++)
                {
                    displayStatsList[i].GroupIndex = i + 1;
                    displayStatsList[i].GroupTotal = displayTotal;
                }

                // Emit per-group blocks
                WriteResultsBlock(displayStatsList, ctx.DryRun, ctx.LogMissing);

                // Log cleanup of tags from deleted/disabled groups (tags that had removals but
                // no matching entry in displayStatsList to attribute them to).
                var displayedTagNames = new HashSet<string>(
                    displayStatsList.Where(g => g.TagName != null).Select(g => g.TagName!),
                    StringComparer.OrdinalIgnoreCase);
                foreach (var kvp in _runTagRemovedByTag!.Where(kvp => kvp.Value > 0 && !displayedTagNames.Contains(kvp.Key)))
                {
                    _log.Info("[Cleanup]");
                    _log.Skip($"Tag \"{kvp.Key}\" {(ctx.DryRun ? "would be removed" : "removed")} from {RunLog.Plural(kvp.Value, "item")} (its group is deleted or disabled)");
                    _log.Blank();
                }

                // Final summary
                int totalCollCreated = ctx.StatsList.Count(g => g.CollectionCreated);
                int totalCollUpdated = ctx.StatsList.Count(g => !g.CollectionCreated && !g.Skipped && g.EnableCollection && (g.CollectionItemsAdded > 0 || g.CollectionItemsRemoved > 0));
                int totalHsSynced = ctx.StatsList.Count(g => g.HomeSectionSynced);
                int totalHsRemoved = ctx.StatsList.Count(g => g.HomeSectionRemoved);

                int totalBoxSetsTagged = displayStatsList
                    .Where(g => g.BoxSetHse && !g.Skipped && g.ErrorMessage == null)
                    .Sum(g => g.BoxSetTaggedCount);
                int summaryTagsAdded = tagsAdded + totalBoxSetsTagged;

                if (aiConfigChanged)
                    Plugin.Instance.SaveConfiguration();

                int groupsFailed = displayStatsList.Count(g => g.ErrorMessage != null);
                int groupsSkipped = displayStatsList.Count(g => g.Skipped);
                int groupsWarned = displayStatsList.Count(g => !g.Skipped && g.ErrorMessage == null && g.Warnings.Count > 0);
                int groupsOk = displayStatsList.Count - groupsFailed - groupsSkipped - groupsWarned;
                string finalStatus = BuildFinalStatus(ctx.DryRun, groupsFailed, groupsWarned);
                LastRunStatus = $"{finalStatus} ({DateTime.Now:HH:mm})";

                _log.Rule();
                _log.Info("Summary");
                var _groupParts = new List<string> { $"{groupsOk} OK" };
                if (groupsWarned > 0) _groupParts.Add($"{groupsWarned} with warnings");
                if (groupsSkipped > 0) _groupParts.Add($"{groupsSkipped} skipped");
                if (groupsFailed > 0) _groupParts.Add($"{groupsFailed} failed");
                _log.Info($"  Groups:        {string.Join(", ", _groupParts)}");
                _log.Info($"  Tags:          +{summaryTagsAdded} added, -{tagsRemoved} removed");
                _log.Info(ctx.DryRun
                    ? $"  Collections:   {collWouldCreate} would be created, {collWouldUpdate} updated"
                    : $"  Collections:   {totalCollCreated} created, {totalCollUpdated} updated, {collDeleted} removed");
                if (ctx.StatsList.Any(g => g.EnablePlaylist))
                    _log.Info($"  Playlists:     {ctx.StatsList.Sum(g => g.PlaylistUsersCreated)} created, {ctx.StatsList.Sum(g => g.PlaylistUsersUpdated)} updated{(ctx.StatsList.Sum(g => g.PlaylistUsersFailed) > 0 ? $", {ctx.StatsList.Sum(g => g.PlaylistUsersFailed)} failed" : "")}");
                _log.Info($"  Home sections: {totalHsSynced} synced, {totalHsRemoved} removed");
                _log.Info($"  Done in {elapsedStr}  ·  {StatusSymbol(groupsFailed, groupsWarned)} {finalStatus}");
                _log.Rule();
            }
            catch (Exception ex)
            {
                LastRunStatus = $"Failed: {ex.Message}";
                _log.Error($"Sync aborted: {ex.Message}");
                WriteExceptionDebug(ex);
            }
            finally { IsRunning = false; }
        }

        public async Task<(bool Success, string Message)> RunSingleEntryAsync(string entryName, CancellationToken cancellationToken)
        {
            IsRunning = true;
            lock (ExecutionLog) ExecutionLog.Clear();
            LastStartedUtc = DateTime.UtcNow;
            LastRunStatus = "Running...";
            try
            {
                return await RunSingleEntryInternalAsync(entryName, cancellationToken);
            }
            finally
            {
                IsRunning = false;
            }
        }

        private async Task<(bool Success, string Message)> RunSingleEntryInternalAsync(string entryName, CancellationToken cancellationToken)
        {
            var config = Plugin.Instance?.Configuration;
            if (config == null) return (false, "Config not found");

            var tagConfig = config.Tags.FirstOrDefault(t =>
                string.Equals(t.Name, entryName, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(t.Name) == false && string.Equals(t.Tag, entryName, StringComparison.OrdinalIgnoreCase)));
            if (tagConfig == null) { LastRunStatus = $"Failed: entry not found"; _log.Error($"Group '{entryName}' was not found in the saved settings — save your settings and try again"); return (false, $"Entry '{entryName}' not found in saved config"); }
            if (string.IsNullOrWhiteSpace(tagConfig.Tag)) { LastRunStatus = "Failed: no tag name"; _log.Error($"Group '{entryName}' has no tag name"); return (false, "Entry has no tag name"); }

            // A group with several URLs / local sources is stored as one flat TagConfig per source
            // (same Name + Tag). tagConfig owns the shared settings; groupEntries supplies the sources.
            var groupEntryKey = GroupKey(tagConfig);
            var groupEntries = config.Tags
                .Where(t => string.Equals(GroupKey(t), groupEntryKey, StringComparison.OrdinalIgnoreCase))
                .ToList();

            string _displayName = !string.IsNullOrWhiteSpace(tagConfig.Name) ? $"{tagConfig.Name} [{tagConfig.Tag.Trim()}]" : tagConfig.Tag.Trim();
            string _srcLabel = string.IsNullOrEmpty(tagConfig.SourceType) ? "External" : tagConfig.SourceType;

            bool debug = config.ExtendedConsoleOutput;
            bool dryRun = config.DryRunMode;
            bool logMissing = config.LogMissingItems;
            var startTime = DateTime.Now;
            _log = new RunLog(ExecutionLog, _logger, "", debug);

            if (tagConfig.SourceType == "AI" && tagConfig.AiRefreshIntervalDays > 0 &&
                tagConfig.AiLastRunDate > DateTime.MinValue &&
                (DateTime.UtcNow - tagConfig.AiLastRunDate).TotalDays < tagConfig.AiRefreshIntervalDays)
            {
                var _nextAiRun = tagConfig.AiLastRunDate.AddDays(tagConfig.AiRefreshIntervalDays);
                _log.Rule();
                _log.Info($"Home Screen Companion v{Plugin.Instance?.Version}  ·  {startTime:yyyy-MM-dd HH:mm}  ·  Single group: {_displayName}");
                _log.Skip($"Skipped: AI refresh not due until {_nextAiRun:yyyy-MM-dd}");
                _log.Rule();
                LastRunStatus = $"Skipped ({DateTime.Now:HH:mm})";
                return (true, $"Skipped — AI refresh not due until {_nextAiRun:yyyy-MM-dd}");
            }

            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = BuildItemTypes(config),
                Recursive = true,
                IsVirtualItem = false
            }).ToList();

            int _movieCount = allItems.Count(i => i.GetType().Name.Contains("Movie"));
            int _seriesCount = allItems.Count(i => i.GetType().Name.Contains("Series"));
            _log.Rule();
            _log.Info($"Home Screen Companion v{Plugin.Instance?.Version}  ·  {startTime:yyyy-MM-dd HH:mm}  ·  Single group: {_displayName}");
            if (dryRun) _log.Warn("DRY RUN — nothing will be changed, the log shows what would happen");
            _log.Info($"  Library: {_movieCount:N0} movies, {_seriesCount:N0} series");
            _log.Rule();

            var gs = new GroupRunStats
            {
                DisplayName = _displayName,
                SourceType = _srcLabel,
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
            var groupTimer = System.Diagnostics.Stopwatch.StartNew();

            var _topListsFolder = Path.Combine(Plugin.Instance.DataFolderPath, "toplists") + Path.DirectorySeparatorChar;
            var imdbLookup = new Dictionary<string, List<BaseItem>>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in allItems)
            {
                if (item.LocationType != LocationType.FileSystem) continue;
                if (!string.IsNullOrEmpty(item.Path) &&
                    item.Path.StartsWith(_topListsFolder, StringComparison.OrdinalIgnoreCase))
                    continue;
                var imdb = item.GetProviderId("Imdb");
                if (!string.IsNullOrEmpty(imdb))
                {
                    if (!imdbLookup.ContainsKey(imdb)) imdbLookup[imdb] = new List<BaseItem>();
                    imdbLookup[imdb].Add(item);
                }
            }

            var seriesEpisodeCache = new Dictionary<long, BaseItem>();
            var personCache = new Dictionary<string, HashSet<long>>(StringComparer.OrdinalIgnoreCase);
            var collectionMembershipCache = new Dictionary<string, HashSet<long>>(StringComparer.OrdinalIgnoreCase);
            var mediaInfoCache = new Dictionary<long, CachedMediaInfo>();
            var userDataCache = new Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)>();
            var seriesLastPlayedCache = new Dictionary<(Guid, long), DateTimeOffset?>();
            var preloadedUsers = _userManager.GetUserList(new UserQuery { IsDisabled = false });
            Dictionary<long, List<string>>? seriesEpisodeNamesCache = null;

            var needsMediaInfoEval = tagConfig.SourceType == "MediaInfo"
                || (tagConfig.MediaInfoFilters?.Count > 0 || tagConfig.MediaInfoConditions?.Count > 0);

            if (needsMediaInfoEval)
            {
                bool singleTagAnyEpisodePersonCriteria = TagConfigTargetsEpisodes(tagConfig)
                    && GetAllCriteria(tagConfig).Any(c => { var s = c.TrimStart('!'); return s.StartsWith("Actor:") || s.StartsWith("Director:") || s.StartsWith("Writer:"); });
                var allCriteria = (tagConfig.MediaInfoFilters ?? new List<MediaInfoFilter>())
                    .SelectMany(f => f.Criteria ?? new List<string>())
                    .Concat(tagConfig.MediaInfoConditions ?? new List<string>())
                    .Select(c => c.Length > 0 && c[0] == '!' ? c.Substring(1) : c)
                    .Distinct(StringComparer.OrdinalIgnoreCase);
                BaseItem[]? allPersonsTag = null;
                foreach (var c in allCriteria)
                {
                    var p = c.Split(':');
                    if ((p.Length == 2 || (p.Length == 3 && (p[1] == "exact" || p[1] == "contains")))
                        && (p[0] == "Actor" || p[0] == "Director" || p[0] == "Writer")
                        && Enum.TryParse<MediaBrowser.Model.Entities.PersonType>(p[0], out var personTypeEnum))
                    {
                        string matchOp = p.Length == 3 ? p[1] : "exact";
                        string personNameRaw = p.Length == 3 ? p[2].Trim() : p[1].Trim();
                        var personTypes = singleTagAnyEpisodePersonCriteria && p[0] == "Actor"
                            ? new[] { personTypeEnum, MediaBrowser.Model.Entities.PersonType.GuestStar }
                            : new[] { personTypeEnum };
                        foreach (var singleName in personNameRaw.Split(new[] { ',', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).Select(n => n.Trim()).Where(n => n.Length > 0))
                        {
                            if (matchOp == "contains")
                            {
                                string containsKey = $"{p[0]}:contains:{singleName}";
                                if (personCache.ContainsKey(containsKey)) continue;
                                allPersonsTag ??= _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Person" } }).ToArray();
                                var combinedIds = new HashSet<long>();
                                foreach (var matchingPerson in allPersonsTag.Where(person => person.Name?.IndexOf(singleName, StringComparison.OrdinalIgnoreCase) >= 0))
                                {
                                    foreach (var mi in _libraryManager.GetItemList(new InternalItemsQuery
                                    {
                                        PersonIds = new[] { matchingPerson.InternalId },
                                        PersonTypes = personTypes,
                                        IncludeItemTypes = singleTagAnyEpisodePersonCriteria ? new[] { "Movie", "Series", "Episode" } : new[] { "Movie", "Series" },
                                        Recursive = true,
                                        IsVirtualItem = false
                                    })) combinedIds.Add(mi.InternalId);
                                }
                                personCache[containsKey] = combinedIds;
                            }
                            else
                            {
                                string indivKey = p.Length == 3 ? $"{p[0]}:{p[1]}:{singleName}" : $"{p[0]}:{singleName}";
                                if (personCache.ContainsKey(indivKey)) continue;
                                var personItem = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Person" }, Name = singleName }).FirstOrDefault();
                                personCache[indivKey] = personItem == null ? new HashSet<long>() :
                                    _libraryManager.GetItemList(new InternalItemsQuery
                                    {
                                        PersonIds = new[] { personItem.InternalId },
                                        PersonTypes = personTypes,
                                        IncludeItemTypes = singleTagAnyEpisodePersonCriteria ? new[] { "Movie", "Series", "Episode" } : new[] { "Movie", "Series" },
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
                    var resolved = ResolveItemForMediaInfo(item, seriesEpisodeCache);
                    mediaInfoCache[item.InternalId] = ExtractMediaInfo(resolved);
                }
                var singleTagCollPlCriteria = GetAllCriteria(tagConfig)
                    .Select(c => c.Length > 0 && c[0] == '!' ? c.Substring(1) : c)
                    .Where(c => c.StartsWith("Collection:", StringComparison.OrdinalIgnoreCase) || c.StartsWith("Playlist:", StringComparison.OrdinalIgnoreCase))
                    .Distinct(StringComparer.OrdinalIgnoreCase);
                foreach (var crit in singleTagCollPlCriteria)
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
                        if (collectionMembershipCache.ContainsKey(indivKey)) continue;
                        var folder = _libraryManager.GetItemList(new InternalItemsQuery
                        {
                            IncludeItemTypes = folderTypes,
                            Recursive = true
                        }).FirstOrDefault(i => string.Equals(i.Name, singleName, StringComparison.OrdinalIgnoreCase));
                        if (folder == null) { collectionMembershipCache[indivKey] = new HashSet<long>(); continue; }
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
                        collectionMembershipCache[indivKey] = ids;
                    }
                }

                // Pre-populate userDataCache for all top-level items when IsPlayed/PlayCount/WatchedByCount/LastPlayed criteria exist
                bool needsItemUserData = GetAllCriteria(tagConfig).Any(c =>
                {
                    var _cp = c.TrimStart('!').Split(':');
                    return (_cp.Length == 4 && _cp[0] == "LastPlayed") || _cp[0] == "IsPlayed" || _cp[0] == "PlayCount" || _cp[0] == "WatchedByCount";
                });
                if (needsItemUserData && preloadedUsers?.Length > 0)
                {
                    foreach (var _user in preloadedUsers)
                    {
                        foreach (var _topItem in allItems)
                        {
                            var _k = (_user.Id, _topItem.InternalId);
                            if (userDataCache.ContainsKey(_k)) continue;
                            var _ud0 = _userDataManager?.GetUserData(_user, _topItem);
                            userDataCache[_k] = _ud0 == null ? (false, (DateTimeOffset?)null, 0) : (_ud0.Played, _ud0.LastPlayedDate, _ud0.PlayCount);
                        }
                    }
                }

                // Pre-fetch all episodes once if needed for LastPlayed or EpisodeTitle caches
                bool needsSeriesLastPlayed = GetAllCriteria(tagConfig).Any(c =>
                    c.TrimStart('!').Split(':') is var p && p.Length == 4 && p[0] == "LastPlayed");
                bool needsEpisodeTitleCache = GetAllCriteria(tagConfig).Any(c =>
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

                if (needsSeriesLastPlayed && preloadedUsers?.Length > 0 && allEpisodes != null)
                {
                    foreach (var user in preloadedUsers)
                    {
                        // Pre-populate userDataCache for all episodes so GetSeriesLastPlayed hits cache during scan
                        foreach (var ep in allEpisodes)
                        {
                            var epCacheKey = (user.Id, ep.InternalId);
                            if (userDataCache.ContainsKey(epCacheKey)) continue;
                            var ud = _userDataManager?.GetUserData(user, ep);
                            userDataCache[epCacheKey] = ud == null ? (false, (DateTimeOffset?)null, 0) : (ud.Played, ud.LastPlayedDate, ud.PlayCount);
                        }

                        // Pre-compute seriesLastPlayedCache for this user
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
                            if (seriesLastPlayedCache.ContainsKey(seriesCacheKey)) continue;
                            DateTimeOffset? maxDate = null;
                            foreach (var ep in kvp.Value)
                            {
                                if (userDataCache.TryGetValue((user.Id, ep.InternalId), out var cd) && cd.LastPlayedDate.HasValue)
                                    if (maxDate == null || cd.LastPlayedDate > maxDate) maxDate = cd.LastPlayedDate;
                            }
                            seriesLastPlayedCache[seriesCacheKey] = maxDate;
                        }
                    }
                }

                if (needsEpisodeTitleCache && allEpisodes != null)
                {
                    seriesEpisodeNamesCache = new Dictionary<long, List<string>>();
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
                        if (!seriesEpisodeNamesCache.TryGetValue(seriesItem.InternalId, out var nameList))
                        {
                            nameList = new List<string>();
                            seriesEpisodeNamesCache[seriesItem.InternalId] = nameList;
                        }
                        nameList.Add(ep.Name);
                    }
                }
            }

            string tagName = tagConfig.Tag.Trim();
            string cName = string.IsNullOrWhiteSpace(tagConfig.CollectionName) ? tagName : tagConfig.CollectionName.Trim();
            int effectiveLimit = tagConfig.Limit <= 0 ? 10000 : tagConfig.Limit;
            var blacklist = new HashSet<string>(tagConfig.Blacklist ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
            // Remove this tag from the cache before repopulating so blacklisted items don't get
            // immediately re-tagged by the real-time event handler when UpdateItem is called.
            // (Full run clears the entire cache first; single run must do a targeted removal.)
            TagCacheManager.Instance.RemoveTagFromAllEntries(tagName);
            var matchedLocalItems = new List<BaseItem>();
            List<BaseItem> tagOutputItems = matchedLocalItems;
            List<BaseItem> collectionOutputItems = matchedLocalItems;
            int _listCount = 0;

            _log.Blank();
            _log.Info("» Fetching sources");
            _log.Section($"[1/1] {_displayName}");
            _log.Debug("  " + DescribeSourceDetail(tagConfig, effectiveLimit) + (groupEntries.Count > 1 ? $"  ·  {groupEntries.Count} sources in group" : ""));

            try
            {
                var fetcher = new ListFetcher(_httpClient, _jsonSerializer);

                if (string.IsNullOrEmpty(tagConfig.SourceType) || tagConfig.SourceType == "External")
                {
                    // One fetch per URL in the group; limit applies per URL (same as the full run)
                    foreach (var src in groupEntries)
                    {
                        if (string.IsNullOrWhiteSpace(src.Url)) continue;
                        int srcLimit = src.Limit <= 0 ? 10000 : src.Limit;
                        var fetchTimer = System.Diagnostics.Stopwatch.StartNew();
                        var items = await fetcher.FetchItems(src.Url, srcLimit, config.TraktClientId, config.MdblistApiKey, config.TmdbApiKey, cancellationToken);
                        fetchTimer.Stop();
                        _listCount += items.Count;
                        if (items.Count > srcLimit) items = items.Take(srcLimit).ToList();
                        int _srcMatched = 0, _srcBlacklisted = 0, _srcMissingBefore = gs.MissingItems.Count;
                        foreach (var extItem in items)
                        {
                            if (string.IsNullOrEmpty(extItem.Imdb)) continue;
                            if (blacklist.Contains(extItem.Imdb)) { _srcBlacklisted++; _log.Debug($"    Blacklisted: {extItem.Name} ({extItem.Imdb})"); continue; }
                            if (tagConfig.EnableTag && !tagConfig.OnlyCollection)
                                TagCacheManager.Instance.AddToCache($"imdb_{extItem.Imdb}", tagName);
                            if (imdbLookup.TryGetValue(extItem.Imdb, out var localItems))
                            {
                                _srcMatched++;
                                foreach (var localItem in localItems)
                                    if (!matchedLocalItems.Contains(localItem)) matchedLocalItems.Add(localItem);
                            }
                            else
                            {
                                gs.MissingItems.Add($"{extItem.Name}  {extItem.Imdb}");
                            }
                        }
                        _log.Debug($"  {src.Url}  →  {items.Count} items in {fetchTimer.ElapsedMilliseconds} ms  ·  {_srcMatched} matched by IMDb id  ·  {gs.MissingItems.Count - _srcMissingBefore} not in library  ·  {_srcBlacklisted} blacklisted");
                    }
                }
                else if (tagConfig.SourceType == "LocalCollection" || tagConfig.SourceType == "LocalPlaylist")
                {
                    string[] folderTypes = tagConfig.SourceType == "LocalPlaylist" ? new[] { "Playlist" } : new[] { "BoxSet" };
                    var allFolders = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = folderTypes, Recursive = true });
                    var missingSources = new List<string>();

                    // One pass per local source in the group; limit applies per source (same as the full run)
                    foreach (var src in groupEntries)
                    {
                        if (string.IsNullOrEmpty(src.LocalSourceId)) continue;
                        int srcLimit = src.Limit <= 0 ? 10000 : src.Limit;
                        var localSourceFolder = allFolders.FirstOrDefault(i => string.Equals(i.Name, src.LocalSourceId, StringComparison.OrdinalIgnoreCase));
                        if (localSourceFolder == null)
                        {
                            missingSources.Add(src.LocalSourceId);
                            gs.Warnings.Add($"{DescribeSource(tagConfig)} '{src.LocalSourceId}' was not found in the library");
                            continue;
                        }
                        _log.Debug($"  Found source '{localSourceFolder.Name}'  ({localSourceFolder.GetType().Name})");

                        var children = tagConfig.SourceType == "LocalCollection"
                            ? _libraryManager.GetItemList(new InternalItemsQuery { CollectionIds = new[] { localSourceFolder.InternalId }, IsVirtualItem = false }).ToList()
                            : _libraryManager.GetItemList(new InternalItemsQuery { ListIds = new[] { localSourceFolder.InternalId } }).ToList();
                        _listCount += children.Count;
                        var srcMatched = new List<BaseItem>();
                        foreach (var child in children)
                        {
                            if (child == null) continue;
                            BaseItem itemToTag = child;
                            if (child.GetType().Name.Contains("PlaylistItem")) { try { var inner = ((dynamic)child).Item; if (inner != null) itemToTag = inner; } catch { } }
                            if (itemToTag.GetType().Name.Contains("Episode")) { try { var series = ((dynamic)itemToTag).Series; if (series != null) itemToTag = series; } catch { } }
                            if (!IsTaggableTopLevelItem(itemToTag)) continue;
                            var imdb = itemToTag.GetProviderId("Imdb");
                            if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb)) continue;
                            if (!srcMatched.Contains(itemToTag)) srcMatched.Add(itemToTag);
                        }
                        if (srcLimit < 10000 && srcMatched.Count > srcLimit)
                            srcMatched = srcMatched.Take(srcLimit).ToList();
                        foreach (var m in srcMatched)
                            if (!matchedLocalItems.Contains(m)) matchedLocalItems.Add(m);
                        _log.Debug($"  '{src.LocalSourceId}'  →  {children.Count} items, {srcMatched.Count} usable movies/series");
                    }

                    // Only fail outright if no source in the group could be resolved
                    if (missingSources.Count > 0 && matchedLocalItems.Count == 0 && _listCount == 0)
                    {
                        gs.ErrorMessage = $"Source '{string.Join("', '", missingSources)}' not found";
                        gs.Warnings.Clear();
                        gs.ElapsedMs = groupTimer.ElapsedMilliseconds;
                        WriteFetchLine(gs);
                        WriteSingleRunFooter(gs, startTime, dryRun, logMissing);
                        return (false, $"Source '{string.Join("', '", missingSources)}' not found");
                    }
                }
                else if (tagConfig.SourceType == "MediaInfo" && IsViewerOnlyMediaInfoFilter(tagConfig))
                {
                    // Nothing to tag/collect — the home section query (IsPlayed / IsResumable)
                    // resolves the filter for each viewing user. Skip the expensive library scan.
                    _listCount = 0;
                    _log.Debug("  Current-user filter — library scan skipped (the home section resolves it per user)");
                }
                else if (tagConfig.SourceType == "MediaInfo")
                {
                    IList<BaseItem> _itemsToScan;
                    if (TagConfigTargetsEpisodes(tagConfig))
                    {
                        var _epQuery = new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Recursive = true, IsVirtualItem = false };
                        var _tc = ExtractTitleContains(tagConfig);
                        if (!string.IsNullOrEmpty(_tc)) _epQuery.NameContains = _tc;
                        _itemsToScan = _libraryManager.GetItemList(_epQuery).ToList();
                    }
                    else
                    {
                        _itemsToScan = allItems;
                    }
                    _listCount = _itemsToScan.Count;
                    foreach (var item in _itemsToScan)
                    {
                        if (item.LocationType != LocationType.FileSystem) continue;
                        var imdb = item.GetProviderId("Imdb");
                        if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb)) continue;
                        CachedMediaInfo? ci = mediaInfoCache.TryGetValue(item.InternalId, out var ciVal) ? ciVal : (CachedMediaInfo?)null;
                        if (ItemMatchesMediaInfo(item, tagConfig, debug, seriesEpisodeCache, personCache, userDataCache, ci, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache))
                        {
                            matchedLocalItems.Add(item);
                            if (effectiveLimit < 10000 && matchedLocalItems.Count >= effectiveLimit) break;
                        }
                    }
                    if (debug)
                    {
                        _log.Debug($"  Scanned {_itemsToScan.Count:N0} items in {groupTimer.ElapsedMilliseconds} ms  ·  {matchedLocalItems.Count} matched");
                        WriteMatchedItemsDebug(matchedLocalItems);
                    }
                    // Redirect matched items to the selected output level (tag and collection independently)
                    tagOutputItems = matchedLocalItems;
                    collectionOutputItems = matchedLocalItems;
                    {
                        bool scannedEpisodes = TagConfigTargetsEpisodes(tagConfig);
                        var (tEp, tSea, tSer) = EffectiveTagTargets(tagConfig);
                        var (cEp, cSea, cSer) = EffectiveCollectionTargets(tagConfig);

                        List<BaseItem> BuildOutputList(bool ep, bool sea, bool ser, bool anyNew)
                        {
                            if (!anyNew) return scannedEpisodes ? ResolveParentSeries(matchedLocalItems) : matchedLocalItems.ToList();
                            var list = new List<BaseItem>();
                            var seriesOnly = matchedLocalItems.Where(i => i.GetType().Name.Contains("Series")).ToList();
                            if (scannedEpisodes)
                            {
                                if (ep) list.AddRange(matchedLocalItems);
                                if (sea) list.AddRange(ResolveParentSeasons(matchedLocalItems));
                                if (ser) list.AddRange(ResolveParentSeries(matchedLocalItems));
                            }
                            else
                            {
                                var movies = matchedLocalItems.Where(i => !i.GetType().Name.Contains("Series")).ToList();
                                if (ser) list.AddRange(matchedLocalItems);
                                if (sea) { list.AddRange(ResolveChildSeasons(seriesOnly)); list.AddRange(movies); }
                                if (ep) { list.AddRange(ResolveChildEpisodes(seriesOnly)); list.AddRange(movies); }
                            }
                            return list;
                        }

                        tagOutputItems = BuildOutputList(tEp, tSea, tSer, tEp || tSea || tSer);
                        collectionOutputItems = BuildOutputList(cEp, cSea, cSer, cEp || cSea || cSer);
                    }
                }
                else if (tagConfig.SourceType == "AI")
                {
                    var recentlyWatchedContext = BuildRecentlyWatchedContext(tagConfig);
                    var fetchTimer = System.Diagnostics.Stopwatch.StartNew();
                    var aiItems = await fetcher.FetchAiList(
                        tagConfig.AiProvider,
                        tagConfig.AiPrompt,
                        config.OpenAiApiKey,
                        config.OpenAiModel,
                        config.GeminiApiKey,
                        config.GeminiModel,
                        config.ClaudeApiKey,
                        config.ClaudeModel,
                        config.OllamaBaseUrl,
                        config.OllamaModel,
                        config.AiSystemPrompt,
                        recentlyWatchedContext,
                        effectiveLimit,
                        cancellationToken);
                    fetchTimer.Stop();

                    _listCount = aiItems.Count;
                    int _aiTitleMatched = 0, _aiBlacklisted = 0;

                    foreach (var aiItem in aiItems)
                    {
                        if (string.IsNullOrWhiteSpace(aiItem.title)) continue;
                        string _aiLabel = aiItem.year.HasValue ? $"{aiItem.title} ({aiItem.year})" : aiItem.title;

                        if (!string.IsNullOrEmpty(aiItem.imdb_id))
                        {
                            var imdbId = aiItem.imdb_id.Trim();
                            if (blacklist.Contains(imdbId)) { _aiBlacklisted++; _log.Debug($"    Blacklisted: {_aiLabel} ({imdbId})"); continue; }
                            if (tagConfig.EnableTag && !tagConfig.OnlyCollection)
                                TagCacheManager.Instance.AddToCache($"imdb_{imdbId}", tagName);
                            if (imdbLookup.TryGetValue(imdbId, out var localItems))
                            {
                                foreach (var localItem in localItems)
                                    if (!matchedLocalItems.Contains(localItem)) matchedLocalItems.Add(localItem);
                            }
                            else
                            {
                                // IMDB ID not found in library — fall back to title+year match
                                var titleMatches = FindByTitleAndYear(allItems, aiItem.title, aiItem.year);
                                if (titleMatches.Count > 0) { _aiTitleMatched++; _log.Debug($"    {imdbId} not in library — matched '{_aiLabel}' by title"); }
                                else gs.MissingItems.Add($"{_aiLabel}  {imdbId}");
                                foreach (var localItem in titleMatches)
                                {
                                    var imdb = localItem.GetProviderId("Imdb");
                                    if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb)) continue;
                                    if (!matchedLocalItems.Contains(localItem)) matchedLocalItems.Add(localItem);
                                }
                            }
                        }
                        else
                        {
                            var titleMatches = FindByTitleAndYear(allItems, aiItem.title, aiItem.year);
                            if (titleMatches.Count > 0) _aiTitleMatched++;
                            else gs.MissingItems.Add($"{_aiLabel}  (no IMDb id from AI)");
                            foreach (var localItem in titleMatches)
                            {
                                var imdb = localItem.GetProviderId("Imdb");
                                if (!string.IsNullOrEmpty(imdb) && blacklist.Contains(imdb)) { _aiBlacklisted++; continue; }
                                if (!matchedLocalItems.Contains(localItem)) matchedLocalItems.Add(localItem);
                            }
                        }
                    }
                    _log.Debug($"  AI ({tagConfig.AiProvider}) returned {_listCount} items in {fetchTimer.ElapsedMilliseconds} ms  ·  {matchedLocalItems.Count} matched ({_aiTitleMatched} by title only)  ·  {gs.MissingItems.Count} not in library  ·  {_aiBlacklisted} blacklisted");

                    if (tagConfig.AiRefreshIntervalDays > 0)
                    {
                        tagConfig.AiLastRunDate = DateTime.UtcNow;
                        Plugin.Instance.SaveConfiguration();
                    }
                }
            }
            catch (Exception ex)
            {
                gs.ErrorMessage = ex.Message;
                gs.ElapsedMs = groupTimer.ElapsedMilliseconds;
                WriteExceptionDebug(ex);
                WriteFetchLine(gs);
                WriteSingleRunFooter(gs, startTime, dryRun, logMissing);
                LastRunStatus = $"Failed: {ex.Message}";
                return (false, $"Error: {ex.Message}");
            }

            // Apply MediaInfo post-filter for non-MediaInfo source types
            if (tagConfig.SourceType != "MediaInfo" && matchedLocalItems.Count > 0
                && (tagConfig.MediaInfoFilters?.Count > 0 || tagConfig.MediaInfoConditions?.Count > 0))
            {
                var beforeCount = matchedLocalItems.Count;
                matchedLocalItems = matchedLocalItems.Where(item =>
                {
                    CachedMediaInfo? ci = mediaInfoCache.TryGetValue(item.InternalId, out var ciVal) ? ciVal : (CachedMediaInfo?)null;
                    return ItemMatchesMediaInfo(item, tagConfig, debug, seriesEpisodeCache, personCache, userDataCache, ci, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache);
                }).ToList();
                _log.Debug($"  Filter conditions: {beforeCount} → {matchedLocalItems.Count} items");
            }

            // For non-MediaInfo sources, apply output level selection (expand down from Series/Movie)
            if (tagConfig.SourceType != "MediaInfo")
            {
                var (tEp, tSea, tSer) = EffectiveTagTargets(tagConfig);
                var (cEp, cSea, cSer) = EffectiveCollectionTargets(tagConfig);

                List<BaseItem> BuildNonMiOutput(bool ep, bool sea, bool ser, bool any)
                {
                    if (!any) return matchedLocalItems.ToList();
                    var list = new List<BaseItem>();
                    var seriesOnly = matchedLocalItems.Where(i => i.GetType().Name.Contains("Series")).ToList();
                    var movies = matchedLocalItems.Where(i => !i.GetType().Name.Contains("Series")).ToList();
                    if (ser) list.AddRange(matchedLocalItems);
                    if (sea) { var s = ResolveChildSeasons(seriesOnly); list.AddRange(s); list.AddRange(movies); }
                    if (ep) { var e = ResolveChildEpisodes(seriesOnly); list.AddRange(e); list.AddRange(movies); }
                    return list;
                }

                tagOutputItems = BuildNonMiOutput(tEp, tSea, tSer, tEp || tSea || tSer);
                collectionOutputItems = BuildNonMiOutput(cEp, cSea, cSer, cEp || cSea || cSer);
            }

            // Current-user-only Smart-playlist group — tags/collections/playlists can't be per-user.
            // The home section query resolves it per viewer instead.
            bool viewerOnlyMediaInfo = IsViewerOnlyMediaInfoFilter(tagConfig);
            if (viewerOnlyMediaInfo)
            {
                tagOutputItems = new List<BaseItem>();
                collectionOutputItems = new List<BaseItem>();
                gs.ViewerOnly = true;
                if (tagConfig.EnableTag || tagConfig.EnableCollection || tagConfig.EnablePlaylist)
                {
                    gs.Warnings.Add("Current-user filter — tags, collections and playlists cannot be per-user, so only the home section is created. Disable those outputs or add a non-user condition (e.g. Resolution: 4K or Year).");
                    _log.Warn("  Current-user filter — no tag/collection/playlist will be created");
                }
                else
                {
                    _log.Debug("  Current-user filter — home section only");
                }
            }

            gs.ListCount = _listCount;
            if ((string.IsNullOrEmpty(tagConfig.SourceType) || tagConfig.SourceType == "External" || tagConfig.SourceType == "AI") && _listCount == 0)
                gs.Warnings.Add(tagConfig.SourceType == "AI"
                    ? "The AI returned 0 items — the group's tags, collection and playlist are being cleared. Check the prompt and the API key in Settings."
                    : "The list returned 0 items — the group's tags, collection and playlist are being cleared. Check the list URL and the API key in Settings.");
            {
                var _outIds = new HashSet<Guid>(tagOutputItems.Select(i => i.Id));
                foreach (var _id in collectionOutputItems.Select(i => i.Id)) _outIds.Add(_id);
                gs.MatchCount = _outIds.Count;
            }
            if (gs.MissingItems.Count > 0 && debug)
            {
                _log.Debug($"  Not in library ({gs.MissingItems.Count}):");
                foreach (var _missing in gs.MissingItems) _log.Debug("    " + _missing);
            }
            gs.ElapsedMs = groupTimer.ElapsedMilliseconds;
            _log.Debug($"  Group done in {gs.ElapsedMs} ms");
            WriteFetchLine(gs);

            // Save rank file so top-list .strm files can be numbered in list order
            if (!dryRun)
            {
                WriteRankFile(tagName, matchedLocalItems
                    .Select(i => i.GetProviderId("Imdb") ?? "")
                    .Where(id => !string.IsNullOrEmpty(id))
                    .ToList());
            }

            // Apply tags (scoped to this entry's tag only)
            _log.Blank();
            _log.Info("» Applying tags");
            var phaseTimer = System.Diagnostics.Stopwatch.StartNew();
            int tagsAdded = 0, tagsRemoved = 0;
            var _dbgTagAdded = debug ? new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase) : null;
            var _dbgTagRemoved = debug ? new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase) : null;
            var matchedIds = new HashSet<Guid>(tagOutputItems.Select(i => i.Id));
            var _isBoxSetHse = IsBoxSetHomeSectionEntry(tagConfig); // computed once, not per-item
            int updateCount = 0;
            foreach (var item in allItems)
            {
                var existingTags = new HashSet<string>(item.Tags, StringComparer.OrdinalIgnoreCase);
                bool shouldHave = tagConfig.EnableTag && !tagConfig.OnlyCollection && !_isBoxSetHse && matchedIds.Contains(item.Id);
                bool hasTag = existingTags.Contains(tagName);
                if (shouldHave == hasTag) continue;
                if (debug)
                {
                    var _tagYr = item.ProductionYear.HasValue ? $" ({item.ProductionYear})" : "";
                    var _tagTp = item.GetType().Name.Contains("Series") ? "Series" : "Movie";
                    string _itemLabel = $"{item.Name}{_tagYr}  [{_tagTp}]";
                    if (shouldHave) { if (!_dbgTagAdded!.ContainsKey(tagName)) _dbgTagAdded[tagName] = new List<string>(); _dbgTagAdded[tagName].Add(_itemLabel); }
                    else { if (!_dbgTagRemoved!.ContainsKey(tagName)) _dbgTagRemoved[tagName] = new List<string>(); _dbgTagRemoved[tagName].Add(_itemLabel); }
                }
                if (!dryRun)
                {
                    if (shouldHave) item.AddTag(tagName); else item.RemoveTag(tagName);
                    try { _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not save tags for '{item.Name}': {ex.Message}"); }
                    if (++updateCount % 25 == 0) await Task.Yield();
                }
                if (shouldHave) tagsAdded++; else tagsRemoved++;
            }

            // Episode cleanup: remove stale tags from episodes; also tag matching episodes when episode-level targeting is active
            {
                var (tEpClean, _, _) = EffectiveTagTargets(tagConfig);
                bool targetsEpisodes = tagConfig.EnableTag && !tagConfig.OnlyCollection && !_isBoxSetHse && tEpClean &&
                    (tagConfig.SourceType != "MediaInfo" || TagConfigTargetsEpisodes(tagConfig));
                var matchedEpisodeIds = new HashSet<Guid>();
                var allEpisodeItemsMap = new Dictionary<Guid, BaseItem>();
                if (targetsEpisodes)
                {
                    if (tagConfig.SourceType == "MediaInfo" && TagConfigTargetsEpisodes(tagConfig))
                    {
                        foreach (var ep in _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Recursive = true, IsVirtualItem = false }))
                        {
                            if (ep.LocationType != LocationType.FileSystem) continue;
                            if (ItemMatchesMediaInfo(ep, tagConfig, debug, seriesEpisodeCache, personCache, userDataCache, null, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache))
                            {
                                matchedEpisodeIds.Add(ep.Id);
                                allEpisodeItemsMap.TryAdd(ep.Id, ep);
                            }
                        }
                    }
                    else
                    {
                        // Non-MediaInfo: episodes were already resolved into tagOutputItems
                        foreach (var ep in tagOutputItems.Where(i => i.GetType().Name.Contains("Episode")))
                        {
                            matchedEpisodeIds.Add(ep.Id);
                            allEpisodeItemsMap.TryAdd(ep.Id, ep);
                        }
                    }
                }
                foreach (var ep in _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Tags = new[] { tagName }, Recursive = true, IsVirtualItem = false }))
                    allEpisodeItemsMap.TryAdd(ep.Id, ep);
                foreach (var ep in allEpisodeItemsMap.Values)
                {
                    bool shouldHaveEp = tagConfig.EnableTag && !tagConfig.OnlyCollection && matchedEpisodeIds.Contains(ep.Id);
                    bool hasTagEp = new HashSet<string>(ep.Tags, StringComparer.OrdinalIgnoreCase).Contains(tagName);
                    if (shouldHaveEp == hasTagEp) continue;
                    if (debug)
                    {
                        var _epYr = ep.ProductionYear.HasValue ? $" ({ep.ProductionYear})" : "";
                        string _epLabel = $"{ep.Name}{_epYr}  [Episode]";
                        if (shouldHaveEp) { if (!_dbgTagAdded!.ContainsKey(tagName)) _dbgTagAdded[tagName] = new List<string>(); _dbgTagAdded[tagName].Add(_epLabel); }
                        else { if (!_dbgTagRemoved!.ContainsKey(tagName)) _dbgTagRemoved[tagName] = new List<string>(); _dbgTagRemoved[tagName].Add(_epLabel); }
                    }
                    if (!dryRun)
                    {
                        if (shouldHaveEp) ep.AddTag(tagName); else ep.RemoveTag(tagName);
                        try { _libraryManager.UpdateItem(ep, ep.Parent, ItemUpdateType.MetadataEdit, null); }
                        catch (Exception ex) { _log.Warn($"Could not save tags for episode '{ep.Name}': {ex.Message}"); }
                        if (++updateCount % 25 == 0) await Task.Yield();
                    }
                    if (shouldHaveEp) tagsAdded++; else tagsRemoved++;
                }
            }

            // Season cleanup: remove stale tags from seasons; also tag matching seasons when season-level targeting is active
            {
                var (_, tSeaClean, _) = EffectiveTagTargets(tagConfig);
                bool targetsSeason = tagConfig.EnableTag && !tagConfig.OnlyCollection && !_isBoxSetHse &&
                    ((tagConfig.SourceType == "MediaInfo" && TagConfigTargetsSeason(tagConfig)) ||
                     (tagConfig.SourceType != "MediaInfo" && tSeaClean));
                var matchedSeasonIds = new HashSet<Guid>();
                var allSeasonItemsMap = new Dictionary<Guid, BaseItem>();
                if (targetsSeason)
                {
                    if (tagConfig.SourceType == "MediaInfo")
                    {
                        var matchingEpisodes = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Recursive = true, IsVirtualItem = false })
                            .Where(ep => ep.LocationType == LocationType.FileSystem
                                      && ItemMatchesMediaInfo(ep, tagConfig, debug, seriesEpisodeCache, personCache, userDataCache, null, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache))
                            .ToList();
                        foreach (var season in ResolveParentSeasons(matchingEpisodes))
                        {
                            matchedSeasonIds.Add(season.Id);
                            allSeasonItemsMap.TryAdd(season.Id, season);
                        }
                    }
                    else
                    {
                        // Non-MediaInfo: seasons were already resolved into tagOutputItems
                        foreach (var season in tagOutputItems.Where(i => i.GetType().Name.Contains("Season")))
                        {
                            matchedSeasonIds.Add(season.Id);
                            allSeasonItemsMap.TryAdd(season.Id, season);
                        }
                    }
                }
                foreach (var s in _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Season" }, Tags = new[] { tagName }, Recursive = true, IsVirtualItem = false }))
                    allSeasonItemsMap.TryAdd(s.Id, s);
                foreach (var season in allSeasonItemsMap.Values)
                {
                    bool shouldHaveSeason = tagConfig.EnableTag && !tagConfig.OnlyCollection && matchedSeasonIds.Contains(season.Id);
                    bool hasTagSeason = new HashSet<string>(season.Tags, StringComparer.OrdinalIgnoreCase).Contains(tagName);
                    if (shouldHaveSeason == hasTagSeason) continue;
                    if (debug)
                    {
                        var _sYr = season.ProductionYear.HasValue ? $" ({season.ProductionYear})" : "";
                        string _sLabel = $"{season.Name}{_sYr}  [Season]";
                        if (shouldHaveSeason) { if (!_dbgTagAdded!.ContainsKey(tagName)) _dbgTagAdded[tagName] = new List<string>(); _dbgTagAdded[tagName].Add(_sLabel); }
                        else { if (!_dbgTagRemoved!.ContainsKey(tagName)) _dbgTagRemoved[tagName] = new List<string>(); _dbgTagRemoved[tagName].Add(_sLabel); }
                    }
                    if (!dryRun)
                    {
                        if (shouldHaveSeason) season.AddTag(tagName); else season.RemoveTag(tagName);
                        try { _libraryManager.UpdateItem(season, season.Parent, ItemUpdateType.MetadataEdit, null); }
                        catch (Exception ex) { _log.Warn($"Could not save tags for season '{season.Name}': {ex.Message}"); }
                        if (++updateCount % 25 == 0) await Task.Yield();
                    }
                    if (shouldHaveSeason) tagsAdded++; else tagsRemoved++;
                }
            }

            WriteTagDiffDebug(_dbgTagAdded, _dbgTagRemoved);
            if (gs.EnableTag && !gs.BoxSetHse)
                _log.Info(tagsAdded == 0 && tagsRemoved == 0
                    ? $"    No tag changes needed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}"
                    : dryRun
                        ? $"    Would add {tagsAdded} and remove {tagsRemoved} tags"
                        : $"    +{tagsAdded} added, -{tagsRemoved} removed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
            else if (gs.BoxSetHse)
                _log.Skip("The tag is applied to the collection itself, not to its items (see results)");
            else
                _log.Skip("Tagging is not enabled for this group");

            // Apply collection (scoped to this entry's collection only)
            int collResult = 0;
            bool _collCreated = false;
            int _collItemsAdded = 0, _collItemsRemoved = 0;
            if (tagConfig.EnableCollection)
            {
                _log.Blank();
                _log.Info("» Collections");
                phaseTimer.Restart();
                if (dryRun) _log.Skip("Dry run — collections are not changed");
                else if (collectionOutputItems.Count == 0) _log.Skip($"Collection \"{cName}\" left unchanged — no items matched");
            }
            if (tagConfig.EnableCollection && collectionOutputItems.Count > 0 && !dryRun)
            {
                try
                {
                    var desiredIds = collectionOutputItems.Select(i => i.InternalId).ToHashSet();
                    var existingColl = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "BoxSet" }, Name = cName, Recursive = true }).FirstOrDefault();
                    if (existingColl == null)
                    {
                        await _collectionManager.CreateCollection(new CollectionCreationOptions { Name = cName, IsLocked = false, ItemIdList = desiredIds.ToArray() });
                        collResult = 1;
                        _collCreated = true;
                        _collItemsAdded = desiredIds.Count;
                        _log.Debug($"  {cName}  →  created ({desiredIds.Count} items)");
                    }
                    else
                    {
                        var currentMembers = _libraryManager.GetItemList(new InternalItemsQuery { CollectionIds = new[] { existingColl.InternalId }, Recursive = true, IsVirtualItem = false }).Select(i => i.InternalId).ToHashSet();
                        var toAdd = desiredIds.Where(id => !currentMembers.Contains(id)).ToList();
                        var toRemove = currentMembers.Where(id => !desiredIds.Contains(id)).ToList();
                        if (toAdd.Count > 0) await _collectionManager.AddToCollection(existingColl.InternalId, toAdd.ToArray());
                        if (toRemove.Count > 0 && existingColl is BoxSet boxSet) _collectionManager.RemoveFromCollection(boxSet, toRemove.ToArray());
                        collResult = toAdd.Count + toRemove.Count;
                        _collItemsAdded = toAdd.Count;
                        _collItemsRemoved = toRemove.Count;
                        if (debug)
                        {
                            _log.Debug(collResult == 0
                                ? $"  {cName}  →  up to date ({currentMembers.Count} items)"
                                : $"  {cName}  →  updated (+{toAdd.Count}, -{toRemove.Count})");
                            var _collMap = allItems.ToDictionary(i => i.InternalId, i => i.Name + (i.ProductionYear.HasValue ? $" ({i.ProductionYear})" : ""));
                            string CollLabel(long id) => _collMap.TryGetValue(id, out var _cn) ? _cn : id.ToString();
                            foreach (var id in toAdd) _log.Debug($"    + {CollLabel(id)}");
                            foreach (var id in toRemove) _log.Debug($"    - {CollLabel(id)}");
                        }
                    }
                    gs.CollectionCreated = _collCreated;
                    gs.CollectionItemsAdded = _collItemsAdded;
                    gs.CollectionItemsRemoved = _collItemsRemoved;
                    _log.Info(_collCreated
                        ? $"    Collection \"{cName}\" created with {RunLog.Plural(_collItemsAdded, "item")}  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}"
                        : collResult == 0
                            ? $"    Collection \"{cName}\" is up to date  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}"
                            : $"    Collection \"{cName}\" updated (+{_collItemsAdded}, -{_collItemsRemoved})  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
                }
                catch (Exception ex)
                {
                    _log.Error($"Collection \"{cName}\" could not be updated: {ex.Message}");
                    WriteExceptionDebug(ex);
                    gs.Warnings.Add($"Collection could not be updated: {ex.Message}");
                    gs.TagsAdded = tagsAdded; gs.TagsRemoved = tagsRemoved;
                    WriteSingleRunFooter(gs, startTime, dryRun, logMissing);
                    return (true, $"{matchedLocalItems.Count} matched, {tagsAdded}↑ {tagsRemoved}↓ tags — collection error: {ex.Message}");
                }
            }

            if (tagConfig.EnablePlaylist)
            {
                _log.Blank();
                _log.Info("» Playlists");
                if (dryRun) _log.Skip("Dry run — playlists are not changed");
                else if (viewerOnlyMediaInfo) _log.Skip("Filter is viewer-dependent only — playlists cannot be per-user and were left unchanged");
            }
            if (!viewerOnlyMediaInfo)
                await SyncPlaylistsForEntryAsync(tagConfig, collectionOutputItems, dryRun, gs);

            if (!dryRun)
            {
                TagCacheManager.Instance.Save();
                // Add this tag to the history file so a future full run can clean it up
                // if the group is later deleted or disabled.
                if (!string.IsNullOrEmpty(tagName))
                {
                    var _hist = LoadFileHistory("homescreencompanion_history.txt");
                    if (!_hist.Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase)))
                    {
                        _hist.Add(tagName);
                        SaveFileHistory("homescreencompanion_history.txt", _hist);
                    }
                }

                Plugin.Instance.SaveConfiguration();
            }

            var _boxSetFound = ApplyTagToSourceBoxSet(tagConfig, tagName, dryRun, cancellationToken);

            // For BoxSet HSE groups, also tag the group's other flat entries (one per local source)
            // so the count matches the full-run behaviour.
            int _boxSetTaggedCount = _boxSetFound ? 1 : 0;
            if (_isBoxSetHse)
            {
                foreach (var sib in groupEntries.Where(t => t != tagConfig && IsBoxSetHomeSectionEntry(t)))
                    if (ApplyTagToSourceBoxSet(sib, tagName, dryRun, cancellationToken))
                        _boxSetTaggedCount++;
            }

            tagsRemoved += CleanupBoxSetTags(config, dryRun, cancellationToken);
            gs.BoxSetFound = _boxSetFound;
            gs.BoxSetTaggedCount = _boxSetTaggedCount;
            gs.TagsAdded = tagsAdded;
            gs.TagsRemoved = tagsRemoved;
            if (_isBoxSetHse && !_boxSetFound)
                gs.Warnings.Add($"Collection '{tagConfig.LocalSourceId}' was not found in the library");

            // Manage home sections for this entry
            if (tagConfig.EnableHomeSection)
            {
                _log.Blank();
                _log.Info("» Home sections");
                if (dryRun) _log.Skip("Dry run — home sections are not changed");
            }
            if (!dryRun && tagConfig.EnableHomeSection)
                ManageHomeSections(config, cancellationToken, debug, new List<GroupRunStats> { gs }, tagName);
            CleanupDisabledPlaylists(config, dryRun);
            SyncTopListFolders(config, dryRun);

            WriteSingleRunFooter(gs, startTime, dryRun, logMissing);

            var summary = BuildSingleEntrySummary(_isBoxSetHse, _boxSetTaggedCount, matchedLocalItems.Count, tagsAdded, tagsRemoved, collResult, dryRun);
            return (true, summary);
        }

        // Build the short "N matched, K collections..." return value of a single-group run.
        // Extracted from RunSingleEntryInternalAsync per REFACTOR_MAP.md §B.3.
        private static string BuildSingleEntrySummary(bool isBoxSetHse, int boxSetTaggedCount, int matchedCount, int tagsAdded, int tagsRemoved, int collResult, bool dryRun)
        {
            List<string> parts;
            if (isBoxSetHse)
            {
                parts = new List<string> { $"{boxSetTaggedCount} collection{(boxSetTaggedCount == 1 ? "" : "s")} tagged" };
            }
            else
            {
                parts = new List<string> { $"{matchedCount} matched" };
                if (tagsAdded > 0 || tagsRemoved > 0) parts.Add($"{tagsAdded}↑ {tagsRemoved}↓ tags");
            }
            if (collResult > 0) parts.Add("collection updated");
            if (dryRun) parts.Add("(dry run)");
            return string.Join(", ", parts);
        }

        // Identifies the UI group a flat TagConfig belongs to. The config page stores one flat entry
        // per URL / local source with the same Name + Tag, so several entries can share one key.
        private static string GroupKey(TagConfig t) =>
            (t.Name ?? "").Trim() + "\x1F" + (t.Tag ?? "").Trim();

        // Writes tag_ranks/<tag>.json — the IMDb ids of a tag's matched items in source order,
        // used by SyncTopListFolders to number .strm files.
        private void WriteRankFile(string tagName, List<string> imdbIds)
        {
            try
            {
                var rankDir = Path.Combine(Plugin.Instance.DataFolderPath, "tag_ranks");
                Directory.CreateDirectory(rankDir);
                var invalidChars = Path.GetInvalidFileNameChars();
                var rankSafe = new string((tagName ?? "unknown").Select(c => Array.IndexOf(invalidChars, c) >= 0 ? '_' : c).ToArray()).Trim('.');
                if (string.IsNullOrWhiteSpace(rankSafe)) rankSafe = "unknown";
                var rankFile = Path.Combine(rankDir, rankSafe + ".json");
                _jsonSerializer.SerializeToFile(imdbIds, rankFile);
            }
            catch { }
        }


































































        private bool IsBoxSetHomeSectionEntry(TagConfig tc)
        {
            if (!tc.EnableHomeSection || tc.SourceType != "LocalCollection" || string.IsNullOrEmpty(tc.LocalSourceId)) return false;
            var sd = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            try { sd = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tc.HomeSectionSettings ?? "{}") ?? sd; } catch { return false; }
            if (!sd.TryGetValue("ItemTypes", out var itJson) || string.IsNullOrEmpty(itJson)) return false;
            string[] it;
            try { it = _jsonSerializer.DeserializeFromString<string[]>(itJson) ?? Array.Empty<string>(); }
            catch { it = itJson.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray(); }
            return it.Any(t => string.Equals(t, "BoxSet", StringComparison.OrdinalIgnoreCase));
        }

        private bool ApplyTagToSourceBoxSet(TagConfig tc, string tagName, bool dryRun, CancellationToken cancellationToken)
        {
            // Only ADDS the tag to the target BoxSet. Removal of stale tags is handled by CleanupBoxSetTags
            // after all entries have run, so multiple entries sharing the same tag don't undo each other.
            if (!IsBoxSetHomeSectionEntry(tc) || string.IsNullOrEmpty(tagName)) return false;

            var allBoxSets = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "BoxSet" }, Recursive = true });
            var target = allBoxSets.FirstOrDefault(b => string.Equals(b.Name, tc.LocalSourceId, StringComparison.OrdinalIgnoreCase));
            if (target == null) { _log.Debug($"  Collection '{tc.LocalSourceId}' not found in library — cannot tag it"); return false; }

            var hasTag = (target.Tags ?? Array.Empty<string>()).Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
            if (!hasTag)
            {
                target.AddTag(tagName);
                if (!dryRun)
                {
                    try { _libraryManager.UpdateItem(target, target.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not save tag on collection '{target.Name}': {ex.Message}"); }
                }
                _log.Debug($"  Collection '{target.Name}' {(dryRun ? "would be tagged" : "tagged")} with '{tagName}'");
            }
            else
            {
                _log.Debug($"  Collection '{target.Name}' already has tag '{tagName}'");
            }
            return true;
        }








        internal static int UpdateUntrackedSections(
            IJsonSerializer jsonSerializer,
            IUserManager userManager,
            PluginConfiguration config,
            IEnumerable<string> libraryIdsToExclude,
            CancellationToken cancellationToken)
        {
            var allTrackedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var tag in config.Tags ?? new List<TagConfig>())
                foreach (var tr in tag.HomeSectionTracked ?? new List<HomeSectionTracking>())
                    if (!string.IsNullOrEmpty(tr.SectionId)) allTrackedIds.Add(tr.SectionId);
            foreach (var topList in config.TopLists ?? new List<TopListHomeSection>())
                foreach (var tr in topList.HomeSectionTracked ?? new List<HomeSectionTracking>())
                    if (!string.IsNullOrEmpty(tr.SectionId)) allTrackedIds.Add(tr.SectionId);

            var managedUserIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var tag in config.Tags ?? new List<TagConfig>())
                foreach (var uid in tag.HomeSectionUserIds ?? new List<string>())
                    managedUserIds.Add(uid);
            foreach (var topList in config.TopLists ?? new List<TopListHomeSection>())
                foreach (var uid in topList.HomeSectionUserIds ?? new List<string>())
                    managedUserIds.Add(uid);

            var libIds = libraryIdsToExclude
                .Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0)
                .Distinct().ToList();
            if (libIds.Count == 0) return 0;

            var parentIdProp = typeof(ContentSection).GetProperty("ParentId");
            var exFoldersProp = typeof(ContentSection).GetProperty("ExcludedFolders");
            var queryPropInfo = typeof(ContentSection).GetProperty("Query");
            int updated = 0;

            foreach (var userId in managedUserIds)
            {
                try
                {
                    var uid = userManager.GetInternalId(userId);
                    var allSecs = userManager.GetHomeSections(uid, cancellationToken)?.Sections
                        ?? Array.Empty<ContentSection>();

                    foreach (var sec in allSecs)
                    {
                        if (string.IsNullOrEmpty(sec.Id)) continue;
                        if (allTrackedIds.Contains(sec.Id)) continue;

                        // Skip library-scoped sections — they already filter to one library
                        var parentId = parentIdProp?.GetValue(sec) as string;
                        if (!string.IsNullOrEmpty(parentId)) continue;

                        // Collect current exclusions from ExcludedFolders and Query.ExcludeUserViewIds
                        var existingExcluded = ((exFoldersProp?.GetValue(sec) as string[]) ?? Array.Empty<string>())
                            .Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0).ToList();
                        try
                        {
                            var query = queryPropInfo?.GetValue(sec);
                            if (query != null)
                            {
                                var excProp = query.GetType().GetProperty("ExcludeUserViewIds");
                                var viewIds = excProp?.GetValue(query) as string[];
                                if (viewIds != null)
                                    existingExcluded.AddRange(
                                        viewIds.Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0));
                            }
                        }
                        catch { }

                        existingExcluded = existingExcluded.Distinct().ToList();
                        var missing = libIds
                            .Where(id => !existingExcluded.Contains(id, StringComparer.OrdinalIgnoreCase))
                            .ToList();
                        if (missing.Count == 0) continue;

                        existingExcluded.AddRange(missing);
                        var newExcluded = existingExcluded.ToArray();

                        exFoldersProp?.SetValue(sec, newExcluded);
                        try
                        {
                            var query = queryPropInfo?.GetValue(sec);
                            if (query != null)
                            {
                                var excViewProp = query.GetType().GetProperty("ExcludeUserViewIds");
                                if (excViewProp?.CanWrite == true)
                                {
                                    if (excViewProp.PropertyType == typeof(string[]))
                                        excViewProp.SetValue(query, newExcluded);
                                    else if (excViewProp.PropertyType == typeof(Guid[]))
                                        excViewProp.SetValue(query, newExcluded
                                            .Select(id => Guid.TryParse(id, out var g) ? g : Guid.Empty).ToArray());
                                }
                            }
                        }
                        catch { }
                        userManager.UpdateHomeSection(uid, sec, cancellationToken);
                        updated++;
                    }
                }
                catch { }
            }
            return updated;
        }

















        private bool IsScheduleActive(List<DateInterval> intervals)
        {
            if (intervals == null || intervals.Count == 0) return true;
            var now = DateTime.Now;
            foreach (var interval in intervals)
            {
                bool match = false;
                if (interval.Type == "Weekly") { if (!string.IsNullOrEmpty(interval.DayOfWeek) && interval.DayOfWeek.IndexOf(now.DayOfWeek.ToString(), StringComparison.OrdinalIgnoreCase) >= 0) match = true; }
                else if (interval.Type == "EveryYear") { if (interval.Start.HasValue && interval.End.HasValue) { var sDay = Math.Min(interval.Start.Value.Day, DateTime.DaysInMonth(now.Year, interval.Start.Value.Month)); var eDay = Math.Min(interval.End.Value.Day, DateTime.DaysInMonth(now.Year, interval.End.Value.Month)); var s = new DateTime(now.Year, interval.Start.Value.Month, sDay); var e = new DateTime(now.Year, interval.End.Value.Month, eDay); if (e < s) e = e.AddYears(1); if (now.Date >= s.Date && now.Date <= e.Date) match = true; } }
                else { if ((!interval.Start.HasValue || now.Date >= interval.Start.Value.Date) && (!interval.End.HasValue || now.Date <= interval.End.Value.Date)) match = true; }
                if (match) return true;
            }
            return false;
        }






























        internal static void ApplyViewerCriteriaToSectionSettings(TagConfig tagConfig, Dictionary<string, string> settingsDict)
        {
            CriterionCatalog.ApplySectionQuery(GetAllCriteria(tagConfig), settingsDict);
        }


        private static (bool ep, bool sea, bool ser) EffectiveTagTargets(TagConfig tc)
        {
            if (tc.TagTargetEpisode || tc.TagTargetSeason || tc.TagTargetSeries)
                return (tc.TagTargetEpisode, tc.TagTargetSeason, tc.TagTargetSeries);
            if (tc.MediaInfoTargetEpisode || tc.MediaInfoTargetSeason || tc.MediaInfoTargetSeries)
                return (tc.MediaInfoTargetEpisode, tc.MediaInfoTargetSeason, tc.MediaInfoTargetSeries);
            var leg = EffectiveLegacyTargetType(tc);
            return (leg == "Episode", leg == "Season", leg == "Series");
        }

        private static (bool ep, bool sea, bool ser) EffectiveCollectionTargets(TagConfig tc)
        {
            if (tc.CollectionTargetEpisode || tc.CollectionTargetSeason || tc.CollectionTargetSeries)
                return (tc.CollectionTargetEpisode, tc.CollectionTargetSeason, tc.CollectionTargetSeries);
            if (tc.MediaInfoTargetEpisode || tc.MediaInfoTargetSeason || tc.MediaInfoTargetSeries)
                return (tc.MediaInfoTargetEpisode, tc.MediaInfoTargetSeason, tc.MediaInfoTargetSeries);
            var leg = EffectiveLegacyTargetType(tc);
            return (leg == "Episode", leg == "Season", leg == "Series");
        }

        private static bool TagConfigTargetsEpisodes(TagConfig tagConfig) =>
            GetAllCriteria(tagConfig).Any(c =>
                c.TrimStart('!').StartsWith("MediaType:Episode", StringComparison.OrdinalIgnoreCase));

        private static bool ConfigNeedsMusicItems(PluginConfiguration config) =>
            config.Tags.Any(t => t.Active && t.SourceType == "MediaInfo"
                && GetAllCriteria(t).Any(c =>
                {
                    var s = c.TrimStart('!');
                    return s.StartsWith("MediaType:Audio", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("MediaType:MusicVideo", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("MediaType:MusicAlbum", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("MediaType:MusicArtist", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("Artist:", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("Album:", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("BitRate:", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("SampleRate:", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("BitsPerSample:", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("TrackNumber:", StringComparison.OrdinalIgnoreCase)
                        || s.StartsWith("DiscNumber:", StringComparison.OrdinalIgnoreCase);
                }));

        private static string[] BuildItemTypes(PluginConfiguration config)
        {
            var types = new List<string> { "Movie", "Series" };
            if (ConfigNeedsMusicItems(config))
                types.AddRange(new[] { "Audio", "MusicVideo", "MusicAlbum", "MusicArtist" });
            return types.ToArray();
        }

        private static bool IsTaggableTopLevelItem(BaseItem item)
        {
            var name = item.GetType().Name;
            return name.Contains("Movie") || name.Contains("Series")
                || name.Contains("MusicAlbum") || name.Contains("MusicArtist")
                || name.Contains("MusicVideo") || name.Contains("Audio");
        }





        private static bool TagConfigTargetsSeason(TagConfig tagConfig)
        {
            var (_, tSea, _) = EffectiveTagTargets(tagConfig);
            var (_, cSea, _) = EffectiveCollectionTargets(tagConfig);
            return tSea || cSea;
        }

        private List<BaseItem> ResolveParentSeasons(IEnumerable<BaseItem> matchedEpisodes)
        {
            var seasonIds = new HashSet<long>();
            var seasons = new List<BaseItem>();
            foreach (var ep in matchedEpisodes)
            {
                var parent = ep.Parent;
                if (parent != null && parent.GetType().Name.Contains("Season"))
                {
                    if (seasonIds.Add(parent.InternalId))
                        seasons.Add(parent);
                }
            }
            return seasons;
        }

        private List<BaseItem> ResolveParentSeries(IEnumerable<BaseItem> matchedEpisodes)
        {
            var seriesIds = new HashSet<long>();
            var seriesList = new List<BaseItem>();
            foreach (var ep in matchedEpisodes)
            {
                BaseItem? seriesItem = null;
                var parent = ep.Parent;
                if (parent != null)
                {
                    if (parent.GetType().Name.Contains("Series"))
                        seriesItem = parent;
                    else if (parent.GetType().Name.Contains("Season") && parent.Parent != null && parent.Parent.GetType().Name.Contains("Series"))
                        seriesItem = parent.Parent;
                }
                if (seriesItem != null && seriesIds.Add(seriesItem.InternalId))
                    seriesList.Add(seriesItem);
            }
            return seriesList;
        }

        private List<BaseItem> ResolveChildSeasons(IEnumerable<BaseItem> matchedSeries)
        {
            var seriesIds = new HashSet<long>(matchedSeries
                .Where(i => i.GetType().Name.Contains("Series"))
                .Select(i => i.InternalId));
            if (seriesIds.Count == 0) return new List<BaseItem>();

            var seasonIds = new HashSet<long>();
            var seasons = new List<BaseItem>();
            var allSeasons = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { "Season" },
                Recursive = true,
                IsVirtualItem = false
            });
            foreach (var s in allSeasons)
            {
                var parentId = s.Parent?.InternalId ?? 0;
                if (parentId != 0 && seriesIds.Contains(parentId) && seasonIds.Add(s.InternalId))
                    seasons.Add(s);
            }
            return seasons;
        }

        private List<BaseItem> ResolveChildEpisodes(IEnumerable<BaseItem> matchedSeries)
        {
            var seriesIds = new HashSet<long>(matchedSeries
                .Where(i => i.GetType().Name.Contains("Series"))
                .Select(i => i.InternalId));
            if (seriesIds.Count == 0) return new List<BaseItem>();

            var episodeIds = new HashSet<long>();
            var episodes = new List<BaseItem>();
            var allEpisodes = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { "Episode" },
                Recursive = true,
                IsVirtualItem = false
            });
            foreach (var ep in allEpisodes)
            {
                var seriesId = ep.Parent?.Parent?.InternalId ?? 0;
                if (seriesId != 0 && seriesIds.Contains(seriesId) && episodeIds.Add(ep.InternalId))
                    episodes.Add(ep);
            }
            return episodes;
        }

        private static string? ExtractTitleContains(TagConfig tagConfig)
        {
            foreach (var c in GetAllCriteria(tagConfig))
            {
                var s = c.TrimStart('!');
                if (s.StartsWith("Title:", StringComparison.OrdinalIgnoreCase))
                {
                    var val = s.Substring("Title:".Length).Trim();
                    if (!string.IsNullOrEmpty(val)) return val;
                }
            }
            return null;
        }

























        private void HsWarn(List<GroupRunStats>? statsList, string tagName, string displayName, string message)
        {
            _log.Warn($"{displayName}: {message}");
            var gs = statsList?.FirstOrDefault(s => s.TagName != null && string.Equals(s.TagName, tagName, StringComparison.OrdinalIgnoreCase));
            gs?.Warnings.Add("Home section: " + message);
        }














        private void ApplyCollectionMeta(BaseItem item, string cName,
            Dictionary<string, string> descriptions, Dictionary<string, string> posters, bool debug)
        {
            bool metaChanged = false;

            if (descriptions.TryGetValue(cName, out var desc) && !string.IsNullOrWhiteSpace(desc))
            {
                item.Overview = desc;
                metaChanged = true;
            }

            if (posters.TryGetValue(cName, out var posterPath) && File.Exists(posterPath))
            {
                var imageInfo = new ItemImageInfo
                {
                    Path = posterPath,
                    Type = ImageType.Primary,
                    DateModified = File.GetLastWriteTimeUtc(posterPath)
                };
                var otherImages = (item.ImageInfos ?? Array.Empty<ItemImageInfo>())
                    .Where(i => i.Type != ImageType.Primary).ToList();
                otherImages.Add(imageInfo);
                item.ImageInfos = otherImages.ToArray();
                _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.ImageUpdate, null);
                _log.Debug($"  {cName}  →  poster applied");
            }

            if (metaChanged)
                _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null);
        }

        // ───────────────────────── Phase helpers (decomposition) ─────────────────────────
        // These methods are extracted from the body of Execute / RunSingleEntryInternalAsync
        // per REFACTOR_MAP.md §B.3. They live in the main partial because they share state
        // (instance fields, large local-variable closures) with both big methods.
        // Each is a thin orchestration helper — the heavy lifting is in the per-feature
        // partial methods (Tagging/, Collections/, etc.).

        private void WriteResultsBlock(List<GroupRunStats> displayStatsList, bool dryRun, bool logMissing)
        {
            _log.Blank();
            _log.Info("Results");
            foreach (var gs in displayStatsList)
                WriteGroupBlock(gs, dryRun, logMissing);
        }

        // ───────────────────────── Moved-to-partial method index ─────────────────────────
        // Methods moved to per-feature partials (see REFACTOR_MAP.md §B.3):
        //
        // Diagnostics/HomeScreenCompanionTask.cs:
        //   DescribeSource, DescribeSourceDetail, WriteFetchLine, DescribeSourceCounts,
        //   WriteGroupBlock, WriteSingleRunFooter, BuildFinalStatus, StatusSymbol,
        //   WriteMatchedItemsDebug, WriteExceptionDebug, BuildRecentlyWatchedContext
        //
        // Tagging/HomeScreenCompanionTask.cs:
        //   WriteTagDiffDebug, FindByTitleAndYear, LoadFileHistory, SaveFileHistory
        //
        // Collections/HomeScreenCompanionTask.cs:
        //   CleanupBoxSetTags
        //
        // TopLists/HomeScreenCompanionTask.cs:
        //   SyncTopListFolders, SanitizeTopListFolderName
        //
        // Playlists/HomeScreenCompanionTask.cs:
        //   SyncPlaylistsForEntryAsync, CleanupDisabledPlaylists
        //
        // HomeSections/HomeScreenCompanionTask.cs:
        //   ManageHomeSections, DeleteSectionForUser (BuildContentSection + ExtendedItemsQuery also)
        //
        // MediaInfo/HomeScreenCompanionTask.cs:
        //   ResolveItemForMediaInfo, GetSeriesLastPlayed, ExtractMediaInfo, ItemMatchesMediaInfo,
        //   EvaluateCriterion, MatchesAny, SplitCommaValues, MatchesImdbId, MatchesPerson,
        //   GetTitleName, GetAllCriteria, IsViewerDependentCriterion, HasViewerCriteria,
        //   IsViewerOnlyMediaInfoFilter, EffectiveLegacyTargetType, MatchesArtistOrAlbumArtist,
        //   MatchesAlbumTitle, CountWatchedByUsers, TagConfigIncludesParentSeries, MatchesEpisodeTitle,
        //   ApplyNumericOp, TryGetDateModified, TryGetFileSize
        //
        // Cross-cutting methods kept here (used by both Execute and RunSingleEntryInternalAsync):
        //   GroupKey, WriteRankFile, IsBoxSetHomeSectionEntry, ApplyTagToSourceBoxSet,
        //   UpdateUntrackedSections, IsScheduleActive, ApplyViewerCriteriaToSectionSettings,
        //   EffectiveTagTargets, EffectiveCollectionTargets, TagConfigTargetsEpisodes,
        //   ConfigNeedsMusicItems, BuildItemTypes, IsTaggableTopLevelItem,
        //   TagConfigTargetsSeason, ResolveParentSeasons, ResolveParentSeries,
        //   ResolveChildSeasons, ResolveChildEpisodes, ExtractTitleContains, HsWarn, ApplyCollectionMeta

    }
}
