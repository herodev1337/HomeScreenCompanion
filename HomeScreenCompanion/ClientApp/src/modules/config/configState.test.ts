/// <reference types="vitest" />
//
// Unit tests for `modules/config/configState.ts`.
//
// Coverage:
//   - `groupConfigTags` (5 cases): empty input, single group,
//     multi-group with `(Name, Tag)` joiner, multi-URL append,
//     LocalCollection/LocalPlaylist separation, MediaInfo/AI
//     `Limit` override.
//   - `updateDryRunWarning` (4 cases): shows/hides the banner
//     based on `DryRunMode`, no-op when view missing, hides on
//     parse error.
//   - `getUiConfig` (4 cases): forComparison false/true, HSC DOM
//     fallback to `hsc.config`, `SavedFilters` round-trip.
//   - `checkFormState` (4 cases): toggles `.btn-save` on dirty,
//     no-op when view/originalConfigState missing, honors
//     `_tcHasPending`, and disables while "progress" is in
//     the button label.
//   - `applyFilters` (4 cases): toggles `.tag-row` display based
//     on each filter category (search / feature / source / status),
//     updates `#btnFilterDropdown` count.
//   - `checkForUpdates` (2 cases): stamps `#footerVersionText`
//     with the version link, and `#footerUpdateInfo` when a
//     newer release is detected.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    groupConfigTags,
    updateDryRunWarning,
    getUiConfig,
    checkFormState,
    applyFilters,
    checkForUpdates,
} from './configState';
import type { SavedFilter } from '../filters/savedFilters';
import type { TagConfig } from './types/index';

function makeHscConfig() {
    return { config: { HomeSyncEnabled: false, HomeSyncLibraryOrder: false, HomeSyncSourceUserId: '', HomeSyncTargetUserIds: [] as string[] } };
}

function makeSavedFilters() {
    return { filters: [] as SavedFilter[] };
}

function makeMiUsers() {
    return { users: null as null | { Id: string; Name: string }[] };
}

function makeUiConfigDeps(overrides: Partial<{
    hsc: ReturnType<typeof makeHscConfig>;
    savedFilters: ReturnType<typeof makeSavedFilters>;
    miUsers: ReturnType<typeof makeMiUsers>;
    readRowAsConfig: (row: HTMLElement) => unknown;
}> = {}) {
    return {
        hsc: overrides.hsc ?? makeHscConfig(),
        savedFilters: overrides.savedFilters ?? makeSavedFilters(),
        miUsers: overrides.miUsers ?? makeMiUsers(),
        readRowAsConfig: overrides.readRowAsConfig ?? (() => ({})),
    };
}

