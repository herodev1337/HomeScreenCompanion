using System.Linq;
using System.Threading.Tasks;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using HomeScreenCompanion.UIBaseClasses;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Controller;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Registers the top-lists sub-page with Emby's SDK declarative UI.
    /// </summary>
    public class TopListsPageController : ControllerBase
    {
        private readonly PluginInfo pluginInfo;
        private readonly ILogger logger;

        public TopListsPageController(
            PluginInfo pluginInfo,
            IServerApplicationHost applicationHost,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this.pluginInfo = pluginInfo;
            this.logger = logger;
            this.PageInfo = new PluginPageInfo
            {
                Name = "HomeScreenCompanionTopLists",
                EnableInMainMenu = true,
                DisplayName = "Home Screen Companion — Lists",
                MenuIcon = "list_alt"
            };
        }

        public override PluginPageInfo PageInfo { get; }

        public override Task<IPluginUIView> CreateDefaultPageView()
        {
            IPluginUIView view = new TopListsPageView(this.pluginInfo, this.logger);
            return Task.FromResult(view);
        }
    }

    /// <summary>
    /// Backs the <see cref="TopListsPageUI"/> on save and dispatches the
    /// Add* button commands.
    /// </summary>
    public class TopListsPageView : PluginPageView
    {
        public TopListsPageView(PluginInfo pluginInfo, ILogger logger)
            : base(pluginInfo.Id)
        {
            this.Logger = logger;
            this.ContentData = new TopListsPageUI();
        }

        public ILogger Logger { get; }

        public TopListsPageUI Page => this.ContentData as TopListsPageUI;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            var page = this.Page;
            if (page == null) return await base.RunCommand(itemId, commandId, data);

            switch (commandId)
            {
                case "AddMdbList":
                case "AddTrakt":
                case "AddTmdb":
                    page.Lists.Add(new GenericListItem
                    {
                        PrimaryText = "New " + commandId.Substring(3) + " list",
                        SecondaryText = commandId,
                        Icon = IconNames.list
                    });
                    this.RaiseUIViewInfoChanged();
                    return this;

                case "PickMovies":
                    var picker = new MoviesPickerDialog(this.PluginId, itemId);
                    return picker;
            }

            return await base.RunCommand(itemId, commandId, data);
        }
    }
}
