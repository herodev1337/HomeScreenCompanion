using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backing model for the backup dialog. Six checkboxes that mirror
    /// the six sections of <see cref="ExportBackupRequest"/>. Defaults to
    /// all-on, matching the old configPage.html behaviour.
    /// </summary>
    public sealed class BackupOptionsUI : EditableOptionsBase
    {
        public override string EditorTitle => "Export backup";

        public override string EditorDescription =>
            "Pick which sections to include in the backup JSON. The result is downloaded as a file.";

        [DisplayName("Settings (models, behaviour toggles, AI system prompt)")]
        public bool Settings { get; set; } = true;

        [DisplayName("API keys (Trakt / MDBList / TMDB / OpenAI / Gemini / Claude)")]
        public bool ApiKeys { get; set; } = true;

        [DisplayName("Tag rules")]
        public bool Tags { get; set; } = true;

        [DisplayName("Saved MediaInfo filters")]
        public bool SavedFilters { get; set; } = true;

        [DisplayName("Top lists")]
        public bool TopLists { get; set; } = true;

        [DisplayName("Home screen sync")]
        public bool HomeSync { get; set; } = true;
    }
}
