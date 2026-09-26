// Partial of HomeScreenCompanionTask — HomeSections responsibilities (manage, sync, criteria evaluation).
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;
using MediaBrowser.Model.Serialization;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using MediaBrowser.Model.Users;
using HomeScreenCompanion.Criteria;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionTask
    {
        // Utökar ItemsQuery med IsUnplayed så att Embys JSON-serialisering inkluderar fältet.
        // IsPlayed finns nativt i ItemsQuery (Emby 4.10.0.10+) och sätts via basklassen.
        private class ExtendedItemsQuery : ItemsQuery
        {
            public bool? IsUnplayed { get; set; }
        }
        private void ManageHomeSections(PluginConfiguration config, CancellationToken cancellationToken, bool debug = false, List<GroupRunStats>? statsList = null, string? filterTagName = null)
        {
            bool configChanged = false;
            var processedHsKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var tc in config.Tags)
            {
                // When running single-entry, only process the specific tag
                if (filterTagName != null && !string.Equals(tc.Tag?.Trim(), filterTagName, StringComparison.OrdinalIgnoreCase))
                    continue;

                bool isActive = tc.Active && IsScheduleActive(tc.ActiveIntervals);

                if (tc.HomeSectionTracked == null)
                    tc.HomeSectionTracked = new List<HomeSectionTracking>();

                var safeTag = string.Concat((tc.Tag ?? tc.Name ?? "").Take(40)
                    .Select(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' ? c : '_'));
                var sectionMarker = "hsc__" + safeTag;

                string _hsTagName = (tc.Tag ?? "").Trim();
                string _hsDisplayName = !string.IsNullOrWhiteSpace(tc.Name) ? $"{tc.Name} [{_hsTagName}]" : _hsTagName;

                // Deduplicate flat entries that share the same group (Name + Tag).
                // Must happen before the inactive check so that duplicate flat entries
                // for an inactive group don't each log a separate "home section removed".
                var hsKey = GroupKey(tc);
                bool isFirstForGroup = processedHsKeys.Add(hsKey);

                if (!tc.EnableHomeSection || !isActive)
                {
                    if (tc.HomeSectionTracked.Count > 0)
                    {
                        if (isFirstForGroup)
                        {
                            // First flat entry for this group — do the actual removal and log it.
                            int _removedHs = 0;
                            foreach (var tracking in tc.HomeSectionTracked)
                            {
                                try
                                {
                                    var uid = _userManager.GetInternalId(tracking.UserId);
                                    DeleteSectionForUser(uid, tracking.SectionId, sectionMarker, tc.HomeSectionSettings, cancellationToken);
                                    _removedHs++;
                                }
                                catch (Exception ex)
                                {
                                    _log.Warn($"{_hsDisplayName}: home section could not be removed: {ex.Message}");
                                }
                            }
                            if (_removedHs > 0)
                            {
                                var _gsR = statsList?.FirstOrDefault(s => s.TagName != null && string.Equals(s.TagName, _hsTagName, StringComparison.OrdinalIgnoreCase));
                                if (_gsR != null) _gsR.HomeSectionRemoved = true;
                                _log.Skip($"{_hsDisplayName}: home section removed for {RunLog.Plural(_removedHs, "user")} (group is {(tc.EnableHomeSection ? "inactive or not in schedule" : "no longer set to show a home section")})");
                            }
                        }
                        // Always clear tracking (including duplicate flat entries) so this
                        // doesn't repeat on subsequent runs.
                        tc.HomeSectionTracked.Clear();
                        configChanged = true;
                    }
                    continue;
                }

                if (!isFirstForGroup)
                {
                    if (tc.HomeSectionTracked.Count > 0) { tc.HomeSectionTracked.Clear(); configChanged = true; }
                    continue;
                }

                Dictionary<string, string> settingsDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    if (!string.IsNullOrEmpty(tc.HomeSectionSettings) && tc.HomeSectionSettings != "{}")
                        settingsDict = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tc.HomeSectionSettings) ?? settingsDict;
                }
                catch { /* ignore malformed settings */ }

                if (!settingsDict.ContainsKey("SectionType"))
                    settingsDict["SectionType"] = (tc.EnableCollection && !string.IsNullOrEmpty(tc.CollectionName)) ? "boxset" : "items";

                // Viewer-dependent criteria (IsPlayed:__current__ / InProgress) are applied as native
                // per-viewer query filters (IsPlayed / IsResumable) on the section instead of the global tag scan.
                ApplyViewerCriteriaToSectionSettings(tc, settingsDict);
                if (settingsDict.TryGetValue("SectionType", out var _hsStCheck) && _hsStCheck == "boxset"
                    && GetAllCriteria(tc).Any(IsViewerDependentCriterion))
                    HsWarn(statsList, _hsTagName, _hsDisplayName, "current-user filters only work with the Dynamic Media (tag) section type — a collection section cannot be per-user");

                // Series items never carry a playback position in Emby (only Episodes do). The
                // catalog pivots "In Progress (viewer)" + MediaType:Series to in-progress Episodes
                // — warn so the resulting section contents aren't a surprise.
                if (settingsDict.TryGetValue("_querySeriesPivot", out var _qPivot) && _qPivot == "true")
                    HsWarn(statsList, _hsTagName, _hsDisplayName, "'In Progress (viewer)' with MediaType:Series shows your in-progress Episodes — Series items themselves have no playback position in Emby.");

                // Back-fill CustomName from group name/tag when not explicitly configured
                if (!settingsDict.TryGetValue("CustomName", out var _existingCn) || string.IsNullOrWhiteSpace(_existingCn))
                {
                    var _defaultCn = !string.IsNullOrWhiteSpace(tc.Name) ? tc.Name : tc.Tag;
                    if (!string.IsNullOrWhiteSpace(_defaultCn))
                        settingsDict["CustomName"] = _defaultCn;
                }

                settingsDict.TryGetValue("SectionType", out var sectionType);

                // For items-type sections, dynamically ensure all top-list libraries are excluded
                if (sectionType == "items")
                {
                    var topListLibIds = (config?.TopLists ?? new System.Collections.Generic.List<TopListHomeSection>())
                        .Where(t => !string.IsNullOrEmpty(t.HomeSectionLibraryId) && t.HomeSectionLibraryId != "auto")
                        .Select(t => t.HomeSectionLibraryId)
                        .ToList();
                    if (topListLibIds.Count > 0)
                    {
                        var current = (settingsDict.TryGetValue("_queryExcludeViewIds", out var ev) ? ev : "")
                            .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                            .Select(s => s.Trim())
                            .ToList();
                        bool excChanged = false;
                        foreach (var id in topListLibIds)
                            if (!current.Contains(id, StringComparer.OrdinalIgnoreCase))
                            { current.Add(id); excChanged = true; }
                        if (excChanged)
                        {
                            var excStr = string.Join(",", current);
                            settingsDict["_queryExcludeViewIds"] = excStr;
                            settingsDict["ExcludedFolders"] = excStr;
                        }
                    }
                }

                string resolvedLibraryId = null;
                if (sectionType == "boxset")
                {
                    if (tc.HomeSectionLibraryId == "auto")
                    {
                        if (tc.EnableCollection && !string.IsNullOrEmpty(tc.CollectionName))
                        {
                            var coll = _libraryManager.GetItemList(new InternalItemsQuery
                            {
                                IncludeItemTypes = new[] { "BoxSet" },
                                Name = tc.CollectionName,
                                Recursive = true
                            }).FirstOrDefault();
                            if (coll != null)
                                resolvedLibraryId = coll.InternalId.ToString();
                            else
                                HsWarn(statsList, _hsTagName, _hsDisplayName, $"collection '{tc.CollectionName}' was not found, so the home section could not be created");
                        }
                    }
                    else if (!string.IsNullOrEmpty(tc.HomeSectionLibraryId))
                    {
                        resolvedLibraryId = tc.HomeSectionLibraryId;
                    }

                    if (string.IsNullOrEmpty(resolvedLibraryId))
                    {
                        HsWarn(statsList, _hsTagName, _hsDisplayName, "home section skipped — no collection to show");
                        continue;
                    }
                }

                // A MediaInfo group whose criteria are all expressible as a native per-viewer /
                // static section query has no tag output — the section is driven purely by the
                // per-viewer query below (see CriterionCatalog.IsViewerOnlyGroup).
                bool _viewerOnlyFilter = IsViewerOnlyMediaInfoFilter(tc);

                if (sectionType == "items" && !string.IsNullOrEmpty(tc.Tag) && !_viewerOnlyFilter)
                {
                    var tagItem = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        IncludeItemTypes = new[] { "Tag" },
                        Name = tc.Tag,
                        Recursive = true
                    }).FirstOrDefault();
                    if (tagItem != null)
                        settingsDict["_queryTagId"] = tagItem.InternalId.ToString();
                    else
                        HsWarn(statsList, _hsTagName, _hsDisplayName, $"tag '{tc.Tag}' does not exist in the library yet, so the home section may be empty");
                }

                var removedUsers = tc.HomeSectionTracked.Where(t => !tc.HomeSectionUserIds.Contains(t.UserId)).ToList();
                foreach (var t in removedUsers)
                {
                    try
                    {
                        var uid = _userManager.GetInternalId(t.UserId);
                        DeleteSectionForUser(uid, t.SectionId, sectionMarker, tc.HomeSectionSettings, cancellationToken);
                    }
                    catch { }
                    tc.HomeSectionTracked.Remove(t);
                    configChanged = true;
                }

                int _hsSynced = 0;
                if (tc.HomeSectionUserIds.Count > 0)
                    _log.Section($"Home section: {_hsDisplayName}");
                foreach (var userId in tc.HomeSectionUserIds)
                {
                    string _hsAction = "created";
                    try
                    {
                        var userInternalId = _userManager.GetInternalId(userId);

                        var tracked = tc.HomeSectionTracked.FirstOrDefault(t => t.UserId == userId);

                        string trackId = sectionMarker;

                        // Hämta alla sektioner en gång — återanvänds för både ID-sökning och markör-fallback
                        var currentSections = _userManager.GetHomeSections(userInternalId, cancellationToken);
                        var allCurrentSections = currentSections?.Sections ?? Array.Empty<ContentSection>();

                        // Hitta vår sektion: 1) via spårat ID, 2) via CustomName-fallback (skyddar mot att Emby tilldelar nytt ID vid omordning)
                        ContentSection? ownedSection = null;
                        if (tracked != null && !string.IsNullOrEmpty(tracked.SectionId) && !tracked.SectionId.StartsWith("hsc__"))
                            ownedSection = allCurrentSections.FirstOrDefault(s => s.Id == tracked.SectionId);
                        if (ownedSection == null && settingsDict.TryGetValue("CustomName", out var _hsFallbackName) && !string.IsNullOrEmpty(_hsFallbackName))
                            ownedSection = allCurrentSections.FirstOrDefault(s => string.Equals(s.CustomName, _hsFallbackName, StringComparison.OrdinalIgnoreCase));

                        if (ownedSection != null)
                        {
                            try
                            {
                                // Hämta befintlig sektion som bas — plugin-inställningar appliceras ovanpå utan att nollställa Emby-egna värden
                                var updateSection = BuildContentSection(_jsonSerializer, settingsDict, resolvedLibraryId, ownedSection);
                                updateSection.Id = ownedSection.Id;
                                _userManager.UpdateHomeSection(userInternalId, updateSection, cancellationToken);
                                trackId = ownedSection.Id ?? sectionMarker;
                                _hsAction = "updated";
                                goto _hsSectionDone;
                            }
                            catch
                            {
                                // Uppdatering misslyckades — fortsätt till skapande
                            }
                        }

                        // Sektion finns inte — skapa ny
                        {
                            var beforeIds = new HashSet<string>(
                                allCurrentSections.Where(s => !string.IsNullOrEmpty(s.Id)).Select(s => s.Id));
                            _userManager.AddHomeSection(userInternalId, BuildContentSection(_jsonSerializer, settingsDict, resolvedLibraryId), cancellationToken);
                            var afterSections = _userManager.GetHomeSections(userInternalId, cancellationToken);
                            var newId = (afterSections?.Sections ?? Array.Empty<ContentSection>())
                                .Where(s => !string.IsNullOrEmpty(s.Id) && !beforeIds.Contains(s.Id))
                                .Select(s => s.Id).FirstOrDefault() ?? "";
                            trackId = !string.IsNullOrEmpty(newId) ? newId : sectionMarker;
                        }

                    _hsSectionDone:

                        if (tracked != null)
                            tracked.SectionId = trackId;
                        else
                            tc.HomeSectionTracked.Add(new HomeSectionTracking { UserId = userId, SectionId = trackId });

                        configChanged = true;
                        _hsSynced++;
                        if (debug)
                        {
                            string _hsUserName = Guid.TryParse(userId, out var _hsGuid)
                                ? (_userManager.GetUserById(_hsGuid)?.Name ?? userId)
                                : userId;
                            _log.Debug($"  {_hsUserName}: {_hsAction} (section id {trackId})");
                        }
                    }
                    catch (Exception ex)
                    {
                        string _hsUserName2 = Guid.TryParse(userId, out var _hsGuid2)
                            ? (_userManager.GetUserById(_hsGuid2)?.Name ?? userId)
                            : userId;
                        HsWarn(statsList, _hsTagName, _hsDisplayName, $"home section failed for {_hsUserName2}: {ex.Message}");
                    }
                }
                if (_hsSynced > 0)
                {
                    var _gsS = statsList?.FirstOrDefault(s => s.TagName != null && string.Equals(s.TagName, _hsTagName, StringComparison.OrdinalIgnoreCase));
                    if (_gsS != null) { _gsS.HomeSectionSynced = true; _gsS.HomeSectionUserCount = _hsSynced; }
                    _log.Ok($"{_hsDisplayName}: home section synced for {RunLog.Plural(_hsSynced, "user")}");
                }
                else if (tc.HomeSectionUserIds.Count == 0)
                {
                    HsWarn(statsList, _hsTagName, _hsDisplayName, "home section enabled but no users are selected");
                }
            }

            if (configChanged)
                Plugin.Instance.SaveConfiguration();
        }

        private void DeleteSectionForUser(long userInternalId, string sectionId, string sectionMarker, string settingsJson, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrEmpty(sectionId) && !sectionId.StartsWith("hsc__"))
            {
                _userManager.DeleteHomeSections(userInternalId, new[] { sectionId }, cancellationToken);
                return;
            }

            ContentSection[] allSections;
            try { allSections = _userManager.GetHomeSections(userInternalId, cancellationToken)?.Sections ?? Array.Empty<ContentSection>(); }
            catch { return; }

            var marker = (!string.IsNullOrEmpty(sectionId) && sectionId.StartsWith("hsc__")) ? sectionId : sectionMarker;
            if (!string.IsNullOrEmpty(marker))
            {
                var markerIds = allSections
                    .Where(s => s.Subtitle == marker && !string.IsNullOrEmpty(s.Id))
                    .Select(s => s.Id).ToArray();
                if (markerIds.Length > 0)
                {
                    _userManager.DeleteHomeSections(userInternalId, markerIds, cancellationToken);
                    return;
                }
            }

            try
            {
                var hint = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(settingsJson ?? "{}");
                if (hint != null && hint.TryGetValue("CustomName", out var cn) && !string.IsNullOrEmpty(cn))
                {
                    var fallbackIds = allSections
                        .Where(s => s.CustomName == cn && !string.IsNullOrEmpty(s.Id))
                        .Select(s => s.Id).ToArray();
                    if (fallbackIds.Length > 0)
                        _userManager.DeleteHomeSections(userInternalId, fallbackIds, cancellationToken);
                }
            }
            catch { }
        }

        internal static ContentSection BuildContentSection(IJsonSerializer jsonSerializer, Dictionary<string, string> settings, string libraryId, ContentSection existing = null)
        {
            var section = existing ?? new ContentSection();

            // Phase 1: scalar/value ContentSection properties (typed assignments).
            // Empty values clear string + Nullable<T> fields; other types are left untouched.
            // Malformed values are silently skipped, matching the previous reflection loop.
            foreach (var kvp in settings)
            {
                var key = kvp.Key;
                var val = kvp.Value;
                try
                {
                    switch (key)
                    {
                        case "Name": section.Name = EmptyToNull(val); break;
                        case "CustomName": section.CustomName = EmptyToNull(val); break;
                        case "Subtitle": section.Subtitle = EmptyToNull(val); break;
                        case "SectionType": section.SectionType = EmptyToNull(val); break;
                        case "CollectionType": section.CollectionType = EmptyToNull(val); break;
                        case "ViewType": section.ViewType = EmptyToNull(val); break;
                        case "ImageType": section.ImageType = EmptyToNull(val); break;
                        case "DisplayMode": section.DisplayMode = EmptyToNull(val); break;
                        case "SortBy": section.SortBy = EmptyToNull(val); break;
                        case "SortOrder": section.SortOrder = EmptyToNull(val); break;
                        case "PremiumFeature": section.PremiumFeature = EmptyToNull(val); break;
                        case "PremiumMessage": section.PremiumMessage = EmptyToNull(val); break;
                        case "CardSizeOffset":
                            if (!string.IsNullOrEmpty(val) && int.TryParse(val, NumberStyles.Integer, CultureInfo.InvariantCulture, out var csOff))
                                section.CardSizeOffset = csOff;
                            break;
                        case "ScrollDirection":
                            section.ScrollDirection = ParseNullableEnum<ScrollDirection>(val);
                            break;
                        case "RefreshInterval":
                            section.RefreshInterval = ParseNullableInt(val);
                            break;
                        case "IncludeNextUpInResume":
                            if (!string.IsNullOrEmpty(val) && bool.TryParse(val, out var incl))
                                section.IncludeNextUpInResume = incl;
                            break;
                    }
                }
                catch { /* skip malformed value */ }
            }

            // Phase 2: string[] properties (comma-split or JSON array).
            foreach (var kvp in settings)
            {
                var key = kvp.Key;
                var val = kvp.Value;
                if (string.IsNullOrEmpty(val)) continue;
                string[]? parsed = null;
                try
                {
                    parsed = key switch
                    {
                        "Monitor" => ParseStringArray(jsonSerializer, val),
                        "ItemTypes" => ParseStringArray(jsonSerializer, val),
                        "ExcludedFolders" => ParseStringArray(jsonSerializer, val),
                        _ => null
                    };
                }
                catch { parsed = null; }
                if (parsed == null) continue;
                if (key == "Monitor") section.Monitor = parsed;
                else if (key == "ItemTypes") section.ItemTypes = parsed;
                else if (key == "ExcludedFolders") section.ExcludedFolders = parsed;
            }

            // Phase 3: build Query. ExtendedItemsQuery keeps the Emby JSON serializer
            // emitting IsPlayed even on the static ItemsQuery base type.
            try
            {
                var extQuery = new ExtendedItemsQuery();

                // _queryTagId → TagIds[]
                if (settings.TryGetValue("_queryTagId", out var qTagId) && !string.IsNullOrEmpty(qTagId))
                    extQuery.TagIds = new[] { qTagId };

                // _queryExcludeViewIds is a no-op against the static ItemsQuery (no such
                // property exists on ItemsQuery). The Emby-honored fallback is
                // section.ExcludedFolders, handled below.
                if (!settings.ContainsKey("ExcludedFolders") &&
                    settings.TryGetValue("_queryExcludeViewIds", out var qExcludeFolders) &&
                    !string.IsNullOrWhiteSpace(qExcludeFolders))
                {
                    var folderIds = qExcludeFolders.Split(',')
                        .Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                    if (folderIds.Length > 0)
                        section.ExcludedFolders = folderIds;
                }

                // _queryIsPlayed → IsPlayed (ExtendedItemsQuery tracks IsUnplayed for JSON emit)
                if (settings.TryGetValue("_queryIsPlayed", out var qIsPlayed))
                {
                    if (qIsPlayed == "true")
                    {
                        extQuery.IsPlayed = true;
                        extQuery.IsUnplayed = null;
                    }
                    else if (qIsPlayed == "false")
                    {
                        extQuery.IsPlayed = false;
                        extQuery.IsUnplayed = null;
                    }
                    else
                    {
                        extQuery.IsPlayed = null;
                        extQuery.IsUnplayed = null;
                    }
                }
                else if (existing?.Query != null)
                {
                    extQuery.IsPlayed = existing.Query.IsPlayed;
                }

                // _queryIsResumable → IsResumable
                if (settings.TryGetValue("_queryIsResumable", out var qIsResumable))
                {
                    if (qIsResumable == "true") extQuery.IsResumable = true;
                    else if (qIsResumable == "false") extQuery.IsResumable = false;
                    else extQuery.IsResumable = null;
                }
                else if (existing?.Query != null)
                {
                    extQuery.IsResumable = existing.Query.IsResumable;
                }

                // _queryEnsureItemTypes → merge into section.ItemTypes (typed)
                if (settings.TryGetValue("_queryEnsureItemTypes", out var qEnsure) && !string.IsNullOrWhiteSpace(qEnsure))
                {
                    var ensure = qEnsure.Split(',')
                        .Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                    if (ensure.Length > 0)
                    {
                        var current = section.ItemTypes ?? Array.Empty<string>();
                        section.ItemTypes = current.Concat(ensure)
                            .Where(t => !string.IsNullOrWhiteSpace(t))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToArray();
                    }
                }

                // Generic _query* → ItemsQuery properties (typed switch).
                // Skips keys already handled above + the legacy no-op _queryIncludeItemTypes.
                foreach (var key in settings.Keys)
                {
                    if (!key.StartsWith("_query", StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(key, "_queryTagId", StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(key, "_queryIsPlayed", StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(key, "_queryIsResumable", StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(key, "_queryIncludeItemTypes", StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(key, "_queryEnsureItemTypes", StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(key, "_queryExcludeViewIds", StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.Equals(key, "_querySeriesPivot", StringComparison.OrdinalIgnoreCase)) continue;
                    var val = settings[key];
                    if (string.IsNullOrEmpty(val)) continue;
                    var propName = key.Substring("_query".Length);
                    if (propName.Length == 0) continue;
                    try
                    {
                        switch (propName)
                        {
                            case "StudioIds": extQuery.StudioIds = ParseStringArray(jsonSerializer, val); break;
                            case "TagIds": extQuery.TagIds = ParseStringArray(jsonSerializer, val); break;
                            case "GenreIds": extQuery.GenreIds = ParseStringArray(jsonSerializer, val); break;
                            case "CollectionTypes": extQuery.CollectionTypes = ParseStringArray(jsonSerializer, val); break;
                            case "IsFavorite": extQuery.IsFavorite = ParseNullableBool(val); break;
                            case "IsSports": extQuery.IsSports = ParseNullableBool(val); break;
                            case "IsNews": extQuery.IsNews = ParseNullableBool(val); break;
                            case "IsSeries": extQuery.IsSeries = ParseNullableBool(val); break;
                            case "IsMovie": extQuery.IsMovie = ParseNullableBool(val); break;
                            case "IsRepeat": extQuery.IsRepeat = ParseNullableBool(val); break;
                        }
                    }
                    catch { /* skip malformed value */ }
                }

                section.Query = extQuery;
            }
            catch { /* leave section.Query as the default */ }

            // Migration: gamla inställningar sparade ScrollDirection i DisplayMode — rensa bort det
            if (section.DisplayMode == "Horizontal" || section.DisplayMode == "Vertical")
                section.DisplayMode = null;

            if (!string.IsNullOrEmpty(libraryId))
                section.ParentId = libraryId;

            return section;
        }

        private static string? EmptyToNull(string? val) => string.IsNullOrEmpty(val) ? null : val;

        private static string[]? ParseStringArray(IJsonSerializer jsonSerializer, string val)
        {
            if (string.IsNullOrEmpty(val)) return null;
            if (val.TrimStart().StartsWith("["))
                return jsonSerializer.DeserializeFromString<string[]>(val);
            return val.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
        }

        private static int? ParseNullableInt(string? val)
        {
            if (string.IsNullOrEmpty(val)) return null;
            return int.TryParse(val, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? v : null;
        }

        private static bool? ParseNullableBool(string? val)
        {
            if (string.IsNullOrEmpty(val)) return null;
            return bool.TryParse(val, out var v) ? v : null;
        }

        private static T? ParseNullableEnum<T>(string? val) where T : struct, Enum
        {
            if (string.IsNullOrEmpty(val)) return null;
            return Enum.TryParse<T>(val, ignoreCase: true, out var v) ? v : null;
        }

        // Thin wrapper around ManageHomeSections that owns the banner, dry-run skip, and
        // post-phase summary line. Extracted from Execute per IMPLEMENTATION-PLAN.md §Commit 5.
        private void HomeSectionsPhase(RunContext ctx, CancellationToken cancellationToken)
        {
            _log.Blank();
            _log.Info("» Home sections");
            var phaseTimer = System.Diagnostics.Stopwatch.StartNew();
            if (!ctx.DryRun) ManageHomeSections(ctx.Config, cancellationToken, ctx.Debug, ctx.StatsList);
            else _log.Skip("Dry run — home sections are not changed");
            if (!ctx.DryRun)
                _log.Info($"    {ctx.StatsList.Count(g => g.HomeSectionSynced)} synced, {ctx.StatsList.Count(g => g.HomeSectionRemoved)} removed  ·  {RunLog.Elapsed(phaseTimer.Elapsed)}");
        }

        // Single-entry equivalent of HomeSectionsPhase — owns the banner, dry-run skip,
        // and (when active) delegates to ManageHomeSections with a filterTagName so only
        // this group's tag is processed. Mirrors the inline single-entry behaviour.
        private void HomeSectionsPhaseSingle(RunContext ctx, TagConfig tagConfig, GroupRunStats gs, CancellationToken cancellationToken)
        {
            if (tagConfig.EnableHomeSection)
            {
                _log.Blank();
                _log.Info("» Home sections");
                if (ctx.DryRun) _log.Skip("Dry run — home sections are not changed");
            }
            if (!ctx.DryRun && tagConfig.EnableHomeSection)
                ManageHomeSections(ctx.Config, cancellationToken, ctx.Debug, new List<GroupRunStats> { gs }, gs.TagName);
        }

        // For every user that the plugin manages home sections for, add the supplied library ids
        // to the ExcludedFolders + Query.ExcludeUserViewIdStrings of every non-tracked,
        // non-library-scoped section. Keeps BoxSet sections clean when a top-list library is added.
        internal static int UpdateUntrackedSections(
            IJsonSerializer jsonSerializer,
            IUserManager userManager,
            PluginConfiguration config,
            IEnumerable<string> libraryIdsToExclude,
            CancellationToken cancellationToken)
        {
            var allTrackedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var tag in config.Tags ?? new List<TagConfig>())
                foreach (var tr in tag.HomeSectionTracked ?? new List<HomeSectionTracking>())
                    if (!string.IsNullOrEmpty(tr.SectionId)) allTrackedIds.Add(tr.SectionId);
            foreach (var topList in config.TopLists ?? new List<TopListHomeSection>())
                foreach (var tr in topList.HomeSectionTracked ?? new List<HomeSectionTracking>())
                    if (!string.IsNullOrEmpty(tr.SectionId)) allTrackedIds.Add(tr.SectionId);

            var managedUserIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var tag in config.Tags ?? new List<TagConfig>())
                foreach (var uid in tag.HomeSectionUserIds ?? new List<string>())
                    managedUserIds.Add(uid);
            foreach (var topList in config.TopLists ?? new List<TopListHomeSection>())
                foreach (var uid in topList.HomeSectionUserIds ?? new List<string>())
                    managedUserIds.Add(uid);

            var libIds = libraryIdsToExclude
                .Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0)
                .Distinct().ToList();
            if (libIds.Count == 0) return 0;

            int updated = 0;

            foreach (var userId in managedUserIds)
            {
                try
                {
                    var uid = userManager.GetInternalId(userId);
                    var allSecs = userManager.GetHomeSections(uid, cancellationToken)?.Sections
                        ?? Array.Empty<ContentSection>();

                    foreach (var sec in allSecs)
                    {
                        if (string.IsNullOrEmpty(sec.Id)) continue;
                        if (allTrackedIds.Contains(sec.Id)) continue;

                        // Library-scoped sections already filter to one library.
                        if (!string.IsNullOrEmpty(sec.ParentId)) continue;

                        // ExcludeUserViewIdStrings lives on UserViewQuery and NextUpQuery;
                        // ItemsQuery (the static ContentSection.Query type) does not have it.
                        var existingExcluded = (sec.ExcludedFolders ?? Array.Empty<string>())
                            .Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0).ToList();
                        try
                        {
                            var query = (object?)sec.Query;
                            if (query is MediaBrowser.Model.Library.UserViewQuery uvq)
                            {
                                var viewIds = uvq.ExcludeUserViewIdStrings;
                                if (viewIds != null)
                                    existingExcluded.AddRange(
                                        viewIds.Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0));
                            }
                            else if (query is MediaBrowser.Model.Querying.NextUpQuery nq)
                            {
                                var viewIds = nq.ExcludeUserViewIdStrings;
                                if (viewIds != null)
                                    existingExcluded.AddRange(
                                        viewIds.Select(s => s.Trim().ToLowerInvariant()).Where(s => s.Length > 0));
                            }
                        }
                        catch { }

                        existingExcluded = existingExcluded.Distinct().ToList();
                        var missing = libIds
                            .Where(id => !existingExcluded.Contains(id, StringComparer.OrdinalIgnoreCase))
                            .ToList();
                        if (missing.Count == 0) continue;

                        existingExcluded.AddRange(missing);
                        var newExcluded = existingExcluded.ToArray();

                        sec.ExcludedFolders = newExcluded;
                        try
                        {
                            var query = (object?)sec.Query;
                            if (query is MediaBrowser.Model.Library.UserViewQuery uvq2)
                                uvq2.ExcludeUserViewIdStrings = newExcluded;
                            else if (query is MediaBrowser.Model.Querying.NextUpQuery nq2)
                                nq2.ExcludeUserViewIdStrings = newExcluded;
                        }
                        catch { }
                        userManager.UpdateHomeSection(uid, sec, cancellationToken);
                        updated++;
                    }
                }
                catch { }
            }
            return updated;
        }

        internal static void ApplyViewerCriteriaToSectionSettings(TagConfig tagConfig, Dictionary<string, string> settingsDict)
        {
            CriterionCatalog.ApplySectionQuery(GetAllCriteria(tagConfig), settingsDict);
        }

        private void HsWarn(List<GroupRunStats>? statsList, string tagName, string displayName, string message)
        {
            _log.Warn($"{displayName}: {message}");
            var gs = statsList?.FirstOrDefault(s => s.TagName != null && string.Equals(s.TagName, tagName, StringComparison.OrdinalIgnoreCase));
            gs?.Warnings.Add("Home section: " + message);
        }
    }
}
