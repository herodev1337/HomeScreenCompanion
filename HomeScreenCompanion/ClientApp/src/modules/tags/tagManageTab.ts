/**
 * Phase 5: Tags/Collections manage tab loader, extracted verbatim from
 * `Configuration/configPage.js` (legacy.js:3813-4397).
 *
 * `loadTagManageTab(view, deps)` renders the Tags manage tab into
 * `view`'s `#tcManageContainer`. Behavior:
 *
 *   1. Writes the loading copy into the container.
 *   2. Fetches `HomeScreenCompanion/Manage/Tags` and
 *      `HomeScreenCompanion/Manage/Collections` plus the plugin
 *      configuration.
 *   3. Builds `managedTagMap` / `managedCollMap` from the plugin
 *      config so the "Managed by HSC Plugin" badge can be rendered
 *      next to plugin-managed tags/collections.
 *   4. Renders two side-by-side sections (Tags + Collections) with
 *      search/sort/type-filter chrome, per-row Remove/Undo buttons,
 *      and a hover tooltip listing the media types each tag covers.
 *   5. Wires a delegated click handler on the container for
 *      Remove/Undo (mark/unmark for deletion) and Refresh (re-load).
 *   6. Exposes `container._tcShowModal()` so the global form save
 *      button can open the summary modal.
 *   7. `showSummaryModal()` — confirmation modal listing pending
 *      deletions with optional "deactivate group" checkboxes. The
 *      Confirm button POSTs to `Manage/DeleteTags` (batch) and
 *      `Manage/DeleteCollection` (sequential), then optionally
 *      deactivates matching plugin groups via
 *      `updatePluginConfiguration`, then reaches across tabs into
 *      `#tagListContainer .tag-row` to disable matching source rows,
 *      clears pending deletes, and reloads the manage tab.
 *
 * Module-scope state read/written by the legacy function (lifted to
 * deps):
 *
 *   - `window.ApiClient.{accessToken,getUrl,getPluginConfiguration,
 *     updatePluginConfiguration}` → `deps.getApiClient()` +
 *     `deps.pluginId`.
 *   - global `fetch` → `deps.fetch`.
 *   - `checkFormState` → `deps.checkFormState`.
 *   - `alert` → `deps.alert`.
 *   - `escapeHtml` is present in deps per the parallel `modals.ts`
 *     spec; the local `escAttr` / `escHtml` (legacy.js:3857-3858)
 *     are kept for byte-equivalence with the legacy output.
 *
 * Legacy quirks preserved on purpose:
 *   - `pendingTagDeletes` / `pendingCollDeletes` maps are `let`-bound
 *     so the modal handler can reassign them to `{}` after a
 *     successful save;
 *   - `container._tcClickHandler` and `container._tcShowModal`
 *     expandos are stamped on the container so external callers
 *     (e.g. the form's global Save button) can trigger them;
 *   - the type-filter dropdown's document-click close handler
 *     self-removes when the container detaches from the DOM
 *     (`closeTypeFilter` named function expression);
 *   - the tooltip element is appended to `document.body` and cleaned
 *     up by a `MutationObserver` watching the container's parent
 *     node;
 *   - cross-tab DOM reach into `#tagListContainer .tag-row` after a
 *     save is preserved verbatim — the function does not own that
 *     markup but mutates its state to reflect plugin-group
 *     inactivation.
 */

import type { PluginConfigWithTagsLike } from '../toplists/topListsTab';

/** Minimal slice of the Jellyfin `ApiClient` surface used here. */
export interface TagManageTabApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
}

/**
 * Dependencies for {@link loadTagManageTab}.
 *
 * Several fields (`getHseUsers`, `executeTopListCreationSteps`,
 * `showCreateTopListChooser`, `loadInlineEditForm`, `sortRows`,
 * `getDragAfterElement`, `refreshMySavedFiltersPanels`,
 * `savedFilters`) are not consumed by `loadTagManageTab` directly —
 * they are declared here so this module shares its interface shape
 * with the parallel `modals.ts` extraction (which routes the same
 * deps bag through every top-list-related function). They are
 * stubbed in the test suite.
 */
export interface TagManageTabDeps {
    readonly fetch: typeof fetch;
    readonly getApiClient: () => TagManageTabApiClient;
    readonly confirm: (message: string) => boolean;
    readonly alert: (message: string) => void;
    readonly escapeHtml: (s: unknown) => string;
    readonly getHseUsers: () => Promise<unknown>;
    readonly executeTopListCreationSteps: (deps: unknown) => Promise<unknown>;
    readonly showCreateTopListChooser: (
        tagsData: readonly unknown[],
        existingTopLists: ReadonlySet<string>,
        onSuccess: () => void,
        deps: unknown
    ) => void;
    readonly loadInlineEditForm: (
        row: HTMLElement,
        body: HTMLElement,
        onSuccess: () => void,
        deps: unknown
    ) => void;
    readonly sortRows: (container: HTMLElement, criteria: string) => void;
    readonly getDragAfterElement: (
        container: HTMLElement,
        y: number,
        selector?: string
    ) => HTMLElement | null;
    readonly checkFormState: () => void;
    readonly refreshMySavedFiltersPanels: (savedFilters: readonly unknown[]) => void;
    readonly savedFilters: readonly unknown[];
    readonly pluginId: string;
}

