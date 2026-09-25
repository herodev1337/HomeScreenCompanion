/// <reference types="vitest" />
//
// Tests for `rows/rowDrag.ts` — the row's `.drag-handle` mousedown /
// mouseup / touchstart pipeline plus the row-level `dragstart` /
// `dragend` handlers.
//
// Happy-dom does not implement full drag-and-drop / touchmove
// bookkeeping, so the test focuses on the DOM state mutations the
// legacy pipeline produces *after* an event dispatch (e.g. the
// `draggable` attribute flip on `.drag-handle` mousedown,
// `.sort-placeholder` creation on touchmove).

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wireRowDrag } from './rowDrag';
import { createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    row.appendChild(handle);
    const list = document.createElement('div');
    list.id = 'tagListContainer';
    list.appendChild(row);
    document.body.appendChild(list);
    return row;
}

function makeDeps(checkFormState: ReturnType<typeof vi.fn>): SetupRowEventsDeps {
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
        checkFormState: checkFormState as unknown as () => void,
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

describe('rowDrag', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('sets draggable=true on mousedown when sort-by is Manual', () => {
        localStorage.setItem('HomeScreenCompanion_SortBy', 'Manual');
        const row = buildRow();
        const deps = makeDeps(vi.fn());
        wireRowDrag(row, deps);
        const handle = row.querySelector<HTMLElement>('.drag-handle')!;
        handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(row.getAttribute('draggable')).toBe('true');
        handle.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        expect(row.getAttribute('draggable')).toBe('false');
    });

    it('does not flip draggable=true when sort-by is not Manual', () => {
        localStorage.removeItem('HomeScreenCompanion_SortBy');
        const row = buildRow();
        const deps = makeDeps(vi.fn());
        wireRowDrag(row, deps);
        const handle = row.querySelector<HTMLElement>('.drag-handle')!;
        handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(row.getAttribute('draggable')).toBeNull();
    });
});
