/// <reference types="vitest" />
//
// Tests for `modules/tags/renderTagGroup.ts`. Two surfaces:
//
//   - `refreshTopListBadges` — DOM walker, 7 tests covering the
//     happy path, idempotency, removal, missing-container no-op, and
//     the markup shape of the appended indicator span.
//   - `renderTagGroup` — HTML builder, structural smoke tests that
//     confirm each input source type and each row element renders
//     through to the returned HTML string.
//
// `renderTagGroup` (legacy.js:1363) was deferred from Phase 3 because
// it closed over multiple module-scope mutables. Phase 5 lifts it onto
// an explicit `RenderTagGroupDeps` argument; the tests below mirror the
// deps factory pattern from `manageTab.test.ts` and `form.test.ts`.

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    refreshTopListBadges,
    renderTagGroup,
    getSourceBadgeHtml,
    type RenderTagGroupDeps,
} from './renderTagGroup';
import type { SavedFilter } from '../filters/savedFilters';
import type { MediaInfoFilterGroup } from '../filters/savedFilters';
import type { MiFilterDeps } from '../filters/miFilters';
import type { DateInterval } from '../filters/rows';
import type { NamedItem } from '../filters/rows';
import {
    createMiUsersState,
    createTopListsState,
    type MiUsersState,
    type TopListsState,
} from '../state/state';

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

// ───────────────────────────────────────────────────────────────────────────
// `refreshTopListBadges` (Phase 3 — kept verbatim)
// ───────────────────────────────────────────────────────────────────────────

describe('refreshTopListBadges', () => {
    it('adds a toplist indicator to rows whose tag is in the set', () => {
        const topList = new Set(['best-movies-2025', 'best-sci-fi']);
        const row1 = makeRow('best-movies-2025');
        const row2 = makeRow('best-sci-fi');
        const row3 = makeRow('regular-tag');
        document.body.append(row1, row2, row3);
        trackMount(row1); trackMount(row2); trackMount(row3);

        refreshTopListBadges(topList);

        expect(row1.querySelector('.tag-indicator.toplist')).not.toBeNull();
        expect(row2.querySelector('.tag-indicator.toplist')).not.toBeNull();
        expect(row3.querySelector('.tag-indicator.toplist')).toBeNull();
    });

    it('is case-insensitive (matches the lower-cased data-tag)', () => {
        const topList = new Set(['best-movies']);
        const row = makeRow('BEST-MOVIES');
        document.body.append(row);
        trackMount(row);

        refreshTopListBadges(topList);

        expect(row.querySelector('.tag-indicator.toplist')).not.toBeNull();
    });

    it('removes the toplist indicator when the tag is no longer in the set', () => {
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
        document.body.append(row);
        trackMount(row);

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
        expect(indicator.innerHTML).toContain('format_list_numbered');
        expect(indicator.textContent).toContain('Top-List');
    });
});

// ───────────────────────────────────────────────────────────────────────────
// `getSourceBadgeHtml`
// ───────────────────────────────────────────────────────────────────────────

describe('getSourceBadgeHtml', () => {
    it('renders the External badge with the language icon', () => {
        const html = getSourceBadgeHtml('External');
        expect(html).toContain('class="tag-indicator source"');
        expect(html).toContain('title="External List"');
        expect(html).toContain('language');
    });

    it('renders the LocalCollection badge with the folder_special icon', () => {
        const html = getSourceBadgeHtml('LocalCollection');
        expect(html).toContain('title="Local Collection"');
        expect(html).toContain('folder_special');
    });

    it('renders the LocalPlaylist badge with the playlist_play icon', () => {
        const html = getSourceBadgeHtml('LocalPlaylist');
        expect(html).toContain('title="Local Playlist"');
        expect(html).toContain('playlist_play');
    });

    it('renders the MediaInfo badge with the tune icon', () => {
        const html = getSourceBadgeHtml('MediaInfo');
        expect(html).toContain('title="Smart Playlist"');
        expect(html).toContain('tune');
    });

    it('renders the AI badge with the auto_awesome icon', () => {
        const html = getSourceBadgeHtml('AI');
        expect(html).toContain('title="AI created lists"');
        expect(html).toContain('auto_awesome');
    });

    it('returns an empty string for unknown source types', () => {
        expect(getSourceBadgeHtml('something-else')).toBe('');
        expect(getSourceBadgeHtml('')).toBe('');
    });
});

