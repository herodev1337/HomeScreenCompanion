// Phase 5: top-list creation step chain, extracted verbatim from
// `Configuration/configPage.js` (legacy.js:4399-4689):
//
//   - `executeTopListCreationSteps(...)` — the multi-step fetch chain
//     that runs after `HomeScreenCompanion/TopList/PrepareFolder` (or
//     `PrepareManualFolder`) has written the .strm files. It snapshots
//     user policies server-side, creates the virtual library, saves the
//     home-section config, syncs the home sections, scans the new
//     library, then grants per-user library access via the user-policy
//     API.
//
// The legacy function closed over five module-scope surfaces:
//
//   - `window.ApiClient`  (getUrl / accessToken / getPluginConfiguration
//                          / updatePluginConfiguration)
//   - the global `fetch`
//   - `pluginId`
//   - `_topListTagNames`  (mutable Set — added to on success)
//   - `refreshTopListBadges()` (re-paints the tag-row top-list badges)
//
// All of those are lifted into the explicit `TopListCreationDeps` object,
// so the extracted function is a pure function of its args + deps and
// reads no module-scope state. The legacy.js caller (and the future
// Phase-5 wiring) supplies the deps bound to its own state.
// `console.log` is the only global still touched directly (a diagnostic
// with no side effects).
//
// Legacy quirks preserved on purpose (see the tests):
//   - mixed `X-Emby-Token` / `X-MediaBrowser-Token` header names
//     (creation steps use `X-Emby-Token`, reads use `X-MediaBrowser-Token`);
//   - the `displayName` parameter is accepted but never read;
//   - the step-0 policy-snapshot failure is swallowed silently;
//   - the `preCreationIds` diff set is deliberately discarded when the
//     library already exists;
//   - non-silent failures re-enable the save button and write the error
//     text but do NOT reject the returned promise — only `ui.silent`
//     failures re-throw.

/**
 * Minimal shape of the response returned by a call to
 * `fetch(...)` — the legacy code only ever reads `.json()`.
 */
export interface FetchResponseLike {
    json(): Promise<unknown>;
}

/**
 * Injectable `fetch` replacement. The legacy code calls the global
 * `fetch(url, init)`; this lifts it into `deps` so tests (and future
 * wiring) can route calls without touching globals.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponseLike>;

/**
 * Result of the `TopList/PrepareFolder` step, passed in by the caller.
 * Only `FolderPath` and `FilesCreated` are read by this module; `Success`
 * and `Message` are checked by the caller (and by the backup-restore
 * path, which passes a bare `{ FolderPath, FilesCreated: 0 }` object).
 */
export interface PrepareResultLike {
    Success?: boolean;
    Message?: string;
    FolderPath: string;
    FilesCreated: number;
}

/**
 * One `TopLists` entry inside the plugin configuration.
 */
export interface TopListConfigEntryLike {
    TagName?: string;
    MaxItems?: number;
    HomeSectionUserIds?: readonly string[];
    HomeSectionLibraryId?: string;
    HomeSectionSettings?: string;
    HomeSectionTracked?: string[];
}

/**
 * Minimal plugin-config shape consumed here (only the `TopLists`
 * section). The full shape lives in `types/dtos.ts`; this avoids a
 * cross-cycle import.
 */
export interface PluginConfigLike {
    TopLists?: TopListConfigEntryLike[];
}

/**
 * The save button surface the legacy code writes to. It can be a real
 * `<button>` element or the `{ disabled, innerHTML }` "fake button"
 * object the legacy inline-edit / backup-restore callers pass in.
 */
export interface TopListCreationSaveBtnLike {
    innerHTML: string;
    disabled: boolean;
}

/**
 * UI surface handed to `executeTopListCreationSteps` by the caller
 * (`showTopListModal`, the manual-list modals, or the backup restore).
 *
 * `modal` is used for `querySelector('div')` fallback + `remove()`;
 * `innerBox` short-circuits the fallback (silent callers pass the
 * wrapper element directly).
 */
export interface TopListCreationUi {
    saveBtn: TopListCreationSaveBtnLike;
    errEl: Element;
    modal: Element;
    badgeStyle?: string;
    silent?: boolean;
    closeHandler?: () => void;
    innerBox?: HTMLElement;
}

