using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Logs &amp; Status tab — last-run summary, current-run progress,
    /// and the live execution log. Mirrors the legacy LogsPage UI but
    /// adds a status row for the active scheduled task and a refresh
    /// button so users can re-read <c>HomeScreenCompanionTask.ExecutionLog</c>.
    /// </summary>
    public sealed class LogsTabUI : EditableOptionsBase
    {
        public override string EditorTitle => "Logs & status";

        public override string EditorDescription =>
            "Last run result, current sync progress, and the live execution log.";

        public CaptionItem StatusCaption { get; set; } = new CaptionItem("Run status");

        [DisplayName("Last run")]
        public StatusItem LastRunStatus { get; set; } = new StatusItem(
            "Last run",
            "Unknown (resets at server restart)",
            ItemStatus.Unavailable);

        [DisplayName("Current run")]
        public StatusItem CurrentRunStatus { get; set; } = new StatusItem(
            "Current run",
            "Idle",
            ItemStatus.None);

        [Browsable(false)]
        public StatusItem LastSyncStatus { get; set; } = new StatusItem(
            "Home screen sync",
            "Unknown",
            ItemStatus.Unavailable);

        public ButtonItem RefreshButton { get; set; } = new ButtonItem("Refresh")
        {
            Icon = IconNames.menu,
            Data1 = RefreshCommand,
        };

        public ButtonItem RunButton { get; set; } = new ButtonItem("Run full sync")
        {
            Icon = IconNames.run_circle,
            Data1 = RunCommand,
        };

        [DisplayName("Auto-refresh")]
        [Description("Re-read the run log every N seconds while this tab is open.")]
        [AutoPostBack(LogsTabView.AutoRefreshToggleCommand, nameof(AutoRefreshEnabled))]
        public bool AutoRefreshEnabled { get; set; } = false;

        [DisplayName("Auto-refresh interval (seconds)")]
        [Description("10 - 600. Only used when Auto-refresh is on.")]
        [MinValue(10)]
        [MaxValue(600)]
        [VisibleCondition(nameof(AutoRefreshEnabled), SimpleCondition.IsTrue)]
        public int AutoRefreshSeconds { get; set; } = 15;

        public LabelItem AutoRefreshStateLabel { get; set; } = new LabelItem("Auto-refresh: off");

        public SpacerItem SpacerLog { get; set; } = new SpacerItem();

        public CaptionItem LogCaption { get; set; } = new CaptionItem("Live execution log");

        [DisplayName("Run log")]
        [Description("Most-recent entries are at the bottom.")]
        [EditMultiline(20)]
        [ReadOnly(true)]
        public string RunLog { get; set; } = string.Empty;

        internal const string RefreshCommand = "LogsRefresh";
        internal const string RunCommand = "LogsRunFull";
    }
}
