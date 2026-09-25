// Phase 3 wave 2: configuration state helpers, leaf module.
//
// Lifted from `Configuration/configPage.js` (legacy.js). Two helpers
// extracted in the original wave, four deferred functions added in the
// state-wiring wave:
//
//   - `updateDryRunWarning(originalConfigState)` — toggles the
//     `.dry-run-warning` element's display based on `DryRunMode` in the
//     parsed `originalConfigState`. Reads `document.querySelector`
//     (DOM-only); the only closure-bound input was `originalConfigState`,
//     which is now a parameter.
//
//   - `groupConfigTags(tags)` — merges flat per-row config entries
//     (one row per external URL / local source / MediaInfo condition)
//     into grouped records keyed on `(Name, Tag)` or just `Tag`. The
//     legacy code reads `_miUsers`, `cachedCollections`,
//     `cachedPlaylists`, `cachedTags` — but `groupConfigTags` itself
//     only reads `t.*`; it's pure given inputs.
//
//   - `getUiConfig(view, forComparison, deps)` (legacy.js:3280-3480) —
//     walks the entire config DOM and serializes it to the saved-config
//     payload (Trakt/Mdblist/TMDB keys, the `Tags[]` array of per-row
//     flat tags, `SavedFilters`, HSC fields). Reads `savedFilters` and
//     `lastHscConfig` from deps; preserves every legacy quirk including
//     the `forComparison` placeholder rows for empty External/Local
//     source-type rows.
//
//   - `checkFormState(deps)` (legacy.js:3482-3514) — computes the
//     `isDirty` flag by comparing `JSON.stringify(getUiConfig(view, true))`
//     against the saved snapshot, then toggles the `.btn-save` enabled
//     state. Also picks up the three other dirty markers that the
//     siblings (manage / tag-manage / toplists) write into the DOM.
//
//   - `applyFilters(view)` (legacy.js:3530-3591) — pure DOM walk that
//     toggles `.tag-row` visibility based on the filter dropdown's
//     checkbox state + free-text search. No deps; reads only its `view`.
//
//   - `checkForUpdates(view, deps)` (legacy.js:3593-3627) — fetches the
//     installed plugin version via the Jellyfin `ApiClient.getUrl`
//     path, then the latest GitHub release tag, and stamps
//     `#footerVersionText` / `#footerUpdateInfo` accordingly.
//
// The `_hsePlaystate` → `_queryIsPlayed`/`_queryIsResumable` translation
// referenced in the original `readRowAsConfig` (legacy.js:796-800) lives
// in `modules/filters/rows.ts`; the lifted `getUiConfig` keeps the
// `hseSettings._hsePlaystate` field as the legacy DOM had it (preserving
// the byte-equal serialization) and `readRowAsConfig` is the only
// caller that translates it.

import { buildCriterion } from '../filters/criteria';
import type {
    HscState,
    MiUsersState,
    OriginalConfigStateRef,
    SavedFiltersState,
} from '../state/state';
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

/**
 * Toggle the dry-run warning banner.
 *
 * Looks up `#HomeScreenCompanionConfigPage .dry-run-warning` and sets
 * `style.display` based on `savedConfig.DryRunMode`. Mirrors
 * `legacy.js:3516-3528`. The legacy closure read `originalConfigState`;
 * here we take it as a parameter so the helper is testable in
 * isolation.
 *
 * @param originalConfigState  The JSON-encoded saved-config snapshot.
 *                              `null` or a parse error → the banner
 *                              hides. The `JSON.parse` failure path
 *                              is swallowed by the inner try/catch
 *                              (matching legacy behavior — losing the
 *                              banner on a corrupt snapshot is fine).
 */
export function updateDryRunWarning(originalConfigState: string | null): void {
    const view = document.querySelector('#HomeScreenCompanionConfigPage');
    if (!view || !originalConfigState) return;
    const warn = view.querySelector<HTMLElement>('.dry-run-warning');
    if (warn) {
        try {
            const savedConfig = JSON.parse(originalConfigState) as { DryRunMode?: boolean };
            warn.style.display = savedConfig.DryRunMode ? 'flex' : 'none';
        } catch {
            warn.style.display = 'none';
        }
    }
}

/**
 * Dependencies for {@link getUiConfig}. The legacy module-scope state
 * holders lifted to an explicit surface:
 *
 *   - `hsc`              `lastHscConfig` snapshot. The fallback when
 *                        the HSC DOM controls are absent.
 *   - `savedFilters`     the `SavedFilters` array written verbatim to
 *                        the serialized config.
 *   - `miUsers`          the cached MI users list. Carried as a future
 *                        hook — the legacy `getUiConfig` body does not
 *                        read `_miUsers` directly, but the dependency
 *                        is here so the eventual swap to
 *                        {@link readRowAsConfig} can pass it through.
 *   - `readRowAsConfig`  future hook for the lifted per-row reader
 *                        (`modules/filters/rows.ts`). Not invoked by
 *                        the legacy body — `getUiConfig` walks the DOM
 *                        inline — but injected now so the factory can
 *                        wire it without a future signature change.
 */
