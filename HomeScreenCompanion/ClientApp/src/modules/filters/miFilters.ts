// Phase 3: media-info filter HTML builders, leaf module.
//
// Helpers lifted verbatim from `Configuration/configPage.js`
// (legacy.js:1014-1255). The two pure builders here (`propertyOptionsHtml`,
// `getMiHintHtml`) read no module-scope state and no DOM; they take a
// primitive prop name and return a literal HTML string.
//
// The four remaining builders in this neighborhood are also extracted:
//
//   - `getMiValueHtml`            (legacy.js:1032) — per-property value
//                                  controls for one rule row.
//   - `getMediaInfoRuleHtml`      (legacy.js:1135) — one full rule row.
//   - `getMediaInfoFilterGroupHtml` (legacy.js:1155) — one filter group.
//   - `readMiFiltersFromContainer`  (legacy.js:1222) — DOM → group objects.
//
// The first three read mutable module-scope state in legacy.js —
// `_miUsers`, `cachedCollections`, `cachedPlaylists`, `cachedTags`
// (populated at legacy.js:6795-6804). Per the Phase-5 `HscDeps` pattern
// (see `modules/homesections/hscTab.ts`), that state is lifted to an
// explicit {@link MiFilterDeps} argument instead of a global:
//
//   - `users`        ⇐ legacy `_miUsers` (`null` until `getHseUsers` resolves)
//   - `collections`  ⇐ legacy `cachedCollections`
//   - `playlists`    ⇐ legacy `cachedPlaylists`
//   - `tags`         ⇐ legacy `cachedTags`
//
// `readMiFiltersFromContainer` reads only its DOM argument (plus the pure
// `buildCriterion`), so it takes no deps. It is the inverse of the three
// builders: whatever they emit, this reads back into
// `{Operator, Criteria, GroupOperator}` objects.
//
// The pure data tables (`MI_TEXT_MATCH_PROPS`, `MI_DROPDOWN_OPTIONS`, …)
// are module-scope `var`s in legacy.js. They are immutable and fold into
// this module as private constants — same data as legacy.js:928-946 and
// 1003-1012, keep in lock-step.

import { buildCriterion, migrateCommaSeparated, parseCriterion } from './criteria';
import type { MediaInfoFilterGroup } from './savedFilters';
import { escapeAttr, escapeHtml } from '../dom/dom';

const MI_TEXT_MATCH_PROPS: readonly string[] = [
    'Tag', 'Title', 'EpisodeTitle', 'Overview', 'Studio', 'Genre',
    'Actor', 'Director', 'Writer', 'ContentRating', 'AudioLanguage',
    'Artist', 'Album', 'FolderPath', 'Country',
];

/**
 * Per-prop dropdown value tables (legacy.js:928). A prop is a "dropdown"
 * prop iff it appears here. `getMiValueHtml` renders these as a
 * `<select class="selMiValue">`, with `MediaType` getting the extra
 * Episode-include-parent-series checkbox branch.
 */
const MI_DROPDOWN_OPTIONS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
    Resolution: [['8K', '8K (7680p+)'], ['4K', '4K / UHD'], ['1080p', '1080p / FHD'], ['720p', '720p / HD'], ['SD', 'SD (<720p)']],
    VideoCodec: [['HEVC', 'HEVC / H.265'], ['AV1', 'AV1'], ['H264', 'H.264 / AVC']],
    HDR: [['HDR', 'HDR (any)'], ['DolbyVision', 'Dolby Vision'], ['HDR10', 'HDR10']],
    AudioFormat: [['Atmos', 'Dolby Atmos'], ['TrueHD', 'Dolby TrueHD'], ['DtsHdMa', 'DTS-HD MA'], ['DTS', 'DTS'], ['AC3', 'Dolby Digital / AC3'], ['AAC', 'AAC']],
    AudioChannels: [['7.1', '7.1+ Surround'], ['5.1', '5.1 Surround'], ['Stereo', 'Stereo'], ['Mono', 'Mono']],
    MediaType: [['Movie', 'Movie'], ['Series', 'Show / Series'], ['Episode', 'Episode'], ['Audio', 'Music Track (Audio)'], ['MusicVideo', 'Music Video'], ['MusicAlbum', 'Music Album'], ['MusicArtist', 'Music Artist']],
    IsPlayed: [['Watched', 'Watched'], ['Unwatched', 'Unwatched']],
    InProgress: [['InProgress', 'In progress (started, not finished)']],
};

