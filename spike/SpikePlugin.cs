using System;
using System.Collections.Generic;
using System.IO;
using MediaBrowser.Common;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Drawing;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Serialization;

namespace HomeScreenCompanion.Spike
{
    /// <summary>
    /// Spike-only: swap <c>IHasWebPages</c> for <c>IHasUIPages</c> and verify
    /// the 4.10.0.24-beta2 SDK surfaces we plan to depend on. This is the
    /// minimum needed to exercise:
    ///   <list type="bullet">
    ///     <item><c>IHasUIPages.UIPageControllers</c> (the new declarative UI hook)</item>
    ///     <item><c>IPluginUIPageController.PageInfo</c> + <c>CreateDefaultPageView</c></item>
    ///     <item><c>IPluginPageView</c> with <c>ShowSave</c> / <c>OnSaveCommand</c></item>
    ///     <item><c>EditableOptionsBase</c> round-tripped via the file store</item>
    ///     <item><c>PluginPageInfo</c> menu registration</item>
    ///   </list>
    /// Delete this whole directory once the audit plan v2 is finalised.
    /// </summary>
    public class SpikePlugin : BasePlugin, IHasUIPages, IHasThumbImage
    {
        private readonly SpikeOptionsStore store;
        private List<IPluginUIPageController> pages;

        public SpikePlugin(IApplicationPaths paths, IJsonSerializer json, ILogManager logManager)
        {
            Instance = this;
            this.store = new SpikeOptionsStore(logManager, json);
            this.pages = new List<IPluginUIPageController>
            {
                new SpikePageController(this.GetPluginInfo(), this.store)
            };
        }

        public static SpikePlugin Instance { get; private set; }

        public override Guid Id => new Guid("00000000-0000-0000-0000-000000000001");
        public override string Name => "HomeScreenCompanion.Spike";
        public override string Description => "SDK declarative-UI spike — verifies Emby 4.10 GenericEdit wiring.";

        public IReadOnlyCollection<IPluginUIPageController> UIPageControllers => this.pages.AsReadOnly();

        public ImageFormat ThumbImageFormat => ImageFormat.Png;
        public System.IO.Stream GetThumbImage() => System.IO.Stream.Null;
    }
}