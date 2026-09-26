using HomeScreenCompanion.UIBaseClasses.Views;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Read-only dialog showing the configured release-notes URL.
    /// </summary>
    public class ReleaseNotesDialog : PluginDialogView
    {
        public ReleaseNotesDialog(string pluginId, string releaseNotesUrl)
            : base(pluginId)
        {
            this.ReleaseNotesUrl = releaseNotesUrl ?? string.Empty;
        }

        public override string Caption => "Release notes";

        public override string SubCaption =>
            string.IsNullOrWhiteSpace(this.ReleaseNotesUrl)
                ? "No release notes URL configured."
                : this.ReleaseNotesUrl;

        public string ReleaseNotesUrl { get; }
    }
}
