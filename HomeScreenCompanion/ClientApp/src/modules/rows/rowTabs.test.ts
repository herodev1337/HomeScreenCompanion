/// <reference types="vitest" />
//
// Tests for `rows/rowTabs.ts` — the `.tag-tab[data-tab="…"]` click
// handler that toggles the matching `.general-tab` / `.tagname-tab` /
// `.schedule-tab` / … block visibility and pings
// `deps.initHomeSectionTab` / `deps.initPlaylistTab` for the homescreen
// and playlist sub-tabs.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wireRowTabs } from './rowTabs';
import { createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';
    for (const t of ['general', 'tagname', 'schedule', 'collection', 'advanced', 'homescreen', 'playlist']) {
        const tab = document.createElement('button');
        tab.className = 'tag-tab';
        tab.dataset.tab = t;
        row.appendChild(tab);
        const body = document.createElement('div');
        body.className = `${t}-tab`;
        row.appendChild(body);
    }
    document.body.appendChild(row);
    return row;
}

function makeDeps(overrides: Partial<{ initHomeSectionTab: ReturnType<typeof vi.fn>; initPlaylistTab: ReturnType<typeof vi.fn> }> = {}): SetupRowEventsDeps {
    return {
        savedFilters: { filters: [] },
        topLists: createTopListsState(),
        originalConfigState: { getOriginalConfigState: () => null, setOriginalConfigState: () => {} },
        miFilterDeps: { users: null, collections: [], playlists: [], tags: [] },
        getApiClient: () => ({ getPluginConfiguration: vi.fn(), updatePluginConfiguration: vi.fn() }),
        pluginId: 'plugin-id',
        initHomeSectionTab: (overrides.initHomeSectionTab ?? vi.fn()) as unknown as (row: HTMLElement) => void,
        initPlaylistTab: (overrides.initPlaylistTab ?? vi.fn()) as unknown as (row: HTMLElement) => void,
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

describe('rowTabs', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('shows the matching .*-tab block and pings deps.initHomeSectionTab on click', () => {
        const row = buildRow();
        const initHse = vi.fn();
        const deps = makeDeps({ initHomeSectionTab: initHse });
        wireRowTabs(row, deps);
        const tab = row.querySelector<HTMLElement>('.tag-tab[data-tab="homescreen"]')!;
        const homescreenBody = row.querySelector<HTMLElement>('.homescreen-tab')!;
        const generalBody = row.querySelector<HTMLElement>('.general-tab')!;
        tab.click();
        expect(homescreenBody.style.display).toBe('block');
        expect(generalBody.style.display).toBe('none');
        expect(initHse).toHaveBeenCalledWith(row);
    });
});