/**
 * Props rendered with an operator `<select class="selMiOp">` plus a
 * number input (legacy.js:938).
 */
const MI_NUMERIC_PROPS: readonly string[] = [
    'CommunityRating', 'Year', 'Runtime', 'DateAdded', 'DateModified',
    'FileSize', 'LastPlayed', 'PlayCount', 'BitRate', 'SampleRate',
    'BitsPerSample', 'TrackNumber', 'DiscNumber', 'WatchedByCount',
];

/**
 * Trailing unit label per numeric prop (legacy.js:939).
 */
const MI_UNIT_LABELS: Readonly<Record<string, string>> = {
    DateAdded: 'days ago', DateModified: 'days ago', LastPlayed: 'days ago',
    FileSize: 'MB', PlayCount: 'plays', BitRate: 'kbps', SampleRate: 'Hz',
    BitsPerSample: 'bits', WatchedByCount: 'users',
};

/**
 * Props that additionally render a user `<select class="selMiUser">`
 * (legacy.js:940).
 */
const MI_USER_PROPS: readonly string[] = ['IsPlayed', 'LastPlayed', 'PlayCount'];

/**
 * Default text-match op per text prop (legacy.js:942).
 */
const MI_TEXT_MATCH_DEFAULT: Readonly<Record<string, string>> = {
    Title: 'contains', EpisodeTitle: 'contains', Overview: 'contains', Studio: 'contains', Genre: 'contains', Tag: 'contains',
    Actor: 'exact', Director: 'exact', Writer: 'exact', Artist: 'contains', Album: 'contains',
    ContentRating: 'exact', AudioLanguage: 'exact', FolderPath: 'contains', Country: 'contains',
};

/**
 * Free-text placeholder per text prop (legacy.js:1003).
 */
const MI_TEXT_PLACEHOLDERS: Readonly<Record<string, string>> = {
    Title: 'e.g. Batman, Dark Knight', EpisodeTitle: 'e.g. Pilot, Finale', Overview: 'e.g. heist, time travel',
    Studio: 'e.g. Warner, Netflix, HBO', Genre: 'e.g. Action, Thriller',
    Actor: 'e.g. Tom Hanks, Idris Elba', Director: 'e.g. Nolan, Tarantino', Writer: 'e.g. Tarantino, Nolan',
    ContentRating: 'e.g. PG-13, R', AudioLanguage: 'e.g. eng, swe', ImdbId: 'e.g. tt1234567, tt7654321',
    TvdbId: 'e.g. 121361',
    FolderPath: 'e.g. /movies/action',
    Country: 'e.g. United States',
    Artist: 'e.g. Radiohead, Pink Floyd', Album: 'e.g. OK Computer, Dark Side of the Moon',
};

/**
 * The prop groups rendered into the `<select class="selMiProperty">`
 * dropdown inside a media-info rule row. The order matches the legacy
 * code at `configPage.js:1015-1022` exactly: Video, Audio, Content,
 * Music, Metrics, Activity. Within each group the order is the order
 * the items appear in the `<select>`.
 *
 * Each tuple is `[value, label]`:
 *   - `value` is the prop name used by the criterion (e.g. `"Resolution"`).
 *   - `label` is the human-readable text shown in the dropdown.
 */
