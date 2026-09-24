// Phase 5: backup / restore modal pipeline.
//
// Lifted from `Configuration/configPage.js` (legacy.js:5699-5959). The
// pure helpers extracted in Phase 3 wave 2:
//
//   - `buildBackupModalShell()`        (legacy.js:5708)
//   - `buildBackupSectionsHtml(...)`   (legacy.js:5727)
//   - `readBackupSectionFlags(...)`    (legacy.js:5740)
//   - `detectBackupSections(parsed)`   (legacy.js:5800)
//
// The deferred functions lifted in this wave:
//
//   - `showBackupModal(deps)`          (legacy.js:5751) — opens the
//     download modal, POSTs the section flags to `Backup/Export`, and
//     triggers a JSON file download of the response.
//   - `showRestoreModal(raw, on, deps)` (legacy.js:5817) — opens the
//     restore modal, POSTs `{BackupJson, ...flags}` to `Backup/Import`,
//     and renders the result.
//   - `renderRestoreResult(modal, r, deps)` (legacy.js:5880) — pure DOM
//     render of the restore outcome + optional per-pending-list library
//     creation wiring (which calls `executeTopListCreationSteps` from
//     `./toplists/creation`).
//
// All ApiClient / Dashboard / fetch surfaces are lifted onto the explicit
// `BackupRestoreDeps` interface; the state fields on `deps.state` are
// reserved for the eventual `index.ts` wiring (the current extraction
// reads none of them — the legacy flow is server-side).

import { escapeHtml } from '../dom/dom';
import {
    executeTopListCreationSteps,
    type TopListCreationDeps,
} from '../toplists/creation';
import type {
    HscState,
    LibraryCacheState,
    ManageState,
    OriginalConfigStateRef,
    SavedFiltersState,
    TopListsState,
} from '../state/state';

/**
 * The plugin-defined sections that can be packed into a backup file.
 * Same shape as legacy.js's `_backupSections` (line 5699).
 *
 *   - `key`   — JSON field / checkbox `data-section` attribute.
 *   - `label` — Human title shown in the modal.
 *   - `desc`  — Small italic description under the label.
 */
export interface BackupSection {
    readonly key: string;
    readonly label: string;
    readonly desc: string;
}

/**
 * The static table of backup sections. Mirrors `legacy.js:5699-5706`.
 * Ordered: Settings, ApiKeys, Tags, SavedFilters, TopLists, HomeSync.
 */
export const BACKUP_SECTIONS: ReadonlyArray<BackupSection> = [
    { key: 'Settings',     label: 'General settings',          desc: 'AI models, system prompt, logging, dry run, preserve-on-empty.' },
    { key: 'ApiKeys',      label: 'API keys',                  desc: 'Trakt, MDBList, TMDB, OpenAI, Gemini, Claude. Stored in plain text in the file.' },
    { key: 'Tags',         label: 'Tag & collection groups',   desc: 'All source groups incl. schedules, blacklists, filters, collection settings, home sections and playlists.' },
    { key: 'SavedFilters', label: 'Saved media-info filters',  desc: 'Your saved filter presets.' },
    { key: 'TopLists',     label: 'Top lists',                 desc: 'Top-list settings and the movie lists of manual top-lists.' },
    { key: 'HomeSync',     label: 'Home screen sync',          desc: 'Source user, target users and library-order sync.' },
];

/**
 * Shape of the returned modal object. We attach three custom methods
 * (`renderBox`, `close`) plus a `dataset.busy` flag. The DOM surface is
 * a `<div>` mounted at `document.body`.
 */
export interface BackupModal extends HTMLDivElement {
    renderBox: (content: string) => void;
    close: () => void;
}

