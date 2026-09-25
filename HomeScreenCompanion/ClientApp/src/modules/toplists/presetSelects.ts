/**
 * Phase 6 (D3): the "Show this section" / "Image Type" preset `<select>`
 * markup that was duplicated between `showManualTopListModal`
 * (legacy.js:4876) and the manual branch of `loadInlineEditForm`
 * (legacy.js:5187). Both sites iterate the same option array, escape
 * each `value` through {@link escapeAttr}, each `label` through
 * {@link escapeHtml}, and add `selected` to the entry whose value
 * matches the preset.
 *
 * Behavior contract (matches legacy verbatim):
 *   - the option order and labels are pinned (always / tv / mobile,desktop
 *     for display mode; auto / Primary / Thumb for image type);
 *   - the selected entry is the one whose `val` matches `selected`
 *     (legacy uses `===`, so `selected` is normalized to a string first
 *     when it comes in as `null`/`undefined`/non-string — the caller is
 *     expected to pass `''` for "no preset").
 */

import { escapeAttr, escapeHtml } from '../dom/dom';

/** Render the "Show this section" options with one entry marked `selected`. */
export function renderDisplayModePresetOptions(selected: string): string {
    const options = [
        { val: '', label: 'Always' },
        { val: 'tv', label: 'When TV Display Mode is on' },
        { val: 'mobile,desktop', label: 'When TV Display Mode is off' },
    ];
    return options
        .map((o) =>
            '<option value="' + escapeAttr(o.val) + '"' + (o.val === selected ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>',
        )
        .join('');
}

/** Render the "Image Type" options with one entry marked `selected`. */
export function renderImageTypePresetOptions(selected: string): string {
    const options = [
        { val: '', label: 'Auto' },
        { val: 'Primary', label: 'Primary' },
        { val: 'Thumb', label: 'Thumb' },
    ];
    return options
        .map((o) =>
            '<option value="' + escapeAttr(o.val) + '"' + (o.val === selected ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>',
        )
        .join('');
}
