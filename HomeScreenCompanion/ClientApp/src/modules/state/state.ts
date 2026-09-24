/**
 * Phase 5 keystone: typed module-scope state for the legacy config page.
 *
 * Covers `ClientApp/src/legacy.js` lines 4-947 (top-level vars) and 6539,
 * 6795, 2748, 2824 (per-form/deferred vars) — every mutable state holder
 * the eventual `index.ts` factory instantiates and passes via deps.
 *
 * Pure type + factory module with NO behavior. Each consumer either:
 *   1. Reads/writes the holder's fields directly (e.g. `state.savedFilters`), or
 *   2. Receives a getter/setter pair on the holder (e.g. `originalConfigState`
 *      uses the savedFilters.ts pattern).
 *
 * Field design rules:
 *   - Mutable holder fields are typed with their actual shape; contents are
 *     `readonly` where the field holds an object/array that should not be
 *     mutated in place by consumers.
 *   - Array holders (`sections`, `filters`, `collections`, `playlists`,
 *     `tags`) are NOT `readonly` because callers replace them wholesale
 *     (`state.sections = result.Sections || []`), matching the
 *     `ManageSectionsState { sections: T[] }` pattern in `manageTab.ts`.
 *   - Nullable holders use `T | null` (not `T?`) per `noUncheckedIndexedAccess`
 *     + the agent-quickstart rule.
 *
 * The aggregate `AppState` is the single bag the future `index.ts` will
 * create with `createAppState()` and pass (whole or split) to each module.
 */

import type { SavedFilter } from '../filters/savedFilters';
import type { HscConfigLike, HscUserLike } from '../homesections/hscTab';
import type { ManageSectionLike } from '../homesections/manageTab';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Plugin GUID. Lifted from legacy.js:4; never mutated. Exported so consumer
 * modules can import it instead of hardcoding the UUID.
 */
export const PLUGIN_ID = '7c10708f-43e4-4d69-923c-77d01802315b';

/**
 * Default AI recommendation system prompt. Lifted from legacy.js:12; never
 * mutated. Compared (after trim) against `#txtAiSystemPrompt` to drive the
 * reset-button visibility — see `updateSystemPromptResetBtn` (legacy.js:14).
 */
export const DEFAULT_AI_SYSTEM_PROMPT =
    'You are a movie and TV show recommendation assistant. Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences. Each item must have these fields: "title" (string, required), "year" (integer or null), "imdb_id" (string starting with "tt" if known, otherwise null), "type" ("movie" or "show"). Return exactly the items requested. Do not add any commentary. Example: [{"title":"Inception","year":2010,"imdb_id":"tt1375666","type":"movie"}]';

// ─── Type definitions ─────────────────────────────────────────────────────────

/**
 * One live-status payload for a task (sync / hsc / tl). Mirrors the shape
 * `refreshStatus` (legacy.js:2712) writes into `_lastStatus[k]` and the
 * inner fns in `renderLogModal` (legacy.js:2647-2649) read. Legacy code
 * reads `StartedUtc`, `IsRunning`, `Logs`, `LastRunStatus`; other fields
 * pass through untouched.
 */
export interface TaskStatusLike {
    readonly StartedUtc?: string;
    readonly IsRunning?: boolean;
    readonly Logs?: readonly unknown[];
    readonly LastRunStatus?: string;
    readonly [k: string]: unknown;
}

/**
 * Minimal `BaseItemDto` shape consumed by the media-info filter row
 * Collection / Playlist dropdowns. Legacy items come from
 * `cachedCollections` / `cachedPlaylists` (legacy.js:6802-6803) and
 * `miFilters.ts` only reads `.Name`. Index signature keeps the server
 * payload permissive for future fields.
 */
export interface BaseItemDtoLike {
    readonly Name?: string;
    readonly [k: string]: unknown;
}

/** The keys `_lastStatus` / `_logTab` are indexed by. legacy.js:2646. */
export type LogTabKey = 'sync' | 'hsc' | 'tl';

// ─── State holders ────────────────────────────────────────────────────────────

/** Snapshot of the saved HSC config; populated by `loadConfig` (legacy.js:7037). */
export interface HscState {
    config: HscConfigLike;
}

/** Sections currently being managed in the HSC manage tab (legacy.js:71). */
export interface ManageState {
    sections: ManageSectionLike[];
}

/** Persisted user-named bundles of media-info filter groups (legacy.js:72). */
export interface SavedFiltersState {
    filters: SavedFilter[];
}

/** Lowercased registered top-list tag names. Rebuilt from `config.TopLists` on every `loadConfig` (legacy.js:7073). Set is assignable as a whole; contents not mutated in place. */
export interface TopListsState {
    tagNames: Set<string>;
}

/** Pre-fetched library items for the media-info filter dropdowns (legacy.js:67-69, populated at legacy.js:6802-6804). Legacy replaces each field wholesale. */
export interface LibraryCacheState {
    collections: BaseItemDtoLike[];
    playlists: BaseItemDtoLike[];
    tags: string[];
}

/** User list consumed by the media-info rule user-select. `null` until `getHseUsers()` resolves (legacy.js:6795). Same shape as `_hseUsersCache` (legacy.js:2748). */
export interface MiUsersState {
    users: HscUserLike[] | null;
}

