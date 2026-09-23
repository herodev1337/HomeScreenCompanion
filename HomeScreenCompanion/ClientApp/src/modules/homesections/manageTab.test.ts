/// <reference types="vitest" />

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    fetchManageSections,
    renderManageSections,
    applyManageSections,
    type ManageApiClient,
    type ManageSectionsState,
} from './manageTab';
import { getManDragAfterElement } from '../dom/dom';

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
