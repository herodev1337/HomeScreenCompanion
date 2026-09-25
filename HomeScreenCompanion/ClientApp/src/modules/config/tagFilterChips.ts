// D4 (configState.ts split): pure DOM walker that toggles `.tag-row`
// visibility based on the search input + the eleven `#chkFilter*` chip
// checkboxes. Extracted from `configState.ts:649-739`
// (legacy.js:3530-3591).
//
// "Chips" is the working name used in the legacy source — they are the
// dropdown's filter checkboxes that surface as count-bearing labels
// next to the "Filter" button.

/**
 * Walk every `.tag-row` and toggle its `display` based on the active
 * filter checkboxes + search term (legacy.js:3530-3591).
 *
 * Pure DOM function: reads `#tagListContainer`, the search input, and
 * the `#chkFilter*` checkbox state, plus `.fbtnFilter` chips via the
 * `#btnFilterDropdown` + `#filterDropdownLabel` pair. Walks each
 * `.tag-row` inside `#tagListContainer` (no-op when the container is
 * missing).
 *
 * Each row is shown iff:
 *   - the search term is empty OR matches `.txtTagName` / `.txtEntryLabel` (case-insensitive); AND
 *   - any checked feature filter matches the row's `chkEnableTag` / `chkEnableCollection`
 *     / `.date-row` count / `chkEnableHomeSection` (or none is checked); AND
 *   - any checked source-type filter matches the row's `.selSourceType` value
 *     (or none is checked); AND
 *   - any checked status filter matches `.chkTagActive` (or none is checked).
 *
 * The dropdown button's label and `.active` class are updated based on
 * how many of the eleven filters are checked.
 *
 * Quirks preserved verbatim:
 *   - `(row.querySelector('.chkX') || {}).checked` is implicit: when
 *     the element is missing we read `.checked` from `undefined` ⇒ `false`.
 *   - The legacy code accesses `.txtTagName.value` unguarded — the
 *     row builder always renders it, so we preserve the throw.
 *
 * @param view  The config page root (`#HomeScreenCompanionConfigPage`).
 */
export function applyFilters(view: HTMLElement): void {
    const container = view.querySelector<HTMLElement>('#tagListContainer');
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>('.tag-row');

    const searchTerm = (view.querySelector<HTMLInputElement>('#txtSearchTags')?.value || '').toLowerCase();

    const fTag = view.querySelector<HTMLInputElement>('#chkFilterTag')?.checked;
    const fColl = view.querySelector<HTMLInputElement>('#chkFilterCollection')?.checked;
    const fSched = view.querySelector<HTMLInputElement>('#chkFilterSchedule')?.checked;
    const fHome = view.querySelector<HTMLInputElement>('#chkFilterHomeScreen')?.checked;
    const fSrcExt = view.querySelector<HTMLInputElement>('#chkFilterSrcExternal')?.checked;
    const fSrcMI = view.querySelector<HTMLInputElement>('#chkFilterSrcMediaInfo')?.checked;
    const fSrcColl = view.querySelector<HTMLInputElement>('#chkFilterSrcCollection')?.checked;
    const fSrcPlay = view.querySelector<HTMLInputElement>('#chkFilterSrcPlaylist')?.checked;
    const fSrcAI = view.querySelector<HTMLInputElement>('#chkFilterSrcAI')?.checked;
    const fActive = view.querySelector<HTMLInputElement>('#chkFilterActive')?.checked;
    const fInactive = view.querySelector<HTMLInputElement>('#chkFilterInactive')?.checked;

    const anyFeature = !!(fTag || fColl || fSched || fHome);
    const anySrc = !!(fSrcExt || fSrcMI || fSrcColl || fSrcPlay || fSrcAI);
    const anyStatus = !!(fActive || fInactive);

    const btn = view.querySelector<HTMLElement>('#btnFilterDropdown');
    const lbl = view.querySelector<HTMLElement>('#filterDropdownLabel');
    if (btn && lbl) {
        const activeCount = [fTag, fColl, fSched, fHome, fSrcExt, fSrcMI, fSrcColl, fSrcPlay, fSrcAI, fActive, fInactive].filter(Boolean).length;
        lbl.textContent = activeCount > 0 ? 'Filter (' + activeCount + ')' : 'Filter';
        btn.classList.toggle('active', activeCount > 0);
    }

    rows.forEach((row) => {
        const tagName = (row.querySelector<HTMLInputElement>('.txtTagName')!.value || '').toLowerCase();
        const entryLbl = (row.querySelector<HTMLInputElement>('.txtEntryLabel')!.value || '').toLowerCase();
        const matchesSearch = !searchTerm || tagName.includes(searchTerm) || entryLbl.includes(searchTerm);

        let matchesFeature = true;
        if (anyFeature) {
            const hasTag = !!row.querySelector<HTMLInputElement>('.chkEnableTag')?.checked;
            const hasColl = !!row.querySelector<HTMLInputElement>('.chkEnableCollection')?.checked;
            const hasSched = row.querySelectorAll('.date-row').length > 0;
            const hasHome = !!row.querySelector<HTMLInputElement>('.chkEnableHomeSection')?.checked;
            matchesFeature = (!!fTag && hasTag) || (!!fColl && hasColl) || (!!fSched && hasSched) || (!!fHome && hasHome);
        }

        let matchesSrc = true;
        if (anySrc) {
            const src = row.querySelector<HTMLSelectElement>('.selSourceType')?.value || '';
            matchesSrc = (!!fSrcExt && src === 'External') || (!!fSrcMI && src === 'MediaInfo') ||
                (!!fSrcColl && src === 'LocalCollection') || (!!fSrcPlay && src === 'LocalPlaylist') ||
                (!!fSrcAI && src === 'AI');
        }

        let matchesStatus = true;
        if (anyStatus) {
            const isActive = !!row.querySelector<HTMLInputElement>('.chkTagActive')?.checked;
            matchesStatus = (!!fActive && isActive) || (!!fInactive && !isActive);
        }

        row.style.display = (matchesSearch && matchesFeature && matchesSrc && matchesStatus) ? '' : 'none';
    });
}
