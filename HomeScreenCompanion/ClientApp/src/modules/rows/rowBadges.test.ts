/// <reference types="vitest" />
//
// Tests for `rows/rowBadges.ts` — the per-row enable-checkbox wiring
// (`.chkEnableTag` / `.chkEnableCollection` / `.chkEnablePlaylist` /
// `.chkEnableHomeSection` / `.chkOverrideWhenActive`) plus the
// `.chkTagActive` swap and the header expand/collapse.
//
// We populate a minimal `.tag-row` subtree (badge container +
// enable-checkboxes), invoke `wireRowBadges(row, deps, { controller })`,
// drive a `.chkEnableCollection` change event, then assert that the
// `.collection-settings` block toggles its display.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wireRowBadges } from './rowBadges';
import { createRowController } from './createRowController';
import { createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';

    const header = document.createElement('div');
    header.className = 'tag-header';
    header.appendChild(document.createElement('div')); // header-actions
    row.appendChild(header);

    const body = document.createElement('div');
    body.className = 'tag-body';
    row.appendChild(body);

    const lbl = document.createElement('span');
    lbl.className = 'lblActiveStatus';
    row.appendChild(lbl);
    const chkActive = document.createElement('input');
    chkActive.type = 'checkbox';
    chkActive.className = 'chkTagActive';
    chkActive.checked = true;
    row.appendChild(chkActive);

    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'badge-container';
    row.appendChild(badgeContainer);
    const sourceBadge = document.createElement('div');
    sourceBadge.className = 'source-badge';
    row.appendChild(sourceBadge);

    for (const cls of ['chkEnableTag', 'chkEnableCollection', 'chkEnablePlaylist', 'chkEnableHomeSection']) {
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.className = cls;
        row.appendChild(c);
    }
    for (const cls of ['tag-settings', 'collection-settings', 'playlist-settings', 'hse-details']) {
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

describe('rowBadges', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('toggles .collection-settings when .chkEnableCollection flips', () => {
        const row = buildRow();
        const deps = makeDeps();
        const controller = createRowController(row, deps);
        wireRowBadges(row, deps, { controller });
        const chk = row.querySelector<HTMLInputElement>('.chkEnableCollection')!;
        const settings = row.querySelector<HTMLElement>('.collection-settings')!;
        chk.checked = true;
        chk.dispatchEvent(new Event('change', { bubbles: true }));
        expect(settings.style.display).toBe('block');
        chk.checked = false;
        chk.dispatchEvent(new Event('change', { bubbles: true }));
        expect(settings.style.display).toBe('none');
    });
});
