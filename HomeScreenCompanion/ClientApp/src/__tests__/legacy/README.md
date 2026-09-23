# Legacy fixture tests

Snapshot tests that pin the *current* behavior of `Configuration/configPage.js`
(the 7,183-line AMD module being migrated to TypeScript) so each TS
extraction in later phases can be verified against an identical contract.

## How it works

1. **`scripts/build-legacy-bundle.mjs`** reads `Configuration/configPage.js`
   verbatim, finds the `    return function (view) {` line inside the AMD
   factory, and inserts a single line just before it:
   ```js
   globalThis.__hsc_legacy = { parseDateYMD, getMaxDays, ... };
   ```
   The output is written to `test-fixtures/legacy/legacy.js` (gitignored).
   Production behavior of `Configuration/configPage.js` itself is unchanged —
   only an extra global is populated as a side effect during `define()`
   evaluation.

2. **`setup.ts`** runs once before any test in this directory. It:
   - Installs a tiny AMD `define` on `globalThis` (the factory takes no
     deps, so we just invoke it).
   - Loads the fixture bundle text and evaluates it via
     `new Function('define', src)(define)`.
   - Verifies `globalThis.__hsc_legacy` is now a populated object. If not,
     the error is stashed on `globalThis.__hsc_legacy_error` so the
     snapshot tests can skip themselves with a clear message instead of
     crashing with "is undefined".

3. **Snapshot tests** (`*.test.ts`) call helpers via
   `globalThis.__hsc_legacy.HELPER_NAME(args)` and `toMatchSnapshot()`.
   Each call produces a `.snap` file under `__snapshots__/`.

## Files in this directory

| File | Helpers tested |
|---|---|
| `setup.ts` | (bootstrap; not a test) |
| `legacy-fixture.test.ts` | wrapper test: harness sanity |
| `date-helpers.test.ts` | `parseDateYMD`, `getMaxDays`, `getMonthOptions`, `getDayOptions`, `getWeekButtons` |
| `criterion.test.ts` | `parseCriterion`, `buildCriterion` (round-trip), `migrateCommaSeparated` |
| `html-helpers.test.ts` | `escapeHtml`, `getSourceBadgeHtml` |
| `schedule.test.ts` | `isScheduleCurrentlyActive` (uses `vi.setSystemTime`) |

11 helpers covered, more than the 8-function floor from the task spec.

## Running

```sh
# From ClientApp/:
npm run build:legacy      # produce test-fixtures/legacy/legacy.js
npm run test:legacy       # builds fixture first (via pretest:legacy hook), then runs Vitest
```

`test:legacy` is wired to depend on `build:legacy` via the `pretest:legacy`
npm script — no manual step required.

## Adding a new function snapshot

1. Open `scripts/build-legacy-bundle.mjs` and add the function name to the
   `EXPORTS` array.
2. Re-run `npm run build:legacy`.
3. Either add a new test file under this directory, or extend an existing
   one. Pattern:
   ```ts
   import { describe, it, expect } from 'vitest';
   const legacy = globalThis.__hsc_legacy as Record<string, (...args: unknown[]) => unknown>;
   const setupErr = globalThis.__hsc_legacy_error;
   describe('my helper', () => {
       const itIfLoaded = setupErr ? it.skip : it;
       itIfLoaded('does the thing', () => {
           expect(legacy.myHelper('input')).toMatchSnapshot();
       });
   });
   ```
4. Run `npm run test:legacy`. The first run writes the snapshot file under
   `__snapshots__/`. Subsequent runs compare against it.

## Mirroring these tests in the migrated TS bundle

When Phase 3+ extracts a helper into `ClientApp/src/<module>.ts`, the
corresponding TS test must import from the *new* module and produce an
identical snapshot. Suggested layout during migration:

```
ClientApp/
  src/
    date.ts                 # parseDateYMD, getMaxDays, ...
    date.test.ts            # vitest against the TS module
    __tests__/legacy/date-helpers.test.ts   # this file (legacy snapshots)
```

Both tests run during CI:
- `npm test` runs `src/**/*.test.ts` (the TS tests under happy-dom).
- `npm run test:legacy` runs the legacy fixtures first, then `npm test`
  as part of CI can run both.

If the TS module's output disagrees with the legacy snapshot, `toMatchSnapshot`
fails — that is exactly the "behavior drift" signal we want. Updating the
legacy snapshot means *the TS migration changed the contract intentionally*
and should be reviewed carefully.

## When the migration completes

Once the TS bundle fully replaces the legacy file and the migration is
done, this directory's purpose is exhausted. Delete:
- `ClientApp/src/__tests__/legacy/`
- `ClientApp/scripts/build-legacy-bundle.mjs`
- The `build:legacy` and `test:legacy` scripts in `package.json`
- The `vitest.legacy.config.mts` file
- The `pretest:legacy` hook
- The `test-fixtures/legacy/` directory (already gitignored)