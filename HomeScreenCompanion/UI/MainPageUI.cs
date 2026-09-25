using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Editors;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Declarative model for the main configuration page.
    ///
    /// Audit-plan v2: holds every scalar setting that
    /// <c>PluginConfiguration</c> carried before T3 (external list API
    /// keys + AI provider keys/models + the live task knobs). Tag rows
    /// stay on <see cref="EditorDxGrid"/> until U4/U6 expand them. See
    /// <see cref="MainPageConfigMapper"/> for the typed round-trip with
    /// <see cref="PluginConfiguration"/>.
    /// </summary>
    public class MainPageUI : EditableOptionsBase
    {
        public override string EditorTitle => "Home Screen Companion";

        public override string EditorDescription =>
            "Auto-tagging, collection management and home screen sync for Emby.";

        // ─── Top-level scalars ──────────────────────────────────────────

        [DisplayName("Run interval (minutes)")]
        [Description("How often the background task runs. Min 5, max 1440.")]
        [MinValue(5)]
        [MaxValue(1440)]
        public int RunIntervalMinutes { get; set; } = 60;

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

        [DisplayName("Release notes URL")]
        [Description("Where the update banner links to. Leave blank to suppress the banner.")]
        public string ReleaseNotesUrl { get; set; } = "";

        // ─── External list API keys ────────────────────────────────────

        public SpacerItem SpacerExternalApis { get; set; } = new SpacerItem();
        public CaptionItem ExternalApisCaption { get; set; } = new CaptionItem("External APIs");

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

        [DisplayName("AI system prompt")]
        [Description("System prompt sent to the AI provider. Edit with care.")]
        [EditMultiline(6)]
        public string AiSystemPrompt { get; set; } = PluginConfiguration.DefaultAiSystemPrompt;

        // ─── Tag rules + Updates groups ────────────────────────────────

        public SpacerItem BeforeTags { get; set; } = new SpacerItem();

        public CaptionItem TagsCaption { get; set; } = new CaptionItem("Tag rules");

        // U4 expands this into a per-row edit dialog; the row type
        // (TagConfigRow) lives alongside this file. For now the grid
        // shows placeholder rows; the rows-to-config mapping is owned
        // by U4/T6, which know about TagConfig vs TagConfigRow.
        public EditorDxGrid Tags { get; set; } = new EditorDxGrid();

        public CaptionItem UpdatesCaption { get; set; } = new CaptionItem("Updates");

        public ButtonItem OpenReleaseNotesButton { get; set; } = new ButtonItem("Open release notes")
        {
            Icon = IconNames.open_in_new,
            Data1 = "OpenReleaseNotes"
        };
    }
}
