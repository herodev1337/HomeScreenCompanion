/// <reference types="vitest" />
//
// Mirror test for `modules/filters/date-intervals.ts`.
//
// Reads the legacy snapshots in
//     `src/__tests__/legacy/__snapshots__/date-helpers.test.ts.snap`
// (loaded the same way as `criteria.test.ts` does) and asserts that the
// TS module reproduces the same outputs for the same inputs. Snapshot
// storage quirks (`JSON.parse` for object/array/string-encoded forms)
// are normalized before `toEqual`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
    parseDateYMD,
    getMaxDays,
    getMonthOptions,
    getDayOptions,
    getWeekButtons,
    type DateYMD,
} from './date-intervals';

const SNAP_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    '__tests__',
    'legacy',
    '__snapshots__',
    'date-helpers.test.ts.snap',
);

const legacySnap: Record<string, unknown> = (() => {
    if (!fs.existsSync(SNAP_PATH)) {
        throw new Error(
            `Legacy date-helpers snapshot not found at ${SNAP_PATH}. ` +
            `Run \`npm run test:legacy\` (or \`npm run build:legacy\`) once to generate it.`,
        );
    }
    const src = fs.readFileSync(SNAP_PATH, 'utf8');
    const exportsObj: Record<string, unknown> = {};
    const moduleObj = { exports: exportsObj };
    // eslint-disable-next-line no-new-func
    new Function('exports', 'module', src)(exportsObj, moduleObj);
    return moduleObj.exports as Record<string, unknown>;
})();

function snapValue(testPath: string, index: number): unknown {
    const v = legacySnap[`${testPath} ${index + 1}`];
    if (v === undefined) {
        throw new Error(
            `Missing legacy snapshot: "${testPath} #${index + 1}". ` +
            `Available keys: ${Object.keys(legacySnap).join(', ')}`,
        );
    }
    return v;
}

/** Same normalization rules as `criteria.test.ts`. */
function normalize(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed === 'undefined') return undefined;

    const tryParse = (s: string): unknown => {
        try {
            return JSON.parse(s);
        } catch {
            return undefined;
        }
    };

    const escaped = trimmed
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');

    const fromStrict = tryParse(trimmed);
    if (fromStrict !== undefined) return fromStrict;

    const fromEscaped = tryParse(escaped);
    if (fromEscaped !== undefined) return fromEscaped;

    // Snapshot values that are JSON-encoded strings containing
    // *unescaped* `"` (typical for the HTML markup written by the date
    // helpers — `<option value="1">1</option>`). `JSON.parse` rejects
    // these because the inner `"`s are not escaped. Strip the outer
    // `"..."` wrapper to recover the raw string content.
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
    }

    // Last resort: try as a JS expression (criterion's `"a\nb"`-style
    // values fall through here when neither JSON parse nor stripping
    // matches, and the function tries the JS eval path).
    // eslint-disable-next-line no-new-func
    const evaluated = new Function(`return (${trimmed});`)() as unknown;
    if (evaluated !== undefined || trimmed === 'undefined') return evaluated;
    return value;
}

type Op = 'parseDateYMD' | 'getMaxDays' | 'getMonthOptions' | 'getDayOptions' | 'getWeekButtons';

interface Case {
    readonly title: string;
    readonly op: Op;
    readonly inputs: ReadonlyArray<unknown>;
}