describe('groupConfigTags', () => {
    it('returns an empty map when given no tags', () => {
        expect(groupConfigTags([])).toEqual({});
        expect(groupConfigTags(undefined)).toEqual({});
        expect(groupConfigTags(null)).toEqual({});
    });

    it('groups a single tag row by Tag alone when Name is absent', () => {
        const tags: TagConfig[] = [{ Tag: '4K', SourceType: 'External', Url: 'https://example.com/x' }];
        const out = groupConfigTags(tags);
        expect(Object.keys(out)).toEqual(['4K']);
        const group = out['4K']!;
        expect(group.Tag).toBe('4K');
        expect(group.Name).toBe('');
        expect(group.Active).toBe(true);
        expect(group.EnableTag).toBe(true);
        expect(group.SourceType).toBe('External');
        expect(group.Urls).toEqual([{ url: 'https://example.com/x', limit: 0 }]);
    });

    it('joins groups by (Name + \\x1F + Tag) when Name is present', () => {
        const tags: TagConfig[] = [
            { Tag: '4K', Name: 'Resolution', SourceType: 'External', Url: 'https://a', Limit: 10 },
            { Tag: '8K', Name: 'Resolution', SourceType: 'External', Url: 'https://b', Limit: 5 },
            { Tag: '4K', Name: 'Other', SourceType: 'External', Url: 'https://c', Limit: 1 },
        ];
        const out = groupConfigTags(tags);
        expect(Object.keys(out).sort()).toEqual(['Other\x1F4K', 'Resolution\x1F4K', 'Resolution\x1F8K']);
        expect(out['Resolution\x1F4K']!.Urls).toEqual([{ url: 'https://a', limit: 10 }]);
        expect(out['Resolution\x1F8K']!.Urls).toEqual([{ url: 'https://b', limit: 5 }]);
        expect(out['Other\x1F4K']!.Urls).toEqual([{ url: 'https://c', limit: 1 }]);
    });

    it('appends multiple URLs into the same Urls array', () => {
        const tags: TagConfig[] = [
            { Tag: '4K', SourceType: 'External', Url: 'https://a', Limit: 10 },
            { Tag: '4K', SourceType: 'External', Url: 'https://b', Limit: 5 },
            { Tag: '4K', SourceType: 'External', Url: 'https://c' /* no limit */ },
        ];
        const out = groupConfigTags(tags);
        expect(out['4K']!.Urls).toEqual([
            { url: 'https://a', limit: 10 },
            { url: 'https://b', limit: 5 },
            { url: 'https://c', limit: 0 },
        ]);
    });

    it('appends LocalCollection / LocalPlaylist into LocalSources, not Urls', () => {
        const tags: TagConfig[] = [
            { Tag: '4K', SourceType: 'LocalCollection', LocalSourceId: 'col-1', Limit: 7 },
            { Tag: '4K', SourceType: 'LocalPlaylist', LocalSourceId: 'pl-1', Limit: 3 },
        ];
        const out = groupConfigTags(tags);
        expect(out['4K']!.Urls).toEqual([]);
        expect(out['4K']!.LocalSources).toEqual([
            { id: 'col-1', limit: 7 },
            { id: 'pl-1', limit: 3 },
        ]);
    });

    it('overwrites Limit on MediaInfo and AI source types', () => {
        const miTags: TagConfig[] = [
            { Tag: '4K', SourceType: 'MediaInfo', Limit: 1 },
            { Tag: '4K', SourceType: 'MediaInfo', Limit: 99 },
        ];
        expect(groupConfigTags(miTags)['4K']!.Limit).toBe(99);

        const aiTags: TagConfig[] = [
            { Tag: '4K', SourceType: 'AI', Limit: 3 },
            { Tag: '4K', SourceType: 'AI', Limit: 50 },
        ];
        expect(groupConfigTags(aiTags)['4K']!.Limit).toBe(50);
    });

    it('the tagConfigHasViewerCriteria flagging shape stays stable (no separate code path)', () => {
        // The legacy test exercised `tagConfigHasViewerCriteria` only
        // indirectly via `groupConfigTags`. We pin a few invariants
        // here: `Active` is true when the field is `!== false` (so a
        // missing field is treated as active), and the AI defaults
        // resolve cleanly without an `AiProvider` field set on the
        // input row.
        const tags: TagConfig[] = [
            { Tag: '4K' /* Active/EnableTag default to true */, SourceType: 'AI' },
        ];
        const out = groupConfigTags(tags);
        expect(out['4K']!.Active).toBe(true);
        expect(out['4K']!.EnableTag).toBe(true);
        expect(out['4K']!.AiProvider).toBe('OpenAI');
        expect(out['4K']!.AiRecentlyWatchedCount).toBe(20);
        expect(out['4K']!.SourceType).toBe('AI');
    });
});

describe('updateDryRunWarning', () => {
    beforeEach(() => {
        document.documentElement.innerHTML = '';
        const body = document.body ?? document.createElement('body');
        if (!document.body) document.documentElement.appendChild(body);
    });

    it('shows the banner when DryRunMode=true', () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        const warn = document.createElement('div');
        warn.className = 'dry-run-warning';
        view.appendChild(warn);
        document.body.appendChild(view);

        updateDryRunWarning(JSON.stringify({ DryRunMode: true }));
        expect(warn.style.display).toBe('flex');
    });

    it('hides the banner when DryRunMode=false', () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        const warn = document.createElement('div');
        warn.className = 'dry-run-warning';
        warn.style.display = 'flex';
        view.appendChild(warn);
        document.body.appendChild(view);

        updateDryRunWarning(JSON.stringify({ DryRunMode: false }));
        expect(warn.style.display).toBe('none');
    });

    it('is a no-op when the view is missing (no #HomeScreenCompanionConfigPage)', () => {
        // No view in DOM; should silently return without throwing.
        expect(() => updateDryRunWarning('{"DryRunMode":true}')).not.toThrow();
    });

    it('hides the banner on a JSON parse error (legacy fallback)', () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        const warn = document.createElement('div');
        warn.className = 'dry-run-warning';
        warn.style.display = 'flex';
        view.appendChild(warn);
        document.body.appendChild(view);

        updateDryRunWarning('{ not valid json');
        expect(warn.style.display).toBe('none');
    });
});

