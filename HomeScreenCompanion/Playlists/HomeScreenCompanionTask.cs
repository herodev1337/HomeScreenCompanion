// Auto-generated partial file — see .planning/codebase/REFACTOR_MAP.md §B.3
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Playlists;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        private async Task SyncPlaylistsForEntryAsync(TagConfig tagConfig, List<BaseItem> collectionOutputItems, bool dryRun, GroupRunStats? gs = null)
        {
            // Playlist sync — one individual playlist per user in PlaylistUserIds
            if (tagConfig.EnablePlaylist && !dryRun)
            {
                string _plLogName = string.IsNullOrWhiteSpace(tagConfig.PlaylistName) ? tagConfig.Name : tagConfig.PlaylistName;
                _log.Section($"Playlist \"{_plLogName}\"");
                try
                {
                    // Deduplicate — pick one physical version per logical movie (IMDb > TMDb > InternalId).
                    // Keep an ordered list mirroring the source order plus a set for fast membership checks.
                    var seenPlKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    var desiredPlIdList = new List<long>();   // ordered, mirrors source
                    var desiredPlIdSet = new HashSet<long>();  // fast Contains
                    foreach (var item in collectionOutputItems)
                    {
                        var key = item.GetProviderId("Imdb")
                               ?? item.GetProviderId("Tmdb")
                               ?? item.InternalId.ToString();
                        if (seenPlKeys.Add(key))
                        {
                            desiredPlIdList.Add(item.InternalId);
                            desiredPlIdSet.Add(item.InternalId);
                        }
                    }
                    _log.Debug($"  {desiredPlIdList.Count} unique items for {tagConfig.PlaylistUserIds.Count} users");
                    bool plMappingChanged = false;
                    foreach (var userId in tagConfig.PlaylistUserIds)
                    {
                        if (!Guid.TryParse(userId, out var userGuid)) continue;
                        var plUser = _userManager.GetUserById(userGuid);
                        if (plUser == null) { _log.Debug($"  User {userId} no longer exists — skipped"); continue; }

                        var plName = string.IsNullOrWhiteSpace(tagConfig.PlaylistName) ? tagConfig.Name : tagConfig.PlaylistName;

                        // 1. Try to find playlist by stored ID (most reliable)
                        var mapping = tagConfig.PlaylistMappings?.FirstOrDefault(m =>
                            string.Equals(m.UserId, userId, StringComparison.OrdinalIgnoreCase));

                        BaseItem? existingPlaylist = null;
                        if (mapping != null && Guid.TryParse(mapping.PlaylistId, out var storedGuid))
                        {
                            var candidate = _libraryManager.GetItemById(storedGuid);
                            if (candidate != null && candidate.GetType().Name.Contains("Playlist"))
                                existingPlaylist = candidate;
                        }

                        // 2. Name-based recovery: only when a mapping existed but the stored playlist is gone.
                        // Skipped when mapping == null (user has never had a playlist) to prevent
                        // accidentally claiming another user's same-named playlist.
                        if (existingPlaylist == null && mapping != null)
                        {
                            var claimedByOthers = (tagConfig.PlaylistMappings ?? new List<PlaylistMapping>())
                                .Where(m => !string.Equals(m.UserId, userId, StringComparison.OrdinalIgnoreCase)
                                         && Guid.TryParse(m.PlaylistId, out _))
                                .Select(m => Guid.Parse(m.PlaylistId))
                                .ToHashSet();

                            var plQuery = _libraryManager.QueryItems(new InternalItemsQuery
                            {
                                IncludeItemTypes = new[] { "Playlist" },
                                SearchTerm = plName,
                                Limit = 10
                            });
                            existingPlaylist = plQuery.Items.FirstOrDefault(p =>
                                p.Name.Equals(plName, StringComparison.OrdinalIgnoreCase)
                                && !claimedByOthers.Contains(p.Id));

                            if (existingPlaylist != null)
                            {
                                mapping.PlaylistId = existingPlaylist.Id.ToString();
                                plMappingChanged = true;
                                _log.Debug($"  {plUser.Name}: stored playlist id was stale — re-linked by name to {existingPlaylist.Id}");
                            }
                        }

                        if (existingPlaylist == null)
                        {
                            // 3. Create new playlist
                            await _playlistManager.CreatePlaylist(new PlaylistCreationRequest
                            {
                                Name = plName,
                                ItemIdList = desiredPlIdList.ToArray(),
                                User = plUser
                            });

                            if (mapping == null)
                            {
                                mapping = new PlaylistMapping { UserId = userId };
                                tagConfig.PlaylistMappings ??= new List<PlaylistMapping>();
                                tagConfig.PlaylistMappings.Add(mapping);
                            }

                            // CreatePlaylist may return Id as InternalId (long) rather than a Guid depending
                            // on Emby version — confirm the real Guid by querying back by name immediately.
                            // Exclude playlists already claimed by other users in this run.
                            var claimedAtCreate = (tagConfig.PlaylistMappings ?? new List<PlaylistMapping>())
                                .Where(m => !string.Equals(m.UserId, userId, StringComparison.OrdinalIgnoreCase)
                                         && Guid.TryParse(m.PlaylistId, out _))
                                .Select(m => Guid.Parse(m.PlaylistId))
                                .ToHashSet();

                            var confirmQuery = _libraryManager.QueryItems(new InternalItemsQuery
                            {
                                IncludeItemTypes = new[] { "Playlist" },
                                SearchTerm = plName,
                                Limit = 20
                            });
                            var newPl = confirmQuery.Items
                                .Where(p => p.Name.Equals(plName, StringComparison.OrdinalIgnoreCase)
                                         && !claimedAtCreate.Contains(p.Id))
                                .OrderByDescending(p => p.DateCreated)
                                .FirstOrDefault();

                            if (newPl != null)
                            {
                                mapping.PlaylistId = newPl.Id.ToString();
                                plMappingChanged = true;

                                // Transfer ownership so the playlist belongs to the target user, not admin.
                                try
                                {
                                    dynamic dynPl = newPl;
                                    bool ownerSet = false;
                                    try { dynPl.OwnerUserId = plUser.Id; ownerSet = true; } catch { }
                                    if (!ownerSet) try { dynPl.UserId = plUser.Id; ownerSet = true; } catch { }
                                    if (ownerSet)
                                        _libraryManager.UpdateItem(newPl, newPl.Parent, ItemUpdateType.MetadataEdit, null);
                                    if (gs != null) gs.PlaylistUsersCreated++;
                                    _log.Ok($"Playlist \"{plName}\": created for {plUser.Name} ({RunLog.Plural(desiredPlIdList.Count, "item")})");
                                    _log.Debug($"  {plUser.Name}: playlist id {newPl.Id}, owner {(ownerSet ? "set" : "not set")}");
                                }
                                catch (Exception ex)
                                {
                                    if (gs != null) gs.PlaylistUsersCreated++;
                                    _log.Warn($"Playlist \"{plName}\": created for {plUser.Name} but the owner could not be set: {ex.Message}");
                                }
                            }
                            else
                            {
                                if (gs != null) gs.PlaylistUsersFailed++;
                                _log.Warn($"Playlist \"{plName}\": created for {plUser.Name} but its id could not be confirmed — will retry on next sync");
                            }
                        }
                        else
                        {
                            // Full sync: always read actual playlist contents and diff against desired.
                            // This ensures additions and deletions from the source are always reflected,
                            // regardless of prior sync state or manual playlist edits.
                            var playlistItems = _libraryManager.GetItemList(new InternalItemsQuery { ListIds = new[] { existingPlaylist.InternalId } });

                            // Build map: inner media item InternalId -> playlist entry ID
                            var currentEntryMap = new Dictionary<long, long>();
                            foreach (var pItem in playlistItems)
                            {
                                long entryId = 0;
                                try { entryId = pItem.ListItemEntryId; } catch { }
                                if (entryId == 0) entryId = pItem.InternalId;

                                long innerItemId = pItem.InternalId;
                                if (pItem.GetType().Name.Contains("PlaylistItem"))
                                {
                                    try { var temp = ((dynamic)pItem).Item; if (temp != null) innerItemId = ((BaseItem)temp).InternalId; } catch { }
                                }

                                currentEntryMap.TryAdd(innerItemId, entryId);
                            }

                            var currentItemIds = currentEntryMap.Keys.ToHashSet();

                            var entryIdsToRemove = currentItemIds
                                .Where(id => !desiredPlIdSet.Contains(id))
                                .Select(id => currentEntryMap[id])
                                .ToList();

                            var toAdd = desiredPlIdList.Where(id => !currentItemIds.Contains(id)).ToArray();

                            if (entryIdsToRemove.Count > 0)
                            {
                                try
                                {
                                    await _playlistManager.RemoveFromPlaylist(existingPlaylist.InternalId, entryIdsToRemove.ToArray());
                                }
                                catch (Exception ex)
                                {
                                    _log.Warn($"Playlist \"{plName}\": could not remove {entryIdsToRemove.Count} items for {plUser.Name}: {ex.Message}");
                                }
                            }

                            if (toAdd.Length > 0)
                            {
                                _playlistManager.AddToPlaylist(existingPlaylist.InternalId, toAdd, plUser);
                            }

                            // Reorder the playlist so it mirrors the source order. AddToPlaylist appends new
                            // items at the end, so re-read the actual contents (to pick up entry IDs of the
                            // items just added) and move each item into its source position. Only issue a
                            // MoveItem when an item is actually out of place — no needless writes when the
                            // order already matches.
                            var afterItems = _libraryManager.GetItemList(
                                new InternalItemsQuery { ListIds = new[] { existingPlaylist.InternalId } });

                            var entryByInner = new Dictionary<long, long>();   // inner media item id -> playlist entry id
                            var currentOrder = new List<long>();               // inner media item id in current order
                            foreach (var pItem in afterItems)
                            {
                                long entryId = 0;
                                try { entryId = pItem.ListItemEntryId; } catch { }
                                if (entryId == 0) entryId = pItem.InternalId;

                                long innerItemId = pItem.InternalId;
                                if (pItem.GetType().Name.Contains("PlaylistItem"))
                                {
                                    try { var temp = ((dynamic)pItem).Item; if (temp != null) innerItemId = ((BaseItem)temp).InternalId; } catch { }
                                }
                                if (entryByInner.TryAdd(innerItemId, entryId))
                                    currentOrder.Add(innerItemId);
                            }

                            // Target order = source order, restricted to items actually present in the playlist.
                            var desiredOrder = desiredPlIdList.Where(entryByInner.ContainsKey).ToList();

                            bool reordered = false;
                            for (int targetIndex = 0; targetIndex < desiredOrder.Count; targetIndex++)
                            {
                                long wanted = desiredOrder[targetIndex];
                                if (currentOrder[targetIndex] == wanted) continue;   // already in place

                                try
                                {
                                    await _playlistManager.MoveItem(
                                        existingPlaylist.InternalId, entryByInner[wanted], targetIndex);

                                    // Mirror the same move locally so our model matches the server.
                                    currentOrder.Remove(wanted);
                                    currentOrder.Insert(targetIndex, wanted);
                                    reordered = true;
                                }
                                catch (Exception ex)
                                {
                                    _log.Warn($"Playlist \"{plName}\": could not reorder for {plUser.Name}: {ex.Message}");
                                    break;
                                }
                            }

                            if (entryIdsToRemove.Count > 0 || toAdd.Length > 0 || reordered)
                            {
                                plMappingChanged = true;
                                if (gs != null) gs.PlaylistUsersUpdated++;
                                var _plParts = new List<string>();
                                if (toAdd.Length > 0) _plParts.Add($"+{toAdd.Length}");
                                if (entryIdsToRemove.Count > 0) _plParts.Add($"-{entryIdsToRemove.Count}");
                                if (reordered) _plParts.Add("reordered");
                                _log.Ok($"Playlist \"{plName}\": updated for {plUser.Name} ({string.Join(", ", _plParts)})");
                            }
                            else
                            {
                                _log.Debug($"  {plUser.Name}: up to date ({currentOrder.Count} items)");
                            }
                        }
                    }
                    if (plMappingChanged)
                        Plugin.Instance?.SaveConfiguration();
                }
                catch (Exception ex)
                {
                    if (gs != null) { gs.PlaylistUsersFailed++; gs.Warnings.Add($"Playlist sync failed: {ex.Message}"); }
                    _log.Error($"Playlist \"{_plLogName}\" could not be synced: {ex.Message}");
                    WriteExceptionDebug(ex);
                }
            }
        }

        private void CleanupDisabledPlaylists(PluginConfiguration config, bool dryRun)
        {
            bool configChanged = false;
            foreach (var tc in config.Tags ?? new List<TagConfig>())
            {
                if (tc.PlaylistMappings == null || tc.PlaylistMappings.Count == 0) continue;

                bool isGroupActive = tc.Active && IsScheduleActive(tc.ActiveIntervals);

                if (!tc.EnablePlaylist || !isGroupActive)
                {
                    // Delete all playlists for this group (disabled or inactive)
                    foreach (var mapping in tc.PlaylistMappings.ToList())
                    {
                        if (!string.IsNullOrEmpty(mapping.PlaylistId) && Guid.TryParse(mapping.PlaylistId, out var guid))
                        {
                            var pl = _libraryManager.GetItemById(guid);
                            if (pl != null && !dryRun)
                            {
                                try { _libraryManager.DeleteItem(pl, new DeleteOptions { DeleteFileLocation = false }); }
                                catch (Exception ex) { _log.Warn($"Playlist '{pl.Name}' could not be removed: {ex.Message}"); }
                            }
                        }
                    }
                    if (!dryRun) tc.PlaylistMappings.Clear();
                    configChanged = true;
                    _log.Skip($"Playlists for '{tc.Name ?? tc.Tag}' {(dryRun ? "would be removed" : "removed")} (group is {(tc.EnablePlaylist ? "inactive or not in schedule" : "no longer set to create playlists")})");
                }
                else
                {
                    // Delete playlists for users that have been unchecked from PlaylistUserIds
                    var activeUserIds = new HashSet<string>(tc.PlaylistUserIds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                    var orphans = tc.PlaylistMappings.Where(m => !activeUserIds.Contains(m.UserId)).ToList();
                    foreach (var orphan in orphans)
                    {
                        if (!string.IsNullOrEmpty(orphan.PlaylistId) && Guid.TryParse(orphan.PlaylistId, out var guid))
                        {
                            var pl = _libraryManager.GetItemById(guid);
                            if (pl != null && !dryRun)
                            {
                                try { _libraryManager.DeleteItem(pl, new DeleteOptions { DeleteFileLocation = false }); }
                                catch (Exception ex) { _log.Warn($"Playlist '{pl.Name}' could not be removed: {ex.Message}"); }
                            }
                        }
                        if (!dryRun) tc.PlaylistMappings.Remove(orphan);
                        configChanged = true;
                        string _orphanUser = Guid.TryParse(orphan.UserId, out var _orphanGuid) ? (_userManager.GetUserById(_orphanGuid)?.Name ?? orphan.UserId) : orphan.UserId;
                        _log.Skip($"Playlist for '{tc.Name ?? tc.Tag}' {(dryRun ? "would be removed" : "removed")} for {_orphanUser} (user no longer selected)");
                    }
                }
            }
            if (configChanged && !dryRun)
                Plugin.Instance?.SaveConfiguration();
        }

    }
}
