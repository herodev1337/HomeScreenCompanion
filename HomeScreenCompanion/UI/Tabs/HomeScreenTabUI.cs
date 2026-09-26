using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Home Screen tab — manages a source user's home sections and
    /// runs the copy / sync to target users. Old configPage.html had
    /// two sub-tabs; this tab uses an <see cref="EditorSelectSingle"/>
    /// "View" picker that swaps which property group is shown
    /// (pattern from <c>ListsPageView.DemoChoice</c>).
    /// </summary>
    public sealed class HomeScreenTabUI : EditableOptionsBase
    {
        public override string EditorTitle => "Home screen";

        public override string EditorDescription =>
            "Manage a source user's home sections and copy them to target users.";

        [DisplayName("View")]
        [Description("Switch between section management and copy & sync.")]
        public HomeScreenViews View { get; set; } = HomeScreenViews.Manage;

        // ─── Manage sub-view ────────────────────────────────────────────

        public SpacerItem SpacerManage { get; set; } = new SpacerItem();
        public CaptionItem ManageCaption { get; set; } = new CaptionItem("Manage");

        [DisplayName("Source user id")]
        [Description("User id whose home sections are being edited.")]
        [VisibleCondition(nameof(View), ValueCondition.IsEqual, nameof(HomeScreenViews.Manage))]
        public string SourceUserId { get; set; } = "";

        public ButtonItem RefreshSectionsButton { get; set; } = new ButtonItem("Refresh sections")
        {
            Icon = IconNames.menu,
            Data1 = RefreshSectionsCommand,
        };

        [DisplayName("Sections")]
        [VisibleCondition(nameof(View), ValueCondition.IsEqual, nameof(HomeScreenViews.Manage))]
        [Browsable(false)]
        public GenericItemList Sections { get; set; } = new GenericItemList();

        public StatusItem ManageStatus { get; set; } = new StatusItem(
            "Status",
            "Pick a source user and click Refresh.",
            ItemStatus.Unavailable);

        // ─── Copy & sync sub-view ───────────────────────────────────────

        public SpacerItem SpacerSync { get; set; } = new SpacerItem();
        public CaptionItem SyncCaption { get; set; } = new CaptionItem("Copy & sync");

        [DisplayName("Source user id")]
        [Description("User whose home sections drive the sync.")]
        [VisibleCondition(nameof(View), ValueCondition.IsEqual, nameof(HomeScreenViews.Sync))]
        public string SyncSourceUserId { get; set; } = "";

        [DisplayName("Target user ids")]
        [Description("One user id per line.")]
        [EditMultiline(4)]
        [VisibleCondition(nameof(View), ValueCondition.IsEqual, nameof(HomeScreenViews.Sync))]
        public string TargetUserIds { get; set; } = "";

        [DisplayName("Sync library order")]
        [VisibleCondition(nameof(View), ValueCondition.IsEqual, nameof(HomeScreenViews.Sync))]
        public bool SyncLibraryOrder { get; set; } = false;

        public ButtonItem SyncNowButton { get; set; } = new ButtonItem("Sync now")
        {
            Icon = IconNames.run_circle,
            Data1 = SyncNowCommand,
        };

        public StatusItem SyncStatus { get; set; } = new StatusItem(
            "Sync",
            "Idle.",
            ItemStatus.Unavailable);

        internal const string RefreshSectionsCommand = "RefreshSections";
        internal const string SyncNowCommand = "SyncNow";

        public enum HomeScreenViews
        {
            [Description("Manage")]
            Manage,
            [Description("Copy & sync")]
            Sync,
        }
    }
}
