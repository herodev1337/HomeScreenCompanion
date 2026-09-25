/**
 * Phase 6 (D3): the manual-modal movie-search picker, extracted from the
 * two duplicated implementations in `showManualTopListModal`
 * (legacy.js:4876) and the manual branch of `loadInlineEditForm`
 * (legacy.js:5187). Both sites rendered the same search-result row
 * HTML for a hit, both wired the same `input`/`focus`/`blur`/mousedown
 * behavior on the search field, both filtered the same already-loaded
 * `AllMovies` payload locally (no HTTP call).
 *
 * Two exports:
 *   - {@link renderMovieResultRow} — pure HTML builder for one search
 *     hit row. `added` toggles the "already added" disabled state.
 *   - {@link wireMovieSearch} — attaches the `input`/`focus`/`blur`/
 *     `mousedown` listeners and exposes `showResults(q)` so callers
 *     can re-render the dropdown with a current "already added" set
 *     after the user adds a movie.
 *
 * Behavior contract (matches legacy verbatim):
 *   - the search is case-insensitive substring match on `Name` plus
 *     year-string match (`m.Year != null && String(m.Year).indexOf(q) !== -1`);
 *   - at most 20 hits are shown;
 *   - an empty/whitespace query hides the dropdown and clears its HTML;
 *   - a hit whose `ItemId` is already in the selected set renders with
 *     `opacity:0.42;pointer-events:none;` and a `(already added)` suffix;
 *   - `mousedown` (not `click`) on a row commits the pick — this
 *     survives the input's blur-induced hide;
 *   - on blur the dropdown is hidden after a 150 ms delay so a
 *     mousedown commit can land first.
 */

import { escapeAttr, escapeHtml } from '../dom/dom';

/** Minimal movie row shape consumed by the search-result renderer. */
export interface MovieRow {
    ItemId: string;
    ImdbId: string;
    Name: string;
    Year: number | null;
}

/** The wider payload the search wires over (each entry must have `ItemId`/`Name`/`Year`; `ItemId` may be missing). */
export interface MovieSearchSourceRow {
    ItemId?: string;
    ImdbId?: string;
    Name?: string;
    Year?: number | null;
}

export interface RenderMovieResultRowOpts {
    /** When true, renders the row disabled with an "(already added)" suffix. */
    readonly alreadyAdded: boolean;
}

/**
 * Render the HTML for one search-result row. Identical output for the
 * two legacy call sites (the search path in `showManualTopListModal`
 * and the search path in `loadInlineEditForm`'s manual branch).
 */
export function renderMovieResultRow(item: MovieRow, opts: RenderMovieResultRowOpts): string {
    const added = opts.alreadyAdded;
    const itemId = item.ItemId || '';
    const imdbId = item.ImdbId || '';
    const name = item.Name || '';
    const year = item.Year;
    const label = escapeHtml(name) + (year != null ? ' (' + year + ')' : '');
    return '<div class="mtlSearchResult" data-itemid="' + escapeAttr(itemId) + '"' +
        ' data-imdbid="' + escapeAttr(imdbId) + '"' +
        ' data-name="' + escapeAttr(name) + '"' +
        ' data-year="' + escapeAttr(String(year || '')) + '"' +
        ' style="padding:7px 12px;cursor:pointer;font-size:0.9em;border-bottom:1px solid rgba(128,128,128,0.12);' +
        (added ? 'opacity:0.42;pointer-events:none;' : '') + '">' +
        label + (added ? ' <span style="font-size:0.8em;">(already added)</span>' : '') + '</div>';
}

export interface WireMovieSearchOpts {
    readonly searchInput: HTMLInputElement;
    readonly resultsBox: HTMLElement;
    readonly allMovies: readonly MovieSearchSourceRow[];
    /** Called fresh on every `showResults` to compute the current "already added" set. */
    readonly getSelectedIds: () => ReadonlySet<string>;
    /** Called with the normalized row when the user picks one (mousedown on `.mtlSearchResult`). */
    readonly onPick: (item: MovieRow) => void;
}

export interface WiredMovieSearch {
    /** Re-render the dropdown for query `q` using the current "already added" set. */
    showResults: (q: string) => void;
}

/**
 * Attach the search-input + results-dropdown listeners. Returns
 * {@link WiredMovieSearch} so callers can re-render the dropdown with
 * a fresh "already added" set (e.g. after the user adds a movie).
 */
export function wireMovieSearch(opts: WireMovieSearchOpts): WiredMovieSearch {
    const { searchInput, resultsBox, allMovies, getSelectedIds, onPick } = opts;

    function showResults(q: string): void {
        q = (q || '').trim().toLowerCase();
        if (q.length < 1) {
            resultsBox.style.display = 'none';
            resultsBox.innerHTML = '';
            return;
        }
        const alreadyIds = getSelectedIds();
        const hits = allMovies.filter((m) => {
            const name = (m.Name || '').toLowerCase();
            const yearMatch = m.Year != null && String(m.Year).indexOf(q) !== -1;
            return name.indexOf(q) !== -1 || yearMatch;
        }).slice(0, 20);
        if (hits.length === 0) {
            resultsBox.style.display = 'none';
            return;
        }
        resultsBox.innerHTML = hits.map((m) => {
            const itemId = typeof m.ItemId === 'string' ? m.ItemId : '';
            return renderMovieResultRow(
                { ItemId: itemId, ImdbId: m.ImdbId || '', Name: m.Name || '', Year: m.Year ?? null },
                { alreadyAdded: itemId ? alreadyIds.has(itemId) : false },
            );
        }).join('');
        resultsBox.style.display = 'block';
    }

    searchInput.addEventListener('input', function () { showResults(this.value); });
    searchInput.addEventListener('focus', function () { showResults(this.value); });

    resultsBox.addEventListener('mousedown', (e) => {
        const row = (e.target as Element | null)?.closest<HTMLElement>('.mtlSearchResult');
        if (!row || !row.dataset.itemid) return;
        e.preventDefault();
        const itemId = row.dataset.itemid;
        const imdbId = row.dataset.imdbid || '';
        const name = row.dataset.name || '';
        const yearStr = row.dataset.year;
        const year = yearStr ? parseInt(yearStr, 10) : null;
        onPick({ ItemId: itemId, ImdbId: imdbId, Name: name, Year: year });
    });

    searchInput.addEventListener('blur', () => {
        setTimeout(() => { resultsBox.style.display = 'none'; }, 150);
    });

    return { showResults };
}
