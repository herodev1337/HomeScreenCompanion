// Phase 3: row-builder / row-reader leaf from `legacy.js`.
//
// Six helpers lifted from `Configuration/configPage.js`, split into two
// groups:
//
//   HTML builders (pure string transforms):
//     - `getUrlRowHtml(value, limit)`        — configPage.js:542.
//       Already extracted by `modules/dom/dom.ts`; re-exported here so the
//       "rows" surface is in one place.
//     - `getLocalRowHtml(type, selectedName, limit)` — configPage.js:558.
//     - `getDateRowHtml(interval)`           — configPage.js:616.
//
//   DOM readers (state comes from the row element, never module scope):
//     - `getDragAfterElement(container, y)`  — configPage.js:695. Already
//       extracted by `modules/dom/dom.ts`; re-exported here.
//     - `getManDragAfterElement(container, y)` — configPage.js:3803. Same.
//     - `readRowAsConfig(row)`               — configPage.js:709. Reads every
//       form field of one filter row and returns the plugin-config DTO that
//       `saveSavedFiltersNow` persists.
//
// One legacy module-scope dependency had to be injected instead of shared:
// `getLocalRowHtml` picks its `<option>` list from the module-scope
// `cachedCollections` / `cachedPlaylists` arrays (populated by
// `preFetchLibraryData`, configPage.js:6802). A strictly-typed module can't
// reach that closure, so the option list is now an explicit `items`
// parameter. With `items` omitted (default `[]`) the output is byte-identical
// to the legacy behavior right after page load, which is the only state the
// legacy fixture bundle can observe.
//
// Everything else reads the DOM row it is given — no module state, no
// `ApiClient`, no `Dashboard`. `readRowAsConfig` is the only Date-dependent
// helper (`LastModified`); callers wanting deterministic output should freeze
// the clock.

import { buildCriterion } from './criteria';
import { escapeAttr, escapeHtml } from '../dom/dom';
import {
    parseDateYMD,
    getMonthOptions,
    getDayOptions,
    getMaxDays,
    getWeekButtons,
} from './date-intervals';

// Re-exported (not re-extracted): these already live in `modules/dom/dom.ts`.
export {
    getUrlRowHtml,
    getDragAfterElement,
    getManDragAfterElement,
} from '../dom/dom';

/**
 * Minimal shape of a cached collection / playlist item as consumed by
 * {@link getLocalRowHtml}: only the display `Name` is read (legacy maps
 * `o.Name` into the `<option>` text and value).
 */
export interface NamedItem {
    readonly Name: string;
}

/**
 * Render the HTML for one row of a local source (collection or playlist).
 * The row holds the source `<select>`, the max-items number input, and a
 * Remove button.
 *
 * Legacy contract (configPage.js:558):
 *   - The `<option>` list comes from the module-scope `cachedCollections`
 *     (type `'LocalCollection'`) or `cachedPlaylists` (anything else —
 *     note there is no `else`-branch guard; every non-`'LocalCollection'`
 *     value selects playlists). Both start as `[]` and are populated by
 *     `preFetchLibraryData`.
 *   - Names are escaped into `value="..."` (via {@link escapeAttr}) and
 *     the option text (via {@link escapeHtml}), and matched against
 *     `selectedName` with strict `===`.
 *   - `limit` defaults to `0` only when `undefined`; an explicit `0` is
 *     honored (same `!== undefined` contract as `getUrlRowHtml`).
 *   - The `<select>` has no `name`/`label`; the placeholder option is
 *     `-- Select --`.
 *
 * @param type         `'LocalCollection'` or anything else (playlists).
 *                     Retained for call-shape parity with legacy; the
 *                     cache-selection side effect now happens at the call
 *                     site by choosing which list to pass as `items`.
 * @param selectedName Name to mark `selected`, or `''` for none.
 * @param limit        Maximum items to take from the source. Only
 *                     `undefined` triggers the `0` default.
 * @param items        Cached collections/playlists to render as options.
 *                     Defaults to `[]`, which reproduces the legacy
 *                     output before `preFetchLibraryData` has run.
 * @returns            The row's HTML string.
 */
