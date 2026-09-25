// Partial of HomeScreenCompanionTask — Diagnostics responsibilities (source description, status symbols).
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Querying;
using System;
using System.Collections.Generic;
using System.Linq;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        private static string DescribeSource(TagConfig tc)
        {
            switch (tc.SourceType)
            {
                case "MediaInfo": return "Smart playlist";
                case "LocalCollection": return "Local collection";
                case "LocalPlaylist": return "Local playlist";
                case "AI": return "AI · " + (string.IsNullOrWhiteSpace(tc.AiProvider) ? "unknown provider" : tc.AiProvider);
                default:
                    var url = tc.Url ?? "";
                    if (url.IndexOf("mdblist.com", StringComparison.OrdinalIgnoreCase) >= 0) return "MDBList";
                    if (url.IndexOf("themoviedb.org", StringComparison.OrdinalIgnoreCase) >= 0) return "TMDb";
                    if (url.IndexOf("trakt", StringComparison.OrdinalIgnoreCase) >= 0) return "Trakt";
                    return "External list";
            }
        }

        private string DescribeSourceDetail(TagConfig tc, int effectiveLimit)
        {
            var parts = new List<string> { "Source: " + DescribeSource(tc) };
            switch (tc.SourceType)
            {
                case "MediaInfo":
                    parts.Add($"{tc.MediaInfoFilters?.Count ?? 0} filter groups, {GetAllCriteria(tc).Count()} conditions");
                    break;
                case "LocalCollection":
                case "LocalPlaylist":
                    parts.Add($"'{tc.LocalSourceId}'");
                    break;
                case "AI":
                    parts.Add($"prompt {tc.AiPrompt?.Length ?? 0} chars" + (tc.AiIncludeRecentlyWatched ? ", includes watch history" : ""));
                    break;
                default:
                    parts.Add(tc.Url ?? "");
                    break;
            }
            if (tc.SourceType != "MediaInfo" && (tc.MediaInfoFilters?.Count > 0 || tc.MediaInfoConditions?.Count > 0))
                parts.Add($"{GetAllCriteria(tc).Count()} extra filter conditions");
            parts.Add(effectiveLimit >= 10000 ? "no limit" : $"limit {effectiveLimit}");
            if ((tc.Blacklist?.Count ?? 0) > 0) parts.Add($"{tc.Blacklist!.Count} blacklisted");
            var features = new List<string>();
            if (tc.EnableTag && !tc.OnlyCollection) features.Add("tag");
            if (tc.EnableCollection) features.Add("collection");
            if (tc.EnablePlaylist) features.Add("playlist");
            if (tc.EnableHomeSection) features.Add("home section");
            if (features.Count > 0) parts.Add("creates: " + string.Join(", ", features));
            return string.Join("  ·  ", parts);
        }

        private void WriteFetchLine(GroupRunStats gs)
        {
            string head = $"[{gs.GroupIndex}/{gs.GroupTotal}] {gs.DisplayName}  ({gs.SourceLabel})";
            if (gs.Skipped)
            {
                _log.Skip($"{head}  ·  skipped: {gs.SkipReason}");
                return;
            }
            if (gs.ErrorMessage != null)
            {
                _log.Error($"{head}  ·  {gs.ErrorMessage}");
                return;
            }
            if (gs.Warnings.Count > 0)
            {
                _log.Warn($"{head}  ·  {gs.Warnings[0]}{(gs.Warnings.Count > 1 ? $"  (+{gs.Warnings.Count - 1} more, see results)" : "")}");
                return;
            }
            _log.Info("    " + head + "  ·  " + DescribeSourceCounts(gs));
        }

        private static string DescribeSourceCounts(GroupRunStats gs)
        {
            if (gs.BoxSetHse) return gs.BoxSetTaggedCount > 0 ? $"{RunLog.Plural(gs.BoxSetTaggedCount, "collection")} tagged" : "collection not found";
            if (gs.SourceType == "MediaInfo") return gs.ViewerOnly ? "current-user filter, resolved per user by the home section" : $"scanned {gs.ListCount:N0} items, {gs.MatchCount} matched";
            if (gs.SourceType == "LocalCollection" || gs.SourceType == "LocalPlaylist") return $"{gs.ListCount} in source, {gs.MatchCount} matched";
            return $"{gs.ListCount} in list, {gs.MatchCount} in your library";
        }

        private void WriteGroupBlock(GroupRunStats gs, bool dryRun, bool logMissing)
        {
            _log.Info($"[{gs.GroupIndex}/{gs.GroupTotal}] {gs.DisplayName}  ({gs.SourceLabel})");
            if (gs.Skipped)
            {
                _log.Skip($"Skipped: {gs.SkipReason}");
                _log.Blank();
                return;
            }
            if (gs.ErrorMessage != null)
            {
                _log.Error($"Failed: {gs.ErrorMessage}");
                _log.Detail("Tags, collection and playlist were left unchanged (safety)");
                _log.Blank();
                return;
            }

            bool isRemote = gs.SourceType == "External" || gs.SourceType == "AI" || string.IsNullOrEmpty(gs.SourceType);
            if (gs.BoxSetHse)
            {
                if (gs.BoxSetTaggedCount > 0)
                    _log.Ok($"{RunLog.Plural(gs.BoxSetTaggedCount, "collection")} tagged with \"{gs.TagName}\"");
            }
            else if (gs.SourceType == "MediaInfo")
                _log.Ok(gs.ViewerOnly
                    ? "Current-user filter  ·  resolved per user by the home section"
                    : $"Scanned {gs.ListCount:N0} items  ·  {gs.MatchCount} matched your conditions");
            else if (gs.SourceType == "LocalCollection" || gs.SourceType == "LocalPlaylist")
            {
                if (gs.ListCount > 0) _log.Ok($"Source: {gs.ListCount} items  ·  {gs.MatchCount} matched");
            }
            else if (gs.ListCount > 0)
                _log.Ok($"List: {gs.ListCount} items  ·  {gs.MatchCount} in your library");

            if (gs.EnableTag && !gs.BoxSetHse)
            {
                if (dryRun) _log.Skip($"Tag \"{gs.TagName}\": would add {gs.TagsAdded}, remove {gs.TagsRemoved} (dry run)");
                else if (gs.TagsAdded == 0 && gs.TagsRemoved == 0) _log.Ok($"Tag \"{gs.TagName}\": up to date");
                else _log.Ok($"Tag \"{gs.TagName}\": +{gs.TagsAdded} added, -{gs.TagsRemoved} removed");
            }

            if (gs.EnableCollection)
            {
                if (dryRun) _log.Skip($"Collection \"{gs.CollectionName}\": not changed (dry run)");
                else if (gs.CollectionCreated) _log.Ok($"Collection \"{gs.CollectionName}\": created with {RunLog.Plural(gs.CollectionItemsAdded, "item")}");
                else if (gs.CollectionItemsAdded > 0 || gs.CollectionItemsRemoved > 0) _log.Ok($"Collection \"{gs.CollectionName}\": updated (+{gs.CollectionItemsAdded}, -{gs.CollectionItemsRemoved})");
                else if (gs.MatchCount == 0) _log.Skip($"Collection \"{gs.CollectionName}\": left unchanged — no items matched");
                else _log.Ok($"Collection \"{gs.CollectionName}\": up to date");
            }

            if (gs.EnablePlaylist)
            {
                if (dryRun) _log.Skip($"Playlist \"{gs.PlaylistName}\": not changed (dry run)");
                else if (gs.PlaylistUsersFailed > 0) _log.Warn($"Playlist \"{gs.PlaylistName}\": failed for {RunLog.Plural(gs.PlaylistUsersFailed, "user")}");
                else if (gs.PlaylistUsersCreated > 0 || gs.PlaylistUsersUpdated > 0)
                {
                    var p = new List<string>();
                    if (gs.PlaylistUsersCreated > 0) p.Add($"created for {RunLog.Plural(gs.PlaylistUsersCreated, "user")}");
                    if (gs.PlaylistUsersUpdated > 0) p.Add($"updated for {RunLog.Plural(gs.PlaylistUsersUpdated, "user")}");
                    _log.Ok($"Playlist \"{gs.PlaylistName}\": {string.Join(", ", p)}");
                }
                else if (gs.PlaylistUsersTotal == 0) _log.Skip($"Playlist \"{gs.PlaylistName}\": no users selected");
                else if (!gs.Warnings.Any(w => w.StartsWith("Playlist", StringComparison.OrdinalIgnoreCase)))
                    _log.Ok($"Playlist \"{gs.PlaylistName}\": up to date for {RunLog.Plural(gs.PlaylistUsersTotal, "user")}");
            }

            if (gs.EnableHomeSection)
            {
                if (dryRun) _log.Skip("Home section: not changed (dry run)");
                else if (gs.HomeSectionSynced) _log.Ok($"Home section: synced for {RunLog.Plural(gs.HomeSectionUserCount, "user")}");
                else if (gs.HomeSectionRemoved) _log.Skip("Home section: removed");
                else _log.Skip("Home section: not synced");
            }

            foreach (var w in gs.Warnings) _log.Warn(w);

            if (isRemote && gs.MissingItems.Count > 0)
            {
                if (logMissing)
                {
                    _log.Skip($"Missing from your library ({gs.MissingItems.Count}):");
                    foreach (var m in gs.MissingItems) _log.Detail(m);
                }
                else
                {
                    _log.Skip($"{RunLog.Plural(gs.MissingItems.Count, "title is", "titles are")} not in your library (enable \"Log missing movies and shows\" in Settings to list them)");
                }
            }
            _log.Blank();
        }

        private void WriteSingleRunFooter(GroupRunStats gs, DateTime startTime, bool dryRun, bool logMissing)
        {
            _log.Blank();
            _log.Info("Results");
            WriteGroupBlock(gs, dryRun, logMissing);

            int failed = gs.ErrorMessage != null ? 1 : 0;
            int warned = failed == 0 && gs.Warnings.Count > 0 ? 1 : 0;
            string finalStatus = BuildFinalStatus(dryRun, failed, warned);
            LastRunStatus = $"{finalStatus} ({DateTime.Now:HH:mm})";

            _log.Rule();
            _log.Info("Summary");
            if (gs.EnableTag && !gs.BoxSetHse)
                _log.Info($"  Tags:          +{gs.TagsAdded} added, -{gs.TagsRemoved} removed");
            if (gs.BoxSetHse)
                _log.Info($"  Collections tagged: {gs.BoxSetTaggedCount}");
            if (gs.EnableCollection)
                _log.Info($"  Collections:   {(gs.CollectionCreated ? 1 : 0)} created, {(!gs.CollectionCreated && (gs.CollectionItemsAdded > 0 || gs.CollectionItemsRemoved > 0) ? 1 : 0)} updated");
            if (gs.EnablePlaylist)
                _log.Info($"  Playlists:     {gs.PlaylistUsersCreated} created, {gs.PlaylistUsersUpdated} updated{(gs.PlaylistUsersFailed > 0 ? $", {gs.PlaylistUsersFailed} failed" : "")}");
            if (gs.EnableHomeSection)
                _log.Info($"  Home sections: {(gs.HomeSectionSynced ? 1 : 0)} synced");
            _log.Info($"  Done in {RunLog.Elapsed(DateTime.Now - startTime)}  ·  {StatusSymbol(failed, warned)} {finalStatus}");
            _log.Rule();
        }

        private static string BuildFinalStatus(bool dryRun, int failed, int warned)
        {
            string s = failed > 0 ? $"Completed with {RunLog.Plural(failed, "error")}"
                     : warned > 0 ? $"Completed with {RunLog.Plural(warned, "warning")}"
                     : "Completed";
            return dryRun ? "Dry run — " + s.Replace("Completed", "completed") : s;
        }

        private static string StatusSymbol(int failed, int warned) => failed > 0 ? "✖" : warned > 0 ? "⚠" : "✔";

        private void WriteMatchedItemsDebug(List<BaseItem> matchedLocalItems)
        {
            if (!_log.Extended || matchedLocalItems.Count == 0) return;
            _log.Debug($"  Matched items ({matchedLocalItems.Count}):");
            int shown = 0;
            foreach (var mi in matchedLocalItems)
            {
                if (shown >= 50) { _log.Debug($"    … and {matchedLocalItems.Count - shown} more"); break; }
                var yr = mi.ProductionYear.HasValue ? $" ({mi.ProductionYear})" : "";
                var tp = mi.GetType().Name.Contains("Series") ? "Series"
                       : mi.GetType().Name.Contains("Episode") ? "Episode"
                       : mi.GetType().Name.Contains("Season") ? "Season"
                       : "Movie";
                _log.Debug($"    {mi.Name}{yr}  [{tp}]");
                shown++;
            }
        }

        private void WriteExceptionDebug(Exception ex)
        {
            if (!_log.Extended) return;
            var lines = ex.ToString().Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            int shown = 0;
            foreach (var line in lines)
            {
                if (shown >= 8) { _log.Debug($"    … {lines.Length - shown} more stack lines"); break; }
                _log.Debug("    " + line.Trim());
                shown++;
            }
        }

        private string BuildRecentlyWatchedContext(TagConfig tagConfig)
        {
            if (!tagConfig.AiIncludeRecentlyWatched || string.IsNullOrWhiteSpace(tagConfig.AiRecentlyWatchedUserId))
                return string.Empty;

            try
            {
                if (!Guid.TryParse(tagConfig.AiRecentlyWatchedUserId, out var userGuid)) return string.Empty;
                var user = _userManager.GetUserById(userGuid);
                if (user == null) return string.Empty;

                int maxCount = tagConfig.AiRecentlyWatchedCount > 0 ? tagConfig.AiRecentlyWatchedCount : 20;

                // Query only played items for this user directly, avoiding per-item GetUserData calls
                var playedLibraryItems = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { "Movie", "Series" },
                    User = user,
                    IsPlayed = true,
                    Recursive = true,
                    IsVirtualItem = false
                });

                var playedItems = playedLibraryItems
                    .Select(item => new { item, ud = _userDataManager?.GetUserData(user, item) })
                    .OrderByDescending(x => x.ud?.LastPlayedDate ?? DateTimeOffset.MinValue)
                    .Take(maxCount)
                    .Select(x => x.item)
                    .ToList();

                if (playedItems.Count == 0) return string.Empty;

                var sb = new System.Text.StringBuilder("The user has recently watched these movies and TV shows (most recent first):\n");
                foreach (var item in playedItems)
                {
                    var yearStr = item.ProductionYear.HasValue ? $" ({item.ProductionYear})" : "";
                    var typeStr = item.GetType().Name.Contains("Series") ? "show" : "movie";
                    sb.AppendLine($"- {item.Name}{yearStr} [{typeStr}]");
                }
                sb.AppendLine("Use this to personalize your recommendations.");
                return sb.ToString();
            }
            catch
            {
                return string.Empty;
            }
        }

    }
}
