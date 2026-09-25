using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Serialization;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace HomeScreenCompanion
{
    public class TagCacheManager
    {
        internal static TagCacheManager Instance { get; } = new TagCacheManager();

        private static ILogger? Log;

        private Dictionary<string, HashSet<string>> _cache = new Dictionary<string, HashSet<string>>();
        private readonly object _lock = new object();
        private string _cacheFilePath;
        private IJsonSerializer _jsonSerializer;

        private TagCacheManager() { }

        public void Initialize(string dataPath, IJsonSerializer jsonSerializer)
        {
            _cacheFilePath = Path.Combine(dataPath, "homescreencompanion_cache.json");
            _jsonSerializer = jsonSerializer;
            Load();
        }

        /// <summary>Wires an <see cref="ILogger"/> used to surface swallowed cache failures.
        /// Optional — without it the manager keeps its old silent-failure behaviour.</summary>
        internal static void SetLogger(ILogger logger) => Log = logger;

        public void AddToCache(string providerId, string tag)
        {
            if (string.IsNullOrEmpty(providerId)) return;
            if (tag == null) return;
            lock (_lock)
            {
                if (!_cache.ContainsKey(providerId))
                {
                    _cache[providerId] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                }
                _cache[providerId].Add(tag);
            }
        }

        public void RemoveTagFromAllEntries(string tagName)
        {
            if (string.IsNullOrEmpty(tagName)) return;
            lock (_lock)
            {
                foreach (var key in _cache.Keys)
                    _cache[key].RemoveWhere(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
            }
        }

        public void ClearCache()
        {
            lock (_lock)
            {
                _cache.Clear();
            }
        }

        public List<string> GetTagsForIds(Dictionary<string, string> providerIds)
        {
            var tagsToApply = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (providerIds == null) return tagsToApply.ToList();

            lock (_lock)
            {
                if (_cache.Count == 0) return tagsToApply.ToList();

                var imdbKey = providerIds.Keys.FirstOrDefault(k => k.Equals("imdb", StringComparison.OrdinalIgnoreCase));
                if (imdbKey != null && providerIds.TryGetValue(imdbKey, out var imdbId)
                    && !string.IsNullOrEmpty(imdbId)
                    && _cache.TryGetValue($"imdb_{imdbId}", out var imdbTags))
                    foreach (var tag in imdbTags) tagsToApply.Add(tag);

                var tmdbKey = providerIds.Keys.FirstOrDefault(k => k.Equals("tmdb", StringComparison.OrdinalIgnoreCase));
                if (tmdbKey != null && providerIds.TryGetValue(tmdbKey, out var tmdbId)
                    && !string.IsNullOrEmpty(tmdbId)
                    && _cache.TryGetValue($"tmdb_{tmdbId}", out var tmdbTags))
                    foreach (var tag in tmdbTags) tagsToApply.Add(tag);
            }
            return tagsToApply.ToList();
        }

        public void Save()
        {
            if (_jsonSerializer == null || string.IsNullOrEmpty(_cacheFilePath)) return;
            lock (_lock)
            {
                try
                {
                    _jsonSerializer.SerializeToFile(_cache, _cacheFilePath);
                }
                catch (Exception ex)
                {
                    Log?.Warn("[TagCache] Save failed for '{0}': {1}", _cacheFilePath, ex.Message);
                }
            }
        }

        private void Load()
        {
            if (_jsonSerializer == null || string.IsNullOrEmpty(_cacheFilePath)) return;
            lock (_lock)
            {
                try
                {
                    if (File.Exists(_cacheFilePath))
                    {
                        var loaded = _jsonSerializer.DeserializeFromFile<Dictionary<string, List<string>>>(_cacheFilePath);
                        if (loaded != null)
                        {
                            _cache = new Dictionary<string, HashSet<string>>();
                            foreach (var kvp in loaded)
                                _cache[kvp.Key] = new HashSet<string>(kvp.Value ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Log?.Warn("[TagCache] Load failed for '{0}': {1}", _cacheFilePath, ex.Message);
                }
            }
        }
    }
}
