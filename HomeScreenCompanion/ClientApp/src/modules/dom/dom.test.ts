/// <reference types="vitest" />
//
// Mirror + unit tests for `modules/dom/dom.ts`.
//
// The legacy suite only has snapshots for `escapeHtml`. The two drag
// helpers and `getUrlRowHtml` have no legacy snapshots — they are unit-
// tested here with happy-dom and stubbed `getBoundingClientRect()`s.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
    escapeHtml,
    getDragAfterElement,
    getManDragAfterElement,
    getUrlRowHtml,
} from './dom';

// ---------------------------------------------------------------------------
// Snapshot loader (same pattern as criteria.test.ts / date-intervals.test.ts)
// ---------------------------------------------------------------------------

const SNAP_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    '__tests__',
    'legacy',
    '__snapshots__',
    'html-helpers.test.ts.snap',
);

const legacySnap: Record<string, unknown> = (() => {
    if (!fs.existsSync(SNAP_PATH)) {
        throw new Error(
            `Legacy html-helpers snapshot not found at ${SNAP_PATH}. ` +
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

// ---------------------------------------------------------------------------
// Mirror tests for `escapeHtml`
// ---------------------------------------------------------------------------

type Op = 'escapeHtml';

interface Case {
    readonly title: string;
    readonly op: Op;
    readonly inputs: ReadonlyArray<unknown>;
}

const ESCAPE_CASES: ReadonlyArray<Case> = [
    {
        title: 'html helpers > escapeHtml > escapes ampersands',
        op: 'escapeHtml',
        inputs: ['Tom & Jerry'],
    },
    {
        title: 'html helpers > escapeHtml > escapes less-than and greater-than',
        op: 'escapeHtml',
        inputs: ['<script>alert(1)</script>'],
    },
    {
        title: 'html helpers > escapeHtml > escapes double quotes',
        op: 'escapeHtml',
        inputs: ['he said "hi"'],
    },
    {
        title: 'html helpers > escapeHtml > does NOT escape single quotes (legacy behavior, pinned)',
        op: 'escapeHtml',
        inputs: ["it's fine"],
    },
    // The legacy test makes three assertions inside one `it` block:
    //   escapeHtml(42), escapeHtml(null), escapeHtml(undefined)
    // They are stored as three separate snapshot keys (`... 1/2/3`).
    {
        title: 'html helpers > escapeHtml > coerces non-string input',
        op: 'escapeHtml',
        inputs: [42, null, undefined],
    },
    {
        title: 'html helpers > escapeHtml > returns empty string for empty input',
        op: 'escapeHtml',
        inputs: [''],
    },
    {
        title: 'html helpers > escapeHtml > escapes ampersand before other entities (order matters)',
        op: 'escapeHtml',
        inputs: ['&lt;'],
    },
];

describe('escapeHtml (mirror of legacy snapshots)', () => {
    for (const c of ESCAPE_CASES) {
        describe(c.title, () => {
            c.inputs.forEach((input, i) => {
                it(`matches legacy snapshot #${i + 1}`, () => {
                    const expectedRaw = snapValue(c.title, i);
                    const expected = normalize(expectedRaw);
                    const actual = escapeHtml(input);
                    expect(actual).toEqual(expected);
                });
            });
        });
    }
});

// ---------------------------------------------------------------------------
// DOM-touching unit tests for `getDragAfterElement` and `getManDragAfterElement`
// ---------------------------------------------------------------------------

/**
 * Build a container with N children, each child getting a stubbed
 * `getBoundingClientRect()` that places it at `top = idx * 50`,
 * `height = 40`. The default selector argument picks which child
 * class is applied (`.tag-row` vs `.man-section-row`); `.dragging`
 * is applied separately per-case.
 *
 * happy-dom's default rect is all-zero, which would make every child
 * "match" at the same offset; stubbing is required.
 */
function makeContainer(
    count: number,
    baseClass: 'tag-row' | 'man-section-row',
    draggingIndices: ReadonlySet<number> = new Set(),
): HTMLElement {
    const container = document.createElement('div');
    for (let i = 0; i < count; i++) {
        const child = document.createElement('div');
        child.classList.add(baseClass);
        if (draggingIndices.has(i)) {
            child.classList.add(baseClass === 'tag-row' ? 'dragging' : 'man-dragging');
        }
        // Top: i*50, height: 40, so vertical midpoint is i*50 + 20.
        const top = i * 50;
        const height = 40;
        const rect = {
            top, bottom: top + height, left: 0, right: 0, width: 0, height,
            x: 0, y: top,
        } as DOMRect;
        Object.defineProperty(child, 'getBoundingClientRect', { value: () => rect });
        container.appendChild(child);
    }
    return container;
}

describe('getDragAfterElement', () => {
    it('returns null for an empty container', () => {
        const container = document.createElement('div');
        expect(getDragAfterElement(container, 100)).toBeNull();
    });

    it('returns the first child when y is above the first midpoint', () => {
        // midpoints are 20, 70, 120. y=10 → above first midpoint → first child.
        const c = makeContainer(3, 'tag-row');
        expect(getDragAfterElement(c, 10)).toBe(c.children[0]);
    });

    it('returns the second child when y is between the first and second midpoints', () => {
        // y=50 → between 20 and 70 → second child wins (offset -20 > offset -60).
        const c = makeContainer(3, 'tag-row');
        expect(getDragAfterElement(c, 50)).toBe(c.children[1]);
    });

    it('returns null when y is below every midpoint (drop at end)', () => {
        // y=500 → offset is positive for every child → none qualifies.
        const c = makeContainer(3, 'tag-row');
        expect(getDragAfterElement(c, 500)).toBeNull();
    });

    it('excludes children with the .dragging class', () => {
        // Skip the second row; y=50 should now return the third row
        // (offset = -70, vs. first row offset = -10... wait, the first
        // row's midpoint is 20, so y=50 - 20 = 30, which is positive,
        // and the third row's midpoint is 120, so y=50 - 120 = -70,
        // negative. So the third row is the only candidate.)
        const c = makeContainer(3, 'tag-row', new Set([1]));
        expect(getDragAfterElement(c, 50)).toBe(c.children[2]);
    });
});

describe('getManDragAfterElement', () => {
    it('returns null for an empty container', () => {
        const container = document.createElement('div');
        expect(getManDragAfterElement(container, 100)).toBeNull();
    });

    it('finds a child by .man-section-row class', () => {
        // Mixed-class container: only the .man-section-row children
        // should be considered.
        const container = document.createElement('div');
        for (let i = 0; i < 3; i++) {
            const a = document.createElement('div');
            a.classList.add('tag-row'); // ignored
            const b = document.createElement('div');
            b.classList.add('man-section-row');
            const top = i * 50;
            const height = 40;
            const rect = { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top } as DOMRect;
            Object.defineProperty(a, 'getBoundingClientRect', { value: () => rect });
            Object.defineProperty(b, 'getBoundingClientRect', { value: () => rect });
            container.appendChild(a);
            container.appendChild(b);
        }
        // midpoints of man-section-rows: 20, 70, 120. y=50 → second row
        // wins (offset -20, the closest-to-zero negative) over third row
        // (offset -70). The first row's offset is +30 (positive, ignored).
        const manRows = container.querySelectorAll('.man-section-row');
        expect(getManDragAfterElement(container, 50)).toBe(manRows[1]);
    });

    it('returns null when y is below every midpoint', () => {
        const c = makeContainer(2, 'man-section-row');
        expect(getManDragAfterElement(c, 500)).toBeNull();
    });

    it('excludes children with the .man-dragging class', () => {
        const c = makeContainer(3, 'man-section-row', new Set([1]));
        // Same geometry as the .dragging test above.
        expect(getManDragAfterElement(c, 50)).toBe(c.children[2]);
    });
});

// ---------------------------------------------------------------------------
// Unit tests for `getUrlRowHtml` (no legacy snapshots — pure HTML builder)
// ---------------------------------------------------------------------------

describe('getUrlRowHtml', () => {
    it('renders an empty row when value/limit are empty defaults', () => {
        const html = getUrlRowHtml('', 0);
        // Two `value=""` attributes (URL text + numeric Max) and a
        // visible row chrome. We spot-check a few invariants rather
        // than snapshot the whole HTML, because the legacy markup has
        // no captured snapshot and exact whitespace isn't part of the
        // contract. The button classes are `class="raised button-submit
        // btnTestUrl"` and `class="raised btnRemoveUrl btn-row-remove"`,
        // so we substring on a space-prefixed token rather than the full
        // attribute string.
        expect(html).toContain('class="url-row"');
        expect(html).toContain('class="txtTagUrl"');
        expect(html).toContain('class="txtUrlLimit"');
        expect(html).toContain(' btnTestUrl"');
        expect(html).toContain('class="raised btnRemoveUrl btn-row-remove"');
        expect(html).toMatch(/value=""/);              // empty URL input
        expect(html).toMatch(/value="0"/);             // explicit limit
        expect(html).toContain('label="Trakt/MDBList/TMDb URL"');
        expect(html).toContain('label="Max (0=All)"');
    });

    it('renders the URL text verbatim (legacy does NOT escape)', () => {
        // The legacy function embeds `value` un-escaped into a
        // `value="..."` attribute. We preserve that behavior — the
        // `txtTagUrl` is a plain text input and the caller is trusted.
        // If you ever pass untrusted data, wrap with `escapeHtml`.
        const html = getUrlRowHtml('https://example.com/path', 25);
        expect(html).toContain('value="https://example.com/path"');
        expect(html).toContain('value="25"');
    });

    it('defaults limit to 0 only when undefined; honors explicit 0', () => {
        expect(getUrlRowHtml('x', undefined)).toContain('value="0"');
        expect(getUrlRowHtml('x', 0)).toContain('value="0"');
        expect(getUrlRowHtml('x', 5)).toContain('value="5"');
    });

    it('coerces a null value to empty string', () => {
        // `value || ''` — null/undefined both fall through to ''.
        const html = getUrlRowHtml(null, 1);
        expect(html).toMatch(/<input[^>]*class="txtTagUrl"[^>]*value=""/);
        expect(html).toContain('value="1"');
    });
});

// ---------------------------------------------------------------------------
// Coverage guard for `escapeHtml` mirror snapshots
// ---------------------------------------------------------------------------

const MIRRORED_PATHS: ReadonlySet<string> = new Set(ESCAPE_CASES.map((c) => c.title));

describe('escapeHtml mirror coverage', () => {
    const mirroredIndices = new Map<string, number>();
    for (const c of ESCAPE_CASES) mirroredIndices.set(c.title, c.inputs.length);

    it('every legacy escapeHtml snapshot key has a mirror case', () => {
        const missing: string[] = [];
        for (const key of Object.keys(legacySnap)) {
            if (!key.startsWith('html helpers > escapeHtml >')) continue;
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
});
