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

import { describe, it, expect, beforeEach } from 'vitest';

import {
    renderLogLines,
    sortRows,
    classifyLogLine,
    type LogEntry,
    type LogContainer,
} from './logModal';

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
