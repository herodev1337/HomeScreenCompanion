/**
 * Per-row updater bundle returned by {@link createRowController}.
 *
 * The three updaters recompute the row's badges / run-button / title
 * synchronously. The legacy `setupRowEvents` defined these as inner
 * closures that captured `row` and the deps bag; D2 lifts them into a
 * typed shape so every extracted module calls them through the
 * controller rather than reaching back into the deps surface.
 *
 * All three are read-only on the public surface; internal callers in
 * `setupRowEvents.ts` mutate `deps` once at the end (see the
 * compatibility shim in `setupRowEvents.ts`) so the existing factory
 * wiring in `index.ts` (which reads the closures back off `deps`
 * after the call) keeps working unchanged.
 */
export interface RowController {
    /** Recompute the badge indicators (source / schedule / toplist / …) for one row. */
    readonly updateBadges: (row: HTMLElement) => void;
    /** Toggle `.btnRunEntry` enabled-state based on `.chkTagActive`. */
    readonly updateRunGroupBtn: (row: HTMLElement) => void;
    /** Sync the row title + placeholders from `.txtEntryLabel` / `.txtTagName`. */
    readonly updateTagTitle: (row: HTMLElement) => void;
}
