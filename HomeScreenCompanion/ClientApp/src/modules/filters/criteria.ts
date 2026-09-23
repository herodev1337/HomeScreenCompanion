// Phase 3: first strictly-typed leaf from `legacy.js`.
//
// Three pure helpers lifted verbatim from
//     `Configuration/configPage.js` (legacy.js:870–926)
// behavior, with the `noUncheckedIndexedAccess` rules applied to the
// delimiter-split case in `parseCriterion`. No module-scope state; no
// DOM; no `ApiClient`. They take inputs and return outputs.
//
// The mapping tables (`MI_CRITERION_MAP`, `MI_REVERSE_MAP`) were
// also module-scope `var`s in legacy.js. They are pure data and fold
// cleanly into this module — they're recomputed once at module load.

/**
 * The structured shape produced by `parseCriterion` and consumed by
 * `buildCriterion`. Every field is always present; missing data is
 * represented as `""` (or `false` for `not`).
 *
 * The corresponding serialized form is:
 *   - `prop:val`                 (no op, no user)
 *   - `prop:op:val`              (with op)
 *   - `prop:userId:op:val`       (with user)
 *   - `<shorthand>`              (single token; see `MI_CRITERION_MAP`)
 *   - any of the above prefixed with `!` to set `not = true`
 *
 * "Invalid" means any criterion that, after parsing, would not survive
 * `buildCriterion`: i.e. `prop` empty or `val` empty. `buildCriterion`
 * collapses both into the empty string `""` (the filter UI treats
 * that as a missing/empty row).
 */
export interface Criterion {
    prop: string;
    op: string;
    val: string;
    userId: string;
    not: boolean;
}

/**
 * Shorthand tokens that stand in for a full criterion when written
 * alone (e.g. `4K` ⇔ `Resolution:4K`). Mirrors the table the legacy
 * `MI_CRITERION_MAP` defined at `configPage.js:870`.
 */
const MI_CRITERION_MAP: Readonly<Record<string, { readonly prop: string; readonly val: string }>> = {
    '4K': { prop: 'Resolution', val: '4K' },
    '8K': { prop: 'Resolution', val: '8K' },
    '1080p': { prop: 'Resolution', val: '1080p' },
    '720p': { prop: 'Resolution', val: '720p' },
    'SD': { prop: 'Resolution', val: 'SD' },
    'HEVC': { prop: 'VideoCodec', val: 'HEVC' },
    'AV1': { prop: 'VideoCodec', val: 'AV1' },
    'H264': { prop: 'VideoCodec', val: 'H264' },
    'HDR': { prop: 'HDR', val: 'HDR' },
    'DolbyVision': { prop: 'HDR', val: 'DolbyVision' },
    'HDR10': { prop: 'HDR', val: 'HDR10' },
    'Atmos': { prop: 'AudioFormat', val: 'Atmos' },
    'TrueHD': { prop: 'AudioFormat', val: 'TrueHD' },
    'DtsHdMa': { prop: 'AudioFormat', val: 'DtsHdMa' },
    'DTS': { prop: 'AudioFormat', val: 'DTS' },
    'AC3': { prop: 'AudioFormat', val: 'AC3' },
    'AAC': { prop: 'AudioFormat', val: 'AAC' },
    '7.1': { prop: 'AudioChannels', val: '7.1' },
    '5.1': { prop: 'AudioChannels', val: '5.1' },
    'Stereo': { prop: 'AudioChannels', val: 'Stereo' },
    'Mono': { prop: 'AudioChannels', val: 'Mono' },
    'InProgress': { prop: 'InProgress', val: 'InProgress' },
};

/**
 * Reverse of `MI_CRITERION_MAP`: `prop+':'+val` ⇒ shorthand token,
 * used by `buildCriterion` to keep the round-trip compressed.
 */
const MI_REVERSE_MAP: Readonly<Record<string, string>> = (() => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(MI_CRITERION_MAP)) {
        const m = MI_CRITERION_MAP[k]!;
        out[`${m.prop}:${m.val}`] = k;
    }
    return out;
})();

/**
 * Parse a criterion string into a structured {@link Criterion}.
 *
 * @param crit  e.g. `"Resolution:gte:1080p"`, `"4K"`, `"!Collection:Star Wars"`,
 *              or `null`/`undefined`. The legacy contract returns a default
 *              shape (`Resolution`, all-empty fields, `not:false`) for any
 *              falsy input rather than `null`.
 * @returns     A fully-populated `Criterion`. Never returns `null`.
 *
 * Invalid ⇒ a default-shape `Criterion` (the caller decides whether to
 * treat that as empty).
 */
