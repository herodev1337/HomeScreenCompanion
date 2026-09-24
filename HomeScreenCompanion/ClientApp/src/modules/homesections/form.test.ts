/// <reference types="vitest" />
//
// Fresh structural tests for `modules/homesections/form.ts`. These
// helpers have no legacy snapshot suite — the home-section form is
// constructed entirely from runtime inputs (saved settings, row flags,
// library lists), and the test suite therefore asserts observable
// properties of the generated HTML rather than diffing it byte-for-byte.
//
// Conventions (mirrors `miFilters.test.ts`, `savedFilters.test.ts`):
//   - `toContain` substring assertions on key HTML fragments.
//   - `happy-dom` for the four DOM-touching helpers
//     (`updateHseItemsOnlyVisibility`, `updateHseImageTypeState`,
//     `wireHomeSectionTypeChange`, `refreshHseSectionTypeOptions`).
//   - `rowHasViewerCriteria` runs on a hand-built mini DOM.
//   - Phase 5 deferred helpers (`syncHomeSectionFromEmby`,
//     `initPlaylistTab`, `initHomeSectionTab`,
//     `updateHseSectionAvailability`) use the deps-factory pattern from
//     `manageTab.test.ts`: build a minimal DOM, supply fake deps,
//     drain microtasks, assert observable DOM + spy calls.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    buildHomeSectionFormHtml,
    updateHseItemsOnlyVisibility,
    updateHseImageTypeState,
    wireHomeSectionTypeChange,
    rowHasViewerCriteria,
    tagConfigHasViewerCriteria,
    refreshHseSectionTypeOptions,
    syncHomeSectionFromEmby,
    initPlaylistTab,
    initHomeSectionTab,
    updateHseSectionAvailability,
    type HseLibraryOption,
    type HseLibraryWithFlag,
    type HomeSectionApiClient,
    type SyncHomeSectionDeps,
    type InitPlaylistTabDeps,
    type InitHomeSectionTabDeps,
    type UpdateHseSectionAvailabilityDeps,
} from './form';
import {
    createOriginalConfigStateRef,
    type OriginalConfigStateRef,
} from '../state/state';
import type { HscUserLike } from './hscTab';

// ---------------------------------------------------------------------------
// `buildHomeSectionFormHtml`
// ---------------------------------------------------------------------------

describe('buildHomeSectionFormHtml', () => {
    it('renders the boxset Section Type option when collEnabled is true', () => {
        const html = buildHomeSectionFormHtml({}, '', '', false, true, [], 'auto', [], false);
        expect(html).toContain('class="selHseSectionType');
        expect(html).toContain('<option value="boxset"');
        expect(html).toContain('Single Collection');
        // The 'items' option requires tagEnabled OR viewerOnly; neither is set here.
        expect(html).not.toContain('<option value="items"');
    });

    it('renders the items Section Type option when tagEnabled is true', () => {
        const html = buildHomeSectionFormHtml({}, '', '', true, false, [], 'auto', [], false);
        expect(html).toContain('<option value="items"');
        expect(html).toContain('Dynamic Media (tag)');
        expect(html).not.toContain('<option value="boxset"');
    });

    it('uses "Dynamic Media (per user)" wording when viewerOnly is set without tagEnabled', () => {
        const html = buildHomeSectionFormHtml({}, '', '', false, false, [], 'auto', [], true);
        expect(html).toContain('<option value="items"');
        expect(html).toContain('Dynamic Media (per user)');
    });

    it('falls back to "items" when nothing else is enabled and no saved settings exist', () => {
        // No collEnabled, no tagEnabled, no viewerOnly. The first non-empty
        // branch falls through; the section type still needs to render but
        // no option list is emitted (the saved settings won't apply).
        const html = buildHomeSectionFormHtml({}, '', '', false, false, [], 'auto', [], false);
        expect(html).toContain('class="selHseSectionType');
        expect(html).not.toContain('<option value="boxset"');
        expect(html).not.toContain('<option value="items"');
    });

    it('emits both Section Type options when both collEnabled and tagEnabled are true', () => {
        const html = buildHomeSectionFormHtml({}, '', '', true, true, [], 'auto', [], false);
        expect(html).toContain('<option value="boxset"');
        expect(html).toContain('<option value="items"');
        // Default Section Type (no saved) when collEnabled wins is 'boxset'.
        expect(html).toMatch(/<option value="boxset" selected/);
    });

    it('pre-selects the saved SectionType when savedSettings has one', () => {
        const html = buildHomeSectionFormHtml({ SectionType: 'items' }, '', '', true, true, [], 'auto', [], false);
        expect(html).toMatch(/<option value="items" selected/);
        // boxset is also a valid option here, just not selected.
        expect(html).toMatch(/<option value="boxset"/);
        expect(html).not.toMatch(/<option value="boxset" selected/);
    });

    it('honors savedLibraryId="auto" with a hidden <select class="selHseLibrary">', () => {
        const html = buildHomeSectionFormHtml({}, '', '', true, false, [], 'auto', [], false);
        expect(html).toContain('class="selHseLibrary"');
        expect(html).toMatch(/<option value="auto" selected/);
    });

    it('emits one <option> per libraryOption plus the "auto" sentinel', () => {
        const libraries: HseLibraryOption[] = [
            { id: 'lib1', name: 'Movies' },
            { id: 'lib2', name: 'Shows' },
        ];
        const html = buildHomeSectionFormHtml({}, '', '', true, false, libraries, 'lib2', [], false);
        expect(html).toContain('<option value="lib1"');
        expect(html).toContain('>Movies</option>');
        expect(html).toContain('<option value="lib2" selected');
        expect(html).toContain('>Shows</option>');
    });

    it('emits hidden chkHseLibrary checkboxes for items-type sections with libraries', () => {
        const libraries: HseLibraryWithFlag[] = [
            { id: 'lib1', name: 'Movies', isTopList: false },
            { id: 'lib2', name: 'Top Lists', isTopList: true },
        ];
        const html = buildHomeSectionFormHtml({}, '', '', true, false, [], 'auto', libraries, false);
        // For a brand-new items-type section with no saved exclusions,
        // the legacy default is "auto-exclude top-list libraries".
        expect(html).toContain('class="chkHseLibrary" value="lib1" checked');
        expect(html).toContain('class="chkHseLibrary" value="lib2"');
        expect(html).not.toContain('class="chkHseLibrary" value="lib2" checked');
    });

    it('honors a saved _queryExcludeViewIds list and ignores the auto-exclude fallback', () => {
        const libraries: HseLibraryWithFlag[] = [
            { id: 'lib1', name: 'Movies', isTopList: false },
            { id: 'lib2', name: 'Top Lists', isTopList: true },
        ];
        const html = buildHomeSectionFormHtml(
            { _queryExcludeViewIds: 'lib1' }, '', '', true, false, [], 'auto', libraries, false,
        );
        // Saved exclusions win: lib1 is excluded (unchecked), lib2 is included.
        expect(html).toContain('class="chkHseLibrary" value="lib1"');
        expect(html).not.toContain('class="chkHseLibrary" value="lib1" checked');
        expect(html).toContain('class="chkHseLibrary" value="lib2" checked');
    });

    it('does not emit chkHseLibrary checkboxes for boxset-type sections', () => {
        const libraries: HseLibraryWithFlag[] = [
            { id: 'lib1', name: 'Movies', isTopList: false },
        ];
        const html = buildHomeSectionFormHtml(
            { SectionType: 'boxset' }, '', '', false, true, [], 'auto', libraries, false,
        );
        expect(html).not.toContain('class="chkHseLibrary"');
    });

    it('renders a populated View Type <select> with Cards / Spotlight options', () => {
        const html = buildHomeSectionFormHtml({}, '', '', true, false, [], 'auto', [], false);
        expect(html).toContain('class="selHseViewType');
        expect(html).toContain('Cards (default)');
        expect(html).toContain('Spotlight');
    });

    it('migrates legacy ViewType="cards" to the empty (Cards) option', () => {
        const html = buildHomeSectionFormHtml(
            { ViewType: 'cards' }, '', '', true, false, [], 'auto', [], false,
        );
        // The <option value=""> should be selected; the literal "cards"
        // value should NOT appear as an option value anywhere.
        expect(html).toMatch(/<option value="" selected[^>]*>Cards \(default\)<\/option>/);
        expect(html).not.toContain('<option value="cards"');
    });

    it('disables the Image Type select when ViewType is "spotlight"', () => {
        const html = buildHomeSectionFormHtml(
            { ViewType: 'spotlight' }, '', '', true, false, [], 'auto', [], false,
        );
        expect(html).toMatch(/class="selHseImageType[^"]*"[^>]*disabled/);
    });

    it('embeds defaultName as the Custom Title placeholder, escaping only double quotes', () => {
        // Legacy behavior: the legacy line is `(defaultName || '').replace(/"/g, '&quot;')`
        // — only double quotes are escaped. Ampersands stay literal.
        const html = buildHomeSectionFormHtml({}, '', 'Tom & "Jerry"', true, false, [], 'auto', [], false);
        expect(html).toContain('placeholder="Tom & &quot;Jerry&quot;"');
    });

    it('embeds saved CustomName as the Custom Title value, escaping quotes', () => {
        const html = buildHomeSectionFormHtml(
            { CustomName: 'My "Cool" Section' }, '', '', true, false, [], 'auto', [], false,
        );
        expect(html).toContain('value="My &quot;Cool&quot; Section"');
    });
});

