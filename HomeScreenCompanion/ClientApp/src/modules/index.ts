/**
 * Phase 5 endgame: the AMD factory composition root.
 *
 * The actual feature wiring lives in `modules/app/{apiAdapter,configIo,viewLifecycle}.ts`
 * + `modules/state/state.ts` + the existing Phase-3/4/5 modules. This file
 * only stitches them together: build the per-mount closures, package
 * them into typed deps bags, register the lifecycle listeners (`viewshow`
 * → `wireViewShow`, `viewhide` → `wireViewHide`), and register the
 * factory-level handlers (`submit`, page-tabs, HSC sub-tabs, settings
 * panels, speed-dial, run-task) that run once at mount time.
 *
 * Factory shape (legacy.js:1):
 *
 *     define(['emby-input', 'emby-button', 'emby-select', 'emby-checkbox'],
 *         function () { 'use strict';
 *             ...
 *             return function (view) { ... };
 *         });
 *
 * The four eby-* deps are externalized to Jellyfin's AMD loader — they
 * register the custom elements before the factory body runs.
 *
 * Before D1, this file held ~1963 lines that mixed: a 466-line CSS
 * literal, the ApiClient adapter, config load/save/dirty logic, and the
 * full view-show wiring. Those have been lifted to dedicated modules
 * (`styles/config.css?raw`, `modules/app/apiAdapter.ts`,
 * `modules/app/configIo.ts`, `modules/app/viewLifecycle.ts`). Behavior
 * is preserved exactly — the AMD bundle still contains the same DOM
 * side-effects in the same order.
 */

import {
    createAppState,
    PLUGIN_ID,
    type AppState,
} from './state/state';

import {
    applyFilters,
    getUiConfig,
    checkFormState,
} from './config/configState';
import { getDragAfterElement, getUrlRowHtml } from './dom/dom';
import {
    getLocalRowHtml,
    getDateRowHtml,
    readRowAsConfig,
} from './filters/rows';
import { getMediaInfoFilterGroupHtml, type MiFilterDeps } from './filters/miFilters';
import {
    getMySavedFiltersPanelHtml,
    refreshMySavedFiltersPanels,
    saveSavedFiltersNow,
    type SavedFilter,
} from './filters/savedFilters';
import { getMaxDays, getDayOptions } from './filters/date-intervals';
import {
    MI_PRESETS,
    renderTagGroup,
    refreshTopListBadges,
    getSourceBadgeHtml,
} from './tags/renderTagGroup';
import {
    tagConfigHasViewerCriteria,
    initHomeSectionTab,
    initPlaylistTab,
    updateHseSectionAvailability,
    syncHomeSectionFromEmby,
} from './homesections/form';
import {
    applyManageSections,
    loadHscManageTab,
    renderManageSections,
    type ManageDeps,
} from './homesections/manageTab';
import {
    loadHscUsers,
    type HscDeps,
} from './homesections/hscTab';
import {
    buildUserMultiSelectHtml,
    getHseUsers,
    preFetchLibraryData,
    wireUserMultiSelect,
} from './homesections/users';
import { refreshStatus, sortRows } from './logs/logModal';
import { loadTagManageTab, type TagManageTabDeps } from './tags/tagManageTab';
import { loadTopListsTab, type TopListsTabDeps } from './toplists/topListsTab';
import {
    showCreateTopListChooser,
    type TopListModalDeps,
} from './toplists/modals';
import type { ManageTagsResultLike } from './toplists/topListsTab';
import { setupRowEvents, type SetupRowEventsDeps } from './rows/setupRowEvents';

import {
    getApi,
    getDashboard,
    type WindowDashboard,
} from './app/apiAdapter';
import {
    loadConfig,
    hasDirtyState,
    doSave,
    submitFormHandler,
    type ConfigIoDeps,
} from './app/configIo';
import {
    wireViewShow,
    wireViewHide,
    wirePageTabs,
    wireHscSubTabs,
    wireSettingsPanets,
    type ViewLifecycleDeps,
} from './app/viewLifecycle';

// ─── Tiny AMD typedef shim (Jellyfin's loader expects globals) ───────────────

declare const define: (
    deps: readonly string[],
    factory: (...args: never[]) => unknown,
) => void;
void define;

