import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Legacy fixture tests: load the *current* configPage.js verbatim from git,
// vendor a tiny AMD loader, expose internal pure helpers via a side-window
// shim, and snapshot their outputs. The same test files will then be pointed
// at the migrated TS bundle (Phase 5+) so behavior drift is caught without
// needing a running Jellyfin server.

export default defineConfig({
    test: {
        include: ['src/__tests__/legacy/**/*.test.ts'],
        environment: 'happy-dom',
        globals: true,
        root: path.resolve(__dirname, '.'),
        setupFiles: ['src/__tests__/legacy/setup.ts'],
        // TZ is pinned at the npm-script level (TZ=UTC). Setting it via
        // vitest config (test.env) is a no-op in Node 22; see vitest.config.mts.
    }
});
