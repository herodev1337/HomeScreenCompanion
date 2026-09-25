using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Services;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionService
    {
        public object Get(VersionRequest request)
        {
            return new VersionResponse { Version = Plugin.Instance?.Version.ToString() ?? "0.0.0" };
        }

        public object Get(GetStatusRequest request)
        {
            List<string> logs;
            lock (HomeScreenCompanionTask.ExecutionLog) { logs = HomeScreenCompanionTask.ExecutionLog.ToList(); }
            return new StatusResponse
            {
                LastRunStatus = HomeScreenCompanionTask.LastRunStatus,
                Logs = logs,
                IsRunning = HomeScreenCompanionTask.IsRunning,
                StartedUtc = HomeScreenCompanionTask.LastStartedUtc?.ToString("o") ?? ""
            };
        }

        private static string GetItemTypeKey(BaseItem item)
        {
            try
            {
                dynamic d = item;
                var extraType = d.ExtraType;
                if (extraType != null)
                {
                    var s = extraType.ToString();
                    if (!string.IsNullOrEmpty(s) && s != "0" && s != "None")
                        return s; // ThemeSong, ThemeVideo, Trailer, BehindTheScenes, etc.
                }
            }
            catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException) { }
            return item.GetType().Name;
        }

        private static void DeleteOldImage(string oldFilePath, string imagesDir)
        {
            if (string.IsNullOrWhiteSpace(oldFilePath)) return;
            var fullImagesDir = Path.GetFullPath(imagesDir);
            var fullOldPath = Path.GetFullPath(oldFilePath);
            if (fullOldPath.StartsWith(fullImagesDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) && File.Exists(fullOldPath))
                File.Delete(fullOldPath);
        }

        public object Post(UploadCollectionImageRequest request)
        {
            try
            {
                var dataPath = Plugin.Instance?.DataFolderPath;
                if (dataPath == null) return new UploadCollectionImageResponse { Success = false, Message = "Plugin not initialized" };

                var imagesDir = Path.Combine(dataPath, "collection_images");
                Directory.CreateDirectory(imagesDir);

                DeleteOldImage(request.OldFilePath, imagesDir);

                var ext = Path.GetExtension(request.FileName ?? "").ToLowerInvariant();
                if (!new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" }.Contains(ext)) ext = ".jpg";

                var fileName = $"{Guid.NewGuid():N}{ext}";
                var filePath = Path.Combine(imagesDir, fileName);

                File.WriteAllBytes(filePath, Convert.FromBase64String(request.Base64Data));

                return new UploadCollectionImageResponse { Success = true, FilePath = filePath };
            }
            catch (Exception ex)
            {
                return new UploadCollectionImageResponse { Success = false, Message = ex.Message };
            }
        }

        public async Task<object> Post(FetchCollectionImageFromUrlRequest request)
        {
            try
            {
                if (!ListFetcher.IsAllowedImageUrl(request.Url))
                    return new UploadCollectionImageResponse { Success = false, Message = "Invalid URL." };

                var dataPath = Plugin.Instance?.DataFolderPath;
                if (dataPath == null) return new UploadCollectionImageResponse { Success = false, Message = "Plugin not initialized." };

                var imagesDir = Path.Combine(dataPath, "collection_images");
                Directory.CreateDirectory(imagesDir);

                DeleteOldImage(request.OldFilePath, imagesDir);

                var ext = Path.GetExtension(new Uri(request.Url).AbsolutePath).ToLowerInvariant();
                if (!new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" }.Contains(ext)) ext = ".jpg";

                var fileName = $"{Guid.NewGuid():N}{ext}";
                var filePath = Path.Combine(imagesDir, fileName);

                using (var stream = await _httpClient.Get(new MediaBrowser.Common.Net.HttpRequestOptions { Url = request.Url, CancellationToken = CancellationToken.None }))
                using (var fs = File.Create(filePath))
                {
                    await stream.CopyToAsync(fs);
                }

                return new UploadCollectionImageResponse { Success = true, FilePath = filePath };
            }
            catch (Exception ex)
            {
                return new UploadCollectionImageResponse { Success = false, Message = ex.Message };
            }
        }

        public async Task<object> Get(TestUrlRequest request)
        {
            var config = Plugin.Instance?.Configuration;
            if (config == null) return new TestUrlResponse { Success = false, Message = "Config not found" };

            var fetcher = new ListFetcher(_httpClient, _jsonSerializer);
            try
            {
                var items = await fetcher.FetchItems(request.Url, request.Limit, config.TraktClientId, config.MdblistApiKey, config.TmdbApiKey, CancellationToken.None);

                if (items == null || items.Count == 0)
                {
                    return new TestUrlResponse { Success = false, Message = "No items found. Check URL and API Keys." };
                }

                return new TestUrlResponse
                {
                    Success = true,
                    Count = items.Count,
                    Message = $"Successfully found {items.Count} items."
                };
            }
            catch (Exception ex)
            {
                return new TestUrlResponse { Success = false, Message = $"Error: {ex.Message}" };
            }
        }

        public async Task<object> Post(RunEntryRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.EntryName))
                return new RunEntryResponse { Success = false, Message = "No entry name provided" };
            var task = HomeScreenCompanionTask.Instance;
            if (task == null)
                return new RunEntryResponse { Success = false, Message = "Task not initialized" };
            var (success, message) = await task.RunSingleEntryAsync(request.EntryName, CancellationToken.None);
            return new RunEntryResponse { Success = success, Message = message };
        }

        public async Task<object> Post(TestAiSourceRequest request)
        {
            var config = Plugin.Instance?.Configuration;
            if (config == null)
                return new TestAiSourceResponse { Success = false, Message = "Plugin config not found." };

            if (string.IsNullOrWhiteSpace(request.Prompt))
                return new TestAiSourceResponse { Success = false, Message = "Prompt is required." };

            string recentlyWatchedContext = "";
            if (request.IncludeRecentlyWatched && !string.IsNullOrWhiteSpace(request.RecentlyWatchedUserId))
            {
                try
                {
                    if (Guid.TryParse(request.RecentlyWatchedUserId, out var userGuid))
                    {
                        var user = _userManager.GetUserById(userGuid);
                        if (user != null)
                        {
                            int maxCount = request.RecentlyWatchedCount > 0 ? request.RecentlyWatchedCount : 20;
                            var allLibItems = _libraryManager.GetItemList(new MediaBrowser.Controller.Entities.InternalItemsQuery
                            {
                                IncludeItemTypes = new[] { "Movie", "Series" },
                                Recursive = true,
                                IsVirtualItem = false
                            });

                            var playedItems = allLibItems
                                .Select(item => new { item, ud = _userDataManager?.GetUserData(user, item) })
                                .Where(x => x.ud?.Played == true)
                                .OrderByDescending(x => x.ud?.LastPlayedDate ?? System.DateTimeOffset.MinValue)
                                .Take(maxCount)
                                .Select(x => x.item)
                                .ToList();

                            if (playedItems.Count > 0)
                            {
                                var sb = new System.Text.StringBuilder("The user has recently watched these movies and TV shows (most recent first):\n");
                                foreach (var item in playedItems)
                                {
                                    var yearStr = item.ProductionYear.HasValue ? $" ({item.ProductionYear})" : "";
                                    var typeStr = TypeSniffing.IsSeriesLike(item.GetType()) ? "show" : "movie";
                                    sb.AppendLine($"- {item.Name}{yearStr} [{typeStr}]");
                                }
                                sb.AppendLine("Use this to personalize your recommendations.");
                                recentlyWatchedContext = sb.ToString();
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.Warn($"[AI test] Recently-watched context could not be built: {ex.Message}");
                }
            }

            var fetcher = new ListFetcher(_httpClient, _jsonSerializer);
            try
            {
                var aiItems = await fetcher.FetchAiList(
                    request.Provider,
                    request.Prompt,
                    config.OpenAiApiKey,
                    config.OpenAiModel,
                    config.GeminiApiKey,
                    config.GeminiModel,
                    config.ClaudeApiKey,
                    config.ClaudeModel,
                    config.OllamaBaseUrl,
                    config.OllamaModel,
                    config.AiSystemPrompt,
                    recentlyWatchedContext,
                    20,
                    CancellationToken.None);

                if (aiItems == null || aiItems.Count == 0)
                    return new TestAiSourceResponse { Success = false, Message = "No items returned. Check your API key and prompt." };

                var preview = aiItems.Take(5)
                    .Select(i => string.IsNullOrEmpty(i.imdb_id) ? i.title : $"{i.title} — {i.imdb_id}")
                    .ToList();

                return new TestAiSourceResponse
                {
                    Success = true,
                    Count = aiItems.Count,
                    Message = $"AI returned {aiItems.Count} items.",
                    Preview = preview
                };
            }
            catch (Exception ex)
            {
                return new TestAiSourceResponse { Success = false, Message = $"Error: {ex.Message}" };
            }
        }
    }
}
