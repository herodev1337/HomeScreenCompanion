using System.ComponentModel;
using Emby.Web.GenericEdit;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backing model for the restore dialog. The user picks a backup
    /// JSON file via the file picker, opts into the same six sections
    /// as the export dialog, then confirms. Defaults to all-on.
    /// </summary>
    public sealed class RestoreOptionsUI : EditableOptionsBase
    {
        public override string EditorTitle => "Import backup";

        public override string EditorDescription =>
            "Pick a backup JSON file and choose which sections to restore. Existing settings for selected sections will be overwritten.";

        [DisplayName("Backup file")]
        [Description("JSON file produced by Export backup.")]
        [EditFilePicker]
        public string BackupFile { get; set; } = "";

        [DisplayName("Settings")]
        public bool Settings { get; set; } = true;

        [DisplayName("API keys")]
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
