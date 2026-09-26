using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Picker for the type of a new tag rule. The dialog collects the
    /// source type; the parent (<c>TagRulesTabView</c>) reads it via
    /// <see cref="IPluginUIView.OnDialogResult"/> and constructs the
    /// corresponding <see cref="TagConfig"/> + <c>TagRowEditDialog</c>.
    /// </summary>
    public sealed class AddSourceDialog : PluginDialogView
    {
        public const string ResultKey = nameof(ResultKey);

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

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            var opts = this.Options;
            if (opts == null || string.IsNullOrWhiteSpace(opts.SourceType))
            {
                throw new EmbyUserException("Pick a source type.", null);
            }

            return Task.CompletedTask;
        }
    }
}
