using System;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Lightweight <see cref="IPluginUIPageController"/> that wraps a view factory
    /// for use as a tab inside an <c>IHasTabbedUIPages</c> main controller.
    /// Pattern from Emby.SDK's <c>EmbyPluginUiDemo</c>.
    /// </summary>
    internal sealed class TabPageController : ControllerBase
    {
        private readonly Func<IPluginUIView> _viewFactory;

        public TabPageController(PluginInfo pluginInfo, string name, string displayName, Func<IPluginUIView> viewFactory)
            : base(pluginInfo.Id)
        {
            this._viewFactory = viewFactory;
            this.PageInfo = new PluginPageInfo
            {
                Name = name,
                DisplayName = displayName,
                EnableInMainMenu = false,
            };
        }

        public override PluginPageInfo PageInfo { get; }

        public override Task<IPluginUIView> CreateDefaultPageView()
        {
            return Task.FromResult(this._viewFactory());
        }
    }
}
