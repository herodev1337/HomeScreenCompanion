// Build a test fixture bundle from the legacy Configuration/configPage.js.
//
// The legacy file is one AMD `define([...], function () { ... return function(view) {...}; });`.
// Its inner helpers (`parseDateYMD`, `getMaxDays`, ...) are not exported — they're
// declared inside the factory body and never reachable from outside.
//
// This script reads the file verbatim and appends a single assignment just
// before the final `return function (view)` line:
//
//     globalThis.__hsc_legacy = { parseDateYMD, getMaxDays, ... };
//
// That adds one harmless global write and nothing else. Production behavior
// of `Configuration/configPage.js` itself is unchanged: the assignment runs
// during `define()` evaluation, before Jellyfin calls the returned view
// factory, and the global is never read by the legacy code.
//
// The resulting file is written to `ClientApp/test-fixtures/legacy/legacy.js`,
// which the Vitest setup file loads to expose the helpers to test cases.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.resolve(REPO_ROOT, 'Configuration', 'configPage.js');
const OUT_DIR = path.resolve(__dirname, '..', 'test-fixtures', 'legacy');
const OUT = path.resolve(OUT_DIR, 'legacy.js');

// Functions exposed to tests. Keep this list in sync with snapshot tests in
// ClientApp/src/__tests__/legacy/*.test.ts and the wrapper test that asserts
// at least 8 functions exist.
//
// All listed names must be declared as `function NAME(...)` inside the
// AMD factory body of Configuration/configPage.js. The shim writes a single
// `globalThis.__hsc_legacy = { ... }` line; only names declared in the
// factory closure can be referenced.
const EXPORTS = [
    'parseDateYMD',
    'getMaxDays',
    'getMonthOptions',
    'getDayOptions',
    'getWeekButtons',
    'migrateCommaSeparated',
    'parseCriterion',
    'buildCriterion',
    'escapeHtml',
    'isScheduleCurrentlyActive',
    'getSourceBadgeHtml',
    'getUrlRowHtml',
    'getLocalRowHtml',
    'getDateRowHtml',
    'getDragAfterElement',
    'getManDragAfterElement',
    'readRowAsConfig',
    'getMiValueHtml',
    'getMediaInfoRuleHtml',
    'getMediaInfoFilterGroupHtml',
    'readMiFiltersFromContainer',
    'refreshMySavedFiltersPanels',
    'saveSavedFiltersNow',
    'renderLogModal',
    'refreshStatus',
    'getHseUsers',
    'preFetchLibraryData',
    'syncHomeSectionFromEmby',
    'initPlaylistTab',
    'initHomeSectionTab',
    'updateHseSectionAvailability',
    'getUiConfig',
    'checkFormState',
    'applyFilters',
    'checkForUpdates',
    'renderTagGroup',
    'refreshTopListBadges',
    'setupRowEvents',
    'executeTopListCreationSteps',
    'showTopListModal',
    'showManualTopListModal',
    'loadInlineEditForm',
    'showCreateTopListChooser',
    'loadTopListsTab',
    'loadTagManageTab',
    'loadHscManageTab',
    'fetchManageSections',
    'renderManageSections',
    'applyManageSections',
    'showBackupModal',
    'showRestoreModal',
    'renderRestoreResult',
];

function main() {
    if (!fs.existsSync(SRC)) {
        console.error(`build-legacy-bundle: source not found: ${SRC}`);
        process.exit(1);
    }

    const src = fs.readFileSync(SRC, 'utf8');

    // Locate the final `return function (view)` inside the AMD factory.
    // The legacy file is one AMD module; its factory body has exactly one
    // such return. We anchor on the literal indentation used in the file
    // (4-space indent inside the outer `define` callback).
    const RETURN_MARKER = /^[ \t]*return\s+function\s*\(\s*view\s*\)\s*\{/m;
    const match = src.match(RETURN_MARKER);
    if (!match) {
        console.error(
            'build-legacy-bundle: could not find `return function (view)` ' +
            'inside Configuration/configPage.js. Did the legacy structure change?'
        );
        process.exit(1);
    }

    const insertionPoint = match.index;
    const exportsList = EXPORTS.join(', ');
    const assignment = `    globalThis.__hsc_legacy = { ${exportsList} };\n\n`;

    const out =
        src.slice(0, insertionPoint) +
        assignment +
        src.slice(insertionPoint);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT, out, 'utf8');

    const sizeIn = fs.statSync(SRC).size;
    const sizeOut = fs.statSync(OUT).size;
    console.log(
        `build-legacy-bundle: wrote ${OUT} ` +
        `(${sizeOut} bytes; source ${sizeIn} bytes; +${sizeOut - sizeIn})`
    );
}

main();