function buildMinimalConfigView(opts: { includeRows?: boolean; hscEnabled?: boolean } = {}): HTMLElement {
    document.body.innerHTML = '';
    const view = document.createElement('div');
    view.id = 'HomeScreenCompanionConfigPage';

    const tags = document.createElement('input');
    tags.id = 'txtTraktClientId';
    tags.value = 'trakt-abc';
    view.appendChild(tags);

    const mdblist = document.createElement('input');
    mdblist.id = 'txtMdblistApiKey';
    mdblist.value = 'mdbl-xyz';
    view.appendChild(mdblist);

    const tmdb = document.createElement('input');
    tmdb.id = 'txtTmdbApiKey';
    tmdb.value = '';
    view.appendChild(tmdb);

    const dryRun = document.createElement('input');
    dryRun.type = 'checkbox';
    dryRun.id = 'chkDryRunMode';
    view.appendChild(dryRun);

    const extConsole = document.createElement('input');
    extConsole.type = 'checkbox';
    extConsole.id = 'chkExtendedConsoleOutput';
    view.appendChild(extConsole);

    const logMissing = document.createElement('input');
    logMissing.type = 'checkbox';
    logMissing.id = 'chkLogMissingItems';
    view.appendChild(logMissing);

    const preserve = document.createElement('input');
    preserve.type = 'checkbox';
    preserve.id = 'chkPreserveTagsOnEmptyResult';
    view.appendChild(preserve);

    const hscEnabled = document.createElement('input');
    hscEnabled.type = 'checkbox';
    hscEnabled.id = 'chkHscEnabled';
    if (opts.hscEnabled) hscEnabled.checked = true;
    view.appendChild(hscEnabled);

    const hscLibOrder = document.createElement('input');
    hscLibOrder.type = 'checkbox';
    hscLibOrder.id = 'chkHscLibraryOrder';
    view.appendChild(hscLibOrder);

    const hscSource = document.createElement('select');
    hscSource.id = 'selHscSourceUser';
    const opt = document.createElement('option');
    opt.value = 'u-1';
    hscSource.appendChild(opt);
    view.appendChild(hscSource);

    if (opts.includeRows) {
        const list = document.createElement('div');
        list.id = 'tagListContainer';

        const row = document.createElement('div');
        row.className = 'tag-row';

        const entryLabel = document.createElement('input');
        entryLabel.className = 'txtEntryLabel';
        entryLabel.value = 'row-1';
        row.appendChild(entryLabel);

        const tagName = document.createElement('input');
        tagName.className = 'txtTagName';
        tagName.value = 'TagOne';
        row.appendChild(tagName);

        const active = document.createElement('input');
        active.type = 'checkbox';
        active.className = 'chkTagActive';
        active.checked = true;
        row.appendChild(active);

        const enableTag = document.createElement('input');
        enableTag.type = 'checkbox';
        enableTag.className = 'chkEnableTag';
        enableTag.checked = true;
        row.appendChild(enableTag);

        const enableColl = document.createElement('input');
        enableColl.type = 'checkbox';
        enableColl.className = 'chkEnableCollection';
        row.appendChild(enableColl);

        const collName = document.createElement('input');
        collName.className = 'txtCollectionName';
        collName.value = 'My Collection';
        row.appendChild(collName);

        const st = document.createElement('select');
        st.className = 'selSourceType';
        const stOpt = document.createElement('option');
        stOpt.value = 'External';
        st.appendChild(stOpt);
        st.value = 'External';
        row.appendChild(st);

        const urlRow = document.createElement('div');
        urlRow.className = 'url-row';
        const urlIn = document.createElement('input');
        urlIn.className = 'txtTagUrl';
        urlIn.value = 'https://example.com/feed';
        urlRow.appendChild(urlIn);
        const urlLim = document.createElement('input');
        urlLim.className = 'txtUrlLimit';
        urlLim.value = '7';
        urlRow.appendChild(urlLim);
        row.appendChild(urlRow);

        list.appendChild(row);
        view.appendChild(list);
    }

    document.body.appendChild(view);
    return view;
}

