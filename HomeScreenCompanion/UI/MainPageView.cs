using System.Linq;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Backs the <see cref="MainPageUI"/> on save: persists the new options
    /// via <see cref="MainPageOptionsStore"/> and mirrors the scalar settings
    /// into <see cref="PluginConfiguration"/> so the existing endpoints keep
    /// reading the legacy XML config.
    ///
    /// Audit-plan v2 / Wave 1 / U3.
    /// </summary>
    public class MainPageView : PluginPageView
    {
        private readonly MainPageOptionsStore store;

        public MainPageView(PluginInfo pluginInfo, MainPageOptionsStore store, ILogger logger)
            : base(pluginInfo.Id)
        {
            this.store = store;
            this.Logger = logger;
            this.ContentData = store.GetOptions();
        }

        public ILogger Logger { get; }

        public MainPageUI MainPageUi => this.ContentData as MainPageUI;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            if (commandId.StartsWith("EditTag:"))
            {
                var tagName = commandId.Substring("EditTag:".Length);
                var existing = Plugin.Instance?.Configuration?.Tags?
                    .FirstOrDefault(t => t.Name == tagName);
                if (existing != null)
                {
                    var row = new TagConfigRow
                    {
                        Name = existing.Name,
                        Tag = existing.Tag,
                        Enabled = existing.EnableTag,
                        Source = existing.SourceType,
                        EnableCollection = existing.EnableCollection,
                        CollectionName = existing.CollectionName,
                        EnableTag = existing.EnableTag
                    };
                    return TagRowEditor.OpenFor(this.PluginId, row, this.Logger);
                }
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        public override Task<IPluginUIView> OnSaveCommand(string itemId, string commandId, string data)
        {
            var ui = this.MainPageUi;
            var plugin = Plugin.Instance;
            if (plugin != null && ui != null)
            {
                // Mirror the scalar settings that already exist on
                // PluginConfiguration. ReleaseNotesUrl / RunIntervalMinutes live
                // only on MainPageUI until T7 adds them to PluginConfiguration.
                plugin.UpdateConfiguration(new PluginConfiguration
                {
                    DryRunMode = ui.DryRunMode,
                    ExtendedConsoleOutput = ui.ExtendedConsoleOutput,
                    LogMissingItems = ui.LogMissingItems
                });
            }

            if (ui != null)
            {
                this.store.SetOptions(ui);
            }

            return base.OnSaveCommand(itemId, commandId, data);
        }
    }
}