export function getLocalRowHtml(
    type: string,
    selectedName: string,
    limit: number | undefined,
    items: readonly NamedItem[] = [],
): string {
    void type; // cache selection moved to `items` (see header); kept for parity
    const optHtml =
        '<option value="">-- Select --</option>' +
        items
            .map((o) => `<option value="${escapeAttr(o.Name)}" ${selectedName === o.Name ? 'selected' : ''}>${escapeHtml(o.Name)}</option>`)
            .join('');
    const lim = limit !== undefined ? limit : 0;
    return `
            <div class="local-row" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <div style="flex-grow:1;">
                    <select is="emby-select" class="selLocalSource" style="width:100%;">
                        ${optHtml}
                    </select>
                </div>
                <div style="width:110px;">
                    <input is="emby-input" class="txtLocalLimit" type="number" label="Max (0=All)" value="${lim}" min="0" />
                </div>
                <button type="button" is="emby-button" class="raised btnRemoveLocal btn-row-remove" title="Remove"><i class="md-icon">remove_circle_outline</i></button>
            </div>`;
}

/**
 * The schedule-interval shape `getDateRowHtml` consumes (a server
 * `ActiveIntervals` entry). Every field is optional: missing `Type`
 * renders the `SpecificDate` layout, missing dates render the December
 * defaults (see function docs).
 */
export interface DateInterval {
    readonly Type?: string;
    readonly Start?: string | null;
    readonly End?: string | null;
    readonly DayOfWeek?: string;
}

/**
 * Render the HTML for one date rule row (schedule UI).
 *
 * Legacy behavior (configPage.js:616), quirks preserved:
 *   - `type` defaults to `'SpecificDate'`; `'EveryYear'` additionally
 *     `console.log`s the raw interval (kept — it is observable).
 *   - Date inputs show `Start`/`End` truncated at `'T'` (`split('T')[0]`).
 *   - Month/day `<select>`s are pre-computed from `parseDateYMD` with
 *     defaults `12/1` (start) and `12/28` (end) for unparseable dates,
 *     then clamped with `Math.min(day, getMaxDays(month))`.
 *   - The three layout blocks (`inputs-specific`, `inputs-annual`,
 *     `inputs-weekly`) all render; only the active one gets
 *     `display:flex`, the others `display:none`.
 *   - Markup quirks are intentional: the duplicated `display:flex;` in
 *     the annual month/day wrappers and the whitespace-only lines are
 *     byte-identical to the legacy template.
 *
 * @param interval  One `ActiveIntervals` entry.
 * @returns         The row's HTML string.
 */