describe('getUiConfig', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('serializes the saved-config payload with HSC DOM controls taking precedence', () => {
        const view = buildMinimalConfigView({ hscEnabled: true });
        const deps = makeUiConfigDeps();
        const cfg = getUiConfig(view, false, deps) as Record<string, unknown>;

        expect(cfg.TraktClientId).toBe('trakt-abc');
        expect(cfg.MdblistApiKey).toBe('mdbl-xyz');
        expect(cfg.DryRunMode).toBe(false);
        expect(cfg.HomeSyncEnabled).toBe(true);
        expect(cfg.HomeSyncSourceUserId).toBe('u-1');
        expect(Array.isArray(cfg.Tags)).toBe(true);
        expect(cfg.SavedFilters).toBe(deps.savedFilters.filters);
    });

    it('falls back to hsc.config when HSC DOM controls are absent', () => {
        const view = buildMinimalConfigView();
        view.querySelector('#chkHscEnabled')?.remove();
        view.querySelector('#chkHscLibraryOrder')?.remove();
        view.querySelector('#selHscSourceUser')?.remove();

        const deps = makeUiConfigDeps({
            hsc: { config: { HomeSyncEnabled: true, HomeSyncLibraryOrder: false, HomeSyncSourceUserId: 'fallback-user', HomeSyncTargetUserIds: ['t-1', 't-2'] } },
        });
        const cfg = getUiConfig(view, false, deps) as Record<string, unknown>;

        expect(cfg.HomeSyncEnabled).toBe(true);
        expect(cfg.HomeSyncSourceUserId).toBe('fallback-user');
        expect(cfg.HomeSyncTargetUserIds).toEqual(['t-1', 't-2']);
    });

    it('skips empty External rows when forComparison=false; includes placeholders when forComparison=true', () => {
        const view = buildMinimalConfigView({ includeRows: true });
        const row = view.querySelector<HTMLElement>('.tag-row')!;
        row.querySelector<HTMLInputElement>('.txtTagUrl')!.value = '';
        row.querySelector<HTMLInputElement>('.txtUrlLimit')!.value = '0';

        const falseCfg = getUiConfig(view, false, makeUiConfigDeps()) as { Tags: unknown[] };
        expect(falseCfg.Tags).toHaveLength(0);

        const trueCfg = getUiConfig(view, true, makeUiConfigDeps()) as { Tags: Record<string, unknown>[] };
        expect(trueCfg.Tags).toHaveLength(1);
        expect(trueCfg.Tags[0]!.Url).toBe('');
        expect(trueCfg.Tags[0]!.Limit).toBe(0);
    });

    it('writes the live SavedFilters array reference to the payload', () => {
        const view = buildMinimalConfigView();
        const filters = [{ Name: 'f1', Filters: [] }];
        const deps = makeUiConfigDeps({ savedFilters: { filters } });
        const cfg = getUiConfig(view, false, deps) as Record<string, unknown>;
        expect(cfg.SavedFilters).toBe(filters);
    });
});

