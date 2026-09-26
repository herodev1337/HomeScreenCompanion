using System;
using System.Threading;
using System.Threading.Tasks;
using Emby.Web.GenericEdit.Elements;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;
using MediaBrowser.Model.Tasks;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backs the <see cref="LogsTabUI"/>. On construction reads
    /// <c>HomeScreenCompanionTask</c>'s static state (last run, current
    /// run, execution log) and copies it into the model. Handles the
    /// Refresh + Run full sync commands.
    /// </summary>
    internal sealed class LogsTabView : PluginPageView
    {
        private readonly ILogger _logger;
        private readonly ITaskManager _taskManager;

        public LogsTabView(
            PluginInfo pluginInfo,
            ITaskManager taskManager,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this._logger = logger;
            this._taskManager = taskManager;
            this.ContentData = new LogsTabUI();
            this.ShowSave = false;
            this.HelpUrl = new Uri(
                "https://github.com/herodev1337/HomeScreenCompanion/wiki/Logs",
                UriKind.Absolute);
            this.Refresh();
        }

        public LogsTabUI Page => this.ContentData as LogsTabUI;

        public override Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            if (commandId == LogsTabUI.RefreshCommand)
            {
                this.Refresh();
                this.RaiseUIViewInfoChanged();
                return Task.FromResult<IPluginUIView>(this);
            }

            if (commandId == LogsTabUI.RunCommand)
            {
                try
                {
                    this._taskManager.QueueScheduledTask<HomeScreenCompanionTask>();
                    this.Page.CurrentRunStatus.StatusText = "Queued";
                    this.Page.CurrentRunStatus.Status = ItemStatus.InProgress;
                    this.RaiseUIViewInfoChanged();
                }
                catch (Exception ex)
                {
                    this._logger.ErrorException("[LogsTab] Run queue failed", ex);
                    this.Page.CurrentRunStatus.StatusText = "Queue failed: " + ex.Message;
                    this.Page.CurrentRunStatus.Status = ItemStatus.Failed;
                    this.RaiseUIViewInfoChanged();
                }
                return Task.FromResult<IPluginUIView>(this);
            }

            return base.RunCommand(itemId, commandId, data);
        }

        public void Refresh()
        {
            var page = this.Page;
            if (page == null) return;

            page.LastRunStatus.StatusText = HomeScreenCompanionTask.LastRunStatus ?? "(no run yet)";
            page.LastRunStatus.Status = HomeScreenCompanionTask.IsRunning
                ? ItemStatus.InProgress
                : ItemStatus.None;

            page.CurrentRunStatus.StatusText = HomeScreenCompanionTask.IsRunning
                ? "Running…"
                : "Idle";
            page.CurrentRunStatus.Status = HomeScreenCompanionTask.IsRunning
                ? ItemStatus.InProgress
                : ItemStatus.None;

            page.LastSyncStatus.StatusText = HomeScreenCompanionTask.LastRunStatus ?? "(no run yet)";

            string[] snapshot;
            lock (HomeScreenCompanionTask.ExecutionLog)
            {
                snapshot = HomeScreenCompanionTask.ExecutionLog.ToArray();
            }
            page.RunLog = snapshot.Length == 0
                ? string.Empty
                : string.Join("\n", snapshot);
        }
    }
}
