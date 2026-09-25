// D4 (form.ts split): DOM-only visibility / disabled-state helpers for
// the home-section tab. Extracted from `form.ts:302-503` (legacy.js:2998-3262).
//
// All helpers here are pure relative to module scope: they read or
// mutate the DOM, and read or fire change events on `.selHseSectionType`
// / `.selHseViewType` / `.selHseImageType`. No `ApiClient`, no fetch, no
// module-scope state.

/**
 * Show / hide every `.hse-items-only` element under `tab` based on
 * whether the current Section Type is *not* `boxset`.
 *
 * The helper is silent when the section-type `<select>` is absent
 * (treated as `'items'`), so a half-rendered tab stays usable.
 *
 * @param tab  The home-section container. Either a `<div
 *             class="homescreen-tab">` or any ancestor that contains
 *             the relevant descendants.
 */
export function updateHseItemsOnlyVisibility(tab: Element): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    const isItems = !stSel || stSel.value !== 'boxset';
    tab.querySelectorAll('.hse-items-only').forEach((el) => {
        (el as HTMLElement).style.display = isItems ? '' : 'none';
    });
}

/**
 * Disable / enable the Image Type `<select>` based on whether the
 * current View Type is `Cards` (or default `''`). Spotlight view
 * always allows image-type selection; items-type + non-cards view
 * disables it (Emby's Query has no ImageType there).
 *
 * Silent when the Image Type `<select>` is absent.
 *
 * @param tab  The home-section container.
 */
export function updateHseImageTypeState(tab: Element): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    const vtSel = tab.querySelector('.selHseViewType') as HTMLSelectElement | null;
    const imgSel = tab.querySelector('.selHseImageType') as HTMLSelectElement | null;
    if (!imgSel) return;
    const isItems = !stSel || stSel.value !== 'boxset';
    const isCards = !vtSel || vtSel.value === '' || vtSel.value === 'cards';
    imgSel.disabled = isItems && !isCards;
}

/**
 * Attach `change` listeners to the Section Type and View Type
 * `<select>` elements inside `tab`. The listeners call back into
 * {@link updateHseItemsOnlyVisibility} and {@link updateHseImageTypeState}
 * so the form stays in sync with what the user picks. Also fires
 * both visibility updates once up-front so the initial state matches
 * the saved values.
 *
 * Silent when the Section Type `<select>` is absent (the form has not
 * yet been rendered into `tab`).
 *
 * @param tab  The home-section container.
 */
export function wireHomeSectionTypeChange(tab: Element): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    if (!stSel) return;
    updateHseItemsOnlyVisibility(tab);
    updateHseImageTypeState(tab);
    stSel.addEventListener('change', () => {
        updateHseItemsOnlyVisibility(tab);
        updateHseImageTypeState(tab);
    });
    const vtSel = tab.querySelector('.selHseViewType') as HTMLSelectElement | null;
    if (vtSel) {
        vtSel.addEventListener('change', () => {
            updateHseImageTypeState(tab);
        });
    }
}

/**
 * Rebuild the Section Type `<select>` so its options match the row's
 * current `tagEnabled` / `collEnabled` / `viewerOnly` flags, then
 * preserve the previously selected value if it's still valid.
 *
 * The `<select>`'s options are:
 *   - `'boxset'` (`Single Collection`) if `collEnabled` is true.
 *   - `'items'` (`Dynamic Media (tag)` or `Dynamic Media (per user)`)
 *     if `tagEnabled` is true *or* `viewerOnly` is true.
 *
 * When the previous selection is no longer a valid option the
 * `<select>`'s `value` falls back to the browser default (first
 * option). {@link updateHseItemsOnlyVisibility} is invoked once at the
 * end so the dependents stay in sync.
 *
 * Silent when the Section Type `<select>` is absent.
 *
 * @param tab          The home-section container.
 * @param tagEnabled   Whether "Apply Tag" is enabled on the parent row.
 * @param collEnabled  Whether "Create Collection" is enabled.
 * @param viewerOnly   Whether this is a MediaInfo row with per-user filters.
 */
export function refreshHseSectionTypeOptions(
    tab: Element,
    tagEnabled: boolean,
    collEnabled: boolean,
    viewerOnly: boolean,
): void {
    const stSel = tab.querySelector('.selHseSectionType') as HTMLSelectElement | null;
    if (!stSel) return;
    const currentVal = stSel.value;
    stSel.innerHTML = '';
    if (collEnabled) {
        const o1 = document.createElement('option');
        o1.value = 'boxset';
        o1.textContent = 'Single Collection';
        stSel.appendChild(o1);
    }
    if (tagEnabled || viewerOnly) {
        const o2 = document.createElement('option');
        o2.value = 'items';
        o2.textContent = (viewerOnly && !tagEnabled) ? 'Dynamic Media (per user)' : 'Dynamic Media (tag)';
        stSel.appendChild(o2);
    }
    const stillValid = Array.from(stSel.options).some((o) => o.value === currentVal);
    if (stillValid) stSel.value = currentVal;
    updateHseItemsOnlyVisibility(tab);
}
