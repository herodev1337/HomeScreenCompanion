/// <reference types="vitest" />
//
// Unit tests for `modules/backup/backupRestore.ts`.
//
// 7 describe blocks:
//
//   1. `buildBackupModalShell` returns a non-empty string-soup element
//      with the expected CSS custom-property fallback markers.
//   2. `buildBackupSectionsHtml(available, chkClass)` matches expected
//      `value=...` + checkbox markers (both `null` and `Set` paths).
//   3. `readBackupSectionFlags` round-trip — render, then read back.
//   4. `detectBackupSections` covers both legacy and modern backup
//      payloads, plus the malformed input path.
//   5. `showBackupModal` smoke — open modal, click Download, assert a
//      download was triggered and the JSON has the expected keys.
//   6. `showRestoreModal` smoke — open modal with a sample JSON,
//      assert pre-checked boxes, click Restore, assert the import
//      endpoint was hit with the right body.
//   7. `renderRestoreResult` pure DOM — assert the rendered body has
//      the Applied list, optional warnings, optional pending notice,
//      and a working Close button.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
    BACKUP_SECTIONS,
    buildBackupModalShell,
    buildBackupSectionsHtml,
    detectBackupSections,
    readBackupSectionFlags,
    renderRestoreResult,
    showBackupModal,
    showRestoreModal,
    type BackupRestoreDeps,
} from './backupRestore';
import {
    createHscState,
    createLibraryCacheState,
    createManageState,
    createOriginalConfigStateRef,
    createSavedFiltersState,
    createTopListsState,
} from '../state/state';

describe('buildBackupModalShell', () => {
    beforeEach(() => {
        document.documentElement.innerHTML = '';
        let body = document.body;
        if (!body) {
            body = document.createElement('body');
            document.documentElement.appendChild(body);
        }
        body.innerHTML = '';
    });

    it('appends the backdrop div to document.body with the right CSS shape', () => {
        const modal = buildBackupModalShell();
        expect(document.body.contains(modal)).toBe(true);
        expect(modal.style.position).toBe('fixed');
        expect(modal.style.zIndex).toBe('9999');
        expect(modal.style.background).toMatch(/^rgba\(0,\s*0,\s*0,\s*0\.75\)/);
        // Has the renderBox + close API.
        expect(typeof modal.renderBox).toBe('function');
        expect(typeof modal.close).toBe('function');
    });

    it('renderBox wraps content with the popup background fallback markers', () => {
        const modal = buildBackupModalShell();
        modal.renderBox('<p>hello</p>');
        expect(modal.innerHTML).toContain('<p>hello</p>');
        expect(modal.innerHTML).toContain('--plugin-popup-bg,#2a2a2a');
    });
});

describe('buildBackupSectionsHtml', () => {
    it('renders every section with default-selected checkboxes when available=null', () => {
        const html = buildBackupSectionsHtml(null, 'chkTest');
        for (const s of BACKUP_SECTIONS) {
            expect(html).toContain('class="chkTest"');
            expect(html).toContain('data-section="' + s.key + '"');
            expect(html).toContain(' checked');
        }
        // Negative case: `disabled` attribute must not appear when available=null.
        expect(html).not.toContain(' disabled');
    });

    it('renders every key as its own input; chkClass override works', () => {
        const html = buildBackupSectionsHtml(null, 'foo');
        for (const s of BACKUP_SECTIONS) {
            expect(html).toContain('class="foo" data-section="' + s.key + '"');
        }
    });

    it('disables sections not in the available set with the "not in file" hint', () => {
        const available = new Set(['Settings', 'ApiKeys']);
        const html = buildBackupSectionsHtml(available, 'chkRestore');

        // Settings + ApiKeys present → `checked` (no `disabled`).
        expect(html).toContain('data-section="Settings" checked');
        expect(html).toContain('data-section="ApiKeys" checked');
        // Tags + the rest → `disabled`, plus the "not in file" copy.
        expect(html).toContain('data-section="Tags" disabled');
        expect(html).toContain('(not in file)');
        // Opacity reduction gets applied.
        expect(html).toContain('opacity:0.45;');
    });
});

