/// <reference types="vitest" />
//
// Wrapper test for the legacy fixture harness.
// Verifies that the setup in setup.ts actually populated globalThis.__hsc_legacy
// with the expected helpers. If the bundle failed to load, every snapshot test
// in this directory is skipped with a clear "run npm run build:legacy" message
// (see snapshot files — each calls `it.runIf(...)`).

import { describe, it, expect } from 'vitest';

const REQUIRED = [
    'parseDateYMD',
    'getMaxDays',
    'getMonthOptions',
    'getDayOptions',
    'getWeekButtons',
    'migrateCommaSeparated',
    'parseCriterion',
    'buildCriterion',
    'escapeHtml',
    'isScheduleCurrentlyActive',
    'getSourceBadgeHtml',
];

describe('legacy fixture harness', () => {
    it('has no setup error', () => {
        const err = globalThis.__hsc_legacy_error as unknown;
        if (err) {
            throw err instanceof Error
                ? err
                : new Error('Legacy setup error: ' + String(err));
        }
    });

    it('exposes globalThis.__hsc_legacy', () => {
        const legacy = globalThis.__hsc_legacy;
        expect(legacy).toBeDefined();
        expect(typeof legacy).toBe('object');
    });

    it('contains at least 8 pure helpers', () => {
        const legacy = globalThis.__hsc_legacy ?? {};
        const names = Object.keys(legacy);
        expect(names.length).toBeGreaterThanOrEqual(8);
        // Each must be a function (or at least callable) for snapshot testing.
        for (const name of names) {
            expect(typeof (legacy as Record<string, unknown>)[name]).toBe('function');
        }
    });

    it.each(REQUIRED)('exports helper %s', (name) => {
        const legacy = globalThis.__hsc_legacy ?? {};
        expect(typeof (legacy as Record<string, unknown>)[name]).toBe('function');
    });

    it('snapshot tests did not crash during setup', () => {
        // Smoke check: pull one entry from each kind of helper and verify it
        // runs without throwing. If setup itself failed, this is skipped via
        // the explicit error throw above.
        const legacy = globalThis.__hsc_legacy as Record<string, (...args: unknown[]) => unknown>;
        expect(() => legacy.escapeHtml('hello & <world>')).not.toThrow();
        expect(() => legacy.getMaxDays(2)).not.toThrow();
        expect(() => legacy.parseDateYMD('2026-01-15')).not.toThrow();
    });
});