export interface GetUiConfigDeps {
    readonly hsc: HscState;
    readonly savedFilters: SavedFiltersState;
    readonly miUsers: MiUsersState;
    readonly readRowAsConfig: (row: HTMLElement) => unknown;
}

/**
 * Walk the entire config form and serialize it to the saved-config
 * payload (legacy.js:3280-3480).
 *
 * Reads every `.tag-row` and assembles the flat `Tags[]` array (one
 * entry per External URL, LocalSource, AI row, or MediaInfo row —
 * preserving the `forComparison` placeholder rows for empty
 * External/Local source-type rows). Then reads the API keys, log
 * toggles, and HSC fields, falling back to `deps.hsc.config` whenever
 * the corresponding DOM control is missing.
 *
 * Quirks preserved verbatim:
 *   - `var bl = blInput ? blInput.value.split(...).filter(...) : []`
 *     handles missing `.txtTagBlacklist`.
 *   - `SpecificDate` keeps raw `txtFullStartDate` / `txtFullEndDate`
 *     values; `EveryYear` pads to `2000-MM-DD`; `Weekly` joins the
 *     active day-toggle dataset values.
 *   - `MediaType:Episode` + `.chkIncludeParentSeries` checked →
 *     value rewritten to `EpisodeIncludeSeries`.
 *   - `.selMiProperty` and the `.btnNotToggle` toggle use the legacy
 *     `(el || {}).value` / `el.dataset.not === '1'` fallbacks.
 *   - Playlist user IDs come from either the live checkboxes
 *     (`dataset.plLoaded === '1'`) or the persisted `dataset.plUserids`
 *     URL-encoded JSON.
 *   - HSE user IDs / library ID / settings use the same dual path
 *     (live `[data-field]` / persisted `dataset.hseSettings`).
 *   - `_hsePlaystate` is left as-is (translation lives in
 *     `modules/filters/rows.ts:readRowAsConfig`).
 *   - `forComparison: true` pushes an empty placeholder row for
 *     External/Local source-type rows that have no children so the
 *     diff against the saved snapshot doesn't lose them.
 *   - The AI branch uses `(el || {}).value || 'OpenAI' || '20' || '0'`
 *     fallbacks for missing controls.
 *
 * @param view          The config page root (`#HomeScreenCompanionConfigPage`).
 * @param forComparison When `true`, placeholder rows are pushed for
 *                      empty External/Local source-type rows so the
 *                      returned payload is comparable to the saved
 *                      snapshot (`checkFormState` uses `true`).
 * @param deps          The typed state holders. `hsc.config` provides
 *                      the fallback HSC values; `savedFilters.filters`
 *                      is written verbatim as `SavedFilters`.
 * @returns             The full config payload (legacy returns an
 *                      object literal — typed `unknown` because the
 *                      shape is loose and indexed by string keys).
 */
