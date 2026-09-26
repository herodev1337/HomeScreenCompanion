using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Dialog for picking which sections of a backup to export. The
    /// dialog collects the user's choices; the actual HTTP POST to
    /// <c>/HomeScreenCompanion/Backup/Export</c> is performed by the
    /// parent view (<see cref="SettingsTabView"/>) in
    /// <see cref="IPluginUIView.OnDialogResult"/>, where the
    /// <see cref="MediaBrowser.Common.Net.IHttpClient"/> dependency is
    /// available.
    /// </summary>
    public sealed class BackupDialog : PluginDialogView
    {
        public const string ResultKey = nameof(ResultKey);

        public BackupDialog(string pluginId)
            : base(pluginId)
        {
            this.ContentData = new BackupOptionsUI();
            this.OKButtonCaption = "Download";
            this.AllowCancel = true;
            this.AllowOk = true;
        }

        public override string Caption => "Export backup";

        public override string SubCaption =>
            "Choose the sections to include, then click Download.";

        public BackupOptionsUI Options => this.ContentData as BackupOptionsUI;

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            var opts = this.Options;
            if (opts == null)
            {
                throw new EmbyUserException("Dialog model not initialised.", null);
            }

            if (!opts.Settings && !opts.ApiKeys && !opts.Tags
                && !opts.SavedFilters && !opts.TopLists && !opts.HomeSync)
            {
                throw new EmbyUserException("Pick at least one section to export.", null);
            }

            return Task.CompletedTask;
        }
    }
}
