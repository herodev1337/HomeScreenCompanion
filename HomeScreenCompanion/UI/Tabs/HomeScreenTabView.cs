using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Emby.Web.GenericEdit.Common;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Tasks;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backs the <see cref="HomeScreenTabUI"/>. Talks to
    /// <see cref="IUserManager"/> directly (server-side, in-process) so
    /// the browser session's auth context is irrelevant — earlier we
    /// hit <c>IHttpClient.GetResponse</c> to loop back into the same
    /// server but that round-trip dropped the caller's auth header and
    /// surfaced as "Error: Unauthorized". In-process calls inherit the
    /// full server-side permission context the SDK grants to the view.
    /// The <c>Copy &amp; sync</c> view still triggers
    /// <see cref="HomeSectionSyncTask"/> via <see cref="ITaskManager"/>.
    /// </summary>
    internal sealed class HomeScreenTabView : PluginPageView
    {
        public const string UserListRefreshCommand = nameof(UserListRefreshCommand);

        private readonly IUserManager _userManager;
        private readonly ITaskManager _taskManager;
        private readonly ILogger _logger;

        public HomeScreenTabView(
            PluginInfo pluginInfo,
            IUserManager userManager,
            ITaskManager taskManager,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this._userManager = userManager;
            this._taskManager = taskManager;
            this._logger = logger;
            this.ContentData = new HomeScreenTabUI();
            this.HelpUrl = new Uri(
                "https://github.com/herodev1337/HomeScreenCompanion/wiki/Home-screen",
                UriKind.Absolute);
            this.PopulateUserOptions();
        }

        public HomeScreenTabUI Page => this.ContentData as HomeScreenTabUI;

        public override bool IsCommandAllowed(string commandKey)
        {
            if (string.Equals(commandKey, UserListRefreshCommand, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            return base.IsCommandAllowed(commandKey);
        }

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            switch (commandId)
            {
                case UserListRefreshCommand:
                    // Re-populate and refresh sections in one roundtrip.
                    this.PopulateUserOptions();
                    await this.RefreshSectionsAsync();
                    return this;

                case HomeScreenTabUI.RefreshSectionsCommand:
                    await this.RefreshSectionsAsync();
                    return this;

                case HomeScreenTabUI.SyncNowCommand:
                    await this.SyncNowAsync();
                    return this;

                case "Cancel":
                    return this;

                case "DeleteSection:":
                    // Section deletion used to round-trip through the
                    // HomeScreenCompanion/UserSections endpoint, which
                    // required re-auth. Delete in-process now.
                    var sectionId = commandId.Substring("DeleteSection:".Length);
                    await this.DeleteSectionAsync(sectionId);
                    return this;
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        /// <summary>
        /// Populates <see cref="HomeScreenTabUI.SourceUserOptions"/> with the
        /// list of non-disabled Emby users. Called on construction (admins
        /// see every user, non-admins see only themselves + admins) and
        /// after [AutoPostBack] fires on
        /// <see cref="HomeScreenTabUI.SourceUserId"/>.
        /// </summary>
        public void PopulateUserOptions()
        {
            var page = this.Page;
            if (page == null) return;

            var options = new List<EditorSelectOption>();
            try
            {
                if (this._userManager != null)
                {
                    var users = this._userManager.GetUserList(new UserQuery { IsDisabled = false })
                        ?? Array.Empty<User>();
                    foreach (var user in users.OrderBy(u => u.Name, StringComparer.OrdinalIgnoreCase))
                    {
                        if (user == null || string.IsNullOrEmpty(user.Id.ToString()))
                        {
                            continue;
                        }

                        options.Add(new EditorSelectOption(
                            user.Id.ToString(),
                            string.IsNullOrEmpty(user.Name) ? user.Id.ToString() : user.Name)
                        { IsEnabled = true });
                    }
                }
            }
            catch (Exception ex)
            {
                this._logger?.Warn("[HomeScreenTab] Failed to enumerate users: " + ex.Message);
            }

            // Always include a blank option for callers who fall back to
            // "current user" when nothing is picked.
            if (options.All(o => !string.IsNullOrEmpty(o.Value)))
            {
                options.Insert(0, new EditorSelectOption(string.Empty, "— pick a user —") { IsEnabled = true });
            }

            page.SourceUserOptions = options;
        }

        private Task RefreshSectionsAsync()
        {
            var page = this.Page;
            if (page == null) return Task.CompletedTask;

            // Make sure the dropdown has at least the picker entry before
            // we attempt anything below.
            if (page.SourceUserOptions == null || page.SourceUserOptions.Count == 0)
            {
                this.PopulateUserOptions();
            }

            var requested = page.SourceUserId ?? "";
            if (string.IsNullOrEmpty(requested))
            {
                page.ManageStatus.StatusText = "Pick a source user first.";
                page.ManageStatus.Status = ItemStatus.Unavailable;
                this.RaiseUIViewInfoChanged();
                return Task.CompletedTask;
            }

            try
            {
                var internalId = this._userManager.GetInternalId(requested);
                var result = this._userManager.GetHomeSections(internalId, CancellationToken.None);

                page.Sections.Clear();
                var sections = result?.Sections ?? Array.Empty<ContentSection>();
                foreach (var section in sections)
                {
                    page.Sections.Add(new GenericListItem
                    {
                        PrimaryText = string.IsNullOrEmpty(section.Name) ? "(no name)" : section.Name,
                        SecondaryText = section.SectionType ?? "",
                        Icon = IconNames.menu,
                        IconMode = ItemListIconMode.LargeRegular,
                        Button1 = new ButtonItem("Delete")
                        {
                            Icon = IconNames.remove_circle_outline,
                            Data1 = "DeleteSection:" + (section.Id ?? ""),
                            ConfirmationPrompt = "Delete section '" + (section.Name ?? "") + "'?"
                        },
                    });
                }

                page.ManageStatus.StatusText = "Loaded " + page.Sections.Count + " section(s).";
                page.ManageStatus.Status = ItemStatus.Succeeded;
                this.RaiseUIViewInfoChanged();
            }
            catch (Exception ex)
            {
                this._logger.ErrorException("[HomeScreen] Refresh failed", ex);
                page.ManageStatus.StatusText = "Error: " + ex.Message;
                page.ManageStatus.Status = ItemStatus.Failed;
                this.RaiseUIViewInfoChanged();
            }
            return Task.CompletedTask;
        }

        private Task DeleteSectionAsync(string sectionId)
        {
            var page = this.Page;
            if (page == null) return Task.CompletedTask;

            try
            {
                var requested = page.SourceUserId ?? "";
                if (string.IsNullOrEmpty(requested))
                {
                    page.ManageStatus.StatusText = "Pick a source user first.";
                    page.ManageStatus.Status = ItemStatus.Unavailable;
                    this.RaiseUIViewInfoChanged();
                    return Task.CompletedTask;
                }

                var internalId = this._userManager.GetInternalId(requested);
                var existing = this._userManager.GetHomeSections(internalId, CancellationToken.None);
                var current = existing?.Sections ?? Array.Empty<ContentSection>();
                var remaining = current
                    .Where(s => !string.Equals(s.Id, sectionId, StringComparison.OrdinalIgnoreCase))
                    .ToArray();

                if (current.Length == remaining.Length)
                {
                    // Section already gone — nothing to do.
                    return this.RefreshSectionsAsync();
                }

                var toDelete = current
                    .Where(s => !string.IsNullOrEmpty(s.Id)
                        && !remaining.Any(r => string.Equals(r.Id, s.Id, StringComparison.OrdinalIgnoreCase)))
                    .Select(s => s.Id)
                    .Where(id => !string.IsNullOrEmpty(id))
                    .ToArray();

                if (toDelete.Length > 0)
                {
                    this._userManager.DeleteHomeSections(
                        internalId,
                        toDelete,
                        CancellationToken.None);
                }

                // Re-order the remaining sections so Emby persists the
                // new ordering (mirrors the behaviour of the old
                // /UserSections endpoint).
                var orderedIds = remaining
                    .Where(s => !string.IsNullOrEmpty(s.Id))
                    .Select(s => s.Id)
                    .ToArray();
                for (var i = 0; i < orderedIds.Length; i++)
                {
                    this._userManager.MoveHomeSections(
                        internalId,
                        new[] { orderedIds[i] },
                        i,
                        CancellationToken.None);
                }

                // Drop tracking for deleted sections so the next run
                // re-creates them if a tag still references them.
                var deletedSet = new HashSet<string>(toDelete, StringComparer.OrdinalIgnoreCase);
                var pluginConfig = Plugin.Instance?.Configuration;
                if (pluginConfig != null && deletedSet.Count > 0)
                {
                    var changed = false;
                    foreach (var tag in pluginConfig.Tags ?? new List<TagConfig>())
                    {
                        var removed = (tag.HomeSectionTracked ?? new List<HomeSectionTracking>())
                            .Where(t => !string.IsNullOrEmpty(t.SectionId) && deletedSet.Contains(t.SectionId))
                            .ToList();
                        foreach (var t in removed)
                        {
                            (tag.HomeSectionTracked ?? (tag.HomeSectionTracked = new List<HomeSectionTracking>())).Remove(t);
                            changed = true;
                        }
                    }
                    if (changed)
                    {
                        Plugin.Instance?.SaveConfiguration();
                    }
                }

                return this.RefreshSectionsAsync();
            }
            catch (Exception ex)
            {
                this._logger.ErrorException("[HomeScreen] Delete failed", ex);
                page.ManageStatus.StatusText = "Error: " + ex.Message;
                page.ManageStatus.Status = ItemStatus.Failed;
                this.RaiseUIViewInfoChanged();
            }
            return Task.CompletedTask;
        }

        private Task SyncNowAsync()
        {
            var page = this.Page;
            if (page == null) return Task.CompletedTask;

            try
            {
                // Persist the source / target users on the plugin config so
                // HomeSectionSyncTask picks them up on its next run, then
                // queue the task.
                var config = Plugin.Instance?.Configuration;
                if (config != null)
                {
                    config.HomeSyncEnabled = true;
                    config.HomeSyncSourceUserId = page.SyncSourceUserId ?? "";
                    config.HomeSyncTargetUserIds = (page.TargetUserIds ?? "")
                        .Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => s.Trim())
                        .Where(s => !string.IsNullOrEmpty(s))
                        .ToList();
                    config.HomeSyncLibraryOrder = page.SyncLibraryOrder;
                    Plugin.Instance?.SaveConfiguration();
                }

                this._taskManager.QueueScheduledTask<HomeSectionSyncTask>();
                page.SyncStatus.StatusText = "Sync queued. See Logs for progress.";
                page.SyncStatus.Status = ItemStatus.InProgress;
                this.RaiseUIViewInfoChanged();
            }
            catch (Exception ex)
            {
                this._logger.ErrorException("[HomeScreen] Sync queue failed", ex);
                page.SyncStatus.StatusText = "Error: " + ex.Message;
                page.SyncStatus.Status = ItemStatus.Failed;
                this.RaiseUIViewInfoChanged();
            }
            return Task.CompletedTask;
        }
    }
}
