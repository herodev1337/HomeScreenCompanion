import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        // Legacy snapshot tests live under src/__tests__/legacy/ and run
        // exclusively via `npm run test:legacy` (which uses
        // vitest.legacy.config.mts). Their setup.ts expects to be invoked
        // by that config; running them here without it makes them all fail.
        exclude: ['src/__tests__/legacy/**', 'node_modules/**'],
        environment: 'happy-dom',
        globals: true,
        root: path.resolve(__dirname, '.'),
        // TZ is pinned at the npm-script level (TZ=UTC). Setting it via
        // `process.env.TZ` mid-process is a no-op on Node 22 — Date TZ is
        // baked in at startup. Script-level TZ matches the CI default
        // (ubuntu-latest has TZ=UTC) and keeps snapshots deterministic.
    }
});