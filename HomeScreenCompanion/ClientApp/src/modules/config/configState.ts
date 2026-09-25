// D4 (configState.ts split): barrel re-export of the config modules.
//
// The legacy `configState.ts` (824 lines) is split into:
//
//   - `configSerialize.ts`  pure DOM walker that serializes the form
//                           (`getUiConfig`, `GetUiConfigDeps`).
//   - `dirtyState.ts`       dirty-state detection (`checkFormState`,
//                           `CheckFormStateDeps`) + dry-run banner.
//   - `tagFilterChips.ts`   tag-row filter (`applyFilters`).
//   - `updates.ts`          update-check footer (`checkForUpdates`,
//                           `CheckForUpdatesDeps`) — fixes the
//                           `release.html_url` href-injection at
//                           legacy.js:795 / :814.
//
// `configState.ts` also keeps `groupConfigTags` (and its
// `TagGroupConfig` shape) inline — those are used by the load/save
// pipeline in `modules/app/configIo.ts` (D1's file) and have no other
// callers. The other D1 callers (`configIo`, `viewLifecycle`, `index.ts`)
// keep importing from `'./config/configState'` via this barrel so the
// split is invisible to them.

import type { TagConfig } from './types/index';

/**
 * The grouped record produced by `groupConfigTags`. The legacy shape
 * carries every imaginable tag/collection/home-section/AI/playlist
 * field; we mirror it verbatim in the {@link TagGroupConfig} interface
 * below so the round-trip with the next-consumer (`getUiConfig` and
 * its callers) stays byte-equal.
 */
export interface TagGroupConfig {
    Tag: string;
    Name: string;
    Urls: { url: string; limit: number }[];
    LocalSources: { id: string; limit: number }[];
    Active: boolean;
    Blacklist: unknown;
    ActiveIntervals: unknown;
    EnableTag: boolean;
    EnableCollection: unknown;
    CollectionName: unknown;
    CollectionDescription: string;
    CollectionPosterPath: string;
    OnlyCollection: unknown;
    OverrideWhenActive: boolean;
    LastModified: unknown;
    SourceType: string;
    MediaInfoConditions: unknown[];
    MediaInfoFilters: unknown[];
    Limit: number;
    EnableHomeSection: boolean;
    HomeSectionLibraryId: string;
    HomeSectionUserIds: string[];
    HomeSectionSettings: string;
    HomeSectionTracked: unknown[];
    AiProvider: string;
    AiPrompt: string;
    AiIncludeRecentlyWatched: boolean;
    AiRecentlyWatchedUserId: string;
    AiRecentlyWatchedCount: number;
    TagTargetEpisode: boolean;
    TagTargetSeason: boolean;
    TagTargetSeries: boolean;
    CollectionTargetEpisode: boolean;
    CollectionTargetSeason: boolean;
    CollectionTargetSeries: boolean;
    EnablePlaylist: boolean;
    PlaylistName: string;
    PlaylistUserIds: string[];
    PlaylistMappings: unknown[];
}

/**
 * Group flat per-row `TagConfig[]` entries into one record per
 * `(Name, Tag)` (or just `Tag` when `Name` is absent).
 *
 * The legacy function uses `'\x1F'` (unit-separator) as the key
 * delimiter to defend against `:`-bearing names colliding with the
 * legacy `prop:val` serialization; we keep that byte-equal.
 *
 *   - `t.SourceType === 'External' && t.Url` → push to `Urls`.
 *   - `t.SourceType === 'LocalCollection' || t.SourceType === 'LocalPlaylist'` → push to `LocalSources`.
 *   - `t.SourceType === 'MediaInfo'` → record the row's `Limit`.
 *   - `t.SourceType === 'AI'` → record the row's `Limit`.
 *
 * Defaults match `legacy.js:3651-3672` exactly (including `Limit`
 * falling through to `0`, `Active` defaulting to true, etc.).
 *
 * @param tags  The flat array of per-row tag configs. Read-only; never
 *              mutated. Falsy input → empty `{}` map.
 * @returns     A `Record<string, TagGroupConfig>` keyed on the joined
 *              `Name + Tag` (or just `Tag`).
 */