/** Minimal `Manage/Tags` payload. */
interface TagsResponseLike {
    Tags?: Array<{
        Id?: string;
        Name?: string;
        ItemCount?: number;
        ItemTypes?: string[];
    }>;
}

/** Minimal `Manage/Collections` payload. */
interface CollectionsResponseLike {
    Collections?: Array<{
        Id?: string;
        Name?: string;
        ItemCount?: number;
    }>;
}

/** A pending tag deletion (legacy uses lower-case tag name as the key). */
interface PendingTagDelete { name: string; itemCount: number }

/** A pending collection deletion (legacy uses collection Id as the key). */
interface PendingCollDelete { id: string; name: string; itemCount: number }

/** A plugin config group entry as consumed by the badge rendering. */
interface GroupEntry { displayName: string; groupIndex: number; groupActive: boolean }

/** One media-type filter group. */
interface TcTypeGroup { label: string; types: readonly string[] }

/** The container element with the legacy expandos. */
interface TcContainer extends HTMLElement {
    _tcClickHandler?: ((e: MouseEvent) => void) | null;
    _tcShowModal?: (() => void) | null;
    _tcHasPending?: boolean;
}

/**
 * Load the Tags/Collections manage tab into `view`'s `#tcManageContainer`.
 * No-op when the container is missing. Reads no module-scope state —
 * every external interaction goes through `deps`.
 */
