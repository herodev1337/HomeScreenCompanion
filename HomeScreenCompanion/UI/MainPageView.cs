using System.Linq;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Backs the <see cref="MainPageUI"/>. On construction, hydrates the
    /// page from the legacy XML config (so existing installations don't
    /// lose their settings) plus the persisted JSON store. On save, the
    /// mapper (<see cref="MainPageConfigMapper"/>) writes both surfaces
    /// — JSON-only on the new SDK store, XML-compatible via
    /// <see cref="Plugin.UpdateConfiguration"/> for the existing endpoints.
    /// </summary>
    public class MainPageView : PluginPageView
    {
        private readonly MainPageOptionsStore store;

        public MainPageView(PluginInfo pluginInfo, MainPageOptionsStore store, ILogger logger)
            : base(pluginInfo.Id)
        {
            this.store = store;
            this.Logger = logger;

            // The store holds the persisted SDK-side JSON. If it's empty
            // (fresh install or first run after the SDK UI lands), seed
            // it from the legacy XML config.
            var ui = store.GetOptions();
            if (ui != null)
            {
                MainPageConfigMapper.HydrateFrom(ui, Plugin.Instance?.Configuration);
            }
            this.ContentData = ui;
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

            if (commandId == "OpenReleaseNotes")
            {
                return new ReleaseNotesDialog(this.PluginId, this.MainPageUi?.ReleaseNotesUrl);
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        public override Task<IPluginUIView> OnSaveCommand(string itemId, string commandId, string data)
        {
            var ui = this.MainPageUi;
            if (ui != null)
            {
                // Mirror the scalar settings back into PluginConfiguration
                // so the existing endpoint readers keep working untouched.
                var plugin = Plugin.Instance;
                if (plugin != null)
                {
                    var newConfig = MainPageConfigMapper.ToPluginConfig(ui);

                    // The mapper clears Tags/TopLists/SavedFilters because
                    // the UI owns tag-row persistence via the row dialog
                    // (TagRowEditDialog already mirrors EnableCollection /
                    // CollectionName / EnableTag on its OnOkCommand).
                    // Restore the existing lists so we don't drop data the
                    // legacy endpoints depend on. Will be replaced by
                    // TagConfigRow-based persistence in T6.
                    var legacy = plugin.Configuration;
                    newConfig.Tags = legacy?.Tags ?? new System.Collections.Generic.List<TagConfig>();
                    newConfig.TopLists = legacy?.TopLists ?? new System.Collections.Generic.List<TopListHomeSection>();
                    newConfig.SavedFilters = legacy?.SavedFilters ?? new System.Collections.Generic.List<SavedMediaInfoFilter>();
                    newConfig.HomeSyncEnabled = legacy?.HomeSyncEnabled ?? false;
                    newConfig.HomeSyncSourceUserId = legacy?.HomeSyncSourceUserId ?? "";
                    newConfig.HomeSyncTargetUserIds = legacy?.HomeSyncTargetUserIds ?? new System.Collections.Generic.List<string>();
                    newConfig.HomeSyncLibraryOrder = legacy?.HomeSyncLibraryOrder ?? false;

                    plugin.UpdateConfiguration(newConfig);
                }

                this.store.SetOptions(ui);
            }

            return base.OnSaveCommand(itemId, commandId, data);
        }
    }
}