// ---------------------------------------------------------------------------
// `tagConfigHasViewerCriteria`
// ---------------------------------------------------------------------------

describe('tagConfigHasViewerCriteria', () => {
    it('returns false for null input', () => {
        expect(tagConfigHasViewerCriteria(null)).toBe(false);
        expect(tagConfigHasViewerCriteria(undefined)).toBe(false);
    });

    it('returns false for an empty filter list', () => {
        expect(tagConfigHasViewerCriteria({ MediaInfoFilters: [] })).toBe(false);
        expect(tagConfigHasViewerCriteria({ MediaInfoConditions: [] })).toBe(false);
    });

    it('returns true when a filter group has the InProgress shorthand', () => {
        expect(tagConfigHasViewerCriteria({
            MediaInfoFilters: [{ Criteria: ['Resolution:4K', 'InProgress'] }],
        })).toBe(true);
    });

    it('returns true when a filter group has a ":__current__:" per-user criterion', () => {
        expect(tagConfigHasViewerCriteria({
            MediaInfoFilters: [{ Criteria: ['Played:__current__:true:yes'] }],
        })).toBe(true);
    });

    it('strips a leading "!" before checking InProgress', () => {
        expect(tagConfigHasViewerCriteria({
            MediaInfoFilters: [{ Criteria: ['!InProgress'] }],
        })).toBe(true);
    });

    it('returns false when no criterion is viewer-dependent', () => {
        expect(tagConfigHasViewerCriteria({
            MediaInfoFilters: [{ Criteria: ['Resolution:4K', 'Genre:Action'] }],
        })).toBe(false);
    });

    it('falls back to MediaInfoConditions when MediaInfoFilters is absent', () => {
        expect(tagConfigHasViewerCriteria({
            MediaInfoConditions: ['InProgress'],
        })).toBe(true);
        expect(tagConfigHasViewerCriteria({
            MediaInfoConditions: ['Resolution:4K'],
        })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// `rowHasViewerCriteria`
// ---------------------------------------------------------------------------

/**
 * Build a `<div class="mi-rule">` subtree with the given prop + user
 * values. Returns the rule root so a caller can append it to a row.
 */
function makeRule(propValue: string, userValue: string | null): HTMLElement {
    const rule = document.createElement('div');
    rule.className = 'mi-rule';

    const propSel = document.createElement('select');
    propSel.className = 'selMiProperty';
    const opt = document.createElement('option');
    opt.value = propValue;
    propSel.appendChild(opt);
    rule.appendChild(propSel);

    if (userValue !== null) {
        const userSel = document.createElement('select');
        userSel.className = 'selMiUser';
        const u = document.createElement('option');
        u.value = userValue;
        userSel.appendChild(u);
        rule.appendChild(userSel);
    }
    return rule;
}

function makeRow(rules: ReadonlyArray<HTMLElement>): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tag-row';
    rules.forEach((r) => row.appendChild(r));
    return row;
}

describe('rowHasViewerCriteria', () => {
    it('returns false for an empty row', () => {
        expect(rowHasViewerCriteria(makeRow([]))).toBe(false);
    });

    it('returns false when no rule has a viewer criterion', () => {
        const row = makeRow([
            makeRule('Resolution', null),
            makeRule('Genre', 'alice'),
        ]);
        expect(rowHasViewerCriteria(row)).toBe(false);
    });

    it('returns true when a rule has InProgress selected', () => {
        const row = makeRow([makeRule('InProgress', null)]);
        expect(rowHasViewerCriteria(row)).toBe(true);
    });

    it('returns true when a rule has __current__ selected in .selMiUser', () => {
        const row = makeRow([makeRule('Played', '__current__')]);
        expect(rowHasViewerCriteria(row)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// DOM-touching helpers (happy-dom)
// ---------------------------------------------------------------------------

/**
 * Build a fake home-section tab containing the four `<select>`
 * elements the visibility / image-type helpers look at. Returns the
 * tab root plus direct references to the elements for assertions.
 */
function makeHseTab(sectionType: string, viewType: string): {
    tab: HTMLElement;
    section: HTMLSelectElement;
    view: HTMLSelectElement;
    img: HTMLSelectElement;
    itemsOnly: HTMLElement[];
} {
    const tab = document.createElement('div');
    tab.className = 'homescreen-tab';

    const section = document.createElement('select');
    section.className = 'selHseSectionType hse-field-str';
    section.dataset.field = 'SectionType';
    ['boxset', 'items'].forEach((v) => {
        const o = document.createElement('option');
        o.value = v;
        section.appendChild(o);
    });
    section.value = sectionType;
    tab.appendChild(section);

    const view = document.createElement('select');
    view.className = 'selHseViewType hse-field-str';
    view.dataset.field = 'ViewType';
    ['', 'spotlight'].forEach((v) => {
        const o = document.createElement('option');
        o.value = v;
        view.appendChild(o);
    });
    view.value = viewType;
    tab.appendChild(view);

    const img = document.createElement('select');
    img.className = 'selHseImageType hse-field-str';
    img.dataset.field = 'ImageType';
    tab.appendChild(img);

    const itemsOnly = [
        document.createElement('div'),
        document.createElement('div'),
    ];
    itemsOnly.forEach((el) => {
        el.className = 'hse-items-only';
        el.style.display = '';
        tab.appendChild(el);
    });

    return { tab, section, view, img, itemsOnly };
}

describe('updateHseItemsOnlyVisibility', () => {
    it('shows .hse-items-only elements when SectionType is "items"', () => {
        const { tab, itemsOnly } = makeHseTab('items', '');
        updateHseItemsOnlyVisibility(tab);
        itemsOnly.forEach((el) => expect(el.style.display).toBe(''));
    });

    it('hides .hse-items-only elements when SectionType is "boxset"', () => {
        const { tab, itemsOnly } = makeHseTab('boxset', '');
        updateHseItemsOnlyVisibility(tab);
        itemsOnly.forEach((el) => expect(el.style.display).toBe('none'));
    });

    it('treats a missing SectionType select as "items"', () => {
        // Without a .selHseSectionType in the subtree, the helper still
        // runs and the items-only blocks stay visible.
        const tab = document.createElement('div');
        const itemsOnly = document.createElement('div');
        itemsOnly.className = 'hse-items-only';
        tab.appendChild(itemsOnly);
        updateHseItemsOnlyVisibility(tab);
        expect(itemsOnly.style.display).toBe('');
    });
});

describe('updateHseImageTypeState', () => {
    it('disables the Image Type select for items + non-cards view', () => {
        const { tab, img } = makeHseTab('items', 'spotlight');
        // Wait — spotlight view + items. The legacy rule: imgSel is
        // disabled when (items AND NOT cards). Spotlight is not cards,
        // so the select gets disabled.
        updateHseImageTypeState(tab);
        expect(img.disabled).toBe(true);
    });

    it('enables the Image Type select for items + cards view (default)', () => {
        const { tab, img } = makeHseTab('items', '');
        updateHseImageTypeState(tab);
        expect(img.disabled).toBe(false);
    });

    it('enables the Image Type select for boxset regardless of view', () => {
        const { tab, img } = makeHseTab('boxset', 'spotlight');
        updateHseImageTypeState(tab);
        expect(img.disabled).toBe(false);
    });

    it('is a no-op when the Image Type select is absent', () => {
        const tab = document.createElement('div');
        expect(() => updateHseImageTypeState(tab)).not.toThrow();
    });
});

describe('wireHomeSectionTypeChange', () => {
    let tab: HTMLElement;
    let section: HTMLSelectElement;
    let view: HTMLSelectElement;
    let img: HTMLSelectElement;
    let itemsOnly: HTMLElement[];

    beforeEach(() => {
        ({ tab, section, view, img, itemsOnly } = makeHseTab('items', ''));
        wireHomeSectionTypeChange(tab);
    });

    it('runs the visibility + image-type updates once up-front', () => {
        // items + default view → items-only visible, image-type enabled.
        itemsOnly.forEach((el) => expect(el.style.display).toBe(''));
        expect(img.disabled).toBe(false);
    });

    it('reacts to a SectionType change by hiding items-only on boxset', () => {
        section.value = 'boxset';
        section.dispatchEvent(new Event('change'));
        itemsOnly.forEach((el) => expect(el.style.display).toBe('none'));
    });

    it('reacts to a ViewType change by re-evaluating the image-type disable', () => {
        view.value = 'spotlight';
        view.dispatchEvent(new Event('change'));
        expect(img.disabled).toBe(true);
    });

    it('is a no-op when the Section Type select is missing', () => {
        const bareTab = document.createElement('div');
        expect(() => wireHomeSectionTypeChange(bareTab)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// `refreshHseSectionTypeOptions`
// ---------------------------------------------------------------------------

describe('refreshHseSectionTypeOptions', () => {
    it('emits only the boxset option when only collEnabled is true', () => {
        const { tab, section } = makeHseTab('items', '');
        refreshHseSectionTypeOptions(tab, /* tagEnabled */ false, /* collEnabled */ true, /* viewerOnly */ false);
        expect(section.options.length).toBe(1);
        expect(section.options[0]!.value).toBe('boxset');
    });

    it('emits only the items option when only viewerOnly is true (no tagEnabled)', () => {
        const { tab, section } = makeHseTab('boxset', '');
        refreshHseSectionTypeOptions(tab, /* tagEnabled */ false, /* collEnabled */ false, /* viewerOnly */ true);
        expect(section.options.length).toBe(1);
        expect(section.options[0]!.value).toBe('items');
        expect(section.options[0]!.textContent).toBe('Dynamic Media (per user)');
    });

    it('emits both options when both flags are true; labels as "Dynamic Media (tag)"', () => {
        const { tab, section } = makeHseTab('boxset', '');
        refreshHseSectionTypeOptions(tab, /* tagEnabled */ true, /* collEnabled */ true, /* viewerOnly */ false);
        expect(section.options.length).toBe(2);
        expect(section.options[0]!.value).toBe('boxset');
        expect(section.options[1]!.value).toBe('items');
        expect(section.options[1]!.textContent).toBe('Dynamic Media (tag)');
    });

    it('preserves the previous selection when still valid', () => {
        const { tab, section } = makeHseTab('boxset', '');
        refreshHseSectionTypeOptions(tab, /* tagEnabled */ false, /* collEnabled */ true, /* viewerOnly */ false);
        expect(section.value).toBe('boxset');
    });

    it('clears the selection when the previous value is no longer valid', () => {
        const { tab, section } = makeHseTab('boxset', '');
        // Switch to viewerOnly-only → only 'items' is now valid. boxset
        // selection is dropped.
        refreshHseSectionTypeOptions(tab, /* tagEnabled */ false, /* collEnabled */ false, /* viewerOnly */ true);
        expect(section.value).not.toBe('boxset');
        expect(section.value).toBe('items');
    });

    it('triggers an items-only visibility update on every call', () => {
        const { tab, itemsOnly } = makeHseTab('items', '');
        refreshHseSectionTypeOptions(tab, /* tagEnabled */ true, /* collEnabled */ false, /* viewerOnly */ false);
        itemsOnly.forEach((el) => expect(el.style.display).toBe(''));
        // Switch to collEnabled-only → no 'items' option, items-only hidden.
        refreshHseSectionTypeOptions(tab, /* tagEnabled */ false, /* collEnabled */ true, /* viewerOnly */ false);
        itemsOnly.forEach((el) => expect(el.style.display).toBe('none'));
    });

    it('is a no-op when the Section Type select is missing', () => {
        const bareTab = document.createElement('div');
        expect(() => refreshHseSectionTypeOptions(bareTab, true, false, false)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// `syncHomeSectionFromEmby`
// ---------------------------------------------------------------------------

/**
 * Build a minimal `.homescreen-tab` DOM with the four `[data-field]`
 * selects + `.selHseItemTypes` + `.chkHseLibrary` controls that
 * `syncHomeSectionFromEmby` mutates. The `dataset.hseTracked` value
 * is set to a JSON-encoded array carrying one non-`hsc__` entry whose
 * `SectionId` matches the section returned by the fetch mock.
 */
function makeSyncTab(sectionId: string, userId: string): HTMLElement {
    const tab = document.createElement('div');
    tab.className = 'homescreen-tab';
    tab.dataset.hseTracked = encodeURIComponent(JSON.stringify([
        { SectionId: sectionId, UserId: userId },
    ]));

    const fields: ReadonlyArray<readonly [string, readonly string[]]> = [
        ['SectionType',     ['boxset', 'items']],
        ['DisplayMode',     ['', 'tv', 'mobile,desktop']],
        ['ViewType',        ['', 'spotlight']],
        ['ImageType',       ['', 'Primary', 'Thumb']],
        ['SortBy',          ['', 'Random']],
        ['SortOrder',       ['', 'Ascending', 'Descending']],
        ['ScrollDirection', ['', 'Horizontal', 'Vertical']],
        ['_hsePlaystate',   ['', 'played', 'unplayed', 'inprogress']],
    ];
    fields.forEach(([field, options]) => {
        const sel = document.createElement('select');
        sel.className = 'hse-field-str';
        sel.dataset.field = field;
        options.forEach((v) => {
            const o = document.createElement('option');
            o.value = v;
            sel.appendChild(o);
        });
        tab.appendChild(sel);
    });

    // CustomName is the lone text input — `form.ts` renders it as
    // <input data-field="CustomName">, not a <select>.
    const customName = document.createElement('input');
    customName.type = 'text';
    customName.className = 'hse-field-str';
    customName.dataset.field = 'CustomName';
    tab.appendChild(customName);

    const itemTypes = document.createElement('select');
    itemTypes.className = 'selHseItemTypes';
    ['Movie', 'Movie,Series', 'Series'].forEach((v) => {
        const o = document.createElement('option');
        o.value = v;
        itemTypes.appendChild(o);
    });
    tab.appendChild(itemTypes);

    ['lib1', 'lib2'].forEach((id) => {
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'chkHseLibrary';
        chk.value = id;
        chk.checked = true;
        tab.appendChild(chk);
    });

    // `.hse-items-only` block — the visibility helper looks for these.
    const itemsOnly = document.createElement('div');
    itemsOnly.className = 'hse-items-only';
    tab.appendChild(itemsOnly);

    return tab;
}

function makeApi(overrides: Partial<HomeSectionApiClient> = {}): HomeSectionApiClient {
    return {
        accessToken: overrides.accessToken ?? (() => 'test-token'),
        getUrl: overrides.getUrl ?? ((name: string, params?: Record<string, unknown>) => {
            const q = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
            return 'http://legacy.test/' + name + q;
        }),
        getJSON: overrides.getJSON ?? (() => Promise.resolve({})),
    };
}

describe('syncHomeSectionFromEmby', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('resolves immediately when no tracked non-hsc__ section exists', async () => {
        const tab = document.createElement('div');
        tab.className = 'homescreen-tab';
        tab.dataset.hseTracked = encodeURIComponent(JSON.stringify([
            { SectionId: 'hsc__synthetic', UserId: 'u1' },
        ]));
        document.body.appendChild(tab);

        const fetchMock = vi.fn();
        const deps: SyncHomeSectionDeps = {
            fetch: fetchMock as unknown as typeof fetch,
            getApiClient: () => makeApi(),
        };

        await syncHomeSectionFromEmby(tab, deps);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches UserSections with X-Emby-Token and the encoded UserId', async () => {
        const tab = makeSyncTab('sec-1', 'u-9');
        document.body.appendChild(tab);

        const fetchMock = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ Sections: [] }),
        });
        const deps: SyncHomeSectionDeps = {
            fetch: fetchMock as unknown as typeof fetch,
            getApiClient: () => makeApi(),
        };

        await syncHomeSectionFromEmby(tab, deps);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://legacy.test/HomeScreenCompanion/Hsc/UserSections?UserId=u-9',
            expect.objectContaining({ headers: { 'X-Emby-Token': 'test-token' } }),
        );
    });

    it('applies matching section fields onto [data-field] selects', async () => {
        const tab = makeSyncTab('sec-1', 'u-1');
        document.body.appendChild(tab);

        const fetchMock = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({
                Sections: [{
                    Id: 'sec-1',
                    SectionType: 'items',
                    CustomName: 'My Cool Section',
                    DisplayMode: 'tv',
                    ViewType: 'spotlight',
                    ImageType: 'Thumb',
                    SortBy: 'Random',
                    SortOrder: 'Descending',
                    ScrollDirection: 1,
                    Query: { IsResumable: true },
                    ItemTypes: ['Movie', 'Series'],
                    ExcludedFolders: ['lib2'],
                }],
            }),
        });
        const deps: SyncHomeSectionDeps = {
            fetch: fetchMock as unknown as typeof fetch,
            getApiClient: () => makeApi(),
        };

        await syncHomeSectionFromEmby(tab, deps);

        const get = (field: string): string => (tab.querySelector<HTMLSelectElement>(`[data-field="${field}"]`)?.value) ?? '';
        expect(get('SectionType')).toBe('items');
        expect(get('CustomName')).toBe('My Cool Section');
        expect(get('DisplayMode')).toBe('tv');
        expect(get('ViewType')).toBe('spotlight');
        expect(get('ImageType')).toBe('Thumb');
        expect(get('SortBy')).toBe('Random');
        expect(get('SortOrder')).toBe('Descending');
        expect(get('ScrollDirection')).toBe('Vertical');
        expect(get('_hsePlaystate')).toBe('inprogress');
        // ItemTypes synced via the comma-join path.
        expect(tab.querySelector<HTMLSelectElement>('.selHseItemTypes')?.value).toBe('Movie,Series');
        // ExcludedFolders flips the matching chkHseLibrary checkbox off.
        const chk1 = tab.querySelector<HTMLInputElement>('.chkHseLibrary[value="lib1"]');
        const chk2 = tab.querySelector<HTMLInputElement>('.chkHseLibrary[value="lib2"]');
        expect(chk1?.checked).toBe(true);
        expect(chk2?.checked).toBe(false);
    });

    it('maps IsPlayed=true / IsUnplayed=true onto the playstate select', async () => {
        const playedTab = makeSyncTab('sec-1', 'u-1');
        document.body.appendChild(playedTab);
        await syncHomeSectionFromEmby(playedTab, {
            fetch: vi.fn().mockResolvedValue({ json: () => Promise.resolve({
                Sections: [{ Id: 'sec-1', Query: { IsPlayed: true } }],
            }) }) as unknown as typeof fetch,
            getApiClient: () => makeApi(),
        });
        expect(playedTab.querySelector<HTMLSelectElement>('[data-field="_hsePlaystate"]')?.value).toBe('played');

        const unplayedTab = makeSyncTab('sec-1', 'u-1');
        document.body.appendChild(unplayedTab);
        await syncHomeSectionFromEmby(unplayedTab, {
            fetch: vi.fn().mockResolvedValue({ json: () => Promise.resolve({
                Sections: [{ Id: 'sec-1', Query: { IsUnplayed: true } }],
            }) }) as unknown as typeof fetch,
            getApiClient: () => makeApi(),
        });
        expect(unplayedTab.querySelector<HTMLSelectElement>('[data-field="_hsePlaystate"]')?.value).toBe('unplayed');
    });

    it('is a silent no-op when the section id is not in the response', async () => {
        const tab = makeSyncTab('sec-1', 'u-1');
        document.body.appendChild(tab);
        const sectionTypeSel = tab.querySelector<HTMLSelectElement>('[data-field="SectionType"]');
        sectionTypeSel!.value = 'boxset';

        await syncHomeSectionFromEmby(tab, {
            fetch: vi.fn().mockResolvedValue({ json: () => Promise.resolve({
                Sections: [{ Id: 'sec-OTHER', SectionType: 'items' }],
            }) }) as unknown as typeof fetch,
            getApiClient: () => makeApi(),
        });

        // Selection untouched.
        expect(sectionTypeSel?.value).toBe('boxset');
    });

    it('swallows network errors silently', async () => {
        const tab = makeSyncTab('sec-1', 'u-1');
        document.body.appendChild(tab);

        await expect(syncHomeSectionFromEmby(tab, {
            fetch: vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch,
            getApiClient: () => makeApi(),
        })).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// `initPlaylistTab`
// ---------------------------------------------------------------------------

describe('initPlaylistTab', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('is a no-op when the .playlist-tab is missing', async () => {
        const row = document.createElement('div');
        row.className = 'tag-row';
        const getHseUsers = vi.fn().mockResolvedValue([]);
        const buildSpy = vi.fn().mockReturnValue('<p>built</p>');
        const wireSpy = vi.fn();

        initPlaylistTab(row, makePlaylistDeps({ getHseUsers, build: buildSpy, wire: wireSpy }));

        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(getHseUsers).not.toHaveBeenCalled();
        expect(buildSpy).not.toHaveBeenCalled();
    });

    it('is a no-op (idempotent) when dataset.plLoaded is already "1"', async () => {
        const row = makePlaylistRow([]);
        row.querySelector('.playlist-tab')!.setAttribute('data-pl-loaded', '1');
        const getHseUsers = vi.fn();

        initPlaylistTab(row, makePlaylistDeps({ getHseUsers }));
        for (let i = 0; i < 5; i++) await Promise.resolve();

        expect(getHseUsers).not.toHaveBeenCalled();
    });

    it('resolves the user list, builds the dropdown HTML, and wires it', async () => {
        const row = makePlaylistRow(['a', 'c']);
        document.body.appendChild(row);
        const users: HscUserLike[] = [{ Id: 'a', Name: 'Alice' }, { Id: 'b', Name: 'Bob' }];
        const getHseUsers = vi.fn().mockResolvedValue(users);
        const buildSpy = vi.fn().mockReturnValue('<span class="built">hi</span>');
        const wireSpy = vi.fn();

        initPlaylistTab(row, makePlaylistDeps({ getHseUsers, build: buildSpy, wire: wireSpy }));
        for (let i = 0; i < 10; i++) await Promise.resolve();

        expect(getHseUsers).toHaveBeenCalledTimes(1);
        expect(buildSpy).toHaveBeenCalledWith(users, ['a', 'c'], 'chkPlaylistUser');
        expect(wireSpy).toHaveBeenCalledTimes(1);
        const listEl = row.querySelector<HTMLElement>('.playlist-user-list');
        expect(listEl?.innerHTML).toContain('<span class="built">hi</span>');
        expect(row.querySelector('.playlist-tab')!.getAttribute('data-pl-loaded')).toBe('1');
    });

    it('tolerates a malformed dataset.plUserids (falls back to empty selection)', async () => {
        const row = makePlaylistRow([]);
        row.querySelector('.playlist-tab')!.setAttribute('data-pl-userids', '%7Bnot-json');
        document.body.appendChild(row);
        const buildSpy = vi.fn().mockReturnValue('<span>built</span>');

        initPlaylistTab(row, makePlaylistDeps({
            getHseUsers: vi.fn().mockResolvedValue([]),
            build: buildSpy,
        }));
        for (let i = 0; i < 10; i++) await Promise.resolve();

        expect(buildSpy).toHaveBeenCalledWith([], [], 'chkPlaylistUser');
    });
});

function makePlaylistRow(savedIds: readonly string[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tag-row';
    const tab = document.createElement('div');
    tab.className = 'playlist-tab';
    tab.dataset.plUserids = encodeURIComponent(JSON.stringify(savedIds));
    const list = document.createElement('div');
    list.className = 'playlist-user-list';
    tab.appendChild(list);
    row.appendChild(tab);
    return row;
}

function makePlaylistDeps(overrides: {
    getHseUsers?: ReturnType<typeof vi.fn>;
    build?: ReturnType<typeof vi.fn>;
    wire?: ReturnType<typeof vi.fn>;
} = {}): InitPlaylistTabDeps {
    const getHseUsers = (overrides.getHseUsers ?? vi.fn().mockResolvedValue([])) as unknown as () => Promise<HscUserLike[]>;
    const build = (overrides.build ?? vi.fn().mockReturnValue('')) as unknown as (users: readonly HscUserLike[], selectedIds: readonly string[], checkboxClass: string) => string;
    const wire = (overrides.wire ?? vi.fn()) as unknown as (container: Element | null) => void;
    return {
        getHseUsers,
        buildUserMultiSelectHtml: build,
        wireUserMultiSelect: wire,
    };
}

// ---------------------------------------------------------------------------
// `initHomeSectionTab`
// ---------------------------------------------------------------------------

/**
 * Build a full tag-row + home-section-tab subtree that
 * `initHomeSectionTab` can operate on. Returns the row + the
 * `.homescreen-tab` so individual tests can drill in.
 */
function makeHomeSectionRow(opts: {
    savedUserIds?: readonly string[];
    savedSettings?: Record<string, unknown>;
    savedLibraryId?: string;
    defaultSectionType?: string;
    tagEnabled?: boolean;
    collEnabled?: boolean;
    sourceType?: string;
} = {}): { row: HTMLElement; tab: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'tag-row';

    const entryLabel = document.createElement('input');
    entryLabel.className = 'txtEntryLabel';
    entryLabel.value = 'My Tag';
    row.appendChild(entryLabel);

    const tagName = document.createElement('input');
    tagName.className = 'txtTagName';
    tagName.value = 'MyTag';
    row.appendChild(tagName);

    const chkTag = document.createElement('input');
    chkTag.type = 'checkbox';
    chkTag.className = 'chkEnableTag';
    chkTag.checked = !!opts.tagEnabled;
    row.appendChild(chkTag);

    const chkColl = document.createElement('input');
    chkColl.type = 'checkbox';
    chkColl.className = 'chkEnableCollection';
    chkColl.checked = !!opts.collEnabled;
    row.appendChild(chkColl);

    const selSource = document.createElement('select');
    selSource.className = 'selSourceType';
    const opt = document.createElement('option');
    opt.value = opts.sourceType ?? 'External';
    selSource.appendChild(opt);
    row.appendChild(selSource);

    const tab = document.createElement('div');
    tab.className = 'homescreen-tab';
    tab.dataset.hseUserids = encodeURIComponent(JSON.stringify(opts.savedUserIds ?? []));
    tab.dataset.hseSettings = encodeURIComponent(JSON.stringify(opts.savedSettings ?? {}));
    tab.dataset.hseLibraryid = encodeURIComponent(opts.savedLibraryId ?? 'auto');
    if (opts.defaultSectionType) tab.dataset.hseDefaultType = opts.defaultSectionType;

    const userList = document.createElement('div');
    userList.className = 'hse-user-list-inner';
    tab.appendChild(userList);

    const fields = document.createElement('div');
    fields.className = 'hse-fields-inner';
    tab.appendChild(fields);

    row.appendChild(tab);
    return { row, tab };
}

function makeHomeSectionDeps(overrides: {
    getHseUsers?: ReturnType<typeof vi.fn>;
    preFetchLibraryData?: ReturnType<typeof vi.fn>;
    syncHomeSectionFromEmby?: ReturnType<typeof vi.fn>;
    getUiConfig?: ReturnType<typeof vi.fn>;
    checkFormState?: ReturnType<typeof vi.fn>;
    originalConfigState?: OriginalConfigStateRef;
    buildUserMultiSelectHtml?: ReturnType<typeof vi.fn>;
    wireUserMultiSelect?: ReturnType<typeof vi.fn>;
} = {}): InitHomeSectionTabDeps {
    const getHseUsers = (overrides.getHseUsers ?? vi.fn().mockResolvedValue([])) as unknown as () => Promise<HscUserLike[]>;
    const preFetchLibraryData = (overrides.preFetchLibraryData ?? vi.fn().mockResolvedValue({
        topListFolderNames: new Set<string>(),
        virtualFolders: [],
    })) as unknown as () => Promise<unknown>;
    const syncHomeSectionFromEmby = (overrides.syncHomeSectionFromEmby ?? vi.fn().mockResolvedValue(undefined)) as unknown as (tab: HTMLElement, syncDeps: SyncHomeSectionDeps) => Promise<void>;
    const getUiConfig = (overrides.getUiConfig ?? vi.fn().mockReturnValue({})) as unknown as (view: HTMLElement, forComparison: boolean) => unknown;
    const checkFormState = (overrides.checkFormState ?? vi.fn()) as unknown as () => void;
    const originalConfigState = overrides.originalConfigState ?? createOriginalConfigStateRef();
    const build = (overrides.buildUserMultiSelectHtml ?? vi.fn().mockReturnValue('<div>users</div>')) as unknown as (users: readonly HscUserLike[], selectedIds: readonly string[], checkboxClass: string) => string;
    const wire = (overrides.wireUserMultiSelect ?? vi.fn()) as unknown as (container: Element | null) => void;
    return {
        getHseUsers,
        preFetchLibraryData,
        syncHomeSectionFromEmby,
        getUiConfig,
        checkFormState,
        originalConfigState,
        buildUserMultiSelectHtml: build,
        wireUserMultiSelect: wire,
    };
}

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('initHomeSectionTab', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('is a no-op when the .homescreen-tab is missing', async () => {
        const row = document.createElement('div');
        row.className = 'tag-row';
        const deps = makeHomeSectionDeps();
        initHomeSectionTab(row, deps);
        await flushMicrotasks();
        expect(deps.getHseUsers).not.toHaveBeenCalled();
    });

    it('builds the form HTML, calls sync, then re-anchors baseline + checkFormState', async () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        document.body.appendChild(view);

        // Anchor the baseline so it matches the post-sync snapshot — the
        // legacy re-anchor only fires when `_wasAlreadyDirty` is false
        // (i.e. current state == baseline) AND both refs are present.
        const origRef = createOriginalConfigStateRef();
        origRef.setOriginalConfigState('{"Tags":[],"TraktClientId":""}');

        const { row, tab } = makeHomeSectionRow({
            tagEnabled: true,
            sourceType: 'External',
            savedSettings: { CustomName: 'Persisted' },
        });
        document.body.appendChild(row);

        const getUiConfig = vi.fn().mockReturnValue({ Tags: [], TraktClientId: '' });
        const syncHomeSectionFromEmby = vi.fn().mockResolvedValue(undefined);
        const checkFormState = vi.fn();

        const deps = makeHomeSectionDeps({
            getHseUsers: vi.fn().mockResolvedValue([{ Id: 'u1', Name: 'Alice' }] as HscUserLike[]),
            preFetchLibraryData: vi.fn().mockResolvedValue({
                topListFolderNames: new Set<string>(),
                virtualFolders: [{ ItemId: 'lib1', Name: 'Movies' }],
            }),
            syncHomeSectionFromEmby,
            getUiConfig,
            checkFormState,
            originalConfigState: origRef,
        });

        initHomeSectionTab(row, deps);
        await flushMicrotasks();

        // Form HTML rendered into .hse-fields-inner.
        const fields = tab.querySelector('.hse-fields-inner') as HTMLElement;
        expect(fields.innerHTML).toContain('selHseSectionType');
        expect(fields.innerHTML).toContain('Persisted');
        // data-hse-loaded flipped to '1' after the form is in the DOM.
        expect(tab.dataset.hseLoaded).toBe('1');
        // sync called with the live tab.
        expect(syncHomeSectionFromEmby).toHaveBeenCalledTimes(1);
        expect(syncHomeSectionFromEmby.mock.calls[0]![0]).toBe(tab);
        // checkFormState pinged via setTimeout(0).
        await new Promise((r) => setTimeout(r, 5));
        expect(checkFormState).toHaveBeenCalledTimes(1);
        // baseline re-anchored to the post-sync snapshot.
        expect(origRef.getOriginalConfigState()).toBe('{"Tags":[],"TraktClientId":""}');
    });

    it('skips the baseline re-anchor when the form was already dirty', async () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        document.body.appendChild(view);

        const origRef = createOriginalConfigStateRef();
        origRef.setOriginalConfigState('"ORIGINAL"');

        const { row } = makeHomeSectionRow({ tagEnabled: true });
        document.body.appendChild(row);

        const getUiConfig = vi.fn().mockReturnValue({ Tags: [{ dirty: true }] });
        const syncHomeSectionFromEmby = vi.fn().mockResolvedValue(undefined);

        initHomeSectionTab(row, makeHomeSectionDeps({
            syncHomeSectionFromEmby,
            getUiConfig,
            originalConfigState: origRef,
        }));
        await flushMicrotasks();

        // Original stays untouched — the dirty form was preserved.
        expect(origRef.getOriginalConfigState()).toBe('"ORIGINAL"');
    });

    it('renders the failure copy and resets dataset.hseLoaded when preFetchLibraryData rejects', async () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        document.body.appendChild(view);

        const { row, tab } = makeHomeSectionRow({ tagEnabled: true });
        document.body.appendChild(row);

        initHomeSectionTab(row, makeHomeSectionDeps({
            preFetchLibraryData: vi.fn().mockRejectedValue(new Error('boom')),
        }));
        await flushMicrotasks();

        const fields = tab.querySelector('.hse-fields-inner') as HTMLElement;
        expect(fields.innerHTML).toContain('Failed to load: boom');
        expect(tab.dataset.hseLoaded).toBe('0');
    });
});

// ---------------------------------------------------------------------------
// `updateHseSectionAvailability`
// ---------------------------------------------------------------------------

function makeAvailabilityRow(opts: {
    tagEnabled?: boolean;
    collEnabled?: boolean;
    sourceType?: string;
    hasHse?: boolean;
    hasDetails?: boolean;
    hseLoaded?: boolean;
} = {}): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tag-row';

    const chkTag = document.createElement('input');
    chkTag.type = 'checkbox';
    chkTag.className = 'chkEnableTag';
    chkTag.checked = !!opts.tagEnabled;
    row.appendChild(chkTag);

    const chkColl = document.createElement('input');
    chkColl.type = 'checkbox';
    chkColl.className = 'chkEnableCollection';
    chkColl.checked = !!opts.collEnabled;
    row.appendChild(chkColl);

    const selSource = document.createElement('select');
    selSource.className = 'selSourceType';
    const opt = document.createElement('option');
    opt.value = opts.sourceType ?? 'External';
    selSource.appendChild(opt);
    row.appendChild(selSource);

    const hseCbx = document.createElement('input');
    hseCbx.type = 'checkbox';
    hseCbx.className = 'chkEnableHomeSection';
    hseCbx.checked = true;
    hseCbx.disabled = false;
    if (opts.hasHse !== false) row.appendChild(hseCbx);

    const hint = document.createElement('div');
    hint.className = 'hse-disabled-hint';
    hint.style.display = 'none';
    row.appendChild(hint);

    const details = document.createElement('div');
    details.className = 'hse-details';
    if (opts.hasDetails !== false) row.appendChild(details);

    const tab = document.createElement('div');
    tab.className = 'homescreen-tab';
    if (opts.hseLoaded) tab.dataset.hseLoaded = '1';
    const stSel = document.createElement('select');
    stSel.className = 'selHseSectionType';
    tab.appendChild(stSel);
    row.appendChild(tab);

    return row;
}

function makeAvailabilityDeps(overrides: {
    rowHasViewerCriteria?: ReturnType<typeof vi.fn>;
    refreshHseSectionTypeOptions?: ReturnType<typeof vi.fn>;
    updateBadges?: ReturnType<typeof vi.fn>;
} = {}): UpdateHseSectionAvailabilityDeps {
    const rowHasViewerCriteria = (overrides.rowHasViewerCriteria ?? vi.fn().mockReturnValue(false)) as unknown as (row: HTMLElement) => boolean;
    const refreshHseSectionTypeOptions = (overrides.refreshHseSectionTypeOptions ?? vi.fn()) as unknown as (tab: HTMLElement, tagEnabled: boolean, collEnabled: boolean, viewerOnly: boolean) => void;
    const updateBadges = (overrides.updateBadges ?? vi.fn()) as unknown as (row: HTMLElement) => void;
    return { rowHasViewerCriteria, refreshHseSectionTypeOptions, updateBadges };
}

describe('updateHseSectionAvailability', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('disables the HSE checkbox + shows the hint when no flag is enabled', () => {
        const row = makeAvailabilityRow();
        document.body.appendChild(row);
        const deps = makeAvailabilityDeps();

        updateHseSectionAvailability(row, deps);

        const hseCbx = row.querySelector<HTMLInputElement>('.chkEnableHomeSection')!;
        expect(hseCbx.disabled).toBe(true);
        expect(hseCbx.checked).toBe(false);
        expect(row.querySelector<HTMLElement>('.hse-disabled-hint')!.style.display).toBe('block');
        expect(row.querySelector<HTMLElement>('.hse-details')!.style.display).toBe('none');
        expect(deps.updateBadges).toHaveBeenCalledWith(row);
        expect(deps.refreshHseSectionTypeOptions).not.toHaveBeenCalled();
    });

    it('enables the HSE checkbox + hides the hint when tagEnabled is true', () => {
        const row = makeAvailabilityRow({ tagEnabled: true });
        document.body.appendChild(row);

        updateHseSectionAvailability(row, makeAvailabilityDeps());

        const hseCbx = row.querySelector<HTMLInputElement>('.chkEnableHomeSection')!;
        expect(hseCbx.disabled).toBe(false);
        expect(row.querySelector<HTMLElement>('.hse-disabled-hint')!.style.display).toBe('none');
    });

    it('enables the HSE checkbox when MediaInfo + viewerOnly is true', () => {
        const row = makeAvailabilityRow({ sourceType: 'MediaInfo' });
        document.body.appendChild(row);

        const deps = makeAvailabilityDeps({ rowHasViewerCriteria: vi.fn().mockReturnValue(true) });
        updateHseSectionAvailability(row, deps);

        const hseCbx = row.querySelector<HTMLInputElement>('.chkEnableHomeSection')!;
        expect(hseCbx.disabled).toBe(false);
    });

    it('refreshes the section-type options when the tab is already loaded', () => {
        const row = makeAvailabilityRow({ tagEnabled: true, hseLoaded: true });
        document.body.appendChild(row);

        const refreshSpy = vi.fn();
        updateHseSectionAvailability(row, makeAvailabilityDeps({ refreshHseSectionTypeOptions: refreshSpy }));

        expect(refreshSpy).toHaveBeenCalledTimes(1);
        const args = refreshSpy.mock.calls[0]!;
        expect(args[0]).toBe(row.querySelector('.homescreen-tab'));
        expect(args[1]).toBe(true);   // tagEnabled
        expect(args[2]).toBe(false);  // collEnabled
        expect(args[3]).toBe(false);  // viewerOnly (External sourceType)
    });

    it('skips refreshHseSectionTypeOptions when the tab is not yet loaded', () => {
        const row = makeAvailabilityRow({ tagEnabled: true, hseLoaded: false });
        document.body.appendChild(row);

        const refreshSpy = vi.fn();
        updateHseSectionAvailability(row, makeAvailabilityDeps({ refreshHseSectionTypeOptions: refreshSpy }));

        expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('is a no-op when .chkEnableHomeSection is missing', () => {
        const row = makeAvailabilityRow({ hasHse: false });
        document.body.appendChild(row);

        const deps = makeAvailabilityDeps();
        expect(() => updateHseSectionAvailability(row, deps)).not.toThrow();
        expect(deps.updateBadges).not.toHaveBeenCalled();
    });
});
