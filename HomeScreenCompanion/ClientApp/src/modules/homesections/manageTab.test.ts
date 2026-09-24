/// <reference types="vitest" />

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    fetchManageSections,
    renderManageSections,
    applyManageSections,
    loadHscManageTab,
    type ManageApiClient,
    type ManageSectionsState,
} from './manageTab';
import { getManDragAfterElement } from '../dom/dom';
import { createManageState } from '../state/state';

const URL = 'http://legacy.test/HomeScreenCompanion/Hsc/UserSections';

function makeApi(): ManageApiClient {
    return {
        accessToken: () => 'test-token',
        getUrl: () => URL,
    };
}

function makeDeps(overrides: Partial<{
    api: ManageApiClient;
    fetchMock: ReturnType<typeof vi.fn>;
    checkFormState: ReturnType<typeof vi.fn>;
    alert: ReturnType<typeof vi.fn>;
}> = {}) {
    const api = overrides.api ?? makeApi();
    const fetchMock = overrides.fetchMock ?? vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) });
    const checkFormState = overrides.checkFormState ?? vi.fn();
    const alert = overrides.alert ?? vi.fn();
    return {
        getApiClient: () => api,
        fetchFn: fetchMock as unknown as typeof fetch,
        renderSections: renderManageSections,
        getManDragAfterElement,
        checkFormState,
        alert,
        api,
        fetchMock,
        checkFormStateSpy: checkFormState,
        alertSpy: alert,
    };
}

function buildManageView(): HTMLElement {
    document.body.innerHTML = '';
    const view = document.createElement('div');
    view.id = 'tsManageView';
    view.innerHTML = [
        '<div id="hscManageContainer">',
        '<select id="selManageUser"><option value="">— Select user —</option>',
        '<option value="user-1">User One</option></select>',
        '<div id="manSectionList"></div>',
        '<button type="button" id="btnApplyManage" disabled></button>',
        '</div>',
    ].join('');
    document.body.appendChild(view);
    return view;
}

describe('renderManageSections', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('renders the empty-state copy when there are no sections', () => {
        const view = buildManageView();
        const deps = makeDeps();
        renderManageSections(view, { sections: [] } as ManageSectionsState, deps);
        const list = view.querySelector('#manSectionList') as HTMLElement;
        expect(list.textContent).toContain('No sections found');
    });

    it('renders one row per section with name-fallback chain CustomName > Name > SectionType > "Section N"', () => {
        const view = buildManageView();
        const deps = makeDeps();
        renderManageSections(view, {
            sections: [
                { Name: 'Movies' },
                { CustomName: 'My TV', Name: 'TV' },
                { SectionType: 'LiveTV' },
                {},
            ],
        } as ManageSectionsState, deps);
        const rows = view.querySelectorAll('.man-section-row');
        expect(rows).toHaveLength(4);
        const labels = Array.from(rows).map((r) => (r as HTMLElement).innerText);
        expect(labels[0]).toContain('Movies');
        expect(labels[1]).toContain('My TV');
        expect(labels[2]).toContain('LiveTV');
        expect(labels[3]).toContain('Section 4');
    });

    it('a no-op when #hscManageContainer is absent', () => {
        document.body.innerHTML = '<div id="other"></div>';
        const view = document.getElementById('other') as HTMLElement;
        const deps = makeDeps();
        expect(() => renderManageSections(view, { sections: [{ Name: 'x' }] } as ManageSectionsState, deps)).not.toThrow();
    });
});

describe('fetchManageSections', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('writes the loading copy into the list and disables Apply', () => {
        const view = buildManageView();
        const deps = makeDeps();
        fetchManageSections(view, 'user-1', { sections: [] } as ManageSectionsState, deps);
        const list = view.querySelector('#manSectionList') as HTMLElement;
        expect(list.textContent).toContain('Loading sections');
        const apply = view.querySelector('#btnApplyManage') as HTMLButtonElement;
        expect(apply.disabled).toBe(true);
    });

    it('fetches /HomeScreenCompanion/Hsc/UserSections with the X-Emby-Token header', async () => {
        const view = buildManageView();
        const fetchMock = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ Sections: [{ Name: 'x' }] }),
        });
        const deps = makeDeps({ fetchMock });
        fetchManageSections(view, 'user-1', { sections: [] } as ManageSectionsState, deps);
        // Allow the promise chain to settle.
        for (let i = 0; i < 10; i++) await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledWith(
            URL,
            expect.objectContaining({ headers: { 'X-Emby-Token': 'test-token' } }),
        );
    });

    it('writes the failure copy when the fetch rejects', async () => {
        const view = buildManageView();
        const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
        const deps = makeDeps({ fetchMock });
        fetchManageSections(view, 'user-1', { sections: [] } as ManageSectionsState, deps);
        for (let i = 0; i < 10; i++) await Promise.resolve();
        const list = view.querySelector('#manSectionList') as HTMLElement;
        expect(list.textContent).toContain('Failed to load sections');
    });
});

