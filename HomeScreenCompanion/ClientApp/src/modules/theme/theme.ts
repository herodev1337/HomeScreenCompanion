// Phase 3 wave 2: plugin-theme application, leaf module.
//
// Lifted from `Configuration/configPage.js` (legacy.js:21, lines 21-65 of
// the legacy mirror). The function reads no module-scope state, but it
// does read computed style off the live DOM (`getComputedStyle(el).backgroundColor`)
// and writes a handful of CSS custom properties to `document.documentElement`.
//
// There is a side-channel `_themeMode` that lets tests force the
// computed-color detection path:
//   - `getComputedStyleFor(el)` defaults to `el.getComputedStyle()` (the
//     DOM-standard call shape). happy-dom returns an empty value, so
//     without an override the function falls back to `isDark = true`.
//   - Tests override per element to exercise the light branch.
//
// The companion 460-line CSS template literal (legacy.js:75-540) lives
// at the top of `legacy.js` as `var customCss = …`. The plan calls for
// moving it to a real `.css` file in Phase 5+ when the AMD pipeline can
// compose TS modules into the prod bundle. Until then we keep it as a
// sibling string constant in this module and leave the module otherwise
// shape-identical (so the bridge builder keeps emitting a byte-equal
// `Configuration/configPage.js`).

/**
 * The minimum-luminance threshold used to classify the picked computed
 * background as "dark" or "light". The legacy constant is implicitly
 * `128` — see `legacy.js:33`:
 *
 *     isDark = (r * 0.299 + g * 0.587 + b * 0.114) < 128;
 *
 * Anything below the ITU-R BT.601 luma cutoff is treated as dark.
 */
export const LUMA_THRESHOLD = 128;

/**
 * The candidate elements walked in order — the first non-transparent
 * computed background wins. `.skinHeader` and `.mainDrawer` are the two
 * surfaces that carry the user's theme color in default Jellyfin skins.
 *
 * Read-only; same order as legacy.
 */
export const THEME_PROBE_SELECTORS: readonly string[] = [
    '.skinHeader',
    '.mainDrawer',
    '.contentScrollSlider',
    'body',
];

/**
 * The CSS-custom-property key/value map written onto
 * `document.documentElement.style` when the picked background classifies
 * as dark. Keys are the variable names (without the `--` prefix in the
 * call, but stored here with the dash to match the legacy string
 * verbatim). Values are literal CSS color strings.
 *
 * Mirrors `legacy.js:36-47`. Last entry (`pluginTheme`) is the
 * `data-` attribute value, captured separately as
 * {@link DARK_THEME_DATASET_MODE}.
 */
export const DARK_THEME_VARS: Readonly<Record<string, string>> = {
    'plugin-popup-bg':     '#2a2a2a',
    'plugin-popup-bg2':    '#333333',
    'plugin-popup-color':  '#e8e8e8',
    'plugin-popup-muted':  '#aaaaaa',
    'plugin-popup-border': 'rgba(255,255,255,0.12)',
    'plugin-popup-hover':  'rgba(255,255,255,0.08)',
    'plugin-popup-badge':  'rgba(255,255,255,0.1)',
    'plugin-input-border': 'rgba(255,255,255,0.2)',
    'plugin-input-bg':     'rgba(255,255,255,0.08)',
    'plugin-footer-bg':    '#181818',
};

/** Companion data-attribute value applied for the dark branch. */
export const DARK_THEME_DATASET_MODE = 'dark' as const;

/**
 * Light-branch counterpart of {@link DARK_THEME_VARS}. Same shape, same
 * key order; mirrors `legacy.js:48-59`.
 */
export const LIGHT_THEME_VARS: Readonly<Record<string, string>> = {
    'plugin-popup-bg':     '#f2f2f2',
    'plugin-popup-bg2':    '#e0e0e0',
    'plugin-popup-color':  '#1a1a1a',
    'plugin-popup-muted':  '#555555',
    'plugin-popup-border': 'rgba(0,0,0,0.15)',
    'plugin-popup-hover':  'rgba(0,0,0,0.08)',
    'plugin-popup-badge':  'rgba(0,0,0,0.1)',
    'plugin-input-border': 'rgba(0,0,0,0.28)',
    'plugin-input-bg':     'rgba(0,0,0,0.04)',
    'plugin-footer-bg':    '#c5cad1',
};