export function groupConfigTags(
    tags: readonly TagConfig[] | null | undefined,
): Record<string, TagGroupConfig> {
    const grouped: Record<string, TagGroupConfig> = {};
    (tags ?? []).forEach((t) => {
        const key = t.Name ? t.Name + '\x1F' + t.Tag : t.Tag;
        if (!grouped[key]) {
            grouped[key] = {
                Tag: t.Tag,
                Name: t.Name || '',
                Urls: [],
                LocalSources: [],
                Active: t.Active !== false,
                Blacklist: t.Blacklist,
                ActiveIntervals: t.ActiveIntervals,
                EnableTag: t.EnableTag !== false,
                EnableCollection: t.EnableCollection,
                CollectionName: t.CollectionName,
                CollectionDescription: t.CollectionDescription || '',
                CollectionPosterPath: t.CollectionPosterPath || '',
                OnlyCollection: t.OnlyCollection,
                OverrideWhenActive: t.OverrideWhenActive || false,
                LastModified: t.LastModified,
                SourceType: t.SourceType || 'External',
                MediaInfoConditions: t.MediaInfoConditions || [],
                MediaInfoFilters: t.MediaInfoFilters || [],
                Limit: t.Limit || 0,
                EnableHomeSection: t.EnableHomeSection || false,
                HomeSectionLibraryId: t.HomeSectionLibraryId || 'auto',
                HomeSectionUserIds: t.HomeSectionUserIds || [],
                HomeSectionSettings: t.HomeSectionSettings || '{}',
                HomeSectionTracked: t.HomeSectionTracked || [],
                AiProvider: t.AiProvider || 'OpenAI',
                AiPrompt: t.AiPrompt || '',
                AiIncludeRecentlyWatched: t.AiIncludeRecentlyWatched || false,
                AiRecentlyWatchedUserId: t.AiRecentlyWatchedUserId || '',
                AiRecentlyWatchedCount: t.AiRecentlyWatchedCount || 20,
                TagTargetEpisode: t.TagTargetEpisode || false,
                TagTargetSeason: t.TagTargetSeason || false,
                TagTargetSeries: t.TagTargetSeries || false,
                CollectionTargetEpisode: t.CollectionTargetEpisode || false,
                CollectionTargetSeason: t.CollectionTargetSeason || false,
                CollectionTargetSeries: t.CollectionTargetSeries || false,
                EnablePlaylist: t.EnablePlaylist || false,
                PlaylistName: t.PlaylistName || '',
                PlaylistUserIds: t.PlaylistUserIds || [],
                PlaylistMappings: t.PlaylistMappings || [],
            };
        }
        if (t.SourceType === 'External' && t.Url) {
            grouped[key]!.Urls.push({ url: t.Url, limit: t.Limit ?? 0 });
        }
        if ((t.SourceType === 'LocalCollection' || t.SourceType === 'LocalPlaylist') && t.LocalSourceId) {
            grouped[key]!.LocalSources.push({ id: t.LocalSourceId, limit: t.Limit ?? 0 });
        }
        if (t.SourceType === 'MediaInfo') grouped[key]!.Limit = t.Limit ?? 0;
        if (t.SourceType === 'AI') grouped[key]!.Limit = t.Limit ?? 0;
    });
    return grouped;
}

// ─── Barrel re-exports from the D4 sibling modules ───────────────────────────

export { getUiConfig, type GetUiConfigDeps } from './configSerialize';
export { checkFormState, updateDryRunWarning, type CheckFormStateDeps } from './dirtyState';
export { applyFilters } from './tagFilterChips';
export { checkForUpdates, type CheckForUpdatesDeps } from './updates';
