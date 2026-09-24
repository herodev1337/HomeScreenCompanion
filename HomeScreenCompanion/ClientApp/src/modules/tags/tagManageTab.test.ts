/// <reference types="vitest" />
//
// Smoke tests for `modules/tags/tagManageTab.ts`.
//
// `loadTagManageTab` is a DOM + fetch driven pipeline similar to
// `topListsTab.loadTopListsTab`. We build a minimal Tags-tab DOM, mock
// the ApiClient + fetch, and assert the rendering surface + the
// Remove/Undo/Refresh interactions + the summary-modal save flow.
// Heavy mock setup is intentional — this is a 770-line function with
// many collaborators; exhaustive parity is left to the legacy fixture
// suite.

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    loadTagManageTab,
    type TagManageTabApiClient,
    type TagManageTabDeps,
} from './tagManageTab';

const TAGS_URL_FRAG = 'Manage/Tags';
const COLLS_URL_FRAG = 'Manage/Collections';
const DELETE_TAGS_URL_FRAG = 'Manage/DeleteTags';

function makeView(): HTMLElement {
    document.body.innerHTML = '';
    const view = document.createElement('div');
    view.id = 'tsTagsView';
    view.innerHTML = '<div id="tcManageContainer"></div>';
    document.body.appendChild(view);
    return view;
}

function makeApi(overrides: Partial<{
    getPluginConfiguration: ReturnType<typeof vi.fn>;
    updatePluginConfiguration: ReturnType<typeof vi.fn>;
}> = {}): TagManageTabApiClient {
    return {
        accessToken: () => 'test-token',
        getUrl: (name: string) => `http://test/api/${name}`,
        getJSON: vi.fn(),
        getPluginConfiguration: (overrides.getPluginConfiguration ?? vi.fn().mockResolvedValue({ Tags: [] })) as unknown as TagManageTabApiClient['getPluginConfiguration'],
        updatePluginConfiguration: (overrides.updatePluginConfiguration ?? vi.fn().mockResolvedValue({})) as unknown as TagManageTabApiClient['updatePluginConfiguration'],
    };
}

function makeDeps(overrides: Partial<TagManageTabDeps> & {
    api?: TagManageTabApiClient;
} = {}): TagManageTabDeps & { fetchMock: ReturnType<typeof vi.fn> } {
    const api = overrides.api ?? makeApi();
    const fetchMock = vi.fn();
    const deps: TagManageTabDeps = {
        fetch: fetchMock as unknown as typeof fetch,
        getApiClient: () => api,
        confirm: overrides.confirm ?? (() => true),
        alert: overrides.alert ?? vi.fn(),
        escapeHtml: overrides.escapeHtml ?? ((s) => String(s ?? '')),
        getHseUsers: overrides.getHseUsers ?? (vi.fn().mockResolvedValue([]) as unknown as () => Promise<unknown>),
        executeTopListCreationSteps: overrides.executeTopListCreationSteps ?? (vi.fn().mockResolvedValue({}) as unknown as (deps: unknown) => Promise<unknown>),
        showCreateTopListChooser: overrides.showCreateTopListChooser ?? (vi.fn() as unknown as TagManageTabDeps['showCreateTopListChooser']),
        loadInlineEditForm: overrides.loadInlineEditForm ?? (vi.fn() as unknown as TagManageTabDeps['loadInlineEditForm']),
        sortRows: overrides.sortRows ?? (vi.fn() as unknown as TagManageTabDeps['sortRows']),
        getDragAfterElement: overrides.getDragAfterElement ?? (vi.fn(() => null) as unknown as TagManageTabDeps['getDragAfterElement']),
        checkFormState: overrides.checkFormState ?? vi.fn(),
        refreshMySavedFiltersPanels: overrides.refreshMySavedFiltersPanels ?? vi.fn(),
        savedFilters: overrides.savedFilters ?? [],
        pluginId: overrides.pluginId ?? 'test-plugin-id',
    };
    return Object.assign(deps, { fetchMock });
}

function tagsJsonResponse(tags: unknown): { json: () => Promise<unknown> } {
    return { json: () => Promise.resolve({ Tags: tags }) };
}
function collsJsonResponse(colls: unknown): { json: () => Promise<unknown> } {
    return { json: () => Promise.resolve({ Collections: colls }) };
}

function mockTagsAndColls(fetchMock: ReturnType<typeof vi.fn>, tags: unknown, colls: unknown): void {
    fetchMock.mockImplementation((url: string) => {
        if (url.includes(TAGS_URL_FRAG)) return Promise.resolve(tagsJsonResponse(tags));
        if (url.includes(COLLS_URL_FRAG)) return Promise.resolve(collsJsonResponse(colls));
        return Promise.resolve({ json: () => Promise.resolve({}) });
    });
}

