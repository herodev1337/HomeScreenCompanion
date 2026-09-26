using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Emby.Web.GenericEdit.Elements;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Opens a <see cref="TagRowEditDialog"/> for a single
    /// <see cref="TagConfigRow"/>. Wires the per-row Run / OpenLogs buttons
    /// to the live <c>HomeScreenCompanionTask</c> via
    /// <see cref="HomeScreenCompanionTask.RunSingleEntryAsync"/> and to the
    /// run log via <see cref="HomeScreenCompanionTask.ExecutionLog"/>.
    /// </summary>
    public static class TagRowEditor
    {
        public const string RunTagCommand = "RunTag";
        public const string OpenLogsCommand = "OpenLogs";

        public static TagRowEditDialog OpenFor(string pluginId, TagConfigRow row, ILogger logger)
        {
            return new TagRowEditDialog(pluginId, row, logger);
        }
    }

    /// <summary>
    /// Edit dialog for a single tag rule. <see cref="RunCommand"/> dispatches
    /// per-row button commands; <see cref="OnOkCommand"/> persists via
    /// <see cref="MainPageView.OnSaveCommand"/> (the framework bubbles it up).
    /// </summary>
    public class TagRowEditDialog : PluginDialogView
    {
        private readonly ILogger logger;

        public TagRowEditDialog(string pluginId, TagConfigRow row, ILogger logger)
            : base(pluginId)
        {
            this.Row = row;
            this.logger = logger;
            this.ContentData = row;
        }

        public override string Caption => this.Row?.Name ?? "Tag rule";

        public override string SubCaption => this.Row?.Tag ?? string.Empty;

        public TagConfigRow Row { get; }

        public TagConfigRow RowData => this.ContentData as TagConfigRow;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            switch (commandId)
            {
                case TagRowEditor.RunTagCommand:
                    await this.RunTagAsync();
                    this.RaiseUIViewInfoChanged();
                    return this;

                case TagRowEditor.OpenLogsCommand:
                    var logsView = new LogsDialogView(this.PluginId, this.Row);
                    return logsView;
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            var main = Plugin.Instance;
            if (main != null && main.Configuration.Tags != null)
            {
                var existing = main.Configuration.Tags.FirstOrDefault(t => t.Name == this.Row.Name);
                if (existing != null)
                {
                    existing.EnableCollection = this.Row.EnableCollection;
                    existing.CollectionName = this.Row.CollectionName;
                    existing.EnableTag = this.Row.EnableTag;
                }

                main.SaveConfiguration();
            }

            return base.OnOkCommand(providerId, commandId, data);
        }

        private async Task RunTagAsync()
        {
            var task = HomeScreenCompanionTask.Instance;
            var row = this.RowData;
            if (task == null || row == null || string.IsNullOrEmpty(row.Name))
            {
                if (row != null)
                {
                    row.RowStatus.StatusText = "Plugin task not initialised.";
                    row.RowStatus.Status = ItemStatus.Failed;
                }
                return;
            }

            try
            {
                row.RowStatus.StatusText = "Running…";
                row.RowStatus.Status = ItemStatus.InProgress;
                this.RaiseUIViewInfoChanged();

                var result = await task.RunSingleEntryAsync(row.Name, CancellationToken.None);
                row.RowStatus.StatusText = result.Success ? result.Message : "Failed: " + result.Message;
                row.RowStatus.Status = result.Success ? ItemStatus.Succeeded : ItemStatus.Failed;
            }
            catch (System.Exception ex)
            {
                this.logger?.ErrorException("[TagRow] Run failed for " + row.Name, ex);
                row.RowStatus.StatusText = "Error: " + ex.Message;
                row.RowStatus.Status = ItemStatus.Failed;
            }
        }
    }

    internal class LogsDialogView : PluginDialogView
    {
        public LogsDialogView(string pluginId, TagConfigRow row)
            : base(pluginId)
        {
            this.Row = row;
            this.ContentData = row;
            this.AllowOk = false;
            this.AllowCancel = true;
        }

        public override string Caption => "Logs — " + (this.Row?.Name ?? string.Empty);

        public override string SubCaption => "Recent run output";

        public TagConfigRow Row { get; }
    }
}
