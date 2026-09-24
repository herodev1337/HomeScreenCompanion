/// <reference types="vitest" />
//
// Smoke tests for `modules/toplists/modals.ts`. The four functions are
// DOM + fetch + deps-driven and have no legacy-fixture mirror — these
// tests cover the routing surface (chooser), the form-rendering
// (tag + manual), and the `body.tlSaveForm` wiring (inline edit).
//
// Conventions (mirrors `manageTab.test.ts`, `topListsTab.test.ts`):
//   - `vi.fn(...).mockResolvedValue(...)` for `fetch` and helper deps
//   - drain microtasks after async callbacks with `for/await Promise`
//   - assert DOM shape via `toContain` and structural queries
//   - clean `document.body` + helpers between `it()` blocks

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    showTopListModal,
    showManualTopListModal,
    loadInlineEditForm,
    showCreateTopListChooser,
    type TopListModalApiClient,
    type TopListModalDeps,
    type ExecuteTopListCreationSteps,
} from './modals';
import type { FetchLike } from './creation';
import type { HscUserLike } from '../homesections/hscTab';
import { createTopListsState, createHseUserCacheState, PLUGIN_ID } from '../state/state';
import { buildUserMultiSelectHtml, wireUserMultiSelect } from '../homesections/users';
import { buildBadgePickerHtml, initBadgePicker, readBadgeStyle } from './badgePicker';

const USERS: readonly HscUserLike[] = [
    { Id: 'u1', Name: 'Alice' },
    { Id: 'u2', Name: 'Bob' },
];

function makeApi(): TopListModalApiClient {
    return {
        accessToken: () => 'test-token',
        getUrl: (name) => 'http://legacy.test/' + name,
        getJSON: vi.fn().mockResolvedValue(USERS),
        updatePluginConfiguration: vi.fn().mockResolvedValue(undefined),
        getPluginConfiguration: vi.fn().mockResolvedValue({}),
    };
}

function makeDeps(overrides: Partial<{
    fetch: FetchLike;
    getHseUsers: () => Promise<HscUserLike[]>;
    executeTopListCreationSteps: ExecuteTopListCreationSteps;
    showTopListModal: TopListModalDeps['showTopListModal'];
    showManualTopListModal: TopListModalDeps['showManualTopListModal'];
    loadInlineEditForm: TopListModalDeps['loadInlineEditForm'];
}> = {}): TopListModalDeps {
    const api = makeApi();
    const fetchMock = (overrides.fetch ?? vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ Movies: [], FolderNames: [] })
    })) as FetchLike;
    const execMock = (overrides.executeTopListCreationSteps ?? vi.fn().mockResolvedValue(undefined)) as unknown as ExecuteTopListCreationSteps;
    return {
        fetch: fetchMock,
        getApiClient: () => api,
        alert: vi.fn(),
        confirm: vi.fn(() => true),
        closeModal: vi.fn(),
        escapeHtml: (s: unknown) => String(s),
        executeTopListCreationSteps: execMock,
        getHseUsers: overrides.getHseUsers ?? (vi.fn().mockResolvedValue(USERS) as unknown as () => Promise<HscUserLike[]>),
        buildUserMultiSelectHtml,
        wireUserMultiSelect,
        buildBadgePickerHtml,
        initBadgePicker,
        readBadgeStyle,
        showTopListModal: overrides.showTopListModal ?? vi.fn(),
        showManualTopListModal: overrides.showManualTopListModal ?? vi.fn(),
        loadInlineEditForm: overrides.loadInlineEditForm ?? vi.fn(),
        state: {
            topLists: createTopListsState(),
            hseUserCache: createHseUserCacheState(),
        },
        pluginId: PLUGIN_ID,
    };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

// ─── showCreateTopListChooser ────────────────────────────────────────────────

