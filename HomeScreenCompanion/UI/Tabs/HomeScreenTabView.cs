using System;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Tasks;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backs the <see cref="HomeScreenTabUI"/>. Talks to the existing
    /// <c>/HomeScreenCompanion/UserSections</c> endpoint for the
    /// Manage view and triggers <see cref="HomeSectionSyncTask"/>
    /// directly (server-side) for the Copy &amp; sync view.
    /// </summary>
    internal sealed class HomeScreenTabView : PluginPageView
    {
        private readonly IHttpClient _httpClient;
        private readonly IJsonSerializer _jsonSerializer;
        private readonly IServerApplicationHost _applicationHost;
        private readonly ITaskManager _taskManager;
        private readonly ILogger _logger;

        public HomeScreenTabView(
            PluginInfo pluginInfo,
            IHttpClient httpClient,
            IJsonSerializer jsonSerializer,
            IServerApplicationHost applicationHost,
            ITaskManager taskManager,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this._httpClient = httpClient;
            this._jsonSerializer = jsonSerializer;
            this._applicationHost = applicationHost;
            this._taskManager = taskManager;
            this._logger = logger;
            this.ContentData = new HomeScreenTabUI();
            this.HelpUrl = new Uri(
                "https://github.com/herodev1337/HomeScreenCompanion/wiki/Home-screen",
                UriKind.Absolute);
        }

        public HomeScreenTabUI Page => this.ContentData as HomeScreenTabUI;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            switch (commandId)
            {
                case HomeScreenTabUI.RefreshSectionsCommand:
                    await this.RefreshSectionsAsync();
                    return this;

                case HomeScreenTabUI.SyncNowCommand:
                    await this.SyncNowAsync();
                    return this;

                case "DeleteSection:":
                    // Section deletion goes through SaveUserSections.
                    var sectionId = commandId.Substring("DeleteSection:".Length);
                    await this.DeleteSectionAsync(sectionId);
                    return this;
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        private async Task RefreshSectionsAsync()
        {
            var page = this.Page;
            if (page == null) return;

            try
            {
                var url = this.BuildLocalUrl("/HomeScreenCompanion/UserSections?UserId="
                    + Uri.EscapeDataString(page.SourceUserId ?? ""));
                var response = await this._httpClient.GetResponse(new HttpRequestOptions
                {
                    Url = url,
                    LogErrors = false,
                    CancellationToken = CancellationToken.None,
                }).ConfigureAwait(false);

                using (response)
                {
                    if (response.StatusCode != HttpStatusCode.OK)
                    {
                        page.ManageStatus.StatusText = "Refresh failed: HTTP " + response.StatusCode;
                        page.ManageStatus.Status = ItemStatus.Failed;
                        this.RaiseUIViewInfoChanged();
                        return;
                    }

                    if (response.Content == null)
                    {
                        page.ManageStatus.StatusText = "Refresh returned empty content.";
                        page.ManageStatus.Status = ItemStatus.Failed;
                        this.RaiseUIViewInfoChanged();
                        return;
                    }

                    string body;
                    using (var reader = new System.IO.StreamReader(response.Content, Encoding.UTF8))
                    {
                        body = await reader.ReadToEndAsync().ConfigureAwait(false);
                    }

                    var parsed = this._jsonSerializer.DeserializeFromString<UserSectionsResponse>(body);
                    page.Sections.Clear();
                    foreach (var section in parsed?.Sections ?? Array.Empty<ContentSection>())
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
            }
            catch (Exception ex)
            {
                this._logger.ErrorException("[HomeScreen] Refresh failed", ex);
                page.ManageStatus.StatusText = "Error: " + ex.Message;
                page.ManageStatus.Status = ItemStatus.Failed;
                this.RaiseUIViewInfoChanged();
            }
        }

        private async Task DeleteSectionAsync(string sectionId)
        {
            var page = this.Page;
            if (page == null) return;

            try
            {
                var url = this.BuildLocalUrl("/HomeScreenCompanion/UserSections?UserId="
                    + Uri.EscapeDataString(page.SourceUserId ?? ""));
                var get = await this._httpClient.GetResponse(new HttpRequestOptions
                {
                    Url = url,
                    LogErrors = false,
                    CancellationToken = CancellationToken.None,
                }).ConfigureAwait(false);

                ContentSection[] current;
                using (get)
                {
                    if (get.StatusCode != HttpStatusCode.OK || get.Content == null)
                    {
                        page.ManageStatus.StatusText = "Refresh failed.";
                        page.ManageStatus.Status = ItemStatus.Failed;
                        this.RaiseUIViewInfoChanged();
                        return;
                    }
                    using var reader = new System.IO.StreamReader(get.Content, Encoding.UTF8);
                    var body = await reader.ReadToEndAsync().ConfigureAwait(false);
                    var parsed = this._jsonSerializer.DeserializeFromString<UserSectionsResponse>(body);
                    current = parsed?.Sections ?? Array.Empty<ContentSection>();
                }

                var filtered = current
                    .Where(s => !string.Equals(s.Id, sectionId, StringComparison.OrdinalIgnoreCase))
                    .ToArray();
                var request = new SaveUserSectionsRequest
                {
                    UserId = page.SourceUserId ?? "",
                    Sections = filtered,
                };
                var requestBody = this._jsonSerializer.SerializeToString(request);
                var saveUrl = this.BuildLocalUrl("/HomeScreenCompanion/UserSections");
                var save = await this._httpClient.Post(new HttpRequestOptions
                {
                    Url = saveUrl,
                    RequestContentType = "application/json",
                    RequestContentBytes = Encoding.UTF8.GetBytes(requestBody),
                    LogErrors = false,
                    CancellationToken = CancellationToken.None,
                }).ConfigureAwait(false);

                using (save)
                {
                    if (save.StatusCode == HttpStatusCode.OK)
                    {
                        await this.RefreshSectionsAsync();
                    }
                    else
                    {
                        page.ManageStatus.StatusText = "Delete failed: HTTP " + save.StatusCode;
                        page.ManageStatus.Status = ItemStatus.Failed;
                        this.RaiseUIViewInfoChanged();
                    }
                }
            }
            catch (Exception ex)
            {
                this._logger.ErrorException("[HomeScreen] Delete failed", ex);
                page.ManageStatus.StatusText = "Error: " + ex.Message;
                page.ManageStatus.Status = ItemStatus.Failed;
                this.RaiseUIViewInfoChanged();
            }
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

        private string BuildLocalUrl(string relativePath)
        {
            string baseUrl = null;
            try { baseUrl = this._applicationHost.GetLocalHostApiUrl(); }
            catch { }
            if (string.IsNullOrEmpty(baseUrl)) return relativePath;
            return baseUrl.TrimEnd('/') + relativePath;
        }
    }
}