/**
 * Dependencies for {@link executeTopListCreationSteps}. Until the rest
 * of the legacy surface is migrated, the legacy.js caller wraps this
 * with its closure-bound state:
 *
 * `getUrl` / `getAccessToken` / `getPluginConfiguration` /
 * `updatePluginConfiguration` — `window.ApiClient` members (the legacy
 * code re-reads the access token at steps 0, 5, 6, 7 and 8, so
 * `getAccessToken` is a function, not a value). `getPluginConfiguration`
 * / `updatePluginConfiguration` close over `pluginId` on the caller side.
 * `fetch` — the global fetch; only `.json()` is ever read.
 * `registerTopList` — legacy closures `_topListTagNames.add(name)` +
 * `refreshTopListBadges()`, called on success (including silent mode).
 */
export interface TopListCreationDeps {
    readonly getUrl: (path: string) => string;
    readonly getAccessToken: () => string;
    readonly getPluginConfiguration: () => Promise<PluginConfigLike>;
    readonly updatePluginConfiguration: (config: PluginConfigLike) => Promise<unknown>;
    readonly fetch: FetchLike;
    readonly registerTopList: (tagNameLower: string) => void;
}

/** One virtual-library folder from `GET Library/VirtualFolders`. */
interface VirtualFolderLike {
    ItemId?: string;
    Locations?: string[];
}

/** One user from `GET /Users`. */
interface UserLike {
    Id?: string;
    Policy?: PolicyLike | null;
}

interface PolicyLike {
    EnableAllFolders?: boolean;
    EnabledFolders?: string[];
}

/** Result of `GET /Users/{id}/Views`. */
interface ViewsResultLike {
    Items?: Array<{ Id?: string }>;
}

interface FoldersResult {
    folders: VirtualFolderLike[] | null | undefined;
    preCreationIds: Set<string>;
}

/**
 * Execute the post-`PrepareFolder` creation steps for one top-list.
 * Returns the promise chain (resolved when the UI is done — or rejected
 * in silent mode when a step fails) so callers like the backup-restore
 * flow can await it.
 *
 * @param tagName         The tag (or manual list) name backing the list.
 * @param displayName     Legacy signature carry-over — NOT read.
 * @param selectedUserIds Target user ids for the home section.
 * @param displayMode     `'' | 'tv' | 'mobile,desktop'`.
 * @param customName      Custom home-section title.
 * @param imageType       `'' | 'Primary' | 'Thumb'`.
 * @param maxItems        Max items (0 = all).
 * @param prepareResult   The `TopList/PrepareFolder` result.
 * @param ui              UI surface (save button, error element, modal).
 * @param onSuccess       Optional callback for the "Close" button.
 * @param deps            Injected external surface (see
 *                        {@link TopListCreationDeps}).
 */
