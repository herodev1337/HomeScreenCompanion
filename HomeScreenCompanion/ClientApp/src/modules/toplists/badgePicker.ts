// Phase 3 wave 3: top-list badge-picker HTML builder + DOM wiring,
// leaf module extracted from `Configuration/configPage.js`
// (legacy.js:4691–4734).
//
// Four exports:
//
//   - `_badgeStyles`         — the canonical badge palette as a
//                              `ReadonlyArray`. Lifted verbatim from
//                              the module-scope constant at legacy.js:4691.
//                              Re-exported under the `_` prefix to mirror
//                              the legacy name and signal that callers
//                              should generally go through the public
//                              API instead.
//   - `buildBadgePickerHtml` — pure HTML-string builder for the seven
//                              circular swatches + radio inputs.
//   - `initBadgePicker`      — DOM event wiring: clicking a swatch
//                              re-paints its border (the radio input
//                              itself is `pointer-events:none`).
//   - `readBadgeStyle`       — DOM read: returns the value of the
//                              checked radio input, defaulting to
//                              `'neutral'` when nothing is selected.
//
// No module-scope state is read or written by any of these helpers.

/**
 * One entry in the top-list badge palette. `noNumber: true` means the
 * preview swatch is rendered as an empty circle (e.g. for the "No
 * number" option) instead of a `7` digit.
 */
export interface BadgeStyle {
    val: string;
    label: string;
    bg: string;
    textColor: string;
    noNumber?: boolean;
}

/**
 * The canonical seven-entry badge palette. Order matters — it
 * determines the visual left-to-right order of the swatches in the
 * picker. The legacy constant was a `var`; we freeze it as
 * `ReadonlyArray<BadgeStyle>` to keep the module honest.
 *
 *   - `neutral`     — default; ~black with white text.
 *   - `slate-grey`  — darker blue-grey background.
 *   - `emby-green`  — the plugin's signature green (`#52B54B`).
 *   - `ocean-blue`  — a mid-blue.
 *   - `soft-red`    — a muted red.
 *   - `violet`      — purple.
 *   - `none`        — transparent background, no number rendered.
 */
export const _badgeStyles: ReadonlyArray<BadgeStyle> = [
    { val: 'neutral',    label: 'Neutral',    bg: 'rgba(0,0,0,0.82)',     textColor: '#fff' },
    { val: 'slate-grey', label: 'Slate grey', bg: 'rgba(65,65,75,0.88)',  textColor: '#fff' },
    { val: 'emby-green', label: 'Emby green', bg: 'rgba(82,181,75,0.78)', textColor: '#fff' },
    { val: 'ocean-blue', label: 'Ocean blue', bg: 'rgba(46,134,193,0.82)',textColor: '#fff' },
    { val: 'soft-red',   label: 'Soft red',   bg: 'rgba(201,69,69,0.82)', textColor: '#fff' },
    { val: 'violet',     label: 'Violet',     bg: 'rgba(123,82,181,0.82)',textColor: '#fff' },
    { val: 'none',       label: 'No number',  bg: 'transparent',          textColor: '#fff', noNumber: true },
];

/**
 * Build the badge-style picker HTML: a labeled row of seven circular
 * swatches, each wrapped in a `<label class="tl-badge-opt">` with a
 * hidden `<input type="radio" name="tlBadgeStyle">`. The active
 * swatch (the one whose `val` matches `selectedVal`) gets a green
 * border and its radio input gets the `checked` attribute.
 *
 * The radio inputs use `position:absolute;opacity:0;pointer-events:none;`
 * so the visible interaction is on the `<label>` wrappers
 * (`initBadgePicker` paints the border change on click). The `name`
 * attribute (`tlBadgeStyle`) is what {@link readBadgeStyle} keys off
 * of.
 *
 * @param selectedVal  One of `_badgeStyles[i].val`. Falsy
 *                     (`undefined`, `null`, `''`) → `'neutral'` is
 *                     preselected.
 * @returns            The picker's HTML string (single `<div>`).
 */
export function buildBadgePickerHtml(selectedVal: string | null | undefined): string {
    const sel = selectedVal || 'neutral';
    const cardBase = 'cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;border:2px solid transparent;transition:border-color 0.15s;';
    const cardActive = cardBase + 'border-color:#52B54B;';
    const cardInactive = cardBase + 'border-color:var(--line-color,rgba(255,255,255,0.12));';
    return '<div style="margin-bottom:16px;">' +
        '<span style="font-size:0.82em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;opacity:0.65;display:block;margin-bottom:8px;">Badge Style</span>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        _badgeStyles.map((s) => {
            const active = s.val === sel;
            return '<label class="tl-badge-opt" style="' + (active ? cardActive : cardInactive) + '">' +
                '<input type="radio" name="tlBadgeStyle" value="' + s.val + '" style="position:absolute;opacity:0;pointer-events:none;"' + (active ? ' checked' : '') + '>' +
                '<div style="width:46px;height:46px;border-radius:50%;background:' + s.bg + ';display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:' + s.textColor + ';font-family:sans-serif;">' + (s.noNumber ? '' : '7') + '</div>' +
                '<span style="font-size:0.78em;opacity:0.8;white-space:nowrap;">' + s.label + '</span>' +
                '</label>';
        }).join('') +
        '</div></div>';
}

/**
 * Attach a `click` listener to every `.tl-badge-opt` inside
 * `container`. Clicking a swatch paints its border green and clears
 * the border on every other swatch.
 *
 * Note: this only paints the visual state. It does NOT toggle the
 * underlying `<input type="radio" checked>` attribute — that's done
 * natively by the browser when the radio's `<label>` is clicked. So
 * {@link readBadgeStyle} will reflect the new selection on the next
 * read. The reason the helper also paints borders manually is that
 * the radio inputs are `pointer-events:none` (the legacy choice, so
 * the swatches themselves look clickable); without manual painting
 * the only feedback the user gets is the default browser radio dot.
 *
 * Silent when `container` has no `.tl-badge-opt` descendants.
 *
 * @param container  Element containing the swatch labels. Typically
 *                   the parent of the {@link buildBadgePickerHtml}
 *                   output.
 */
export function initBadgePicker(container: Element | null): void {
    if (!container) return;
    const opts = Array.from(container.querySelectorAll('.tl-badge-opt'));
    if (opts.length === 0) return;
    opts.forEach((label) => {
        label.addEventListener('click', () => {
            opts.forEach((l) => {
                (l as HTMLElement).style.borderColor = 'var(--line-color,rgba(255,255,255,0.12))';
            });
            (label as HTMLElement).style.borderColor = '#52B54B';
        });
    });
}

/**
 * Return the value of the currently-checked
 * `<input type="radio" name="tlBadgeStyle">` inside `container`.
 * Falls back to `'neutral'` if nothing is checked — matching the
 * default in {@link buildBadgePickerHtml}.
 *
 * @param container  Element to search. Usually the picker container
 *                   or its parent.
 * @returns          The selected badge style `val`, or `'neutral'`.
 */
export function readBadgeStyle(container: Element | null): string {
    if (!container) return 'neutral';
    const checked = container.querySelector('input[name="tlBadgeStyle"]:checked') as HTMLInputElement | null;
    return checked ? checked.value : 'neutral';
}
