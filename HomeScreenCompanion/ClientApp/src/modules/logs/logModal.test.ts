/// <reference types="vitest" />
//
// Unit tests for `modules/logs/logModal.ts`.
//
// 3 happy-dom tests for `renderLogLines` — empty entries, populated
// entries (multi-source + classifications), isRunning scroll-stick
// behavior. We snapshot a static substring of the resulting HTML
// rather than the whole tree.
//
// `sortRows` and `classifyLogLine` are also unit-tested here since
// they live in the same module and are pure given inputs.
//
// `renderLogModal` and `refreshStatus` are smoke-tested here —
// minimal DOM fixture, mocked `ApiClient.getJSON`, drained microtasks
// (manageTab.test.ts pattern). The stale-response guard test fires
// two `refreshStatus` calls back-to-back, resolves the second's
// promises before the first's, and asserts the first's result is
// discarded via the `statusRequestId` race gate.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    renderLogLines,
    renderLogModal,
    refreshStatus,
    sortRows,
    classifyLogLine,
    type LogEntry,
    type LogContainer,
    type LogModalApiClient,
    type LogModalDeps,
} from './logModal';
import { createLogStatusState } from '../state/state';

function makeContainer(): LogContainer {
    const el = document.createElement('div') as unknown as LogContainer;
    // Properties that act like the DOM's layout reads. happy-dom's
    // defaults are zeros, so we stub them with get/set accessors we
    // control.
    Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(el, 'childElementCount', {
        get() { return el.children.length; },
        configurable: true,
    });
    return el;
}

describe('classifyLogLine', () => {
    it('classifies the symbol and banner prefixes by priority', () => {
        expect(classifyLogLine('[DEBUG] hello')).toBe('log-debug');
        expect(classifyLogLine('   ')).toBe('log-blank');
        expect(classifyLogLine('===========')).toBe('log-rule');
        expect(classifyLogLine('something ✖ bad')).toBe('log-err');
        expect(classifyLogLine('something ⚠ iffy')).toBe('log-warn');
        expect(classifyLogLine('something ✔ good')).toBe('log-ok');
        expect(classifyLogLine('  – did not match')).toBe('log-skip');
        expect(classifyLogLine('» next phase')).toBe('log-head');
        expect(classifyLogLine('Results')).toBe('log-head');
        expect(classifyLogLine('[1/3] starting')).toBe('log-head');
        expect(classifyLogLine('Home Screen Sync starting')).toBe('log-head');
        expect(classifyLogLine('plain informational line')).toBe('');
    });
});

