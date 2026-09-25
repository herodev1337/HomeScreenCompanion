using Emby.Web.GenericEdit;
using HomeScreenCompanion.UIBaseClasses.Store;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Serialization;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Persists the <see cref="MainPageUI"/> instance to a JSON file under
    /// <see cref="IApplicationPaths.PluginConfigurationsPath"/>.
    ///
    /// Audit-plan v2 / Wave 1 / U3: parallel to <c>EmbyPluginUiTemplate/Storage/MyOptionsStore.cs</c>.
    /// </summary>
    public class MainPageOptionsStore : SimpleFileStore<MainPageUI>
    {
        public MainPageOptionsStore(
            IApplicationPaths applicationPaths,
            IFileSystem fileSystem,
            IJsonSerializer jsonSerializer,
            ILogger logger,
            string pluginFullName)
            : base(applicationPaths, fileSystem, jsonSerializer, logger, pluginFullName)
        {
        }
    }
}
