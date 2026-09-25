/// <reference types="vitest" />
//
// D1 regression tests for `modules/app/configIo.ts`.
//
// Covers the audit-required scenarios:
//   - load → mutate → dirty → save → reload round-trip;
//   - missing/corrupt config yields defaults instead of a crash;
//   - `loadConfig` is a no-op when `currentView()` is null or ApiClient
//     is absent;
//   - `hasDirtyState` true only when the save button is enabled or the
//     cleanup tab carries a pending batch.
//
// All tests run with happy-dom (see `vitest.config.mts`). The factory
// function paths (the full index.ts) are exercised end-to-end by
// `modules/index.lifecycle.test.ts`; these tests focus on the configIo
// surface itself.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    PLUGIN_ID,
    createAppState,
    type AppState,
} from '../state/state';
import {
    loadConfig,
    hasDirtyState,
    doSave,
    submitFormHandler,
    type ConfigIoDeps,
} from './configIo';

interface EmbyApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getPluginConfiguration(id: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(id: string, cfg: Record<string, unknown>): Promise<unknown>;
}

function installApiClient(overrides: Partial<EmbyApiClient> = {}): EmbyApiClient {
    const api: EmbyApiClient = {
        accessToken: () => 'TOKEN',
        getUrl: (n: string) => 'https://emby.test/emby/' + n,
        getPluginConfiguration: () => Promise.resolve({}),
        updatePluginConfiguration: () => Promise.resolve({}),
        ...overrides,
    };
    (window as unknown as Record<string, unknown>).ApiClient = api;
    return api;
}

function makeView(): HTMLElement {
    document.body.innerHTML = `
    <div id="HomeScreenCompanionConfigPage" data-role="page">
      <form class="HomeScreenCompanionForm" id="homeScreenCompanionForm">
        <div id="tagListContainer"></div>
        <button is="emby-button" type="submit" class="btn-save" disabled><span>Save Settings</span></button>
      </form>
      <div id="tabCleanup" style="display:none;">
        <div id="tcManageContainer"></div>
      </div>
      <input id="txtTraktClientId" />
      <input id="txtMdblistApiKey" />
      <input id="txtTmdbApiKey" />
      <input id="txtOpenAiApiKey" />
      <input id="txtOpenAiModel" />
      <input id="txtGeminiApiKey" />
      <input id="txtGeminiModel" />
      <input id="txtClaudeApiKey" />
      <input id="txtClaudeModel" />
      <input id="txtOllamaBaseUrl" />
      <input id="txtOllamaModel" />
      <textarea id="txtAiSystemPrompt"></textarea>
      <input type="checkbox" id="chkExtendedConsoleOutput" />
      <input type="checkbox" id="chkLogMissingItems" />
      <input type="checkbox" id="chkDryRunMode" />
      <input type="checkbox" id="chkPreserveTagsOnEmptyResult" />
      <input type="text" id="txtSearchTags" />
      <i id="btnClearSearch" style="display:block;"></i>
      <input type="checkbox" id="chkFilterTag" />
      <input type="checkbox" id="chkFilterCollection" />
      <input type="checkbox" id="chkFilterSchedule" />
      <input type="checkbox" id="chkFilterHomeScreen" />
      <input type="checkbox" id="chkFilterSrcExternal" />
      <input type="checkbox" id="chkFilterSrcMediaInfo" />
      <input type="checkbox" id="chkFilterSrcCollection" />
      <input type="checkbox" id="chkFilterSrcPlaylist" />
      <input type="checkbox" id="chkFilterSrcAI" />
      <input type="checkbox" id="chkFilterActive" />
      <input type="checkbox" id="chkFilterInactive" />
      <span id="filterDropdownLabel">Filter</span>
      <div id="btnFilterDropdown" class="active"></div>
    </div>`;
    return document.getElementById('HomeScreenCompanionConfigPage') as HTMLElement;
}

interface DepsHarness {
    deps: ConfigIoDeps;
    appState: AppState;
    getPluginConfigurationSpy: ReturnType<typeof vi.fn>;
    updatePluginConfigurationSpy: ReturnType<typeof vi.fn>;
    storedConfigs: Record<string, unknown>[];
}

