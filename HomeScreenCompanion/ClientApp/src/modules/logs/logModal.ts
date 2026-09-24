// Phase 3 wave 2: live-log rendering, leaf module.
//
// Lifted from `Configuration/configPage.js` (legacy.js:2589-2745).
// Five functions extracted here:
//
//   - `renderLogLines(container, entries, isRunning)` (legacy.js:2589)
//     Pure given inputs: walks each entry, classifies its leading
//     symbol/timestamp, appends a `<div class="log-line …">` per line,
//     and conditionally sticks the scroll position to the bottom.
//
//   - `renderLogModal(view, deps)` (legacy.js:2641). Reads
//     `deps.state.lastStatus` and `deps.state.logTab` and renders the
//     merged task log tabs/body into `#logModal`.
//
//   - `refreshStatus(view, deps)` (legacy.js:2679). Fires three
//     `getJSON` calls (`HomeScreenCompanion/Status`,
//     `HomeScreenCompanion/Hsc/Status`,
//     `HomeScreenCompanion/TopList/Status`), guards with the
//     `statusRequestId` request-id race gate, writes
//     `deps.state.lastStatus`, then pings `deps.checkFormState()` and
//     re-renders the modal.
//
//   - `sortRows(container, criteria)` (legacy.js:2719) Pure from DOM +
//     `criteria`: reorders the `.tag-row` children and toggles the
//     `.sort-hidden` container class based on the sort key.

import type { LogStatusState, LogTabKey, TaskStatusLike } from '../state/state';

/**
 * Minimal Jellyfin `ApiClient` shape the log-modal helpers touch. The
 * factory in `index.ts` builds a thin wrapper that resolves the
 * `ApiClient.getUrl(name, params)` URL internally so the log-modal code
 * never has to reach for `window.ApiClient` directly.
 */
