using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Full edit dialog for a single tag rule. <see cref="Model"/> is
    /// a <see cref="TagRuleEditUI"/> that mirrors <see cref="TagConfig"/>'s
    /// six sub-tabs (Sources / Schedule / MediaInfo / Collection /
    /// Home Section / Playlist). <see cref="RunCommand"/> dispatches
    /// the per-row Run / OpenLogs buttons; <see cref="OnOkCommand"/>
    /// writes the dialog's contents back to the underlying
    /// <see cref="TagConfig"/> and persists it.
    /// </summary>
    public sealed class TagRowEditDialog : PluginDialogView
    {
        public const string RunTagCommand = "RunTag";
        public const string OpenLogsCommand = "OpenLogs";

        private readonly ILogger _logger;

        public TagRowEditDialog(string pluginId, TagConfig source, ILogger logger)
            : base(pluginId)
        {
            this._logger = logger;
            this.Source = source;
            this.Model = new TagRuleEditUI();
            TagRuleConfigMapper.HydrateFrom(this.Model, source);
            this.ContentData = this.Model;
        }

        public TagConfig Source { get; }

        public TagRuleEditUI Model { get; }

        public override string Caption =>
            string.IsNullOrEmpty(this.Source?.Name) ? "Tag rule" : this.Source.Name;

        public override string SubCaption =>
            string.IsNullOrEmpty(this.Source?.Tag) ? "Edit tag rule" : "Tag: " + this.Source.Tag;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            switch (commandId)
            {
                case RunTagCommand:
                    await this.RunTagAsync();
                    this.RaiseUIViewInfoChanged();
                    return this;

                case OpenLogsCommand:
                    return new LogsDialogView(this.PluginId, this.Source);
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            if (this.Source != null && Plugin.Instance != null)
            {
                TagRuleConfigMapper.ApplyTo(this.Model, this.Source);
                this.Source.LastModified = DateTime.UtcNow;
                Plugin.Instance.SaveConfiguration();
            }

            return base.OnOkCommand(providerId, commandId, data);
        }

        private async Task RunTagAsync()
        {
            var task = HomeScreenCompanionTask.Instance;
            var source = this.Source;
            if (task == null || source == null || string.IsNullOrEmpty(source.Name))
            {
                return;
            }

            try
            {
                var result = await task.RunSingleEntryAsync(source.Name, System.Threading.CancellationToken.None);
                this.Model.Name = source.Name; // refresh
                this.RaiseUIViewInfoChanged();
            }
            catch (Exception ex)
            {
                this._logger?.ErrorException("[TagRow] Run failed for " + source.Name, ex);
            }
        }
    }

    internal sealed class LogsDialogView : PluginDialogView
    {
        public LogsDialogView(string pluginId, TagConfig source)
            : base(pluginId)
        {
            this.Source = source;
            this.AllowOk = false;
            this.AllowCancel = true;
        }

        public TagConfig Source { get; }

        public override string Caption =>
            "Logs — " + (this.Source?.Name ?? string.Empty);

        public override string SubCaption => "Recent run output";
    }
}
