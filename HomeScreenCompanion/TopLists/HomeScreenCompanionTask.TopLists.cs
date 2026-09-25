// Partial of HomeScreenCompanionTask — TopLists responsibilities (folder sync, item collection for top-list folders).
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        private void SyncTopListFolders(PluginConfiguration config, bool dryRun)
        {
            var dataPath = Plugin.Instance.DataFolderPath;
            var topListsPath = Path.Combine(dataPath, "toplists");

            var configuredNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var tl in config.TopLists ?? new List<TopListHomeSection>())
                if (!string.IsNullOrWhiteSpace(tl.TagName))
                    configuredNames.Add(SanitizeTopListFolderName(tl.TagName));

            // Remove folders for tags that no longer exist in config
            if (Directory.Exists(topListsPath))
            {
                foreach (var dir in Directory.GetDirectories(topListsPath))
                {
                    var folderName = Path.GetFileName(dir);
                    if (!configuredNames.Contains(folderName))
                    {
                        if (!dryRun)
                        {
                            try { Directory.Delete(dir, true); }
                            catch (Exception ex) { _log.Warn($"Top-list '{folderName}': folder could not be removed: {ex.Message}"); }
                        }
                        _log.Skip($"Top-list '{folderName}': folder {(dryRun ? "would be removed" : "removed")} (no longer configured)");
                    }
                }
            }

            if (dryRun) return;

            // Build lookup of original (non-strm) movies keyed by IMDb ID so we can link
            // each top-list STRM item to its source as an Emby alternate version.
            var topListsFolder = Path.Combine(dataPath, "toplists") + Path.DirectorySeparatorChar;
            var origLookup = new Dictionary<string, BaseItem>(StringComparer.OrdinalIgnoreCase);
            try
            {
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
                    if (!string.IsNullOrEmpty(imdb) && !origLookup.ContainsKey(imdb))
                        origLookup[imdb] = m;
                }
            }
            catch { }

            // Build set of tag names that are managed by the plugin's source groups.
            // Manual top-lists have names that don't match any source tag, so they are
            // excluded here — their .strm files are maintained by the UI (PrepareManualFolder)
            // and must not be wiped by the automatic sync.
            var managedTagNames = new HashSet<string>(
                (config.Tags ?? new List<TagConfig>())
                    .Where(t => !string.IsNullOrWhiteSpace(t.Tag))
                    .Select(t => t.Tag.Trim()),
                StringComparer.OrdinalIgnoreCase
            );

            // Recreate .strm/.nfo files for each tag-based top-list
            foreach (var tl in config.TopLists ?? new List<TopListHomeSection>())
            {
                if (string.IsNullOrWhiteSpace(tl.TagName)) continue;
                if (!managedTagNames.Contains(tl.TagName)) continue;

                var sanitized = SanitizeTopListFolderName(tl.TagName);
                var folderPath = Path.Combine(topListsPath, sanitized);
                Directory.CreateDirectory(folderPath);

                foreach (var f in Directory.GetFiles(folderPath, "*.strm")) File.Delete(f);
                foreach (var f in Directory.GetFiles(folderPath, "*.nfo")) File.Delete(f);
                foreach (var f in Directory.GetFiles(folderPath, "*.jpg")) File.Delete(f);

                var badgeStyle = "neutral";
                int effectiveMaxItems = tl.MaxItems;
                if (!string.IsNullOrEmpty(tl.HomeSectionSettings) && tl.HomeSectionSettings != "{}")
                {
                    try
                    {
                        var tlSettings = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tl.HomeSectionSettings);
                        if (tlSettings != null && tlSettings.TryGetValue("BadgeStyle", out var bs) && !string.IsNullOrEmpty(bs))
                            badgeStyle = bs;
                        if (effectiveMaxItems <= 0 && tlSettings != null
                            && tlSettings.TryGetValue("MaxItems", out var miStr)
                            && int.TryParse(miStr, out var parsedMax) && parsedMax > 0)
                            effectiveMaxItems = parsedMax;
                    }
                    catch { }
                }

                var items = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    Tags = new[] { tl.TagName },
                    IncludeItemTypes = new[] { "Movie" },
                    Recursive = true,
                    IsVirtualItem = false
                }).ToList();

                var rankFile = Path.Combine(dataPath, "tag_ranks", sanitized + ".json");
                if (File.Exists(rankFile))
                {
                    try
                    {
                        var rankIds = _jsonSerializer.DeserializeFromFile<List<string>>(rankFile);
                        if (rankIds?.Count > 0)
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
                    catch { }
                }

                var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var selected = new List<(string BaseName, string FilePath, BaseItem Item)>();
                foreach (var item in items)
                {
                    if (string.IsNullOrEmpty(item.Path)) continue;
                    var baseName = SanitizeTopListFolderName(item.Name);
                    if (item.ProductionYear.HasValue && item.ProductionYear > 0)
                        baseName += $" ({item.ProductionYear})";
                    if (!seenKeys.Add(baseName)) continue;
                    selected.Add((baseName, item.Path, item));
                }

                if (effectiveMaxItems > 0 && selected.Count > effectiveMaxItems)
                    selected = selected.Take(effectiveMaxItems).ToList();

                int digits = Math.Max(2, selected.Count.ToString().Length);
                int count = 0;
                var tempDir = Path.Combine(Path.GetTempPath(), "hsc_" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tempDir);
                try
                {
                    foreach (var entry in selected)
                    {
                        count++;
                        var sortPrefix = count.ToString().PadLeft(digits, '0');
                        File.WriteAllText(Path.Combine(folderPath, entry.BaseName + ".nfo"),
                            HomeScreenCompanionService.BuildTopListNfo(entry.Item, sortPrefix));
                        HomeScreenCompanionService.WriteRankedImages(
                            entry.Item, count, Path.Combine(folderPath, entry.BaseName), badgeStyle, tempDir,
                            _httpClient, _providerManager, _libraryManager, _fileSystem, m => _log.Warn(m));
                        // .strm last: the folder is a watched library, and Emby creates the item the
                        // moment it sees the .strm — the nfo and badged images must already be there.
                        File.WriteAllText(Path.Combine(folderPath, entry.BaseName + ".strm"), entry.FilePath);
                    }
                }
                finally
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                }

                // Notify the file system monitor so Emby is aware of the changes
                try
                {
                    _libraryMonitor?.ReportFileSystemChanged(folderPath);
                }
                catch { }

                // For items already indexed in the library: update SortName and poster directly
                // so changes are visible immediately without waiting for a full library scan.
                try
                {
                    var sortPaths = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (int si = 0; si < selected.Count; si++)
                        sortPaths[Path.Combine(folderPath, selected[si].BaseName + ".strm")]
                            = (si + 1).ToString().PadLeft(digits, '0');

                    var libItems = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        Recursive = true,
                        IncludeItemTypes = new[] { "Movie" }
                    }).Where(i => !string.IsNullOrEmpty(i.Path)
                               && i.Path.StartsWith(folderPath + Path.DirectorySeparatorChar,
                                                    StringComparison.OrdinalIgnoreCase))
                      .ToList();

                    foreach (var li in libItems)
                    {
                        var strmPath = li.Path;
                        if (string.IsNullOrEmpty(strmPath)) continue;

                        // Update SortName
                        if (sortPaths.TryGetValue(strmPath, out var newSort))
                        {
                            var prop = li.GetType().GetProperty("SortName");
                            if (prop?.CanWrite == true) prop.SetValue(li, newSort);
                        }

                        // Point poster and thumb at our local ranked images
                        HomeScreenCompanionService.ApplyRankedImages(li, folderPath);

                        // Merge STRM as an alternate version of the original library movie.
                        // MergeItems replicates what Emby does automatically when two video
                        // files for the same film share a folder, but across different virtual
                        // libraries.
                        try
                        {
                            var strmImdb = li.GetProviderId("Imdb");
                            if (!string.IsNullOrEmpty(strmImdb)
                                && origLookup.TryGetValue(strmImdb, out var primary)
                                && li.Id != primary.Id)
                            {
                                _libraryManager.MergeItems(new[] { primary, li });
                                MergeTopListVersionsTask.QueueStrmProbe(_providerManager, _fileSystem, li);
                            }
                        }
                        catch { }

                        try { _libraryManager.UpdateItem(li, li.Parent, ItemUpdateType.MetadataEdit, null); }
                        catch { }
                    }
                }
                catch { }

                _log.Ok($"Top-list '{tl.TagName}': {RunLog.Plural(count, "movie")} synced to its library folder");
            }
        }

        private static string SanitizeTopListFolderName(string name)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var safe = new string((name ?? "unknown").Select(c => Array.IndexOf(invalid, c) >= 0 ? '_' : c).ToArray()).Trim('.');
            return string.IsNullOrWhiteSpace(safe) ? "unknown" : safe;
        }

        private void TopListsPhase(RunContext ctx, CancellationToken cancellationToken)
        {
            CleanupDisabledPlaylists(ctx.Config, ctx.DryRun);
            bool _hasTopLists = (ctx.Config.TopLists ?? new List<TopListHomeSection>()).Any(t => !string.IsNullOrWhiteSpace(t.TagName));
            if (_hasTopLists) { _log.Blank(); _log.Info("» Top-lists"); }
            SyncTopListFolders(ctx.Config, ctx.DryRun);
            if (!ctx.DryRun) TopListSyncTask.SyncAll(_libraryManager, _userViewManager, _userManager, _jsonSerializer, _logger, cancellationToken, _log);
        }

    }
}