export function getDateRowHtml(interval: DateInterval): string {
    const type = interval.Type || 'SpecificDate';
    if (type === 'EveryYear') console.log('[HSC schedule] raw interval from server:', JSON.stringify(interval));
    const sDate = interval.Start ? interval.Start.split('T')[0]! : '';
    const eDate = interval.End ? interval.End.split('T')[0]! : '';
    const sParts = parseDateYMD(interval.Start);
    const eParts = parseDateYMD(interval.End);
    const sMonth = sParts ? sParts.month : 12;
    let sDay     = sParts ? sParts.day   : 1;
    const eMonth = eParts ? eParts.month : 12;
    let eDay     = eParts ? eParts.day   : 28;
    const sMaxDay = getMaxDays(sMonth);
    const eMaxDay = getMaxDays(eMonth);
    sDay = Math.min(sDay, sMaxDay);
    eDay = Math.min(eDay, eMaxDay);
    const dayOfWeek = interval.DayOfWeek || '';

    return `
            <div class="date-row date-row-container" style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 15px;">
                
                <div style="width:160px;">
                    <label class="selectLabel">Rule Type</label>
                    <select is="emby-select" class="selDateType" style="width:100%;">
                        <option value="SpecificDate" ${type === 'SpecificDate' ? 'selected' : ''}>Specific Date</option>
                        <option value="EveryYear" ${type === 'EveryYear' ? 'selected' : ''}>Recurring</option>
                        <option value="Weekly" ${type === 'Weekly' ? 'selected' : ''}>Week Days</option>
                    </select>
                </div>
                
                <div class="inputs-specific" style="display: ${type === 'SpecificDate' ? 'flex' : 'none'}; gap: 8px; flex-grow: 1; align-items: center;">
                    <div style="flex-grow:1;">
                        <input is="emby-input" type="date" class="txtFullStartDate" label="Start Date" value="${escapeAttr(sDate)}" />
                    </div>
                    <span style="opacity:0.5; padding-top:15px;">to</span>
                    <div style="flex-grow:1;">
                        <input is="emby-input" type="date" class="txtFullEndDate" label="End Date" value="${escapeAttr(eDate)}" />
                    </div>
                </div>

                <div class="inputs-annual" style="display: ${type === 'EveryYear' ? 'flex' : 'none'}; gap: 8px; flex-grow: 1; align-items: flex-start;">
                    
                    <div style="display:flex; display:flex; gap:5px;">
                        <div style="width:80px;">
                            <label class="selectLabel">Start Month</label>
                            <select is="emby-select" class="selStartMonth" style="width:100%;">${getMonthOptions(sMonth)}</select>
                        </div>
                        <div style="width:70px;">
                            <label class="selectLabel">Day</label>
                            <select is="emby-select" class="selStartDay" style="width:100%;">${getDayOptions(sDay, sMaxDay)}</select>
                        </div>
                    </div>

                    <span style="opacity:0.5; padding-top:32px;">to</span>

                    <div style="display:flex; display:flex; gap:5px;">
                        <div style="width:80px;">
                            <label class="selectLabel">End Month</label>
                            <select is="emby-select" class="selEndMonth" style="width:100%;">${getMonthOptions(eMonth)}</select>
                        </div>
                        <div style="width:70px;">
                            <label class="selectLabel">Day</label>
                            <select is="emby-select" class="selEndDay" style="width:100%;">${getDayOptions(eDay, eMaxDay)}</select>
                        </div>
                    </div>
                </div>

                <div class="inputs-weekly" style="display: ${type === 'Weekly' ? 'flex' : 'none'}; flex-grow: 1; align-items: center; gap: 5px; flex-wrap: wrap;">
                    <div style="width:100%;">
                        <label class="selectLabel">Active On Days</label>
                        <div class="week-btn-container" style="display:flex; gap:5px; margin-top:2px;">
                            ${getWeekButtons(dayOfWeek)}
                        </div>
                    </div>
                </div>

                <button type="button" is="emby-button" class="btnRemoveDate" style="background:transparent; color:#cc3333; min-width:40px; margin-top: 25px;" title="Remove Rule"><i class="md-icon">delete</i></button>
            </div>`;
}

/**
 * One date rule as persisted inside `RowConfig.ActiveIntervals`
 * (`readRowAsConfig` output). `Start`/`End` are `null` when the rule
 * type doesn't carry them (or the inputs were empty).
 */
export interface ScheduleInterval {
    readonly Type: string;
    readonly Start: string | null;
    readonly End: string | null;
    readonly DayOfWeek: string;
}

/**
 * One external URL source (`RowConfig.Urls[]`).
 */
export interface UrlSource {
    readonly url: string;
    readonly limit: number;
}

/**
 * One local collection/playlist source (`RowConfig.LocalSources[]`).
 */
export interface LocalSource {
    readonly id: string;
    readonly limit: number;
}

/**
 * One media-info filter group (`RowConfig.MediaInfoFilters[]`).
 */
export interface MediaInfoFilterGroup {
    readonly Operator: string;
    readonly Criteria: string[];
    readonly GroupOperator: string;
}

/**
 * The full plugin-config DTO produced by {@link readRowAsConfig} for one
 * filter row. This is the client-side twin of the server's stored tag
 * config (see `modules/config/types/index.ts`'s loose `TagConfig` for
 * the read path). Every field is always present, matching the legacy
 * literal — `MediaInfoConditions`, `HomeSectionTracked` and the
 * `MediaInfoTarget*` family are hard-coded empties/falses because the
 * modern UI no longer edits them.
 */
