using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses;
using MediaBrowser.Controller;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Registers the main configuration page with Emby's SDK declarative UI.
    ///
    /// Audit-plan v2 / Wave 1 / U3.
    /// </summary>
    public class MainPageController : ControllerBase
    {
        private readonly PluginInfo pluginInfo;
        private readonly MainPageOptionsStore optionsStore;

        public MainPageController(
            PluginInfo pluginInfo,
            IServerApplicationHost applicationHost,
            MainPageOptionsStore optionsStore)
            : base(pluginInfo.Id)
        {
            this.pluginInfo = pluginInfo;
            this.optionsStore = optionsStore;
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
            IPluginUIView view = new MainPageView(this.pluginInfo, this.optionsStore);
            return Task.FromResult(view);
        }
    }
}
