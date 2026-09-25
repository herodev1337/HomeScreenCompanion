/// <reference types="vitest" />
//
// Tests for `rows/posterUpload.ts` — the row's poster controls
// (`.btnChoosePoster` / `.inputPosterFile` / `.btnRemovePoster` /
// `.btnLoadPosterUrl`). The actual `fetch` to the upload /
// fetch-from-url endpoints requires a network round trip; we exercise
// the DOM mutations the wired handlers produce: button click triggers
// the hidden file input, and the remove button clears the preview.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { wirePosterUpload } from './posterUpload';
import { createTopListsState } from '../state/state';
import type { ScheduleInterval } from '../filters/rows';
import type { SavedFilter } from '../filters/savedFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

function buildRow(): HTMLElement {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'tag-row';
    const btnChoose = document.createElement('button');
    btnChoose.className = 'btnChoosePoster';
    row.appendChild(btnChoose);
    const inputFile = document.createElement('input');
    inputFile.type = 'file';
    inputFile.className = 'inputPosterFile';
    row.appendChild(inputFile);
    const btnRemove = document.createElement('button');
    btnRemove.className = 'btnRemovePoster';
    row.appendChild(btnRemove);
    const pathInput = document.createElement('input');
    pathInput.type = 'hidden';
    pathInput.className = 'hiddenPosterPath';
    pathInput.value = '/old.jpg';
    row.appendChild(pathInput);
    const fnameEl = document.createElement('span');
    fnameEl.className = 'poster-filename';
    fnameEl.textContent = 'old.jpg';
    row.appendChild(fnameEl);
    const previewContainer = document.createElement('div');
    previewContainer.className = 'poster-preview-container';
    previewContainer.style.display = 'block';
    row.appendChild(previewContainer);
    const previewImg = document.createElement('img');
    previewImg.className = 'poster-preview-img';
    previewImg.style.display = 'block';
    row.appendChild(previewImg);
    document.body.appendChild(row);
    return row;
}

function makeDeps(alert: ReturnType<typeof vi.fn>): SetupRowEventsDeps {
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
        alert: alert as unknown as (m: string) => void,
        updateBadges: () => {},
        updateRunGroupBtn: () => {},
        updateTagTitle: () => {},
    };
}

describe('posterUpload', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('clicking .btnChoosePoster triggers the hidden .inputPosterFile click()', () => {
        const row = buildRow();
        const deps = makeDeps(vi.fn());
        wirePosterUpload(row, deps);
        const btn = row.querySelector<HTMLButtonElement>('.btnChoosePoster')!;
        const input = row.querySelector<HTMLInputElement>('.inputPosterFile')!;
        const inputClickSpy = vi.spyOn(input, 'click');
        btn.click();
        expect(inputClickSpy).toHaveBeenCalledTimes(1);
    });

    it('clicking .btnRemovePoster clears the hidden path and hides the preview', () => {
        const row = buildRow();
        const deps = makeDeps(vi.fn());
        wirePosterUpload(row, deps);
        const btn = row.querySelector<HTMLButtonElement>('.btnRemovePoster')!;
        btn.click();
        const pathInput = row.querySelector<HTMLInputElement>('.hiddenPosterPath')!;
        const previewContainer = row.querySelector<HTMLElement>('.poster-preview-container')!;
        const previewImg = row.querySelector<HTMLImageElement>('.poster-preview-img')!;
        const fnameEl = row.querySelector<HTMLElement>('.poster-filename')!;
        expect(pathInput.value).toBe('');
        expect(previewContainer.style.display).toBe('none');
        expect(previewImg.style.display).toBe('none');
        expect(fnameEl.textContent).toBe('');
    });
});
