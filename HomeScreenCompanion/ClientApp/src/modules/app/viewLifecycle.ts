/**
 * View-show / view-hide lifecycle wiring for the legacy config page.
 *
 * Lifted from `modules/index.ts:1432-1963`. Five tasks live here:
 *
 *   - `wireViewShow(view, deps)`   the `viewshow` handler body. Injects
 *                                   the CSS (first time), wires every
 *                                   per-show listener (form input/change,
 *                                   textarea autosize, reset-button,
 *                                   document-click outside-handlers,
 *                                   beforeunload guard, first-visit row
 *                                   drag/drop, log/help/bug-modal close
 *                                   handlers, sort & filter controls,
 *                                   add/backup/restore buttons, dry-run
 *                                   warning, refresh, poll, library
 *                                   pre-fetch, loadConfig), all scope to
 *                                   one `AbortController`
 *                                   (`appState.viewShow.formAc`).
 *   - `wireViewHide(deps)`          the `viewhide` handler — aborts the
 *                                   `viewShow.formAc` and clears
 *                                   `statusInterval`.
 *   - `wirePageTabs(view, deps)`   `.page-tab-btn` click handler —
 *                                   dirty-prompt + reload, then the
 *                                   unified tab-switch algorithm and
 *                                   lazy-load of `HomeCompanion` /
 *                                   `Cleanup` / `TopLists` content.
 *   - `wireHscSubTabs(view, deps)` `.hsc-sub-tab-btn` click handler —
 *                                   the unified tab-switch algorithm with
 *                                   sub-tab selectors, lazy-load of the
 *                                   `copy` / `manage` sub-tabs.
 *   - `wireSettingsPanets(view)`   `.settings-panel-toggle` body
 *                                   expand/collapse.
 *
 * The two tab-switch algorithms (`:1885-1914` ≡ `:1940-1958`) were
 * byte-for-byte identical except for the button / content CSS class
 * names. They are now one `switchTabs(...)` helper (exported only to
 * the wire functions in this file).
 *
 * Every input the factory threads into these helpers is captured in the
 * {@link ViewLifecycleDeps} interface — the helpers hold no module-
 * scope state of their own and never reach a global directly. The
 * factory builds the `deps` object once at mount-time from its typed
 * closures.
 */

import { applyPluginTheme } from '../theme/theme';
import { checkForUpdates } from '../config/configState';
import { sortRows, renderLogModal } from '../logs/logModal';
import { getDragAfterElement } from '../dom/dom';
import { showBackupModal, showRestoreModal } from '../backup/backupRestore';
import { DEFAULT_AI_SYSTEM_PROMPT } from '../state/state';
import { updateSystemPromptResetBtn } from '../systemPrompt/updateSystemPromptResetBtn';
import type { HscDeps, HscUserLike } from '../homesections/hscTab';
import type { SavedFilter, MediaInfoFilterGroup } from '../filters/savedFilters';
import type { AppState } from '../state/state';
import type { WindowApiClient, WindowDashboard } from './apiAdapter';
import type { NamedItem, DateInterval, ScheduleInterval } from '../filters/rows';
import type { MiPresetCategory } from '../tags/renderTagGroup';
import { CUSTOM_CSS } from './customCss';

// ─── Deps surface ─────────────────────────────────────────────────────────────

/**
 * Minimal shape the `LogModal` deps surface uses to talk to the API.
 * Mirrors `LogModalApiClient` in `modules/logs/logModal.ts`.
 */
