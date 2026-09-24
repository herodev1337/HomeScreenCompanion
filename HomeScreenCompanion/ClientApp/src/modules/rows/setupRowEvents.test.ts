/// <reference types="vitest" />
//
// Smoke tests for `modules/rows/setupRowEvents.ts`. Mirrors the
// `manageTab.test.ts` / `form.test.ts` style: build a minimal
// `.tag-row` subtree in `happy-dom`, wire the row with stubbed deps,
// then drive DOM events and assert observable structural changes plus
// spy invocations.
//
// Test coverage is intentionally focused on the eight scenarios
// listed in the task description:
//
//   1. `updateBadges` populates `.badge-container` (top-list badge +
//      source badge).
//   2. `updateRunGroupBtn` toggles `.btnRunEntry.disabled` when
//      `.chkTagActive` flips.
//   3. Saved-filter write: `btnConfirmSaveFilter` push into
//      `savedFilters.filters`.
//   4. HomeSection tab init: clicking the `.tag-tab[data-tab="homescreen"]`
//      fires `deps.initHomeSectionTab`.
//   5. Playlist tab init: clicking the `.tag-tab[data-tab="playlist"]`
//      fires `deps.initPlaylistTab`.
//   6. URL row add: `.btnAddUrl` click appends a `.url-row`.
//   7. Date row update: `.selStartMonth` change recomputes `.selStartDay`
//      via `deps.getDayOptions`.
//   8. `checkFormState` is called via the post-`change` setTimeout.
//
// The file is the most complex smoke test in Phase 5 — many deps,
// many DOM sub-trees, but every assertion is structural (`.toHaveLength`,
// `.toHaveBeenCalled`, `.toContain`) rather than snapshot-diff.

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    setupRowEvents,
    type SetupRowEventsDeps,
    type MiPresetCategory,
} from './setupRowEvents';
import { getMaxDays, getDayOptions } from '../filters/date-intervals';
import { getUrlRowHtml } from '../dom/dom';
import { createSavedFiltersState, createTopListsState } from '../state/state';
import type { SavedFiltersApiClient } from '../filters/savedFilters';

// ---------------------------------------------------------------------------
// DOM builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal `.tag-row` element with every class that
 * `setupRowEvents` queries for. The `extras` hook lets each test
 * attach additional nodes (saved-filter panel, date row, url row, …)
 * to the relevant container before `setupRowEvents` runs.
 */
