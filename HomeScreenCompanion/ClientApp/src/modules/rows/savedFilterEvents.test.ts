/// <reference types="vitest" />
//
// Tests for `rows/savedFilterEvents.ts` — the delegated row `click`
// handlers for the saved-filter panel (`.btnConfirmSaveFilter` /
// `.btnApplyMySavedFilter` / `.btnDeleteMySavedFilter` /
// `.btnApplyMiPreset` / `.btnMySavedFilters`).

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wireSavedFilterEvents } from './savedFilterEvents';
import { createSavedFiltersState, createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';
    const sourceMi = document.createElement('div');
    sourceMi.className = 'source-mediainfo-container';
    row.appendChild(sourceMi);
    document.body.appendChild(row);
    return row;
}

function makeDeps(overrides: {
    savedFilters?: ReturnType<typeof createSavedFiltersState>;
    refreshPanels?: ReturnType<typeof vi.fn>;
    save?: ReturnType<typeof vi.fn>;
} = {}): SetupRowEventsDeps {
    return {
        savedFilters: overrides.savedFilters ?? createSavedFiltersState(),
        topLists: createTopListsState(),
        originalConfigState: { getOriginalConfigState: () => null, setOriginalConfigState: () => {} },
        miFilterDeps: { users: null, collections: [], playlists: [], tags: [] },
        getApiClient: () => ({ getPluginConfiguration: vi.fn(), updatePluginConfiguration: vi.fn() }),
        pluginId: 'plugin-id',
        initHomeSectionTab: vi.fn() as unknown as (row: HTMLElement) => void,
        initPlaylistTab: vi.fn() as unknown as (row: HTMLElement) => void,
        updateHseSectionAvailability: vi.fn() as unknown as (row: HTMLElement) => void,
        checkFormState: vi.fn() as unknown as () => void,
        saveSavedFiltersNow: (overrides.save ?? vi.fn()) as unknown as () => void,
        refreshMySavedFiltersPanels: (overrides.refreshPanels ?? vi.fn()) as unknown as (sf: readonly SavedFilter[]) => void,
        getMaxDays: (_m: number) => 31,
        getDayOptions: (_d: number, m: number) => Array.from({ length: m }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(''),
        isScheduleCurrentlyActive: (_i: readonly ScheduleInterval[]) => false,
        readIntervalsFromRow: (_r: HTMLElement) => [],
        getSourceBadgeHtml: (s: string) => `<span>${s}</span>`,
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

describe('savedFilterEvents', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('splices + refreshes + persists when .btnDeleteMySavedFilter is clicked', () => {
        const row = buildRow();
        row.insertAdjacentHTML(
            'beforeend',
            '<div class="mi-saved-panel">' +
            '<button type="button" class="btnDeleteMySavedFilter" data-index="0">x</button>' +
            '</div>',
        );
        const savedFilters = createSavedFiltersState();
        savedFilters.filters.push({ Name: 'Foo', Filters: [{ Operator: 'AND', GroupOperator: 'AND', Criteria: ['Resolution:4K'] }] });
        const refresh = vi.fn();
        const save = vi.fn();
        const deps = makeDeps({ savedFilters, refreshPanels: refresh, save });
        wireSavedFilterEvents(row, deps);
        const btn = row.querySelector<HTMLButtonElement>('.btnDeleteMySavedFilter')!;
        btn.click();
        expect(savedFilters.filters).toHaveLength(0);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('toggles the .mi-saved-panel block when .btnMySavedFilters is clicked', () => {
        const row = buildRow();
        row.insertAdjacentHTML(
            'beforeend',
            '<div class="source-mediainfo-container">' +
            '<div class="mi-saved-panel" style="display:none;">hidden</div>' +
            '<button type="button" class="btnMySavedFilters"><span class="mi-expand-icon">></span></button>' +
            '</div>',
        );
        const deps = makeDeps();
        wireSavedFilterEvents(row, deps);
        const btn = row.querySelector<HTMLButtonElement>('.btnMySavedFilters')!;
        const panel = row.querySelector<HTMLElement>('.mi-saved-panel')!;
        btn.click();
        expect(panel.style.display).toBe('');
        btn.click();
        expect(panel.style.display).toBe('none');
    });
});
