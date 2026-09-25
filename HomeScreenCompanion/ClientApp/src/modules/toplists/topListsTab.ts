// Phase 5: top-lists tab loader, extracted verbatim from
// `Configuration/configPage.js` (legacy.js:5961-6251):
//
//   - `loadTopListsTab(view, deps)` — fetches the managed tags/collections,
//     the plugin config, and the server-side top-list list; renders the
//     Top Lists tab (rows + search/filter/sort chrome); wires the row
//     expand/delete/refresh click handling; and reloads itself after
//     mutations.
//
// The legacy function closed over the following module-scope surfaces,
// all lifted into the explicit `TopListsTabDeps` object so the extracted
// function is a pure function of its args + deps:
//
//   - `window.ApiClient`  (getUrl / accessToken / getPluginConfiguration)
//   - the global `fetch`
//   - `pluginId`
//   - `showCreateTopListChooser` (legacy.js:5572 — NOT yet extracted)
//   - `loadInlineEditForm`      (legacy.js:5187 — NOT yet extracted)
//   - `_topListTagNames`  (mutable Set — `.delete()`d on delete success)
//   - `refreshTopListBadges()` (re-paint after delete)
//   - the Dashboard globals `confirm` / `alert`
//   - the self-recursive `loadTopListsTab(view)` calls after create /
//     delete / refresh (lifted as `deps.reload`)
//
// `escapeHtml` / `escapeAttr` are imported from `../dom/dom` (the
// extracted leaf); the legacy local `escAttr` duplicate has been removed
// (C1 — unify HTML escaping).
//
// Legacy quirks preserved on purpose:
//   - `window.ApiClient.accessToken()` is called WITHOUT the usual
//     existence guard at the top of the function and in the delete flow;
//   - a block of dead locals (`topListCustomNameMap`, `managedTagMap`,
//     `managedCollMap`, `seenGroupByTag`, `btnStyle`, `collectionsData`)
//     is computed but never read — kept verbatim so the port stays a 1:1
//     transliteration of legacy.js:5985-6021;
//   - `settings.MaxItems` is a JSON string, so a `'0'` renders as `0`,
//     not `0 (all)` — only the number 0 hits the `(all)` branch;
//   - the success/failure of the initial `Promise.all` decides between
//     the full tab markup and a bare `Failed to load: ...` div.

import { escapeAttr, escapeHtml } from '../dom/dom';
import type { FetchLike, PluginConfigLike } from './creation';

/** Minimal shape of `GET HomeScreenCompanion/Manage/Tags`. */
export interface ManageTagsResultLike {
    Tags?: Array<{ Name?: string }>;
}

/** Minimal shape of `GET HomeScreenCompanion/TopList/List`. */
export interface TopListListResultLike {
    FolderNames?: string[];
    MovieCounts?: Record<string, number>;
}

/** One `Tags` entry of the plugin config (used by the dead locals + nothing else). */
export interface TagConfigEntryLike {
    Tag?: string;
    Name?: string;
    Active?: boolean;
    EnableCollection?: boolean;
    CollectionName?: string;
}

/** The plugin config as consumed by this tab: `TopLists` + `Tags`. */
export interface PluginConfigWithTagsLike extends PluginConfigLike {
    Tags?: TagConfigEntryLike[];
}

/** The parsed `HomeSectionSettings` JSON of one top-list. */
interface HomeSectionSettingsLike {
    CustomName?: string;
    DisplayMode?: string;
    ImageType?: string;
    BadgeStyle?: string;
    MaxItems?: string | number;
}

/** One rendered top-list row. */
interface TopListRowItem {
    tagName: string;
    displayName: string;
    isManual: boolean;
    count: number;
    userIds: readonly string[];
    customName: string;
    displayMode: string;
    imageType: string;
    badgeStyle: string;
    maxItems: string | number;
}

/** The `#tlContainer` element plus the legacy `_tlClickHandler` expando. */
type TlContainer = HTMLElement & { _tlClickHandler?: (e: MouseEvent) => void };

