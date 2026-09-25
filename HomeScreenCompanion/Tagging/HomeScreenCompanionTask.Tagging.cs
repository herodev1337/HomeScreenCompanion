// Partial of HomeScreenCompanionTask — Tagging responsibilities (apply tags to items, tag-diff debug output).
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Users;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        private void WriteTagDiffDebug(Dictionary<string, List<string>>? added, Dictionary<string, List<string>>? removed)
        {
            if (!_log.Extended || added == null || removed == null) return;
            if (added.Count == 0 && removed.Count == 0) { _log.Debug("  No tag changes"); return; }
            _log.Section("Tags");
            foreach (var tName in added.Keys.Concat(removed.Keys).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var a = added.GetValueOrDefault(tName) ?? new List<string>();
                var r = removed.GetValueOrDefault(tName) ?? new List<string>();
                _log.Debug($"  {tName}  (+{a.Count} / -{r.Count})");
                int shown = 0;
                foreach (var lbl in a)
                {
                    if (shown >= 30) { _log.Debug($"    … and {a.Count - shown} more added"); break; }
                    _log.Debug($"    + {lbl}"); shown++;
                }
                shown = 0;
                foreach (var lbl in r)
                {
                    if (shown >= 30) { _log.Debug($"    … and {r.Count - shown} more removed"); break; }
                    _log.Debug($"    - {lbl}"); shown++;
                }
            }
        }

        private static List<BaseItem> FindByTitleAndYear(List<BaseItem> allItems, string title, int? year)
        {
            if (string.IsNullOrWhiteSpace(title)) return new List<BaseItem>();
            return allItems
                .Where(i =>
                    string.Equals(i.Name, title, StringComparison.OrdinalIgnoreCase)
                    && (year == null || !i.ProductionYear.HasValue || i.ProductionYear == year))
                .ToList();
        }

        private List<string> LoadFileHistory(string filename)
        {
            try { var path = Path.Combine(Plugin.Instance.DataFolderPath, filename); if (File.Exists(path)) return File.ReadAllLines(path).Select(l => l.Trim()).Where(l => !string.IsNullOrEmpty(l)).ToList(); } catch { }
            return new List<string>();
        }

        private void SaveFileHistory(string filename, List<string> data)
        {
            try { var path = Path.Combine(Plugin.Instance.DataFolderPath, filename); Directory.CreateDirectory(Path.GetDirectoryName(path)); File.WriteAllLines(path, data); } catch { }
        }

        // Apply tags phase: diffs the desired tag set against current tags on every library item
        // (movies + episodes + seasons), applies adds/removes (unless DryRun), updates per-group
        // stats, and emits the phase banner. Reads run-scoped state from instance fields populated
        // by Execute() and the supplied RunContext; returns the deltas the epilogue summary needs.
        //
        // Note: C# 7.x async methods cannot declare out parameters, so the three counters are
        // returned as a tuple. Call site destructures them back into Execute()'s scope so the
        // downstream epilogue references continue to work unchanged.
        private async Task<(int tagsAdded, int tagsRemoved, int itemsChanged)> ApplyTagsPhase(RunContext ctx)
        {
            var phaseTimer = System.Diagnostics.Stopwatch.StartNew();
            int tagsAdded = 0, tagsRemoved = 0, itemsChanged = 0, updateCount = 0;
            var _dbgTagAdded = ctx.Debug ? new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase) : null;
            var _dbgTagRemoved = ctx.Debug ? new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase) : null;
            foreach (var item in ctx.AllItems)
            {
                var existingTags = new HashSet<string>(item.Tags, StringComparer.OrdinalIgnoreCase);
                var targetTags = _runDesiredTagsMap!.ContainsKey(item.Id) ? _runDesiredTagsMap[item.Id] : new HashSet<string>();

                var toRemove = existingTags.Where(t => _runManagedTags!.Contains(t) && !targetTags.Contains(t) && !_runFailedFetches!.Contains(t)).ToList();
                var toAdd = targetTags.Where(t => !existingTags.Contains(t)).ToList();

                if (toRemove.Count == 0 && toAdd.Count == 0) continue;

                itemsChanged++;
                if (ctx.Debug)
                {
                    var _tagYr = item.ProductionYear.HasValue ? $" ({item.ProductionYear})" : "";
                    var _tagTp = item.GetType().Name.Contains("Series") ? "Series" : "Movie";
                    string _itemLabel = $"{item.Name}{_tagYr}  [{_tagTp}]";
                    foreach (var t in toAdd) { if (!_dbgTagAdded!.ContainsKey(t)) _dbgTagAdded[t] = new List<string>(); _dbgTagAdded[t].Add(_itemLabel); }
                    foreach (var t in toRemove) { if (!_dbgTagRemoved!.ContainsKey(t)) _dbgTagRemoved[t] = new List<string>(); _dbgTagRemoved[t].Add(_itemLabel); }
                }
                if (!ctx.DryRun)
                {
                    foreach (var t in toRemove) { item.RemoveTag(t); tagsRemoved++; _runTagRemovedByTag![t] = _runTagRemovedByTag.GetValueOrDefault(t) + 1; }
                    foreach (var t in toAdd) { item.AddTag(t); tagsAdded++; _runTagAddedByTag![t] = _runTagAddedByTag.GetValueOrDefault(t) + 1; }
                    try { _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not save tags for '{item.Name}': {ex.Message}"); }
                    if (++updateCount % 25 == 0)
                        await Task.Yield();
                }
                else
                {
                    tagsAdded += toAdd.Count; tagsRemoved += toRemove.Count;
                    foreach (var t in toAdd) _runTagAddedByTag![t] = _runTagAddedByTag.GetValueOrDefault(t) + 1;
                    foreach (var t in toRemove) _runTagRemovedByTag![t] = _runTagRemovedByTag.GetValueOrDefault(t) + 1;
                }
            }
            foreach (var item in _runAllScannedEpisodeItems!.Values)
            {
                var existingTags = new HashSet<string>(item.Tags, StringComparer.OrdinalIgnoreCase);
                var targetTags = _runDesiredTagsMap!.ContainsKey(item.Id) ? _runDesiredTagsMap[item.Id] : new HashSet<string>();

                var toRemove = existingTags.Where(t => _runManagedTags!.Contains(t) && !targetTags.Contains(t) && !_runFailedFetches!.Contains(t)).ToList();
                var toAdd = targetTags.Where(t => !existingTags.Contains(t)).ToList();

                if (toRemove.Count == 0 && toAdd.Count == 0) continue;

                itemsChanged++;
                if (ctx.Debug)
                {
                    var _tagYr = item.ProductionYear.HasValue ? $" ({item.ProductionYear})" : "";
                    string _itemLabel = $"{item.Name}{_tagYr}  [Episode]";
                    foreach (var t in toAdd) { if (!_dbgTagAdded!.ContainsKey(t)) _dbgTagAdded[t] = new List<string>(); _dbgTagAdded[t].Add(_itemLabel); }
                    foreach (var t in toRemove) { if (!_dbgTagRemoved!.ContainsKey(t)) _dbgTagRemoved[t] = new List<string>(); _dbgTagRemoved[t].Add(_itemLabel); }
                }
                if (!ctx.DryRun)
                {
                    foreach (var t in toRemove) { item.RemoveTag(t); tagsRemoved++; _runTagRemovedByTag![t] = _runTagRemovedByTag.GetValueOrDefault(t) + 1; }
                    foreach (var t in toAdd) { item.AddTag(t); tagsAdded++; _runTagAddedByTag![t] = _runTagAddedByTag.GetValueOrDefault(t) + 1; }
                    try { _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not save tags for '{item.Name}': {ex.Message}"); }
                    if (++updateCount % 25 == 0)
                        await Task.Yield();
                }
                else
                {
                    tagsAdded += toAdd.Count; tagsRemoved += toRemove.Count;
                    foreach (var t in toAdd) _runTagAddedByTag![t] = _runTagAddedByTag.GetValueOrDefault(t) + 1;
                    foreach (var t in toRemove) _runTagRemovedByTag![t] = _runTagRemovedByTag.GetValueOrDefault(t) + 1;
                }
            }
            foreach (var item in _runAllScannedSeasonItems!.Values)
            {
                var existingTags = new HashSet<string>(item.Tags, StringComparer.OrdinalIgnoreCase);
                var targetTags = _runDesiredTagsMap!.ContainsKey(item.Id) ? _runDesiredTagsMap[item.Id] : new HashSet<string>();

                var toRemove = existingTags.Where(t => _runManagedTags!.Contains(t) && !targetTags.Contains(t) && !_runFailedFetches!.Contains(t)).ToList();
                var toAdd = targetTags.Where(t => !existingTags.Contains(t)).ToList();

                if (toRemove.Count == 0 && toAdd.Count == 0) continue;

                itemsChanged++;
                if (ctx.Debug)
                {
                    var _tagYr = item.ProductionYear.HasValue ? $" ({item.ProductionYear})" : "";
                    string _itemLabel = $"{item.Name}{_tagYr}  [Season]";
                    foreach (var t in toAdd) { if (!_dbgTagAdded!.ContainsKey(t)) _dbgTagAdded[t] = new List<string>(); _dbgTagAdded[t].Add(_itemLabel); }
                    foreach (var t in toRemove) { if (!_dbgTagRemoved!.ContainsKey(t)) _dbgTagRemoved[t] = new List<string>(); _dbgTagRemoved[t].Add(_itemLabel); }
                }
                if (!ctx.DryRun)
                {
                    foreach (var t in toRemove) { item.RemoveTag(t); tagsRemoved++; _runTagRemovedByTag![t] = _runTagRemovedByTag.GetValueOrDefault(t) + 1; }
                    foreach (var t in toAdd) { item.AddTag(t); tagsAdded++; _runTagAddedByTag![t] = _runTagAddedByTag.GetValueOrDefault(t) + 1; }
                    try { _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not save tags for season '{item.Name}': {ex.Message}"); }
                    if (++updateCount % 25 == 0)
                        await Task.Yield();
                }
                else
                {
                    tagsAdded += toAdd.Count; tagsRemoved += toRemove.Count;
                    foreach (var t in toAdd) _runTagAddedByTag![t] = _runTagAddedByTag.GetValueOrDefault(t) + 1;
                    foreach (var t in toRemove) _runTagRemovedByTag![t] = _runTagRemovedByTag.GetValueOrDefault(t) + 1;
                }
            }
            foreach (var gs in ctx.StatsList)
            {
                if (gs.TagName != null)
                {
                    gs.TagsAdded = _runTagAddedByTag!.GetValueOrDefault(gs.TagName);
                    gs.TagsRemoved = _runTagRemovedByTag!.GetValueOrDefault(gs.TagName);
                }
            }

            WriteTagDiffDebug(_dbgTagAdded, _dbgTagRemoved);
            _log.Info(tagsAdded == 0 && tagsRemoved == 0
                ? $"    No tag changes needed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}"
                : ctx.DryRun
                    ? $"    Would add {tagsAdded} and remove {tagsRemoved} tags on {RunLog.Plural(itemsChanged, "item")}"
                    : $"    +{tagsAdded} added, -{tagsRemoved} removed on {RunLog.Plural(itemsChanged, "item")}  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
            return (tagsAdded, tagsRemoved, itemsChanged);
        }

        // Apply-tags phase for single-entry mode. Operates on a single tag's
        // `tagOutputItems` (no shared desired-tags map) and re-evaluates MediaInfo
        // matching for episodes/seasons the same way the full-sync phase does, but
        // scoped to one tagConfig. Sets `gs.TagsAdded` / `gs.TagsRemoved` for the
        // summary footer. Returns the deltas the epilogue needs.
        //
        // The diff logic (should-have / has-tag, Debug trace, DryRun handling,
        // update-count yielding) is preserved bit-for-bit from the original inline
        // code in RunSingleEntryInternalAsync so external behaviour is unchanged.
        private async Task<(int tagsAdded, int tagsRemoved)> ApplyTagsPhaseSingle(
            RunContext ctx,
            TagConfig tagConfig,
            string tagName,
            List<BaseItem> allItems,
            List<BaseItem> tagOutputItems,
            Dictionary<long, BaseItem> seriesEpisodeCache,
            Dictionary<string, HashSet<long>> personCache,
            Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)> userDataCache,
            User[] preloadedUsers,
            Dictionary<(Guid, long), DateTimeOffset?> seriesLastPlayedCache,
            Dictionary<string, HashSet<long>> collectionMembershipCache,
            Dictionary<long, List<string>>? seriesEpisodeNamesCache,
            GroupRunStats gs)
        {
            var phaseTimer = System.Diagnostics.Stopwatch.StartNew();
            int tagsAdded = 0, tagsRemoved = 0;
            var dbgTagAdded = ctx.Debug ? new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase) : null;
            var dbgTagRemoved = ctx.Debug ? new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase) : null;
            var matchedIds = new HashSet<Guid>(tagOutputItems.Select(i => i.Id));
            var isBoxSetHse = IsBoxSetHomeSectionEntry(tagConfig); // computed once, not per-item
            int updateCount = 0;
            foreach (var item in allItems)
            {
                var existingTags = new HashSet<string>(item.Tags, StringComparer.OrdinalIgnoreCase);
                bool shouldHave = tagConfig.EnableTag && !tagConfig.OnlyCollection && !isBoxSetHse && matchedIds.Contains(item.Id);
                bool hasTag = existingTags.Contains(tagName);
                if (shouldHave == hasTag) continue;
                if (ctx.Debug)
                {
                    var tagYr = item.ProductionYear.HasValue ? $" ({item.ProductionYear})" : "";
                    var tagTp = item.GetType().Name.Contains("Series") ? "Series" : "Movie";
                    string itemLabel = $"{item.Name}{tagYr}  [{tagTp}]";
                    if (shouldHave) { if (!dbgTagAdded!.ContainsKey(tagName)) dbgTagAdded[tagName] = new List<string>(); dbgTagAdded[tagName].Add(itemLabel); }
                    else { if (!dbgTagRemoved!.ContainsKey(tagName)) dbgTagRemoved[tagName] = new List<string>(); dbgTagRemoved[tagName].Add(itemLabel); }
                }
                if (!ctx.DryRun)
                {
                    if (shouldHave) item.AddTag(tagName); else item.RemoveTag(tagName);
                    try { _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not save tags for '{item.Name}': {ex.Message}"); }
                    if (++updateCount % 25 == 0) await Task.Yield();
                }
                if (shouldHave) tagsAdded++; else tagsRemoved++;
            }

            // Episode cleanup: remove stale tags from episodes; also tag matching episodes when episode-level targeting is active
            {
                var (tEpClean, _, _) = EffectiveTagTargets(tagConfig);
                bool targetsEpisodes = tagConfig.EnableTag && !tagConfig.OnlyCollection && !isBoxSetHse && tEpClean &&
                    (tagConfig.SourceType != "MediaInfo" || TagConfigTargetsEpisodes(tagConfig));
                var matchedEpisodeIds = new HashSet<Guid>();
                var allEpisodeItemsMap = new Dictionary<Guid, BaseItem>();
                if (targetsEpisodes)
                {
                    if (tagConfig.SourceType == "MediaInfo" && TagConfigTargetsEpisodes(tagConfig))
                    {
                        foreach (var ep in _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Recursive = true, IsVirtualItem = false }))
                        {
                            if (ep.LocationType != LocationType.FileSystem) continue;
                            if (ItemMatchesMediaInfo(ep, tagConfig, ctx.Debug, seriesEpisodeCache, personCache, userDataCache, null, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache))
                            {
                                matchedEpisodeIds.Add(ep.Id);
                                allEpisodeItemsMap.TryAdd(ep.Id, ep);
                            }
                        }
                    }
                    else
                    {
                        // Non-MediaInfo: episodes were already resolved into tagOutputItems
                        foreach (var ep in tagOutputItems.Where(i => i.GetType().Name.Contains("Episode")))
                        {
                            matchedEpisodeIds.Add(ep.Id);
                            allEpisodeItemsMap.TryAdd(ep.Id, ep);
                        }
                    }
                }
                foreach (var ep in _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Tags = new[] { tagName }, Recursive = true, IsVirtualItem = false }))
                    allEpisodeItemsMap.TryAdd(ep.Id, ep);
                foreach (var ep in allEpisodeItemsMap.Values)
                {
                    bool shouldHaveEp = tagConfig.EnableTag && !tagConfig.OnlyCollection && matchedEpisodeIds.Contains(ep.Id);
                    bool hasTagEp = new HashSet<string>(ep.Tags, StringComparer.OrdinalIgnoreCase).Contains(tagName);
                    if (shouldHaveEp == hasTagEp) continue;
                    if (ctx.Debug)
                    {
                        var epYr = ep.ProductionYear.HasValue ? $" ({ep.ProductionYear})" : "";
                        string epLabel = $"{ep.Name}{epYr}  [Episode]";
                        if (shouldHaveEp) { if (!dbgTagAdded!.ContainsKey(tagName)) dbgTagAdded[tagName] = new List<string>(); dbgTagAdded[tagName].Add(epLabel); }
                        else { if (!dbgTagRemoved!.ContainsKey(tagName)) dbgTagRemoved[tagName] = new List<string>(); dbgTagRemoved[tagName].Add(epLabel); }
                    }
                    if (!ctx.DryRun)
                    {
                        if (shouldHaveEp) ep.AddTag(tagName); else ep.RemoveTag(tagName);
                        try { _libraryManager.UpdateItem(ep, ep.Parent, ItemUpdateType.MetadataEdit, null); }
                        catch (Exception ex) { _log.Warn($"Could not save tags for episode '{ep.Name}': {ex.Message}"); }
                        if (++updateCount % 25 == 0) await Task.Yield();
                    }
                    if (shouldHaveEp) tagsAdded++; else tagsRemoved++;
                }
            }

            // Season cleanup: remove stale tags from seasons; also tag matching seasons when season-level targeting is active
            {
                var (_, tSeaClean, _) = EffectiveTagTargets(tagConfig);
                bool targetsSeason = tagConfig.EnableTag && !tagConfig.OnlyCollection && !isBoxSetHse &&
                    ((tagConfig.SourceType == "MediaInfo" && TagConfigTargetsSeason(tagConfig)) ||
                     (tagConfig.SourceType != "MediaInfo" && tSeaClean));
                var matchedSeasonIds = new HashSet<Guid>();
                var allSeasonItemsMap = new Dictionary<Guid, BaseItem>();
                if (targetsSeason)
                {
                    if (tagConfig.SourceType == "MediaInfo")
                    {
                        var matchingEpisodes = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Recursive = true, IsVirtualItem = false })
                            .Where(ep => ep.LocationType == LocationType.FileSystem
                                      && ItemMatchesMediaInfo(ep, tagConfig, ctx.Debug, seriesEpisodeCache, personCache, userDataCache, null, preloadedUsers, seriesLastPlayedCache, collectionMembershipCache, seriesEpisodeNamesCache))
                            .ToList();
                        foreach (var season in ResolveParentSeasons(matchingEpisodes))
                        {
                            matchedSeasonIds.Add(season.Id);
                            allSeasonItemsMap.TryAdd(season.Id, season);
                        }
                    }
                    else
                    {
                        // Non-MediaInfo: seasons were already resolved into tagOutputItems
                        foreach (var season in tagOutputItems.Where(i => i.GetType().Name.Contains("Season")))
                        {
                            matchedSeasonIds.Add(season.Id);
                            allSeasonItemsMap.TryAdd(season.Id, season);
                        }
                    }
                }
                foreach (var s in _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Season" }, Tags = new[] { tagName }, Recursive = true, IsVirtualItem = false }))
                    allSeasonItemsMap.TryAdd(s.Id, s);
                foreach (var season in allSeasonItemsMap.Values)
                {
                    bool shouldHaveSeason = tagConfig.EnableTag && !tagConfig.OnlyCollection && matchedSeasonIds.Contains(season.Id);
                    bool hasTagSeason = new HashSet<string>(season.Tags, StringComparer.OrdinalIgnoreCase).Contains(tagName);
                    if (shouldHaveSeason == hasTagSeason) continue;
                    if (ctx.Debug)
                    {
                        var sYr = season.ProductionYear.HasValue ? $" ({season.ProductionYear})" : "";
                        string sLabel = $"{season.Name}{sYr}  [Season]";
                        if (shouldHaveSeason) { if (!dbgTagAdded!.ContainsKey(tagName)) dbgTagAdded[tagName] = new List<string>(); dbgTagAdded[tagName].Add(sLabel); }
                        else { if (!dbgTagRemoved!.ContainsKey(tagName)) dbgTagRemoved[tagName] = new List<string>(); dbgTagRemoved[tagName].Add(sLabel); }
                    }
                    if (!ctx.DryRun)
                    {
                        if (shouldHaveSeason) season.AddTag(tagName); else season.RemoveTag(tagName);
                        try { _libraryManager.UpdateItem(season, season.Parent, ItemUpdateType.MetadataEdit, null); }
                        catch (Exception ex) { _log.Warn($"Could not save tags for season '{season.Name}': {ex.Message}"); }
                        if (++updateCount % 25 == 0) await Task.Yield();
                    }
                    if (shouldHaveSeason) tagsAdded++; else tagsRemoved++;
                }
            }

            WriteTagDiffDebug(dbgTagAdded, dbgTagRemoved);
            if (gs.EnableTag && !gs.BoxSetHse)
                _log.Info(tagsAdded == 0 && tagsRemoved == 0
                    ? $"    No tag changes needed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}"
                    : ctx.DryRun
                        ? $"    Would add {tagsAdded} and remove {tagsRemoved} tags"
                        : $"    +{tagsAdded} added, -{tagsRemoved} removed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
            else if (gs.BoxSetHse)
                _log.Skip("The tag is applied to the collection itself, not to its items (see results)");
            else
                _log.Skip("Tagging is not enabled for this group");

            gs.TagsAdded = tagsAdded;
            gs.TagsRemoved = tagsRemoved;
            return (tagsAdded, tagsRemoved);
        }

    }
}
