using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Inline edit dialog for a <see cref="TopListHomeSection"/>. The
    /// parent <c>TopListsTabView</c> builds the new or existing
    /// <see cref="Source"/> and hands it in. <see cref="OnOkCommand"/>
    /// persists it to <see cref="PluginConfiguration.TopLists"/> so the
    /// round-trip works even when the SDK client doesn't propagate
    /// <see cref="IPluginUIView.OnDialogResult"/>.
    /// </summary>
    public sealed class TopListEditDialog : PluginDialogView
    {
        public TopListEditDialog(string pluginId, TopListHomeSection source)
            : base(pluginId)
        {
            this.Source = source;
            this.Model = new TopListEditUI
            {
                TagName = source.TagName ?? "",
                MaxItems = source.MaxItems,
                LibraryId = source.HomeSectionLibraryId ?? "auto",
                UserIds = (source.HomeSectionUserIds ?? new List<string>()).AggregateAsLines(),
                SettingsJson = string.IsNullOrEmpty(source.HomeSectionSettings) ? "{}" : source.HomeSectionSettings,
            };
            this.ContentData = this.Model;
            this.OKButtonCaption = "Save";
        }

        public TopListHomeSection Source { get; }

        public TopListEditUI Model { get; }

        public override string Caption =>
            string.IsNullOrEmpty(this.Source?.TagName) ? "Top list" : this.Source.TagName;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            // Some SDK clients dispatch a stray "Cancel" command instead of
            // IPluginDialogView.OnCancelCommand when the user closes the
            // dialog. Swallow it explicitly so the request never bubbles up
            // as a 500.
            if (string.Equals(commandId, "Cancel", System.StringComparison.OrdinalIgnoreCase))
            {
                return this;
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            var m = this.Model;
            if (m == null)
            {
                throw new EmbyUserException("Dialog model not initialised.", null);
            }

            if (string.IsNullOrWhiteSpace(m.TagName))
            {
                throw new EmbyUserException("Tag name is required.", null);
            }

            this.Source.TagName = m.TagName.Trim();
            this.Source.MaxItems = m.MaxItems;
            this.Source.HomeSectionLibraryId = string.IsNullOrWhiteSpace(m.LibraryId) ? "auto" : m.LibraryId;
            this.Source.HomeSectionUserIds = (m.UserIds ?? "")
                .Split(new[] { '\n', '\r' }, System.StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim())
                .Where(s => !string.IsNullOrEmpty(s))
                .ToList();
            this.Source.HomeSectionSettings = m.SettingsJson ?? "{}";

            var plugin = Plugin.Instance;
            if (plugin != null)
            {
                var config = plugin.Configuration;
                if (config != null)
                {
                    if (config.TopLists == null)
                    {
                        config.TopLists = new List<TopListHomeSection>();
                    }

                    var existing = config.TopLists
                        .FirstOrDefault(t => !ReferenceEquals(t, this.Source)
                            && string.Equals(t.TagName, this.Source.TagName, System.StringComparison.OrdinalIgnoreCase));
                    if (existing == null)
                    {
                        // Brand-new row from the "+ Add list" sub-menu — persist it.
                        if (!config.TopLists.Contains(this.Source))
                        {
                            config.TopLists.Add(this.Source);
                        }
                    }

                    plugin.UpdateConfiguration(config);
                }
            }

            return base.OnOkCommand(providerId, commandId, data);
        }
    }

    internal static class StringListExtensions
    {
        public static string AggregateAsLines(this IList<string> list)
        {
            if (list == null || list.Count == 0) return string.Empty;
            return string.Join("\n", list);
        }
    }
}
