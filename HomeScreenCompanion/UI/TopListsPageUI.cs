using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Declarative model for the "Top Lists" page.
    /// </summary>
    public class TopListsPageUI : EditableOptionsBase
    {
        public override string EditorTitle => "Top Lists";

        public override string EditorDescription =>
            "Manage the IMDb/Trakt/MDBList sources that drive tag rules.";

        public SpacerItem HeaderSpacer { get; set; } = new SpacerItem();

        public GenericItemList Lists { get; set; } = new GenericItemList();

        public ButtonItem AddMdbList { get; set; } = new ButtonItem("Add MdbList")
        {
            Icon = IconNames.add,
            Data1 = "AddMdbList"
        };

        public ButtonItem AddTrakt { get; set; } = new ButtonItem("Add Trakt")
        {
            Icon = IconNames.add,
            Data1 = "AddTrakt"
        };

        public ButtonItem AddTmdb { get; set; } = new ButtonItem("Add TMDB")
        {
            Icon = IconNames.add,
            Data1 = "AddTmdb"
        };
    }
}
