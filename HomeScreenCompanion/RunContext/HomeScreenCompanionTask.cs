// Auto-generated partial file — see .planning/codebase/REFACTOR_MAP.md §B.3
using MediaBrowser.Controller.Entities;
using MediaBrowser.Model.Entities;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        // Shared per-run state for Execute (full sync) and RunSingleEntryInternalAsync (single group).
        // Populated by BuildRunContext / BuildSingleEntryContext; phases take it as a parameter so
        // they no longer need closure-captured locals or instance fields.
        // Uses plain fields (no `required`) because the project targets netstandard2.0 where the
        // required-metadata runtime attribute is not available.
        private sealed class RunContext
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
        }

        // Builds the per-run context for RunSingleEntryInternalAsync (single group).
        // Returns false when validation fails or the group should be skipped — caller
        // inspects `isAiSkip` to decide whether to return (true, message) for the
        // intentional AI skip, or (false, message) for a hard failure.
        //
        // Validation failure messages are identical to the pre-refactor inline
        // messages (and set LastRunStatus + write the same _log lines) so external
        // behaviour is preserved bit-for-bit.
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

            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = BuildItemTypes(config),
                Recursive = true,
                IsVirtualItem = false
            }).ToList();

            int movieCount = allItems.Count(i => i.GetType().Name.Contains("Movie"));
            int seriesCount = allItems.Count(i => i.GetType().Name.Contains("Series"));

            _log.Rule();
            _log.Info($"Home Screen Companion v{Plugin.Instance?.Version}  ·  {startTime:yyyy-MM-dd HH:mm}  ·  Single group: {displayName}");
            if (dryRun) _log.Warn("DRY RUN — nothing will be changed, the log shows what would happen");
            _log.Info($"  Library: {movieCount:N0} movies, {seriesCount:N0} series");
            _log.Rule();

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
                MovieCount = movieCount,
                SeriesCount = seriesCount,
                StatsList = new List<GroupRunStats> { gs },
                StatsByGroupKey = new Dictionary<string, GroupRunStats>(StringComparer.OrdinalIgnoreCase) { [groupEntryKey] = gs },
                EntryConfig = tagConfig,
                GroupEntries = groupEntries
            };

            return true;
        }
    }
}
