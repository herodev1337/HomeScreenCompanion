using System;
using System.Collections.Generic;
using System.Linq;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Maps between <see cref="TagRuleEditUI"/> and <see cref="TagConfig"/>.
    /// Used by <see cref="TagRowEditDialog"/> to hydrate the edit model
    /// from an existing rule on open and to write changes back on save.
    /// </summary>
    public static class TagRuleConfigMapper
    {
        public static void HydrateFrom(TagRuleEditUI ui, TagConfig config)
        {
            if (ui == null || config == null) return;

            ui.Name = config.Name ?? "";
            ui.Tag = config.Tag ?? "";
            ui.Active = config.Active;
            ui.SourceType = string.IsNullOrEmpty(config.SourceType) ? "External" : config.SourceType;
            ui.Limit = config.Limit;
            ui.OverrideWhenActive = config.OverrideWhenActive;

            ui.AiProvider = string.IsNullOrEmpty(config.AiProvider) ? "OpenAI" : config.AiProvider;
            ui.AiPrompt = config.AiPrompt ?? "";
            ui.AiIncludeRecentlyWatched = config.AiIncludeRecentlyWatched;
            ui.AiRecentlyWatchedCount = config.AiRecentlyWatchedCount;
            ui.AiRefreshIntervalDays = config.AiRefreshIntervalDays;

            ui.LocalSourceId = config.LocalSourceId ?? "";

            ui.Sources = new SourceRowCollection();
            foreach (var u in config.LocalSources ?? new List<string>())
            {
                ui.Sources.Add(new SourceRowUI { Kind = "Local", Value = u });
            }
            if (!string.IsNullOrEmpty(config.Url))
            {
                ui.Sources.Add(new SourceRowUI { Kind = "Url", Value = config.Url });
            }

            ui.ActiveIntervals = new DateIntervalCollection();
            foreach (var di in config.ActiveIntervals ?? new List<DateInterval>())
            {
                ui.ActiveIntervals.Add(new DateIntervalUI
                {
                    Type = di.Type ?? "SpecificDate",
                    Start = di.Start,
                    End = di.End,
                    DayOfWeek = string.IsNullOrEmpty(di.DayOfWeek) ? "Friday" : di.DayOfWeek,
                });
            }

            ui.MediaInfoGroups = new MediaInfoGroupCollection();
            foreach (var f in config.MediaInfoFilters ?? new List<MediaInfoFilter>())
            {
                ui.MediaInfoGroups.Add(new MediaInfoGroupUI
                {
                    Operator = f.Operator ?? "AND",
                    Criteria = (f.Criteria ?? new List<string>()).Aggregate((a, b) => a + "\n" + b),
                    GroupOperator = f.GroupOperator ?? "AND",
                });
            }

            ui.TagTargetEpisode = config.TagTargetEpisode;
            ui.TagTargetSeason = config.TagTargetSeason;
            ui.TagTargetSeries = config.TagTargetSeries;

            ui.EnableCollection = config.EnableCollection;
            ui.CollectionName = config.CollectionName ?? "";
            ui.CollectionDescription = config.CollectionDescription ?? "";
            ui.CollectionPosterPath = config.CollectionPosterPath ?? "";

            ui.EnableHomeSection = config.EnableHomeSection;
            ui.HomeSectionLibraryId = string.IsNullOrEmpty(config.HomeSectionLibraryId) ? "auto" : config.HomeSectionLibraryId;
            ui.HomeSectionSettings = string.IsNullOrEmpty(config.HomeSectionSettings) ? "{}" : config.HomeSectionSettings;

            ui.EnablePlaylist = config.EnablePlaylist;
            ui.PlaylistName = config.PlaylistName ?? "";
        }

        public static void ApplyTo(TagRuleEditUI ui, TagConfig config)
        {
            if (ui == null || config == null) return;

            config.Name = ui.Name ?? "";
            config.Tag = ui.Tag ?? "";
            config.Active = ui.Active;
            config.SourceType = ui.SourceType ?? "External";
            config.Limit = ui.Limit;
            config.OverrideWhenActive = ui.OverrideWhenActive;

            config.AiProvider = ui.AiProvider ?? "OpenAI";
            config.AiPrompt = ui.AiPrompt ?? "";
            config.AiIncludeRecentlyWatched = ui.AiIncludeRecentlyWatched;
            config.AiRecentlyWatchedCount = ui.AiRecentlyWatchedCount;
            config.AiRefreshIntervalDays = ui.AiRefreshIntervalDays;

            config.LocalSourceId = ui.LocalSourceId ?? "";

            var urlSources = new List<string>();
            var localSources = new List<string>();
            string primaryUrl = "";
            foreach (var src in ui.Sources ?? new SourceRowCollection())
            {
                if (string.IsNullOrEmpty(src.Value)) continue;
                if (string.Equals(src.Kind, "Url", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrEmpty(primaryUrl)) primaryUrl = src.Value;
                    urlSources.Add(src.Value);
                }
                else
                {
                    localSources.Add(src.Value);
                }
            }
            config.Url = primaryUrl;
            config.LocalSources = localSources;

            var intervals = new List<DateInterval>();
            foreach (var di in ui.ActiveIntervals ?? new DateIntervalCollection())
            {
                intervals.Add(new DateInterval
                {
                    Type = di.Type ?? "SpecificDate",
                    Start = di.Start,
                    End = di.End,
                    DayOfWeek = di.DayOfWeek ?? "Friday",
                });
            }
            config.ActiveIntervals = intervals;

            var groups = new List<MediaInfoFilter>();
            foreach (var g in ui.MediaInfoGroups ?? new MediaInfoGroupCollection())
            {
                var criteria = (g.Criteria ?? "")
                    .Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(s => s.Trim())
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
                groups.Add(new MediaInfoFilter
                {
                    Operator = g.Operator ?? "AND",
                    Criteria = criteria,
                    GroupOperator = g.GroupOperator ?? "AND",
                });
            }
            config.MediaInfoFilters = groups;
            config.MediaInfoConditions = groups
                .SelectMany(g => g.Criteria)
                .ToList();

            config.TagTargetEpisode = ui.TagTargetEpisode;
            config.TagTargetSeason = ui.TagTargetSeason;
            config.TagTargetSeries = ui.TagTargetSeries;

            config.EnableCollection = ui.EnableCollection;
            config.CollectionName = ui.CollectionName ?? "";
            config.CollectionDescription = ui.CollectionDescription ?? "";
            config.CollectionPosterPath = ui.CollectionPosterPath ?? "";

            config.EnableHomeSection = ui.EnableHomeSection;
            config.HomeSectionLibraryId = ui.HomeSectionLibraryId ?? "auto";
            config.HomeSectionSettings = ui.HomeSectionSettings ?? "{}";

            config.EnablePlaylist = ui.EnablePlaylist;
            config.PlaylistName = ui.PlaylistName ?? "";
            config.EnableTag = ui.Active && !string.IsNullOrEmpty(ui.Tag);
        }
    }
}