describe('checkFormState', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('disables .btn-save when the form is in sync with the snapshot', () => {
        const view = buildMinimalConfigView();
        const btn = document.createElement('button');
        btn.className = 'btn-save';
        const span = document.createElement('span');
        span.textContent = 'Save';
        btn.appendChild(span);
        view.appendChild(btn);

        const originalConfigState = JSON.stringify(getUiConfig(view, true, makeUiConfigDeps()));
        let current: string | null = originalConfigState;
        const ref = {
            getOriginalConfigState: () => current,
            setOriginalConfigState: (v: string | null) => { current = v; },
        };

        checkFormState({
            view,
            originalConfigState: ref,
            getUiConfig: (v, forComparison, deps) => getUiConfig(v, forComparison, deps ?? makeUiConfigDeps()),
        });

        expect(btn.disabled).toBe(true);
        expect(btn.style.opacity).toBe('0.5');
    });

    it('enables .btn-save when the form differs from the snapshot', () => {
        const view = buildMinimalConfigView();
        const btn = document.createElement('button');
        btn.className = 'btn-save';
        const span = document.createElement('span');
        span.textContent = 'Save';
        btn.appendChild(span);
        view.appendChild(btn);

        const originalConfigState = JSON.stringify({ placeholder: true });
        const ref = {
            getOriginalConfigState: () => originalConfigState,
            setOriginalConfigState: (_v: string | null) => undefined,
        };

        checkFormState({
            view,
            originalConfigState: ref,
            getUiConfig: (v, forComparison, deps) => getUiConfig(v, forComparison, deps ?? makeUiConfigDeps()),
        });

        expect(btn.disabled).toBe(false);
        expect(btn.style.opacity).toBe('1');
    });

    it('is a no-op when the view is missing', () => {
        const ref = {
            getOriginalConfigState: () => JSON.stringify({}),
            setOriginalConfigState: (_v: string | null) => undefined,
        };
        expect(() => checkFormState({
            view: null,
            originalConfigState: ref,
            getUiConfig: (v, forComparison, deps) => getUiConfig(v, forComparison, deps ?? makeUiConfigDeps()),
        })).not.toThrow();
    });

    it('forces dirty when #tcManageContainer has _tcHasPending=true', () => {
        const view = buildMinimalConfigView();
        const btn = document.createElement('button');
        btn.className = 'btn-save';
        const span = document.createElement('span');
        span.textContent = 'Save';
        btn.appendChild(span);
        view.appendChild(btn);

        const tc = document.createElement('div');
        tc.id = 'tcManageContainer';
        (tc as HTMLElement & { _tcHasPending?: boolean })._tcHasPending = true;
        view.appendChild(tc);

        const originalConfigState = JSON.stringify({});
        const ref = {
            getOriginalConfigState: () => originalConfigState,
            setOriginalConfigState: (_v: string | null) => undefined,
        };

        checkFormState({
            view,
            originalConfigState: ref,
            getUiConfig: (v, forComparison, deps) => getUiConfig(v, forComparison, deps ?? makeUiConfigDeps()),
        });

        expect(btn.disabled).toBe(false);
    });

    it('forces the button disabled while the save label says "in progress"', () => {
        const view = buildMinimalConfigView();
        const btn = document.createElement('button');
        btn.className = 'btn-save';
        const span = document.createElement('span');
        span.textContent = 'Saving in progress…';
        btn.appendChild(span);
        view.appendChild(btn);

        const originalConfigState = JSON.stringify({}); // not the same ⇒ dirty, but the sync-running flag wins.
        const ref = {
            getOriginalConfigState: () => originalConfigState,
            setOriginalConfigState: (_v: string | null) => undefined,
        };

        checkFormState({
            view,
            originalConfigState: ref,
            getUiConfig: (v, forComparison, deps) => getUiConfig(v, forComparison, deps ?? makeUiConfigDeps()),
        });

        expect(btn.disabled).toBe(true);
        expect(btn.style.opacity).toBe('0.5');
    });
});

