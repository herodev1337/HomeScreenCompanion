/// <reference types="vitest" />
//
// Unit tests for `modules/filters/criteria.ts`.
//
// Legacy-snapshot mirror comparison was retired when the legacy bridge
// went away (Phase 6). Each function is now exercised directly with
// targeted assertions.

import { describe, it, expect } from 'vitest';

import {
    parseCriterion,
    buildCriterion,
    migrateCommaSeparated,
    classifyCriterion,
    isViewerOnlyGroup,
    type Criterion,
} from './criteria';

describe('parseCriterion', () => {
    it('returns the default (Resolution, empty) shape for an empty string (legacy quirk)', () => {
        const r = parseCriterion('');
        expect(r.prop).toBe('Resolution');
        expect(r.val).toBe('');
    });

    it('parses a simple `Resolution:4K` form', () => {
        const r = parseCriterion('Resolution:4K');
        expect(r.prop).toBe('Resolution');
        expect(r.val).toBe('4K');
    });

    it('parses a 3-part `prop:op:val` form', () => {
        const r = parseCriterion('Resolution:gte:1080p');
        expect(r.prop).toBe('Resolution');
        expect(r.op).toBe('gte');
        expect(r.val).toBe('1080p');
    });

    it('parses a 4-part `prop:userId:op:val` form', () => {
        const r = parseCriterion('Played:abc123:true:yes');
        expect(r.prop).toBe('Played');
        expect(r.userId).toBe('abc123');
        expect(r.op).toBe('true');
        expect(r.val).toBe('yes');
    });

    it('preserves colons inside Collection names', () => {
        const r = parseCriterion('Collection:Star Wars');
        expect(r.prop).toBe('Collection');
        expect(r.val).toBe('Star Wars');
    });

    it('preserves colons inside Playlist names', () => {
        const r = parseCriterion('Playlist:My Mix:2026');
        expect(r.prop).toBe('Playlist');
        expect(r.val).toBe('My Mix:2026');
    });

    it('detects a leading `!` as the not-flag', () => {
        const r = parseCriterion('!Resolution:4K');
        expect(r.not).toBe(true);
        expect(r.prop).toBe('Resolution');
    });
});

describe('buildCriterion', () => {
    it('collapses Resolution:4K back to the shorthand 4K (legacy quirk via MI_REVERSE_MAP)', () => {
        expect(buildCriterion('Resolution', '', '4K', '')).toBe('4K');
    });

    it('emits prop:val when there is no shorthand and no op', () => {
        expect(buildCriterion('Collection', '', 'Star Wars', '')).toBe('Collection:Star Wars');
    });

    it('omits the userId slot when empty', () => {
        expect(buildCriterion('Played', '', 'yes', 'abc')).toBe('Played:abc::yes');
    });

    it('returns empty string when val is empty', () => {
        expect(buildCriterion('Tag', '', '', '')).toBe('');
    });
});

describe('legacy asymmetry: buildCriterion strips the ! prefix', () => {
    it('parseCriterion keeps the not flag', () => {
        const parsed: Criterion = parseCriterion('!Resolution:4K');
        expect(parsed.not).toBe(true);
    });

    it('buildCriterion output omits the ! even if the parsed input had it', () => {
        const parsed: Criterion = parseCriterion('!Resolution:4K');
        const rebuilt = buildCriterion(parsed.prop, parsed.op, parsed.val, parsed.userId);
        expect(rebuilt.startsWith('!')).toBe(false);
    });
});

describe('migrateCommaSeparated', () => {
    it('returns an empty string for an empty string', () => {
        expect(migrateCommaSeparated('')).toBe('');
    });

    it('splits comma-separated values on newlines', () => {
        expect(migrateCommaSeparated('a,b,c')).toBe('a\nb\nc');
    });

    it('passes through values that already use newlines', () => {
        expect(migrateCommaSeparated('a\nb\nc')).toBe('a\nb\nc');
    });
});

describe('classifyCriterion', () => {
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

describe('isViewerOnlyGroup', () => {
    it('InProgress + MediaType:Series is a viewer-only group (regression)', () => {
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
