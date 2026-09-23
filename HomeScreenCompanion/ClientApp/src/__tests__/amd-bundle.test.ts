/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Minimal AMD loader sufficient for the Rollup output:
//     define([deps], function(deps){ ... return value; })
// The factory's return value is recorded; dep names that aren't in the
// registry are filled with `null` (the legacy AMD module has deps but
// the factory ignores them, so they aren't actually consumed).
function makeLoader() {
    const modules: Record<string, unknown> = {};
    return {
        define(deps: string[] | ((...a: unknown[]) => unknown), factory?: (...a: unknown[]) => unknown) {
            let factoryFn: (...a: unknown[]) => unknown;
            if (typeof deps === 'function') {
                factoryFn = deps;
                deps = [];
            } else {
                factoryFn = factory!;
            }
            const depVals = (deps as string[]).map(d => modules[d] ?? null);
            modules.__last__ = factoryFn(...depVals);
        },
        modules
    };
}

const BUNDLE = path.resolve(__dirname, '../../../Configuration/configPage.js');

describe('AMD bundle (Rollup output)', () => {
    it('exists and is non-empty', () => {
        const buf = fs.readFileSync(BUNDLE);
        // bundle was regenerated; allow either the spike output or a real
        // build. Both must be non-empty.
        expect(buf.length).toBeGreaterThan(100);
    });

    it('declares the four eby-* externals in the AMD deps array', () => {
        const src = fs.readFileSync(BUNDLE, 'utf8');
        // All rollup outputs for this plugin declare these externals; the
        // exact spacing/comment style may vary, so match on each name.
        expect(src).toMatch(/emby-input/);
        expect(src).toMatch(/emby-button/);
        expect(src).toMatch(/emby-select/);
        expect(src).toMatch(/emby-checkbox/);
        // And it must be wrapped in `define(...)`.
        expect(src.trimStart().startsWith('define(')).toBe(true);
    });

    it('exports a callable factory via AMD `define`', () => {
        const src = fs.readFileSync(BUNDLE, 'utf8');
        const loader = makeLoader();
        // eslint-disable-next-line no-new-func
        new Function('define', src)(loader.define);
        const factory = loader.modules.__last__ as unknown;
        expect(typeof factory).toBe('function');
    });
});