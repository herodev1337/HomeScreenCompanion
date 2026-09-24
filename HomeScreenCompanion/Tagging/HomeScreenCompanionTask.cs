// Auto-generated partial file — see .planning/codebase/REFACTOR_MAP.md §B.3
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
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

    }
}
