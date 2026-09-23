// Phase 3: saved-filters helpers, leaf module.
//
// Pure helpers lifted verbatim from `Configuration/configPage.js`
// (legacy.js:1257-1272). One function here, a pure strings-in /
// strings-out HTML builder:
//
//   - `getMySavedFiltersPanelHtml(savedFilters)` — renders the list
//     of saved media-info filter sets the user can apply or delete.
//
// `escapeHtml` (legacy.js:1218) lives in the parallel date+dom wave's
// `modules/dom/dom.ts` as its canonical home. We re-export it from
// there so this module is self-contained for callers that already
// import from `savedFilters.ts` — there's no risk of two divergent
// copies drifting in lockstep.
//
// The two remaining helpers in this neighborhood are lifted below using
// the Phase 5 deps pattern (DOM globals + `ApiClient` are the only direct
// environment touches):
//
//   - `refreshMySavedFiltersPanels(savedFilters)` — DOM-only; the
//     module-scope `savedFilters` array is an explicit parameter.
//   - `saveSavedFiltersNow(deps)` — persistence; the module-scope
//     `savedFilters` array, `originalConfigState` string, `pluginId`
//     constant, and `checkFormState` callback are all explicit deps
//     members (never module-level mutable state).

import { escapeHtml } from '../dom/dom';

export { escapeHtml };

/**
 * A persisted user-named bundle of media-info filter groups. Stored
 * in plugin configuration under `SavedFilters` and read back at
 * render time.
 *
 * `Filters` is loosely typed here as `readonly MediaInfoFilterGroup[]`
 * — only the shape of `Name` and the array contract are used by
 * `getMySavedFiltersPanelHtml`. The richer rendering of an individual
 * `Filters[i]` is owned by `getMediaInfoFilterGroupHtml` (still in
 * legacy.js, deferred).
 */
export interface MediaInfoFilterGroup {
    Operator: string;
    GroupOperator: string;
    Criteria: readonly string[];
}

export interface SavedFilter {
    Name: string;
    Filters: readonly MediaInfoFilterGroup[];
}

/**
 * Render the "My Saved Filters" panel content.
 *
 * For an empty list, returns a single italic placeholder. For a
 * non-empty list, returns a `<div>` containing one pair of buttons
 * per saved filter: a primary "apply" button (carries the human-
 * readable `Name`, escaped) and a small ✕ "delete" button. Each
 * button exposes its index via `data-index` so the click handler
 * (legacy.js:2189, 2198) can look up the right entry.
 *
 * The panel is lifted as a pure function: the caller (the DOM-toucher
 * `refreshMySavedFiltersPanels` in legacy.js:1274, plus the inline
 * template at legacy.js:1638) is responsible for passing the current
 * `savedFilters` array. This matches the same parameterization
 * pattern used in `criteria.ts` for `buildCriterion` / `parseCriterion`.
 *
 * @param savedFilters  The current list of saved filters. Read-only;
 *                      never mutated.
 */
export function getMySavedFiltersPanelHtml(savedFilters: readonly SavedFilter[]): string {
    if (savedFilters.length === 0) {
        return '<div style="font-size:0.82em; color:var(--theme-text-secondary); font-style:italic; margin-bottom:4px;">No saved filters yet.</div>';
    }
    return '<div style="display:flex; flex-wrap:wrap; gap:6px;">' +
        savedFilters.map((sf, i) =>
            '<div style="display:flex; align-items:center; gap:0;">' +
                '<button type="button" class="btnApplyMySavedFilter" data-index="' + i + '"' +
                ' style="border:1.5px solid #000; border-radius:14px 0 0 14px; padding:4px 10px; font-size:0.82em; cursor:pointer; background:transparent; color:var(--theme-text-primary);">' +
                escapeHtml(sf.Name) + '</button>' +
                '<button type="button" class="btnDeleteMySavedFilter" data-index="' + i + '"' +
                ' style="border:1.5px solid #000; border-left:none; border-radius:0 14px 14px 0; background:transparent; color:#cc3333; cursor:pointer; padding:4px 8px; font-size:0.82em; line-height:1;" title="Delete">✕</button>' +
                '</div>'
        ).join('') +
        '</div>';
}

/**
 * The two Jellyfin `ApiClient` methods `saveSavedFiltersNow` touches.
 */
export interface SavedFiltersApiClient {
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
}