export interface LogModalApiClient {
    getJSON<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * Dependencies for the log-modal helpers:
 *
 *   - `getApiClient`    returns a fresh `LogModalApiClient` (the factory
 *                       builds one per page mount).
 *   - `state`           the {@link LogStatusState} holder: writes
 *                       happen to `lastStatus` and `statusRequestId`
 *                       (from `refreshStatus`); reads happen to
 *                       `lastStatus` and `logTab` (from `renderLogModal`).
 *   - `checkFormState`  closure target for `refreshStatus`
 *                       (legacy.js:2699). Bound at the factory so the
 *                       wiring keeps the existing `CheckFormStateDeps`
 *                       shape.
 */
export interface LogModalDeps {
    readonly getApiClient: () => LogModalApiClient;
    readonly state: LogStatusState;
    readonly checkFormState: () => void;
}

/**
 * A single classified log line. The server-side task emits one `text`
 * per line; `src` is the task key (`'sync'`, `'hsc'`, `'tl'`) the line
 * came from and is only shown when more than one source is present in
 * the same render call.
 */
export interface LogEntry {
    readonly src: string;
    readonly text: string;
}

/**
 * Subset of an HTMLDivElement behavior we depend on, so we don't have
 * to type everything as `HTMLElement` (which would leak `Window`
 * typings into callers that only want to feed us the body's log
 * surface).
 *
 * Concretely: `.scrollHeight`, `.scrollTop`, `.clientHeight`,
 * `.childElementCount`, `.textContent`, and the document-fragment
 * append path.
 */
export interface LogContainer extends HTMLElement {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
    childElementCount: number;
    textContent: string;
}

/**
 * Regex matching the `[HH:MM:SS]` (or `[HH:MM:SS ]`) timestamp prefix
 * each task line begins with. Captured group `1` is the time itself;
 * group `0` (whole match) is the prefix length we strip from `raw`.
 */
const TIMESTAMP_PREFIX_RE = /^\[(\d{2}:\d{2}:\d{2})\] ?/;

/** Regex matching the leading `[DEBUG] ` token, case-sensitive. */
const DEBUG_PREFIX_RE = /^\[DEBUG\] ?/;

/** All-equals-character lines render as `class="log-rule"`. */
const RULE_LINE_RE = /^=+$/;

/** Indented dash-prefixed skip lines (`"  – something"`, 1–3 leading spaces). */
const SKIP_PREFIX_RE = /^\s{1,3}– /;

/**
 * Regex covering banners the server uses to visually separate phases.
 * A match (`»`, `Results`, `Summary`, `[Cleanup]`, `[i/N]`, `Home Screen
 * (Companion|Sync) …`) renders as `class="log-head"`.
 */
const HEAD_PREFIX_RE = /^(»|Results$|Summary$|\[Cleanup\]$|\[\d+\/\d+\] |Home Screen (Companion|Sync) )/;

/**
 * Classify one log line's `raw` text into a CSS class.
 *
 * Order matters — the leading `[DEBUG]` token is stripped and wins
 * before any symbol classification, the equals-rule wins before
 * symbol inspection, and the skip prefix is checked before the head
 * banner because both can appear at low indentation.
 *
 * @returns Empty string for unclassified, `'log-blank'` for empty
 *          lines, or one of the other classes above.
 */
export function classifyLogLine(raw: string): string {
    if (DEBUG_PREFIX_RE.test(raw)) return 'log-debug';
    if (raw.trim() === '') return 'log-blank';
    if (RULE_LINE_RE.test(raw.trim())) return 'log-rule';
    if (raw.indexOf('✖') >= 0) return 'log-err';
    if (raw.indexOf('⚠') >= 0) return 'log-warn';
    if (raw.indexOf('✔') >= 0) return 'log-ok';
    if (SKIP_PREFIX_RE.test(raw)) return 'log-skip';
    if (HEAD_PREFIX_RE.test(raw)) return 'log-head';
    return '';
}

/**
 * Render one entry's `<div>` into `frag`, mirroring `legacy.js:2615-2632`.
 *
 * Blank lines are emitted as a single-space text node (the legacy
 * `<div class="log-line log-blank">' '</div>` form). All other lines get
 * a `<span class="log-ts">` (timestamp, possibly empty), an optional
 * `<span class="log-src">` (only when multiple sources are visible),
 * and a text node for `raw`.
 *
 * Caller is responsible for appending the fragment to the container.
 *
 * @param frag        DocumentFragment we accumulate into.
 * @param src         Source task key; only emitted when `showSrc`.
 * @param ts          Pre-parsed timestamp string (no brackets).
 * @param raw         Text body after timestamp strip.
 * @param cls         CSS class returned by `classifyLogLine`.
 * @param showSrc     When true, emit a `.log-src` span before the text.
 */
function appendLogLine(
    frag: DocumentFragment,
    src: string,
    ts: string,
    raw: string,
    cls: string,
    showSrc: boolean,
): void {
    const line = document.createElement('div');
    line.className = 'log-line' + (cls ? ' ' + cls : '');
    if (cls !== 'log-blank') {
        const tsEl = document.createElement('span');
        tsEl.className = 'log-ts';
        tsEl.textContent = ts;
        line.appendChild(tsEl);
        if (showSrc) {
            const srcEl = document.createElement('span');
            srcEl.className = 'log-src';
            srcEl.textContent = src;
            line.appendChild(srcEl);
        }
        line.appendChild(document.createTextNode(raw));
    } else {
        line.textContent = ' ';
    }
    frag.appendChild(line);
}

/**
 * Render the merged task log into `container`. See `legacy.js:2589-2637`
 * for the original.
 *
 * Algorithm:
 *   1. Decide whether to "stick to bottom" — only while a task is
 *      running and the scroll position is within 40px of the bottom.
 *      Cached before the empty-check so a wipe-then-redraw on a long
 *      log keeps the user's scroll position instead of jolting down.
 *   2. Empty entries → `(no logs yet)` placeholder; return.
 *   3. Count distinct `src` values. Two or more → show the source badge
 *      column. Walk each entry, parse the leading `[HH:MM:SS]` prefix,
 *      classify the remainder with the same priority order as legacy.
 *      Build all DOM into a `DocumentFragment`, then swap the container
 *      content in one write.
 *   4. Re-apply the bottom-sticky state — also force-sticky if the
 *      container was empty before (first paint).
 *
 * The function never reads any module-scope state. All callers must
 * supply `entries` and `isRunning`; the scroll-stick proximity check
 * is local to the container.
 *
 * @param container  The DOM element we're rendering into.
 * @param entries    The flat list of log lines to render.
 * @param isRunning  `true` while any task is still emitting lines.
 */
export function renderLogLines(
    container: LogContainer,
    entries: readonly LogEntry[],
    isRunning: boolean,
): void {
    const stickToBottom =
        isRunning &&
        container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    const wasEmpty = container.childElementCount === 0;

    if (!entries.length) {
        container.textContent = '(no logs yet)';
        return;
    }

    const srcCount: Record<string, 1> = {};
    for (const e of entries) srcCount[e.src] = 1;
    const showSrc = Object.keys(srcCount).length > 1;

    const frag = document.createDocumentFragment();
    for (const e of entries) {
        let raw: string = e.text || '';
        let ts = '';
        const m = raw.match(TIMESTAMP_PREFIX_RE);
        if (m) {
            ts = m[1] ?? '';
            raw = raw.substring(m[0].length);
        }
        let cls = '';
        if (DEBUG_PREFIX_RE.test(raw)) {
            cls = 'log-debug';
            raw = raw.replace(DEBUG_PREFIX_RE, '');
        } else {
            cls = classifyLogLine(raw);
        }
        appendLogLine(frag, e.src, ts, raw, cls, showSrc);
    }
    container.textContent = '';
    container.appendChild(frag);
    if (stickToBottom || wasEmpty) container.scrollTop = container.scrollHeight;
}

/**
 * Selector the legacy `sortRows` walks — `.tag-row` direct
 * children of `container`. Exposed so tests can build fixtures that
 * match the production contract.
 */
export const SORT_ROW_SELECTOR = '.tag-row';

/**
 * The four `criteria` values `sortRows` understands. Keys are the
 * `<select>` values from the tag-list sort dropdown. `'Manual'` is a
 * no-op for ordering (preserves DOM order) but toggles the
 * `.sort-hidden` class off so the drag handles are visible.
 */
export type SortCriteria = string;

/**
 * Sort the `.tag-row` children of `container` according to `criteria`.
 *
 *   - `'Name'` — alphabetical by entry label (or tag name fallback),
 *                case-insensitive.
 *   - `'Active'` — checked-first (descending by checked-state integer).
 *   - `'LatestEdited'` — descending by `data-last-modified` timestamp.
 *   - Anything else (including the sentinel `'Manual'`) — ascending by
 *                          `data-index` attribute.
 *
 * `.sort-hidden` is removed iff `criteria === 'Manual'`; otherwise it
 * is set so the drag handles are hidden during a non-manual sort.
 *
 * @param container  The list root whose `.tag-row` children to sort.
 * @param criteria   The sort key. Any value not in the table falls
 *                   back to index-order.
 */
export function sortRows(container: HTMLElement, criteria: SortCriteria): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>(SORT_ROW_SELECTOR));

    rows.sort((a, b) => {
        if (criteria === 'Name') {
            const aInput = a.querySelector<HTMLInputElement>('.txtEntryLabel')
                ?? a.querySelector<HTMLInputElement>('.txtTagName');
            const bInput = b.querySelector<HTMLInputElement>('.txtEntryLabel')
                ?? b.querySelector<HTMLInputElement>('.txtTagName');
            const na = (aInput?.value ?? '').toLowerCase();
            const nb = (bInput?.value ?? '').toLowerCase();
            return na.localeCompare(nb);
        }
        if (criteria === 'Active') {
            const aa = a.querySelector<HTMLInputElement>('.chkTagActive')?.checked ? 1 : 0;
            const bb = b.querySelector<HTMLInputElement>('.chkTagActive')?.checked ? 1 : 0;
            return bb - aa;
        }
        if (criteria === 'LatestEdited') {
            const da = new Date(a.dataset.lastModified || '0').getTime();
            const db = new Date(b.dataset.lastModified || '0').getTime();
            return db - da;
        }
        return parseInt(a.dataset.index ?? '0', 10) - parseInt(b.dataset.index ?? '0', 10);
    });

    for (const row of rows) container.appendChild(row);

    if (criteria !== 'Manual') container.classList.add('sort-hidden');
    else container.classList.remove('sort-hidden');
}