export function loadTagManageTab(view: HTMLElement, deps: TagManageTabDeps): void {
    const container = view.querySelector<TcContainer>('#tcManageContainer');
    if (!container) return;

    container.innerHTML = '<div style="padding:20px;color:var(--theme-text-secondary);display:flex;align-items:center;gap:10px;">Loading <span class="tc-dot-loader"><span></span><span></span><span></span></span></div>';

    const apiClient = deps.getApiClient();
    const token = apiClient.accessToken();
    let pendingTagDeletes: Record<string, PendingTagDelete> = {};
    let pendingCollDeletes: Record<string, PendingCollDelete> = {};

    const reload = (): void => { loadTagManageTab(view, deps); };

    Promise.all([
        deps.fetch(apiClient.getUrl('HomeScreenCompanion/Manage/Tags'), { headers: { 'X-MediaBrowser-Token': token } })
            .then(function (r) { return r.json(); }),
        deps.fetch(apiClient.getUrl('HomeScreenCompanion/Manage/Collections'), { headers: { 'X-MediaBrowser-Token': token } })
            .then(function (r) { return r.json(); }),
        apiClient.getPluginConfiguration(deps.pluginId).catch(function () { return { Tags: [] }; }),
    ]).then(function (results) {
        const tagsData = results[0] as TagsResponseLike;
        const collectionsData = results[1] as CollectionsResponseLike;
        const pluginConfig = results[2] as PluginConfigWithTagsLike;

        // Build maps: which tags/collections are managed by a plugin group.
        // Each logical group may appear multiple times in cfg.Tags (one entry per URL/source).
        // Deduplicate by Tag value so we get one entry per logical group.
        const managedTagMap: Record<string, GroupEntry[]> = {};
        const managedCollMap: Record<string, GroupEntry[]> = {};
        const seenGroupByTag: Record<string, boolean> = {};
        (pluginConfig.Tags || []).forEach(function (t, idx) {
            if (!t.Tag) return;
            const tName = t.Tag.trim();
            const tKey = tName.toLowerCase();
            if (seenGroupByTag[tKey]) return;
            seenGroupByTag[tKey] = true;
            const groupLabel = (t.Name && t.Name.trim() && t.Name.trim().toLowerCase() !== tKey) ? t.Name.trim() : tName;
            const entry: GroupEntry = { displayName: groupLabel, groupIndex: idx, groupActive: !!t.Active };
            if (!managedTagMap[tKey]) managedTagMap[tKey] = [];
            managedTagMap[tKey]!.push(entry);
            if (t.EnableCollection) {
                const cName = (t.CollectionName && t.CollectionName.trim()) ? t.CollectionName.trim() : tName;
                const cKey = cName.toLowerCase();
                if (!managedCollMap[cKey]) managedCollMap[cKey] = [];
                managedCollMap[cKey]!.push(entry);
            }
        });

        function escAttr(s: unknown): string {
            return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        }
        function escHtml(s: unknown): string {
            return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        const btnStyle = 'cursor:pointer;border:none;border-radius:3px;padding:4px 12px;font-size:0.82em;font-weight:500;';

        function renderSection(title: string, items: readonly unknown[], isTagSection: boolean, headerExtra: string): string {
            const sectionId = isTagSection ? 'tcTagSection' : 'tcCollSection';
            const rows = items.length === 0
                ? '<div style="color:var(--theme-text-secondary);padding:8px 0;">No items found.</div>'
                : items.map(function (item) {
                    const it = item as { Id?: string; Name?: string; ItemCount?: number; ItemTypes?: string[] };
                    const id = it.Id || '';
                    const name = it.Name || '';
                    const count = it.ItemCount != null ? it.ItemCount : 0;
                    const managed = isTagSection ? managedTagMap[name.toLowerCase()] : managedCollMap[name.toLowerCase()];
                    const badge = managed && managed.length > 0
                        ? '<span style="font-size:0.75em;background:#52B54B22;color:#52B54B;border:1px solid #52B54B55;border-radius:4px;padding:1px 6px;margin-left:8px;white-space:nowrap;">Managed by HSC Plugin</span>'
                        : '';
                    const typesVal = isTagSection ? (it.ItemTypes || []).map(function (t) { return t.toLowerCase(); }).join(',') : '';
                    return '<tr class="tc-manage-row" data-rowname="' + escAttr(name.toLowerCase()) + '" data-managed="' + (managed && managed.length > 0 ? '1' : '0') + '" data-count="' + count + '" data-types="' + escAttr(typesVal) + '">' +
                        '<td style="padding:9px 4px;border-bottom:1px solid var(--line-color);width:100%;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                        (id
                            ? '<a class="tc-item-name tc-nav-link" href="javascript:void(0)" data-navid="' + escAttr(id) + '" style="color:inherit;text-decoration:none;cursor:pointer;" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'">' + escHtml(name) + '</a>'
                            : '<span class="tc-item-name">' + escHtml(name) + '</span>') +
                        badge +
                        '</td>' +
                        '<td style="padding:9px 4px 9px 16px;border-bottom:1px solid var(--line-color);white-space:nowrap;color:var(--theme-text-secondary);font-size:0.88em;">' + count + ' items</td>' +
                        '<td style="padding:9px 4px 9px 8px;border-bottom:1px solid var(--line-color);white-space:nowrap;">' +
                        '<button type="button" class="btnTcMark" style="' + btnStyle + 'background:#cc3333;color:#fff;" data-id="' + escAttr(id) + '" data-name="' + escAttr(name) + '" data-count="' + count + '" data-type="' + (isTagSection ? 'tag' : 'coll') + '">Remove</button>' +
                        '</td>' +
                        '</tr>';
                }).join('');

            return '<div id="' + sectionId + '" style="flex:1 1 300px;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:30px;margin-bottom:12px;">' +
                '<h3 style="margin:0;font-size:1em;text-transform:uppercase;letter-spacing:1px;color:#52B54B;">' + escHtml(title) + '</h3>' +
                headerExtra +
                '<button type="button" class="btnTcRefresh" style="' + btnStyle + 'background:transparent;color:var(--theme-text-secondary);border:1px solid var(--line-color);margin-left:auto;"><i class="md-icon" style="font-size:1em;vertical-align:middle;">refresh</i></button>' +
                '</div>' +
                '<table class="tc-manage-list" style="width:100%;border-collapse:collapse;"><tbody>' + rows + '</tbody></table>' +
                '</div>';
        }

        const searchInputStyle = 'background:rgba(128,128,128,0.08);border:1px solid var(--line-color);border-radius:4px;padding:5px 10px;font-size:0.9em;color:inherit;width:400px;max-width:100%;';

        const tcTypeGroups: readonly TcTypeGroup[] = [
            { label: 'Movies',       types: ['movie'] },
            { label: 'Series',       types: ['series'] },
            { label: 'Episodes',     types: ['episode'] },
            { label: 'Seasons',      types: ['season'] },
            { label: 'Music',        types: ['audio', 'musicvideo', 'musicalbum', 'musicartist'] },
            { label: 'Books',        types: ['book'] },
            { label: 'Games',        types: ['game'] },
            { label: 'Trailers',     types: ['trailer'] },
            { label: 'Theme songs',  types: ['themesong'] },
            { label: 'Theme videos', types: ['themevideo', 'video'] },
            { label: 'Extras',       types: ['behindthescenes', 'deletedscene', 'interview', 'scene', 'clip', 'featurette', 'short'] },
            { label: 'People',       types: ['person'] },
            { label: 'Collections',  types: ['boxset'] },
            { label: 'Photos',       types: ['photo', 'photoalbum'] },
            { label: 'Playlists',    types: ['playlist'] },
            { label: 'Recordings',   types: ['recording'] },
            { label: 'Studios',      types: ['studio'] }
        ];

        const tcExtraTypes: readonly string[] = ['themesong', 'themevideo', 'trailer', 'behindthescenes', 'deletedscene', 'interview', 'scene', 'clip', 'featurette', 'short'];

        const presentGroups: readonly TcTypeGroup[] = tcTypeGroups.filter(function (g) {
            return (tagsData.Tags || []).some(function (tag) {
                return (tag.ItemTypes || []).some(function (t) {
                    return g.types.indexOf(t.toLowerCase()) !== -1;
                });
            });
        });

        const typeFilterDropdownHtml: string = presentGroups.length > 0
            ? '<div class="filter-dropdown-wrapper" id="tcTypeFilterWrap">' +
              '<div class="filter-dropdown-btn" id="tcTypeFilterBtn">' +
              '<i class="md-icon" style="font-size:1.1em;">filter_list</i>' +
              '<span id="tcTypeFilterLabel">Filter tags</span>' +
              '<i class="md-icon" style="font-size:0.9em;opacity:0.6;" id="tcTypeFilterCaret">expand_more</i>' +
              '</div>' +
              '<div class="filter-dropdown-panel" id="tcTypeFilterDropdown">' +
              '<div class="filter-dropdown-label">Media type</div>' +
              presentGroups.map(function (g) {
                  return '<label class="filter-chk-row"><input type="checkbox" class="cbTypeFilter" data-group="' + escAttr(g.label) + '"> <span>' + escHtml(g.label) + '</span></label>';
              }).join('') +
              '</div></div>'
            : '';

        const extrasCheckboxHtml: string =
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9em;white-space:nowrap;opacity:0.8;">' +
            '<input type="checkbox" id="cbIncludeExtras" style="cursor:pointer;margin:0;">' +
            '<span>Include extras</span>' +
            '</label>';

        container.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">' +
            '<input type="text" id="tcSearch" placeholder="Search…" style="' + searchInputStyle + '" />' +
            '<select is="emby-select" id="tcSort" style="color:inherit;background:rgba(128,128,128,0.08);border:1px solid var(--line-color);padding:5px;border-radius:4px;font-size:0.9em;cursor:pointer;">' +
            '<option value="name-asc">Name A–Z</option>' +
            '<option value="name-desc">Name Z–A</option>' +
            '<option value="count-desc">Most items</option>' +
            '<option value="count-asc">Fewest items</option>' +
            '<option value="managed">Managed first</option>' +
            '</select>' +
            '</div>' +
            '<div id="tcSectionsWrap" style="display:flex;gap:40px;align-items:flex-start;">' +
            renderSection('Tags', tagsData.Tags || [], true, typeFilterDropdownHtml + extrasCheckboxHtml) +
            renderSection('Collections', collectionsData.Collections || [], false, '') +
            '</div>';

        container.dataset.loaded = '1';

        function getSelectedTypeGroups(): readonly string[] {
            return Array.from(container!.querySelectorAll<HTMLInputElement>('.cbTypeFilter:checked')).map(function (cb) { return cb.dataset.group || ''; });
        }

        function rowMatchesTypeFilter(row: HTMLElement, selectedGroups: readonly string[]): boolean {
            if (selectedGroups.length === 0) return true;
            const rowTypes = (row.dataset.types || '').split(',').filter(Boolean);
            return selectedGroups.some(function (groupLabel) {
                const group = tcTypeGroups.find(function (g) { return g.label === groupLabel; });
                if (!group) return false;
                return rowTypes.some(function (t) { return group.types.indexOf(t) !== -1; });
            });
        }

        function updateTypeFilterBtn(): void {
            const btn = container!.querySelector<HTMLElement>('#tcTypeFilterBtn');
            const lbl = container!.querySelector<HTMLElement>('#tcTypeFilterLabel');
            if (!btn || !lbl) return;
            const selected = getSelectedTypeGroups();
            lbl.textContent = selected.length === 0 ? 'Filter tags' : selected.length + ' type' + (selected.length > 1 ? 's' : '');
            if (selected.length > 0) btn.classList.add('active');
            else btn.classList.remove('active');
        }

        function applySearchSort(): void {
            const query = (container!.querySelector<HTMLInputElement>('#tcSearch')!.value || '').toLowerCase();
            const sort = container!.querySelector<HTMLSelectElement>('#tcSort')!.value;
            const selectedGroups = getSelectedTypeGroups();
            const includeExtras = !!(container!.querySelector<HTMLInputElement>('#cbIncludeExtras') || { checked: false }).checked;

            ['tcTagSection', 'tcCollSection'].forEach(function (sectionId) {
                const section = container!.querySelector<HTMLElement>('#' + sectionId);
                if (!section) return;
                const rows = Array.from(section.querySelectorAll<HTMLElement>('.tc-manage-row'));
                const isTagSection = sectionId === 'tcTagSection';

                rows.forEach(function (row) {
                    const rowName = row.dataset.rowname || '';
                    const nameMatch = !query || rowName.indexOf(query) !== -1;
                    const typeMatch = !isTagSection || rowMatchesTypeFilter(row, selectedGroups);
                    const extrasOk = !isTagSection || includeExtras || (function (): boolean {
                        const types = (row.dataset.types || '').split(',').filter(Boolean);
                        return types.length === 0 || !types.every(function (t) { return tcExtraTypes.indexOf(t) !== -1; });
                    })();
                    row.style.display = (nameMatch && typeMatch && extrasOk) ? '' : 'none';
                });

                const list = section.querySelector<HTMLElement>('.tc-manage-list');
                if (!list) return;
                const visibleRows = rows.filter(function (r) { return r.style.display !== 'none'; });
                visibleRows.sort(function (a, b) {
                    const nameA = a.dataset.rowname || '';
                    const nameB = b.dataset.rowname || '';
                    const countA = parseInt(a.dataset.count || '0', 10);
                    const countB = parseInt(b.dataset.count || '0', 10);
                    const managedA = a.dataset.managed === '1';
                    const managedB = b.dataset.managed === '1';
                    if (sort === 'name-asc') return nameA.localeCompare(nameB);
                    if (sort === 'name-desc') return nameB.localeCompare(nameA);
                    if (sort === 'count-desc') return countB - countA;
                    if (sort === 'count-asc') return countA - countB;
                    if (sort === 'managed') return (managedB ? 1 : 0) - (managedA ? 1 : 0) || nameA.localeCompare(nameB);
                    return 0;
                });
                visibleRows.forEach(function (r) { list.appendChild(r); });
            });
        }

        container.querySelector<HTMLInputElement>('#tcSearch')!.addEventListener('input', applySearchSort);
        container.querySelector<HTMLSelectElement>('#tcSort')!.addEventListener('change', applySearchSort);
        const cbIncludeExtras = container.querySelector<HTMLInputElement>('#cbIncludeExtras');
        if (cbIncludeExtras) cbIncludeExtras.addEventListener('change', applySearchSort);

        const typeFilterBtn = container.querySelector<HTMLElement>('#tcTypeFilterBtn');
        const typeFilterDropdown = container.querySelector<HTMLElement>('#tcTypeFilterDropdown');
        const typeFilterCaret = container.querySelector<HTMLElement>('#tcTypeFilterCaret');
        if (typeFilterBtn && typeFilterDropdown) {
            typeFilterBtn.addEventListener('click', function (e: MouseEvent) {
                e.stopPropagation();
                const open = typeFilterDropdown!.classList.toggle('open');
                if (typeFilterCaret) typeFilterCaret.textContent = open ? 'expand_less' : 'expand_more';
            });
            typeFilterDropdown.addEventListener('change', function (e: Event) {
                const t = e.target as Element | null;
                if (t && t.classList.contains('cbTypeFilter')) {
                    updateTypeFilterBtn();
                    applySearchSort();
                }
            });
            document.addEventListener('click', function closeTypeFilter(e: MouseEvent): void {
                const t = e.target as Node | null;
                if (t && !typeFilterDropdown!.contains(t) && !typeFilterBtn!.contains(t)) {
                    typeFilterDropdown!.classList.remove('open');
                    if (typeFilterCaret) typeFilterCaret.textContent = 'expand_more';
                }
                if (!container!.isConnected) document.removeEventListener('click', closeTypeFilter);
            });
        }

        applySearchSort();

        // Hover tooltip: shows which object types a tag appears on.
        const tcTooltip = document.createElement('div');
        tcTooltip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;display:none;' +
            'background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#eee);' +
            'border:1px solid var(--plugin-popup-border,#444);border-radius:6px;' +
            'padding:8px 12px;font-size:0.82em;line-height:1.6;max-width:210px;' +
            'box-shadow:0 4px 14px rgba(0,0,0,0.4);';
        document.body.appendChild(tcTooltip);

        // Remove the tooltip when the container leaves the DOM.
        const tcTooltipObserver = new MutationObserver(function (): void {
            if (!container!.isConnected) { tcTooltip.remove(); tcTooltipObserver.disconnect(); }
        });
        if (container.parentNode) tcTooltipObserver.observe(container.parentNode, { childList: true });

        function getTypeLabels(typesStr: string): readonly string[] | null {
            const rawTypes = (typesStr || '').split(',').filter(Boolean);
            if (!rawTypes.length) return null;
            const seen: Record<string, boolean> = {};
            const labels: string[] = [];
            tcTypeGroups.forEach(function (g) {
                if (!seen[g.label] && rawTypes.some(function (t) { return g.types.indexOf(t) !== -1; })) {
                    seen[g.label] = true;
                    labels.push(g.label);
                }
            });
            return labels.length ? labels : null;
        }

        const tcTagSection = container.querySelector<HTMLElement>('#tcTagSection');
        if (tcTagSection) {
            tcTagSection.addEventListener('mouseover', function (e: MouseEvent): void {
                const t = e.target as Element | null;
                if (!t) { tcTooltip.style.display = 'none'; return; }
                const nameEl = t.closest('.tc-item-name');
                if (!nameEl) { tcTooltip.style.display = 'none'; return; }
                const row = nameEl.closest<HTMLElement>('.tc-manage-row');
                if (!row) return;
                const labels = getTypeLabels(row.dataset.types || '');
                if (!labels) { tcTooltip.style.display = 'none'; return; }
                tcTooltip.innerHTML =
                    '<div style="font-weight:600;opacity:0.55;font-size:0.85em;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">Found in</div>' +
                    labels.map(function (l) {
                        return '<div style="display:flex;align-items:center;gap:6px;">' +
                            '<i class="md-icon" style="font-size:0.95em;opacity:0.7;">label</i>' +
                            escHtml(l) + '</div>';
                    }).join('');
                tcTooltip.style.display = 'block';
            });
            tcTagSection.addEventListener('mousemove', function (e: MouseEvent): void {
                const t = e.target as Element | null;
                if (!t) { tcTooltip.style.display = 'none'; return; }
                const nameEl = t.closest('.tc-item-name');
                if (!nameEl) { tcTooltip.style.display = 'none'; return; }
                tcTooltip.style.left = (e.clientX + 16) + 'px';
                tcTooltip.style.top = (e.clientY + 12) + 'px';
                const rect = tcTooltip.getBoundingClientRect();
                if (rect.right > window.innerWidth - 8) tcTooltip.style.left = (e.clientX - rect.width - 16) + 'px';
                if (rect.bottom > window.innerHeight - 8) tcTooltip.style.top = (e.clientY - rect.height - 12) + 'px';
            });
            tcTagSection.addEventListener('mouseout', function (e: MouseEvent): void {
                const t = e.target as Element | null;
                if (!t) return;
                const nameEl = t.closest('.tc-item-name');
                if (!nameEl) return;
                const rt = e.relatedTarget as Node | null;
                if (rt && nameEl.contains(rt)) return;
                tcTooltip.style.display = 'none';
            });
        }

        function updateSaveButton(): void {
            const hasPending = Object.keys(pendingTagDeletes).length > 0 || Object.keys(pendingCollDeletes).length > 0;
            container!._tcHasPending = hasPending;
            deps.checkFormState();
        }

        if (container._tcClickHandler) container.removeEventListener('click', container._tcClickHandler);
        container._tcClickHandler = function (e: MouseEvent): void {
            const target = e.target as Element | null;
            if (!target) return;
            const navLink = target.closest('.tc-nav-link');
            if (navLink) {
                const navId = navLink.getAttribute('data-navid') || '';
                const baseUrl = window.location.href.split('#')[0]!;
                const serverId = (window as unknown as { ApiClient?: { serverId?: () => string } }).ApiClient?.serverId ? (window as unknown as { ApiClient: { serverId: () => string } }).ApiClient.serverId() : '';
                const url = baseUrl + '#!/item?id=' + encodeURIComponent(navId) +
                          (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
                window.open(url, '_blank');
                return;
            }

            const btn = target.closest('button') as HTMLButtonElement | null;
            if (!btn) return;

            // Mark for deletion
            if (btn.classList.contains('btnTcMark')) {
                const type = btn.dataset.type;
                const id = btn.dataset.id || '';
                const name = btn.dataset.name || '';
                const count = parseInt(btn.dataset.count || '0', 10);
                if (type === 'tag') pendingTagDeletes[id.toLowerCase()] = { name: name, itemCount: count };
                else pendingCollDeletes[id] = { id: id, name: name, itemCount: count };
                const row = btn.closest<HTMLElement>('.tc-manage-row');
                if (row) {
                    row.style.opacity = '0.45';
                    const nameEl = row.querySelector<HTMLElement>('.tc-item-name');
                    if (nameEl) nameEl.style.textDecoration = 'line-through';
                    btn.textContent = 'Undo';
                    btn.classList.remove('btnTcMark');
                    btn.classList.add('btnTcUndo');
                    btn.style.background = '#555';
                }
                updateSaveButton();
                return;
            }

            // Undo pending deletion
            if (btn.classList.contains('btnTcUndo')) {
                const type = btn.dataset.type;
                const id = btn.dataset.id || '';
                if (type === 'tag') delete pendingTagDeletes[id.toLowerCase()];
                else delete pendingCollDeletes[id];
                const row = btn.closest<HTMLElement>('.tc-manage-row');
                if (row) {
                    row.style.opacity = '1';
                    const nameEl = row.querySelector<HTMLElement>('.tc-item-name');
                    if (nameEl) nameEl.style.textDecoration = '';
                    btn.textContent = 'Remove';
                    btn.classList.remove('btnTcUndo');
                    btn.classList.add('btnTcMark');
                    btn.style.background = '#cc3333';
                }
                updateSaveButton();
                return;
            }

            // Refresh
            if (btn.classList.contains('btnTcRefresh')) {
                container.dataset.loaded = '';
                reload();
                return;
            }
        };
        container.addEventListener('click', container._tcClickHandler);

        container._tcShowModal = function (): void { showSummaryModal(); };

        function showSummaryModal(): void {
            const undoBtnStyle = 'cursor:pointer;border:none;background:transparent;color:#cc2222;border-radius:3px;padding:2px 6px;font-size:1.1em;line-height:1;margin-right:8px;flex-shrink:0;';

            function buildRows(items: readonly PendingTagDelete[], isTag: boolean): string {
                return items.map(function (item) {
                    const name = item.name;
                    const key = isTag ? item.name.toLowerCase() : (pendingCollDeletes[item.name.toLowerCase()]?.id ?? '');
                    const managed = isTag ? managedTagMap[name.toLowerCase()] : managedCollMap[name.toLowerCase()];
                    let warning = '';
                    const activeManaged = managed ? managed.filter(function (m) { return m.groupActive; }) : [];
                    if (activeManaged.length > 0) {
                        const what = isTag ? 'recreate this tag' : 'recreate this collection';
                        const warningText = activeManaged.length === 1
                            ? 'Group <strong>' + escHtml(activeManaged[0]!.displayName) + '</strong> is active and may ' + what + ' on next sync.'
                            : activeManaged.length + ' active groups may ' + what + ' on next sync.';
                        const checkboxes = activeManaged.map(function (m) {
                            return '<label style="display:flex;align-items:center;gap:6px;margin-top:5px;cursor:pointer;">' +
                                '<input type="checkbox" class="cbInactivateGroup" data-group-indices="' + escAttr(JSON.stringify([m.groupIndex])) + '"> ' +
                                'Deactivate <strong>' + escHtml(m.displayName) + '</strong>' +
                                '</label>';
                        }).join('');
                        warning =
                            '<div style="color:#f0a000;margin-top:6px;font-size:0.88em;">' +
                            '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:4px;">warning</i>' +
                            warningText + checkboxes + '</div>';
                    }
                    const itemCount = isTag ? item.itemCount : (pendingCollDeletes[item.name.toLowerCase()]?.itemCount ?? 0);
                    return '<div style="padding:10px 0;border-bottom:1px solid var(--line-color);display:flex;align-items:flex-start;">' +
                        '<button type="button" class="btnModalUndo" style="' + undoBtnStyle + '" data-key="' + escAttr(key) + '" data-type="' + (isTag ? 'tag' : 'coll') + '" title="Keep this one">✕</button>' +
                        '<div style="flex:1;">' +
                        '<span style="font-weight:500;">' + escHtml(name) + '</span>' +
                        '<span style="color:var(--theme-text-secondary);font-size:0.88em;margin-left:8px;">(' + itemCount + ' items)</span>' +
                        warning +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            function buildContent(): string {
                const tagList: readonly PendingTagDelete[] = Object.values(pendingTagDeletes);
                const collList: readonly PendingCollDelete[] = Object.values(pendingCollDeletes);
                const tagSection = tagList.length > 0
                    ? '<div style="margin-bottom:20px;"><h4 style="margin:0 0 8px;color:#52B54B;">Tags to remove (' + tagList.length + ')</h4>' + buildRows(tagList, true) + '</div>'
                    : '';
                const collSection = collList.length > 0
                    ? '<div style="margin-bottom:20px;"><h4 style="margin:0 0 8px;color:#52B54B;">Collections to remove (' + collList.length + ')</h4>' + buildRows(collList, false) + '</div>'
                    : '';
                return tagSection + collSection;
            }

            const modal = document.createElement('div');
            modal.dataset.tcModal = 'summary';
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;';

            function renderModal(): void {
                const tagList: readonly PendingTagDelete[] = Object.values(pendingTagDeletes);
                const collList: readonly PendingCollDelete[] = Object.values(pendingCollDeletes);
                if (tagList.length === 0 && collList.length === 0) { modal.remove(); updateSaveButton(); return; }
                modal.innerHTML =
                    '<div style="background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;padding:28px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">' +
                    '<h3 style="margin:0 0 20px;font-size:1.1em;color:#52B54B;">Summary — Pending changes</h3>' +
                    '<div id="tcModalBody">' + buildContent() + '</div>' +
                    '<div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;border-top:1px solid var(--line-color);padding-top:16px;">' +
                    '<button type="button" id="tcModalCancel" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-primary);border-radius:3px;padding:8px 18px;font-size:0.9em;">Cancel</button>' +
                    '<button type="button" id="tcModalConfirm" style="cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:3px;padding:8px 18px;font-size:0.9em;font-weight:500;"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:5px;">check</i>Confirm &amp; Save</button>' +
                    '</div></div>';

                modal.querySelector<HTMLButtonElement>('#tcModalCancel')!.addEventListener('click', function () { modal.remove(); });

                modal.addEventListener('click', function (e: MouseEvent): void {
                    const target = e.target as Element | null;
                    if (!target) return;
                    const undoBtn = target.closest('.btnModalUndo');
                    if (!undoBtn) return;
                    const ub = undoBtn as HTMLElement;
                    const type = ub.dataset.type;
                    const key = ub.dataset.key || '';
                    if (type === 'tag') delete pendingTagDeletes[key];
                    else delete pendingCollDeletes[key];

                    // Restore the row in the main list directly (no .click() to avoid re-triggering handler)
                    const keyLower = key.toLowerCase();
                    const mainBtn = Array.from(container!.querySelectorAll<HTMLButtonElement>('.btnTcUndo')).find(function (b) { return (b.dataset.id || '').toLowerCase() === keyLower; });
                    if (mainBtn) {
                        const row = mainBtn.closest<HTMLElement>('.tc-manage-row');
                        if (row) {
                            row.style.opacity = '1';
                            const nameEl = row.querySelector<HTMLElement>('.tc-item-name');
                            if (nameEl) nameEl.style.textDecoration = '';
                        }
                        mainBtn.textContent = 'Remove';
                        mainBtn.classList.remove('btnTcUndo');
                        mainBtn.classList.add('btnTcMark');
                        mainBtn.style.background = '#cc3333';
                    }

                    updateSaveButton();
                    renderModal();
                });

                modal.querySelector<HTMLButtonElement>('#tcModalConfirm')!.addEventListener('click', function () {
                    const confirmBtn = modal.querySelector<HTMLButtonElement>('#tcModalConfirm')!;
                    confirmBtn.disabled = true;
                    confirmBtn.innerHTML = 'Saving <span class="tc-dot-loader"><span></span><span></span><span></span></span>';

                    const tagList: PendingTagDelete[] = Object.values(pendingTagDeletes);
                    const collList: PendingCollDelete[] = Object.values(pendingCollDeletes);

                    const groupsToInactivate = new Set<number>();
                    modal.querySelectorAll<HTMLInputElement>('.cbInactivateGroup:checked').forEach(function (cb) {
                        const raw: unknown = cb.dataset.groupIndices ? JSON.parse(cb.dataset.groupIndices) : [];
                        const indices: unknown[] = Array.isArray(raw) ? raw : [];
                        indices.forEach(function (idx) {
                            if (typeof idx === 'number') groupsToInactivate.add(idx);
                        });
                    });

                    const tok = apiClient.accessToken();

                    // All tags in one batch request — avoids race conditions when items carry multiple managed tags
                    const tagBatchPromise: Promise<unknown> = tagList.length === 0 ? Promise.resolve() :
                        deps.fetch(apiClient.getUrl('HomeScreenCompanion/Manage/DeleteTags'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-MediaBrowser-Token': tok },
                            body: JSON.stringify({ TagNames: tagList.map(function (t) { return t.name; }) })
                        }).then(function (r) { return r.json(); });

                    // Collections are independent — run sequentially after tags
                    const collOps: Array<() => Promise<unknown>> = [];
                    collList.forEach(function (c) {
                        collOps.push(function (): Promise<unknown> {
                            return deps.fetch(apiClient.getUrl('HomeScreenCompanion/Manage/DeleteCollection'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-MediaBrowser-Token': tok },
                                body: JSON.stringify({ CollectionId: c.id })
                            }).then(function (r) { return r.json(); });
                        });
                    });

                    tagBatchPromise.then(function () {
                        return collOps.reduce<Promise<unknown>>(function (chain, op) { return chain.then(op); }, Promise.resolve());
                    }).then(function (): Promise<unknown> {
                        if (groupsToInactivate.size === 0) return Promise.resolve();
                        return apiClient.getPluginConfiguration(deps.pluginId).then(function (cfgRaw) {
                            const cfg = cfgRaw as PluginConfigWithTagsLike;
                            // Collect the Tag values for the seed indices, then inactivate ALL rows sharing that Tag
                            const tagsToInactivate = new Set<string>();
                            groupsToInactivate.forEach(function (idx) {
                                const tagsArr = cfg.Tags;
                                if (!tagsArr) return;
                                const entry = tagsArr[idx];
                                if (entry && entry.Tag) tagsToInactivate.add(entry.Tag.trim().toLowerCase());
                            });
                            (cfg.Tags || []).forEach(function (t) {
                                if (t.Tag && tagsToInactivate.has(t.Tag.trim().toLowerCase()))
                                    t.Active = false;
                            });
                            return apiClient.updatePluginConfiguration(deps.pluginId, cfg as unknown as Record<string, unknown>);
                        });
                    }).then(function () {
                        modal.remove();
                        // Update SOURCES tab rows for deactivated groups immediately.
                        // groupsToInactivate holds seed indices; find all rows sharing the same Tag value.
                        const inactivatedTagKeys = new Set<string>();
                        groupsToInactivate.forEach(function (idx) {
                            const seedRow = view.querySelector<HTMLElement>('#tagListContainer .tag-row[data-index="' + idx + '"]');
                            if (seedRow && seedRow.dataset.tag) inactivatedTagKeys.add(seedRow.dataset.tag.toLowerCase());
                        });
                        view.querySelectorAll<HTMLElement>('#tagListContainer .tag-row').forEach(function (sourceRow) {
                            const rowTag = (sourceRow.dataset.tag || '').toLowerCase();
                            if (!inactivatedTagKeys.has(rowTag)) return;
                            const chk = sourceRow.querySelector<HTMLInputElement>('.chkTagActive');
                            const lbl = sourceRow.querySelector<HTMLElement>('.lblActiveStatus');
                            if (chk) chk.checked = false;
                            if (lbl) { lbl.textContent = 'Disabled'; lbl.style.color = 'var(--theme-text-secondary)'; }
                            sourceRow.classList.add('inactive');
                            const runBtn = sourceRow.querySelector<HTMLButtonElement>('.btnRunEntry');
                            if (runBtn) { runBtn.disabled = true; runBtn.style.opacity = '0.4'; }
                        });
                        pendingTagDeletes = {};
                        pendingCollDeletes = {};
                        const tc2 = container as TcContainer;
                        tc2._tcHasPending = false;
                        deps.checkFormState();
                        tc2.dataset.loaded = '';
                        reload();
                    }).catch(function (err: unknown) {
                        modal.remove();
                        deps.alert('Error saving: ' + String(err));
                    });
                });
            }

            renderModal();
            document.body.appendChild(modal);
        }

    }).catch(function (err: unknown) {
        container.innerHTML = '<div style="color:#cc3333;padding:20px;">Failed to load: ' + String(err) + '</div>';
    });
}
