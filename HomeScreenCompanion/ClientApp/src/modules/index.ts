/**
 * Phase 5 endgame: the top-level AMD factory for the legacy config page.
 *
 * Wires every Phase-5 module into the AMD `define([...], function () { ... })`
 * shape that `Configuration/configPage.js` ships with. This factory is the
 * only place where the per-mount state holders (from `state.ts`) come
 * together with the per-feature extracted helpers.
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
 * register the custom elements before the factory body runs. No DI is
 * needed because each helper module reads its own window globals
 * (`ApiClient`, `Dashboard`, `fetch`).
 *
 * This file does NOT modify `Configuration/configPage.js` or `legacy.js`.
 * The byte-equal bridge (`scripts/build-bridge.mjs`) is unaffected until
 * Phase 6 retires `legacy.js` entirely.
 */

// ─── Phase 5 module imports ──────────────────────────────────────────────────

import {
    createAppState,
    DEFAULT_AI_SYSTEM_PROMPT,
    PLUGIN_ID,
    type AppState,
} from './state/state';

import {
    applyFilters,
    getUiConfig,
    checkFormState,
    checkForUpdates,
    groupConfigTags,
    updateDryRunWarning,
} from './config/configState';
import { applyPluginTheme } from './theme/theme';
import { updateSystemPromptResetBtn } from './systemPrompt/updateSystemPromptResetBtn';
import {
    escapeHtml,
    getDragAfterElement,
    getUrlRowHtml,
    getManDragAfterElement,
} from './dom/dom';
import {
    getLocalRowHtml,
    getDateRowHtml,
} from './filters/rows';
import { getMediaInfoFilterGroupHtml, type MiFilterDeps } from './filters/miFilters';
import {
    getMySavedFiltersPanelHtml,
    refreshMySavedFiltersPanels,
    saveSavedFiltersNow,
    type SavedFilter,
} from './filters/savedFilters';
import { getMaxDays, getDayOptions } from './filters/date-intervals';
import { readRowAsConfig, type ScheduleInterval } from './filters/rows';
import {
    MI_PRESETS,
    renderTagGroup,
    refreshTopListBadges,
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
import { loadHscUsers, type HscDeps, type HscUserLike } from './homesections/hscTab';
import {
    buildUserMultiSelectHtml,
    getHseUsers,
    preFetchLibraryData,
    wireUserMultiSelect,
} from './homesections/users';
import { renderLogModal, refreshStatus, sortRows } from './logs/logModal';
import { showBackupModal, showRestoreModal } from './backup/backupRestore';
import { loadTagManageTab, type TagManageTabDeps } from './tags/tagManageTab';
import { loadTopListsTab, type TopListsTabDeps } from './toplists/topListsTab';
import {
    showCreateTopListChooser,
    type TopListModalDeps,
} from './toplists/modals';
import type { ManageTagsResultLike } from './toplists/topListsTab';
import { setupRowEvents, type SetupRowEventsDeps } from './rows/setupRowEvents';

// ─── Custom CSS (Phase 6 will extract theme.css) ─────────────────────────────

const customCss = `
    <style id="homeScreenCompanionCustomCss">
        .day-toggle {
            background: rgba(128,128,128,0.08);
            color: var(--theme-text-secondary);
            border: 1px solid var(--line-color);
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 0.9em;
            transition: all 0.2s;
            text-transform: uppercase;
            font-weight: bold;
            flex-grow: 1;
            text-align: center;
        }
        .day-toggle:hover {
            background: var(--theme-background-level2);
            color: var(--theme-text-primary);
            border-color: var(--theme-primary-color);
        }
        .day-toggle.active {
            background: #52B54B;
            color: #fff;
            border-color: #52B54B;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }

        .date-row-container {
            background: rgba(128,128,128,0.06);
            border: 1px solid var(--line-color);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 10px;
        }

        .selectLabel {
            font-size: 0.9em;
            color: var(--theme-text-secondary);
            margin-bottom: 5px;
            font-weight: 500;
            display: block;
        }

        .tag-indicator {
            margin-left: 10px;
            font-size: 0.75em;
            padding: 2px 8px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-weight: 500;
            position: relative;
        }

        .tag-indicator.schedule {
            color: #00a4dc;
            background: rgba(0,164,220,0.15);
            border: 1px solid rgba(0,164,220,0.35);
        }

        .tag-indicator.collection {
            color: #8459ca;
            background: rgba(126, 77, 172, 0.15);
            border: 1px solid rgba(126, 77, 172, 0.35);
        }

        .tag-indicator.homescreen {
            color: #4CAF50;
            background: rgba(76,175,80,0.15);
            border: 1px solid rgba(76,175,80,0.35);
        }

        .tag-indicator.schedule::after {
            content: '';
            position: absolute;
            top: -3px;
            right: -3px;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #f59e0b;
            box-shadow: 0 0 0 1.5px var(--theme-background, #101010);
        }

        .tag-indicator.schedule.schedule-active::after {
            background: #52B54B;
        }

        .tag-indicator.tag {
            color: #909090;
            background: rgba(80,80,80,0.18);
            border: 1px solid rgba(80,80,80,0.35);
        }

        .tag-indicator.playlist {
            color: #2db396;
            background: rgba(45, 184, 154, 0.15);
            border: 1px solid rgba(43, 190, 154, 0.35);
        }

        .tag-indicator.toplist {
            color: #c9a84c;
            background: rgba(180,140,50,0.15);
            border: 1px solid rgba(180,140,50,0.4);
        }

        .tag-indicator.source {
            color: #78909c;
            background: rgba(120,144,156,0.15);
            border: 1px solid rgba(120,144,156,0.35);
            padding: 2px 5px;
            margin-left: 0;
            margin-right: 8px;
        }

        .badge-container {
            display: flex;
            align-items: center;
        }

        .sort-hidden .drag-handle {
            display: none !important;
        }

        .dry-run-warning {
            background-color: #E67E22;
            color: #000000;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            text-align: center;
            font-weight: bold;
            font-size: 1.1em;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            display: none;
            align-items: center;
            justify-content: center;
            gap: 10px;
            position: sticky;
            top: 60px;
            z-index: 10000;
        }

        .drag-handle {
            cursor: grab;
            margin-right: 15px;
            color: var(--theme-text-secondary);
            display: flex;
            align-items: center;
        }

        .drag-handle:active {
            cursor: grabbing;
        }

        .tag-row {
            position: relative;
            background: var(--theme-background-level2);
            margin-bottom: 15px;
            border-radius: 6px;
            border: 1px solid var(--line-color);
            border-left: 5px solid #52B54B;
            transition: all 0.2s ease;
            box-shadow: 0 2px 6px rgba(0,0,0,0.12);
            overflow: hidden;
        }

        .tag-row.inactive {
            border-left-color: rgba(128,128,128,0.5);
        }

        .tag-row.dragging {
            opacity: 0.4 !important;
            border: 2px dashed #999 !important;
            background: var(--theme-background-level1) !important;
        }

        .sort-placeholder {
            height: 40px;
            background-color: transparent;
            margin-bottom: 15px;
            border-radius: 6px;
            border: 2px dashed var(--line-color);
            transition: height 0.2s;
        }

        .tag-row.just-moved {
            animation: moveHighlight 2s ease-out forwards;
        }

        .tag-row.just-added {
            animation: addHighlight 2s ease-out forwards;
        }

        @keyframes moveHighlight {
            0% {
                border-top: 1px solid #00a4dc;
                border-right: 1px solid #00a4dc;
                border-bottom: 1px solid #00a4dc;
                box-shadow: 0 0 15px rgba(0,164,220,0.5);
            }
            100% {
                border-top: 1px solid var(--line-color);
                border-right: 1px solid var(--line-color);
                border-bottom: 1px solid var(--line-color);
                box-shadow: 0 2px 6px rgba(0,0,0,0.12);
            }
        }

        @keyframes tcDotBounce {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
            40%            { transform: translateY(-5px); opacity: 1; }
        }
        .tc-dot-loader { display:inline-flex; align-items:center; gap:5px; }
        .tc-dot-loader span { display:inline-block; width:7px; height:7px; border-radius:50%; background:currentColor; animation:tcDotBounce 1.2s ease-in-out infinite; }
        .tc-dot-loader span:nth-child(2) { animation-delay:0.2s; }
        .tc-dot-loader span:nth-child(3) { animation-delay:0.4s; }

        @keyframes addHighlight {
            0% {
                border-top: 1px solid #52B54B;
                border-right: 1px solid #52B54B;
                border-bottom: 1px solid #52B54B;
                box-shadow: 0 0 15px rgba(82,181,75,0.5);
            }
            100% {
                border-top: 1px solid var(--line-color);
                border-right: 1px solid var(--line-color);
                border-bottom: 1px solid var(--line-color);
                box-shadow: 0 2px 6px rgba(0,0,0,0.12);
            }
        }

        .control-row {
            background: rgba(128,128,128,0.06);
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid var(--line-color);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .control-sub-row {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .control-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .control-label {
            font-size: 0.85em;
            opacity: 0.5;
            text-transform: uppercase;
            font-weight: bold;
            letter-spacing: 0.5px;
        }

        .search-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            flex-grow: 1;
            max-width: 250px;
        }

        .search-input-wrapper .search-icon {
            position: absolute;
            left: 10px;
            font-size: 1em;
            opacity: 0.5;
            pointer-events: none;
        }

        #btnClearSearch {
            position: absolute;
            right: 8px;
            cursor: pointer;
            opacity: 0.5;
            display: none;
        }

        #btnClearSearch:hover {
            opacity: 1;
            color: #cc3333;
        }

        #txtSearchTags {
            width: 100%;
            background: rgba(128,128,128,0.06) !important;
            border: 1px solid var(--line-color) !important;
            border-radius: 4px !important;
            padding: 6px 30px 6px 35px !important;
            color: inherit;
            font-size: 0.95em;
        }

        #txtSearchTags:focus {
            border-color: var(--theme-primary-color) !important;
            background: rgba(128,128,128,0.1) !important;
        }

        .filter-dropdown-wrapper {
            position: relative;
            flex-shrink: 0;
        }

        .filter-dropdown-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            background: var(--plugin-input-bg, rgba(128,128,128,0.08));
            border: 1px solid var(--plugin-input-border, var(--line-color));
            border-radius: 4px;
            font-size: 0.9em;
            cursor: pointer;
            color: var(--plugin-popup-color, inherit);
            white-space: nowrap;
            user-select: none;
        }

        .filter-dropdown-btn:hover {
            background: var(--plugin-popup-hover, rgba(128,128,128,0.15));
        }

        html[data-plugin-theme="dark"] select,
        html[data-plugin-theme="dark"] input[type="text"],
        html[data-plugin-theme="dark"] input[type="number"] {
            color-scheme: dark;
        }

        html[data-plugin-theme="light"] select,
        html[data-plugin-theme="light"] input[type="text"],
        html[data-plugin-theme="light"] input[type="number"] {
            color-scheme: light;
        }

        .filter-dropdown-btn.active {
            border-color: #52B54B;
            color: #52B54B;
        }

        .filter-dropdown-panel {
            display: none;
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            z-index: 9999;
            background: var(--plugin-popup-bg, #2a2a2a);
            color: var(--plugin-popup-color, #e8e8e8);
            border: 1px solid var(--plugin-popup-border, rgba(255,255,255,0.12));
            border-radius: 6px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.4);
            padding: 10px 14px;
            min-width: 200px;
        }

        .filter-dropdown-panel.open {
            display: block;
        }

        .hsc-user-dropdown .filter-dropdown-panel {
            max-height: 260px;
            overflow-y: auto;
        }

        .filter-dropdown-section {
            margin-bottom: 10px;
        }

        .filter-dropdown-section:last-child {
            margin-bottom: 0;
        }

        .filter-dropdown-divider {
            height: 1px;
            background: var(--line-color);
            margin: 8px 0;
        }

        .filter-dropdown-label {
            font-size: 0.75em;
            opacity: 0.5;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
        }

        .filter-chk-row {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 3px 0;
            cursor: pointer;
            font-size: 0.9em;
        }

        .filter-chk-row input[type=checkbox] {
            cursor: pointer;
        }

        .btn-row-remove {
            background: transparent !important;
            min-width: 40px;
            width: 40px;
            padding: 0;
            color: #cc3333;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: none;
            margin-top: 12px;
        }

        .btn-neutral {
            background: var(--theme-background-level2) !important;
            border: 1px solid rgba(128,128,128,0.4) !important;
            color: var(--theme-text-primary) !important;
        }
        .plugin-footer {
            position: fixed;
            bottom: 0;
            left: var(--plugin-footer-left, 0);
            right: 0;
            z-index: 200;
            background: var(--plugin-footer-bg);
            color: var(--plugin-popup-muted);
            height: 50px;
            padding: 0 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9em;
            border-top: 1px solid var(--line-color);
            box-sizing: border-box;
        }
        .plugin-footer .footer-version {
            color: var(--theme-text-secondary);
        }
        .plugin-footer .footer-sep {
            margin: 0 12px;
            opacity: 0.35;
        }
        .plugin-footer .footer-update-link {
            color: #E67E22;
            text-decoration: none;
            font-weight: bold;
        }
        .plugin-footer .simple-link {
            font-size: 1em;
            transition: none;
            transform: none;
        }
        .plugin-footer .simple-link:hover {
            transform: none;
        }
    </style>`;

// ─── Tiny AMD typedef shim (Jellyfin's loader expects globals) ───────────────

declare const define: (
    deps: readonly string[],
    factory: (...args: never[]) => unknown,
) => void;
void define;

// ─── Schedule helpers still in legacy.js — inlined verbatim ─────────────────

function isScheduleCurrentlyActive(intervals: readonly ScheduleInterval[]): boolean {
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

function readIntervalsFromRow(row: HTMLElement): ScheduleInterval[] {
    const intervals: ScheduleInterval[] = [];
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

// ─── Jellyfin ApiClient surface shims ────────────────────────────────────────
//
// The modules below consume a Jellyfin-shaped client where
// `getJSON(name, params)` takes a route name plus a query-params object.
// Emby's `ApiClient.getJSON(url, signal)` treats the second argument as an
// AbortSignal instead (fetchhelper calls `signal.throwIfAborted()`), so
// passing params straight through throws synchronously and breaks the whole
// viewshow handler. `getApi()` therefore wraps the raw window.ApiClient in
// an adapter that builds absolute URLs via `getUrl` and drops the params
// argument. Absolute URLs (already produced by `getUrl`) pass through.

interface WindowApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
    getScheduledTasks(): Promise<Array<{ Id: string; Key: string }>>;
    startScheduledTask(id: string): Promise<unknown>;
    getCurrentUserId(): string;
}

interface RawEmbyApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(url: string, signal?: unknown): Promise<T>;
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
    getScheduledTasks(): Promise<Array<{ Id: string; Key: string }>>;
    startScheduledTask(id: string): Promise<unknown>;
    getCurrentUserId(): string;
}

interface WindowDashboard {
    alert(message: string): void;
    processPluginConfigurationUpdateResult(result: unknown): void;
}

interface WindowGlobals {
    ApiClient?: RawEmbyApiClient;
    Dashboard?: WindowDashboard;
}

function getApi(): WindowApiClient | undefined {
    const raw = (window as unknown as WindowGlobals).ApiClient;
    if (!raw) return undefined;
    return {
        accessToken: () => raw.accessToken(),
        getUrl: (name, params) => raw.getUrl(name, params),
        getJSON: <T,>(name: string, params?: Record<string, unknown>) => {
            const url = typeof name === 'string' && /^https?:\/\//i.test(name)
                ? name
                : raw.getUrl(name, params);
            return raw.getJSON<T>(url);
        },
        getPluginConfiguration: (pluginId) => raw.getPluginConfiguration(pluginId),
        updatePluginConfiguration: (pluginId, config) => raw.updatePluginConfiguration(pluginId, config),
        getScheduledTasks: () => raw.getScheduledTasks(),
        startScheduledTask: (id) => raw.startScheduledTask(id),
        getCurrentUserId: () => raw.getCurrentUserId(),
    };
}
function getDashboard(): WindowDashboard | undefined {
    return (window as unknown as WindowGlobals).Dashboard;
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

    // ─── State holder (single bag per page mount) ──────────────────────────
    const appState: AppState = createAppState();

    // ─── MI filter deps closure (re-bound per row rebuild) ─────────────────
    function miFilterDeps(): MiFilterDeps {
        return {
            users: appState.miUsers.users,
            collections: appState.libraryCache.collections,
            playlists: appState.libraryCache.playlists,
            tags: appState.libraryCache.tags,
        };
    }

    // ─── HSC deps shim (loaded per-tab via loadHscUsers) ────────────────────
    function hscDeps(): HscDeps {
        return {
            getConfig: () => appState.hsc.config,
            renderTab: legacyRenderHscTab as never,
            enforceConflict: legacyEnforceHscSourceTargetConflict as never,
            notifyFormChanged: () => { setTimeout(checkFormStateBound, 0); },
        };
    }

    // ─── getUiConfig bound to view ──────────────────────────────────────────
    function boundGetUiConfig(view: HTMLElement, forComparison: boolean): unknown {
        return getUiConfig(view, forComparison, {
            hsc: appState.hsc,
            savedFilters: appState.savedFilters,
            miUsers: appState.miUsers,
            readRowAsConfig: readRowAsConfig,
        });
    }

    // ─── checkFormState bound to view ───────────────────────────────────────
    function checkFormStateBound(): void {
        checkFormState({
            view: currentView,
            originalConfigState: appState.originalConfigState,
            getUiConfig: boundGetUiConfig,
        });
    }

    // ─── applyFilters + refreshStatus wrappers ──────────────────────────────
    function applyFiltersFn(view: HTMLElement): void { applyFilters(view); }
    function refreshStatusFn(view: HTMLElement): void {
        refreshStatus(view, {
            getApiClient: () => ({ getJSON: <T,>(n: string, p?: Record<string, unknown>) => {
                const ac = getApi();
                return ac ? ac.getJSON<T>(n, p) : Promise.resolve({} as T);
            } }),
            state: appState.logStatus,
            checkFormState: checkFormStateBound,
        });
    }

    // ─── Source badge helper (still in legacy.js:1350) ──────────────────────
    function getSourceBadgeHtml(st: string): string {
        const map: Record<string, { icon: string; title: string }> = {
            'External': { icon: 'language', title: 'External List' },
            'LocalCollection': { icon: 'folder_special', title: 'Local Collection' },
            'LocalPlaylist': { icon: 'playlist_play', title: 'Local Playlist' },
            'MediaInfo': { icon: 'tune', title: 'Smart Playlist' },
            'AI': { icon: 'auto_awesome', title: 'AI created lists' },
        };
        const e = map[st];
        if (!e) return '';
        return `<span class="tag-indicator source" title="${e.title}"><i class="md-icon" style="font-size:1.1em;">${e.icon}</i></span>`;
    }

    // ─── Row builder closure (legacy 6-arg signature) ──────────────────────
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
        // buildSetupRowDeps calls setupRowEvents exactly once. Calling
        // setupRowEvents here again double-binds every handler on the row,
        // which makes click/change toggles fire twice and cancel out
        // (row expansion, tab switches and dropdowns stop working).
        buildSetupRowDeps(newRow);
        if (isNew) {
            newRow.classList.add('just-added');
            setTimeout(() => newRow.classList.remove('just-added'), 2000);
        }
    }

    // ─── Row setup deps builder ─────────────────────────────────────────────
    function buildSetupRowDeps(row: HTMLElement): SetupRowEventsDeps {
        const self: { updateBadges?: (r: HTMLElement) => void; updateRunGroupBtn?: (r: HTMLElement) => void; updateTagTitle?: (r: HTMLElement) => void } = {};
        const api = getApi();
        const deps: SetupRowEventsDeps = {
            savedFilters: appState.savedFilters,
            topLists: appState.topLists,
            originalConfigState: appState.originalConfigState,
            miFilterDeps: miFilterDeps(),
            getApiClient: () => ({
                getPluginConfiguration: (id) => api ? api.getPluginConfiguration(id) : Promise.resolve({}),
                updatePluginConfiguration: (id, c) => api ? api.updatePluginConfiguration(id, c) : Promise.resolve({}),
            }),
            pluginId: PLUGIN_ID,
            initHomeSectionTab: (r) => initHomeSectionTab(r, {
                getHseUsers: () => getHseUsers({ getApiClient: () => api as never, cache: appState.hseUserCache }),
                buildUserMultiSelectHtml: (users, selIds, chkClass) => buildUserMultiSelectHtml(users, selIds, chkClass),
                wireUserMultiSelect: (c) => wireUserMultiSelect(c),
                preFetchLibraryData: () => preFetchLibraryData({ getApiClient: () => api as never, cache: appState.hseUserCache }),
                syncHomeSectionFromEmby: (tab, syncDeps) => syncHomeSectionFromEmby(tab, syncDeps),
                getUiConfig: boundGetUiConfig,
                checkFormState: checkFormStateBound,
                originalConfigState: appState.originalConfigState,
            }),
            initPlaylistTab: (r) => initPlaylistTab(r, {
                getHseUsers: () => getHseUsers({ getApiClient: () => api as never, cache: appState.hseUserCache }),
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
                getApiClient: () => ({
                    getPluginConfiguration: (id) => api ? api.getPluginConfiguration(id) : Promise.resolve({}),
                    updatePluginConfiguration: (id, c) => api ? api.updatePluginConfiguration(id, c) : Promise.resolve({}),
                }),
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
        // Wire the closures setupRowEvents writes back to self.
        setupRowEvents(row, deps);
        if (deps.updateBadges) self.updateBadges = deps.updateBadges;
        if (deps.updateRunGroupBtn) self.updateRunGroupBtn = deps.updateRunGroupBtn;
        if (deps.updateTagTitle) self.updateTagTitle = deps.updateTagTitle;
        return deps;
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

    // ─── HSC tab helpers (stubs — production wire is in legacy.js closure) ─
    function legacyRenderHscTab(_container: HTMLElement, _config: never, _users: readonly never[]): void {
        // Lifted to modules/homesections/hscTab.ts as `renderHscTab`. The
        // factory binds `renderTab` to it via `hscDeps().renderTab`.
    }
    function legacyEnforceHscSourceTargetConflict(_container: HTMLElement): void {
        // Lifted to modules/homesections/hscTab.ts as `enforceHscSourceTargetConflict`.
    }

    // ─── Per-tab loaders (legacy 1-arg signatures) ──────────────────────────
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
            getManDragAfterElement: getManDragAfterElement,
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
            escapeHtml: escapeHtml,
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
            getManDragAfterElement: getManDragAfterElement,
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
                escapeHtml: escapeHtml,
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

    // ─── Current view (set when the returned function runs) ────────────────
    let currentView: HTMLElement | null = null;

    // ─── loadConfig — fetches config, populates form, anchors baseline ─────
    function loadConfigFn(): Promise<void> {
        if (!currentView) return Promise.resolve();
        const view = currentView;
        const api = getApi();
        if (!api) return Promise.resolve();

        appState.hseUserCache.libraryPromise = null;
        void preFetchLibraryData({ getApiClient: () => api as never, cache: appState.hseUserCache });

        return api.getPluginConfiguration(PLUGIN_ID).then((config) => {
            const cfg = config as {
                HomeSyncEnabled?: boolean;
                HomeSyncLibraryOrder?: boolean;
                HomeSyncSourceUserId?: string;
                HomeSyncTargetUserIds?: string[];
                SavedFilters?: SavedFilter[];
                Tags?: unknown[];
                TopLists?: Array<{ TagName?: string }>;
                TraktClientId?: string;
                MdblistApiKey?: string;
                TmdbApiKey?: string;
                OpenAiApiKey?: string;
                OpenAiModel?: string;
                GeminiApiKey?: string;
                GeminiModel?: string;
                ClaudeApiKey?: string;
                ClaudeModel?: string;
                OllamaBaseUrl?: string;
                OllamaModel?: string;
                AiSystemPrompt?: string;
                ExtendedConsoleOutput?: boolean;
                LogMissingItems?: boolean;
                DryRunMode?: boolean;
                PreserveTagsOnEmptyResult?: boolean;
            };

            appState.hsc.config = {
                HomeSyncEnabled: cfg.HomeSyncEnabled || false,
                HomeSyncLibraryOrder: cfg.HomeSyncLibraryOrder || false,
                HomeSyncSourceUserId: cfg.HomeSyncSourceUserId || '',
                HomeSyncTargetUserIds: cfg.HomeSyncTargetUserIds || [],
            };
            appState.savedFilters.filters = cfg.SavedFilters || [];

            const container = view.querySelector<HTMLElement>('#tagListContainer');
            if (container) container.innerHTML = '';

            const setVal = (sel: string, val: string): void => {
                const el = view.querySelector<HTMLInputElement>(sel);
                if (el) el.value = val;
            };
            setVal('#txtTraktClientId', cfg.TraktClientId || '');
            setVal('#txtMdblistApiKey', cfg.MdblistApiKey || '');
            setVal('#txtTmdbApiKey', cfg.TmdbApiKey || '');
            setVal('#txtOpenAiApiKey', cfg.OpenAiApiKey || '');
            setVal('#txtOpenAiModel', cfg.OpenAiModel || 'gpt-4o-mini');
            setVal('#txtGeminiApiKey', cfg.GeminiApiKey || '');
            setVal('#txtGeminiModel', cfg.GeminiModel || 'gemini-2.5-flash-lite');
            setVal('#txtClaudeApiKey', cfg.ClaudeApiKey || '');
            setVal('#txtClaudeModel', cfg.ClaudeModel || 'claude-haiku-4-5-20251001');
            setVal('#txtOllamaBaseUrl', cfg.OllamaBaseUrl || 'http://localhost:11434');
            setVal('#txtOllamaModel', cfg.OllamaModel || '');
            const spEl = view.querySelector<HTMLTextAreaElement>('#txtAiSystemPrompt');
            if (spEl) spEl.value = cfg.AiSystemPrompt || '';
            updateSystemPromptResetBtn(view);

            const setChk = (sel: string, val: boolean): void => {
                const el = view.querySelector<HTMLInputElement>(sel);
                if (el) el.checked = val;
            };
            setChk('#chkExtendedConsoleOutput', !!cfg.ExtendedConsoleOutput);
            setChk('#chkLogMissingItems', !!cfg.LogMissingItems);
            setChk('#chkDryRunMode', !!cfg.DryRunMode);
            setChk('#chkPreserveTagsOnEmptyResult', !!cfg.PreserveTagsOnEmptyResult);

            const ts = view.querySelector<HTMLInputElement>('#txtSearchTags');
            if (ts) ts.value = '';
            const btnClear = view.querySelector<HTMLElement>('#btnClearSearch');
            if (btnClear) btnClear.style.display = 'none';

            ['#chkFilterTag', '#chkFilterCollection', '#chkFilterSchedule', '#chkFilterHomeScreen',
             '#chkFilterSrcExternal', '#chkFilterSrcMediaInfo', '#chkFilterSrcCollection', '#chkFilterSrcPlaylist',
             '#chkFilterSrcAI', '#chkFilterActive', '#chkFilterInactive'
            ].forEach((id) => {
                const el = view.querySelector<HTMLInputElement>(id);
                if (el) el.checked = false;
            });
            const lbl = view.querySelector<HTMLElement>('#filterDropdownLabel');
            if (lbl) lbl.textContent = 'Filter';
            const btn = view.querySelector<HTMLElement>('#btnFilterDropdown');
            if (btn) btn.classList.remove('active');

            appState.topLists.tagNames = new Set((cfg.TopLists || []).map((tl) => (tl.TagName || '').toLowerCase()).filter(Boolean));

            const grouped = groupConfigTags((cfg.Tags as never[]) || []);
            const c2 = view.querySelector<HTMLElement>('#tagListContainer');
            if (!c2) return;
            const keys = Object.keys(grouped);
            keys.forEach((k, i) => { legacyRenderTagGroup(grouped[k], c2, false, i, false, null); });
            if (keys.length === 0) {
                legacyRenderTagGroup({ Tag: '', Urls: [{ url: '', limit: 0 }], Active: true }, c2, false, 0, false, null);
            }

            const savedSort = localStorage.getItem('HomeScreenCompanion_SortBy') || 'Manual';
            sortRows(c2, savedSort);
            applyFilters(view);
            requestAnimationFrame(() => {
                try {
                    appState.originalConfigState.setOriginalConfigState(JSON.stringify(boundGetUiConfig(view, true)));
                } catch {
                    appState.originalConfigState.setOriginalConfigState(null);
                }
                checkFormStateBound();
                updateDryRunWarning(appState.originalConfigState.getOriginalConfigState());
            });
        });
    }

    // ─── hasDirtyState — quick check for save button + tc pending ───────────
    function hasDirtyStateFn(): boolean {
        if (!currentView) return false;
        const btnSave = currentView.querySelector<HTMLButtonElement>('.btn-save');
        if (btnSave && !btnSave.disabled) return true;
        const tcContainer = currentView.querySelector<HTMLElement>('#tcManageContainer') as (HTMLElement & { _tcHasPending?: boolean }) | null;
        if (tcContainer && tcContainer._tcHasPending) return true;
        return false;
    }

    // ─── doSave — full save logic with HSC + top-list exclusions ────────────
    function doSaveFn(): void {
        const view = currentView;
        if (!view) return;

        const cleanupTab = view.querySelector<HTMLElement>('#tabCleanup');
        const tcContainer = view.querySelector<HTMLElement>('#tcManageContainer') as (HTMLElement & { _tcShowModal?: () => void; _tcHasPending?: boolean }) | null;
        if (cleanupTab && cleanupTab.style.display !== 'none' && tcContainer && tcContainer._tcHasPending && tcContainer._tcShowModal) {
            tcContainer._tcShowModal();
            return;
        }

        const btnApplyManage = view.querySelector<HTMLButtonElement>('#btnApplyManage');
        if (btnApplyManage && !btnApplyManage.disabled) applyManageSectionsFn(view);

        const configObj = boundGetUiConfig(view, false) as {
            Tags?: Record<string, unknown>[];
            TopLists?: unknown[];
        };

        const originalConfStr = appState.originalConfigState.getOriginalConfigState();
        if (!originalConfStr) return;
        const originalConf = JSON.parse(originalConfStr) as { Tags?: never[] };
        const originalTags = groupConfigTags((originalConf.Tags as never[]) || []);

        (configObj.Tags || []).forEach((tag: Record<string, unknown>) => {
            const tagAny = tag as { Name?: string; Tag?: string; LastModified?: string };
            const key = tagAny.Name ? tagAny.Name + '\x1F' + tagAny.Tag : (tagAny.Tag as string);
            const originalTag = originalTags[key];

            const currentTagForCompare = Object.assign({}, tag, { LastModified: 'CONSTANT_FOR_COMPARISON' });
            const originalTagForCompare = originalTag ? Object.assign({}, originalTag, { LastModified: 'CONSTANT_FOR_COMPARISON' }) : null;

            if (!originalTag || JSON.stringify(currentTagForCompare) !== JSON.stringify(originalTagForCompare)) {
                tag.LastModified = new Date().toISOString();
            } else {
                tag.LastModified = originalTag.LastModified;
            }
        });

        const api = getApi();
        if (!api) return;
        void api.getPluginConfiguration(PLUGIN_ID).catch(() => ({ Tags: [] })).then((currentConfig) => {
            const cc = currentConfig as { Tags?: unknown[]; TopLists?: unknown[] };
            const currentGrouped = groupConfigTags((cc.Tags as never[]) || []);
            (configObj.Tags || []).forEach((t: Record<string, unknown>) => {
                const tAny = t as { Name?: string; Tag?: string; HomeSectionTracked?: unknown[]; PlaylistMappings?: unknown[] };
                const key = tAny.Name ? tAny.Name + '\x1F' + tAny.Tag : (tAny.Tag as string);
                const existing = currentGrouped[key];
                if (existing && existing.HomeSectionTracked && (existing.HomeSectionTracked as unknown[]).length > 0
                    && (!t.HomeSectionTracked || (t.HomeSectionTracked as unknown[]).length === 0)) {
                    t.HomeSectionTracked = existing.HomeSectionTracked;
                }
                if (existing && existing.PlaylistMappings && (existing.PlaylistMappings as unknown[]).length > 0
                    && (!t.PlaylistMappings || (t.PlaylistMappings as unknown[]).length === 0)) {
                    t.PlaylistMappings = existing.PlaylistMappings;
                }
            });
            configObj.TopLists = cc.TopLists || [];

            return preFetchLibraryData({ getApiClient: () => api as never, cache: appState.hseUserCache }).then((libData) => {
                const ld = libData as { virtualFolders: Array<{ ItemId: string; Locations?: string[] }>; topListFolderNames: Set<string> };
                const topListIds = new Set(
                    (ld.virtualFolders || [])
                        .filter((f) => {
                            return (f.Locations || []).some((loc) => {
                                const parts = loc.replace(/\\/g, '/').split('/');
                                const fn = ((parts[parts.length - 1] || parts[parts.length - 2] || '') as string).toLowerCase();
                                return ld.topListFolderNames.has(fn);
                            });
                        })
                        .map((f) => f.ItemId)
                );
                if (topListIds.size > 0) {
                    (configObj.Tags || []).forEach((tag: Record<string, unknown>) => {
                        const tagAny = tag as { EnableHomeSection?: boolean; HomeSectionSettings?: string };
                        if (!tagAny.EnableHomeSection) return;
                        let settings: Record<string, unknown> = {};
                        try { settings = JSON.parse(tagAny.HomeSectionSettings || '{}') as Record<string, unknown>; } catch { /* ignore */ }
                        if ((settings['SectionType'] || 'items') !== 'items') return;
                        const excluded = new Set(
                            (typeof settings['_queryExcludeViewIds'] === 'string' ? settings['_queryExcludeViewIds'] : '')
                                .split(',').map((id: string) => id.trim()).filter(Boolean)
                        );
                        let changed = false;
                        topListIds.forEach((id) => {
                            if (!excluded.has(id)) { excluded.add(id); changed = true; }
                        });
                        if (changed) {
                            const excStr = Array.from(excluded).join(',');
                            settings['_queryExcludeViewIds'] = excStr;
                            settings['ExcludedFolders'] = excStr;
                            tag.HomeSectionSettings = JSON.stringify(settings);
                        }
                    });
                }
                return api.updatePluginConfiguration(PLUGIN_ID, configObj as unknown as Record<string, unknown>);
            });
        }).then((r: unknown) => {
            getDashboard()?.processPluginConfigurationUpdateResult(r);
            appState.topLists.tagNames = new Set((configObj.TopLists || []).map((tl: unknown) => {
                const t = tl as { TagName?: string };
                return (t.TagName || '').toLowerCase();
            }).filter(Boolean));

            const newGrouped = groupConfigTags((configObj.Tags as never[]) || []);
            view.querySelectorAll<HTMLElement>('.tag-row').forEach((row) => {
                const lblInput = row.querySelector<HTMLInputElement>('.txtEntryLabel');
                if (!lblInput) return;
                const name = lblInput.value;
                const tagNameEl = row.querySelector<HTMLInputElement>('.txtTagName');
                const tagName = tagNameEl ? (tagNameEl.value || name) : name;
                const key = name ? name + '\x1F' + tagName : tagName;
                const tc = newGrouped[key];
                if (tc) {
                    row.dataset.lastModified = typeof tc.LastModified === 'string' ? tc.LastModified : '';
                    const hseTab = row.querySelector<HTMLElement>('.homescreen-tab');
                    if (hseTab) {
                        hseTab.dataset.hseTracked = encodeURIComponent(JSON.stringify(tc.HomeSectionTracked || []));
                        hseTab.dataset.hseSettings = encodeURIComponent(tc.HomeSectionSettings || '{}');
                        hseTab.dataset.hseUserids = encodeURIComponent(JSON.stringify(tc.HomeSectionUserIds || []));
                    }
                }
            });

            appState.originalConfigState.setOriginalConfigState(JSON.stringify(boundGetUiConfig(view, true)));
            checkFormStateBound();
            updateDryRunWarning(appState.originalConfigState.getOriginalConfigState());

            (configObj.Tags || []).forEach((tcRaw: Record<string, unknown>) => {
                const tc = tcRaw as {
                    EnableHomeSection?: boolean;
                    HomeSectionTracked?: Array<{ SectionId?: string }>;
                    Name?: string;
                    Tag?: string;
                };
                if (!tc.EnableHomeSection) return;
                const hasTracked = (tc.HomeSectionTracked || []).some((t) => t.SectionId && !t.SectionId.startsWith('hsc__'));
                if (!hasTracked) return;
                const applyUrl = api.getUrl('HomeScreenCompanion/Hsc/ApplyTagHomeSections');
                const tok = api.accessToken();
                fetch(applyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok },
                    body: JSON.stringify({ TagName: tc.Name || tc.Tag }),
                }).then((rr) => rr.json()).then((res) => {
                    console.log('[HSC] ApplyTagHomeSections', tc.Name || tc.Tag, res);
                }).catch((e) => { console.warn('[HSC] ApplyTagHomeSections failed', tc.Name || tc.Tag, e); });
            });
        });
    }

    // ─── Form submit handler with dirty top-list flush ──────────────────────
    function submitFormHandler(e: Event): void {
        e.preventDefault();
        if (!currentView) return;
        const view = currentView;
        const tlCont = view.querySelector<HTMLElement>('#tlContainer');
        const dirtyBodies = tlCont ? Array.from(tlCont.querySelectorAll<HTMLElement>('.tag-body[data-dirty="1"]')) : [];
        if (dirtyBodies.length > 0) {
            const btn = view.querySelector<HTMLButtonElement>('.btn-save');
            const origHtml = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="md-icon" style="margin-right:5px;">hourglass_empty</i><span>Saving…</span>'; }
            dirtyBodies.reduce<Promise<void>>((p, b) => {
                return p.then(() => {
                    const tlSaveForm = (b as HTMLElement & { tlSaveForm?: () => Promise<void> }).tlSaveForm;
                    return typeof tlSaveForm === 'function' ? tlSaveForm() : Promise.resolve();
                });
            }, Promise.resolve()).then(() => {
                dirtyBodies.forEach((b) => { delete b.dataset.dirty; });
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                doSaveFn();
            }).catch((err) => {
                if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
                const errMsg = (err instanceof Error) ? err.message : String(err);
                alert('Failed to save top-list changes: ' + errMsg);
            });
            return;
        }
        doSaveFn();
    }

    // ─── Returned factory function ──────────────────────────────────────────
    currentView = view;

        view.addEventListener('viewshow', () => {
            if (!document.getElementById('homeScreenCompanionCustomCss')) {
                document.body.insertAdjacentHTML('beforeend', customCss);
            }
            applyPluginTheme();

            const form = view.querySelector<HTMLElement>('.HomeScreenCompanionForm');
            if (!form) return;

            const isFirstVisit = !view.dataset.hscInit;
            if (isFirstVisit) view.dataset.hscInit = '1';

            appState.originalConfigState.setOriginalConfigState(null);

            const changeHandler = (): void => {
                setTimeout(checkFormStateBound, 0);
            };

            if (appState.viewShow.formAc) appState.viewShow.formAc.abort();
            const formAc = new AbortController();
            appState.viewShow.formAc = formAc;
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

                const api = getApi();
                const _db = getDashboard();
                const logApi = (): { getJSON: <T = unknown>(name: string, params?: Record<string, unknown>) => Promise<T> } => ({
                    getJSON: <T,>(n: string, p?: Record<string, unknown>) => api ? api.getJSON<T>(n, p) : Promise.resolve({} as T),
                });

                if (btnOpenLogs) btnOpenLogs.addEventListener('click', (e) => {
                    e.preventDefault();
                    appState.logStatus.logTab = null;
                    renderLogModal(view, { getApiClient: logApi, state: appState.logStatus, checkFormState: checkFormStateBound });
                    if (logOverlay) logOverlay.classList.add('modal-visible');
                });
                if (btnCloseLogs) btnCloseLogs.addEventListener('click', () => {
                    appState.logStatus.logTab = null;
                    if (logOverlay) logOverlay.classList.remove('modal-visible');
                });
                if (logOverlay) logOverlay.addEventListener('click', (e) => {
                    if (e.target === logOverlay) {
                        appState.logStatus.logTab = null;
                        logOverlay.classList.remove('modal-visible');
                    }
                });
                view.querySelectorAll<HTMLElement>('#logTabs .log-tab').forEach((tab) => {
                    tab.addEventListener('click', () => {
                        const key = tab.getAttribute('data-log') as 'sync' | 'hsc' | 'tl' | null;
                        appState.logStatus.logTab = key;
                        renderLogModal(view, { getApiClient: logApi, state: appState.logStatus, checkFormState: checkFormStateBound });
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
                            applyFilters(view);
                        });

                        btnClear.addEventListener('click', () => {
                            txtSearch.value = '';
                            btnClear.style.display = 'none';
                            txtSearch.focus();
                            applyFilters(view);
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
                        if (el) el.addEventListener('change', () => applyFilters(view));
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
                    legacyRenderTagGroup({ Tag: '', Urls: [{ url: '', limit: 0 }], Active: true }, container, true, undefined, true, null);
                    applyFilters(view);
                });

                const btnBackupConfig = view.querySelector<HTMLElement>('#btnBackupConfig');
                if (btnBackupConfig) btnBackupConfig.addEventListener('click', () => {
                    showBackupModal(backupDeps());
                });

                const fileInput = view.querySelector<HTMLInputElement>('#fileRestoreConfig');
                const btnRestoreConfigTrigger = view.querySelector<HTMLElement>('#btnRestoreConfigTrigger');
                if (btnRestoreConfigTrigger && fileInput) {
                    btnRestoreConfigTrigger.addEventListener('click', () => {
                        if (hasDirtyStateFn() && !confirm('You have unsaved changes. They will be discarded when a backup is restored. Continue?')) return;
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
                                void loadConfigFn().then(() => {
                                    refreshMySavedFiltersPanels(appState.savedFilters.filters);
                                    const activeTab = view.querySelector<HTMLElement>('.page-tab-btn.active');
                                    const target2 = activeTab ? activeTab.getAttribute('data-page-tab') : '';
                                    if (target2 === 'HomeCompanion') { loadHscUsers(view, hscDeps()); loadHscManageTabFn(view); }
                                    else if (target2 === 'TopLists') loadTopListsTabFn(view);
                                    else if (target2 === 'Cleanup') loadTagManageTabFn(view);
                                });
                            }, backupDeps());
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

            const api = getApi();
            checkForUpdates(view, {
                fetch: (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => fetch(...args),
                getApiClient: () => api
                    ? { getUrl: (n: string) => api.getUrl(n), accessToken: () => api.accessToken() }
                    : { getUrl: () => '', accessToken: () => '' },
            });
            refreshStatusFn(view);

            if (appState.viewShow.statusInterval) clearInterval(appState.viewShow.statusInterval);
            const statusInterval = setInterval(() => refreshStatusFn(view), 5000);
            appState.viewShow.statusInterval = statusInterval;

            void getHseUsers({ getApiClient: () => api as never, cache: appState.hseUserCache }).then((users) => {
                appState.miUsers.users = users as HscUserLike[];
            });

            void Promise.all([
                api ? api.getJSON(api.getUrl('Users/' + api.getCurrentUserId() + '/Items', { IncludeItemTypes: 'BoxSet', Recursive: true })) : Promise.resolve({ Items: [] }),
                api ? api.getJSON(api.getUrl('Items', { IncludeItemTypes: 'Playlist', Recursive: true })) : Promise.resolve({ Items: [] }),
                api
                    ? api.getJSON(api.getUrl('Items/Filters2', { UserId: api.getCurrentUserId(), Recursive: true })).catch(() => ({ Tags: [] }))
                    : Promise.resolve({ Tags: [] }),
            ]).then((responses) => {
                const r0 = responses[0] as { Items?: typeof appState.libraryCache.collections };
                const r1 = responses[1] as { Items?: typeof appState.libraryCache.playlists };
                const r2 = responses[2] as { Tags?: string[] };
                appState.libraryCache.collections = r0.Items || [];
                appState.libraryCache.playlists = r1.Items || [];
                appState.libraryCache.tags = ((r2 && r2.Tags) || []).slice().sort();

                void loadConfigFn();
            });
        });

        view.addEventListener('viewhide', () => {
            if (appState.viewShow.formAc) {
                appState.viewShow.formAc.abort();
                appState.viewShow.formAc = null;
            }
            if (appState.viewShow.statusInterval) {
                clearInterval(appState.viewShow.statusInterval);
                appState.viewShow.statusInterval = null;
            }
        });

        const formEl = view.querySelector<HTMLFormElement>('.HomeScreenCompanionForm');
        if (formEl) formEl.addEventListener('submit', submitFormHandler);

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

        function closeSpeedDial(): void {
            if (speedDial) speedDial.classList.remove('open');
            if (syncMenu) syncMenu.classList.remove('open');
        }

        function runTask(key: string, label: string): void {
            const api = getApi();
            const db = getDashboard();
            if (!api) return;
            void api.getScheduledTasks().then((tasks) => {
                const t = tasks.find((x) => x.Key === key);
                if (t) {
                    void api.startScheduledTask(t.Id).then(() => {
                        db?.alert(label + ' started!');
                    });
                } else {
                    db?.alert('Task not found: ' + key);
                }
            });
            closeSpeedDial();
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
            const db = getDashboard();
            if (!api) return;
            void api.getScheduledTasks().then((tasks) => {
                const tagTask = tasks.find((x) => x.Key === 'HomeScreenCompanionSyncTask');
                const hscTask = tasks.find((x) => x.Key === 'HomeSectionSyncTask');
                const promises: Promise<unknown>[] = [];
                if (tagTask) promises.push(api.startScheduledTask(tagTask.Id));
                if (hscTask) promises.push(api.startScheduledTask(hscTask.Id));
                void Promise.all(promises).then(() => {
                    db?.alert('Full sync started!');
                });
            });
            closeSpeedDial();
        });

        function beforeUnloadHandler(e: BeforeUnloadEvent): void {
            if (hasDirtyStateFn()) {
                e.preventDefault();
                e.returnValue = '';
            }
        }

        view.querySelectorAll<HTMLElement>('.page-tab-btn').forEach((btn) => {
            btn.addEventListener('click', function () {
                const target = this.getAttribute('data-page-tab');
                const wasDirty = hasDirtyStateFn();
                if (wasDirty && !confirm('You have unsaved changes. Leave this tab and discard changes?')) return;
                if (wasDirty) void loadConfigFn();
                view.querySelectorAll<HTMLElement>('.page-tab-btn').forEach((b) => { b.classList.remove('active'); });
                this.classList.add('active');
                view.querySelectorAll<HTMLElement>('.page-tab-content').forEach((c) => { c.style.display = 'none'; });
                const tgt = view.querySelector<HTMLElement>('#tab' + (target || ''));
                if (tgt) tgt.style.display = '';

                if (target === 'HomeCompanion') {
                    const hscContainer = view.querySelector<HTMLElement>('#hscContainer');
                    if (hscContainer && !hscContainer.dataset.loaded) {
                        loadHscUsers(view, hscDeps());
                    }
                    const manageContainer = view.querySelector<HTMLElement>('#hscManageContainer');
                    if (manageContainer && !manageContainer.dataset.loaded) {
                        loadHscManageTabFn(view);
                    }
                } else if (target === 'Cleanup') {
                    const container2 = view.querySelector<HTMLElement>('#tcManageContainer');
                    if (container2 && !container2.dataset.loaded) loadTagManageTabFn(view);
                } else if (target === 'TopLists') {
                    const tlContainer = view.querySelector<HTMLElement>('#tlContainer');
                    if (tlContainer && !tlContainer.dataset.loaded) loadTopListsTabFn(view);
                }
            });
        });

        view.addEventListener('change', (e) => {
            const cb = (e.target as Element | null)?.closest<HTMLInputElement>('.chkShowApiKey');
            if (!cb) return;
            const input = view.querySelector<HTMLInputElement>('#' + (cb.dataset.target || ''));
            if (input) input.type = cb.checked ? 'text' : 'password';
        });

        view.addEventListener('click', (e) => {
            const header = (e.target as Element | null)?.closest<HTMLElement>('.settings-panel-toggle');
            if (header) {
                const panel = header.closest<HTMLElement>('.settings-panel');
                if (panel) {
                    const body = panel.querySelector<HTMLElement>('.settings-panel-body');
                    const chevron = header.querySelector<HTMLElement>('.settings-panel-chevron');
                    if (body) {
                        const isOpen = body.style.display !== 'none';
                        body.style.display = isOpen ? 'none' : 'block';
                        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
                    }
                }
                return;
            }
        });

        view.addEventListener('click', (e) => {
            const btn = (e.target as Element | null)?.closest<HTMLElement>('.hsc-sub-tab-btn');
            if (!btn) return;
            const target = btn.getAttribute('data-hsc-tab');
            view.querySelectorAll<HTMLElement>('.hsc-sub-tab-btn').forEach((b) => { b.classList.remove('active'); });
            btn.classList.add('active');
            view.querySelectorAll<HTMLElement>('.hsc-sub-tab-content').forEach((c) => { c.style.display = 'none'; });
            if (target === 'copy') {
                const tgt = view.querySelector<HTMLElement>('#hscSubTabCopy');
                if (tgt) tgt.style.display = '';
                const hscContainer = view.querySelector<HTMLElement>('#hscContainer');
                if (hscContainer && !hscContainer.dataset.loaded) loadHscUsers(view, hscDeps());
            } else if (target === 'manage') {
                const tgt = view.querySelector<HTMLElement>('#hscSubTabManage');
                if (tgt) tgt.style.display = '';
                const manageContainer = view.querySelector<HTMLElement>('#hscManageContainer');
                if (manageContainer && !manageContainer.dataset.loaded) loadHscManageTabFn(view);
            }
        });
}