/**
 * Render the log modal tabs + body into `view` (legacy.js:2641-2677).
 *
 * Picks the "selected" tab in this order:
 *   1. `deps.state.logTab` (the user's pinned tab), else
 *   2. the first tab whose `IsRunning` is true, else
 *   3. the tab whose `StartedUtc` parses as the most-recent, else
 *   4. `'sync'`.
 *
 * Walks every `#logTabs .log-tab`, toggling its `active` / `empty`
 * classes and the inner `.status-dot` visibility / `running` class +
 * the `.log-tab-time` text. Then builds the merged `LogEntry[]` for the
 * selected tab and hands off to {@link renderLogLines}; when no logs
 * exist for the selected tab, writes `(no runs yet)` and returns.
 *
 * `Logs` from the server is `readonly unknown[]`; each entry is coerced
 * via `String()` because the legacy `renderLogLines` body calls
 * `e.text || ''` and treats `text` as a string. The cast through
 * `LogTabKey` after `tab.getAttribute('data-log')` is safe because the
 * DOM is owned by `Configuration/configPage.html` and only contains the
 * three expected keys.
 *
 * @param view  The config page root containing `#logTabs` + `#logContent`.
 * @param deps  See {@link LogModalDeps}.
 */
export function renderLogModal(view: HTMLElement, deps: LogModalDeps): void {
    const content = view.querySelector<HTMLElement>('#logContent');
    const tabs = view.querySelectorAll<HTMLElement>('#logTabs .log-tab');
    if (!content) return;

    const keys: readonly LogTabKey[] = ['sync', 'hsc', 'tl'];
    const ls = deps.state.lastStatus;
    function startedMs(k: LogTabKey): number {
        const s = ls[k];
        const t = s && s.StartedUtc ? Date.parse(s.StartedUtc) : NaN;
        return isNaN(t) ? 0 : t;
    }
    function running(k: LogTabKey): boolean {
        const s = ls[k];
        return !!(s && s.IsRunning);
    }
    function logs(k: LogTabKey): readonly unknown[] {
        const s = ls[k];
        return (s && s.Logs) || [];
    }

    let selected: LogTabKey | null = deps.state.logTab;
    if (!selected) {
        const runningKey = keys.find((k) => running(k));
        if (runningKey) {
            selected = runningKey;
        } else {
            let best = 0;
            keys.forEach((k) => {
                const ms = startedMs(k);
                if (ms > best) { best = ms; selected = k; }
            });
        }
        if (!selected) selected = 'sync';
    }
    const finalSelected: LogTabKey = selected;

    tabs.forEach((tab) => {
        const k = (tab.getAttribute('data-log') ?? '') as LogTabKey;
        tab.classList.toggle('active', k === finalSelected);
        tab.classList.toggle('empty', logs(k).length === 0 && !running(k));
        const dot = tab.querySelector<HTMLElement>('.status-dot');
        if (dot) {
            dot.className = 'status-dot';
            if (running(k)) dot.classList.add('running');
            dot.style.visibility = (running(k) || logs(k).length) ? 'visible' : 'hidden';
        }
        const timeEl = tab.querySelector<HTMLElement>('.log-tab-time');
        if (timeEl) {
            const ms = startedMs(k);
            timeEl.textContent = ms
                ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '';
        }
    });

    const rawLogs = logs(finalSelected);
    const entries: LogEntry[] = rawLogs.map((l): LogEntry => ({ src: finalSelected, text: String(l) }));
    if (!entries.length) {
        content.textContent = '(no runs yet)';
        return;
    }
    renderLogLines(content, entries, running(finalSelected));
}

