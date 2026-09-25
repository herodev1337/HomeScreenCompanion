// D4 (form.ts split): pure predicates for "does this row / config have a
// viewer-dependent filter?". Extracted from `form.ts:411-454`.
//
// Both predicates live here because they have the same answer ("yes/no,
// this is a per-user criterion") and exist as a pair — one reads a
// persisted config object, the other reads the live DOM. The plan groups
// them deliberately so the per-user criterion detection lives in one
// leaf module instead of being split across `form.ts` and a sibling.

/**
 * A single media-info filter group from a tag row's `MediaInfoFilters`
 * (or the legacy single-group `MediaInfoConditions` array). The
 * function only inspects `Criteria`, so the field type is `unknown`
 * here — the legacy code does its own ad-hoc string parsing.
 */
export interface HseMediaInfoFilterGroupLike {
    Criteria?: readonly unknown[];
}

/**
 * A tag-row configuration shape, narrowed to the fields this module
 * reads. The full `TagConfig` is much richer; only the filter-related
 * keys are surfaced here so we don't have to drag the whole DTO type
 * into a leaf module.
 */
export interface TagConfigForFilters {
    MediaInfoFilters?: readonly HseMediaInfoFilterGroupLike[];
    MediaInfoConditions?: readonly string[];
}

/**
 * Decide whether a *config-object* `tagConfig` has a viewer-dependent
 * (per-user) filter — either the literal `InProgress` shorthand or a
 * criterion containing `':__current__:'`.
 *
 * Used at render time (`renderTagGroup`, `legacy.js:3217`) and as a
 * peer to {@link rowHasViewerCriteria} (which does the same check
 * against a live DOM row). The two intentionally differ: this one
 * reads the persisted config (for re-rendering from saved data), the
 * other reads the live DOM (for unsaved inline edits).
 *
 * The `!` prefix on a criterion is stripped before inspection because
 * the legacy parser treats `!InProgress` identically to `InProgress`
 * for our "is this a viewer criterion?" check.
 *
 * @param tagConfig  The row's persisted configuration. Falsy → `false`.
 * @returns          `true` if any criterion in any filter group is a
 *                   viewer criterion.
 */
export function tagConfigHasViewerCriteria(tagConfig: TagConfigForFilters | null | undefined): boolean {
    if (!tagConfig) return false;
    const filters: readonly HseMediaInfoFilterGroupLike[] =
        (tagConfig.MediaInfoFilters && tagConfig.MediaInfoFilters.length > 0)
            ? tagConfig.MediaInfoFilters
            : ((tagConfig.MediaInfoConditions && tagConfig.MediaInfoConditions.length > 0)
                ? [{ Criteria: tagConfig.MediaInfoConditions }]
                : []);
    let found = false;
    filters.forEach((f) => {
        (f.Criteria || []).forEach((c) => {
            const raw = String(c);
            const s = raw.charAt(0) === '!' ? raw.slice(1) : raw;
            if (s === 'InProgress' || s.indexOf(':__current__:') >= 0) found = true;
        });
    });
    return found;
}

/**
 * Decide whether a *live DOM* `row` has a viewer-dependent filter.
 * Inspects each `.mi-rule` inside `row` and looks at:
 *
 *   - `.selMiProperty` whose value is `'InProgress'`
 *   - `.selMiUser` whose value is `'__current__'`
 *
 * The dual-condition mirrors {@link tagConfigHasViewerCriteria}: the
 * per-user criterion can come from the prop dropdown *or* the
 * explicit-user dropdown, and the UI stores both shapes.
 *
 * @param row  A `.tag-row` element (or any element containing
 *             `.mi-rule` descendants).
 * @returns    `true` if any rule qualifies as viewer-dependent.
 */
export function rowHasViewerCriteria(row: Element): boolean {
    let found = false;
    row.querySelectorAll('.mi-rule').forEach((rule) => {
        const propEl = rule.querySelector('.selMiProperty') as HTMLSelectElement | null;
        const prop = (propEl?.value) || '';
        const selUserEl = rule.querySelector('.selMiUser') as HTMLSelectElement | null;
        if (prop === 'InProgress' || (selUserEl && selUserEl.value === '__current__')) found = true;
    });
    return found;
}