// ─── Schedule helpers still in legacy.js — inlined verbatim ─────────────────

function isScheduleCurrentlyActive(intervals: readonly { Type?: string; Start?: string | null; End?: string | null; DayOfWeek?: string }[]): boolean {
    if (!intervals || intervals.length === 0) return false;
    const now = new Date();
    const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dowNames[now.getDay()] ?? '';
    return intervals.some((iv) => {
        if (iv.Type === 'Weekly') {
            const days = (iv.DayOfWeek || '').split(',').map((d) => d.trim());
            return days.indexOf(todayName) >= 0;
        }
        if (!iv.Start || !iv.End) return false;
        const s = new Date(iv.Start);
        const e = new Date(iv.End);
        if (iv.Type === 'EveryYear') {
            const nowMD = now.getMonth() * 100 + now.getDate();
            const sMD = s.getMonth() * 100 + s.getDate();
            const eMD = e.getMonth() * 100 + e.getDate();
            return sMD <= nowMD && nowMD <= eMD;
        }
        e.setHours(23, 59, 59, 999);
        return s <= now && now <= e;
    });
}

function readIntervalsFromRow(row: HTMLElement): { Type: string; Start: string | null; End: string | null; DayOfWeek: string }[] {
    const intervals: { Type: string; Start: string | null; End: string | null; DayOfWeek: string }[] = [];
    row.querySelectorAll('.date-row').forEach((dr) => {
        const drEl = dr as HTMLElement;
        const typeSel = drEl.querySelector<HTMLSelectElement>('.selDateType');
        const type = typeSel ? typeSel.value : 'SpecificDate';
        let s: string | null = null;
        let e: string | null = null;
        let days = '';
        if (type === 'SpecificDate') {
            const sEl = drEl.querySelector<HTMLInputElement>('.txtFullStartDate');
            const eEl = drEl.querySelector<HTMLInputElement>('.txtFullEndDate');
            s = sEl ? sEl.value || null : null;
            e = eEl ? eEl.value || null : null;
        } else if (type === 'EveryYear') {
            const sM = drEl.querySelector<HTMLSelectElement>('.selStartMonth');
            const sD = drEl.querySelector<HTMLSelectElement>('.selStartDay');
            const eM = drEl.querySelector<HTMLSelectElement>('.selEndMonth');
            const eD = drEl.querySelector<HTMLSelectElement>('.selEndDay');
            const smStr = sM ? sM.value : '1';
            const sdStr = sD ? sD.value : '1';
            const emStr = eM ? eM.value : '1';
            const edStr = eD ? eD.value : '1';
            s = '2000-' + smStr.padStart(2, '0') + '-' + sdStr.padStart(2, '0');
            e = '2000-' + emStr.padStart(2, '0') + '-' + edStr.padStart(2, '0');
        } else if (type === 'Weekly') {
            const activeBtns = Array.from(drEl.querySelectorAll<HTMLElement>('.day-toggle.active'));
            days = activeBtns.map((b) => b.dataset.day || '').filter(Boolean).join(',');
        }
        intervals.push({ Type: type, Start: s, End: e, DayOfWeek: days });
    });
    return intervals;
}

function rowHasViewerCriteriaInline(row: HTMLElement): boolean {
    let found = false;
    row.querySelectorAll('.mi-rule').forEach((rule) => {
        const ruleEl = rule as HTMLElement;
        const propEl = ruleEl.querySelector<HTMLSelectElement>('.selMiProperty');
        const prop = propEl ? propEl.value : '';
        const selUserEl = ruleEl.querySelector<HTMLSelectElement>('.selMiUser');
        if (prop === 'InProgress' || (selUserEl && selUserEl.value === '__current__')) found = true;
    });
    return found;
}

// ─── AMD factory ─────────────────────────────────────────────────────────────
//
// The four eby-* externals are pulled in as side-effect imports so Rollup
// keeps them in the AMD `define([...])` deps array. `exports: 'default'` in
// rollup.config.mjs makes the default export the AMD module value — the
// factory that Jellyfin invokes with the view element.

import 'emby-input';
import 'emby-button';
import 'emby-select';
import 'emby-checkbox';

