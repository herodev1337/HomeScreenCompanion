using MediaBrowser.Common.Net;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.IO;
using MediaBrowser.Model.Providers;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Services;
using SkiaSharp;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionService
    {
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, List<PolicySnapshot>> _policySnapshots
            = new System.Collections.Concurrent.ConcurrentDictionary<string, List<PolicySnapshot>>();

        private class PolicySnapshot
        {
            public string UserId { get; set; } = "";
            public bool EnableAllFolders { get; set; }
            public string[] EnabledFolders { get; set; } = Array.Empty<string>();
        }

        public object Get(GetTopListStatusRequest request)
        {
            List<string> logs;
            lock (TopListSyncTask.ExecutionLog) { logs = TopListSyncTask.ExecutionLog.ToList(); }
            return new TopListStatusResponse
            {
                IsRunning = TopListSyncTask.IsRunning,
                LastRunStatus = TopListSyncTask.LastRunStatus,
                Logs = logs,
                StartedUtc = TopListSyncTask.LastStartedUtc?.ToString("o") ?? ""
            };
        }

        public object Post(MergeTopListVersionsRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.TagName))
                    return new MergeTopListVersionsResponse { Success = false, Message = "TagName is required." };

                var dataPath = Plugin.Instance.DataFolderPath;
                var sanitized = SanitizeFolderName(request.TagName);
                var folderPath = Path.Combine(dataPath, "toplists", sanitized);

                var (indexed, merged) = MergeTopListVersionsTask.MergeAndProbeFolder(
                    _libraryManager, _providerManager, _fileSystem, folderPath, CancellationToken.None);

                return new MergeTopListVersionsResponse { Success = true, Indexed = indexed, Merged = merged };
            }
            catch (Exception ex)
            {
                return new MergeTopListVersionsResponse { Success = false, Message = ex.Message };
            }
        }

        public object Post(PrepareTopListFolderRequest request)
        {
            try
            {
                var dataPath = Plugin.Instance.DataFolderPath;
                var sanitized = SanitizeFolderName(request.TagName);
                var folderPath = Path.Combine(dataPath, "toplists", sanitized);
                Directory.CreateDirectory(folderPath);

                // Remove stale files from a previous run
                foreach (var f in Directory.GetFiles(folderPath, "*.strm"))
                    File.Delete(f);
                foreach (var f in Directory.GetFiles(folderPath, "*.nfo"))
                    File.Delete(f);
                foreach (var f in Directory.GetFiles(folderPath, "*.jpg"))
                    File.Delete(f);

                // Write one .strm file per movie that carries this tag
                var items = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    Tags = new[] { request.TagName },
                    IncludeItemTypes = new[] { "Movie" },
                    Recursive = true,
                    IsVirtualItem = false
                }).ToList();

                // Sort by saved rank order from the last task run (preserves external list order)
                var rankFile = Path.Combine(Plugin.Instance.DataFolderPath, "tag_ranks", sanitized + ".json");
                if (File.Exists(rankFile))
                {
                    try
                    {
                        var rankIds = _jsonSerializer.DeserializeFromFile<List<string>>(rankFile);
                        if (rankIds != null && rankIds.Count > 0)
                        {
                            var rankMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                            for (int i = 0; i < rankIds.Count; i++)
                                if (!string.IsNullOrEmpty(rankIds[i])) rankMap[rankIds[i]] = i;
                            items = items.OrderBy(item =>
                            {
                                var imdb = item.GetProviderId("Imdb");
                                return (!string.IsNullOrEmpty(imdb) && rankMap.TryGetValue(imdb, out var rank)) ? rank : int.MaxValue;
                            }).ToList();
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Warn($"[TopList] Rank file '{rankFile}' could not be read: {ex.Message}");
                    }
                }

                // First pass: deduplicate and preserve query order
                var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var selected = new List<(string BaseName, string FilePath, BaseItem Item)>();
                foreach (var item in items)
                {
                    if (string.IsNullOrEmpty(item.Path)) continue;
                    var baseName = SanitizeFolderName(item.Name);
                    if (item.ProductionYear.HasValue && item.ProductionYear > 0)
                        baseName += $" ({item.ProductionYear})";
                    if (!seenKeys.Add(baseName)) continue;
                    selected.Add((baseName, item.Path, item));
                }

                // Apply max-items limit before writing
                if (request.MaxItems > 0 && selected.Count > request.MaxItems)
                    selected = selected.Take(request.MaxItems).ToList();

                // Second pass: write .strm, .nfo and ranked poster
                int digits = Math.Max(2, selected.Count.ToString().Length);
                int count = 0;
                var tempDir = Path.Combine(Path.GetTempPath(), "hsc_toplist_" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempDir);
                try
                {
                    foreach (var entry in selected)
                    {
                        count++;
                        var sortPrefix = count.ToString().PadLeft(digits, '0');
                        var fileName = entry.BaseName;
                        File.WriteAllText(Path.Combine(folderPath, fileName + ".nfo"), BuildTopListNfo(entry.Item, sortPrefix));
                        WriteRankedImages(entry.Item, count, Path.Combine(folderPath, fileName), request.BadgeStyle, tempDir);
                        // .strm last: the folder is a watched library, and Emby creates the item the
                        // moment it sees the .strm — the nfo and badged images must already be there.
                        File.WriteAllText(Path.Combine(folderPath, fileName + ".strm"), entry.FilePath);
                    }
                }
                finally { try { Directory.Delete(tempDir, true); } catch { } }

                return new PrepareTopListFolderResponse { Success = true, FolderPath = folderPath, FilesCreated = count };
            }
            catch (Exception ex)
            {
                return new PrepareTopListFolderResponse { Success = false, Message = ex.Message };
            }
        }

        public object Get(GetAllMoviesRequest request)
        {
            try
            {
                var items = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { "Movie" },
                    Recursive = true,
                    IsVirtualItem = false
                });
                var toplistsFolder = Path.Combine(Plugin.Instance.DataFolderPath, "toplists");

                // Deduplicate: movies with multiple versions (1080p + 4K) appear as separate
                // library items but share the same IMDB ID — keep only one per unique title.
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var movies = items
                    .Where(i => !string.IsNullOrEmpty(i.Path)
                             && !i.Path.StartsWith(toplistsFolder, StringComparison.OrdinalIgnoreCase))
                    .OrderBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(i => i.ProductionYear)
                    .Select(i => new MovieItem
                    {
                        Name = i.Name ?? "",
                        Year = i.ProductionYear,
                        ImdbId = i.GetProviderId("Imdb") ?? "",
                        ItemId = i.Id.ToString("N")
                    })
                    .Where(m =>
                    {
                        var key = !string.IsNullOrEmpty(m.ImdbId)
                            ? m.ImdbId
                            : $"{m.Name}|{m.Year}";
                        return seen.Add(key);
                    })
                    .ToList();

                return new GetAllMoviesResponse { Movies = movies };
            }
            catch (Exception ex)
            {
                _logger.Warn($"[TopList] GetAllMovies failed: {ex.Message}");
                return new GetAllMoviesResponse { Movies = new List<MovieItem>() };
            }
        }

        public object Post(GrantTopListLibraryAccessRequest request)
        {
            var libraryId = (request.LibraryId ?? "").Trim();
            if (string.IsNullOrEmpty(libraryId))
                return new GrantTopListLibraryAccessResponse { Success = false, Message = "LibraryId required." };

            int updated = 0;
            var errors = new List<string>();

            try
            {
                var users = _userManager.GetUserList(new UserQuery { IsDisabled = false });

                foreach (var user in users)
                {
                    try
                    {
                        var policy = _userManager.GetUserPolicy(user);
                        if (policy == null) { errors.Add($"no policy for {user.Name}"); continue; }

                        if (policy.EnableAllFolders) continue;

                        var folders = policy.EnabledFolders ?? Array.Empty<string>();
                        if (folders.Any(f => string.Equals(f, libraryId, StringComparison.OrdinalIgnoreCase)))
                            continue;

                        policy.EnabledFolders = folders.Concat(new[] { libraryId }).ToArray();

                        var internalId = _userManager.GetInternalId(user.Id.ToString());
                        _userManager.UpdateUserPolicy(internalId, policy);
                        updated++;
                    }
                    catch (Exception ex) { errors.Add($"{user.Name}: {ex.GetBaseException().Message}"); }
                }
            }
            catch (Exception ex)
            {
                return new GrantTopListLibraryAccessResponse { Success = false, Message = ex.Message };
            }

            var msg = $"Updated {updated} user(s)";
            if (errors.Count > 0) msg += $" — errors: {string.Join("; ", errors.Take(5))}";
            return new GrantTopListLibraryAccessResponse { Success = true, UsersUpdated = updated, Message = msg };
        }

        public object Post(SnapshotPoliciesRequest request)
        {
            var snapshots = new List<PolicySnapshot>();
            try
            {
                var users = _userManager.GetUserList(new UserQuery { IsDisabled = false });
                foreach (var user in users)
                {
                    try
                    {
                        var policy = _userManager.GetUserPolicy(user);
                        if (policy == null) continue;

                        snapshots.Add(new PolicySnapshot
                        {
                            UserId = user.Id.ToString(),
                            EnableAllFolders = policy.EnableAllFolders,
                            EnabledFolders = policy.EnabledFolders ?? Array.Empty<string>()
                        });
                    }
                    catch (Exception ex) { _logger.Warn($"[TopList] SnapshotPolicies: skip user '{user.Name}': {ex.Message}"); }
                }
            }
            catch (Exception ex)
            {
                return new SnapshotPoliciesResponse { Success = false, Message = ex.Message };
            }

            var snapshotId = Guid.NewGuid().ToString("N");
            _policySnapshots[snapshotId] = snapshots;

            // Prune old snapshots to avoid unbounded growth (keep max 20)
            if (_policySnapshots.Count > 20)
            {
                foreach (var key in _policySnapshots.Keys.OrderBy(k => k).Take(_policySnapshots.Count - 20).ToList())
                    _policySnapshots.TryRemove(key, out _);
            }

            return new SnapshotPoliciesResponse { Success = true, SnapshotId = snapshotId, UserCount = snapshots.Count };
        }

        public object Post(RestoreAndGrantAccessRequest request)
        {
            if (string.IsNullOrEmpty(request.SnapshotId) || string.IsNullOrEmpty(request.LibraryId))
                return new RestoreAndGrantAccessResponse { Success = false, Message = "SnapshotId and LibraryId required." };

            if (!_policySnapshots.TryRemove(request.SnapshotId, out var snapshots) || snapshots == null)
                return new RestoreAndGrantAccessResponse { Success = false, Message = "Snapshot not found or already used." };

            var libraryId = request.LibraryId.Trim();

            var users = _userManager.GetUserList(new UserQuery { IsDisabled = false });
            var userDict = users.ToDictionary(u => u.Id.ToString(), u => u, StringComparer.OrdinalIgnoreCase);
            int updated = 0;
            var errors = new List<string>();

            foreach (var snap in snapshots)
            {
                // Users who already had EnableAllFolders=true before creation have access to everything — skip.
                if (snap.EnableAllFolders) continue;

                if (!userDict.TryGetValue(snap.UserId, out var user)) continue;
                try
                {
                    var policy = _userManager.GetUserPolicy(user);
                    if (policy == null) continue;

                    // Restore to exact pre-creation state: EnableAllFolders=false + original folders + new library.
                    policy.EnableAllFolders = false;

                    var folders = snap.EnabledFolders.ToList();
                    if (!folders.Any(f => string.Equals(f, libraryId, StringComparison.OrdinalIgnoreCase)))
                        folders.Add(libraryId);
                    policy.EnabledFolders = folders.ToArray();

                    var internalId = _userManager.GetInternalId(user.Id.ToString());
                    _userManager.UpdateUserPolicy(internalId, policy);
                    updated++;
                }
                catch (Exception ex) { errors.Add($"{user.Name}: {ex.GetBaseException().Message}"); }
            }

            var msg = $"Restored access for {updated} user(s)";
            if (errors.Count > 0) msg += $" — errors: {string.Join("; ", errors.Take(5))}";
            return new RestoreAndGrantAccessResponse { Success = true, UsersUpdated = updated, Message = msg };
        }

        private void EnforceTopListLibraryPermissions(string libId, IEnumerable<string> assignedUserIds)
        {
            var normalizedLibId = (libId ?? "").Trim().Replace("-", "").ToLowerInvariant();
            if (string.IsNullOrEmpty(normalizedLibId)) return;

            var assignedSet = new HashSet<string>(
                (assignedUserIds ?? Enumerable.Empty<string>()).Select(id => id.Replace("-", "").ToLowerInvariant()),
                StringComparer.OrdinalIgnoreCase);

            foreach (var user in _userManager.GetUserList(new UserQuery { IsDisabled = false }))
            {
                try
                {
                    var policy = _userManager.GetUserPolicy(user);
                    if (policy == null) continue;

                    if (policy.EnableAllFolders) continue;

                    var folders = policy.EnabledFolders ?? Array.Empty<string>();

                    var userNormId = user.Id.ToString().Replace("-", "").ToLowerInvariant();
                    var hasAccess = folders.Any(f => string.Equals(f.Replace("-", ""), normalizedLibId, StringComparison.OrdinalIgnoreCase));
                    var shouldHaveAccess = assignedSet.Contains(userNormId);

                    if (shouldHaveAccess == hasAccess) continue;

                    string[] newFolders;
                    if (shouldHaveAccess)
                        newFolders = folders.Concat(new[] { normalizedLibId }).ToArray();
                    else
                        newFolders = folders.Where(f => !string.Equals(f.Replace("-", ""), normalizedLibId, StringComparison.OrdinalIgnoreCase)).ToArray();

                    policy.EnabledFolders = newFolders;

                    var internalId = _userManager.GetInternalId(user.Id.ToString());
                    _userManager.UpdateUserPolicy(internalId, policy);
                }
                catch (Exception ex) { _logger.Warn($"[TopList] UpdateUserPolicy: skip user '{user.Name}': {ex.Message}"); }
            }
        }

        public object Post(PrepareManualTopListFolderRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.ListName))
                    return new PrepareTopListFolderResponse { Success = false, Message = "ListName is required." };

                var dataPath = Plugin.Instance.DataFolderPath;
                var sanitized = SanitizeFolderName(request.ListName);
                var folderPath = Path.Combine(dataPath, "toplists", sanitized);
                Directory.CreateDirectory(folderPath);

                foreach (var f in Directory.GetFiles(folderPath, "*.strm")) File.Delete(f);
                foreach (var f in Directory.GetFiles(folderPath, "*.nfo")) File.Delete(f);
                foreach (var f in Directory.GetFiles(folderPath, "*.jpg")) File.Delete(f);

                var items = request.Items ?? new List<ManualTopListItem>();
                var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var selected = new List<(string BaseName, string FilePath, BaseItem Item)>();
                var strmToOriginal = new Dictionary<string, BaseItem>(StringComparer.OrdinalIgnoreCase);

                Dictionary<string, BaseItem>? imdbLookup = null;
                foreach (var entry in items)
                {
                    BaseItem? mediaItem = null;
                    if (Guid.TryParse(entry.ItemId, out var guid))
                        mediaItem = _libraryManager.GetItemById(guid);
                    // Fallback for restored backups: ItemIds are server-specific, IMDb ids are not.
                    if ((mediaItem == null || string.IsNullOrEmpty(mediaItem.Path)) && !string.IsNullOrWhiteSpace(entry.ImdbId))
                    {
                        imdbLookup ??= BuildImdbLookup();
                        imdbLookup.TryGetValue(entry.ImdbId.Trim(), out mediaItem);
                    }
                    if (mediaItem == null || string.IsNullOrEmpty(mediaItem.Path)) continue;
                    var baseName = SanitizeFolderName(mediaItem.Name);
                    if (mediaItem.ProductionYear.HasValue && mediaItem.ProductionYear > 0)
                        baseName += $" ({mediaItem.ProductionYear})";
                    if (!seenKeys.Add(baseName)) continue;
                    selected.Add((baseName, mediaItem.Path, mediaItem));
                    strmToOriginal[Path.Combine(folderPath, baseName + ".strm")] = mediaItem;
                }

                int digits = Math.Max(2, selected.Count.ToString().Length);
                int count = 0;
                var tempDir2 = Path.Combine(Path.GetTempPath(), "hsc_toplist_" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempDir2);
                try
                {
                    foreach (var entry in selected)
                    {
                        count++;
                        var sortPrefix = count.ToString().PadLeft(digits, '0');
                        File.WriteAllText(Path.Combine(folderPath, entry.BaseName + ".nfo"), BuildTopListNfo(entry.Item, sortPrefix));
                        WriteRankedImages(entry.Item, count, Path.Combine(folderPath, entry.BaseName), request.BadgeStyle, tempDir2);
                        // .strm last — see PrepareTopListFolderRequest handler.
                        File.WriteAllText(Path.Combine(folderPath, entry.BaseName + ".strm"), entry.FilePath);
                    }
                }
                finally { try { Directory.Delete(tempDir2, true); } catch { } }

                try
                {
                    var rankDir = Path.Combine(dataPath, "tag_ranks");
                    Directory.CreateDirectory(rankDir);
                    var rankIds = items.Where(i => !string.IsNullOrWhiteSpace(i.ImdbId))
                                       .Select(i => i.ImdbId).ToList();
                    _jsonSerializer.SerializeToFile(rankIds, Path.Combine(rankDir, sanitized + ".json"));
                }
                catch (Exception ex) { _logger.Warn($"[TopList] Rank file write failed for '{sanitized}': {ex.Message}"); }

                // Update ForcedSortName directly in the library database so the new order applies
                // immediately. MetadataRefreshMode=Default (used in the UI scan) won't override
                // locked SortName fields, so we must push the change through UpdateItem.
                try
                {
                    var sortPaths = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (int si = 0; si < selected.Count; si++)
                        sortPaths[Path.Combine(folderPath, selected[si].BaseName + ".strm")]
                            = (si + 1).ToString().PadLeft(digits, '0');

                    var libItems = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        Recursive = true,
                        IncludeItemTypes = new[] { "Movie" },
                        IsVirtualItem = false
                    }).Where(i => !string.IsNullOrEmpty(i.Path)
                               && i.Path.StartsWith(folderPath + Path.DirectorySeparatorChar,
                                                    StringComparison.OrdinalIgnoreCase))
                      .ToList();

                    foreach (var li in libItems)
                    {
                        if (string.IsNullOrEmpty(li.Path)) continue;

                        if (sortPaths.TryGetValue(li.Path, out var newSort))
                        {
                            var prop = li.GetType().GetProperty("SortName");
                            if (prop?.CanWrite == true) prop.SetValue(li, newSort);
                        }

                        // Point poster and thumb at our local ranked images
                        ApplyRankedImages(li, folderPath);

                        // Merge STRM as an alternate version of the original library movie.
                        try
                        {
                            if (strmToOriginal.TryGetValue(li.Path, out var origItem) && li.Id != origItem.Id)
                            {
                                _libraryManager.MergeItems(new[] { origItem, li });
                                MergeTopListVersionsTask.QueueStrmProbe(_providerManager, _fileSystem, li);
                            }
                        }
                        catch (Exception ex) { _logger.Warn($"[TopList] MergeItems failed for '{li.Path}': {ex.Message}"); }

                        try { _libraryManager.UpdateItem(li, li.Parent, ItemUpdateType.MetadataEdit, null); }
                        catch (Exception ex) { _logger.Warn($"[TopList] UpdateItem failed for '{li.Path}': {ex.Message}"); }
                    }
                }
                catch (Exception ex)
                {
                    _logger.Warn($"[TopList] Per-item processing failed in '{folderPath}': {ex.Message}");
                }

                return new PrepareTopListFolderResponse { Success = true, FolderPath = folderPath, FilesCreated = count };
            }
            catch (Exception ex)
            {
                return new PrepareTopListFolderResponse { Success = false, Message = ex.Message };
            }
        }

        // Builds the .nfo for a top-list .strm entry. Carries the original movie's IMDb/TMDb ids
        // so Emby identifies the .strm item deterministically instead of guessing from the
        // "Title (Year)" file name — a wrong guess means no merge (duplicates in the UI) or a
        // merge with the wrong film.
        internal static string BuildTopListNfo(BaseItem item, string sortPrefix)
        {
            var sb = new System.Text.StringBuilder();
            sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<movie>\n");
            sb.Append("  <sorttitle>").Append(sortPrefix).Append("</sorttitle>\n");

            var imdb = item.GetProviderId("Imdb");
            if (!string.IsNullOrWhiteSpace(imdb))
                sb.Append("  <imdbid>").Append(System.Security.SecurityElement.Escape(imdb)).Append("</imdbid>\n");
            var tmdb = item.GetProviderId("Tmdb");
            if (!string.IsNullOrWhiteSpace(tmdb))
                sb.Append("  <tmdbid>").Append(System.Security.SecurityElement.Escape(tmdb)).Append("</tmdbid>\n");

            sb.Append("  <lockedfields>SortName|Images</lockedfields>\n</movie>");
            return sb.ToString();
        }

        // Renders <outputBase>.jpg and <outputBase>-thumb.jpg for a top-list entry, badged with
        // its rank. Fetches (and if needed refreshes) the source images first.
        internal static void WriteRankedImages(
            BaseItem item, int rank, string outputBase, string badgeStyle, string tempDir,
            IHttpClient httpClient, IProviderManager providerManager, ILibraryManager libraryManager,
            IFileSystem fileSystem, Action<string>? log = null)
        {
            var (poster, thumb) = FetchImageSources(item, httpClient, tempDir, providerManager, libraryManager, fileSystem, log);

            if (poster != null)
                try { CreateRankedPoster(poster, rank, outputBase + ".jpg", badgeStyle); }
                catch (Exception ex) { log?.Invoke($"Top-list: poster badge failed for '{item.Name}' — {ex.Message}"); }

            if (thumb != null)
                try { CreateRankedPoster(thumb, rank, outputBase + "-thumb.jpg", badgeStyle); }
                catch (Exception ex) { log?.Invoke($"Top-list: thumb badge failed for '{item.Name}' — {ex.Message}"); }
        }

        private void WriteRankedImages(BaseItem item, int rank, string outputBase, string badgeStyle, string tempDir)
            => WriteRankedImages(item, rank, outputBase, badgeStyle, tempDir,
                _httpClient, _providerManager, _libraryManager, _fileSystem, m => _logger.Info(m));

        // Produces the local source files a top-list entry's ranked poster/thumb are rendered
        // from. Returned paths are files that exist on disk (or null when nothing is available).
        //
        // Thumb rows on the home screen fall back to Backdrop when an item has no Thumb, so we
        // do the same here — otherwise Emby shows its own unnumbered backdrop instead of our
        // badged image.
        //
        // The decision to refresh is based on whether the image could actually be obtained,
        // not on whether ImageInfos has a path: a path may point at a file that is gone, or at
        // a remote URL that fails to download. Only when the first attempt comes up short do
        // we run a targeted image refresh on that single item and try once more.
        internal static (string? Poster, string? Thumb) FetchImageSources(
            BaseItem item, IHttpClient httpClient, string tempDir,
            IProviderManager providerManager, ILibraryManager libraryManager, IFileSystem fileSystem,
            Action<string>? log = null)
        {
            var first = TryFetchImages(item, httpClient, tempDir);
            if (first.Poster != null && first.Thumb != null)
                return first;

            try
            {
                log?.Invoke($"Top-list: could not get {(first.Poster == null ? "poster" : "thumb/backdrop")} for '{item.Name}' — refreshing images and retrying");
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                providerManager.RefreshFullItem(item, new MetadataRefreshOptions(fileSystem)
                {
                    MetadataRefreshMode = MetadataRefreshMode.ValidationOnly,
                    ImageRefreshMode = MetadataRefreshMode.FullRefresh,
                    ReplaceAllImages = false,
                    ForceSave = true
                }, cts.Token).GetAwaiter().GetResult();

                // Re-read from the library so we see the ImageInfos the refresh persisted.
                var refreshed = libraryManager.GetItemById(item.InternalId) ?? item;
                var second = TryFetchImages(refreshed, httpClient, tempDir);
                var result = (second.Poster ?? first.Poster, second.Thumb ?? first.Thumb);
                if (result.Item1 == null || result.Item2 == null)
                    log?.Invoke($"Top-list: still no {(result.Item1 == null ? "poster" : "thumb/backdrop")} for '{item.Name}' after refresh — check the library's image providers");
                return result;
            }
            catch (Exception ex)
            {
                log?.Invoke($"Top-list: image refresh for '{item.Name}' failed — {ex.Message}");
                return first;
            }
        }

        private static (string? Poster, string? Thumb) TryFetchImages(BaseItem item, IHttpClient httpClient, string tempDir)
        {
            var images = item.ImageInfos ?? Array.Empty<ItemImageInfo>();
            var poster = EnsureLocalImagePath(httpClient, images.FirstOrDefault(i => i.Type == ImageType.Primary)?.Path, tempDir);
            var thumb = EnsureLocalImagePath(httpClient, images.FirstOrDefault(i => i.Type == ImageType.Thumb)?.Path, tempDir)
                      ?? EnsureLocalImagePath(httpClient, images.FirstOrDefault(i => i.Type == ImageType.Backdrop)?.Path, tempDir);
            return (poster, thumb);
        }

        // Points an already-indexed top-list .strm item at the ranked images on disk so the
        // new badge shows up without waiting for a library scan. Both files are regenerated in
        // place on every run, so DateModified must be refreshed too or Emby keeps serving the
        // previously cached (stale-numbered) image.
        internal static bool ApplyRankedImages(BaseItem li, string folderPath)
        {
            var baseName = Path.GetFileNameWithoutExtension(li.Path);
            var images = (li.ImageInfos ?? Array.Empty<ItemImageInfo>()).ToList();
            bool changed = false;

            foreach (var (type, suffix) in new[] { (ImageType.Primary, ".jpg"), (ImageType.Thumb, "-thumb.jpg") })
            {
                var path = Path.Combine(folderPath, baseName + suffix);
                if (!File.Exists(path)) continue;
                images.RemoveAll(i => i.Type == type);
                images.Add(new ItemImageInfo
                {
                    Path = path,
                    Type = type,
                    DateModified = File.GetLastWriteTimeUtc(path)
                });
                changed = true;
            }

            if (changed) li.ImageInfos = images.ToArray();
            return changed;
        }

        internal static string EnsureLocalImagePath(IHttpClient httpClient, string path, string tempDir)
        {
            if (string.IsNullOrEmpty(path)) return null;
            if (!path.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                return File.Exists(path) ? path : null;
            try
            {
                var tempPath = Path.Combine(tempDir, Guid.NewGuid().ToString("N") + ".jpg");
                using var stream = httpClient.Get(new MediaBrowser.Common.Net.HttpRequestOptions
                {
                    Url = path,
                    CancellationToken = CancellationToken.None
                }).GetAwaiter().GetResult();
                using var fs = File.Create(tempPath);
                stream.CopyTo(fs);
                return File.Exists(tempPath) ? tempPath : null;
            }
            catch
            {
                return null;
            }
        }

        internal static void CreateRankedPoster(string sourcePath, int rank, string outputPath, string badgeStyle = "neutral")
        {
            // "none" means no rank badge at all: the source image is copied as-is so the rest of
            // the pipeline (ApplyRankedImages, DateModified refresh) still finds a file on disk.
            if (string.Equals(badgeStyle, "none", StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(sourcePath, outputPath, overwrite: true);
                return;
            }

            using var original = SKBitmap.Decode(sourcePath);
            if (original == null)
                throw new InvalidOperationException($"SkiaSharp could not decode '{sourcePath}' (unsupported format or corrupt file)");

            using var surface = SKSurface.Create(new SKImageInfo(original.Width, original.Height))
                ?? throw new InvalidOperationException($"SkiaSharp could not create a {original.Width}x{original.Height} surface");
            var canvas = surface.Canvas;
            canvas.DrawBitmap(original, 0, 0);

            float shortSide = Math.Min(original.Width, original.Height);
            float radius = shortSide * 0.15f;
            float margin = shortSide * 0.04f;
            float cx = margin + radius;
            float cy = margin + radius;

            SKColor bgColor;
            SKColor textColor;
            switch (badgeStyle?.ToLowerInvariant())
            {
                case "slate-grey":
                    bgColor = new SKColor(0x41, 0x41, 0x4B, 224);
                    textColor = SKColors.White;
                    break;
                case "emby-green":
                    bgColor = new SKColor(0x52, 0xB5, 0x4B, 200);
                    textColor = SKColors.White;
                    break;
                case "ocean-blue":
                    bgColor = new SKColor(0x2E, 0x86, 0xC1, 210);
                    textColor = SKColors.White;
                    break;
                case "soft-red":
                    bgColor = new SKColor(0xC9, 0x45, 0x45, 210);
                    textColor = SKColors.White;
                    break;
                case "violet":
                    bgColor = new SKColor(0x7B, 0x52, 0xB5, 210);
                    textColor = SKColors.White;
                    break;
                default:
                    bgColor = new SKColor(0, 0, 0, 210);
                    textColor = SKColors.White;
                    break;
            }

            using var bgPaint = new SKPaint { Color = bgColor, IsAntialias = true };
            canvas.DrawCircle(cx, cy, radius, bgPaint);

            var text = rank.ToString();
            float fontSize = radius * 1.1f;

            using var fontStream = System.Reflection.Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("HomeScreenCompanion.LemonMilk.otf");
            using var typeface = fontStream != null ? SKTypeface.FromStream(fontStream) : SKTypeface.Default;
            using var textPaint = new SKPaint
            {
                Color = textColor,
                TextSize = fontSize,
                IsAntialias = true,
                Typeface = typeface
            };

            float maxTextWidth = radius * 1.6f;
            while (textPaint.MeasureText(text) > maxTextWidth && textPaint.TextSize > 1f)
                textPaint.TextSize -= 1f;

            float textWidth = textPaint.MeasureText(text);
            var metrics = textPaint.FontMetrics;
            float textX = cx - textWidth / 2;
            float textY = cy - (metrics.Ascent + metrics.Descent) / 2;
            canvas.DrawText(text, textX, textY, textPaint);

            using var image = surface.Snapshot();
            using var data = image.Encode(SKEncodedImageFormat.Jpeg, 92);
            using var stream = File.Create(outputPath);
            data.SaveTo(stream);
        }

        public object Get(GetTopListsRequest request)
        {
            try
            {
                var dataPath = Plugin.Instance.DataFolderPath;
                var topListsPath = Path.Combine(dataPath, "toplists");
                var folderNames = new List<string>();
                var movieCounts = new Dictionary<string, int>();
                if (Directory.Exists(topListsPath))
                {
                    foreach (var dir in Directory.GetDirectories(topListsPath))
                    {
                        var name = Path.GetFileName(dir);
                        folderNames.Add(name);
                        movieCounts[name.ToLowerInvariant()] = Directory.GetFiles(dir, "*.strm").Length;
                    }
                }
                return new GetTopListsResponse { FolderNames = folderNames, MovieCounts = movieCounts };
            }
            catch
            {
                return new GetTopListsResponse { FolderNames = new List<string>() };
            }
        }

        public object Get(GetManualTopListItemsRequest request)
        {
            try
            {
                var sanitized = SanitizeFolderName(request.ListName);
                var folderPath = Path.Combine(Plugin.Instance.DataFolderPath, "toplists", sanitized);
                if (!Directory.Exists(folderPath))
                    return new GetManualTopListItemsResponse { Success = false, Message = "Folder not found." };

                var config = Plugin.Instance.Configuration;
                var tlConfig = (config.TopLists ?? new System.Collections.Generic.List<TopListHomeSection>())
                    .FirstOrDefault(t => string.Equals(SanitizeFolderName(t.TagName), sanitized, StringComparison.OrdinalIgnoreCase));

                var customName = "";
                var displayMode = "";
                var imageType = "";
                var badgeStyle = "neutral";
                var userIds = new List<string>();
                if (tlConfig != null)
                {
                    try
                    {
                        var settings = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tlConfig.HomeSectionSettings ?? "{}") ?? new Dictionary<string, string>();
                        customName = settings.TryGetValue("CustomName", out var cn) ? cn : "";
                        displayMode = settings.TryGetValue("DisplayMode", out var dm) ? dm : "";
                        imageType = settings.TryGetValue("ImageType", out var it) ? it : "";
                        badgeStyle = settings.TryGetValue("BadgeStyle", out var bs) ? bs : "neutral";
                    }
                    catch (Exception ex) { _logger.Warn($"[TopList] Settings parse failed for top-list '{request.ListName}': {ex.Message}"); }
                    userIds = tlConfig.HomeSectionUserIds ?? new List<string>();
                }

                var movies = ReadTopListMovies(folderPath);

                return new GetManualTopListItemsResponse
                {
                    Success = true,
                    Movies = movies,
                    CustomName = customName,
                    DisplayMode = displayMode,
                    ImageType = imageType,
                    BadgeStyle = badgeStyle,
                    UserIds = userIds
                };
            }
            catch (Exception ex)
            {
                return new GetManualTopListItemsResponse { Success = false, Message = ex.Message };
            }
        }

        public object Post(DeleteTopListRequest request)
        {
            try
            {
                var dataPath = Plugin.Instance.DataFolderPath;
                var sanitized = SanitizeFolderName(request.TagName);
                var folderPath = Path.Combine(dataPath, "toplists", sanitized);
                if (Directory.Exists(folderPath))
                    Directory.Delete(folderPath, true);

                var config = Plugin.Instance?.Configuration;
                if (config?.TopLists != null)
                {
                    var tl = config.TopLists.FirstOrDefault(t =>
                        string.Equals(SanitizeFolderName(t.TagName), sanitized, StringComparison.OrdinalIgnoreCase));
                    if (tl != null)
                    {
                        foreach (var tracking in tl.HomeSectionTracked ?? new List<HomeSectionTracking>())
                        {
                            if (string.IsNullOrEmpty(tracking.UserId) || string.IsNullOrEmpty(tracking.SectionId)) continue;
                            try
                            {
                                var internalId = _userManager.GetInternalId(tracking.UserId);
                                _userManager.DeleteHomeSections(internalId, new[] { tracking.SectionId }, CancellationToken.None);
                            }
                            catch (Exception ex) { _logger.Warn($"[TopList] DeleteHomeSections failed for user {tracking.UserId}: {ex.Message}"); }
                        }
                        config.TopLists.Remove(tl);
                        Plugin.Instance.SaveConfiguration();
                    }
                }

                return new DeleteTopListResponse { Success = true, FolderPath = folderPath };
            }
            catch (Exception ex)
            {
                return new DeleteTopListResponse { Success = false, Message = ex.Message };
            }
        }

        public object Post(PrepareTopListHomeSectionsRequest request)
        {
            try
            {
                var config = Plugin.Instance?.Configuration;
                if (config == null)
                    return new PrepareTopListHomeSectionsResponse { Success = false, Message = "Plugin configuration not available." };

                var tl = config.TopLists?.FirstOrDefault(t =>
                    string.Equals(t.TagName, request.TagName, StringComparison.OrdinalIgnoreCase));

                if (tl == null)
                    return new PrepareTopListHomeSectionsResponse { Success = false, Message = $"TopList '{request.TagName}' not found in config." };

                var settingsDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    if (!string.IsNullOrEmpty(tl.HomeSectionSettings) && tl.HomeSectionSettings != "{}")
                        settingsDict = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tl.HomeSectionSettings) ?? settingsDict;
                }
                catch (Exception ex) { _logger.Warn($"[TopList] Settings parse failed for top-list '{tl.TagName}': {ex.Message}"); }

                if (!settingsDict.ContainsKey("SectionType"))
                    settingsDict["SectionType"] = "items";

                if (string.IsNullOrEmpty(tl.HomeSectionLibraryId) || tl.HomeSectionLibraryId == "auto")
                    return new PrepareTopListHomeSectionsResponse { Success = false, Message = "HomeSectionLibraryId is not set — library may not be ready yet." };

                var resolvedLibraryId = tl.HomeSectionLibraryId;

                // Exclude ALL libraries except this top-list's own; use GetUserViews to capture
                // Live TV's user-view ID (GetVirtualFolders does not include Live TV).
                var allLibIds = _libraryManager.GetVirtualFolders()
                    .Where(f => !string.IsNullOrEmpty(f.ItemId))
                    .Select(f => f.ItemId.Trim().ToLowerInvariant())
                    .ToList();
                var firstUserIdForViews = tl.HomeSectionUserIds?.FirstOrDefault();
                if (!string.IsNullOrEmpty(firstUserIdForViews))
                {
                    try
                    {
                        var uid = _userManager.GetInternalId(firstUserIdForViews);
                        var views = _userViewManager.GetUserViews(new MediaBrowser.Model.Library.UserViewQuery { UserId = uid });
                        if (views != null)
                        {
                            foreach (var v in views)
                            {
                                if (v == null) continue;
                                var idProp = v.GetType().GetProperty("Id");
                                if (idProp?.GetValue(v) is Guid vid && vid != Guid.Empty)
                                    allLibIds.Add(vid.ToString("N").ToLowerInvariant());
                            }
                        }
                    }
                    catch (Exception ex) { _logger.Warn($"[TopList] GetUserViews failed: {ex.Message}"); }
                }
                allLibIds = allLibIds.Distinct().ToList();
                var ownIdLower = resolvedLibraryId.Trim().ToLowerInvariant();
                var storedExclude = (settingsDict.TryGetValue("_queryExcludeViewIds", out var storedEv) ? storedEv : "")
                    .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0);
                var mergedIds = allLibIds.Concat(storedExclude).Where(id => id != ownIdLower).Distinct().ToList();
                var excStr = string.Join(",", mergedIds);
                settingsDict["_queryExcludeViewIds"] = excStr;
                settingsDict["ExcludedFolders"] = excStr;
                tl.HomeSectionSettings = _jsonSerializer.SerializeToString(settingsDict);

                var safeTag = new string((request.TagName ?? "").Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray());
                var sectionMarker = "hsc__tl__" + safeTag;

                int created = 0, updated = 0;

                foreach (var userId in (tl.HomeSectionUserIds ?? new System.Collections.Generic.List<string>()))
                {
                    try
                    {
                        var userInternalId = _userManager.GetInternalId(userId);
                        var currentSections = _userManager.GetHomeSections(userInternalId, CancellationToken.None);
                        var allSections = currentSections?.Sections ?? Array.Empty<ContentSection>();

                        var tracked = (tl.HomeSectionTracked ?? new System.Collections.Generic.List<HomeSectionTracking>())
                            .FirstOrDefault(t => t.UserId == userId);

                        ContentSection ownedSection = null;
                        if (tracked != null && !string.IsNullOrEmpty(tracked.SectionId) && !tracked.SectionId.StartsWith("hsc__"))
                            ownedSection = allSections.FirstOrDefault(s => s.Id == tracked.SectionId);
                        if (ownedSection == null && settingsDict.TryGetValue("CustomName", out var _tlFallbackName) && !string.IsNullOrEmpty(_tlFallbackName))
                            ownedSection = allSections.FirstOrDefault(s => string.Equals(s.CustomName, _tlFallbackName, StringComparison.OrdinalIgnoreCase));

                        string trackId;
                        if (ownedSection != null)
                        {
                            var updatedSection = HomeScreenCompanionTask.BuildContentSection(_jsonSerializer, settingsDict, resolvedLibraryId, ownedSection);
                            typeof(ContentSection).GetProperty("Id")?.SetValue(updatedSection, ownedSection.Id);
                            _userManager.UpdateHomeSection(userInternalId, updatedSection, CancellationToken.None);
                            trackId = ownedSection.Id ?? sectionMarker;
                            updated++;
                        }
                        else
                        {
                            var beforeIds = new HashSet<string>(
                                allSections.Where(s => !string.IsNullOrEmpty(s.Id)).Select(s => s.Id));
                            _userManager.AddHomeSection(userInternalId,
                                HomeScreenCompanionTask.BuildContentSection(_jsonSerializer, settingsDict, resolvedLibraryId),
                                CancellationToken.None);
                            var afterSections = _userManager.GetHomeSections(userInternalId, CancellationToken.None);
                            var newId = (afterSections?.Sections ?? Array.Empty<ContentSection>())
                                .Where(s => !string.IsNullOrEmpty(s.Id) && !beforeIds.Contains(s.Id))
                                .Select(s => s.Id).FirstOrDefault() ?? "";
                            trackId = !string.IsNullOrEmpty(newId) ? newId : sectionMarker;
                            created++;
                        }

                        if (tracked != null)
                            tracked.SectionId = trackId;
                        else
                        {
                            if (tl.HomeSectionTracked == null) tl.HomeSectionTracked = new System.Collections.Generic.List<HomeSectionTracking>();
                            tl.HomeSectionTracked.Add(new HomeSectionTracking { UserId = userId, SectionId = trackId });
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.Warn($"[TopList] Home section sync failed for user {userId}: {ex.Message}");
                    }
                }

                // Inject the new top-list library into _queryExcludeViewIds of every existing
                // TAG & COLLECT items-type section and apply immediately (no task run needed).
                var resolvedLibraryIdLower = resolvedLibraryId.Trim().ToLowerInvariant();
                if (!string.IsNullOrEmpty(resolvedLibraryId))
                {
                    foreach (var tc in (config.Tags ?? new System.Collections.Generic.List<TagConfig>()))
                    {
                        if (!tc.EnableHomeSection) continue;

                        var tcSettings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        try
                        {
                            if (!string.IsNullOrEmpty(tc.HomeSectionSettings) && tc.HomeSectionSettings != "{}")
                                tcSettings = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tc.HomeSectionSettings) ?? tcSettings;
                        }
                        catch (Exception ex) { _logger.Warn($"[TopList] Tag settings parse failed for '{tc.Tag}': {ex.Message}"); }

                        tcSettings.TryGetValue("SectionType", out var tcSt);
                        if (tcSt == "boxset") continue;

                        var existingExcluded = (tcSettings.TryGetValue("_queryExcludeViewIds", out var ev) ? ev : "")
                            .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(s => s.Trim()).ToList();

                        if (existingExcluded.Contains(resolvedLibraryIdLower, StringComparer.OrdinalIgnoreCase)) continue;

                        existingExcluded.Add(resolvedLibraryIdLower);
                        var tcExcStr = string.Join(",", existingExcluded);
                        tcSettings["_queryExcludeViewIds"] = tcExcStr;
                        tcSettings["ExcludedFolders"] = tcExcStr;
                        tc.HomeSectionSettings = _jsonSerializer.SerializeToString(tcSettings);

                        // Resolve tag ID for items-type query
                        if (!string.IsNullOrEmpty(tc.Tag))
                        {
                            var tagItem = _libraryManager.GetItemList(new MediaBrowser.Controller.Entities.InternalItemsQuery
                            {
                                IncludeItemTypes = new[] { "Tag" },
                                Name = tc.Tag,
                                Recursive = true
                            }).FirstOrDefault();
                            if (tagItem != null) tcSettings["_queryTagId"] = tagItem.InternalId.ToString();
                        }

                        var tcSafeTag = new string((tc.Name ?? tc.Tag ?? "").Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray());
                        var tcMarker = "hsc__" + tcSafeTag;

                        var realTracked = (tc.HomeSectionTracked ?? new System.Collections.Generic.List<HomeSectionTracking>())
                            .Where(t => !string.IsNullOrEmpty(t.SectionId) && !t.SectionId.StartsWith("hsc__"))
                            .ToList();

                        foreach (var tracking in realTracked)
                        {
                            long uid = 0;
                            try
                            {
                                uid = _userManager.GetInternalId(tracking.UserId);
                                var secs = _userManager.GetHomeSections(uid, CancellationToken.None)?.Sections ?? Array.Empty<ContentSection>();
                                var owned = secs.FirstOrDefault(s => s.Id == tracking.SectionId)
                                    ?? secs.FirstOrDefault(s => s.Subtitle == tcMarker);
                                if (owned == null) continue;
                                var updatedSec = HomeScreenCompanionTask.BuildContentSection(_jsonSerializer, tcSettings, null, owned);
                                typeof(ContentSection).GetProperty("Id")?.SetValue(updatedSec, owned.Id);
                                _userManager.UpdateHomeSection(uid, updatedSec, CancellationToken.None);
                            }
                            catch (Exception ex) { _logger.Warn($"[TopList] UpdateHomeSection failed for user {uid}: {ex.Message}"); }
                        }
                    }
                }

                // Also inject the new top-list library into other existing top-list sections.
                if (!string.IsNullOrEmpty(resolvedLibraryId))
                {
                    foreach (var otherTl in (config.TopLists ?? new System.Collections.Generic.List<TopListHomeSection>()))
                    {
                        if (otherTl == tl) continue;
                        if (string.IsNullOrEmpty(otherTl.HomeSectionLibraryId) || otherTl.HomeSectionLibraryId == "auto") continue;

                        var otherSettings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        try
                        {
                            if (!string.IsNullOrEmpty(otherTl.HomeSectionSettings) && otherTl.HomeSectionSettings != "{}")
                                otherSettings = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(otherTl.HomeSectionSettings) ?? otherSettings;
                        }
                        catch (Exception ex) { _logger.Warn($"[TopList] Other top-list settings parse failed for '{otherTl.TagName}': {ex.Message}"); }

                        var otherExisting = (otherSettings.TryGetValue("_queryExcludeViewIds", out var otherEv) ? otherEv : "")
                            .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(s => s.Trim()).ToList();

                        if (otherExisting.Contains(resolvedLibraryIdLower, StringComparer.OrdinalIgnoreCase)) continue;

                        otherExisting.Add(resolvedLibraryIdLower);
                        var otherExcStr = string.Join(",", otherExisting);
                        otherSettings["_queryExcludeViewIds"] = otherExcStr;
                        otherSettings["ExcludedFolders"] = otherExcStr;
                        otherTl.HomeSectionSettings = _jsonSerializer.SerializeToString(otherSettings);

                        var otherSafeTag = new string((otherTl.TagName ?? "").Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray());
                        var otherMarker = "hsc__tl__" + otherSafeTag;

                        var otherTracked = (otherTl.HomeSectionTracked ?? new System.Collections.Generic.List<HomeSectionTracking>())
                            .Where(t => !string.IsNullOrEmpty(t.SectionId) && !t.SectionId.StartsWith("hsc__"))
                            .ToList();

                        foreach (var tracking in otherTracked)
                        {
                            long uid = 0;
                            try
                            {
                                uid = _userManager.GetInternalId(tracking.UserId);
                                var secs = _userManager.GetHomeSections(uid, CancellationToken.None)?.Sections ?? Array.Empty<ContentSection>();
                                var owned = secs.FirstOrDefault(s => s.Id == tracking.SectionId)
                                    ?? secs.FirstOrDefault(s => s.Subtitle == otherMarker);
                                if (owned == null) continue;
                                var updatedSec = HomeScreenCompanionTask.BuildContentSection(_jsonSerializer, otherSettings, otherTl.HomeSectionLibraryId, owned);
                                typeof(ContentSection).GetProperty("Id")?.SetValue(updatedSec, owned.Id);
                                _userManager.UpdateHomeSection(uid, updatedSec, CancellationToken.None);
                            }
                            catch (Exception ex) { _logger.Warn($"[TopList] UpdateHomeSection failed for other top-list user {uid}: {ex.Message}"); }
                        }
                    }
                }

                // Aggressive: exclude the new top-list library from ALL untracked, non-library-scoped sections
                // so top-list content never bleeds into manually created or native Emby sections.
                HomeScreenCompanionTask.UpdateUntrackedSections(
                    _jsonSerializer, _userManager, config,
                    new[] { resolvedLibraryIdLower },
                    CancellationToken.None);

                EnforceTopListLibraryPermissions(resolvedLibraryId, tl.HomeSectionUserIds);

                Plugin.Instance.SaveConfiguration();
                _taskManager.QueueScheduledTask<TopListSyncTask>();
                return new PrepareTopListHomeSectionsResponse { Success = true, UsersCreated = created, UsersUpdated = updated, Message = $"Synced: {created} created, {updated} updated." };
            }
            catch (Exception ex)
            {
                return new PrepareTopListHomeSectionsResponse { Success = false, Message = ex.Message };
            }
        }

        public object Post(SyncAllTopListSectionsRequest request)
        {
            try
            {
                var (updated, msg) = TopListSyncTask.SyncAll(_libraryManager, _userViewManager, _userManager, _jsonSerializer, _logger, CancellationToken.None);
                return new SyncAllTopListSectionsResponse { Success = true, UpdatedSections = updated, Message = msg };
            }
            catch (Exception ex)
            {
                return new SyncAllTopListSectionsResponse { Success = false, Message = ex.Message };
            }
        }

        // Reads a top-list folder's .strm files in rank order (rank = <sorttitle> in the sibling .nfo)
        // and resolves each one back to its original library movie.
        private List<MovieItem> ReadTopListMovies(string folderPath)
        {
            var movies = new List<MovieItem>();
            if (!Directory.Exists(folderPath)) return movies;

            var entries = new List<(int Rank, string MoviePath)>();
            foreach (var strmFile in Directory.GetFiles(folderPath, "*.strm"))
            {
                var baseName = Path.GetFileNameWithoutExtension(strmFile);
                var nfoFile = Path.Combine(folderPath, baseName + ".nfo");
                int rank = int.MaxValue;
                if (File.Exists(nfoFile))
                {
                    try
                    {
                        var nfoContent = File.ReadAllText(nfoFile);
                        var match = System.Text.RegularExpressions.Regex.Match(nfoContent, @"<sorttitle>(\d+)</sorttitle>");
                        if (match.Success) rank = int.Parse(match.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
                    }
                    catch (Exception ex) { _logger.Warn($"[TopList] NFO rank parse failed for '{nfoFile}': {ex.Message}"); }
                }
                entries.Add((rank, File.ReadAllText(strmFile).Trim()));
            }
            entries.Sort((a, b) => a.Rank.CompareTo(b.Rank));

            // Build path→item lookup once
            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { "Movie" },
                Recursive = true,
                IsVirtualItem = false
            })
            .Where(i => !string.IsNullOrEmpty(i.Path))
            .GroupBy(i => i.Path, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (var entry in entries)
            {
                if (allItems.TryGetValue(entry.MoviePath, out var item))
                {
                    movies.Add(new MovieItem
                    {
                        Name = item.Name ?? "",
                        Year = item.ProductionYear,
                        ImdbId = item.GetProviderId("Imdb") ?? "",
                        ItemId = item.Id.ToString("N")
                    });
                }
            }
            return movies;
        }

        // Movies outside the top-list folder keyed by IMDb id — lets manual top-lists be restored
        // on a server where the ItemIds in the backup no longer match.
        private Dictionary<string, BaseItem> BuildImdbLookup()
        {
            var lookup = new Dictionary<string, BaseItem>(StringComparer.OrdinalIgnoreCase);
            try
            {
                var topListsFolder = Path.Combine(Plugin.Instance!.DataFolderPath, "toplists") + Path.DirectorySeparatorChar;
                foreach (var m in _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { "Movie" },
                    Recursive = true,
                    IsVirtualItem = false
                }))
                {
                    if (string.IsNullOrEmpty(m.Path)) continue;
                    if (m.Path.StartsWith(topListsFolder, StringComparison.OrdinalIgnoreCase)) continue;
                    var imdb = m.GetProviderId("Imdb");
                    if (!string.IsNullOrEmpty(imdb) && !lookup.ContainsKey(imdb))
                        lookup[imdb] = m;
                }
            }
            catch (Exception ex) { _logger.Warn($"[TopList] Build IMDb lookup failed: {ex.Message}"); }
            return lookup;
        }

        private static string SanitizeFolderName(string name)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var safe = new string((name ?? "unknown").Select(c => Array.IndexOf(invalid, c) >= 0 ? '_' : c).ToArray()).Trim('.');
            return string.IsNullOrWhiteSpace(safe) ? "unknown" : safe;
        }
    }
}