describe('readBackupSectionFlags', () => {
    beforeEach(() => {
        document.documentElement.innerHTML = '';
        let body = document.body;
        if (!body) {
            body = document.createElement('body');
            document.documentElement.appendChild(body);
        }
        body.innerHTML = '';
    });

    it('round-trips buildBackupSectionsHtml → readBackupSectionFlags', () => {
        // Render the modal shell + section list (null available → all on).
        const modal = buildBackupModalShell();
        modal.renderBox(buildBackupSectionsHtml(null, 'chkRoundTrip'));

        const flags = readBackupSectionFlags(modal, 'chkRoundTrip');
        for (const s of BACKUP_SECTIONS) {
            expect(flags[s.key]).toBe(true);
        }
    });

    it('round-trips with disabled sections: disabled sections report false', () => {
        const available = new Set(['Settings', 'ApiKeys']);
        const modal = buildBackupModalShell();
        modal.renderBox(buildBackupSectionsHtml(available, 'chkPartial'));

        const flags = readBackupSectionFlags(modal, 'chkPartial');
        expect(flags['Settings']).toBe(true);
        expect(flags['ApiKeys']).toBe(true);
        expect(flags['Tags']).toBe(false);
        expect(flags['SavedFilters']).toBe(false);
        // Even if a caller manually flips a disabled checkbox, the
        // helper still reports false (the contract is "and not .disabled").
        const tagsBox = modal.querySelector<HTMLInputElement>('input[data-section="Tags"]');
        expect(tagsBox).not.toBeNull();
        if (tagsBox) {
            tagsBox.checked = true;
            expect(readBackupSectionFlags(modal, 'chkPartial')['Tags']).toBe(false);
        }
    });
});

describe('detectBackupSections', () => {
    it('classifies a modern backup payload with declared sections', () => {
        const parsed = {
            BackupVersion: 1,
            Sections: ['Settings', 'Tags', 'TopLists'],
            CreatedUtc: '2026-01-15T12:00:00Z',
            PluginVersion: '2.3.4',
        };
        const info = detectBackupSections(parsed);
        expect(info.legacy).toBe(false);
        expect(info.sections.has('Settings')).toBe(true);
        expect(info.sections.has('Tags')).toBe(true);
        expect(info.sections.has('TopLists')).toBe(true);
        expect(info.sections.has('ApiKeys')).toBe(false);
        expect(info.createdUtc).toBe('2026-01-15T12:00:00Z');
        expect(info.pluginVersion).toBe('2.3.4');
    });

    it('infers Settings + ApiKeys (and Tags if present) for legacy payloads', () => {
        // No BackupVersion → legacy. The legacy contract wrote the raw
        // config dump, so Settings + ApiKeys are always present.
        const parsed = {
            Tags: [{ Name: '4K' }],
        };
        const info = detectBackupSections(parsed);
        expect(info.legacy).toBe(true);
        expect(info.sections.has('Settings')).toBe(true);
        expect(info.sections.has('ApiKeys')).toBe(true);
        expect(info.sections.has('Tags')).toBe(true);
        expect(info.sections.has('SavedFilters')).toBe(false);
        expect(info.createdUtc).toBe('');
        expect(info.pluginVersion).toBe('');
    });

    it('infers SavedFilters when the legacy JSON contains it', () => {
        const info = detectBackupSections({ SavedFilters: [{ Name: 'f1' }] });
        expect(info.legacy).toBe(true);
        expect(info.sections.has('SavedFilters')).toBe(true);
    });

    it('handles null/non-object input as a legacy backup with only Settings + ApiKeys', () => {
        const info = detectBackupSections(null);
        expect(info.legacy).toBe(true);
        expect(info.sections.has('Settings')).toBe(true);
        expect(info.sections.has('ApiKeys')).toBe(true);
        expect(info.sections.size).toBe(2);
    });

    it('handles a modern payload with missing/odd-typed Sections gracefully', () => {
        const info = detectBackupSections({ BackupVersion: 2, Sections: 'not-an-array' });
        expect(info.legacy).toBe(false);
        expect(info.sections.size).toBe(0);
        expect(info.createdUtc).toBe('');
    });
});

// ─── Smoke tests for the modal entry points (Phase 5) ────────────────────────

const FAKE_BACKUP_PAYLOAD = {
    Plugin: 'HomeScreenCompanion',
    Version: '1.2.3',
    CreatedUtc: '2026-01-15T12:00:00Z',
    Sections: {
        Settings: { DryRunMode: false },
        ApiKeys: {},
        Tags: [{ Name: '4K' }],
    },
};