describe('applyFilters', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    function buildFilterView(): { view: HTMLElement; row1: HTMLElement; row2: HTMLElement } {
        document.body.innerHTML = '';
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';

        const search = document.createElement('input');
        search.id = 'txtSearchTags';
        view.appendChild(search);

        const dropdownBtn = document.createElement('button');
        dropdownBtn.id = 'btnFilterDropdown';
        view.appendChild(dropdownBtn);

        const dropdownLbl = document.createElement('span');
        dropdownLbl.id = 'filterDropdownLabel';
        dropdownBtn.appendChild(dropdownLbl);

        function makeCheckbox(id: string, checked = false): HTMLInputElement {
            const c = document.createElement('input');
            c.type = 'checkbox';
            c.id = id;
            c.checked = checked;
            view.appendChild(c);
            return c;
        }
        makeCheckbox('chkFilterTag');
        makeCheckbox('chkFilterCollection');
        makeCheckbox('chkFilterSchedule');
        makeCheckbox('chkFilterHomeScreen');
        makeCheckbox('chkFilterSrcExternal');
        makeCheckbox('chkFilterSrcMediaInfo');
        makeCheckbox('chkFilterSrcCollection');
        makeCheckbox('chkFilterSrcPlaylist');
        makeCheckbox('chkFilterSrcAI');
        makeCheckbox('chkFilterActive');
        makeCheckbox('chkFilterInactive');

        const list = document.createElement('div');
        list.id = 'tagListContainer';

        const row1 = document.createElement('div');
        row1.className = 'tag-row';
        const row1Name = document.createElement('input');
        row1Name.className = 'txtTagName';
        row1Name.value = 'Alpha';
        row1.appendChild(row1Name);
        const row1Label = document.createElement('input');
        row1Label.className = 'txtEntryLabel';
        row1Label.value = 'alpha-label';
        row1.appendChild(row1Label);
        const row1Active = document.createElement('input');
        row1Active.type = 'checkbox';
        row1Active.className = 'chkTagActive';
        row1Active.checked = true;
        row1.appendChild(row1Active);
        const row1Enable = document.createElement('input');
        row1Enable.type = 'checkbox';
        row1Enable.className = 'chkEnableTag';
        row1Enable.checked = true;
        row1.appendChild(row1Enable);
        const row1Src = document.createElement('select');
        row1Src.className = 'selSourceType';
        const row1SrcOpt = document.createElement('option');
        row1SrcOpt.value = 'External';
        row1Src.appendChild(row1SrcOpt);
        row1Src.value = 'External';
        row1.appendChild(row1Src);
        list.appendChild(row1);

        const row2 = document.createElement('div');
        row2.className = 'tag-row';
        const row2Name = document.createElement('input');
        row2Name.className = 'txtTagName';
        row2Name.value = 'Beta';
        row2.appendChild(row2Name);
        const row2Label = document.createElement('input');
        row2Label.className = 'txtEntryLabel';
        row2Label.value = 'beta-label';
        row2.appendChild(row2Label);
        const row2Active = document.createElement('input');
        row2Active.type = 'checkbox';
        row2Active.className = 'chkTagActive';
        row2Active.checked = false;
        row2.appendChild(row2Active);
        const row2Src = document.createElement('select');
        row2Src.className = 'selSourceType';
        const row2SrcOpt = document.createElement('option');
        row2SrcOpt.value = 'MediaInfo';
        row2Src.appendChild(row2SrcOpt);
        row2Src.value = 'MediaInfo';
        row2.appendChild(row2Src);
        list.appendChild(row2);

        view.appendChild(list);
        document.body.appendChild(view);
        return { view, row1, row2 };
    }

    it('hides no rows when no filters are active and updates the button label', () => {
        const { view, row1, row2 } = buildFilterView();
        applyFilters(view);
        expect(row1.style.display).toBe('');
        expect(row2.style.display).toBe('');
        expect(view.querySelector('#filterDropdownLabel')!.textContent).toBe('Filter');
        expect(view.querySelector('#btnFilterDropdown')!.classList.contains('active')).toBe(false);
    });

    it('filters by search term (case-insensitive)', () => {
        const { view, row1, row2 } = buildFilterView();
        const search = view.querySelector<HTMLInputElement>('#txtSearchTags')!;
        search.value = 'alp';
        applyFilters(view);
        expect(row1.style.display).toBe('');
        expect(row2.style.display).toBe('none');
    });

    it('filters by source type (chkFilterSrcExternal)', () => {
        const { view, row1, row2 } = buildFilterView();
        view.querySelector<HTMLInputElement>('#chkFilterSrcExternal')!.checked = true;
        applyFilters(view);
        expect(row1.style.display).toBe('');     // External
        expect(row2.style.display).toBe('none'); // MediaInfo
        expect(view.querySelector('#filterDropdownLabel')!.textContent).toBe('Filter (1)');
        expect(view.querySelector('#btnFilterDropdown')!.classList.contains('active')).toBe(true);
    });

    it('filters by status (chkFilterInactive)', () => {
        const { view, row1, row2 } = buildFilterView();
        view.querySelector<HTMLInputElement>('#chkFilterInactive')!.checked = true;
        applyFilters(view);
        expect(row1.style.display).toBe('none'); // active=true
        expect(row2.style.display).toBe('');     // active=false
    });

    it('is a no-op when #tagListContainer is missing', () => {
        document.body.innerHTML = '<div id="HomeScreenCompanionConfigPage"></div>';
        const view = document.getElementById('HomeScreenCompanionConfigPage') as HTMLElement;
        expect(() => applyFilters(view)).not.toThrow();
    });
});

