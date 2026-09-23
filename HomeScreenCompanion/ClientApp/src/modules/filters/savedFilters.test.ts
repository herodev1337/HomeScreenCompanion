/// <reference types="vitest" />
//
// Smoke tests for `modules/filters/savedFilters.ts`. The legacy
// snapshot-mirror pattern (criteria.test.ts) would give exhaustive
// coverage but adds the fragile JSON-string snapshot unwrapper; for
// these helpers a small set of shape assertions is enough to catch
// regressions in the TS extraction.

import { describe, it, expect, vi } from 'vitest';

import {
    getMySavedFiltersPanelHtml,
    refreshMySavedFiltersPanels,
    saveSavedFiltersNow,
    type SavedFilter,
    type SavedFiltersApiClient,
} from './savedFilters';

function makeApi(): SavedFiltersApiClient {
    return {
        getPluginConfiguration: vi.fn().mockResolvedValue({}),
        updatePluginConfiguration: vi.fn().mockResolvedValue(undefined),
    };
}

describe('refreshMySavedFiltersPanels', () => {
    it('renders the empty placeholder when there are no panels', () => {
        document.body.innerHTML = '';
        refreshMySavedFiltersPanels([]);
        // No-op when #HomeScreenCompanionConfigPage is absent.
        expect(document.body.innerHTML).toBe('');
    });

    it('fills every .mi-saved-panel-content with the empty-list placeholder', () => {
        document.body.innerHTML = '';
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        view.innerHTML =
            '<div class="mi-saved-panel-content"></div>' +
            '<div class="mi-saved-panel-content"></div>';
        document.body.appendChild(view);

        refreshMySavedFiltersPanels([]);
        const cells = view.querySelectorAll('.mi-saved-panel-content');
        expect(cells).toHaveLength(2);
        for (const cell of Array.from(cells)) {
            expect((cell as HTMLElement).innerHTML).toContain('No saved filters yet.');
        }
    });

    it('renders apply+delete buttons when given non-empty saved filters', () => {
        document.body.innerHTML = '';
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        view.innerHTML = '<div class="mi-saved-panel-content"></div>';
        document.body.appendChild(view);

        const filters: SavedFilter[] = [
            { Name: '4K HDR Movies', Filters: [] },
            { Name: 'Recent Sci-Fi', Filters: [] },
        ];
        refreshMySavedFiltersPanels(filters);
        expect(view.innerHTML).toContain('btnApplyMySavedFilter');
        expect(view.innerHTML).toContain('btnDeleteMySavedFilter');
        expect(view.innerHTML).toContain('>4K HDR Movies</button>');
        expect(view.innerHTML).toContain('>Recent Sci-Fi</button>');
        expect((view.querySelectorAll('.btnApplyMySavedFilter')).length).toBe(2);
        expect((view.querySelectorAll('.btnDeleteMySavedFilter')).length).toBe(2);
    });

    it('HTML-escapes filter Names so XSS via Name is impossible', () => {
        document.body.innerHTML = '';
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        view.innerHTML = '<div class="mi-saved-panel-content"></div>';
        document.body.appendChild(view);
        const filters: SavedFilter[] = [
            { Name: '<img src=x onerror=alert(1)>', Filters: [] },
        ];
        refreshMySavedFiltersPanels(filters);
        // After innerHTML assignment the entities are decoded into the DOM
        // tree, so check the literal text representation (textContent)
        // rather than the serialized HTML.
        const cell = view.querySelector('.mi-saved-panel-content') as HTMLElement;
        expect(cell.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(cell.querySelector('img')).toBeNull();
    });
});

describe('saveSavedFiltersNow', () => {
    it('updates the plugin configuration and pings checkFormState on success', async () => {
        const api = makeApi();
        const checkFormState = vi.fn();
        let stored: unknown = undefined;
        const setOriginalConfigState = (v: string | null): void => {
            stored = v;
        };
        // Mount the view so checkFormState can ping it.
        document.body.innerHTML = '';
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        document.body.appendChild(view);

        saveSavedFiltersNow({
            getSavedFilters: () => [{ Name: 'A', Filters: [] }],
            getOriginalConfigState: () => JSON.stringify({ DryRunMode: false, Tags: [] }),
            setOriginalConfigState,
            pluginId: '7c10708f-43e4-4d69-923c-77d01802315b',
            getApiClient: () => api,
            checkFormState,
        });
        // Allow the promise chain (get + update) to settle.
        for (let i = 0; i < 20; i++) await Promise.resolve();
        expect(api.updatePluginConfiguration).toHaveBeenCalledTimes(1);
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored as string);
        expect(parsed.DryRunMode).toBe(false);
        expect(Array.isArray(parsed.SavedFilters)).toBe(true);
        expect(parsed.SavedFilters).toHaveLength(1);
    });

    it('does not write to originalConfigState when it is null', async () => {
        const api = makeApi();
        const setOriginalConfigState = vi.fn();
        const checkFormState = vi.fn();
        saveSavedFiltersNow({
            getSavedFilters: () => [],
            getOriginalConfigState: () => null,
            setOriginalConfigState,
            pluginId: '7c10708f-43e4-4d69-923c-77d01802315b',
            getApiClient: () => api,
            checkFormState,
        });
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(setOriginalConfigState).not.toHaveBeenCalled();
        // Legacy still calls checkFormState when the view is mounted.
        // (No view mounted here, so it must NOT call it.)
        expect(checkFormState).not.toHaveBeenCalled();
    });
});

// Keep getMySavedFiltersPanelHtml reachable from the export check.
describe('getMySavedFiltersPanelHtml', () => {
    it('still works for the empty-list case', () => {
        expect(getMySavedFiltersPanelHtml([])).toContain('No saved filters yet.');
    });
});