/** Companion data-attribute value applied for the light branch. */
export const LIGHT_THEME_DATASET_MODE = 'light' as const;

/**
 * Look up the resolved `backgroundColor` for one element.
 *
 * legacy.js does `getComputedStyle(el).backgroundColor`. happy-dom's
 * `getComputedStyle` returns empty for every property, so the test
 * harness overrides this via the `_getComputedStyle` slot (see
 * `applyPluginTheme`). In production this is just `getComputedStyle`.
 *
 * @param el  The element to inspect.
 * @returns   A CSS color string (`rgb(...)`, `rgba(...)`, named, etc.),
 *            or any falsy/empty value if the host cannot resolve it.
 */
export function readBackgroundColor(
    el: Element,
    getComputedStyleFn?: (target: Element) => CSSStyleDeclaration,
): string {
    const gcs = getComputedStyleFn ?? ((target: Element) => getComputedStyle(target as HTMLElement));
    return gcs(el).backgroundColor;
}

/**
 * Classify a CSS color string as "dark" or "light" using the legacy
 * ITU-R BT.601 luma weighting.
 *
 * @param bg  Any CSS color string. The first three integer runs are
 *            treated as r/g/b; anything else yields `isDark = true`
 *            (the legacy fallback when no match is found at line 33).
 * @returns   `true` for dark, `false` for light.
 */
export function isDarkBackground(bg: string | null | undefined): boolean {
    if (!bg) return true;
    const m = bg.match(/\d+/g);
    if (!m) return true;
    const r = parseInt(m[0] ?? '0', 10);
    const g = parseInt(m[1] ?? '0', 10);
    const b = parseInt(m[2] ?? '0', 10);
    return r * 0.299 + g * 0.587 + b * 0.114 < LUMA_THRESHOLD;
}

/**
 * Apply the plugin's CSS-variable theme to `document.documentElement`.
 *
 * Algorithm (legacy.js:21-65):
 *   1. Walk the {@link THEME_PROBE_SELECTORS} candidate list and pick
 *      the first computed `backgroundColor` that is non-empty and not
 *      `transparent`/`rgba(0,0,0,0)`.
 *   2. Compute `isDark` via the legacy luma cutoff (see
 *      {@link isDarkBackground}).
 *   3. Write the dark or light {@link DARK_THEME_VARS} /
 *      {@link LIGHT_THEME_VARS} onto `<html>` via `style.setProperty`,
 *      then set `root.dataset.pluginTheme` to the matching mode.
 *   4. Read `.mainDrawer`'s `getBoundingClientRect().right` and emit
 *      `--plugin-footer-left` so the plugin footer aligns with the
 *      nav drawer when the drawer covers the left half of the viewport.
 *
 * Pure given DOM access at call time. Reads `document.documentElement`,
 * `document.querySelector`, `getComputedStyle`, and `window.innerWidth`.
 * No module-scope reads, no `ApiClient`, no globals beyond the DOM.
 *
 * @param getComputedStyleFn  Optional override for the computed-style
 *                             lookup. Tests pass a per-element stubber;
 *                             production code uses the default which
 *                             calls the platform `getComputedStyle`.
 */
export function applyPluginTheme(
    getComputedStyleFn?: (target: Element) => CSSStyleDeclaration,
): void {
    let bg: string | null = null;
    for (const selector of THEME_PROBE_SELECTORS) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const c = readBackgroundColor(el, getComputedStyleFn);
        if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') {
            bg = c;
            break;
        }
    }

    const dark = isDarkBackground(bg);

    const root = document.documentElement;
    const vars = dark ? DARK_THEME_VARS : LIGHT_THEME_VARS;
    for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(`--${key}`, value);
    }
    root.dataset.pluginTheme = dark ? DARK_THEME_DATASET_MODE : LIGHT_THEME_DATASET_MODE;

    const drawer = document.querySelector('.mainDrawer');
    const drawerRight = drawer ? drawer.getBoundingClientRect().right : 0;
    const footerLeft =
        drawerRight > 0 && drawerRight < window.innerWidth * 0.5 ? drawerRight : 0;
    root.style.setProperty('--plugin-footer-left', footerLeft + 'px');
}
