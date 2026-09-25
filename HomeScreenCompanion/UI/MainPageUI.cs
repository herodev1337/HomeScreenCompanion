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
    /// Audit-plan v2 / Wave 1 / U3. Surfaces the top-level scalar settings
    /// from <c>PluginConfiguration</c> and a placeholder <see cref="EditorDxGrid"/>
    /// for the tag rows that U4 expands. The complete
    /// "general" tab is rebuilt across U3..U7 + T6.
    /// </summary>
    public class MainPageUI : EditableOptionsBase
    {
        public override string EditorTitle => "Home Screen Companion";

        public override string EditorDescription =>
            "Auto-tagging, collection management and home screen sync for Emby.";

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

        [DisplayName("Release notes URL")]
        [Description("Where the update banner links to. Leave blank to suppress the banner.")]
        public string ReleaseNotesUrl { get; set; } = "";

        public SpacerItem BeforeTags { get; set; } = new SpacerItem();

        public CaptionItem TagsCaption { get; set; } = new CaptionItem("Tag rules");

        // U4 expands this into a per-row edit dialog; T6 lifts the row type
        // from PluginConfiguration.TagConfig. For now the row type exposes just
        // the fields needed by EditorDxGrid (Name, Tag, Enabled, Source).
        public EditorDxGrid Tags { get; set; } = new EditorDxGrid();
    }
}