describe('renderLogLines', () => {
    let container: LogContainer;

    beforeEach(() => {
        container = makeContainer();
    });

    it('writes the empty-state placeholder when entries is empty', () => {
        renderLogLines(container, [], false);
        expect(container.textContent).toBe('(no logs yet)');
        // Wipe → 0 child elements by definition.
        expect(container.childElementCount).toBe(0);
    });

    it('renders lines, applies classes, and shows the source column when >1 src', () => {
        const entries: LogEntry[] = [
            { src: 'sync', text: '[12:34:56] [DEBUG] writing tags' },
            { src: 'sync', text: '[12:34:57] Processing item' },
            { src: 'hsc', text: '[12:34:58] ✔ copied layout' },
            { src: 'tl', text: '[12:34:59] Something went wrong' },
            { src: 'sync', text: '[12:35:00] » next phase' },
        ];
        renderLogLines(container, entries, false);

        // Each entry rendered one .log-line div → 5 in total.
        const lines = container.querySelectorAll('.log-line');
        expect(lines.length).toBe(5);

        // First line: [DEBUG] stripped, .log-debug wins.
        expect(lines[0]!.classList.contains('log-debug')).toBe(true);
        expect(lines[0]!.textContent).toContain('writing tags');

        // Third: warn/err prefix wins only if not [DEBUG]. This line
        // starts with ✖ implicitly (we passed plain text with the
        // unicode symbol — but here we wrote `something went wrong`).
        // Re-check: third entry had ✔ → log-ok.
        expect(lines[2]!.classList.contains('log-ok')).toBe(true);
        expect(lines[2]!.textContent).toContain('copied layout');

        // Fourth entry: text without symbol → unclassified, falls through
        // to empty-string className (no second space after log-line).
        expect(lines[3]!.className).toBe('log-line');

        // Fifth entry: » banner → log-head.
        expect(lines[4]!.classList.contains('log-head')).toBe(true);

        // Source badge column is visible (3 distinct srcs).
        const srcs = container.querySelectorAll('.log-src');
        expect(srcs.length).toBe(5);
    });

    it('hides the source column when all entries share a single src', () => {
        const entries: LogEntry[] = [
            { src: 'sync', text: 'line one' },
            { src: 'sync', text: 'line two' },
        ];
        renderLogLines(container, entries, false);
        const srcs = container.querySelectorAll('.log-src');
        expect(srcs.length).toBe(0);
    });

    it('sticks to bottom while running and near-bottom; resets to top otherwise', () => {
        // Pre-populate helper. We *always* override the scrollTop set
        // after the first paint, so the first-paint force-stick
        // (`wasEmpty=true && …scrollTop = scrollHeight`) doesn't matter.
        function primedContainer(scrollTop: number): LogContainer {
            const c = makeContainer();
            const cTop: { v: number } = { v: 800 }; // first paint will set v=1000
            Object.defineProperty(c, 'scrollTop', {
                get() { return cTop.v; },
                set(v: number) { cTop.v = v; },
                configurable: true,
            });
            renderLogLines(c, [{ src: 'sync', text: 'baseline' }], false);
            // Override post-paint scroll.
            cTop.v = scrollTop;
            return c;
        }

        // Far-from-bottom + running → no stick.
        const c2 = primedContainer(0);
        renderLogLines(c2, [{ src: 'sync', text: 'appended' }], true);
        expect(c2.scrollTop).toBe(0);

        // Exactly at the threshold (40px): 1000 - scrollTop - 200 = 40,
        // which is NOT <40 → no stick.
        const c3 = primedContainer(760);
        renderLogLines(c3, [{ src: 'sync', text: 'appended' }], true);
        expect(c3.scrollTop).toBe(760);

        // One pixel past the threshold (39px): <40 → stick to bottom.
        const c4 = primedContainer(761);
        renderLogLines(c4, [{ src: 'sync', text: 'appended' }], true);
        expect(c4.scrollTop).toBe(1000);
    });
});

describe('sortRows', () => {
    /**
     * Build a `<div>` containing `n` rows, each with a label input
     * `.txtEntryLabel` carrying the given `label`, an active checkbox,
     * a `data-index` and `data-last-modified` attribute. Returns the
     * container; tests can either run `sortRows` and then re-read the
     * container's child order, or call it directly.
     */
    function makeList(
        rows: ReadonlyArray<{ label: string; active: boolean; index: number; lastModified: string }>,
    ): HTMLElement {
        const container = document.createElement('div');
        for (const r of rows) {
            const row = document.createElement('div');
            row.className = 'tag-row';
            row.dataset.index = String(r.index);
            row.dataset.lastModified = r.lastModified;
            const input = document.createElement('input');
            input.className = 'txtEntryLabel';
            input.value = r.label;
            row.appendChild(input);
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'chkTagActive';
            chk.checked = r.active;
            row.appendChild(chk);
            container.appendChild(row);
        }
        return container;
    }

    it('sorts by Name using txtEntryLabel.value, case-insensitive', () => {
        const c = makeList([
            { label: 'Charlie', active: false, index: 0, lastModified: '0' },
            { label: 'alpha',   active: false, index: 1, lastModified: '0' },
            { label: 'Bravo',   active: false, index: 2, lastModified: '0' },
        ]);
        sortRows(c, 'Name');
        expect((c.children[0]!.querySelector('.txtEntryLabel') as HTMLInputElement).value).toBe('alpha');
        expect((c.children[1]!.querySelector('.txtEntryLabel') as HTMLInputElement).value).toBe('Bravo');
        expect((c.children[2]!.querySelector('.txtEntryLabel') as HTMLInputElement).value).toBe('Charlie');
    });

    it('sorts active-first when criteria=Active and toggles .sort-hidden', () => {
        const c = makeList([
            { label: 'A', active: false, index: 0, lastModified: '0' },
            { label: 'B', active: true,  index: 1, lastModified: '0' },
            { label: 'C', active: false, index: 2, lastModified: '0' },
        ]);
        sortRows(c, 'Active');
        expect((c.children[0]!.querySelector('.chkTagActive') as HTMLInputElement).checked).toBe(true);
        expect(c.classList.contains('sort-hidden')).toBe(true);
    });

    it('removes .sort-hidden for Manual and re-sorts ascending by data-index', () => {
        const c = makeList([
            { label: 'A', active: true, index: 2, lastModified: '0' },
            { label: 'B', active: true, index: 0, lastModified: '0' },
        ]);
        c.classList.add('sort-hidden');
        sortRows(c, 'Manual');
        expect(c.classList.contains('sort-hidden')).toBe(false);
        expect((c.children[0]! as HTMLElement).dataset.index).toBe('0');
        expect((c.children[1]! as HTMLElement).dataset.index).toBe('2');
    });

    it('sorts LatestEdited descending by data-last-modified', () => {
        const c = makeList([
            { label: 'A', active: false, index: 0, lastModified: '2024-01-01T00:00:00Z' },
            { label: 'B', active: false, index: 1, lastModified: '2025-06-01T00:00:00Z' },
            { label: 'C', active: false, index: 2, lastModified: '2024-12-01T00:00:00Z' },
        ]);
        sortRows(c, 'LatestEdited');
        expect((c.children[0]!.querySelector('.txtEntryLabel') as HTMLInputElement).value).toBe('B');
        expect((c.children[1]!.querySelector('.txtEntryLabel') as HTMLInputElement).value).toBe('C');
        expect((c.children[2]!.querySelector('.txtEntryLabel') as HTMLInputElement).value).toBe('A');
    });
});

