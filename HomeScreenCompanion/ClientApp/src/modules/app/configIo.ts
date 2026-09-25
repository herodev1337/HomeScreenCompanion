/**
 * Config load / save / dirty-state helpers for the legacy config page.
 *
 * Lifted from `modules/index.ts:1119-1430`. Three functions live here:
 *
 *   - `loadConfig`      `legacy.js:7037` — fetch `PluginConfiguration`,
 *                       populate form fields, seed saved-state snapshot.
 *   - `hasDirtyState`   `legacy.js:7173` — quick "is anything unsaved?"
 *                       gate (save button enabled OR cleanup tab pending).
 *   - `doSave`          `legacy.js:7182` — full save pipeline (HSC +
 *                       top-list exclusions, ApplyTagHomeSections fan-out,
 *                       tag `LastModified` touch).
 *   - `submitFormHandler` form-submit wrapper that flushes dirty top-list
 *                       rows before delegating to `doSave`.
 *
 * Every entry point takes a {@link ConfigIoDeps} argument carrying the
 * factory's typed state bag and a small set of pre-bound closures, so
 * this module is pure relative to module scope — it reads no globals and
 * holds no state. The factory owns `currentView` and threads it
 * explicitly through the `view` parameter.
 */

import { groupConfigTags } from '../config/configState';
import { updateDryRunWarning } from '../config/configState';
import { updateSystemPromptResetBtn } from '../systemPrompt/updateSystemPromptResetBtn';
import { sortRows } from '../logs/logModal';
import { applyFilters } from '../config/configState';
import type { TagConfig } from '../config/types/index';
import type { SavedFilter } from '../filters/savedFilters';
import type { AppState } from '../state/state';
import { PLUGIN_ID } from '../state/state';
import type { WindowApiClient, WindowDashboard } from './apiAdapter';

/**
 * What {@link loadConfig} and {@link doSave} need from the factory to
 * run: a live `AppState`, the pre-bound `getUiConfig` closure, a way to
 * look up `Dashboard.alert` / `processPluginConfigurationUpdateResult`,
 * the `WindowApiClient` (or `undefined` when the global is absent), and a
 * per-mount `renderTagGroup` helper (the latter closure reads through
 * `appState` so it can't be lifted further without a deps object).
 */
export interface ConfigIoDeps {
    readonly appState: AppState;
    readonly currentView: () => HTMLElement | null;
    readonly getApi: () => WindowApiClient | undefined;
    readonly getDashboard: () => WindowDashboard | undefined;
    readonly boundGetUiConfig: (view: HTMLElement, forComparison: boolean) => unknown;
    readonly renderTagGroup: (
        tagConfig: unknown,
        container: HTMLElement | null,
        prepend: boolean,
        idx: number | undefined,
        isNew: boolean,
        afterRef: HTMLElement | null | undefined,
    ) => void;
    readonly preFetchLibraryData: (deps: { getApiClient: () => unknown; cache: AppState['hseUserCache'] }) => Promise<unknown>;
    readonly setupRow: (row: HTMLElement) => void;
    readonly checkFormStateBound: () => void;
}

/**
 * Fetch the plugin configuration, populate every form field, and seed
 * the pristine-config snapshot so the dirty-state checker has a baseline
 * to compare against.
 *
 * Side effects (mirrors `legacy.js:7037` byte-for-byte):
 *   - invalidates `appState.hseUserCache.libraryPromise`
 *   - kicks off `preFetchLibraryData` (non-awaited)
 *   - resets every `#chkFilter*` checkbox to unchecked
 *   - resets `#txtSearchTags` and toggles `applyFilters`
 *   - sorts the rows via {@link sortRows} / `localStorage` `Manual` default
 *   - sets the `originalConfigState` snapshot via
 *     `requestAnimationFrame`, then pings `checkFormStateBound` and
 *     {@link updateDryRunWarning}
 *
 * @param deps  Factory context. `currentView()` returns the current view
 *              element (or `null` before `viewshow` runs).
 * @returns     Resolves with `void`. Resolves to `undefined` immediately
 *              when there is no view or no `ApiClient` available.
 */
export function loadConfig(deps: ConfigIoDeps): Promise<void> {
    const view = deps.currentView();
    if (!view) return Promise.resolve();
    const api = deps.getApi();
    if (!api) return Promise.resolve();

    deps.appState.hseUserCache.libraryPromise = null;
    void deps.preFetchLibraryData({ getApiClient: () => api, cache: deps.appState.hseUserCache });

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

        deps.appState.hsc.config = {
            HomeSyncEnabled: cfg.HomeSyncEnabled || false,
            HomeSyncLibraryOrder: cfg.HomeSyncLibraryOrder || false,
            HomeSyncSourceUserId: cfg.HomeSyncSourceUserId || '',
            HomeSyncTargetUserIds: cfg.HomeSyncTargetUserIds || [],
        };
        deps.appState.savedFilters.filters = cfg.SavedFilters || [];

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

        deps.appState.topLists.tagNames = new Set((cfg.TopLists || []).map((tl) => (tl.TagName || '').toLowerCase()).filter(Boolean));

        const grouped = groupConfigTags(((cfg.Tags || []) as readonly TagConfig[]));
        const c2 = view.querySelector<HTMLElement>('#tagListContainer');
        if (!c2) return;

        const keys = Object.keys(grouped);
        keys.forEach((k, i) => { deps.renderTagGroup(grouped[k], c2, false, i, false, null); });
        if (keys.length === 0) {
            deps.renderTagGroup({ Tag: '', Urls: [{ url: '', limit: 0 }], Active: true }, c2, false, 0, false, null);
        }

        const savedSort = localStorage.getItem('HomeScreenCompanion_SortBy') || 'Manual';
        sortRows(c2, savedSort);
        applyFilters(view);
        requestAnimationFrame(() => {
            try {
                deps.appState.originalConfigState.setOriginalConfigState(JSON.stringify(deps.boundGetUiConfig(view, true)));
            } catch {
                deps.appState.originalConfigState.setOriginalConfigState(null);
            }
            deps.checkFormStateBound();
            updateDryRunWarning(deps.appState.originalConfigState.getOriginalConfigState());
        });
    });
}