/**
 * Build the modal backdrop, install the escape-key handler, and return
 * the mutable container.
 *
 * The returned element is appended to `document.body`. The element
 * carries:
 *   - `renderBox(content)` — replaces `innerHTML` with a styled wrapper
 *     around `content`. Theme colors come from CSS custom properties.
 *   - `close()` — removes the element and detaches the keydown
 *     listener.
 *   - `dataset.busy = '1'` — set by long-running click handlers to
 *     prevent the click-to-close-on-backdrop behavior from firing.
 *
 * Pure given `document` (no module-scope state).
 */
export function buildBackupModalShell(): BackupModal {
    const modal = document.createElement('div') as unknown as BackupModal;
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.renderBox = function (content: string): void {
        modal.innerHTML =
            '<div style="background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);' +
            'border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;' +
            'padding:28px;max-width:560px;width:90%;max-height:85vh;overflow-y:auto;">' +
            content + '</div>';
    };
    function onEsc(e: KeyboardEvent): void {
        if (e.key === 'Escape') modal.close();
    }
    modal.close = function (): void {
        modal.remove();
        document.removeEventListener('keydown', onEsc);
    };
    document.addEventListener('keydown', onEsc);
    modal.addEventListener('click', function (e: MouseEvent): void {
        if (e.target === modal && !modal.dataset.busy) modal.close();
    });
    document.body.appendChild(modal as unknown as Node);
    return modal;
}

/**
 * Render the per-section checkbox list.
 *
 * - `available` — when `null`, every section is selectable. When a
 *   `Set<string>`, only matching sections are checked+enabled; the
 *   rest render at half opacity with `(not in file)` hint text.
 * - `chkClass` — class applied to each checkbox so the caller can
 *   read the selections back later (see `readBackupSectionFlags`).
 *
 * @returns  The HTML fragment (no wrapping element).
 */
export function buildBackupSectionsHtml(
    available: ReadonlySet<string> | null,
    chkClass: string,
): string {
    return BACKUP_SECTIONS.map((s) => {
        const present = !available || available.has(s.key);
        const rowStyle = 'display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-color,rgba(255,255,255,0.08));' +
            (present ? '' : 'opacity:0.45;');
        return '<label style="' + rowStyle + 'cursor:' + (present ? 'pointer' : 'default') + ';">' +
            '<input type="checkbox" class="' + chkClass + '" data-section="' + s.key + '"' +
            (present ? ' checked' : ' disabled') +
            ' style="margin-top:3px;" />' +
            '<span style="flex:1;">' +
            '<span style="display:block;font-weight:600;font-size:0.95em;">' + s.label +
            (present ? '' : ' <span style="font-weight:400;opacity:0.7;">(not in file)</span>') +
            '</span>' +
            '<span style="display:block;font-size:0.82em;opacity:0.65;margin-top:2px;">' + s.desc + '</span>' +
            '</span></label>';
    }).join('');
}

/**
 * Read which sections the user toggled in a rendered backup/restore
 * modal.
 *
 * Walks every `<input class="<chkClass>">` descendant of `modal` and
 * builds a `Record<sectionKey, enabled>` where `enabled === true` iff
 * the checkbox is `.checked` AND not `.disabled`. Disabled boxes (a
 * section that's missing from the backup file) are excluded so the
 * caller can't accidentally toggle them on.
 *
 * @param modal     The container returned by `buildBackupModalShell`.
 * @param chkClass  The same `chkClass` that was passed to
 *                  `buildBackupSectionsHtml`.
 */
export function readBackupSectionFlags(
    modal: HTMLElement,
    chkClass: string,
): Readonly<Record<string, boolean>> {
    const flags: Record<string, boolean> = {};
    const boxes = modal.querySelectorAll<HTMLInputElement>('.' + chkClass);
    boxes.forEach((c) => {
        flags[c.dataset.section ?? ''] = !c.disabled && c.checked;
    });
    return flags;
}

/**
 * Result of `detectBackupSections`. `sections` is a `Set` for ergonomic
 * `set.has(key)` checks; legacy backups always carry Settings + ApiKeys
 * plus whatever else their JSON object includes.
 */
