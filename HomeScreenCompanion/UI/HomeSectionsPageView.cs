using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Controller;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Registers the home-sections sub-page with Emby's SDK declarative UI.
    /// Audit-plan v2 / Wave 1 / U6.
    /// </summary>
    public class HomeSectionsPageController : ControllerBase
    {
        private readonly PluginInfo pluginInfo;
        private readonly ILogger logger;

        public HomeSectionsPageController(
            PluginInfo pluginInfo,
            IServerApplicationHost applicationHost,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this.pluginInfo = pluginInfo;
            this.logger = logger;
            this.PageInfo = new PluginPageInfo
            {
                Name = "HomeScreenCompanionHomeSections",
                EnableInMainMenu = true,
                DisplayName = "Home Screen Companion — Home Sections",
                MenuIcon = "dashboard_customize"
            };
        }

        public override PluginPageInfo PageInfo { get; }

        public override Task<IPluginUIView> CreateDefaultPageView()
        {
            IPluginUIView view = new HomeSectionsPageView(this.pluginInfo, this.logger);
            return Task.FromResult(view);
        }
    }

    /// <summary>
    /// Backs the <see cref="HomeSectionsPageUI"/> on save and dispatches
    /// the ApplyTag button. Drag-reorder calls back through
    /// <see cref="MediaBrowser.Controller.IUserManager.MoveHomeSectionsAsync"/>.
    /// Audit-plan v2 / Wave 1 / U6.
    /// </summary>
    public class HomeSectionsPageView : PluginPageView
    {
        public HomeSectionsPageView(PluginInfo pluginInfo, ILogger logger)
            : base(pluginInfo.Id)
        {
            this.Logger = logger;
            this.ContentData = new HomeSectionsPageUI();
        }

        public ILogger Logger { get; }

        public HomeSectionsPageUI Page => this.ContentData as HomeSectionsPageUI;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            if (commandId == "ApplyTag")
            {
                this.Logger?.Info("[HomeSections] ApplyTag — not yet wired to IUserManager.");
                this.RaiseUIViewInfoChanged();
                return this;
            }

            return await base.RunCommand(itemId, commandId, data);
        }
    }
}