// ───────────────────────────────────────────────────────────────────────────
// `renderTagGroup` deps factory
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal `RenderTagGroupDeps` with spy-able row helpers and
 * state holders. All helpers return a recognizable stub HTML fragment
 * the smoke tests can match against.
 */
function makeDeps(overrides: {
    miUsers?: MiUsersState;
    topLists?: TopListsState;
    savedFilters?: SavedFilter[];
} = {}) {
    const miUsers = overrides.miUsers ?? createMiUsersState();
    const topLists = overrides.topLists ?? createTopListsState();
    const savedFilters = overrides.savedFilters ?? [];

    const getUrlRowHtml = vi.fn(
        (value: string | null | undefined, limit: number | undefined): string =>
            `<url-row-stub url="${value ?? ''}" limit="${limit ?? 0}"></url-row-stub>`,
    );
    const getLocalRowHtml = vi.fn(
        (type: string, selectedName: string, limit: number | undefined, _items?: readonly NamedItem[]): string =>
            `<local-row-stub type="${type}" sel="${selectedName}" limit="${limit ?? 0}"></local-row-stub>`,
    );
    const getDateRowHtml = vi.fn(
        (interval: DateInterval): string =>
            `<date-row-stub type="${interval.Type ?? ''}" start="${interval.Start ?? ''}"></date-row-stub>`,
    );
    const getMediaInfoFilterGroupHtml = vi.fn(
        (filter: MediaInfoFilterGroup | null | undefined, _i: unknown, isFirst: boolean, _md: MiFilterDeps): string =>
            `<mi-group-stub op="${filter?.Operator ?? ''}" first="${isFirst}"></mi-group-stub>`,
    );
    const getMySavedFiltersPanelHtml = vi.fn(
        (sf: readonly SavedFilter[]): string =>
            `<saved-panel-stub count="${sf.length}"></saved-panel-stub>`,
    );
    const tagConfigHasViewerCriteria = vi.fn((): boolean => false);

    const deps: RenderTagGroupDeps = {
        miUsers,
        topLists,
        getUrlRowHtml: getUrlRowHtml as unknown as RenderTagGroupDeps['getUrlRowHtml'],
        getLocalRowHtml: getLocalRowHtml as unknown as RenderTagGroupDeps['getLocalRowHtml'],
        getDateRowHtml: getDateRowHtml as unknown as RenderTagGroupDeps['getDateRowHtml'],
        getMediaInfoFilterGroupHtml: getMediaInfoFilterGroupHtml as unknown as RenderTagGroupDeps['getMediaInfoFilterGroupHtml'],
        getMySavedFiltersPanelHtml: getMySavedFiltersPanelHtml as unknown as RenderTagGroupDeps['getMySavedFiltersPanelHtml'],
        tagConfigHasViewerCriteria: tagConfigHasViewerCriteria as unknown as (cfg: unknown) => boolean,
        miFilterDeps: { users: null, collections: [], playlists: [], tags: [] },
        savedFilters,
    };

    return {
        deps,
        spies: {
            getUrlRowHtml: getUrlRowHtml as unknown as ReturnType<typeof vi.fn>,
            getLocalRowHtml: getLocalRowHtml as unknown as ReturnType<typeof vi.fn>,
            getDateRowHtml: getDateRowHtml as unknown as ReturnType<typeof vi.fn>,
            getMediaInfoFilterGroupHtml: getMediaInfoFilterGroupHtml as unknown as ReturnType<typeof vi.fn>,
            getMySavedFiltersPanelHtml: getMySavedFiltersPanelHtml as unknown as ReturnType<typeof vi.fn>,
            tagConfigHasViewerCriteria: tagConfigHasViewerCriteria as unknown as ReturnType<typeof vi.fn>,
        },
    };
}