describe('applyManageSections', () => {
    afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

    it('no-op when #selManageUser has no value', () => {
        const view = buildManageView();
        const deps = makeDeps();
        // #selManageUser has value '' by default.
        applyManageSections(view, { sections: [] } as ManageSectionsState, deps);
        expect(deps.fetchMock).not.toHaveBeenCalled();
    });
});

describe('loadHscManageTab', () => {
    afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

    function buildLoadView(): HTMLElement {
        document.body.innerHTML = '';
        const view = document.createElement('div');
        view.id = 'tsLoadView';
        view.innerHTML = [
            '<div id="hscManageContainer">',
            '<select id="hscManageUserSelect"></select>',
            '<button type="button" id="btnAddManSection">Add</button>',
            '<button type="button" id="btnApplyManSections">Apply</button>',
            '<button type="button" id="btnRefreshManSections">Refresh</button>',
            '<div id="manSectionList"></div>',
            '</div>',
        ].join('');
        document.body.appendChild(view);
        return view;
    }

    function makeLoadDeps(overrides: Partial<{
        getHseUsers: ReturnType<typeof vi.fn>;
        prompt: ReturnType<typeof vi.fn>;
        renderSections: ReturnType<typeof vi.fn>;
        fetchSections: ReturnType<typeof vi.fn>;
        applySections: ReturnType<typeof vi.fn>;
    }> = {}) {
        const getHseUsers = (overrides.getHseUsers ?? vi.fn().mockResolvedValue([])) as unknown as () => Promise<unknown>;
        const prompt = (overrides.prompt ?? vi.fn().mockReturnValue(null)) as unknown as (message: string, defaultValue?: string) => string | null;
        const renderSections = (overrides.renderSections ?? vi.fn()) as unknown as typeof renderManageSections;
        const fetchSections = overrides.fetchSections ? (overrides.fetchSections as unknown as typeof fetchManageSections) : undefined;
        const applySections = overrides.applySections ? (overrides.applySections as unknown as typeof applyManageSections) : undefined;
        const base = makeDeps();
        const deps: Record<string, unknown> = { ...base, getHseUsers, prompt, renderSections };
        if (fetchSections !== undefined) deps.fetchSections = fetchSections;
        if (applySections !== undefined) deps.applySections = applySections;
        return deps;
    }

    async function flush(): Promise<void> {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    }

    it('populates #hscManageUserSelect with one <option> per user from getHseUsers()', async () => {
        const view = buildLoadView();
        const getHseUsers = vi.fn().mockResolvedValue([
            { Id: 'u1', Name: 'Alice' },
            { Id: 'u2', Name: 'Bob' },
        ]);
        const deps = makeLoadDeps({ getHseUsers });

        loadHscManageTab(view, createManageState(), deps as never);
        await flush();

        const sel = view.querySelector('#hscManageUserSelect') as HTMLSelectElement;
        const opts = sel.querySelectorAll('option');
        expect(opts).toHaveLength(2);
        expect(opts[0]?.getAttribute('value')).toBe('u1');
        expect(opts[0]?.textContent).toBe('Alice');
        expect(opts[1]?.getAttribute('value')).toBe('u2');
        expect(opts[1]?.textContent).toBe('Bob');
        const orig = sel.dataset.originalOptions ?? '';
        expect(orig).toContain('u1');
        expect(orig).toContain('Alice');
        expect(orig).toContain('u2');
    });

    it('change on the select calls fetchSections with the selected userId', async () => {
        const view = buildLoadView();
        const fetchSpy = vi.fn();
        const getHseUsers = vi.fn().mockResolvedValue([{ Id: 'u1', Name: 'Alice' }]);
        const deps = makeLoadDeps({ getHseUsers, fetchSections: fetchSpy });

        loadHscManageTab(view, createManageState(), deps as never);
        await flush();

        const sel = view.querySelector('#hscManageUserSelect') as HTMLSelectElement;
        sel.value = 'u1';
        sel.dispatchEvent(new Event('change'));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe(view);
        expect(fetchSpy.mock.calls[0]?.[1]).toBe('u1');
    });

    it('click on #btnAddManSection prompts for a name, pushes a new section, and re-renders', async () => {
        const view = buildLoadView();
        const renderSpy = vi.fn();
        const getHseUsers = vi.fn().mockResolvedValue([]);
        const prompt = vi.fn().mockReturnValue('My List');
        const deps = makeLoadDeps({ getHseUsers, prompt, renderSections: renderSpy });

        const state = createManageState();
        loadHscManageTab(view, state, deps as never);
        await flush();

        const btnAdd = view.querySelector('#btnAddManSection') as HTMLButtonElement;
        btnAdd.click();

        expect(prompt).toHaveBeenCalledWith('Section name:', '');
        expect(state.sections).toHaveLength(1);
        expect(state.sections[0]).toEqual({ CustomName: 'My List', SectionType: 'Movies' });
        expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it('click on #btnAddManSection is a no-op when prompt returns null (cancelled)', async () => {
        const view = buildLoadView();
        const renderSpy = vi.fn();
        const getHseUsers = vi.fn().mockResolvedValue([]);
        const prompt = vi.fn().mockReturnValue(null);
        const deps = makeLoadDeps({ getHseUsers, prompt, renderSections: renderSpy });

        const state = createManageState();
        loadHscManageTab(view, state, deps as never);
        await flush();

        const btnAdd = view.querySelector('#btnAddManSection') as HTMLButtonElement;
        btnAdd.click();

        expect(state.sections).toHaveLength(0);
        expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('click on #btnAddManSection is a no-op when prompt returns whitespace only', async () => {
        const view = buildLoadView();
        const renderSpy = vi.fn();
        const getHseUsers = vi.fn().mockResolvedValue([]);
        const prompt = vi.fn().mockReturnValue('   ');
        const deps = makeLoadDeps({ getHseUsers, prompt, renderSections: renderSpy });

        const state = createManageState();
        loadHscManageTab(view, state, deps as never);
        await flush();

        const btnAdd = view.querySelector('#btnAddManSection') as HTMLButtonElement;
        btnAdd.click();

        expect(state.sections).toHaveLength(0);
        expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('click on #btnApplyManSections calls applySections', async () => {
        const view = buildLoadView();
        const applySpy = vi.fn();
        const getHseUsers = vi.fn().mockResolvedValue([]);
        const deps = makeLoadDeps({ getHseUsers, applySections: applySpy });

        loadHscManageTab(view, createManageState(), deps as never);
        await flush();

        const btnApply = view.querySelector('#btnApplyManSections') as HTMLButtonElement;
        btnApply.click();

        expect(applySpy).toHaveBeenCalledTimes(1);
        expect(applySpy.mock.calls[0]?.[0]).toBe(view);
    });

    it('click on #btnRefreshManSections calls fetchSections with the current userId', async () => {
        const view = buildLoadView();
        const fetchSpy = vi.fn();
        const getHseUsers = vi.fn().mockResolvedValue([{ Id: 'u1', Name: 'Alice' }]);
        const deps = makeLoadDeps({ getHseUsers, fetchSections: fetchSpy });

        loadHscManageTab(view, createManageState(), deps as never);
        await flush();

        const sel = view.querySelector('#hscManageUserSelect') as HTMLSelectElement;
        sel.value = 'u1';
        const btnRefresh = view.querySelector('#btnRefreshManSections') as HTMLButtonElement;
        btnRefresh.click();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[1]).toBe('u1');
    });

    it('early-return when #hscManageContainer is missing', () => {
        document.body.innerHTML = '<div id="other"></div>';
        const view = document.getElementById('other') as HTMLElement;
        const getHseUsers = vi.fn();
        const deps = makeLoadDeps({ getHseUsers });
        loadHscManageTab(view, createManageState(), deps as never);
        expect(getHseUsers).not.toHaveBeenCalled();
    });

    it('early-return when any required sub-element is missing', () => {
        document.body.innerHTML = '';
        const view = document.createElement('div');
        view.id = 'tsLoadView2';
        view.innerHTML = '<div id="hscManageContainer"></div>';
        document.body.appendChild(view);
        const getHseUsers = vi.fn();
        const deps = makeLoadDeps({ getHseUsers });
        loadHscManageTab(view, createManageState(), deps as never);
        expect(getHseUsers).not.toHaveBeenCalled();
    });
});
