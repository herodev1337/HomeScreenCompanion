// Phase 2+ bridge builder.
//
// During the mechanical-migration phase, the bundle that ships to Jellyfin
// is byte-equal to the legacy configPage.js. We extract modules from it into
// TS one at a time. Once everything in legacy.js has a TS replacement, we
// switch this script to call Rollup with the TS entry instead (Phase 5+).
//
// Why not always go through Rollup today? Because legacy.js is an AMD module
// (`define([...], function() { ... })`); passing it through Rollup's AMD
// output would double-wrap. The cleanest path is to mirror-and-swap during
// the migration: write TS modules that gradually *replace* the contents of
// legacy.js, then delete legacy.js entirely and switch on Rollup AMD.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'src', 'legacy.js');
const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(REPO, 'Configuration', 'configPage.js');

const srcBuf = fs.readFileSync(SRC);
let outBuf;
try {
    outBuf = fs.readFileSync(OUT);
} catch {
    outBuf = Buffer.alloc(0);
}

if (!outBuf.equals(srcBuf)) {
    fs.writeFileSync(OUT, srcBuf);
    console.error(`bridge: copied ${srcBuf.length} bytes -> Configuration/configPage.js`);
} else {
    console.error(`bridge: in-sync (${srcBuf.length} bytes)`);
}