function makeDeps(overrides: Partial<{
    fetchMock: ReturnType<typeof vi.fn>;
    alert: ReturnType<typeof vi.fn>;
}> = {}): BackupRestoreDeps & { fetchMock: ReturnType<typeof vi.fn>; alertSpy: ReturnType<typeof vi.fn> } {
    const fetchMock = overrides.fetchMock ?? vi.fn();
    const alert = overrides.alert ?? vi.fn();
    const api = {
        accessToken: () => 'test-token',
        getUrl: (name: string) => 'http://legacy.test/api/' + name,
        getJSON: vi.fn().mockResolvedValue({}),
        updatePluginConfiguration: vi.fn().mockResolvedValue(undefined),
        getPluginConfiguration: vi.fn().mockResolvedValue({}),
    };
    return {
        fetch: fetchMock as unknown as typeof fetch,
        getApiClient: () => api,
        alert,
        state: {
            originalConfigState: createOriginalConfigStateRef(),
            hsc: createHscState(),
            savedFilters: createSavedFiltersState(),
            topLists: createTopListsState(),
            manage: createManageState(),
            libraryCache: createLibraryCacheState(),
        },
        pluginId: '7c10708f-43e4-4d69-923c-77d01802315b',
        fetchMock,
        alertSpy: alert,
    };
}

function resetDom(): void {
    document.documentElement.innerHTML = '';
    let body = document.body;
    if (!body) {
        body = document.createElement('body');
        document.documentElement.appendChild(body);
    }
    body.innerHTML = '';
}

function jsonResponse(payload: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        statusText: ok ? 'OK' : 'Server Error',
        json: () => Promise.resolve(payload),
    } as unknown as Response;
}

describe('showBackupModal', () => {
    beforeEach(resetDom);
    afterEach(() => {
        resetDom();
        vi.restoreAllMocks();
    });

    it('opens a modal with all sections checked by default', () => {
        const deps = makeDeps();
        showBackupModal(deps);
        const modal = document.body.querySelector<HTMLDivElement>('[class],div');
        expect(modal).not.toBeNull();
        const html = document.body.innerHTML;
        for (const s of BACKUP_SECTIONS) {
            expect(html).toContain('data-section="' + s.key + '"');
            expect(html).toContain('Download');
            expect(html).toContain('Cancel');
        }
    });

    it('POSTs the section flags to Backup/Export and triggers a JSON file download', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(FAKE_BACKUP_PAYLOAD));
        const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
        const revokeObjectURL = vi.fn();
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        URL.createObjectURL = createObjectURL;
        URL.revokeObjectURL = revokeObjectURL;
        try {
            const deps = makeDeps({ fetchMock });
            showBackupModal(deps);

            const downloadBtn = document.body.querySelector<HTMLButtonElement>('.btnBackupDownload');
            expect(downloadBtn).not.toBeNull();
            if (!downloadBtn) return;
            downloadBtn.click();

            // Drain microtasks: fetch.then(json).then(...) chain.
            for (let i = 0; i < 10; i++) await Promise.resolve();

            // Fetch hit the right URL with the section flags as the body.
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(calledUrl).toBe('http://legacy.test/api/HomeScreenCompanion/Backup/Export');
            expect(calledInit.method).toBe('POST');
            expect((calledInit.headers as Record<string, string>)['X-Emby-Token']).toBe('test-token');
            const body = JSON.parse(calledInit.body as string);
            // Every section is pre-checked → body has every key set to true.
            for (const s of BACKUP_SECTIONS) expect(body[s.key]).toBe(true);

            // A Blob was built and an object URL was created/revoked.
            expect(createObjectURL).toHaveBeenCalledTimes(1);
            const blobArg = createObjectURL.mock.calls[0][0] as Blob;
            expect(blobArg).toBeInstanceOf(Blob);
            expect(blobArg.type).toBe('application/json');
            const blobText = await blobArg.text();
            // The serialized payload has the four keys our fixture provided.
            const parsed = JSON.parse(blobText);
            expect(parsed.Plugin).toBe('HomeScreenCompanion');
            expect(parsed.Version).toBe('1.2.3');
            expect(parsed.CreatedUtc).toBe('2026-01-15T12:00:00Z');
            expect(parsed.Sections).toBeDefined();
            expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

            // Modal closed itself on success.
            expect(document.body.querySelector('.btnBackupDownload')).toBeNull();
        } finally {
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });

    it('writes a select-at-least-one error when no section is checked', async () => {
        const fetchMock = vi.fn();
        const deps = makeDeps({ fetchMock });
        showBackupModal(deps);

        // Uncheck every section.
        const boxes = document.body.querySelectorAll<HTMLInputElement>('input.chkBackupSection');
        boxes.forEach((b) => { b.checked = false; });

        const downloadBtn = document.body.querySelector<HTMLButtonElement>('.btnBackupDownload');
        if (!downloadBtn) throw new Error('download button missing');
        downloadBtn.click();

        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(fetchMock).not.toHaveBeenCalled();
        const errEl = document.body.querySelector<HTMLElement>('.backup-error');
        expect(errEl?.textContent).toBe('Select at least one section.');
    });

    it('writes a "Backup failed:" error on fetch rejection', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false));
        const deps = makeDeps({ fetchMock });
        showBackupModal(deps);

        const downloadBtn = document.body.querySelector<HTMLButtonElement>('.btnBackupDownload');
        if (!downloadBtn) throw new Error('download button missing');
        downloadBtn.click();

        for (let i = 0; i < 10; i++) await Promise.resolve();
        const errEl = document.body.querySelector<HTMLElement>('.backup-error');
        expect(errEl?.textContent).toMatch(/^Backup failed: /);
    });
});