const PROPERTY_GROUPS: ReadonlyArray<{
    readonly label: string;
    readonly props: ReadonlyArray<readonly [string, string]>;
}> = [
    { label: 'Video', props: [['Resolution', 'Resolution'], ['VideoCodec', 'Video Codec'], ['HDR', 'HDR']] },
    { label: 'Audio', props: [['AudioFormat', 'Audio Format'], ['AudioChannels', 'Audio Channels'], ['AudioLanguage', 'Audio Language']] },
    { label: 'Content', props: [
        ['MediaType', 'Media Type'], ['Tag', 'Tag'], ['Title', 'Title'], ['EpisodeTitle', 'Title (Episode)'],
        ['Overview', 'Overview'], ['Studio', 'Studio'], ['Genre', 'Genre'], ['Actor', 'Actor / Cast'],
        ['Director', 'Director'], ['Writer', 'Writer'], ['ContentRating', 'Content Rating'],
        ['ImdbId', 'IMDB ID'], ['TvdbId', 'TVDB ID'], ['Country', 'Country'],
        ['Collection', 'In Collection'], ['Playlist', 'In Playlist'],
    ] },
    { label: 'Music', props: [
        ['Artist', 'Artist'], ['Album', 'Album'], ['BitRate', 'Bit Rate (kbps)'],
        ['SampleRate', 'Sample Rate (Hz)'], ['BitsPerSample', 'Bit Depth'],
        ['TrackNumber', 'Track Number'], ['DiscNumber', 'Disc Number'],
    ] },
    { label: 'Metrics', props: [
        ['CommunityRating', 'Community Rating'], ['Year', 'Year'], ['Runtime', 'Runtime (minutes)'],
        ['DateAdded', 'Date Added'], ['DateModified', 'Date Modified'],
        ['FileSize', 'File Size (MB)'], ['FolderPath', 'Folder Path'],
    ] },
    { label: 'Activity', props: [
        ['IsPlayed', 'Watched / Unwatched'], ['LastPlayed', 'Last Played'],
        ['PlayCount', 'Play Count'], ['InProgress', 'In Progress (viewer)'],
        ['WatchedByCount', 'Watched by (user count)'],
    ] },
];

/**
 * Render the `<option>` markup for the rule-row prop dropdown.
 *
 * Wraps `PROPERTY_GROUPS` in `<optgroup>` elements, one per group, and
 * marks the option whose `value` matches `selected` (or any prop group
 * label, since the legacy comparison is purely string-based against the
 * first tuple slot) with the `selected` attribute.
 *
 * The legacy implementation used `p[0] === selected` where `p[0]` is
 * `string | undefined` under `noUncheckedIndexedAccess`; the `!` here
 * is safe because the tuples are non-empty in `PROPERTY_GROUPS`.
 *
 * @param selected  The prop value to mark selected (e.g. `"Resolution"`).
 *                  Pass `""` for "no selection".
 */
export function propertyOptionsHtml(selected: string): string {
    return PROPERTY_GROUPS.map((g) =>
        '<optgroup label="' + g.label + '">' +
        g.props.map((p) =>
            '<option value="' + p[0] + '"' + (p[0] === selected ? ' selected' : '') + '>' + p[1] + '</option>'
        ).join('') +
        '</optgroup>'
    ).join('');
}

/**
 * Render the small hint line shown beneath a media-info rule row.
 *
 * Props that take a comma/newline-separated text list (everything in
 * `MI_TEXT_MATCH_PROPS`, plus the ID lookups `ImdbId` / `TvdbId`)
 * surface the OR-match reminder. Everything else gets an empty hint
 * div so the row's vertical spacing stays consistent.
 *
 * The text in the populated branch uses `&mdash;` (em-dash) literally,
 * matching `configPage.js:1132`. We keep that as-is rather than
 * rewriting to a Unicode escape so a byte-for-byte comparison against
 * the legacy output holds.
 */
export function getMiHintHtml(prop: string): string {
    if (MI_TEXT_MATCH_PROPS.indexOf(prop) < 0 && prop !== 'ImdbId' && prop !== 'TvdbId') {
        return '<div class="mi-rule-hint"></div>';
    }
    return '<div class="mi-rule-hint" style="font-size:0.75em; opacity:0.5; margin-top:2px; padding-right:32px; text-align:right;">One value per line &mdash; matches if <em>any</em> line matches (OR)</div>';
}

// ─── Value controls, rule rows, and filter groups (legacy.js:1032-1255) ───────

/**
 * Minimal user-entry shape consumed by the user select. Mirrors the items
 * `getHseUsers` (legacy.js:6795) resolves into `_miUsers`.
 */
export interface MiUserLike {
    readonly Id: string;
    readonly Name: string;
}

/**
 * Minimal item shape consumed by the Collection/Playlist selects. The
 * legacy items come from `cachedCollections` / `cachedPlaylists`
 * (legacy.js:6802-6803); only `Name` is read.
 */
export interface MiCollectionItemLike {
    readonly Name?: string;
}