export function getUiConfig(
    view: HTMLElement,
    forComparison: boolean,
    deps: GetUiConfigDeps,
): unknown {
    const flatTags: Record<string, unknown>[] = [];
    view.querySelectorAll('.tag-row').forEach((row) => {
        const rowEl = row as HTMLElement;
        if (!rowEl.querySelector('.txtEntryLabel')) return;
        const entryLabel = (rowEl.querySelector<HTMLInputElement>('.txtEntryLabel')!).value;
        const name = (rowEl.querySelector<HTMLInputElement>('.txtTagName')!).value || entryLabel;
        const active = rowEl.querySelector<HTMLInputElement>('.chkTagActive')!.checked;

        const blInput = rowEl.querySelector<HTMLInputElement>('.txtTagBlacklist');
        const bl: string[] = blInput
            ? blInput.value
                .split(/[\n\r]+/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
            : [];

        const enableTagChk = rowEl.querySelector<HTMLInputElement>('.chkEnableTag')!.checked;
        const enableColl = rowEl.querySelector<HTMLInputElement>('.chkEnableCollection')!.checked;
        const overrideWhenActive = !!rowEl.querySelector<HTMLInputElement>('.chkOverrideWhenActive')?.checked;

        const collName = rowEl.querySelector<HTMLInputElement>('.txtCollectionName')!.value;
        const collDescription = rowEl.querySelector<HTMLInputElement>('.txtCollectionDescription')
            ? rowEl.querySelector<HTMLInputElement>('.txtCollectionDescription')!.value
            : '';
        const collPoster = rowEl.querySelector<HTMLInputElement>('.hiddenPosterPath')
            ? rowEl.querySelector<HTMLInputElement>('.hiddenPosterPath')!.value
            : '';

        const intervals: { Type: string; Start: string | null; End: string | null; DayOfWeek: string }[] = [];
        rowEl.querySelectorAll<HTMLElement>('.date-row').forEach((dr) => {
            const type = dr.querySelector<HTMLSelectElement>('.selDateType')!.value;
            let s: string | null = null;
            let e: string | null = null;
            let days = '';

            if (type === 'SpecificDate') {
                s = dr.querySelector<HTMLInputElement>('.txtFullStartDate')!.value;
                e = dr.querySelector<HTMLInputElement>('.txtFullEndDate')!.value;
            } else if (type === 'EveryYear') {
                const sM = dr.querySelector<HTMLSelectElement>('.selStartMonth')!.value;
                const sD = dr.querySelector<HTMLSelectElement>('.selStartDay')!.value;
                const eM = dr.querySelector<HTMLSelectElement>('.selEndMonth')!.value;
                const eD = dr.querySelector<HTMLSelectElement>('.selEndDay')!.value;
                s = `2000-${sM.padStart(2, '0')}-${sD.padStart(2, '0')}`;
                e = `2000-${eM.padStart(2, '0')}-${eD.padStart(2, '0')}`;
            } else if (type === 'Weekly') {
                const activeBtns = Array.from(dr.querySelectorAll<HTMLElement>('.day-toggle.active'))
                    .map((b) => b.dataset.day);
                days = activeBtns.join(',');
            }

            intervals.push({ Type: type, Start: s || null, End: e || null, DayOfWeek: days });
        });

        const currentLastMod = rowEl.dataset.lastModified || new Date().toISOString();

        const st = rowEl.querySelector<HTMLSelectElement>('.selSourceType')!.value;
        const miFilters: { Operator: string; Criteria: string[]; GroupOperator: string }[] = [];
        rowEl.querySelectorAll<HTMLElement>('.mediainfo-filter-group').forEach((group, gi) => {
            const operator = group.dataset.op || 'AND';
            const groupOp = gi === 0 ? 'AND' : (group.dataset.groupOp || 'AND');
            const criteria: string[] = [];
            group.querySelectorAll<HTMLElement>('.mi-rule').forEach((rule) => {
                const prop = rule.querySelector<HTMLSelectElement>('.selMiProperty')?.value || '';
                const selVal = rule.querySelector<HTMLInputElement>('.selMiValue');
                const txtVal = rule.querySelector<HTMLInputElement>('.txtMiValue');
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
                const isNot = notBtn && notBtn.dataset.not === '1';
                const crit = buildCriterion(prop, finalOp, finalVal, userId);
                if (crit) criteria.push(isNot ? '!' + crit : crit);
            });
            if (criteria.length > 0) miFilters.push({ Operator: operator, Criteria: criteria, GroupOperator: groupOp });
        });

        const plTab2 = rowEl.querySelector<HTMLElement>('.playlist-tab');
        let plUserIds2: string[];
        if (plTab2 && plTab2.dataset.plLoaded === '1') {
            plUserIds2 = Array.from(plTab2.querySelectorAll<HTMLInputElement>('.chkPlaylistUser:checked')).map((c) => c.value);
        } else {
            try {
                plUserIds2 = JSON.parse(decodeURIComponent((plTab2 && plTab2.dataset.plUserids) || '%5B%5D')) as string[];
            } catch {
                plUserIds2 = [];
            }
        }

        const hseTab = rowEl.querySelector<HTMLElement>('.homescreen-tab');
        const enableHse = hseTab ? !!hseTab.querySelector<HTMLInputElement>('.chkEnableHomeSection')?.checked : false;
        let hseLibraryId: string;
        if (hseTab && hseTab.dataset.hseLoaded === '1') {
            hseLibraryId = hseTab.querySelector<HTMLSelectElement>('.selHseLibrary')?.value || 'auto';
        } else {
            hseLibraryId = decodeURIComponent((hseTab && hseTab.dataset.hseLibraryid) || 'auto');
        }
        let hseUserIds: string[];
        if (hseTab && hseTab.dataset.hseLoaded === '1') {
            hseUserIds = Array.from(hseTab.querySelectorAll<HTMLInputElement>('.chkHseUser:checked')).map((c) => c.value);
        } else {
            try {
                hseUserIds = JSON.parse(decodeURIComponent((hseTab && hseTab.dataset.hseUserids) || '%5B%5D')) as string[];
            } catch {
                hseUserIds = [];
            }
        }
        let hseSettings: Record<string, unknown> = {};
        if (hseTab && hseTab.dataset.hseLoaded === '1') {
            hseTab.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
                const f = el.dataset.field;
                if (!f) return;
                const inputEl = el as HTMLInputElement;
                const v = inputEl.type === 'checkbox' ? String(inputEl.checked) : inputEl.value;
                hseSettings[f] = v;
            });
            const itemTypesVal = hseTab.querySelector<HTMLSelectElement>('.selHseItemTypes')?.value || 'Movie,Series';
            hseSettings['ItemTypes'] = JSON.stringify(itemTypesVal.split(','));
            const excludedLibIds = Array.from(hseTab.querySelectorAll<HTMLInputElement>('.chkHseLibrary:not(:checked)')).map((c) => c.value);
            if (excludedLibIds.length > 0) {
                hseSettings['_queryExcludeViewIds'] = excludedLibIds.join(',');
                hseSettings['ExcludedFolders'] = excludedLibIds.join(',');
            } else {
                delete hseSettings['_queryExcludeViewIds'];
                delete hseSettings['ExcludedFolders'];
            }
        } else {
            try {
                hseSettings = JSON.parse(decodeURIComponent((hseTab && hseTab.dataset.hseSettings) || '%7B%7D')) as Record<string, unknown>;
            } catch {
                hseSettings = {};
            }
        }
        let hseTracked: unknown[];
        try {
            hseTracked = JSON.parse(decodeURIComponent((hseTab && hseTab.dataset.hseTracked) || '%5B%5D')) as unknown[];
        } catch {
            hseTracked = [];
        }

        const baseTag: Record<string, unknown> = {
            Name: entryLabel,
            Tag: name,
            Active: active,
            Blacklist: bl,
            ActiveIntervals: intervals,
            EnableTag: enableTagChk,
            EnableCollection: enableColl,
            CollectionName: collName,
            CollectionDescription: collDescription,
            CollectionPosterPath: collPoster,
            OnlyCollection: false,
            OverrideWhenActive: overrideWhenActive,
            LastModified: currentLastMod,
            SourceType: st,
            MediaInfoFilters: miFilters,
            MediaInfoConditions: [],
            TagTargetEpisode: !!rowEl.querySelector<HTMLInputElement>('.chkTagTargetEpisode')?.checked,
            TagTargetSeason: !!rowEl.querySelector<HTMLInputElement>('.chkTagTargetSeason')?.checked,
            TagTargetSeries: !!rowEl.querySelector<HTMLInputElement>('.chkTagTargetSeries')?.checked,
            CollectionTargetEpisode: !!rowEl.querySelector<HTMLInputElement>('.chkCollTargetEpisode')?.checked,
            CollectionTargetSeason: !!rowEl.querySelector<HTMLInputElement>('.chkCollTargetSeason')?.checked,
            CollectionTargetSeries: !!rowEl.querySelector<HTMLInputElement>('.chkCollTargetSeries')?.checked,
            MediaInfoTargetEpisode: false,
            MediaInfoTargetSeason: false,
            MediaInfoTargetSeries: false,
            MediaInfoTargetType: '',
            MediaInfoSeasonMode: false,
            EnableHomeSection: enableHse,
            HomeSectionLibraryId: hseLibraryId,
            HomeSectionUserIds: hseUserIds,
            HomeSectionSettings: JSON.stringify(hseSettings),
            HomeSectionTracked: hseTracked,
            EnablePlaylist: !!rowEl.querySelector<HTMLInputElement>('.chkEnablePlaylist')?.checked,
            PlaylistName: rowEl.querySelector<HTMLInputElement>('.txtPlaylistName')?.value || '',
            PlaylistUserIds: plUserIds2,
            PlaylistMappings: (() => {
                try {
                    return JSON.parse(decodeURIComponent((plTab2 && plTab2.dataset.plMappings) || '%5B%5D')) as unknown[];
                } catch {
                    return [];
                }
            })(),
        };

        if (st === 'External') {
            let pushedExternal = false;
            rowEl.querySelectorAll<HTMLElement>('.url-row').forEach((uRow) => {
                const urlVal = uRow.querySelector<HTMLInputElement>('.txtTagUrl')!.value.trim();
                const limitVal = parseInt(uRow.querySelector<HTMLInputElement>('.txtUrlLimit')!.value, 10) || 0;
                if (urlVal) {
                    flatTags.push(Object.assign({}, baseTag, { Url: urlVal, Limit: limitVal, LocalSourceId: '' }));
                    pushedExternal = true;
                }
            });
            if (forComparison && !pushedExternal) {
                flatTags.push(Object.assign({}, baseTag, { Url: '', Limit: 0, LocalSourceId: '' }));
            }
        } else if (st === 'LocalCollection' || st === 'LocalPlaylist') {
            let pushedLocal = false;
            rowEl.querySelectorAll<HTMLElement>('.local-row').forEach((lRow) => {
                const localVal = lRow.querySelector<HTMLSelectElement>('.selLocalSource')!.value;
                const limitVal = parseInt(lRow.querySelector<HTMLInputElement>('.txtLocalLimit')!.value, 10) || 0;
                if (localVal) {
                    flatTags.push(Object.assign({}, baseTag, { Url: '', Limit: limitVal, LocalSourceId: localVal }));
                    pushedLocal = true;
                }
            });
            if (forComparison && !pushedLocal) {
                flatTags.push(Object.assign({}, baseTag, { Url: '', Limit: 0, LocalSourceId: '' }));
            }
        } else if (st === 'AI') {
            const aiLimitVal = parseInt(rowEl.querySelector<HTMLInputElement>('.txtAiLimit')?.value ?? '0', 10) || 0;
            flatTags.push(Object.assign({}, baseTag, {
                Url: '', Limit: aiLimitVal, LocalSourceId: '',
                AiProvider: rowEl.querySelector<HTMLSelectElement>('.selAiProvider')?.value || 'OpenAI',
                AiPrompt: rowEl.querySelector<HTMLTextAreaElement>('.txtAiPrompt')?.value || '',
                AiIncludeRecentlyWatched: !!rowEl.querySelector<HTMLInputElement>('.chkAiRecentlyWatched')?.checked,
                AiRecentlyWatchedUserId: rowEl.querySelector<HTMLSelectElement>('.selAiWatchedUser')?.value || '',
                AiRecentlyWatchedCount: parseInt(rowEl.querySelector<HTMLInputElement>('.txtAiWatchedCount')?.value || '20', 10) || 20,
                AiRefreshIntervalDays: parseInt(rowEl.querySelector<HTMLInputElement>('.txtAiRefreshInterval')?.value || '0', 10) || 0,
            }));
        } else {
            const miLimitVal = parseInt(rowEl.querySelector<HTMLInputElement>('.txtMediaInfoLimit')?.value ?? '0', 10) || 0;
            flatTags.push(Object.assign({}, baseTag, { Url: '', Limit: miLimitVal, LocalSourceId: '' }));
        }
    });

    const hscEnabled = view.querySelector<HTMLInputElement>('#chkHscEnabled');
    const hscSource = view.querySelector<HTMLSelectElement>('#selHscSourceUser');
    const hscLibraryOrder = view.querySelector<HTMLInputElement>('#chkHscLibraryOrder');

    return {
        TraktClientId: view.querySelector<HTMLInputElement>('#txtTraktClientId')!.value,
        MdblistApiKey: view.querySelector<HTMLInputElement>('#txtMdblistApiKey')!.value,
        TmdbApiKey: view.querySelector<HTMLInputElement>('#txtTmdbApiKey')!.value,
        OpenAiApiKey: view.querySelector<HTMLInputElement>('#txtOpenAiApiKey')?.value || '',
        OpenAiModel: view.querySelector<HTMLInputElement>('#txtOpenAiModel')?.value || 'gpt-4o-mini',
        GeminiApiKey: view.querySelector<HTMLInputElement>('#txtGeminiApiKey')?.value || '',
        GeminiModel: view.querySelector<HTMLInputElement>('#txtGeminiModel')?.value || 'gemini-2.5-flash-lite',
        ClaudeApiKey: view.querySelector<HTMLInputElement>('#txtClaudeApiKey')?.value || '',
        ClaudeModel: view.querySelector<HTMLInputElement>('#txtClaudeModel')?.value || 'claude-haiku-4-5-20251001',
        OllamaBaseUrl: view.querySelector<HTMLInputElement>('#txtOllamaBaseUrl')?.value || 'http://localhost:11434',
        OllamaModel: view.querySelector<HTMLInputElement>('#txtOllamaModel')?.value || '',
        AiSystemPrompt: view.querySelector<HTMLTextAreaElement>('#txtAiSystemPrompt')?.value || '',
        ExtendedConsoleOutput: view.querySelector<HTMLInputElement>('#chkExtendedConsoleOutput')!.checked,
        LogMissingItems: view.querySelector<HTMLInputElement>('#chkLogMissingItems')!.checked,
        DryRunMode: view.querySelector<HTMLInputElement>('#chkDryRunMode')!.checked,
        PreserveTagsOnEmptyResult: view.querySelector<HTMLInputElement>('#chkPreserveTagsOnEmptyResult')!.checked,
        Tags: flatTags,
        SavedFilters: deps.savedFilters.filters,
        HomeSyncEnabled: hscEnabled ? hscEnabled.checked : (deps.hsc.config.HomeSyncEnabled || false),
        HomeSyncLibraryOrder: hscLibraryOrder ? hscLibraryOrder.checked : (deps.hsc.config.HomeSyncLibraryOrder || false),
        HomeSyncSourceUserId: hscSource ? (hscSource.value || '') : (deps.hsc.config.HomeSyncSourceUserId || ''),
        HomeSyncTargetUserIds: hscEnabled
            ? Array.from(view.querySelectorAll<HTMLInputElement>('.hsc-target-chk:checked')).map((c) => c.value)
            : (deps.hsc.config.HomeSyncTargetUserIds || []),
    };
}

