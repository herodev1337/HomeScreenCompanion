/**
 * Phase 5 (state wiring): full body of the legacy tag-row HTML builder.
 *
 * Lifted verbatim from `Configuration/configPage.js` (legacy.js:1363-1852,
 * 490 lines). Together with the smaller helpers in this file
 * (`getSourceBadgeHtml` from legacy.js:1350, `MI_PRESETS` from
 * legacy.js:948-1002) this is the complete HTML-rendering half of the
 * tag-manage-tab pipeline: `renderTagGroup` builds the row string, the
 * caller inserts it into the DOM and then runs `setupRowEvents` on the
 * resulting element.
 *
 * Two helper surface changes vs. the legacy closure:
 *
 *   - Every module-scope read lifted onto an explicit `RenderTagGroupDeps`
 *     argument. `_miUsers` → `deps.miUsers.users`; `_topListTagNames` →
 *     `deps.topLists.tagNames`; the row-build helpers (`getUrlRowHtml`,
 *     `getLocalRowHtml`, `getDateRowHtml`, `getMediaInfoFilterGroupHtml`)
 *     and the saved-filters panel (`getMySavedFiltersPanelHtml`) come in
 *     through the same surface so this module never reaches a global.
 *
 *   - The DOM-mutation half of the legacy function (HTML insertion +
 *     `setupRowEvents(newRow)` + the `isNew` timeout that strips the
 *     `just-added` class) is NOT in this module. `renderTagGroup` returns
 *     the HTML string; the caller (eventually `index.ts`) owns
 *     insertion + event wiring.
 *
 * The canonical `SetupRowEventsDeps` interface lives in the parallel
 * `setupRowEvents` extraction (`modules/rows/setupRowEvents.ts`). This
 * module never imports it because `renderTagGroup` does not call
 * `setupRowEvents` — structural assignability means the two extractions
 * can grow independently.
 */

import { migrateCommaSeparated } from '../filters/criteria';
import { escapeAttr, escapeHtml } from '../dom/dom';
import type { MediaInfoFilterGroup, SavedFilter } from '../filters/savedFilters';
import type { DateInterval, NamedItem } from '../filters/rows';
import type { MiFilterDeps } from '../filters/miFilters';
import type { MiUsersState, TopListsState } from '../state/state';

// ─── MI_PRESETS (lifted verbatim from legacy.js:948-1002) ────────────────────

/**
 * One preset category in the "Premade filters" panel. Each category
 * renders a header + a row of pill buttons; clicking a button replaces
 * the current media-info filter groups with the result of `build()`.
 *
 * The build function is intentionally side-effect-free: it returns a
 * fresh array of {@link MediaInfoFilterGroup} objects with no shared
 * reference to anything outside its body.
 */
interface MiPresetEntry {
    readonly name: string;
    readonly build: () => MediaInfoFilterGroup[];
}

/** One category in the "Premade filters" panel. */
export interface MiPresetCategory {
    readonly label: string;
    readonly presets: readonly MiPresetEntry[];
}

/**
 * The full preset catalogue. Same shape as the legacy module-scope
 * `var MI_PRESETS` (legacy.js:948-1002) — the dynamic `new Date()` calls
 * inside the `build` closures re-evaluate on every render, so this
 * constant is intentionally NOT frozen at module load.
 */