const CASES: ReadonlyArray<Case> = [
    // ---- parseDateYMD ----
    {
        title: 'date helpers > parseDateYMD > parses ISO YYYY-MM-DD',
        op: 'parseDateYMD',
        inputs: ['2026-01-15'],
    },
    {
        title: 'date helpers > parseDateYMD > parses ISO with time suffix',
        op: 'parseDateYMD',
        inputs: ['2026-01-15T08:00:00Z'],
    },
    {
        title: 'date helpers > parseDateYMD > parses ISO with timezone offset',
        op: 'parseDateYMD',
        inputs: ['2026-12-31T23:59:59+02:00'],
    },
    {
        title: 'date helpers > parseDateYMD > falls back to Date parsing for non-ISO',
        op: 'parseDateYMD',
        inputs: ['15 Jan 2026'],
    },
    {
        title: 'date helpers > parseDateYMD > returns null for empty input',
        op: 'parseDateYMD',
        inputs: [''],
    },
    {
        title: 'date helpers > parseDateYMD > returns null for null input',
        op: 'parseDateYMD',
        inputs: [null],
    },
    {
        title: 'date helpers > parseDateYMD > returns null for unparseable garbage',
        op: 'parseDateYMD',
        inputs: ['not-a-date'],
    },
    // ---- getMaxDays ----
    // Snapshot covers months 1,2,3,4,6,9,11,12 (the legacy test's
    // `it.each`) plus a separate "handles February (28 in non-leap)" pin.
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=1',
        op: 'getMaxDays',
        inputs: [1],
    },
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=2',
        op: 'getMaxDays',
        inputs: [2],
    },
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=3',
        op: 'getMaxDays',
        inputs: [3],
    },
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=4',
        op: 'getMaxDays',
        inputs: [4],
    },
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=6',
        op: 'getMaxDays',
        inputs: [6],
    },
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=9',
        op: 'getMaxDays',
        inputs: [9],
    },
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=11',
        op: 'getMaxDays',
        inputs: [11],
    },
    {
        title: 'date helpers > getMaxDays > returns days-in-month for month=12',
        op: 'getMaxDays',
        inputs: [12],
    },
    {
        title: 'date helpers > getMaxDays > handles February (28 in non-leap)',
        op: 'getMaxDays',
        inputs: [2],
    },
    // ---- getMonthOptions ----
    {
        title: 'date helpers > getMonthOptions > renders all 12 months with no selection',
        op: 'getMonthOptions',
        inputs: [undefined],
    },
    {
        title: 'date helpers > getMonthOptions > marks the selected month',
        op: 'getMonthOptions',
        inputs: [3],
    },
    {
        title: 'date helpers > getMonthOptions > handles December (boundary)',
        op: 'getMonthOptions',
        inputs: [12],
    },
    // ---- getDayOptions ----
    {
        title: 'date helpers > getDayOptions > renders 1..31 by default',
        op: 'getDayOptions',
        inputs: [[undefined, undefined]],
    },
    {
        title: 'date helpers > getDayOptions > respects maxDay cap',
        op: 'getDayOptions',
        inputs: [[undefined, 28]],
    },
    {
        title: 'date helpers > getDayOptions > marks the selected day',
        op: 'getDayOptions',
        inputs: [[15, 31]],
    },
    // ---- getWeekButtons ----
    {
        title: 'date helpers > getWeekButtons > renders all 7 day buttons with no selection',
        op: 'getWeekButtons',
        inputs: [undefined],
    },
    {
        title: 'date helpers > getWeekButtons > marks multiple selected days',
        op: 'getWeekButtons',
        inputs: ['Monday,Wednesday,Friday'],
    },
    {
        title: 'date helpers > getWeekButtons > is case-insensitive on saved input',
        op: 'getWeekButtons',
        inputs: ['MONDAY'],
    },
    {
        title: 'date helpers > getWeekButtons > handles empty string',
        op: 'getWeekButtons',
        inputs: [''],
    },
];

function apply(op: Op, input: unknown): unknown {
    switch (op) {
        case 'parseDateYMD':
            return parseDateYMD(input as string | null | undefined);
        case 'getMaxDays':
            return getMaxDays(input as number);
        case 'getMonthOptions':
            return getMonthOptions(input as number | undefined);
        case 'getDayOptions':
            return getDayOptions(...(input as [number | undefined, number | undefined]));
        case 'getWeekButtons':
            return getWeekButtons(input as string | null | undefined);
    }
}

describe('date helpers (mirror of legacy snapshots)', () => {
    for (const c of CASES) {
        describe(c.title, () => {
            c.inputs.forEach((input, i) => {
                it(`matches legacy snapshot #${i + 1}`, () => {
                    const expectedRaw = snapValue(c.title, i);
                    const expected = normalize(expectedRaw);
                    const actual = apply(c.op, input);
                    expect(actual).toEqual(expected);
                });
            });
        });
    }
});

// ---- coverage guard: every legacy snapshot key is mirrored, every mirror
// case has a matching legacy snapshot key. This is what keeps the mirror
// data-driven and complete when the legacy test file gains new snapshots.

const MIRRORED_PATHS: ReadonlySet<string> = new Set(CASES.map((c) => c.title));

describe('mirror coverage', () => {
    const mirroredIndices = new Map<string, number>();
    for (const c of CASES) mirroredIndices.set(c.title, c.inputs.length);

    it('every legacy snapshot key has a mirror case', () => {
        const missing: string[] = [];
        for (const key of Object.keys(legacySnap)) {
            const m = key.match(/^(.*) (\d+)$/);
            if (!m) continue;
            const path = m[1]!;
            const idx = Number(m[2]);
            if (!MIRRORED_PATHS.has(path)) {
                missing.push(path);
                continue;
            }
            const expectedCount = mirroredIndices.get(path) ?? 0;
            if (idx > expectedCount) {
                missing.push(`${path} #${idx} (only ${expectedCount} mirrored)`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('every mirror case has a matching legacy snapshot key', () => {
        const indexed = new Map<string, Set<number>>();
        for (const key of Object.keys(legacySnap)) {
            const m = key.match(/^(.*) (\d+)$/);
            if (!m) continue;
            const path = m[1]!;
            const idx = Number(m[2]);
            if (!indexed.has(path)) indexed.set(path, new Set());
            indexed.get(path)!.add(idx);
        }
        const orphans: string[] = [];
        for (const path of MIRRORED_PATHS) {
            const have = indexed.get(path);
            if (!have) {
                orphans.push(`${path} (no legacy snapshot at all)`);
                continue;
            }
            const expectedCount = mirroredIndices.get(path) ?? 0;
            for (let i = 1; i <= expectedCount; i++) {
                if (!have.has(i)) orphans.push(`${path} #${i}`);
            }
        }
        expect(orphans).toEqual([]);
    });
});

// ---- one non-snapshot property check ----
//
// `DateYMD` is `Readonly<...>` in the type but we don't have a legacy
// snapshot for it; sanity-check the shape the TS module exposes so a
// future refactor that changes the field set trips this test.

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