/**
 * Build a minimal `#logModal` fixture: three `.log-tab` children of
 * `#logTabs`, each carrying a `.status-dot` + `.log-tab-time`, plus
 * the `#logContent` body that `renderLogModal` writes into. Returns
 * the view element so tests can append it to `document.body`.
 */
function buildLogView(): HTMLElement {
    document.body.innerHTML = '';
    const view = document.createElement('div');
    view.id = 'logModal';
    view.innerHTML = [
        '<div id="logTabs">',
        '<div class="log-tab" data-log="sync"><span class="status-dot"></span><span class="log-tab-time"></span></div>',
        '<div class="log-tab" data-log="hsc"><span class="status-dot"></span><span class="log-tab-time"></span></div>',
        '<div class="log-tab" data-log="tl"><span class="status-dot"></span><span class="log-tab-time"></span></div>',
        '</div>',
        '<div id="logContent"></div>',
        '<span id="lastRunStatusLabel"></span>',
        '<span id="dotStatus"></span>',
        '<button type="button" class="btn-save"><span>Save Settings</span></button>',
        '<button type="button" id="btnRunSync"></button>',
    ].join('');
    document.body.appendChild(view);
    return view;
}

/** Promise + manual resolve/reject for race-condition tests. */
function makeDeferred<T>(): {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (e: unknown) => void;
} {
    let resolveFn!: (v: T) => void;
    let rejectFn!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolveFn = res;
        rejectFn = rej;
    });
    return { promise, resolve: resolveFn, reject: rejectFn };
}

function makeApi(getJSON: ReturnType<typeof vi.fn>): LogModalApiClient {
    return { getJSON: getJSON as unknown as LogModalApiClient['getJSON'] };
}

function makeDeps(
    state: ReturnType<typeof createLogStatusState>,
    getJSON: ReturnType<typeof vi.fn>,
    checkFormState: ReturnType<typeof vi.fn>,
): LogModalDeps {
    return {
        getApiClient: () => makeApi(getJSON),
        state,
        checkFormState,
    };
}

