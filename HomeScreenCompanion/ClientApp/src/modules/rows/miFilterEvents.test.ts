/// <reference types="vitest" />
//
// Tests for `rows/miFilterEvents.ts` — the delegated row `click`
// handlers for the media-info filter row (`.btnAddMediaInfoFilter` /
// `.btnRemoveFilterGroup` / `.btnClearAllFilters` / `.btnGroupOpChoice` /
// `.btnGroupInnerOpChoice` / `.btnNotToggle` / `.btnAddMiRule` /
// `.btnRemoveMiRule` / `.btnRemoveGroup` / `.btnPremadeFilters` /
// `.btnMiHelp` / `.btnToggleAdditionalFilters`).

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wireMiFilterEvents } from './miFilterEvents';
import { createTopListsState } from '../state/state';
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

function makeDeps(): SetupRowEventsDeps {
    return {
        savedFilters: { filters: [] },
        topLists: createTopListsState(),
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

describe('miFilterEvents', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('toggles a media-info filter row when .btnAddMediaInfoFilter is clicked', () => {
        const row = buildRow();
        const deps = makeDeps();
        wireMiFilterEvents(row, deps);
        row.insertAdjacentHTML(
            'beforeend',
            '<div class="mediainfo-filter-list"></div>' +
            '<button type="button" class="btnAddMediaInfoFilter">Add</button>',
        );
        const list = row.querySelector<HTMLElement>('.mediainfo-filter-list')!;
        expect(list.children).toHaveLength(0);
        const btn = row.querySelector<HTMLButtonElement>('.btnAddMediaInfoFilter')!;
        btn.click();
        expect(list.querySelectorAll('.mediainfo-filter-group')).toHaveLength(1);
    });
});
