/// <reference types="vitest" />
//
// Mirror test for `modules/filters/criteria.ts`.
//
// Each `it()` block here asserts that the TS module produces the same output
// as the legacy implementations for the inputs exercised by
// `src/__tests__/legacy/criterion.test.ts`. The expected outputs are read
// straight from the legacy Vitest snapshot file, not hard-coded — so this
// test fails fast if the TS module drifts from the captured legacy behavior.
//
// The vitest `.snap` format is plain CommonJS-ish JS:
//     exports[`test path 1`] = <value>;
// where `<value>` can be a raw literal, a JSON-wrapped template literal,
// or `null`/`undefined`. We load it via `new Function` (the same trick the
// legacy setup uses) to get real JS values, then normalize snapshot storage
// quirks (`JSON.parse` for object/array/string-encoded forms) before
// `toEqual`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
    parseCriterion,
    buildCriterion,
    migrateCommaSeparated,
    classifyCriterion,
    isViewerOnlyGroup,
    type Criterion,
} from './criteria';

const SNAP_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    '__tests__',
    'legacy',
    '__snapshots__',
    'criterion.test.ts.snap',
);

// Single-shot loader: the .snap file is written by Vitest and is well-formed
// JS. We evaluate it in a sandbox and capture the exports object.
const legacySnap: Record<string, unknown> = (() => {
    if (!fs.existsSync(SNAP_PATH)) {
        throw new Error(
            `Legacy criterion snapshot not found at ${SNAP_PATH}. ` +
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

/** Look up the `index`-th (1-based) snapshot value stored under `testPath`. */
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

/**
 * Undo the snapshot serialization so we can compare with a live TS value:
 *   - `null` / `undefined` / numbers / booleans pass through.
 *     (`typeof null === 'object'` so the string branch is naturally skipped.)
 *   - For strings we try, in order:
 *     1. Strict `JSON.parse`. Catches JSON-wrapped short strings (`""`,
 *        `"4K"`) and objects/arrays that happen to be valid JSON.
 *     2. Pre-escape raw newlines/CRs/tabs (Vitest writes multi-line strings
 *        with literal control characters that strict JSON rejects) and
 *        retry `JSON.parse`.
 *     3. Evaluate as a JS expression (Vitest also writes trailing commas in
 *        object literals, which strict JSON rejects but JS accepts since
 *        ES2017).
 *     4. Fall back to the raw string — covers values that already round-trip
 *        cleanly through `new Function` evaluation.
 */
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

    // eslint-disable-next-line no-new-func
    const evaluated = new Function(`return (${trimmed});`)() as unknown;
    if (evaluated !== undefined || trimmed === 'undefined') return evaluated;
    return value;
}

// ---------- data-driven mirror cases ----------

type Op = 'parse' | 'build' | 'migrate';

interface Case {
    /** Exact title of the legacy test (`<describe ><describe ><it>` path). */
    readonly title: string;
    readonly op: Op;
    /** Inputs to feed through the TS function, in order. */
    readonly inputs: ReadonlyArray<unknown>;
}

const CASES: ReadonlyArray<Case> = [
    // ---- parseCriterion ----
    {
        title: 'criterion helpers > parseCriterion > returns default shape for empty input',
        op: 'parse',
        inputs: [''],
    },
    {
        title: 'criterion helpers > parseCriterion > returns default shape for null input',
        op: 'parse',
        inputs: [null],
    },
    {
        title: 'criterion helpers > parseCriterion > parses a simple `Resolution:4K` form',
        op: 'parse',
        inputs: ['Resolution:4K'],
    },
    {
        title: 'criterion helpers > parseCriterion > parses a 3-part `prop:op:val` form',
        op: 'parse',
        inputs: ['Resolution:gte:1080p'],
    },
    {
        title: 'criterion helpers > parseCriterion > parses a 4-part `prop:userId:op:val` form',
        op: 'parse',
        inputs: ['Played:abc123:true:yes'],
    },
    {
        title: 'criterion helpers > parseCriterion > handles Collection:Name (colons preserved in name)',
        op: 'parse',
        inputs: ['Collection:Star Wars'],
    },
    {
        title: 'criterion helpers > parseCriterion > handles Playlist:Name (colons preserved in name)',
        op: 'parse',
        inputs: ['Playlist:My Mix:2026'],
    },
    {
        title: 'criterion helpers > parseCriterion > detects leading `!` as not-flag',
        op: 'parse',
        inputs: ['!Resolution:4K'],
    },
    {
        title: 'criterion helpers > parseCriterion > maps shorthand tokens via MI_CRITERION_MAP',
        op: 'parse',
        inputs: ['4K', 'HEVC', '7.1'],
    },
    // ---- buildCriterion ----
    {
        title: 'criterion helpers > buildCriterion > returns empty for empty prop',
        op: 'build',
        inputs: [['', '', '4K', '']],
    },
    {
        title: 'criterion helpers > buildCriterion > returns empty for empty val',
        op: 'build',
        inputs: [['Resolution', '', '', '']],
    },
    {
        title: 'criterion helpers > buildCriterion > builds `prop:val` when no op and no user',
        op: 'build',
        inputs: [['Resolution', '', '4K', '']],
    },
    {
        title: 'criterion helpers > buildCriterion > builds `prop:op:val` when op given',
        op: 'build',
        inputs: [['Resolution', 'gte', '1080p', '']],
    },
    {
        title: 'criterion helpers > buildCriterion > builds `prop:userId:op:val` when userId given',
        op: 'build',
        inputs: [['Played', 'true', 'yes', 'abc123']],
    },
    {
        title: 'criterion helpers > buildCriterion > maps back via MI_REVERSE_MAP when known',
        op: 'build',
        inputs: [
            ['Resolution', '', '4K', ''],
            ['VideoCodec', '', 'HEVC', ''],
        ],
    },
    // ---- migrateCommaSeparated ----
    {
        title: 'criterion helpers > migrateCommaSeparated > leaves newline-separated input untouched',
        op: 'migrate',
        inputs: ['a\nb\nc'],
    },
    {
        title: 'criterion helpers > migrateCommaSeparated > converts comma-separated to newline',
        op: 'migrate',
        inputs: ['a,b,c'],
    },
    {
        title: 'criterion helpers > migrateCommaSeparated > trims whitespace around items',
        op: 'migrate',
        inputs: ['a , b , c'],
    },
    {
        title: 'criterion helpers > migrateCommaSeparated > drops empty items',
        op: 'migrate',
        inputs: ['a,,b,'],
    },
    {
        title: 'criterion helpers > migrateCommaSeparated > returns empty for falsy input',
        op: 'migrate',
        inputs: ['', null],
    },
    {
        title: 'criterion helpers > migrateCommaSeparated > returns string unchanged when no separators at all',
        op: 'migrate',
        inputs: ['lonely'],
    },
    {
        title:
            'criterion helpers > migrateCommaSeparated > prefers newline over comma (no conversion when both present? actually NO — see code)',
        op: 'migrate',
        inputs: ['a\nb,c'],
    },
];

function apply(op: Op, input: unknown): unknown {
    switch (op) {
        case 'parse':
            return parseCriterion(input as string | null | undefined);
        case 'build':
            return buildCriterion(...(input as [string, string, string, string]));
        case 'migrate':
            return migrateCommaSeparated(input as string | null);
    }
}

describe('criterion helpers (mirror of legacy snapshots)', () => {
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

    // The asymmetry snapshot isn't a straight input → output case; it's
    // the rebuilt string after running `buildCriterion` on the result of
    // `parseCriterion('!Resolution:4K')`. The legacy contract deliberately
    // drops the `!` because `buildCriterion` has no `not` parameter.
    it('legacy asymmetry: buildCriterion strips the ! prefix', () => {
        const ASYM_PATH =
            'criterion helpers > parse + build round-trip > legacy asymmetry: buildCriterion strips the ! prefix';
        const parsed: Criterion = parseCriterion('!Resolution:4K');
        // Sanity-check the `not` flag survived the parse (the legacy test
        // also pins this); not part of the snapshot.
        expect(parsed.not).toBe(true);
        const rebuilt: string = buildCriterion(parsed.prop, parsed.op, parsed.val, parsed.userId);
        const expectedRaw = snapValue(ASYM_PATH, 0);
        const expected = normalize(expectedRaw);
        expect(rebuilt).toEqual(expected);
    });
});

// ---------- self-check: the mirror covers every snapshot ----------
//
// If the legacy test file gains a new snapshot, this list will diverge from
// `Object.keys(legacySnap)` and the test fails — forcing us to extend the
// `CASES` table. This is what keeps the mirror data-driven and complete.

const MIRRORED_PATHS: ReadonlySet<string> = new Set([
    ...CASES.map((c) => c.title),
    'criterion helpers > parse + build round-trip > legacy asymmetry: buildCriterion strips the ! prefix',
]);

describe('mirror coverage', () => {
    const mirroredIndices = new Map<string, number>();
    for (const c of CASES) mirroredIndices.set(c.title, c.inputs.length);
    mirroredIndices.set(
        'criterion helpers > parse + build round-trip > legacy asymmetry: buildCriterion strips the ! prefix',
        1,
    );

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

// ─── Criterion classification (mirror of CriterionCatalog) ─────────────────────

describe('classifyCriterion (mirror of CriterionCatalog.Classify)', () => {
    const CASES: ReadonlyArray<[string | null, string]> = [
        ['InProgress', 'viewer-scoped'],
        ['!InProgress', 'viewer-scoped'],
        ['IsPlayed:__current__:=:Watched', 'viewer-scoped'],
        ['IsPlayed:__current__:=:Unwatched', 'viewer-scoped'],
        ['IsPlayed:__any__:=:Unwatched', 'global-only'],
        ['IsPlayed:__all__:=:Unwatched', 'global-only'],
        ['MediaType:Series', 'static-queryable'],
        ['MediaType:Movie', 'static-queryable'],
        ['MediaType:Episode', 'static-queryable'],
        ['MediaType:EpisodeIncludeSeries', 'static-queryable'],
        ['!MediaType:Series', 'global-only'],
        ['Year:>=:1990', 'global-only'],
        ['4K', 'global-only'],
        ['Resolution:4K', 'global-only'],
        ['Collection:Star Wars', 'global-only'],
        ['', 'global-only'],
        [null, 'global-only'],
    ];

    for (const [raw, expected] of CASES) {
        it(`${JSON.stringify(raw)} → ${expected}`, () => {
            expect(classifyCriterion(raw as string | null)).toBe(expected);
        });
    }
});

describe('isViewerOnlyGroup (mirror of CriterionCatalog.IsViewerOnlyGroup)', () => {
    it('InProgress + MediaType:Series is a viewer-only group (regression)', () => {
        // MediaType:Series must NOT break viewer-only detection — that was
        // the production bug where the section fell back to the tag path.
        expect(isViewerOnlyGroup(['InProgress', 'MediaType:Series'])).toBe(true);
    });

    it('InProgress alone is a viewer-only group', () => {
        expect(isViewerOnlyGroup(['InProgress'])).toBe(true);
    });

    it('IsPlayed current-user + MediaType:Movie is a viewer-only group', () => {
        expect(isViewerOnlyGroup(['IsPlayed:__current__:=:Watched', 'MediaType:Movie'])).toBe(true);
    });

    it('mixed with a global-only criterion is not viewer-only', () => {
        expect(isViewerOnlyGroup(['InProgress', '4K'])).toBe(false);
    });

    it('static-only group is not viewer-only', () => {
        expect(isViewerOnlyGroup(['MediaType:Series'])).toBe(false);
    });

    it('empty group is not viewer-only', () => {
        expect(isViewerOnlyGroup([])).toBe(false);
        expect(isViewerOnlyGroup(null)).toBe(false);
    });
});
