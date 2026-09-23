/// <reference types="vitest" />
//
// Snapshots for the small HTML helpers in the legacy bundle:
//   - escapeHtml              (configPage.js:1218)
//   - getSourceBadgeHtml      (configPage.js:1350)
//
// Both are pure string builders — they touch happy-dom only insofar as
// happy-dom is the test environment, but neither function reads from
// document/window. (getSourceBadgeHtml returns a literal string.)

import { describe, it, expect } from 'vitest';

const legacy = globalThis.__hsc_legacy as Record<string, (...args: unknown[]) => unknown>;
const setupErr = globalThis.__hsc_legacy_error;

describe('html helpers', () => {
    const itIfLoaded = setupErr ? it.skip : it;

    describe('escapeHtml', () => {
        itIfLoaded('escapes ampersands', () => {
            expect(legacy.escapeHtml('Tom & Jerry')).toMatchSnapshot();
        });

        itIfLoaded('escapes less-than and greater-than', () => {
            expect(legacy.escapeHtml('<script>alert(1)</script>')).toMatchSnapshot();
        });

        itIfLoaded('escapes double quotes', () => {
            expect(legacy.escapeHtml('he said "hi"')).toMatchSnapshot();
        });

        itIfLoaded('does NOT escape single quotes (legacy behavior, pinned)', () => {
            // The legacy implementation only replaces &, <, >, ". Single quotes
            // pass through. This snapshot pins that behavior so a future
            // "improvement" adding `'` -> `&#39;` is caught as drift.
            expect(legacy.escapeHtml("it's fine")).toMatchSnapshot();
        });

        itIfLoaded('coerces non-string input', () => {
            expect(legacy.escapeHtml(42)).toMatchSnapshot();
            expect(legacy.escapeHtml(null)).toMatchSnapshot();
            expect(legacy.escapeHtml(undefined)).toMatchSnapshot();
        });

        itIfLoaded('returns empty string for empty input', () => {
            expect(legacy.escapeHtml('')).toMatchSnapshot();
        });

        itIfLoaded('escapes ampersand before other entities (order matters)', () => {
            // If the implementation reordered the replacements, `&` could be
            // double-escaped (&amp;lt;). Pin the order.
            expect(legacy.escapeHtml('&lt;')).toMatchSnapshot();
        });
    });

    describe('getSourceBadgeHtml', () => {
        itIfLoaded('renders External badge', () => {
            expect(legacy.getSourceBadgeHtml('External')).toMatchSnapshot();
        });

        itIfLoaded('renders LocalCollection badge', () => {
            expect(legacy.getSourceBadgeHtml('LocalCollection')).toMatchSnapshot();
        });

        itIfLoaded('renders LocalPlaylist badge', () => {
            expect(legacy.getSourceBadgeHtml('LocalPlaylist')).toMatchSnapshot();
        });

        itIfLoaded('renders MediaInfo badge', () => {
            expect(legacy.getSourceBadgeHtml('MediaInfo')).toMatchSnapshot();
        });

        itIfLoaded('renders AI badge', () => {
            expect(legacy.getSourceBadgeHtml('AI')).toMatchSnapshot();
        });

        itIfLoaded('returns empty string for unknown source', () => {
            expect(legacy.getSourceBadgeHtml('SomethingMadeUp')).toMatchSnapshot();
        });

        itIfLoaded('returns empty string for empty input', () => {
            expect(legacy.getSourceBadgeHtml('')).toMatchSnapshot();
        });
    });
});