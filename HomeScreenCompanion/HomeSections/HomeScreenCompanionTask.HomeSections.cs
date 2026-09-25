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
using System.Reflection;
using System.Threading;
using MediaBrowser.Model.Users;

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
                                typeof(ContentSection).GetProperty("Id")?.SetValue(updateSection, ownedSection.Id);
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
            var props = typeof(ContentSection).GetProperties(BindingFlags.Public | BindingFlags.Instance);

            foreach (var prop in props)
            {
                if (!prop.CanWrite || prop.Name == "Id" || prop.Name == "ParentId") continue;
                if (!settings.TryGetValue(prop.Name, out var strVal)) continue;
                // Tomt värde → rensa egenskapen (nullable → null, string → null)
                if (string.IsNullOrEmpty(strVal))
                {
                    if (Nullable.GetUnderlyingType(prop.PropertyType) != null || prop.PropertyType == typeof(string))
                        prop.SetValue(section, null);
                    continue;
                }
                try
                {
                    var t = Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType;
                    object converted = null;
                    if (t == typeof(string)) converted = strVal;
                    else if (t == typeof(bool)) converted = bool.Parse(strVal);
                    else if (t == typeof(int)) converted = int.Parse(strVal, NumberStyles.Integer, CultureInfo.InvariantCulture);
                    else if (t == typeof(long)) converted = long.Parse(strVal, NumberStyles.Integer, CultureInfo.InvariantCulture);
                    else if (t == typeof(DateTime)) converted = DateTime.Parse(strVal, CultureInfo.InvariantCulture);
                    else if (t.IsEnum) { try { converted = Enum.Parse(t, strVal, true); } catch { } }
                    if (converted != null)
                        prop.SetValue(section, converted);
                }
                catch { /* skip malformed value */ }
            }

            foreach (var prop in props)
            {
                if (!prop.CanWrite || prop.Name == "Id") continue;
                if (prop.PropertyType != typeof(string[])) continue;
                if (!settings.TryGetValue(prop.Name, out var arrVal) || string.IsNullOrEmpty(arrVal)) continue;
                try
                {
                    var values = arrVal.TrimStart().StartsWith("[")
                        ? jsonSerializer.DeserializeFromString<string[]>(arrVal)
                        : arrVal.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                    prop.SetValue(section, values);
                }
                catch { }
            }

            var queryProp = props.FirstOrDefault(p => p.Name == "Query");
            if (queryProp != null)
            {
                try
                {
                    // Använd ExtendedItemsQuery för att exponera IsPlayed till Embys JSON-serialisering
                    var extQuery = new ExtendedItemsQuery();
                    var queryProps = typeof(ItemsQuery).GetProperties(BindingFlags.Public | BindingFlags.Instance);

                    // Specialfall: _queryTagId → TagIds[]
                    if (settings.TryGetValue("_queryTagId", out var qTagId) && !string.IsNullOrEmpty(qTagId))
                    {
                        var tagIdsProp = queryProps.FirstOrDefault(p => p.Name == "TagIds");
                        if (tagIdsProp != null && tagIdsProp.CanWrite && tagIdsProp.PropertyType == typeof(string[]))
                            tagIdsProp.SetValue(extQuery, new[] { qTagId });
                    }

                    // Specialfall: _queryExcludeViewIds → ExcludeUserViewIds[]
                    if (settings.TryGetValue("_queryExcludeViewIds", out var qExcludeViewIds) && !string.IsNullOrWhiteSpace(qExcludeViewIds))
                    {
                        var excludeProp = queryProps.FirstOrDefault(p => p.Name == "ExcludeUserViewIds");
                        if (excludeProp != null && excludeProp.CanWrite)
                        {
                            var ids = qExcludeViewIds.Split(',')
                                .Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                            if (ids.Length > 0)
                            {
                                try
                                {
                                    if (excludeProp.PropertyType == typeof(string[]))
                                        excludeProp.SetValue(extQuery, ids);
                                    else if (excludeProp.PropertyType == typeof(Guid[]))
                                        excludeProp.SetValue(extQuery, ids.Select(id => Guid.TryParse(id, out var g) ? g : Guid.Empty).ToArray());
                                }
                                catch { }
                            }
                        }
                    }

                    // Bakåtkompatibilitet: sätt ContentSection.ExcludedFolders från _queryExcludeViewIds
                    // om ExcludedFolders inte sparats explicit (gamla plugin-versioner).
                    if (!settings.ContainsKey("ExcludedFolders") &&
                        settings.TryGetValue("_queryExcludeViewIds", out var qExcludeFolders) &&
                        !string.IsNullOrWhiteSpace(qExcludeFolders))
                    {
                        var folderIds = qExcludeFolders.Split(',')
                            .Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                        var exFoldersProp = props.FirstOrDefault(p => p.Name == "ExcludedFolders" && p.CanWrite
                                                                  && p.PropertyType == typeof(string[]));
                        if (exFoldersProp != null && folderIds.Length > 0)
                            exFoldersProp.SetValue(section, folderIds);
                    }

                    // Specialfall: _queryIsPlayed → IsPlayed; tomt = Any = null
                    // Emby 4.10.0.10+: IsPlayed finns nativt i ItemsQuery.
                    //   true  → Played   (IsPlayed = true)
                    //   false → Unplayed (IsPlayed = false)
                    //   annat → ingen filtrering
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
                        // _queryIsPlayed saknas i inställningar — bevara befintligt värde istället för att tyst nollställa
                        extQuery.IsPlayed = existing.Query.IsPlayed;
                    }

                    // Specialfall: _queryIsResumable → IsResumable (In progress / started, not finished).
                    // Saknas nyckeln bevaras befintligt värde (t.ex. satt av ett viewer-beroende filter).
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

                    // Specialfall: _queryIncludeItemTypes fanns tidigare men Emby 4.10:s
                    // ItemsQuery har ingen IncludeItemTypes-property — MediaType-kriterier
                    // översätts nu istället till section.ItemTypes av CriterionCatalog.
                    // (Nyckeln lämnas här medvetet orörd för bakåtkompatibilitet.)

                    // Specialfall: _queryEnsureItemTypes → lägg till i section.ItemTypes
                    // (ren "In Progress" behöver Episode för att visa serier som påbörjade episoder)
                    if (settings.TryGetValue("_queryEnsureItemTypes", out var qEnsure) && !string.IsNullOrWhiteSpace(qEnsure))
                    {
                        var ensure = qEnsure.Split(',')
                            .Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                        if (ensure.Length > 0)
                        {
                            var itProp = props.FirstOrDefault(p => p.Name == "ItemTypes");
                            if (itProp != null && itProp.CanWrite && itProp.PropertyType == typeof(string[]))
                            {
                                var current = (itProp.GetValue(section) as string[]) ?? Array.Empty<string>();
                                var merged = current.Concat(ensure)
                                    .Where(t => !string.IsNullOrWhiteSpace(t))
                                    .Distinct(StringComparer.OrdinalIgnoreCase)
                                    .ToArray();
                                itProp.SetValue(section, merged);
                            }
                        }
                    }

                    // Generisk _query* → övriga ItemsQuery-properties
                    foreach (var key in settings.Keys.Where(k =>
                        k.StartsWith("_query", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(k, "_queryTagId", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(k, "_queryIsPlayed", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(k, "_queryIsResumable", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(k, "_queryIncludeItemTypes", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(k, "_queryEnsureItemTypes", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(k, "_queryExcludeViewIds", StringComparison.OrdinalIgnoreCase)))
                    {
                        var val = settings[key];
                        if (string.IsNullOrEmpty(val)) continue;
                        var propName = key.Substring(6);
                        if (propName.Length == 0) continue;
                        var qProp = queryProps.FirstOrDefault(p => string.Equals(p.Name, propName, StringComparison.OrdinalIgnoreCase));
                        if (qProp == null || !qProp.CanWrite) continue;
                        try
                        {
                            var t = Nullable.GetUnderlyingType(qProp.PropertyType) ?? qProp.PropertyType;
                            if (t == typeof(bool)) qProp.SetValue(extQuery, bool.Parse(val));
                            else if (t == typeof(int)) qProp.SetValue(extQuery, int.Parse(val, NumberStyles.Integer, CultureInfo.InvariantCulture));
                            else if (t == typeof(long)) qProp.SetValue(extQuery, long.Parse(val, NumberStyles.Integer, CultureInfo.InvariantCulture));
                            else if (t == typeof(string)) qProp.SetValue(extQuery, val);
                        }
                        catch { }
                    }

                    if (queryProp.CanWrite)
                        queryProp.SetValue(section, extQuery);
                }
                catch { }
            }

            // Migration: gamla inställningar sparade ScrollDirection i DisplayMode — rensa bort det
            {
                var displayModeProp = props.FirstOrDefault(p => p.Name == "DisplayMode" && p.CanRead);
                if (displayModeProp != null)
                {
                    var dm = displayModeProp.GetValue(section) as string;
                    if (dm == "Horizontal" || dm == "Vertical")
                        displayModeProp.SetValue(section, null);
                }
            }

            if (!string.IsNullOrEmpty(libraryId))
            {
                var parentProp = props.FirstOrDefault(p => p.Name == "ParentId" && p.CanWrite && p.PropertyType == typeof(string));
                if (parentProp != null) parentProp.SetValue(section, libraryId);
            }

            return section;
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

    }
}