describe('renderLogModal', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('marks the sync tab active and renders log lines from state.lastStatus.sync', () => {
        const view = buildLogView();
        const state = createLogStatusState();
        state.lastStatus.sync = {
            StartedUtc: '2025-06-15T12:00:00Z',
            IsRunning: false,
            LastRunStatus: 'OK',
            Logs: ['[12:00:01] line one', '[12:00:02] line two'],
        };
        const deps = makeDeps(state, vi.fn(), vi.fn());

        renderLogModal(view, deps);

        const syncTab = view.querySelector<HTMLElement>('[data-log="sync"]')!;
        const hscTab = view.querySelector<HTMLElement>('[data-log="hsc"]')!;
        const tlTab = view.querySelector<HTMLElement>('[data-log="tl"]')!;

        expect(syncTab.classList.contains('active')).toBe(true);
        expect(syncTab.classList.contains('empty')).toBe(false);
        expect(hscTab.classList.contains('empty')).toBe(true);
        expect(tlTab.classList.contains('empty')).toBe(true);

        const lines = view.querySelectorAll('#logContent .log-line');
        expect(lines.length).toBe(2);
    });

    it('picks the running tab when no logTab is pinned', () => {
        const view = buildLogView();
        const state = createLogStatusState();
        state.lastStatus.sync = { IsRunning: false, StartedUtc: '2025-06-01T00:00:00Z', Logs: [] };
        state.lastStatus.hsc = { IsRunning: true, StartedUtc: '2025-06-02T00:00:00Z', Logs: ['hot'] };
        state.lastStatus.tl = { IsRunning: false, StartedUtc: '2025-06-03T00:00:00Z', Logs: [] };
        const deps = makeDeps(state, vi.fn(), vi.fn());

        renderLogModal(view, deps);

        const hscTab = view.querySelector<HTMLElement>('[data-log="hsc"]')!;
        expect(hscTab.classList.contains('active')).toBe(true);
        expect(view.querySelector<HTMLElement>('[data-log="sync"]')!.classList.contains('active')).toBe(false);
    });

    it('falls back to the most-recent StartedUtc when nothing is running', () => {
        const view = buildLogView();
        const state = createLogStatusState();
        state.lastStatus.sync = { IsRunning: false, StartedUtc: '2025-06-01T00:00:00Z', Logs: ['oldest'] };
        state.lastStatus.hsc = { IsRunning: false, StartedUtc: '2025-06-03T00:00:00Z', Logs: ['newest'] };
        state.lastStatus.tl = { IsRunning: false, StartedUtc: '2025-06-02T00:00:00Z', Logs: ['middle'] };
        const deps = makeDeps(state, vi.fn(), vi.fn());

        renderLogModal(view, deps);

        const hscTab = view.querySelector<HTMLElement>('[data-log="hsc"]')!;
        expect(hscTab.classList.contains('active')).toBe(true);
    });

    it('writes "(no runs yet)" when the selected tab has empty Logs and writes the running dot class', () => {
        const view = buildLogView();
        const state = createLogStatusState();
        state.logTab = 'tl';
        state.lastStatus.tl = { IsRunning: true, Logs: [] };
        const deps = makeDeps(state, vi.fn(), vi.fn());

        renderLogModal(view, deps);

        const tlTab = view.querySelector<HTMLElement>('[data-log="tl"]')!;
        expect(tlTab.classList.contains('active')).toBe(true);
        expect(view.querySelector('#logContent')!.textContent).toBe('(no runs yet)');
        expect(tlTab.querySelector<HTMLElement>('.status-dot')!.classList.contains('running')).toBe(true);
    });

    it('is a no-op when #logContent is missing', () => {
        document.body.innerHTML = '<div id="logModal"></div>';
        const view = document.getElementById('logModal')!;
        const state = createLogStatusState();
        state.lastStatus.sync = { IsRunning: false, Logs: ['x'] };
        const deps = makeDeps(state, vi.fn(), vi.fn());
        expect(() => renderLogModal(view, deps)).not.toThrow();
    });
});

