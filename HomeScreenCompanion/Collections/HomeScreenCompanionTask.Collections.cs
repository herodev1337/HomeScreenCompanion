// Partial of HomeScreenCompanionTask — Collections responsibilities (BoxSet cleanup, collection tagging).
using MediaBrowser.Controller.Collections;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
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
        private int CleanupBoxSetTags(PluginConfiguration config, bool dryRun, CancellationToken cancellationToken)
        {
            // activeTags: for each tag, which BoxSet names should currently have it
            var activeTags = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            // allHseTags: every tag managed by any BoxSet-HSE entry (to know what to clean up)
            var allHseTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var tc in config.Tags)
            {
                if (!IsBoxSetHomeSectionEntry(tc) || string.IsNullOrEmpty(tc.Tag)) continue;
                allHseTags.Add(tc.Tag);
                if (tc.Active && !string.IsNullOrEmpty(tc.LocalSourceId))
                {
                    if (!activeTags.ContainsKey(tc.Tag))
                        activeTags[tc.Tag] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    activeTags[tc.Tag].Add(tc.LocalSourceId);
                }
            }

            if (allHseTags.Count == 0) return 0;

            int removed = 0;
            var allBoxSets = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "BoxSet" }, Recursive = true });
            foreach (var boxSet in allBoxSets)
            {
                bool updated = false;
                foreach (var tagName in allHseTags)
                {
                    var hasTag = (boxSet.Tags ?? Array.Empty<string>()).Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
                    activeTags.TryGetValue(tagName, out var targets);
                    var shouldHave = targets != null && targets.Any(n => string.Equals(n, boxSet.Name, StringComparison.OrdinalIgnoreCase));
                    if (shouldHave == hasTag) continue;
                    if (shouldHave) boxSet.AddTag(tagName); else { boxSet.RemoveTag(tagName); removed++; }
                    updated = true;
                }
                if (updated && !dryRun)
                {
                    try { _libraryManager.UpdateItem(boxSet, boxSet.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not update tags on collection '{boxSet.Name}': {ex.Message}"); }
                }
            }
            return removed;
        }

        // Collections phase: creates / updates / deletes the BoxSets that mirror each group's
        // matched items.
        private async Task<(int collCreated, int collUpdated, int collWouldCreate, int collWouldUpdate, int collDeleted)> CollectionsPhase(
            RunContext ctx, CancellationToken cancellationToken)
        {
            var phaseTimer = System.Diagnostics.Stopwatch.StartNew();
            int collCreated = 0, collUpdated = 0, collWouldCreate = 0, collWouldUpdate = 0;
            _log.Section("Collections");
            foreach (var kvp in _runDesiredCollectionsMap!)
            {
                string cName = kvp.Key;
                var desiredIds = kvp.Value;
                if (desiredIds.Count == 0) continue;

                try
                {
                    var existingColl = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "BoxSet" }, Name = cName, Recursive = true }).FirstOrDefault();

                    if (existingColl == null)
                    {
                        if (ctx.DryRun) { collWouldCreate++; _log.Debug($"  {cName}  →  would be created ({desiredIds.Count} items)"); continue; }
                        var createdRef = await _collectionManager.CreateCollection(new CollectionCreationOptions { Name = cName, IsLocked = false, ItemIdList = desiredIds.ToArray() });
                        if (createdRef != null)
                        {
                            collCreated++;
                            _runCollCreatedSet!.Add(cName);
                            _runCollItemsAdded![cName] = desiredIds.Count;
                            _log.Debug($"  {cName}  →  created ({desiredIds.Count} items)");
                            if (_runCollectionDescriptions!.ContainsKey(cName) || _runCollectionPosters!.ContainsKey(cName))
                                ApplyCollectionMeta(createdRef, cName, _runCollectionDescriptions, _runCollectionPosters, ctx.Debug);
                        }
                    }
                    else
                    {
                        var currentMembers = _libraryManager.GetItemList(new InternalItemsQuery { CollectionIds = new[] { existingColl.InternalId }, Recursive = true, IsVirtualItem = false }).Select(i => i.InternalId).ToHashSet();
                        var toAdd = desiredIds.Where(id => !currentMembers.Contains(id)).ToList();
                        var toRemove = currentMembers.Where(id => !desiredIds.Contains(id)).ToList();
                        if (toAdd.Count > 0 && !ctx.DryRun)
                            await _collectionManager.AddToCollection(existingColl.InternalId, toAdd.ToArray());
                        if (toRemove.Count > 0 && !ctx.DryRun && existingColl is BoxSet boxSet)
                            _collectionManager.RemoveFromCollection(boxSet, toRemove.ToArray());
                        if ((toAdd.Count > 0 || toRemove.Count > 0) && !ctx.DryRun)
                        {
                            collUpdated++;
                            _runCollItemsAdded![cName] = toAdd.Count;
                            _runCollItemsRemoved![cName] = toRemove.Count;
                            if (ctx.Debug)
                            {
                                _log.Debug($"  {cName}  →  updated (+{toAdd.Count}, -{toRemove.Count})");
                                var _collMap = ctx.AllItems.ToDictionary(i => i.InternalId, i => i.Name + (i.ProductionYear.HasValue ? $" ({i.ProductionYear})" : ""));
                                string CollLabel(long id) => _collMap.TryGetValue(id, out var _cn) ? _cn : id.ToString();
                                foreach (var id in toAdd) _log.Debug($"    + {CollLabel(id)}");
                                foreach (var id in toRemove) _log.Debug($"    - {CollLabel(id)}");
                            }
                        }
                        else if (toAdd.Count > 0 || toRemove.Count > 0)
                        {
                            collWouldUpdate++;
                            _log.Debug($"  {cName}  →  would be updated (+{toAdd.Count}, -{toRemove.Count})");
                        }
                        else
                        {
                            _log.Debug($"  {cName}  →  up to date ({currentMembers.Count} items)");
                        }
                        if (!ctx.DryRun && (_runCollectionDescriptions!.ContainsKey(cName) || _runCollectionPosters!.ContainsKey(cName)))
                            ApplyCollectionMeta(existingColl, cName, _runCollectionDescriptions, _runCollectionPosters, ctx.Debug);
                    }
                }
                catch (Exception ex)
                {
                    _log.Error($"Collection \"{cName}\" could not be updated: {ex.Message}");
                    WriteExceptionDebug(ex);
                    foreach (var _gsC in ctx.StatsList.Where(g => string.Equals(g.CollectionName, cName, StringComparison.OrdinalIgnoreCase)))
                        _gsC.Warnings.Add($"Collection could not be updated: {ex.Message}");
                }
            }
            foreach (var gs in ctx.StatsList)
            {
                if (gs.CollectionName != null)
                {
                    gs.CollectionCreated = _runCollCreatedSet!.Contains(gs.CollectionName);
                    gs.CollectionItemsAdded = _runCollItemsAdded!.GetValueOrDefault(gs.CollectionName);
                    gs.CollectionItemsRemoved = _runCollItemsRemoved!.GetValueOrDefault(gs.CollectionName);
                }
            }

            int collDeleted = 0;
            var toDelete = _runPreviouslyManagedCollections!.Where(h => !_runActiveCollections!.Contains(h)).ToList();
            foreach (var oldName in toDelete)
            {
                if (_runFailedFetches!.Contains(oldName))
                {
                    _log.Warn($"Collection \"{oldName}\" was kept because its source failed to load (safety check)");
                    _runActiveCollections!.Add(oldName);
                    continue;
                }

                try
                {
                    var coll = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "BoxSet" }, Name = oldName, Recursive = true }).FirstOrDefault();
                    if (coll != null && !ctx.DryRun)
                    {
                        _libraryManager.DeleteItem(coll, new DeleteOptions { DeleteFileLocation = false });
                        collDeleted++;
                        _log.Skip($"Collection \"{oldName}\" removed (its group is deleted, disabled or not in schedule)");
                    }
                    else if (coll != null)
                    {
                        _log.Skip($"Collection \"{oldName}\" would be removed (its group is deleted, disabled or not in schedule)");
                    }
                }
                catch (Exception ex)
                {
                    _log.Warn($"Collection \"{oldName}\" could not be removed: {ex.Message}");
                }
            }
            _log.Info(ctx.DryRun
                ? $"    Would create {collWouldCreate} and update {collWouldUpdate} collections"
                : $"    {collCreated} created, {collUpdated} updated, {collDeleted} removed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
            if (!ctx.DryRun) SaveFileHistory("homescreencompanion_collections.txt", _runActiveCollections!.ToList());
            if (!ctx.DryRun) Plugin.Instance.SaveConfiguration();
            return (collCreated, collUpdated, collWouldCreate, collWouldUpdate, collDeleted);
        }

        // Collection phase for single-entry mode. Operates on a single `cName` +
        // per-group `collectionOutputItems` rather than the multi-group
        // `_runDesiredCollectionsMap`.
        private async Task<int> CollectionsPhaseSingle(
            RunContext ctx,
            TagConfig tagConfig,
            string cName,
            List<BaseItem> allItems,
            List<BaseItem> collectionOutputItems,
            GroupRunStats gs)
        {
            int collResult = 0;
            bool collCreated = false;
            int collItemsAdded = 0, collItemsRemoved = 0;
            var phaseTimer = System.Diagnostics.Stopwatch.StartNew();
            if (tagConfig.EnableCollection)
            {
                _log.Blank();
                _log.Info("» Collections");
                if (ctx.DryRun) _log.Skip("Dry run — collections are not changed");
                else if (collectionOutputItems.Count == 0) _log.Skip($"Collection \"{cName}\" left unchanged — no items matched");
            }
            if (tagConfig.EnableCollection && collectionOutputItems.Count > 0 && !ctx.DryRun)
            {
                try
                {
                    var desiredIds = collectionOutputItems.Select(i => i.InternalId).ToHashSet();
                    var existingColl = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "BoxSet" }, Name = cName, Recursive = true }).FirstOrDefault();
                    if (existingColl == null)
                    {
                        await _collectionManager.CreateCollection(new CollectionCreationOptions { Name = cName, IsLocked = false, ItemIdList = desiredIds.ToArray() });
                        collResult = 1;
                        collCreated = true;
                        collItemsAdded = desiredIds.Count;
                        _log.Debug($"  {cName}  →  created ({desiredIds.Count} items)");
                    }
                    else
                    {
                        var currentMembers = _libraryManager.GetItemList(new InternalItemsQuery { CollectionIds = new[] { existingColl.InternalId }, Recursive = true, IsVirtualItem = false }).Select(i => i.InternalId).ToHashSet();
                        var toAdd = desiredIds.Where(id => !currentMembers.Contains(id)).ToList();
                        var toRemove = currentMembers.Where(id => !desiredIds.Contains(id)).ToList();
                        if (toAdd.Count > 0) await _collectionManager.AddToCollection(existingColl.InternalId, toAdd.ToArray());
                        if (toRemove.Count > 0 && existingColl is BoxSet boxSet) _collectionManager.RemoveFromCollection(boxSet, toRemove.ToArray());
                        collResult = toAdd.Count + toRemove.Count;
                        collItemsAdded = toAdd.Count;
                        collItemsRemoved = toRemove.Count;
                        if (ctx.Debug)
                        {
                            _log.Debug(collResult == 0
                                ? $"  {cName}  →  up to date ({currentMembers.Count} items)"
                                : $"  {cName}  →  updated (+{toAdd.Count}, -{toRemove.Count})");
                            var collMap = allItems.ToDictionary(i => i.InternalId, i => i.Name + (i.ProductionYear.HasValue ? $" ({i.ProductionYear})" : ""));
                            string CollLabel(long id) => collMap.TryGetValue(id, out var cn) ? cn : id.ToString();
                            foreach (var id in toAdd) _log.Debug($"    + {CollLabel(id)}");
                            foreach (var id in toRemove) _log.Debug($"    - {CollLabel(id)}");
                        }
                    }
                    gs.CollectionCreated = collCreated;
                    gs.CollectionItemsAdded = collItemsAdded;
                    gs.CollectionItemsRemoved = collItemsRemoved;
                    _log.Info(collCreated
                        ? $"    Collection \"{cName}\" created with {RunLog.Plural(collItemsAdded, "item")}  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}"
                        : collResult == 0
                            ? $"    Collection \"{cName}\" is up to date  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}"
                            : $"    Collection \"{cName}\" updated (+{collItemsAdded}, -{collItemsRemoved})  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
                }
                catch (Exception ex)
                {
                    _log.Error($"Collection \"{cName}\" could not be updated: {ex.Message}");
                    WriteExceptionDebug(ex);
                    gs.Warnings.Add($"Collection could not be updated: {ex.Message}");
                    throw;
                }
            }
            return collResult;
        }

        private bool IsBoxSetHomeSectionEntry(TagConfig tc)
        {
            if (!tc.EnableHomeSection || tc.SourceType != "LocalCollection" || string.IsNullOrEmpty(tc.LocalSourceId)) return false;
            var sd = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            try { sd = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tc.HomeSectionSettings ?? "{}") ?? sd; } catch { return false; }
            if (!sd.TryGetValue("ItemTypes", out var itJson) || string.IsNullOrEmpty(itJson)) return false;
            string[] it;
            try { it = _jsonSerializer.DeserializeFromString<string[]>(itJson) ?? Array.Empty<string>(); }
            catch { it = itJson.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray(); }
            return it.Any(t => string.Equals(t, "BoxSet", StringComparison.OrdinalIgnoreCase));
        }

        private bool ApplyTagToSourceBoxSet(TagConfig tc, string tagName, bool dryRun, CancellationToken cancellationToken)
        {
            // Only ADDS the tag to the target BoxSet. Removal of stale tags is handled by CleanupBoxSetTags
            // after all entries have run, so multiple entries sharing the same tag don't undo each other.
            if (!IsBoxSetHomeSectionEntry(tc) || string.IsNullOrEmpty(tagName)) return false;

            var allBoxSets = _libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "BoxSet" }, Recursive = true });
            var target = allBoxSets.FirstOrDefault(b => string.Equals(b.Name, tc.LocalSourceId, StringComparison.OrdinalIgnoreCase));
            if (target == null) { _log.Debug($"  Collection '{tc.LocalSourceId}' not found in library — cannot tag it"); return false; }

            var hasTag = (target.Tags ?? Array.Empty<string>()).Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
            if (!hasTag)
            {
                target.AddTag(tagName);
                if (!dryRun)
                {
                    try { _libraryManager.UpdateItem(target, target.Parent, ItemUpdateType.MetadataEdit, null); }
                    catch (Exception ex) { _log.Warn($"Could not save tag on collection '{target.Name}': {ex.Message}"); }
                }
                _log.Debug($"  Collection '{target.Name}' {(dryRun ? "would be tagged" : "tagged")} with '{tagName}'");
            }
            else
            {
                _log.Debug($"  Collection '{target.Name}' already has tag '{tagName}'");
            }
            return true;
        }

        private void ApplyCollectionMeta(BaseItem item, string cName,
            Dictionary<string, string> descriptions, Dictionary<string, string> posters, bool debug)
        {
            bool metaChanged = false;

            if (descriptions.TryGetValue(cName, out var desc) && !string.IsNullOrWhiteSpace(desc))
            {
                item.Overview = desc;
                metaChanged = true;
            }

            if (posters.TryGetValue(cName, out var posterPath) && File.Exists(posterPath))
            {
                var imageInfo = new ItemImageInfo
                {
                    Path = posterPath,
                    Type = ImageType.Primary,
                    DateModified = File.GetLastWriteTimeUtc(posterPath)
                };
                var otherImages = (item.ImageInfos ?? Array.Empty<ItemImageInfo>())
                    .Where(i => i.Type != ImageType.Primary).ToList();
                otherImages.Add(imageInfo);
                item.ImageInfos = otherImages.ToArray();
                _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.ImageUpdate, null);
                _log.Debug($"  {cName}  →  poster applied");
            }

            if (metaChanged)
                _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null);
        }
    }
}