describe('checkForUpdates', () => {
    let originalFetch: typeof fetch;
    beforeEach(() => { originalFetch = globalThis.fetch; });
    afterEach(() => {
        globalThis.fetch = originalFetch;
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('stamps #footerVersionText with a link to the matching GitHub release tag', async () => {
        document.body.innerHTML = '<span id="footerVersionText"></span><span id="footerUpdateInfo"></span><span id="footerUpdateSep"></span>';

        const fetchMock = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ Version: '1.2.3' }),
        });
        const deps = {
            fetch: fetchMock as unknown as typeof fetch,
            getApiClient: () => ({ getUrl: (name: string) => `/api/${name}` }),
        };

        const view = document.createElement('div');
        checkForUpdates(view, deps);

        // Drain the inner fetch + the GitHub fetch.
        for (let i = 0; i < 20; i++) await Promise.resolve();
        for (let i = 0; i < 20; i++) await Promise.resolve();

        const footerVer = document.getElementById('footerVersionText')!;
        expect(footerVer.innerHTML).toContain('v1.2.3');
        expect(footerVer.innerHTML).toContain('/releases/tag/v1.2.3');
        expect(fetchMock).toHaveBeenCalledWith('/api/HomeScreenCompanion/Version');
    });

    it('stamps #footerUpdateInfo when GitHub reports a newer version', async () => {
        document.body.innerHTML = '<span id="footerVersionText"></span><span id="footerUpdateInfo"></span><span id="footerUpdateSep" style="display:none"></span>';

        let callIdx = 0;
        const fetchMock = vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) {
                return Promise.resolve({ json: () => Promise.resolve({ Version: '1.2.3' }) });
            }
            return Promise.resolve({ json: () => Promise.resolve({ tag_name: 'v1.2.5', html_url: 'https://github.com/release-1.2.5' }) });
        });
        const deps = {
            fetch: fetchMock as unknown as typeof fetch,
            getApiClient: () => ({ getUrl: (name: string) => `/api/${name}` }),
        };

        const view = document.createElement('div');
        checkForUpdates(view, deps);

        for (let i = 0; i < 20; i++) await Promise.resolve();
        for (let i = 0; i < 20; i++) await Promise.resolve();

        const footerUpdate = document.getElementById('footerUpdateInfo')!;
        expect(footerUpdate.innerHTML).toContain('Update available: v1.2.5');
        expect(footerUpdate.innerHTML).toContain('https://github.com/release-1.2.5');
        expect(document.getElementById('footerUpdateSep')!.style.display).toBe('');
    });

    it('does nothing when the version is empty (skips GitHub fetch)', async () => {
        document.body.innerHTML = '<span id="footerVersionText"></span><span id="footerUpdateInfo"></span>';

        const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ Version: '' }) });
        const deps = {
            fetch: fetchMock as unknown as typeof fetch,
            getApiClient: () => ({ getUrl: (name: string) => `/api/${name}` }),
        };

        const view = document.createElement('div');
        checkForUpdates(view, deps);

        for (let i = 0; i < 20; i++) await Promise.resolve();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(document.getElementById('footerVersionText')!.innerHTML).toBe('');
    });
});