export interface LogApiClientShape {
    getJSON<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * Inputs the factory threads into {@link wireViewShow} /
 * {@link wireViewHide} / {@link wirePageTabs} / {@link wireHscSubTabs}.
 * Holds:
 *
 *   - the live `AppState` (per-page mounts);
 *   - a getter for the current `view` (set at mount-time);
 *   - the pre-bound closures (`applyFiltersFn`, `refreshStatusFn`,
 *     `checkFormStateBound`, `boundGetUiConfig`, ...);
 *   - the per-tab loaders (`loadHscUsers` + the three tab-loaders +
 *     `applyManageSectionsFn`) and the row-build helpers;
 *   - the config-IO funcs from `app/configIo.ts`;
 *   - the user-list / multi-select helpers;
 *   - the `getApi` / `getDashboard` accessors and `hscDeps()` builder;
 *   - the `LogModal` dep factory (returns a fresh `getApiClient`).
 */
export interface ViewLifecycleDeps {
    readonly appState: AppState;
    readonly applyFilters: (view: HTMLElement) => void;
    readonly refreshStatus: (view: HTMLElement) => void;
    readonly checkFormStateBound: () => void;
    readonly buildUserMultiSelectHtml: (users: readonly HscUserLike[], selIds: readonly string[], chkClass: string) => string;
    readonly wireUserMultiSelect: (container: HTMLElement) => void;
    readonly getHseUsers: (deps: { getApiClient: () => unknown; cache: AppState['hseUserCache'] }) => Promise<HscUserLike[]>;
    readonly getMediaInfoFilterGroupHtml: (filter: MediaInfoFilterGroup | null | undefined, i: number, isFirst: boolean, md: MiFilterDepsForVL) => string;
    readonly getMySavedFiltersPanelHtml: (filters: readonly SavedFilter[]) => string;
    readonly refreshMySavedFiltersPanels: (filters: readonly SavedFilter[]) => void;
    readonly tagConfigHasViewerCriteria: (cfg: unknown) => boolean;
    readonly initHomeSectionTab: (row: HTMLElement, deps: unknown) => void;
    readonly initPlaylistTab: (row: HTMLElement, deps: unknown) => void;
    readonly updateHseSectionAvailability: (row: HTMLElement, deps: { rowHasViewerCriteria: (row: HTMLElement) => boolean; refreshHseSectionTypeOptions: (tab: HTMLElement, tagEnabled: boolean, collEnabled: boolean, viewerOnly: boolean) => void; updateBadges?: (row: HTMLElement) => void }) => void;
    readonly syncHomeSectionFromEmby: (tab: HTMLElement, deps: unknown) => void;
    readonly preFetchLibraryData: (deps: { getApiClient: () => unknown; cache: AppState['hseUserCache'] }) => Promise<unknown>;
    readonly loadHscUsers: (view: HTMLElement, deps: HscDeps) => void;
    readonly loadHscManageTabFn: (view: HTMLElement) => void;
    readonly loadTopListsTabFn: (view: HTMLElement) => void;
    readonly loadTagManageTabFn: (view: HTMLElement) => void;
    readonly applyManageSectionsFn: (view: HTMLElement) => void;
    readonly backupDeps: () => Parameters<typeof showBackupModal>[0];
    readonly getApi: () => WindowApiClient | undefined;
    readonly getDashboard: () => WindowDashboard | undefined;
    readonly hasDirtyState: () => boolean;
    readonly loadConfig: () => Promise<void>;
    readonly doSave: () => void;
    readonly hscDeps: () => HscDeps;
    readonly rowHasViewerCriteriaInline: (row: HTMLElement) => boolean;
    readonly legacyRenderTagGroup: (tagConfig: unknown, container: HTMLElement | null, prepend: boolean, idx: number | undefined, isNew: boolean, afterRef: HTMLElement | null | undefined) => void;
    readonly miPresets: readonly MiPresetCategory[];
    readonly getUrlRowHtml: (value: string | null | undefined, limit: number | undefined) => string;
    readonly getLocalRowHtml: (type: string, selectedName: string, limit: number | undefined, items?: readonly NamedItem[]) => string;
    readonly getDateRowHtml: (interval: DateInterval) => string;
    readonly getMaxDays: (month: number) => number;
    readonly getDayOptions: (selectedDay: number, maxDay: number) => string;
    readonly isScheduleCurrentlyActive: (intervals: readonly ScheduleInterval[]) => boolean;
    readonly readIntervalsFromRow: (row: HTMLElement) => ScheduleInterval[];
    readonly readRowAsConfig: (row: HTMLElement) => unknown;
    readonly getSourceBadgeHtml: (st: string) => string;
}

/**
 * Minimal subset of `MiFilterDeps` that {@link getMediaInfoFilterGroupHtml}
 * consumes — pinned here so {@link ViewLifecycleDeps} can type the param
 * without dragging the full `MiFilterDeps` import surface.
 */
interface MiFilterDepsForVL {
    readonly users: AppState['miUsers']['users'];
    readonly collections: AppState['libraryCache']['collections'];
    readonly playlists: AppState['libraryCache']['playlists'];
    readonly tags: AppState['libraryCache']['tags'];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generic tab-switch algorithm. The two call sites in
 * `modules/index.ts` (`:1885-1914` and `:1940-1958`) were byte-for-byte
 * identical except for the button / content CSS class names; this helper
 * parameterizes over those so a single implementation drives both:
 *
 *   1. Clear `.active` from every `btnSelector` inside `view`.
 *   2. Add `.active` to the matching `btn` (the one whose
 *      `data-page-tab` OR `data-hsc-tab` equals `target`).
 *   3. Set `display: none` on every `contentSelector` inside `view`.
 *   4. Set `display: ''` on `#${contentIdPrefix}${target}`.
 *
 * @param view              The factory root.
 * @param btnSelector       CSS selector for the tab buttons (e.g.
 *                          `.page-tab-btn`, `.hsc-sub-tab-btn`).
 * @param contentSelector   CSS selector for the tab content panels.
 * @param contentIdPrefix   The id-prefix used to find the content panel
 *                          (e.g. `'tab'`, `'hscSubTab'`).
 * @param target            The data attribute value selected by the user.
 */
function switchTabs(
    view: HTMLElement,
    btnSelector: string,
    contentSelector: string,
    contentIdPrefix: string,
    target: string,
): void {
    const btns = view.querySelectorAll<HTMLElement>(btnSelector);
    btns.forEach((b) => {
        const t = b.getAttribute('data-page-tab') || b.getAttribute('data-hsc-tab');
        if (t === target) b.classList.add('active');
        else b.classList.remove('active');
    });
    view.querySelectorAll<HTMLElement>(contentSelector).forEach((c) => { c.style.display = 'none'; });
    const tgt = view.querySelector<HTMLElement>('#' + contentIdPrefix + target);
    if (tgt) tgt.style.display = '';
}

// ─── wireViewShow ─────────────────────────────────────────────────────────────

/**
 * Wire every show-scoped listener for one view-show boundary. Mirrors
 * `modules/index.ts:1435-1805` byte-for-byte (semantics). The list:
 *
 *   1. Inject the `<style id="homeScreenCompanionCustomCss">` element on
 *      first visit (`document.body.insertAdjacentHTML('beforeend', ...)`)
 *      and call {@link applyPluginTheme}.
 *   2. Capture `isFirstVisit` from `view.dataset.hscInit`.
 *   3. Reset `appState.originalConfigState` and abort any prior
 *      `viewShow.formAc` before allocating a fresh one.
 *   4. Wire document-click + `beforeunload`, `form.input`/`change`,
 *      textarea-autosize, settings-tab change, prompt reset button,
 *      and row-edit click-bubbling — all bound to one `signal`.
 *   5. On the first visit: row drag/drop, log/help/bug modal close,
 *      sort row markup, filter-search/clear, sort-dropdown, add-tag,
 *      backup / restore modal flow.
 *   6. Inject the dry-run-warning banner if missing.
 *   7. Disable `.btn-save`, run `checkForUpdates`, refresh status,
 *      start 5-second poll, kick off library pre-fetch in parallel,
 *      and call `loadConfig` once library data resolves.
 */
export function wireViewShow(view: HTMLElement, deps: ViewLifecycleDeps): void {
    if (!document.getElementById('homeScreenCompanionCustomCss')) {
        document.body.insertAdjacentHTML('beforeend', CUSTOM_CSS);
    }
    applyPluginTheme();

    const form = view.querySelector<HTMLElement>('.HomeScreenCompanionForm');
    if (!form) return;

    const isFirstVisit = !view.dataset.hscInit;
    if (isFirstVisit) view.dataset.hscInit = '1';

    deps.appState.originalConfigState.setOriginalConfigState(null);

    const changeHandler = (): void => {
        setTimeout(deps.checkFormStateBound, 0);
    };

    if (deps.appState.viewShow.formAc) deps.appState.viewShow.formAc.abort();
    const formAc = new AbortController();
    deps.appState.viewShow.formAc = formAc;
    const signal = formAc.signal;

    const closeFilterDrop = (e: MouseEvent): void => {
        const dropPanel = view.querySelector<HTMLElement>('#filterDropdownPanel');
        const dropBtn = view.querySelector<HTMLElement>('#btnFilterDropdown');
        const dropCaret = view.querySelector<HTMLElement>('#filterDropdownCaret');
        if (!dropPanel || !dropBtn || !dropCaret) return;
        const target = e.target as Node | null;
        if (!target) return;
        if (!dropPanel.contains(target) && target !== dropBtn) {
            dropPanel.classList.remove('open');
            dropCaret.textContent = 'expand_more';
        }
    };
    const closeSpeedDial = (): void => {
        const speedDial = view.querySelector<HTMLElement>('#runSpeedDial');
        const syncMenu = view.querySelector<HTMLElement>('#runSyncMenu');
        if (speedDial) speedDial.classList.remove('open');
        if (syncMenu) syncMenu.classList.remove('open');
    };

    const beforeUnloadHandler = (e: BeforeUnloadEvent): void => {
        if (deps.hasDirtyState()) {
            e.preventDefault();
            e.returnValue = '';
        }
    };

    document.addEventListener('click', closeFilterDrop, { signal });
    document.addEventListener('click', closeSpeedDial, { signal });
    window.addEventListener('beforeunload', beforeUnloadHandler, { signal });

    form.addEventListener('input', changeHandler, { signal });
    form.addEventListener('change', changeHandler, { signal });
    form.addEventListener('input', (e) => {
        const target = e.target as Element | null;
        if (!target) return;
        const ta = target.closest<HTMLTextAreaElement>('textarea.txtMiValue, textarea.txtTagBlacklist');
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
        ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden';
    }, { signal });

    const settingsTab = view.querySelector<HTMLElement>('#tabSettings');
    if (settingsTab) {
        settingsTab.addEventListener('input', changeHandler, { signal });
        settingsTab.addEventListener('change', changeHandler, { signal });
    }

    const spTa = view.querySelector<HTMLTextAreaElement>('#txtAiSystemPrompt');
    const resetBtn = view.querySelector<HTMLElement>('#btnResetAiSystemPrompt');
    if (spTa && resetBtn) {
        spTa.addEventListener('input', () => { updateSystemPromptResetBtn(view); }, { signal });
        resetBtn.addEventListener('click', () => {
            spTa.value = DEFAULT_AI_SYSTEM_PROMPT;
            updateSystemPromptResetBtn(view);
            changeHandler();
        }, { signal });
    }

    form.addEventListener('click', (e) => {
        const target = e.target as Element | null;
        if (!target) return;
        const dayBtn = target.closest<HTMLElement>('.day-toggle');
        if (dayBtn) dayBtn.classList.toggle('active');
        if (target.closest('.btnRemoveUrl, .btnAddUrl, .btnRemoveLocal, .btnAddLocal, .btnRemoveDate, .btnAddDate, .btnRemoveFilterGroup, .btnAddMediaInfoFilter, .btnClearAllFilters, .btnGroupOpChoice, .btnGroupInnerOpChoice, .btnAddMiRule, .btnRemoveMiRule, .btnRemoveGroup, .day-toggle, .btnRemovePoster, .btnApplyMiPreset')) {
            changeHandler();
        }
    }, { signal });

    const container = view.querySelector<HTMLElement>('#tagListContainer');

    if (isFirstVisit) {
        if (container) {
            let rafId: number | null = null;
            container.addEventListener('dragover', (e) => {
                if (localStorage.getItem('HomeScreenCompanion_SortBy') !== 'Manual') return;
                e.preventDefault();
                if (rafId) return;
                rafId = requestAnimationFrame(() => {
                    const draggingRow = document.querySelector<HTMLElement>('.tag-row.dragging');
                    if (!draggingRow) { rafId = null; return; }
                    const afterElement = getDragAfterElement(container, e.clientY);
                    let placeholder = document.querySelector<HTMLElement>('.sort-placeholder');
                    if (!placeholder) {
                        placeholder = document.createElement('div');
                        placeholder.className = 'sort-placeholder';
                    }
                    if (afterElement == null) {
                        if (placeholder.nextElementSibling !== null) container.appendChild(placeholder);
                    } else {
                        if (placeholder.nextElementSibling !== afterElement) container.insertBefore(placeholder, afterElement);
                    }
                    rafId = null;
                });
            });
            container.addEventListener('drop', (e) => {
                if (localStorage.getItem('HomeScreenCompanion_SortBy') !== 'Manual') return;
                e.preventDefault();
                const draggingRow = document.querySelector<HTMLElement>('.tag-row.dragging');
                const placeholder = document.querySelector<HTMLElement>('.sort-placeholder');
                if (draggingRow && placeholder) {
                    container.insertBefore(draggingRow, placeholder);
                    placeholder.remove();
                    changeHandler();
                }
            });
        }

        const logOverlay = view.querySelector<HTMLElement>('#logModalOverlay');
        const helpOverlay = view.querySelector<HTMLElement>('#helpModalOverlay');
        const bugOverlay = view.querySelector<HTMLElement>('#bugReportModalOverlay');
        const btnOpenLogs = view.querySelector<HTMLElement>('#btnOpenLogs');
        const btnCloseLogs = view.querySelector<HTMLElement>('#btnCloseLogs');
        const btnOpenHelp = view.querySelector<HTMLElement>('#btnOpenHelp');
        const btnCloseHelp = view.querySelector<HTMLElement>('#btnCloseHelp');
        const btnOpenBug = view.querySelector<HTMLElement>('#btnOpenBugReport');
        const btnCloseBug = view.querySelector<HTMLElement>('#btnCloseBugReport');
        const btnCloseMiHelp = view.querySelector<HTMLElement>('#btnCloseMiHelp');
        const btnCloseTagTargetHelp = view.querySelector<HTMLElement>('#btnCloseTagTargetHelp');

        const api = deps.getApi();
        const logApi = (): LogApiClientShape => ({
            getJSON: <T,>(n: string, p?: Record<string, unknown>): Promise<T> => api ? api.getJSON<T>(n, p) : Promise.resolve({} as T),
        });

        if (btnOpenLogs) btnOpenLogs.addEventListener('click', (e) => {
            e.preventDefault();
            deps.appState.logStatus.logTab = null;
            renderLogModal(view, { getApiClient: logApi, state: deps.appState.logStatus, checkFormState: deps.checkFormStateBound });
            if (logOverlay) logOverlay.classList.add('modal-visible');
        });
        if (btnCloseLogs) btnCloseLogs.addEventListener('click', () => {
            deps.appState.logStatus.logTab = null;
            if (logOverlay) logOverlay.classList.remove('modal-visible');
        });
        if (logOverlay) logOverlay.addEventListener('click', (e) => {
            if (e.target === logOverlay) {
                deps.appState.logStatus.logTab = null;
                logOverlay.classList.remove('modal-visible');
            }
        });
        view.querySelectorAll<HTMLElement>('#logTabs .log-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                const key = tab.getAttribute('data-log') as 'sync' | 'hsc' | 'tl' | null;
                deps.appState.logStatus.logTab = key;
                renderLogModal(view, { getApiClient: logApi, state: deps.appState.logStatus, checkFormState: deps.checkFormStateBound });
            });
        });