/**
 * Strip filesystem-unsafe characters from a folder/tag name. Lifted to
 * module scope so {@link sanitizeTlName} can be shared with the
 * `modals.ts` chooser (which needs the same canonical name to detect
 * already-existing top-list folders).
 */
export function sanitizeTlName(name: string | null | undefined): string {
    const safe = (name || 'unknown').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+|\.+$/g, '').trim();
    return safe.length === 0 ? 'unknown' : safe;
}

// Note: `GroupEntry` was previously declared here as a dead-code carryover
// from the legacy port; it is no longer referenced and has been removed.

/**
 * Dependencies for {@link loadTopListsTab}. Until the surrounding legacy
 * helpers are extracted, the legacy.js caller wraps this with its
 * closure-bound state:
 *
 * `getUrl` / `getAccessToken` / `getPluginConfiguration` — `window.ApiClient`
 * members (`getPluginConfiguration` closes over `pluginId`).
 * `fetch` — the global fetch; only `.json()` is read.
 * `showCreateTopListChooser` — legacy.js:5572, NOT yet extracted.
 * `loadInlineEditForm` — legacy.js:5187, NOT yet extracted.
 * `unregisterTopList` — legacy closures `_topListTagNames.delete(name)` +
 * `refreshTopListBadges()`, called after a successful delete.
 * `confirm` / `alert` — the Dashboard globals.
 * `reload` — legacy re-invokes `loadTopListsTab(view)` after create,
 * delete, refresh, and inline-edit; the wrapper resets
 * `container.dataset.loaded` and recurses.
 */
export interface TopListsTabDeps {
    readonly getUrl: (path: string) => string;
    readonly getAccessToken: () => string;
    readonly getPluginConfiguration: () => Promise<PluginConfigWithTagsLike>;
    readonly fetch: FetchLike;
    readonly showCreateTopListChooser: (
        tagsData: ManageTagsResultLike,
        existingTopLists: ReadonlySet<string>,
        onSuccess: () => void
    ) => void;
    readonly loadInlineEditForm: (row: Element, body: Element, onSuccess: () => void) => void;
    readonly unregisterTopList: (tagNameLower: string) => void;
    readonly confirm: (message: string) => boolean;
    readonly alert: (message: string) => void;
    readonly reload: () => void;
}

/**
 * Load and render the Top Lists tab into `view`'s `#tlContainer`.
 * No-op when the container is missing. Reads no module-scope state —
 * every external interaction goes through `deps`.
 */
