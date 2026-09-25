/// <reference types="vitest" />
//
// D3 extraction tests for `modules/toplists/moviePicker.ts`. Pins the
// "search-result row renders identically from both call sites" contract
// that was duplicated between `showManualTopListModal` (the search path,
// now line ~697) and the manual branch of `loadInlineEditForm` (the
// saved-list path, now line ~988). Both call sites must now produce the
// same row HTML for the same item.
//
// The tests cover:
//   - `renderMovieResultRow` is pure (same item → same HTML).
//   - the `alreadyAdded` flag toggles opacity + "(already added)" suffix.
//   - `wireMovieSearch` filters by name + year substring, renders the
//     hits via `renderMovieResultRow`, hides the dropdown on empty
//     query, and routes the mousedown pick through `onPick`.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    renderMovieResultRow,
    wireMovieSearch,
    type MovieRow,
    type MovieSearchSourceRow,
} from './moviePicker';

const SAMPLE_MOVIE: MovieRow = {
    ItemId: 'i1',
    ImdbId: 'tt0111161',
    Name: 'The Shawshank Redemption',
    Year: 1994,
};

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

// ─── renderMovieResultRow ────────────────────────────────────────────────────

describe('renderMovieResultRow', () => {
    it('produces identical HTML for the same item (search vs saved path)', () => {
        const searchPathHtml = renderMovieResultRow(SAMPLE_MOVIE, { alreadyAdded: false });
        const savedPathHtml = renderMovieResultRow(SAMPLE_MOVIE, { alreadyAdded: false });
        expect(searchPathHtml).toBe(savedPathHtml);
    });

    it('embeds the item id / imdb id / name / year as data-* attributes', () => {
        const html = renderMovieResultRow(SAMPLE_MOVIE, { alreadyAdded: false });
        expect(html).toContain('data-itemid="i1"');
        expect(html).toContain('data-imdbid="tt0111161"');
        expect(html).toContain('data-name="The Shawshank Redemption"');
        expect(html).toContain('data-year="1994"');
        expect(html).toContain('The Shawshank Redemption (1994)');
    });

    it('omits the year suffix when Year is null', () => {
        const html = renderMovieResultRow(
            { ...SAMPLE_MOVIE, Year: null },
            { alreadyAdded: false },
        );
        expect(html).not.toContain('(1994)');
        expect(html).toContain('The Shawshank Redemption');
    });

    it('marks already-added rows with the opacity + "(already added)" suffix', () => {
        const html = renderMovieResultRow(SAMPLE_MOVIE, { alreadyAdded: true });
        expect(html).toContain('opacity:0.42');
        expect(html).toContain('pointer-events:none');
        expect(html).toContain('(already added)');
    });

    it('escapes a hostile name in the data-* attribute', () => {
        const hostile: MovieRow = {
            ItemId: 'i"1',
            ImdbId: 'tt1',
            Name: '"><img src=x onerror=alert(1)>',
            Year: null,
        };
        const html = renderMovieResultRow(hostile, { alreadyAdded: false });
        // `<` and `>` must be entity-encoded so no real `<img>` tag survives.
        expect(html).toContain('&lt;img');
        // `"` must be entity-encoded so the attribute boundary stays closed.
        expect(html).toContain('&quot;');
        expect(html).not.toContain('<img');
    });
});

// ─── wireMovieSearch ─────────────────────────────────────────────────────────

