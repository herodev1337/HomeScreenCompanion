using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Picker for the type of a new tag rule. The dialog collects the
    /// source type and itself persists the resulting <see cref="TagConfig"/>
    /// in <see cref="OnOkCommand"/> so the parent view only needs to refresh
    /// its list (the SDK doesn't always propagate
    /// <see cref="IPluginUIView.OnDialogResult"/> reliably across all clients).
    /// </summary>
    public sealed class AddSourceDialog : PluginDialogView
    {
        public const string ResultKey = nameof(ResultKey);
        public const string CreatedTagNameKey = nameof(CreatedTagNameKey);

        public AddSourceDialog(string pluginId)
            : base(pluginId)
        {
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
            if (plugin != null)
            {
                var config = plugin.Configuration ?? new PluginConfiguration();
                var tag = TagRuleFactory.CreateBlank(config.Tags, opts.SourceType);
                config.Tags ??= new System.Collections.Generic.List<TagConfig>();
                config.Tags.Add(tag);
                this.CreatedTag = tag;
                plugin.UpdateConfiguration(config);
            }

            return Task.CompletedTask;
        }
    }
}