/**
 * Dependencies for {@link checkFormState}. The factory binds
 * `getUiConfig` with the `GetUiConfigDeps` once per view-show and
 * passes the resulting function here, so this deps object only carries
 * the per-call inputs:
 *
 *   - `view`              The config page root. When `null`, the call
 *                         is a no-op (legacy.js:3484 guards with
 *                         `!view || !originalConfigState`).
 *   - `originalConfigState` The saved snapshot ref. The dirty check
 *                         runs only when its current value is truthy.
 *   - `getUiConfig`       The pre-bound `getUiConfig` (factory wires
 *                         the `GetUiConfigDeps`).
 */
export interface CheckFormStateDeps {
    readonly view: HTMLElement | null;
    readonly originalConfigState: OriginalConfigStateRef;
    readonly getUiConfig: typeof getUiConfig;
}

/**
 * Recompute the form's dirty flag and toggle `.btn-save` accordingly
 * (legacy.js:3482-3514).
 *
 *   1. `isDirty` starts as `false`; if `JSON.stringify(getUiConfig(view, true))`
 *      differs from `originalConfigState` (or the stringify throws), it's
 *      flipped to `true`.
 *   2. The apply-manage button being enabled, the tag-manage container's
 *      `_tcHasPending` flag, or the presence of a `.tag-body[data-dirty="1"]`
 *      in the toplists container each force `isDirty = true`.
 *   3. `.btn-save` is enabled iff `isDirty`; while the sync button's
 *      `<span>` text contains "progress", the button is force-disabled
 *      regardless of `isDirty`.
 *
 * When either `view` or `originalConfigState` is missing, the call is a
 * silent no-op.
 *
 * @param deps  See {@link CheckFormStateDeps}.
 */
