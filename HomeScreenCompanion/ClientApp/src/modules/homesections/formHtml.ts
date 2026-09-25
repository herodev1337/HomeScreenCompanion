// D4 (form.ts split): pure HTML-string builder for the home-section
// settings form. Extracted from `form.ts:42-300` (legacy.js:2847-3216).
//
// All escaping is routed through the canonical `escapeHtml` /
// `escapeAttr` helpers (C1 — unify HTML escaping).

import { escapeAttr, escapeHtml } from '../dom/dom';

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
 * branch of the rendered HTML.
 *
 * Quirks worth pinning:
 *
 *   - The "Section Type" dropdown's options are gated by `collEnabled`,
 *     `tagEnabled`, and `viewerOnly`. When none of those flags are set
 *     the function emits an empty `<select>` (still wrapped in the
 *     outer `<div>`).
 *
 *   - `CustomName` is escaped into the `value="…"` / `placeholder="…"`
 *     attributes via {@link escapeAttr} (C1 — unify HTML escaping).
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
    try { savedItemTypes = JSON.parse(s.ItemTypes || '[]') as string[]; } catch { /* swallow malformed JSON */ }
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

    const customName = escapeAttr(s.CustomName || '');
    const customNamePlaceholder = escapeAttr(defaultName || '');
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
        html += '<option value="' + escapeAttr(lib.id) + '"' + (curLibId === lib.id ? ' selected' : '') + '>' + escapeHtml(lib.name) + '</option>';
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
            html += '<input type="checkbox" class="chkHseLibrary" value="' + escapeAttr(lib.id) + '"' + (isChecked ? ' checked' : '') + '/>';
        });
        html += '</div>';
    }

    return html;
}
