using System;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Picker for the type of a new tag rule. The dialog collects the
    /// source type and itself persists the resulting <see cref="TagConfig"/>
    /// in <see cref="OnOkCommand"/>. After persistence it invokes the
    /// caller-supplied <see cref="OnPersisted"/> hook so the parent page
    /// can refresh its list — the SDK does not always propagate
    /// <see cref="IPluginUIView.OnDialogResult"/> reliably across all
    /// clients, so we wire the refresh explicitly.
    /// </summary>
    public sealed class AddSourceDialog : PluginDialogView
    {
        public const string ResultKey = nameof(ResultKey);
        public const string CreatedTagNameKey = nameof(CreatedTagNameKey);

        private readonly ILogger _logger;
        private readonly Action _onPersisted;

        public AddSourceDialog(string pluginId)
            : this(pluginId, null, null)
        {
        }

        public AddSourceDialog(string pluginId, ILogger logger, Action onPersisted)
            : base(pluginId)
        {
            this._logger = logger;
            this._onPersisted = onPersisted;
            this.ContentData = new AddSourceOptionsUI();
            this.OKButtonCaption = "Add";
            this.AllowCancel = true;
            this.AllowOk = true;
        }

        public override string Caption => "Add tag rule";

        public override string SubCaption =>
            "Pick a source type. You can fine-tune the rule in the next step.";

        public AddSourceOptionsUI Options => this.ContentData as AddSourceOptionsUI;

        public TagConfig CreatedTag { get; private set; }

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            var opts = this.Options;
            if (opts == null || string.IsNullOrWhiteSpace(opts.SourceType))
            {
                throw new EmbyUserException("Pick a source type.", null);
            }

            var plugin = Plugin.Instance;
            if (plugin == null)
            {
                throw new InvalidOperationException("Plugin instance is not available.");
            }

            // Defensive read: BasePluginCommon always seeds Configuration
            // via XML deserialisation on construction, but a corrupted or
            // pristine install can surface as null. Fall back to a fresh
            // default if so — we still need a Tags list to attach to.
            var config = plugin.Configuration;
            if (config == null)
            {
                _logger?.Warn("[AddSourceDialog] plugin.Configuration was null; constructing a fresh PluginConfiguration.");
                config = new PluginConfiguration();
            }

            if (config.Tags == null)
            {
                config.Tags = new System.Collections.Generic.List<TagConfig>();
            }

            var tag = TagRuleFactory.CreateBlank(config.Tags, opts.SourceType);
            config.Tags.Add(tag);
            this.CreatedTag = tag;
            plugin.UpdateConfiguration(config);

            _logger?.Info("[AddSourceDialog] Created new tag rule '" + tag.Name + "' of type '" + tag.SourceType + "'. Total tags now: " + config.Tags.Count);

            // Always re-render the parent page after persistence, even
            // if the SDK doesn't fire OnDialogResult for us.
            try { this._onPersisted?.Invoke(); }
            catch (Exception ex) { _logger?.ErrorException("[AddSourceDialog] onPersisted callback threw", ex); }

            return Task.CompletedTask;
        }
    }
}