function mockDefaultResponse(fetchMock: ReturnType<typeof vi.fn>): void {
    fetchMock.mockImplementation(() => Promise.resolve({ json: () => Promise.resolve({ Success: true }) }));
}

async function flush(): Promise<void> {
    for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe('loadTagManageTab', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    function findCallByUrl(fetchMock: ReturnType<typeof vi.fn>, frag: string): unknown[] | undefined {
        return fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes(frag));
    }

    it('is a no-op when #tcManageContainer is missing', () => {
        document.body.innerHTML = '<div id="other"></div>';
        const view = document.getElementById('other') as HTMLElement;
        const deps = makeDeps();
        loadTagManageTab(view, deps);
        expect(view.innerHTML).toBe('');
        expect(deps.fetchMock).not.toHaveBeenCalled();
    });

    it('writes the loading copy into the container on entry', () => {
        const view = makeView();
        const deps = makeDeps();
        deps.fetchMock.mockImplementation(() => new Promise(() => {}));
        loadTagManageTab(view, deps);
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        expect(container.textContent).toContain('Loading');
    });

    it('fetches Manage/Tags and Manage/Collections with X-MediaBrowser-Token', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [], []);
        loadTagManageTab(view, deps);
        await flush();
        const tagsCall = findCallByUrl(deps.fetchMock, TAGS_URL_FRAG);
        expect(tagsCall).toBeDefined();
        expect(tagsCall![1]).toEqual(expect.objectContaining({ headers: { 'X-MediaBrowser-Token': 'test-token' } }));
        const collsCall = findCallByUrl(deps.fetchMock, COLLS_URL_FRAG);
        expect(collsCall).toBeDefined();
        expect(collsCall![1]).toEqual(expect.objectContaining({ headers: { 'X-MediaBrowser-Token': 'test-token' } }));
    });

    it('renders one tag row per tag from the response', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
            { Name: 'Comedy', ItemCount: 3, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        expect(container.textContent).toContain('Action');
        expect(container.textContent).toContain('Comedy');
        const rows = container.querySelectorAll('.tc-manage-row');
        expect(rows.length).toBe(2);
    });

    it('renders the search input and sort select', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        expect(container.querySelector('#tcSearch')).not.toBeNull();
        expect(container.querySelector('#tcSort')).not.toBeNull();
    });

    it('typing into #tcSearch hides rows whose name does not match', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
            { Name: 'Comedy', ItemCount: 3, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        const search = container.querySelector<HTMLInputElement>('#tcSearch')!;
        search.value = 'act';
        search.dispatchEvent(new Event('input'));
        const rows = Array.from(container.querySelectorAll<HTMLElement>('.tc-manage-row'));
        const visible = rows.filter((r) => r.style.display !== 'none');
        expect(visible.length).toBe(1);
        expect(visible[0]!.textContent).toContain('Action');
        const hidden = rows.filter((r) => r.style.display === 'none');
        expect(hidden.length).toBe(1);
        expect(hidden[0]!.textContent).toContain('Comedy');
    });

    it('clicking Remove flips the button to Undo and triggers checkFormState', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        const removeBtn = container.querySelector<HTMLButtonElement>('.btnTcMark')!;
        expect(removeBtn.textContent).toBe('Remove');
        removeBtn.click();
        expect(removeBtn.textContent).toBe('Undo');
        expect(removeBtn.classList.contains('btnTcUndo')).toBe(true);
        expect(removeBtn.classList.contains('btnTcMark')).toBe(false);
        expect(deps.checkFormState).toHaveBeenCalled();
        const row = removeBtn.closest<HTMLElement>('.tc-manage-row')!;
        expect(row.style.opacity).toBe('0.45');
        const nameEl = row.querySelector<HTMLElement>('.tc-item-name')!;
        expect(nameEl.style.textDecoration).toBe('line-through');
    });

    it('clicking Undo flips the button back to Remove', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        const btn = container.querySelector<HTMLButtonElement>('.btnTcMark')!;
        btn.click();
        expect(btn.textContent).toBe('Undo');
        btn.click();
        expect(btn.textContent).toBe('Remove');
        expect(btn.classList.contains('btnTcMark')).toBe(true);
        expect(btn.classList.contains('btnTcUndo')).toBe(false);
    });

    it('clicking Refresh re-fetches Manage/Tags and Manage/Collections', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [], []);
        loadTagManageTab(view, deps);
        await flush();
        const initialCallCount = deps.fetchMock.mock.calls.length;
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        const refreshBtn = container.querySelector<HTMLButtonElement>('.btnTcRefresh')!;
        refreshBtn.click();
        await flush();
        expect(deps.fetchMock.mock.calls.length).toBeGreaterThan(initialCallCount);
        const tagsCalls = deps.fetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes(TAGS_URL_FRAG));
        expect(tagsCalls.length).toBe(2);
    });

    it('clicking nav-link on a row opens a window.open call (no exception when ApiClient.serverId is missing)', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Id: 'tag-id-1', Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        const navLink = container.querySelector<HTMLElement>('.tc-nav-link')!;
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        try {
            navLink.click();
            expect(openSpy).toHaveBeenCalledTimes(1);
            const url = String(openSpy.mock.calls[0]![0]);
            expect(url).toContain('tag-id-1');
        } finally {
            openSpy.mockRestore();
        }
    });

    it('writes the failure copy into the container when the Promise.all rejects', async () => {
        const view = makeView();
        const deps = makeDeps();
        deps.fetchMock.mockRejectedValue(new Error('boom'));
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        expect(container.textContent).toContain('Failed to load');
        expect(container.textContent).toContain('boom');
    });

    it('falls back to { Tags: [] } when getPluginConfiguration rejects', async () => {
        const view = makeView();
        const deps = makeDeps({ api: makeApi({ getPluginConfiguration: vi.fn().mockRejectedValue(new Error('cfg boom')) }) });
        mockTagsAndColls(deps.fetchMock, [
            { Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement;
        expect(container.textContent).toContain('Action');
    });

    it('container._tcShowModal opens the summary modal after a pending delete is staged', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement & { _tcShowModal?: () => void };
        container.querySelector<HTMLButtonElement>('.btnTcMark')!.click();
        expect(typeof container._tcShowModal).toBe('function');
        container._tcShowModal!();
        const modal = document.body.querySelector('div[data-tc-modal="summary"]');
        expect(modal).not.toBeNull();
        expect(modal!.textContent).toContain('Tags to remove');
        expect(modal!.textContent).toContain('Action');
    });

    it('summary modal Confirm POSTs to Manage/DeleteTags with the staged tag names', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Id: 'action-id', Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
            { Id: 'drama-id', Name: 'Drama', ItemCount: 2, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement & { _tcShowModal?: () => void };
        const marks = Array.from(container.querySelectorAll<HTMLButtonElement>('.btnTcMark'));
        marks[0]!.click();
        marks[1]!.click();
        container._tcShowModal!();
        mockDefaultResponse(deps.fetchMock);
        const fetchCallsBefore = deps.fetchMock.mock.calls.length;
        const modal = document.body.querySelector<HTMLElement>('div[data-tc-modal="summary"]')!;
        modal.querySelector<HTMLButtonElement>('#tcModalConfirm')!.click();
        await flush();
        const newCalls = deps.fetchMock.mock.calls.slice(fetchCallsBefore) as unknown[][];
        const deleteCall = newCalls.find((c) => String(c[0]).includes(DELETE_TAGS_URL_FRAG));
        expect(deleteCall).toBeDefined();
        expect(deleteCall![1]).toEqual(expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ 'X-MediaBrowser-Token': 'test-token' }),
        }));
        const init = deleteCall![1] as { body?: string };
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({ TagNames: ['Action', 'Drama'] });
    });

    it('summary modal Cancel removes the modal without POSTing', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement & { _tcShowModal?: () => void };
        container.querySelector<HTMLButtonElement>('.btnTcMark')!.click();
        container._tcShowModal!();
        const fetchCallsBefore = deps.fetchMock.mock.calls.length;
        const modal = document.body.querySelector<HTMLElement>('div[data-tc-modal="summary"]')!;
        modal.querySelector<HTMLButtonElement>('#tcModalCancel')!.click();
        expect(document.body.querySelector('div[data-tc-modal="summary"]')).toBeNull();
        expect(deps.fetchMock.mock.calls.length).toBe(fetchCallsBefore);
    });

    it('summary modal ✕-button (btnModalUndo) removes the row entry from the modal', async () => {
        const view = makeView();
        const deps = makeDeps();
        mockTagsAndColls(deps.fetchMock, [
            { Id: 'action', Name: 'Action', ItemCount: 5, ItemTypes: ['movie'] },
        ], []);
        loadTagManageTab(view, deps);
        await flush();
        const container = view.querySelector('#tcManageContainer') as HTMLElement & { _tcShowModal?: () => void };
        const mark = container.querySelector<HTMLButtonElement>('.btnTcMark')!;
        mark.click();
        container._tcShowModal!();
        const modal = document.body.querySelector<HTMLElement>('div[data-tc-modal="summary"]')!;
        const undoModalBtn = modal.querySelector<HTMLButtonElement>('.btnModalUndo')!;
        undoModalBtn.click();
        expect(document.body.querySelector('div[data-tc-modal="summary"]')).toBeNull();
    });
});
