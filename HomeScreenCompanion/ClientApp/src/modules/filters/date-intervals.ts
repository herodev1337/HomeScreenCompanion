// Phase 3: third leaf from `legacy.js`.
//
// Pure helpers that power the date-interval section of the filter UI:
//
//   - `parseDateYMD(dateStr)` — pure (regex on string, `new Date()` for
//     non-ISO fallback; no module state).
//   - `getMaxDays(month)` — pure (uses `new Date()` with a fixed year
//     trick, but the year is a literal — no module state).
//   - `getMonthOptions(selectedMonth)` — pure HTML-string builder.
//   - `getDayOptions(selectedDay, maxDay)` — pure HTML-string builder.
//   - `getWeekButtons(savedDays)` — pure HTML-string builder.
//
// All five are pure: no DOM reads, no module-scope state, no `ApiClient` /
// `Dashboard` / `fetch`. The HTML builders return strings — they are
// `escape`-style transforms, not DOM mutations.
//
// A few legacy quirks worth pinning (see also the mirror tests):
//
//   1. `parseDateYMD`'s fallback path uses `getUTCDate`/`getUTCMonth`/
//      `getUTCFullYear`. The date-only string `"15 Jan 2026"` is parsed
//      as `Jan 15 00:00 LOCAL`, which in any positive-offset TZ is
//      `Jan 14 23:00 UTC` — so `getUTCDate()` returns 14. That's the
//      legacy behavior and the snapshot pins it. Do not switch to
//      `getDate()`/`getMonth()` — that would silently shift for users
//      east of UTC.
//
//   2. `getMaxDays(2)` always returns `28` — the implementation pins
//      `Date(2001, ...)` and `2001` is not a leap year. This means the
//      UI is wrong in leap years for any interval that runs into
//      February. We've kept it because changing it is a behavior change
//      (the schedule UI is conservative on purpose), not a refactor.
//
//   3. `getMonthOptions` and `getDayOptions` compare `selectedDay == i`
//      with `==`, so the saved value can be a string or number
//      interchangeably. The snapshot pins the rendered output.

/**
 * The structured date shape produced by {@link parseDateYMD}. All fields
 * are 1-based (`month` 1 = January, `day` 1 = first of month).
 */
export interface DateYMD {
    readonly year: number;
    /** 1–12 (1 = January). */
    readonly month: number;
    /** 1–31. */
    readonly day: number;
}

/**
 * Parse a date string into a {@link DateYMD}.
 *
 * Two paths:
 *   1. **Fast path** (ISO `YYYY-MM-DD`): the regex `/^(\d{4})-(\d{2})-(\d{2})/`
 *      matches the leading 10 characters regardless of what follows
 *      (`T08:00:00Z`, `+02:00`, etc.). The captured groups are
 *      `+`-coerced to numbers — no `parseInt`, no radix weirdness.
 *   2. **Fallback** (anything else): `new Date(s)` is called and the UTC
 *      accessors are used. `Date`-only strings parse as UTC-midnight per
 *      spec, but browsers/Node often interpret them as local-midnight in
 *      practice (depending on engine / TZ); the UTC accessors give a
 *      consistent result for the snapshot.
 *
 * @param dateStr  Date string. Falsy (`''`, `null`, `undefined`) → `null`.
 * @returns        Parsed `{year, month, day}` or `null` if the input is
 *                 falsy or unparseable. Note: the ISO path does not
 *                 validate ranges — `"2026-13-45"` parses to
 *                 `{year:2026, month:13, day:45}`. That matches legacy.
 */
export function parseDateYMD(dateStr: string | null | undefined): DateYMD | null {
    if (!dateStr) return null;
    const s = String(dateStr);
    // Fast path: ISO YYYY-MM-DD (with or without time/tz suffix)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return { year: +m[1]!, month: +m[2]!, day: +m[3]! };
    // Fallback for non-ISO formats: parse with Date and use UTC accessors
    // (date-only strings are UTC midnight per spec, so getUTC* is correct)
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    }
    return null;
}

/**
 * Number of days in a month. Always evaluated against year 2001 (a
 * non-leap year), so February returns 28 — see file-level note #2.
 *
 * @param month  1-based month number (`1` = January). Out-of-range values
 *               are accepted by `Date` and roll over (e.g. `0` →
 *               December of the previous year). The function does not
 *               validate.
 */
export function getMaxDays(month: number): number {
    return new Date(2001, month, 0).getDate();
}

const MONTH_NAMES: ReadonlyArray<string> = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Build the `<option>` list for a month `<select>`.
 *
 * The selected month is matched with `==`, so a string `"3"` selects
 * March — that's the legacy contract.
 *
 * @param selectedMonth  1-based month number (1 = January). `undefined`
 *                       or any value outside 1..12 produces no `selected`
 *                       attribute on any option.
 * @returns              Concatenated `<option>` HTML string.
 */
export function getMonthOptions(selectedMonth: number | undefined): string {
    return MONTH_NAMES.map((m, i) =>
        `<option value="${i + 1}" ${selectedMonth == (i + 1) ? 'selected' : ''}>${m}</option>`,
    ).join('');
}

/**
 * Build the `<option>` list for a day `<select>`, capped at `maxDay`.
 *
 * Quirks:
 *   - `maxDay` is `||`'d to `31`, so `getDayOptions(x, 0)` produces 31
 *     days (because `0` is falsy). The schedule UI only ever passes
 *     `getMaxDays(month)` here, which is never `0`, so this is harmless.
 *   - `selectedDay == i` uses loose equality, same as the months helper.
 *
 * @param selectedDay  1-based day number to mark as `selected`. Loose
 *                     equality means strings work too.
 * @param maxDay       Upper bound (inclusive). Defaults to 31. Falsy
 *                     values other than `undefined` (e.g. `0`) also
 *                     fall back to 31.
 * @returns            Concatenated `<option>` HTML string.
 */
export function getDayOptions(selectedDay: number | undefined, maxDay: number | undefined): string {
    const cap = maxDay || 31;
    let html = '';
    for (let i = 1; i <= cap; i++) {
        html += `<option value="${i}" ${selectedDay == i ? 'selected' : ''}>${i}</option>`;
    }
    return html;
}

const WEEK_DAYS: ReadonlyArray<string> = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const WEEK_DAYS_SHORT: ReadonlyArray<string> = [
    'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
];

/**
 * Render the seven day-toggle buttons used by the weekly schedule UI.
 *
 * `savedDays` is the persisted value of the schedule's `DayOfWeek` field
 * — a comma-separated list of full English day names (e.g.
 * `"Monday,Wednesday,Friday"`). Matching is case-insensitive
 * (`(savedDays || "").toLowerCase()` and `d.toLowerCase()` are compared
 * with `String.prototype.includes`) but uses substring matching, so a
 * saved value of `"Monda"` would also light up Monday. The legacy test
 * suite pins this; treating it as an "exact token" check is a behavior
 * change, not a refactor.
 *
 * @param savedDays  Comma-separated saved days. `undefined` / `null` /
 *                   empty string → all buttons render in the inactive
 *                   state.
 * @returns          Concatenated `<button>` HTML string.
 */
export function getWeekButtons(savedDays: string | null | undefined): string {
    const saved = (savedDays || '').toLowerCase();

    return WEEK_DAYS.map((d, i) => {
        const isActive = saved.includes(d.toLowerCase());
        return `<button type="button" class="day-toggle ${isActive ? 'active' : ''}" data-day="${d}">${WEEK_DAYS_SHORT[i]}</button>`;
    }).join('');
}
