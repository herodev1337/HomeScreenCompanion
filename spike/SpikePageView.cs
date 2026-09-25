using System.Threading.Tasks;
using HomeScreenCompanion.Spike.UIBaseClasses.Views;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.Spike
{
    public class SpikePageView : PluginPageView
    {
        private readonly SpikeOptionsStore store;

        public SpikePageView(PluginInfo pluginInfo, SpikeOptionsStore store)
            : base(pluginInfo.Id)
        {
            this.store = store;
            this.ContentData = new SpikePageUI();
        }

        public SpikePageUI Page => (SpikePageUI)this.ContentData;

        public async Task Initialize(System.Threading.CancellationToken token)
        {
            var saved = this.store.Load();
            this.Page.OutputFolder = saved.OutputFolder;
            this.Page.MessageFormat = saved.MessageFormat;
            this.Page.LogLevel = saved.LogLevel;
            this.RaiseUIViewInfoChanged();
            await Task.CompletedTask;
        }

        public override Task<IPluginUIView> OnSaveCommand(string itemId, string commandId, string data)
        {
            this.store.Save(new SpikeOptions
            {
                OutputFolder = this.Page.OutputFolder,
                MessageFormat = this.Page.MessageFormat,
                LogLevel = this.Page.LogLevel,
            });
            return base.OnSaveCommand(itemId, commandId, data);
        }
    }
}