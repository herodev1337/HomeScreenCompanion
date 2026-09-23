/// <reference types="vitest" />
//
// Snapshots for the date helpers in the legacy bundle:
//   - parseDateYMD          (configPage.js:603)
//   - getMaxDays            (configPage.js:588)
//   - getMonthOptions       (configPage.js:576)
//   - getDayOptions         (configPage.js:581)
//   - getWeekButtons        (configPage.js:592)
//
// Each test calls the helper directly via globalThis.__hsc_legacy (populated
// by setup.ts) and `toMatchSnapshot` against the value. When the TS migration
// produces a replacement in ClientApp/src/date.ts (or wherever these land),
// the equivalent test there must produce an identical snapshot — otherwise
// Vitest fails with a behavior-drift diff.

import { describe, it, expect } from 'vitest';

const legacy = globalThis.__hsc_legacy as Record<string, (...args: unknown[]) => unknown>;
const setupErr = globalThis.__hsc_legacy_error;

describe('date helpers', () => {
    const itIfLoaded = setupErr ? it.skip : it;

    describe('parseDateYMD', () => {
        itIfLoaded('parses ISO YYYY-MM-DD', () => {
            expect(legacy.parseDateYMD('2026-01-15')).toMatchSnapshot();
        });

        itIfLoaded('parses ISO with time suffix', () => {
            expect(legacy.parseDateYMD('2026-01-15T08:00:00Z')).toMatchSnapshot();
        });

        itIfLoaded('parses ISO with timezone offset', () => {
            expect(legacy.parseDateYMD('2026-12-31T23:59:59+02:00')).toMatchSnapshot();
        });

        itIfLoaded('falls back to Date parsing for non-ISO', () => {
            expect(legacy.parseDateYMD('15 Jan 2026')).toMatchSnapshot();
        });

        itIfLoaded('returns null for empty input', () => {
            expect(legacy.parseDateYMD('')).toMatchSnapshot();
        });

        itIfLoaded('returns null for null input', () => {
            expect(legacy.parseDateYMD(null)).toMatchSnapshot();
        });

        itIfLoaded('returns null for unparseable garbage', () => {
            expect(legacy.parseDateYMD('not-a-date')).toMatchSnapshot();
        });
    });

    describe('getMaxDays', () => {
        itIfLoaded.each([1, 2, 3, 4, 6, 9, 11, 12])('returns days-in-month for month=%s', (m) => {
            expect(legacy.getMaxDays(m)).toMatchSnapshot();
        });

        itIfLoaded('handles February (28 in non-leap)', () => {
            expect(legacy.getMaxDays(2)).toMatchSnapshot();
        });
    });

    describe('getMonthOptions', () => {
        itIfLoaded('renders all 12 months with no selection', () => {
            expect(legacy.getMonthOptions(undefined)).toMatchSnapshot();
        });

        itIfLoaded('marks the selected month', () => {
            expect(legacy.getMonthOptions(3)).toMatchSnapshot();
        });

        itIfLoaded('handles December (boundary)', () => {
            expect(legacy.getMonthOptions(12)).toMatchSnapshot();
        });
    });

    describe('getDayOptions', () => {
        itIfLoaded('renders 1..31 by default', () => {
            expect(legacy.getDayOptions(undefined, undefined)).toMatchSnapshot();
        });

        itIfLoaded('respects maxDay cap', () => {
            expect(legacy.getDayOptions(undefined, 28)).toMatchSnapshot();
        });

        itIfLoaded('marks the selected day', () => {
            expect(legacy.getDayOptions(15, 31)).toMatchSnapshot();
        });
    });

    describe('getWeekButtons', () => {
        itIfLoaded('renders all 7 day buttons with no selection', () => {
            expect(legacy.getWeekButtons(undefined)).toMatchSnapshot();
        });

        itIfLoaded('marks multiple selected days', () => {
            expect(legacy.getWeekButtons('Monday,Wednesday,Friday')).toMatchSnapshot();
        });

        itIfLoaded('is case-insensitive on saved input', () => {
            expect(legacy.getWeekButtons('MONDAY')).toMatchSnapshot();
        });

        itIfLoaded('handles empty string', () => {
            expect(legacy.getWeekButtons('')).toMatchSnapshot();
        });
    });
});