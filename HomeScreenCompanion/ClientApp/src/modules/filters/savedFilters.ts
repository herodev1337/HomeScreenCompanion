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
// The remaining helpers in this neighborhood (`refreshMySavedFiltersPanels`
// at legacy.js:1274, `saveSavedFiltersNow` at legacy.js:1283) are
// deferred — they touch DOM, the Jellyfin `ApiClient`, the
// `originalConfigState` module-scope var, and the `checkFormState`
// callback. Wiring those through Phase 5's shared-state extraction
// without rewriting their semantics is out of scope here.

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
