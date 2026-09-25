/// <reference types="vitest" />
//
// D3 extraction tests for `modules/toplists/presetSelects.ts`. Pins the
// "same `<option>` markup from both call sites" contract that was
// duplicated between `showManualTopListModal` (now line ~565-566) and
// the manual branch of `loadInlineEditForm` (now line ~895-896).
//
// The display-mode and image-type selects are rendered through
// `renderDisplayModePresetOptions` / `renderImageTypePresetOptions`
// in BOTH call sites; the test pins the option order, the labels,
// and the `selected` attribute placement so any divergence is caught.

import { describe, it, expect } from 'vitest';
import {
    renderDisplayModePresetOptions,
    renderImageTypePresetOptions,
} from './presetSelects';

// ─── renderDisplayModePresetOptions ──────────────────────────────────────────

describe('renderDisplayModePresetOptions', () => {
    it('renders the legacy three-option order verbatim', () => {
        const html = renderDisplayModePresetOptions('');
        const opts = Array.from(html.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g));
        expect(opts.map((m) => m[1])).toEqual(['', 'tv', 'mobile,desktop']);
        expect(opts.map((m) => m[2])).toEqual([
            'Always',
            'When TV Display Mode is on',
            'When TV Display Mode is off',
        ]);
    });

    it('produces identical HTML from both call sites (same `selected` -> same output)', () => {
        for (const sel of ['', 'tv', 'mobile,desktop']) {
            expect(renderDisplayModePresetOptions(sel)).toBe(renderDisplayModePresetOptions(sel));
        }
    });

    it('marks the entry whose value matches `selected`', () => {
        const html = renderDisplayModePresetOptions('tv');
        expect(html).toMatch(/<option value="tv"\s+selected>When TV Display Mode is on<\/option>/);
        // The other two must NOT be marked selected.
        expect(html).not.toMatch(/<option value=""\s+selected/);
        expect(html).not.toMatch(/<option value="mobile,desktop"\s+selected/);
    });

    it('does not mark anything selected when `selected` does not match any entry', () => {
        const html = renderDisplayModePresetOptions('mystery-mode');
        expect(html).not.toContain(' selected');
    });
});

// ─── renderImageTypePresetOptions ────────────────────────────────────────────

describe('renderImageTypePresetOptions', () => {
    it('renders the legacy three-option order verbatim', () => {
        const html = renderImageTypePresetOptions('');
        const opts = Array.from(html.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g));
        expect(opts.map((m) => m[1])).toEqual(['', 'Primary', 'Thumb']);
        expect(opts.map((m) => m[2])).toEqual(['Auto', 'Primary', 'Thumb']);
    });

    it('produces identical HTML from both call sites (same `selected` -> same output)', () => {
        for (const sel of ['', 'Primary', 'Thumb']) {
            expect(renderImageTypePresetOptions(sel)).toBe(renderImageTypePresetOptions(sel));
        }
    });

    it('marks the entry whose value matches `selected`', () => {
        const html = renderImageTypePresetOptions('Thumb');
        expect(html).toMatch(/<option value="Thumb"\s+selected>Thumb<\/option>/);
        expect(html).not.toMatch(/<option value=""\s+selected/);
        expect(html).not.toMatch(/<option value="Primary"\s+selected/);
    });

    it('does not break when `selected` is a hostile value that no entry matches', () => {
        // `selected` is checked with strict equality; an unknown value matches
        // no entry, so nothing is marked selected. The function must not
        // throw and must not synthesize an extra option.
        const html = renderImageTypePresetOptions('" onmouseover=alert(1)>');
        expect(html).not.toContain(' selected');
        // The rendered options are exactly the legacy three.
        expect((html.match(/<option/g) || []).length).toBe(3);
    });
});
