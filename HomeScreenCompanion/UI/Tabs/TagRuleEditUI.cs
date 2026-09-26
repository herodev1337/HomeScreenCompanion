using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Rich edit model for a single tag rule. Used as the
    /// <see cref="IPluginUIView.ContentData"/> of the
    /// <c>TagRowEditDialog</c>. Mirrors the six sub-tabs of the old
    /// configPage.html row body (Sources / Schedule / MediaInfo /
    /// Collection / Home Section / Playlist) and adds AI-provider
    /// fields for the AI source type.
    ///
    /// Persistence lives in <see cref="TagConfig"/>; on Save the
    /// <c>TagRowEditDialog</c> writes its fields back into the
    /// corresponding <c>TagConfig</c> instance.
    /// </summary>
    public sealed class TagRuleEditUI : EditableOptionsBase
    {
        public override string EditorTitle => "Tag rule";

        public override string EditorDescription =>
            "Configure what this tag rule does, when it runs, and what side-effects it has.";

        // ─── Identity ───────────────────────────────────────────────────

        public SpacerItem SpacerIdentity { get; set; } = new SpacerItem();
        public CaptionItem IdentityCaption { get; set; } = new CaptionItem("Identity");

        [DisplayName("Name")]
        [Description("Internal name; must be unique across tag rules.")]
        public string Name { get; set; } = "";

        [DisplayName("Tag")]
        [Description("The tag string applied to matching items.")]
        public string Tag { get; set; } = "";

        [DisplayName("Active")]
        [Description("Master switch. When off, this rule is skipped entirely.")]
        public bool Active { get; set; } = true;

        [DisplayName("Source type")]
        [Description("What drives this rule.")]
        public string SourceType { get; set; } = "External";

        [DisplayName("Limit")]
        [Description("Maximum items considered per run.")]
        public int Limit { get; set; } = 50;

        [DisplayName("Override when active")]
        [Description("Force-apply this tag even if another rule would skip it.")]
        public bool OverrideWhenActive { get; set; } = false;

        // ─── Sources (External only) ───────────────────────────────────

        public SpacerItem SpacerSources { get; set; } = new SpacerItem();
        public CaptionItem SourcesCaption { get; set; } = new CaptionItem("Sources");

        [DisplayName("External sources")]
        [Description("URLs / library item ids that drive this rule.")]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "External")]
        public SourceRowCollection Sources { get; set; } = new SourceRowCollection();

        // ─── AI provider settings (AI source type only) ────────────────

        [DisplayName("AI provider")]
        [Description("Which LLM to query.")]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "AI")]
        public string AiProvider { get; set; } = "OpenAI";

        [DisplayName("AI prompt")]
        [Description("Prompt sent to the provider. Leave blank to use the default system prompt.")]
        [EditMultiline(4)]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "AI")]
        public string AiPrompt { get; set; } = "";

        [DisplayName("Include recently watched")]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "AI")]
        public bool AiIncludeRecentlyWatched { get; set; } = false;

        [DisplayName("Recently watched count")]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "AI")]
        public int AiRecentlyWatchedCount { get; set; } = 20;

        [DisplayName("Refresh interval (days)")]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "AI")]
        public int AiRefreshIntervalDays { get; set; } = 0;

        // ─── Local source (MediaInfo / Collection / Playlist only) ─────

        [DisplayName("Local source id")]
        [Description("Library item id used when Source type is MediaInfo / Collection / Playlist.")]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "MediaInfo")]
        public string LocalSourceId { get; set; } = "";

        // ─── Schedule ──────────────────────────────────────────────────

        public SpacerItem SpacerSchedule { get; set; } = new SpacerItem();
        public CaptionItem ScheduleCaption { get; set; } = new CaptionItem("Schedule");

        [DisplayName("Active intervals")]
        [Description("Date intervals during which this rule runs. Empty = always.")]
        public DateIntervalCollection ActiveIntervals { get; set; } = new DateIntervalCollection();

        // ─── MediaInfo Filters (MediaInfo only) ────────────────────────

        public SpacerItem SpacerMediaInfo { get; set; } = new SpacerItem();
        public CaptionItem MediaInfoCaption { get; set; } = new CaptionItem("MediaInfo filters");

        [DisplayName("Filter groups")]
        [VisibleCondition(nameof(SourceType), ValueCondition.IsEqual, "MediaInfo")]
        public MediaInfoGroupCollection MediaInfoGroups { get; set; } = new MediaInfoGroupCollection();

        // ─── Tag output targets ────────────────────────────────────────

        public SpacerItem SpacerTagOutput { get; set; } = new SpacerItem();
        public CaptionItem TagOutputCaption { get; set; } = new CaptionItem("Tag output targets");

        [DisplayName("Tag episode")]
        public bool TagTargetEpisode { get; set; } = false;

        [DisplayName("Tag season")]
        public bool TagTargetSeason { get; set; } = false;

        [DisplayName("Tag series")]
        public bool TagTargetSeries { get; set; } = false;

        // ─── Enable flags + per-feature panels ─────────────────────────

        public SpacerItem SpacerCollection { get; set; } = new SpacerItem();
        public CaptionItem CollectionCaption { get; set; } = new CaptionItem("Collection");

        [DisplayName("Enable collection")]
        public bool EnableCollection { get; set; } = false;

        [DisplayName("Collection name")]
        [Description("Leave blank to use the tag name as the collection name.")]
        [VisibleCondition(nameof(EnableCollection), SimpleCondition.IsTrue)]
        public string CollectionName { get; set; } = "";

        [DisplayName("Collection description")]
        [VisibleCondition(nameof(EnableCollection), SimpleCondition.IsTrue)]
        [EditMultiline(3)]
        public string CollectionDescription { get; set; } = "";

        [DisplayName("Collection poster path")]
        [VisibleCondition(nameof(EnableCollection), SimpleCondition.IsTrue)]
        public string CollectionPosterPath { get; set; } = "";

        public SpacerItem SpacerHomeSection { get; set; } = new SpacerItem();
        public CaptionItem HomeSectionCaption { get; set; } = new CaptionItem("Home section");

        [DisplayName("Enable home section")]
        public bool EnableHomeSection { get; set; } = false;

        [DisplayName("Home section library id")]
        [VisibleCondition(nameof(EnableHomeSection), SimpleCondition.IsTrue)]
        public string HomeSectionLibraryId { get; set; } = "auto";

        [DisplayName("Home section settings (JSON)")]
        [VisibleCondition(nameof(EnableHomeSection), SimpleCondition.IsTrue)]
        [EditMultiline(4)]
        public string HomeSectionSettings { get; set; } = "{}";

        public SpacerItem SpacerPlaylist { get; set; } = new SpacerItem();
        public CaptionItem PlaylistCaption { get; set; } = new CaptionItem("Playlist");

        [DisplayName("Enable playlist")]
        public bool EnablePlaylist { get; set; } = false;

        [DisplayName("Playlist name")]
        [VisibleCondition(nameof(EnablePlaylist), SimpleCondition.IsTrue)]
        public string PlaylistName { get; set; } = "";
    }
}
