using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Settings tab — API keys, AI providers, system prompt, schedule,
    /// run behaviour, backup/restore, plugin info. Owns the scalar
    /// surface that used to live on the Main page and in the misplaced
    /// "Settings" group of the old configPage.html.
    ///
    /// Persistence: the <see cref="SettingsTabView.OnSaveCommand"/>
    /// handler mirrors every property back into
    /// <see cref="PluginConfiguration"/> so the existing endpoint code
    /// keeps working untouched. The tab itself is read-only at rest
    /// (no JSON store) because the source of truth is the plugin
    /// config file.
    /// </summary>
    public sealed class SettingsTabUI : EditableOptionsBase
    {
        public override string EditorTitle => "Settings";

        public override string EditorDescription =>
            "External list API keys, AI providers, system prompt, schedule, run behaviour and backup/restore.";

        // ─── External list API keys ────────────────────────────────────

        public SpacerItem SpacerExternalApis { get; set; } = new SpacerItem();
        public CaptionItem ExternalApisCaption { get; set; } = new CaptionItem("External lists");

        [DisplayName("Trakt Client ID")]
        [IsPassword]
        public string TraktClientId { get; set; } = "";

        [DisplayName("MDBList API key")]
        [IsPassword]
        public string MdblistApiKey { get; set; } = "";

        [DisplayName("TMDB API key")]
        [IsPassword]
        public string TmdbApiKey { get; set; } = "";

        // ─── AI provider settings ──────────────────────────────────────

        public SpacerItem SpacerAi { get; set; } = new SpacerItem();
        public CaptionItem AiCaption { get; set; } = new CaptionItem("AI providers");

        [DisplayName("OpenAI API key")]
        [IsPassword]
        public string OpenAiApiKey { get; set; } = "";

        [DisplayName("OpenAI model")]
        public string OpenAiModel { get; set; } = "gpt-4o-mini";

        [DisplayName("Gemini API key")]
        [IsPassword]
        public string GeminiApiKey { get; set; } = "";

        [DisplayName("Gemini model")]
        public string GeminiModel { get; set; } = "gemini-2.5-flash-lite";

        [DisplayName("Claude API key")]
        [IsPassword]
        public string ClaudeApiKey { get; set; } = "";

        [DisplayName("Claude model")]
        public string ClaudeModel { get; set; } = "claude-haiku-4-5-20251001";

        [DisplayName("Ollama base URL")]
        [Description("Local Ollama server URL. Default: http://localhost:11434.")]
        public string OllamaBaseUrl { get; set; } = "http://localhost:11434";

        [DisplayName("Ollama model")]
        public string OllamaModel { get; set; } = "";

        // ─── System prompt ─────────────────────────────────────────────

        public SpacerItem SpacerSystemPrompt { get; set; } = new SpacerItem();
        public CaptionItem SystemPromptCaption { get; set; } = new CaptionItem("System prompt");

        [DisplayName("AI system prompt")]
        [Description("System prompt sent to the AI provider. Edit with care.")]
        [EditMultiline(7)]
        public string AiSystemPrompt { get; set; } = PluginConfiguration.DefaultAiSystemPrompt;

        public ButtonItem ResetSystemPromptButton { get; set; } = new ButtonItem("Reset to default")
        {
            Icon = IconNames.lock_reset,
            Data1 = ResetSystemPromptCommand,
            ConfirmationPrompt = "Reset the system prompt to the bundled default?"
        };

        internal const string ResetSystemPromptCommand = "ResetSystemPrompt";

        // ─── Schedule ──────────────────────────────────────────────────

        public SpacerItem SpacerSchedule { get; set; } = new SpacerItem();
        public CaptionItem ScheduleCaption { get; set; } = new CaptionItem("Schedule");

        [DisplayName("Run interval (minutes)")]
        [Description("How often the background task runs. Min 5, max 1440.")]
        [MinValue(5)]
        [MaxValue(1440)]
        public int RunIntervalMinutes { get; set; } = 60;

        // ─── Run behaviour ─────────────────────────────────────────────

        public SpacerItem SpacerRunBehaviour { get; set; } = new SpacerItem();
        public CaptionItem RunBehaviourCaption { get; set; } = new CaptionItem("Run behaviour");

        [DisplayName("Dry run mode")]
        [Description("Log changes but do not write tags, collections, home sections or playlists.")]
        public bool DryRunMode { get; set; } = false;

        [DisplayName("Extended console output")]
        [Description("Verbose diagnostic logging in the Emby server log.")]
        public bool ExtendedConsoleOutput { get; set; } = false;

        [DisplayName("Log missing items")]
        [Description("Log items that were skipped because they did not match any tag/source.")]
        public bool LogMissingItems { get; set; } = false;

        [DisplayName("Preserve tags on empty result")]
        [Description("When a tag's source returns 0 items, keep the existing tags instead of clearing them.")]
        public bool PreserveTagsOnEmptyResult { get; set; } = true;

        // ─── Backup & restore ──────────────────────────────────────────

        public SpacerItem SpacerBackup { get; set; } = new SpacerItem();
        public CaptionItem BackupCaption { get; set; } = new CaptionItem("Backup & restore");

        public ButtonItem ExportBackupButton { get; set; } = new ButtonItem("Export backup…")
        {
            Icon = IconNames.bookmark_outline,
            Data1 = ExportBackupCommand
        };

        public ButtonItem ImportBackupButton { get; set; } = new ButtonItem("Import backup…")
        {
            Icon = IconNames.bookmarks,
            Data1 = ImportBackupCommand
        };

        internal const string ExportBackupCommand = "ExportBackup";
        internal const string ImportBackupCommand = "ImportBackup";

        // ─── Plugin info ───────────────────────────────────────────────

        public SpacerItem SpacerPlugin { get; set; } = new SpacerItem();
        public CaptionItem PluginCaption { get; set; } = new CaptionItem("Plugin");

        [DisplayName("Version")]
        public LabelItem VersionLabel { get; set; } = new LabelItem(Plugin.Instance?.Version.ToString() ?? "0.0.0");

        [DisplayName("Project page")]
        public LabelItem ProjectPageLabel { get; set; } = new LabelItem("GitHub repository")
        {
            HyperLink = "https://github.com/herodev1337/HomeScreenCompanion"
        };

        [DisplayName("Report issue")]
        public LabelItem ReportIssueLabel { get; set; } = new LabelItem("Report an issue")
        {
            HyperLink = "https://github.com/herodev1337/HomeScreenCompanion/issues"
        };
    }
}
