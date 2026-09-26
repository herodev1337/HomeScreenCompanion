using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionService
    {
        // ── Backup & Restore ──────────────────────────────────────────────────────────────
        // Only configuration ("preconditions") is exported. Everything the sync tasks generate
        // (tags, collections, playlists, top-list strm/nfo/jpg files, caches, rank files) is
        // rebuilt on the next run and deliberately left out.

        private const int BackupFormatVersion = 2;

        public object Post(ExportBackupRequest request)
        {
            var config = Plugin.Instance?.Configuration;
            if (config == null) return new BackupFile();

            var file = new BackupFile
            {
                BackupVersion = BackupFormatVersion,
                PluginVersion = Plugin.Instance?.Version.ToString() ?? "0.0.0",
                CreatedUtc = DateTime.UtcNow.ToString("o")
            };

            if (request.Settings)
            {
                file.Settings = new BackupSettings
                {
                    OpenAiModel = config.OpenAiModel ?? "",
                    GeminiModel = config.GeminiModel ?? "",
                    ClaudeModel = config.ClaudeModel ?? "",
                    OllamaBaseUrl = config.OllamaBaseUrl ?? "",
                    OllamaModel = config.OllamaModel ?? "",
                    AiSystemPrompt = config.AiSystemPrompt ?? "",
                    ExtendedConsoleOutput = config.ExtendedConsoleOutput,
                    LogMissingItems = config.LogMissingItems,
                    DryRunMode = config.DryRunMode,
                    PreserveTagsOnEmptyResult = config.PreserveTagsOnEmptyResult
                };
                file.Sections.Add("Settings");
            }

            if (request.ApiKeys)
            {
                file.ApiKeys = new BackupApiKeys
                {
                    TraktClientId = config.TraktClientId ?? "",
                    MdblistApiKey = config.MdblistApiKey ?? "",
                    TmdbApiKey = config.TmdbApiKey ?? "",
                    OpenAiApiKey = config.OpenAiApiKey ?? "",
                    GeminiApiKey = config.GeminiApiKey ?? "",
                    ClaudeApiKey = config.ClaudeApiKey ?? ""
                };
                file.Sections.Add("ApiKeys");
            }

            if (request.Tags)
            {
                file.Tags = (config.Tags ?? new List<TagConfig>()).ToList();
                file.Sections.Add("Tags");
            }

            if (request.SavedFilters)
            {
                file.SavedFilters = (config.SavedFilters ?? new List<SavedMediaInfoFilter>()).ToList();
                file.Sections.Add("SavedFilters");
            }

            if (request.TopLists)
            {
                // Same rule as the Top Lists tab: a list is manual if no source group manages its tag.
                var managedTags = new HashSet<string>(
                    (config.Tags ?? new List<TagConfig>())
                        .Where(t => !string.IsNullOrWhiteSpace(t.Tag))
                        .Select(t => t.Tag.Trim()),
                    StringComparer.OrdinalIgnoreCase);
                var dataPath = Plugin.Instance!.DataFolderPath;

                file.TopLists = new List<BackupTopList>();
                foreach (var tl in config.TopLists ?? new List<TopListHomeSection>())
                {
                    if (string.IsNullOrWhiteSpace(tl.TagName)) continue;
                    var entry = new BackupTopList { Config = tl, IsManual = !managedTags.Contains(tl.TagName.Trim()) };
                    if (entry.IsManual)
                    {
                        var folderPath = Path.Combine(dataPath, "toplists", FolderNames.Sanitize(tl.TagName));
                        entry.Items = ReadTopListMovies(folderPath)
                            .Select(m => new BackupTopListItem { ImdbId = m.ImdbId, ItemId = m.ItemId, Name = m.Name, Year = m.Year })
                            .ToList();
                    }
                    file.TopLists.Add(entry);
                }
                file.Sections.Add("TopLists");
            }

            if (request.HomeSync)
            {
                file.HomeSync = new BackupHomeSync
                {
                    HomeSyncEnabled = config.HomeSyncEnabled,
                    HomeSyncSourceUserId = config.HomeSyncSourceUserId ?? "",
                    HomeSyncTargetUserIds = (config.HomeSyncTargetUserIds ?? new List<string>()).ToList(),
                    HomeSyncLibraryOrder = config.HomeSyncLibraryOrder
                };
                file.Sections.Add("HomeSync");
            }

            return file;
        }

        public object Post(ImportBackupRequest request)
        {
            var response = new ImportBackupResponse();
            try
            {
                if (string.IsNullOrWhiteSpace(request.BackupJson))
                    return Fail(response, "No backup data received.");

                var plugin = Plugin.Instance;
                if (plugin == null)
                    return Fail(response, "Plugin not initialized.");
                var config = plugin.Configuration;

                var backup = ParseBackup(request.BackupJson);
                if (backup == null)
                    return Fail(response, "The file could not be parsed as a Home Screen Companion backup.");

                bool Has(string section) => backup.Sections.Contains(section, StringComparer.OrdinalIgnoreCase);
                var knownUsers = LoadKnownUserIds();

                if (request.Settings && Has("Settings") && backup.Settings != null)
                {
                    var s = backup.Settings;
                    config.OpenAiModel = s.OpenAiModel ?? "";
                    config.GeminiModel = s.GeminiModel ?? "";
                    config.ClaudeModel = s.ClaudeModel ?? "";
                    config.OllamaBaseUrl = s.OllamaBaseUrl ?? "";
                    config.OllamaModel = s.OllamaModel ?? "";
                    config.AiSystemPrompt = s.AiSystemPrompt ?? "";
                    config.ExtendedConsoleOutput = s.ExtendedConsoleOutput;
                    config.LogMissingItems = s.LogMissingItems;
                    config.DryRunMode = s.DryRunMode;
                    config.PreserveTagsOnEmptyResult = s.PreserveTagsOnEmptyResult;
                    response.Applied.Add("Settings");
                }

                if (request.ApiKeys && Has("ApiKeys") && backup.ApiKeys != null)
                {
                    var k = backup.ApiKeys;
                    config.TraktClientId = k.TraktClientId ?? "";
                    config.MdblistApiKey = k.MdblistApiKey ?? "";
                    config.TmdbApiKey = k.TmdbApiKey ?? "";
                    config.OpenAiApiKey = k.OpenAiApiKey ?? "";
                    config.GeminiApiKey = k.GeminiApiKey ?? "";
                    config.ClaudeApiKey = k.ClaudeApiKey ?? "";
                    response.Applied.Add("API keys");
                }

                if (request.Tags && Has("Tags") && backup.Tags != null)
                {
                    config.Tags = backup.Tags.Where(t => t != null).Select(NormalizeTag).ToList();
                    foreach (var t in config.Tags)
                    {
                        var label = string.IsNullOrEmpty(t.Name) ? t.Tag : t.Name;
                        PruneUnknownUsers(t.HomeSectionUserIds, knownUsers, response.Warnings, $"Group '{label}' home section");
                        PruneUnknownUsers(t.PlaylistUserIds, knownUsers, response.Warnings, $"Group '{label}' playlist");
                        t.HomeSectionTracked.RemoveAll(x => !IsKnownUser(knownUsers, x.UserId));
                        t.PlaylistMappings.RemoveAll(x => !IsKnownUser(knownUsers, x.UserId));
                        if (!string.IsNullOrEmpty(t.AiRecentlyWatchedUserId) && !IsKnownUser(knownUsers, t.AiRecentlyWatchedUserId))
                        {
                            t.AiRecentlyWatchedUserId = "";
                            var msg = $"Group '{label}': the user for AI recently-watched context does not exist on this server – pick a new user.";
                            if (!response.Warnings.Contains(msg)) response.Warnings.Add(msg);
                        }
                    }
                    // Same grouping key as the UI (Name + unit separator + Tag)
                    var groups = config.Tags.Select(t => string.IsNullOrEmpty(t.Name) ? t.Tag : t.Name + (char)31 + t.Tag).Distinct().Count();
                    response.Applied.Add($"Tag & collection groups ({groups})");
                }

                if (request.SavedFilters && Has("SavedFilters") && backup.SavedFilters != null)
                {
                    config.SavedFilters = backup.SavedFilters.Where(f => f != null).ToList();
                    foreach (var f in config.SavedFilters) f.Filters ??= new List<MediaInfoFilter>();
                    response.Applied.Add($"Saved filters ({config.SavedFilters.Count})");
                }

                if (request.HomeSync && Has("HomeSync") && backup.HomeSync != null)
                {
                    var h = backup.HomeSync;
                    config.HomeSyncEnabled = h.HomeSyncEnabled;
                    config.HomeSyncSourceUserId = h.HomeSyncSourceUserId ?? "";
                    config.HomeSyncTargetUserIds = (h.HomeSyncTargetUserIds ?? new List<string>()).ToList();
                    config.HomeSyncLibraryOrder = h.HomeSyncLibraryOrder;
                    if (!string.IsNullOrEmpty(config.HomeSyncSourceUserId) && !IsKnownUser(knownUsers, config.HomeSyncSourceUserId))
                    {
                        config.HomeSyncSourceUserId = "";
                        if (config.HomeSyncEnabled)
                        {
                            config.HomeSyncEnabled = false;
                            response.Warnings.Add("Home screen sync: the source user does not exist on this server – sync has been disabled until you pick a new source user.");
                        }
                    }
                    PruneUnknownUsers(config.HomeSyncTargetUserIds, knownUsers, response.Warnings, "Home screen sync targets");
                    response.Applied.Add("Home screen sync");
                }

                if (request.TopLists && Has("TopLists") && backup.TopLists != null)
                {
                    var dataPath = plugin.DataFolderPath;
                    var virtualFolders = _libraryManager.GetVirtualFolders().ToList();
                    var restored = new List<TopListHomeSection>();

                    foreach (var entry in backup.TopLists)
                    {
                        var tl = entry?.Config;
                        if (tl == null || string.IsNullOrWhiteSpace(tl.TagName)) continue;
                        tl.HomeSectionUserIds ??= new List<string>();
                        tl.HomeSectionTracked ??= new List<HomeSectionTracking>();
                        if (string.IsNullOrEmpty(tl.HomeSectionSettings)) tl.HomeSectionSettings = "{}";
                        PruneUnknownUsers(tl.HomeSectionUserIds, knownUsers, response.Warnings, $"Top-list '{tl.TagName}'");
                        tl.HomeSectionTracked.RemoveAll(x => !IsKnownUser(knownUsers, x.UserId));

                        var settings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        try { settings = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tl.HomeSectionSettings) ?? settings; }
                        catch (Exception ex) { _logger.Warn($"[Backup] Settings parse failed for top-list '{tl.TagName}': {ex.Message}"); }
                        var badgeStyle = settings.TryGetValue("BadgeStyle", out var bs) && !string.IsNullOrEmpty(bs) ? bs : "neutral";
                        var folderPath = Path.Combine(dataPath, "toplists", FolderNames.Sanitize(tl.TagName));

                        // Rebuild the folder so the library (existing or about to be created) has content.
                        // Tag-based folders are refilled by every sync run anyway; manual folders only exist
                        // through PrepareManualFolder, so the backup's item list is the source of truth.
                        try
                        {
                            if (entry!.IsManual)
                            {
                                var items = (entry.Items ?? new List<BackupTopListItem>())
                                    .Select(i => new ManualTopListItem { ImdbId = i.ImdbId ?? "", ItemId = i.ItemId ?? "" })
                                    .ToList();
                                if (items.Count > 0)
                                {
                                    var r = Post(new PrepareManualTopListFolderRequest { ListName = tl.TagName, BadgeStyle = badgeStyle, Items = items }) as PrepareTopListFolderResponse;
                                    if (r == null || !r.Success)
                                        response.Warnings.Add($"Top-list '{tl.TagName}': files could not be rebuilt ({r?.Message ?? "unknown error"}).");
                                    else if (r.FilesCreated < items.Count)
                                        response.Warnings.Add($"Top-list '{tl.TagName}': {items.Count - r.FilesCreated} of {items.Count} movie(s) were not found in the library and were skipped.");
                                }
                                else
                                {
                                    Directory.CreateDirectory(folderPath);
                                    response.Warnings.Add($"Top-list '{tl.TagName}': the backup contains no movies for this manual list.");
                                }
                            }
                            else
                            {
                                var r = Post(new PrepareTopListFolderRequest { TagName = tl.TagName, MaxItems = tl.MaxItems, BadgeStyle = badgeStyle }) as PrepareTopListFolderResponse;
                                if (r == null || !r.Success)
                                    response.Warnings.Add($"Top-list '{tl.TagName}': files could not be rebuilt ({r?.Message ?? "unknown error"}).");
                            }
                        }
                        catch (Exception ex)
                        {
                            response.Warnings.Add($"Top-list '{tl.TagName}': files could not be rebuilt ({ex.Message}).");
                        }

                        var libraryId = ResolveTopListLibraryId(tl.HomeSectionLibraryId, folderPath, virtualFolders);
                        if (libraryId == null)
                        {
                            tl.HomeSectionLibraryId = "auto";
                            response.TopListsNeedingLibrary.Add(new TopListLibraryInfo
                            {
                                TagName = tl.TagName,
                                CustomName = settings.TryGetValue("CustomName", out var cn) && !string.IsNullOrEmpty(cn) ? cn : tl.TagName,
                                DisplayMode = settings.TryGetValue("DisplayMode", out var dm) ? dm : "",
                                ImageType = settings.TryGetValue("ImageType", out var it) ? it : "",
                                BadgeStyle = badgeStyle,
                                MaxItems = tl.MaxItems,
                                UserIds = tl.HomeSectionUserIds.ToList(),
                                FolderPath = folderPath
                            });
                        }
                        else
                        {
                            tl.HomeSectionLibraryId = libraryId;
                        }
                        restored.Add(tl);
                    }

                    config.TopLists = restored;
                    response.Applied.Add($"Top lists ({restored.Count})");
                }

                if (response.Applied.Count == 0)
                    return Fail(response, "Nothing selected to restore, or the selected sections are not present in the file.");

                plugin.SaveConfiguration();
                response.Success = true;
                response.Message = $"Restored {response.Applied.Count} section(s).";
                return response;
            }
            catch (Exception ex)
            {
                return Fail(response, ex.Message);
            }
        }

        // Ids of every user on this server (normalized: no dashes, lower case). Null if the lookup failed,
        // in which case the import keeps user references untouched instead of guessing.
        private HashSet<string>? LoadKnownUserIds()
        {
            try
            {
                var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var u in _userManager.GetUserList(new UserQuery()))
                    set.Add(u.Id.ToString("N"));
                return set;
            }
            catch (Exception ex)
            {
                _logger.Warn($"[Backup] LoadKnownUserIds failed: {ex.Message}");
                return null;
            }
        }

        private static bool IsKnownUser(HashSet<string>? known, string? userId)
        {
            if (known == null) return true;
            if (string.IsNullOrWhiteSpace(userId)) return false;
            return known.Contains(userId.Replace("-", "").Trim());
        }

        // Removes user ids that do not exist on this server and reports them once per context.
        // A backup restored on another server carries that server's user ids; leaving them in place
        // would make every sync run warn (or, for home sync, fail) until the user re-selects them.
        private static void PruneUnknownUsers(List<string> ids, HashSet<string>? known, List<string> warnings, string context)
        {
            if (known == null || ids == null || ids.Count == 0) return;
            var unknown = ids.Where(id => !IsKnownUser(known, id)).Distinct().ToList();
            if (unknown.Count == 0) return;
            ids.RemoveAll(id => !IsKnownUser(known, id));
            var msg = $"{context}: {unknown.Count} selected user(s) do not exist on this server and were removed – re-select users in the UI.";
            if (!warnings.Contains(msg)) warnings.Add(msg);
        }

        private static ImportBackupResponse Fail(ImportBackupResponse response, string message)
        {
            response.Success = false;
            response.Message = message;
            return response;
        }

        // Accepts both the current format (BackupFile) and legacy files, which were a raw
        // PluginConfiguration dump created by the old client-side backup button.
        private BackupFile? ParseBackup(string json)
        {
            bool isCurrentFormat = Regex.IsMatch(json, "\"BackupVersion\"\\s*:");
            if (isCurrentFormat)
            {
                BackupFile? file = null;
                try { file = _jsonSerializer.DeserializeFromString<BackupFile>(json); }
                catch (Exception ex) { _logger.Warn($"[Backup] Current-format parse failed: {ex.Message}"); }
                if (file == null) return null;
                file.Sections ??= new List<string>();
                return file;
            }

            PluginConfiguration? legacy = null;
            try { legacy = _jsonSerializer.DeserializeFromString<PluginConfiguration>(json); }
            catch (Exception ex) { _logger.Warn($"[Backup] Legacy-format parse failed: {ex.Message}"); }
            if (legacy == null) return null;
            bool HasKey(string key) => Regex.IsMatch(json, "\"" + key + "\"\\s*:");
            var result = new BackupFile { BackupVersion = 1 };
            result.Settings = new BackupSettings
            {
                OpenAiModel = legacy.OpenAiModel ?? "",
                GeminiModel = legacy.GeminiModel ?? "",
                ClaudeModel = legacy.ClaudeModel ?? "",
                OllamaBaseUrl = legacy.OllamaBaseUrl ?? "",
                OllamaModel = legacy.OllamaModel ?? "",
                AiSystemPrompt = legacy.AiSystemPrompt ?? "",
                ExtendedConsoleOutput = legacy.ExtendedConsoleOutput,
                LogMissingItems = legacy.LogMissingItems,
                DryRunMode = legacy.DryRunMode,
                PreserveTagsOnEmptyResult = legacy.PreserveTagsOnEmptyResult
            };
            result.Sections.Add("Settings");
            result.ApiKeys = new BackupApiKeys
            {
                TraktClientId = legacy.TraktClientId ?? "",
                MdblistApiKey = legacy.MdblistApiKey ?? "",
                TmdbApiKey = legacy.TmdbApiKey ?? "",
                OpenAiApiKey = legacy.OpenAiApiKey ?? "",
                GeminiApiKey = legacy.GeminiApiKey ?? "",
                ClaudeApiKey = legacy.ClaudeApiKey ?? ""
            };
            result.Sections.Add("ApiKeys");
            if (HasKey("Tags")) { result.Tags = legacy.Tags ?? new List<TagConfig>(); result.Sections.Add("Tags"); }
            if (HasKey("SavedFilters")) { result.SavedFilters = legacy.SavedFilters ?? new List<SavedMediaInfoFilter>(); result.Sections.Add("SavedFilters"); }
            return result;
        }

        // Backups written by other plugin versions may lack list properties entirely; the rest of
        // the plugin assumes they are never null.
        private static TagConfig NormalizeTag(TagConfig t)
        {
            t.Name ??= "";
            t.Tag ??= "";
            t.Url ??= "";
            t.SourceType ??= "External";
            t.LocalSourceId ??= "";
            t.LocalSources ??= new List<string>();
            t.MediaInfoConditions ??= new List<string>();
            t.MediaInfoFilters ??= new List<MediaInfoFilter>();
            t.Blacklist ??= new List<string>();
            t.ActiveIntervals ??= new List<DateInterval>();
            t.HomeSectionUserIds ??= new List<string>();
            t.HomeSectionTracked ??= new List<HomeSectionTracking>();
            t.PlaylistUserIds ??= new List<string>();
            t.PlaylistMappings ??= new List<PlaylistMapping>();
            if (string.IsNullOrEmpty(t.HomeSectionLibraryId)) t.HomeSectionLibraryId = "auto";
            if (string.IsNullOrEmpty(t.HomeSectionSettings)) t.HomeSectionSettings = "{}";
            foreach (var m in t.PlaylistMappings) m.LastSyncedItemIds ??= new List<long>();
            foreach (var f in t.MediaInfoFilters) f.Criteria ??= new List<string>();
            return t;
        }

        // Finds the Emby library for a top-list: first by the stored id, then by the folder path
        // (covers ids that changed, or a library created manually for the same folder).
        private static string? ResolveTopListLibraryId(string? storedId, string folderPath, List<VirtualFolderInfo> folders)
        {
            string Norm(string? p) => (p ?? "").Replace("\\", "/").TrimEnd('/').ToLowerInvariant();

            var stored = (storedId ?? "").Trim();
            if (stored.Length > 0 && !string.Equals(stored, "auto", StringComparison.OrdinalIgnoreCase))
            {
                var storedNorm = stored.Replace("-", "").ToLowerInvariant();
                if (folders.Any(f => !string.IsNullOrEmpty(f.ItemId) && f.ItemId.Replace("-", "").ToLowerInvariant() == storedNorm))
                    return stored;
            }

            var target = Norm(folderPath);
            var byPath = folders.FirstOrDefault(f => (f.Locations ?? Array.Empty<string>()).Any(l => Norm(l) == target));
            return string.IsNullOrEmpty(byPath?.ItemId) ? null : byPath!.ItemId;
        }
    }
}
