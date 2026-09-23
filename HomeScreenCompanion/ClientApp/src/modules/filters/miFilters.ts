// Phase 3: media-info filter HTML builders, leaf module.
//
// Pure helpers lifted verbatim from `Configuration/configPage.js`
// (legacy.js:1014-1253). The two functions here (`propertyOptionsHtml`,
// `getMiHintHtml`) read no module-scope state and no DOM; they take a
// primitive prop name and return a literal HTML string. The remaining
// helpers in this neighborhood (`getMiValueHtml`, `getMediaInfoRuleHtml`,
// `getMediaInfoFilterGroupHtml`) are deferred — they reach into mutable
// module state (`_miUsers`, `cachedCollections`, `cachedPlaylists`,
// `cachedTags`) and into `escapeHtml`/`migrateCommaSeparated`, which is
// a Phase 5+ wiring task (see header comments in `savedFilters.ts` for
// the same pattern).
//
// `MI_TEXT_MATCH_PROPS` is a module-scope constant in legacy.js that
// `getMiHintHtml` consults. It is not mutable, so it folds cleanly into
// this module as a private constant. Same data as legacy.js:941 — keep
// in lock-step.

const MI_TEXT_MATCH_PROPS: readonly string[] = [
    'Tag', 'Title', 'EpisodeTitle', 'Overview', 'Studio', 'Genre',
    'Actor', 'Director', 'Writer', 'ContentRating', 'AudioLanguage',
    'Artist', 'Album', 'FolderPath', 'Country',
];

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