describe('showCreateTopListChooser', () => {
    it('renders a step-1 modal with Manual and By-tag cards', () => {
        const deps = makeDeps();
        showCreateTopListChooser([], new Set(), vi.fn(), deps);
        const modal = document.body.firstElementChild as HTMLElement | null;
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('How do you want to create');
        expect(modal?.querySelector('.btnChooseManual')).not.toBeNull();
        expect(modal?.querySelector('.btnChooseByTag')).not.toBeNull();
    });

    it('clicking Manual forwards to showManualTopListModal via deps', async () => {
        const showManualSpy = vi.fn();
        const deps = makeDeps({ showManualTopListModal: showManualSpy });
        const onSuccess = vi.fn();
        showCreateTopListChooser([], new Set(), onSuccess, deps);
        const manualBtn = document.querySelector<HTMLButtonElement>('.btnChooseManual');
        expect(manualBtn).not.toBeNull();
        manualBtn!.click();
        await flush();
        expect(showManualSpy).toHaveBeenCalledTimes(1);
        const callArgs = showManualSpy.mock.calls[0];
        expect(callArgs?.[0]).toBe(onSuccess);
        expect(callArgs?.[1]).toBeUndefined();
        expect(callArgs?.[2]).toBe(deps);
    });

    it('clicking By-tag then a tag row forwards to showTopListModal via deps', async () => {
        const showTagSpy = vi.fn();
        const deps = makeDeps({ showTopListModal: showTagSpy });
        const onSuccess = vi.fn();
        showCreateTopListChooser(
            [{ Name: 'Favourites', MovieCount: 12 }],
            new Set(),
            onSuccess,
            deps,
        );
        const byTagBtn = document.querySelector<HTMLButtonElement>('.btnChooseByTag');
        byTagBtn!.click();
        await flush();
        const tagBtn = document.querySelector<HTMLButtonElement>('.btnSelectTag');
        expect(tagBtn).not.toBeNull();
        tagBtn!.click();
        await flush();
        expect(showTagSpy).toHaveBeenCalledTimes(1);
        const callArgs = showTagSpy.mock.calls[0];
        expect(callArgs?.[0]).toBe('Favourites');
        expect(callArgs?.[1]).toBe('Favourites');
        expect(callArgs?.[2]).toBe(onSuccess);
    });

    it('marks a tag whose sanitized name is in existingTopLists with a top-list badge', () => {
        const deps = makeDeps();
        showCreateTopListChooser(
            [{ Name: 'Existing', MovieCount: 5 }],
            new Set(['existing']),
            vi.fn(),
            deps,
        );
        const byTagBtn = document.querySelector<HTMLButtonElement>('.btnChooseByTag');
        byTagBtn!.click();
        const tagRow = document.querySelector<HTMLButtonElement>('.btnSelectTag');
        expect(tagRow?.textContent).toContain('top-list');
        expect(tagRow?.textContent).toContain('5 movies');
    });

    it('clicking Back returns to step 1', async () => {
        const deps = makeDeps();
        showCreateTopListChooser(
            [{ Name: 'mytag', MovieCount: 5 }],
            new Set(),
            vi.fn(),
            deps,
        );
        document.querySelector<HTMLButtonElement>('.btnChooseByTag')!.click();
        await flush();
        expect(document.querySelector('.btnSelectTag')).not.toBeNull();
        const backBtn = document.querySelector<HTMLButtonElement>('.btnChooserBack');
        backBtn!.click();
        await flush();
        expect(document.querySelector('.btnChooseManual')).not.toBeNull();
        expect(document.querySelector('.btnSelectTag')).toBeNull();
    });
});

// ─── showTopListModal ─────────────────────────────────────────────────────────

