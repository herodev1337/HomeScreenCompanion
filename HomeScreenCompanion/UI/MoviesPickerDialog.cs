using System.ComponentModel;
using System.Threading.Tasks;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Editors;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Movie picker dialog opened from <see cref="TopListsPageView"/> via
    /// <c>RunCommand("PickMovies:{TagName}")</c>.
    ///
    /// Audit-plan v2 / Wave 1 / U5. Search runs server-side via
    /// <see cref="HomeScreenCompanionTask"/>; the dialog re-renders on
    /// <c>RaiseUIViewInfoChanged()</c>.
    /// </summary>
    public class MoviesPickerDialog : PluginDialogView
    {
        public MoviesPickerDialog(string pluginId, string tagName)
            : base(pluginId)
        {
            this.TagName = tagName;
            this.ContentData = new MoviesPickerUI();
        }

        public override string Caption => "Pick movies";

        public override string SubCaption => string.IsNullOrEmpty(this.TagName)
            ? "Search Emby's library"
            : "For tag: " + this.TagName;

        public string TagName { get; }

        public MoviesPickerUI Picker => this.ContentData as MoviesPickerUI;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            var picker = this.Picker;
            if (picker == null) return await base.RunCommand(itemId, commandId, data);

            if (commandId == "Search")
            {
                picker.Movies.Clear();
                await Task.Run(() => RunSearch(picker));
                this.RaiseUIViewInfoChanged();
                return this;
            }

            if (commandId.StartsWith("AddMovie:"))
            {
                return this;
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        private void RunSearch(MoviesPickerUI picker)
        {
            if (string.IsNullOrWhiteSpace(picker.Query)) return;
            picker.Movies.Add(new GenericListItem
            {
                PrimaryText = "Search results for '" + picker.Query + "'",
                SecondaryText = "Live server-side search not yet wired",
                Icon = IconNames.search
            });
        }
    }

    public class MoviesPickerUI : EditableOptionsBase
    {
        public override string EditorTitle => "Pick movies";

        [DisplayName("Search")]
        [Description("Search Emby's library for movies to add.")]
        public string Query { get; set; } = "";

        public EditorDxGrid MoviesGrid { get; set; } = new EditorDxGrid();

        public GenericItemList Movies { get; set; } = new GenericItemList();

        public ButtonItem SearchButton { get; set; } = new ButtonItem("Search")
        {
            Icon = IconNames.search,
            Data1 = "Search"
        };
    }
}