/**
 * The mutable module-scope state `getMiValueHtml` /
 * `getMediaInfoRuleHtml` / `getMediaInfoFilterGroupHtml` read in
 * legacy.js, lifted to an explicit argument (Phase-5 `HscDeps` pattern).
 *
 * - `users`       ⇐ legacy `_miUsers` (`null` until the users fetch lands).
 * - `collections` ⇐ legacy `cachedCollections` (library collections).
 * - `playlists`   ⇐ legacy `cachedPlaylists` (library playlists).
 * - `tags`        ⇐ legacy `cachedTags` (sorted tag-name strings).
 *
 * When every field is "empty" (`users: null`, all lists `[]`), the output
 * matches the legacy fixture environment exactly (the caches are never
 * populated there), so mirror tests can compare against legacy snapshots
 * by passing empty deps.
 */
export interface MiFilterDeps {
    readonly users: readonly MiUserLike[] | null;
    readonly collections: readonly MiCollectionItemLike[];
    readonly playlists: readonly MiCollectionItemLike[];
    readonly tags: readonly string[];
}

/**
 * The contains/exact `<select class="selMiTextOp">` shared by the Tag
 * branch and the text-match branch (legacy.js:1059-1062 / 1116-1119 —
 * byte-identical markup in both places).
 */
function textOpSelectHtml(selectedOp: string | undefined): string {
    return '<select class="selMiTextOp" is="emby-select" style="flex:0 0 100px;">' +
        '<option value="contains"' + (selectedOp === 'contains' ? ' selected' : '') + '>Contains</option>' +
        '<option value="exact"' + (selectedOp === 'exact' ? ' selected' : '') + '>Exact</option>' +
        '</select>';
}

/**
 * The free-text `<textarea class="txtMiValue">` shared by the Tag branch,
 * the text-match branch, and the fallback branch (legacy.js:1070, 1123,
 * 1127 — byte-identical markup in all three places).
 */
function textAreaHtml(placeholder: string, val: string): string {
    return '<textarea class="txtMiValue" placeholder="' + escapeAttr(placeholder) + '" rows="1" style="flex:1;resize:none;overflow:hidden;padding:6px 8px;font-size:inherit;font-family:inherit;background:var(--plugin-input-bg,rgba(255,255,255,0.08));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.2));border-radius:3px;color:inherit;line-height:1.4;min-height:32px;max-height:120px;overflow-y:auto;">' + escapeHtml(val) + '</textarea>';
}

/**
 * Render the per-property value controls for one media-info rule row
 * (legacy.js:1032). Branch order is load-bearing:
 *
 *   1. `Collection` / `Playlist` — `<select class="selMiValue">` from the
 *      cached library collections/playlists (`-- Select --` placeholder).
 *   2. `Tag` — contains/exact op select, then either the tag dropdown
 *      (when `deps.tags` is populated) or a free-text textarea (with the
 *      legacy comma→newline migration applied).
 *   3. `MI_DROPDOWN_OPTIONS` — dropdown select; `MediaType` additionally
 *      appends the "Also include parent series" checkbox (visible only
 *      for `Episode`/`EpisodeIncludeSeries`, checked for the latter).
 *   4. `MI_NUMERIC_PROPS` — op select (`=`,`>`,`>=`,`<`,`<=`), an info
 *      tooltip, a number input (`step` 1 for PlayCount else 0.01), and
 *      the unit label.
 *   5. `MI_TEXT_MATCH_PROPS` — contains/exact op select + free-text
 *      textarea with the prop's placeholder.
 *   6. Fallback — plain free-text textarea (e.g. `ImdbId`, unknown props).
 *
 * Props in `MI_USER_PROPS` additionally prefix branches 3/4 with the
 * user select (`__any__` / `__all__`, plus `__current__` for `IsPlayed`).
 *
 * @param prop        The criterion prop (e.g. `"Resolution"`).
 * @param savedOp     The parsed op from the criterion ("" when absent).
 * @param savedVal    The parsed value ("" when absent).
 * @param savedUserId The parsed userId ("" when absent).
 * @param deps        The lifted module-state reads (see {@link MiFilterDeps}).
 */
