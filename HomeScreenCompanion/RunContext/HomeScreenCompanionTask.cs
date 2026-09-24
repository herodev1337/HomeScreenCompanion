// Auto-generated partial file — see .planning/codebase/REFACTOR_MAP.md §B.3
using MediaBrowser.Controller.Entities;
using System;
using System.Collections.Generic;
using System.Diagnostics;

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
    }
}
