/// <reference types="vitest" />
//
// Tests for `rows/createRowController.ts` — the `createRowController(row, deps)`
// factory returns a `RowController` whose three updaters (`updateBadges`,
// `updateRunGroupBtn`, `updateTagTitle`) each capture `row` and `deps`
// and the deps bag's `update*` slots become populated after the call.
//
// The contract test asserts:
//   1. The returned controller has the three updaters as functions.
//   2. `updateBadges(row)` mutates `.badge-container` HTML.
//   3. `updateRunGroupBtn(row)` mutates `.btnRunEntry.disabled` / opacity.
//   4. `updateTagTitle(row)` mutates `.tag-title.textContent`.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { createRowController } from './createRowController';
import { createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'badge-container';
    row.appendChild(badgeContainer);
    const sourceBadge = document.createElement('div');
    sourceBadge.className = 'source-badge';
    row.appendChild(sourceBadge);
    const selSource = document.createElement('select');
    selSource.className = 'selSourceType';
    for (const v of ['External', 'LocalCollection', 'LocalPlaylist', 'MediaInfo', 'AI']) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selSource.appendChild(opt);
    }
    selSource.value = 'AI';
    row.appendChild(selSource);
    const runBtn = document.createElement('button');
    runBtn.className = 'btnRunEntry';
    row.appendChild(runBtn);
    const chkActive = document.createElement('input');
    chkActive.type = 'checkbox';
    chkActive.className = 'chkTagActive';
    chkActive.checked = true;
    row.appendChild(chkActive);
    const titleEl = document.createElement('div');
    titleEl.className = 'tag-title';
    titleEl.textContent = 'New';
    row.appendChild(titleEl);
    const txtEntry = document.createElement('input');
    txtEntry.type = 'text';
    txtEntry.className = 'txtEntryLabel';
    row.appendChild(txtEntry);
    document.body.appendChild(row);
    return row;
}

function makeDeps(overrides: Partial<{ getSourceBadgeHtml: ReturnType<typeof vi.fn>; topLists: ReturnType<typeof createTopListsState> }> = {}): SetupRowEventsDeps {
    return {
        savedFilters: { filters: [] },
        topLists: overrides.topLists ?? createTopListsState(),
        originalConfigState: { getOriginalConfigState: () => null, setOriginalConfigState: () => {} },
        miFilterDeps: { users: null, collections: [], playlists: [], tags: [] },
        getApiClient: () => ({ getPluginConfiguration: vi.fn(), updatePluginConfiguration: vi.fn() }),
        pluginId: 'plugin-id',
        initHomeSectionTab: vi.fn() as unknown as (row: HTMLElement) => void,
        initPlaylistTab: vi.fn() as unknown as (row: HTMLElement) => void,
        updateHseSectionAvailability: vi.fn() as unknown as (row: HTMLElement) => void,
        checkFormState: vi.fn() as unknown as () => void,
        saveSavedFiltersNow: vi.fn() as unknown as () => void,
        refreshMySavedFiltersPanels: vi.fn() as unknown as (sf: readonly SavedFilter[]) => void,
        getMaxDays: (_m: number) => 31,
        getDayOptions: (_d: number, m: number) => Array.from({ length: m }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(''),
        isScheduleCurrentlyActive: (_i: readonly ScheduleInterval[]) => false,
        readIntervalsFromRow: (_r: HTMLElement) => [],
        getSourceBadgeHtml: ((overrides.getSourceBadgeHtml ?? vi.fn().mockReturnValue('<span class="tag-indicator source">x</span>')) as unknown as (s: string) => string),
        renderTagGroup: vi.fn() as unknown as () => void,
        applyFilters: vi.fn() as unknown as (view: HTMLElement) => void,
        refreshStatus: vi.fn() as unknown as (view: HTMLElement) => void,
        miPresets: [],
        view: document.body,
        alert: vi.fn() as unknown as (m: string) => void,
        updateBadges: () => {},
        updateRunGroupBtn: () => {},
        updateTagTitle: () => {},
    };
}

describe('createRowController', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('returns a controller with three updaters', () => {
        const row = buildRow();
        const deps = makeDeps();
        const ctl = createRowController(row, deps);
        expect(typeof ctl.updateBadges).toBe('function');
        expect(typeof ctl.updateRunGroupBtn).toBe('function');
        expect(typeof ctl.updateTagTitle).toBe('function');
    });

    it('updateBadges repaints the .source-badge via deps.getSourceBadgeHtml', () => {
        const row = buildRow();
        const badgeSpy = vi.fn().mockReturnValue('<span class="tag-indicator source">AI</span>');
        const deps = makeDeps({ getSourceBadgeHtml: badgeSpy });
        const ctl = createRowController(row, deps);
        ctl.updateBadges(row);
        expect(badgeSpy).toHaveBeenCalledWith('AI');
        const sourceBadge = row.querySelector('.source-badge')!;
        expect(sourceBadge.innerHTML).toContain('tag-indicator source');
    });

    it('updateBadges mutates the .badge-container innerHTML when at least one flag is on', () => {
        const row = buildRow();
        const chkTag = document.createElement('input');
        chkTag.type = 'checkbox';
        chkTag.className = 'chkEnableTag';
        chkTag.checked = true;
        row.appendChild(chkTag);
        const deps = makeDeps();
        const ctl = createRowController(row, deps);
        ctl.updateBadges(row);
        const container = row.querySelector('.badge-container')!;
        expect(container.innerHTML).toContain('tag-indicator tag');
    });

    it('updateRunGroupBtn mutates the .btnRunEntry disabled flag', () => {
        const row = buildRow();
        const deps = makeDeps();
        const ctl = createRowController(row, deps);
        ctl.updateRunGroupBtn(row);
        const runBtn = row.querySelector<HTMLButtonElement>('.btnRunEntry')!;
        expect(runBtn.disabled).toBe(false);
        expect(runBtn.style.opacity).toBe('1');
    });

    it('updateTagTitle mutates .tag-title textContent from .txtEntryLabel', () => {
        const row = buildRow();
        const deps = makeDeps();
        const ctl = createRowController(row, deps);
        const txt = row.querySelector<HTMLInputElement>('.txtEntryLabel')!;
        txt.value = 'Friendly Label';
        ctl.updateTagTitle(row);
        const titleEl = row.querySelector<HTMLElement>('.tag-title')!;
        expect(titleEl.textContent).toBe('Friendly Label');
    });
});
