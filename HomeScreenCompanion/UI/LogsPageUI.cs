using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Editors;
using Emby.Web.GenericEdit.Elements;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Declarative model for the "Logs" page.
    ///
    /// Audit-plan v2 / Wave 1 / U7. Re-renders automatically when the
    /// view raises <c>UIViewInfoChanged</c> — no 5s polling needed (the
    /// SDK dialog refreshes on the event).
    /// </summary>
    public class LogsPageUI : EditableOptionsBase
    {
        public override string EditorTitle => "Logs";

        public override string EditorDescription =>
            "Most recent HSC run output. Click Refresh after a sync to re-read.";

        public SpacerItem HeaderSpacer { get; set; } = new SpacerItem();

        [DisplayName("Run log")]
        [Description("Most recent run output, newest at the bottom.")]
        [ReadOnly(true)]
        public string RunLog { get; set; } = string.Empty;

        [DisplayName("Sync progress")]
        [Description("0.0 – 1.0; updated automatically while a sync is in progress.")]
        public double SyncProgress { get; set; } = 0.0;

        public ButtonItem RefreshButton { get; set; } = new ButtonItem("Refresh")
        {
            Icon = IconNames.refresh,
            Data1 = "Refresh"
        };
    }
}
