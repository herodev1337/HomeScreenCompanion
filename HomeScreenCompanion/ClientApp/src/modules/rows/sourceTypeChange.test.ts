/// <reference types="vitest" />
//
// Tests for `rows/sourceTypeChange.ts` — the row-level delegated
// `change` listener that handles `.selSourceType` and reveals the
// correct source container block (`.source-external-container` /
// `.source-local-container` / `.source-mediainfo-container` /
// `.source-ai-container`).

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wireSourceTypeChange } from './sourceTypeChange';
import { createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';
    const sel = document.createElement('select');
    sel.className = 'selSourceType';
    for (const v of ['External', 'LocalCollection', 'LocalPlaylist', 'MediaInfo', 'AI']) {
        const opt = document.createElement('option');
        opt.value = v;
        sel.appendChild(opt);
    }
    row.appendChild(sel);
    for (const cls of ['source-external-container', 'source-local-container', 'source-mediainfo-container', 'source-ai-container']) {
        const div = document.createElement('div');
        div.className = cls;
        row.appendChild(div);
    }
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

describe('sourceTypeChange', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('reveals .source-external-container when .selSourceType flips to External', () => {
        const row = buildRow();
        const deps = makeDeps();
        const controller = { updateBadges: vi.fn(), updateRunGroupBtn: vi.fn(), updateTagTitle: vi.fn() };
        wireSourceTypeChange(row, deps, { controller });
        const sel = row.querySelector<HTMLSelectElement>('.selSourceType')!;
        const ext = row.querySelector<HTMLElement>('.source-external-container')!;
        const local = row.querySelector<HTMLElement>('.source-local-container')!;
        const ai = row.querySelector<HTMLElement>('.source-ai-container')!;
        sel.value = 'External';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        expect(ext.style.display).toBe('block');
        expect(local.style.display).toBe('none');
        expect(ai.style.display).toBe('none');
    });

    it('reveals .source-ai-container when .selSourceType flips to AI', () => {
        const row = buildRow();
        const deps = makeDeps();
        const controller = { updateBadges: vi.fn(), updateRunGroupBtn: vi.fn(), updateTagTitle: vi.fn() };
        wireSourceTypeChange(row, deps, { controller });
        const sel = row.querySelector<HTMLSelectElement>('.selSourceType')!;
        const ai = row.querySelector<HTMLElement>('.source-ai-container')!;
        sel.value = 'AI';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        expect(ai.style.display).toBe('block');
    });
});