export interface BackupInfo {
    /** `true` when the parsed JSON does not declare a `BackupVersion`. */
    readonly legacy: boolean;
    /** All section keys present in this backup (modern or inferred). */
    readonly sections: ReadonlySet<string>;
    /** ISO-8601 UTC stamp the modern backup was written. Empty for legacy. */
    readonly createdUtc: string;
    /** Plugin version that wrote the modern backup. Empty for legacy. */
    readonly pluginVersion: string;
}

/**
 * Classify a parsed backup file as legacy or modern and report which
 * sections it carries.
 *
 * Modern backups (`BackupVersion: number`) declare their sections under
 * `Sections` and metadata under `CreatedUtc`/`PluginVersion`. Legacy
 * backups are a raw config dump; we infer Settings + ApiKeys always,
 * and Tags / SavedFilters when the corresponding top-level array is
 * present in the JSON.
 *
 * @param parsed  The result of `JSON.parse(rawText)`. May be `null`,
 *                a non-object, or any other malformed shape.
 */
export function detectBackupSections(parsed: unknown): BackupInfo {
    const sections = new Set<string>();
    const info: {
        legacy: boolean;
        sections: Set<string>;
        createdUtc: string;
        pluginVersion: string;
    } = { legacy: false, sections, createdUtc: '', pluginVersion: '' };

    if (parsed && typeof parsed === 'object' && typeof (parsed as { BackupVersion?: unknown }).BackupVersion === 'number') {
        const p = parsed as { Sections?: unknown; CreatedUtc?: unknown; PluginVersion?: unknown };
        (Array.isArray(p.Sections) ? p.Sections : []).forEach((s) => {
            if (typeof s === 'string') sections.add(s);
        });
        info.createdUtc = typeof p.CreatedUtc === 'string' ? p.CreatedUtc : '';
        info.pluginVersion = typeof p.PluginVersion === 'string' ? p.PluginVersion : '';
        return info;
    }

    info.legacy = true;
    sections.add('Settings');
    sections.add('ApiKeys');
    const p = (parsed && typeof parsed === 'object' ? parsed : {}) as { Tags?: unknown; SavedFilters?: unknown };
    if (Array.isArray(p.Tags)) sections.add('Tags');
    if (Array.isArray(p.SavedFilters)) sections.add('SavedFilters');
    return info;
}

// ─── Backup/Restore deps + entry points (legacy.js:5746-5959) ────────────────

/** Shared CSS constants lifted verbatim from legacy.js:5746-5749. */
const BACKUP_BTN_PRIMARY = 'cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:4px;padding:10px 26px;font-size:0.95em;font-weight:600;';
const BACKUP_BTN_SECONDARY = 'cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-primary);border-radius:3px;padding:8px 18px;font-size:0.9em;';
const BACKUP_TITLE_STYLE = 'margin:0 0 6px;font-size:1.15em;font-weight:600;';
const BACKUP_HINT_STYLE = 'font-size:0.88em;opacity:0.7;margin:0 0 14px;line-height:1.45;';

/**
 * Minimal shape of the Jellyfin `ApiClient` surface the backup/restore
 * pipeline touches. Only `accessToken` + `getUrl` are read by the legacy
 * code paths lifted here; the rest is reserved for the eventual
 * `index.ts` wiring.
 */
export interface BackupRestoreApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
}

/**
 * Dependencies for the backup/restore pipeline. Every external surface
 * the legacy code reads — `ApiClient`, the global `fetch`, the
 * `Dashboard.alert` global, and the per-page state holders — is lifted
 * onto this object so the extracted functions are pure functions of
 * their args + deps.
 *
 * The `state` field carries the typed module-scope holders from
 * `../state/state`. None of them are read by the current extraction
 * (the legacy flow is server-side — POST to `Backup/Export` /
 * `Backup/Import` and the C# endpoint performs the work). They are
 * present so the eventual `index.ts` factory can pass the single
 * `AppState` bag to every module.
 */
