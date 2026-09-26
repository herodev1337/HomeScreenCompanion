using System.Linq;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Controller;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Registers the logs sub-page with Emby's SDK declarative UI.
    /// </summary>
    public class LogsPageController : ControllerBase
    {
        private readonly PluginInfo pluginInfo;
        private readonly ILogger logger;

        public LogsPageController(
            PluginInfo pluginInfo,
            IServerApplicationHost applicationHost,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this.pluginInfo = pluginInfo;
            this.logger = logger;
            this.PageInfo = new PluginPageInfo
            {
                Name = "HomeScreenCompanionLogs",
                EnableInMainMenu = true,
                DisplayName = "Home Screen Companion — Logs",
                MenuIcon = "article"
            };
        }

        public override PluginPageInfo PageInfo { get; }

        public override Task<IPluginUIView> CreateDefaultPageView()
        {
            IPluginUIView view = new LogsPageView(this.pluginInfo, this.logger);
            return Task.FromResult(view);
        }
    }

    /// <summary>
    /// Backs the <see cref="LogsPageUI"/> and re-reads
    /// <see cref="HomeScreenCompanionTask.ExecutionLog"/> on Refresh.
    /// </summary>
    public class LogsPageView : PluginPageView
    {
        public LogsPageView(PluginInfo pluginInfo, ILogger logger)
            : base(pluginInfo.Id)
        {
            this.Logger = logger;
            this.ContentData = new LogsPageUI();
            this.RefreshFromTask();
        }

        public ILogger Logger { get; }

        public LogsPageUI Page => this.ContentData as LogsPageUI;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            if (commandId == "Refresh")
            {
                this.RefreshFromTask();
                this.RaiseUIViewInfoChanged();
                return this;
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        public override Task<IPluginUIView> OnSaveCommand(string itemId, string commandId, string data)
        {
            // Read-only page; nothing to persist.
            return base.OnSaveCommand(itemId, commandId, data);
        }

        private void RefreshFromTask()
        {
            var page = this.Page;
            if (page == null) return;

            string[] lines;
            lock (HomeScreenCompanionTask.ExecutionLog)
            {
                lines = HomeScreenCompanionTask.ExecutionLog.ToArray();
            }
            page.RunLog = lines.Length == 0
                ? "(no runs yet)"
                : string.Join("\n", lines);

            page.SyncProgress = HomeScreenCompanionTask.IsRunning ? 0.5 : 1.0;
        }
    }
}
