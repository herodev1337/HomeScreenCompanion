// Phase 3 wave 3: home-section tab HTML builders + DOM/event helpers,
// leaf module extracted from `Configuration/configPage.js`
// (legacy.js:2847–3276).
//
// This file owns the home-section form rendering and the small bit of
// DOM-only wiring the tab needs when it does NOT depend on `ApiClient`
// or module-scope mutable state. Specifically:
//
//   Pure HTML builders (no closures):
//     - `buildHomeSectionFormHtml(...)`  legacy.js:2847
//     - `tagConfigHasViewerCriteria(...)` legacy.js:3217
//
//   DOM-read helpers (queries DOM, no closures):
//     - `rowHasViewerCriteria(row)`         legacy.js:3206
//     - `updateHseItemsOnlyVisibility(tab)` legacy.js:2998
//     - `updateHseImageTypeState(tab)`      legacy.js:3006
//     - `refreshHseSectionTypeOptions(...)` legacy.js:3262
//
//   DOM event wiring (queries DOM, attaches listeners, no closures):
//     - `wireHomeSectionTypeChange(tab)`    legacy.js:3016
//
// The remaining home-section helpers in legacy.js are DEFERRED to
// Phase 5 because they reach into mutable module-scope state:
//
//   - `syncHomeSectionFromEmby(tab)` — calls `window.ApiClient` +
//     `fetch` to load the live ContentSection from Emby.
//   - `initPlaylistTab(row)`         — chains `getHseUsers().then(...)`
//     which itself touches the module-scope `_hseUsersCache`.
//   - `initHomeSectionTab(row)`      — calls `getHseUsers`,
//     `preFetchLibraryData` (both stateful), then `originalConfigState`,
//     `getUiConfig`, and `checkFormState` (all module-scope).
//   - `updateHseSectionAvailability(row)` — calls `updateBadges`, a
//     closure defined inside `setupRowEvents` (stateful).
//
// All functions here are re-types from `legacy.js` with no behavior
// change. No `any`. Module-scope deps are passed in as arguments or
// queried from the DOM.

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
