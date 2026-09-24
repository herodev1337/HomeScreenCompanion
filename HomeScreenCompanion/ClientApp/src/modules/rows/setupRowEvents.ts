/**
 * Phase 5: row event wiring — lifted from `ClientApp/src/legacy.js`
 * lines 1873-2583 (the entire `setupRowEvents(row)` body).
 *
 * This is the densest DOM/event code in the legacy config page: every
 * interaction that happens inside one tag row (tag-row tabs, expand/
 * collapse, active toggle, source-type change, schedule add/remove,
 * MI filter add/remove, saved-filter save/apply/delete, run-group,
 * drag/drop reorder, touch reorder, poster upload/load, run-entry
 * action) is wired here.
 *
 * The three local closures `updateBadges`, `updateRunGroupBtn`, and
 * `updateTagTitle` are defined inside `setupRowEvents` so they capture
 * `row` and the deps bag. They are also written back to the deps object
 * (`deps.updateBadges`, `deps.updateRunGroupBtn`, `deps.updateTagTitle`)
 * so the parallel `renderTagGroup` extraction can call them after a
 * row is appended without rebuilding the closure surface.
 *
 * Module-scope state that the legacy closure reached for has been
 * lifted onto the typed deps surface:
 *
 *   - `savedFilters`        (`state.ts` `SavedFiltersState`)
 *   - `topLists`            (`state.ts` `TopListsState`, lower-cased tag names)
 *   - `originalConfigState` (`state.ts` `OriginalConfigStateRef`)
 *   - `miFilterDeps`        (`MiFilterDeps` — users / collections / playlists / tags)
 *   - `initHomeSectionTab`, `initPlaylistTab`, `updateHseSectionAvailability`
 *                           pre-bound by the factory with their typed sub-deps
 *                           (`form.ts`).
 *   - `checkFormState`      pre-bound by the factory (`configState.ts`).
 *   - `saveSavedFiltersNow` pre-bound by the factory (`savedFilters.ts`).
 *   - `isScheduleCurrentlyActive`, `readIntervalsFromRow` — still in
 *                           legacy.js; passed through until the next
 *                           extraction wave.
 *   - `getSourceBadgeHtml`, `renderTagGroup`, `applyFilters`,
 *     `refreshStatus`, `miPresets` — still in legacy.js (or extracted
 *     but kept as deps for the parallel `renderTagGroup` call).
 *   - `view`                the `#HomeScreenCompanionConfigPage` root the
 *                           factory closes over. Used for the
 *                           `applyFilters(view)` / `refreshStatus(view)`
 *                           / `#btn-save` lookups. The btnRunEntry
 *                           handler also re-derives `view` via
 *                           `row.closest('#HomeScreenCompanionConfigPage')`
 *                           for symmetry with legacy.
 *
 * The lifted `getSourceBadgeHtml` is passed through deps; the lifted
 * `MiFilterDeps` is forwarded into `getMiValueHtml` /
 * `getMediaInfoRuleHtml` (the lifted `miFilters.ts` API takes a
 * `MiFilterDeps` argument that the legacy single-argument form did
 * not — preserving the legacy visual output requires the factory to
 * pass the live users / collections / playlists / tags).
 *
 * No behavior changes versus legacy.js. Touch / drag handlers are
 * preserved verbatim (including the detached `.sort-placeholder`
 * quirk on `touchmove` / `touchend`).
 */
import { getDragAfterElement, getUrlRowHtml } from '../dom/dom';
import {
    getMediaInfoFilterGroupHtml,
    getMediaInfoRuleHtml,
    getMiHintHtml,
    getMiValueHtml,
    readMiFiltersFromContainer,
} from '../filters/miFilters';
import { getDateRowHtml, getLocalRowHtml, readRowAsConfig } from '../filters/rows';
import type {
    MediaInfoFilterGroup,
    SavedFilter,
    SavedFiltersApiClient,
} from '../filters/savedFilters';
import type { MiFilterDeps } from '../filters/miFilters';
import type { ScheduleInterval } from '../filters/rows';
import type {
    SavedFiltersState,
    TopListsState,
    OriginalConfigStateRef,
} from '../state/state';

/**
 * The legacy `isScheduleCurrentlyActive(intervals)` signature
 * (`legacy.js:1302`). Returns true when any of `intervals` covers the
 * current moment (SpecificDate range, EveryYear month/day, or Weekly
 * day-of-week match).
 */
export type IsScheduleCurrentlyActiveFn = (
    intervals: readonly ScheduleInterval[],
) => boolean;

/**
 * The legacy `readIntervalsFromRow(row)` signature (`legacy.js:1327`).
 * Reads every `.date-row` descendant of `row` and produces the
 * `ScheduleInterval[]` payload the schedule badge code consumes.
 */
export type ReadIntervalsFromRowFn = (
    row: HTMLElement,
) => ScheduleInterval[];

/**
 * The legacy `getSourceBadgeHtml(sourceType)` signature
 * (`legacy.js:1350`). Returns the small icon-and-tooltip HTML for
 * the row's source-type indicator.
 */
export type GetSourceBadgeHtmlFn = (sourceType: string) => string;

/**
 * The legacy `applyFilters(view)` signature (`legacy.js:3530`,
 * extracted to `modules/config/configState.ts`). Re-applies the
 * filter chips + search term to every `.tag-row` under `view`.
 */
export type ApplyFiltersFn = (view: HTMLElement) => void;

/**
 * The legacy `refreshStatus(view)` signature (`legacy.js:2679`,
 * still in legacy.js). Polls the plugin's `/RunStatus` endpoint and
 * updates the live status DOM inside `view`.
 */
export type RefreshStatusFn = (view: HTMLElement) => void;

/**
 * The legacy `renderTagGroup(tagConfig, container, prepend, index, isNew, afterRef)`
 * signature (`legacy.js:1363`). Re-renders a tag row — invoked from
 * `.btnDuplicateRow` with the `isNew=true` flag so the new row's
 * `setupRowEvents` is also wired up.
 */
export type RenderTagGroupFn = (
    tagConfig: ReturnType<typeof readRowAsConfig>,
    container: HTMLElement | null,
    prepend: boolean,
    index: number | undefined,
    isNew: boolean,
    afterRef?: HTMLElement | null,
) => void;

/**
 * One preset category as it appears in the legacy `MI_PRESETS` array
 * (`legacy.js:948`): a human-readable label and an ordered list of
 * preset entries. Each entry has a `name` (rendered in the panel)
 * and a `build()` function that returns the filter groups to insert
 * when the preset is applied.
 */
export interface MiPreset {
    readonly name: string;
    readonly build: () => MediaInfoFilterGroup[];
}

export interface MiPresetCategory {
    readonly label: string;
    readonly presets: readonly MiPreset[];
}

/**
 * Dependencies for `setupRowEvents`. The factory builds this object
 * once per page mount; `setupRowEvents` populates the three closure
 * slots (`updateBadges`, `updateRunGroupBtn`, `updateTagTitle`) before
 * wiring any events, so callers (most notably `renderTagGroup`) can
 * read those closures back off the same object.
 */
export interface SetupRowEventsDeps {
    /** Lifted `savedFilters` state — mutated in place by the save/delete handlers. */
    readonly savedFilters: SavedFiltersState;
    /** Lifted `_topListTagNames` set (lower-cased tag names). */
    readonly topLists: TopListsState;
    /** Lifted `originalConfigState` ref — kept on the surface for parity with future pre-bound `saveSavedFiltersNow`. */
    readonly originalConfigState: OriginalConfigStateRef;
    /** Lifted MI dropdown sources (users / collections / playlists / tags) — forwarded to the lifted `miFilters.ts` builders. */
    readonly miFilterDeps: MiFilterDeps;

    /** Jellyfin `ApiClient` — needed by `saveSavedFiltersNow` to persist saved filters. */
    readonly getApiClient: () => SavedFiltersApiClient;
    /** Plugin GUID — passed to `saveSavedFiltersNow`. */
    readonly pluginId: string;

