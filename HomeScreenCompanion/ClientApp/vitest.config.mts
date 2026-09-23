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
    }
});