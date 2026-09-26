using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses;
using MediaBrowser.Controller;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Registers the main configuration page with Emby's SDK declarative UI.
    /// </summary>
    public class MainPageController : ControllerBase
    {
        private readonly PluginInfo pluginInfo;
        private readonly MainPageOptionsStore optionsStore;
        private readonly ILogger logger;

        public MainPageController(
            PluginInfo pluginInfo,
            IServerApplicationHost applicationHost,
            MainPageOptionsStore optionsStore,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this.pluginInfo = pluginInfo;
            this.optionsStore = optionsStore;
            this.logger = logger;
            this.PageInfo = new PluginPageInfo
            {
                Name = "HomeScreenCompanion",
                EnableInMainMenu = true,
                DisplayName = "Home Screen Companion",
                MenuIcon = "home",
                IsMainConfigPage = true
            };
        }

        public override PluginPageInfo PageInfo { get; }

        public override Task<IPluginUIView> CreateDefaultPageView()
        {
            IPluginUIView view = new MainPageView(this.pluginInfo, this.optionsStore, this.logger);
            return Task.FromResult(view);
        }
    }
}