        if (btnOpenHelp) btnOpenHelp.addEventListener('click', () => helpOverlay && helpOverlay.classList.add('modal-visible'));
        if (btnCloseHelp) btnCloseHelp.addEventListener('click', () => helpOverlay && helpOverlay.classList.remove('modal-visible'));
        if (helpOverlay) helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) helpOverlay.classList.remove('modal-visible'); });

        if (btnOpenBug) btnOpenBug.addEventListener('click', () => bugOverlay && bugOverlay.classList.add('modal-visible'));
        if (btnCloseBug) btnCloseBug.addEventListener('click', () => bugOverlay && bugOverlay.classList.remove('modal-visible'));
        if (bugOverlay) bugOverlay.addEventListener('click', (e) => { if (e.target === bugOverlay) bugOverlay.classList.remove('modal-visible'); });

        const miHelpOverlay = view.querySelector<HTMLElement>('#miHelpModalOverlay');
        if (btnCloseMiHelp) btnCloseMiHelp.addEventListener('click', () => miHelpOverlay && miHelpOverlay.classList.remove('modal-visible'));
        if (miHelpOverlay) miHelpOverlay.addEventListener('click', (e) => { if (e.target === miHelpOverlay) miHelpOverlay.classList.remove('modal-visible'); });

        const tagTargetHelpOverlay = view.querySelector<HTMLElement>('#tagTargetHelpModalOverlay');
        if (btnCloseTagTargetHelp) btnCloseTagTargetHelp.addEventListener('click', () => tagTargetHelpOverlay && tagTargetHelpOverlay.classList.remove('modal-visible'));
        if (tagTargetHelpOverlay) tagTargetHelpOverlay.addEventListener('click', (e) => { if (e.target === tagTargetHelpOverlay) tagTargetHelpOverlay.classList.remove('modal-visible'); });

        const headerAction = view.querySelector<HTMLElement>('.sectionTitleContainer');
        if (headerAction && !view.querySelector('#cbSortTags')) {
            const savedSort = localStorage.getItem('HomeScreenCompanion_SortBy') || 'Manual';
            headerAction.style.display = 'flex';
            headerAction.style.alignItems = 'center';
            headerAction.style.justifyContent = 'space-between';
            headerAction.style.width = '100%';
            headerAction.style.marginBottom = '10px';

            const controlRowHtml = `
            <div class="control-row" style="flex-direction: row !important; align-items: center !important; flex-wrap: nowrap !important; justify-content: flex-start !important; padding: 10px 15px !important; gap: 0 !important;">

                <span class="control-label" style="opacity:0.7; margin-right: 10px; flex-shrink: 0;">Sort:</span>

                <select is="emby-select" id="cbSortTags" style="color:inherit; background:rgba(128,128,128,0.08); border:1px solid var(--line-color); padding:5px; border-radius:4px; font-size:0.9em; cursor:pointer; width: 80px; margin-right: 0px;">
                    <option value="Manual" ${savedSort === 'Manual' ? 'selected' : ''}>Manual</option>
                    <option value="Name" ${savedSort === 'Name' ? 'selected' : ''}>Name</option>
                    <option value="Active" ${savedSort === 'Active' ? 'selected' : ''}>Status</option>
                    <option value="LatestEdited" ${savedSort === 'LatestEdited' ? 'selected' : ''}>Latest</option>
                </select>

                <div style="width: 1px; height: 25px; background: var(--line-color); margin-right: 10px;"></div>

                <span class="control-label" style="opacity:0.7; margin-right: 10px; flex-shrink: 0;"> | Filters:</span>

                <div class="search-input-wrapper" style="width: 200px !important; margin-right: 10px; flex-shrink: 0;">
                    <i class="md-icon search-icon">search</i>
                    <input type="text" id="txtSearchTags" placeholder="Search..." autocomplete="off" style="padding-left: 28px !important; background: rgba(128,128,128,0.06) !important; border: 1px solid var(--line-color) !important; width: 100% !important;" />
                    <i class="md-icon" id="btnClearSearch">close</i>
                </div>

                <div class="filter-dropdown-wrapper">
                    <div class="filter-dropdown-btn" id="btnFilterDropdown">
                        <i class="md-icon" style="font-size:1.1em;">filter_list</i>
                        <span id="filterDropdownLabel">Filter</span>
                        <i class="md-icon" style="font-size:0.9em; opacity:0.6;" id="filterDropdownCaret">expand_more</i>
                    </div>
                    <div class="filter-dropdown-panel" id="filterDropdownPanel">
                        <div class="filter-dropdown-label">Features</div>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterTag" /><span>Tag</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterCollection" /><span>Collection</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterSchedule" /><span>Schedule</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterHomeScreen" /><span>Home Screen Section</span></label>
                        <div class="filter-dropdown-divider"></div>
                        <div class="filter-dropdown-label">Sources</div>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcExternal" /><span>External</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcMediaInfo" /><span>Local Media Information</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcCollection" /><span>Local Collection</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcPlaylist" /><span>Local Playlist</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcAI" /><span>AI created lists</span></label>
                        <div class="filter-dropdown-divider"></div>
                        <div class="filter-dropdown-label">Status</div>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterActive" /><span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:#52B54B;flex-shrink:0;"></span>Active</span></label>
                        <label class="filter-chk-row"><input type="checkbox" id="chkFilterInactive" /><span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:rgba(128,128,128,0.5);flex-shrink:0;"></span>Inactive</span></label>
                    </div>
                </div>

            </div>`;

            headerAction.insertAdjacentHTML('afterend', controlRowHtml);

            const txtSearch = view.querySelector<HTMLInputElement>('#txtSearchTags');
            const btnClear = view.querySelector<HTMLElement>('#btnClearSearch');

            if (txtSearch && btnClear) {
                txtSearch.addEventListener('input', () => {
                    btnClear.style.display = txtSearch.value ? 'block' : 'none';
                    deps.applyFilters(view);
                });

                btnClear.addEventListener('click', () => {
                    txtSearch.value = '';
                    btnClear.style.display = 'none';
                    txtSearch.focus();
                    deps.applyFilters(view);
                });
            }

            const cbSortTags = view.querySelector<HTMLSelectElement>('#cbSortTags');
            if (cbSortTags) {
                cbSortTags.addEventListener('change', function () {
                    localStorage.setItem('HomeScreenCompanion_SortBy', this.value);
                    const c = view.querySelector<HTMLElement>('#tagListContainer');
                    if (c) sortRows(c, this.value);
                });
            }

            ['#chkFilterTag', '#chkFilterCollection', '#chkFilterSchedule', '#chkFilterHomeScreen',
             '#chkFilterSrcExternal', '#chkFilterSrcMediaInfo', '#chkFilterSrcCollection', '#chkFilterSrcPlaylist',
             '#chkFilterSrcAI', '#chkFilterActive', '#chkFilterInactive'
            ].forEach((id) => {
                const el = view.querySelector<HTMLInputElement>(id);
                if (el) el.addEventListener('change', () => deps.applyFilters(view));
            });

            const dropBtn = view.querySelector<HTMLElement>('#btnFilterDropdown');
            const dropPanel = view.querySelector<HTMLElement>('#filterDropdownPanel');
            const dropCaret = view.querySelector<HTMLElement>('#filterDropdownCaret');

            if (dropBtn && dropPanel && dropCaret) {
                dropBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const open = dropPanel.classList.toggle('open');
                    dropCaret.textContent = open ? 'expand_less' : 'expand_more';
                });
            }
        }

        const btnAddTag = view.querySelector<HTMLElement>('#btnAddTag');
        if (btnAddTag) btnAddTag.addEventListener('click', () => {
            deps.legacyRenderTagGroup({ Tag: '', Urls: [{ url: '', limit: 0 }], Active: true }, container, true, undefined, true, null);
            deps.applyFilters(view);
        });

        const btnBackupConfig = view.querySelector<HTMLElement>('#btnBackupConfig');
        if (btnBackupConfig) btnBackupConfig.addEventListener('click', () => {
            showBackupModal(deps.backupDeps());
        });

        const fileInput = view.querySelector<HTMLInputElement>('#fileRestoreConfig');
        const btnRestoreConfigTrigger = view.querySelector<HTMLElement>('#btnRestoreConfigTrigger');
        if (btnRestoreConfigTrigger && fileInput) {
            btnRestoreConfigTrigger.addEventListener('click', () => {
                if (deps.hasDirtyState() && !confirm('You have unsaved changes. They will be discarded when a backup is restored. Continue?')) return;
                fileInput.click();
            });
            fileInput.addEventListener('change', (e) => {
                const ev = e as Event;
                const target = ev.target as HTMLInputElement | null;
                const file = target && target.files ? target.files[0] : null;
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function (readerEvt) {
                    fileInput.value = '';
                    const loadResult = readerEvt.target && typeof readerEvt.target.result === 'string' ? readerEvt.target.result : '';
                    showRestoreModal(loadResult, () => {
                        ['#hscContainer', '#hscManageContainer', '#tlContainer', '#tcManageContainer'].forEach((sel) => {
                            const el = view.querySelector<HTMLElement>(sel);
                            if (el) el.dataset.loaded = '';
                        });
                        void deps.loadConfig().then(() => {
                            deps.refreshMySavedFiltersPanels(deps.appState.savedFilters.filters);
                            const activeTab = view.querySelector<HTMLElement>('.page-tab-btn.active');
                            const target2 = activeTab ? activeTab.getAttribute('data-page-tab') : '';
                            if (target2 === 'HomeCompanion') { deps.loadHscUsers(view, deps.hscDeps()); deps.loadHscManageTabFn(view); }
                            else if (target2 === 'TopLists') deps.loadTopListsTabFn(view);
                            else if (target2 === 'Cleanup') deps.loadTagManageTabFn(view);
                        });
                    }, deps.backupDeps());
                };
                reader.readAsText(file);
            });
        }
    }

    if (!view.querySelector('.dry-run-warning')) {
        view.insertAdjacentHTML('afterbegin', '<div class="dry-run-warning"><i class="md-icon" style="font-size:1.4em;"></i>DRY RUN MODE IS ACTIVE - NO CHANGES WILL BE SAVED</div>');
    }

    const btnSave = view.querySelector<HTMLButtonElement>('.btn-save');
    if (btnSave) { btnSave.disabled = true; btnSave.style.opacity = '0.5'; }

    const api = deps.getApi();
    checkForUpdates(view, {
        fetch: (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetch(...args),
        getApiClient: () => api
            ? { getUrl: (n: string) => api.getUrl(n), accessToken: () => api.accessToken() }
            : { getUrl: () => '', accessToken: () => '' },
    });
    deps.refreshStatus(view);

    if (deps.appState.viewShow.statusInterval) clearInterval(deps.appState.viewShow.statusInterval);
    const statusInterval = setInterval(() => deps.refreshStatus(view), 5000);
    deps.appState.viewShow.statusInterval = statusInterval;

    void deps.getHseUsers({ getApiClient: () => api, cache: deps.appState.hseUserCache }).then((users) => {
        deps.appState.miUsers.users = users as HscUserLike[];
    });

    void Promise.all([
        api ? api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items', { IncludeItemTypes: 'BoxSet', Recursive: true })) : Promise.resolve({ Items: [] }),
        api ? api.getJSON(api.getUrl('Items', { IncludeItemTypes: 'Playlist', Recursive: true })) : Promise.resolve({ Items: [] }),
        api
            ? api.getJSON(api.getUrl('Items/Filters2', { UserId: api.getCurrentUserId(), Recursive: true })).catch(() => ({ Tags: [] }))
            : Promise.resolve({ Tags: [] }),
    ]).then((responses) => {
        const r0 = responses[0] as { Items?: AppState['libraryCache']['collections'] };
        const r1 = responses[1] as { Items?: AppState['libraryCache']['playlists'] };
        const r2 = responses[2] as { Tags?: string[] };
        deps.appState.libraryCache.collections = r0.Items || [];
        deps.appState.libraryCache.playlists = r1.Items || [];
        deps.appState.libraryCache.tags = ((r2 && r2.Tags) || []).slice().sort();

        void deps.loadConfig();
    });
}

