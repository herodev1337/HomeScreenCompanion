/// <reference types="vitest" />
//
// Mirror + unit tests for `modules/theme/theme.ts`.
//
// Two happy-dom tests: exercise the dark branch (default `.skinHeader`
// surrogate with a dark color) and the light branch (`.skinHeader`
// surrogate with a light color). The legacy function reads
// `getComputedStyle(el).backgroundColor`; happy-dom's implementation
// returns empty, so we override per-element via `Object.defineProperty`
// — `applyPluginTheme` accepts a `getComputedStyleFn` parameter for this
// exact case.
//
// We assert on the side-effects written to
// `document.documentElement.style.setProperty(...)` and to
// `document.documentElement.dataset.pluginTheme` rather than on a full
// HTML diff.

import { describe, it, expect, beforeEach } from 'vitest';

import {
    applyPluginTheme,
    DARK_THEME_DATASET_MODE,
    DARK_THEME_VARS,
    LIGHT_THEME_DATASET_MODE,
    LIGHT_THEME_VARS,
    THEME_PROBE_SELECTORS,
} from './theme';

/**
 * Build a function that mimics the platform `getComputedStyle` shape:
 * it walks the probe-list children in `<body>`, returns an object with
 * a `.backgroundColor` matching `map`, and an empty value for any
 * element not in the map (so the probe falls through to `body`, the
 * last selector in the legacy list).
 *
 * `map` keys are selector strings; values are CSS color strings.
 */
function makeGcsStub(map: Readonly<Record<string, string>>): (el: Element) => CSSStyleDeclaration {
    return (el: Element): CSSStyleDeclaration => {
        const selector = THEME_PROBE_SELECTORS.find((s) => el.matches(s));
        const bg = selector ? (map[selector] ?? '') : '';
        // happy-dom ignores the actual `CSSStyleDeclaration` interface;
        // a duck-typed partial is enough.
        return { backgroundColor: bg } as unknown as CSSStyleDeclaration;
    };
}

/**
 * Make the probe-list queries resolve to real DOM elements.
 * happy-dom ignores `document.querySelector` shenanigans, so we
 * temporarily insert elements with the matching classes into the
 * document body. We never nest a `<body>` — `document.body` already
 * exists, the `'body'` key maps to it directly.
 */
function populateProbeElements(_selectorToBg: Readonly<Record<string, string>>): void {
    let body = document.body;
    if (!body) {
        body = document.createElement('body');
        document.documentElement.appendChild(body);
    }
    body.innerHTML = '';
    for (const selector of THEME_PROBE_SELECTORS) {
        if (selector === 'body') continue;
        const klass = selector.startsWith('.') ? selector.slice(1) : selector;
        const el = document.createElement('div');
        el.className = klass;
        body.appendChild(el);
    }
}

describe('applyPluginTheme — dark branch', () => {
    beforeEach(() => {
        document.documentElement.innerHTML = '';
        document.documentElement.dataset.pluginTheme = '';
        // Reset setProperty state by reassigning style (happy-dom holds
        // the same instance across tests).
        document.documentElement.removeAttribute('style');
        const body = document.body ?? document.createElement('body');
        body.innerHTML = '';
    });

    it('sets dark-theme vars when the picked background is dark', () => {
        // The first probe (`.skinHeader`) wins — give it a dark color.
        populateProbeElements({
            '.skinHeader': 'rgb(20, 20, 20)',
            '.mainDrawer': 'rgb(40, 40, 40)',
            '.contentScrollSlider': 'rgb(0, 0, 0)',
            'body': 'rgb(255, 255, 255)', // ignored
        });
        applyPluginTheme(makeGcsStub({
            '.skinHeader': 'rgb(20, 20, 20)',
            'body': 'rgb(255, 255, 255)',
        }));

        expect(document.documentElement.dataset.pluginTheme).toBe(DARK_THEME_DATASET_MODE);
        for (const [key, value] of Object.entries(DARK_THEME_VARS)) {
            expect(document.documentElement.style.getPropertyValue(`--${key}`)).toBe(value);
        }
        // Light vars must NOT be set. We pick one that has a value
        // distinct from its dark counterpart to make the assertion
        // meaningful.
        expect(document.documentElement.style.getPropertyValue('--plugin-footer-bg'))
            .toBe(DARK_THEME_VARS['plugin-footer-bg']);
    });

    it('emits the footer-left CSS var when .mainDrawer is in the left half', () => {
        populateProbeElements({
            '.skinHeader': 'rgb(20, 20, 20)',
            '.mainDrawer': 'rgb(40, 40, 40)',
            '.contentScrollSlider': 'rgb(0, 0, 0)',
            'body': 'rgb(0, 0, 0)',
        });
        const drawer = document.querySelector('.mainDrawer') as HTMLElement;
        const rect = { left: 0, right: 240, top: 0, bottom: 600, width: 240, height: 600, x: 0, y: 0 };
        Object.defineProperty(drawer, 'getBoundingClientRect', { value: () => rect });
        // Stub window.innerWidth so the branch picks drawerRight.
        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });

        applyPluginTheme(makeGcsStub({ '.skinHeader': 'rgb(20, 20, 20)' }));

        // 240 < 1280 * 0.5 (640) → foot sits at drawerRight.
        expect(document.documentElement.style.getPropertyValue('--plugin-footer-left'))
            .toBe('240px');
    });

    it('emits 0 for --plugin-footer-left when no .mainDrawer matches', () => {
        populateProbeElements({
            '.skinHeader': 'rgb(20, 20, 20)',
            // No .mainDrawer in this DOM.
            '.contentScrollSlider': 'rgb(0, 0, 0)',
            'body': 'rgb(0, 0, 0)',
        });
        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });

        applyPluginTheme(makeGcsStub({ '.skinHeader': 'rgb(20, 20, 20)' }));

        expect(document.documentElement.style.getPropertyValue('--plugin-footer-left'))
            .toBe('0px');
    });
});

describe('applyPluginTheme — light branch', () => {
    beforeEach(() => {
        document.documentElement.innerHTML = '';
        document.documentElement.dataset.pluginTheme = '';
        document.documentElement.removeAttribute('style');
        const body = document.body ?? document.createElement('body');
        body.innerHTML = '';
    });

    it('sets light-theme vars when the picked background is light', () => {
        // .skinHeader with a high-luma color → light branch.
        populateProbeElements({
            '.skinHeader': 'rgb(245, 245, 245)',
            '.mainDrawer': 'rgb(230, 230, 230)',
            '.contentScrollSlider': 'rgb(255, 255, 255)',
            'body': 'rgb(0, 0, 0)',
        });
        applyPluginTheme(makeGcsStub({ '.skinHeader': 'rgb(245, 245, 245)' }));

        expect(document.documentElement.dataset.pluginTheme).toBe(LIGHT_THEME_DATASET_MODE);
        for (const [key, value] of Object.entries(LIGHT_THEME_VARS)) {
            expect(document.documentElement.style.getPropertyValue(`--${key}`)).toBe(value);
        }
        expect(document.documentElement.style.getPropertyValue('--plugin-footer-bg'))
            .toBe(LIGHT_THEME_VARS['plugin-footer-bg']);
    });
});
