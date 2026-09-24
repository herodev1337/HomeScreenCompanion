// Phase 3 wave 3 + Phase 5 follow-up: home-section tab HTML builders,
// DOM/event helpers, and the deferred loaders lifted from
// `Configuration/configPage.js` (legacy.js:2847–3260).
//
// This file owns the home-section form rendering and the small bit of
// DOM-only wiring the tab needs when it does NOT depend on `ApiClient`
// or module-scope mutable state. Specifically:
//
//   Pure HTML builders (no closures):
//     - `buildHomeSectionFormHtml(...)`     legacy.js:2847
//     - `tagConfigHasViewerCriteria(...)`   legacy.js:3217
//
//   DOM-read helpers (queries DOM, no closures):
//     - `rowHasViewerCriteria(row)`             legacy.js:3206
//     - `updateHseItemsOnlyVisibility(tab)`     legacy.js:2998
//     - `updateHseImageTypeState(tab)`          legacy.js:3006
//     - `refreshHseSectionTypeOptions(...)`     legacy.js:3262
//
//   DOM event wiring (queries DOM, attaches listeners, no closures):
//     - `wireHomeSectionTypeChange(tab)`        legacy.js:3016
//
// Phase 5 deferred loaders (lifted to explicit deps):
//     - `syncHomeSectionFromEmby(tab, deps)`    legacy.js:3035
//     - `initPlaylistTab(row, deps)`            legacy.js:3116
//     - `initHomeSectionTab(row, deps)`         legacy.js:3130
//     - `updateHseSectionAvailability(row, deps)` legacy.js:3234
//
// All functions here are re-types from `legacy.js` with no behavior
// change. No `any`. Module-scope deps are passed in via the typed
// deps interface or queried from the DOM.

import type { OriginalConfigStateRef } from '../state/state';
import type { HscUserLike } from './hscTab';
import { buildUserMultiSelectHtml, wireUserMultiSelect } from './users';

/**
 * One row in the home-section `<select class="selHseLibrary">` dropdown.
 * `id` is the library `ItemId` and `name` is the user-visible label.
 * Used for the hidden `<select>` that preserves the collection library
 * ID for `boxset`-type sections.
 */
export interface HseLibraryOption {
    id: string;
    name: string;
}

/**
 * Like {@link HseLibraryOption} but with an extra `isTopList` flag that
 * drives the legacy "auto-exclude top-list libraries" default for new
 * `items`-type sections. Used to render hidden `chkHseLibrary`
 * checkboxes that back `ExcludeUserViewIds`.
 */
export interface HseLibraryWithFlag extends HseLibraryOption {
    isTopList: boolean;
}

/**
 * The persisted shape of a home section's settings, encoded into the
 * row's `data-hse-settings` attribute. The function only reads the
 * handful of fields it actually emits back as form values; unknown
 * keys are ignored.
 */
export interface HseSavedSettings {
    SectionType?: string;
    DisplayMode?: string;
    ItemTypes?: string;
    CustomName?: string;
    ViewType?: string;
    ImageType?: string;
    SortBy?: string;
    SortOrder?: string;
    ScrollDirection?: string;
    _queryIsResumable?: string;
    _queryIsPlayed?: string;
    _queryExcludeViewIds?: string;
    [key: string]: string | undefined;
}

/**
 * Render the full home-section form HTML (Section Type, Display Mode,
 * Media Type, Custom Title, View Type, Image Type, Sort By/Order,
 * Scroll Direction, Playstate, hidden library selectors, and hidden
 * library-exclusion checkboxes).
 *
 * The signature is intentionally long: the function is a verbatim
 * extraction of `legacy.js:2847` and every input drives a distinct
 * branch of the rendered HTML. Wiring it through Phase 5's
 * shared-state extraction will be straightforward — every input is a
 * value-shaped argument, no closures.
 *
 * Quirks worth pinning:
 *
 *   - The "Section Type" dropdown's options are gated by `collEnabled`,
 *     `tagEnabled`, and `viewerOnly`. When none of those flags are set
 *     the function emits an empty `<select>` (still wrapped in the
 *     outer `<div>`).
 *
 *   - `CustomName` is embedded un-escaped into a `placeholder="…"`
 *     attribute, with `"` → `&quot;` only. Callers are trusted.
 *
 *   - `ViewType === 'cards'` is migrated to `''` (Emby's native
 *     default for Cards view).
 *
 *   - The hidden library selectors always render: an empty
 *     `<select class="selHseLibrary">` for `boxset` mode and, for
 *     `items` mode, hidden checkboxes (`chkHseLibrary`) for every
 *     library in `allLibraries`. The checkboxes are pre-checked except
 *     for top-list libraries — but only when `_queryExcludeViewIds` is
 *     empty (i.e. a brand-new section; legacy migration rule).
 *
 * @param savedSettings   Persisted settings (the row's
 *                        `data-hse-settings` JSON, decoded).
 * @param defaultSectionType  Fallback `SectionType` if `savedSettings`
 *                        has none. `'items'` or `'boxset'`.
 * @param defaultName     Placeholder for `CustomName` when no saved
 *                        value exists. The user's display name.
 * @param tagEnabled      Whether "Apply Tag" is enabled on the parent
 *                        row. Gates the `'items'` Section Type option.
 * @param collEnabled     Whether "Create Collection" is enabled. Gates
 *                        the `'boxset'` Section Type option.
 * @param libraryOptions  Visible libraries for the hidden `boxset`
 *                        selector. Empty for `items`-only rows.
 * @param savedLibraryId  Currently-selected library id; `'auto'` means
 *                        "let Emby decide".
 * @param allLibraries    All libraries, with `isTopList` flags, for
 *                        the hidden `chkHseLibrary` exclusion list.
 * @param viewerOnly      True for a MediaInfo row whose filters are
 *                        per-user; gates the `'items'` option when
 *                        `tagEnabled` is false.
 * @returns               Concatenated HTML string for the form.
 */