describe('refreshStatus', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('polls the three status endpoints, populates state.lastStatus, and pings checkFormState', async () => {
        const view = buildLogView();
        const state = createLogStatusState();
        const getJSON = vi.fn()
            .mockResolvedValueOnce({ IsRunning: false, LastRunStatus: 'OK', Logs: ['a', 'b'], StartedUtc: '2025-06-15T12:00:00Z' })
            .mockResolvedValueOnce({ IsRunning: false, LastRunStatus: 'HSC OK', Logs: ['h'] })
            .mockResolvedValueOnce(null);
        const checkFormState = vi.fn();
        const deps = makeDeps(state, getJSON, checkFormState);

        refreshStatus(view, deps);

        expect(getJSON).toHaveBeenCalledWith('HomeScreenCompanion/Status');
        expect(getJSON).toHaveBeenCalledWith('HomeScreenCompanion/Hsc/Status');
        expect(getJSON).toHaveBeenCalledWith('HomeScreenCompanion/TopList/Status');

        // Drain microtasks so the Promise.all.then runs.
        for (let i = 0; i < 20; i++) await Promise.resolve();

        expect(state.lastStatus.sync?.LastRunStatus).toBe('OK');
        expect(state.lastStatus.hsc?.LastRunStatus).toBe('HSC OK');
        expect(state.lastStatus.tl).toBe(null);
        expect(checkFormState).toHaveBeenCalledTimes(1);

        // #logContent was repopulated (renderLogModal was invoked).
        expect(view.querySelectorAll('#logContent .log-line').length).toBe(2);
    });

    it('disables .btn-save and #btnRunSync while either task is running, and skips checkFormState', async () => {
        const view = buildLogView();
        const state = createLogStatusState();
        const getJSON = vi.fn()
            .mockResolvedValueOnce({ IsRunning: true, LastRunStatus: 'Running...', Logs: [] })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        const checkFormState = vi.fn();
        const deps = makeDeps(state, getJSON, checkFormState);

        refreshStatus(view, deps);
        for (let i = 0; i < 20; i++) await Promise.resolve();

        const btnSave = view.querySelector<HTMLButtonElement>('.btn-save')!;
        const btnRun = view.querySelector<HTMLButtonElement>('#btnRunSync')!;
        expect(btnSave.disabled).toBe(true);
        expect(btnSave.style.opacity).toBe('0.5');
        expect(btnSave.querySelector('span')!.textContent).toBe('Sync in progress...');
        expect(btnRun.disabled).toBe(true);
        expect(checkFormState).not.toHaveBeenCalled();
    });

    it('stamps #lastRunStatusLabel and the failed/warn/running dot class', async () => {
        const view = buildLogView();
        const state = createLogStatusState();
        const getJSON = vi.fn()
            .mockResolvedValueOnce({ IsRunning: false, LastRunStatus: 'Sync failed: timeout', Logs: [] })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        const deps = makeDeps(state, getJSON, vi.fn());

        refreshStatus(view, deps);
        for (let i = 0; i < 20; i++) await Promise.resolve();

        expect(view.querySelector<HTMLElement>('#lastRunStatusLabel')!.textContent).toBe('Sync failed: timeout');
        expect(view.querySelector<HTMLElement>('#dotStatus')!.classList.contains('failed')).toBe(true);
    });

    it('discards the stale response when a newer refresh completes first (request-id race gate)', async () => {
        const view = buildLogView();
        const state = createLogStatusState();

        // First refresh gets slow promises; second gets fast ones. Both
        // share the same getJSON mock; we route by call index.
        let callIdx = 0;
        const slow = [makeDeferred(), makeDeferred(), makeDeferred()];
        const fast = [makeDeferred(), makeDeferred(), makeDeferred()];
        const getJSON = vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx <= 3) return slow[callIdx - 1]!.promise;
            return fast[callIdx - 4]!.promise;
        });
        const deps = makeDeps(state, getJSON, vi.fn());

        refreshStatus(view, deps);  // myId=1, statusRequestId=1
        refreshStatus(view, deps);  // myId=2, statusRequestId=2
        expect(state.statusRequestId).toBe(2);

        // Resolve the second (fast) refresh first.
        fast[0]!.resolve({ IsRunning: false, LastRunStatus: 'fast-sync', Logs: [] });
        fast[1]!.resolve(null);
        fast[2]!.resolve(null);
        for (let i = 0; i < 20; i++) await Promise.resolve();
        expect(state.lastStatus.sync?.LastRunStatus).toBe('fast-sync');

        // Now resolve the first (slow) refresh — the myId check must
        // discard it and leave state.lastStatus pointing at 'fast-sync'.
        slow[0]!.resolve({ IsRunning: false, LastRunStatus: 'slow-sync', Logs: [] });
        slow[1]!.resolve(null);
        slow[2]!.resolve(null);
        for (let i = 0; i < 20; i++) await Promise.resolve();
        expect(state.lastStatus.sync?.LastRunStatus).toBe('fast-sync');
    });
});
