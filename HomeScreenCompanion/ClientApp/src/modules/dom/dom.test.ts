/// <reference types="vitest" />
//
// Unit tests for `modules/dom/dom.ts`.
//
// Each helper has its own targeted assertions: legacy-fixture snapshot
// comparison was retired when the legacy bridge went away (Phase 6).

import { describe, it, expect } from 'vitest';

import {
    escapeHtml,
    escapeAttr,
    getDragAfterElement,
    getManDragAfterElement,
    getUrlRowHtml,
} from './dom';

// ---------------------------------------------------------------------------
// `escapeHtml`
// ---------------------------------------------------------------------------
//
// We avoid literal < > & " in the test expectations because the test file is
// loaded by Vitest which preserves the raw characters; instead we build the
// expected strings programmatically from helper functions so the assertions
// describe the actual behavior of the escape chain.

const AMP = ['a', 'm', 'p'].join('');
const LT = ['l', 't'].join('');
const GT = ['g', 't'].join('');
const QUOT = ['q', 'u', 'o', 't'].join('');

function amp(): string { return '&' + AMP + ';'; }
function lt(): string { return '&' + LT + ';'; }
function gt(): string { return '&' + GT + ';'; }
function quot(): string { return '&' + QUOT + ';'; }
function apos(): string { return '&#' + '39;'; }

describe('escapeHtml', () => {
    it('escapes ampersands', () => {
        expect(escapeHtml('Tom and Jerry')).toBe('Tom and Jerry');
        expect(escapeHtml('a & b')).toBe('a ' + amp() + ' b');
    });

    it('escapes less-than and greater-than', () => {
        expect(escapeHtml('<script>')).toBe(lt() + 'script' + gt());
    });

    it('escapes double quotes (used in attribute values)', () => {
        expect(escapeHtml('a "b" c')).toBe('a ' + quot() + 'b' + quot() + ' c');
    });

    it('intentionally does NOT escape single quotes (legacy quirk)', () => {
        expect(escapeHtml("a 'b' c")).toBe("a 'b' c");
    });

    it('coerces null to the literal string "null" (legacy quirk)', () => {
        expect(escapeHtml(null)).toBe('null');
    });

    it('coerces undefined to the literal string "undefined" (legacy quirk)', () => {
        expect(escapeHtml(undefined)).toBe('undefined');
    });

    it('coerces numbers to their string form', () => {
        expect(escapeHtml(42)).toBe('42');
    });

    it('escapes all four in a single pass', () => {
        expect(escapeHtml('&<>"\'')).toBe(amp() + lt() + gt() + quot() + '\'');
    });

});

// ---------------------------------------------------------------------------
// `escapeAttr`
// ---------------------------------------------------------------------------

describe('escapeAttr', () => {
    it('escapes the same characters as escapeHtml', () => {
        expect(escapeAttr('Tom and Jerry')).toBe('Tom and Jerry');
        expect(escapeAttr('a & b')).toBe('a ' + amp() + ' b');
        expect(escapeAttr('<script>')).toBe(lt() + 'script' + gt());
        expect(escapeAttr('a "b" c')).toBe('a ' + quot() + 'b' + quot() + ' c');
    });

    it('additionally escapes single quotes to &#39;', () => {
        expect(escapeAttr("a 'b' c")).toBe('a ' + apos() + 'b' + apos() + ' c');
    });

    it('escapes every special character in one pass', () => {
        expect(escapeAttr('&<>"\'')).toBe(amp() + lt() + gt() + quot() + apos());
    });

    it('neutralizes an attribute-breakout payload', () => {
        const escaped = escapeAttr('"><img src=x onerror=alert(1)>');
        expect(escaped).toContain(quot());
        expect(escaped).toContain(lt());
        // No raw tag opening and no raw quote-then-handler sequence — the
        // remaining `onerror=` text is inert (it lives inside the escaped
        // attribute value, with no unescaped quote to start an attribute).
        expect(escaped).not.toContain('<img');
        expect(escaped).not.toContain('" onerror=');
    });

    it('coerces null to the literal string "null" (legacy quirk)', () => {
        expect(escapeAttr(null)).toBe('null');
    });

    it('coerces undefined to the literal string "undefined" (legacy quirk)', () => {
        expect(escapeAttr(undefined)).toBe('undefined');
    });

    it('coerces numbers to their string form', () => {
        expect(escapeAttr(42)).toBe('42');
    });
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
        const c = makeContainer(3, 'tag-row');
        expect(getDragAfterElement(c, 10)).toBe(c.children[0]);
    });

    it('returns the second child when y is between the first and second midpoints', () => {
        const c = makeContainer(3, 'tag-row');
        expect(getDragAfterElement(c, 50)).toBe(c.children[1]);
    });

    it('returns null when y is below every midpoint (drop at end)', () => {
        const c = makeContainer(2, 'tag-row');
        expect(getDragAfterElement(c, 500)).toBeNull();
    });

    it('excludes children with the .dragging class', () => {
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
        const manRows = makeContainer(3, 'man-section-row').querySelectorAll('.man-section-row');
        expect(getManDragAfterElement(manRows[0]!.parentElement!, 50)).toBe(manRows[1]);
    });

    it('returns null when y is below every midpoint', () => {
        const c = makeContainer(2, 'man-section-row');
        expect(getManDragAfterElement(c, 500)).toBeNull();
    });

    it('excludes children with the .man-dragging class', () => {
        const c = makeContainer(3, 'man-section-row', new Set([1]));
        expect(getManDragAfterElement(c, 50)).toBe(c.children[2]);
    });
});

describe('getUrlRowHtml', () => {
    it('renders an empty row when value/limit are empty defaults', () => {
        const html = getUrlRowHtml('', 0);
        expect(html).toContain('class="url-row"');
        expect(html).toContain('value=""');
    });

    it('escapes the URL text into the value attribute (no attribute breakout)', () => {
        const html = getUrlRowHtml('https://x.com/?a=<script>', 5);
        expect(html).toContain('https://x.com/?a=' + lt() + 'script' + gt());
        expect(html).not.toContain('<script>');
    });

    it('escapes quotes and ampersands in the URL value', () => {
        const html = getUrlRowHtml('https://x.com/?q="a&b"', 0);
        expect(html).toContain('value="https://x.com/?q=' + quot() + 'a' + amp() + 'b' + quot() + '"');
    });

    it('defaults limit to 0 only when undefined; honors explicit 0', () => {
        expect(getUrlRowHtml('x', undefined)).toContain('value="0"');
        expect(getUrlRowHtml('x', 0)).toContain('value="0"');
        expect(getUrlRowHtml('x', 7)).toContain('value="7"');
    });

    it('coerces a null value to empty string', () => {
        expect(getUrlRowHtml(null, 0)).toContain('value=""');
    });
});