    /** Pre-bound `initHomeSectionTab(row)` (`form.ts`). */
    readonly initHomeSectionTab: (row: HTMLElement) => void;
    /** Pre-bound `initPlaylistTab(row)` (`form.ts`). */
    readonly initPlaylistTab: (row: HTMLElement) => void;
    /** Pre-bound `updateHseSectionAvailability(row)` (`form.ts`). */
    readonly updateHseSectionAvailability: (row: HTMLElement) => void;
    /** Pre-bound `checkFormState()` (`configState.ts`). */
    readonly checkFormState: () => void;
    /** Pre-bound `saveSavedFiltersNow()` (`savedFilters.ts`). */
    readonly saveSavedFiltersNow: () => void;
    /** Pure helper — `refreshMySavedFiltersPanels(savedFilters)` (`savedFilters.ts`). */
    readonly refreshMySavedFiltersPanels: (savedFilters: readonly SavedFilter[]) => void;

    /** Pure helper — `getMaxDays(month)` (`date-intervals.ts`). */
    readonly getMaxDays: (month: number) => number;
    /** Pure helper — `getDayOptions(selectedDay, maxDay)` (`date-intervals.ts`). */
    readonly getDayOptions: (selectedDay: number, maxDay: number) => string;

    /** Still in legacy.js — `isScheduleCurrentlyActive(intervals)`. */
    readonly isScheduleCurrentlyActive: IsScheduleCurrentlyActiveFn;
    /** Still in legacy.js — `readIntervalsFromRow(row)`. */
    readonly readIntervalsFromRow: ReadIntervalsFromRowFn;
    /** Still in legacy.js — `getSourceBadgeHtml(sourceType)`. */
    readonly getSourceBadgeHtml: GetSourceBadgeHtmlFn;
    /** Still in legacy.js — `renderTagGroup(...)`. */
    readonly renderTagGroup: RenderTagGroupFn;
    /** Extracted (`configState.ts`) — `applyFilters(view)`. */
    readonly applyFilters: ApplyFiltersFn;
    /** Still in legacy.js — `refreshStatus(view)`. */
    readonly refreshStatus: RefreshStatusFn;
    /** Still in legacy.js — the `MI_PRESETS` table for the preset panel. */
    readonly miPresets: readonly MiPresetCategory[];

    /** The config page root (`#HomeScreenCompanionConfigPage`). */
    readonly view: HTMLElement;
    /** `Dashboard.alert` analog. */
    readonly alert: (message: string) => void;

    /** Closure populated by `setupRowEvents` — recompute the badge indicators for one row. */
    updateBadges: (row: HTMLElement) => void;
    /** Closure populated by `setupRowEvents` — toggle `.btnRunEntry` enabled-state. */
    updateRunGroupBtn: (row: HTMLElement) => void;
    /** Closure populated by `setupRowEvents` — sync the row title and placeholders. */
    updateTagTitle: (row: HTMLElement) => void;
}

/**
 * Re-export so the deps surface stays self-contained for the factory.
 */
export type { SavedFilter };

/**
 * Read the `row.dataset.tag` lower-cased. Used by `updateBadges` to
 * look up the row in the `_topListTagNames` set. Empty string when
 * the row has no `data-tag` attribute.
 */
function rowTagLower(row: HTMLElement): string {
    return (row.dataset.tag || '').toLowerCase();
}

/**
 * Compute the schedule-badge text + class for `row`. Pulled out of
 * `updateBadges` so the badge builder stays readable. The
 * `hasOverride` flag drives the "priority" copy; the active flag is
 * `isScheduleCurrentlyActive(readIntervalsFromRow(row))`.
 */
function buildScheduleBadgeHtml(
    row: HTMLElement,
    deps: SetupRowEventsDeps,
): string {
    const overrideChk = row.querySelector<HTMLInputElement>('.chkOverrideWhenActive');
    const hasSchedule = row.querySelectorAll('.date-row').length > 0;
    const hasOverride = hasSchedule && !!overrideChk && overrideChk.checked;
    const schedPriorityClass = hasOverride ? ' priority-active' : '';
    const schedActiveClass = deps.isScheduleCurrentlyActive(deps.readIntervalsFromRow(row))
        ? ' schedule-active'
        : '';
    const schedText = hasOverride ? 'Schedule priority' : 'Schedule';
    return (
        '<span class="tag-indicator schedule' +
        schedPriorityClass +
        schedActiveClass +
        '"><i class="md-icon" style="font-size:1.1em;">calendar_today</i> ' +
        schedText +
        '</span>'
    );
}

/**
 * Wire every event handler that the legacy `setupRowEvents(row)`
 * body (`legacy.js:1873-2583`) attaches to one tag row.
 *
 * Side effects, in legacy order:
 *
 *   1. Define the three inner closures (`updateBadges`,
 *      `updateRunGroupBtn`, `updateTagTitle`) and publish them on
 *      `deps` so the parallel `renderTagGroup` extraction can reuse
 *      them.
 *   2. Tag-tab clicks (`data-tab` on `.tag-tab`): toggle visibility
 *      of `.general-tab` / `.tagname-tab` / `.schedule-tab` /
 *      `.collection-tab` / `.advanced-tab` / `.homescreen-tab` /
 *      `.playlist-tab`, then lazily initialize the HomeSection /
 *      Playlist sub-tabs via `deps.initHomeSectionTab` /
 *      `deps.initPlaylistTab`. Auto-resize every
 *      `textarea.txtMiValue` / `textarea.txtTagBlacklist` in the
 *      activated tab.
 *   3. Delegated `change` on the row: handles `.selSourceType`
 *      (show/hide the external / local / mediainfo / AI sub-blocks,
 *      apply the source-type hint, refresh `.mi-presets-section` /
 *      `.mi-limit-row` / `.mi-help-btn-row` / `.mi-toggle-row` /
 *      `.mi-filter-body`, seed an empty filter group when switching
 *      to MediaInfo), `.selMiProperty` (re-render the value controls
 *      via `getMiValueHtml` / `getMiHintHtml` and ping
 *      `updateHseSectionAvailability`), `.selMiUser` (same),
 *      `.selMiValue` (toggle `.mi-include-parent` on
 *      `MediaType:Episode`), `.selDateType` (toggle the
 *      inputs-specific / inputs-annual / inputs-weekly sub-blocks),
 *      `.selStartMonth` / `.selEndMonth` (recompute the day `<select>`
 *      via `getMaxDays` + `getDayOptions`). Always ends with
 *      `setTimeout(checkFormState, 0)`.
 *   4. Header click (`expand / collapse`): flip `.tag-body` display
 *      and swap the `.expand-icon` glyph; when expanding, auto-size
 *      the `textarea`s in the body.
 *   5. `.chkTagActive` change → swap `.lblActiveStatus`, toggle the
 *      `.inactive` class on the row, call `updateRunGroupBtn`. The
 *      initial call also happens once at the end so the button picks
 *      up the persisted state.
 *   6. `.chkEnableTag` / `.chkEnableCollection` / `.chkEnablePlaylist`
 *      / `.chkOverrideWhenActive` / `.chkEnableHomeSection` changes
 *      → show/hide the corresponding `.tag-settings` /
 *      `.collection-settings` / `.playlist-settings` /
 *      `.hse-details` panels and call `updateBadges` (and
 *      `updateHseSectionAvailability` where applicable).
 *   7. Optional `.chkAiRecentlyWatched` change → toggle the
 *      `.ai-recently-watched-options` panel.
 *   8. Optional `.selAiProvider` change → toggle the
 *      `.ollama-experimental-warning` panel.
 *   9. `.btnAddUrl` / `.btnAddLocal` / `.btnAddDate` clicks → append
 *      a fresh URL / local / date row via the lifted builders; the
 *      date-row add also pings `updateBadges`.
 *  10. `.btnTagTargetHelp` / `.btnCollTargetHelp` → open the shared
 *      `#tagTargetHelpModalOverlay`.
 *  11. Delegated `click` on the row: handles `.btnMiHelp`
 *      (`#miHelpModalOverlay`), `.btnToggleAdditionalFilters`
 *      (expand MI body and seed an empty group), `.btnRemoveUrl` /
 *      `.btnRemoveLocal` / `.btnRemoveDate` (remove + `updateBadges`
 *      for date), `.btnPremadeFilters` / `.btnMySavedFilters`
 *      (toggle the preset / saved-filter panels), `.btnConfirmSaveFilter`
 *      (validate name + non-empty filters, push onto
 *      `deps.savedFilters.filters`, refresh + persist),
 *      `.btnApplyMySavedFilter` (replace the row's filter list),
 *      `.btnDeleteMySavedFilter` (splice + refresh + persist),
 *      `.btnApplyMiPreset` (apply the preset's filter list),
 *      `.btnAddMediaInfoFilter` / `.btnRemoveFilterGroup`
 *      (add / remove groups + strip the connector on the new head),
 *      `.btnClearAllFilters` (empty the filter list),
 *      `.btnGroupOpChoice` / `.btnGroupInnerOpChoice` (flip the
 *      group operator + connector styling + description text),
 *      `.btnNotToggle` (flip the rule's NOT state + button
 *      styling), `.mi-include-parent` (re-evaluate dirty state),
 *      `.btnAddMiRule` / `.btnRemoveMiRule`, `.btnRemoveGroup`
 *      (`confirm` + `row.remove()`), `.btnRunEntry`
 *      (warn if dirty → save + run, or run directly; POST
 *      `HomeScreenCompanion/RunEntry` and call `deps.refreshStatus` /
 *      `deps.alert`), `.btnTestUrl` (`ApiClient.getJSON(TestUrl)` +
 *      `alert`), `.btnTestAiSource` (POST `TestAiSource` with the
 *      AI form fields, render `.ai-test-result` + `Dashboard.alert`
 *      for non-empty previews).
 *  12. `.txtEntryLabel` / `.txtTagName` input → `updateTagTitle`.
 *  13. `.drag-handle` `mousedown` / `mouseup` → toggle the row's
 *      `draggable` attribute when sort-by is `Manual`.
 *  14. `.drag-handle` `touchstart` → the full touch drag pipeline
 *      (collect touch move, place a `.sort-placeholder` via
 *      `getDragAfterElement`, finalize on `touchend` with the
 *      detached-placeholder quirk, cancel on `touchcancel`).
 *  15. `.btnDuplicateRow` click → `readRowAsConfig(row)` →
 *      `renderTagGroup(config, container, prepend=true, undefined, true)`
 *      + `applyFilters(view)` + `setTimeout(checkFormState, 0)`.
 *  16. Row `dragstart` (only when sort-by is `Manual`) → hide the
 *      row after a 0ms timer; `dragend` → restore display, drop the
 *      placeholder, mark `.just-moved`, ping `checkFormState`.
 *  17. `.btnChoosePoster` → trigger the hidden `.inputPosterFile`
 *      click. `.inputPosterFile` `change` → `FileReader` →
 *      `fetch` POST `UploadCollectionImage`. `.btnRemovePoster` →
 *      clear the hidden path + preview. `.btnLoadPosterUrl` →
 *      POST `FetchCollectionImageFromUrl`.
 *  18. `setTimeout(() => deps.updateHseSectionAvailability(row), 0)`
 *      final availability ping for the freshly-mounted row.
 *
 * After this function returns, `deps.updateBadges(row)`,
 * `deps.updateRunGroupBtn(row)`, and `deps.updateTagTitle(row)`
 * are bound to the inner closures and can be called from elsewhere
 * (notably by `renderTagGroup` after a new row is appended).
 */