/**
 * Dependencies for {@link saveSavedFiltersNow} — the lifted legacy
 * module-scope state and callbacks:
 *
 *   - `getSavedFilters`        the current `savedFilters` array. A getter
 *                              rather than a snapshot because the legacy
 *                              code reads the array at two different
 *                              points across the promise chain.
 *   - `getOriginalConfigState` / `setOriginalConfigState`
 *                              the legacy `originalConfigState` JSON
 *                              string (read twice: truthiness gate +
 *                              `JSON.parse`; written once).
 *   - `pluginId`               the plugin GUID constant
 *                              (`"7c10708f-43e4-4d69-923c-77d01802315b"`).
 *   - `getApiClient`           `window.ApiClient`.
 *   - `checkFormState`         the closure target (legacy.js:3482).
 */
export interface SavedFiltersSaveDeps {
    readonly getSavedFilters: () => readonly SavedFilter[];
    readonly getOriginalConfigState: () => string | null;
    readonly setOriginalConfigState: (value: string | null) => void;
    readonly pluginId: string;
    readonly getApiClient: () => SavedFiltersApiClient;
    readonly checkFormState: () => void;
}

/**
 * Refresh every "My Saved Filters" panel in the config page with the
 * current list (legacy.js:1274).
 *
 * Legacy reads the module-scope `savedFilters`; here it is an explicit
 * parameter. The function is a no-op when the config page
 * (`#HomeScreenCompanionConfigPage`) is not mounted.
 *
 * @param savedFilters  The current list of saved filters. Read-only.
 */
export function refreshMySavedFiltersPanels(savedFilters: readonly SavedFilter[]): void {
    const v = document.querySelector('#HomeScreenCompanionConfigPage');
    if (!v) return;
    const html = getMySavedFiltersPanelHtml(savedFilters);
    v.querySelectorAll('.mi-saved-panel-content').forEach((el) => {
        el.innerHTML = html;
    });
}

/**
 * Persist the current saved-filters list to the plugin configuration
 * (legacy.js:1283).
 *
 * Byte-for-byte legacy semantics:
 *   1. `getPluginConfiguration(pluginId)` resolves the current config;
 *      the LIVE `savedFilters` array reference is assigned to its
 *      `SavedFilters` member and the config is written back via
 *      `updatePluginConfiguration(pluginId, config)`.
 *   2. On success, when `originalConfigState` is truthy: `JSON.parse` it,
 *      stamp `SavedFilters` on the parsed value, and write the re-
 *      stringified form back. Errors are swallowed (legacy `catch (e) {}`),
 *      including the `null` parse result where the property write throws.
 *      NOTE: the legacy factory is sloppy-mode JS, so a property write to
 *      a primitive parse result is silently ignored but the re-stringify
 *      STILL runs — that quirk is replicated here (strict TS cannot
 *      silently ignore, so the write is skipped while the stringify
 *      still overwrites the state).
 *   3. If the config page is mounted, `checkFormState()` runs — even
 *      when the originalConfigState branch above swallowed an error.
 *
 * Like the legacy function, a rejected `getPluginConfiguration` or
 * `updatePluginConfiguration` promise is NOT caught.
 */
export function saveSavedFiltersNow(deps: SavedFiltersSaveDeps): void {
    deps.getApiClient()
        .getPluginConfiguration(deps.pluginId)
        .then((currentConfig) => {
            currentConfig.SavedFilters = deps.getSavedFilters();
            return deps.getApiClient().updatePluginConfiguration(deps.pluginId, currentConfig);
        })
        .then(() => {
            const original = deps.getOriginalConfigState();
            if (original) {
                try {
                    const state: unknown = JSON.parse(original);
                    if (state === null) {
                        // Legacy: `null.SavedFilters = …` throws, so the
                        // stringify overwrite is skipped entirely.
                    } else if (typeof state === 'object') {
                        (state as { SavedFilters?: unknown }).SavedFilters = deps.getSavedFilters();
                        deps.setOriginalConfigState(JSON.stringify(state));
                    } else {
                        // Legacy sloppy-mode: the property write on a
                        // primitive is silently ignored, but
                        // `JSON.stringify(state)` still overwrites
                        // originalConfigState.
                        deps.setOriginalConfigState(JSON.stringify(state));
                    }
                } catch {
                    // Legacy swallows JSON.parse errors verbatim.
                }
            }
            const view = document.querySelector('#HomeScreenCompanionConfigPage');
            if (view) deps.checkFormState();
        });
}
