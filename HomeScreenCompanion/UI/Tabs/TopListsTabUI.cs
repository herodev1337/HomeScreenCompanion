using System.Collections.Generic;
using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Top Lists tab — manages the list of <see cref="TopListHomeSection"/>
    /// entries that drive home sections from external / manual sources.
    /// </summary>
    public sealed class TopListsTabUI : EditableOptionsBase
    {
        public override string EditorTitle => "Top lists";

        public override string EditorDescription =>
            "Add and edit top lists (MDBList, Trakt, TMDB, manual) that drive home sections.";

        public CaptionItem Caption { get; set; } = new CaptionItem("Top lists");

        public ButtonItem AddListButton { get; set; } = new ButtonItem("+ Add list")
        {
            Icon = IconNames.add_circle,
            Data1 = AddListCommand,
            SubMenuButtons = new List<ButtonItem>
            {
                new ButtonItem("+ MDBList list")
                {
                    Icon = IconNames.menu,
                    Data1 = AddMdbListCommand,
                },
                new ButtonItem("+ Trakt list")
                {
                    Icon = IconNames.menu,
                    Data1 = AddTraktCommand,
                },
                new ButtonItem("+ TMDB list")
                {
                    Icon = IconNames.menu,
                    Data1 = AddTmdbCommand,
                },
                new ButtonItem("+ Manual list")
                {
                    Icon = IconNames.menu,
                    Data1 = AddManualCommand,
                },
            }
        };

        [Browsable(false)]
        public GenericItemList Lists { get; set; } = new GenericItemList();

        internal const string AddListCommand = "AddList";
        internal const string AddMdbListCommand = "AddMdbList";
        internal const string AddTraktCommand = "AddTrakt";
        internal const string AddTmdbCommand = "AddTmdb";
        internal const string AddManualCommand = "AddManual";
    }
}