export interface BackupRestoreDeps {
    readonly fetch: typeof fetch;
    readonly getApiClient: () => BackupRestoreApiClient;
    readonly alert: (message: string) => void;
    readonly state: {
        readonly originalConfigState: OriginalConfigStateRef;
        readonly hsc: HscState;
        readonly savedFilters: SavedFiltersState;
        readonly topLists: TopListsState;
        readonly manage: ManageState;
        readonly libraryCache: LibraryCacheState;
    };
    readonly pluginId: string;
}

/** Shape of `result` consumed by {@link renderRestoreResult}. Mirrors the server's `Backup/Import` response payload. */
export interface RestoreResult {
    readonly Success?: boolean;
    readonly Message?: string;
    readonly Applied?: readonly string[];
    readonly Warnings?: readonly string[];
    readonly TopListsNeedingLibrary?: readonly TopListPending[];
    readonly [k: string]: unknown;
}

/** One entry in `result.TopListsNeedingLibrary`. */
export interface TopListPending {
    readonly TagName?: string;
    readonly CustomName?: string;
    readonly UserIds?: readonly string[];
    readonly DisplayMode?: string;
    readonly ImageType?: string;
    readonly MaxItems?: number;
    readonly FolderPath?: string;
    readonly BadgeStyle?: string;
    readonly [k: string]: unknown;
}

/**
 * Open the Download Backup modal (legacy.js:5751-5796). The modal lets
 * the user pick which sections to include, POSTs the section flags to
 * `HomeScreenCompanion/Backup/Export`, and triggers a JSON file download
 * of the server's response.
 *
 * On error the button is re-enabled, the busy flag cleared, and the
 * error text written into the `.backup-error` element inside the modal.
 */
export function showBackupModal(deps: BackupRestoreDeps): void {
    const modal = buildBackupModalShell();
    modal.renderBox(
        '<h3 style="' + BACKUP_TITLE_STYLE + '">Download Backup</h3>' +
        '<p style="' + BACKUP_HINT_STYLE + '">Choose what to include. Only configuration is saved – tags, collections, playlists, top-list files and images are recreated by the plugin on the next sync run.</p>' +
        '<div style="margin-bottom:16px;">' + buildBackupSectionsHtml(null, 'chkBackupSection') + '</div>' +
        '<div class="backup-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-bottom:6px;"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;">' +
        '<button type="button" class="btnBackupCancel" style="' + BACKUP_BTN_SECONDARY + '">Cancel</button>' +
        '<button type="button" class="btnBackupDownload" style="' + BACKUP_BTN_PRIMARY + '"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">download</i>Download</button>' +
        '</div>'
    );
    const cancelBtn = modal.querySelector<HTMLButtonElement>('.btnBackupCancel');
    const downloadBtn = modal.querySelector<HTMLButtonElement>('.btnBackupDownload');
    const errEl = modal.querySelector<HTMLElement>('.backup-error');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.close(); });
    if (downloadBtn) downloadBtn.addEventListener('click', function (this: HTMLButtonElement): void {
        const btn = this;
        if (!errEl) return;
        const flags = readBackupSectionFlags(modal, 'chkBackupSection');
        if (!Object.keys(flags).some((k) => flags[k])) {
            errEl.textContent = 'Select at least one section.';
            return;
        }
        errEl.textContent = '';
        btn.disabled = true;
        btn.innerHTML = 'Preparing <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
        modal.dataset.busy = '1';
        const api = deps.getApiClient();
        const tok = api.accessToken();
        deps.fetch(api.getUrl('HomeScreenCompanion/Backup/Export'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok },
            body: JSON.stringify(flags),
        })
            .then((r) => {
                if (!r.ok) throw new Error('Server returned ' + r.status);
                return r.json();
            })
            .then((backup) => {
                const json = JSON.stringify(backup, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'HSC_Backup_' + new Date().toISOString().split('T')[0] + '.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                modal.close();
            })
            .catch((err: Error) => {
                delete modal.dataset.busy;
                btn.disabled = false;
                btn.innerHTML = '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">download</i>Download';
                errEl.textContent = 'Backup failed: ' + (err.message || String(err));
            });
    });
}

