/// <reference types="vitest" />

import { describe, it, expect } from 'vitest';

import {
    getLocalRowHtml,
    getDateRowHtml,
    readRowAsConfig,
} from './rows';
import type { NamedItem } from './rows';

describe('getLocalRowHtml', () => {
    it('renders the row markup with a select, a limit input, and a remove button', () => {
        const html = getLocalRowHtml('collection', '', 50);
        expect(html).toContain('class="local-row"');
        expect(html).toContain('class="selLocalSource"');
        expect(html).toContain('class="txtLocalLimit"');
        // limit reflected verbatim in the input value
        expect(html).toContain('value="50"');
        expect(html).toContain('btnRemoveLocal');
        expect(html).toContain('btn-row-remove');
    });

    it('marks the option whose Name matches selectedName as selected', () => {
        const items: NamedItem[] = [
            { Name: 'Movies' },
            { Name: 'Shows' },
        ];
        const html = getLocalRowHtml('collection', 'Shows', 0, items);
        expect(html).toContain('<option value="Movies"');
        expect(html).toContain('<option value="Shows" selected');
        expect(html).toContain('value="0"');
    });

    it('renders the empty placeholder when no items are supplied', () => {
        const html = getLocalRowHtml('playlist', '', 0);
        expect(html).toContain('-- Select --');
        expect(html).toContain('value="0"');
    });
});

describe('getDateRowHtml', () => {
    it('renders the SpecificDate inputs with the provided start/end', () => {
        const html = getDateRowHtml({
            Type: 'SpecificDate',
            Start: '2026-01-01',
            End: '2026-12-31',
            DayOfWeek: '',
        });
        expect(html).toContain('class="date-row');
        expect(html).toContain('class="txtFullStartDate"');
        expect(html).toContain('value="2026-01-01"');
        expect(html).toContain('value="2026-12-31"');
        expect(html).toContain('class="btnRemoveDate"');
    });

    it('marks the Weekly day-toggle buttons that match the saved days', () => {
        const html = getDateRowHtml({
            Type: 'Weekly',
            Start: null,
            End: null,
            DayOfWeek: 'Monday,Wednesday',
        });
        // The class appears before data-day in the rendered HTML (legacy order).
        // Saved days get the `active` class; non-saved days don't.
        expect(html).toMatch(/class="day-toggle active"[^>]*data-day="Monday"/);
        expect(html).toMatch(/class="day-toggle active"[^>]*data-day="Wednesday"/);
        expect(html).not.toMatch(/class="day-toggle active"[^>]*data-day="Tuesday"/);
    });

    it('renders EveryYear month/day selects with all 12 months listed', () => {
        const html = getDateRowHtml({
            Type: 'EveryYear',
            Start: '2000-1-5',
            End: '2000-12-31',
            DayOfWeek: '',
        });
        expect(html).toContain('class="selStartMonth"');
        expect(html).toContain('class="selEndMonth"');
        // Legacy and TS both emit un-padded month values ('1' .. '12').
        // Assert both endpoints are present so the select is full.
        expect(html).toContain('value="1"');
        expect(html).toContain('value="12"');
    });

    it('falls back to SpecificDate when the interval has no Type', () => {
        const html = getDateRowHtml({
            Type: '' as unknown as 'SpecificDate',
            Start: null,
            End: null,
            DayOfWeek: '',
        });
        expect(html).toContain('class="selDateType"');
        // 'SpecificDate' should be the selected option.
        expect(html).toMatch(/<option value="SpecificDate" selected/);
    });
});

describe('readRowAsConfig', () => {
    it('returns a defaulted config when the row has no inputs', () => {
        const row = document.createElement('div');
        row.innerHTML = [
            '<input class="txtEntryLabel" value="My entry">',
            '<input class="txtTagName" value="">',
            '<input class="chkTagActive" type="checkbox" checked>',
            '<input class="txtTagBlacklist">',
            '<input class="chkEnableTag" type="checkbox">',
            '<input class="chkEnableCollection" type="checkbox">',
            '<input class="chkOverrideWhenActive" type="checkbox">',
            '<div class="playlist-tab" data-pl-loaded="0" data-pl-userids="%5B%5D" data-pl-mappings="%5B%5D"></div>',
            '<input class="txtCollectionName" value="">',
            '<select class="selSourceType"><option value="URL">URL</option></select>',
            '<input class="txtMediaInfoLimit" value="">',
            '<input class="selAiProvider" value="OpenAI">',
            '<input class="txtAiPrompt" value="">',
            '<input class="chkAiRecentlyWatched" type="checkbox">',
            '<input class="selAiWatchedUser" value="">',
            '<input class="txtAiWatchedCount" value="">',
            '<input class="txtAiRefreshInterval" value="">',
            '<input class="chkEnablePlaylist" type="checkbox">',
            '<input class="txtPlaylistName" value="">',
            '<input class="chkTagTargetEpisode" type="checkbox">',
            '<input class="chkTagTargetSeason" type="checkbox">',
            '<input class="chkTagTargetSeries" type="checkbox">',
            '<input class="chkCollTargetEpisode" type="checkbox">',
            '<input class="chkCollTargetSeason" type="checkbox">',
            '<input class="chkCollTargetSeries" type="checkbox">',
            '<div class="homescreen-tab" data-hse-loaded="0" data-hse-libraryid="auto" data-hse-userids="%5B%5D" data-hse-settings="%7B%7D"></div>',
        ].join('');
        const cfg = readRowAsConfig(row);
        expect(cfg.Name).toBe('My entry');
        // txtTagName is empty so Tag falls back to the label.
        expect(cfg.Tag).toBe('My entry');
        expect(cfg.Active).toBe(true);
        expect(cfg.EnableTag).toBe(false);
        expect(cfg.SourceType).toBe('URL');
        expect(cfg.Urls).toEqual([{ url: '', limit: 0 }]);
        expect(cfg.HomeSectionLibraryId).toBe('auto');
        expect(cfg.MediaInfoFilters).toEqual([]);
        expect(cfg.Blacklist).toEqual([]);
    });
});
