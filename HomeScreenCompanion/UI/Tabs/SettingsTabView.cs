using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using HomeScreenCompanion.UIBaseClasses.Views;
using MediaBrowser.Common.Net;
using MediaBrowser.Controller;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Plugins.UI.Views;
using MediaBrowser.Model.Serialization;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backs the <see cref="SettingsTabUI"/>. Hydrates from
    /// <see cref="PluginConfiguration"/> on construction; mirrors
    /// everything back via <see cref="SettingsConfigMapper"/> on
    /// <see cref="OnSaveCommand"/>. Handles the Backup / Restore dialog
    /// round-trips by making local HTTP calls to the existing
    /// <c>/HomeScreenCompanion/Backup/Export</c> and
    /// <c>/HomeScreenCompanion/Backup/Import</c> endpoints — the dialog
    /// itself only collects user choices.
    /// </summary>
    internal sealed class SettingsTabView : PluginPageView
    {
        private readonly IHttpClient _httpClient;
        private readonly IJsonSerializer _jsonSerializer;
        private readonly IServerApplicationHost _applicationHost;
        private readonly ILogger _logger;

        public SettingsTabView(
            PluginInfo pluginInfo,
            IHttpClient httpClient,
            IJsonSerializer jsonSerializer,
            IServerApplicationHost applicationHost,
            ILogger logger)
            : base(pluginInfo.Id)
        {
            this._httpClient = httpClient;
            this._jsonSerializer = jsonSerializer;
            this._applicationHost = applicationHost;
            this._logger = logger;

            var ui = new SettingsTabUI();
            SettingsConfigMapper.HydrateFrom(ui, Plugin.Instance?.Configuration);
            this.ContentData = ui;
            this.HelpUrl = new Uri(
                "https://github.com/herodev1337/HomeScreenCompanion/wiki/Settings",
                UriKind.Absolute);
        }

        public SettingsTabUI Page => this.ContentData as SettingsTabUI;

        public override async Task<IPluginUIView> RunCommand(string itemId, string commandId, string data)
        {
            switch (commandId)
            {
                case SettingsTabUI.ExportBackupCommand:
                    return new BackupDialog(this.PluginId);

                case SettingsTabUI.ImportBackupCommand:
                    return new RestoreDialog(this.PluginId);

                case SettingsTabUI.ResetSystemPromptCommand:
                    this.Page.AiSystemPrompt = PluginConfiguration.DefaultAiSystemPrompt;
                    this.RaiseUIViewInfoChanged();
                    return this;
            }

            return await base.RunCommand(itemId, commandId, data);
        }

        public override async void OnDialogResult(IPluginUIView dialogView, bool completedOk, object data)
        {
            if (completedOk)
            {
                if (dialogView is BackupDialog backupDialog)
                {
                    await this.HandleExportAsync(backupDialog.Options);
                }
                else if (dialogView is RestoreDialog restoreDialog)
                {
                    await this.HandleImportAsync(restoreDialog.Options);
                }
            }

            base.OnDialogResult(dialogView, completedOk, data);
        }

        public override Task<IPluginUIView> OnSaveCommand(string itemId, string commandId, string data)
        {
            var ui = this.Page;
            if (ui != null && Plugin.Instance != null)
            {
                var existing = Plugin.Instance.Configuration;
                var newConfig = SettingsConfigMapper.ToPluginConfig(ui);

                // Carry forward the collections that the Settings tab doesn't
                // own — Tags / TopLists / SavedFilters / HomeSync.
                newConfig.Tags = existing.Tags;
                newConfig.TopLists = existing.TopLists;
                newConfig.SavedFilters = existing.SavedFilters;
                newConfig.HomeSyncEnabled = existing.HomeSyncEnabled;
                newConfig.HomeSyncSourceUserId = existing.HomeSyncSourceUserId;
                newConfig.HomeSyncTargetUserIds = existing.HomeSyncTargetUserIds;
                newConfig.HomeSyncLibraryOrder = existing.HomeSyncLibraryOrder;

                Plugin.Instance.UpdateConfiguration(newConfig);
            }

            return base.OnSaveCommand(itemId, commandId, data);
        }

        // ── Backup round-trip ─────────────────────────────────────────────

        private async Task HandleExportAsync(BackupOptionsUI opts)
        {
            if (opts == null) return;

            try
            {
                var url = this.BuildLocalUrl("/HomeScreenCompanion/Backup/Export");
                var body = this._jsonSerializer.SerializeToString(new ExportBackupRequest
                {
                    Settings = opts.Settings,
                    ApiKeys = opts.ApiKeys,
                    Tags = opts.Tags,
                    SavedFilters = opts.SavedFilters,
                    TopLists = opts.TopLists,
                    HomeSync = opts.HomeSync
                });

                var response = await this._httpClient.Post(new HttpRequestOptions
                {
                    Url = url,
                    RequestContentType = "application/json",
                    RequestContentBytes = Encoding.UTF8.GetBytes(body),
                    LogErrors = false,
                    CancellationToken = CancellationToken.None
                }).ConfigureAwait(false);

                using (response)
                {
                    if (response.StatusCode != HttpStatusCode.OK)
                    {
                        this._logger.Warn("[Settings] Backup export failed: HTTP {0}", response.StatusCode);
                        return;
                    }

                    if (response.Content == null)
                    {
                        this._logger.Warn("[Settings] Backup export returned empty content.");
                        return;
                    }

                    string json;
                    using (var reader = new StreamReader(response.Content, Encoding.UTF8))
                    {
                        json = await reader.ReadToEndAsync().ConfigureAwait(false);
                    }

                    // Trigger a browser download via a base64 data: URL.
                    // Browsers honor Content-Disposition for data: URLs in
                    // most modern versions, so this surfaces as a file save.
                    var bytes = Encoding.UTF8.GetBytes(json);
                    var base64 = Convert.ToBase64String(bytes);
                    this.RedirectViewUrl = "data:application/octet-stream;base64," + base64;
                    this.RaiseUIViewInfoChanged();
                }
            }
            catch (Exception ex)
            {
                this._logger.ErrorException("[Settings] Backup export failed", ex);
            }
        }

        private async Task HandleImportAsync(RestoreOptionsUI opts)
        {
            if (opts == null) return;

            try
            {
                var json = File.ReadAllText(opts.BackupFile, Encoding.UTF8);

                var url = this.BuildLocalUrl("/HomeScreenCompanion/Backup/Import");
                var body = this._jsonSerializer.SerializeToString(new ImportBackupRequest
                {
                    BackupJson = json,
                    Settings = opts.Settings,
                    ApiKeys = opts.ApiKeys,
                    Tags = opts.Tags,
                    SavedFilters = opts.SavedFilters,
                    TopLists = opts.TopLists,
                    HomeSync = opts.HomeSync
                });

                var response = await this._httpClient.Post(new HttpRequestOptions
                {
                    Url = url,
                    RequestContentType = "application/json",
                    RequestContentBytes = Encoding.UTF8.GetBytes(body),
                    LogErrors = false,
                    CancellationToken = CancellationToken.None
                }).ConfigureAwait(false);

                using (response)
                {
                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        // The endpoint may have written to PluginConfiguration;
                        // re-hydrate so the UI reflects the imported state.
                        SettingsConfigMapper.HydrateFrom(this.Page, Plugin.Instance?.Configuration);
                        this.RaiseUIViewInfoChanged();
                    }
                    else
                    {
                        this._logger.Warn("[Settings] Backup import failed: HTTP {0}", response.StatusCode);
                    }
                }
            }
            catch (Exception ex)
            {
                this._logger.ErrorException("[Settings] Backup import failed", ex);
            }
        }

        private string BuildLocalUrl(string relativePath)
        {
            string baseUrl = null;
            try
            {
                baseUrl = this._applicationHost.GetLocalHostApiUrl();
            }
            catch
            {
                // GetLocalHostApiUrl may throw early in startup before
                // the HTTP listener is up — fall back to a path-only URL.
            }

            if (string.IsNullOrEmpty(baseUrl))
            {
                return relativePath;
            }

            return baseUrl.TrimEnd('/') + relativePath;
        }
    }
}