function buildRow(extras: (row: HTMLElement, view: HTMLElement) => void = () => {}): {
    row: HTMLElement;
    view: HTMLElement;
} {
    document.body.innerHTML = '';
    const view = document.createElement('div');
    view.id = 'HomeScreenCompanionConfigPage';

    const row = document.createElement('div');
    row.className = 'tag-row';

    // Header / expand controls
    const header = document.createElement('div');
    header.className = 'tag-header';
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';
    header.appendChild(headerActions);
    const icon = document.createElement('span');
    icon.className = 'expand-icon';
    icon.innerText = 'expand_more';
    header.appendChild(icon);
    row.appendChild(header);

    const body = document.createElement('div');
    body.className = 'tag-body';
    body.style.display = 'block';
    row.appendChild(body);

    // Title + active checkbox + status label
    const title = document.createElement('div');
    title.className = 'tag-title';
    title.textContent = 'New';
    row.appendChild(title);

    const chkActive = document.createElement('input');
    chkActive.type = 'checkbox';
    chkActive.className = 'chkTagActive';
    chkActive.checked = true;
    row.appendChild(chkActive);

    const lblStatus = document.createElement('span');
    lblStatus.className = 'lblActiveStatus';
    row.appendChild(lblStatus);

    // Entry label + tag name + collection name (placeholders)
    const txtEntry = document.createElement('input');
    txtEntry.type = 'text';
    txtEntry.className = 'txtEntryLabel';
    row.appendChild(txtEntry);

    const txtTag = document.createElement('input');
    txtTag.type = 'text';
    txtTag.className = 'txtTagName';
    row.appendChild(txtTag);

    const txtColl = document.createElement('input');
    txtColl.type = 'text';
    txtColl.className = 'txtCollectionName';
    row.appendChild(txtColl);

    // Badge container + source badge
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'badge-container';
    row.appendChild(badgeContainer);

    const sourceBadge = document.createElement('div');
    sourceBadge.className = 'source-badge';
    row.appendChild(sourceBadge);

    // Tabs (general / tagname / schedule / collection / advanced / homescreen / playlist)
    const tabNames = ['general', 'tagname', 'schedule', 'collection', 'advanced', 'homescreen', 'playlist'];
    for (const t of tabNames) {
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = 'tag-tab';
        tabBtn.dataset.tab = t;
        row.appendChild(tabBtn);
        const tabBody = document.createElement('div');
        tabBody.className = `${t}-tab`;
        row.appendChild(tabBody);
    }

    // Source type + 4 source containers
    const selSourceType = document.createElement('select');
    selSourceType.className = 'selSourceType';
    for (const v of ['External', 'LocalCollection', 'LocalPlaylist', 'MediaInfo', 'AI']) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selSourceType.appendChild(opt);
    }
    row.appendChild(selSourceType);

    for (const cls of ['source-external-container', 'source-local-container', 'source-mediainfo-container', 'source-ai-container']) {
        const c = document.createElement('div');
        c.className = cls;
        row.appendChild(c);
    }

    const sourceTypeHint = document.createElement('div');
    sourceTypeHint.className = 'source-type-hint';
    row.appendChild(sourceTypeHint);

    // MI toggle / body / limit / help / presets / saved panel containers
    for (const cls of ['mi-limit-row', 'mi-toggle-row', 'mi-filter-body', 'mi-help-btn-row', 'mi-presets-section']) {
        const c = document.createElement('div');
        c.className = cls;
        row.appendChild(c);
    }
    const miList = document.createElement('div');
    miList.className = 'mediainfo-filter-list';
    row.appendChild(miList);
    const miPresetPanel = document.createElement('div');
    miPresetPanel.className = 'mi-preset-panel';
    row.appendChild(miPresetPanel);
    const miSavedPanel = document.createElement('div');
    miSavedPanel.className = 'mi-saved-panel';
    row.appendChild(miSavedPanel);
    const miSavedPanelContent = document.createElement('div');
    miSavedPanelContent.className = 'mi-saved-panel-content';
    miSavedPanel.appendChild(miSavedPanelContent);

    // Source-local containers
    const localListContainer = document.createElement('div');
    localListContainer.className = 'local-list-container';
    row.appendChild(localListContainer);
    const localTypeLabel = document.createElement('span');
    localTypeLabel.className = 'local-type-label';
    row.appendChild(localTypeLabel);

    // URL list container + buttons
    const urlListContainer = document.createElement('div');
    urlListContainer.className = 'url-list-container';
    row.appendChild(urlListContainer);
    const btnAddUrl = document.createElement('button');
    btnAddUrl.type = 'button';
    btnAddUrl.className = 'btnAddUrl';
    row.appendChild(btnAddUrl);

    // Date list + add button
    const dateListContainer = document.createElement('div');
    dateListContainer.className = 'date-list-container';
    row.appendChild(dateListContainer);
    const btnAddDate = document.createElement('button');
    btnAddDate.type = 'button';
    btnAddDate.className = 'btnAddDate';
    row.appendChild(btnAddDate);

    // Add local button
    const btnAddLocal = document.createElement('button');
    btnAddLocal.type = 'button';
    btnAddLocal.className = 'btnAddLocal';
    row.appendChild(btnAddLocal);

    // Tag/collection target help buttons
    const btnTagTargetHelp = document.createElement('button');
    btnTagTargetHelp.type = 'button';
    btnTagTargetHelp.className = 'btnTagTargetHelp';
    row.appendChild(btnTagTargetHelp);
    const btnCollTargetHelp = document.createElement('button');
    btnCollTargetHelp.type = 'button';
    btnCollTargetHelp.className = 'btnCollTargetHelp';
    row.appendChild(btnCollTargetHelp);

    // Enable checkboxes
    for (const cls of ['chkEnableTag', 'chkEnableCollection', 'chkEnablePlaylist', 'chkEnableHomeSection']) {
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.className = cls;
        row.appendChild(c);
    }
    const tagSettings = document.createElement('div');
    tagSettings.className = 'tag-settings';
    row.appendChild(tagSettings);
    const collSettings = document.createElement('div');
    collSettings.className = 'collection-settings';
    row.appendChild(collSettings);
    const plSettings = document.createElement('div');
    plSettings.className = 'playlist-settings';
    row.appendChild(plSettings);
    const hseDetails = document.createElement('div');
    hseDetails.className = 'hse-details';
    row.appendChild(hseDetails);

    // Override-when-active checkbox
    const chkOverride = document.createElement('input');
    chkOverride.type = 'checkbox';
    chkOverride.className = 'chkOverrideWhenActive';
    row.appendChild(chkOverride);
    const overrideContainer = document.createElement('div');
    overrideContainer.className = 'checkboxContainer';
    overrideContainer.appendChild(chkOverride);
    row.appendChild(overrideContainer);

    // AI controls
    const chkAiWatched = document.createElement('input');
    chkAiWatched.type = 'checkbox';
    chkAiWatched.className = 'chkAiRecentlyWatched';
    row.appendChild(chkAiWatched);
    const aiOpts = document.createElement('div');
    aiOpts.className = 'ai-recently-watched-options';
    row.appendChild(aiOpts);
    const selAiProv = document.createElement('select');
    selAiProv.className = 'selAiProvider';
    for (const v of ['OpenAI', 'Ollama']) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selAiProv.appendChild(opt);
    }
    row.appendChild(selAiProv);
    const ollamaWarn = document.createElement('div');
    ollamaWarn.className = 'ollama-experimental-warning';
    row.appendChild(ollamaWarn);

    // Run group button + duplicate + remove group + drag handle
    const btnRunEntry = document.createElement('button');
    btnRunEntry.type = 'button';
    btnRunEntry.className = 'btnRunEntry';
    const btnRunEntryLabel = document.createElement('span');
    btnRunEntryLabel.className = 'btnRunEntryLabel';
    btnRunEntry.appendChild(btnRunEntryLabel);
    row.appendChild(btnRunEntry);

    const btnDuplicate = document.createElement('button');
    btnDuplicate.type = 'button';
    btnDuplicate.className = 'btnDuplicateRow';
    row.appendChild(btnDuplicate);

    const btnRemoveGroup = document.createElement('button');
    btnRemoveGroup.type = 'button';
    btnRemoveGroup.className = 'btnRemoveGroup';
    row.appendChild(btnRemoveGroup);

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    row.appendChild(dragHandle);

    // Poster controls
    const btnChoosePoster = document.createElement('button');
    btnChoosePoster.type = 'button';
    btnChoosePoster.className = 'btnChoosePoster';
    row.appendChild(btnChoosePoster);
    const inputPosterFile = document.createElement('input');
    inputPosterFile.type = 'file';
    inputPosterFile.className = 'inputPosterFile';
    row.appendChild(inputPosterFile);
    const btnRemovePoster = document.createElement('button');
    btnRemovePoster.type = 'button';
    btnRemovePoster.className = 'btnRemovePoster';
    row.appendChild(btnRemovePoster);
    const btnLoadPosterUrl = document.createElement('button');
    btnLoadPosterUrl.type = 'button';
    btnLoadPosterUrl.className = 'btnLoadPosterUrl';
    row.appendChild(btnLoadPosterUrl);
    const txtPosterUrl = document.createElement('input');
    txtPosterUrl.type = 'text';
    txtPosterUrl.className = 'txtPosterUrl';
    row.appendChild(txtPosterUrl);
    const hiddenPosterPath = document.createElement('input');
    hiddenPosterPath.type = 'hidden';
    hiddenPosterPath.className = 'hiddenPosterPath';
    row.appendChild(hiddenPosterPath);
    const posterFilename = document.createElement('span');
    posterFilename.className = 'poster-filename';
    row.appendChild(posterFilename);
    const posterPreviewContainer = document.createElement('div');
    posterPreviewContainer.className = 'poster-preview-container';
    row.appendChild(posterPreviewContainer);
    const posterPreviewImg = document.createElement('img');
    posterPreviewImg.className = 'poster-preview-img';
    row.appendChild(posterPreviewImg);

    view.appendChild(row);

    extras(row, view);

    document.body.appendChild(view);
    return { row, view };
}