export function loadTopListsTab(view: Element, deps: TopListsTabDeps): void {
    const container = view.querySelector<TlContainer>('#tlContainer');
    if (!container) return;

    container.innerHTML = '<div style="padding:20px;color:var(--theme-text-secondary);display:flex;align-items:center;gap:10px;">Loading <span class="tc-dot-loader"><span></span><span></span><span></span></span></div>';

    const token = deps.getAccessToken();

    Promise.all([
        deps.fetch(deps.getUrl('HomeScreenCompanion/Manage/Tags'), { headers: { 'X-MediaBrowser-Token': token } }).then(function (r) { return r.json(); }),
        deps.fetch(deps.getUrl('HomeScreenCompanion/Manage/Collections'), { headers: { 'X-MediaBrowser-Token': token } }).then(function (r) { return r.json(); }),
        deps.getPluginConfiguration().catch(function () { return { Tags: [] }; }),
        deps.fetch(deps.getUrl('HomeScreenCompanion/TopList/List'), { headers: { 'X-MediaBrowser-Token': token } }).then(function (r) { return r.json(); }).catch(function () { return { FolderNames: [] }; })
    ]).then(function (results) {
        const tagsData = results[0] as ManageTagsResultLike;
        const topListListResult = results[3] as TopListListResultLike;
        const pluginConfig = results[2] as PluginConfigWithTagsLike;
        const existingTopLists = new Set((topListListResult.FolderNames || []).map(function (n) { return n.toLowerCase(); }));

        const searchInputStyle = 'background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);border-radius:4px;padding:5px 10px;font-size:0.9em;color:var(--plugin-popup-color);width:400px;max-width:100%;';

        const realTagNamesLower = new Set((tagsData.Tags || []).map(function (t) { return (t.Name || '').toLowerCase(); }));

        const allExistingTopLists: TopListRowItem[] = (pluginConfig.TopLists || []).filter(function (tl) {
            return tl.TagName && existingTopLists.has(sanitizeTlName(tl.TagName).toLowerCase());
        }).map(function (tl) {
            const key = sanitizeTlName(tl.TagName || '').toLowerCase();
            let settings: HomeSectionSettingsLike = {};
            try { settings = JSON.parse(tl.HomeSectionSettings || '{}') as HomeSectionSettingsLike; } catch { /* malformed JSON */ }
            return {
                tagName: tl.TagName || '',
                displayName: settings.CustomName || tl.TagName || '',
                isManual: !realTagNamesLower.has((tl.TagName || '').toLowerCase()),
                count: (topListListResult.MovieCounts || {})[key] || 0,
                userIds: tl.HomeSectionUserIds || [],
                customName: settings.CustomName || '',
                displayMode: settings.DisplayMode || '',
                imageType: settings.ImageType || '',
                badgeStyle: settings.BadgeStyle || 'neutral',
                maxItems: settings.MaxItems || 0
            };
        });

        function renderTopListRows(items: TopListRowItem[]): string {
            if (items.length === 0) {
                return '<div id="tlRowsList"><p style="color:var(--theme-text-secondary);font-size:0.9em;font-style:italic;padding:20px 0;">No top-lists created yet. Click <strong>+ Create New</strong> to get started.</p></div>';
            }
            const rows = items.map(function (item) {
                const isManual = item.isManual;
                const typeBadge = isManual
                    ? '<span class="tag-indicator toplist" style="margin-left:0;margin-right:12px;flex-shrink:0;"><i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Manual</span>'
                    : '<span class="tag-indicator tag" style="margin-left:0;margin-right:12px;flex-shrink:0;"><i class="md-icon" style="font-size:1.1em;">label</i> ' + escapeHtml(item.tagName) + '</span>';
                const editJson = escapeAttr(JSON.stringify({
                    tagName: item.tagName,
                    displayName: item.displayName,
                    isManual: item.isManual,
                    userIds: item.userIds,
                    customName: item.customName,
                    displayMode: item.displayMode,
                    imageType: item.imageType,
                    badgeStyle: item.badgeStyle,
                    maxItems: String(item.maxItems || '0')
                }));
                return '<div class="tag-row" data-tlname="' + escapeAttr(item.tagName.toLowerCase()) + '" data-ismanual="' + (isManual ? '1' : '0') + '" data-count="' + item.count + '" data-editjson="' + editJson + '">' +
                    '<div class="tl-row-header tag-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px;cursor:pointer;">' +
                    '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' +
                    typeBadge +
                    '<span class="tag-title" style="font-weight:bold;font-size:1.1em;">' + escapeHtml(item.displayName) + '</span>' +
                    '<span class="tag-indicator source" style="margin-left:8px;">' + item.count + ' movies</span>' +
                    '</div>' +
                    '<i class="md-icon expand-icon" style="flex-shrink:0;margin-left:12px;">expand_more</i>' +
                    '</div>' +
                    '<div class="tag-body" style="display:none;padding:15px;border-top:1px solid rgba(255,255,255,0.1);">' +
                    '</div>' +
                    '</div>';
            }).join('');
            return '<div id="tlRowsList">' + rows + '</div>';
        }

        container.innerHTML =
            '<div style="max-width:900px;">' +
            '<div class="sectionTitleContainer flex align-items-center" style="margin-bottom:1em;margin-top:2em;">' +
            '<h2 class="sectionTitle" style="margin-bottom:0;">Top Lists</h2>' +
            '<button type="button" id="btnCreateNewTopList" is="emby-button" class="raised button-submit mb025" style="margin-left:auto;">' +
            '<span>+ Create New</span>' +
            '</button>' +
            '</div>' +
            '<div style="margin-bottom:16px;font-size:0.9em;color:var(--theme-text-secondary);line-height:1.5;">' +
            'Create a top-list home section from a tag managed by the plugin. Top-lists only work with movies.' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">' +
            '<input type="text" id="tlSearch" placeholder="Search…" style="' + searchInputStyle + '" />' +
            '<select is="emby-select" id="tlFilter" style="color:var(--plugin-popup-color);background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);padding:5px;border-radius:4px;font-size:0.9em;cursor:pointer;">' +
            '<option value="all">All</option>' +
            '<option value="manual">Manual</option>' +
            '<option value="bytag">By tag</option>' +
            '</select>' +
            '<select is="emby-select" id="tlSort" style="color:var(--plugin-popup-color);background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);padding:5px;border-radius:4px;font-size:0.9em;cursor:pointer;">' +
            '<option value="name-asc">Name A–Z</option>' +
            '<option value="name-desc">Name Z–A</option>' +
            '<option value="count-desc">Most movies</option>' +
            '<option value="count-asc">Fewest movies</option>' +
            '</select>' +
            '<button type="button" class="btnTlRefresh" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-secondary);border-radius:3px;padding:5px 10px;font-size:0.9em;"><i class="md-icon" style="font-size:1em;vertical-align:middle;">refresh</i></button>' +
            '</div>' +
            renderTopListRows(allExistingTopLists) +
            '</div>';

        container.dataset.loaded = '1';

        const btnCreateNew = container.querySelector('#btnCreateNewTopList');
        if (btnCreateNew) {
            btnCreateNew.addEventListener('click', function () {
                deps.showCreateTopListChooser(tagsData, existingTopLists, function () {
                    deps.reload();
                });
            });
        }

        function applySearchSort() {
            // Function declarations are hoisted, so the `if (!container)
            // return` narrowing from the outer scope does not flow into
            // this body — alias the (provably non-null) container once.
            const c = container as TlContainer;
            const query = ((c.querySelector('#tlSearch') as HTMLInputElement).value || '').toLowerCase();
            const filter = (c.querySelector('#tlFilter') as HTMLSelectElement).value;
            const sort = (c.querySelector('#tlSort') as HTMLSelectElement).value;

            const rowsList = c.querySelector('#tlRowsList');
            if (!rowsList) return;
            const rows = Array.from(rowsList.querySelectorAll<HTMLElement>('.tag-row'));

            rows.forEach(function (row) {
                const tlName = row.dataset.tlname || '';
                const isManual = row.dataset.ismanual === '1';
                const matchSearch = !query || tlName.indexOf(query) !== -1;
                let matchFilter = true;
                if (filter === 'manual') matchFilter = isManual;
                if (filter === 'bytag') matchFilter = !isManual;
                row.style.display = (matchSearch && matchFilter) ? '' : 'none';
            });

            const visibleRows = rows.filter(function (r) { return r.style.display !== 'none'; });
            visibleRows.sort(function (a, b) {
                const nameA = a.dataset.tlname || '';
                const nameB = b.dataset.tlname || '';
                const countA = parseInt(a.dataset.count || '0', 10);
                const countB = parseInt(b.dataset.count || '0', 10);
                if (sort === 'name-asc') return nameA.localeCompare(nameB);
                if (sort === 'name-desc') return nameB.localeCompare(nameA);
                if (sort === 'count-desc') return countB - countA;
                if (sort === 'count-asc') return countA - countB;
                return 0;
            });
            visibleRows.forEach(function (r) { rowsList.appendChild(r); });
        }

        container.querySelector('#tlSearch')!.addEventListener('input', applySearchSort);
        container.querySelector('#tlFilter')!.addEventListener('change', applySearchSort);
        container.querySelector('#tlSort')!.addEventListener('change', applySearchSort);

        applySearchSort();


        if (container._tlClickHandler) container.removeEventListener('click', container._tlClickHandler);
        container._tlClickHandler = function (e: MouseEvent) {
            const target = e.target as Element;
            const rowHeader = target.closest('.tl-row-header');
            if (rowHeader && !target.closest('button')) {
                const row = rowHeader.closest('.tag-row');
                const body = row && row.querySelector<HTMLElement>('.tag-body');
                const icon = rowHeader.querySelector('.expand-icon');
                // `body` derives from `row`, so when `body` is truthy `row`
                // is too — the legacy `if (body)` check is spelled as
                // `if (row && body)` to satisfy strict null checks.
                if (row && body) {
                    const expanded = body.style.display !== 'none';
                    body.style.display = expanded ? 'none' : 'block';
                    if (icon) icon.textContent = expanded ? 'expand_more' : 'expand_less';
                    if (!expanded && !body.dataset.formLoaded) {
                        body.dataset.formLoaded = '1';
                        deps.loadInlineEditForm(row, body, function () { deps.reload(); });
                    }
                }
                return;
            }

            const btn = target.closest('button') as HTMLButtonElement | null;
            if (!btn) return;

            if (btn.classList.contains('btnTlDelete')) {
                const deleteName = btn.dataset.name;
                if (!deps.confirm('Delete top-list for "' + deleteName + '"?\n\nThis will remove the folder, all .strm files, and the virtual library.')) return;
                const deleteBtn = btn;
                deleteBtn.disabled = true;
                deleteBtn.textContent = 'Deleting…';
                const deleteToken = deps.getAccessToken();
                deps.fetch(deps.getUrl('HomeScreenCompanion/TopList/Delete'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-MediaBrowser-Token': deleteToken },
                    body: JSON.stringify({ TagName: deleteName })
                })
                    .then(function (r) { return r.json(); })
                    .then(function (delResultRaw) {
                        const delResult = delResultRaw as { Success?: boolean; Message?: string; FolderPath?: string };
                        if (!delResult.Success) throw new Error(delResult.Message || 'Delete failed');
                        const folderPath = delResult.FolderPath;
                        return deps.fetch(deps.getUrl('Library/VirtualFolders'), {
                            headers: { 'X-MediaBrowser-Token': deleteToken }
                        })
                            .then(function (r) { return r.json(); })
                            .then(function (foldersRaw) {
                                const folders = foldersRaw as Array<{ ItemId?: string; Locations?: string[] }> | null | undefined;
                                function normDlp(p: string | null | undefined) { return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }
                                const match = (folders || []).find(function (f) {
                                    return (f.Locations || []).some(function (loc) {
                                        return normDlp(loc) === normDlp(folderPath);
                                    });
                                });
                                if (match && match.ItemId) {
                                    return deps.fetch(deps.getUrl('Library/VirtualFolders') + '?Id=' + encodeURIComponent(match.ItemId) + '&RefreshLibrary=false', {
                                        method: 'DELETE',
                                        headers: { 'X-MediaBrowser-Token': deleteToken }
                                    });
                                }
                            });
                    })
                    .then(function () {
                        deps.unregisterTopList(deleteName!.toLowerCase());
                        deps.reload();
                    })
                    .catch(function (err: unknown) {
                        deleteBtn.disabled = false;
                        deleteBtn.textContent = 'Delete top-list';
                        deps.alert('Error deleting top-list: ' + (typeof (err as { message?: string }).message === 'string' ? (err as { message?: string }).message : String(err)));
                    });
                return;
            }

            if (btn.classList.contains('btnTlRefresh')) {
                deps.reload();
                return;
            }
        };
        container.addEventListener('click', container._tlClickHandler);

    }).catch(function (err: unknown) {
        container.innerHTML = '<div style="color:#cc3333;padding:20px;">Failed to load: ' + escapeHtml(String(err)) + '</div>';
    });
}