export function getMiValueHtml(
    prop: string,
    savedOp: string,
    savedVal: string,
    savedUserId: string,
    deps: MiFilterDeps,
): string {
    let userHtml = '';
    if (MI_USER_PROPS.indexOf(prop) >= 0) {
        let specialOpts =
            '<option value="__any__"' + ('__any__' === savedUserId ? ' selected' : '') + '>Any user</option>' +
            '<option value="__all__"' + ('__all__' === savedUserId ? ' selected' : '') + '>All users</option>';
        // Current-user play state is resolved per viewer by the home section query (Emby),
        // so it is only offered where that is supported (IsPlayed).
        if (prop === 'IsPlayed') {
            specialOpts += '<option value="__current__"' + ('__current__' === savedUserId ? ' selected' : '') + '>Current user (viewer)</option>';
        }
        const uOpts = specialOpts + (deps.users || []).map(function (u) {
            return '<option value="' + escapeAttr(u.Id) + '"' + (u.Id === savedUserId ? ' selected' : '') + '>' + escapeHtml(u.Name) + '</option>';
        }).join('');
        userHtml = '<select class="selMiUser" is="emby-select" style="flex:0 0 auto;min-width:110px;">' + uOpts + '</select>';
    }
    const unit = MI_UNIT_LABELS[prop];
    const unitLabel = unit ? '<span style="margin-left:4px;opacity:.7;white-space:nowrap;">' + unit + '</span>' : '';
    if (prop === 'Collection' || prop === 'Playlist') {
        const cpList = prop === 'Collection' ? deps.collections : deps.playlists;
        const cpOpts = cpList.map(function (o) {
            const n = o.Name || '';
            return '<option value="' + escapeAttr(n) + '"' + (n === savedVal ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
        }).join('');
        return '<select class="selMiValue" is="emby-select" style="flex:1;"><option value="">-- Select --</option>' + cpOpts + '</select>';
    }
    if (prop === 'Tag') {
        const tagTextOp = savedOp || MI_TEXT_MATCH_DEFAULT['Tag'];
        const tagTextOpHtml = textOpSelectHtml(tagTextOp);
        if (deps.tags.length > 0) {
            const tagOpts = deps.tags.map(function (t) {
                return '<option value="' + escapeAttr(t) + '"' + (t === savedVal ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
            }).join('');
            return tagTextOpHtml + '<select class="selMiValue" is="emby-select" style="flex:1;"><option value="">-- Select tag --</option>' + tagOpts + '</select>';
        }
        return tagTextOpHtml + textAreaHtml('e.g. 4K', migrateCommaSeparated(savedVal || '') ?? '');
    }
    const dropdown = MI_DROPDOWN_OPTIONS[prop];
    if (dropdown) {
        if (prop === 'MediaType') {
            const dispVal = (savedVal === 'EpisodeIncludeSeries') ? 'Episode' : (savedVal || '');
            const mtOpts = dropdown.map(function (pair) {
                return '<option value="' + pair[0] + '"' + (pair[0] === dispVal ? ' selected' : '') + '>' + pair[1] + '</option>';
            }).join('');
            const ipChecked = (savedVal === 'EpisodeIncludeSeries') ? 'checked' : '';
            const ipDisplay = (dispVal === 'Episode') ? 'inline-flex' : 'none';
            return '<select class="selMiValue" is="emby-select" style="flex:1;">' + mtOpts + '</select>' +
                '<label class="mi-include-parent" style="display:' + ipDisplay + '; align-items:center; gap:6px; cursor:pointer; white-space:nowrap; font-size:0.85em; margin:0;">' +
                '<input type="checkbox" class="chkIncludeParentSeries" ' + ipChecked + ' style="margin:0;">' +
                '<span>Also include parent series</span>' +
                '</label>';
        }
        const opts = dropdown.map(function (pair) {
            return '<option value="' + pair[0] + '"' + (pair[0] === savedVal ? ' selected' : '') + '>' + pair[1] + '</option>';
        }).join('');
        return userHtml + '<select class="selMiValue" is="emby-select" style="flex:1;">' + opts + '</select>';
    }
    if (MI_NUMERIC_PROPS.indexOf(prop) >= 0) {
        const ops = ['=', '>', '>=', '<', '<='];
        const defaultOp = (prop === 'PlayCount') ? '>=' : '<=';
        const opOpts = ops.map(function (o) {
            return '<option value="' + o + '"' + (o === (savedOp || defaultOp) ? ' selected' : '') + '>' + o + '</option>';
        }).join('');
        const infoTooltip =
            '<div class="mi-op-info">' +
            '<div class="mi-op-info-icon">i</div>' +
            '<div class="mi-op-tooltip"><table>' +
            '<tr><td>=</td><td>Exactly equal</td></tr>' +
            '<tr><td>&gt;</td><td>Greater than</td></tr>' +
            '<tr><td>&gt;=</td><td>Greater than or equal</td></tr>' +
            '<tr><td>&lt;</td><td>Less than</td></tr>' +
            '<tr><td>&lt;=</td><td>Less than or equal</td></tr>' +
            '</table></div></div>';
        const numStep = (prop === 'PlayCount') ? '1' : '0.01';
        return userHtml +
            '<select class="selMiOp" is="emby-select" style="flex:0 0 64px;">' + opOpts + '</select>' +
            infoTooltip +
            '<input class="txtMiNum" is="emby-input" type="number" step="' + numStep + '" value="' + (savedVal || '') + '" style="flex:1;" />' +
            unitLabel;
    }
    if (MI_TEXT_MATCH_PROPS.indexOf(prop) >= 0) {
        const textOp = savedOp || MI_TEXT_MATCH_DEFAULT[prop] || 'contains';
        const textOpHtml = textOpSelectHtml(textOp);
        const ph = MI_TEXT_PLACEHOLDERS[prop] || '';
        return textOpHtml + textAreaHtml(ph, migrateCommaSeparated(savedVal || '') ?? '');
    }
    const ph = MI_TEXT_PLACEHOLDERS[prop] || '';
    return textAreaHtml(ph, migrateCommaSeparated(savedVal || '') ?? '');
}

/**
 * Render one full media-info rule row (legacy.js:1135): the NOT toggle
 * button, the prop dropdown, the value controls from
 * {@link getMiValueHtml}, the remove button, and the hint line.
 *
 * @param criterion  Raw criterion string (`"Resolution:4K"`, `"!Tag:4K"`,
 *                   shorthand `"4K"`, or falsy for the default row).
 * @param deps       Forwarded to {@link getMiValueHtml} (see
 *                   {@link MiFilterDeps}).
 */
export function getMediaInfoRuleHtml(
    criterion: string | null | undefined,
    deps: MiFilterDeps,
): string {
    const parsed = parseCriterion(criterion || '');
    const prop = parsed.prop || 'Resolution';
    const notActive = parsed.not;
    const notBg = notActive ? 'rgba(200,50,50,0.75)' : 'transparent';
    const notColor = notActive ? '#fff' : '';
    const notBorder = notActive ? '1px solid rgba(200,50,50,0.6)' : '1px solid rgba(128,128,128,0.4)';
    return '<div class="mi-rule" style="margin-bottom:6px;">' +
        '<div style="display:flex; gap:6px; align-items:center;">' +
        '<button type="button" class="btnNotToggle" data-not="' + (notActive ? '1' : '0') + '"' +
        ' style="border:' + notBorder + '; border-radius:10px; padding:3px 10px; font-size:0.78em; font-weight:bold; cursor:pointer; letter-spacing:0.5px; flex-shrink:0;' +
        ' background:' + notBg + '; color:' + notColor + ';" title="Negate this rule">NOT</button>' +
        '<select class="selMiProperty" is="emby-select" style="flex:0 0 155px;">' + propertyOptionsHtml(prop) + '</select>' +
        '<div class="mi-value-wrapper" style="flex:1; display:flex; gap:6px; align-items:center;">' + getMiValueHtml(prop, parsed.op, parsed.val, parsed.userId || '', deps) + '</div>' +
        '<button type="button" class="btnRemoveMiRule" style="background:transparent; border:none; color:#cc3333; cursor:pointer; padding:2px 8px; font-size:1em; flex-shrink:0;" title="Remove rule">✕</button>' +
        '</div>' +
        getMiHintHtml(prop) +
        '</div>';
}

/**
 * Render one media-info filter group (legacy.js:1155): the group card
 * with its `data-op` / `data-group-op` attributes, the inter-group
 * connector (only for non-first groups), the inner ALL/ANY op toggle,
 * the rule list, and the "+ Add Rule" button.
 *
 * @param filter   `{ Operator, GroupOperator, Criteria }` — `null`/
 *                 `undefined` defaults every field (`AND` / `AND` /
 *                 empty list), matching the legacy falsy-guards.
 * @param _i       Unused legacy index parameter (kept for arity parity
 *                 with the legacy call sites).
 * @param isFirst  `true` for the first group — suppresses the connector
 *                 and forces the group-op header state.
 * @param deps     Forwarded to {@link getMediaInfoRuleHtml}.
 */
export function getMediaInfoFilterGroupHtml(
    filter: MediaInfoFilterGroup | null | undefined,
    _i: unknown,
    isFirst: boolean,
    deps: MiFilterDeps,
): string {
    const op = (filter && filter.Operator) || 'AND';
    const groupOp = (filter && filter.GroupOperator) || 'AND';
    const criteria = (filter && filter.Criteria) || [];

    const connectorHtml = isFirst ? '' :
        '<div class="mi-group-connector" style="display:flex; align-items:center; gap:10px; margin:-12px -12px 14px; padding:8px 14px; background:rgba(0,0,0,0.12);">' +
        '<div style="flex:1; height:1px; background:rgba(128,128,128,0.25);"></div>' +
        '<div style="display:flex; flex-direction:column; align-items:center; gap:4px;">' +
        '<span style="font-size:0.7em; text-transform:uppercase; letter-spacing:1px; opacity:0.45;">Connect groups with</span>' +
        '<div style="display:flex; border-radius:14px; overflow:hidden; border:1px solid rgba(128,128,128,0.4);">' +
        '<button type="button" class="btnGroupOpChoice" data-value="AND"' +
        ' style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px;' +
        ' background:' + (groupOp === 'AND' ? 'rgba(0,164,220,0.75)' : 'transparent') + ';' +
        ' color:' + (groupOp === 'AND' ? '#fff' : 'inherit') + ';"' +
        ' title="Both filter groups must match">AND</button>' +
        '<div style="width:1px; background:rgba(128,128,128,0.4);"></div>' +
        '<button type="button" class="btnGroupOpChoice" data-value="OR"' +
        ' style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px;' +
        ' background:' + (groupOp === 'OR' ? 'rgba(220,120,0,0.75)' : 'transparent') + ';' +
        ' color:' + (groupOp === 'OR' ? '#fff' : 'inherit') + ';"' +
        ' title="Either filter group is enough">OR</button>' +
        '</div>' +
        '<span class="group-op-desc" style="font-size:0.7em; opacity:0.55; white-space:nowrap;">' +
        (groupOp === 'AND' ? 'Both groups must match' : 'Either group is enough') +
        '</span>' +
        '</div>' +
        '<div style="flex:1; height:1px; background:rgba(128,128,128,0.25);"></div>' +
        '</div>';

    const rulesHtml = criteria.map(function (c) { return getMediaInfoRuleHtml(c, deps); }).join('');

    return '<div class="mediainfo-filter-group" data-group-op="' + groupOp + '" data-op="' + op + '" style="border:1px solid rgba(128,128,128,0.3); border-radius:6px; padding:12px; margin-bottom:10px; background:rgba(128,128,128,0.03);">' +
        connectorHtml +
        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">' +
        '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">' +
        '<span style="font-size:0.8em; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; opacity:0.6;">Match rules:</span>' +
        '<div style="display:flex; flex-direction:column; gap:3px;">' +
        '<div style="display:flex; border-radius:14px; overflow:hidden; border:1px solid rgba(128,128,128,0.4);">' +
        '<button type="button" class="btnGroupInnerOpChoice" data-value="AND"' +
        ' style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px;' +
        ' background:' + (op === 'AND' ? 'rgba(0,164,220,0.75)' : 'transparent') + ';' +
        ' color:' + (op === 'AND' ? '#fff' : 'inherit') + ';"' +
        ' title="All rules in this group must match">ALL</button>' +
        '<div style="width:1px; background:rgba(128,128,128,0.4);"></div>' +
        '<button type="button" class="btnGroupInnerOpChoice" data-value="OR"' +
        ' style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px;' +
        ' background:' + (op === 'OR' ? 'rgba(220,120,0,0.75)' : 'transparent') + ';' +
        ' color:' + (op === 'OR' ? '#fff' : 'inherit') + ';"' +
        ' title="Any rule in this group is enough">ANY</button>' +
        '</div>' +
        '<span class="inner-op-desc" style="font-size:0.7em; opacity:0.55;">' +
        (op === 'AND' ? 'All rules must match' : 'Any rule is enough') +
        '</span>' +
        '</div>' +
        '</div>' +
        '<button type="button" class="btnRemoveFilterGroup" style="background:transparent; border:none; color:#cc3333; cursor:pointer; padding:2px 8px; font-size:0.85em; flex-shrink:0;">✕ Remove</button>' +
        '</div>' +
        '<div class="mi-rules-list">' + rulesHtml + '</div>' +
        '<button type="button" is="emby-button" class="btnAddMiRule raised btn-neutral" style="margin-top: 4px;">+ Add Rule</button>' +
        '</div>';
}

/**
 * Read the rendered media-info filter DOM back into group objects
 * (legacy.js:1222). The inverse of the three builders above; quirks
 * preserved exactly:
 *
 * - The value comes from `.selMiValue` when present, else `.txtMiValue`
 *   (newlines normalized to `\n`, trimmed).
 * - `MediaType` + `Episode` becomes `EpisodeIncludeSeries` when the
 *   `.chkIncludeParentSeries` checkbox is checked.
 * - Numeric rules read `.txtMiNum` and `.selMiOp`; text rules read
 *   `.selMiTextOp`; user-scoped rules read `.selMiUser`.
 * - A rule whose `.btnNotToggle` carries `data-not="1"` is negated
 *   (`!` prefix on the serialized criterion).
 * - Empty serializations (`buildCriterion` → `""`) are dropped.
 * - Groups with no surviving criteria are dropped entirely.
 * - The FIRST group's `GroupOperator` is forced to `"AND"` regardless
 *   of its `data-group-op`; later groups keep theirs (`AND` default).
 *
 * @param container  The element holding `.mediainfo-filter-group`
 *                   children (e.g. `#miFiltersContainer`).
 * @returns          The `{ Operator, Criteria, GroupOperator }` list.
 */
export function readMiFiltersFromContainer(container: Element): MediaInfoFilterGroup[] {
    const miFilters: MediaInfoFilterGroup[] = [];
    container.querySelectorAll<HTMLElement>('.mediainfo-filter-group').forEach((group, gi) => {
        const operator = group.dataset.op || 'AND';
        const groupOp = gi === 0 ? 'AND' : (group.dataset.groupOp || 'AND');
        const criteria: string[] = [];
        group.querySelectorAll<HTMLElement>('.mi-rule').forEach((rule) => {
            const propEl = rule.querySelector<HTMLSelectElement>('.selMiProperty');
            const prop = propEl ? propEl.value : '';
            const selVal = rule.querySelector<HTMLSelectElement>('.selMiValue');
            const txtVal = rule.querySelector<HTMLTextAreaElement>('.txtMiValue');
            const selOp = rule.querySelector<HTMLSelectElement>('.selMiOp');
            const txtNum = rule.querySelector<HTMLInputElement>('.txtMiNum');
            const selUser = rule.querySelector<HTMLSelectElement>('.selMiUser');
            const selTextOp = rule.querySelector<HTMLSelectElement>('.selMiTextOp');
            let val = selVal ? selVal.value : (txtVal ? txtVal.value.replace(/\r?\n/g, '\n').trim() : '');
            if (prop === 'MediaType' && val === 'Episode') {
                const incParentChk = rule.querySelector<HTMLInputElement>('.chkIncludeParentSeries');
                if (incParentChk && incParentChk.checked) val = 'EpisodeIncludeSeries';
            }
            const op2 = selOp ? selOp.value : '';
            const textMatchOp = selTextOp ? selTextOp.value : '';
            const num = txtNum ? txtNum.value.trim() : '';
            const userId = selUser ? selUser.value : '';
            const finalOp = op2 || textMatchOp;
            const finalVal = op2 ? num : val;
            const notBtn = rule.querySelector<HTMLElement>('.btnNotToggle');
            const isNot = notBtn !== null && notBtn.dataset.not === '1';
            const crit = buildCriterion(prop, finalOp, finalVal, userId);
            if (crit) criteria.push(isNot ? '!' + crit : crit);
        });
        if (criteria.length > 0) miFilters.push({ Operator: operator, Criteria: criteria, GroupOperator: groupOp });
    });
    return miFilters;
}
