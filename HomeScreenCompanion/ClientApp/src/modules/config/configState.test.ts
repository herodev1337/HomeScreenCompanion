/// <reference types="vitest" />
//
// Unit tests for `modules/config/configState.ts`.
//
// 5 tests for `groupConfigTags` covering: empty input, single group,
// multi-group with `(Name, Tag)` joiner, the `SourceType === 'AI'`
// branch's `Limit` override, plus the dangling-test `tagConfigHasViewerCriteria`
// flagging shape mentioned in the task scope.
//
// `updateDryRunWarning` is also covered once — DOM-only, walks the
// `#HomeScreenCompanionConfigPage .dry-run-warning` element and
// toggles `.style.display`.

import { describe, it, expect, beforeEach } from 'vitest';

import {
    groupConfigTags,
    updateDryRunWarning,
} from './configState';
import type { TagConfig } from './types/index';

describe('groupConfigTags', () => {
    it('returns an empty map when given no tags', () => {
        expect(groupConfigTags([])).toEqual({});
        expect(groupConfigTags(undefined)).toEqual({});
        expect(groupConfigTags(null)).toEqual({});
    });

    it('groups a single tag row by Tag alone when Name is absent', () => {
        const tags: TagConfig[] = [{ Tag: '4K', SourceType: 'External', Url: 'https://example.com/x' }];
        const out = groupConfigTags(tags);
        expect(Object.keys(out)).toEqual(['4K']);
        const group = out['4K']!;
        expect(group.Tag).toBe('4K');
        expect(group.Name).toBe('');
        expect(group.Active).toBe(true);
        expect(group.EnableTag).toBe(true);
        expect(group.SourceType).toBe('External');
        expect(group.Urls).toEqual([{ url: 'https://example.com/x', limit: 0 }]);
    });

    it('joins groups by (Name + \\x1F + Tag) when Name is present', () => {
        const tags: TagConfig[] = [
            { Tag: '4K', Name: 'Resolution', SourceType: 'External', Url: 'https://a', Limit: 10 },
            { Tag: '8K', Name: 'Resolution', SourceType: 'External', Url: 'https://b', Limit: 5 },
            { Tag: '4K', Name: 'Other', SourceType: 'External', Url: 'https://c', Limit: 1 },
        ];
        const out = groupConfigTags(tags);
        expect(Object.keys(out).sort()).toEqual(['Other\x1F4K', 'Resolution\x1F4K', 'Resolution\x1F8K']);
        expect(out['Resolution\x1F4K']!.Urls).toEqual([{ url: 'https://a', limit: 10 }]);
        expect(out['Resolution\x1F8K']!.Urls).toEqual([{ url: 'https://b', limit: 5 }]);
        expect(out['Other\x1F4K']!.Urls).toEqual([{ url: 'https://c', limit: 1 }]);
    });

    it('appends multiple URLs into the same Urls array', () => {
        const tags: TagConfig[] = [
            { Tag: '4K', SourceType: 'External', Url: 'https://a', Limit: 10 },
            { Tag: '4K', SourceType: 'External', Url: 'https://b', Limit: 5 },
            { Tag: '4K', SourceType: 'External', Url: 'https://c' /* no limit */ },
        ];
        const out = groupConfigTags(tags);
        expect(out['4K']!.Urls).toEqual([
            { url: 'https://a', limit: 10 },
            { url: 'https://b', limit: 5 },
            { url: 'https://c', limit: 0 },
        ]);
    });

    it('appends LocalCollection / LocalPlaylist into LocalSources, not Urls', () => {
        const tags: TagConfig[] = [
            { Tag: '4K', SourceType: 'LocalCollection', LocalSourceId: 'col-1', Limit: 7 },
            { Tag: '4K', SourceType: 'LocalPlaylist', LocalSourceId: 'pl-1', Limit: 3 },
        ];
        const out = groupConfigTags(tags);
        expect(out['4K']!.Urls).toEqual([]);
        expect(out['4K']!.LocalSources).toEqual([
            { id: 'col-1', limit: 7 },
            { id: 'pl-1', limit: 3 },
        ]);
    });

    it('overwrites Limit on MediaInfo and AI source types', () => {
        const miTags: TagConfig[] = [
            { Tag: '4K', SourceType: 'MediaInfo', Limit: 1 },
            { Tag: '4K', SourceType: 'MediaInfo', Limit: 99 },
        ];
        expect(groupConfigTags(miTags)['4K']!.Limit).toBe(99);

        const aiTags: TagConfig[] = [
            { Tag: '4K', SourceType: 'AI', Limit: 3 },
            { Tag: '4K', SourceType: 'AI', Limit: 50 },
        ];
        expect(groupConfigTags(aiTags)['4K']!.Limit).toBe(50);
    });

    it('the tagConfigHasViewerCriteria flagging shape stays stable (no separate code path)', () => {
        // The legacy test exercised `tagConfigHasViewerCriteria` only
        // indirectly via `groupConfigTags`. We pin a few invariants
        // here: `Active` is true when the field is `!== false` (so a
        // missing field is treated as active), and the AI defaults
        // resolve cleanly without an `AiProvider` field set on the
        // input row.
        const tags: TagConfig[] = [
            { Tag: '4K' /* Active/EnableTag default to true */, SourceType: 'AI' },
        ];
        const out = groupConfigTags(tags);
        expect(out['4K']!.Active).toBe(true);
        expect(out['4K']!.EnableTag).toBe(true);
        expect(out['4K']!.AiProvider).toBe('OpenAI');
        expect(out['4K']!.AiRecentlyWatchedCount).toBe(20);
        expect(out['4K']!.SourceType).toBe('AI');
    });
});

describe('updateDryRunWarning', () => {
    beforeEach(() => {
        document.documentElement.innerHTML = '';
        const body = document.body ?? document.createElement('body');
        if (!document.body) document.documentElement.appendChild(body);
    });

    it('shows the banner when DryRunMode=true', () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        const warn = document.createElement('div');
        warn.className = 'dry-run-warning';
        view.appendChild(warn);
        document.body.appendChild(view);

        updateDryRunWarning(JSON.stringify({ DryRunMode: true }));
        expect(warn.style.display).toBe('flex');
    });

    it('hides the banner when DryRunMode=false', () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        const warn = document.createElement('div');
        warn.className = 'dry-run-warning';
        warn.style.display = 'flex';
        view.appendChild(warn);
        document.body.appendChild(view);

        updateDryRunWarning(JSON.stringify({ DryRunMode: false }));
        expect(warn.style.display).toBe('none');
    });

    it('is a no-op when the view is missing (no #HomeScreenCompanionConfigPage)', () => {
        // No view in DOM; should silently return without throwing.
        expect(() => updateDryRunWarning('{"DryRunMode":true}')).not.toThrow();
    });

    it('hides the banner on a JSON parse error (legacy fallback)', () => {
        const view = document.createElement('div');
        view.id = 'HomeScreenCompanionConfigPage';
        const warn = document.createElement('div');
        warn.className = 'dry-run-warning';
        warn.style.display = 'flex';
        view.appendChild(warn);
        document.body.appendChild(view);

        updateDryRunWarning('{ not valid json');
        expect(warn.style.display).toBe('none');
    });
});