export function setupRowEvents(row: HTMLElement, deps: SetupRowEventsDeps): void {
    function updateBadges(r: HTMLElement): void {
        const container = r.querySelector('.badge-container');
        if (!container) return;

        const hasSchedule = r.querySelectorAll('.date-row').length > 0;
        const collChk = r.querySelector<HTMLInputElement>('.chkEnableCollection');
        const hseChk = r.querySelector<HTMLInputElement>('.chkEnableHomeSection');
        const tagChk = r.querySelector<HTMLInputElement>('.chkEnableTag');
        const plChk = r.querySelector<HTMLInputElement>('.chkEnablePlaylist');
        const hasCollection = !!collChk && collChk.checked;
        const hasHomeSection = !!hseChk && hseChk.checked;
        const hasTag = !!tagChk && tagChk.checked;
        const hasPlaylist = !!plChk && plChk.checked;

        const overrideChk = r.querySelector<HTMLInputElement>('.chkOverrideWhenActive');
        if (overrideChk) {
            overrideChk.disabled = !hasSchedule;
            if (!hasSchedule) overrideChk.checked = false;
            const overrideContainer = overrideChk.closest('.checkboxContainer') as HTMLElement | null;
            if (overrideContainer) overrideContainer.style.opacity = hasSchedule ? '' : '0.4';
        }

        const sourceBadge = r.querySelector<HTMLElement>('.source-badge');
        const sourceTypeEl = r.querySelector<HTMLSelectElement>('.selSourceType');
        if (sourceBadge && sourceTypeEl) {
            sourceBadge.innerHTML = deps.getSourceBadgeHtml(sourceTypeEl.value);
        }

        let html = '';
        if (hasSchedule) html += buildScheduleBadgeHtml(r, deps);
        if (hasCollection) {
            html += '<span class="tag-indicator collection"><i class="md-icon" style="font-size:1.1em;">library_books</i> Collection</span>';
        }
        if (hasHomeSection) {
            html += '<span class="tag-indicator homescreen"><i class="md-icon" style="font-size:1.1em;">home</i> Home Section</span>';
        }
        if (hasTag) {
            html += '<span class="tag-indicator tag"><i class="md-icon" style="font-size:1.1em;">label</i> Tag</span>';
        }
        if (hasPlaylist) {
            html += '<span class="tag-indicator playlist"><i class="md-icon" style="font-size:1.1em;">queue_music</i> Playlist</span>';
        }
        if (deps.topLists.tagNames.has(rowTagLower(r))) {
            html += '<span class="tag-indicator toplist"><i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List</span>';
        }
        container.innerHTML = html;
    }

    function updateRunGroupBtn(_r: HTMLElement): void {
        const runBtn = row.querySelector<HTMLButtonElement>('.btnRunEntry');
        if (!runBtn || !chk) return;
        const active = chk.checked;
        runBtn.disabled = !active;
        runBtn.style.opacity = active ? '1' : '0.4';
    }

    function updateTagTitle(_r: HTMLElement): void {
        const lbl = row.querySelector<HTMLInputElement>('.txtEntryLabel')?.value || '';
        const tag = row.querySelector<HTMLInputElement>('.txtTagName')?.value || '';
        const titleEl = row.querySelector<HTMLElement>('.tag-title');
        if (titleEl) titleEl.textContent = lbl || tag || 'New';
        const tagNameEl = row.querySelector<HTMLInputElement>('.txtTagName');
        if (tagNameEl) tagNameEl.setAttribute('placeholder', lbl);
        const collNameEl = row.querySelector<HTMLInputElement>('.txtCollectionName');
        if (collNameEl) collNameEl.setAttribute('placeholder', lbl);
        const hseCustomTitle = row.querySelector<HTMLElement>('[data-field="CustomName"]');
        if (hseCustomTitle) hseCustomTitle.setAttribute('placeholder', lbl);
        updateBadges(row);
    }

    deps.updateBadges = updateBadges;
    deps.updateRunGroupBtn = updateRunGroupBtn;
    deps.updateTagTitle = updateTagTitle;

    row.querySelectorAll<HTMLElement>('.tag-tab').forEach((tab) => {
        tab.addEventListener('click', function (this: HTMLElement) {
            row.querySelectorAll<HTMLElement>('.tag-tab').forEach((t) => {
                t.style.opacity = '0.6';
                t.style.borderBottomColor = 'transparent';
            });
            this.style.opacity = '1';
            this.style.borderBottomColor = '#52B54B';
            const target = this.getAttribute('data-tab') || '';
            const generalTab = row.querySelector<HTMLElement>('.general-tab');
            const tagTab = row.querySelector<HTMLElement>('.tagname-tab');
            const schedTab = row.querySelector<HTMLElement>('.schedule-tab');
            const collTab = row.querySelector<HTMLElement>('.collection-tab');
            const advTab = row.querySelector<HTMLElement>('.advanced-tab');
            const hseTab = row.querySelector<HTMLElement>('.homescreen-tab');
            const plTab = row.querySelector<HTMLElement>('.playlist-tab');
            if (generalTab) generalTab.style.display = target === 'general' ? 'block' : 'none';
            if (tagTab) tagTab.style.display = target === 'tag' ? 'block' : 'none';
            if (schedTab) schedTab.style.display = target === 'schedule' ? 'block' : 'none';
            if (collTab) collTab.style.display = target === 'collection' ? 'block' : 'none';
            if (advTab) advTab.style.display = target === 'advanced' ? 'block' : 'none';
            if (hseTab) hseTab.style.display = target === 'homescreen' ? 'block' : 'none';
            if (plTab) plTab.style.display = target === 'playlist' ? 'block' : 'none';
            if (target === 'homescreen') deps.initHomeSectionTab(row);
            if (target === 'playlist') deps.initPlaylistTab(row);
            const activeTabEl = row.querySelector<HTMLElement>('.' + target + '-tab');
            if (activeTabEl) {
                activeTabEl.querySelectorAll<HTMLTextAreaElement>('textarea.txtMiValue, textarea.txtTagBlacklist').forEach((ta) => {
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                    ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden';
                });
            }
        });
    });

    row.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target || !target.classList) return;
        const classes = target.classList;

        if (classes.contains('selSourceType')) {
            const type = (target as HTMLSelectElement).value;
            const extC = row.querySelector<HTMLElement>('.source-external-container');
            const locC = row.querySelector<HTMLElement>('.source-local-container');
            const miC = row.querySelector<HTMLElement>('.source-mediainfo-container');
            const aiC = row.querySelector<HTMLElement>('.source-ai-container');
            if (extC) extC.style.display = type === 'External' ? 'block' : 'none';
            if (locC) locC.style.display = (type === 'LocalCollection' || type === 'LocalPlaylist') ? 'block' : 'none';
            if (miC) miC.style.display = (type && type !== '') ? 'block' : 'none';
            if (aiC) aiC.style.display = type === 'AI' ? 'block' : 'none';

            const hint = row.querySelector<HTMLElement>('.source-type-hint');
            if (hint) {
                const hints: Record<string, string> = {
                    'External':        'Use an external list to tag, or create a collection, from the items that match your library.',
                    'LocalCollection': 'Every item in the selected collection(s) gets the configured tag or is added to a new collection. You can also use this to create a curated list of selected collections as a home screen section.',
                    'LocalPlaylist':   'Every item in the selected playlist(s) gets the configured tag or is added to a new collection.',
                    'MediaInfo':       'Filter your own library to select which movies or shows to tag or create a collection of. This is also known as a Smart Playlist.',
                    'AI':              'Use AI to create a list. Write your prompt and the AI will build a list based on it.',
                };
                hint.textContent = hints[type] || '';
            }

            const isMi = type === 'MediaInfo';
            const miLimitRow = row.querySelector<HTMLElement>('.mi-limit-row');
            const miToggleRow = row.querySelector<HTMLElement>('.mi-toggle-row');
            const miFilterBody = row.querySelector<HTMLElement>('.mi-filter-body');
            const miHelpBtnRow = row.querySelector<HTMLElement>('.mi-help-btn-row');
            const miPresetsSection = row.querySelector<HTMLElement>('.mi-presets-section');
            if (miPresetsSection) miPresetsSection.style.display = isMi ? 'block' : 'none';
            if (miLimitRow) miLimitRow.style.display = isMi ? 'flex' : 'none';
            if (miHelpBtnRow) miHelpBtnRow.style.display = isMi ? 'none' : 'flex';
            if (isMi) {
                if (miToggleRow) miToggleRow.style.display = 'none';
                if (miFilterBody) miFilterBody.style.display = 'block';
            } else if (type) {
                if (miToggleRow) miToggleRow.style.display = 'block';
                if (miFilterBody) miFilterBody.style.display = 'none';
            }
            if (type) {
                const miList = row.querySelector<HTMLElement>('.mediainfo-filter-list');
                if (miList && isMi && miList.querySelectorAll('.mediainfo-filter-group').length === 0) {
                    miList.insertAdjacentHTML(
                        'beforeend',
                        getMediaInfoFilterGroupHtml({ Operator: 'AND', Criteria: [], GroupOperator: 'AND' }, 0, true, deps.miFilterDeps),
                    );
                }
            }

            if (type === 'LocalCollection' || type === 'LocalPlaylist') {
                const localListContainer = row.querySelector<HTMLElement>('.local-list-container');
                const localTypeLabel = row.querySelector<HTMLElement>('.local-type-label');
                if (localListContainer) {
                    localListContainer.innerHTML = getLocalRowHtml(type, '', 0);
                }
                if (localTypeLabel) {
                    localTypeLabel.textContent = type === 'LocalPlaylist' ? 'Select Playlists' : 'Select Collections';
                }
            }
            updateBadges(row);
            deps.updateHseSectionAvailability(row);
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selMiProperty')) {
            const miRule = target.closest('.mi-rule');
            if (miRule) {
                const valueWrapper = miRule.querySelector<HTMLElement>('.mi-value-wrapper');
                if (valueWrapper) {
                    valueWrapper.innerHTML = getMiValueHtml(
                        (target as HTMLSelectElement).value,
                        '',
                        '',
                        '',
                        deps.miFilterDeps,
                    );
                }
                const existingHint = miRule.querySelector<HTMLElement>('.mi-rule-hint');
                if (existingHint) {
                    existingHint.outerHTML = getMiHintHtml((target as HTMLSelectElement).value);
                }
            }
            deps.updateHseSectionAvailability(row);
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selMiUser')) {
            deps.updateHseSectionAvailability(row);
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selMiValue')) {
            const miRule = target.closest('.mi-rule');
            if (miRule) {
                const propEl = miRule.querySelector<HTMLSelectElement>('.selMiProperty');
                const prop = propEl?.value || '';
                if (prop === 'MediaType') {
                    const incParent = miRule.querySelector<HTMLElement>('.mi-include-parent');
                    if (incParent) {
                        incParent.style.display = (target as HTMLSelectElement).value === 'Episode'
                            ? 'inline-flex'
                            : 'none';
                    }
                }
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selDateType')) {
            const dateRow = target.closest('.date-row');
            if (dateRow) {
                const type = (target as HTMLSelectElement).value;
                const specific = dateRow.querySelector<HTMLElement>('.inputs-specific');
                const annual = dateRow.querySelector<HTMLElement>('.inputs-annual');
                const weekly = dateRow.querySelector<HTMLElement>('.inputs-weekly');
                if (specific) specific.style.display = type === 'SpecificDate' ? 'flex' : 'none';
                if (annual) annual.style.display = type === 'EveryYear' ? 'flex' : 'none';
                if (weekly) weekly.style.display = type === 'Weekly' ? 'flex' : 'none';
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selStartMonth') || classes.contains('selEndMonth')) {
            const isStart = classes.contains('selStartMonth');
            const dateRow = target.closest('.date-row');
            if (dateRow) {
                const month = parseInt((target as HTMLSelectElement).value, 10);
                const maxDay = deps.getMaxDays(month);
                const daySelect = dateRow.querySelector<HTMLSelectElement>(isStart ? '.selStartDay' : '.selEndDay');
                if (daySelect) {
                    const currentDay = Math.min(parseInt(daySelect.value, 10), maxDay);
                    daySelect.innerHTML = deps.getDayOptions(currentDay, maxDay);
                }
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        setTimeout(deps.checkFormState, 0);
    });

    const header = row.querySelector<HTMLElement>('.tag-header');
    const body = row.querySelector<HTMLElement>('.tag-body');
    const icon = row.querySelector<HTMLElement>('.expand-icon');
    if (header && body) {
        header.addEventListener('click', (e: Event) => {
            const ev = e as MouseEvent;
            if (ev.target instanceof Element && ev.target.closest('.header-actions')) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            if (icon) icon.innerText = isHidden ? 'expand_less' : 'expand_more';
            if (isHidden) {
                body.querySelectorAll<HTMLTextAreaElement>('textarea.txtMiValue, textarea.txtTagBlacklist').forEach((ta) => {
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                    ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden';
                });
            }
        });
    }

    const chk = row.querySelector<HTMLInputElement>('.chkTagActive');
    const lblStatus = row.querySelector<HTMLElement>('.lblActiveStatus');
    if (chk && lblStatus) {
        chk.addEventListener('change', function (this: HTMLInputElement) {
            lblStatus.textContent = this.checked ? 'Active' : 'Disabled';
            lblStatus.style.color = this.checked ? '#52B54B' : 'var(--theme-text-secondary)';
            if (this.checked) row.classList.remove('inactive');
            else row.classList.add('inactive');
            updateRunGroupBtn(row);
        });
    }
    updateRunGroupBtn(row);

    const chkEnableTag = row.querySelector<HTMLInputElement>('.chkEnableTag');
    if (chkEnableTag) {
        chkEnableTag.addEventListener('change', function (this: HTMLInputElement) {
            const tagSettings = row.querySelector<HTMLElement>('.tag-settings');
            if (tagSettings) tagSettings.style.display = this.checked ? 'block' : 'none';
            updateBadges(row);
            deps.updateHseSectionAvailability(row);
        });
    }

    const chkEnableCollection = row.querySelector<HTMLInputElement>('.chkEnableCollection');
    if (chkEnableCollection) {
        chkEnableCollection.addEventListener('change', function (this: HTMLInputElement) {
            const collSettings = row.querySelector<HTMLElement>('.collection-settings');
            if (collSettings) collSettings.style.display = this.checked ? 'block' : 'none';
            updateBadges(row);
            deps.updateHseSectionAvailability(row);
        });
    }

    const chkEnablePlaylist = row.querySelector<HTMLInputElement>('.chkEnablePlaylist');
    if (chkEnablePlaylist) {
        chkEnablePlaylist.addEventListener('change', function (this: HTMLInputElement) {
            const plSettings = row.querySelector<HTMLElement>('.playlist-settings');
            if (plSettings) plSettings.style.display = this.checked ? 'block' : 'none';
            updateBadges(row);
        });
    }

    const chkOverride = row.querySelector<HTMLInputElement>('.chkOverrideWhenActive');
    if (chkOverride) {
        chkOverride.addEventListener('change', () => {
            updateBadges(row);
        });
    }

    const chkEnableHse = row.querySelector<HTMLInputElement>('.chkEnableHomeSection');
    if (chkEnableHse) {
        chkEnableHse.addEventListener('change', function (this: HTMLInputElement) {
            const hseDetails = row.querySelector<HTMLElement>('.hse-details');
            if (hseDetails) hseDetails.style.display = this.checked ? 'block' : 'none';
            updateBadges(row);
        });
    }

    const chkAiWatched = row.querySelector<HTMLInputElement>('.chkAiRecentlyWatched');
    if (chkAiWatched) {
        chkAiWatched.addEventListener('change', function (this: HTMLInputElement) {
            const opts = row.querySelector<HTMLElement>('.ai-recently-watched-options');
            if (opts) opts.style.display = this.checked ? 'block' : 'none';
        });
    }

    const selAiProv = row.querySelector<HTMLSelectElement>('.selAiProvider');
    if (selAiProv) {
        selAiProv.addEventListener('change', function (this: HTMLSelectElement) {
            const warn = row.querySelector<HTMLElement>('.ollama-experimental-warning');
            if (warn) warn.style.display = this.value === 'Ollama' ? 'flex' : 'none';
        });
    }

    const btnAddUrl = row.querySelector<HTMLButtonElement>('.btnAddUrl');
    if (btnAddUrl) {
        btnAddUrl.addEventListener('click', () => {
            const urlListContainer = row.querySelector<HTMLElement>('.url-list-container');
            if (urlListContainer) {
                urlListContainer.insertAdjacentHTML('beforeend', getUrlRowHtml('', 0));
            }
        });
    }

    const btnAddLocal = row.querySelector<HTMLButtonElement>('.btnAddLocal');
    if (btnAddLocal) {
        btnAddLocal.addEventListener('click', () => {
            const st = row.querySelector<HTMLSelectElement>('.selSourceType')?.value || '';
            const localListContainer = row.querySelector<HTMLElement>('.local-list-container');
            if (localListContainer) {
                localListContainer.insertAdjacentHTML('beforeend', getLocalRowHtml(st, '', 0));
            }
        });
    }

    const btnAddDate = row.querySelector<HTMLButtonElement>('.btnAddDate');
    if (btnAddDate) {
        btnAddDate.addEventListener('click', () => {
            const dateListContainer = row.querySelector<HTMLElement>('.date-list-container');
            if (dateListContainer) {
                dateListContainer.insertAdjacentHTML('beforeend', getDateRowHtml({ Type: 'SpecificDate' }));
            }
            updateBadges(row);
        });
    }

    const btnTagTargetHelp = row.querySelector<HTMLButtonElement>('.btnTagTargetHelp');
    if (btnTagTargetHelp) {
        btnTagTargetHelp.addEventListener('click', () => {
            document.getElementById('tagTargetHelpModalOverlay')?.classList.add('modal-visible');
        });
    }

    const btnCollTargetHelp = row.querySelector<HTMLButtonElement>('.btnCollTargetHelp');
    if (btnCollTargetHelp) {
        btnCollTargetHelp.addEventListener('click', () => {
            document.getElementById('tagTargetHelpModalOverlay')?.classList.add('modal-visible');
        });
    }

    row.addEventListener('click', (e: Event) => {
        const ev = e as MouseEvent;
        const clickTarget = ev.target as Element | null;
        if (!clickTarget) return;

        if (clickTarget.closest('.btnMiHelp')) {
            document.getElementById('miHelpModalOverlay')?.classList.add('modal-visible');
            return;
        }
        if (clickTarget.closest('.btnToggleAdditionalFilters')) {
            const miToggleRow = row.querySelector<HTMLElement>('.mi-toggle-row');
            const miFilterBody = row.querySelector<HTMLElement>('.mi-filter-body');
            if (miToggleRow) miToggleRow.style.display = 'none';
            if (miFilterBody) miFilterBody.style.display = 'block';
            const miList = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            if (miList && miList.querySelectorAll('.mediainfo-filter-group').length === 0) {
                miList.insertAdjacentHTML(
                    'beforeend',
                    getMediaInfoFilterGroupHtml({ Operator: 'AND', Criteria: [], GroupOperator: 'AND' }, 0, true, deps.miFilterDeps),
                );
            }
            return;
        }

        const removeUrlBtn = clickTarget.closest('.btnRemoveUrl');
        if (removeUrlBtn) {
            const urlRow = removeUrlBtn.closest('.url-row');
            if (urlRow) urlRow.remove();
            return;
        }

        const removeLocalBtn = clickTarget.closest('.btnRemoveLocal');
        if (removeLocalBtn) {
            const localRow = removeLocalBtn.closest('.local-row');
            if (localRow) localRow.remove();
            return;
        }

        const removeDateBtn = clickTarget.closest('.btnRemoveDate');
        if (removeDateBtn) {
            const dateRow = removeDateBtn.closest('.date-row');
            if (dateRow) dateRow.remove();
            updateBadges(row);
            return;
        }

        const premadeBtn = clickTarget.closest('.btnPremadeFilters');
        if (premadeBtn) {
            const panel = premadeBtn.closest('.source-mediainfo-container')?.querySelector<HTMLElement>('.mi-preset-panel');
            if (panel) {
                const open = panel.style.display === 'none';
                panel.style.display = open ? '' : 'none';
                const iconEl = premadeBtn.querySelector<HTMLElement>('.mi-expand-icon');
                if (iconEl) iconEl.style.transform = open ? 'rotate(180deg)' : '';
            }
            return;
        }

        const mySavedBtn = clickTarget.closest('.btnMySavedFilters');
        if (mySavedBtn) {
            const savedPanel = mySavedBtn.closest('.source-mediainfo-container')?.querySelector<HTMLElement>('.mi-saved-panel');
            if (savedPanel) {
                const open = savedPanel.style.display === 'none';
                savedPanel.style.display = open ? '' : 'none';
                const iconEl = mySavedBtn.querySelector<HTMLElement>('.mi-expand-icon');
                if (iconEl) iconEl.style.transform = open ? 'rotate(180deg)' : '';
            }
            return;
        }

        const confirmSaveBtn = clickTarget.closest('.btnConfirmSaveFilter');
        if (confirmSaveBtn) {
            const miContainer = confirmSaveBtn.closest('.source-mediainfo-container');
            if (miContainer) {
                const nameInput = miContainer.querySelector<HTMLInputElement>('.txtSaveFilterName');
                const name = nameInput?.value.trim() || '';
                if (!name) {
                    nameInput?.focus();
                    return;
                }
                const filters = readMiFiltersFromContainer(miContainer);
                if (filters.length === 0) {
                    nameInput?.focus();
                    return;
                }
                deps.savedFilters.filters.push({ Name: name, Filters: filters });
                if (nameInput) nameInput.value = '';
                deps.refreshMySavedFiltersPanels(deps.savedFilters.filters);
                deps.saveSavedFiltersNow();
            }
            return;
        }

        const applySavedBtn = clickTarget.closest('.btnApplyMySavedFilter');
        if (applySavedBtn) {
            const idx = parseInt((applySavedBtn as HTMLElement).dataset.index || '-1', 10);
            const sf = deps.savedFilters.filters[idx];
            if (sf) {
                const savedList = applySavedBtn
                    .closest('.source-mediainfo-container')
                    ?.querySelector<HTMLElement>('.mediainfo-filter-list');
                if (savedList) {
                    savedList.innerHTML = sf.Filters.map((f, i) =>
                        getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps),
                    ).join('');
                }
                const savedPanel = applySavedBtn.closest<HTMLElement>('.mi-saved-panel');
                if (savedPanel) savedPanel.style.display = 'none';
                setTimeout(deps.checkFormState, 0);
            }
            return;
        }

        const deleteSavedBtn = clickTarget.closest('.btnDeleteMySavedFilter');
        if (deleteSavedBtn) {
            const idx = parseInt((deleteSavedBtn as HTMLElement).dataset.index || '-1', 10);
            if (idx >= 0) deps.savedFilters.filters.splice(idx, 1);
            deps.refreshMySavedFiltersPanels(deps.savedFilters.filters);
            deps.saveSavedFiltersNow();
            return;
        }

        const applyPresetBtn = clickTarget.closest('.btnApplyMiPreset');
        if (applyPresetBtn) {
            const dataset = (applyPresetBtn as HTMLElement).dataset.preset || '';
            const idxParts = dataset.split(',');
            const catIdx = parseInt(idxParts[0] || '-1', 10);
            const presetIdx = parseInt(idxParts[1] || '-1', 10);
            const cat = deps.miPresets[catIdx];
            const preset = cat?.presets[presetIdx];
            if (preset) {
                const presetFilters = preset.build();
                const presetList = applyPresetBtn
                    .closest('.source-mediainfo-container')
                    ?.querySelector<HTMLElement>('.mediainfo-filter-list');
                if (presetList) {
                    presetList.innerHTML = presetFilters.map((f, i) =>
                        getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps),
                    ).join('');
                }
                const presetPanel = applyPresetBtn.closest<HTMLElement>('.mi-preset-panel');
                if (presetPanel) presetPanel.style.display = 'none';
                setTimeout(deps.checkFormState, 0);
            }
            return;
        }

        if (clickTarget.closest('.btnAddMediaInfoFilter')) {
            const list = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            if (list) {
                const idx = list.querySelectorAll('.mediainfo-filter-group').length;
                list.insertAdjacentHTML(
                    'beforeend',
                    getMediaInfoFilterGroupHtml(
                        { Operator: 'AND', Criteria: [], GroupOperator: 'AND' },
                        idx,
                        false,
                        deps.miFilterDeps,
                    ),
                );
            }
            return;
        }

        if (clickTarget.closest('.btnClearAllFilters')) {
            const list = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            if (list) list.innerHTML = '';
            return;
        }

        if (clickTarget.closest('.btnRemoveFilterGroup')) {
            const group = clickTarget.closest('.mediainfo-filter-group');
            if (group) group.remove();
            const miList = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            const firstGroup = miList?.querySelector<HTMLElement>('.mediainfo-filter-group');
            if (firstGroup) {
                const conn = firstGroup.querySelector<HTMLElement>('.mi-group-connector');
                if (conn) conn.remove();
            }
            return;
        }

        const groupOpBtn = clickTarget.closest('.btnGroupOpChoice');
        if (groupOpBtn) {
            const newOp = (groupOpBtn as HTMLElement).dataset.value || 'AND';
            const group = groupOpBtn.closest<HTMLElement>('.mediainfo-filter-group');
            if (group) {
                group.dataset.groupOp = newOp;
                group.querySelectorAll<HTMLElement>('.btnGroupOpChoice').forEach((b) => {
                    const active = (b.dataset.value || '') === newOp;
                    b.style.background = active
                        ? (newOp === 'AND' ? 'rgba(0,164,220,0.75)' : 'rgba(220,120,0,0.75)')
                        : 'transparent';
                    b.style.color = active ? '#fff' : '';
                });
                const desc = group.querySelector<HTMLElement>('.group-op-desc');
                if (desc) desc.textContent = newOp === 'AND' ? 'Both groups must match' : 'Either group is enough';
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        const innerOpBtn = clickTarget.closest('.btnGroupInnerOpChoice');
        if (innerOpBtn) {
            const newOp = (innerOpBtn as HTMLElement).dataset.value || 'AND';
            const group = innerOpBtn.closest<HTMLElement>('.mediainfo-filter-group');
            if (group) {
                group.dataset.op = newOp;
                group.querySelectorAll<HTMLElement>('.btnGroupInnerOpChoice').forEach((b) => {
                    const active = (b.dataset.value || '') === newOp;
                    b.style.background = active
                        ? (newOp === 'AND' ? 'rgba(0,164,220,0.75)' : 'rgba(220,120,0,0.75)')
                        : 'transparent';
                    b.style.color = active ? '#fff' : '';
                });
                const desc = group.querySelector<HTMLElement>('.inner-op-desc');
                if (desc) desc.textContent = newOp === 'AND' ? 'All rules must match' : 'Any rule is enough';
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        const notBtn = clickTarget.closest('.btnNotToggle');
        if (notBtn) {
            const active = (notBtn as HTMLElement).dataset.not === '1';
            const nextActive = !active;
            (notBtn as HTMLElement).dataset.not = nextActive ? '1' : '0';
            (notBtn as HTMLElement).style.background = nextActive ? 'rgba(200,50,50,0.75)' : 'transparent';
            (notBtn as HTMLElement).style.color = nextActive ? '#fff' : '';
            (notBtn as HTMLElement).style.border = nextActive
                ? '1px solid rgba(200,50,50,0.6)'
                : '1px solid rgba(128,128,128,0.4)';
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (clickTarget.closest('.mi-include-parent')) {
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (clickTarget.closest('.btnAddMiRule')) {
            const group = clickTarget.closest('.mediainfo-filter-group');
            const rulesList = group?.querySelector<HTMLElement>('.mi-rules-list');
            if (rulesList) {
                rulesList.insertAdjacentHTML('beforeend', getMediaInfoRuleHtml('', deps.miFilterDeps));
            }
            return;
        }

        if (clickTarget.closest('.btnRemoveMiRule')) {
            const miRule = clickTarget.closest('.mi-rule');
            if (miRule) miRule.remove();
            return;
        }

        if (clickTarget.closest('.btnRemoveGroup')) {
            const removeConfirmed = typeof confirm === 'function'
                ? confirm('Delete this tag group?')
                : window.confirm('Delete this tag group?');
            if (removeConfirmed) row.remove();
            return;
        }

        const runEntryBtn = clickTarget.closest('.btnRunEntry');
        if (runEntryBtn) {
            const entryName =
                row.querySelector<HTMLInputElement>('.txtEntryLabel')?.value ||
                row.querySelector<HTMLInputElement>('.txtTagName')?.value ||
                '';
            if (!entryName) {
                deps.alert('Entry has no name or tag.');
                return;
            }
            const doRun = () => {
                const liveView = row.closest<HTMLElement>('#HomeScreenCompanionConfigPage');
                const btn = row.querySelector<HTMLButtonElement>('.btnRunEntry');
                const lbl = btn?.querySelector<HTMLElement>('.btnRunEntryLabel');
                const btnSaveEl = liveView?.querySelector<HTMLButtonElement>('.btn-save');
                const dotEl = liveView?.querySelector<HTMLElement>('#dotStatus');
                const labelEl = liveView?.querySelector<HTMLElement>('#lastRunStatusLabel');
                if (lbl) lbl.textContent = 'Running…';
                if (btn) btn.disabled = true;
                if (btnSaveEl) {
                    btnSaveEl.disabled = true;
                    btnSaveEl.style.opacity = '0.5';
                    const sp = btnSaveEl.querySelector<HTMLElement>('span');
                    if (sp) sp.textContent = 'Sync in progress...';
                }
                if (dotEl) dotEl.className = 'status-dot running';
                if (labelEl) labelEl.textContent = 'Running...';
                const apiClient = (typeof window !== 'undefined')
                    ? (window as unknown as { ApiClient?: { getUrl(name: string): string; accessToken(): string } }).ApiClient
                    : undefined;
                if (!apiClient) return;
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'X-MediaBrowser-Token': apiClient.accessToken(),
                };
                fetch(apiClient.getUrl('HomeScreenCompanion/RunEntry'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ EntryName: entryName }),
                })
                    .then((r) => r.json())
                    .then((result: { Success?: boolean; Message?: string }) => {
                        if (lbl) lbl.textContent = 'Run Group';
                        if (btn) btn.disabled = false;
                        if (liveView) deps.refreshStatus(liveView);
                        deps.alert(result.Success ? 'Done: ' + result.Message : 'Failed: ' + result.Message);
                    })
                    .catch(() => {
                        if (lbl) lbl.textContent = 'Run Group';
                        if (btn) btn.disabled = false;
                        if (liveView) deps.refreshStatus(liveView);
                        deps.alert('Request failed.');
                    });
            };
            const liveView = row.closest<HTMLElement>('#HomeScreenCompanionConfigPage');
            const _saveBtn = liveView
                ? liveView.querySelector<HTMLButtonElement>('.btn-save')
                : document.querySelector<HTMLButtonElement>('.btn-save');
            const isDirty = !!_saveBtn && !_saveBtn.disabled;
            if (isDirty) {
                const confirmed = typeof confirm === 'function'
                    ? confirm('You have unsaved changes. Save and run?')
                    : window.confirm('You have unsaved changes. Save and run?');
                if (confirmed) {
                    _saveBtn?.click();
                    setTimeout(doRun, 800);
                }
            } else {
                doRun();
            }
            return;
        }

        const btnTest = clickTarget.closest('.btnTestUrl');
        if (btnTest) {
            const uRow = btnTest.closest('.url-row');
            if (uRow) {
                const urlInput = uRow.querySelector<HTMLInputElement>('.txtTagUrl');
                const url = urlInput?.value || '';
                if (!url) return;
                const limitInput = uRow.querySelector<HTMLInputElement>('.txtUrlLimit');
                const limitVal = parseInt(limitInput?.value || '0', 10) || 0;
                const testBtn = btnTest as HTMLButtonElement;
                testBtn.disabled = true;
                const apiClient = (typeof window !== 'undefined')
                    ? (window as unknown as {
                        ApiClient?: {
                            getUrl(name: string, params?: Record<string, unknown>): string;
                            getJSON(url: string): Promise<{ Message?: string }>;
                        };
                    }).ApiClient
                    : undefined;
                if (apiClient) {
                    void apiClient
                        .getJSON(apiClient.getUrl('HomeScreenCompanion/TestUrl', { Url: url, Limit: limitVal }))
                        .then((result: { Message?: string }) => {
                            deps.alert(result.Message || '');
                        })
                        .finally(() => { testBtn.disabled = false; });
                } else {
                    testBtn.disabled = false;
                }
            }
            return;
        }

        const btnTestAi = clickTarget.closest('.btnTestAiSource');
        if (btnTestAi) {
            const aiContainer = btnTestAi.closest('.source-ai-container');
            if (aiContainer) {
                const aiProvider = aiContainer.querySelector<HTMLSelectElement>('.selAiProvider')?.value || 'OpenAI';
                const aiPrompt = (aiContainer.querySelector<HTMLTextAreaElement>('.txtAiPrompt')?.value || '').trim();
                const aiIncludeWatched = !!aiContainer.querySelector<HTMLInputElement>('.chkAiRecentlyWatched')?.checked;
                const aiWatchedUserId = aiIncludeWatched
                    ? (aiContainer.querySelector<HTMLSelectElement>('.selAiWatchedUser')?.value || '')
                    : '';
                const aiWatchedCount = parseInt(
                    aiContainer.querySelector<HTMLInputElement>('.txtAiWatchedCount')?.value || '20',
                    10,
                ) || 20;
                const resultSpan = aiContainer.querySelector<HTMLElement>('.ai-test-result');
                if (!aiPrompt) {
                    if (resultSpan) resultSpan.textContent = 'Please enter a prompt first.';
                    return;
                }
                const testBtn = btnTestAi as HTMLButtonElement;
                testBtn.disabled = true;
                if (resultSpan) resultSpan.textContent = 'Testing...';
                const apiClient = (typeof window !== 'undefined')
                    ? (window as unknown as { ApiClient?: { getUrl(name: string): string; accessToken(): string } }).ApiClient
                    : undefined;
                if (!apiClient) {
                    testBtn.disabled = false;
                    return;
                }
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'X-MediaBrowser-Token': apiClient.accessToken(),
                };
                fetch(apiClient.getUrl('HomeScreenCompanion/TestAiSource'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        Provider: aiProvider,
                        Prompt: aiPrompt,
                        IncludeRecentlyWatched: aiIncludeWatched,
                        RecentlyWatchedUserId: aiWatchedUserId,
                        RecentlyWatchedCount: aiWatchedCount,
                    }),
                })
                    .then((r) => r.json())
                    .then((result: { Success?: boolean; Message?: string; Preview?: string[]; Count?: number }) => {
                        if (resultSpan) {
                            resultSpan.textContent = result.Success
                                ? result.Message || ''
                                : 'Failed: ' + result.Message;
                        }
                        if (result.Success && result.Preview && result.Preview.length > 0) {
                            deps.alert('AI returned ' + result.Count + ' items:\n\n' + result.Preview.join('\n'));
                        } else if (!result.Success) {
                            deps.alert('AI test failed:\n' + result.Message);
                        }
                    })
                    .catch((err: unknown) => {
                        if (resultSpan) {
                            resultSpan.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
                        }
                    })
                    .finally(() => { testBtn.disabled = false; });
            }
            return;
        }
    });

    const txtEntryLabel = row.querySelector<HTMLInputElement>('.txtEntryLabel');
    if (txtEntryLabel) {
        txtEntryLabel.addEventListener('input', () => {
            updateTagTitle(row);
        });
    }
    const txtTagName = row.querySelector<HTMLInputElement>('.txtTagName');
    if (txtTagName) {
        txtTagName.addEventListener('input', () => {
            updateTagTitle(row);
        });
    }

    const handle = row.querySelector<HTMLElement>('.drag-handle');
    if (handle) {
        handle.addEventListener('mousedown', () => {
            if (localStorage.getItem('HomeScreenCompanion_SortBy') === 'Manual') {
                row.setAttribute('draggable', 'true');
            }
        });
        handle.addEventListener('mouseup', () => {
            row.setAttribute('draggable', 'false');
        });
        handle.addEventListener('touchstart', (e: Event) => {
            if (localStorage.getItem('HomeScreenCompanion_SortBy') !== 'Manual') return;
            const touchEvent = e as TouchEvent;
            touchEvent.preventDefault();
            const tagContainer = row.closest<HTMLElement>('#tagListContainer') || row.parentElement;
            if (!tagContainer) return;
            document.querySelectorAll<HTMLElement>('.tag-body').forEach((b) => { b.style.display = 'none'; });
            document.querySelectorAll<HTMLElement>('.expand-icon').forEach((i) => { i.innerText = 'expand_more'; });
            row.classList.add('dragging');

            const onTouchMove = (ev: Event) => {
                const tEv = ev as TouchEvent;
                tEv.preventDefault();
                const touch = tEv.touches[0];
                if (!touch) return;
                const afterEl = getDragAfterElement(tagContainer, touch.clientY);
                let ph = tagContainer.querySelector<HTMLElement>('.sort-placeholder');
                if (!ph) {
                    ph = document.createElement('div');
                    ph.className = 'sort-placeholder';
                }
                if (afterEl == null) {
                    if (ph.nextElementSibling !== null) tagContainer.appendChild(ph);
                } else {
                    if (ph.nextElementSibling !== afterEl) tagContainer.insertBefore(ph, afterEl);
                }
            };

            const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchCancel);
                row.classList.remove('dragging');
                const ph = tagContainer.querySelector<HTMLElement>('.sort-placeholder');
                if (ph) {
                    tagContainer.insertBefore(row, ph);
                    ph.remove();
                }
                row.classList.add('just-moved');
                setTimeout(() => { row.classList.remove('just-moved'); }, 2000);
                setTimeout(deps.checkFormState, 0);
            };

            const onTouchCancel = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchCancel);
                row.classList.remove('dragging');
                const ph = tagContainer.querySelector<HTMLElement>('.sort-placeholder');
                if (ph) ph.remove();
            };

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
            document.addEventListener('touchcancel', onTouchCancel);
        }, { passive: false });
    }

    const btnDuplicateRow = row.querySelector<HTMLButtonElement>('.btnDuplicateRow');
    if (btnDuplicateRow) {
        btnDuplicateRow.addEventListener('click', () => {
            const config = readRowAsConfig(row);
            const tagged: ReturnType<typeof readRowAsConfig> = {
                ...config,
                Name: (config.Name || config.Tag || 'Source') + ' (copy)',
            };
            const tagContainer = row.closest<HTMLElement>('#tagListContainer');
            deps.renderTagGroup(tagged, tagContainer, true, undefined, true);
            deps.applyFilters(deps.view);
            setTimeout(deps.checkFormState, 0);
        });
    }

    row.addEventListener('dragstart', (e: Event) => {
        if (localStorage.getItem('HomeScreenCompanion_SortBy') !== 'Manual') {
            e.preventDefault();
            return;
        }
        document.querySelectorAll<HTMLElement>('.tag-body').forEach((b) => { b.style.display = 'none'; });
        document.querySelectorAll<HTMLElement>('.expand-icon').forEach((i) => { i.innerText = 'expand_more'; });
        row.classList.add('dragging');
        const dragEv = e as DragEvent;
        if (dragEv.dataTransfer) {
            dragEv.dataTransfer.effectAllowed = 'move';
            dragEv.dataTransfer.setData('text/plain', '');
        }
        setTimeout(() => { row.style.display = 'none'; }, 0);
    });

    row.addEventListener('dragend', () => {
        row.style.display = '';
        row.classList.remove('dragging');
        row.setAttribute('draggable', 'false');
        const existingPlaceholder = document.querySelector<HTMLElement>('.sort-placeholder');
        if (existingPlaceholder) existingPlaceholder.remove();
        row.classList.add('just-moved');
        setTimeout(() => { row.classList.remove('just-moved'); }, 2000);
        setTimeout(deps.checkFormState, 0);
    });

    const btnChoosePoster = row.querySelector<HTMLButtonElement>('.btnChoosePoster');
    const inputPosterFile = row.querySelector<HTMLInputElement>('.inputPosterFile');
    if (btnChoosePoster && inputPosterFile) {
        btnChoosePoster.addEventListener('click', () => {
            inputPosterFile.click();
        });
        inputPosterFile.addEventListener('change', () => {
            const file = inputPosterFile.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (re: ProgressEvent<FileReader>) => {
                const dataUrl = re.target?.result;
                if (typeof dataUrl !== 'string') return;
                const base64 = dataUrl.split(',')[1] || '';
                const img = row.querySelector<HTMLImageElement>('.poster-preview-img');
                if (img) {
                    img.src = dataUrl;
                    img.style.display = 'block';
                }
                const apiClient = (typeof window !== 'undefined')
                    ? (window as unknown as { ApiClient?: { getUrl(name: string): string; accessToken(): string } }).ApiClient
                    : undefined;
                if (!apiClient) return;
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                const token = apiClient.accessToken();
                if (token) headers['X-Emby-Token'] = token;
                const hiddenPath = row.querySelector<HTMLInputElement>('.hiddenPosterPath')?.value || '';
                fetch(apiClient.getUrl('HomeScreenCompanion/UploadCollectionImage'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ FileName: file.name, Base64Data: base64, OldFilePath: hiddenPath }),
                })
                    .then((r) => r.json())
                    .then((result: { Success?: boolean; Message?: string; FilePath?: string }) => {
                        if (result.Success) {
                            const pathInput = row.querySelector<HTMLInputElement>('.hiddenPosterPath');
                            if (pathInput && result.FilePath) pathInput.value = result.FilePath;
                            const fnameEl = row.querySelector<HTMLElement>('.poster-filename');
                            if (fnameEl) fnameEl.textContent = file.name;
                            const previewContainer = row.querySelector<HTMLElement>('.poster-preview-container');
                            if (previewContainer) previewContainer.style.display = 'block';
                        } else {
                            deps.alert('Upload failed: ' + (result.Message || 'Unknown error'));
                            if (img) img.style.display = 'none';
                        }
                    })
                    .catch(() => {
                        deps.alert('Upload error. Check server logs.');
                        if (img) img.style.display = 'none';
                    });
            };
            reader.readAsDataURL(file);
        });
    }

    const btnRemovePoster = row.querySelector<HTMLButtonElement>('.btnRemovePoster');
    if (btnRemovePoster) {
        btnRemovePoster.addEventListener('click', () => {
            const pathInput = row.querySelector<HTMLInputElement>('.hiddenPosterPath');
            if (pathInput) pathInput.value = '';
            const fnameEl = row.querySelector<HTMLElement>('.poster-filename');
            if (fnameEl) fnameEl.textContent = '';
            const previewContainer = row.querySelector<HTMLElement>('.poster-preview-container');
            if (previewContainer) previewContainer.style.display = 'none';
            const previewImg = row.querySelector<HTMLImageElement>('.poster-preview-img');
            if (previewImg) previewImg.style.display = 'none';
            if (inputPosterFile) inputPosterFile.value = '';
        });
    }

    const btnLoadPosterUrl = row.querySelector<HTMLButtonElement>('.btnLoadPosterUrl');
    if (btnLoadPosterUrl) {
        btnLoadPosterUrl.addEventListener('click', () => {
            const urlInput = row.querySelector<HTMLInputElement>('.txtPosterUrl');
            const url = (urlInput?.value || '').trim();
            if (!url) return;
            const apiClient = (typeof window !== 'undefined')
                ? (window as unknown as { ApiClient?: { getUrl(name: string): string; accessToken(): string } }).ApiClient
                : undefined;
            if (!apiClient) return;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            const token = apiClient.accessToken();
            if (token) headers['X-Emby-Token'] = token;
            const hiddenPath = row.querySelector<HTMLInputElement>('.hiddenPosterPath')?.value || '';
            fetch(apiClient.getUrl('HomeScreenCompanion/FetchCollectionImageFromUrl'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ Url: url, OldFilePath: hiddenPath }),
            })
                .then((r) => r.json())
                .then((result: { Success?: boolean; Message?: string; FilePath?: string }) => {
                    if (result.Success) {
                        const pathInput = row.querySelector<HTMLInputElement>('.hiddenPosterPath');
                        if (pathInput && result.FilePath) pathInput.value = result.FilePath;
                        const fnameEl = row.querySelector<HTMLElement>('.poster-filename');
                        if (fnameEl) {
                            const parts = url.split('/');
                            fnameEl.textContent = (parts[parts.length - 1] || '').split('?')[0] || '';
                        }
                        const previewContainer = row.querySelector<HTMLElement>('.poster-preview-container');
                        if (previewContainer) previewContainer.style.display = 'block';
                        const img = row.querySelector<HTMLImageElement>('.poster-preview-img');
                        if (img) {
                            img.src = url;
                            img.style.display = 'block';
                        }
                        if (urlInput) urlInput.value = '';
                    } else {
                        deps.alert('Failed to load image: ' + (result.Message || 'Unknown error'));
                    }
                })
                .catch(() => {
                    deps.alert('Error fetching image. Check the URL and server logs.');
                });
        });
    }

    setTimeout(() => { deps.updateHseSectionAvailability(row); }, 0);
}