// ───────────────────────────────────────────────────────────────────────────
// `renderTagGroup` smoke tests
// ───────────────────────────────────────────────────────────────────────────

describe('renderTagGroup', () => {
    it('renders the minimal config with a tag-row root, drag handle, and URL row', () => {
        const { deps, spies } = makeDeps();
        const html = renderTagGroup({ Tag: 'horror', Name: 'Horror Picks' }, 0, deps);

        expect(html).toContain('class="tag-row');
        expect(html).toContain('class="drag-handle"');
        expect(html).toContain('<i class="md-icon">reorder</i>');
        expect(html).toContain('class="txtEntryLabel"');
        expect(html).toContain('class="txtTagName"');
        expect(html).toContain('data-index="0"');
        expect(html).toContain('data-tag="horror"');
        // The single empty URL row stub is rendered.
        expect(spies.getUrlRowHtml).toHaveBeenCalledWith('', 0);
        expect(html).toContain('<url-row-stub');
    });

    it('falls back to a single empty URL row when Urls, Url, and Limit are all missing', () => {
        const { deps, spies } = makeDeps();
        renderTagGroup({ Tag: 'foo' }, 7, deps);
        expect(spies.getUrlRowHtml).toHaveBeenCalledWith('', 0);
    });

    it('migrates a legacy single-Url + Limit into one Urls entry', () => {
        const { deps, spies } = makeDeps();
        renderTagGroup({ Tag: 'foo', Url: 'https://trakt.tv/lists/abc', Limit: 25 }, 0, deps);
        expect(spies.getUrlRowHtml).toHaveBeenCalledWith('https://trakt.tv/lists/abc', 25);
    });

    it('renders one stub URL row per Urls entry', () => {
        const { deps, spies } = makeDeps();
        renderTagGroup({
            Tag: 'foo',
            Urls: [
                { url: 'https://trakt.tv/lists/abc', limit: 10 },
                { url: 'https://mdblist.com/lists/def', limit: 20 },
                { url: 'https://themoviedb.org/lists/ghi', limit: 0 },
            ],
        }, 0, deps);
        expect(spies.getUrlRowHtml).toHaveBeenCalledTimes(3);
        expect(spies.getUrlRowHtml).toHaveBeenNthCalledWith(1, 'https://trakt.tv/lists/abc', 10);
        expect(spies.getUrlRowHtml).toHaveBeenNthCalledWith(2, 'https://mdblist.com/lists/def', 20);
        expect(spies.getUrlRowHtml).toHaveBeenNthCalledWith(3, 'https://themoviedb.org/lists/ghi', 0);
    });

    it('renders local rows when SourceType is LocalCollection and LocalSources are present', () => {
        const { deps, spies } = makeDeps();
        const html = renderTagGroup({
            Tag: 'mycoll',
            SourceType: 'LocalCollection',
            LocalSources: [
                { id: 'coll-1', limit: 5 },
                { id: 'coll-2', limit: 0 },
            ],
        }, 0, deps);
        expect(spies.getLocalRowHtml).toHaveBeenCalledTimes(2);
        expect(spies.getLocalRowHtml).toHaveBeenNthCalledWith(1, 'LocalCollection', 'coll-1', 5);
        expect(spies.getLocalRowHtml).toHaveBeenNthCalledWith(2, 'LocalCollection', 'coll-2', 0);
        expect(html).toContain('class="source-local-container"');
        // Local container is shown for LocalCollection.
        expect(html).toMatch(/class="source-local-container"[^>]*display: block/);
    });

    it('always synthesizes one empty LocalSource when none are present (legacy quirk)', () => {
        const { deps, spies } = makeDeps();
        renderTagGroup({ Tag: 'foo', SourceType: 'LocalPlaylist' }, 0, deps);
        // Called once with the synthesized empty row.
        expect(spies.getLocalRowHtml).toHaveBeenCalledTimes(1);
        expect(spies.getLocalRowHtml).toHaveBeenCalledWith('LocalPlaylist', '', 0);
    });

    it('renders one date row per ActiveInterval entry', () => {
        const { deps, spies } = makeDeps();
        const intervals: DateInterval[] = [
            { Type: 'SpecificDate', Start: '2026-01-01T00:00:00Z', End: '2026-01-31T00:00:00Z' },
            { Type: 'EveryYear', Start: '2000-12-01T00:00:00Z', End: '2000-12-31T00:00:00Z' },
            { Type: 'Weekly', DayOfWeek: 'Monday,Wednesday' },
        ];
        const html = renderTagGroup({ Tag: 'foo', ActiveIntervals: intervals }, 0, deps);
        expect(spies.getDateRowHtml).toHaveBeenCalledTimes(3);
        expect(html).toContain('class="date-list-container"');
    });

    it('renders a media-info filter group for each MediaInfoFilters entry', () => {
        const { deps, spies } = makeDeps();
        const filters: MediaInfoFilterGroup[] = [
            { Operator: 'AND', GroupOperator: 'AND', Criteria: ['Resolution:4K'] },
            { Operator: 'OR',  GroupOperator: 'AND', Criteria: ['1080p', '720p'] },
        ];
        renderTagGroup({
            Tag: 'foo',
            SourceType: 'MediaInfo',
            MediaInfoFilters: filters,
        }, 0, deps);
        expect(spies.getMediaInfoFilterGroupHtml).toHaveBeenCalledTimes(2);
        // First group has `isFirst=true`; second has `isFirst=false`.
        expect(spies.getMediaInfoFilterGroupHtml.mock.calls[0]?.[2]).toBe(true);
        expect(spies.getMediaInfoFilterGroupHtml.mock.calls[1]?.[2]).toBe(false);
    });

    it('falls back to a single AND group when only legacy MediaInfoConditions are present', () => {
        const { deps, spies } = makeDeps();
        renderTagGroup({
            Tag: 'foo',
            SourceType: 'MediaInfo',
            MediaInfoConditions: ['MediaType:Movie', 'Resolution:4K'],
        }, 0, deps);
        expect(spies.getMediaInfoFilterGroupHtml).toHaveBeenCalledTimes(1);
        const firstCall = spies.getMediaInfoFilterGroupHtml.mock.calls[0];
        expect(firstCall?.[0]?.Operator).toBe('AND');
        expect(firstCall?.[0]?.Criteria).toEqual(['MediaType:Movie', 'Resolution:4K']);
    });

    it('renders the AI recently-watched user picker with one option per _miUsers entry', () => {
        const miUsers = createMiUsersState();
        miUsers.users = [
            { Id: 'u-1', Name: 'Alice' },
            { Id: 'u-2', Name: 'Bob' },
            { Id: 'u-3', Name: 'Carol' },
        ];
        const { deps } = makeDeps({ miUsers });
        const html = renderTagGroup({
            Tag: 'ai-list',
            SourceType: 'AI',
            AiIncludeRecentlyWatched: true,
            AiRecentlyWatchedUserId: 'u-2',
        }, 0, deps);

        expect(html).toContain('class="selAiWatchedUser"');
        expect(html).toContain('value="u-1"');
        expect(html).toContain('>Alice</option>');
        expect(html).toContain('value="u-2" selected');
        expect(html).toContain('>Bob</option>');
        expect(html).toContain('value="u-3"');
        expect(html).toContain('>Carol</option>');
        // The container is visible because AiIncludeRecentlyWatched=true.
        expect(html).toMatch(/class="ai-recently-watched-options"[^>]*display: block/);
    });

    it('hides the AI recently-watched user picker when AiIncludeRecentlyWatched is false', () => {
        const miUsers = createMiUsersState();
        miUsers.users = [{ Id: 'u-1', Name: 'Alice' }];
        const { deps } = makeDeps({ miUsers });
        const html = renderTagGroup({
            Tag: 'ai-list',
            SourceType: 'AI',
            AiIncludeRecentlyWatched: false,
        }, 0, deps);
        // Container is hidden, but the placeholder option is still rendered.
        expect(html).toMatch(/class="ai-recently-watched-options"[^>]*display: none/);
        expect(html).toContain('<option value="">-- Select user --</option>');
        // The user is NOT rendered because the picker is collapsed — but
        // it IS still rendered in the HTML (the toggle only sets display).
        expect(html).toContain('Alice');
    });

    it('emits a Top-List indicator when tagName is in topLists.tagNames', () => {
        const topLists = createTopListsState();
        topLists.tagNames.add('my-top-list');
        const { deps } = makeDeps({ topLists });
        const html = renderTagGroup({ Tag: 'my-top-list', Name: 'Top Picks' }, 0, deps);
        expect(html).toContain('class="tag-indicator toplist"');
        expect(html).toContain('format_list_numbered');
    });

    it('does NOT emit a Top-List indicator when tagName is missing from topLists.tagNames', () => {
        const topLists = createTopListsState();
        topLists.tagNames.add('some-other-tag');
        const { deps } = makeDeps({ topLists });
        const html = renderTagGroup({ Tag: 'my-tag' }, 0, deps);
        // The toplist indicator must be absent (count == 0 even though
        // the format_list_numbered string appears in the html-helpers test).
        const matches = html.match(/class="tag-indicator toplist"/g);
        expect(matches).toBeNull();
    });

    it('emits Tag / Collection / Home Section / Playlist indicators when the matching flags are set', () => {
        const { deps } = makeDeps();
        const html = renderTagGroup({
            Tag: 'foo',
            EnableTag: true,
            EnableCollection: true,
            EnableHomeSection: true,
            EnablePlaylist: true,
        }, 0, deps);
        expect(html).toContain('class="tag-indicator tag"');
        expect(html).toContain('class="tag-indicator collection"');
        expect(html).toContain('class="tag-indicator homescreen"');
        expect(html).toContain('class="tag-indicator playlist"');
    });

    it('renders the saved-filters panel content via deps.getMySavedFiltersPanelHtml', () => {
        const savedFilters: SavedFilter[] = [
            { Name: '4K HDR Movies', Filters: [] },
            { Name: 'Recent Sci-Fi', Filters: [] },
        ];
        const { deps, spies } = makeDeps({ savedFilters });
        const html = renderTagGroup({ Tag: 'foo', SourceType: 'MediaInfo' }, 0, deps);
        expect(spies.getMySavedFiltersPanelHtml).toHaveBeenCalledWith(savedFilters);
        expect(html).toContain('<saved-panel-stub count="2">');
    });

    it('honors an undefined groupIndex by stamping data-index="9999"', () => {
        const { deps } = makeDeps();
        const html = renderTagGroup({ Tag: 'foo' }, undefined, deps);
        expect(html).toContain('data-index="9999"');
    });

    it('honors an explicit groupIndex', () => {
        const { deps } = makeDeps();
        const html = renderTagGroup({ Tag: 'foo' }, 42, deps);
        expect(html).toContain('data-index="42"');
    });

    it('narrow tagConfig.unknown inputs to empty defaults without throwing', () => {
        const { deps } = makeDeps();
        // `null` and `undefined` and primitives must NOT throw — the
        // legacy code throws on the first property access; we narrow
        // to an empty shape instead.
        expect(() => renderTagGroup(null, 0, deps)).not.toThrow();
        expect(() => renderTagGroup(undefined, 0, deps)).not.toThrow();
        expect(() => renderTagGroup('not-an-object', 0, deps)).not.toThrow();
        expect(() => renderTagGroup(42, 0, deps)).not.toThrow();
        expect(() => renderTagGroup(true, 0, deps)).not.toThrow();
    });

    it('invokes tagConfigHasViewerCriteria with the narrow tagConfig shape', () => {
        const { deps, spies } = makeDeps();
        renderTagGroup({ Tag: 'foo', SourceType: 'MediaInfo' }, 0, deps);
        expect(spies.tagConfigHasViewerCriteria).toHaveBeenCalledTimes(1);
        expect((spies.tagConfigHasViewerCriteria.mock.calls[0]?.[0] as { Tag?: string })?.Tag).toBe('foo');
    });

    it('enables the home-section checkbox when SourceType is MediaInfo and tagConfigHasViewerCriteria returns true', () => {
        const { deps, spies } = makeDeps();
        spies.tagConfigHasViewerCriteria.mockReturnValue(true);
        const html = renderTagGroup({
            Tag: 'smart-list',
            EnableTag: false,
            EnableCollection: false,
            SourceType: 'MediaInfo',
        }, 0, deps);
        // `_hseAllowedWithoutOutput` is true, so the checkbox should NOT
        // carry the `disabled` flag.
        expect(html).not.toContain('disabled/>');
        // The disabled-hint copy is hidden.
        expect(html).toMatch(/class="hse-disabled-hint"[^>]*display:none/);
    });

    it('disables the home-section checkbox when no tag/collection/viewer flag is set', () => {
        const { deps, spies } = makeDeps();
        spies.tagConfigHasViewerCriteria.mockReturnValue(false);
        const html = renderTagGroup({
            Tag: 'lone-row',
            EnableTag: false,
            EnableCollection: false,
            SourceType: 'External',
        }, 0, deps);
        // `EnableHomeSection` is not set, so `checked` is empty; the
        // box is disabled because no flag is true.
        expect(html).toContain('<input is="emby-checkbox" class="chkEnableHomeSection" type="checkbox"  disabled/>');
        // The disabled-hint copy is visible.
        expect(html).toMatch(/class="hse-disabled-hint"[^>]*display:block/);
    });

    it('escapes the blacklist into a newline-separated textarea content (no HTML injection)', () => {
        const { deps } = makeDeps();
        const html = renderTagGroup({
            Tag: 'foo',
            Blacklist: ['tt1234567', 'tt7654321'],
        }, 0, deps);
        // The textarea's content is `tt1234567\ntt7654321`.
        expect(html).toContain('<textarea class="txtTagBlacklist"');
        expect(html).toContain('tt1234567\ntt7654321');
    });

    // ─── C1: XSS / escaping regression coverage ─────────────────────────────

    it('escapes a hostile tag name in every text/attribute slot', () => {
        const { deps } = makeDeps();
        const evilTag = '"><img src=x onerror=alert(1)>';
        const html = renderTagGroup({ Tag: evilTag, Name: evilTag }, 0, deps);

        expect(html).toContain('&lt;');
        expect(html).toContain('&quot;');
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('" onerror=');

        // Parsed DOM: no injected element (the only legitimate <img> is the
        // static poster-preview placeholder), no handler attribute.
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('img:not(.poster-preview-img)')).toBeNull();
        expect(host.querySelector('[onerror]')).toBeNull();
        // Input values round-trip to the original (entities are decoded by
        // the parser, so the form still shows the real tag name).
        expect(host.querySelector<HTMLInputElement>('.txtTagName')?.value).toBe(evilTag);
        expect(host.querySelector<HTMLInputElement>('.txtEntryLabel')?.value).toBe(evilTag);
        expect(host.querySelector<HTMLElement>('.tag-title')?.textContent).toBe(evilTag);
    });

    it('escapes a hostile AI watch-history user id and name', () => {
        const miUsers = createMiUsersState();
        miUsers.users = [{ Id: "u'1", Name: '" onmouseover=alert(1) <img src=x>' }];
        const { deps } = makeDeps({ miUsers });
        const html = renderTagGroup({
            Tag: 'ai-list',
            SourceType: 'AI',
            AiIncludeRecentlyWatched: true,
        }, 0, deps);

        expect(html).toContain('&#39;');
        expect(html).toContain('&quot;');
        expect(html).toContain('&lt;');
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('" onmouseover=');

        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('img:not(.poster-preview-img)')).toBeNull();
        expect(host.querySelector('[onmouseover]')).toBeNull();
        const options = host.querySelectorAll<HTMLOptionElement>('.selAiWatchedUser option');
        expect(options[1]?.value).toBe("u'1");
        expect(options[1]?.textContent).toBe('" onmouseover=alert(1) <img src=x>');
    });
});