export function checkFormState(deps: CheckFormStateDeps): void {
    const view = deps.view;
    const originalConfigState = deps.originalConfigState.getOriginalConfigState();
    if (!view || !originalConfigState) return;

    let isDirty = false;
    try {
        const current = JSON.stringify(deps.getUiConfig(view, true, {
            hsc: { config: {} },
            savedFilters: { filters: [] },
            miUsers: { users: null },
            readRowAsConfig: () => ({}),
        }));
        isDirty = current !== originalConfigState;
    } catch {
        isDirty = true;
    }

    const btnApplyManage = view.querySelector<HTMLButtonElement>('#btnApplyManage');
    if (btnApplyManage && !btnApplyManage.disabled) isDirty = true;

    const tcContainer = view.querySelector<HTMLElement>('#tcManageContainer') as (HTMLElement & { _tcHasPending?: boolean }) | null;
    if (tcContainer && tcContainer._tcHasPending) isDirty = true;

    const tlContainer = view.querySelector<HTMLElement>('#tlContainer');
    if (tlContainer && tlContainer.querySelector('.tag-body[data-dirty="1"]')) isDirty = true;

    const btnSave = view.querySelector<HTMLButtonElement>('.btn-save');
    if (btnSave) {
        const span = btnSave.querySelector('span');
        const isSyncRunning = !!(span && (span.textContent || '').includes('progress'));
        if (isSyncRunning) {
            btnSave.disabled = true;
            btnSave.style.opacity = '0.5';
        } else {
            btnSave.disabled = !isDirty;
            btnSave.style.opacity = isDirty ? '1' : '0.5';
        }
    }
}

