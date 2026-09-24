using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using System;
using System.Collections.Generic;
using System.Linq;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionService
    {
        public object Get(GetManagedTagsRequest request)
        {
            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                Recursive = true,
                IsVirtualItem = false,
                IncludeItemTypes = new[] { "Movie", "Series", "Episode", "Season", "Audio", "MusicVideo", "MusicAlbum", "MusicArtist", "Book", "Game", "Trailer", "Video", "Person", "BoxSet", "Photo", "PhotoAlbum", "Playlist", "Recording", "Studio" }
            }).ToList();

            // Also fetch extras (ExtraType = ThemeSong, BehindTheScenes, etc.) which are excluded by default
            try
            {
                var extraQuery = new InternalItemsQuery { Recursive = true, IsVirtualItem = false };
                var extraTypesProp = typeof(InternalItemsQuery).GetProperty("ExtraTypes");
                if (extraTypesProp != null)
                {
                    var elemType = extraTypesProp.PropertyType.GetElementType();
                    if (elemType != null && elemType.IsEnum)
                    {
                        var all = System.Enum.GetValues(elemType);
                        var arr = System.Array.CreateInstance(elemType, all.Length);
                        all.CopyTo(arr, 0);
                        extraTypesProp.SetValue(extraQuery, arr);
                    }
                }
                var seenIds = new HashSet<Guid>(allItems.Select(i => i.Id));
                foreach (var extra in _libraryManager.GetItemList(extraQuery))
                    if (seenIds.Add(extra.Id)) allItems.Add(extra);
            }
            catch { }

            var tagCount = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var tagMovieKeys = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            var tagTypes = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in allItems)
            {
                if (item.Tags == null) continue;
                var typeKey = GetItemTypeKey(item);
                var isMovie = item is MediaBrowser.Controller.Entities.Movies.Movie;
                string movieKey = null;
                if (isMovie)
                {
                    var imdb = item.GetProviderId("Imdb");
                    movieKey = !string.IsNullOrEmpty(imdb)
                        ? imdb
                        : (item.Name ?? "") + "_" + (item.ProductionYear?.ToString() ?? "");
                }
                foreach (var tag in item.Tags)
                {
                    if (string.IsNullOrWhiteSpace(tag)) continue;
                    tagCount.TryGetValue(tag, out var c);
                    tagCount[tag] = c + 1;
                    if (isMovie && movieKey != null)
                    {
                        if (!tagMovieKeys.TryGetValue(tag, out var seen))
                            tagMovieKeys[tag] = seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        seen.Add(movieKey);
                    }
                    if (!tagTypes.TryGetValue(tag, out var typeSet))
                        tagTypes[tag] = typeSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    typeSet.Add(typeKey);
                }
            }
            var tagItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { "Tag" },
                Recursive = true
            });
            var tagIdMap = tagItems.ToDictionary(
                t => t.Name ?? "",
                t => t.Id.ToString("N"),
                StringComparer.OrdinalIgnoreCase);

            var tags = tagCount
                .Select(kv => new ManagedTagInfo
                {
                    Name = kv.Key,
                    ItemCount = kv.Value,
                    MovieCount = tagMovieKeys.TryGetValue(kv.Key, out var movieSet) ? movieSet.Count : 0,
                    Id = tagIdMap.TryGetValue(kv.Key, out var tid) ? tid : "",
                    ItemTypes = tagTypes.TryGetValue(kv.Key, out var typeSet2) ? typeSet2.ToList() : new List<string>()
                })
                .OrderBy(t => t.Name)
                .ToList();
            return new GetManagedTagsResponse { Tags = tags };
        }

        public object Get(GetManagedCollectionsRequest request)
        {
            var collections = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { "BoxSet" },
                Recursive = true
            });
            var result = new List<ManagedCollectionInfo>();
            foreach (var c in collections)
            {
                var childCount = _libraryManager.GetItemList(new InternalItemsQuery { CollectionIds = new[] { c.InternalId }, IsVirtualItem = false }).Count();
                result.Add(new ManagedCollectionInfo
                {
                    Id = c.Id.ToString("N"),
                    Name = c.Name ?? "",
                    ItemCount = childCount
                });
            }
            result.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase));
            return new GetManagedCollectionsResponse { Collections = result };
        }

        public object Post(DeleteManagedTagRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.TagName))
                return new DeleteManagedTagResponse { Success = false, Message = "TagName is required." };

            var tagName = request.TagName.Trim();

            // Remove from real-time cache first — otherwise UpdateItem fires ItemUpdated
            // which triggers ProcessItem in ServerEntryPoint and immediately re-adds the tag.
            TagCacheManager.Instance.RemoveTagFromAllEntries(tagName);
            TagCacheManager.Instance.Save();

            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                Recursive = true,
                IsVirtualItem = false,
                Tags = new[] { tagName }
            });
            int updated = 0;
            foreach (var item in allItems)
            {
                if (item.Tags == null) continue;
                item.RemoveTag(tagName);
                try { _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null); updated++; }
                catch { /* best effort */ }
            }
            return new DeleteManagedTagResponse { Success = true, ItemsUpdated = updated };
        }

        public object Post(DeleteManagedTagsBatchRequest request)
        {
            var tagNames = (request.TagNames ?? new List<string>())
                .Select(t => t?.Trim()).Where(t => !string.IsNullOrEmpty(t)).ToList();

            if (tagNames.Count == 0)
                return new DeleteManagedTagsResponse { Success = true };

            foreach (var tag in tagNames)
                TagCacheManager.Instance.RemoveTagFromAllEntries(tag);
            TagCacheManager.Instance.Save();

            var allItems = _libraryManager.GetItemList(new InternalItemsQuery
            {
                Recursive = true,
                IsVirtualItem = false,
                IncludeItemTypes = new[] { "Movie", "Series", "Episode", "Season", "Audio", "MusicVideo", "MusicAlbum", "MusicArtist", "Book", "Game", "Trailer", "Video", "Person", "BoxSet", "Photo", "PhotoAlbum", "Playlist", "Recording", "Studio" }
            }).ToList();

            // Also fetch extras (ExtraType = ThemeSong, BehindTheScenes, etc.) which are excluded by default
            try
            {
                var extraQuery = new InternalItemsQuery { Recursive = true, IsVirtualItem = false };
                var extraTypesProp = typeof(InternalItemsQuery).GetProperty("ExtraTypes");
                if (extraTypesProp != null)
                {
                    var elemType = extraTypesProp.PropertyType.GetElementType();
                    if (elemType != null && elemType.IsEnum)
                    {
                        var all = System.Enum.GetValues(elemType);
                        var arr = System.Array.CreateInstance(elemType, all.Length);
                        all.CopyTo(arr, 0);
                        extraTypesProp.SetValue(extraQuery, arr);
                    }
                }
                var seenIds = new HashSet<Guid>(allItems.Select(i => i.Id));
                foreach (var extra in _libraryManager.GetItemList(extraQuery))
                    if (seenIds.Add(extra.Id)) allItems.Add(extra);
            }
            catch { }

            int updated = 0;
            foreach (var item in allItems)
            {
                if (item.Tags == null || item.Tags.Length == 0) continue;
                bool changed = false;
                foreach (var tag in tagNames)
                {
                    if (item.Tags.Any(t => string.Equals(t, tag, StringComparison.OrdinalIgnoreCase)))
                    {
                        item.RemoveTag(tag);
                        changed = true;
                    }
                }
                if (!changed) continue;
                try { _libraryManager.UpdateItem(item, item.Parent, ItemUpdateType.MetadataEdit, null); updated++; }
                catch { /* best effort */ }
            }
            return new DeleteManagedTagsResponse { Success = true, ItemsUpdated = updated };
        }

        public object Post(DeleteManagedCollectionRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.CollectionId))
                return new DeleteManagedCollectionResponse { Success = false, Message = "CollectionId is required." };
            if (!Guid.TryParse(request.CollectionId, out var guid))
                return new DeleteManagedCollectionResponse { Success = false, Message = "Invalid CollectionId." };

            var item = _libraryManager.GetItemById(guid);
            if (item == null)
                return new DeleteManagedCollectionResponse { Success = false, Message = "Collection not found." };

            try
            {
                _libraryManager.DeleteItem(item, new DeleteOptions { DeleteFileLocation = true });
                return new DeleteManagedCollectionResponse { Success = true };
            }
            catch (Exception ex)
            {
                return new DeleteManagedCollectionResponse { Success = false, Message = ex.Message };
            }
        }
    }
}