/**
 * Poll the three status endpoints, then refresh the log modal
 * (legacy.js:2679-2717).
 *
 *   1. `++deps.state.statusRequestId` (captured as `myId`).
 *   2. `Promise.all` over `getJSON('HomeScreenCompanion/Status')` plus
 *      `.catch(() => null)` wrappers for the `Hsc/Status` and
 *      `TopList/Status` endpoints.
 *   3. On resolve: if `myId !== deps.state.statusRequestId`, discard
 *      (the user already triggered a newer refresh). Otherwise:
 *      - toggle `.btn-save` / `#btnRunSync` based on `IsRunning`
 *        (either the sync or hsc task counts);
 *      - if not running, ping `deps.checkFormState()` (matches the
 *        legacy `else` branch at legacy.js:2699);
 *      - stamp `#lastRunStatusLabel` + the `#dotStatus` class;
 *      - write `deps.state.lastStatus = { sync, hsc, tl }`;
 *      - call `renderLogModal(view, deps)` when `#logContent` exists.
 *   4. On full rejection (only possible when the sync endpoint rejects,
 *      since the other two have inner `.catch` fallbacks): just check
 *      the request id and return — matches the silent catch at
 *      legacy.js:2714.
 *
 * @param view  The config page root. Used to find `#lastRunStatusLabel`,
 *              `#dotStatus`, `.btn-save`, `#btnRunSync`, and `#logContent`.
 * @param deps  See {@link LogModalDeps}.
 */