/**
 * Walk every `.tag-row` and toggle its `display` based on the active
 * filter checkboxes + search term (legacy.js:3530-3591).
 *
 * Pure DOM function: reads `#tagListContainer`, the search input, and
 * the `#chkFilter*` checkbox state, plus `.fbtnFilter` chips via the
 * `#btnFilterDropdown` + `#filterDropdownLabel` pair. Walks each
 * `.tag-row` inside `#tagListContainer` (no-op when the container is
 * missing).
 *
 * Each row is shown iff:
 *   - the search term is empty OR matches `.txtTagName` / `.txtEntryLabel` (case-insensitive); AND
 *   - any checked feature filter matches the row's `chkEnableTag` / `chkEnableCollection`
 *     / `.date-row` count / `chkEnableHomeSection` (or none is checked); AND
 *   - any checked source-type filter matches the row's `.selSourceType` value
 *     (or none is checked); AND
 *   - any checked status filter matches `.chkTagActive` (or none is checked).
 *
 * The dropdown button's label and `.active` class are updated based on
 * how many of the eleven filters are checked.
 *
 * Quirks preserved verbatim:
 *   - `(row.querySelector('.chkX') || {}).checked` is implicit: when
 *     the element is missing we read `.checked` from `undefined` ⇒ `false`.
 *   - The legacy code accesses `.txtTagName.value` unguarded — the
 *     row builder always renders it, so we preserve the throw.
 *
 * @param view  The config page root (`#HomeScreenCompanionConfigPage`).
 */
