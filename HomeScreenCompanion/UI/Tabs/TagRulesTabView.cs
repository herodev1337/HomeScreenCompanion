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
    /// Backs the <see cref="TagRulesTabUI"/>. Populates the rule list
    /// from <see cref="PluginConfiguration.Tags"/> on every refresh,
    /// dispatches the "+ Add new source" → <see cref="AddSourceDialog"/>
    /// round-trip, and the per-row Edit → <see cref="TagRowEditDialog"/>
    /// flow.
    /// </summary>
    internal sealed class TagRulesTabView : PluginPageView
    {
        private readonly ILogger _logger;

        public TagRulesTabView(PluginInfo pluginInfo, ILogger logger)
            : base(pluginInfo.Id)
        {
            this._logger = logger;
            this.ContentData = new TagRulesTabUI();
            this.RebuildRuleList();
            this.HelpUrl = new Uri(
                "https://github.com/herodev1337/HomeScreenCompanion/wiki/Tag-rules",
                UriKind.Absolute);
        }

        public TagRulesTabUI Page => this.ContentData as TagRulesTabUI;

        public override Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            if (commandId == TagRulesTabUI.AddSourceCommand)
            {
                // Pass a refresh hook so the rule list always rebuilds,
                // even if the Emby SDK never calls OnDialogResult for the
                // dialog that was just dismissed.
                return Task.FromResult<IPluginUIView>(new AddSourceDialog(
                    this.PluginId,
                    this._logger,
                    () =>
                    {
                        this.RebuildRuleList();
                        this.RaiseUIViewInfoChanged();
                    }));
            }

            if (commandId.StartsWith("EditRule:"))
            {
                var name = commandId.Substring("EditRule:".Length);
                var config = Plugin.Instance?.Configuration?.Tags?
                    .FirstOrDefault(t => t.Name == name);
                if (config != null)
                {
                    return Task.FromResult<IPluginUIView>(
                        new TagRowEditDialog(this.PluginId, config, this._logger));
                }
            }

            if (commandId.StartsWith("RunRule:"))
            {
                var name = commandId.Substring("RunRule:".Length);
                _ = RunRuleAsync(name);
                return Task.FromResult<IPluginUIView>(this);
            }

            if (commandId.StartsWith("DeleteRule:"))
            {
                var name = commandId.Substring("DeleteRule:".Length);
                DeleteRule(name);
                this.RebuildRuleList();
                this.RaiseUIViewInfoChanged();
                return Task.FromResult<IPluginUIView>(this);
            }

            return base.RunCommand(itemId, commandId, data);
        }

        public override void OnDialogResult(IPluginUIView dialogView, bool completedOk, object data)
        {
            // AddSourceDialog already persisted + notified the parent
            // via its onPersisted callback. Rebuild again here so the
            // SDK's OnDialogResult path (when it does fire) is also
            // idempotent.
            if (completedOk && (dialogView is AddSourceDialog || dialogView is TagRowEditDialog))
            {
                this.RebuildRuleList();
                this.RaiseUIViewInfoChanged();
            }

            base.OnDialogResult(dialogView, completedOk, data);
        }

        public void RebuildRuleList()
        {
            var page = this.Page;
            if (page == null) return;
            page.Rules.Clear();

            var tags = Plugin.Instance?.Configuration?.Tags ?? new System.Collections.Generic.List<TagConfig>();
            var filter = string.IsNullOrEmpty(page.FilterSourceType) ? "All" : page.FilterSourceType;
            var rows = tags
                .Where(t => filter == "All" || string.Equals(t.SourceType, filter, System.StringComparison.OrdinalIgnoreCase))
                .OrderBy(t => t.Name, System.StringComparer.OrdinalIgnoreCase);

            foreach (var config in rows)
            {
                var item = new GenericListItem
                {
                    PrimaryText = config.Name,
                    SecondaryText = string.IsNullOrEmpty(config.Tag)
                        ? "(no tag)"
                        : "Tag: " + config.Tag,
                    Icon = IconNames.bookmark_outline,
                    IconMode = ItemListIconMode.LargeRegular,
                    Button1 = new ButtonItem("Edit")
                    {
                        Icon = IconNames.book,
                        Data1 = "EditRule:" + config.Name,
                    },
                    Button2 = new ButtonItem("Delete")
                    {
                        Icon = IconNames.remove_circle_outline,
                        Data1 = "DeleteRule:" + config.Name,
                        ConfirmationPrompt = "Delete tag rule '" + config.Name + "'?"
                    },
                };
                page.Rules.Add(item);
            }
        }

        private void DeleteRule(string name)
        {
            var tags = Plugin.Instance?.Configuration?.Tags;
            if (tags == null) return;
            var match = tags.FirstOrDefault(t => t.Name == name);
            if (match != null)
            {
                tags.Remove(match);
                Plugin.Instance?.SaveConfiguration();
            }
        }

        private async Task RunRuleAsync(string name)
        {
            var task = HomeScreenCompanionTask.Instance;
            if (task == null) return;
            try
            {
                await task.RunSingleEntryAsync(name, System.Threading.CancellationToken.None);
            }
            catch (System.Exception ex)
            {
                this._logger?.ErrorException("[TagRulesTab] Run failed for " + name, ex);
            }
        }
    }
}