export function parseCriterion(crit: string | null | undefined): Criterion {
    if (!crit) return { prop: 'Resolution', op: '', val: '', userId: '', not: false };
    const not: boolean = crit.charAt(0) === '!';
    const body: string = not ? crit.slice(1) : crit;

    // Collection / Playlist names may legitimately contain `:` — handle those
    // before splitting on the delimiter.
    const lcrit = body.toLowerCase();
    if (lcrit.startsWith('collection:') || lcrit.startsWith('playlist:')) {
        const ci = body.indexOf(':');
        return { prop: body.substring(0, ci), op: '', val: body.substring(ci + 1), userId: '', not };
    }

    const parts = body.split(':');
    if (parts.length === 1) {
        const mapped = MI_CRITERION_MAP[body];
        return mapped
            ? { prop: mapped.prop, op: '', val: mapped.val, userId: '', not }
            : { prop: '', op: '', val: body, userId: '', not };
    }
    // No-unchecked-indexed-access: `parts[0..3]` are `string | undefined` to
    // the compiler, but the length check above proves they're defined. Mark
    // accordingly so the rest of the function stays clean.
    if (parts.length === 2) return { prop: parts[0]!, op: '', val: parts[1]!, userId: '', not };
    if (parts.length === 3) return { prop: parts[0]!, op: parts[1]!, val: parts[2]!, userId: '', not };
    if (parts.length === 4) return { prop: parts[0]!, userId: parts[1]!, op: parts[2]!, val: parts[3]!, not };

    // ≥5 colons: not a recognized shape — same default as a falsy input.
    return { prop: 'Resolution', op: '', val: '', userId: '', not: false };
}

/**
 * Serialize a {@link Criterion} back to its canonical string form.
 *
 * @returns The serialized string. `""` indicates an invalid criterion —
 *          either `prop` is empty or `val` is empty. The filter UI treats
 *          this as a missing row; it is not an error.
 */
export function buildCriterion(prop: string, op: string, val: string, userId: string): string {
    if (!prop || val === '') return '';
    if (userId) return `${prop}:${userId}:${op}:${val}`;
    if (op) return `${prop}:${op}:${val}`;
    const key = `${prop}:${val}`;
    return MI_REVERSE_MAP[key] ?? `${prop}:${val}`;
}

/**
 * One-time migration: convert legacy comma-separated values into the
 * newline-separated form this codebase uses.
 *
 * @returns
 *   - The input unchanged if it is falsy (preserves `null` ⇆ `null`).
 *   - The input unchanged if it already contains a newline (`"\n"`-separated
 *     inputs are assumed already migrated; converting again would corrupt
 *     embedded commas inside items).
 *   - The input unchanged if it has no commas at all.
 *   - Otherwise: comma-split, trim each item, drop empties, re-join with `\n`.
 */
export function migrateCommaSeparated(val: string | null): string | null {
    if (!val || val.indexOf('\n') >= 0) return val;
    if (val.indexOf(',') < 0) return val;
    return val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join('\n');
}

/**
 * Classification of a criterion, mirror of `CriterionCatalog.CriterionClass`
 * in `Criteria/CriterionCatalog.cs` (server side). Keep the two in sync —
 * the server is authoritative; this is the client-side twin used by the
 * UI when it needs to reason about criteria without a round-trip.
 *
 * - `'global-only'`      — evaluated by the global library scan (tags, collections).
 * - `'viewer-scoped'`    — depends on the viewing user; resolved per user by the
 *                          home-section query (`IsPlayed` / `IsResumable`).
 * - `'static-queryable'` — static, expressible as a native section query
 *                          (e.g. `MediaType:Series` → `IncludeItemTypes`).
 */
export type CriterionClass = 'global-only' | 'viewer-scoped' | 'static-queryable';

/**
 * Classify a criterion string (see {@link CriterionClass}). Mirrors
 * `CriterionCatalog.Classify` server-side, including the rule that a
 * negated `MediaType` ("everything but X") has no native query equivalent
 * and therefore falls back to `'global-only'`.
 */
export function classifyCriterion(raw: string | null | undefined): CriterionClass {
    if (!raw) return 'global-only';
    const c = parseCriterion(raw);
    if (!c.prop) return 'global-only';

    const prop = c.prop.toLowerCase();
    if (prop === 'inprogress' && !c.userId && !c.op) return 'viewer-scoped';
    if (prop === 'isplayed' && c.userId === '__current__') return 'viewer-scoped';
    if (prop === 'mediatype' && !c.userId) return c.not ? 'global-only' : 'static-queryable';
    return 'global-only';
}

/**
 * True when the whole group can be expressed as a native per-viewer
 * home-section query: at least one viewer-scoped criterion and every other
 * criterion is either viewer-scoped or static-queryable. Mirrors
 * `CriterionCatalog.IsViewerOnlyGroup`.
 */
export function isViewerOnlyGroup(
    criteria: readonly (string | null | undefined)[] | null | undefined
): boolean {
    const list = (criteria ?? []).filter((c): c is string => !!c);
    if (list.length === 0) return false;
    const classes = list.map((c) => classifyCriterion(c));
    if (!classes.includes('viewer-scoped')) return false;
    return classes.every((k) => k !== 'global-only');
}
