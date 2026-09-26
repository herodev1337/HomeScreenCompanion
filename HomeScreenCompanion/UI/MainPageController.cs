using System.Collections.Generic;
using System.Threading.Tasks;
using HomeScreenCompanion.UI.Tabs;
using HomeScreenCompanion.UIBaseClasses;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Plugins.UI.Views;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Tasks;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Single menu entry for Home Screen Companion. Implements
    /// <see cref="IHasTabbedUIPages"/> so the SDK renders the five tabs
    /// (Tag &amp; Collection, Top Lists, Home Screen, Logs, Settings) under
    /// one page. Pattern from Emby.SDK's EmbyPluginUiDemo.
    /// </summary>
    public class MainPageController : ControllerBase, IHasTabbedUIPages
    {
        private readonly PluginInfo _pluginInfo;
        private readonly MainPageOptionsStore _optionsStore;
        private readonly IHttpClient _httpClient;
        private readonly IJsonSerializer _jsonSerializer;
        private readonly IServerApplicationHost _applicationHost;
        private readonly IUserManager _userManager;
        private readonly ILogger _logger;
        private readonly List<IPluginUIPageController> _tabPages;

        public MainPageController(
            PluginInfo pluginInfo,
            IServerApplicationHost applicationHost,
            MainPageOptionsStore optionsStore,
            IHttpClient httpClient,
            IJsonSerializer jsonSerializer,
            IUserManager userManager,
            ITaskManager taskManager,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this._pluginInfo = pluginInfo;
            this._optionsStore = optionsStore;
            this._httpClient = httpClient;
            this._jsonSerializer = jsonSerializer;
            this._applicationHost = applicationHost;
            this._userManager = userManager;
            this._logger = logger;
            this.PageInfo = new PluginPageInfo
            {
                Name = "HomeScreenCompanion",
                EnableInMainMenu = true,
                DisplayName = "Home Screen Companion",
                MenuIcon = "home",
                IsMainConfigPage = true,
            };

            this._tabPages = new List<IPluginUIPageController>
            {
                new TabPageController(
                    pluginInfo,
                    nameof(TagRulesTabView),
                    "Tag & Collection",
                    () => new TagRulesTabView(pluginInfo, logger)),
                new TabPageController(
                    pluginInfo,
                    nameof(TopListsTabView),
                    "Top Lists",
                    () => new TopListsTabView(pluginInfo, logger)),
                new TabPageController(
                    pluginInfo,
                    nameof(HomeScreenTabView),
                    "Home Screen",
                    () => new HomeScreenTabView(
                        pluginInfo,
                        userManager,
                        taskManager,
                        logger)),
                new TabPageController(
                    pluginInfo,
                    nameof(LogsTabView),
                    "Logs & Status",
                    () => new LogsTabView(pluginInfo, taskManager, logger)),
                new TabPageController(
                    pluginInfo,
                    nameof(SettingsTabView),
                    "Settings",
                    () => new SettingsTabView(
                        pluginInfo,
                        httpClient,
                        jsonSerializer,
                        applicationHost,
                        logger)),
            };
        }

        public override PluginPageInfo PageInfo { get; }

        public IReadOnlyList<IPluginUIPageController> TabPageControllers =>
            this._tabPages.AsReadOnly();

        public override Task<IPluginUIView> CreateDefaultPageView()
        {
            // Lands on Tab 1 (Tag & Collection) by default — matches the old
            // configPage.html behaviour where Tag & Collection was the active tab.
            IPluginUIView view = new MainPageView(this._pluginInfo, this._optionsStore, this._logger);
            return Task.FromResult(view);
        }
    }
}
