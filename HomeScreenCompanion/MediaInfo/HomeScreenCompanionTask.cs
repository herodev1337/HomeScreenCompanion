// Auto-generated partial file — see .planning/codebase/REFACTOR_MAP.md §B.3
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Users;
using HomeScreenCompanion.Criteria;
using System;
using System.Collections.Generic;
using System.Linq;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        private BaseItem ResolveItemForMediaInfo(BaseItem item, Dictionary<long, BaseItem> seriesEpisodeCache)
        {
            if (!item.GetType().Name.Contains("Series")) return item;
            if (!seriesEpisodeCache.TryGetValue(item.InternalId, out var cached))
            {
                cached = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { "Episode" },
                    Parent = item,
                    Recursive = true,
                    Limit = 1
                }).FirstOrDefault() ?? item;
                seriesEpisodeCache[item.InternalId] = cached;
            }
            return cached;
        }

        private DateTimeOffset? GetSeriesLastPlayed(User user, BaseItem seriesItem,
            Dictionary<(Guid, long), DateTimeOffset?> cache,
            Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)>? userDataCache = null)
        {
            var key = (user.Id, seriesItem.InternalId);
            if (cache.TryGetValue(key, out var cached)) return cached;

            var episodes = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { "Episode" },
                Parent = seriesItem,
                Recursive = true
            });

            DateTimeOffset? maxDate = null;
            foreach (var ep in episodes)
            {
                var epKey = (user.Id, ep.InternalId);
                DateTimeOffset? lpDate;
                if (userDataCache != null && userDataCache.TryGetValue(epKey, out var cd))
                {
                    lpDate = cd.LastPlayedDate;
                }
                else
                {
                    var ud = _userDataManager?.GetUserData(user, ep);
                    lpDate = ud?.LastPlayedDate;
                    if (userDataCache != null)
                        userDataCache[epKey] = ud == null ? (false, (DateTimeOffset?)null, 0) : (ud.Played, ud.LastPlayedDate, ud.PlayCount);
                }
                if (lpDate.HasValue && (maxDate == null || lpDate > maxDate))
                    maxDate = lpDate;
            }

            cache[key] = maxDate;
            return maxDate;
        }

        private static CachedMediaInfo ExtractMediaInfo(BaseItem itemToCheck)
        {
            var info = new CachedMediaInfo { AudioLanguages = new HashSet<string>(StringComparer.OrdinalIgnoreCase) };
            try
            {
                dynamic dynItem = itemToCheck;
                try {
                    int defaultWidth = (int)dynItem.Width;
                    if (defaultWidth >= 7680) info.Is8k = true;
                    else if (defaultWidth >= 3800) info.Is4k = true;
                    else if (defaultWidth >= 1900 && !info.Is4k && !info.Is8k) info.Is1080 = true;
                    else if (defaultWidth >= 1200 && !info.Is1080 && !info.Is4k && !info.Is8k) info.Is720 = true;
                    else if (defaultWidth > 0 && !info.Is720 && !info.Is1080 && !info.Is4k && !info.Is8k) info.IsSd = true;
                } catch { }

                System.Collections.IEnumerable streams = null;
                try { streams = dynItem.GetMediaStreams(); } catch { }
                if (streams == null) {
                    try {
                        var sources = dynItem.GetMediaSources(false);
                        if (sources != null) { foreach (var src in sources) { if (src.MediaStreams != null) { streams = src.MediaStreams; break; } } }
                    } catch { }
                }
                if (streams == null) { try { streams = dynItem.MediaStreams; } catch { } }

                if (streams != null)
                {
                    foreach (dynamic stream in streams)
                    {
                        try
                        {
                            string type = stream.Type?.ToString() ?? "";
                            string codec = stream.Codec?.ToString() ?? "";
                            string profile = stream.Profile?.ToString() ?? "";
                            string videoRange = "";
                            try { videoRange = stream.VideoRange?.ToString() ?? ""; } catch { }

                            if (type.Equals("Video", StringComparison.OrdinalIgnoreCase))
                            {
                                try { int w = (int)stream.Width; if (w >= 7680) info.Is8k = true; else if (w >= 3800) info.Is4k = true; else if (w >= 1900 && !info.Is4k && !info.Is8k) info.Is1080 = true; else if (w >= 1200 && !info.Is1080 && !info.Is4k && !info.Is8k) info.Is720 = true; else if (w > 0 && !info.Is720 && !info.Is1080 && !info.Is4k && !info.Is8k) info.IsSd = true; } catch { }
                                if (codec.IndexOf("hevc", StringComparison.OrdinalIgnoreCase) >= 0 || codec.IndexOf("h265", StringComparison.OrdinalIgnoreCase) >= 0) info.IsHevc = true;
                                if (codec.IndexOf("av1", StringComparison.OrdinalIgnoreCase) >= 0) info.IsAv1 = true;
                                if (codec.IndexOf("h264", StringComparison.OrdinalIgnoreCase) >= 0 || codec.IndexOf("avc", StringComparison.OrdinalIgnoreCase) >= 0) info.IsH264 = true;
                                if (profile.IndexOf("dv", StringComparison.OrdinalIgnoreCase) >= 0 || profile.IndexOf("dolby vision", StringComparison.OrdinalIgnoreCase) >= 0) info.IsDv = true;
                                if (profile.IndexOf("hdr10", StringComparison.OrdinalIgnoreCase) >= 0 || videoRange.IndexOf("hdr10", StringComparison.OrdinalIgnoreCase) >= 0) info.IsHdr10 = true;
                                if (videoRange.IndexOf("hdr", StringComparison.OrdinalIgnoreCase) >= 0 || profile.IndexOf("hdr", StringComparison.OrdinalIgnoreCase) >= 0) info.IsHdr = true;
                            }
                            else if (type.Equals("Audio", StringComparison.OrdinalIgnoreCase))
                            {
                                if (profile.IndexOf("atmos", StringComparison.OrdinalIgnoreCase) >= 0) info.IsAtmos = true;
                                if (codec.IndexOf("truehd", StringComparison.OrdinalIgnoreCase) >= 0) info.IsTrueHd = true;
                                if (codec.IndexOf("dts", StringComparison.OrdinalIgnoreCase) >= 0) { info.IsDts = true; if (profile.IndexOf("ma", StringComparison.OrdinalIgnoreCase) >= 0) info.IsDtsHdMa = true; }
                                if (codec.IndexOf("ac3", StringComparison.OrdinalIgnoreCase) >= 0 || codec.IndexOf("eac3", StringComparison.OrdinalIgnoreCase) >= 0) info.IsAc3 = true;
                                if (codec.IndexOf("aac", StringComparison.OrdinalIgnoreCase) >= 0) info.IsAac = true;
                                try { int ch = (int)stream.Channels; if (ch == 1) info.IsMono = true; else if (ch == 2) info.IsStereo = true; else if (ch == 6) info.Is51 = true; else if (ch >= 8) info.Is71 = true; } catch { }
                                try { var lang = stream.Language?.ToString(); if (!string.IsNullOrWhiteSpace(lang)) info.AudioLanguages.Add(lang); } catch { }
                                // Music-specific audio stream properties (only populated for Audio/MusicVideo items)
                                try { int br = (int)stream.BitRate; if (br > 0) info.BitRate = br / 1000; } catch { }
                                try { int sr = (int)stream.SampleRate; if (sr > 0) info.SampleRate = sr; } catch { }
                                try { int bps = (int)stream.BitDepth; if (bps > 0) info.BitsPerSample = bps; } catch { }
                            }
                        }
                        catch { }
                    }
                }

                info.DateModifiedDays = TryGetDateModified(itemToCheck);
                info.FileSizeMb = TryGetFileSize(itemToCheck);
                // Music item-level properties (IndexNumber = track, ParentIndexNumber = disc)
                try { int tn = (int)dynItem.IndexNumber; if (tn > 0) info.TrackNumber = tn; } catch { }
                try { int dn = (int)dynItem.ParentIndexNumber; if (dn > 0) info.DiscNumber = dn; } catch { }
            }
            catch { }
            return info;
        }

        private bool ItemMatchesMediaInfo(BaseItem item, TagConfig tagConfig, bool debug,
            Dictionary<long, BaseItem>? seriesEpisodeCache = null,
            Dictionary<string, HashSet<long>>? personCache = null,
            Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)>? userDataCache = null,
            CachedMediaInfo? cachedInfo = null,
            User[]? preloadedUsers = null,
            Dictionary<(Guid, long), DateTimeOffset?>? seriesLastPlayedCache = null,
            Dictionary<string, HashSet<long>>? collectionMembershipCache = null,
            Dictionary<long, List<string>>? seriesEpisodeNamesCache = null)
        {
            var filters = tagConfig.MediaInfoFilters;
            var legacy = tagConfig.MediaInfoConditions;
            bool hasFilters = filters != null && filters.Count > 0;
            bool hasLegacy = legacy != null && legacy.Count > 0;
            if (!hasFilters && !hasLegacy) return true;

            BaseItem itemToCheck;
            bool is4k, is1080, is720, is8k, isSd, isHevc, isAv1, isH264;
            bool isHdr, isHdr10, isDv, isAtmos, isTrueHd, isDtsHdMa, isDts, isAc3, isAac;
            bool is51, is71, isStereo, isMono;
            HashSet<string> audioLanguages;
            double? cachedDateModifiedDays, cachedFileSizeMb;
            double? cachedBitRate, cachedSampleRate, cachedBitsPerSample, cachedTrackNumber, cachedDiscNumber;

            if (cachedInfo.HasValue)
            {
                itemToCheck = item; // metadata (Studios, Genres etc.) from original item
                var ci = cachedInfo.Value;
                is4k = ci.Is4k; is8k = ci.Is8k; is1080 = ci.Is1080; is720 = ci.Is720; isSd = ci.IsSd;
                isHevc = ci.IsHevc; isAv1 = ci.IsAv1; isH264 = ci.IsH264;
                isHdr = ci.IsHdr; isHdr10 = ci.IsHdr10; isDv = ci.IsDv;
                isAtmos = ci.IsAtmos; isTrueHd = ci.IsTrueHd; isDtsHdMa = ci.IsDtsHdMa;
                isDts = ci.IsDts; isAc3 = ci.IsAc3; isAac = ci.IsAac;
                is51 = ci.Is51; is71 = ci.Is71; isStereo = ci.IsStereo; isMono = ci.IsMono;
                audioLanguages = ci.AudioLanguages ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                cachedDateModifiedDays = ci.DateModifiedDays;
                cachedFileSizeMb = ci.FileSizeMb;
                cachedBitRate = ci.BitRate;
                cachedSampleRate = ci.SampleRate;
                cachedBitsPerSample = ci.BitsPerSample;
                cachedTrackNumber = ci.TrackNumber;
                cachedDiscNumber = ci.DiscNumber;
            }
            else
            {
                itemToCheck = item;
                if (item.GetType().Name.Contains("Series"))
                    itemToCheck = seriesEpisodeCache != null
                        ? ResolveItemForMediaInfo(item, seriesEpisodeCache)
                        : (_libraryManager.GetItemList(new InternalItemsQuery { IncludeItemTypes = new[] { "Episode" }, Parent = item, Recursive = true, Limit = 1 }).FirstOrDefault() ?? item);

                var extracted = ExtractMediaInfo(itemToCheck);
                is4k = extracted.Is4k; is8k = extracted.Is8k; is1080 = extracted.Is1080; is720 = extracted.Is720; isSd = extracted.IsSd;
                isHevc = extracted.IsHevc; isAv1 = extracted.IsAv1; isH264 = extracted.IsH264;
                isHdr = extracted.IsHdr; isHdr10 = extracted.IsHdr10; isDv = extracted.IsDv;
                isAtmos = extracted.IsAtmos; isTrueHd = extracted.IsTrueHd; isDtsHdMa = extracted.IsDtsHdMa;
                isDts = extracted.IsDts; isAc3 = extracted.IsAc3; isAac = extracted.IsAac;
                is51 = extracted.Is51; is71 = extracted.Is71; isStereo = extracted.IsStereo; isMono = extracted.IsMono;
                audioLanguages = extracted.AudioLanguages;
                cachedDateModifiedDays = extracted.DateModifiedDays;
                cachedFileSizeMb = extracted.FileSizeMb;
                cachedBitRate = extracted.BitRate;
                cachedSampleRate = extracted.SampleRate;
                cachedBitsPerSample = extracted.BitsPerSample;
                cachedTrackNumber = extracted.TrackNumber;
                cachedDiscNumber = extracted.DiscNumber;
            }

            string mediaType = item.GetType().Name;
            string[] itemTags = item.Tags ?? Array.Empty<string>();

            // When EpisodeIncludeSeries: inherit parent series' tags so Tag criteria can match series-level tags
            if (item.GetType().Name.Contains("Episode") && TagConfigIncludesParentSeries(tagConfig))
            {
                try
                {
                    var parentSeries = ((dynamic)item).Series as BaseItem;
                    if (parentSeries?.Tags != null && parentSeries.Tags.Length > 0)
                        itemTags = itemTags.Concat(parentSeries.Tags)
                                           .Distinct(StringComparer.OrdinalIgnoreCase)
                                           .ToArray();
                }
                catch { }
            }

            if (hasFilters)
            {
                bool EvalCrit(string c) => EvaluateCriterion(c, itemToCheck, is4k, is1080, is720, is8k, isSd,
                    isHevc, isAv1, isH264, isHdr, isHdr10, isDv, isAtmos, isTrueHd, isDtsHdMa, isDts,
                    isAc3, isAac, is51, is71, isStereo, isMono, personCache, audioLanguages, mediaType, itemTags,
                    userDataCache, cachedDateModifiedDays, cachedFileSizeMb, preloadedUsers, seriesLastPlayedCache,
                    cachedBitRate, cachedSampleRate, cachedBitsPerSample, cachedTrackNumber, cachedDiscNumber,
                    collectionMembershipCache, seriesEpisodeNamesCache);
                bool EvalGroup(MediaInfoFilter f)
                {
                    if (f.Criteria == null || f.Criteria.Count == 0) return true;
                    bool isOr = string.Equals(f.Operator, "OR", StringComparison.OrdinalIgnoreCase);
                    bool hasViewerCriteria = false;
                    foreach (var c in f.Criteria)
                        if (IsViewerDependentCriterion(c)) { hasViewerCriteria = true; break; }
                    if (!hasViewerCriteria)
                        return isOr ? f.Criteria.Any(EvalCrit) : f.Criteria.All(EvalCrit);
                    // Viewer-dependent criteria are resolved per user by the home section query,
                    // never during the global tag/collection scan.
                    var evalCriteria = f.Criteria.Where(c => !IsViewerDependentCriterion(c)).ToList();
                    if (evalCriteria.Count == 0) return true;
                    return isOr ? evalCriteria.Any(EvalCrit) : evalCriteria.All(EvalCrit);
                }
                bool result = EvalGroup(filters![0]);
                for (int gi = 1; gi < filters.Count; gi++)
                {
                    bool groupResult = EvalGroup(filters[gi]);
                    bool useOr = string.Equals(filters[gi].GroupOperator, "OR", StringComparison.OrdinalIgnoreCase);
                    result = useOr ? result || groupResult : result && groupResult;
                }
                return result;
            }

            foreach (var cond in legacy!)
            {
                if (IsViewerDependentCriterion(cond)) continue;
                if (!EvaluateCriterion(cond, itemToCheck, is4k, is1080, is720, is8k, isSd, isHevc, isAv1, isH264,
                    isHdr, isHdr10, isDv, isAtmos, isTrueHd, isDtsHdMa, isDts, isAc3, isAac, is51, is71, isStereo, isMono,
                    personCache, audioLanguages, mediaType, itemTags, userDataCache, cachedDateModifiedDays, cachedFileSizeMb,
                    preloadedUsers, seriesLastPlayedCache, cachedBitRate, cachedSampleRate, cachedBitsPerSample, cachedTrackNumber,
                    cachedDiscNumber, collectionMembershipCache, seriesEpisodeNamesCache))
                    return false;
            }
            return true;
        }

        private bool EvaluateCriterion(string cond, BaseItem item, bool is4k, bool is1080, bool is720,
            bool is8k, bool isSd, bool isHevc, bool isAv1, bool isH264,
            bool isHdr, bool isHdr10, bool isDv, bool isAtmos, bool isTrueHd,
            bool isDtsHdMa, bool isDts, bool isAc3, bool isAac,
            bool is51, bool is71, bool isStereo, bool isMono,
            Dictionary<string, HashSet<long>>? personCache = null,
            HashSet<string>? audioLanguages = null,
            string? mediaType = null,
            string[]? itemTags = null,
            Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)>? userDataCache = null,
            double? cachedDateModifiedDays = null,
            double? cachedFileSizeMb = null,
            User[]? preloadedUsers = null,
            Dictionary<(Guid, long), DateTimeOffset?>? seriesLastPlayedCache = null,
            double? cachedBitRate = null,
            double? cachedSampleRate = null,
            double? cachedBitsPerSample = null,
            double? cachedTrackNumber = null,
            double? cachedDiscNumber = null,
            Dictionary<string, HashSet<long>>? collectionMembershipCache = null,
            Dictionary<long, List<string>>? seriesEpisodeNamesCache = null)
        {
            bool negate = cond.Length > 0 && cond[0] == '!';
            if (negate) cond = cond.Substring(1);
            bool evalResult = EvaluateCriterionCore(cond);
            return negate ? !evalResult : evalResult;

            bool EvaluateCriterionCore(string c)
            {
            // Handle Collection/Playlist before Split(':') — names may contain colons
            if (c.StartsWith("Collection:", StringComparison.OrdinalIgnoreCase) ||
                c.StartsWith("Playlist:", StringComparison.OrdinalIgnoreCase))
            {
                var ci = c.IndexOf(':');
                var cpProp = c.Substring(0, ci);
                var cpVal  = c.Substring(ci + 1).Trim();
                return cpProp.Equals("Collection", StringComparison.OrdinalIgnoreCase)
                    ? collectionMembershipCache != null && SplitCommaValues(cpVal).Any(n => collectionMembershipCache.TryGetValue("Collection:" + n, out var cIds) && cIds.Contains(item.InternalId))
                    : collectionMembershipCache != null && SplitCommaValues(cpVal).Any(n => collectionMembershipCache.TryGetValue("Playlist:" + n, out var pIds)  && pIds.Contains(item.InternalId));
            }
            var parts = c.Split(':');
            if (parts.Length == 2)
            {
                var prop = parts[0]; var val = parts[1].Trim();
                return prop switch
                {
                    "Studio"        => SplitCommaValues(val).Any(v => MatchesAny(item.Studios, v)),
                    "Genre"         => SplitCommaValues(val).Any(v => MatchesAny(item.Genres, v)),
                    "Actor"         => personCache != null && SplitCommaValues(val).Any(n => personCache.TryGetValue("Actor:" + n, out var aIds) && aIds.Contains(item.InternalId)),
                    "Director"      => personCache != null && SplitCommaValues(val).Any(n => personCache.TryGetValue("Director:" + n, out var dIds) && dIds.Contains(item.InternalId)),
                    "Writer"        => personCache != null && SplitCommaValues(val).Any(n => personCache.TryGetValue("Writer:" + n, out var wIds) && wIds.Contains(item.InternalId)),
                    "Title"         => SplitCommaValues(val).Any(v => GetTitleName(item)?.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0),
                    "EpisodeTitle"  => SplitCommaValues(val).Any(v => MatchesEpisodeTitle(item, v, false, seriesEpisodeNamesCache)),
                    "Overview"      => SplitCommaValues(val).Any(v => item.Overview?.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0),
                    "ContentRating" => SplitCommaValues(val).Any(v => string.Equals(item.OfficialRating, v, StringComparison.OrdinalIgnoreCase)),
                    "AudioLanguage" => audioLanguages != null && SplitCommaValues(val).Any(v => audioLanguages.Contains(v)),
                    "MediaType"     => val.Equals("EpisodeIncludeSeries", StringComparison.OrdinalIgnoreCase)
                                        ? item.GetType().Name.Contains("Episode")
                                        : string.Equals(mediaType, val, StringComparison.OrdinalIgnoreCase),
                    "Tag"           => itemTags != null && SplitCommaValues(val).Any(v => MatchesAny(itemTags, v)),
                    "ImdbId"        => MatchesImdbId(item.GetProviderId("Imdb"), val),
                    "TvdbId"        => MatchesImdbId(item.GetProviderId("Tvdb"), val),
                    "FolderPath"    => SplitCommaValues(val).Any(v => !string.IsNullOrEmpty(item.Path) && item.Path.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0),
                    "Country"       => item.ProductionLocations != null && SplitCommaValues(val).Any(v => MatchesAny(item.ProductionLocations, v)),
                    "Artist"        => SplitCommaValues(val).Any(v => MatchesArtistOrAlbumArtist(item, v, false)),
                    "Album"         => SplitCommaValues(val).Any(v => MatchesAlbumTitle(item, v, false)),
                    _ => false
                };
            }
            if (parts.Length == 4)
            {
                var prop4 = parts[0]; var userId4 = parts[1]; var op4 = parts[2]; var valStr4 = parts[3];
                if (userId4 == "__any__" || userId4 == "__all__")
                {
                    bool matchAll = userId4 == "__all__";
                    var allUsers = preloadedUsers ?? _userManager.GetUserList(new UserQuery { IsDisabled = false });
                    if (allUsers == null || allUsers.Length == 0) return false;
                    if (prop4 == "IsPlayed")
                    {
                        bool wantWatched = string.Equals(valStr4, "Watched", StringComparison.OrdinalIgnoreCase);
                        Func<User, bool> checkPlayed = u => {
                            var k = (u.Id, item.InternalId);
                            if (userDataCache != null && userDataCache.TryGetValue(k, out var cd)) return cd.Played == wantWatched;
                            var ud2 = _userDataManager?.GetUserData(u, item);
                            if (userDataCache != null) userDataCache[k] = ud2 == null ? (false, null, 0) : (ud2.Played, ud2.LastPlayedDate, ud2.PlayCount);
                            return ud2 != null && ud2.Played == wantWatched;
                        };
                        return matchAll ? allUsers.All(checkPlayed) : allUsers.Any(checkPlayed);
                    }
                    if (prop4 == "LastPlayed" &&
                        double.TryParse(valStr4, System.Globalization.NumberStyles.Any,
                                        System.Globalization.CultureInfo.InvariantCulture, out var daysU))
                    {
                        bool isSeries = item.GetType().Name.Contains("Series");
                        Func<User, bool> checkLp = u => {
                            DateTimeOffset? lpDate;
                            if (isSeries)
                                lpDate = seriesLastPlayedCache != null ? GetSeriesLastPlayed(u, item, seriesLastPlayedCache, userDataCache) : null;
                            else
                            {
                                var k = (u.Id, item.InternalId);
                                if (userDataCache != null && userDataCache.TryGetValue(k, out var cd)) { lpDate = cd.LastPlayedDate; }
                                else { var ud2 = _userDataManager?.GetUserData(u, item); lpDate = ud2?.LastPlayedDate;
                                       if (userDataCache != null) userDataCache[k] = ud2 == null ? (false, (DateTimeOffset?)null, 0) : (ud2.Played, ud2.LastPlayedDate, ud2.PlayCount); }
                            }
                            if (lpDate == null) return false;
                            return ApplyNumericOp((DateTimeOffset.UtcNow - lpDate.Value).TotalDays, op4, daysU);
                        };
                        return matchAll ? allUsers.All(checkLp) : allUsers.Any(checkLp);
                    }
                    if (prop4 == "PlayCount" &&
                        double.TryParse(valStr4, System.Globalization.NumberStyles.Any,
                                        System.Globalization.CultureInfo.InvariantCulture, out var countU))
                    {
                        Func<User, bool> checkPc = u => {
                            var k = (u.Id, item.InternalId);
                            int playCount;
                            if (userDataCache != null && userDataCache.TryGetValue(k, out var cd)) { playCount = cd.PlayCount; }
                            else { var ud2 = _userDataManager?.GetUserData(u, item); playCount = ud2?.PlayCount ?? 0;
                                   if (userDataCache != null) userDataCache[k] = ud2 == null ? (false, (DateTimeOffset?)null, 0) : (ud2.Played, ud2.LastPlayedDate, ud2.PlayCount); }
                            return ApplyNumericOp(playCount, op4, countU);
                        };
                        return matchAll ? allUsers.All(checkPc) : allUsers.Any(checkPc);
                    }
                    return false;
                }
                if (!Guid.TryParse(userId4, out var guid4)) return false;
                var udKey = (guid4, item.InternalId);
                (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount) udResult;
                if (userDataCache != null && userDataCache.TryGetValue(udKey, out udResult))
                {
                }
                else
                {
                    var user4 = _userManager.GetUserById(guid4);
                    if (user4 == null) return false;
                    var ud = _userDataManager?.GetUserData(user4, item);
                    if (ud == null) return false;
                    udResult = (ud.Played, ud.LastPlayedDate, ud.PlayCount);
                    if (userDataCache != null) userDataCache[udKey] = udResult;
                }
                if (prop4 == "IsPlayed")
                {
                    bool wantWatched = string.Equals(valStr4, "Watched", StringComparison.OrdinalIgnoreCase);
                    return udResult.Played == wantWatched;
                }
                if (prop4 == "LastPlayed" &&
                    double.TryParse(valStr4, System.Globalization.NumberStyles.Any,
                                    System.Globalization.CultureInfo.InvariantCulture, out var days4))
                {
                    DateTimeOffset? lpDate4 = item.GetType().Name.Contains("Series") && seriesLastPlayedCache != null
                        ? GetSeriesLastPlayed(_userManager.GetUserById(guid4)!, item, seriesLastPlayedCache, userDataCache)
                        : udResult.LastPlayedDate;
                    if (!lpDate4.HasValue) return false;
                    return ApplyNumericOp((DateTime.UtcNow - lpDate4.Value).TotalDays, op4, days4);
                }
                if (prop4 == "PlayCount" &&
                    double.TryParse(valStr4, System.Globalization.NumberStyles.Any,
                                    System.Globalization.CultureInfo.InvariantCulture, out var count4))
                {
                    return ApplyNumericOp(udResult.PlayCount, op4, count4);
                }
                return false;
            }
            if (parts.Length == 3 && (parts[1] == "contains" || parts[1] == "exact"))
            {
                var tProp = parts[0]; var tOp = parts[1]; var tVal = parts[2].Trim();
                bool exact = tOp == "exact";
                return tProp switch
                {
                    "Title"         => exact ? SplitCommaValues(tVal).Any(v => string.Equals(GetTitleName(item), v, StringComparison.OrdinalIgnoreCase))
                                             : SplitCommaValues(tVal).Any(v => GetTitleName(item)?.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0),
                    "EpisodeTitle"  => SplitCommaValues(tVal).Any(v => MatchesEpisodeTitle(item, v, exact, seriesEpisodeNamesCache)),
                    "Overview"      => exact ? SplitCommaValues(tVal).Any(v => string.Equals(item.Overview, v, StringComparison.OrdinalIgnoreCase))
                                             : SplitCommaValues(tVal).Any(v => item.Overview?.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0),
                    "Studio"        => exact ? item.Studios != null && SplitCommaValues(tVal).Any(v => item.Studios.Any(s => string.Equals(s, v, StringComparison.OrdinalIgnoreCase)))
                                             : SplitCommaValues(tVal).Any(v => MatchesAny(item.Studios, v)),
                    "Genre"         => exact ? item.Genres != null && SplitCommaValues(tVal).Any(v => item.Genres.Any(g => string.Equals(g, v, StringComparison.OrdinalIgnoreCase)))
                                             : SplitCommaValues(tVal).Any(v => MatchesAny(item.Genres, v)),
                    "Tag"           => exact ? itemTags != null && SplitCommaValues(tVal).Any(v => itemTags.Any(t => string.Equals(t, v, StringComparison.OrdinalIgnoreCase)))
                                             : itemTags != null && SplitCommaValues(tVal).Any(v => MatchesAny(itemTags, v)),
                    "ContentRating" => exact ? SplitCommaValues(tVal).Any(v => string.Equals(item.OfficialRating, v, StringComparison.OrdinalIgnoreCase))
                                             : SplitCommaValues(tVal).Any(v => item.OfficialRating?.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0),
                    "AudioLanguage" => exact ? audioLanguages != null && SplitCommaValues(tVal).Any(v => audioLanguages.Contains(v))
                                             : audioLanguages != null && SplitCommaValues(tVal).Any(v => audioLanguages.Any(l => l.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0)),
                    "Actor"         => personCache != null && (exact
                                        ? SplitCommaValues(tVal).Any(n => personCache.TryGetValue("Actor:exact:" + n, out var aIds3) && aIds3.Contains(item.InternalId))
                                        : SplitCommaValues(tVal).Any(n => personCache.TryGetValue("Actor:contains:" + n, out var aIdsC) && aIdsC.Contains(item.InternalId))),
                    "Director"      => personCache != null && (exact
                                        ? SplitCommaValues(tVal).Any(n => personCache.TryGetValue("Director:exact:" + n, out var dIds3) && dIds3.Contains(item.InternalId))
                                        : SplitCommaValues(tVal).Any(n => personCache.TryGetValue("Director:contains:" + n, out var dIdsC) && dIdsC.Contains(item.InternalId))),
                    "Writer"        => personCache != null && (exact
                                        ? SplitCommaValues(tVal).Any(n => personCache.TryGetValue("Writer:exact:" + n, out var wIds3) && wIds3.Contains(item.InternalId))
                                        : SplitCommaValues(tVal).Any(n => personCache.TryGetValue("Writer:contains:" + n, out var wIdsC) && wIdsC.Contains(item.InternalId))),
                    "Artist"        => SplitCommaValues(tVal).Any(v => MatchesArtistOrAlbumArtist(item, v, exact)),
                    "Album"         => SplitCommaValues(tVal).Any(v => MatchesAlbumTitle(item, v, exact)),
                    "FolderPath"    => exact
                                        ? SplitCommaValues(tVal).Any(v => string.Equals(item.Path, v, StringComparison.OrdinalIgnoreCase))
                                        : SplitCommaValues(tVal).Any(v => !string.IsNullOrEmpty(item.Path) && item.Path.IndexOf(v, StringComparison.OrdinalIgnoreCase) >= 0),
                    "Country"       => exact
                                        ? item.ProductionLocations != null && SplitCommaValues(tVal).Any(v => item.ProductionLocations.Any(c => string.Equals(c, v, StringComparison.OrdinalIgnoreCase)))
                                        : item.ProductionLocations != null && SplitCommaValues(tVal).Any(v => MatchesAny(item.ProductionLocations, v)),
                    _ => false
                };
            }
            if (parts.Length == 3 && double.TryParse(parts[2],
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var num))
            {
                double? v = parts[0] switch
                {
                    "CommunityRating" => (double?)item.CommunityRating,
                    "Year"            => (double?)item.ProductionYear,
                    "Runtime"         => item.RunTimeTicks.HasValue
                                        ? (double?)(item.RunTimeTicks.Value / TimeSpan.TicksPerMinute) : null,
                    "DateAdded"       => (double?)(DateTime.UtcNow - item.DateCreated).TotalDays,
                    "DateModified"    => cachedDateModifiedDays ?? TryGetDateModified(item),
                    "FileSize"        => cachedFileSizeMb ?? TryGetFileSize(item),
                    "BitRate"          => cachedBitRate,
                    "SampleRate"       => cachedSampleRate,
                    "BitsPerSample"    => cachedBitsPerSample,
                    "TrackNumber"      => cachedTrackNumber,
                    "DiscNumber"       => cachedDiscNumber,
                    "WatchedByCount"   => (double?)CountWatchedByUsers(item, preloadedUsers, userDataCache),
                    _ => null
                };
                if (!v.HasValue) return false;
                return ApplyNumericOp(v.Value, parts[1], num);
            }
            return c switch
            {
                "4K" => is4k, "8K" => is8k, "1080p" => is1080, "720p" => is720, "SD" => isSd,
                "HEVC" => isHevc, "AV1" => isAv1, "H264" => isH264,
                "HDR" => isHdr || isDv, "HDR10" => isHdr10, "DolbyVision" => isDv,
                "Atmos" => isAtmos, "TrueHD" => isTrueHd, "DtsHdMa" => isDtsHdMa,
                "DTS" => isDts, "AC3" => isAc3, "AAC" => isAac,
                "7.1" => is71, "5.1" => is51, "Stereo" => isStereo, "Mono" => isMono,
                // Viewer-dependent — never true during the global scan; resolved per user by the home section query.
                "InProgress" => false,
                _ => false
            };
            } // EvaluateCriterionCore
        }

        private static bool MatchesAny(string[] values, string search) =>
            values != null && values.Any(v =>
                v.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0);

        private static string[] SplitCommaValues(string val) =>
            val.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
               .Select(v => v.Trim()).Where(v => v.Length > 0).ToArray();

        private static bool MatchesImdbId(string? itemImdb, string val) =>
            !string.IsNullOrEmpty(itemImdb) &&
            val.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
               .Any(id => string.Equals(itemImdb, id.Trim(), StringComparison.OrdinalIgnoreCase));

        private static bool MatchesPerson(BaseItem item, string name, string type)
        {
            try
            {
                dynamic dynItem = item;
                var people = dynItem.People;
                if (people == null) return false;
                foreach (dynamic p in people)
                {
                    string pType = p.Type?.ToString() ?? "";
                    string pName = p.Name ?? "";
                    if (string.Equals(pType, type, StringComparison.OrdinalIgnoreCase) &&
                        pName.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0)
                        return true;
                }
            }
            catch { }
            return false;
        }

        private static string? GetTitleName(BaseItem item)
        {
            if (item.GetType().Name.Contains("Episode"))
            {
                try { return ((dynamic)item).Series?.Name as string; } catch { }
                return null;
            }
            return item.Name;
        }

        private static IEnumerable<string> GetAllCriteria(TagConfig tagConfig)
        {
            var fromFilters = tagConfig.MediaInfoFilters?.SelectMany(f => f.Criteria ?? Enumerable.Empty<string>())
                ?? Enumerable.Empty<string>();
            var fromConditions = tagConfig.MediaInfoConditions?.AsEnumerable()
                ?? Enumerable.Empty<string>();
            return fromFilters.Concat(fromConditions);
        }

        private static bool IsViewerDependentCriterion(string cond) =>
            CriterionCatalog.IsViewerScoped(cond);

        private static bool HasViewerCriteria(TagConfig tagConfig) =>
            GetAllCriteria(tagConfig).Any(IsViewerDependentCriterion);

        private static bool IsViewerOnlyMediaInfoFilter(TagConfig tagConfig)
        {
            if (!string.Equals(tagConfig.SourceType, "MediaInfo", StringComparison.OrdinalIgnoreCase)) return false;
            return CriterionCatalog.IsViewerOnlyGroup(GetAllCriteria(tagConfig));
        }

        private static string EffectiveLegacyTargetType(TagConfig tagConfig)
        {
            if (!string.IsNullOrEmpty(tagConfig.MediaInfoTargetType))
                return tagConfig.MediaInfoTargetType;
            if (tagConfig.MediaInfoSeasonMode && tagConfig.SourceType == "MediaInfo")
                return "Season";
            return "";
        }

        private static bool MatchesArtistOrAlbumArtist(BaseItem item, string name, bool exact)
        {
            try
            {
                dynamic d = item;
                try
                {
                    string albumArtist = d.AlbumArtist ?? "";
                    if (exact ? string.Equals(albumArtist, name, StringComparison.OrdinalIgnoreCase)
                              : albumArtist.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0)
                        return true;
                }
                catch { }
                try
                {
                    System.Collections.IEnumerable artists = d.Artists;
                    if (artists != null)
                        foreach (string a in artists)
                            if (a != null && (exact ? string.Equals(a, name, StringComparison.OrdinalIgnoreCase)
                                                    : a.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0))
                                return true;
                }
                catch { }
            }
            catch { }
            return false;
        }

        private static bool MatchesAlbumTitle(BaseItem item, string name, bool exact)
        {
            try
            {
                dynamic d = item;
                string album = d.Album ?? "";
                return exact ? string.Equals(album, name, StringComparison.OrdinalIgnoreCase)
                             : album.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch { return false; }
        }

        private int CountWatchedByUsers(BaseItem item,
            User[]? users,
            Dictionary<(Guid, long), (bool Played, DateTimeOffset? LastPlayedDate, int PlayCount)>? userDataCache)
        {
            if (users == null || users.Length == 0) return 0;
            int count = 0;
            foreach (var u in users)
            {
                var k = (u.Id, item.InternalId);
                bool played;
                if (userDataCache != null && userDataCache.TryGetValue(k, out var cd))
                    played = cd.Played;
                else
                {
                    var ud = _userDataManager?.GetUserData(u, item);
                    played = ud?.Played ?? false;
                    if (userDataCache != null)
                        userDataCache[k] = ud == null
                            ? (false, (DateTimeOffset?)null, 0)
                            : (ud.Played, ud.LastPlayedDate, ud.PlayCount);
                }
                if (played) count++;
            }
            return count;
        }

        private static bool TagConfigIncludesParentSeries(TagConfig tagConfig) =>
            GetAllCriteria(tagConfig).Any(c =>
                c.TrimStart('!').Equals("MediaType:EpisodeIncludeSeries", StringComparison.OrdinalIgnoreCase));

        private bool MatchesEpisodeTitle(BaseItem item, string val, bool exact,
            Dictionary<long, List<string>>? seriesEpisodeNamesCache = null)
        {
            Func<string?, bool> matches = exact
                ? (n => string.Equals(n, val, StringComparison.OrdinalIgnoreCase))
                : (n => n?.IndexOf(val, StringComparison.OrdinalIgnoreCase) >= 0);

            var typeName = item.GetType().Name;

            if (typeName.Contains("Movie"))   return false;
            if (typeName.Contains("Episode")) return matches(item.Name);
            if (typeName.Contains("Series"))
            {
                if (seriesEpisodeNamesCache != null && seriesEpisodeNamesCache.TryGetValue(item.InternalId, out var names))
                    return names.Any(n => matches(n));
                var episodes = _libraryManager.GetItemList(new InternalItemsQuery
                {
                    IncludeItemTypes = new[] { "Episode" },
                    Parent = item,
                    Recursive = true
                });
                return episodes.Any(ep => matches(ep.Name));
            }
            return false;
        }

        private static bool ApplyNumericOp(double v, string op, double num) => op switch
        {
            ">"  => v > num,
            ">=" => v >= num,
            "<"  => v < num,
            "<=" => v <= num,
            "="  => Math.Abs(v - num) < 0.01,
            _ => false
        };

        private static double? TryGetDateModified(BaseItem item)
        {
            try { dynamic d = item; DateTime dt = d.DateModified; return (DateTime.UtcNow - dt).TotalDays; }
            catch { return null; }
        }

        private static double? TryGetFileSize(BaseItem item)
        {
            try { dynamic d = item; long? sz = d.Size; return sz.HasValue ? (double?)(sz.Value / 1048576.0) : null; }
            catch { return null; }
        }

    }
}