describe('showRestoreModal', () => {
    beforeEach(resetDom);
    afterEach(() => {
        resetDom();
        vi.restoreAllMocks();
    });

    const SAMPLE = JSON.stringify({
        BackupVersion: 1,
        Sections: ['Settings', 'ApiKeys'],
        CreatedUtc: '2026-01-15T12:00:00Z',
        PluginVersion: '2.3.4',
        Settings: { DryRunMode: false },
        ApiKeys: { Trakt: 'xxx' },
    });

    it('opens a modal with sections from the file pre-checked', () => {
        const deps = makeDeps();
        showRestoreModal(SAMPLE, undefined, deps);

        const settingsBox = document.body.querySelector<HTMLInputElement>('input.chkRestoreSection[data-section="Settings"]');
        const apiKeysBox = document.body.querySelector<HTMLInputElement>('input.chkRestoreSection[data-section="ApiKeys"]');
        const tagsBox = document.body.querySelector<HTMLInputElement>('input.chkRestoreSection[data-section="Tags"]');
        expect(settingsBox?.checked).toBe(true);
        expect(apiKeysBox?.checked).toBe(true);
        expect(tagsBox?.disabled).toBe(true);

        // Title + Restore button present.
        expect(document.body.innerHTML).toContain('Restore Backup');
        expect(document.body.innerHTML).toContain('Restore');
    });

    it('alerts and bails on malformed JSON', () => {
        const deps = makeDeps();
        showRestoreModal('not-json', undefined, deps);
        expect(deps.alertSpy).toHaveBeenCalledTimes(1);
        const call0 = deps.alertSpy.mock.calls[0];
        expect(call0).toBeDefined();
        if (call0) expect(String(call0[0])).toMatch(/Failed to parse/);
        // No modal opened.
        expect(document.body.innerHTML).not.toContain('Restore Backup');
    });

    it('alerts and bails on a non-object payload', () => {
        const deps = makeDeps();
        showRestoreModal('"a string"', undefined, deps);
        expect(deps.alertSpy).toHaveBeenCalledTimes(1);
        const call0 = deps.alertSpy.mock.calls[0];
        expect(call0).toBeDefined();
        if (call0) expect(String(call0[0])).toMatch(/not a Home Screen Companion backup/);
    });

    it('POSTs BackupJson + section flags to Backup/Import and calls onRestored', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            Success: true,
            Applied: ['Settings', 'ApiKeys'],
            Warnings: [],
            TopListsNeedingLibrary: [],
        }));
        const onRestored = vi.fn();
        const deps = makeDeps({ fetchMock });
        showRestoreModal(SAMPLE, onRestored, deps);

        const applyBtn = document.body.querySelector<HTMLButtonElement>('.btnRestoreApply');
        if (!applyBtn) throw new Error('apply button missing');
        applyBtn.click();

        for (let i = 0; i < 10; i++) await Promise.resolve();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toBe('http://legacy.test/api/HomeScreenCompanion/Backup/Import');
        expect(calledInit.method).toBe('POST');
        const body = JSON.parse(calledInit.body as string);
        expect(body.BackupJson).toBe(SAMPLE);
        // Settings + ApiKeys are in the file → both pre-checked → both in body.
        expect(body.Settings).toBe(true);
        expect(body.ApiKeys).toBe(true);
        // Tags not in the file → disabled checkbox → flag is false (not
        // absent — legacy `Object.assign` puts every section key in the
        // body, disabled ones just as `false`).
        expect(body.Tags).toBe(false);

        expect(onRestored).toHaveBeenCalledTimes(1);

        // After restore the modal body is replaced with the success view.
        const html = document.body.innerHTML;
        expect(html).toContain('Backup restored');
        expect(html).toContain('Settings');
        expect(html).toContain('ApiKeys');
    });

    it('throws on result.Success=false and writes the error into the modal', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            Success: false,
            Message: 'corrupt payload',
        }));
        const deps = makeDeps({ fetchMock });
        showRestoreModal(SAMPLE, undefined, deps);

        const applyBtn = document.body.querySelector<HTMLButtonElement>('.btnRestoreApply');
        if (!applyBtn) throw new Error('apply button missing');
        applyBtn.click();

        for (let i = 0; i < 10; i++) await Promise.resolve();
        const errEl = document.body.querySelector<HTMLElement>('.backup-error');
        expect(errEl?.textContent).toMatch(/^Restore failed: /);
        expect(errEl?.textContent).toContain('corrupt payload');
    });
});