describe('showTopListModal', () => {
    it('renders the tag-driven form and Apply calls executeTopListCreationSteps', async () => {
        const execSpy = vi.fn().mockResolvedValue(undefined);
        const fetchMock = vi.fn((url: string) => {
            if (url.endsWith('/TopList/PrepareFolder')) {
                return Promise.resolve({
                    json: () => Promise.resolve({ Success: true, FolderPath: '/data/lists/x', FilesCreated: 5 })
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({}) });
        });
        const deps = makeDeps({
            fetch: fetchMock as unknown as FetchLike,
            executeTopListCreationSteps: execSpy as unknown as ExecuteTopListCreationSteps,
        });
        const onSuccess = vi.fn();
        showTopListModal('mytag', 'MyTag', onSuccess, undefined, deps);
        await flush();
        const modal = document.body.firstElementChild as HTMLElement | null;
        expect(modal).not.toBeNull();
        expect(modal?.querySelector('.tlm-custom-name')).not.toBeNull();
        expect(modal?.querySelector('.tlm-max-items')).not.toBeNull();
        expect(modal?.querySelector('input[name="tlBadgeStyle"]')).not.toBeNull();

        const saveBtn = modal?.querySelector<HTMLButtonElement>('.btnTlmSave');
        expect(saveBtn).not.toBeNull();
        saveBtn!.click();
        await flush();
        const errEl = modal?.querySelector<HTMLElement>('.tlm-error');
        expect(errEl?.textContent).toContain('Please select at least one target user');

        const firstUser = modal?.querySelector<HTMLInputElement>('.chkTlmUser');
        firstUser!.checked = true;
        firstUser!.dispatchEvent(new Event('change', { bubbles: true }));
        saveBtn!.click();
        await flush();
        expect(execSpy).toHaveBeenCalledTimes(1);
        const args = execSpy.mock.calls[0];
        expect(args?.[0]).toBe('mytag');
        expect(args?.[2]).toEqual(['u1']);
        expect(args?.[6]).toBe(0);
        expect(typeof args?.[8]).toBe('object');
    });

    it('edit mode pre-populates from existingData', async () => {
        const deps = makeDeps();
        showTopListModal(
            'mytag',
            'MyTag',
            vi.fn(),
            { userIds: ['u2'], customName: 'My Custom', displayMode: 'tv', imageType: 'Thumb', badgeStyle: 'emby-green', maxItems: '7' },
            deps,
        );
        await flush();
        const modal = document.body.firstElementChild as HTMLElement | null;
        expect(modal?.textContent).toContain('Edit');
        const customName = modal?.querySelector<HTMLInputElement>('.tlm-custom-name');
        expect(customName?.value).toBe('My Custom');
        const displayMode = modal?.querySelector<HTMLSelectElement>('.tlm-display-mode');
        expect(displayMode?.value).toBe('tv');
        const imageType = modal?.querySelector<HTMLSelectElement>('.tlm-image-type');
        expect(imageType?.value).toBe('Thumb');
        const maxItems = modal?.querySelector<HTMLInputElement>('.tlm-max-items');
        expect(maxItems?.value).toBe('7');
        const bobBox = modal?.querySelector<HTMLInputElement>('.chkTlmUser[value="u2"]');
        expect(bobBox?.checked).toBe(true);
    });
});

// ─── showManualTopListModal ───────────────────────────────────────────────────

describe('showManualTopListModal', () => {
    it('loads AllMovies + users, lets the user add a movie, and calls executeTopListCreationSteps', async () => {
        const execSpy = vi.fn().mockResolvedValue(undefined);
        const fetchMock = vi.fn((url: string) => {
            if (url.endsWith('/TopList/AllMovies')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        Movies: [
                            { ItemId: 'i1', ImdbId: 'tt1', Name: 'Inception', Year: 2010 },
                            { ItemId: 'i2', ImdbId: 'tt2', Name: 'Arrival', Year: 2016 },
                        ]
                    })
                });
            }
            if (url.endsWith('/TopList/PrepareManualFolder')) {
                return Promise.resolve({
                    json: () => Promise.resolve({ Success: true, FolderPath: '/data/lists/m', FilesCreated: 1 })
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({}) });
        });
        const deps = makeDeps({
            fetch: fetchMock as unknown as FetchLike,
            executeTopListCreationSteps: execSpy as unknown as ExecuteTopListCreationSteps,
        });
        const onSuccess = vi.fn();
        showManualTopListModal(onSuccess, undefined, deps);
        await flush();
        const modal = document.body.firstElementChild as HTMLElement | null;
        expect(modal).not.toBeNull();

        const listNameInput = modal?.querySelector<HTMLInputElement>('.mtlListName');
        expect(listNameInput).not.toBeNull();
        listNameInput!.value = 'MyList';
        listNameInput!.dispatchEvent(new Event('input', { bubbles: true }));

        const userBox = modal?.querySelector<HTMLInputElement>('.chkMtlUser');
        expect(userBox).not.toBeNull();
        userBox!.checked = true;
        userBox!.dispatchEvent(new Event('change', { bubbles: true }));

        const searchInput = modal?.querySelector<HTMLInputElement>('.mtlMovieSearch');
        expect(searchInput).not.toBeNull();
        searchInput!.value = 'incep';
        searchInput!.dispatchEvent(new Event('input', { bubbles: true }));
        await flush();

        const resultRow = modal?.querySelector<HTMLElement>('.mtlSearchResult');
        expect(resultRow).not.toBeNull();
        resultRow!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await flush();

        const selectedList = modal?.querySelector<HTMLElement>('.mtlSelectedList');
        expect(selectedList?.textContent).toContain('Inception');

        const createBtn = modal?.querySelector<HTMLButtonElement>('.btnMtlCreate');
        expect(createBtn?.disabled).toBe(false);
        createBtn!.click();
        await flush();

        expect(execSpy).toHaveBeenCalledTimes(1);
        const args = execSpy.mock.calls[0];
        expect(args?.[0]).toBe('MyList');
        expect(args?.[2]).toEqual(['u1']);
        expect(args?.[6]).toBe(0);
    });

    it('renders an empty-state copy and disables Create until name + users + movies are present', async () => {
        const deps = makeDeps();
        showManualTopListModal(vi.fn(), undefined, deps);
        await flush();
        const modal = document.body.firstElementChild as HTMLElement | null;
        const createBtn = modal?.querySelector<HTMLButtonElement>('.btnMtlCreate');
        expect(createBtn?.disabled).toBe(true);
    });
});

