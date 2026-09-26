#!/usr/bin/env node
// Pack HomeScreenCompanion_<version>.zip from the Release build output.
// Substitutes the version into meta.json, then zips DLL + meta.json into
// the Emby-expected plugin layout (top-level HomeScreenCompanion.dll +
// meta.json).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = process.env.HSC_VERSION_FILE ?? path.join(REPO_ROOT, 'version.txt');
const DLL_PATH = path.join(REPO_ROOT, 'HomeScreenCompanion', 'bin', 'Release', 'netstandard2.0', 'HomeScreenCompanion.dll');
const META_TEMPLATE = path.join(REPO_ROOT, 'HomeScreenCompanion', 'meta.json');
const OUT_DIR = path.join(REPO_ROOT, 'dist');

const version = readFileSync(VERSION_FILE, 'utf8').trim();
if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    console.error(`version.txt is malformed: ${JSON.stringify(version)}`);
    process.exit(1);
}
if (!existsSync(DLL_PATH)) {
    console.error(`DLL not found at ${DLL_PATH} — run 'dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release' first`);
    process.exit(1);
}

const meta = readFileSync(META_TEMPLATE, 'utf8').replace('@@VERSION@@', version);
mkdirSync(OUT_DIR, { recursive: true });
const metaOut = path.join(OUT_DIR, 'meta.json');
writeFileSync(metaOut, meta);

const zipPath = path.join(OUT_DIR, `HomeScreenCompanion_${version}.zip`);
const r = spawnSync('zip', ['-j', zipPath, DLL_PATH, metaOut], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Wrote ${zipPath}`);
