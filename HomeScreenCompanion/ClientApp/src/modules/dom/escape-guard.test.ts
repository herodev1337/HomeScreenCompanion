/// <reference types="vitest" />
//
// C1 guard: `escapeHtml` / `escapeAttr` must have exactly one definition
// under `src/modules/` — the canonical one in `modules/dom/dom.ts`.
// Before C1 the codebase had six competing escape implementations
// (`escAttr` / `escHtml` / `escapeText` across users.ts, modals.ts,
// topListsTab.ts, tagManageTab.ts, miFilters.ts). This source scan keeps
// new duplicates from creeping back in.
//
// The eslint `no-restricted-syntax` guardrail is owned by task B4
// (`eslint.config.mjs` is out of scope for C1); this test is the
// executable guard until then.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MODULES_DIR = path.resolve(__dirname, '..');
const CANONICAL = path.resolve(__dirname, 'dom.ts');

/**
 * Matches a function/variable definition of one of the escape helper
 * names. Both the canonical (`escapeHtml` / `escapeAttr`) and the legacy
 * short names (`escHtml` / `escAttr`) are covered — the legacy names were
 * the duplicate implementations C1 removed.
 */
const DEFINITION_RE =
    /(?:function\s+(?:escape|esc)(?:Html|Attr)\s*\(|(?:const|let|var)\s+(?:escape|esc)(?:Html|Attr)\s*=)/;

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

describe('escape helper single source (C1 guard)', () => {
    it('defines escapeHtml/escapeAttr only in modules/dom/dom.ts', () => {
        const offenders: string[] = [];
        for (const file of walk(MODULES_DIR)) {
            const rel = path.relative(MODULES_DIR, file);
            if (rel.endsWith('.test.ts')) continue;
            if (path.resolve(file) === CANONICAL) continue;
            const src = fs.readFileSync(file, 'utf8');
            if (DEFINITION_RE.test(src)) offenders.push(rel);
        }
        expect(offenders).toEqual([]);
    });

    it('dom.ts exports both canonical helpers', () => {
        const src = fs.readFileSync(CANONICAL, 'utf8');
        expect(src).toMatch(/export function escapeHtml\(/);
        expect(src).toMatch(/export function escapeAttr\(/);
    });
});
