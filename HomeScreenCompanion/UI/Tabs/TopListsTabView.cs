using System;
using System.Linq;
using System.Threading.Tasks;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backs the <see cref="TopListsTabUI"/>. Populates the list from
    /// <see cref="PluginConfiguration.TopLists"/> on every refresh;
    /// handles the "+ Add …" sub-menu → inline edit dialog round-trip.
    /// </summary>
    internal sealed class TopListsTabView : PluginPageView
    {
        private readonly ILogger _logger;

        public TopListsTabView(PluginInfo pluginInfo, ILogger logger)
            : base(pluginInfo.Id)
        {
            this._logger = logger;
            this.ContentData = new TopListsTabUI();
            this.RebuildList();
            this.HelpUrl = new Uri(
                "https://github.com/herodev1337/HomeScreenCompanion/wiki/Top-lists",
                UriKind.Absolute);
        }

        public TopListsTabUI Page => this.ContentData as TopListsTabUI;

        public override Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            switch (commandId)
            {
                case TopListsTabUI.AddMdbListCommand:
                    return Task.FromResult<IPluginUIView>(this.OpenFor(CreateBlank("MDBList")));
                case TopListsTabUI.AddTraktCommand:
                    return Task.FromResult<IPluginUIView>(this.OpenFor(CreateBlank("Trakt")));
                case TopListsTabUI.AddTmdbCommand:
                    return Task.FromResult<IPluginUIView>(this.OpenFor(CreateBlank("TMDB")));
                case TopListsTabUI.AddManualCommand:
                    return Task.FromResult<IPluginUIView>(this.OpenFor(CreateBlank("Manual")));

                case TopListsTabUI.AddListCommand:
                    // The framework renders the sub-menu directly; this
                    // branch is hit only when the parent button itself
                    // is clicked. Returning self keeps the view stable.
                    return Task.FromResult<IPluginUIView>(this);
            }

            if (commandId.StartsWith("EditTopList:"))
            {
                var name = commandId.Substring("EditTopList:".Length);
                var entry = Plugin.Instance?.Configuration?.TopLists?
                    .FirstOrDefault(t => string.Equals(t.TagName, name, StringComparison.OrdinalIgnoreCase));
                if (entry != null)
                {
                    return Task.FromResult<IPluginUIView>(new TopListEditDialog(this.PluginId, entry));
                }
            }

            if (commandId.StartsWith("DeleteTopList:"))
            {
                var name = commandId.Substring("DeleteTopList:".Length);
                var lists = Plugin.Instance?.Configuration?.TopLists;
                if (lists != null)
                {
                    var entry = lists.FirstOrDefault(t => string.Equals(t.TagName, name, StringComparison.OrdinalIgnoreCase));
                    if (entry != null)
                    {
                        lists.Remove(entry);
                        Plugin.Instance?.SaveConfiguration();
                        this.RebuildList();
                        this.RaiseUIViewInfoChanged();
                    }
                }
                return Task.FromResult<IPluginUIView>(this);
            }

            return base.RunCommand(itemId, commandId, data);
        }

        public override void OnDialogResult(IPluginUIView dialogView, bool completedOk, object data)
        {
            if (completedOk && dialogView is TopListEditDialog edited)
            {
                var lists = Plugin.Instance?.Configuration?.TopLists;
                if (lists != null && !lists.Any(t => string.Equals(t.TagName, edited.Source.TagName, StringComparison.OrdinalIgnoreCase)))
                {
                    lists.Add(edited.Source);
                }
                Plugin.Instance?.SaveConfiguration();
                this.RebuildList();
                this.RaiseUIViewInfoChanged();
            }

            base.OnDialogResult(dialogView, completedOk, data);
        }

        public void RebuildList()
        {
            var page = this.Page;
            if (page == null) return;
            page.Lists.Clear();

            var lists = Plugin.Instance?.Configuration?.TopLists ?? new System.Collections.Generic.List<TopListHomeSection>();
            foreach (var entry in lists.OrderBy(t => t.TagName, StringComparer.OrdinalIgnoreCase))
            {
                page.Lists.Add(new GenericListItem
                {
                    PrimaryText = entry.TagName,
                    SecondaryText = "Max " + entry.MaxItems + " items",
                    Icon = IconNames.bookmarks,
                    IconMode = ItemListIconMode.LargeRegular,
                    Button1 = new ButtonItem("Edit")
                    {
                        Icon = IconNames.book,
                        Data1 = "EditTopList:" + entry.TagName,
                    },
                    Button2 = new ButtonItem("Delete")
                    {
                        Icon = IconNames.remove_circle_outline,
                        Data1 = "DeleteTopList:" + entry.TagName,
                        ConfirmationPrompt = "Delete top list '" + entry.TagName + "'?"
                    },
                });
            }
        }

        private static TopListHomeSection CreateBlank(string source)
        {
            var n = 1;
            var existing = Plugin.Instance?.Configuration?.TopLists?
                .Select(t => t.TagName)
                .ToHashSet() ?? new System.Collections.Generic.HashSet<string>();
            string name;
            do
            {
                name = source + "-List-" + n;
                n++;
            } while (existing.Contains(name));

            return new TopListHomeSection
            {
                TagName = name,
                MaxItems = 50,
                HomeSectionLibraryId = "auto",
                HomeSectionUserIds = new System.Collections.Generic.List<string>(),
                HomeSectionSettings = "{}",
            };
        }

        private TopListEditDialog OpenFor(TopListHomeSection entry)
        {
            return new TopListEditDialog(this.PluginId, entry);
        }
    }
}
