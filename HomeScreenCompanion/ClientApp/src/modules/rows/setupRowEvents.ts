/**
 * Phase 5 → D2 orchestrator: the 1,447-line legacy `setupRowEvents(row)`
 * body has been split by interaction domain into eight sibling modules
 * (`rowBadges`, `rowTabs`, `sourceTypeChange`, `miFilterEvents`,
 * `savedFilterEvents`, `rowDrag`, `posterUpload`, `runEntry`). This
 * file is now a thin orchestrator that:
 *
 *   1. Builds the per-row controller via {@link createRowController}
 *      and uses its `updateBadges` / `updateRunGroupBtn` / `updateTagTitle`
 *      methods everywhere the legacy code reached for the inner
 *      closures.
 *   2. Calls each wireXxx in the legacy ordering, threading the
 *      controller through the ones that need it (`rowBadges`,
 *      `sourceTypeChange`, `runEntry`).
 *   3. Performs the trailing `setTimeout(deps.updateHseSectionAvailability)` ping.
 *
 * `SetupRowEventsDeps` fields are now all `readonly` — including the
 * three closure slots the legacy file wrote back onto the deps bag at
 * `:211-215` / `:437-439`. With D2's extracted modules the controller
 * is the canonical owner of those closures; setupRowEvents no longer
 * populates them via write-back. To preserve runtime compatibility with
 * the factory in `modules/index.ts` (which reads `deps.updateBadges` /
 * `updateRunGroupBtn` / `updateTagTitle` after this call and holds them
 * in its `self` proxy for `updateHseSectionAvailability`), this
 * orchestrator performs one final compatibility write through a TS
 * escape hatch. The JS object is still mutable at runtime; the readonly
 * marker only restricts external callers from mutating `deps` directly.
 *
 * No behavior changes versus the pre-D2 file. Touch / drag handlers
 * are preserved verbatim (including the detached `.sort-placeholder`
 * quirk on `touchmove` / `touchend`); the six `(window as unknown as
 * {ApiClient?: …})` casts collapsed into one `getApiClient()` call
 * per fetch site.
 */

import type { ScheduleInterval } from '../filters/rows';
import type {
    SavedFiltersApiClient,
    SavedFilter,
} from '../filters/savedFilters';
import type { MiFilterDeps } from '../filters/miFilters';
import type {
    SavedFiltersState,
    TopListsState,
    OriginalConfigStateRef,
} from '../state/state';

import { createRowController } from './createRowController';
import type { RowController } from './rowController';
import { wireRowBadges } from './rowBadges';
import { wireRowTabs } from './rowTabs';
import { wireSourceTypeChange } from './sourceTypeChange';
import { wireMiFilterEvents } from './miFilterEvents';
import { wireSavedFilterEvents } from './savedFilterEvents';
import { wireRowDrag } from './rowDrag';
import { wirePosterUpload } from './posterUpload';
import { wireRunEntry } from './runEntry';

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
    tagConfig: ReturnType<typeof import('../filters/rows').readRowAsConfig>,
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
    readonly build: () => import('../filters/savedFilters').MediaInfoFilterGroup[];
}

export interface MiPresetCategory {
    readonly label: string;
    readonly presets: readonly MiPreset[];
}

/**
 * Dependencies for `setupRowEvents`. All fields are `readonly` post-D2;
 * the legacy write-back to `updateBadges` / `updateRunGroupBtn` /
 * `updateTagTitle` (the original `:437-439`) is replaced by the
 * controller pattern returned from `createRowController`. The
 * `SetupRowEventsDeps` surface keeps the same shape (callers in
 * `modules/index.ts:306-393` still build + read these fields), with
 * one runtime escape hatch inside `setupRowEvents` itself so the
 * factory's `self.updateBadges = deps.updateBadges` line keeps
 * working without code changes outside the rows/ folder.
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

    /**
     * Closure populated by `setupRowEvents` — recompute the badge
     * indicators for one row. Marked `readonly` on the surface; the
     * orchestrator populates it via a runtime write below so the
     * factory's `deps.updateBadges` read-back keeps functioning.
     */
    readonly updateBadges: (row: HTMLElement) => void;
    /** Closure populated by `setupRowEvents` — toggle `.btnRunEntry` enabled-state. */
    readonly updateRunGroupBtn: (row: HTMLElement) => void;
    /** Closure populated by `setupRowEvents` — sync the row title and placeholders. */
    readonly updateTagTitle: (row: HTMLElement) => void;
}

/**
 * Re-export so the deps surface stays self-contained for the factory.
 */
export type { SavedFilter };

/**
 * Wire every event handler that the legacy `setupRowEvents(row)`
 * body (`legacy.js:1873-2583`) attaches to one tag row. Each domain
 * lives in its own sibling module (see this file's header) — this
 * function is the thin orchestrator that calls them in the legacy
 * order and threads the row controller (from
 * {@link createRowController}) through the ones that need it.
 *
 * Compatibility note: the factory in `modules/index.ts` reads back
 * `deps.updateBadges` / `deps.updateRunGroupBtn` / `deps.updateTagTitle`
 * after this function returns, holding the closures in its `self`
 * proxy for the subsequent `updateHseSectionAvailability` call. The
 * surface fields are typed `readonly` (no external mutation allowed),
 * but the JS object is still mutable at runtime; the orchestrator
 * performs the legacy write through a TS escape hatch so external
 * callers compile cleanly without behavior changes.
 */
export function setupRowEvents(row: HTMLElement, deps: SetupRowEventsDeps): void {
    const controller: RowController = createRowController(row, deps);

    wireRowTabs(row, deps);
    wireSourceTypeChange(row, deps, { controller });
    wireRowBadges(row, deps, { controller });
    wireMiFilterEvents(row, deps);
    wireSavedFilterEvents(row, deps);
    wireRowDrag(row, deps);
    wirePosterUpload(row, deps);
    wireRunEntry(row, deps, { controller });

    // Initial run-button state (mirrors the pre-D2 trailing call after
    // wiring the `.chkTagActive` change).
    controller.updateRunGroupBtn(row);

    // Compatibility shim: the factory in `modules/index.ts` reads
    // `deps.updateBadges` / `deps.updateRunGroupBtn` / `deps.updateTagTitle`
    // back off this object after `setupRowEvents` returns, holding the
    // closures in its `self` proxy for the subsequent
    // `updateHseSectionAvailability` callback. The fields are typed
    // `readonly` (no external mutation allowed) — TypeScript forbids
    // the direct write at compile time, but the runtime JS object is
    // still mutable, so the escape hatch through `unknown` populates
    // them while leaving the interface invariant intact.
    const mutable = deps as unknown as {
        updateBadges: (row: HTMLElement) => void;
        updateRunGroupBtn: (row: HTMLElement) => void;
        updateTagTitle: (row: HTMLElement) => void;
    };
    mutable.updateBadges = controller.updateBadges;
    mutable.updateRunGroupBtn = controller.updateRunGroupBtn;
    mutable.updateTagTitle = controller.updateTagTitle;

    setTimeout(() => { deps.updateHseSectionAvailability(row); }, 0);
}