// ─── loadInlineEditForm ───────────────────────────────────────────────────────

describe('loadInlineEditForm', () => {
    function makeRowAndBody(editJson: Record<string, unknown>): { row: HTMLElement; body: HTMLElement } {
        document.body.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'tag-row';
        row.dataset.editjson = JSON.stringify(editJson);
        const body = document.createElement('div');
        body.className = 'tag-body';
        row.appendChild(body);
        document.body.appendChild(row);
        return { row: row as HTMLElement, body: body as HTMLElement };
    }

    it('populates the non-manual form from editJson and wires body.tlSaveForm', async () => {
        const deps = makeDeps();
        const { row, body } = makeRowAndBody({
            tagName: 'mytag',
            isManual: false,
            displayName: 'My Tag',
            userIds: ['u2'],
            customName: 'Custom',
            displayMode: 'tv',
            imageType: 'Thumb',
            badgeStyle: 'emby-green',
            maxItems: '5',
        });
        loadInlineEditForm(row, body, vi.fn(), deps);
        await flush();
        const wrapper = body.querySelector('div') as HTMLElement;
        expect(wrapper).not.toBeNull();
        expect(wrapper.querySelector('.tlm-custom-name')).not.toBeNull();
        const customName = wrapper.querySelector<HTMLInputElement>('.tlm-custom-name');
        expect(customName?.value).toBe('Custom');
        const bobBox = wrapper.querySelector<HTMLInputElement>('.chkTlmUser[value="u2"]');
        expect(bobBox?.checked).toBe(true);
        const maxItems = wrapper.querySelector<HTMLInputElement>('.tlm-max-items');
        expect(maxItems?.value).toBe('5');
        const saveBody = body as HTMLElement & { tlSaveForm?: () => Promise<void> };
        expect(typeof saveBody.tlSaveForm).toBe('function');
    });

    it('populates the manual form from editJson and wires body.tlSaveForm', async () => {
        const fetchMock = vi.fn((url: string) => {
            if (url.endsWith('/TopList/AllMovies')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        Movies: [
                            { ItemId: 'm1', ImdbId: 'tt1', Name: 'Movie One', Year: 2020 },
                        ]
                    })
                });
            }
            if (url.includes('/TopList/ManualItems')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        Success: true,
                        UserIds: ['u1'],
                        DisplayMode: '',
                        ImageType: '',
                        BadgeStyle: 'ocean-blue',
                        CustomName: 'My Manual',
                        Movies: [{ ItemId: 'm1', ImdbId: 'tt1', Name: 'Movie One', Year: 2020 }],
                    })
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({}) });
        });
        const deps = makeDeps({ fetch: fetchMock as unknown as FetchLike });
        const { row, body } = makeRowAndBody({
            tagName: 'ManualList',
            isManual: true,
            displayName: 'Manual List',
            customName: 'Custom Manual',
            badgeStyle: 'neutral',
        });
        loadInlineEditForm(row, body, vi.fn(), deps);
        await flush();
        const wrapper = body.querySelector('div') as HTMLElement;
        expect(wrapper).not.toBeNull();
        expect(wrapper.querySelector('.mtlCustomName')).not.toBeNull();
        const customName = wrapper.querySelector<HTMLInputElement>('.mtlCustomName');
        expect(customName?.value).toBe('My Manual');
        const aliceBox = wrapper.querySelector<HTMLInputElement>('.chkMtlUser[value="u1"]');
        expect(aliceBox?.checked).toBe(true);
        const selectedList = wrapper.querySelector<HTMLElement>('.mtlSelectedList');
        expect(selectedList?.textContent).toContain('Movie One');
        const saveBody = body as HTMLElement & { tlSaveForm?: () => Promise<void> };
        expect(typeof saveBody.tlSaveForm).toBe('function');
    });

    it('sets body.dataset.dirty=1 when an input changes', async () => {
        const deps = makeDeps();
        const { row, body } = makeRowAndBody({
            tagName: 'mytag',
            isManual: false,
            displayName: 'My Tag',
            userIds: [],
            customName: 'Original',
            displayMode: '',
            imageType: '',
            badgeStyle: 'neutral',
            maxItems: '0',
        });
        loadInlineEditForm(row, body, vi.fn(), deps);
        await flush();
        const wrapper = body.querySelector<HTMLElement>('div');
        const customName = wrapper?.querySelector<HTMLInputElement>('.tlm-custom-name');
        expect(customName).not.toBeNull();
        customName!.value = 'Modified';
        customName!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(body.dataset.dirty).toBe('1');
    });
});