// D4 (form.ts split): barrel re-export of the home-sections modules.
//
// The legacy `form.ts` (951 lines) is split into:
//
//   - `hseCriteria.ts`     pure predicates (`tagConfigHasViewerCriteria`,
//                          `rowHasViewerCriteria`).
//   - `hseVisibility.ts`   DOM-only visibility / disabled-state helpers.
//   - `formHtml.ts`        pure HTML-string builder for the form.
//   - `hseSync.ts`         network sync (`syncHomeSectionFromEmby`).
//   - `hseTabInit.ts`      tab initializers + enable-section toggle.
//
// `form.ts` now only re-exports the public surface so the existing
// call sites (`modules/index.ts`, `modules/homesections/form.test.ts`)
// keep working without an import-path change.

export {
    tagConfigHasViewerCriteria,
    rowHasViewerCriteria,
    type HseMediaInfoFilterGroupLike,
    type TagConfigForFilters,
} from './hseCriteria';

export {
    updateHseItemsOnlyVisibility,
    updateHseImageTypeState,
    wireHomeSectionTypeChange,
    refreshHseSectionTypeOptions,
} from './hseVisibility';

export {
    buildHomeSectionFormHtml,
    type HseLibraryOption,
    type HseLibraryWithFlag,
    type HseSavedSettings,
} from './formHtml';

export {
    syncHomeSectionFromEmby,
    type HomeSectionApiClient,
    type SyncHomeSectionDeps,
} from './hseSync';

export {
    initPlaylistTab,
    initHomeSectionTab,
    updateHseSectionAvailability,
    type InitPlaylistTabDeps,
    type InitHomeSectionTabDeps,
    type UpdateHseSectionAvailabilityDeps,
} from './hseTabInit';
