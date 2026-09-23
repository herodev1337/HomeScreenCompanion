/// <reference types="vitest" />
//
// Legacy fixture bootstrap. Runs once before any test in
// src/__tests__/legacy/**/*.test.ts (configured via vitest.legacy.config.mts).
//
// What it does:
//   1. Installs a minimal AMD `define` on `globalThis`. The legacy file is one
//      AMD module: define(['emby-input', ...], function () { ... return fn; });
//      The factory takes no deps parameters, so we only need to invoke it
//      and remember its return value (unused here).
//   2. Loads `test-fixtures/legacy/legacy.js` as text and evaluates it with
//      that `define`. The bundle was produced by `scripts/build-legacy-bundle.mjs`
//      which appends a single line just before the final `return`:
//          globalThis.__hsc_legacy = { parseDateYMD, getMaxDays, ... };
//   3. Verifies `globalThis.__hsc_legacy` is populated. If not, stashes the
//      error on `globalThis.__hsc_legacy_error` so individual tests can
//      `it.skip` with a clear message instead of crashing cryptically.
//
// We do NOT reimplement a full AMD loader (no dependency loading, no module
// registry across files). The legacy bundle has exactly one `define(...)`
// call and the factory does not use any external custom elements when we
// call only the exposed pure helpers.

import fs from 'node:fs';
import path from 'node:path';

declare global {
    // eslint-disable-next-line no-var
    var __hsc_legacy: Record<string, unknown> | undefined;
    // eslint-disable-next-line no-var
    var __hsc_legacy_error: unknown;
}

type AmdFactory = (...deps: unknown[]) => unknown;
type AmdDefine = ((deps: string[], factory: AmdFactory) => void)
    & ((factory: AmdFactory) => void);

function makeAmdDefine(): AmdDefine {
    const define = ((...args: unknown[]) => {
        const factory = (typeof args[0] === 'function' ? args[0] : args[1]) as AmdFactory;
        factory();
    }) as AmdDefine;
    return define;
}

const FIXTURE_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'test-fixtures',
    'legacy',
    'legacy.js'
);

function tryLoadFixture() {
    if (!fs.existsSync(FIXTURE_PATH)) {
        throw new Error(
            'Legacy fixture bundle missing at ' + FIXTURE_PATH + '. ' +
            'Run `npm run build:legacy` first (or `npm run test:legacy`, ' +
            'which depends on it).'
        );
    }
    const src = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const define = makeAmdDefine();
    try {
        // eslint-disable-next-line no-new-func
        new Function('define', src)(define);
    } catch (err) {
        throw new Error(
            'Legacy bundle failed to evaluate: ' +
            (err instanceof Error ? err.message : String(err))
        );
    }
    if (typeof globalThis.__hsc_legacy !== 'object' || globalThis.__hsc_legacy === null) {
        throw new Error(
            'Legacy bundle loaded but did not expose globalThis.__hsc_legacy. ' +
            'Did scripts/build-legacy-bundle.mjs run against the expected source?'
        );
    }
}

try {
    tryLoadFixture();
} catch (err) {
    globalThis.__hsc_legacy_error = err;
}

export {};