export function applyFilters(view: HTMLElement): void {
    const container = view.querySelector<HTMLElement>('#tagListContainer');
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>('.tag-row');

    const searchTerm = (view.querySelector<HTMLInputElement>('#txtSearchTags')?.value || '').toLowerCase();

    const fTag = view.querySelector<HTMLInputElement>('#chkFilterTag')?.checked;
    const fColl = view.querySelector<HTMLInputElement>('#chkFilterCollection')?.checked;
    const fSched = view.querySelector<HTMLInputElement>('#chkFilterSchedule')?.checked;
    const fHome = view.querySelector<HTMLInputElement>('#chkFilterHomeScreen')?.checked;
    const fSrcExt = view.querySelector<HTMLInputElement>('#chkFilterSrcExternal')?.checked;
    const fSrcMI = view.querySelector<HTMLInputElement>('#chkFilterSrcMediaInfo')?.checked;
    const fSrcColl = view.querySelector<HTMLInputElement>('#chkFilterSrcCollection')?.checked;
    const fSrcPlay = view.querySelector<HTMLInputElement>('#chkFilterSrcPlaylist')?.checked;
    const fSrcAI = view.querySelector<HTMLInputElement>('#chkFilterSrcAI')?.checked;
    const fActive = view.querySelector<HTMLInputElement>('#chkFilterActive')?.checked;
    const fInactive = view.querySelector<HTMLInputElement>('#chkFilterInactive')?.checked;

    const anyFeature = !!(fTag || fColl || fSched || fHome);
    const anySrc = !!(fSrcExt || fSrcMI || fSrcColl || fSrcPlay || fSrcAI);
    const anyStatus = !!(fActive || fInactive);

    const btn = view.querySelector<HTMLElement>('#btnFilterDropdown');
    const lbl = view.querySelector<HTMLElement>('#filterDropdownLabel');
    if (btn && lbl) {
        const activeCount = [fTag, fColl, fSched, fHome, fSrcExt, fSrcMI, fSrcColl, fSrcPlay, fSrcAI, fActive, fInactive].filter(Boolean).length;
        lbl.textContent = activeCount > 0 ? 'Filter (' + activeCount + ')' : 'Filter';
        btn.classList.toggle('active', activeCount > 0);
    }

    rows.forEach((row) => {
        const tagName = (row.querySelector<HTMLInputElement>('.txtTagName')!.value || '').toLowerCase();
        const entryLbl = (row.querySelector<HTMLInputElement>('.txtEntryLabel')!.value || '').toLowerCase();
        const matchesSearch = !searchTerm || tagName.includes(searchTerm) || entryLbl.includes(searchTerm);

        let matchesFeature = true;
        if (anyFeature) {
            const hasTag = !!row.querySelector<HTMLInputElement>('.chkEnableTag')?.checked;
            const hasColl = !!row.querySelector<HTMLInputElement>('.chkEnableCollection')?.checked;
            const hasSched = row.querySelectorAll('.date-row').length > 0;
            const hasHome = !!row.querySelector<HTMLInputElement>('.chkEnableHomeSection')?.checked;
            matchesFeature = (!!fTag && hasTag) || (!!fColl && hasColl) || (!!fSched && hasSched) || (!!fHome && hasHome);
        }

        let matchesSrc = true;
        if (anySrc) {
            const src = row.querySelector<HTMLSelectElement>('.selSourceType')?.value || '';
            matchesSrc = (!!fSrcExt && src === 'External') || (!!fSrcMI && src === 'MediaInfo') ||
                (!!fSrcColl && src === 'LocalCollection') || (!!fSrcPlay && src === 'LocalPlaylist') ||
                (!!fSrcAI && src === 'AI');
        }

        let matchesStatus = true;
        if (anyStatus) {
            const isActive = !!row.querySelector<HTMLInputElement>('.chkTagActive')?.checked;
            matchesStatus = (!!fActive && isActive) || (!!fInactive && !isActive);
        }

        row.style.display = (matchesSearch && matchesFeature && matchesSrc && matchesStatus) ? '' : 'none';
    });
}

