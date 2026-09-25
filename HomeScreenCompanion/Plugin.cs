using HomeScreenCompanion.UI;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Drawing;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace HomeScreenCompanion
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasUIPages, IHasThumbImage
    {
        public override string Name => "Home Screen Companion";

        public override Guid Id => new Guid("7c10708f-43e4-4d69-923c-77d01802315b");

        public override string Description => "Auto-tagging, collection management and home screen sync for Emby.";

        private readonly IServerApplicationHost _applicationHost;
        private readonly ILogger _logger;
        private MainPageOptionsStore _mainPageOptionsStore;
        private List<IPluginUIPageController> _uiPageControllers;

        public Plugin(
            IApplicationPaths applicationPaths,
            IXmlSerializer xmlSerializer,
            IServerApplicationHost applicationHost,
            IJsonSerializer jsonSerializer,
            IFileSystem fileSystem,
            ILogManager logManager)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
            _applicationHost = applicationHost;
            _logger = logManager.GetLogger("HomeScreenCompanion");
            _mainPageOptionsStore = new MainPageOptionsStore(
                applicationPaths,
                fileSystem,
                jsonSerializer,
                _logger,
                Name);
        }

        internal static Plugin? Instance { get; private set; }

        public IReadOnlyCollection<IPluginUIPageController> UIPageControllers
        {
            get
            {
                if (_uiPageControllers == null)
                {
                    _uiPageControllers = new List<IPluginUIPageController>
                    {
                        new MainPageController(this.GetPluginInfo(), _applicationHost, _mainPageOptionsStore, _logger),
                        new TopListsPageController(this.GetPluginInfo(), _applicationHost, _logger),
                        new HomeSectionsPageController(this.GetPluginInfo(), _applicationHost, _logger),
                        new LogsPageController(this.GetPluginInfo(), _applicationHost, _logger)
                    };
                }
                return _uiPageControllers.AsReadOnly();
            }
        }

        public Stream GetThumbImage()
        {
            var type = GetType();
            var thumbPath = type.Assembly.GetManifestResourceNames().FirstOrDefault(r => r.EndsWith("thumb.png"));
            return (thumbPath != null ? type.Assembly.GetManifestResourceStream(thumbPath) : Stream.Null) ?? Stream.Null;
        }

        public ImageFormat ThumbImageFormat => ImageFormat.Png;
    }
}