/**
 * Tear down the `viewshow`-scoped listeners + interval. Mirrors
 * `modules/index.ts:1807-1816`.
 */
export function wireViewHide(deps: ViewLifecycleDeps): void {
    if (deps.appState.viewShow.formAc) {
        deps.appState.viewShow.formAc.abort();
        deps.appState.viewShow.formAc = null;
    }
    if (deps.appState.viewShow.statusInterval) {
        clearInterval(deps.appState.viewShow.statusInterval);
        deps.appState.viewShow.statusInterval = null;
    }
}

/**
 * Wire `.page-tab-btn` click handler. Mirrors
 * `modules/index.ts:1889-1918`.
 */
export function wirePageTabs(view: HTMLElement, deps: ViewLifecycleDeps): void {
    view.querySelectorAll<HTMLElement>('.page-tab-btn').forEach((btn) => {
        btn.addEventListener('click', function () {
            const target = this.getAttribute('data-page-tab');
            const wasDirty = deps.hasDirtyState();
            if (wasDirty && !confirm('You have unsaved changes. Leave this tab and discard changes?')) return;
            if (wasDirty) void deps.loadConfig();
            switchTabs(view, '.page-tab-btn', '.page-tab-content', 'tab', target || '');

            if (target === 'HomeCompanion') {
                const hscContainer = view.querySelector<HTMLElement>('#hscContainer');
                if (hscContainer && !hscContainer.dataset.loaded) {
                    deps.loadHscUsers(view, deps.hscDeps());
                }
                const manageContainer = view.querySelector<HTMLElement>('#hscManageContainer');
                if (manageContainer && !manageContainer.dataset.loaded) {
                    deps.loadHscManageTabFn(view);
                }
            } else if (target === 'Cleanup') {
                const container2 = view.querySelector<HTMLElement>('#tcManageContainer');
                if (container2 && !container2.dataset.loaded) deps.loadTagManageTabFn(view);
            } else if (target === 'TopLists') {
                const tlContainer = view.querySelector<HTMLElement>('#tlContainer');
                if (tlContainer && !tlContainer.dataset.loaded) deps.loadTopListsTabFn(view);
            }
        });
    });
}