export const MI_PRESETS: readonly MiPresetCategory[] = [
    { label: 'Resolution', presets: [
        { name: 'Movies in 4K',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Movie', '4K'] }] },
        { name: 'Movies in 1080p',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Movie', '1080p'] }] },
        { name: 'Movies below HD (≤720p)',
          build: (): MediaInfoFilterGroup[] => [
              { Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Movie'] },
              { Operator: 'OR',  GroupOperator: 'AND', Criteria: ['720p', 'SD'] },
          ] },
    ]},
    { label: 'Release Year', presets: [
        { name: 'Movies from the 1990s',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Movie', 'Year:>=:1990', 'Year:<=:1999'] }] },
        { name: 'Movies released this year',
          build: (): MediaInfoFilterGroup[] => {
              const y = new Date().getFullYear();
              return [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Movie', 'Year:=:' + y] }];
          } },
        { name: 'Movies released in the last 5 years',
          build: (): MediaInfoFilterGroup[] => {
              const y = new Date().getFullYear() - 5;
              return [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Movie', 'Year:>=:' + y] }];
          } },
    ]},
    { label: 'Recently', presets: [
        { name: 'Recently added (last 30 days)',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['DateAdded:<=:30'] }] },
        { name: 'Recently modified (last 7 days)',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['DateModified:<=:7'] }] },
        { name: 'Recently played (last 7 days)',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['LastPlayed:__any__:<=:7'] }] },
    ]},
    { label: 'Watch Status', presets: [
        { name: 'Unwatched movies',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Movie', 'IsPlayed:__any__:=:Unwatched'] }] },
        { name: 'Never played by anyone',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['IsPlayed:__all__:=:Unwatched'] }] },
        { name: 'Watched by at least 2 users',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['WatchedByCount:>=:2'] }] },
        { name: 'Unseen by everyone',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['WatchedByCount:=:0'] }] },
        { name: 'In progress by current user (home section)',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['InProgress'] }] },
        { name: 'Watched by current user (home section)',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['IsPlayed:__current__:=:Watched'] }] },
    ]},
    { label: 'Music', presets: [
        { name: 'All music tracks',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Audio'] }] },
        { name: 'All music videos',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:MusicVideo'] }] },
        { name: 'Lossless audio (≥24-bit)',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Audio', 'BitsPerSample:>=:24'] }] },
        { name: 'Hi-res audio (≥96 kHz)',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:Audio', 'SampleRate:>=:96000'] }] },
        { name: 'Music videos in 4K',
          build: (): MediaInfoFilterGroup[] => [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['MediaType:MusicVideo', '4K'] }] },
    ]},
];

// ─── Source badge helper (legacy.js:1350) ────────────────────────────────────

const SOURCE_BADGE_MAP: Readonly<Record<string, { readonly icon: string; readonly title: string }>> = {
    'External':        { icon: 'language',       title: 'External List' },
    'LocalCollection': { icon: 'folder_special', title: 'Local Collection' },
    'LocalPlaylist':   { icon: 'playlist_play',  title: 'Local Playlist' },
    'MediaInfo':       { icon: 'tune',           title: 'Smart Playlist' },
    'AI':              { icon: 'auto_awesome',   title: 'AI created lists' },
};

/**
 * Build the source-badge `<span>` that the row's `.source-badge` slot
 * holds (legacy.js:1350). Empty input → empty output; unknown source
 * type → empty output. Used by {@link renderTagGroup} at first paint
 * and by `setupRowEvents`'s `updateBadges` closure whenever the user
 * changes `.selSourceType` — exported here so the parallel
 * `setupRowEvents` extraction can pass it through its `SetupRowEventsDeps`.
 *
 * @param st  The source type string (`'External'`, `'LocalCollection'`,
 *            `'LocalPlaylist'`, `'MediaInfo'`, `'AI'`).
 * @returns   The badge HTML, or `''` if `st` is not in the map.
 */
export function getSourceBadgeHtml(st: string): string {
    const e = SOURCE_BADGE_MAP[st];
    if (!e) return '';
    return `<span class="tag-indicator source" title="${e.title}"><i class="md-icon" style="font-size:1.1em;">${e.icon}</i></span>`;
}

// ─── SetupRowEventsDeps note ─────────────────────────────────────────────────

/**
 * The parallel `setupRowEvents` extraction (modules/rows/setupRowEvents.ts)
 * defines the canonical `SetupRowEventsDeps` interface with the full
 * surface that `setupRowEvents(row, deps)` consumes. `renderTagGroup`
 * does NOT call `setupRowEvents` directly — the caller is responsible
 * for inserting the returned HTML and then wiring the row via
 * `setupRowEvents` — so this module does not need to import the
 * `SetupRowEventsDeps` type itself. The parallel task owns the
 * interface; structural assignability means either side can grow
 * without breaking the other.
 */

// ─── RenderTagGroupDeps ──────────────────────────────────────────────────────

/**
 * Dependencies for {@link renderTagGroup} — the explicit surface that
 * replaces the legacy module-scope reads (`_miUsers`,
 * `_topListTagNames`) and the row-builder / saved-filters / MI-filter
 * closures. Every field is `readonly` so callers cannot mutate the
 * injected helpers.
 *
 * This is the largest deps surface in the migration: 10 fields. The
 * parallel `setupRowEvents` extraction re-uses the smaller subset it
 * actually needs.
 */
export interface RenderTagGroupDeps {
    /** Legacy `_miUsers` (lifted to state.ts). `null` until `getHseUsers` resolves. */
    readonly miUsers: MiUsersState;
    /** Legacy `_topListTagNames` (lifted to state.ts) — lowercased registered top-list tag names. */
    readonly topLists: TopListsState;
    /** `getUrlRowHtml` from `modules/filters/rows.ts`. */
    readonly getUrlRowHtml: (value: string | null | undefined, limit: number | undefined) => string;
    /** `getLocalRowHtml` from `modules/filters/rows.ts`. */
    readonly getLocalRowHtml: (
        type: string,
        selectedName: string,
        limit: number | undefined,
        items?: readonly NamedItem[],
    ) => string;
    /** `getDateRowHtml` from `modules/filters/rows.ts`. */
    readonly getDateRowHtml: (interval: DateInterval) => string;
    /** `getMediaInfoFilterGroupHtml` from `modules/filters/miFilters.ts`. */
    readonly getMediaInfoFilterGroupHtml: (
        filter: MediaInfoFilterGroup | null | undefined,
        _i: unknown,
        isFirst: boolean,
        miDeps: MiFilterDeps,
    ) => string;
    /** `getMySavedFiltersPanelHtml` from `modules/filters/savedFilters.ts`. */
    readonly getMySavedFiltersPanelHtml: (savedFilters: readonly SavedFilter[]) => string;
    /** `tagConfigHasViewerCriteria` from `modules/homesections/form.ts`. */
    readonly tagConfigHasViewerCriteria: (cfg: unknown) => boolean;
    /** MI-filter deps forwarded into `getMediaInfoFilterGroupHtml`. */
    readonly miFilterDeps: MiFilterDeps;
    /** Current saved-filters array forwarded into `getMySavedFiltersPanelHtml`. */
    readonly savedFilters: SavedFilter[];
}

// ─── TagConfig shape consumed by renderTagGroup ─────────────────────────────

/**
 * The minimal tag-config shape `renderTagGroup` reads. Mirrors the
 * legacy closure's ad-hoc property access (every field is `?` because
 * legacy defaults every missing key). The full server-side DTO is
 * richer; see `modules/config/types/index.ts` `TagConfig` for the
 * complete list.
 *
 * Kept private to this module so the public `renderTagGroup` signature
 * can keep accepting `unknown` (legacy semantics: falsy `tagConfig`
 * throws on the first property access — preserved).
 */
interface RenderTagConfig {
    Active?: boolean;
    Tag?: string;
    Name?: string;
    Urls?: ReadonlyArray<{ readonly url: string; readonly limit: number }>;
    Url?: string;
    Limit?: number;
    Blacklist?: readonly string[];
    ActiveIntervals?: readonly DateInterval[];
    EnableTag?: boolean;
    EnableCollection?: boolean;
    CollectionName?: string;
    CollectionDescription?: string;
    CollectionPosterPath?: string;
    EnablePlaylist?: boolean;
    PlaylistName?: string;
    PlaylistUserIds?: readonly string[];
    PlaylistMappings?: readonly unknown[];
    OverrideWhenActive?: boolean;
    SourceType?: string;
    LocalSources?: ReadonlyArray<{ readonly id: string; readonly limit: number }>;
    LastModified?: string;
    MediaInfoTargetType?: string;
    MediaInfoSeasonMode?: boolean;
    TagTargetEpisode?: boolean;
    TagTargetSeason?: boolean;
    TagTargetSeries?: boolean;
    CollectionTargetEpisode?: boolean;
    CollectionTargetSeason?: boolean;
    CollectionTargetSeries?: boolean;
    MediaInfoTargetEpisode?: boolean;
    MediaInfoTargetSeason?: boolean;
    MediaInfoTargetSeries?: boolean;
    MediaInfoFilters?: readonly MediaInfoFilterGroup[];
    MediaInfoConditions?: readonly string[];
    EnableHomeSection?: boolean;
    HomeSectionLibraryId?: string;
    HomeSectionUserIds?: readonly string[];
    HomeSectionSettings?: string;
    HomeSectionTracked?: readonly unknown[];
    AiProvider?: string;
    AiPrompt?: string;
    AiIncludeRecentlyWatched?: boolean;
    AiRecentlyWatchedUserId?: string;
    AiRecentlyWatchedCount?: number;
    AiRefreshIntervalDays?: number;
}

/** Narrow `unknown` → {@link RenderTagConfig}. The legacy code does this implicitly via property access; we do it explicitly. */
function asTagConfig(tagConfig: unknown): RenderTagConfig {
    return (tagConfig && typeof tagConfig === 'object') ? (tagConfig as RenderTagConfig) : {};
}

// ─── renderTagGroup ──────────────────────────────────────────────────────────

/**
 * Build the full HTML string for one tag-row (legacy.js:1363-1834).
 *
 * Walks `tagConfig` (the row's persisted config object) and concatenates
 * every visible sub-section: header with drag handle + active toggle +
 * source badge + tag indicators, general tab with display-name +
 * source-type selector + URL/local/AI/MI containers, tag-name tab
 * with target checkboxes, collection tab with name/description/poster,
 * playlist tab with user picker, schedule tab with date rows, advanced
 * tab with the blacklist textarea, home-section tab with the
 * `data-hse-*` attribute payload, and the footer Run Group / Remove
 * buttons.
 *
 * Module-scope reads lifted to {@link RenderTagGroupDeps}:
 *   - `_miUsers`           → `deps.miUsers.users`
 *   - `_topListTagNames`   → `deps.topLists.tagNames`
 *
 * Quirks preserved (verbatim from legacy.js:1363-1852):
 *
 *   - `Urls` falls back to `[{ url: tagConfig.Url, limit: tagConfig.Limit !== undefined ? tagConfig.Limit : 0 }]`
 *     when `tagConfig.Urls` is absent (legacy single-URL migration).
 *     A completely empty row gets the `[{ url: '', limit: 0 }]` default.
 *   - `LocalSources` defaults to `[{ id: '', limit: 0 }]` when the row
 *     has none (legacy "always show one empty local row" behavior).
 *   - `MediaInfoFilters` falls back to a single group wrapping
 *     `MediaInfoConditions` when the structured filters array is
 *     missing (legacy migration from the old single-group shape).
 *   - The top-list indicator renders when `tagName.toLowerCase()` is in
 *     `deps.topLists.tagNames`. The `_topListTagNames.has(...)` lookup
 *     does NOT auto-insert via `refreshTopListBadges` here — that
 *     helper covers the runtime DOM, while this is the first paint.
 *   - The row's `data-*` attributes are `data-index`, `data-tag`,
 *     `data-last-modified`, `data-dirty`. No `data-name` /
 *     `data-active` / `data-groupby` are set on the root.
 *
 * The returned string is meant to be inserted into the DOM by the
 * caller (eventually the index.ts factory), which is also responsible
 * for calling `setupRowEvents(row, deps)` on the resulting element and
 * for the `isNew` → `setTimeout(remove 'just-added', 2000)` quirk.
 *
 * @param tagConfig   The row's persisted config. Legacy semantics:
 *                    falsy → throws on the first property access; we
 *                    narrow to an empty object instead so the function
 *                    returns a valid empty row instead of throwing.
 * @param groupIndex  The `data-index` value for the row (legacy
 *                    `index` parameter). `undefined` → 9999 (legacy
 *                    sentinel for "newly inserted, no index yet").
 * @param deps        See {@link RenderTagGroupDeps}.
 * @returns           The row's HTML. Never empty.
 */
export function renderTagGroup(
    tagConfig: unknown,
    groupIndex: number | undefined,
    deps: RenderTagGroupDeps,
): string {
    const cfg = asTagConfig(tagConfig);

    const isChecked = cfg.Active !== false ? 'checked' : '';
    const tagName = cfg.Tag || '';
    const labelName = cfg.Name || '';
    const urls = cfg.Urls
        || (cfg.Url ? [{ url: cfg.Url, limit: cfg.Limit !== undefined ? cfg.Limit : 0 }] : [{ url: '', limit: 0 }]);
    const blacklist = migrateCommaSeparated((cfg.Blacklist || []).join('\n')) || '';
    const intervals = cfg.ActiveIntervals || [];
    const idx = typeof groupIndex !== 'undefined' ? groupIndex : 9999;

    const lastMod = cfg.LastModified || new Date().toISOString();

    const enableTag = cfg.EnableTag !== false ? 'checked' : '';
    const enableColl = cfg.EnableCollection ? 'checked' : '';
    const enablePlaylist = cfg.EnablePlaylist ? 'checked' : '';
    const playlistName = cfg.PlaylistName || '';
    const playlistUserIds = cfg.PlaylistUserIds || [];
    const playlistUserIdsEnc = encodeURIComponent(JSON.stringify(playlistUserIds));
    const playlistMappingsEnc = encodeURIComponent(JSON.stringify(cfg.PlaylistMappings || []));
    const overrideChecked = cfg.OverrideWhenActive ? 'checked' : '';

    const collName = cfg.CollectionName || '';
    const collDescription = cfg.CollectionDescription || '';
    const collPosterPath = cfg.CollectionPosterPath || '';

    const sourceType = cfg.SourceType || '';
    let localSources: ReadonlyArray<{ readonly id: string; readonly limit: number }> = cfg.LocalSources || [];
    if (localSources.length === 0) localSources = [{ id: '', limit: 0 }];

    const mediaInfoLimit = cfg.Limit || 0;
    const aiLimit = cfg.Limit || 0;
    const _legacyTarget = cfg.MediaInfoTargetType || (cfg.MediaInfoSeasonMode ? 'Season' : '');
    const _tagAnySet = cfg.TagTargetEpisode || cfg.TagTargetSeason || cfg.TagTargetSeries ||
                       cfg.MediaInfoTargetEpisode || cfg.MediaInfoTargetSeason || cfg.MediaInfoTargetSeries ||
                       _legacyTarget !== '';
    const _tagTargetEp  = cfg.TagTargetEpisode  || cfg.MediaInfoTargetEpisode || _legacyTarget === 'Episode';
    const _tagTargetSea = cfg.TagTargetSeason   || cfg.MediaInfoTargetSeason  || _legacyTarget === 'Season';
    const _tagTargetSer = cfg.TagTargetSeries   || cfg.MediaInfoTargetSeries  || _legacyTarget === 'Series' || !_tagAnySet;
    const _collAnySet = cfg.CollectionTargetEpisode || cfg.CollectionTargetSeason || cfg.CollectionTargetSeries ||
                        cfg.MediaInfoTargetEpisode || cfg.MediaInfoTargetSeason || cfg.MediaInfoTargetSeries ||
                        _legacyTarget !== '';
    const _collTargetEp  = cfg.CollectionTargetEpisode || cfg.MediaInfoTargetEpisode || _legacyTarget === 'Episode';
    const _collTargetSea = cfg.CollectionTargetSeason  || cfg.MediaInfoTargetSeason  || _legacyTarget === 'Season';
    const _collTargetSer = cfg.CollectionTargetSeries  || cfg.MediaInfoTargetSeries  || _legacyTarget === 'Series' || !_collAnySet;

    const enableHomeSection = cfg.EnableHomeSection ? 'checked' : '';
    const _hasViewerCriteria = deps.tagConfigHasViewerCriteria(cfg);
    const _hseAllowedWithoutOutput = sourceType === 'MediaInfo' && _hasViewerCriteria;
    const disableHomeSection = (cfg.EnableTag === false && !cfg.EnableCollection && !_hseAllowedWithoutOutput) ? 'disabled' : '';
    const homeSectionLibraryId = encodeURIComponent(cfg.HomeSectionLibraryId || 'auto');
    const homeSectionUserIdsEnc = encodeURIComponent(JSON.stringify(cfg.HomeSectionUserIds || []));
    const homeSectionSettingsEnc = encodeURIComponent(cfg.HomeSectionSettings || '{}');
    const homeSectionTrackedEnc = encodeURIComponent(JSON.stringify(cfg.HomeSectionTracked || []));
    const hsDefaultSectionType = cfg.EnableCollection ? 'boxset' : ((cfg.EnableTag || _hseAllowedWithoutOutput) ? 'items' : 'boxset');

    const mediaFilters = (cfg.MediaInfoFilters && cfg.MediaInfoFilters.length > 0)
        ? cfg.MediaInfoFilters
        : ((cfg.MediaInfoConditions && cfg.MediaInfoConditions.length > 0)
            ? [{ Operator: 'AND', GroupOperator: 'AND', Criteria: cfg.MediaInfoConditions }]
            : []);
    const filterGroupsHtml = mediaFilters.map((f, i) => deps.getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps)).join('');

    const activeText = cfg.Active !== false ? 'Active' : 'Disabled';
    const activeColor = cfg.Active !== false ? '#52B54B' : 'var(--theme-text-secondary)';

    const sourceBadgeHtml = getSourceBadgeHtml(sourceType);
    let indicatorsHtml = '';
    if (intervals.length > 0) {
        const schedPriorityClass = cfg.OverrideWhenActive ? ' priority-active' : '';
        const schedText = cfg.OverrideWhenActive ? 'Schedule priority' : 'Schedule';
        indicatorsHtml += `<span class="tag-indicator schedule${schedPriorityClass}"><i class="md-icon" style="font-size:1.1em;">calendar_today</i> ${schedText}</span>`;
    }
    if (cfg.EnableCollection) {
        indicatorsHtml += `<span class="tag-indicator collection"><i class="md-icon" style="font-size:1.1em;">library_books</i> Collection</span>`;
    }
    if (cfg.EnableHomeSection) {
        indicatorsHtml += `<span class="tag-indicator homescreen"><i class="md-icon" style="font-size:1.1em;">home</i> Home Section</span>`;
    }
    if (cfg.EnableTag) {
        indicatorsHtml += `<span class="tag-indicator tag"><i class="md-icon" style="font-size:1.1em;">label</i> Tag</span>`;
    }
    if (cfg.EnablePlaylist) {
        indicatorsHtml += `<span class="tag-indicator playlist"><i class="md-icon" style="font-size:1.1em;">queue_music</i> Playlist</span>`;
    }
    if (deps.topLists.tagNames.has(tagName.toLowerCase())) {
        indicatorsHtml += `<span class="tag-indicator toplist"><i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List</span>`;
    }

    const inactiveClass = cfg.Active === false ? 'inactive' : '';
    const newClass = '';

    const html = `
        <div class="tag-row ${inactiveClass} ${newClass}" data-index="${idx}" data-tag="${escapeAttr(tagName.toLowerCase())}" data-last-modified="${escapeAttr(lastMod)}" data-dirty="false">
            <div class="tag-header" style="display:flex; align-items:center; justify-content:space-between; padding:10px; cursor:pointer;">
                <div style="display:flex; align-items:center;">
                    <div class="header-actions" style="margin-right:15px; display:flex; align-items:center;" onclick="event.stopPropagation()">
                        <div class="drag-handle">
                            <i class="md-icon">reorder</i>
                        </div>
                        <span class="lblActiveStatus" style="margin-right:8px; font-size:0.9em; font-weight:bold; color:${activeColor}; min-width:60px; text-align:right;">${activeText}</span>
                        <label class="checkboxContainer" style="margin:0;">
                            <input type="checkbox" is="emby-checkbox" class="chkTagActive" ${isChecked} />
                            <span></span>
                        </label>
                    </div>
                    <div class="tag-info" style="display:flex; align-items:center;">
                        <span class="source-badge">${sourceBadgeHtml}</span>
                        <span class="tag-title" style="font-weight:bold; font-size:1.1em;">${escapeHtml(labelName || tagName || 'New')}</span>
                        <span class="badge-container" style="display:flex; align-items:center;">${indicatorsHtml}</span>
                    </div>
                </div>
                <i class="md-icon expand-icon">expand_more</i>
            </div>
            <div class="tag-body" style="display:none; padding:15px; border-top:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; justify-content:flex-end; margin-bottom:4px;">
                    <button type="button" is="emby-button" class="btnDuplicateRow raised" style="background:transparent; color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0; box-shadow:none;" title="Duplicate this source"><i class="md-icon" style="font-size:1em; margin-right:4px;">content_copy</i><span>Duplicate</span></button>
                </div>
                <div class="tag-tabs" style="display: flex; gap: 20px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div class="tag-tab active" data-tab="general" style="padding: 8px 0; cursor: pointer; font-weight: bold; border-bottom: 2px solid #52B54B;">Source</div>
                    <div class="tag-tab" data-tab="tag" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Tag</div>
                    <div class="tag-tab" data-tab="collection" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Collection</div>
                    <div class="tag-tab" data-tab="playlist" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Playlist</div>
                    <div class="tag-tab" data-tab="schedule" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Schedule</div>
                    <div class="tag-tab" data-tab="advanced" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Blacklist</div>
                    <div class="tag-tab" data-tab="homescreen" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Home Screen</div>
                </div>

                <div class="tab-content general-tab">
                    <div class="inputContainer" style="flex-grow:1;"><input is="emby-input" class="txtEntryLabel" type="text" label="Display Name" value="${escapeAttr(labelName)}" /></div>

                    <div style="margin-bottom: 15px;">
                        <label class="selectLabel">Source Type</label>
                        <select is="emby-select" class="selSourceType" style="width:100%;">
                            <option value="" ${!sourceType ? 'selected' : ''}>-- Select source type --</option>
                            <option value="External" ${sourceType === 'External' ? 'selected' : ''}>External List (Trakt/MDBList/TMDb)</option>
                            <option value="LocalCollection" ${sourceType === 'LocalCollection' ? 'selected' : ''}>Local Collection</option>
                            <option value="LocalPlaylist" ${sourceType === 'LocalPlaylist' ? 'selected' : ''}>Local Playlist</option>
                            <option value="MediaInfo" ${sourceType === 'MediaInfo' ? 'selected' : ''}>Local Media Information (Smart Playlist)</option>
                            <option value="AI" ${sourceType === 'AI' ? 'selected' : ''}>AI created lists</option>
                        </select>
                        <p class="source-type-hint" style="margin:6px 0 0 0; font-size:1em; opacity:0.8; line-height:1.4;">${(function(st) {
                            if (st === 'External')         return 'Use an external list to tag, or create a collection, from the items that match your library.';
                            if (st === 'LocalCollection') return 'Every item in the selected collection(s) gets the configured tag or is added to a new collection. You can also use this to create a curated list of selected collections as a home screen section.';
                            if (st === 'LocalPlaylist')   return 'Every item in the selected playlist(s) gets the configured tag or is added to a new collection.';
                            if (st === 'MediaInfo')       return 'Filter your own library to select which movies or shows to tag or create a collection of. This is also known as a Smart Playlist.';
                            if (st === 'AI')              return 'Use AI to create a list. Write your prompt and the AI will build a list based on it.';
                            return '';
                        })(sourceType)}</p>
                    </div>

                    <div class="source-external-container" style="display: ${sourceType === 'External' ? 'block' : 'none'};">
                        <div style="display:flex; align-items:baseline; gap:10px; margin:10px 0 10px 0;">
                            <p style="margin:0; font-size:0.9em; font-weight:bold; opacity:0.7;">Source URLs</p>
                            <span style="font-size:0.75em; opacity:0.5;">— Find lists: <a href="https://trakt.tv/discover" target="_blank" style="color:inherit; text-decoration:underline;">Trakt</a> &middot; <a href="https://mdblist.com/toplists/" target="_blank" style="color:inherit; text-decoration:underline;">MDBList</a> &middot; <a href="https://www.themoviedb.org/" target="_blank" style="color:inherit; text-decoration:underline;">TMDb</a> &middot; <a href="https://developer.themoviedb.org/reference/getting-started" target="_blank" style="color:inherit; text-decoration:underline;">TMDb API</a></span>
                        </div>
                        <div class="url-list-container">${urls.map((u) => deps.getUrlRowHtml(u.url, u.limit)).join('')}</div>
                        <div style="margin-top:10px;"><button is="emby-button" type="button" class="raised btnAddUrl" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);"><i class="md-icon" style="margin-right:5px;">add</i>Add another URL</button></div>
                    </div>

                    <div class="source-local-container" style="display: ${(sourceType === 'LocalCollection' || sourceType === 'LocalPlaylist') ? 'block' : 'none'};">
                        <p style="margin:10px 0 10px 0; font-size:0.9em; font-weight:bold; opacity:0.7;" class="local-type-label">${sourceType === 'LocalPlaylist' ? 'Select Playlists' : 'Select Collections'}</p>
                        <div class="local-list-container">${localSources.map((ls) => deps.getLocalRowHtml(sourceType, ls.id, ls.limit)).join('')}</div>
                        <div style="margin-top:10px;"><button is="emby-button" type="button" class="raised btnAddLocal" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);"><i class="md-icon" style="margin-right:5px;">add</i>Add another</button></div>
                    </div>

                    <div class="source-ai-container" style="display: ${sourceType === 'AI' ? 'block' : 'none'};">
                        <div style="margin-bottom: 15px;">
                            <label class="selectLabel">AI Provider</label>
                            <select is="emby-select" class="selAiProvider" style="width:100%;">
                                <option value="OpenAI" ${(cfg.AiProvider || 'OpenAI') === 'OpenAI' ? 'selected' : ''}>OpenAI (ChatGPT)</option>
                                <option value="Gemini" ${(cfg.AiProvider || 'OpenAI') === 'Gemini' ? 'selected' : ''}>Google Gemini</option>
                                <option value="Claude" ${(cfg.AiProvider || 'OpenAI') === 'Claude' ? 'selected' : ''}>Anthropic Claude</option>
                                <option value="Ollama" ${(cfg.AiProvider || 'OpenAI') === 'Ollama' ? 'selected' : ''}>Ollama (Local)</option>
                            </select>
                        </div>

                        <div class="ollama-experimental-warning" style="display:${(cfg.AiProvider || 'OpenAI') === 'Ollama' ? 'flex' : 'none'}; align-items:flex-start; gap:8px; background:rgba(232,168,56,0.1); border:1px solid rgba(232,168,56,0.35); border-radius:4px; padding:10px 12px; margin-bottom:15px; font-size:0.85em; line-height:1.5;">
                            <i class="md-icon" style="font-size:1.1em; color:#e8a838; flex-shrink:0; margin-top:1px;">warning</i>
                            <span style="opacity:0.85;"><strong>Experimental:</strong> Ollama support is experimental. Local models may return inaccurate IMDB IDs — the plugin will fall back to title matching, but results <strong>WILL</strong> vary depending on the model used. Known limitations with local AI is the lack of new and updated information, and limited ability to research online. Cloud based models seems to be the best options for now. </span>
                        </div>

                        <div class="inputContainer" style="margin-bottom:15px;">
                            <textarea is="emby-textarea" class="txtAiPrompt" rows="3"
                                label="Prompt"
                                style="width:100%; resize:vertical; box-sizing:border-box;"
                                placeholder="e.g. Give me the best thriller movies from the 2000s">${escapeHtml(cfg.AiPrompt || '')}</textarea>
                            <div class="fieldDescription">Write your intent. The system will automatically format the output as a structured movie/show list. You don't need to specify a format.</div>
                        </div>

                        <div class="checkboxContainer checkboxContainer-withDescription" style="margin-top:12px;">
                            <label>
                                <input type="checkbox" is="emby-checkbox" class="chkAiRecentlyWatched" ${cfg.AiIncludeRecentlyWatched ? 'checked' : ''} />
                                <span>Include recently watched for personalization</span>
                            </label>
                            <div class="fieldDescription">Prepends the selected user's watch history to the AI prompt, enabling "Recommended for you" style lists.</div>
                        </div>

                        <div class="ai-recently-watched-options" style="display: ${cfg.AiIncludeRecentlyWatched ? 'block' : 'none'}; margin-top:10px; padding-left:10px; border-left:2px solid rgba(128,128,128,0.3);">
                            <div style="margin-bottom:10px;">
                                <label class="selectLabel">User for watch history</label>
                                <select is="emby-select" class="selAiWatchedUser" style="width:100%;">
                                    <option value="">-- Select user --</option>
                                    ${(deps.miUsers.users || []).map((u) => '<option value="' + escapeAttr(u.Id) + '"' + (u.Id === (cfg.AiRecentlyWatchedUserId || '') ? ' selected' : '') + '>' + escapeHtml(u.Name) + '</option>').join('')}
                                </select>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <label style="font-size:0.9em; white-space:nowrap; margin:0;">Recent items to include</label>
                                <input is="emby-input" class="txtAiWatchedCount" type="number" value="${cfg.AiRecentlyWatchedCount || 20}" min="5" max="100" style="width:80px;" />
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; margin-top:15px; margin-bottom:15px;">
                            <label style="font-size:0.9em; white-space:nowrap; margin:0;">Max items</label>
                            <input is="emby-input" class="txtAiLimit" type="number" value="${aiLimit}" min="0" style="width:90px;" />
                            <span style="font-size:0.8em; opacity:0.5;">0 = no limit. Injected into the prompt automatically.</span>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; margin-top:0; margin-bottom:15px;">
                            <label style="font-size:0.9em; white-space:nowrap; margin:0;">Refresh every</label>
                            <input is="emby-input" class="txtAiRefreshInterval" type="number" value="${cfg.AiRefreshIntervalDays || 0}" min="0" style="width:90px;" />
                            <span style="font-size:0.8em; opacity:0.5;">days &nbsp;(0 = run on every full sync)</span>
                        </div>

                        <div style="margin-top:0;">
                            <button type="button" is="emby-button" class="raised btnTestAiSource btn-neutral" style="background:transparent; border:1px solid rgba(128,128,128,0.4); color:var(--theme-text-secondary);">
                                <i class="md-icon" style="margin-right:5px;">science</i>Test AI Source
                            </button>
                            <span class="ai-test-result" style="margin-left:10px; font-size:0.85em; opacity:0.7;"></span>
                        </div>
                    </div>

                    <div class="source-mediainfo-container" style="display: ${(sourceType && sourceType !== '') ? 'block' : 'none'};">
                        <div class="mi-limit-row" style="display:${sourceType === 'MediaInfo' ? 'flex' : 'none'}; align-items:center; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                            <label style="font-size:0.9em; white-space:nowrap; margin:0;">Max items</label>
                            <input is="emby-input" class="txtMediaInfoLimit" type="number" value="${mediaInfoLimit}" min="0" style="width:90px;" />
                            <button type="button" is="emby-button" class="btnMiHelp raised" style="margin-left:auto; background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to (filter guide)</span></button>
                        </div>
                        <div class="mi-toggle-row" style="display:${sourceType === 'MediaInfo' || mediaFilters.length > 0 ? 'none' : 'block'}; padding-top:14px; border-top:1px solid var(--line-color);">
                            <button type="button" is="emby-button" class="btnToggleAdditionalFilters raised" style="background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.85em;"><i class="md-icon" style="font-size:1em; margin-right:4px;">filter_list</i><span>Add filters (optional)</span></button>
                        </div>
                        <div class="mi-filter-body" style="display:${sourceType === 'MediaInfo' || mediaFilters.length > 0 ? 'block' : 'none'};">
                            <div class="mi-help-btn-row" style="display:${sourceType === 'MediaInfo' ? 'none' : 'flex'}; margin-bottom:14px; padding-top:14px; border-top:1px solid var(--line-color);">
                                <button type="button" is="emby-button" class="btnMiHelp raised" style="margin-left:auto; background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to (filter guide)</span></button>
                            </div>
                            <div class="mediainfo-filter-list">${filterGroupsHtml}</div>
                            <div style="display:flex; gap:8px; margin-top:8px;">
                                <button type="button" is="emby-button" class="btnAddMediaInfoFilter raised" style="flex:1; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);"><i class="md-icon" style="margin-right:5px;">add</i>Add Filter Group</button>
                                <button type="button" is="emby-button" class="btnClearAllFilters raised" style="background:transparent; border:2px dashed rgba(204,51,51,0.4); color:#cc3333; padding:0 14px; min-width:0;" title="Clear all filters"><i class="md-icon" style="font-size:1em;">delete_sweep</i></button>
                            </div>
                            <div class="mi-presets-section" style="margin-top:30px; border-top:1px solid var(--line-color); padding-top:1px; display:${sourceType === 'MediaInfo' ? 'block' : 'none'};">
                            ${true ? `
                                <button type="button" is="emby-button" class="btnPremadeFilters raised btn-neutral" style="width:100%; margin-bottom:6px; background:transparent; border:1px solid var(--line-color); color:var(--theme-text-secondary); display:flex; align-items:center; justify-content:space-between;"><span><i class="md-icon" style="margin-right:5px;">auto_awesome</i>Premade filters</span><i class="md-icon mi-expand-icon" style="transition:transform 0.2s; font-size:1.2em;">expand_more</i></button>
                                <div class="mi-preset-panel" style="display:none; border:1px solid var(--line-color); border-radius:6px; padding:10px 12px; margin-bottom:8px; background:rgba(128,128,128,0.06);">
                                    <div style="font-size:0.8em; color:var(--theme-text-secondary); margin-bottom:10px;">Select a preset to replace the current filters:</div>
                                    ${MI_PRESETS.map((cat, ci) =>
                                        '<div style="margin-bottom:10px;">' +
                                            '<div style="font-size:0.72em; text-transform:uppercase; letter-spacing:1px; color:var(--theme-text-secondary); margin-bottom:5px;">' + cat.label + '</div>' +
                                            '<div style="display:flex; flex-wrap:wrap; gap:6px;">' +
                                            cat.presets.map((p, pi) =>
                                                '<button type="button" class="btnApplyMiPreset" data-preset="' + ci + ',' + pi + '"' +
                                                ' style="border:1.5px solid #000; border-radius:14px; padding:4px 12px; font-size:0.82em; cursor:pointer; background:transparent; color:var(--theme-text-primary);">' + p.name + '</button>',
                                            ).join('') + '</div></div>',
                                    ).join('')}
                                </div>
                                <button type="button" is="emby-button" class="btnMySavedFilters raised btn-neutral" style="width:100%; margin-bottom:6px; background:transparent; border:1px solid var(--line-color); color:var(--theme-text-secondary); display:flex; align-items:center; justify-content:space-between;"><span><i class="md-icon" style="margin-right:5px;">bookmarks</i>My saved filters</span><i class="md-icon mi-expand-icon" style="transition:transform 0.2s; font-size:1.2em;">expand_more</i></button>
                                <div class="mi-saved-panel" style="display:none; border:1px solid var(--line-color); border-radius:6px; padding:10px 12px; margin-bottom:8px; background:rgba(128,128,128,0.06);">
                                    <div style="font-size:0.8em; color:var(--theme-text-secondary); margin-bottom:10px;">Select a saved filter to replace the current filters:</div>
                                    <div class="mi-saved-panel-content">${deps.getMySavedFiltersPanelHtml(deps.savedFilters)}</div>
                                    <div style="border-top:1px solid var(--line-color); margin:12px 0 10px;"></div>
                                    <div style="font-size:0.8em; color:var(--theme-text-secondary); margin-bottom:6px;">Save current filter as:</div>
                                    <div class="mi-saveas-bar" style="display:flex; gap:6px; align-items:flex-start;">
                                        <input type="text" class="txtSaveFilterName emby-input" placeholder="Filter name..." style="flex:1; padding:4px 8px; font-size:0.85em;" />
                                        <button type="button" is="emby-button" class="btnConfirmSaveFilter raised" style="background:var(--button-background); color:var(--button-foreground); flex-shrink:0;">Save</button>
                                    </div>
                                </div>
                            ` : ''}
                            </div>
                        </div>
                    </div>

                </div>

            <div class="tab-content tagname-tab" style="display:none;">
                    <div class="inputContainer" style="flex-grow:1;"><input is="emby-input" class="txtTagName" type="text" label="Tag Name" value="${escapeAttr(tagName)}" placeholder="${escapeAttr(labelName)}" /></div>
                    <div class="tag-tab-controls" style="margin-top:10px;">
                        <div class="checkboxContainer checkboxContainer-withDescription">
                            <label>
                                <input is="emby-checkbox" type="checkbox" class="chkEnableTag" ${enableTag} />
                                <span>Apply Tag</span>
                            </label>
                            <div class="fieldDescription">Automatically tag matched items in Emby.</div>
                        </div>
                        <div class="tag-settings" style="margin-left: 20px; padding-left: 15px; border-left: 2px solid var(--line-color); margin-top: 10px; display: ${cfg.EnableTag !== false ? 'block' : 'none'};">
                            <div class="mi-tag-target-section" style="margin-top:4px;">
                                <div style="font-size:0.85em; opacity:0.6; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                                    <span>For TV shows, choose what level to tag:</span>
                                    <button type="button" is="emby-button" class="btnTagTargetHelp raised" style="background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to use</span></button>
                                </div>
                                <div style="display:flex; flex-direction:row; align-items:center; gap:20px;">
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkTagTargetSeries" ${_tagTargetSer ? 'checked' : ''} />
                                        <span>Series</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkTagTargetSeason" ${_tagTargetSea ? 'checked' : ''} />
                                        <span>Season</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkTagTargetEpisode" ${_tagTargetEp ? 'checked' : ''} />
                                        <span>Episode</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
            </div>

                <div class="tab-content schedule-tab" style="display:none;">
                    <p style="margin:0 0 15px 0; font-size:0.9em; opacity:0.8;">Define when this tag should be active. If empty, it's always active.</p>
                    <div class="date-list-container">${intervals.map((i) => deps.getDateRowHtml(i)).join('')}</div>
                    <button is="emby-button" type="button" class="btnAddDate" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary); margin-top:10px;"><i class="md-icon" style="margin-right:5px;">event</i>Add Schedule Rule</button>
                    <div class="checkboxContainer checkboxContainer-withDescription" style="margin-top:16px; ${intervals.length === 0 ? 'opacity:0.4;' : ''}">
                        <label>
                            <input is="emby-checkbox" type="checkbox" class="chkOverrideWhenActive" ${overrideChecked} ${intervals.length === 0 ? 'disabled' : ''} />
                            <span>Priority override when active</span>
                        </label>
                        <div class="fieldDescription">When this entry is in schedule, all other entries sharing the same tag or collection are suppressed — only this entry's items keep the tag and collection.</div>
                    </div>
                </div>

                <div class="tab-content collection-tab" style="display:none;">
                    <div class="collection-tab-controls">
                    <div class="checkboxContainer checkboxContainer-withDescription">
                        <label>
                            <input is="emby-checkbox" type="checkbox" class="chkEnableCollection" ${enableColl} />
                            <span>Create Collection</span>
                        </label>
                        <div class="fieldDescription">Automatically create and maintain an Emby Collection from these items.</div>
                    </div>

                    <div class="collection-settings" style="margin-left: 20px; padding-left: 15px; border-left: 2px solid var(--line-color); margin-top: 10px; display: ${cfg.EnableCollection ? 'block' : 'none'};">
                        <div class="inputContainer">
                            <input is="emby-input" type="text" class="txtCollectionName" label="Collection Name" value="${escapeAttr(collName)}" placeholder="${escapeAttr(labelName)}" />
                            <div class="fieldDescription">Leave empty to use Display Name.</div>
                        </div>

                        <div class="mi-coll-target-section" style="margin-top:10px;">
                            <div style="font-size:0.85em; opacity:0.6; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                                <span>For TV shows, choose what level to add to collection:</span>
                                <button type="button" is="emby-button" class="btnCollTargetHelp raised" style="background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to use</span></button>
                            </div>
                            <div style="display:flex; flex-direction:row; align-items:center; gap:20px;">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                    <input type="checkbox" is="emby-checkbox" class="chkCollTargetSeries" ${_collTargetSer ? 'checked' : ''} />
                                    <span>Series</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkCollTargetSeason" ${_collTargetSea ? 'checked' : ''} />
                                        <span>Season</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkCollTargetEpisode" ${_collTargetEp ? 'checked' : ''} />
                                        <span>Episode</span>
                                    </label>
                                </div>
                            </div>

                            <div class="inputContainer" style="margin-top:15px;">
                                <textarea is="emby-textarea" class="txtCollectionDescription" rows="3"
                                    label="Description"
                                    placeholder="Optional description for this collection..."
                                    style="width:100%; resize:vertical; box-sizing:border-box;">${escapeHtml(collDescription)}</textarea>
                            </div>

                            <div style="margin-top:15px;">
                                <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Collection Poster</p>
                                <div class="poster-preview-container" style="margin-bottom:8px; display:${collPosterPath ? 'block' : 'none'};">
                                    <span class="poster-filename" style="font-size:0.85em; opacity:0.7;">${collPosterPath ? escapeHtml(collPosterPath.split(/[\\\\/]/).pop()) : ''}</span>
                                    <button type="button" class="btnRemovePoster" style="margin-left:10px; font-size:0.8em; background:transparent; border:none; color:#e55; cursor:pointer; vertical-align:middle;">✕ Remove</button>
                                </div>
                                <img class="poster-preview-img" src="" alt="" style="max-width:120px; max-height:180px; border-radius:4px; display:none; margin-bottom:8px;" />
                                <input type="file" class="inputPosterFile" accept="image/*" style="display:none;" />
                                <input type="hidden" class="hiddenPosterPath" value="${escapeAttr(collPosterPath)}" />
                                <button type="button" is="emby-button" class="btnChoosePoster raised" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);">
                                    <i class="md-icon" style="margin-right:5px;">image</i>Choose Poster Image
                                </button>
                                <div style="display:flex; align-items:center; gap:6px; margin-top:8px; opacity:0.45;">
                                    <div style="flex:1; height:1px; background:currentColor;"></div>
                                    <span style="font-size:0.75em;">or</span>
                                    <div style="flex:1; height:1px; background:currentColor;"></div>
                                </div>
                                <div style="display:flex; gap:6px; margin-top:6px;">
                                    <input class="txtPosterUrl" is="emby-input" type="url" placeholder="https://example.com/poster.jpg" style="flex:1;" />
                                    <button type="button" is="emby-button" class="btnLoadPosterUrl raised btn-neutral">Load</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tab-content playlist-tab" style="display:none;"
                    data-pl-userids="${playlistUserIdsEnc}"
                    data-pl-mappings="${playlistMappingsEnc}"
                    data-pl-loaded="0">
                    <div class="checkboxContainer checkboxContainer-withDescription">
                        <label>
                            <input is="emby-checkbox" type="checkbox" class="chkEnablePlaylist" ${enablePlaylist} />
                            <span>Create Playlist</span>
                        </label>
                        <div class="fieldDescription">Automatically create and maintain an individual Emby Playlist for each selected user.</div>
                    </div>
                    <div class="playlist-settings" style="margin-left: 20px; padding-left: 15px; border-left: 2px solid var(--line-color); margin-top: 10px; display: ${cfg.EnablePlaylist ? 'block' : 'none'};">
                        <div class="inputContainer">
                            <input is="emby-input" type="text" class="txtPlaylistName" label="Playlist Name" value="${escapeAttr(playlistName)}" placeholder="${escapeAttr(labelName)}" />
                            <div class="fieldDescription">Leave empty to use Display Name.</div>
                        </div>
                        <div style="margin-top:12px;">
                            <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Target Users</p>
                            <div class="playlist-user-list"><em style="opacity:0.5">Loading users...</em></div>
                        </div>
                    </div>
                </div>

                <div class="tab-content advanced-tab" style="display:none;">
                    <div class="inputContainer">
                        <p style="margin:0 0 5px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Blacklist / Ignore (IMDB IDs)</p>
                        <textarea class="txtTagBlacklist" rows="2" placeholder="tt1234567&#10;tt9876543" style="width:100%;resize:none;overflow:hidden;padding:6px 8px;font-size:inherit;font-family:inherit;background:var(--plugin-input-bg,rgba(255,255,255,0.08));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.2));border-radius:3px;color:inherit;line-height:1.4;min-height:44px;max-height:120px;overflow-y:auto;">${escapeHtml(blacklist)}</textarea>
                        <div class="fieldDescription">Items with these IDs will never be tagged or added to collection.</div>
                    </div>
                </div>

                <div class="tab-content homescreen-tab" style="display:none;"
                    data-hse-libraryid="${homeSectionLibraryId}"
                    data-hse-userids="${homeSectionUserIdsEnc}"
                    data-hse-settings="${homeSectionSettingsEnc}"
                    data-hse-tracked="${homeSectionTrackedEnc}"
                    data-hse-default-type="${hsDefaultSectionType}"
                    data-hse-loaded="0">
                    <div class="checkboxContainer checkboxContainer-withDescription">
                        <label>
                            <input is="emby-checkbox" class="chkEnableHomeSection" type="checkbox" ${enableHomeSection} ${disableHomeSection}/>
                            <span>Add as home screen section</span>
                        </label>
                        <div class="fieldDescription">A home screen section will be managed for selected users each time sync runs.</div>
                        <div class="hse-disabled-hint" style="font-size:0.9em; color:#e07070; margin-top:4px; display:${(cfg.EnableTag === false && !cfg.EnableCollection && !_hseAllowedWithoutOutput) ? 'block' : 'none'};">Requires <strong>Apply Tag</strong>, <strong>Create Collection</strong>, or a current-user filter (Smart playlist) to be enabled.</div>
                    </div>
                    <div class="hse-details" style="display:${enableHomeSection ? 'block' : 'none'}; margin-top:15px;">
                        <div style="margin-bottom:15px;">
                            <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Target Users</p>
                            <div class="hse-user-list-inner"><em style="opacity:0.5">Loading users...</em></div>
                        </div>
                        <div>
                            <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Section Settings</p>
                            <div class="hse-fields-inner"><em style="opacity:0.5">Loading settings...</em></div>
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:20px; border-top:1px solid var(--line-color); padding-top:10px;">
                    <button is="emby-button" type="button" class="raised button-submit btnRunEntry" style="background:#0099d5 !important; color:#fff !important;"><i class="md-icon" style="margin-right:5px;">play_arrow</i><span class="btnRunEntryLabel">Run Group</span></button>
                    <button is="emby-button" type="button" class="raised btnRemoveGroup" style="background:#cc3333 !important; color:#fff;"><i class="md-icon" style="margin-right:5px;">delete</i>Remove Group</button>
                </div>
            </div>
        </div>`;

    return html;
}

// ─── refreshTopListBadges (kept from Phase 3) ────────────────────────────────

/**
 * Re-sync the "Top-List" indicator on every tag row's badge
 * container. Reads DOM only — the only state input is the
 * `topListTagNames` set, which the caller passes in.
 *
 * For each `.tag-row` in the document:
 *
 *   - If the row's `data-tag` (lower-cased) is in
 *     `topListTagNames`:
 *     - If a `.tag-indicator.toplist` is already present, leave it
 *       alone (idempotent).
 *     - Otherwise append a fresh `<span class="tag-indicator
 *       toplist">…</span>` containing the "Top-List" icon and label.
 *
 *   - If not in `topListTagNames`:
 *     - If a `.tag-indicator.toplist` exists, remove it.
 *     - Otherwise leave the row alone.
 *
 * @param topListTagNames  The set of tag names that currently back a
 *                         top-list (lower-cased). Mutation of this
 *                         set by the caller takes effect on the next
 *                         call; this function never writes to it.
 */
export function refreshTopListBadges(topListTagNames: ReadonlySet<string>): void {
    document.querySelectorAll('.tag-row').forEach((row) => {
        const container = row.querySelector('.badge-container');
        if (!container) return;
        const tagName = ((row as HTMLElement).dataset.tag || '').toLowerCase();
        const existing = container.querySelector('.tag-indicator.toplist');
        if (topListTagNames.has(tagName)) {
            if (!existing) {
                const span = document.createElement('span');
                span.className = 'tag-indicator toplist';
                span.innerHTML = '<i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List';
                container.appendChild(span);
            }
        } else if (existing) {
            existing.remove();
        }
    });
}