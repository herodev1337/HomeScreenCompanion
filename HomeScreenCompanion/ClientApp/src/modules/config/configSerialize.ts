// D4 (configState.ts split): pure DOM walker that serializes the
// config form into the saved-config payload. Extracted from
// `configState.ts:239-567` (`legacy.js:3280-3480`).
//
// The function walks every `.tag-row` and assembles the flat
// `Tags[]` array (one entry per External URL, LocalSource, AI row,
// or MediaInfo row — preserving the `forComparison` placeholder rows
// for empty External/Local source-type rows). Then reads the API keys,
// log toggles, and HSC fields, falling back to `deps.hsc.config`
// whenever the corresponding DOM control is missing.

import { buildCriterion } from '../filters/criteria';
import type {
    HscState,
    MiUsersState,
    SavedFiltersState,
} from '../state/state';

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