/**
 * Dependencies for {@link checkForUpdates}.
 *
 *   - `fetch`       the global `fetch` (also used for the GitHub call
 *                   that the legacy code hits directly).
 *   - `getApiClient` returns the Jellyfin `ApiClient` shape with the
 *                   `getUrl(name)` method the legacy code uses to build
 *                   the version URL. The legacy `getJSON(url)` path is
 *                   replaced by `fetch(getApiClient().getUrl(name))`
 *                   here so the signature stays minimal.
 */
export interface CheckForUpdatesDeps {
    readonly fetch: typeof fetch;
    readonly getApiClient: () => {
        getUrl: (name: string) => string;
        accessToken: () => string;
    };
}

/**
 * Check the installed plugin version against the latest GitHub
 * release, then update the footer DOM (legacy.js:3593-3627).
 *
 *   1. `fetch(deps.getApiClient().getUrl('HomeScreenCompanion/Version'))` →
 *      `{ Version }`. When `#footerVersionText` exists and the version
 *      is truthy, it's stamped with a `<a>` linking to the matching
 *      GitHub release tag page.
 *   2. If the version is empty, the GitHub fetch is skipped.
 *   3. The GitHub API is hit at the hard-coded `releases/latest`
 *      endpoint; its `tag_name` is compared segment-wise against
 *      `currentVer`. When strictly newer, `#footerUpdateInfo` is
 *      stamped with an "Update available: v…" `<a>`, and the
 *      `#footerUpdateSep` separator's `display` is reset.
 *
 * Both fetches swallow rejection silently (matching the legacy
 * `.catch(function () {})` chains).
 *
 * @param view  The config page root. Used for context only — the
 *              version / update DOM elements are looked up via
 *              `document.getElementById` (matching the legacy code).
 * @param deps  See {@link CheckForUpdatesDeps}.
 */
export function checkForUpdates(view: HTMLElement, deps: CheckForUpdatesDeps): void {
    void view;
    const versionHeaders: Record<string, string> = {};
    const versionToken = deps.getApiClient().accessToken();
    if (versionToken) versionHeaders['X-Emby-Token'] = versionToken;
    deps.fetch(deps.getApiClient().getUrl('HomeScreenCompanion/Version'), { headers: versionHeaders })
        .then((r) => r.json() as Promise<{ Version?: string }>)
        .then((result) => {
            const currentVer = result.Version || '';
            const footerVer = document.getElementById('footerVersionText');
            if (footerVer && currentVer) {
                const releaseUrl = 'https://github.com/soderlund91/HomeScreenCompanion/releases/tag/v' + currentVer;
                footerVer.innerHTML = '<a href="' + releaseUrl + '" target="_blank" style="color:inherit;text-decoration:none;">v' + currentVer + '</a>';
            }
            if (!currentVer) return;

            return deps.fetch('https://api.github.com/repos/soderlund91/HomeScreenCompanion/releases/latest')
                .then((r) => r.json() as Promise<{ tag_name?: string; html_url?: string }>)
                .then((release) => {
                    const latestTag = (release.tag_name || '').replace(/^v/i, '');
                    if (!latestTag) return;
                    const a = latestTag.split('.').map(Number);
                    const b = currentVer.split('.').map(Number);
                    let isNewer = false;
                    for (let i = 0; i < Math.max(a.length, b.length); i++) {
                        if ((a[i] || 0) > (b[i] || 0)) { isNewer = true; break; }
                        if ((a[i] || 0) < (b[i] || 0)) break;
                    }
                    if (isNewer) {
                        const footerUpdate = document.getElementById('footerUpdateInfo');
                        if (footerUpdate) {
                            footerUpdate.innerHTML = '<a href="' + (release.html_url || '') + '"'
                                + ' target="_blank" class="footer-update-link">Update available: v' + latestTag + '</a>';
                            const footerUpdateSep = document.getElementById('footerUpdateSep');
                            if (footerUpdateSep) footerUpdateSep.style.display = '';
                        }
                    }
                })
                .catch(() => undefined);
        })
        .catch(() => undefined);
}
