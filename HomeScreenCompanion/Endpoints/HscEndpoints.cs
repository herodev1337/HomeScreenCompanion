using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;

namespace HomeScreenCompanion
{
    public partial class HomeScreenCompanionService
    {
        public object Get(DebugSectionsRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.UserId))
                    return "{\"error\":\"UserId is required\"}";
                var internalId = _userManager.GetInternalId(request.UserId);
                var result = _userManager.GetHomeSections(internalId, CancellationToken.None);
                return _jsonSerializer.SerializeToString(result);
            }
            catch (Exception ex)
            {
                return $"{{\"error\":\"{ex.Message}\"}}";
            }
        }

        public object Get(HscGetStatusRequest request)
        {
            List<string> logs;
            lock (HomeSectionSyncTask.ExecutionLog) { logs = HomeSectionSyncTask.ExecutionLog.ToList(); }
            return new HscSyncStatusResponse
            {
                LastSyncTime = HomeSectionSyncTask.LastSyncTime,
                IsRunning = HomeSectionSyncTask.IsRunning,
                LastSyncResult = HomeSectionSyncTask.LastSyncResult,
                SectionsCopied = HomeSectionSyncTask.LastSectionsCopied,
                Logs = logs,
                StartedUtc = HomeSectionSyncTask.LastStartedUtc?.ToString("o") ?? ""
            };
        }

        public object Get(HscGetUserSectionsRequest request)
        {
            try
            {
                var auth = _authorizationContext.GetAuthorizationInfo(Request);
                var callerId = auth?.User?.Id.ToString();
                var isAdmin = auth?.User?.Policy?.IsAdministrator == true;
                var userId = ResolveUserId(callerId, isAdmin, request.UserId);
                if (string.IsNullOrWhiteSpace(userId))
                    return new HscUserSectionsResponse();

                var internalId = _userManager.GetInternalId(userId);
                var result = _userManager.GetHomeSections(internalId, CancellationToken.None);
                return new HscUserSectionsResponse
                {
                    Sections = result?.Sections ?? Array.Empty<ContentSection>()
                };
            }
            catch (Exception ex)
            {
                return new HscSaveUserSectionsResponse { Success = false, Message = ex.Message };
            }
        }



        public object Get(HscDebugMethodsRequest request)
        {
            var lines = new System.Text.StringBuilder();
            lines.AppendLine($"Runtime type: {_userManager.GetType().FullName}");
            lines.AppendLine();

            var seen = new HashSet<Type>();
            var queue = new Queue<Type>();
            queue.Enqueue(_userManager.GetType());
            while (queue.Count > 0)
            {
                var t = queue.Dequeue();
                if (!seen.Add(t)) continue;
                var relevant = t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                    .Where(m => m.Name.IndexOf("Section", StringComparison.OrdinalIgnoreCase) >= 0
                             || m.Name.IndexOf("Move", StringComparison.OrdinalIgnoreCase) >= 0
                             || m.Name.IndexOf("Home", StringComparison.OrdinalIgnoreCase) >= 0);
                foreach (var m in relevant)
                {
                    var ps = string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name));
                    lines.AppendLine($"  [{t.Name}] {m.ReturnType.Name} {m.Name}({ps})");
                }
                if (t.BaseType != null) queue.Enqueue(t.BaseType);
                foreach (var iface in t.GetInterfaces()) queue.Enqueue(iface);
            }
            return lines.ToString();
        }

        public object Post(HscSaveUserSectionsRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.UserId))
                    return new HscSaveUserSectionsResponse { Success = false, Message = "No user specified." };

                var internalId = _userManager.GetInternalId(request.UserId);
                var requestedSections = request.Sections ?? Array.Empty<ContentSection>();
                var requestedIds = new HashSet<string>(
                    requestedSections.Where(s => !string.IsNullOrEmpty(s.Id)).Select(s => s.Id),
                    StringComparer.OrdinalIgnoreCase);

                // 1. Radera bara sektioner som faktiskt togs bort från listan
                var existing = _userManager.GetHomeSections(internalId, CancellationToken.None);
                var toDelete = (existing?.Sections ?? Array.Empty<ContentSection>())
                    .Where(s => !string.IsNullOrEmpty(s.Id) && !requestedIds.Contains(s.Id))
                    .Select(s => s.Id)
                    .ToArray();
                if (toDelete.Length > 0)
                    _userManager.DeleteHomeSections(internalId, toDelete, CancellationToken.None);

                // 2. Ordna om kvarvarande sektioner via MoveHomeSections — IDs förändras inte,
                //    så HomeSectionTracked behöver inte uppdateras för omordning.
                var orderedIds = requestedSections
                    .Where(s => !string.IsNullOrEmpty(s.Id))
                    .Select(s => s.Id)
                    .ToArray();

                string moveDebug = "MoveHomeSections: ok";
                try
                {
                    dynamic mgr = _userManager;
                    for (int i = 0; i < orderedIds.Length; i++)
                        mgr.MoveHomeSections(internalId, new[] { orderedIds[i] }, i, CancellationToken.None);
                }
                catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException)
                {
                    // Fallback: prova utan CancellationToken
                    try
                    {
                        dynamic mgr = _userManager;
                        for (int i = 0; i < orderedIds.Length; i++)
                            mgr.MoveHomeSections(internalId, new[] { orderedIds[i] }, i);
                    }
                    catch (Exception ex) { moveDebug = $"MoveHomeSections fallback error: {ex.Message}"; }
                }
                catch (Exception ex) { moveDebug = $"MoveHomeSections error: {ex.Message}"; }

                // 3. Ta bort tracking för raderade sektioner så att task re-skapar dem vid behov
                if (toDelete.Length > 0)
                {
                    var deletedSet = new HashSet<string>(toDelete, StringComparer.OrdinalIgnoreCase);
                    var pluginConfig = Plugin.Instance?.Configuration;
                    if (pluginConfig != null)
                    {
                        bool changed = false;
                        foreach (var tag in pluginConfig.Tags)
                        {
                            var toRemove = tag.HomeSectionTracked
                                .Where(t => !string.IsNullOrEmpty(t.SectionId) && deletedSet.Contains(t.SectionId))
                                .ToList();
                            foreach (var t in toRemove) { tag.HomeSectionTracked.Remove(t); changed = true; }
                        }
                        if (changed)
                            Plugin.Instance?.SaveConfiguration();
                    }
                }

                return new HscSaveUserSectionsResponse { Success = true, Message = moveDebug };
            }
            catch (Exception ex)
            {
                return new HscSaveUserSectionsResponse { Success = false, Message = ex.Message };
            }
        }

        public object Post(HscApplyTagHomeSectionsRequest request)
        {
            try
            {
                var config = Plugin.Instance?.Configuration;
                if (config == null)
                    return new HscApplyTagHomeSectionsResponse { Success = false, Message = "Plugin configuration not available." };

                var tc = config.Tags?.FirstOrDefault(t =>
                    string.Equals(t.Name, request.TagName, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(t.Tag, request.TagName, StringComparison.OrdinalIgnoreCase));

                if (tc == null)
                    return new HscApplyTagHomeSectionsResponse { Success = false, Message = $"Tag '{request.TagName}' not found." };

                if (!tc.EnableHomeSection)
                    return new HscApplyTagHomeSectionsResponse { Success = true, Message = "Home section not enabled for this tag." };

                var realTracked = (tc.HomeSectionTracked ?? new System.Collections.Generic.List<HomeSectionTracking>())
                    .Where(t => !string.IsNullOrEmpty(t.SectionId) && !t.SectionId.StartsWith("hsc__"))
                    .ToList();
                if (realTracked.Count == 0)
                    return new HscApplyTagHomeSectionsResponse { Success = true, Message = "No existing tracked sections — nothing to apply." };

                // Deserialize settings
                var settingsDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    if (!string.IsNullOrEmpty(tc.HomeSectionSettings) && tc.HomeSectionSettings != "{}")
                        settingsDict = _jsonSerializer.DeserializeFromString<Dictionary<string, string>>(tc.HomeSectionSettings) ?? settingsDict;
                }
                catch { }

                if (!settingsDict.ContainsKey("SectionType"))
                    settingsDict["SectionType"] = (tc.EnableCollection && !string.IsNullOrEmpty(tc.CollectionName)) ? "boxset" : "items";

                // Viewer-dependent criteria (IsPlayed:__current__ / InProgress) are applied as native
                // per-viewer query filters (IsPlayed / IsResumable) on the section instead of the global tag scan.
                HomeScreenCompanionTask.ApplyViewerCriteriaToSectionSettings(tc, settingsDict);

                settingsDict.TryGetValue("SectionType", out var sectionType);

                // Resolve library ID
                string resolvedLibraryId = null;
                if (sectionType == "boxset")
                {
                    if (tc.HomeSectionLibraryId == "auto")
                    {
                        if (tc.EnableCollection && !string.IsNullOrEmpty(tc.CollectionName))
                        {
                            var coll = _libraryManager.GetItemList(new MediaBrowser.Controller.Entities.InternalItemsQuery
                            {
                                IncludeItemTypes = new[] { "BoxSet" },
                                Name = tc.CollectionName,
                                Recursive = true
                            }).FirstOrDefault();
                            if (coll != null) resolvedLibraryId = coll.InternalId.ToString();
                        }
                    }
                    else if (!string.IsNullOrEmpty(tc.HomeSectionLibraryId))
                    {
                        resolvedLibraryId = tc.HomeSectionLibraryId;
                    }
                    if (string.IsNullOrEmpty(resolvedLibraryId))
                        return new HscApplyTagHomeSectionsResponse { Success = false, Message = "Collection not found — cannot apply." };
                }

                // Look up tag ID for query (items type)
                if (sectionType == "items" && !string.IsNullOrEmpty(tc.Tag))
                {
                    var tagItem = _libraryManager.GetItemList(new MediaBrowser.Controller.Entities.InternalItemsQuery
                    {
                        IncludeItemTypes = new[] { "Tag" },
                        Name = tc.Tag,
                        Recursive = true
                    }).FirstOrDefault();
                    if (tagItem != null) settingsDict["_queryTagId"] = tagItem.InternalId.ToString();
                }

                // Build section marker (same pattern as the task)
                var safeTag = new string((tc.Name ?? tc.Tag ?? "").Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray());
                var sectionMarker = "hsc__" + safeTag;

                int updated = 0;
                foreach (var userId in (tc.HomeSectionUserIds ?? new System.Collections.Generic.List<string>()))
                {
                    var tracking = realTracked.FirstOrDefault(t => t.UserId == userId);
                    if (tracking == null) continue; // no real tracked section for this user

                    try
                    {
                        var userInternalId = _userManager.GetInternalId(userId);
                        var currentSections = _userManager.GetHomeSections(userInternalId, CancellationToken.None);
                        var allSections = currentSections?.Sections ?? Array.Empty<ContentSection>();

                        ContentSection ownedSection = allSections.FirstOrDefault(s => s.Id == tracking.SectionId);
                        if (ownedSection == null && settingsDict.TryGetValue("CustomName", out var _applyFallbackName) && !string.IsNullOrEmpty(_applyFallbackName))
                            ownedSection = allSections.FirstOrDefault(s => string.Equals(s.CustomName, _applyFallbackName, StringComparison.OrdinalIgnoreCase));

                        if (ownedSection == null) continue;

                        var updatedSection = HomeScreenCompanionTask.BuildContentSection(_jsonSerializer, settingsDict, resolvedLibraryId, ownedSection);
                        typeof(ContentSection).GetProperty("Id")?.SetValue(updatedSection, ownedSection.Id);
                        _userManager.UpdateHomeSection(userInternalId, updatedSection, CancellationToken.None);
                        updated++;
                    }
                    catch { /* skip this user on error */ }
                }

                return new HscApplyTagHomeSectionsResponse { Success = true, UsersUpdated = updated, Message = $"Applied to {updated} user(s)." };
            }
            catch (Exception ex)
            {
                return new HscApplyTagHomeSectionsResponse { Success = false, Message = ex.Message };
            }
        }

        private static ContentSection CopySectionWithoutId(ContentSection source)
        {
            var copy = new ContentSection();
            foreach (var prop in typeof(ContentSection).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (prop.Name == "Id") continue;
                if (prop.CanRead && prop.CanWrite)
                    prop.SetValue(copy, prop.GetValue(source));
            }
            return copy;
        }

        public object Get(HscGetSectionSchemaRequest request)
        {
            var fields = typeof(ContentSection)
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.CanRead && p.CanWrite && p.Name != "Id")
                .Select(p => new HscSectionField { Name = p.Name, Type = GetSimpleTypeName(p.PropertyType) })
                .Where(f => f.Type != null)
                .ToList();
            return new HscSectionSchemaResponse { Fields = fields };
        }

        private static string GetSimpleTypeName(Type t)
        {
            if (t == typeof(string)) return "string";
            if (t == typeof(bool) || t == typeof(bool?)) return "bool";
            if (t == typeof(int) || t == typeof(int?)) return "int";
            if (t == typeof(long) || t == typeof(long?)) return "long";
            if (t == typeof(DateTime) || t == typeof(DateTime?)) return "datetime";
            return null;
        }
    }
}
