/// <reference types="vitest" />
//
// Fresh structural tests for `modules/filters/savedFilters.ts`. The
// legacy `html-helpers.test.ts` does pin `escapeHtml` behavior via
// snapshots, but per the migration plan those mirrors live with the
// legacy suite. Here we assert the same observable contract through
// explicit value checks rather than snapshot files, so a future drift
// in either implementation surfaces as a localized test failure.
//
// `getMySavedFiltersPanelHtml` has no legacy snapshot; we test it via
// happy-dom-free substring assertions on the generated HTML.

import { describe, it, expect } from 'vitest';
import { escapeHtml, getMySavedFiltersPanelHtml, type SavedFilter } from './savedFilters';

describe('escapeHtml', () => {
    it('escapes ampersands', () => {
        expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('escapes less-than and greater-than', () => {
        expect(escapeHtml('<script>alert(1)</script>'))
            .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('he said "hi"')).toBe('he said &quot;hi&quot;');
    });

    it('does NOT escape single quotes (legacy behavior pinned)', () => {
        // Pinned by html-helpers.test.ts snapshot — adding `'` → `&#39;`
        // here would diverge from legacy. Keep it on purpose.
        expect(escapeHtml("it's fine")).toBe("it's fine");
    });

    it('escapes ampersand before other entities (order matters)', () => {
        // If the implementation reordered the replacements, `&` could
        // be double-escaped. Pin the order: `&` first, then `<`/`>`/`"`.
        expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });

    it('coerces non-string input via String()', () => {
        expect(escapeHtml(42)).toBe('42');
        expect(escapeHtml(null)).toBe('null');
        expect(escapeHtml(undefined)).toBe('undefined');
    });

    it('returns empty string for empty input', () => {
        expect(escapeHtml('')).toBe('');
    });
});

describe('getMySavedFiltersPanelHtml', () => {
    it('returns the placeholder markup when the list is empty', () => {
        const html = getMySavedFiltersPanelHtml([]);
        expect(html).toBe(
            '<div style="font-size:0.82em; color:var(--theme-text-secondary); font-style:italic; margin-bottom:4px;">No saved filters yet.</div>'
        );
    });

    it('renders one apply+delete button pair per saved filter', () => {
        const savedFilters: SavedFilter[] = [
            { Name: '4K HDR Movies', Filters: [] },
            { Name: 'Recent Sci-Fi', Filters: [] },
        ];
        const html = getMySavedFiltersPanelHtml(savedFilters);
        expect(html).toContain('class="btnApplyMySavedFilter"');
        expect(html).toContain('class="btnDeleteMySavedFilter"');
        // Two data-index markers per filter — one for apply, one for
        // delete — and they must be 0 / 1 in order.
        expect(html).toContain('data-index="0"');
        expect(html).toContain('data-index="1"');
        expect(html).toContain('>4K HDR Movies</button>');
        expect(html).toContain('>Recent Sci-Fi</button>');
    });

    it('HTML-escapes the filter Name so XSS via Name is impossible', () => {
        const savedFilters: SavedFilter[] = [
            { Name: '<img src=x onerror=alert(1)>', Filters: [] },
        ];
        const html = getMySavedFiltersPanelHtml(savedFilters);
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img src=x onerror=alert(1)>');
    });

    it('emits a delete title attribute on every delete button', () => {
        const savedFilters: SavedFilter[] = [
            { Name: 'A', Filters: [] },
            { Name: 'B', Filters: [] },
        ];
        const html = getMySavedFiltersPanelHtml(savedFilters);
        const deleteButtons = html.match(/class="btnDeleteMySavedFilter"/g) ?? [];
        expect(deleteButtons.length).toBe(2);
        // Every delete button must carry the "Delete" tooltip so the
        // UX stays consistent with the rest of the controls.
        expect(html.match(/title="Delete"/g)?.length).toBe(2);
    });

    it('uses a flex wrapper so multiple filters wrap onto multiple rows', () => {
        const savedFilters: SavedFilter[] = [
            { Name: 'A', Filters: [] },
            { Name: 'B', Filters: [] },
        ];
        const html = getMySavedFiltersPanelHtml(savedFilters);
        expect(html).toContain('<div style="display:flex; flex-wrap:wrap; gap:6px;">');
    });

    it('treats the array as read-only — does not mutate it', () => {
        const savedFilters: SavedFilter[] = [
            { Name: 'A', Filters: [] },
        ];
        const before = JSON.stringify(savedFilters);
        getMySavedFiltersPanelHtml(savedFilters);
        expect(JSON.stringify(savedFilters)).toBe(before);
    });
});
