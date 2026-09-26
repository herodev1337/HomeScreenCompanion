using System.IO;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Dialog for restoring a backup. The user picks a JSON file (the
    /// SDK file picker writes its contents into the
    /// <see cref="RestoreOptionsUI.BackupFile"/> string), toggles which
    /// sections to apply, and confirms. The parent view
    /// (<see cref="SettingsTabView"/>) reads the result via
    /// <see cref="IPluginUIView.OnDialogResult"/> and POSTs it to
    /// <c>/HomeScreenCompanion/Backup/Import</c>.
    /// </summary>
    public sealed class RestoreDialog : PluginDialogView
    {
        public RestoreDialog(string pluginId)
            : base(pluginId)
        {
            this.ContentData = new RestoreOptionsUI();
            this.OKButtonCaption = "Restore";
            this.AllowCancel = true;
            this.AllowOk = true;
        }

        public override string Caption => "Import backup";

        public override string SubCaption =>
            "Pick a backup JSON file and choose which sections to restore.";

        public RestoreOptionsUI Options => this.ContentData as RestoreOptionsUI;

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            var opts = this.Options;
            if (opts == null)
            {
                throw new EmbyUserException("Dialog model not initialised.", null);
            }

            if (string.IsNullOrWhiteSpace(opts.BackupFile) || !File.Exists(opts.BackupFile))
            {
                throw new EmbyUserException("Pick a backup JSON file first.", null);
            }

            if (!opts.Settings && !opts.ApiKeys && !opts.Tags
                && !opts.SavedFilters && !opts.TopLists && !opts.HomeSync)
            {
                throw new EmbyUserException("Pick at least one section to restore.", null);
            }

            return Task.CompletedTask;
        }
    }
}
