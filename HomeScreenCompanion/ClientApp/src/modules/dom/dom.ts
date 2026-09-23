// Phase 3: second leaf from `legacy.js`.
//
// Pure (or DOM-touching-but-stateful-input-only) helpers lifted verbatim from
//     `Configuration/configPage.js` (legacy.js:1218, 695, 3803, 542)
// behavior:
//
//   - `escapeHtml(str)` — pure string transform.
//   - `getDragAfterElement(container, y)` — reads `getBoundingClientRect()` of
//     children matching `.tag-row:not(.dragging)`. No module state.
//   - `getManDragAfterElement(container, y)` — same algorithm, but the
//     children selector is `.man-section-row:not(.man-dragging)`. The two
//     share an implementation; the public exports are thin wrappers.
//   - `getUrlRowHtml(value, limit)` — pure HTML-string builder for an
//     external-source URL row in the filter UI. Embeds `value` un-escaped,
//     matching legacy behavior (the input comes from a `txtTagUrl` text
//     field and the legacy caller does not pre-escape).
//
// No module-scope state is read. No `ApiClient`/`Dashboard`/`fetch` is
// called. The DOM-touching helpers only read layout, never mutate.

/**
 * Escape characters that have a special meaning in HTML text and
 * double-quoted attribute values.
 *
 * Replacements:
 *   - `&` → `&amp;`   (must be first, otherwise we'd double-escape the
 *                      entities below)
 *   - `<` → `&lt;`
 *   - `>` → `&gt;`
 *   - `"` → `&quot;`
 *
 * Single quotes (`'`) are intentionally left alone — the legacy function
 * was only ever used inside double-quoted attribute values and double-
 * quoted text contexts, and the snapshot pins this non-behavior. Do not
 * "fix" it without auditing every call site for `'`-safe attribute quoting.
 *
 * Non-string input is coerced via `String()` (e.g. `42` → `"42"`,
 * `null` → `"null"`, `undefined` → `"undefined"`). That matches the
 * legacy contract, including the surprising `"null"` / `"undefined"` cases
 * — the snapshot in `html-helpers.test.ts.snap` pins them.
 *
 * @param str Anything coercible to a string.
 * @returns   The escaped string. Empty input → empty output.
 */
export function escapeHtml(str: unknown): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * For a vertical drag gesture at `y`, find which of `container`'s direct
 * children (matching the supplied CSS selector, with `.dragging` excluded)
 * the cursor is "above the midpoint" of. Returns the child whose
 * `getBoundingClientRect().top + height/2` is the greatest value still
 * greater than `y`, or `null` if no such child exists.
 *
 * Used by the tag-row reorder gesture to compute the `insertBefore`
 * target during drag.
 *
 * @param container  The draggable list's container element.
 * @param y          Pointer-Y in viewport coordinates (e.g. `e.clientY`).
 * @param selector   CSS selector for the candidate rows. Defaults to
 *                   `.tag-row:not(.dragging)`.
 * @returns          The element to insert before, or `null` when the drop
 *                   would land at the end of the list (or the list is
 *                   empty).
 */
export function getDragAfterElement(
    container: HTMLElement,
    y: number,
    selector: string = '.tag-row:not(.dragging)',
): HTMLElement | null {
    return findDragAfterElement(container, y, selector);
}

/**
 * Same as {@link getDragAfterElement} but for the manual-section list —
 * candidate selector is `.man-section-row:not(.man-dragging)`.
 */
export function getManDragAfterElement(
    container: HTMLElement,
    y: number,
): HTMLElement | null {
    return findDragAfterElement(container, y, '.man-section-row:not(.man-dragging)');
}

/**
 * Shared implementation for the two drag-target lookups above.
 *
 * `reduce` starts from `{ offset: Number.NEGATIVE_INFINITY }`. For each
 * child whose vertical midpoint lies above `y` (so `offset < 0`), we keep
 * the one with the largest (closest-to-zero) negative offset. If no child
 * qualifies, the initial `{ offset: -Infinity }` survives and `.element`
 * is `undefined` — the public wrappers normalize that to `null`.
 */
function findDragAfterElement(
    container: HTMLElement,
    y: number,
    selector: string,
): HTMLElement | null {
    const candidates = Array.from(
        container.querySelectorAll<HTMLElement>(selector),
    );

    let bestOffset = Number.NEGATIVE_INFINITY;
    let bestElement: HTMLElement | null = null;

    for (const child of candidates) {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > bestOffset) {
            bestOffset = offset;
            bestElement = child;
        }
    }

    return bestElement;
}

/**
 * Render the HTML for one row of an external URL source (Trakt / MDBList /
 * TMDb). The row holds the URL text input, the max-items number input, a
 * Test button, and a Remove button. Used in the tag-row builder for the
 * External source type.
 *
 * `value` is embedded into the `value="..."` attribute **without**
 * escaping — this is the legacy behavior. The `txtTagUrl` field is a plain
 * text input; if you ever start passing user-controlled strings that may
 * contain `"`, wrap them with {@link escapeHtml} at the call site.
 *
 * @param value  Initial URL text. Falsy values (`null`, `undefined`, `''`)
 *               render as an empty input.
 * @param limit  Maximum items to take from the source. Defaults to `0`
 *               (meaning "All"). Only `undefined` triggers the default;
 *               any number — including `0` — is honored as-is.
 * @returns      The row's HTML string.
 */
export function getUrlRowHtml(value: string | null | undefined, limit: number | undefined): string {
    const val = value || '';
    const lim = limit !== undefined ? limit : 0;
    return `
            <div class="url-row" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <div style="flex-grow:1;">
                    <input is="emby-input" class="txtTagUrl" type="text" label="Trakt/MDBList/TMDb URL" value="${val}" />
                </div>
                <div style="width:110px;">
                    <input is="emby-input" class="txtUrlLimit" type="number" label="Max (0=All)" value="${lim}" min="0" />
                </div>
                <button type="button" is="emby-button" class="raised button-submit btnTestUrl" style="min-width:60px; height:36px; padding:0 10px; font-size:0.8rem; margin-top:12px;" title="Test Source"><span>Test</span></button>
                <button type="button" is="emby-button" class="raised btnRemoveUrl btn-row-remove" title="Remove URL"><i class="md-icon">remove_circle_outline</i></button>
            </div>`;
}
