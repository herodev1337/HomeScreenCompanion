/// <reference types="vitest" />
//
// Fresh structural tests for `modules/tags/renderTagGroup.ts`.
//
// `renderTagGroup` (legacy.js:1363) is deferred to Phase 5 — it closes
// over multiple module-scope mutables. Only `refreshTopListBadges` is
// tested here.
//
// The helper does a `document.querySelectorAll('.tag-row')` and walks
// each row's `.badge-container`. We mount synthetic rows in the
// happy-dom document and verify the helper adds / removes the
// `.tag-indicator.toplist` span in the right places.

import { describe, it, expect, afterEach } from 'vitest';
import { refreshTopListBadges } from './renderTagGroup';

const mounted: HTMLElement[] = [];
function trackMount(container: HTMLElement): HTMLElement {
    mounted.push(container);
    return container;
}
afterEach(() => {
    while (mounted.length > 0) {
        const c = mounted.pop();
        c?.remove();
    }
});

/**
 * Build one synthetic `.tag-row` element with the given `data-tag`
 * value and an empty `.badge-container`. Returns the row root so a
 * caller can append it to the document.
 */
function makeRow(tagName: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tag-row';
    row.dataset.tag = tagName;
    const container = document.createElement('div');
    container.className = 'badge-container';
    row.appendChild(container);
    return row;
}

describe('refreshTopListBadges', () => {
    it('adds a toplist indicator to rows whose tag is in the set', () => {
        const topList = new Set(['best-movies-2025', 'best-sci-fi']);
        const row1 = makeRow('best-movies-2025');
        const row2 = makeRow('best-sci-fi');
        const row3 = makeRow('regular-tag');
        document.body.append(row1, row2, row3);
        trackMount(row1); trackMount(row2); trackMount(row3);

        refreshTopListBadges(topList);

        // Rows 1 and 2 should now have the toplist indicator.
        expect(row1.querySelector('.tag-indicator.toplist')).not.toBeNull();
        expect(row2.querySelector('.tag-indicator.toplist')).not.toBeNull();
        // Row 3 should not.
        expect(row3.querySelector('.tag-indicator.toplist')).toBeNull();
    });

    it('is case-insensitive (matches the lower-cased data-tag)', () => {
        const topList = new Set(['best-movies']);
        const row = makeRow('BEST-MOVIES'); // data-tag is upper-case
        document.body.append(row);
        trackMount(row);

        refreshTopListBadges(topList);

        // The helper lower-cases `row.dataset.tag` before checking,
        // so this should match.
        expect(row.querySelector('.tag-indicator.toplist')).not.toBeNull();
    });

    it('removes the toplist indicator when the tag is no longer in the set', () => {
        // Build a row that already carries the indicator, then call
        // the helper with an EMPTY set — the indicator must be removed.
        const row = makeRow('best-movies-2025');
        const existing = document.createElement('span');
        existing.className = 'tag-indicator toplist';
        existing.innerHTML = '<i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List';
        row.querySelector('.badge-container')!.appendChild(existing);
        document.body.append(row);
        trackMount(row);

        refreshTopListBadges(new Set());

        expect(row.querySelector('.tag-indicator.toplist')).toBeNull();
    });

    it('is idempotent — running twice does not duplicate the indicator', () => {
        const topList = new Set(['best-movies']);
        const row = makeRow('best-movies');
        document.body.append(row);
        trackMount(row);

        refreshTopListBadges(topList);
        refreshTopListBadges(topList);

        const indicators = row.querySelectorAll('.tag-indicator.toplist');
        expect(indicators.length).toBe(1);
    });

    it('does nothing for rows without a .badge-container', () => {
        const topList = new Set(['best-movies']);
        const row = document.createElement('div');
        row.className = 'tag-row';
        row.dataset.tag = 'best-movies';
        // Note: no .badge-container child.
        document.body.append(row);
        trackMount(row);

        // Should be a no-op (the helper bails when the container is missing).
        expect(() => refreshTopListBadges(topList)).not.toThrow();
    });

    it('does nothing for an empty tag set on a fresh row', () => {
        const row = makeRow('some-tag');
        document.body.append(row);
        trackMount(row);

        refreshTopListBadges(new Set());

        expect(row.querySelector('.tag-indicator.toplist')).toBeNull();
    });

    it('renders the "Top-List" label with the format_list_numbered icon', () => {
        const topList = new Set(['best-movies']);
        const row = makeRow('best-movies');
        document.body.append(row);
        trackMount(row);

        refreshTopListBadges(topList);

        const indicator = row.querySelector('.tag-indicator.toplist')!;
        // Inner span matches the legacy markup.
        expect(indicator.innerHTML).toContain('format_list_numbered');
        expect(indicator.textContent).toContain('Top-List');
    });
});
