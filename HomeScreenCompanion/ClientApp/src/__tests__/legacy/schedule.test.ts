/// <reference types="vitest" />
//
// Snapshots for isScheduleCurrentlyActive (configPage.js:1302).
//
// This helper uses `new Date()` internally, so the result depends on the
// current wall clock. We freeze the system time with vi.setSystemTime so
// snapshots are deterministic. The tests cover several `intervals` shapes
// (SpecificDate, EveryYear, Weekly) across multiple fake "now" timestamps.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const legacy = globalThis.__hsc_legacy as Record<string, (...args: unknown[]) => unknown>;
const setupErr = globalThis.__hsc_legacy_error;

const isScheduleCurrentlyActive = (intervals: unknown) =>
    legacy.isScheduleCurrentlyActive(intervals);

describe('isScheduleCurrentlyActive', () => {
    const itIfLoaded = setupErr ? it.skip : it;

    beforeEach(() => {
        // Pin to a known Wednesday so we can pick both weekday and weekend
        // intervals in the same test run. Date.UTC(2026, 0, 7) = Wed Jan 7.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-07T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    itIfLoaded('returns false for empty intervals', () => {
        expect(isScheduleCurrentlyActive([])).toMatchSnapshot();
    });

    itIfLoaded('returns false for null input', () => {
        expect(isScheduleCurrentlyActive(null)).toMatchSnapshot();
    });

    itIfLoaded('returns true when Weekly interval includes today (Wednesday)', () => {
        expect(
            isScheduleCurrentlyActive([{ Type: 'Weekly', DayOfWeek: 'Monday,Wednesday,Friday' }])
        ).toMatchSnapshot();
    });

    itIfLoaded('returns false when Weekly interval excludes today', () => {
        expect(
            isScheduleCurrentlyActive([{ Type: 'Weekly', DayOfWeek: 'Saturday,Sunday' }])
        ).toMatchSnapshot();
    });

    itIfLoaded('returns true when SpecificDate interval contains now', () => {
        expect(
            isScheduleCurrentlyActive([
                { Type: 'SpecificDate', Start: '2026-01-01T00:00:00Z', End: '2026-01-31T23:59:59Z' },
            ])
        ).toMatchSnapshot();
    });

    itIfLoaded('returns false when SpecificDate interval is in the future', () => {
        expect(
            isScheduleCurrentlyActive([
                { Type: 'SpecificDate', Start: '2026-06-01T00:00:00Z', End: '2026-06-30T23:59:59Z' },
            ])
        ).toMatchSnapshot();
    });

    itIfLoaded('returns false when SpecificDate interval is in the past', () => {
        expect(
            isScheduleCurrentlyActive([
                { Type: 'SpecificDate', Start: '2025-01-01T00:00:00Z', End: '2025-12-31T23:59:59Z' },
            ])
        ).toMatchSnapshot();
    });

    itIfLoaded('uses .some() — one matching interval is enough', () => {
        expect(
            isScheduleCurrentlyActive([
                { Type: 'Weekly', DayOfWeek: 'Saturday' },
                { Type: 'Weekly', DayOfWeek: 'Wednesday' },
            ])
        ).toMatchSnapshot();
    });

    itIfLoaded('EveryYear: returns true when current month/day is in range', () => {
        // Pinned to Jan 7 (Wed): span Dec 28 -> Jan 14 should include it.
        expect(
            isScheduleCurrentlyActive([
                { Type: 'EveryYear', Start: '2025-12-28T00:00:00Z', End: '2026-01-14T00:00:00Z' },
            ])
        ).toMatchSnapshot();
    });

    itIfLoaded('EveryYear: returns false when current month/day is outside range', () => {
        // Pinned to Jan 7: span Feb 1 -> Feb 28 should NOT include it.
        expect(
            isScheduleCurrentlyActive([
                { Type: 'EveryYear', Start: '2026-02-01T00:00:00Z', End: '2026-02-28T00:00:00Z' },
            ])
        ).toMatchSnapshot();
    });
});