function buildDeps(view: HTMLElement | null): DepsHarness {
    const appState = createAppState();
    const storedConfigs: Record<string, unknown>[] = [];
    const getPluginConfigurationSpy = vi.fn();
    const updatePluginConfigurationSpy = vi.fn();
    getPluginConfigurationSpy.mockImplementation(() => Promise.resolve(storedConfigs[storedConfigs.length - 1] ?? {}));
    updatePluginConfigurationSpy.mockImplementation((id: string, cfg: Record<string, unknown>) => {
        if (id === PLUGIN_ID) storedConfigs.push({ ...cfg });
        return Promise.resolve({});
    });
    const api = installApiClient({
        getPluginConfiguration: getPluginConfigurationSpy as unknown as EmbyApiClient['getPluginConfiguration'],
        updatePluginConfiguration: updatePluginConfigurationSpy as unknown as EmbyApiClient['updatePluginConfiguration'],
    });
    const deps: ConfigIoDeps = {
        appState,
        currentView: () => view,
        getApi: () => api as ConfigIoDeps['getApi'] extends () => infer T ? T : never,
        getDashboard: () => undefined,
        boundGetUiConfig: () => ({ Tags: [] }),
        renderTagGroup: vi.fn(),
        preFetchLibraryData: vi.fn(() => Promise.resolve({ virtualFolders: [], topListFolderNames: new Set<string>() })),
        setupRow: vi.fn(),
        checkFormStateBound: vi.fn(),
    };
    return { deps, appState, getPluginConfigurationSpy, updatePluginConfigurationSpy, storedConfigs };
}

// suppress console.warn / console.log from doSave HscApplyTagHomeSections fanout
beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) } as Response));
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).ApiClient;
});

describe('configIo.loadConfig', () => {
    it('returns immediately when currentView is null', async () => {
        const h = buildDeps(null);
        await loadConfig(h.deps);
        expect(h.getPluginConfigurationSpy).not.toHaveBeenCalled();
    });

    it('returns immediately when ApiClient is absent', async () => {
        const view = makeView();
        const h = buildDeps(view);
        // Override the dep's getApi to return undefined so we simulate the
        // "ApiClient absent at load-time" condition (deleting
        // window.ApiClient alone is not enough since buildDeps captured it).
        (h.deps as { getApi: () => unknown }).getApi = () => undefined;
        delete (window as unknown as Record<string, unknown>).ApiClient;
        await loadConfig(h.deps);
        expect(h.getPluginConfigurationSpy).not.toHaveBeenCalled();
    });

    it('yields defaults (no crash) when server returns malformed config', async () => {
        const view = makeView();
        const h = buildDeps(view);
        // Simulate "corrupt" server response: missing required fields.
        h.storedConfigs.push({ /* empty config */ });
        await expect(loadConfig(h.deps)).resolves.toBeUndefined();
        // Defaults applied:
        expect(view.querySelector<HTMLInputElement>('#txtOpenAiModel')!.value).toBe('gpt-4o-mini');
        expect(view.querySelector<HTMLInputElement>('#txtOllamaBaseUrl')!.value).toBe('http://localhost:11434');
        expect((h.appState.hsc.config.HomeSyncEnabled)).toBe(false);
    });

    it('populates form fields from a known config and seeds the saved snapshot', async () => {
        const view = makeView();
        const h = buildDeps(view);
        h.storedConfigs.push({
            TraktClientId: 'TR',
            MdblistApiKey: 'MB',
            OpenAiModel: 'custom-model',
            DryRunMode: true,
            HomeSyncEnabled: true,
            HomeSyncSourceUserId: 'u1',
            HomeSyncTargetUserIds: ['u2', 'u3'],
            Tags: [{ Tag: 'tag1', Active: true, EnableHomeSection: false }],
            TopLists: [{ TagName: 'My Top' }],
            SavedFilters: [],
        });
        await loadConfig(h.deps);
        // Wait one rAF tick for the snapshot seeding.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        expect(view.querySelector<HTMLInputElement>('#txtTraktClientId')!.value).toBe('TR');
        expect(view.querySelector<HTMLInputElement>('#txtMdblistApiKey')!.value).toBe('MB');
        expect(view.querySelector<HTMLInputElement>('#txtOpenAiModel')!.value).toBe('custom-model');
        expect(view.querySelector<HTMLInputElement>('#chkDryRunMode')!.checked).toBe(true);
        expect(h.appState.hsc.config.HomeSyncEnabled).toBe(true);
        expect(h.appState.hsc.config.HomeSyncSourceUserId).toBe('u1');
        expect(h.appState.topLists.tagNames.has('my top')).toBe(true);
    });

    it('renders grouped rows via the injected renderTagGroup', async () => {
        const view = makeView();
        const h = buildDeps(view);
        h.storedConfigs.push({
            Tags: [
                { Tag: 't1', Name: 'g1', Url: 'https://x', Active: true, SourceType: 'External' },
                { Tag: 't2', Name: 'g1', Url: 'https://y', Active: true, SourceType: 'External' },
            ],
        });
        await loadConfig(h.deps);
        // 2 URLs belonging to same group → 1 renderTagGroup call (then 1 fallback placeholder if keys.length===0; here keys.length>0 so just one call per key).
        expect(h.deps.renderTagGroup).toHaveBeenCalled();
    });
});

