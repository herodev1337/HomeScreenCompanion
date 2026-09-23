/// <reference types="vitest" />
//
// Unit tests for `modules/backup/backupRestore.ts`.
//
// 4 tests:
//
//   1. `buildBackupModalShell` returns a non-empty string-soup element
//      with the expected CSS custom-property fallback markers.
//   2. `buildBackupSectionsHtml(available, chkClass)` matches expected
//      `value=...` + checkbox markers (both `null` and `Set` paths).
//   3. `readBackupSectionFlags` round-trip — render, then read back.
//   4. `detectBackupSections` covers both legacy and modern backup
//      payloads, plus the malformed input path.

import { describe, it, expect, beforeEach } from 'vitest';

import {
    BACKUP_SECTIONS,
    buildBackupModalShell,
    buildBackupSectionsHtml,
    detectBackupSections,
    readBackupSectionFlags,
} from './backupRestore';

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