describe('renderRestoreResult', () => {
    beforeEach(resetDom);
    afterEach(() => {
        resetDom();
        vi.restoreAllMocks();
    });

    function plainResult(): Parameters<typeof renderRestoreResult>[1] {
        return {
            Success: true,
            Applied: ['Settings', 'ApiKeys'],
            Warnings: [],
            TopListsNeedingLibrary: [],
        };
    }

    it('renders the Applied list and a single Close button when nothing is pending', () => {
        const modal = buildBackupModalShell();
        const deps = makeDeps();
        renderRestoreResult(modal, plainResult(), deps);

        const html = modal.innerHTML;
        expect(html).toContain('Backup restored');
        expect(html).toContain('Settings');
        expect(html).toContain('ApiKeys');
        // No pending → no Create-libraries button.
        expect(html).not.toContain('btnRestoreCreateLibs');
        // Only the Close button in the footer.
        expect(html).toContain('btnRestoreDone');
        expect(html).toContain('Close');

        // Clicking Close closes the modal.
        const doneBtn = modal.querySelector<HTMLButtonElement>('.btnRestoreDone');
        expect(doneBtn).not.toBeNull();
        doneBtn?.click();
        expect(document.body.contains(modal)).toBe(false);
    });

    it('renders warnings when result.Warnings is non-empty', () => {
        const modal = buildBackupModalShell();
        const deps = makeDeps();
        renderRestoreResult(modal, {
            Success: true,
            Applied: ['Settings'],
            Warnings: ['Tags missing field X', 'TopLists had 1 orphan'],
            TopListsNeedingLibrary: [],
        }, deps);

        const html = modal.innerHTML;
        expect(html).toContain('Warnings');
        expect(html).toContain('Tags missing field X');
        expect(html).toContain('TopLists had 1 orphan');
    });

    it('renders the pending top-list notice + Create-libraries button when pending is non-empty', () => {
        const modal = buildBackupModalShell();
        const deps = makeDeps();
        renderRestoreResult(modal, {
            Success: true,
            Applied: ['TopLists'],
            Warnings: [],
            TopListsNeedingLibrary: [
                { TagName: 'MyList', CustomName: 'My Custom List', UserIds: ['u1'], FolderPath: '/data/MyList', BadgeStyle: 'success' },
            ],
        }, deps);

        const html = modal.innerHTML;
        expect(html).toContain('1 top-list needs an Emby library');
        expect(html).toContain('My Custom List');
        expect(html).toContain('btnRestoreCreateLibs');
        expect(html).toContain('Create libraries now');
    });
});