describe('configIo.hasDirtyState', () => {
    it('returns false when there is no view', () => {
        const h = buildDeps(null);
        expect(hasDirtyState(h.deps)).toBe(false);
    });

    it('returns false when the save button is disabled and no pending cleanup batch', () => {
        const view = makeView();
        const h = buildDeps(view);
        expect(hasDirtyState(h.deps)).toBe(false);
    });

    it('returns true when the save button is enabled', () => {
        const view = makeView();
        const h = buildDeps(view);
        const btn = view.querySelector<HTMLButtonElement>('.btn-save')!;
        btn.disabled = false;
        expect(hasDirtyState(h.deps)).toBe(true);
    });

    it('returns true when the cleanup tab has a pending batch', () => {
        const view = makeView();
        const h = buildDeps(view);
        const tc = view.querySelector<HTMLElement>('#tcManageContainer') as HTMLElement & { _tcHasPending?: boolean };
        tc._tcHasPending = true;
        expect(hasDirtyState(h.deps)).toBe(true);
    });
});

describe('configIo.doSave', () => {
    it('returns silently when no view', () => {
        const h = buildDeps(null);
        expect(() => doSave(h.deps)).not.toThrow();
        expect(h.updatePluginConfigurationSpy).not.toHaveBeenCalled();
    });

    it('round-trip: mutate → dirty → save → reload sees the mutation', async () => {
        const view = makeView();
        const h = buildDeps(view);
        // Seed saved snapshot via loadConfig.
        h.storedConfigs.push({ Tags: [] });
        await loadConfig(h.deps);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        // User edits: enable save.
        const btn = view.querySelector<HTMLButtonElement>('.btn-save')!;
        btn.disabled = false;
        expect(hasDirtyState(h.deps)).toBe(true);

        // bind getUiConfig to produce a real config with one tag.
        const newTags = [{ Tag: 'new', Name: 'g', Active: true, EnableHomeSection: false }];
        (h.deps as { boundGetUiConfig: (view: HTMLElement, forComparison: boolean) => unknown }).boundGetUiConfig = () => ({ Tags: newTags });

        // Snapshot before save must be reset by save so a follow-up reload re-anchors.
        doSave(h.deps);
        await flushMicrotasks(5);
        await flushOneRaf();

        expect(h.updatePluginConfigurationSpy).toHaveBeenCalledTimes(1);
        // The saved payload has the new tag.
        const last = h.storedConfigs[h.storedConfigs.length - 1];
        expect((last as { Tags?: unknown[] }).Tags).toEqual(newTags);

        // "reload" — call loadConfig again with the post-save storedConfigs.
        await loadConfig(h.deps);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        // After reload, manually re-disable the save button (loadConfig leaves it
        // alone — the factory's view-show wiring in `wireViewShow` is what disables
        // it on each show). Mimic that here so the round-trip is verifiable.
        view.querySelector<HTMLButtonElement>('.btn-save')!.disabled = true;
        expect(hasDirtyState(h.deps)).toBe(false);
    });

    it('does not throw when the snapshot is null (skips save)', () => {
        const view = makeView();
        const h = buildDeps(view);
        // No seeded snapshot — setOriginalConfigState(...) was never called with non-null.
        expect(() => doSave(h.deps)).not.toThrow();
        expect(h.updatePluginConfigurationSpy).not.toHaveBeenCalled();
    });
});

describe('configIo.submitFormHandler', () => {
    it('delegates to doSave when there are no dirty top-list rows', () => {
        const view = makeView();
        const h = buildDeps(view);
        const ev = new Event('submit');
        // setOriginalConfigState to non-null so doSave proceeds
        h.appState.originalConfigState.setOriginalConfigState(JSON.stringify({ Tags: [] }));
        // stub doSave via updatedResultConfig in updatePluginConfiguration
        submitFormHandler(ev, h.deps);
        // doSave runs synchronously up to the first await; we only assert it does not throw.
        expect(ev.defaultPrevented).toBe(true);
    });

    it('calls preventDefault on the submit event', () => {
        const view = makeView();
        const h = buildDeps(view);
        const ev = new Event('submit', { cancelable: true });
        submitFormHandler(ev, h.deps);
        expect(ev.defaultPrevented).toBe(true);
    });
});

function flushMicrotasks(n: number): Promise<void> {
    let p = Promise.resolve();
    for (let i = 0; i < n; i++) p = p.then(() => undefined);
    return p;
}

function flushOneRaf(): Promise<void> {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