/**
 * Open the Restore Backup modal (legacy.js:5817-5878). Parses `rawText`
 * (alerts via `Dashboard.alert` if the JSON is malformed or the payload
 * is not an object), pre-checks the sections present in the file, and
 * POSTs `{BackupJson, ...flags}` to `HomeScreenCompanion/Backup/Import`.
 *
 * On a `result.Success === true` response, `onRestored` is invoked
 * (when supplied) and the result is rendered into the modal via
 * {@link renderRestoreResult}. On error the button is re-enabled and
 * the error text is written into `.backup-error`.
 */
export function showRestoreModal(
    rawText: string,
    onRestored: (() => void) | undefined,
    deps: BackupRestoreDeps,
): void {
    let parsed: unknown;
    try { parsed = JSON.parse(rawText); }
    catch (err) {
        deps.alert('Failed to parse configuration file. The file may be corrupt or not a valid backup file. Error: ' + (err as Error).message);
        return;
    }
    if (!parsed || typeof parsed !== 'object') {
        deps.alert('The selected file is not a Home Screen Companion backup.');
        return;
    }
    const info = detectBackupSections(parsed);

    const fileInfo = info.legacy
        ? 'Legacy backup (created by an older plugin version)'
        : 'Created ' + (info.createdUtc ? new Date(info.createdUtc).toLocaleString() : 'unknown') + (info.pluginVersion ? ' · plugin v' + escapeHtml(info.pluginVersion) : '');

    const modal = buildBackupModalShell();
    modal.renderBox(
        '<h3 style="' + BACKUP_TITLE_STYLE + '">Restore Backup</h3>' +
        '<p style="' + BACKUP_HINT_STYLE + 'margin-bottom:6px;">' + fileInfo + '</p>' +
        '<p style="' + BACKUP_HINT_STYLE + '">Select what to restore. Each selected section <strong>replaces</strong> the current configuration on the server immediately. Sections you leave unchecked are not touched.</p>' +
        '<div style="margin-bottom:16px;">' + buildBackupSectionsHtml(info.sections, 'chkRestoreSection') + '</div>' +
        '<div class="backup-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-bottom:6px;"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;">' +
        '<button type="button" class="btnRestoreCancel" style="' + BACKUP_BTN_SECONDARY + '">Cancel</button>' +
        '<button type="button" class="btnRestoreApply" style="' + BACKUP_BTN_PRIMARY + '"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">upload</i>Restore</button>' +
        '</div>'
    );
    const cancelBtn = modal.querySelector<HTMLButtonElement>('.btnRestoreCancel');
    const applyBtn = modal.querySelector<HTMLButtonElement>('.btnRestoreApply');
    const errEl = modal.querySelector<HTMLElement>('.backup-error');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.close(); });
    if (applyBtn) applyBtn.addEventListener('click', function (this: HTMLButtonElement): void {
        const btn = this;
        if (!errEl) return;
        const flags = readBackupSectionFlags(modal, 'chkRestoreSection');
        if (!Object.keys(flags).some((k) => flags[k])) {
            errEl.textContent = 'Select at least one section.';
            return;
        }
        errEl.textContent = '';
        btn.disabled = true;
        btn.innerHTML = 'Restoring <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
        modal.dataset.busy = '1';
        const body: Record<string, unknown> = Object.assign({ BackupJson: rawText }, flags);
        const api = deps.getApiClient();
        const tok = api.accessToken();
        deps.fetch(api.getUrl('HomeScreenCompanion/Backup/Import'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok },
            body: JSON.stringify(body),
        })
            .then((r) => {
                if (!r.ok) throw new Error('Server returned ' + r.status);
                return r.json();
            })
            .then((raw: unknown) => {
                const result = (raw && typeof raw === 'object' ? raw : {}) as RestoreResult;
                if (!result.Success) throw new Error(result.Message || 'Unknown error');
                delete modal.dataset.busy;
                if (typeof onRestored === 'function') onRestored();
                renderRestoreResult(modal, result, deps);
            })
            .catch((err: Error) => {
                delete modal.dataset.busy;
                btn.disabled = false;
                btn.innerHTML = '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">upload</i>Restore';
                errEl.textContent = 'Restore failed: ' + (err.message || String(err));
            });
    });
}

