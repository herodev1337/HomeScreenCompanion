// Phase 3 wave 2: backup / restore modal shell, leaf module.
//
// Lifted from `Configuration/configPage.js` (legacy.js:5699-5814). The
// pure helpers extracted here:
//
//   - `buildBackupModalShell()` (legacy.js:5708) — builds the modal
//     backdrop, escape-key handler, and `renderBox`/`close` API.
//   - `buildBackupSectionsHtml(available, chkClass)` (legacy.js:5727) —
//     renders the per-section checkbox list. Reads the module-scope
//     `_backupSections` table; that table is now this module's
//     `BACKUP_SECTIONS` export (read-only).
//   - `readBackupSectionFlags(modal, chkClass)` (legacy.js:5740) —
//     walks the rendered modal and returns a `{key: enabled}` map.
//   - `detectBackupSections(parsed)` (legacy.js:5800) — classifies a
//     parsed backup file as legacy or modern, returning the set of
//     sections present.
//
// The function `showBackupModal` (legacy.js:5751) and
// `showRestoreModal` (legacy.js:5817) are deferred — they call
// `window.Dashboard.alert`, hit `window.ApiClient`, and glue together
// `showBackupModal`, `renderRestoreResult` (legacy.js:5880, ~80 lines
// of close-coupled result-rendering) and live state. They will land in
// the wave that wires the function together with shared state.

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
