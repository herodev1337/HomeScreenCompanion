// Auto-generated partial file — see .planning/codebase/REFACTOR_MAP.md §B.3
using MediaBrowser.Controller.Entities;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

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

    }
}