/**
 * Wire `.hsc-sub-tab-btn` click handler. Mirrors
 * `modules/index.ts:1944-1962`.
 */
export function wireHscSubTabs(view: HTMLElement, deps: ViewLifecycleDeps): void {
    view.addEventListener('click', (e) => {
        const btn = (e.target as Element | null)?.closest<HTMLElement>('.hsc-sub-tab-btn');
        if (!btn) return;
        const target = btn.getAttribute('data-hsc-tab');
        switchTabs(view, '.hsc-sub-tab-btn', '.hsc-sub-tab-content', 'hscSubTab', target || '');
        if (target === 'copy') {
            const hscContainer = view.querySelector<HTMLElement>('#hscContainer');
            if (hscContainer && !hscContainer.dataset.loaded) deps.loadHscUsers(view, deps.hscDeps());
        } else if (target === 'manage') {
            const manageContainer = view.querySelector<HTMLElement>('#hscManageContainer');
            if (manageContainer && !manageContainer.dataset.loaded) deps.loadHscManageTabFn(view);
        }
    });
}

/**
 * Wire `.settings-panel-toggle` body expand/collapse. Mirrors
 * `modules/index.ts:1927-1942`.
 */
export function wireSettingsPanets(view: HTMLElement): void {
    view.addEventListener('click', (e) => {
        const header = (e.target as Element | null)?.closest<HTMLElement>('.settings-panel-toggle');
        if (!header) return;
        const panel = header.closest<HTMLElement>('.settings-panel');
        if (!panel) return;
        const body = panel.querySelector<HTMLElement>('.settings-panel-body');
        const chevron = header.querySelector<HTMLElement>('.settings-panel-chevron');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    });
}