export function buildHomeSectionFormHtml(
    savedSettings: HseSavedSettings | null | undefined,
    defaultSectionType: string,
    defaultName: string,
    tagEnabled: boolean,
    collEnabled: boolean,
    libraryOptions: readonly HseLibraryOption[] | null | undefined,
    savedLibraryId: string,
    allLibraries: readonly HseLibraryWithFlag[] | null | undefined,
    viewerOnly: boolean,
): string {
    const s = savedSettings || {};
    let html = '';

    const st = s.SectionType || defaultSectionType || (collEnabled ? 'boxset' : 'items');
    html += '<div style="margin-bottom:12px;"><label class="selectLabel">Section Type</label>';
    html += '<select is="emby-select" class="selHseSectionType hse-field-str" data-field="SectionType" style="width:100%;">';
    const sectionTypeOptions: Array<readonly [string, string]> = [];
    if (collEnabled) sectionTypeOptions.push(['boxset', 'Single Collection']);
    if (tagEnabled)  sectionTypeOptions.push(['items',  'Dynamic Media (tag)']);
    else if (viewerOnly) sectionTypeOptions.push(['items', 'Dynamic Media (per user)']);
    sectionTypeOptions.forEach((o) => {
        html += '<option value="' + o[0] + '"' + (st === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    html += '</select></div>';

    const displayModeVal = s.DisplayMode || '';
    html += '<div style="margin-bottom:12px;"><label class="selectLabel">Show this section</label>';
    html += '<select is="emby-select" class="hse-field-str" data-field="DisplayMode" style="width:100%;">';
    html += '<option value=""'              + (displayModeVal === ''               ? ' selected' : '') + '>Always</option>';
    html += '<option value="tv"'            + (displayModeVal === 'tv'             ? ' selected' : '') + '>When TV Display Mode is on</option>';
    html += '<option value="mobile,desktop"'+ (displayModeVal === 'mobile,desktop' ? ' selected' : '') + '>When TV Display Mode is off</option>';
    html += '</select></div>';

    let savedItemTypes: string[] = [];
    try { savedItemTypes = JSON.parse(s.ItemTypes || '[]'); } catch { /* swallow malformed JSON */ }
    const savedItemTypesStr = savedItemTypes.length > 0 ? savedItemTypes.join(',') : 'Movie,Series';
    html += '<div class="hse-items-only" style="margin-bottom:12px;"><label class="selectLabel">Media Type</label>';
    html += '<select is="emby-select" class="selHseItemTypes" style="width:100%;">';
    const itemTypeOptions: Array<readonly [string, string]> = [
        ['Movie',        'Movies'],
        ['Series',       'Shows'],
        ['Movie,Series', 'Movies & Shows'],
        ['Episode',      'Episodes'],
        ['BoxSet',       'Collections'],
        ['MusicVideo',   'Music Videos'],
        ['Video',        'Videos'],
        ['Photo',        'Photos'],
        ['Program',      'Programs'],
        ['TvChannel',    'Live TV Channels'],
        ['MusicAlbum',   'Music Albums'],
        ['MusicArtist',  'Artists'],
        ['Audio',        'Songs'],
        ['AudioBook',    'Audiobooks'],
        ['Trailer',      'Trailers'],
        ['Game',         'Games'],
        ['Book',         'Books'],
    ];
    itemTypeOptions.forEach((o) => {
        html += '<option value="' + o[0] + '"' + (savedItemTypesStr === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    html += '</select></div>';

    const customName = (s.CustomName || '').replace(/"/g, '&quot;');
    const customNamePlaceholder = (defaultName || '').replace(/"/g, '&quot;');
    html += '<div style="margin-bottom:12px;"><input is="emby-input" type="text" class="hse-field-str" data-field="CustomName" label="Custom Title" value="' + customName + '" placeholder="' + customNamePlaceholder + '"/></div>';

    // Emby native uses "" for Cards (default); migrate old stored "cards" value
    const viewTypeVal = (s.ViewType === 'cards' ? '' : s.ViewType) || '';
    html += '<div class="hse-items-only" style="margin-bottom:12px;"><label class="selectLabel">View Type</label>';
    html += '<select is="emby-select" class="selHseViewType hse-field-str" data-field="ViewType" style="width:100%;">';
    [['', 'Cards (default)'], ['spotlight', 'Spotlight']].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (viewTypeVal === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    html += '</select></div>';

    const imgTypeVal = s.ImageType || '';
    const imgTypeDisabled = viewTypeVal === 'spotlight';
    html += '<div style="margin-bottom:12px;"><label class="selectLabel">Image Type</label>';
    html += '<select is="emby-select" class="selHseImageType hse-field-str" data-field="ImageType" style="width:100%;"' + (imgTypeDisabled ? ' disabled' : '') + '><option value=""' + (imgTypeVal === '' ? ' selected' : '') + '>Auto</option>';
    ['Primary', 'Thumb'].forEach((o) => {
        html += '<option value="' + o + '"' + (imgTypeVal === o ? ' selected' : '') + '>' + o + '</option>';
    });
    html += '</select></div>';

    const sortByVal = s.SortBy || '';
    html += '<div style="margin-bottom:12px;"><label class="selectLabel">Sort By</label>';
    html += '<select is="emby-select" class="hse-field-str" data-field="SortBy" style="width:100%;">';
    html += '<option value=""' + (sortByVal === '' ? ' selected' : '') + '>(Default)</option>';
    [
        ['CommunityRating,SortName',             'Rating'],
        ['DateCreated,SortName',                 'Date Added'],
        ['SortName',                             'Name'],
        ['Runtime,SortName',                     'Runtime'],
        ['ProductionYear,PremiereDate,SortName', 'Release Date'],
        ['ProductionYear,SortName',              'Year'],
        ['DatePlayed,SortName',                  'Last Played (per user)'],
        ['Random',                               'Random'],
    ].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (sortByVal === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    html += '</select></div>';

    const sortOrderVal = s.SortOrder || '';
    html += '<div style="margin-bottom:12px;"><label class="selectLabel">Sort Order</label>';
    html += '<select is="emby-select" class="hse-field-str" data-field="SortOrder" style="width:100%;">';
    html += '<option value=""' + (sortOrderVal === '' ? ' selected' : '') + '>(Default)</option>';
    [['Ascending', 'Ascending'], ['Descending', 'Descending']].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (sortOrderVal === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    html += '</select></div>';

    const dispModeVal = s.ScrollDirection || '';
    html += '<div style="margin-bottom:12px;"><label class="selectLabel">Scroll Direction</label>';
    html += '<select is="emby-select" class="hse-field-str" data-field="ScrollDirection" style="width:100%;"><option value="">(Auto)</option>';
    [['Horizontal', 'Horizontal'], ['Vertical', 'Vertical']].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (dispModeVal === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    html += '</select></div>';

    let playstateVal = '';
    if (s._queryIsResumable === 'true') playstateVal = 'inprogress';
    else if (s._queryIsPlayed === 'true') playstateVal = 'played';
    else if (s._queryIsPlayed === 'false') playstateVal = 'unplayed';
    html += '<div class="hse-items-only" style="margin-bottom:12px;"><label class="selectLabel">Playstate (per user)</label>';
    html += '<select is="emby-select" class="hse-field-str" data-field="_hsePlaystate" style="width:100%;">';
    html += '<option value=""' + (playstateVal === '' ? ' selected' : '') + '>Any</option>';
    [['played', 'Played'], ['unplayed', 'Unplayed'], ['inprogress', 'In progress (started, not finished)']].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (playstateVal === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    html += '</select></div>';

    // Hidden library selector — used only for boxset type (preserves the collection library ID).
    const curLibId = savedLibraryId || 'auto';
    html += '<select class="selHseLibrary" style="display:none;">';
    html += '<option value="auto"' + (curLibId === 'auto' ? ' selected' : '') + '>auto</option>';
    (libraryOptions || []).forEach((lib) => {
        html += '<option value="' + lib.id + '"' + (curLibId === lib.id ? ' selected' : '') + '>' + lib.name + '</option>';
    });
    html += '</select>';

    // Multi-library checkboxes for items type.
    // Excluded IDs are stored in HomeSectionSettings._queryExcludeViewIds → Query.ExcludeUserViewIds in Emby.
    // Checked = include (not excluded), unchecked = exclude.
    if (st !== 'boxset' && (allLibraries || []).length > 0) {
        const excludedIds = new Set<string>();
        try {
            const raw = (s._queryExcludeViewIds || '').split(',').map((x) => x.trim()).filter((x) => x.length > 0);
            raw.forEach((id) => { excludedIds.add(id); });
        } catch { /* swallow malformed CSV */ }
        // If no explicit exclusions have been saved (new section or legacy),
        // exclude all top-list libraries. Backwards-compatible: existing
        // groups without _queryExcludeViewIds get top-list auto-unchecked.
        if (excludedIds.size === 0) {
            (allLibraries || []).forEach((lib) => {
                if (lib.isTopList) excludedIds.add(lib.id);
            });
        }
        // Hidden checkboxes — library exclusions managed automatically under the hood
        html += '<div style="display:none;">';
        (allLibraries || []).forEach((lib) => {
            const isChecked = !excludedIds.has(lib.id);
            html += '<input type="checkbox" class="chkHseLibrary" value="' + lib.id + '"' + (isChecked ? ' checked' : '') + '/>';
        });
        html += '</div>';
    }

    return html;
}

/**
 * Show / hide every `.hse-items-only` element under `tab` based on
 * whether the current Section Type is *not* `boxset`.
 *
 * The helper is silent when the section-type `<select>` is absent
 * (treated as `'items'`), so a half-rendered tab stays usable.
 *
 * @param tab  The home-section container. Either a `<div
 *             class="homescreen-tab">` or any ancestor that contains
 *             the relevant descendants.
 */
export function updateHseItemsOnlyVisibility(tab: Element): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    const isItems = !stSel || stSel.value !== 'boxset';
    tab.querySelectorAll('.hse-items-only').forEach((el) => {
        (el as HTMLElement).style.display = isItems ? '' : 'none';
    });
}

/**
 * Disable / enable the Image Type `<select>` based on whether the
 * current View Type is `Cards` (or default `''`). Spotlight view
 * always allows image-type selection; items-type + non-cards view
 * disables it (Emby's Query has no ImageType there).
 *
 * Silent when the Image Type `<select>` is absent.
 *
 * @param tab  The home-section container.
 */
export function updateHseImageTypeState(tab: Element): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    const vtSel = tab.querySelector('.selHseViewType') as HTMLSelectElement | null;
    const imgSel = tab.querySelector('.selHseImageType') as HTMLSelectElement | null;
    if (!imgSel) return;
    const isItems = !stSel || stSel.value !== 'boxset';
    const isCards = !vtSel || vtSel.value === '' || vtSel.value === 'cards';
    imgSel.disabled = isItems && !isCards;
}

/**
 * Attach `change` listeners to the Section Type and View Type
 * `<select>` elements inside `tab`. The listeners call back into
 * {@link updateHseItemsOnlyVisibility} and {@link updateHseImageTypeState}
 * so the form stays in sync with what the user picks. Also fires
 * both visibility updates once up-front so the initial state matches
 * the saved values.
 *
 * Silent when the Section Type `<select>` is absent (the form has not
 * yet been rendered into `tab`).
 *
 * @param tab  The home-section container.
 */
export function wireHomeSectionTypeChange(tab: Element): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    if (!stSel) return;
    updateHseItemsOnlyVisibility(tab);
    updateHseImageTypeState(tab);
    stSel.addEventListener('change', () => {
        updateHseItemsOnlyVisibility(tab);
        updateHseImageTypeState(tab);
    });
    const vtSel = tab.querySelector('.selHseViewType') as HTMLSelectElement | null;
    if (vtSel) {
        vtSel.addEventListener('change', () => {
            updateHseImageTypeState(tab);
        });
    }
}

/**
 * A single media-info filter group from a tag row's `MediaInfoFilters`
 * (or the legacy single-group `MediaInfoConditions` array). The
 * function only inspects `Criteria`, so the field type is `unknown`
 * here — the legacy code does its own ad-hoc string parsing.
 */
export interface HseMediaInfoFilterGroupLike {
    Criteria?: readonly unknown[];
}

/**
 * A tag-row configuration shape, narrowed to the fields this module
 * reads. The full `TagConfig` is much richer; only the filter-related
 * keys are surfaced here so we don't have to drag the whole DTO type
 * into a leaf module.
 */
export interface TagConfigForFilters {
    MediaInfoFilters?: readonly HseMediaInfoFilterGroupLike[];
    MediaInfoConditions?: readonly string[];
}

/**
 * Decide whether a *config-object* `tagConfig` has a viewer-dependent
 * (per-user) filter — either the literal `InProgress` shorthand or a
 * criterion containing `':__current__:'`.
 *
 * Used at render time (`renderTagGroup`, `legacy.js:3217`) and as a
 * peer to {@link rowHasViewerCriteria} (which does the same check
 * against a live DOM row). The two intentionally differ: this one
 * reads the persisted config (for re-rendering from saved data), the
 * other reads the live DOM (for unsaved inline edits).
 *
 * The `!` prefix on a criterion is stripped before inspection because
 * the legacy parser treats `!InProgress` identically to `InProgress`
 * for our "is this a viewer criterion?" check.
 *
 * @param tagConfig  The row's persisted configuration. Falsy → `false`.
 * @returns          `true` if any criterion in any filter group is a
 *                   viewer criterion.
 */
export function tagConfigHasViewerCriteria(tagConfig: TagConfigForFilters | null | undefined): boolean {
    if (!tagConfig) return false;
    const filters: readonly HseMediaInfoFilterGroupLike[] =
        (tagConfig.MediaInfoFilters && tagConfig.MediaInfoFilters.length > 0)
            ? tagConfig.MediaInfoFilters
            : ((tagConfig.MediaInfoConditions && tagConfig.MediaInfoConditions.length > 0)
                ? [{ Criteria: tagConfig.MediaInfoConditions }]
                : []);
    let found = false;
    filters.forEach((f) => {
        (f.Criteria || []).forEach((c) => {
            const raw = String(c);
            const s = raw.charAt(0) === '!' ? raw.slice(1) : raw;
            if (s === 'InProgress' || s.indexOf(':__current__:') >= 0) found = true;
        });
    });
    return found;
}

/**
 * Decide whether a *live DOM* `row` has a viewer-dependent filter.
 * Inspects each `.mi-rule` inside `row` and looks at:
 *
 *   - `.selMiProperty` whose value is `'InProgress'`
 *   - `.selMiUser` whose value is `'__current__'`
 *
 * The dual-condition mirrors {@link tagConfigHasViewerCriteria}: the
 * per-user criterion can come from the prop dropdown *or* the
 * explicit-user dropdown, and the UI stores both shapes.
 *
 * @param row  A `.tag-row` element (or any element containing
 *             `.mi-rule` descendants).
 * @returns    `true` if any rule qualifies as viewer-dependent.
 */
export function rowHasViewerCriteria(row: Element): boolean {
    let found = false;
    row.querySelectorAll('.mi-rule').forEach((rule) => {
        const propEl = rule.querySelector('.selMiProperty') as HTMLSelectElement | null;
        const prop = (propEl?.value) || '';
        const selUserEl = rule.querySelector('.selMiUser') as HTMLSelectElement | null;
        if (prop === 'InProgress' || (selUserEl && selUserEl.value === '__current__')) found = true;
    });
    return found;
}

/**
 * Rebuild the Section Type `<select>` so its options match the row's
 * current `tagEnabled` / `collEnabled` / `viewerOnly` flags, then
 * preserve the previously selected value if it's still valid.
 *
 * The `<select>`'s options are:
 *   - `'boxset'` (`Single Collection`) if `collEnabled` is true.
 *   - `'items'` (`Dynamic Media (tag)` or `Dynamic Media (per user)`)
 *     if `tagEnabled` is true *or* `viewerOnly` is true.
 *
 * When the previous selection is no longer a valid option the
 * `<select>`'s `value` falls back to the browser default (first
 * option). {@link updateHseItemsOnlyVisibility} is invoked once at the
 * end so the dependents stay in sync.
 *
 * Silent when the Section Type `<select>` is absent.
 *
 * @param tab          The home-section container.
 * @param tagEnabled   Whether "Apply Tag" is enabled on the parent row.
 * @param collEnabled  Whether "Create Collection" is enabled.
 * @param viewerOnly   Whether this is a MediaInfo row with per-user filters.
 */
export function refreshHseSectionTypeOptions(
    tab: Element,
    tagEnabled: boolean,
    collEnabled: boolean,
    viewerOnly: boolean,
): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    if (!stSel) return;
    const currentVal = stSel.value;
    stSel.innerHTML = '';
    if (collEnabled) {
        const o1 = document.createElement('option');
        o1.value = 'boxset';
        o1.textContent = 'Single Collection';
        stSel.appendChild(o1);
    }
    if (tagEnabled || viewerOnly) {
        const o2 = document.createElement('option');
        o2.value = 'items';
        o2.textContent = (viewerOnly && !tagEnabled) ? 'Dynamic Media (per user)' : 'Dynamic Media (tag)';
        stSel.appendChild(o2);
    }
    const stillValid = Array.from(stSel.options).some((o) => o.value === currentVal);
    if (stillValid) stSel.value = currentVal;
    updateHseItemsOnlyVisibility(tab);
}

// ─── Phase 5 deferred helpers (legacy.js:3035–3260) ─────────────────────────

/**
 * Minimal slice of the Jellyfin `ApiClient` surface consumed by
 * {@link syncHomeSectionFromEmby}. Mirrors `ManageApiClient` in
 * `manageTab.ts` plus a `getJSON` method kept for symmetry with
 * `HseUsersApiClient` (the live sync path uses `fetch` directly).
 */
export interface HomeSectionApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON(name: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Dependencies for {@link syncHomeSectionFromEmby}. Replaces the
 * legacy module-scope `window.ApiClient` and the global `fetch`.
 */
export interface SyncHomeSectionDeps {
    readonly fetch: typeof fetch;
    readonly getApiClient: () => HomeSectionApiClient;
}

/**
 * Dependencies for {@link initPlaylistTab}. The `getHseUsers` getter
 * is the bound form (factory wires `HseUsersDeps` once and passes the
 * resulting `() => Promise<HscUserLike[]>` here).
 */
export interface InitPlaylistTabDeps {
    readonly getHseUsers: () => Promise<HscUserLike[]>;
    readonly buildUserMultiSelectHtml: (
        users: readonly HscUserLike[],
        selectedIds: readonly string[],
        checkboxClass: string,
    ) => string;
    readonly wireUserMultiSelect: (container: Element | null) => void;
}

/**
 * One server-side `VirtualFolders` entry as returned by
 * `Library/VirtualFolders`. The legacy code reads `ItemId`, `Name`,
 * and `Locations[]`; other fields pass through untouched.
 */
interface VirtualFolderLike {
    readonly ItemId: string;
    readonly Name: string;
    readonly Locations?: readonly string[];
    readonly [k: string]: unknown;
}

/**
 * Dependencies for {@link initHomeSectionTab}. Inherits the user-list
 * helpers from {@link InitPlaylistTabDeps}, then adds the stateful
 * loaders (`preFetchLibraryData`), the live-section sync, the
 * `originalConfigState` ref, and the factory-bound
 * `getUiConfig` / `checkFormState` closures. `syncHomeSectionFromEmby`
 * is bound at the factory to its own `SyncHomeSectionDeps` so this
 * deps surface stays flat.
 */
export interface InitHomeSectionTabDeps extends InitPlaylistTabDeps {
    readonly preFetchLibraryData: () => Promise<unknown>;
    readonly syncHomeSectionFromEmby: (
        tab: HTMLElement,
        syncDeps: SyncHomeSectionDeps,
    ) => Promise<void>;
    readonly getUiConfig: (view: HTMLElement, forComparison: boolean) => unknown;
    readonly checkFormState: () => void;
    readonly originalConfigState: OriginalConfigStateRef;
}

/**
 * Dependencies for {@link updateHseSectionAvailability}. `updateBadges`
 * is a closure defined inside the lifted `setupRowEvents`; until that
 * function is extracted, callers stub it via deps.
 */
export interface UpdateHseSectionAvailabilityDeps {
    readonly rowHasViewerCriteria: (row: HTMLElement) => boolean;
    readonly refreshHseSectionTypeOptions: (
        tab: HTMLElement,
        tagEnabled: boolean,
        collEnabled: boolean,
        viewerOnly: boolean,
    ) => void;
    readonly updateBadges: (row: HTMLElement) => void;
}

/**
 * Sync the home-section tab's form values with the live `ContentSection`
 * from Emby (legacy.js:3035–3112).
 *
 *   1. Reads `tab.dataset.hseTracked` (URL-encoded JSON) and picks the
 *      first entry whose `SectionId` does NOT start with `hsc__` (the
 *      plugin-internal sentinel for synthetic rows). No matching entry
 *      → resolves to `Promise.resolve()` with no DOM touches.
 *   2. Builds the headers (with `X-Emby-Token` when a token exists)
 *      and the URL via `ApiClient.getUrl`, then `fetch`es
 *      `HomeScreenCompanion/Hsc/UserSections?UserId=<entry.UserId>`.
 *   3. On a 200 response, maps the matching section's fields into the
 *      tab's `[data-field="…"]` controls:
 *        - `SELECT` elements have their `selectedIndex` set to the
 *          matching option (when present);
 *        - non-SELECT elements get `el.value = val`.
 *      The `_hsePlaystate` field is derived from `section.Query`
 *      (`IsResumable` → `inprogress`, `IsPlayed === true` → `played`,
 *      `IsUnplayed === true` / `IsPlayed === false` → `unplayed`).
 *   4. Syncs `.selHseItemTypes` from `section.ItemTypes.join(',')` and
 *      every `.chkHseLibrary` from `section.ExcludedFolders` (a
 *      missing `ExcludedFolders` array leaves the checkboxes alone —
 *      legacy quirk).
 *   5. Calls {@link updateHseItemsOnlyVisibility} and
 *      {@link updateHseImageTypeState} to refresh the dependent
 *      visibility state.
 *
 * Network errors are swallowed by the trailing `.catch(function () { return undefined; })`.
 *
 * @param tab  The home-section container (`.homescreen-tab`).
 * @param deps See {@link SyncHomeSectionDeps}.
 * @returns    A promise that resolves when the sync is complete (or
 *             immediately when no tracked section exists).
 */
export function syncHomeSectionFromEmby(
    tab: HTMLElement,
    deps: SyncHomeSectionDeps,
): Promise<void> {
    const tracked: Array<{ SectionId?: string; UserId?: string }> = [];
    try {
        tracked.push(...JSON.parse(decodeURIComponent(tab.dataset.hseTracked || '%5B%5D')));
    } catch { /* swallow malformed JSON */ }
    const entry = tracked.find((t) => t.SectionId && !t.SectionId.startsWith('hsc__'));
    if (!entry || !entry.UserId) return Promise.resolve();

    const syncHeaders: Record<string, string> = {};
    const syncToken = deps.getApiClient().accessToken();
    if (syncToken) syncHeaders['X-Emby-Token'] = syncToken;
    const syncUrl = deps.getApiClient().getUrl('HomeScreenCompanion/Hsc/UserSections', { UserId: entry.UserId });

    return deps.fetch(syncUrl, { headers: syncHeaders })
        .then((r) => r.json())
        .then((data) => {
            const payload = (data && typeof data === 'object') ? data as { Sections?: Array<Record<string, unknown>> } : null;
            const sections = payload?.Sections || [];
            const section = sections.find((s) => s && s['Id'] === entry.SectionId);
            if (!section) return;

            const query = (section['Query'] && typeof section['Query'] === 'object')
                ? section['Query'] as { IsResumable?: unknown; IsPlayed?: unknown; IsUnplayed?: unknown }
                : null;
            const sd = section['ScrollDirection'];
            const fieldMap: Record<string, string> = {
                SectionType: String(section['SectionType'] || ''),
                CustomName: String(section['CustomName'] || ''),
                DisplayMode: String(section['DisplayMode'] || ''),
                ViewType: String(section['ViewType'] || ''),
                ImageType: String(section['ImageType'] || ''),
                SortBy: String(section['SortBy'] || ''),
                SortOrder: String(section['SortOrder'] || ''),
                ScrollDirection:
                    sd === null || sd === undefined ? '' :
                    typeof sd === 'number' ? (sd === 0 ? 'Horizontal' : sd === 1 ? 'Vertical' : '') :
                    String(sd),
                _hsePlaystate:
                    query?.IsResumable === true ? 'inprogress' :
                    query?.IsPlayed === true ? 'played' :
                    (query?.IsUnplayed === true || query?.IsPlayed === false) ? 'unplayed' :
                    '',
            };

            Object.keys(fieldMap).forEach((field) => {
                const el = tab.querySelector<HTMLElement>(`[data-field="${field}"]`);
                if (!el) return;
                const val = fieldMap[field]!;
                if (el.tagName === 'SELECT') {
                    const sel = el as HTMLSelectElement;
                    for (let i = 0; i < sel.options.length; i++) {
                        if (sel.options[i]!.value === val) { sel.selectedIndex = i; break; }
                    }
                } else {
                    (el as HTMLInputElement).value = val;
                }
            });

            const itemTypesSel = tab.querySelector<HTMLSelectElement>('.selHseItemTypes');
            if (itemTypesSel && Array.isArray(section['ItemTypes']) && (section['ItemTypes'] as unknown[]).length > 0) {
                const itemTypesStr = (section['ItemTypes'] as unknown[]).map(String).join(',');
                for (let i = 0; i < itemTypesSel.options.length; i++) {
                    if (itemTypesSel.options[i]!.value === itemTypesStr) { itemTypesSel.options[i]!.selected = true; break; }
                }
            }

            if (Array.isArray(section['ExcludedFolders'])) {
                const embyExcluded = new Set((section['ExcludedFolders'] as unknown[]).map((id) => String(id)));
                tab.querySelectorAll<HTMLInputElement>('.chkHseLibrary').forEach((chk) => {
                    chk.checked = !embyExcluded.has(chk.value);
                });
            }

            updateHseItemsOnlyVisibility(tab);
            updateHseImageTypeState(tab);
        })
        .catch(() => undefined);
}

/**
 * Wire the playlist sub-tab's user-list dropdown (legacy.js:3116–3128).
 *
 * Idempotent: short-circuits when the `.playlist-tab` is absent or
 * already loaded (flagged via `dataset.plLoaded === '1'`). On first
 * invocation, resolves the Emby user list via `deps.getHseUsers()`,
 * renders the dropdown into `.playlist-user-list` via
 * {@link buildUserMultiSelectHtml}, and wires its listeners via
 * {@link wireUserMultiSelect}. The pre-selected user IDs come from
 * the URL-encoded `dataset.plUserids` JSON.
 *
 * @param row  The tag-row element containing the `.playlist-tab`.
 * @param deps See {@link InitPlaylistTabDeps}.
 */
export function initPlaylistTab(row: HTMLElement, deps: InitPlaylistTabDeps): void {
    const tab = row.querySelector<HTMLElement>('.playlist-tab');
    if (!tab || tab.dataset.plLoaded === '1') return;
    tab.dataset.plLoaded = '1';
    let savedUserIds: string[] = [];
    try {
        savedUserIds = JSON.parse(decodeURIComponent(tab.dataset.plUserids || '%5B%5D')) as string[];
    } catch { /* swallow malformed JSON */ }
    deps.getHseUsers().then((users) => {
        const listEl = tab.querySelector<HTMLElement>('.playlist-user-list');
        if (!listEl) return;
        listEl.innerHTML = deps.buildUserMultiSelectHtml(users, savedUserIds, 'chkPlaylistUser');
        deps.wireUserMultiSelect(listEl);
    });
}

/**
 * Wire the home-section sub-tab inside a tag row (legacy.js:3130–3203).
 *
 * Orchestrates four sub-loaders:
 *
 *   1. `getHseUsers()` → renders `.hse-user-list-inner` via
 *      {@link buildUserMultiSelectHtml} + {@link wireUserMultiSelect}.
 *   2. `preFetchLibraryData()` → builds two derived lists from the
 *      plugin's `TopList/List` and the global `Library/VirtualFolders`
 *      payloads: the hidden boxset `libraryOptions` (all non-top-list
 *      folders) and the `allLibraries` list (with `isTopList` flags)
 *      that drives `chkHseLibrary`.
 *   3. {@link buildHomeSectionFormHtml} + {@link wireHomeSectionTypeChange}
 *      paint the structured section-settings form into `.hse-fields-inner`
 *      and wire its Section/View Type listeners.
 *   4. {@link syncHomeSectionFromEmby} mirrors the live `ContentSection`
 *      from Emby into the freshly-rendered form. After the live sync,
 *      `originalConfigState` is re-anchored to the current DOM so the
 *      dirty state stays clean (only when the form was *not* already
 *      dirty before this tab opened). Finally
 *      `setTimeout(checkFormState, 0)` re-evaluates the save button.
 *
 * Idempotency / re-entry guards:
 *   - short-circuits when `.homescreen-tab` is absent or already
 *     loaded (`dataset.hseLoaded === '1'`);
 *   - sets `dataset.hseLoaded = 'loading'` while the loaders run so
 *     re-entry is blocked until `dataset.hseLoaded = '1'` is stamped
 *     after the form is in the DOM (so `getUiConfig` reads the form
 *     values, not the saved defaults);
 *   - on error, resets `dataset.hseLoaded = '0'` so the caller can
 *     retry.
 *
 * Quirks preserved verbatim:
 *   - the live `_hseView` reference is `document.querySelector('#HomeScreenCompanionConfigPage')`,
 *     matching the legacy closure (the factory-level `view` is *not*
 *     used here — only the global config-page root);
 *   - `defaultTagName = row.querySelector('.txtEntryLabel').value || row.querySelector('.txtTagName').value || ''`
 *     throws when `.txtEntryLabel` is missing (legacy contract — that
 *     input is always rendered);
 *   - `_wasAlreadyDirty` is captured BEFORE the form render so a
 *     user who already had unsaved changes does not get the new tab
 *     values silently swallowed by a baseline reset.
 *
 * @param row  The tag-row element containing the `.homescreen-tab`.
 * @param deps See {@link InitHomeSectionTabDeps}.
 */
export function initHomeSectionTab(row: HTMLElement, deps: InitHomeSectionTabDeps): void {
    const tab = row.querySelector<HTMLElement>('.homescreen-tab');
    if (!tab || tab.dataset.hseLoaded === '1') return;
    tab.dataset.hseLoaded = 'loading';

    let savedUserIds: string[] = [];
    let savedSettings: Record<string, unknown> = {};
    try {
        savedUserIds = JSON.parse(decodeURIComponent(tab.dataset.hseUserids || '%5B%5D')) as string[];
    } catch { /* swallow malformed JSON */ }
    try {
        savedSettings = JSON.parse(decodeURIComponent(tab.dataset.hseSettings || '%7B%7D')) as Record<string, unknown>;
    } catch { /* swallow malformed JSON */ }
    const defaultSectionType = tab.dataset.hseDefaultType || 'items';
    const savedLibraryId = decodeURIComponent(tab.dataset.hseLibraryid || 'auto');

    Promise.all([deps.getHseUsers(), deps.preFetchLibraryData()])
        .then((results) => {
            const users = results[0] as HscUserLike[];
            const libData = (results[1] && typeof results[1] === 'object')
                ? results[1] as { topListFolderNames: Set<string>; virtualFolders: readonly unknown[] }
                : { topListFolderNames: new Set<string>(), virtualFolders: [] as readonly unknown[] };
            const topListFolderNames = libData.topListFolderNames;
            const virtualFolders = (libData.virtualFolders || []) as readonly VirtualFolderLike[];

            const libraryOptions = virtualFolders
                .filter((f) => !(f.Locations || []).some((loc) => {
                    const parts = loc.replace(/\\/g, '/').split('/');
                    const folderName = parts[parts.length - 1] || parts[parts.length - 2] || '';
                    return topListFolderNames.has(folderName.toLowerCase());
                }))
                .map((f) => ({ id: f.ItemId, name: f.Name }));

            const allLibraries = virtualFolders.map((f) => {
                const isTopList = (f.Locations || []).some((loc) => {
                    const parts = loc.replace(/\\/g, '/').split('/');
                    const folderName = parts[parts.length - 1] || parts[parts.length - 2] || '';
                    return topListFolderNames.has(folderName.toLowerCase());
                });
                return { id: f.ItemId, name: f.Name, isTopList };
            });

            const userListEl = tab.querySelector<HTMLElement>('.hse-user-list-inner');
            if (userListEl) {
                userListEl.innerHTML = deps.buildUserMultiSelectHtml(users, savedUserIds, 'chkHseUser');
                deps.wireUserMultiSelect(userListEl);
            }

            const entryLabelEl = row.querySelector<HTMLInputElement>('.txtEntryLabel');
            const tagNameEl = row.querySelector<HTMLInputElement>('.txtTagName');
            const defaultTagName = (entryLabelEl?.value || tagNameEl?.value || '');
            const tagEnabled  = !!(row.querySelector<HTMLInputElement>('.chkEnableTag'))?.checked;
            const collEnabled = !!(row.querySelector<HTMLInputElement>('.chkEnableCollection'))?.checked;
            const selSourceType = row.querySelector<HTMLSelectElement>('.selSourceType');
            const viewerOnly  = (selSourceType?.value || '') === 'MediaInfo' && rowHasViewerCriteria(row);

            const hseView = document.querySelector<HTMLElement>('#HomeScreenCompanionConfigPage');
            const originalSnapshot = deps.originalConfigState.getOriginalConfigState();
            let wasAlreadyDirty = false;
            if (hseView && originalSnapshot) {
                try {
                    wasAlreadyDirty = JSON.stringify(deps.getUiConfig(hseView, true)) !== originalSnapshot;
                } catch { /* swallow stringify errors */ }
            }

            const fieldsEl = tab.querySelector<HTMLElement>('.hse-fields-inner');
            if (fieldsEl) {
                fieldsEl.innerHTML = buildHomeSectionFormHtml(
                    savedSettings as HseSavedSettings,
                    defaultSectionType,
                    defaultTagName,
                    tagEnabled,
                    collEnabled,
                    libraryOptions,
                    savedLibraryId,
                    allLibraries,
                    viewerOnly,
                );
            }
            wireHomeSectionTypeChange(tab);

            tab.dataset.hseLoaded = '1';

            deps.syncHomeSectionFromEmby(tab, {
                fetch: (typeof fetch !== 'undefined') ? fetch.bind(globalThis) : (() => Promise.reject(new Error('fetch unavailable'))) as typeof fetch,
                getApiClient: () => {
                    const ac = (typeof window !== 'undefined') ? (window as unknown as { ApiClient?: HomeSectionApiClient }).ApiClient : undefined;
                    if (ac) return ac;
                    return {
                        accessToken: () => '',
                        getUrl: (_name: string, _params?: Record<string, unknown>) => '',
                        getJSON: () => Promise.resolve({}),
                    };
                },
            }).then(() => {
                if (!wasAlreadyDirty && hseView && deps.originalConfigState.getOriginalConfigState()) {
                    try {
                        deps.originalConfigState.setOriginalConfigState(
                            JSON.stringify(deps.getUiConfig(hseView, true)),
                        );
                    } catch { /* swallow stringify errors */ }
                }
                setTimeout(deps.checkFormState, 0);
            });
        })
        .catch((e: unknown) => {
            const fieldsEl = tab.querySelector<HTMLElement>('.hse-fields-inner');
            if (fieldsEl) {
                const message = (e instanceof Error) ? e.message : String(e);
                fieldsEl.innerHTML = '<em style="color:#cc4444">Failed to load: ' + message + '</em>';
            }
            tab.dataset.hseLoaded = '0';
        });
}

/**
 * Toggle the Enable Home Section checkbox (and its hint copy) based on
 * whether any of the row's tag/collection/viewer-criteria inputs is
 * active (legacy.js:3234–3260).
 *
 *   - `tagEnabled || collEnabled || viewerOnly` is the gate;
 *   - when the gate is OFF the checkbox is disabled + unchecked, the
 *     `.hse-disabled-hint` block is shown, the `.hse-details` panel is
 *     hidden, and `deps.updateBadges(row)` is pinged;
 *   - when the gate is ON the checkbox is enabled and the hint is hidden;
 *   - if the `.homescreen-tab` is already loaded
 *     (`dataset.hseLoaded === '1'`), the Section Type options are
 *     refreshed via {@link refreshHseSectionTypeOptions} so they match
 *     the new flags.
 *
 * Short-circuits when `.chkEnableHomeSection` is absent.
 *
 * @param row  The tag-row element.
 * @param deps See {@link UpdateHseSectionAvailabilityDeps}.
 */
export function updateHseSectionAvailability(
    row: HTMLElement,
    deps: UpdateHseSectionAvailabilityDeps,
): void {
    const tagEnabled  = !!(row.querySelector<HTMLInputElement>('.chkEnableTag'))?.checked;
    const collEnabled = !!(row.querySelector<HTMLInputElement>('.chkEnableCollection'))?.checked;
    const selSourceType = row.querySelector<HTMLSelectElement>('.selSourceType');
    const isMediaInfo = (selSourceType?.value || '') === 'MediaInfo';
    const viewerOnly  = isMediaInfo && deps.rowHasViewerCriteria(row);
    const allowed = tagEnabled || collEnabled || viewerOnly;
    const hseCbx = row.querySelector<HTMLInputElement>('.chkEnableHomeSection');
    if (!hseCbx) return;

    const hint = row.querySelector<HTMLElement>('.hse-disabled-hint');
    if (!allowed) {
        hseCbx.disabled = true;
        hseCbx.checked = false;
        if (hint) hint.style.display = 'block';
        const hseDetails = row.querySelector<HTMLElement>('.hse-details');
        if (hseDetails) hseDetails.style.display = 'none';
        deps.updateBadges(row);
    } else {
        hseCbx.disabled = false;
        if (hint) hint.style.display = 'none';
    }

    const tab = row.querySelector<HTMLElement>('.homescreen-tab');
    if (tab && tab.dataset.hseLoaded === '1') {
        deps.refreshHseSectionTypeOptions(tab, tagEnabled, collEnabled, viewerOnly);
    }
}
