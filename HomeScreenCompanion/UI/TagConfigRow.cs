using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Per-row edit model used by the Tag rules editor grid in
    /// <see cref="MainPageUI.Tags"/>.
    ///
    /// Audit-plan v2 / Wave 1 / U3-U4. The full set of fields (currently ~40
    /// on <c>PluginConfiguration.TagConfig</c>) is added by T3, which is the
    /// task that slims <c>PluginConfiguration</c> down to a snapshot of
    /// <c>TagConfigRow</c>. Until then, U4 only needs the gating fields plus
    /// the Run/OpenLogs buttons.
    /// </summary>
    public class TagConfigRow : EditableOptionsBase
    {
        public override string EditorTitle => "Tag rule";

        public string Name { get; set; } = "";

        public string Tag { get; set; } = "";

        public bool Enabled { get; set; } = true;

        public string Source { get; set; } = "External";

        [DisplayName("Enable tag")]
        [Description("When off, this rule is skipped entirely.")]
        public bool EnableTag { get; set; } = true;

        [DisplayName("Enable collection")]
        [Description("When on, a collection is created / updated by this rule.")]
        public bool EnableCollection { get; set; } = false;

        [DisplayName("Collection name")]
        [Description("Leave blank to use the tag name as the collection name.")]
        [VisibleCondition(nameof(EnableCollection), SimpleCondition.IsTrue)]
        public string CollectionName { get; set; } = "";

        public ButtonItem RunButton { get; set; } = new ButtonItem("Run now")
        {
            Icon = IconNames.run_circle,
            Data1 = "RunTag"
        };

        public ButtonItem OpenLogsButton { get; set; } = new ButtonItem("Open logs")
        {
            Icon = IconNames.article,
            Data1 = "OpenLogs"
        };

        public StatusItem RowStatus { get; set; } = new StatusItem(
            "Status",
            "No run yet",
            ItemStatus.Unavailable);
    }
}