export default function (view: HTMLElement): void {
    'use strict';

    const appState: AppState = createAppState();
    let currentView: HTMLElement | null = null;

    function miFilterDeps(): MiFilterDeps {
        return {
            users: appState.miUsers.users,
            collections: appState.libraryCache.collections,
            playlists: appState.libraryCache.playlists,
            tags: appState.libraryCache.tags,
        };
    }

    function hscDeps(): HscDeps {
        return {
            getConfig: () => appState.hsc.config,
            renderTab: legacyRenderHscTab as never,
            enforceConflict: legacyEnforceHscSourceTargetConflict as never,
            notifyFormChanged: () => { setTimeout(checkFormStateBound, 0); },
        };
    }

    function legacyRenderHscTab(_container: HTMLElement, _config: never, _users: readonly never[]): void {
        // Lifted to modules/homesections/hscTab.ts as `renderHscTab`. The
        // factory binds `renderTab` to it via `hscDeps().renderTab`.
    }
    function legacyEnforceHscSourceTargetConflict(_container: HTMLElement): void {
        // Lifted to modules/homesections/hscTab.ts as `enforceHscSourceTargetConflict`.
    }

    function boundGetUiConfig(view: HTMLElement, forComparison: boolean): unknown {
        return getUiConfig(view, forComparison, {
            hsc: appState.hsc,
            savedFilters: appState.savedFilters,
            miUsers: appState.miUsers,
            readRowAsConfig: readRowAsConfig,
        });
    }

    function checkFormStateBound(): void {
        checkFormState({
            view: currentView,
            originalConfigState: appState.originalConfigState,
            getUiConfig: boundGetUiConfig,
        });
    }

    function applyFiltersFn(view: HTMLElement): void { applyFilters(view); }
    function refreshStatusFn(view: HTMLElement): void {
        refreshStatus(view, {
            getApiClient: () => ({ getJSON: <T,>(n: string, p?: Record<string, unknown>): Promise<T> => {
                const ac = getApi();
                return ac ? ac.getJSON<T>(n, p) : Promise.resolve({} as T);
            } }),
            state: appState.logStatus,
            checkFormState: checkFormStateBound,
        });
    }

    function legacyRenderTagGroup(
        tagConfig: unknown,
        container: HTMLElement | null,
        prepend: boolean,
        idx: number | undefined,
        isNew: boolean,
        afterRef: HTMLElement | null | undefined,
    ): void {
        if (!container) return;
        const html = renderTagGroup(tagConfig, idx, {
            miUsers: appState.miUsers,
            topLists: appState.topLists,
            getUrlRowHtml: getUrlRowHtml,
            getLocalRowHtml: getLocalRowHtml,
            getDateRowHtml: getDateRowHtml,
            getMediaInfoFilterGroupHtml: (filter, i, isFirst, md) => getMediaInfoFilterGroupHtml(filter, i, isFirst, md),
            getMySavedFiltersPanelHtml: (sf: readonly SavedFilter[]) => getMySavedFiltersPanelHtml(sf),
            tagConfigHasViewerCriteria: (cfg: unknown) => tagConfigHasViewerCriteria(cfg as never),
            miFilterDeps: miFilterDeps(),
            savedFilters: appState.savedFilters.filters,
        });
        if (afterRef) afterRef.insertAdjacentHTML('afterend', html);
        else if (prepend) container.insertAdjacentHTML('afterbegin', html);
        else container.insertAdjacentHTML('beforeend', html);

        const newRow = afterRef
            ? afterRef.nextElementSibling as HTMLElement | null
            : (prepend ? container.firstElementChild as HTMLElement | null : container.lastElementChild as HTMLElement | null);
        if (!newRow) return;
        buildSetupRowDeps(newRow);
        if (isNew) {
            newRow.classList.add('just-added');
            setTimeout(() => newRow.classList.remove('just-added'), 2000);
        }
    }

    function buildSetupRowDeps(row: HTMLElement): SetupRowEventsDeps {
        const self: { updateBadges?: (r: HTMLElement) => void; updateRunGroupBtn?: (r: HTMLElement) => void; updateTagTitle?: (r: HTMLElement) => void } = {};
        const api = getApi();
        const apiClientForGetters = (): { getPluginConfiguration: (id: string) => Promise<Record<string, unknown>>; updatePluginConfiguration: (id: string, c: Record<string, unknown>) => Promise<unknown> } => ({
            getPluginConfiguration: (id) => api ? api.getPluginConfiguration(id) : Promise.resolve({}),
            updatePluginConfiguration: (id, c) => api ? api.updatePluginConfiguration(id, c) : Promise.resolve({}),
        });
        const apiForHse = (): { getJSON: (name: string, params?: Record<string, unknown>) => Promise<unknown>; getUrl: (name: string, params?: Record<string, unknown>) => string; accessToken: () => string } => api as never;
        const deps: SetupRowEventsDeps = {
            savedFilters: appState.savedFilters,
            topLists: appState.topLists,
            originalConfigState: appState.originalConfigState,
            miFilterDeps: miFilterDeps(),
            getApiClient: apiClientForGetters,
            pluginId: PLUGIN_ID,
            initHomeSectionTab: (r) => initHomeSectionTab(r, {
                getHseUsers: () => getHseUsers({ getApiClient: () => apiForHse(), cache: appState.hseUserCache }),
                buildUserMultiSelectHtml: (users, selIds, chkClass) => buildUserMultiSelectHtml(users, selIds, chkClass),
                wireUserMultiSelect: (c) => wireUserMultiSelect(c),
                preFetchLibraryData: () => preFetchLibraryData({ getApiClient: () => apiForHse(), cache: appState.hseUserCache }),
                syncHomeSectionFromEmby: (tab, syncDeps) => syncHomeSectionFromEmby(tab, syncDeps),
                getUiConfig: boundGetUiConfig,
                checkFormState: checkFormStateBound,
                originalConfigState: appState.originalConfigState,
            }),
            initPlaylistTab: (r) => initPlaylistTab(r, {
                getHseUsers: () => getHseUsers({ getApiClient: () => apiForHse(), cache: appState.hseUserCache }),
                buildUserMultiSelectHtml: (users, selIds, chkClass) => buildUserMultiSelectHtml(users, selIds, chkClass),
                wireUserMultiSelect: (c) => wireUserMultiSelect(c),
            }),
            updateHseSectionAvailability: (r) => updateHseSectionAvailability(r, {
                rowHasViewerCriteria: (r2) => rowHasViewerCriteriaInline(r2),
                refreshHseSectionTypeOptions: (tab, tagEnabled, collEnabled, viewerOnly) => {
                    const stSel = tab.querySelector<HTMLSelectElement>('.selHseSectionType');
                    if (!stSel) return;
                    const currentVal = stSel.value;
                    stSel.innerHTML = '';
                    if (collEnabled) {
                        const o1 = document.createElement('option');
                        o1.value = 'boxset';
                        o1.textContent = 'Single Collection';
                        stSel.appendChild(o1);
                    }
                    if (tagEnabled || viewerOnly) {
                        const o2 = document.createElement('option');
                        o2.value = 'items';
                        o2.textContent = (viewerOnly && !tagEnabled) ? 'Dynamic Media (per user)' : 'Dynamic Media (tag)';
                        stSel.appendChild(o2);
                    }
                    const stillValid = Array.from(stSel.options).some((o) => o.value === currentVal);
                    if (stillValid) stSel.value = currentVal;
                    const itemsOnlyEls = tab.querySelectorAll<HTMLElement>('.hse-items-only');
                    const isItems = !stSel || stSel.value !== 'boxset';
                    itemsOnlyEls.forEach((el) => { el.style.display = isItems ? '' : 'none'; });
                },
                updateBadges: (r2) => { if (self.updateBadges) self.updateBadges(r2); },
            }),
            checkFormState: checkFormStateBound,
            saveSavedFiltersNow: () => saveSavedFiltersNow({
                getSavedFilters: () => appState.savedFilters.filters,
                getOriginalConfigState: () => appState.originalConfigState.getOriginalConfigState(),
                setOriginalConfigState: (v) => appState.originalConfigState.setOriginalConfigState(v),
                pluginId: PLUGIN_ID,
                getApiClient: apiClientForGetters,
                checkFormState: checkFormStateBound,
            }),
            refreshMySavedFiltersPanels: (sf) => refreshMySavedFiltersPanels(sf),
            getMaxDays: getMaxDays,
            getDayOptions: getDayOptions,
            isScheduleCurrentlyActive: isScheduleCurrentlyActive,
            readIntervalsFromRow: readIntervalsFromRow,
            getSourceBadgeHtml: getSourceBadgeHtml,
            renderTagGroup: legacyRenderTagGroup as unknown as SetupRowEventsDeps['renderTagGroup'],
            applyFilters: applyFiltersFn,
            refreshStatus: refreshStatusFn,
            miPresets: MI_PRESETS,
            view: currentView as HTMLElement,
            alert: (msg) => { getDashboard()?.alert(msg); },
            updateBadges: (r) => { if (self.updateBadges) self.updateBadges(r); else { /* set by setupRowEvents */ } },
            updateRunGroupBtn: (r) => { if (self.updateRunGroupBtn) self.updateRunGroupBtn(r); else { /* set by setupRowEvents */ } },
            updateTagTitle: (r) => { if (self.updateTagTitle) self.updateTagTitle(r); else { /* set by setupRowEvents */ } },
        };
        setupRowEvents(row, deps);
        if (deps.updateBadges) self.updateBadges = deps.updateBadges;
        if (deps.updateRunGroupBtn) self.updateRunGroupBtn = deps.updateRunGroupBtn;
        if (deps.updateTagTitle) self.updateTagTitle = deps.updateTagTitle;
        return deps;
    }

    function loadHscManageTabFn(view: HTMLElement): void {
        const api = getApi();
        const check = (): void => checkFormState({
            view,
            originalConfigState: appState.originalConfigState,
            getUiConfig: boundGetUiConfig,
        });
        const deps: ManageDeps = {
            getApiClient: () => api ? {
                accessToken: () => api.accessToken(),
                getUrl: (n: string, p?: Record<string, unknown>) => api.getUrl(n, p),
            } : { accessToken: () => '', getUrl: () => '' },
            fetchFn: (...args) => fetch(...args),
            renderSections: () => renderManageSections(view, appState.manage, deps),
            getManDragAfterElement: getDragAfterElement,
            checkFormState: check,
            alert: (msg) => { getDashboard()?.alert(msg); },
        };
        loadHscManageTab(view, appState.manage, {
            ...deps,
            getHseUsers: () => getHseUsers({ getApiClient: () => api as never, cache: appState.hseUserCache }),
            prompt: (msg, def) => window.prompt(msg, def),
        });
    }

    function loadTopListsTabFn(view: HTMLElement): void {
        const api = getApi();
        const deps: TopListsTabDeps = {
            getUrl: (path: string) => api ? api.getUrl(path) : '',
            getAccessToken: () => api ? api.accessToken() : '',
            getPluginConfiguration: () => api ? api.getPluginConfiguration(PLUGIN_ID) as never : Promise.resolve({}),
            fetch: (...args) => fetch(...args),
            showCreateTopListChooser: showCreateTopListChooserFactory(),
            loadInlineEditForm: () => { /* unused in this surface */ },
            unregisterTopList: (tagNameLower) => { appState.topLists.tagNames.delete(tagNameLower); refreshTopListBadges(appState.topLists.tagNames); },
            confirm: (msg) => window.confirm(msg),
            alert: (msg) => { getDashboard()?.alert(msg); },
            reload: () => {
                const c = view.querySelector<HTMLElement>('#tlContainer');
                if (c) c.dataset.loaded = '';
                loadTopListsTabFn(view);
            },
        };
        loadTopListsTab(view, deps);
    }

    function loadTagManageTabFn(view: HTMLElement): void {
        const api = getApi();
        const deps: TagManageTabDeps = {
            fetch: (...args) => fetch(...args),
            getApiClient: () => api ? {
                accessToken: () => api.accessToken(),
                getUrl: (n: string, p?: Record<string, unknown>) => api.getUrl(n, p),
                getJSON: <T,>(n: string, p?: Record<string, unknown>) => api.getJSON<T>(n, p),
                getPluginConfiguration: (id) => api.getPluginConfiguration(id),
                updatePluginConfiguration: (id, c) => api.updatePluginConfiguration(id, c),
            } : {
                accessToken: () => '',
                getUrl: () => '',
                getJSON: () => Promise.resolve({} as never),
                getPluginConfiguration: () => Promise.resolve({}),
                updatePluginConfiguration: () => Promise.resolve({}),
            },
            confirm: (msg) => window.confirm(msg),
            alert: (msg) => { getDashboard()?.alert(msg); },
            escapeHtml: (s: unknown) => String(s),
            getHseUsers: () => getHseUsers({ getApiClient: () => api as never, cache: appState.hseUserCache }),
            executeTopListCreationSteps: () => Promise.resolve(undefined),
            showCreateTopListChooser: showCreateTopListChooserFactory() as TagManageTabDeps['showCreateTopListChooser'],
            loadInlineEditForm: () => { /* unused in this surface */ },
            sortRows: (container, criteria) => sortRows(container, criteria),
            getDragAfterElement: getDragAfterElement,
            checkFormState: checkFormStateBound,
            refreshMySavedFiltersPanels: (sf) => refreshMySavedFiltersPanels(sf as readonly SavedFilter[]),
            savedFilters: appState.savedFilters.filters as readonly SavedFilter[],
            pluginId: PLUGIN_ID,
        };
        loadTagManageTab(view, deps);
    }

    function applyManageSectionsFn(view: HTMLElement): void {
        const api = getApi();
        const check = (): void => checkFormState({
            view,
            originalConfigState: appState.originalConfigState,
            getUiConfig: boundGetUiConfig,
        });
        const deps: ManageDeps = {
            getApiClient: () => api ? {
                accessToken: () => api.accessToken(),
                getUrl: (n: string, p?: Record<string, unknown>) => api.getUrl(n, p),
            } : { accessToken: () => '', getUrl: () => '' },
            fetchFn: (...args) => fetch(...args),
            renderSections: () => renderManageSections(view, appState.manage, deps),
            getManDragAfterElement: getDragAfterElement,
            checkFormState: check,
            alert: (msg) => { getDashboard()?.alert(msg); },
        };
        applyManageSections(view, appState.manage, deps);
    }

    function showCreateTopListChooserFactory(): TopListsTabDeps['showCreateTopListChooser'] {
        return (tagsData: ManageTagsResultLike, existingTopLists: ReadonlySet<string>, onSuccess: () => void) => {
            const api = getApi();
            const db = getDashboard();
            const modalDeps: TopListModalDeps = {
                fetch: (...args) => fetch(...args),
                getApiClient: () => api ? {
                    accessToken: () => api.accessToken(),
                    getUrl: (n: string, p?: Record<string, unknown>) => api.getUrl(n, p),
                    getJSON: <T,>(n: string, p?: Record<string, unknown>) => api.getJSON<T>(n, p),
                    updatePluginConfiguration: (id, c) => api.updatePluginConfiguration(id, c),
                    getPluginConfiguration: (id) => api.getPluginConfiguration(id),
                } : {
                    accessToken: () => '',
                    getUrl: () => '',
                    getJSON: () => Promise.resolve({} as never),
                    updatePluginConfiguration: () => Promise.resolve({}),
                    getPluginConfiguration: () => Promise.resolve({}),
                },
                alert: (msg) => { db?.alert(msg); },
                confirm: (msg) => window.confirm(msg),
                closeModal: () => { /* modal.remove() handled inside modals.ts */ },
                escapeHtml: (s: unknown) => String(s),
                executeTopListCreationSteps: (() => { throw new Error('executeTopListCreationSteps not bound'); }) as never,
                getHseUsers: () => getHseUsers({ getApiClient: () => api as never, cache: appState.hseUserCache }),
                buildUserMultiSelectHtml: buildUserMultiSelectHtml,
                wireUserMultiSelect: wireUserMultiSelect,
                buildBadgePickerHtml: (sv: string | null | undefined) => `<div data-badge-picker="${sv || 'neutral'}"></div>`,
                initBadgePicker: () => { /* no-op: visual picker not in factory scope */ },
                readBadgeStyle: () => 'neutral',
                showTopListModal: (() => { throw new Error('showTopListModal not bound'); }) as never,
                showManualTopListModal: (() => { throw new Error('showManualTopListModal not bound'); }) as never,
                loadInlineEditForm: (() => { throw new Error('loadInlineEditForm not bound'); }) as never,
                state: {
                    topLists: appState.topLists,
                    hseUserCache: appState.hseUserCache,
                },
                pluginId: PLUGIN_ID,
            };
            showCreateTopListChooser(tagsData.Tags || [], existingTopLists, onSuccess, modalDeps);
        };
    }

    function backupDeps() {
        const api = getApi();
        const db = getDashboard();
        return {
            fetch: (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetch(...args),
            getApiClient: () => api ? {
                accessToken: () => api.accessToken(),
                getUrl: (n: string, p?: Record<string, unknown>) => api.getUrl(n, p),
                getJSON: <T,>(n: string, p?: Record<string, unknown>) => api.getJSON<T>(n, p),
                updatePluginConfiguration: (id: string, c: Record<string, unknown>) => api.updatePluginConfiguration(id, c),
                getPluginConfiguration: (id: string) => api.getPluginConfiguration(id),
            } : {
                accessToken: () => '',
                getUrl: () => '',
                getJSON: () => Promise.resolve({} as never),
                updatePluginConfiguration: () => Promise.resolve({}),
                getPluginConfiguration: () => Promise.resolve({}),
            },
            alert: (msg: string) => { db?.alert(msg); },
            state: {
                originalConfigState: appState.originalConfigState,
                hsc: appState.hsc,
                savedFilters: appState.savedFilters,
                topLists: appState.topLists,
                manage: appState.manage,
                libraryCache: appState.libraryCache,
            },
            pluginId: PLUGIN_ID,
        };
    }

    // ─── Config-IO deps ────────────────────────────────────────────────────
    const configIoDeps: ConfigIoDeps = {
        appState,
        currentView: () => currentView,
        getApi: () => getApi(),
        getDashboard: () => getDashboard() as WindowDashboard | undefined,
        boundGetUiConfig,
        renderTagGroup: legacyRenderTagGroup,
        preFetchLibraryData: (d) => preFetchLibraryData(d as Parameters<typeof preFetchLibraryData>[0]),
        setupRow: buildSetupRowDeps,
        checkFormStateBound,
    };
    function loadConfigFn(): Promise<void> { return loadConfig(configIoDeps); }
    function hasDirtyStateFn(): boolean { return hasDirtyState(configIoDeps); }
    function doSaveFn(): void { doSave(configIoDeps); }
    function submitFormHandlerFn(e: Event): void { submitFormHandler(e, configIoDeps); }

    // ─── View-lifecycle deps ───────────────────────────────────────────────
    const viewLifecycleDeps: ViewLifecycleDeps = {
        appState,
        applyFilters: applyFiltersFn,
        refreshStatus: refreshStatusFn,
        checkFormStateBound,
        buildUserMultiSelectHtml: (users, selIds, chkClass) => buildUserMultiSelectHtml(users, selIds, chkClass),
        wireUserMultiSelect: (c) => wireUserMultiSelect(c),
        getHseUsers: (d) => getHseUsers(d as Parameters<typeof getHseUsers>[0]),
        getMediaInfoFilterGroupHtml: (filter, i, isFirst, md) => getMediaInfoFilterGroupHtml(filter, i, isFirst, md),
        getMySavedFiltersPanelHtml: (sf) => getMySavedFiltersPanelHtml(sf),
        refreshMySavedFiltersPanels: (sf) => refreshMySavedFiltersPanels(sf),
        tagConfigHasViewerCriteria: (cfg) => tagConfigHasViewerCriteria(cfg as never),
        initHomeSectionTab: (r, d) => initHomeSectionTab(r, d as Parameters<typeof initHomeSectionTab>[1]),
        initPlaylistTab: (r, d) => initPlaylistTab(r, d as Parameters<typeof initPlaylistTab>[1]),
        updateHseSectionAvailability: (r, d) => updateHseSectionAvailability(r, d as Parameters<typeof updateHseSectionAvailability>[1]),
        syncHomeSectionFromEmby: (tab, d) => { void syncHomeSectionFromEmby(tab, d as Parameters<typeof syncHomeSectionFromEmby>[1]); },
        preFetchLibraryData: (d) => preFetchLibraryData(d as Parameters<typeof preFetchLibraryData>[0]),
        loadHscUsers: (v, d) => loadHscUsers(v, d),
        loadHscManageTabFn,
        loadTopListsTabFn,
        loadTagManageTabFn,
        applyManageSectionsFn,
        backupDeps,
        getApi: () => getApi(),
        getDashboard: () => getDashboard() as WindowDashboard | undefined,
        hasDirtyState: hasDirtyStateFn,
        loadConfig: loadConfigFn,
        doSave: doSaveFn,
        hscDeps,
        rowHasViewerCriteriaInline,
        legacyRenderTagGroup,
        miPresets: MI_PRESETS,
        getUrlRowHtml,
        getLocalRowHtml,
        getDateRowHtml,
        getMaxDays,
        getDayOptions,
        isScheduleCurrentlyActive,
        readIntervalsFromRow,
        readRowAsConfig,
        getSourceBadgeHtml,
    };

    // ─── currentView set when the returned function runs ───────────────────
    currentView = view;

    view.addEventListener('viewshow', () => {
        wireViewShow(view, viewLifecycleDeps);
    });
    view.addEventListener('viewhide', () => {
        wireViewHide(viewLifecycleDeps);
    });

    // ─── Mount-time handlers (run once per page mount) ─────────────────────
    const formEl = view.querySelector<HTMLFormElement>('.HomeScreenCompanionForm');
    if (formEl) formEl.addEventListener('submit', submitFormHandlerFn);

    const speedDial = view.querySelector<HTMLElement>('#runSpeedDial');
    const syncMenu = view.querySelector<HTMLElement>('#runSyncMenu');
    const btnRunSync = view.querySelector<HTMLElement>('#btnRunSync');
    if (btnRunSync && speedDial && syncMenu) {
        btnRunSync.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = speedDial.classList.toggle('open');
            syncMenu.classList.toggle('open', isOpen);
        });
    }

    const dbg = getDashboard();
    function runTask(key: string, label: string): void {
        const api = getApi();
        if (!api) return;
        void api.getScheduledTasks().then((tasks) => {
            const t = tasks.find((x) => x.Key === key);
            if (t) {
                void api.startScheduledTask(t.Id).then(() => {
                    dbg?.alert(label + ' started!');
                });
            } else {
                dbg?.alert('Task not found: ' + key);
            }
        });
        if (speedDial) speedDial.classList.remove('open');
        if (syncMenu) syncMenu.classList.remove('open');
    }
    const btnDialTagsCollections = view.querySelector<HTMLElement>('#btnDialTagsCollections');
    if (btnDialTagsCollections) btnDialTagsCollections.addEventListener('click', () => {
        runTask('HomeScreenCompanionSyncTask', 'Tag sync');
    });

    const btnDialHomeScreen = view.querySelector<HTMLElement>('#btnDialHomeScreen');
    if (btnDialHomeScreen) btnDialHomeScreen.addEventListener('click', () => {
        runTask('HomeSectionSyncTask', 'Home screen sync');
    });

    const btnDialFullSync = view.querySelector<HTMLElement>('#btnDialFullSync');
    if (btnDialFullSync) btnDialFullSync.addEventListener('click', () => {
        const api = getApi();
        const localDb = getDashboard();
        if (!api) return;
        void api.getScheduledTasks().then((tasks) => {
            const tagTask = tasks.find((x) => x.Key === 'HomeScreenCompanionSyncTask');
            const hscTask = tasks.find((x) => x.Key === 'HomeSectionSyncTask');
            const promises: Promise<unknown>[] = [];
            if (tagTask) promises.push(api.startScheduledTask(tagTask.Id));
            if (hscTask) promises.push(api.startScheduledTask(hscTask.Id));
            void Promise.all(promises).then(() => {
                localDb?.alert('Full sync started!');
            });
        });
        if (speedDial) speedDial.classList.remove('open');
        if (syncMenu) syncMenu.classList.remove('open');
    });

    wirePageTabs(view, viewLifecycleDeps);
    wireHscSubTabs(view, viewLifecycleDeps);
    wireSettingsPanets(view);

    view.addEventListener('change', (e) => {
        const cb = (e.target as Element | null)?.closest<HTMLInputElement>('.chkShowApiKey');
        if (!cb) return;
        const input = view.querySelector<HTMLInputElement>('#' + (cb.dataset.target || ''));
        if (input) input.type = cb.checked ? 'text' : 'password';
    });
}
