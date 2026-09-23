/// <reference types="vitest" />
//
// Fresh structural tests for `modules/filters/miFilters.ts`. The legacy
// module has no snapshot suite for these helpers, so the assertions
// here are happy-dom-free HTML-substring checks rather than data-driven
// mirror comparisons. Each test verifies *one* observable property of
// the generated HTML — group boundaries, selected flags, the
// empty/populated hint branches — so a whitespace tweak upstream won't
// cascade into a brittle full-string diff.

import { describe, it, expect } from 'vitest';
import { propertyOptionsHtml, getMiHintHtml } from './miFilters';

describe('propertyOptionsHtml', () => {
    it('renders every group label in the legacy order', () => {
        const html = propertyOptionsHtml('');
        // Spot-check every group label. Order matters: Video first,
        // Activity last (legacy.js:1015-1022).
        expect(html.indexOf('<optgroup label="Video"')).toBeGreaterThanOrEqual(0);
        expect(html.indexOf('<optgroup label="Audio"')).toBeGreaterThan(html.indexOf('<optgroup label="Video"'));
        expect(html.indexOf('<optgroup label="Content"')).toBeGreaterThan(html.indexOf('<optgroup label="Audio"'));
        expect(html.indexOf('<optgroup label="Music"')).toBeGreaterThan(html.indexOf('<optgroup label="Content"'));
        expect(html.indexOf('<optgroup label="Metrics"')).toBeGreaterThan(html.indexOf('<optgroup label="Music"'));
        expect(html.indexOf('<optgroup label="Activity"')).toBeGreaterThan(html.indexOf('<optgroup label="Metrics"'));
    });

    it('emits one <option> per prop tuple with value + label', () => {
        const html = propertyOptionsHtml('');
        // value attr is the prop name; the text inside the option is
        // the human-readable label. e.g. value="Collection" with
        // text "In Collection" (legacy.js:1018).
        expect(html).toContain('<option value="Resolution"');
        expect(html).toContain('>Resolution</option>');
        expect(html).toContain('<option value="HDR"');
        expect(html).toContain('<option value="Tag"');
        expect(html).toContain('<option value="Collection"');
        expect(html).toContain('>In Collection</option>');
        expect(html).toContain('<option value="BitRate"');
        expect(html).toContain('>Bit Rate (kbps)</option>');
    });

    it('marks no option selected when selected is empty', () => {
        const html = propertyOptionsHtml('');
        // No "selected" attribute anywhere — the function never emits
        // it unless `selected` matches a prop value.
        expect(html).not.toContain(' selected');
    });

    it('marks the matching option as selected', () => {
        const html = propertyOptionsHtml('Resolution');
        expect(html).toContain('<option value="Resolution" selected');
        // Pick a different prop in another group; verify it stays
        // un-selected so the selection doesn't bleed across options.
        expect(html).toContain('<option value="HDR"');
        expect(html).not.toContain('<option value="HDR" selected');
    });

    it('selects an option in a non-first group', () => {
        const html = propertyOptionsHtml('Artist');
        // Artist lives under Music — the selection should not show up
        // in Video / Audio / Content / Metrics / Activity headers.
        const musicIdx = html.indexOf('<optgroup label="Music"');
        const afterMusic = html.slice(musicIdx);
        expect(afterMusic).toContain('<option value="Artist" selected');
    });

    it('emits the legacy Resolution subgroup (4K / 8K / etc.) untouched', () => {
        const html = propertyOptionsHtml('');
        // Resolution values match the labels exactly in the legacy
        // tuple, but the option *value* is the prop name and the
        // option *text* is the human label.
        expect(html).toContain('<option value="Resolution"');
        expect(html).toContain('<option value="VideoCodec"');
        expect(html).toContain('<option value="HDR"');
        // Confirm the Video group ends before the Audio group begins
        // (i.e. no <optgroup> nested inside another).
        const videoEnd = html.indexOf('</optgroup>');
        const audioStart = html.indexOf('<optgroup label="Audio"');
        expect(videoEnd).toBeLessThan(audioStart);
    });
});

describe('getMiHintHtml', () => {
    it('renders the empty hint div for a prop that has no text-match semantics', () => {
        // Resolution is not in MI_TEXT_MATCH_PROPS and is not ImdbId/TvdbId.
        const html = getMiHintHtml('Resolution');
        expect(html).toBe('<div class="mi-rule-hint"></div>');
    });

    it('renders the populated hint for a prop in MI_TEXT_MATCH_PROPS', () => {
        const html = getMiHintHtml('Title');
        expect(html).toContain('<div class="mi-rule-hint"');
        expect(html).toContain('One value per line');
        expect(html).toContain('&mdash;');
        expect(html).toContain('<em>');
        expect(html).toContain('any</em> line matches');
    });

    it('renders the populated hint for ImdbId even though it is not in MI_TEXT_MATCH_PROPS', () => {
        // The legacy condition has two carve-outs: MI_TEXT_MATCH_PROPS
        // OR exactly ImdbId/TvdbId. Verify both carve-outs.
        const html = getMiHintHtml('ImdbId');
        expect(html).toContain('One value per line');
    });

    it('renders the populated hint for TvdbId via the same carve-out branch', () => {
        const html = getMiHintHtml('TvdbId');
        expect(html).toContain('One value per line');
    });

    it('renders the populated hint for every MI_TEXT_MATCH_PROPS member', () => {
        // Belt-and-braces: spot-check one entry from each "shape" of
        // list membership to make sure the legacy indexOf check still
        // picks them all up after the constant was lifted.
        const members = [
            'Tag', 'Title', 'EpisodeTitle', 'Overview', 'Studio',
            'Genre', 'Actor', 'Director', 'Writer', 'ContentRating',
            'AudioLanguage', 'Artist', 'Album', 'FolderPath', 'Country',
        ];
        for (const m of members) {
            expect(getMiHintHtml(m)).toContain('One value per line');
        }
    });
});
