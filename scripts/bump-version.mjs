#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = process.env.HSC_VERSION_FILE ?? path.join(REPO_ROOT, 'version.txt');

const type = (process.argv[2] ?? 'build').toLowerCase();
const raw = readFileSync(VERSION_FILE, 'utf8').trim();
const segments = raw.split('.').map((s) => {
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
});
while (segments.length < 4) segments.push(0);

const [major, minor, patch, build] = segments;
const next = {
    major: [major + 1, 0, 0, 0],
    minor: [major, minor + 1, 0, 0],
    patch: [major, minor, patch + 1, 0],
    build: [major, minor, patch, build + 1],
    none: [major, minor, patch, build]
}[type];

if (!next) {
    console.error(`Unknown bump type "${type}" (expected build|patch|minor|major|none)`);
    process.exit(1);
}

const version = next.join('.');
if (type !== 'none') writeFileSync(VERSION_FILE, version);
console.log(version);
