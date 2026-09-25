using System.Threading;
using System.Threading.Tasks;
using HomeScreenCompanion.Spike.UIBaseClasses;
using MediaBrowser.Controller;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.Spike
{
    public class SpikePageController : ControllerBase
    {
        private readonly PluginInfo pluginInfo;
        private readonly SpikeOptionsStore store;

        public SpikePageController(PluginInfo pluginInfo, SpikeOptionsStore store)
            : base(pluginInfo.Id)
        {
            this.pluginInfo = pluginInfo;
            this.store = store;
            this.PageInfo = new PluginPageInfo
            {
                Name = "HomeScreenCompanionSpike",
                EnableInMainMenu = true,
                DisplayName = "Spike Config",
                MenuIcon = "list_alt",
                IsMainConfigPage = true,
            };
        }

        public override PluginPageInfo PageInfo { get; }

        public override async Task<IPluginUIView> CreateDefaultPageView()
        {
            var view = new SpikePageView(this.pluginInfo, this.store);
            await view.Initialize(default);
            return view;
        }
    }
}