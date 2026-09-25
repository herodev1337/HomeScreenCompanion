/// <reference types="vitest" />
//
// Tests for `rows/runEntry.ts` — the row's run-group handler plus
// the URL/Local/Date add/remove buttons, the `.txtEntryLabel` /
// `.txtTagName` title sync, the `.btnDuplicateRow` clone, the
// `.btnTestUrl` / `.btnTestAiSource` server probes, the header expand
// and the URL/Date/Local remove buttons.
//
// We focus on the structural mutations that the wired handlers
// produce — `alert` when the entry has no name, appending a URL row
// when `.btnAddUrl` is clicked, removing a URL row when its
// `.btnRemoveUrl` is clicked.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wireRunEntry } from './runEntry';
import { createRowController } from './createRowController';
import { getUrlRowHtml } from '../dom/dom';
import { createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';
    const btnRunEntry = document.createElement('button');
    btnRunEntry.className = 'btnRunEntry';
    const runLabel = document.createElement('span');
    runLabel.className = 'btnRunEntryLabel';
    btnRunEntry.appendChild(runLabel);
    row.appendChild(btnRunEntry);
    const txtEntry = document.createElement('input');
    txtEntry.type = 'text';
    txtEntry.className = 'txtEntryLabel';
    row.appendChild(txtEntry);
    const urlList = document.createElement('div');
    urlList.className = 'url-list-container';
    row.appendChild(urlList);
    const btnAddUrl = document.createElement('button');
    btnAddUrl.className = 'btnAddUrl';
    row.appendChild(btnAddUrl);
    const btnDuplicate = document.createElement('button');
    btnDuplicate.className = 'btnDuplicateRow';
    row.appendChild(btnDuplicate);
    document.body.appendChild(row);
    return row;
}

function makeDeps(overrides: Partial<{ alert: ReturnType<typeof vi.fn> }> = {}): SetupRowEventsDeps {
    const alertFn = (overrides.alert ?? vi.fn()) as unknown as (m: string) => void;
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
        alert: alertFn,
        updateBadges: () => {},
        updateRunGroupBtn: () => {},
        updateTagTitle: () => {},
    };
}

describe('runEntry', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('alerts when the row has no entry name (.btnRunEntry with empty txtEntryLabel / .txtTagName)', () => {
        const row = buildRow();
        const alert = vi.fn();
        const deps = makeDeps({ alert });
        const controller = createRowController(row, deps);
        wireRunEntry(row, deps, { controller });
        const btn = row.querySelector<HTMLButtonElement>('.btnRunEntry')!;
        btn.click();
        expect(alert).toHaveBeenCalledWith('Entry has no name or tag.');
    });

    it('appends a .url-row when .btnAddUrl is clicked', () => {
        const row = buildRow();
        const deps = makeDeps();
        const controller = createRowController(row, deps);
        wireRunEntry(row, deps, { controller });
        const btn = row.querySelector<HTMLButtonElement>('.btnAddUrl')!;
        expect(row.querySelectorAll('.url-row')).toHaveLength(0);
        btn.click();
        expect(row.querySelectorAll('.url-row')).toHaveLength(1);
    });

    it('removes the .url-row when its .btnRemoveUrl is clicked', () => {
        const row = buildRow();
        const deps = makeDeps();
        const controller = createRowController(row, deps);
        wireRunEntry(row, deps, { controller });
        const container = row.querySelector<HTMLElement>('.url-list-container')!;
        container.insertAdjacentHTML('beforeend', getUrlRowHtml('http://example.com', 10));
        const removeBtn = row.querySelector<HTMLElement>('.btnRemoveUrl')!;
        removeBtn.click();
        expect(row.querySelectorAll('.url-row')).toHaveLength(0);
    });
});
