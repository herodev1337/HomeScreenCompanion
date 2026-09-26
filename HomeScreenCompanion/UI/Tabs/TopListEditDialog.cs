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
    /// parent <c>TopListsTabView</c> populates <see cref="Source"/>
    /// from <see cref="PluginConfiguration.TopLists"/>; on OK, the
    /// dialog writes its <see cref="Model"/> back to the source.
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
        }

        public TopListHomeSection Source { get; }

        public TopListEditUI Model { get; }

        public override string Caption =>
            string.IsNullOrEmpty(this.Source?.TagName) ? "Top list" : this.Source.TagName;

        public override Task OnOkCommand(string providerId, string commandId, string data)
        {
            var m = this.Model;
            if (this.Source != null && m != null)
            {
                if (string.IsNullOrWhiteSpace(m.TagName))
                {
                    throw new EmbyUserException("Tag name is required.", null);
                }
                this.Source.TagName = m.TagName;
                this.Source.MaxItems = m.MaxItems;
                this.Source.HomeSectionLibraryId = string.IsNullOrWhiteSpace(m.LibraryId) ? "auto" : m.LibraryId;
                this.Source.HomeSectionUserIds = (m.UserIds ?? "")
                    .Split(new[] { '\n', '\r' }, System.StringSplitOptions.RemoveEmptyEntries)
                    .Select(s => s.Trim())
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
                this.Source.HomeSectionSettings = m.SettingsJson ?? "{}";
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