/** Caches populated by `getHseUsers` (legacy.js:2748) and `preFetchLibraryData` (legacy.js:2824). Both lazy + memoized. */
export interface HseUserCacheState {
    users: HscUserLike[] | null;
    libraryPromise: Promise<unknown> | null;
}

/**
 * Mutable JSON-stringified snapshot of the pristine config taken at
 * `loadConfig` time (legacy.js:7087-7089). Matches the savedFilters.ts
 * deps pattern: callers receive a getter + setter because the legacy
 * factory reads the value from two places (truthiness gate + `JSON.parse`)
 * and writes it once. The factory returns closures that share a
 * closed-over variable so multiple set calls update the same snapshot.
 */
export interface OriginalConfigStateRef {
    readonly getOriginalConfigState: () => string | null;
    readonly setOriginalConfigState: (value: string | null) => void;
}

/**
 * Live log modal state (legacy.js:7-8, 10). `lastStatus` is the per-task
 * payload written by `refreshStatus` (legacy.js:2712) and read by the
 * inner fns in `renderLogModal` (legacy.js:2647-2649). `statusRequestId`
 * is a monotonic counter incremented before every `refreshStatus` fetch
 * (legacy.js:2680) so an in-flight stale response can be discarded
 * (legacy.js:2686, 2715). `topListStatusAvailable` is a one-shot
 * feature-detect flag for the `TopList/Status` endpoint: `refreshStatus`
 * probes it once, and if the probe rejects (or the server returns
 * `null`, which a healthy build never does) it flips the flag to
 * `false` so subsequent polls skip the request entirely (silences the
 * cosmetic 404 against older deployed DLLs that lack the endpoint).
 */
export interface LogStatusState {
    lastStatus: { sync: TaskStatusLike | null; hsc: TaskStatusLike | null; tl: TaskStatusLike | null };
    logTab: LogTabKey | null;
    statusRequestId: number;
    topListStatusAvailable: boolean;
}

/**
 * Per-view-show ephemeral handles. `statusInterval` is the 5-second
 * `refreshStatus` timer started in the view-show path (legacy.js:6794)
 * and cleared on viewhide (legacy.js:6810) and on factory re-invocation
 * (legacy.js:7178-7180). `formAc` (legacy.js:868, 6539) is the
 * per-form `AbortController` for in-flight abortable requests. Both are
 * reset to their initial values on every view-show.
 */
export interface ViewShowEphemeralState {
    formAc: AbortController | null;
    statusInterval: ReturnType<typeof setInterval> | null;
}

// ─── Factory functions ───────────────────────────────────────────────────────

export function createHscState(): HscState { return { config: {} }; }
export function createManageState(): ManageState { return { sections: [] }; }
export function createSavedFiltersState(): SavedFiltersState { return { filters: [] }; }
export function createTopListsState(): TopListsState { return { tagNames: new Set<string>() }; }
export function createLibraryCacheState(): LibraryCacheState { return { collections: [], playlists: [], tags: [] }; }
export function createMiUsersState(): MiUsersState { return { users: null }; }
export function createHseUserCacheState(): HseUserCacheState { return { users: null, libraryPromise: null }; }

/**
 * Build a holder whose getter/setter share a closed-over variable. Two
 * distinct factory calls produce two independent snapshots — exactly the
 * legacy semantic of the module-scope `originalConfigState` string.
 */
export function createOriginalConfigStateRef(): OriginalConfigStateRef {
    let current: string | null = null;
    return {
        getOriginalConfigState: () => current,
        setOriginalConfigState: (value) => {
            current = value;
        },
    };
}

export function createLogStatusState(): LogStatusState { return { lastStatus: { sync: null, hsc: null, tl: null }, logTab: null, statusRequestId: 0, topListStatusAvailable: true }; }
export function createViewShowEphemeralState(): ViewShowEphemeralState { return { formAc: null, statusInterval: null }; }

// ─── AppState aggregate ───────────────────────────────────────────────────────

/** The single bag the future `index.ts` factory builds once per page mount and passes (whole or split by sub-holder) to every module. `viewShow` is the only holder re-created on every view-show; all others live for the page's lifetime. */
export interface AppState {
    readonly hsc: HscState;
    readonly manage: ManageState;
    readonly savedFilters: SavedFiltersState;
    readonly topLists: TopListsState;
    readonly libraryCache: LibraryCacheState;
    readonly miUsers: MiUsersState;
    readonly hseUserCache: HseUserCacheState;
    readonly originalConfigState: OriginalConfigStateRef;
    readonly logStatus: LogStatusState;
    readonly viewShow: ViewShowEphemeralState;
}

/**
 * Create a fresh `AppState`. The future `index.ts` will call this once at
 * the top of `return function (view) {…}` and then `state.viewShow` will be
 * reset per view-show by calling `createViewShowEphemeralState()` again
 * and assigning it back onto the bag.
 */
export function createAppState(): AppState {
    return {
        hsc: createHscState(),
        manage: createManageState(),
        savedFilters: createSavedFiltersState(),
        topLists: createTopListsState(),
        libraryCache: createLibraryCacheState(),
        miUsers: createMiUsersState(),
        hseUserCache: createHseUserCacheState(),
        originalConfigState: createOriginalConfigStateRef(),
        logStatus: createLogStatusState(),
        viewShow: createViewShowEphemeralState(),
    };
}
