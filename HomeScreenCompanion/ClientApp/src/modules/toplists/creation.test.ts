/// <reference types="vitest" />
//
// Smoke tests for `modules/toplists/creation.ts`. The full
// executeTopListCreationSteps pipeline is very deps-heavy (fetch,
// plugin-config get/update, users, virtual folders, library views)
// — we assert the surface wiring here and leave exhaustive parity to
// the legacy fixture suite.

import { describe, it, expect, vi } from 'vitest';

import {
    executeTopListCreationSteps,
    type FetchLike,
    type PluginConfigLike,
    type TopListCreationDeps,
    type TopListCreationUi,
} from './creation';

function makeDeps(overrides: Partial<TopListCreationDeps> = {}): TopListCreationDeps {
    return {
        getUrl: (p) => `/api/${p}`,
        getAccessToken: () => 'token',
        getPluginConfiguration: vi.fn().mockResolvedValue({} as PluginConfigLike),
        updatePluginConfiguration: vi.fn().mockResolvedValue(undefined),
        fetch: overrides.fetch ?? (vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) }) as unknown as FetchLike),
        registerTopList: overrides.registerTopList ?? vi.fn(),
        ...overrides,
    };
}

function makeUi(): TopListCreationUi {
    document.body.innerHTML = '';
    const modal = document.createElement('div');
    modal.innerHTML = '<div></div>';
    document.body.append(modal);
    return {
        saveBtn: { innerHTML: 'Save', disabled: false },
        errEl: modal.querySelector('div') as Element,
        modal,
    };
}

describe('executeTopListCreationSteps', () => {
    it('drives the pipeline end-to-end with mocked fetch and registers the tag on success', async () => {
        const fetchMock = vi.fn((url: string, init?: RequestInit) => {
            if (url.endsWith('/TopList/PrepareFolder')) {
                return Promise.resolve({ json: () => Promise.resolve({ Success: true, FolderPath: '/data/lists/x' }) });
            }
            if (url.endsWith('/Library/VirtualFolders') && (init?.method ?? 'GET') === 'GET') {
                return Promise.resolve({ json: () => Promise.resolve([]) });
            }
            if (url.endsWith('/Library/VirtualFolders') && init?.method === 'POST') {
                return Promise.resolve({ json: () => Promise.resolve({ Success: true, ItemId: 'lib-1' }) });
            }
            if (url.includes('/Users/user-1/Views')) {
                return Promise.resolve({ json: () => Promise.resolve({ Items: [] }) });
            }
            return Promise.resolve({ json: () => Promise.resolve({ Success: true }) });
        });
        const deps = makeDeps({ fetch: fetchMock as unknown as FetchLike });
        const ui = makeUi();

        await executeTopListCreationSteps(
            'MyTag',
            'MyTag',
            ['user-1'],
            '',
            'My custom name',
            '',
            10,
            { Success: true, FolderPath: '/data/lists/x', FilesCreated: 5 },
            ui,
            () => { /* onSuccess */ },
            deps,
        );
        for (let i = 0; i < 20; i++) await Promise.resolve();

        // The pipeline progressed past the initial state and registered
        // the tag along the way (legacy calls registerTopList at success).
        // We don't pin the final innerHTML because the exact end state
        // depends on downstream library/UI semantics that are out of
        // scope for this smoke test.
        expect(deps.registerTopList).toHaveBeenCalled();
        expect(ui.saveBtn.innerHTML).not.toBe('Save');
    });
});