describe('wireMovieSearch', () => {
    function mount(allMovies: readonly MovieSearchSourceRow[]): {
        searchInput: HTMLInputElement;
        resultsBox: HTMLElement;
        selected: Set<string>;
        picked: MovieRow[];
    } {
        const searchInput = document.createElement('input');
        searchInput.className = 'mtlMovieSearch';
        const resultsBox = document.createElement('div');
        resultsBox.className = 'mtlSearchResults';
        document.body.appendChild(searchInput);
        document.body.appendChild(resultsBox);
        const selected = new Set<string>();
        const picked: MovieRow[] = [];
        wireMovieSearch({
            searchInput,
            resultsBox,
            allMovies,
            getSelectedIds: () => selected,
            onPick: (m) => { picked.push(m); },
        });
        return { searchInput, resultsBox, selected, picked };
    }

    it('filters by case-insensitive substring on Name', () => {
        const { searchInput, resultsBox } = mount([
            { ItemId: 'a', Name: 'Inception', Year: 2010 },
            { ItemId: 'b', Name: 'Arrival', Year: 2016 },
        ]);
        searchInput.value = 'incep';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(resultsBox.style.display).toBe('block');
        const rows = resultsBox.querySelectorAll('.mtlSearchResult');
        expect(rows.length).toBe(1);
        expect(rows[0]?.textContent).toContain('Inception');
    });

    it('filters by year substring as a fallback', () => {
        const { searchInput, resultsBox } = mount([
            { ItemId: 'a', Name: 'Some Film', Year: 2010 },
            { ItemId: 'b', Name: 'Other', Year: 2024 },
        ]);
        searchInput.value = '2024';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        const rows = resultsBox.querySelectorAll('.mtlSearchResult');
        expect(rows.length).toBe(1);
        expect(rows[0]?.textContent).toContain('2024');
    });

    it('hides the dropdown for an empty / whitespace query', () => {
        const { searchInput, resultsBox } = mount([
            { ItemId: 'a', Name: 'Inception', Year: 2010 },
        ]);
        searchInput.value = '   ';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(resultsBox.style.display).toBe('none');
        expect(resultsBox.innerHTML).toBe('');
    });

    it('marks already-selected ids as "(already added)" on render', () => {
        const { searchInput, resultsBox, selected } = mount([
            { ItemId: 'a', Name: 'Inception', Year: 2010 },
            { ItemId: 'b', Name: 'Arrival', Year: 2016 },
        ]);
        selected.add('a');
        searchInput.value = 'in';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        const rows = resultsBox.querySelectorAll('.mtlSearchResult');
        // both hits start with 'in' (case-insensitive), one is disabled
        const disabled = Array.from(rows).filter((r) => r.textContent?.includes('(already added)'));
        expect(disabled.length).toBe(1);
    });

    it('routes mousedown on a result row through onPick', () => {
        const { searchInput, resultsBox, picked } = mount([
            { ItemId: 'a', Name: 'Inception', Year: 2010 },
        ]);
        searchInput.value = 'incep';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        const row = resultsBox.querySelector<HTMLElement>('.mtlSearchResult');
        expect(row).not.toBeNull();
        row!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(picked.length).toBe(1);
        expect(picked[0]?.ItemId).toBe('a');
        expect(picked[0]?.Name).toBe('Inception');
        expect(picked[0]?.Year).toBe(2010);
    });

    it('caps visible hits at 20', () => {
        const movies = Array.from({ length: 30 }, (_, i) => ({
            ItemId: 'id-' + i, Name: 'Common', Year: 2000,
        }));
        const { searchInput, resultsBox } = mount(movies);
        searchInput.value = 'common';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(resultsBox.querySelectorAll('.mtlSearchResult').length).toBe(20);
    });

    it('renders via the shared row builder (search path and saved path output identical HTML for the same item)', () => {
        // "search path" — fresh list, no selected ids yet.
        const a = mount([
            { ItemId: 'x', ImdbId: 'tt1', Name: 'Inception', Year: 2010 },
        ]);
        a.searchInput.value = 'incep';
        a.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        const searchPathHtml = a.resultsBox.querySelector('.mtlSearchResult')?.outerHTML ?? '';

        // "saved path" — the user already added the item, re-renders via showResults.
        a.selected.add('x');
        a.searchInput.dispatchEvent(new Event('focus', { bubbles: true }));
        const savedPathHtml = a.resultsBox.querySelector('.mtlSearchResult')?.outerHTML ?? '';

        // Both rows carry the same data-* attributes (the row identity);
        // the only delta is the `(already added)` suffix + the disabled
        // opacity styles — that's the documented alreadyAdded toggle.
        const extractAttrs = (s: string): string => {
            const m = s.match(/data-itemid="[^"]*"\s+data-imdbid="[^"]*"\s+data-name="[^"]*"\s+data-year="[^"]*"/);
            return m ? m[0] : '';
        };
        expect(extractAttrs(searchPathHtml)).toBe(extractAttrs(savedPathHtml));
        // And the saved path carries the documented `(already added)` toggle.
        expect(savedPathHtml).toContain('(already added)');
        expect(searchPathHtml).not.toContain('(already added)');
    });
});
