// Phase 3 wave 2: live-log rendering, leaf module.
//
// Lifted from `Configuration/configPage.js` (legacy.js:2589-2745).
// Three functions extracted here:
//
//   - `renderLogLines(container, entries, isRunning)` (legacy.js:2589)
//     Pure given inputs: walks each entry, classifies its leading
//     symbol/timestamp, appends a `<div class="log-line …">` per line,
//     and conditionally sticks the scroll position to the bottom.
//
//   - `renderLogModal(view)` (legacy.js:2641) DEFERRED. Reads three
//     module-scope vars (`_lastStatus`, `_logTab`) and the implicit
//     `keys = ['sync', 'hsc', 'tl']` task tab set.
//
//   - `sortRows(container, criteria)` (legacy.js:2719) Pure from DOM +
//     `criteria`: reorders the `.tag-row` children and toggles the
//     `.sort-hidden` container class based on the sort key.
//
// `refreshStatus` (legacy.js:2679) is deferred — it depends on
// `window.ApiClient`, the `statusRequestId` request-id gate, and the
// `_lastStatus` module-scope state.

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
export type SortCriteria = 'Name' | 'Active' | 'LatestEdited' | 'Manual' | string;

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