/**
 * Quick gate: are *any* unsaved changes pending? Returns `true` when
 * the save button is enabled OR the cleanup tab has a pending batch.
 * Used by the page-tab switcher to prompt before discarding edits.
 *
 * @param deps  Factory context. `currentView()` returns the current view.
 * @returns     `true` if the user has unsaved work; `false` otherwise.
 */
export function hasDirtyState(deps: ConfigIoDeps): boolean {
    const view = deps.currentView();
    if (!view) return false;
    const btnSave = view.querySelector<HTMLButtonElement>('.btn-save');
    if (btnSave && !btnSave.disabled) return true;
    const tcContainer = view.querySelector<HTMLElement>('#tcManageContainer') as (HTMLElement & { _tcHasPending?: boolean }) | null;
    if (tcContainer && tcContainer._tcHasPending) return true;
    return false;
}

/**
 * Full save pipeline. Mirrors `legacy.js:7182`:
 *   1. If the cleanup tab has a pending batch, open the modal and bail
 *      (the modal owns that flow).
 *   2. Flush `#btnApplyManage` first (manage-tab order save).
 *   3. Read `getUiConfig(view, false)`, diff each tag against the
 *      pristine snapshot to set `LastModified`.
 *   4. Refetch the current server-side config to preserve orphan
 *      `HomeSectionTracked` / `PlaylistMappings`, fold the top-list
 *      exclude-view-id expansions in via `preFetchLibraryData`.
 *   5. `updatePluginConfiguration(PLUGIN_ID, …)`, then
 *      `processPluginConfigurationUpdateResult(result)`.
 *   6. Fan out a `HomeScreenCompanion/Hsc/ApplyTagHomeSections` POST per
 *      tag with non-`hsc__` tracked sections.
 *
 * No-op when `currentView()` is `null` or `ApiClient` is absent.
 *
 * @param deps  Factory context.
 */
export function doSave(deps: ConfigIoDeps): void {
    const view = deps.currentView();
    if (!view) return;

    const cleanupTab = view.querySelector<HTMLElement>('#tabCleanup');
    const tcContainer = view.querySelector<HTMLElement>('#tcManageContainer') as (HTMLElement & { _tcShowModal?: () => void; _tcHasPending?: boolean }) | null;
    if (cleanupTab && cleanupTab.style.display !== 'none' && tcContainer && tcContainer._tcHasPending && tcContainer._tcShowModal) {
        tcContainer._tcShowModal();
        return;
    }

    const configObj = deps.boundGetUiConfig(view, false) as {
        Tags?: Record<string, unknown>[];
        TopLists?: unknown[];
    };

    const originalConfStr = deps.appState.originalConfigState.getOriginalConfigState();
    if (!originalConfStr) return;
    const originalConf = JSON.parse(originalConfStr) as { Tags?: unknown[] };
    const originalTags = groupConfigTags(((originalConf.Tags || []) as readonly TagConfig[]));

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

    const api = deps.getApi();
    if (!api) return;
    void api.getPluginConfiguration(PLUGIN_ID).catch(() => ({ Tags: [] })).then((currentConfig) => {
        const cc = currentConfig as { Tags?: unknown[]; TopLists?: unknown[] };
        const currentGrouped = groupConfigTags(((cc.Tags || []) as readonly TagConfig[]));
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

        return deps.preFetchLibraryData({ getApiClient: () => api, cache: deps.appState.hseUserCache }).then((libData) => {
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
        deps.getDashboard()?.processPluginConfigurationUpdateResult(r);
        deps.appState.topLists.tagNames = new Set((configObj.TopLists || []).map((tl: unknown) => {
            const t = tl as { TagName?: string };
            return (t.TagName || '').toLowerCase();
        }).filter(Boolean));

        const newGrouped = groupConfigTags((configObj.Tags || []) as unknown as readonly TagConfig[]);
        if (view) view.querySelectorAll<HTMLElement>('.tag-row').forEach((row) => {
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

        deps.appState.originalConfigState.setOriginalConfigState(JSON.stringify(deps.boundGetUiConfig(view, true)));
        deps.checkFormStateBound();
        updateDryRunWarning(deps.appState.originalConfigState.getOriginalConfigState());

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

/**
 * Form-submit wrapper. Flushes any `.tag-body[data-dirty="1"]` rows in
 * `#tlContainer` (the top-list edit mode) before delegating to
 * {@link doSave}. Mirrors `legacy.js:7591` — on top-list save failure
 * the save button is restored and a `Dashboard.alert` is raised.
 *
 * @param e      The submit `Event`.
 * @param deps   Factory context.
 */
export function submitFormHandler(e: Event, deps: ConfigIoDeps): void {
    e.preventDefault();
    const view = deps.currentView();
    if (!view) return;
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
            doSave(deps);
        }).catch((err) => {
            if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
            const errMsg = (err instanceof Error) ? err.message : String(err);
            window.alert('Failed to save top-list changes: ' + errMsg);
        });
        return;
    }
    doSave(deps);
}
