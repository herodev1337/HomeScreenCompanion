// Phase 3 wave 3: tag-row top-list badge refresh helper.
//
// One function here, lifted verbatim from
//     `Configuration/configPage.js` (legacy.js:1854–1871)
// behavior:
//
//   - `refreshTopListBadges(topListTagNames)` — walks every
//     `.tag-row` in the document and adds or removes the
//     `.tag-indicator.toplist` span in its `.badge-container`,
//     depending on whether the row's `data-tag` is in the
//     `topListTagNames` set.
//
// The legacy function closes over the module-scope `_topListTagNames`
// mutable `Set`. To keep this module pure and parameterized, the set
// is passed in as an argument. Callers (Phase 5's state-wiring code)
// pass whatever set is current in their state object.
//
// The rest of the tag-row rendering (`renderTagGroup` at legacy.js:1363)
// is DEFERRED to Phase 5 because it closes over multiple module-scope
// mutables (`_miUsers`, `_topListTagNames`, `_hseUsersCache`,
// `_hseLibraryCachePromise`) and helper functions that themselves
// touch state (`setupRowEvents`, `getMediaInfoFilterGroupHtml`,
// `getMySavedFiltersPanelHtml`, etc.). Splitting it into a leaf module
// now would require dragging the full closure surface along with it;
// better to do the state extraction once in Phase 5.

/**
 * Re-sync the "Top-List" indicator on every tag row's badge
 * container. Reads DOM only — the only state input is the
 * `topListTagNames` set, which the caller passes in.
 *
 * For each `.tag-row` in the document:
 *
 *   - If the row's `data-tag` (lower-cased) is in
 *     `topListTagNames`:
 *     - If a `.tag-indicator.toplist` is already present, leave it
 *       alone (idempotent).
 *     - Otherwise append a fresh `<span class="tag-indicator
 *       toplist">…</span>` containing the "Top-List" icon and label.
 *
 *   - If not in `topListTagNames`:
 *     - If a `.tag-indicator.toplist` exists, remove it.
 *     - Otherwise leave the row alone.
 *
 * @param topListTagNames  The set of tag names that currently back a
 *                         top-list (lower-cased). Mutation of this
 *                         set by the caller takes effect on the next
 *                         call; this function never writes to it.
 */
export function refreshTopListBadges(topListTagNames: ReadonlySet<string>): void {
    document.querySelectorAll('.tag-row').forEach((row) => {
        const container = row.querySelector('.badge-container');
        if (!container) return;
        const tagName = ((row as HTMLElement).dataset.tag || '').toLowerCase();
        const existing = container.querySelector('.tag-indicator.toplist');
        if (topListTagNames.has(tagName)) {
            if (!existing) {
                const span = document.createElement('span');
                span.className = 'tag-indicator toplist';
                span.innerHTML = '<i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List';
                container.appendChild(span);
            }
        } else if (existing) {
            existing.remove();
        }
    });
}
