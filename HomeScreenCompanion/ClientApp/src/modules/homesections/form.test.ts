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

import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildHomeSectionFormHtml,
    updateHseItemsOnlyVisibility,
    updateHseImageTypeState,
    wireHomeSectionTypeChange,
    rowHasViewerCriteria,
    tagConfigHasViewerCriteria,
    refreshHseSectionTypeOptions,
    type HseLibraryOption,
    type HseLibraryWithFlag,
} from './form';

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
        const { tab, section, itemsOnly } = makeHseTab('items', '');
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