export function refreshStatus(view: HTMLElement, deps: LogModalDeps): void {
    const myId = ++deps.state.statusRequestId;
    const api = deps.getApiClient();

    Promise.all([
        api.getJSON<TaskStatusLike>('HomeScreenCompanion/Status'),
        api.getJSON<TaskStatusLike>('HomeScreenCompanion/Hsc/Status').catch(() => null),
        api.getJSON<TaskStatusLike>('HomeScreenCompanion/TopList/Status').catch(() => null),
    ]).then((results) => {
        if (myId !== deps.state.statusRequestId) return;
        const result = results[0];
        const hscResult = results[1];
        const tlResult = results[2];

        const label = view.querySelector<HTMLElement>('#lastRunStatusLabel');
        const dot = view.querySelector<HTMLElement>('#dotStatus');
        const content = view.querySelector<HTMLElement>('#logContent');
        const btnSave = view.querySelector<HTMLElement>('.btn-save');
        const btnRun = view.querySelector<HTMLElement>('#btnRunSync');

        const eitherRunning = !!(result && result.IsRunning) || !!(hscResult && hscResult.IsRunning);
        if (eitherRunning) {
            if (btnSave) {
                (btnSave as HTMLButtonElement).disabled = true;
                btnSave.style.opacity = '0.5';
                const span = btnSave.querySelector<HTMLElement>('span');
                if (span) span.textContent = 'Sync in progress...';
            }
            if (btnRun) (btnRun as HTMLButtonElement).disabled = true;
        } else {
            if (btnRun) (btnRun as HTMLButtonElement).disabled = false;
            if (btnSave) {
                const span = btnSave.querySelector<HTMLElement>('span');
                if (span) span.textContent = 'Save Settings';
                deps.checkFormState();
            }
        }

        if (label) label.textContent = (result && result.LastRunStatus) || 'Never';
        if (dot) {
            dot.className = 'status-dot';
            const st = (result && result.LastRunStatus) || '';
            if (st.includes('Running')) dot.classList.add('running');
            else if (/failed|error/i.test(st)) dot.classList.add('failed');
            else if (/warning/i.test(st)) dot.classList.add('warn');
        }

        deps.state.lastStatus = { sync: result, hsc: hscResult, tl: tlResult };
        if (content) renderLogModal(view, deps);
    }).catch(() => {
        if (myId !== deps.state.statusRequestId) return;
    });
}
