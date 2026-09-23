/// <reference types="vitest" />
//
// Smoke tests for `modules/toplists/topListsTab.ts`.
//
// `loadTopListsTab` is a DOM + fetch driven pipeline similar to
// `manageTab.renderManageSections`; we assert the rendering surface
// here and leave exhaustive parity to the legacy fixture suite.

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    loadTopListsTab,
    type PluginConfigWithTagsLike,
    type TopListsTabDeps,
} from './topListsTab';
import type { FetchLike } from './creation';

function makeView(): HTMLElement {
    document.body.innerHTML = '';
    const view = document.createElement('div');
    view.id = 'tsTopListsView';
    view.innerHTML = '<div id="tlContainer"></div>';
    document.body.appendChild(view);
    return view;
}

function makeDeps(overrides: Partial<TopListsTabDeps> = {}): TopListsTabDeps {
    return {
        getUrl: (p) => `/api/${p}`,
        getAccessToken: () => 'token',
        getPluginConfiguration: vi.fn().mockResolvedValue({} as PluginConfigWithTagsLike),
        fetch: overrides.fetch ?? (vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) }) as unknown as FetchLike),
        showCreateTopListChooser: overrides.showCreateTopListChooser ?? vi.fn(),
        loadInlineEditForm: overrides.loadInlineEditForm ?? vi.fn(),
        unregisterTopList: overrides.unregisterTopList ?? vi.fn(),
        confirm: overrides.confirm ?? (() => true),
        alert: overrides.alert ?? vi.fn(),
        reload: overrides.reload ?? vi.fn(),
        ...overrides,
    };
}

describe('loadTopListsTab', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('is a no-op when #tlContainer is missing', async () => {
        document.body.innerHTML = '<div></div>';
        const view = document.querySelector('div') as HTMLElement;
        const deps = makeDeps();
        loadTopListsTab(view, deps);
        for (let i = 0; i < 5; i++) await Promise.resolve();
        // No fetch, no chooser invoked.
        expect((deps.fetch as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
        expect(deps.showCreateTopListChooser).not.toHaveBeenCalled();
    });

    it('writes the empty-state copy when the config has no top lists', async () => {
        const view = makeView();
        const deps = makeDeps({
            getPluginConfiguration: vi.fn().mockResolvedValue({ TopLists: [] }),
        });
        loadTopListsTab(view, deps);
        for (let i = 0; i < 20; i++) await Promise.resolve();
        const container = view.querySelector('#tlContainer') as HTMLElement;
        expect(container.textContent).toContain('No top-lists created yet');
    });

    it('renders one row per top list', async () => {
        const view = makeView();
        const deps = makeDeps({
            getPluginConfiguration: vi.fn().mockResolvedValue({
                TopLists: [
                    { TagName: 'Movies' },
                    { TagName: 'Shows' },
                ],
            }),
            fetch: vi.fn((url: string) => {
                if (url.endsWith('/TopList/List')) {
                    return Promise.resolve({ json: () => Promise.resolve({ FolderNames: ['Movies', 'Shows'] }) });
                }
                return Promise.resolve({ json: () => Promise.resolve({ Tags: [] }) });
            }) as unknown as FetchLike,
        });
        loadTopListsTab(view, deps);
        for (let i = 0; i < 30; i++) await Promise.resolve();
        const rows = view.querySelectorAll('.tl-row-header');
        expect(rows.length).toBeGreaterThanOrEqual(2);
        const container = view.querySelector('#tlContainer') as HTMLElement;
        expect(container.textContent).toContain('Movies');
        expect(container.textContent).toContain('Shows');
    });
});
