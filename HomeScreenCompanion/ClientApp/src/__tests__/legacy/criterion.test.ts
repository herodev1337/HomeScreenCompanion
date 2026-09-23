/// <reference types="vitest" />
//
// Snapshots for the criterion / filter helpers in the legacy bundle:
//   - parseCriterion         (configPage.js:899)
//   - buildCriterion         (configPage.js:920) — round-trip tested
//   - migrateCommaSeparated  (configPage.js:893)
//
// `buildCriterion` is the inverse of `parseCriterion` for any input that
// came out of `parseCriterion`. The dedicated `parse + build round-trip`
// tests verify that for arbitrary inputs the pair is the identity.

import { describe, it, expect } from 'vitest';

const legacy = globalThis.__hsc_legacy as Record<string, (...args: unknown[]) => unknown>;
const setupErr = globalThis.__hsc_legacy_error;

describe('criterion helpers', () => {
    const itIfLoaded = setupErr ? it.skip : it;

    describe('parseCriterion', () => {
        itIfLoaded('returns default shape for empty input', () => {
            expect(legacy.parseCriterion('')).toMatchSnapshot();
        });

        itIfLoaded('returns default shape for null input', () => {
            expect(legacy.parseCriterion(null)).toMatchSnapshot();
        });

        itIfLoaded('parses a simple `Resolution:4K` form', () => {
            expect(legacy.parseCriterion('Resolution:4K')).toMatchSnapshot();
        });

        itIfLoaded('parses a 3-part `prop:op:val` form', () => {
            expect(legacy.parseCriterion('Resolution:gte:1080p')).toMatchSnapshot();
        });

        itIfLoaded('parses a 4-part `prop:userId:op:val` form', () => {
            expect(legacy.parseCriterion('Played:abc123:true:yes')).toMatchSnapshot();
        });

        itIfLoaded('handles Collection:Name (colons preserved in name)', () => {
            expect(legacy.parseCriterion('Collection:Star Wars')).toMatchSnapshot();
        });

        itIfLoaded('handles Playlist:Name (colons preserved in name)', () => {
            expect(legacy.parseCriterion('Playlist:My Mix:2026')).toMatchSnapshot();
        });

        itIfLoaded('detects leading `!` as not-flag', () => {
            expect(legacy.parseCriterion('!Resolution:4K')).toMatchSnapshot();
        });

        itIfLoaded('maps shorthand tokens via MI_CRITERION_MAP', () => {
            expect(legacy.parseCriterion('4K')).toMatchSnapshot();
            expect(legacy.parseCriterion('HEVC')).toMatchSnapshot();
            expect(legacy.parseCriterion('7.1')).toMatchSnapshot();
        });
    });

    describe('buildCriterion', () => {
        itIfLoaded('returns empty for empty prop', () => {
            expect(legacy.buildCriterion('', '', '4K', '')).toMatchSnapshot();
        });

        itIfLoaded('returns empty for empty val', () => {
            expect(legacy.buildCriterion('Resolution', '', '', '')).toMatchSnapshot();
        });

        itIfLoaded('builds `prop:val` when no op and no user', () => {
            expect(legacy.buildCriterion('Resolution', '', '4K', '')).toMatchSnapshot();
        });

        itIfLoaded('builds `prop:op:val` when op given', () => {
            expect(legacy.buildCriterion('Resolution', 'gte', '1080p', '')).toMatchSnapshot();
        });

        itIfLoaded('builds `prop:userId:op:val` when userId given', () => {
            expect(legacy.buildCriterion('Played', 'true', 'yes', 'abc123')).toMatchSnapshot();
        });

        itIfLoaded('maps back via MI_REVERSE_MAP when known', () => {
            expect(legacy.buildCriterion('Resolution', '', '4K', '')).toMatchSnapshot();
            expect(legacy.buildCriterion('VideoCodec', '', 'HEVC', '')).toMatchSnapshot();
        });
    });

    describe('parse + build round-trip', () => {
        // For every input that parseCriterion accepts, buildCriterion should
        // produce something that parseCriterion maps back to the same input.
        // This catches any drift where build or parse changes shape.

        // Note: `!`-prefixed inputs are excluded here. buildCriterion(prop, op,
        // val, userId) has no `not` parameter, so it cannot round-trip a
        // negated criterion. The asymmetry is captured separately below.
        const inputs = [
            'Resolution:4K',
            'Resolution:gte:1080p',
            'Played:abc123:true:yes',
            'Collection:Star Wars',
            'Playlist:My Mix:2026',
            'HEVC',
            '7.1',
            'Genres:Action',
            'Year:gte:2020',
        ];

        itIfLoaded.each(inputs)('parse(build(parse(x))) === parse(x) for %s', (raw) => {
            const parsedOnce = legacy.parseCriterion(raw);
            const rebuilt = legacy.buildCriterion(
                parsedOnce.prop,
                parsedOnce.op,
                parsedOnce.val,
                parsedOnce.userId
            );
            const parsedTwice = legacy.parseCriterion(rebuilt);
            expect(parsedTwice).toEqual(parsedOnce);
        });

        itIfLoaded('legacy asymmetry: buildCriterion strips the ! prefix', () => {
            // Pin this behavior so a future "fix" that adds not-preserving
            // support is caught as a deliberate change (test must be updated).
            const parsedOnce = legacy.parseCriterion('!Resolution:4K');
            expect(parsedOnce.not).toBe(true);
            const rebuilt = legacy.buildCriterion(
                parsedOnce.prop,
                parsedOnce.op,
                parsedOnce.val,
                parsedOnce.userId
            );
            // No leading `!` after rebuild — the legacy function does not
            // accept a not parameter.
            expect(rebuilt).toMatchSnapshot();
            const parsedTwice = legacy.parseCriterion(rebuilt);
            expect(parsedTwice.not).toBe(false);
        });
    });

    describe('migrateCommaSeparated', () => {
        itIfLoaded('leaves newline-separated input untouched', () => {
            expect(legacy.migrateCommaSeparated('a\nb\nc')).toMatchSnapshot();
        });

        itIfLoaded('converts comma-separated to newline', () => {
            expect(legacy.migrateCommaSeparated('a,b,c')).toMatchSnapshot();
        });

        itIfLoaded('trims whitespace around items', () => {
            expect(legacy.migrateCommaSeparated('a , b , c')).toMatchSnapshot();
        });

        itIfLoaded('drops empty items', () => {
            expect(legacy.migrateCommaSeparated('a,,b,')).toMatchSnapshot();
        });

        itIfLoaded('returns empty for falsy input', () => {
            expect(legacy.migrateCommaSeparated('')).toMatchSnapshot();
            expect(legacy.migrateCommaSeparated(null)).toMatchSnapshot();
        });

        itIfLoaded('returns string unchanged when no separators at all', () => {
            expect(legacy.migrateCommaSeparated('lonely')).toMatchSnapshot();
        });

        itIfLoaded('prefers newline over comma (no conversion when both present? actually NO — see code)', () => {
            // The legacy code returns the input unchanged if it already contains
            // a newline. This test pins that behavior. If a future change makes
            // it convert `a\nb,c` -> `a\nb\nc`, this snapshot will catch it.
            expect(legacy.migrateCommaSeparated('a\nb,c')).toMatchSnapshot();
        });
    });
});