export function executeTopListCreationSteps(
    tagName: string,
    displayName: string,
    selectedUserIds: readonly string[],
    displayMode: string,
    customName: string,
    imageType: string,
    maxItems: number,
    prepareResult: PrepareResultLike,
    ui: TopListCreationUi,
    onSuccess: (() => void) | undefined,
    deps: TopListCreationDeps
): Promise<void> {
    const saveBtn = ui.saveBtn;
    const errEl = ui.errEl;
    const modal = ui.modal;
    const badgeStyle = ui.badgeStyle || 'neutral';
    const tok = deps.getAccessToken();
    let snapshotId: string | null = null;
    let pendingLibraryId: string | null = null;

    saveBtn.innerHTML = 'Creating library <span class="tc-dot-loader"><span></span><span></span><span></span></span>';

    // Step 0: Snapshot all user policies server-side BEFORE library creation.
    // POST Library/VirtualFolders causes Emby to set EnableAllFolders=true for all users.
    // The server stores the exact per-user state and restores it in step 4b.
    // The chain is returned so silent callers (backup restore) can await it.
    return deps.fetch(deps.getUrl('HomeScreenCompanion/TopList/SnapshotPolicies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok },
        body: JSON.stringify({})
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            const snapshotResult = result as { SnapshotId?: string; UserCount?: unknown } | null | undefined;
            if (snapshotResult && snapshotResult.SnapshotId) {
                snapshotId = snapshotResult.SnapshotId;
                console.log('[HSC] Policy snapshot taken:', snapshotResult.UserCount, 'users, id:', snapshotId);
            }
        }).catch(function () {})
        .then(function () {

            // Steps 2+3: Check if the virtual library already exists before creating it.
            // POSTing to Library/VirtualFolders — even for an already-existing library — causes
            // Emby to update all users' policies and fire "User Policy Updated" notifications.
            // By skipping the POST when the library is already present we avoid spurious notifications.
            return deps.fetch(deps.getUrl('Library/VirtualFolders'), {
                headers: { 'X-MediaBrowser-Token': tok }
            })
                .then(function (r) { return r.json(); })
                .then(function (existingFoldersRaw) {
                    // Normalize path separators and strip trailing slashes before comparing,
                    // since the C# backend uses backslashes on Windows while Emby's API may
                    // return forward slashes (or vice versa).
                    function normLibPath(p: string | null | undefined) { return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }
                    const existingFolders = existingFoldersRaw as VirtualFolderLike[] | null | undefined;
                    const targetPath = normLibPath(prepareResult.FolderPath);
                    // Record all library IDs before creation so we can find the new one by diff
                    // if path matching fails (Emby may not register the library synchronously).
                    const preCreationIds = new Set<string>((existingFolders || []).map(function (f) { return f.ItemId; }).filter((id): id is string => Boolean(id)));
                    const alreadyExists = (existingFolders || []).some(function (f) {
                        return (f.Locations || []).some(function (loc) {
                            return normLibPath(loc) === targetPath;
                        });
                    });
                    if (alreadyExists) {
                        return { folders: existingFolders, preCreationIds: new Set<string>() };
                    }
                    // Library doesn't exist yet — create it, then re-fetch the updated list.
                    return deps.fetch(deps.getUrl('Library/VirtualFolders'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok },
                        body: JSON.stringify({
                            Name: customName,
                            CollectionType: 'movies',
                            RefreshLibrary: false,
                            Paths: [prepareResult.FolderPath],
                            LibraryOptions: {
                                EnableInternetProviders: true,
                                TypeOptions: [{
                                    Type: 'Movie',
                                    MetadataFetchers: ['Nfo', 'TheMovieDb', 'TheTVDB'],
                                    MetadataFetcherOrder: ['Nfo', 'TheMovieDb', 'TheTVDB'],
                                    ImageFetchers: ['TheMovieDb', 'TheTVDB'],
                                    ImageFetcherOrder: ['TheMovieDb', 'TheTVDB']
                                }]
                            }
                        })
                    }).catch(function () {})
                        .then(function () {
                            return deps.fetch(deps.getUrl('Library/VirtualFolders'), {
                                headers: { 'X-MediaBrowser-Token': tok }
                            }).then(function (r) { return r.json(); });
                        })
                        .then(function (newFoldersRaw) {
                            return { folders: newFoldersRaw as VirtualFolderLike[] | null | undefined, preCreationIds: preCreationIds };
                        });
                })
                .then(function (result: FoldersResult) {
                    saveBtn.innerHTML = 'Saving settings <span class="tc-dot-loader"><span></span><span></span><span></span></span>';

                    const folders = result.folders;
                    const preCreationIds = result.preCreationIds;

                    // Find the library by its folder path to get its ItemId
                    function normLibPath2(p: string | null | undefined) { return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }
                    const match = (folders || []).find(function (f) {
                        return (f.Locations || []).some(function (loc) {
                            return normLibPath2(loc) === normLibPath2(prepareResult.FolderPath);
                        });
                    });
                    let newLibId: string | null = match && match.ItemId ? match.ItemId : null;

                    // Fallback: if path matching failed (timing issue), find the new library by
                    // comparing current IDs against the pre-creation snapshot.
                    if (!newLibId && preCreationIds.size > 0) {
                        const diffMatch = (folders || []).find(function (f) {
                            return f.ItemId && !preCreationIds.has(f.ItemId);
                        });
                        if (diffMatch && diffMatch.ItemId) newLibId = diffMatch.ItemId;
                    }

                    const userId = selectedUserIds[0];
                    const viewsPromise = userId
                        ? deps.fetch(deps.getUrl('Users/' + userId + '/Views'), { headers: { 'X-MediaBrowser-Token': tok } })
                            .then(function (r) { return r.json(); })
                            .catch(function () { return { Items: [] }; })
                        : Promise.resolve({ Items: [] });

                    return viewsPromise.then(function (viewsResultRaw) {
                        const viewsResult = viewsResultRaw as ViewsResultLike;
                        const allViewIds = new Set<string>();
                        (folders || []).forEach(function (f) { if (f.ItemId) allViewIds.add(f.ItemId); });
                        ((viewsResult && viewsResult.Items) || []).forEach(function (v) { if (v.Id) allViewIds.add(v.Id); });
                        const excludedViewIds = Array.from(allViewIds)
                            .filter(function (id) { return !newLibId || id !== newLibId; })
                            .join(',');
                        return { prepareResult: prepareResult, libraryItemId: newLibId, excludedViewIds: excludedViewIds };
                    });
                })
                .then(function (ctx) {
                    // Step 4: Save top-list home section config
                    return deps.getPluginConfiguration().then(function (config) {
                        const topLists = config.TopLists || [];
                        const existing = topLists.find(function (t) {
                            return (t.TagName || '').toLowerCase() === tagName.toLowerCase();
                        });
                        const hseSettings = JSON.stringify({
                            SectionType: 'items',
                            DisplayMode: displayMode,
                            CustomName: customName,
                            MaxItems: String(maxItems),
                            ViewType: '',
                            ImageType: imageType,
                            BadgeStyle: badgeStyle,
                            SortBy: 'SortName',
                            SortOrder: 'Ascending',
                            ScrollDirection: '',
                            ItemTypes: JSON.stringify(['Movie']),
                            _queryIsPlayed: '',
                            _queryExcludeViewIds: ctx.excludedViewIds,
                            ExcludedFolders: ctx.excludedViewIds
                        });
                        if (existing) {
                            existing.HomeSectionUserIds = selectedUserIds;
                            existing.HomeSectionLibraryId = ctx.libraryItemId || 'auto';
                            existing.HomeSectionSettings = hseSettings;
                            existing.HomeSectionTracked = existing.HomeSectionTracked || [];
                            existing.MaxItems = maxItems;
                        } else {
                            topLists.push({
                                TagName: tagName,
                                MaxItems: maxItems,
                                HomeSectionUserIds: selectedUserIds,
                                HomeSectionLibraryId: ctx.libraryItemId || 'auto',
                                HomeSectionSettings: hseSettings,
                                HomeSectionTracked: []
                            });
                        }
                        config.TopLists = topLists;
                        return deps.updatePluginConfiguration(config)
                            .then(function () { return { prepareResult: ctx.prepareResult, libraryItemId: ctx.libraryItemId }; });
                    });
                })
                .then(function (ctx2) {
                    // Step 4b: Store the library ID for the final access-restore step.
                    // RestoreAndGrantAccess runs AFTER the library scan (last step) to ensure Emby
                    // has fully registered the new library before we write it to EnabledFolders.
                    if (ctx2.libraryItemId) pendingLibraryId = ctx2.libraryItemId;
                    return ctx2;
                })
                .then(function (ctx2) {
                    // Step 5: Create home sections immediately
                    saveBtn.innerHTML = 'Creating home sections <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
                    const tok5 = deps.getAccessToken();
                    return deps.fetch(deps.getUrl('HomeScreenCompanion/TopList/SyncHomeSections'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok5 },
                        body: JSON.stringify({ TagName: tagName })
                    })
                        .then(function (r) { return r.json(); })
                        .then(function (syncResultRaw) {
                            const syncResult = syncResultRaw as { Success?: boolean; Message?: string };
                            if (!syncResult.Success) throw new Error(syncResult.Message || 'Failed to create home sections.');
                            return ctx2;
                        });
                })
                .then(function (ctx2) {
                    // Step 6: Scan the newly created library only
                    if (ctx2.libraryItemId) {
                        saveBtn.innerHTML = 'Scanning library <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
                        const tok6 = deps.getAccessToken();
                        return deps.fetch(deps.getUrl('Items/' + ctx2.libraryItemId + '/Refresh') + '?Recursive=true&MetadataRefreshMode=Default&ImageRefreshMode=Default', {
                            method: 'POST',
                            headers: { 'X-MediaBrowser-Token': tok6 }
                        }).catch(function () {}).then(function () { return ctx2.prepareResult; });
                    }
                    return ctx2.prepareResult;
                })
                .then(function (prepareResult2) {
                    // NOTE: Linking each .strm as an alternate version of its original movie AND probing it
                    // for a real RunTimeTicks (so resume works instead of marking the film fully-watched) is
                    // handled automatically server-side by the ItemAdded/ItemUpdated hook in ServerEntryPoint,
                    // which fires as Emby indexes each .strm. No UI step is needed here — hence the
                    // "finishing touches will continue in the background" note on the success screen.
                    // Step 7: Sync all top-list home sections so exclusion lists are up to date
                    const tok7 = deps.getAccessToken();
                    return deps.fetch(deps.getUrl('HomeScreenCompanion/TopList/SyncAllSections'), {
                        method: 'POST',
                        headers: { 'X-MediaBrowser-Token': tok7 }
                    }).catch(function () {}).then(function () { return prepareResult2; });
                })
                .then(function (prepareResult2) {
                    // Step 8: Grant library access to all restricted users via Emby's standard
                    // user-policy API (GET /Users + POST /Users/{Id}/Policy).
                    // This avoids server-side reflection entirely and works with any Emby version.
                    // Users with EnableAllFolders=true already have access — skip them.
                    // Users with EnableAllFolders=false get the new library added to EnabledFolders
                    // without touching any of their other existing settings.
                    if (!pendingLibraryId) return prepareResult2;
                    const tok8 = deps.getAccessToken();
                    const libIdLower = pendingLibraryId.toLowerCase();
                    return deps.fetch(deps.getUrl('Users'), {
                        headers: { 'X-MediaBrowser-Token': tok8 }
                    })
                        .then(function (r) { return r.json(); })
                        .then(function (usersRaw) {
                            // GET /Users may return Policy=null for users other than the caller in
                            // some Emby versions. Fetch each user individually to guarantee full Policy data.
                            const users = usersRaw as UserLike[];
                            return Promise.all((users || []).map(function (u): Promise<UserLike> {
                                if (u && u.Policy) return Promise.resolve(u);
                                return deps.fetch(deps.getUrl('Users/' + u.Id), {
                                    headers: { 'X-MediaBrowser-Token': tok8 }
                                }).then(function (r) { return r.json() as Promise<UserLike>; }).catch(function () { return u; });
                            }));
                        })
                        .then(function (users) {
                            const updates = (users || [])
                                .filter(function (u): u is UserLike & { Policy: PolicyLike } {
                                    return !!u && !!u.Policy && !u.Policy.EnableAllFolders &&
                                        selectedUserIds.some(function (id) { return id.toLowerCase() === (u.Id || '').toLowerCase(); }) &&
                                        !(u.Policy.EnabledFolders || []).some(function (f) {
                                            return (f || '').toLowerCase() === libIdLower;
                                        });
                                })
                                .map(function (u) {
                                    const pol = JSON.parse(JSON.stringify(u.Policy)) as PolicyLike;
                                    pol.EnabledFolders = (u.Policy.EnabledFolders || []).concat([pendingLibraryId!]);
                                    return deps.fetch(deps.getUrl('Users/' + u.Id + '/Policy'), {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'X-MediaBrowser-Token': tok8 },
                                        body: JSON.stringify(pol)
                                    }).catch(function () {});
                                });
                            return Promise.all(updates);
                        })
                        .catch(function () {})
                        .then(function () { return prepareResult2; });
                })
                .then(function (prepareResult2) {
                    deps.registerTopList(tagName.toLowerCase());
                    if (ui.silent && typeof ui.closeHandler === 'function') { ui.closeHandler(); return; }
                    // Legacy picks the first descendant div of `modal` when `innerBox`
                    // is not supplied — every non-silent caller builds a modal with an
                    // inner box, so the fallback never yields null in practice.
                    const innerBox = (ui.innerBox || modal.querySelector('div')) as HTMLElement;
                    innerBox.innerHTML =
                        '<div style="text-align:center;padding:10px 0 20px;">' +
                        '<i class="md-icon" style="font-size:2.5em;color:#52B54B;display:block;margin-bottom:12px;">check_circle</i>' +
                        '<p style="margin:0 0 6px;font-size:1.05em;font-weight:500;">Top-list created!</p>' +
                        '<p style="margin:0;opacity:0.65;font-size:0.9em;">' + prepareResult2.FilesCreated + ' movie' + (prepareResult2.FilesCreated !== 1 ? 's' : '') + ' included.</p>' +
                        '<p style="margin:8px 0 0;opacity:0.5;font-size:0.82em;font-style:italic;">Finishing touches will continue in the background.</p>' +
                        '</div>' +
                        '<div style="display:flex;justify-content:center;padding-top:16px;border-top:1px solid var(--line-color);margin-top:20px;">' +
                        '<button type="button" class="btnTlmDone" style="cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:3px;padding:8px 22px;font-size:0.9em;font-weight:500;">Close</button>' +
                        '</div>';
                    innerBox.querySelector<HTMLButtonElement>('.btnTlmDone')!.addEventListener('click', function () {
                        if (typeof ui.closeHandler === 'function') { ui.closeHandler(); }
                        else { modal.remove(); if (typeof onSuccess === 'function') onSuccess(); }
                    });
                })
                .catch(function (err: unknown) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">check</i>Save and apply';
                    errEl.textContent = (err as { message?: string }).message || String(err);
                    if (ui.silent) throw err;
                });
        }); // end step 0 wrapper
}
