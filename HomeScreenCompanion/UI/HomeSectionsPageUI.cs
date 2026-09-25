using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Editors;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Common;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Declarative model for the "Home Sections" page.
    ///
    /// Audit-plan v2 / Wave 1 / U6. Lets the admin choose a user, drag-reorder
    /// the home-screen sections owned by that user, and apply a tag-config's
    /// section layout.
    /// </summary>
    public class HomeSectionsPageUI : EditableOptionsBase
    {
        public override string EditorTitle => "Home Sections";

        public override string EditorDescription =>
            "Manage per-user home-screen sections and the tag-rule layouts that drive them.";

        public SpacerItem HeaderSpacer { get; set; } = new SpacerItem();

        public EditorSelectSingle UserSelector { get; set; } = new EditorSelectSingle();

        public CaptionItem SectionsCaption { get; set; } = new CaptionItem("Sections");

        public EditorDxGrid Sections { get; set; } = new EditorDxGrid();

        public ButtonItem ApplyTagButton { get; set; } = new ButtonItem("Apply tag")
        {
            Icon = IconNames.check,
            Data1 = "ApplyTag"
        };
    }
}