/**
 * Render the restore outcome into `modal`'s body (legacy.js:5880-5959).
 * Pure DOM: replaces the modal body via `renderBox`, then wires the
 * Done button (always) and — when `result.TopListsNeedingLibrary` is
 * non-empty — a Create-libraries-now button that fans the pending
 * top-lists through `executeTopListCreationSteps` (with dummy UI
 * targets + `silent: true` so the helper just calls the resolve
 * handler on success). On completion the `#tlContainer.dataset.loaded`
 * flag is cleared so the Top Lists tab reloads on next visit.
 */
export function renderRestoreResult(
    modal: BackupModal,
    result: RestoreResult,
    deps: BackupRestoreDeps,
): void {
    const pending = result.TopListsNeedingLibrary || [];
    const listStyle = 'margin:0 0 14px;padding-left:20px;font-size:0.9em;line-height:1.5;';

    let html =
        '<div style="text-align:center;padding:4px 0 14px;">' +
        '<i class="md-icon" style="font-size:2.5em;color:#52B54B;display:block;margin-bottom:8px;">check_circle</i>' +
        '<p style="margin:0;font-size:1.05em;font-weight:500;">Backup restored</p>' +
        '</div>' +
        '<span style="font-size:0.78em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;opacity:0.65;display:block;margin-bottom:4px;">Applied</span>' +
        '<ul style="' + listStyle + '">' + (result.Applied || []).map((a) => '<li>' + escapeHtml(a) + '</li>').join('') + '</ul>';

    if ((result.Warnings || []).length > 0) {
        html += '<span style="font-size:0.78em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#e0a030;display:block;margin-bottom:4px;">Warnings</span>' +
            '<ul style="' + listStyle + 'opacity:0.85;">' + (result.Warnings || []).map((w) => '<li>' + escapeHtml(w) + '</li>').join('') + '</ul>';
    }

    if (pending.length > 0) {
        html += '<div style="border:1px solid rgba(224,160,48,0.5);background:rgba(224,160,48,0.08);border-radius:6px;padding:12px 14px;margin-bottom:14px;font-size:0.9em;line-height:1.5;">' +
            '<strong>' + pending.length + ' top-list' + (pending.length !== 1 ? 's' : '') + ' need' + (pending.length === 1 ? 's' : '') + ' an Emby library:</strong> ' +
            pending.map((p) => escapeHtml(p.CustomName || p.TagName || '')).join(', ') + '.<br/>' +
            'Their settings and files are restored, but no library exists for them on this server yet. Create them now (this creates the libraries, home sections and access rights exactly like <em>+ Create New</em>), or later by opening each list in the Top Lists tab and clicking Save.' +
            '<div class="restore-tl-progress" style="margin-top:8px;font-size:0.88em;opacity:0.8;"></div>' +
            '</div>';
    }

    html += '<p style="' + BACKUP_HINT_STYLE + '">Run a sync afterwards to rebuild tags, collections, playlists and home sections from the restored configuration.</p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;padding-top:14px;border-top:1px solid var(--line-color);">' +
        (pending.length > 0 ? '<button type="button" class="btnRestoreCreateLibs" style="' + BACKUP_BTN_PRIMARY + '"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">library_add</i>Create libraries now</button>' : '') +
        '<button type="button" class="btnRestoreDone" style="' + (pending.length > 0 ? BACKUP_BTN_SECONDARY : BACKUP_BTN_PRIMARY) + '">Close</button>' +
        '</div>';

    modal.renderBox(html);

    const doneBtn = modal.querySelector<HTMLButtonElement>('.btnRestoreDone');
    if (doneBtn) doneBtn.addEventListener('click', () => { modal.close(); });

    const createBtn = modal.querySelector<HTMLButtonElement>('.btnRestoreCreateLibs');
    if (createBtn) {
        createBtn.addEventListener('click', function (this: HTMLButtonElement): void {
            const btn = this;
            btn.disabled = true;
            const doneBtn2 = modal.querySelector<HTMLButtonElement>('.btnRestoreDone');
            if (doneBtn2) doneBtn2.disabled = true;
            modal.dataset.busy = '1';
            const progressEl = modal.querySelector<HTMLElement>('.restore-tl-progress');
            const failures: string[] = [];
            const dummyBtn = document.createElement('button');
            const dummyErr = document.createElement('div');
            const dummyModal = document.createElement('div');

            const tlDeps = buildTopListCreationDeps(deps);

            void pending.reduce<Promise<void>>((p, tl, idx) => {
                return p.then(() => {
                    if (progressEl) progressEl.textContent = 'Creating ' + (idx + 1) + ' of ' + pending.length + ': ' + (tl.CustomName || tl.TagName || '') + '…';
                    return new Promise<void>((resolve, reject) => {
                        executeTopListCreationSteps(
                            tl.TagName || '',
                            tl.CustomName || tl.TagName || '',
                            tl.UserIds || [],
                            tl.DisplayMode || '',
                            tl.CustomName || tl.TagName || '',
                            tl.ImageType || '',
                            tl.MaxItems || 0,
                            { FolderPath: tl.FolderPath || '', FilesCreated: 0 },
                            { saveBtn: dummyBtn, errEl: dummyErr, modal: dummyModal, badgeStyle: tl.BadgeStyle || 'neutral', silent: true, closeHandler: resolve },
                            undefined,
                            tlDeps,
                        ).catch(reject);
                    }).catch((err: unknown) => {
                        failures.push((tl.CustomName || tl.TagName || '') + ': ' + ((err as Error)?.message || String(err)));
                    });
                });
            }, Promise.resolve()).then(() => {
                delete modal.dataset.busy;
                const doneBtn3 = modal.querySelector<HTMLButtonElement>('.btnRestoreDone');
                if (doneBtn3) doneBtn3.disabled = false;
                if (!progressEl) return;
                if (failures.length === 0) {
                    progressEl.style.color = '#52B54B';
                    progressEl.textContent = 'All ' + pending.length + ' librar' + (pending.length === 1 ? 'y' : 'ies') + ' created. Finishing touches continue in the background.';
                    btn.style.display = 'none';
                } else {
                    progressEl.style.color = '#cc3333';
                    progressEl.innerHTML = 'Some libraries could not be created:<br/>' + failures.map(escapeHtml).join('<br/>');
                    btn.disabled = false;
                }
                const tlContainer = document.querySelector<HTMLElement>('#tlContainer');
                if (tlContainer) tlContainer.dataset.loaded = '';
            });
        });
    }
}

/** Build a `TopListCreationDeps` from the available `BackupRestoreDeps` so `renderRestoreResult` can drive `executeTopListCreationSteps` for each pending top-list. */
function buildTopListCreationDeps(deps: BackupRestoreDeps): TopListCreationDeps {
    const api = deps.getApiClient();
    return {
        getUrl: (p) => api.getUrl(p),
        getAccessToken: () => api.accessToken(),
        getPluginConfiguration: () => api.getPluginConfiguration(deps.pluginId),
        updatePluginConfiguration: (cfg) => api.updatePluginConfiguration(deps.pluginId, cfg as Record<string, unknown>),
        fetch: deps.fetch,
        registerTopList: (tagNameLower) => { deps.state.topLists.tagNames.add(tagNameLower); },
    };
}