export interface RowConfig {
    readonly Name: string;
    readonly Tag: string;
    readonly Active: boolean;
    readonly Blacklist: string[];
    readonly ActiveIntervals: ScheduleInterval[];
    readonly EnableTag: boolean;
    readonly EnableCollection: boolean;
    readonly CollectionName: string;
    readonly CollectionDescription: string;
    readonly CollectionPosterPath: string;
    readonly OverrideWhenActive: boolean;
    readonly SourceType: string;
    readonly Urls: UrlSource[];
    readonly LocalSources: LocalSource[];
    readonly Limit: number;
    readonly MediaInfoFilters: MediaInfoFilterGroup[];
    readonly MediaInfoConditions: unknown[];
    readonly EnableHomeSection: boolean;
    readonly HomeSectionLibraryId: string;
    readonly HomeSectionUserIds: string[];
    readonly HomeSectionSettings: string;
    readonly HomeSectionTracked: unknown[];
    readonly LastModified: string;
    readonly AiProvider: string;
    readonly AiPrompt: string;
    readonly AiIncludeRecentlyWatched: boolean;
    readonly AiRecentlyWatchedUserId: string;
    readonly AiRecentlyWatchedCount: number;
    readonly AiRefreshIntervalDays: number;
    readonly TagTargetEpisode: boolean;
    readonly TagTargetSeason: boolean;
    readonly TagTargetSeries: boolean;
    readonly CollectionTargetEpisode: boolean;
    readonly CollectionTargetSeason: boolean;
    readonly CollectionTargetSeries: boolean;
    readonly EnablePlaylist: boolean;
    readonly PlaylistName: string;
    readonly PlaylistUserIds: string[];
    readonly PlaylistMappings: unknown[];
    readonly MediaInfoTargetEpisode: boolean;
    readonly MediaInfoTargetSeason: boolean;
    readonly MediaInfoTargetSeries: boolean;
    readonly MediaInfoTargetType: string;
    readonly MediaInfoSeasonMode: boolean;
}

/**
 * Read every form field of one filter row and assemble the plugin-config
 * DTO. Mirrors configPage.js:709 exactly, quirks included:
 *
 *   - `.txtEntryLabel`, `.txtTagName`, `.chkTagActive`, `.chkEnableTag`,
 *     `.chkEnableCollection`, `.txtCollectionName`, `.selSourceType` are
 *     read unguarded (the row builder always renders them).
 *   - `Tag` falls back to the entry label when the tag-name input is empty.
 *   - `Blacklist` is newline/CR-split, trimmed, empties dropped; a missing
 *     `.txtTagBlacklist` yields `[]`.
 *   - `OverrideWhenActive` / `EnablePlaylist` / target checkboxes are
 *     guarded with `!!(...|| {}).checked` — missing element ⇒ `false`.
 *   - Date rows: `SpecificDate` keeps raw input values (empty ⇒ `null`
 *     via `s || null`); `EveryYear` is normalized to `2000-MM-DD` (the
 *     year is a constant); `Weekly` joins the active day names.
 *   - Media-info groups: first group's `GroupOperator` is always `'AND'`
 *     (the per-group `data-group-op` is ignored for index 0); rules with
 *     `MediaType=Episode` become `EpisodeIncludeSeries` when
 *     `.chkIncludeParentSeries` is checked; a numeric op (`selMiOp`)
 *     selects the numeric value (`txtMiNum`) even if empty; `.btnNotToggle`
 *     with `data-not="1"` prefixes `!`; empty `buildCriterion` results
 *     drop the rule; empty groups are dropped entirely.
 *   - Home-section tab: when `data-hse-loaded="1"` the settings come from
 *     live `[data-field]` elements (checkbox ⇒ `"true"/"false"`, empty
 *     value ⇒ placeholder fallback), `_hsePlaystate` is translated to
 *     `_queryIsPlayed`/`_queryIsResumable`, `ItemTypes` is JSON-stringified
 *     from the comma list, and unchecked `.chkHseLibrary` boxes become
 *     `_queryExcludeViewIds`. Otherwise the persisted `data-hse-settings`
 *     JSON is used and a missing `CustomName` falls back to the entry/tag
 *     label. Both paths decode with `decodeURIComponent`.
 *   - URLs default to `[{ url: '', limit: 0 }]` when no `.url-row` exists;
 *     limits are `parseInt(...) || 0`.
 *   - `LastModified` is `new Date().toISOString()` — freeze the clock in
 *     tests.
 *
 * @param row  One filter-row element (`.tag-row` root).
 * @returns    The assembled config DTO.
 */
