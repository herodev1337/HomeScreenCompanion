// Phase 3 wave 2: minimal shared types for the strict-typed migration.
//
// At the moment only `TagConfig` is consumed (by
// `modules/config/configState.ts`'s `groupConfigTags`). The shape is
// loose: only the fields `groupConfigTags` reads are typed, the rest
// are passed through to the next consumer (`getUiConfig`, etc.).
//
// This file will eventually be superseded by `types/dtos.ts` (per
// plan section 5.1 / 5.4), once we have a typed surface for every
// plugin DTO coming back from the .NET server. Until then it lives
// next to the only consumer that needs it.

/**
 * One row of the flat `Tags` array as stored in plugin configuration
 * (`lastHscConfig.Tags[]`). Each row represents one source or
 * condition attached to a `(Name, Tag)` group.
 *
 * Loose by design: `groupConfigTags` reads only a subset of fields,
 * and the downstream `getUiConfig` (still in legacy.js) tolerates
 * `undefined` for everything else. We declare the fields we use and
 * leave the rest optional so callers can synthesize test fixtures
 * without restating the full DTO.
 */
export interface TagConfig {
    Tag: string;
    Name?: string;
    Url?: string;
    LocalSourceId?: string;
    SourceType?: string;
    Limit?: number;
    Active?: boolean;
    Blacklist?: unknown;
    ActiveIntervals?: unknown;
    EnableTag?: boolean;
    EnableCollection?: unknown;
    CollectionName?: unknown;
    CollectionDescription?: string;
    CollectionPosterPath?: string;
    OnlyCollection?: unknown;
    OverrideWhenActive?: boolean;
    LastModified?: unknown;
    MediaInfoConditions?: unknown[];
    MediaInfoFilters?: unknown[];
    EnableHomeSection?: boolean;
    HomeSectionLibraryId?: string;
    HomeSectionUserIds?: string[];
    HomeSectionSettings?: string;
    HomeSectionTracked?: unknown[];
    AiProvider?: string;
    AiPrompt?: string;
    AiIncludeRecentlyWatched?: boolean;
    AiRecentlyWatchedUserId?: string;
    AiRecentlyWatchedCount?: number;
    TagTargetEpisode?: boolean;
    TagTargetSeason?: boolean;
    TagTargetSeries?: boolean;
    CollectionTargetEpisode?: boolean;
    CollectionTargetSeason?: boolean;
    CollectionTargetSeries?: boolean;
    EnablePlaylist?: boolean;
    PlaylistName?: string;
    PlaylistUserIds?: string[];
    PlaylistMappings?: unknown[];
}
