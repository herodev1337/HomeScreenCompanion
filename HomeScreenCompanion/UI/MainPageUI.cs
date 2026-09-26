using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Editors;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Declarative model for the Home Screen Companion landing tab.
    ///
    /// This tab is intentionally a "quick summary" surface: it shows the
    /// few settings the user actually edits day-to-day (run interval,
    /// dry-run mode, AI system prompt), the release-notes URL + button,
    /// and a short pointer to the Settings tab for the rest. Every other
    /// setting (External API keys, AI provider keys/models, schedule,
    /// advanced toggles, backup &amp; restore) lives on the Settings
    /// tab so the two screens don't drift.
    /// </summary>
    public class MainPageUI : EditableOptionsBase
    {
        public override string EditorTitle => "Home Screen Companion";

        public override string EditorDescription =>
            "Quick-access settings — most options live on the Settings tab.";

        // ─── Top-level scalars (quick access) ─────────────────────────

        [DisplayName("Run interval (minutes)")]
        [Description("How often the background task runs. Min 5, max 1440.")]
        [MinValue(5)]
        [MaxValue(1440)]
        public int RunIntervalMinutes { get; set; } = 60;

        [DisplayName("Dry run mode")]
        [Description("Log changes but do not write tags, collections, home sections or playlists.")]
        public bool DryRunMode { get; set; } = false;

        [DisplayName("AI system prompt")]
        [Description("System prompt sent to the AI provider. Edit with care.")]
        [EditMultiline(6)]
        public string AiSystemPrompt { get; set; } = PluginConfiguration.DefaultAiSystemPrompt;

        // ─── Updates / release notes group ─────────────────────────────

        public SpacerItem BeforeUpdates { get; set; } = new SpacerItem();

        public CaptionItem UpdatesCaption { get; set; } = new CaptionItem("Updates");

        [DisplayName("Release notes URL")]
        [Description("Where the 'Open release notes' button points to. Leave blank to disable the button.")]
        public string ReleaseNotesUrl { get; set; } = "";

        public ButtonItem OpenReleaseNotesButton { get; set; } = new ButtonItem("Open release notes")
        {
            Icon = IconNames.open_in_new,
            Data1 = "OpenReleaseNotes"
        };

        // ─── Pointer to the rest ───────────────────────────────────────

        [DisplayName("More settings")]
        public LabelItem HelpCaption { get; set; } = new LabelItem(
            "External list API keys, AI provider keys & models, advanced run " +
            "behaviour toggles and backup/restore live on the Settings tab.");
    }
}