export function readRowAsConfig(row: HTMLElement): RowConfig {
    const entryLabel = row.querySelector<HTMLInputElement>('.txtEntryLabel')!.value;
    const tagName = row.querySelector<HTMLInputElement>('.txtTagName')!.value || entryLabel;
    const active = row.querySelector<HTMLInputElement>('.chkTagActive')!.checked;
    const blInput = row.querySelector<HTMLInputElement>('.txtTagBlacklist');
    const bl: string[] = blInput
        ? blInput.value
            .split(/[\n\r]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];
    const enableTag = row.querySelector<HTMLInputElement>('.chkEnableTag')!.checked;
    const enableColl = row.querySelector<HTMLInputElement>('.chkEnableCollection')!.checked;
    const overrideWhenActive = !!row.querySelector<HTMLInputElement>('.chkOverrideWhenActive')?.checked;
    const plTab = row.querySelector<HTMLElement>('.playlist-tab');
    let plUserIds: string[];
    if (plTab && plTab.dataset.plLoaded === '1') {
        plUserIds = Array.from(plTab.querySelectorAll<HTMLInputElement>('.chkPlaylistUser:checked')).map((c) => c.value);
    } else {
        try {
            plUserIds = JSON.parse(decodeURIComponent((plTab && plTab.dataset.plUserids) || '%5B%5D')) as string[];
        } catch {
            plUserIds = [];
        }
    }
    const collName = row.querySelector<HTMLInputElement>('.txtCollectionName')!.value;
    const collDesc = row.querySelector<HTMLInputElement>('.txtCollectionDescription')
        ? row.querySelector<HTMLInputElement>('.txtCollectionDescription')!.value
        : '';
    const collPoster = row.querySelector<HTMLInputElement>('.hiddenPosterPath')
        ? row.querySelector<HTMLInputElement>('.hiddenPosterPath')!.value
        : '';
    const st = row.querySelector<HTMLInputElement>('.selSourceType')!.value;

    const intervals: ScheduleInterval[] = [];
    row.querySelectorAll<HTMLElement>('.date-row').forEach((dr) => {
        const type = dr.querySelector<HTMLInputElement>('.selDateType')!.value;
        let s: string | null = null;
        let e: string | null = null;
        let days = '';
        if (type === 'SpecificDate') {
            s = dr.querySelector<HTMLInputElement>('.txtFullStartDate')!.value;
            e = dr.querySelector<HTMLInputElement>('.txtFullEndDate')!.value;
        } else if (type === 'EveryYear') {
            const sM = dr.querySelector<HTMLInputElement>('.selStartMonth')!.value;
            const sD = dr.querySelector<HTMLInputElement>('.selStartDay')!.value;
            const eM = dr.querySelector<HTMLInputElement>('.selEndMonth')!.value;
            const eD = dr.querySelector<HTMLInputElement>('.selEndDay')!.value;
            s = '2000-' + sM.padStart(2, '0') + '-' + sD.padStart(2, '0');
            e = '2000-' + eM.padStart(2, '0') + '-' + eD.padStart(2, '0');
        } else if (type === 'Weekly') {
            days = Array.from(dr.querySelectorAll<HTMLElement>('.day-toggle.active'))
                .map((b) => b.dataset.day)
                .join(',');
        }
        intervals.push({ Type: type, Start: s || null, End: e || null, DayOfWeek: days });
    });

    const miFilters: MediaInfoFilterGroup[] = [];
    row.querySelectorAll<HTMLElement>('.mediainfo-filter-group').forEach((group, gi) => {
        const operator = group.dataset.op || 'AND';
        const groupOp = gi === 0 ? 'AND' : (group.dataset.groupOp || 'AND');
        const criteria: string[] = [];
        group.querySelectorAll<HTMLElement>('.mi-rule').forEach((rule) => {
            const prop = rule.querySelector<HTMLInputElement>('.selMiProperty')?.value || '';
            const selVal = rule.querySelector<HTMLInputElement>('.selMiValue');
            const txtVal = rule.querySelector<HTMLInputElement>('.txtMiValue');
            const selOp = rule.querySelector<HTMLInputElement>('.selMiOp');
            const txtNum = rule.querySelector<HTMLInputElement>('.txtMiNum');
            const selUser = rule.querySelector<HTMLInputElement>('.selMiUser');
            const selTextOp = rule.querySelector<HTMLInputElement>('.selMiTextOp');
            let val = selVal ? selVal.value : (txtVal ? txtVal.value.replace(/\r?\n/g, '\n').trim() : '');
            // MediaType:Episode + "Include parent series" → save as EpisodeIncludeSeries
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

    const hseTab = row.querySelector<HTMLElement>('.homescreen-tab');
    const enableHse = hseTab ? !!hseTab.querySelector<HTMLInputElement>('.chkEnableHomeSection')?.checked : false;
    const hseLibraryId = hseTab && hseTab.dataset.hseLoaded === '1'
        ? ((hseTab.querySelector<HTMLInputElement>('.selHseLibrary')?.value) || 'auto')
        : decodeURIComponent((hseTab && hseTab.dataset.hseLibraryid) || 'auto');
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
            const f = el.dataset.field!;
            const input = el as HTMLInputElement;
            let v = input.type === 'checkbox' ? String(input.checked) : input.value;
            // If field is empty, fall back to placeholder (e.g. CustomName uses display name as placeholder)
            if (v === '' && input.placeholder) v = input.placeholder;
            hseSettings[f] = v;
        });
        // Virtual playstate field → native per-viewer query fields (IsPlayed / IsResumable)
        const hsePlaystate = (hseSettings['_hsePlaystate'] as string | undefined) || '';
        delete hseSettings['_hsePlaystate'];
        if (hsePlaystate === 'played') { hseSettings['_queryIsPlayed'] = 'true'; hseSettings['_queryIsResumable'] = ''; }
        else if (hsePlaystate === 'unplayed') { hseSettings['_queryIsPlayed'] = 'false'; hseSettings['_queryIsResumable'] = ''; }
        else if (hsePlaystate === 'inprogress') { hseSettings['_queryIsPlayed'] = ''; hseSettings['_queryIsResumable'] = 'true'; }
        else { hseSettings['_queryIsPlayed'] = ''; hseSettings['_queryIsResumable'] = ''; }
        const itemTypesVal = (hseTab.querySelector<HTMLInputElement>('.selHseItemTypes')?.value) || 'Movie,Series';
        hseSettings['ItemTypes'] = JSON.stringify(itemTypesVal.split(','));
        // Compute excluded library IDs from unchecked boxes → stored in _queryExcludeViewIds → Query.ExcludeUserViewIds
        const excludedLibIds = Array.from(hseTab.querySelectorAll<HTMLInputElement>('.chkHseLibrary:not(:checked)')).map((c) => c.value);
        if (excludedLibIds.length > 0) hseSettings['_queryExcludeViewIds'] = excludedLibIds.join(',');
        else delete hseSettings['_queryExcludeViewIds'];
    } else {
        try {
            hseSettings = JSON.parse(decodeURIComponent((hseTab && hseTab.dataset.hseSettings) || '%7B%7D')) as Record<string, unknown>;
        } catch {
            // Keep the initial `{}` — matches legacy, which swallows parse errors.
        }
        // Mirror the placeholder fallback from the loaded-form path: use group name as CustomName when not explicitly set
        if (!hseSettings['CustomName']) {
            const hseDefaultName = (row.querySelector<HTMLInputElement>('.txtEntryLabel')?.value)
                || (row.querySelector<HTMLInputElement>('.txtTagName')?.value) || '';
            if (hseDefaultName) hseSettings['CustomName'] = hseDefaultName;
        }
    }

    const urls: UrlSource[] = [];
    row.querySelectorAll<HTMLElement>('.url-row').forEach((uRow) => {
        urls.push({
            url: uRow.querySelector<HTMLInputElement>('.txtTagUrl')!.value.trim(),
            limit: parseInt(uRow.querySelector<HTMLInputElement>('.txtUrlLimit')!.value, 10) || 0,
        });
    });
    if (urls.length === 0) urls.push({ url: '', limit: 0 });

    const localSources: LocalSource[] = [];
    row.querySelectorAll<HTMLElement>('.local-row').forEach((lRow) => {
        localSources.push({
            id: lRow.querySelector<HTMLInputElement>('.selLocalSource')!.value,
            limit: parseInt(lRow.querySelector<HTMLInputElement>('.txtLocalLimit')!.value, 10) || 0,
        });
    });

    const miLimit = parseInt(row.querySelector<HTMLInputElement>('.txtMediaInfoLimit')?.value ?? '', 10) || 0;

    const aiProvider = row.querySelector<HTMLInputElement>('.selAiProvider')?.value || 'OpenAI';
    const aiPrompt = row.querySelector<HTMLInputElement>('.txtAiPrompt')?.value || '';
    const aiIncludeRecentlyWatched = !!row.querySelector<HTMLInputElement>('.chkAiRecentlyWatched')?.checked;
    const aiRecentlyWatchedUserId = row.querySelector<HTMLInputElement>('.selAiWatchedUser')?.value || '';
    const aiRecentlyWatchedCount = parseInt(row.querySelector<HTMLInputElement>('.txtAiWatchedCount')?.value ?? '', 10) || 20;
    const aiRefreshIntervalDays = parseInt(row.querySelector<HTMLInputElement>('.txtAiRefreshInterval')?.value ?? '', 10) || 0;

    let playlistMappings: unknown[];
    try {
        playlistMappings = JSON.parse(decodeURIComponent((plTab && plTab.dataset.plMappings) || '%5B%5D')) as unknown[];
    } catch {
        playlistMappings = [];
    }

    return {
        Name: entryLabel, Tag: tagName, Active: active, Blacklist: bl, ActiveIntervals: intervals,
        EnableTag: enableTag, EnableCollection: enableColl, CollectionName: collName,
        CollectionDescription: collDesc, CollectionPosterPath: collPoster,
        OverrideWhenActive: overrideWhenActive, SourceType: st,
        Urls: urls, LocalSources: localSources, Limit: miLimit,
        MediaInfoFilters: miFilters, MediaInfoConditions: [],
        EnableHomeSection: enableHse, HomeSectionLibraryId: hseLibraryId,
        HomeSectionUserIds: hseUserIds, HomeSectionSettings: JSON.stringify(hseSettings),
        HomeSectionTracked: [], LastModified: new Date().toISOString(),
        AiProvider: aiProvider, AiPrompt: aiPrompt,
        AiIncludeRecentlyWatched: aiIncludeRecentlyWatched,
        AiRecentlyWatchedUserId: aiRecentlyWatchedUserId,
        AiRecentlyWatchedCount: aiRecentlyWatchedCount,
        AiRefreshIntervalDays: aiRefreshIntervalDays,
        TagTargetEpisode:        !!row.querySelector<HTMLInputElement>('.chkTagTargetEpisode')?.checked,
        TagTargetSeason:         !!row.querySelector<HTMLInputElement>('.chkTagTargetSeason')?.checked,
        TagTargetSeries:         !!row.querySelector<HTMLInputElement>('.chkTagTargetSeries')?.checked,
        CollectionTargetEpisode: !!row.querySelector<HTMLInputElement>('.chkCollTargetEpisode')?.checked,
        CollectionTargetSeason:  !!row.querySelector<HTMLInputElement>('.chkCollTargetSeason')?.checked,
        CollectionTargetSeries:  !!row.querySelector<HTMLInputElement>('.chkCollTargetSeries')?.checked,
        EnablePlaylist:   !!row.querySelector<HTMLInputElement>('.chkEnablePlaylist')?.checked,
        PlaylistName:     (row.querySelector<HTMLInputElement>('.txtPlaylistName')?.value) ?? '',
        PlaylistUserIds:  plUserIds,
        PlaylistMappings: playlistMappings,
        MediaInfoTargetEpisode: false, MediaInfoTargetSeason: false, MediaInfoTargetSeries: false,
        MediaInfoTargetType: '', MediaInfoSeasonMode: false,
    };
}