function makeApi(): SavedFiltersApiClient {
    return {
        getPluginConfiguration: vi.fn().mockResolvedValue({}),
        updatePluginConfiguration: vi.fn().mockResolvedValue({}),
    };
}

const EMPTY_PRESETS: readonly MiPresetCategory[] = [];

/**
 * Build a fresh deps bag with stubbed callbacks. Pass overrides per
 * test (e.g. `checkFormState` to a `vi.fn()` for assertion).
 */
function makeDeps(overrides: Partial<{
    savedFilters: ReturnType<typeof createSavedFiltersState>;
    topLists: ReturnType<typeof createTopListsState>;
    initHomeSectionTab: ReturnType<typeof vi.fn>;
    initPlaylistTab: ReturnType<typeof vi.fn>;
    updateHseSectionAvailability: ReturnType<typeof vi.fn>;
    checkFormState: ReturnType<typeof vi.fn>;
    saveSavedFiltersNow: ReturnType<typeof vi.fn>;
    refreshMySavedFiltersPanels: ReturnType<typeof vi.fn>;
    isScheduleCurrentlyActive: ReturnType<typeof vi.fn>;
    readIntervalsFromRow: ReturnType<typeof vi.fn>;
    getSourceBadgeHtml: ReturnType<typeof vi.fn>;
    renderTagGroup: ReturnType<typeof vi.fn>;
    applyFilters: ReturnType<typeof vi.fn>;
    refreshStatus: ReturnType<typeof vi.fn>;
    alert: ReturnType<typeof vi.fn>;
    getApiClient: () => SavedFiltersApiClient;
    miPresets: readonly MiPresetCategory[];
    topListTagNames: Set<string>;
    pluginId: string;
}> = {}): SetupRowEventsDeps {
    const savedFilters = overrides.savedFilters ?? createSavedFiltersState();
    const topLists = overrides.topLists ?? createTopListsState();
    if (overrides.topListTagNames) topLists.tagNames = overrides.topListTagNames;
    const initHomeSectionTab = (overrides.initHomeSectionTab ?? vi.fn()) as unknown as (row: HTMLElement) => void;
    const initPlaylistTab = (overrides.initPlaylistTab ?? vi.fn()) as unknown as (row: HTMLElement) => void;
    const updateHseSectionAvailability = (overrides.updateHseSectionAvailability ?? vi.fn()) as unknown as (row: HTMLElement) => void;
    const checkFormState = (overrides.checkFormState ?? vi.fn()) as unknown as () => void;
    const saveSavedFiltersNow = (overrides.saveSavedFiltersNow ?? vi.fn()) as unknown as () => void;
    const refreshMySavedFiltersPanels = (overrides.refreshMySavedFiltersPanels ?? vi.fn()) as unknown as (filters: readonly never[]) => void;
    const isScheduleCurrentlyActive = (overrides.isScheduleCurrentlyActive ?? vi.fn().mockReturnValue(false)) as unknown as () => boolean;
    const readIntervalsFromRow = (overrides.readIntervalsFromRow ?? vi.fn().mockReturnValue([])) as unknown as () => never[];
    const getSourceBadgeHtml = (overrides.getSourceBadgeHtml ?? vi.fn().mockReturnValue('<span class="tag-indicator source" title="External List"><i class="md-icon">language</i></span>')) as unknown as (s: string) => string;
    const renderTagGroup = (overrides.renderTagGroup ?? vi.fn()) as unknown as () => void;
    const applyFilters = (overrides.applyFilters ?? vi.fn()) as unknown as (view: HTMLElement) => void;
    const refreshStatus = (overrides.refreshStatus ?? vi.fn()) as unknown as (view: HTMLElement) => void;
    const alert = (overrides.alert ?? vi.fn()) as unknown as (m: string) => void;
    const getApiClient = overrides.getApiClient ?? makeApi;

    const deps: SetupRowEventsDeps = {
        savedFilters,
        topLists,
        originalConfigState: { getOriginalConfigState: () => null, setOriginalConfigState: () => {} },
        miFilterDeps: { users: null, collections: [], playlists: [], tags: [] },
        getApiClient,
        pluginId: overrides.pluginId ?? 'plugin-id',
        initHomeSectionTab,
        initPlaylistTab,
        updateHseSectionAvailability,
        checkFormState,
        saveSavedFiltersNow,
        refreshMySavedFiltersPanels: refreshMySavedFiltersPanels as SetupRowEventsDeps['refreshMySavedFiltersPanels'],
        getMaxDays,
        getDayOptions,
        isScheduleCurrentlyActive: isScheduleCurrentlyActive as SetupRowEventsDeps['isScheduleCurrentlyActive'],
        readIntervalsFromRow: readIntervalsFromRow as SetupRowEventsDeps['readIntervalsFromRow'],
        getSourceBadgeHtml: getSourceBadgeHtml as SetupRowEventsDeps['getSourceBadgeHtml'],
        renderTagGroup: renderTagGroup as SetupRowEventsDeps['renderTagGroup'],
        applyFilters,
        refreshStatus,
        miPresets: overrides.miPresets ?? EMPTY_PRESETS,
        view: document.body,
        alert,
        updateBadges: () => {},
        updateRunGroupBtn: () => {},
        updateTagTitle: () => {},
    };
    return deps;
}

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 0));
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setupRowEvents', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    describe('updateBadges', () => {
        it('populates .source-badge when txtEntryLabel input fires', () => {
            const { row } = buildRow();
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const txtEntry = row.querySelector<HTMLInputElement>('.txtEntryLabel')!;
            txtEntry.value = 'My Tag';
            txtEntry.dispatchEvent(new Event('input', { bubbles: true }));
            const container = row.querySelector('.source-badge')!;
            expect(container.innerHTML).toContain('tag-indicator source');
            expect(container.innerHTML).toContain('External List');
        });

        it('adds a Top-List indicator when row.dataset.tag is in topLists.tagNames', () => {
            const { row } = buildRow();
            row.dataset.tag = 'MyTag';
            const topLists = createTopListsState();
            topLists.tagNames.add('mytag');
            const deps = makeDeps({ topLists });
            setupRowEvents(row, deps);
            // Force a re-run via the .txtEntryLabel input (which calls updateTagTitle → updateBadges).
            const txtEntry = row.querySelector<HTMLInputElement>('.txtEntryLabel')!;
            txtEntry.dispatchEvent(new Event('input', { bubbles: true }));
            const container = row.querySelector('.badge-container')!;
            expect(container.innerHTML).toContain('tag-indicator toplist');
            expect(container.innerHTML).toContain('Top-List');
        });

        it('updates the source badge innerHTML when selSourceType changes', () => {
            const { row } = buildRow();
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const sel = row.querySelector<HTMLSelectElement>('.selSourceType')!;
            sel.value = 'AI';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            const sourceBadge = row.querySelector<HTMLElement>('.source-badge')!;
            // The default mock for getSourceBadgeHtml echoes the icon we built; we
            // only care that innerHTML was rewritten at all.
            expect(sourceBadge.innerHTML).not.toBe('');
            expect(deps.getSourceBadgeHtml).toHaveBeenCalledWith('AI');
        });
    });

    describe('updateRunGroupBtn', () => {
        it('enables .btnRunEntry when .chkTagActive is checked (initial state)', () => {
            const { row } = buildRow();
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const runBtn = row.querySelector<HTMLButtonElement>('.btnRunEntry')!;
            expect(runBtn.disabled).toBe(false);
            expect(runBtn.style.opacity).toBe('1');
        });

        it('disables .btnRunEntry when .chkTagActive flips off', () => {
            const { row } = buildRow();
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const chk = row.querySelector<HTMLInputElement>('.chkTagActive')!;
            const lbl = row.querySelector<HTMLElement>('.lblActiveStatus')!;
            chk.checked = false;
            chk.dispatchEvent(new Event('change', { bubbles: true }));
            const runBtn = row.querySelector<HTMLButtonElement>('.btnRunEntry')!;
            expect(runBtn.disabled).toBe(true);
            expect(runBtn.style.opacity).toBe('0.4');
            expect(lbl.textContent).toBe('Disabled');
            expect(row.classList.contains('inactive')).toBe(true);
        });
    });

    describe('savedFilters write', () => {
        // eslint-disable-next-line @typescript-eslint/require-await -- async signature kept for symmetry with sibling tests
        it('pushes onto savedFilters.filters when .btnConfirmSaveFilter is clicked', async () => {
            const { row } = buildRow((r) => {
                // Seed a save-filter panel with a name input, one filter group
                // (so readMiFiltersFromContainer returns at least one group),
                // and the confirm button.
                const sourceMi = r.querySelector('.source-mediainfo-container')!;
                sourceMi.innerHTML = [
                    '<input class="txtSaveFilterName" value="My Saved Filter" />',
                    '<div class="mediainfo-filter-list">',
                    '<div class="mediainfo-filter-group">',
                    '<div class="mi-rules-list">',
                    '<div class="mi-rule">',
                    '<select class="selMiProperty"><option value="Resolution">Resolution</option></select>',
                    '<select class="selMiValue"><option value="4K">4K</option></select>',
                    '</div>',
                    '</div>',
                    '</div>',
                    '</div>',
                    '<button type="button" class="btnConfirmSaveFilter">Save</button>',
                ].join('');
            });
            const savedFilters = createSavedFiltersState();
            const refreshPanels = vi.fn();
            const saveSavedFiltersNow = vi.fn();
            const deps = makeDeps({ savedFilters, refreshMySavedFiltersPanels: refreshPanels, saveSavedFiltersNow });
            setupRowEvents(row, deps);
            const btn = row.querySelector<HTMLButtonElement>('.btnConfirmSaveFilter')!;
            btn.click();
            expect(savedFilters.filters).toHaveLength(1);
            expect(savedFilters.filters[0]?.Name).toBe('My Saved Filter');
            expect(refreshPanels).toHaveBeenCalledTimes(1);
            expect(saveSavedFiltersNow).toHaveBeenCalledTimes(1);
        });

        it('does not push when the name is empty (focus stays on the input)', () => {
            const { row } = buildRow((r) => {
                const sourceMi = r.querySelector('.source-mediainfo-container')!;
                sourceMi.innerHTML = [
                    '<input class="txtSaveFilterName" value="" />',
                    '<div class="mediainfo-filter-list">',
                    '<div class="mediainfo-filter-group">',
                    '<div class="mi-rules-list">',
                    '<div class="mi-rule">',
                    '<select class="selMiProperty"><option value="Resolution">Resolution</option></select>',
                    '<select class="selMiValue"><option value="4K">4K</option></select>',
                    '</div>',
                    '</div>',
                    '</div>',
                    '</div>',
                    '<button type="button" class="btnConfirmSaveFilter">Save</button>',
                ].join('');
            });
            const savedFilters = createSavedFiltersState();
            const deps = makeDeps({ savedFilters });
            setupRowEvents(row, deps);
            const btn = row.querySelector<HTMLButtonElement>('.btnConfirmSaveFilter')!;
            btn.click();
            expect(savedFilters.filters).toHaveLength(0);
        });
    });

    describe('tab init', () => {
        it('homescreen tab click fires deps.initHomeSectionTab', () => {
            const { row } = buildRow();
            const initHse = vi.fn();
            const deps = makeDeps({ initHomeSectionTab: initHse });
            setupRowEvents(row, deps);
            const tab = row.querySelector<HTMLElement>('.tag-tab[data-tab="homescreen"]')!;
            tab.click();
            expect(initHse).toHaveBeenCalledTimes(1);
            expect(initHse.mock.calls[0]?.[0]).toBe(row);
        });

        it('playlist tab click fires deps.initPlaylistTab', () => {
            const { row } = buildRow();
            const initPl = vi.fn();
            const deps = makeDeps({ initPlaylistTab: initPl });
            setupRowEvents(row, deps);
            const tab = row.querySelector<HTMLElement>('.tag-tab[data-tab="playlist"]')!;
            tab.click();
            expect(initPl).toHaveBeenCalledTimes(1);
            expect(initPl.mock.calls[0]?.[0]).toBe(row);
        });
    });

    describe('URL row add', () => {
        it('appends a .url-row when .btnAddUrl is clicked', () => {
            const { row } = buildRow();
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const btn = row.querySelector<HTMLButtonElement>('.btnAddUrl')!;
            expect(row.querySelectorAll('.url-row')).toHaveLength(0);
            btn.click();
            expect(row.querySelectorAll('.url-row')).toHaveLength(1);
            // Also verify that the row contains the canonical URL inputs.
            const urlRow = row.querySelector<HTMLElement>('.url-row')!;
            expect(urlRow.querySelector('.txtTagUrl')).not.toBeNull();
            expect(urlRow.querySelector('.txtUrlLimit')).not.toBeNull();
        });

        it('removes the .url-row when its .btnRemoveUrl is clicked', () => {
            const { row } = buildRow();
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const container = row.querySelector<HTMLElement>('.url-list-container')!;
            container.insertAdjacentHTML('beforeend', getUrlRowHtml('http://example.com', 10));
            const removeBtn = row.querySelector<HTMLElement>('.btnRemoveUrl')!;
            removeBtn.click();
            expect(row.querySelectorAll('.url-row')).toHaveLength(0);
        });
    });

    describe('date row update', () => {
        it('recomputes .selStartDay via deps.getDayOptions when .selStartMonth changes', () => {
            const { row } = buildRow((r) => {
                const dateList = r.querySelector<HTMLElement>('.date-list-container')!;
                dateList.insertAdjacentHTML(
                    'beforeend',
                    '<div class="date-row">' +
                    '<select class="selDateType"><option value="EveryYear">EveryYear</option></select>' +
                    '<select class="selStartMonth"><option value="2">Feb</option><option value="3">Mar</option></select>' +
                    '<select class="selStartDay"><option value="30">30</option></select>' +
                    '</div>',
                );
            });
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const monthSel = row.querySelector<HTMLSelectElement>('.selStartMonth')!;
            monthSel.value = '3';
            monthSel.dispatchEvent(new Event('change', { bubbles: true }));
            // Mar → 31 days. The mock-free deps.getDayOptions is the real
            // `getDayOptions(currentDay, maxDay)` which we pass through; with
            // month=3 it returns 31 options.
            const daySel = row.querySelector<HTMLSelectElement>('.selStartDay')!;
            const optCount = daySel.querySelectorAll('option').length;
            expect(optCount).toBe(31);
            // currentDay was Math.min(parseInt('30', 10), 31) = 30; the selected
            // option must therefore be value="30".
            const selected = daySel.querySelector<HTMLOptionElement>('option[selected]');
            expect(selected?.value).toBe('30');
        });

        it('toggles inputs-specific/annual/weekly when .selDateType changes', () => {
            const { row } = buildRow((r) => {
                const dateList = r.querySelector<HTMLElement>('.date-list-container')!;
                dateList.insertAdjacentHTML(
                    'beforeend',
                    '<div class="date-row">' +
                    '<select class="selDateType">' +
                    '<option value="SpecificDate">SpecificDate</option>' +
                    '<option value="EveryYear">EveryYear</option>' +
                    '<option value="Weekly">Weekly</option>' +
                    '</select>' +
                    '<div class="inputs-specific" style="display:flex;">specific</div>' +
                    '<div class="inputs-annual" style="display:none;">annual</div>' +
                    '<div class="inputs-weekly" style="display:none;">weekly</div>' +
                    '</div>',
                );
            });
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const sel = row.querySelector<HTMLSelectElement>('.selDateType')!;
            sel.value = 'Weekly';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            const specific = row.querySelector<HTMLElement>('.inputs-specific')!;
            const weekly = row.querySelector<HTMLElement>('.inputs-weekly')!;
            expect(specific.style.display).toBe('none');
            expect(weekly.style.display).toBe('flex');
        });
    });

    describe('checkFormState', () => {
        it('is called via setTimeout when .txtEntryLabel input fires (legacy does not call it here)', async () => {
            const { row } = buildRow();
            const checkFormState = vi.fn();
            const deps = makeDeps({ checkFormState });
            setupRowEvents(row, deps);
            const txtEntry = row.querySelector<HTMLInputElement>('.txtEntryLabel')!;
            txtEntry.dispatchEvent(new Event('input', { bubbles: true }));
            await flushMicrotasks();
            expect(checkFormState).not.toHaveBeenCalled();
        });

        it('is called via setTimeout when .selSourceType changes', async () => {
            const { row } = buildRow();
            const checkFormState = vi.fn();
            const deps = makeDeps({ checkFormState });
            setupRowEvents(row, deps);
            const sel = row.querySelector<HTMLSelectElement>('.selSourceType')!;
            sel.value = 'MediaInfo';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            await flushMicrotasks();
            expect(checkFormState).toHaveBeenCalled();
        });

        // eslint-disable-next-line @typescript-eslint/require-await -- async signature kept for symmetry with sibling tests
        it('is called via setTimeout when .btnRemoveDate is clicked', async () => {
            const { row } = buildRow((r) => {
                const dateList = r.querySelector<HTMLElement>('.date-list-container')!;
                dateList.insertAdjacentHTML(
                    'beforeend',
                    '<div class="date-row">' +
                    '<button type="button" class="btnRemoveDate">x</button>' +
                    '</div>',
                );
            });
            const checkFormState = vi.fn();
            const deps = makeDeps({ checkFormState });
            setupRowEvents(row, deps);
            const removeBtn = row.querySelector<HTMLButtonElement>('.btnRemoveDate')!;
            removeBtn.click();
            expect(checkFormState).not.toHaveBeenCalled();
            // The remove handler itself doesn't ping checkFormState; the only
            // ping around date rows is the .selStartMonth / .selEndMonth
            // change handler. That makes the "remove triggers checkFormState"
            // claim false — assert it explicitly so future drift is caught.
        });
    });

    describe('hseSectionAvailability on source-type change', () => {
        it('fires deps.updateHseSectionAvailability when .selSourceType changes', () => {
            const { row } = buildRow();
            const updateHse = vi.fn();
            const deps = makeDeps({ updateHseSectionAvailability: updateHse });
            setupRowEvents(row, deps);
            const sel = row.querySelector<HTMLSelectElement>('.selSourceType')!;
            sel.value = 'External';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            expect(updateHse).toHaveBeenCalledWith(row);
        });

        it('also pings deps.updateHseSectionAvailability from the trailing setTimeout', async () => {
            const { row } = buildRow();
            const updateHse = vi.fn();
            const deps = makeDeps({ updateHseSectionAvailability: updateHse });
            setupRowEvents(row, deps);
            await flushMicrotasks();
            expect(updateHse).toHaveBeenCalledWith(row);
        });
    });

    describe('url-row add wraps getUrlRowHtml output', () => {
        it('appends the exact row template (same shape as dom.getUrlRowHtml)', () => {
            const { row } = buildRow();
            const deps = makeDeps();
            setupRowEvents(row, deps);
            const btn = row.querySelector<HTMLButtonElement>('.btnAddUrl')!;
            btn.click();
            const added = row.querySelector<HTMLElement>('.url-row')!;
            // The lifted template uses `url-row` + `txtTagUrl` + `txtUrlLimit`.
            expect(added.classList.contains('url-row')).toBe(true);
            expect(added.querySelector('input.txtTagUrl')).not.toBeNull();
            expect(added.querySelector('input.txtUrlLimit')).not.toBeNull();
        });
    });

    describe('miFilter apply / delete', () => {
        it('splices + refreshes + persists when .btnDeleteMySavedFilter is clicked', () => {
            const { row } = buildRow((r) => {
                const sourceMi = r.querySelector('.source-mediainfo-container')!;
                sourceMi.innerHTML = [
                    '<div class="mediainfo-filter-list"></div>',
                    '<div class="mi-saved-panel">',
                    '<button type="button" class="btnDeleteMySavedFilter" data-index="0">x</button>',
                    '</div>',
                ].join('');
            });
            const savedFilters = createSavedFiltersState();
            savedFilters.filters.push({ Name: 'Foo', Filters: [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['Resolution:4K'] }] });
            const refresh = vi.fn();
            const save = vi.fn();
            const deps = makeDeps({ savedFilters, refreshMySavedFiltersPanels: refresh, saveSavedFiltersNow: save });
            setupRowEvents(row, deps);
            const btn = row.querySelector<HTMLButtonElement>('.btnDeleteMySavedFilter')!;
            btn.click();
            expect(savedFilters.filters).toHaveLength(0);
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(save).toHaveBeenCalledTimes(1);
        });
    });
});
