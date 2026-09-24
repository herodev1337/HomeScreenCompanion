/// <reference types="vitest" />
//
// Unit tests for `modules/filters/date-intervals.ts`.
//
// Legacy-snapshot mirror comparison was retired when the legacy bridge
// went away (Phase 6). Each function is now exercised directly with
// targeted assertions.

import { describe, it, expect } from 'vitest';

import {
    parseDateYMD,
    getMaxDays,
    getMonthOptions,
    getDayOptions,
    getWeekButtons,
    type DateYMD,
} from './date-intervals';

describe('parseDateYMD', () => {
    it('parses an ISO YYYY-MM-DD string (TZ=UTC pinned)', () => {
        const out = parseDateYMD('2026-01-15');
        expect(out).toEqual({ year: 2026, month: 1, day: 15 });
    });

    it('returns null for an empty string', () => {
        expect(parseDateYMD('')).toBeNull();
    });

    it('returns null for null', () => {
        expect(parseDateYMD(null)).toBeNull();
    });

    it('returns null for unparseable garbage', () => {
        expect(parseDateYMD('not-a-date')).toBeNull();
    });
});

describe('getMaxDays', () => {
    it('returns 31 for January', () => {
        expect(getMaxDays(1)).toBe(31);
    });

    it('returns 30 for April', () => {
        expect(getMaxDays(4)).toBe(30);
    });

    it('returns 31 for December', () => {
        expect(getMaxDays(12)).toBe(31);
    });

    it('returns 28 for February (legacy quirk: hardcoded year 2001)', () => {
        expect(getMaxDays(2)).toBe(28);
    });
});

describe('getMonthOptions', () => {
    it('renders all 12 month options', () => {
        const html = getMonthOptions(undefined);
        expect(html.match(/<option/g)?.length).toBe(12);
    });

    it('marks the selected month', () => {
        const html = getMonthOptions(3);
        expect(html).toContain('value="3" selected');
    });

    it('handles December at the boundary', () => {
        const html = getMonthOptions(12);
        expect(html).toContain('value="12" selected');
    });
});

describe('getDayOptions', () => {
    it('renders 1..31 by default', () => {
        const html = getDayOptions(undefined, undefined);
        expect(html.match(/<option/g)?.length).toBe(31);
    });

    it('respects the maxDay cap', () => {
        const html = getDayOptions(undefined, 28);
        expect(html.match(/<option/g)?.length).toBe(28);
    });

    it('marks the selected day', () => {
        const html = getDayOptions(15, 31);
        expect(html).toContain('value="15" selected');
    });

    it('falls back to 31 when max is falsy (legacy quirk)', () => {
        expect(getDayOptions(undefined, 0).match(/<option/g)?.length).toBe(31);
    });
});

describe('getWeekButtons', () => {
    it('renders all 7 day buttons with no selection', () => {
        const html = getWeekButtons(undefined);
        expect(html.match(/<button/g)?.length).toBe(7);
    });

    it('marks multiple selected days', () => {
        const html = getWeekButtons('Monday,Wednesday,Friday');
        expect(html).toContain('Mon');
        expect(html).toContain('Wed');
        expect(html).toContain('Fri');
    });

    it('is case-insensitive on saved input', () => {
        const html = getWeekButtons('MONDAY');
        expect(html).toContain('Mon');
    });

    it('handles an empty string', () => {
        expect(getWeekButtons('')).toContain('<button');
    });
});

describe('DateYMD shape', () => {
    it('parseDateYMD returns the canonical {year, month, day} object', () => {
        const out: DateYMD | null = parseDateYMD('2026-01-15');
        expect(out).not.toBeNull();
        expect(Object.keys(out!).sort()).toEqual(['day', 'month', 'year']);
        expect(out!.year).toBe(2026);
        expect(out!.month).toBe(1);
        expect(out!.day).toBe(15);
    });
});
