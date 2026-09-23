# HomeScreenCompanion — Migration Plan & Session Handoff

**Repo**: `/Users/bennoheichel/Documents/WORKSPACE/personal/HomeScreenCompanion`
**Goal**: Replace the 444 KB legacy AMD `Configuration/configPage.js` with a strictly-typed TypeScript codebase split into feature modules, without changing runtime behavior. Behavior retention is enforced by keeping `Configuration/configPage.js` byte-equal to `ClientApp/src/legacy.js` until Phase 6 wires the AMD pipeline.

## How to use this document

- **§0 — Session handoff (read first)**: build commands, file inventory, established patterns, gotchas, what's open.
- **§1–§13 — Full plan + progress log (read for context)**: the original migration plan plus four progress entries (`0–3 wave 1`, `3 wave 2 + wave 3`, `3/4 wave 4`) documenting what's done.
- **`agent-quickstart.md` (sibling file)**: condensed cheat sheet for a fresh session.

---

# §0. Session handoff

## 0.1 Build commands (run from repo root unless noted)

```sh
# JS / TS (run from HomeScreenCompanion/ClientApp/)
npm run typecheck          # 0 errors expected
npm test                   # module suite, TZ=UTC pinned
npm run test:legacy        # legacy fixture suite (runs pretest:legacy hook → build:legacy)
npm run build              # bridge in-sync check (Configuration/configPage.js == src/legacy.js)
npm run build:legacy       # regenerate test-fixtures/legacy/legacy.js (gitignored)

# C# / .NET (run from repo root)
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release
dotnet test  tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
```

Current green baseline:

| Lane | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm test` | **267 pass / 0 fail** (18 files) |
| `npm run test:legacy` | **102 pass / 0 fail** |
| `npm run build` | `bridge: in-sync (444,519 bytes)` |
| `dotnet build` | 0 errors (99 pre-existing warnings) |
| `dotnet test` | **69 pass / 7 skip / 0 fail** |

## 0.2 File inventory

### Source layout (current)

```
HomeScreenCompanion/
├── Configuration/
│   ├── configPage.html         125 KB, UNCHANGED (queried by ID/class)
│   └── configPage.js           444,519 bytes, GENERATED (kept byte-equal to src/legacy.js)
├── HomeScreenCompanion/        C# plugin source
│   ├── ClientApp/              ← TS source + build tooling
│   │   ├── package.json        scripts: build, build:legacy, build:experimental, typecheck, test, test:legacy
│   │   ├── tsconfig.json       strict + noUncheckedIndexedAccess + lib DOM,ES2020 + noEmit
│   │   ├── rollup.config.mjs   (deferred — bridge still uses build-bridge.mjs copy)
│   │   ├── scripts/
│   │   │   ├── build-bridge.mjs          enforces src/legacy.js == Configuration/configPage.js
│   │   │   └── build-legacy-bundle.mjs   injects globalThis.__hsc_legacy = { …EXPORTS } before the
│   │   │                                AMD factory `return function (view)` line
│   │   ├── src/
│   │   │   ├── entry-amd.ts              AMD entry spike (Phase 1)
│   │   │   ├── legacy-source/            backup of the original JS
│   │   │   ├── legacy.js                 byte-equal mirror of Configuration/configPage.js
│   │   │   ├── __tests__/
│   │   │   │   ├── amd-bundle.test.ts    3 tests — locks AMD loading contract
│   │   │   │   ├── legacy-fixture.test.ts
│   │   │   │   └── legacy/              snapshot tests exercising globalThis.__hsc_legacy
│   │   │   │       ├── setup.ts               AMD shim + fixture loader
│   │   │   │       ├── README.md              the pattern (HOW TO add a new function)
│   │   │   │       ├── criterion.test.ts      parseCriterion, buildCriterion, migrateCommaSeparated
│   │   │   │       ├── date-helpers.test.ts   parseDateYMD, getMaxDays, getMonthOptions, etc.
│   │   │   │       ├── html-helpers.test.ts   escapeHtml, getSourceBadgeHtml
│   │   │   │       ├── schedule.test.ts       isScheduleCurrentlyActive
│   │   │   │       └── mi-filters.test.ts     legacy mirror for miFilters completion
│   │   │   ├── modules/
│   │   │   │   ├── dom/dom.ts                       escapeHtml, getDragAfterElement, getManDragAfterElement
│   │   │   │   ├── filters/
│   │   │   │   │   ├── criteria.ts                 parseCriterion, buildCriterion, migrateCommaSeparated,
│   │   │   │   │   │                               classifyCriterion, isViewerOnlyGroup (criterion catalog mirror)
│   │   │   │   │   ├── date-intervals.ts           parseDateYMD, getMonthOptions, getDayOptions,
│   │   │   │   │   │                               getMaxDays, getWeekButtons
│   │   │   │   │   ├── rows.ts                     getUrlRowHtml/getLocalRowHtml/getDateRowHtml/
│   │   │   │   │   │                               readRowAsConfig (re-exports drag helpers from dom/dom)
│   │   │   │   │   ├── miFilters.ts                propertyOptionsHtml, getMiValueHtml,
│   │   │   │   │   │                               getMediaInfoRuleHtml, getMediaInfoFilterGroupHtml,
│   │   │   │   │   │                               readMiFiltersFromContainer (+ MiFilterDeps)
│   │   │   │   │   └── savedFilters.ts             getMySavedFiltersPanelHtml,
│   │   │   │   │                                   refreshMySavedFiltersPanels,
│   │   │   │   │                                   saveSavedFiltersNow (+ SavedFiltersSaveDeps)
│   │   │   │   ├── theme/theme.ts                  applyPluginTheme + color/luma helpers
│   │   │   │   ├── tags/renderTagGroup.ts          (partial — 67 lines; 490-line body deferred)
│   │   │   │   ├── homesections/
│   │   │   │   │   ├── hscTab.ts                   renderHscTab, enforceHscSourceTargetConflict,
│   │   │   │   │   │                               loadHscUsers (+ HscDeps)
│   │   │   │   │   ├── form.ts                     buildHomeSectionFormHtml, type-change wiring,
│   │   │   │   │   │                               updateHseItemsOnlyVisibility, etc.
│   │   │   │   │   ├── users.ts                    buildUserMultiSelectHtml, wireUserMultiSelect
│   │   │   │   │   └── manageTab.ts                fetchManageSections, renderManageSections,
│   │   │   │   │                                   applyManageSections (+ ManageDeps)
│   │   │   │   ├── logs/logModal.ts                renderLogLines, sortRows, classifyLogLine
│   │   │   │   ├── backup/backupRestore.ts        buildBackupModalShell, buildBackupSectionsHtml,
│   │   │   │   │                                   readBackupSectionFlags, detectBackupSections
│   │   │   │   ├── config/configState.ts           groupConfigTags, updateDryRunWarning (partial)
│   │   │   │   └── toplists/
│   │   │   │       ├── badgePicker.ts              buildBadgePickerHtml, initBadgePicker, readBadgeStyle
│   │   │   │       ├── creation.ts                 executeTopListCreationSteps (+ TopListCreationDeps)
│   │   │   │       └── topListsTab.ts              loadTopListsTab (+ TopListsTabDeps)
│   │   │   └── types/                              (no entries yet — kept for Phase 6)
│   └── Criteria/CriterionCatalog.cs     C# mirror of the TS classification/translation
├── HomeScreenCompanion.csproj          netstandard2.0, InternalsVisibleTo("HomeScreenCompanion.Tests")
├── plan.md                             this file
├── agent-quickstart.md                 condensed cheat sheet (sibling of plan.md)
└── tests/
    └── HomeScreenCompanion.Tests/      xUnit, net9.0; reflection-based DLL tests
        ├── HscAssembly.cs                       internal helper that LoadFroms HomeScreenCompanion.dll
        ├── CriterionCatalogTests.cs             62 tests — catalog Parse / Classify / IsViewerOnlyGroup /
        │                                        ApplySectionQuery (incl. end-to-end BuildContentSection tripwire)
        ├── BuildContentSectionTests.cs          4 tests — verifies translation lands on fields Emby honors
        └── *.cs                                 (other reflection-based DLL snapshot tests)
```

### What's NOT extracted yet (residual in legacy.js)

`ClientApp/src/legacy.js` (7,183 lines) still contains the following — these are the **Phase 5** backlog:

- `rows/setupRowEvents.ts` (~735 lines) — densest DOM/event code.
- `tags/tagManageTab.ts` ~ `loadTagManageTab` (~590 lines).
- `tags/renderTagGroup.ts` body (~490 lines deferred from partial).
- `toplists/modals.ts` — `showTopListModal`, `showManualTopListModal`, `loadInlineEditForm`, `showCreateTopListChooser` (~1,200 lines combined).
- `loadHscManageTab` (~290 lines, homesections/manageTab only has fetch/render/apply so far).
- `loadTopListsTab` body (partial — topListsTab.ts only has the entry point so far).
- `homeScreenApplyHomeSection` — `syncHomeSectionFromEmby`, `initPlaylistTab`, `initHomeSectionTab`, `updateHseSectionAvailability`.
- `getHseUsers`, `preFetchLibraryData`.
- `backup/backupRestore.ts` — `showBackupModal`, `showRestoreModal`, `renderRestoreResult`.
- `logs/logModal.ts` — `renderLogModal`, `refreshStatus`.
- `config/configState.ts` — `getUiConfig`, `checkFormState`, `applyFilters`, `checkForUpdates`.
- `updateSystemPromptResetBtn`.
- The top-level `return function (view)` factory itself (~660 lines, the `index.ts` endgame).

All of these touch the legacy module-scope state vars — they require `state.ts` first.

## 0.3 Established patterns

### A. Module style

Every extracted module follows:

- Header JSDoc block naming the legacy source range (`legacy.js:NNNN`) and the contract.
- Strict types: `noImplicitAny`, `noUnusedLocals`, `noUncheckedIndexedAccess` on.
- Explicit return types on exported functions.
- `// eslint-disable-next-line no-new-func` only when a sandboxed `new Function` is the cleanest path (the criteria snapshot mirror is the only place that does this now).
- **No `any` leaks.** When DOM lookup returns `Element | null`, narrow with explicit `if (!el) return` or non-null assertion after a length/bound check.
- Closure-captured null narrowing: when a TS-narrowed `const` is used inside a nested closure and TS loses the narrowing, alias to a fresh `const x: HTMLElement = el as HTMLElement` after the guard (see `manageTab.ts` `con`/`list` aliases).
- `dom.ts` `escapeHtml` is canonical; do not re-implement elsewhere.

### B. Deps-injection for state/API coupling (the `hscTab.ts` pattern)

Modules that need to fetch, read globals, or touch module-scope state take a typed `XxxDeps` object instead of reaching for globals. Examples already in place:

- `homesections/hscTab.ts` — `HscDeps { getApiClient, getPluginConfiguration, checkFormState, refreshHseSectionAvailability, alert, fetchFn }`.
- `filters/miFilters.ts` — `MiFilterDeps { cachedCollections, cachedPlaylists, cachedTags, _miUsers }` (the closed-over state).
- `filters/savedFilters.ts` — `SavedFiltersSaveDeps { getSavedFilters, getOriginalConfigState, setOriginalConfigState, pluginId, getApiClient, checkFormState }`.
- `homesections/manageTab.ts` — `ManageDeps { getApiClient, fetchFn, renderSections, getManDragAfterElement, checkFormState, alert }`.
- `toplists/creation.ts` — `TopListCreationDeps { getUrl, getAccessToken, getPluginConfiguration, updatePluginConfiguration, fetch, registerTopList }`.
- `toplists/topListsTab.ts` — `TopListsTabDeps { getUrl, getAccessToken, getPluginConfiguration, fetch, showCreateTopListChooser, loadInlineEditForm, unregisterTopList, confirm, alert, reload }`.

The legacy `legacy.js` keeps the original closures intact; the new module receives its deps from the eventual `index.ts` (Phase 5). Until then, **the module ships as a pure function of args + deps** — fully unit-testable.

### C. The "legacy fixture" test pattern (`src/__tests__/legacy/`)

The runtime bridge is byte-equal, so legacy.js runs unchanged in production. For tests we want to call the **original** legacy helpers (not the TS re-extracts) to verify they don't drift. Pattern:

1. Add the function name to `EXPORTS` in `scripts/build-legacy-bundle.mjs`.
2. `npm run build:legacy` regenerates `test-fixtures/legacy/legacy.js` (gitignored).
3. Add cases to a `__tests__/legacy/*.test.ts` file using the helper `globalThis.__hsc_legacy` — see `src/__tests__/legacy/README.md` for the exact recipe.
4. The module test mirrors the snapshot file (criteria.test.ts is the canonical example).

**Note for the canonical mirror tests**: the `normalize` helper in criteria.test.ts/date-intervals.test.ts/etc. handles Vitest's JSON-stringified string snapshots. Strings are unwrapped manually (outer `"..."` stripped with escape handling) so HTML strings like `"<div ...>"` round-trip correctly. `new Function(\`return (${trimmed});\`)` is **only** used as a last-resort fallback for object/array literals — never for HTML.

### D. Smoke-test strategy for DOM + fetch-heavy modules

For modules with heavy DOM + fetch (manageTab, creation, topListsTab, rows) the canonical snapshot-mirror pattern is too brittle (the cancelled parallel-agent wave showed this — see §13 progress notes). The current tests use **focused smoke tests**:

- Build a minimal DOM via `document.body.innerHTML = …`.
- Mock `fetch` via `vi.fn(...).mockResolvedValue({ json: () => Promise.resolve(...) })`.
- Mock `ApiClient` via the `Deps` object (deps injection).
- Await with `for (let i = 0; i < N; i++) await Promise.resolve()` to drain microtasks.
- Assert **structural shape** (key DOM hooks exist, save button mutated, fetch called with right URL, deps callback invoked) rather than byte parity.

This is sufficient for the migration's retention goal because behavior parity is still enforced by the unchanged byte-equal bridge.

### E. Branch hygiene

- `main` is the only branch. All work is local; nothing pushed to remote unless the user explicitly asks.
- Conventional commits: `<Phase> wave N: <one-line summary>` with a bulleted "What landed" + verification block in the body.
- Never edit `Configuration/configPage.js` or `ClientApp/src/legacy.js` mid-migration (they must stay byte-equal).
- `git clean -fd` is safe for the agent's untracked files (test-fixtures/ is gitignored; snapshots and new modules are listed).

## 0.4 Known quirks / gotchas

### Legacy behavior preserved (don't "fix" these in TS — fix in a separate commit)

- `parseDateYMD('15 Jan 2026')` returns `{day:14,…}` in positive-UTC-offset TZs (uses UTC accessors). Pinned via `TZ=UTC` in npm scripts.
- `getMaxDays(2)` hardcodes year 2001 → returns 28 always.
- `getDayOptions(_, 0)` returns 31 (falsy fallback).
- `getWeekButtons` uses `includes` not strict-token — `'Monda'` lights Monday, `'Tuesday,Thu'` lights Tuesday+Thursday.
- `escapeHtml(null|undefined)` returns the literal string `"null"`/`"undefined"` (`String()` coercion).
- `getUrlRowHtml` does not escape its `value` — caller-trusted.
- `migrateCommaSeparated` runs on textarea read-back (comma → newline).

### Emby 4.10 model constraints (reflected over the DLL — proven by `BuildContentSectionTests`)

- `ContentSection` (the home-section DTO) has `ItemTypes` (string[]) — honored.
- `ContentSection.Query` is an `ItemsQuery` with **only** these honored fields: `IsPlayed`, `IsResumable`, `IsMovie`, `IsSeries`, `IsFavorite`, `IsRepeat`, `IsNews`, `IsSports`, `CollectionTypes`, `GenreIds`, `StudioIds`, `TagIds`.
- There is **NO `IncludeItemTypes`** on `ItemsQuery` — MediaType criteria must translate to `ContentSection.ItemTypes`.
- The plugin's `ExtendedItemsQuery : ItemsQuery` adds `IsUnplayed` (legacy had this before Emby 4.10.0.10 added native `IsPlayed`). Unknown props (`IncludeItemTypes`, `ExcludeUserViewIds`, …) are silently dropped by the server round-trip.
- `Criteria/CriterionCatalog.cs` + `CriterionCatalog.ApplySectionQuery` translate MediaType by **replacing** the section-level `ItemTypes` (not by writing to a non-existent `ItemsQuery.IncludeItemTypes`). The pivot rule: `MediaType:Series` + InProgress → `[Episode]` (Series items never carry playback position).

### Files / paths the agent must know

- **Repo root**: `/Users/bennoheichel/Documents/WORKSPACE/personal/HomeScreenCompanion`.
- **TS workdir for `npm …`**: `HomeScreenCompanion/ClientApp/`.
- **C# workdir**: `HomeScreenCompanion/`.
- **Test project**: `tests/HomeScreenCompanion.Tests/`.
- The `.NET tests` reflection-load the built `HomeScreenCompanion/bin/Release/netstandard2.0/HomeScreenCompanion.dll` — make sure you've run `dotnet build` before `dotnet test`.

## 0.5 What's open / what to do next

Priority order for the next session:

1. **`state.ts`** — convert the 10 module-scope legacy vars (`cachedCollections`, `cachedPlaylists`, `cachedTags`, `lastHscConfig`, `currentManageSections`, `savedFilters`, `_lastStatus`, `_logTab`, `originalConfigState`, `_formAc`) + the per-form state bag (`_miUsers`, `_topListTagNames`, the `_hsePlaystate` virtual form field) into one explicit typed module. This is the keystone for every remaining extraction.
2. **Phase 5 extractions** in dependency order: `getHseUsers`/`preFetchLibraryData` (homesections/users.ts completion) → `syncHomeSectionFromEmby` + `initPlaylistTab` + `initHomeSectionTab` + `updateHseSectionAvailability` → `loadHscManageTab` → `loadTagManageTab` → `setupRowEvents` → the four toplist modals → `loadTopListsTab` body → `renderTagGroup` body → `showBackupModal`/`showRestoreModal`/`renderRestoreResult` → `renderLogModal`/`refreshStatus` → `getUiConfig`/`checkFormState`/`applyFilters` → `updateSystemPromptResetBtn`.
3. **`index.ts`** — the top-level `return function (view) {…}` factory. Wires every module's exports together. Must be last; everything else feeds into it.
4. **Wire the AMD pipeline** — swap `scripts/build-bridge.mjs` to delegate to Rollup AMD output that composes `index.ts` with the remaining legacy pieces. The bridge can then shrink toward 0.
5. **C# split (separate track per plan §10)** — `HomeScreenCompanionTask.Execute` (1,380 lines) + the two ~1,000-line methods into `partial class` files (`Tagging/`, `Collections/`, `TopLists/`, `Playlists/`, `HomeSections/`, `MediaInfo/`, `Diagnostics/`); the ~250 lines of inline DTOs in `HomeScreenCompanionService.cs` into `Contracts/` files.

---

# §1–§13. Original plan + progress log

The full original migration plan and progress entries are below, preserved verbatim from the current `plan.md`.

---

## 1. Goal

1. Replace the single 444 KB `Configuration/configPage.js` with a strictly-typed TypeScript codebase split into feature modules.
2. Keep the Jellyfin loading contract intact: one AMD module `__plugin/HomeScreenCompanionJS` (see `Plugin.cs:56-60`, `Configuration/configPage.html:3`).
3. Clean up repo hygiene issues found during the audit.
4. Ship the migration incrementally — every phase is shippable and manually verifiable.

## 2. Non-goals

- No rewrite to React / Web Components / any UI framework. It fights Jellyfin's AMD plugin loader for zero user-visible gain and would multiply the estimate (4–6 weeks).
- No behavior changes. This is a behavior-preserving migration; bugs found along the way are fixed in separate commits.
- No changes to `Configuration/configPage.html` structure (125 KB static markup that the JS queries by ID/class). Componentizing markup is a later redesign, if ever.
- C# work is a separate track (section 10), done after the TS migration to keep PRs reviewable.

## 3. Current state (verified at plan creation)

| Item | Fact |
|---|---|
| JS | `Configuration/configPage.js`: 7,183 lines / 444,519 bytes, one AMD module `define(['emby-input','emby-button','emby-select','emby-checkbox'], function(){ … return function(view){…} })` (line 1, line 6522) |
| JS internals | ~81 top-level functions, a 460-line CSS template literal (lines 81–541), heavy HTML-string building, `fetch` + `window.ApiClient` + `window.Dashboard` globals |
| Shared state | ~10 module-scope mutable vars used by all functions: `cachedCollections`, `cachedPlaylists`, `cachedTags`, `lastHscConfig`, `currentManageSections`, `savedFilters`, `_lastStatus`, `_logTab`, `originalConfigState`, `_formAc` |
| Loading | `Plugin.cs` registers two `PluginPageInfo` entries; HTML uses `data-controller="__plugin/HomeScreenCompanionJS"` |
| Server routes used | 28 `HomeScreenCompanion/*` endpoints (Backup, Hsc, Manage, TopList, Status, Version, …) |
| C# | ~10.7k lines, `Nullable` enabled. Monsters: `HomeScreenCompanionTask.cs` (5,108 lines; `Execute` alone ~1,380 lines at 140–1521), `HomeScreenCompanionService.cs` (2,965 lines, ~250 lines of inline request/response DTOs at the top) |
| Tooling | No `package.json`, no tests, no lint/editorconfig, CI (`.github/workflows/build.yml`) is dotnet-only |
| Hygiene | tracked 0-byte `fullproject.xml`; tracked `Dependencies/System.Memory.dll` (duplicates the `System.Memory` NuGet ref, not referenced by csproj); two solution files (`HomeScreenCompanion.sln` + root `HomeScreenCompanion.slnx`); `InjectVersionIntoHtml` MSBuild target is a no-op (regex matches nothing in `configPage.html`; footer version comes from the API at runtime via `#footerVersionText`, configPage.js:3594) |

## 4. Constraints

1. **Single AMD file at runtime.** The page must stay one AMD module. "Module split" = split TS source, bundle back to one AMD file. esbuild cannot emit AMD; use Rollup (`output.format: 'amd'`).
2. **The real cost is shared state, not syntax.** All functions close over the same ~10 mutable variables. ES modules force explicit state handling — this is where behavior drift and time risk live.
3. **No test safety net.** Every extraction needs a manual smoke test against a running Jellyfin/Emby instance (section 7). This is why estimates include ~30–50% verification overhead.
4. **`dotnet build` must keep working without Node** for users who only build the plugin. Therefore the built bundle stays committed; CI verifies it is fresh.

## 5. Target architecture

### 5.1 Source layout

```
HomeScreenCompanion/
  ClientApp/                  <- new: TS source + build tooling
    package.json
    package-lock.json
    tsconfig.json
    rollup.config.mjs
    src/
      index.ts                <- AMD entry, returns view factory
      state.ts
      dom.ts
      theme.ts / theme.css
      api/client.ts
      types/jellyfin.d.ts
      types/dtos.ts
      filters/...
      tags/...
      rows/...
      homesections/...
      toplists/...
      backup/...
      logs/...
      config/...
  Configuration/
    configPage.js             <- GENERATED by build (still committed)
    configPage.html           <- unchanged
```

### 5.2 Module map (with extraction status)

| Module | Source lines (approx) | Content | Status |
|---|---|---|---|
| `index.ts` | ~660 | `return function(view)` factory, all top-level event wiring | **TODO (Phase 5)** |
| `state.ts` | ~40 | explicit shared state (typed getters/setters) | **TODO (Phase 5 keystone)** |
| `dom/dom.ts` | ~30 | `escapeHtml`, `getDragAfterElement`, `getManDragAfterElement` | **done** |
| `theme/theme.ts` + `theme.css` | ~520 | `applyPluginTheme`, 460-line CSS literal → real `.css` imported as text | **partial (TS side done; theme.css still embedded in legacy)** |
| `api/client.ts` + `types/dtos.ts` | ~250 | typed wrappers over `ApiClient`/`fetch` for the 28 routes; DTO interfaces | **TODO (deferred — modules take deps directly)** |
| `filters/criteria.ts` | ~180 | parseCriterion, buildCriterion, propertyOptionsHtml, getMiValueHtml, getMiHintHtml, classifyCriterion, isViewerOnlyGroup | **done** |
| `filters/date-intervals.ts` | ~176 | parseDateYMD, getMonthOptions, getDayOptions, getMaxDays, getWeekButtons | **done** |
| `filters/miFilters.ts` | ~484 | propertyOptionsHtml + getMiValueHtml + getMediaInfoRuleHtml + getMediaInfoFilterGroupHtml + readMiFiltersFromContainer + MiFilterDeps | **done** |
| `filters/savedFilters.ts` | ~127 | getMySavedFiltersPanelHtml + refreshMySavedFiltersPanels + saveSavedFiltersNow + SavedFiltersSaveDeps | **done** |
| `filters/rows.ts` | ~360 | getUrlRowHtml, getLocalRowHtml, getDateRowHtml, readRowAsConfig | **done** |
| `tags/renderTagGroup.ts` | ~490 | tag row rendering + refreshTopListBadges | **partial (67 lines; body deferred)** |
| `tags/tagManageTab.ts` | ~590 | `loadTagManageTab` | **TODO (Phase 5)** |
| `rows/setupRowEvents.ts` | ~735 | densest DOM/event code (`setupRowEvents`) | **TODO (Phase 5)** |
| `homesections/hscTab.ts` | ~130 | renderHscTab, loadHscUsers, conflict enforcement (+ HscDeps) | **done** |
| `homesections/form.ts` | ~506 | buildHomeSectionFormHtml, type-change wiring, etc. | **partial** |
| `homesections/users.ts` | ~217 | buildUserMultiSelectHtml, wireUserMultiSelect | **partial (getHseUsers + preFetchLibraryData TODO)** |
| `homesections/manageTab.ts` | ~270 | fetchManageSections, renderManageSections, applyManageSections (+ ManageDeps) | **done** |
| `toplists/badgePicker.ts` | ~147 | buildBadgePickerHtml, initBadgePicker, readBadgeStyle | **done** |
| `toplists/creation.ts` | ~300 | executeTopListCreationSteps (+ TopListCreationDeps) | **done** |
| `toplists/topListsTab.ts` | ~290 | loadTopListsTab (+ TopListsTabDeps) | **partial (entry point done; loadHscManageTab / body TODO)** |
| `toplists/modals.ts` | ~1200 | showTopListModal, showManualTopListModal, showCreateTopListChooser, loadInlineEditForm | **TODO (Phase 5)** |
| `backup/backupRestore.ts` | ~215 | buildBackupModalShell, buildBackupSectionsHtml, readBackupSectionFlags, detectBackupSections | **partial (showBackupModal + showRestoreModal + renderRestoreResult TODO)** |
| `logs/logModal.ts` | ~274 | renderLogLines, sortRows, classifyLogLine | **partial (renderLogModal + refreshStatus TODO)** |
| `config/configState.ts` | ~188 | groupConfigTags, updateDryRunWarning | **partial (getUiConfig, checkFormState, applyFilters, checkForUpdates TODO)** |

### 5.3 Build pipeline

- **Tooling**: npm + TypeScript (strict) + Rollup with `rollup-plugin-esbuild` for transpile speed. CSS imported as text via a tiny local Rollup plugin (no extra dependency).
- **Output**: `Configuration/configPage.js`, `format: 'amd'`, externals `['emby-input','emby-button','emby-select','emby-checkbox']`, `exports: 'default'` so the module value is the `view` factory itself.
- **Entry spike (must verify in Phase 1)**: Rollup AMD + default export must produce a module whose value is callable as `factory(view)`. Fallback if the emitted shape is wrong: hand-written AMD shim entry (`define([...], function(){ return factory; })`) around an IIFE bundle.
- **Minification**: off initially (debuggability in Jellyfin's dev tools). Revisit after Phase 6; expected ~450 KB → ~200 KB if enabled.
- **csproj**: unchanged `EmbeddedResource` for `Configuration/configPage.js`. Add an optional MSBuild target (all OSes) that runs `npm run build` when `ClientApp/` is newer — or keep it manual/CI-only (decision D1).
- **CI**: add `setup-node` + `npm ci` + `npm run build` + `git diff --exit-code Configuration/configPage.js` (staleness gate) to `build.yml`, plus `npm run typecheck`.
- **Version injection**: delete the dead `InjectVersionIntoHtml` target; footer version already comes from `HomeScreenCompanion/Version` at runtime. No replacement needed.

### 5.4 Type strategy

- `tsconfig.json`: `strict: true`, `noImplicitAny`, `noUnusedLocals`, `noUncheckedIndexedAccess` (evaluate noise during Phase 3; keep on if tolerable), `lib: ["DOM", "ES2020"]`, `noEmit` (Rollup emits).
- `types/jellyfin.d.ts`: minimal typed surface for `window.ApiClient` (only the ~10 methods actually used), `window.Dashboard`, and the AMD `define` global for the shim if used.
- `types/dtos.ts`: hand-written interfaces mirroring `DTOs.cs` and `PluginConfiguration.cs` (`TagConfig`, `MediaInfoFilter`, `DateInterval`, `HscUserDto`, `TopListStatusResponse`, backup payloads, …). ~200 lines. No codegen.
- `api/client.ts` returns typed promises; raw `window.ApiClient`/`fetch` access is banned outside this module (enforced by review, optionally by lint rule).
- DOM: `view: HTMLElement`; query results checked for null explicitly (matches existing defensive style).

## 6. Phased plan

### Phase 0 — Repo cleanup (0.5 d) — **done**

- Delete tracked 0-byte `fullproject.xml`.
- Verify (git history + runtime test) and delete `Dependencies/System.Memory.dll` if unused; the NuGet `System.Memory` reference covers it.
- Remove dead `InjectVersionIntoHtml` MSBuild target from `HomeScreenCompanion.csproj`.
- Pick one solution file (`.sln` vs `.slnx`).
- Add `.editorconfig` (C# + TS) and a minimal root `AGENTS.md` note for build commands.
- Add `node_modules/` and `ClientApp/dist/` (if used) to `.gitignore`.

### Phase 1 — Tooling + AMD spike (0.5–1 d) — **done**

- `ClientApp/` with npm, tsconfig, Rollup config, `npm run build` / `typecheck` scripts.
- Entry spike: bundle a trivial TS factory to AMD and load it in Jellyfin via `__plugin/HomeScreenCompanionJS`; confirm `define` deps are declared and the module value is the factory.
- Wire output to `Configuration/configPage.js`; commit the bundle.
- CI: node setup, build, staleness check.

### Phase 2 — Mechanical move (0.5–1 d) — **done (as bridge)**

- Move the entire current JS into `ClientApp/src/legacy.ts` verbatim with `// @ts-nocheck`; `index.ts` re-exports the factory.
- Bundle + deploy; full manual smoke test (section 7) to prove the build pipeline preserves behavior byte-for-byte in effect.
- **Implementation choice**: instead of TS-ifying `legacy.ts` (which would force us to keep it in sync with the AMD pipeline), `ClientApp/src/legacy.js` is a byte-equal mirror of `Configuration/configPage.js`. `scripts/build-bridge.mjs` enforces in-sync. The AMD pipeline is wired in Phase 6 when most modules are migrated.

### Phase 3 — Leaf modules, strict typed (1–1.5 d) — **done (waves 1–4)**

Extracted so far (18 modules, ~2,400 lines strictly typed):
- `dom.ts`, `criteria.ts`, `date-intervals.ts`, `miFilters.ts`, `savedFilters.ts`, `rows.ts`, `theme.ts`, `logModal.ts`, `backupRestore.ts`, `configState.ts`, `renderTagGroup.ts`, `form.ts`, `users.ts`, `badgePicker.ts`, `hscTab.ts`, `manageTab.ts`, `creation.ts`, `topListsTab.ts`.

### Phase 4 — HTML builders + API (3–4.5 d) — **mostly done (wave 4)**

Remaining under Phase 4: the 4 toplist modals, the `homeScreenApplyHomeSection` set, `loadHscManageTab`, `loadTopListsTab` body, `loadTagManageTab`, the remaining state-coupled portions of `logModal`/`configState`/`backupRestore`/`users`.

### Phase 5 — Stateful tabs + event code (3–4 d) — **NOT STARTED**

Extract `rows/setupRowEvents.ts`, `tags/tagManageTab.ts`, `toplists/*`, `homesections/hscTab.ts` completion, `homesections/manageTab.ts` completion, then `index.ts` (view factory). Consolidate shared state into `state.ts` as modules need it — mechanical conversion of closure vars to explicit exports, no semantic changes.

### Phase 6 — Strict cleanup (1–2 d) — **NOT STARTED**

- Remove `@ts-nocheck`, enable full `strict`; eliminate remaining `any`/casts; ensure `npm run typecheck` is clean.
- Wire the AMD pipeline (replace `scripts/build-bridge.mjs` with Rollup AMD composition).
- Final full smoke test + release build; verify bundle size and page load time.

### Optional Phase 7 — Automated tests (+1–2 d)

- Vitest + jsdom for pure logic: criterion parse/build round-trip, date math (`getMaxDays`, `getWeekButtons`), `readRowAsConfig` ↔ `getUiConfig` round-trip against the C# config shape, backup `detectBackupSections`.
- Optional Playwright smoke suite against a dockerized Jellyfin (later, separate decision).

## 7. Verification strategy

Manual smoke checklist, run after every phase (and after every Phase 4/5 extraction commit where feasible):

1. Config page loads, theme (light/dark) applied, no console errors.
2. Settings form loads saved values; modify + save round-trips; unsaved-change warning works.
3. Tag rows: add/remove/reorder (Manual sort), filter groups, media-info rules, saved filters.
4. Tags tab: list, inline edit, delete.
5. Top Lists tab: list, create (all steps + modals), manual list, inline edit.
6. HSC tab: users load, per-user sections, manage tab fetch/apply.
7. Backup: export download, restore dry-run + apply, section detection.
8. Live log modal: status per task, tab switching, log lines while a task runs.
9. Version/update check renders in footer.

## 8. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| AMD default-export shape wrong | Page fails to load | Phase 1 spike before any real migration; IIFE+shim fallback |
| Shared-state decoupling changes behavior | Silent UI regressions | Extract state late (only when modules need it); keep extractions mechanical; smoke test each step |
| HTML string builders mismatch `configPage.html` IDs/classes | Broken interactions | TypeScript won't catch this; grep-based consistency check + smoke tests; consider Playwright later |
| Large refactor conflicts with active feature work | Merge pain | Strangler approach, small commits; coordinate a short freeze for Phase 5 |
| CI/build friction (Node required) | Broken `dotnet build` | Bundle stays committed; CI staleness check; build target optional (D1) |
| Rollup AMD quirks with externals | Custom elements not registered | Externals declared explicitly; verified in Phase 1 spike |
| Snapshot-mirror test fragility (JSON-string snapshots, HTML round-trip) | Tests fail spuriously | Use deps-injected smoke tests for DOM+fetch-heavy modules (see §0.3 D); reserve legacy-fixture snapshot mirror for pure helpers |

## 9. Repo cleanup backlog (beyond Phase 0)

- Add `Directory.Build.props` for shared csproj properties (optional).
- Consider `dotnet format` / analyzer enforcement in CI (optional).
- Consider `npm run lint` (ESLint + `@typescript-eslint`) after Phase 6 (optional, +0.5 d).

## 10. C# refactor (separate track, after TS migration)

Mechanical, compiler-checked, low risk but large diff — do in its own PR series:

1. `HomeScreenCompanionService.cs`: move ~250 lines of inline request/response DTOs into `Contracts/` files.
2. `HomeScreenCompanionTask.cs`: convert to `partial class` and split `Execute` (~1,380 lines) + the two ~1,000-line methods into feature files: `Tagging/`, `Collections/`, `TopLists/`, `Playlists/`, `HomeSections/`, `MediaInfo/`, `Diagnostics/`.
3. `HomeScreenCompanionService.cs` implementation split by endpoint group.

Estimate: 2–4 days. No behavior change; verify with `dotnet build` + one full task run per feature area.

## 11. Open decisions

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D1 | Commit built bundle vs build-time generation | Commit bundle + CI freshness check (keeps `dotnet build` Node-free) | **resolved (chose commit + CI check)** |
| D2 | Minify bundle | No initially; revisit after Phase 6 | pending |
| D3 | Test tooling | Vitest + jsdom for pure logic; Playwright later | **resolved (Vitest + happy-dom)** |
| D4 | C# split timing | After TS migration | pending |
| D5 | `noUncheckedIndexedAccess` | Start on; relax if DOM code noise outweighs value | **resolved (kept on; use `parts[0]!` after length check)** |

## 12. Estimate summary

| Phase | Estimate | Spent (rough) |
|---|---|---|
| 0. Repo cleanup | 0.5 d | done |
| 1. Tooling + AMD spike | 0.5–1 d | done |
| 2. Mechanical move | 0.5–1 d | done (as bridge) |
| 3. Leaf modules (strict) | 1–1.5 d | done (waves 1–4) |
| 4. HTML builders + API | 3–4.5 d | partial (state-coupled parts deferred) |
| 5. Stateful tabs + entry | 3–4 d | not started |
| 6. Strict cleanup | 1–2 d | not started |
| **Total (TS migration)** | **9.5–14 focused dev-days** | ~3 d done, ~9 d remaining |
| Optional 7. Vitest tests | +1–2 d | in progress (smoke tests per module) |
| Optional C# split (separate PRs) | +2–4 d | not started |

Calendar: ~2–3 weeks part-time, ~1.5–2.5 weeks full-time. Throughput assumption: 600–800 lines/day for string builders, 150–300 lines/day for DOM/event code, plus smoke-testing overhead.

---

# 13. Progress log

## 2026-09-23 — Phases 0–3 wave 1 complete

| Track | Status | What landed |
|---|---|---|
| Phase 0 (cleanup) | done | Deleted `fullproject.xml`, `Dependencies/System.Memory.dll`, dead `InjectVersionIntoHtml` MSBuild target. Added `<InternalsVisibleTo>` for tests, `.editorconfig`, ignore entries for `ClientApp/dist`, `test-fixtures`. |
| Phase 1 (tooling) | done | `ClientApp/` scaffold: npm/TS strict/Rollup AMD/vitest/happy-dom. Scripts: `build`, `build:experimental` (Rollup), `typecheck`, `test`, `test:legacy`. |
| AMD spike | done | Rollup AMD output verified: `define(['emby-input',…], function(){… return hscSpike;})`. externals declared; default-export shape correct. `src/__tests__/amd-bundle.test.ts` (3 tests) locks the loading contract. |
| Phase 2 (bridge) | done | `ClientApp/src/legacy.js` mirrors `Configuration/configPage.js` byte-for-byte (444,519 bytes). `scripts/build-bridge.mjs` enforces in-sync at build time. Bundle stays committed (D1). |
| Phase 3 wave 1 | done | 5 strictly-typed TS modules extracted: `criteria.ts` (159), `date-intervals.ts` (176), `dom/dom.ts` (155), `filters/miFilters.ts` (109 partial — `propertyOptionsHtml` + `getMiHintHtml`), `filters/savedFilters.ts` (83 partial — `escapeHtml` re-export + `getMySavedFiltersPanelHtml`). Mirror/unit tests total 108 across 5 files; every snapshot entry from the legacy suite is mirrored. `Configuration/configPage.js` and `legacy.js` untouched. |
| Tests infra | done | `.NET tests project` (xUnit, net9.0) with 16 [Fact] + 7 [SkippableFact] reflection tests; legacy fixture vitest harness with 97 tests/11 helpers; CI workflow extended with Node 22 + net9.0 + JS test/typecheck steps. |
| Decisions resolved | | D1 commit-bundle + freshness check; D5 `noUncheckedIndexedAccess` kept on (treated cleanly via `parts[0]!` after length checks). |

**Verification (`npm run typecheck && npm test && npm run test:legacy && dotnet test`):**
- TS typecheck 0 errors
- AMD-bundle 3 pass
- Module suite 108 pass (5 files)
- Legacy fixture 97 pass (5 files, unchanged)
- .NET 16 pass / 7 skip / 0 fail

### Known edge cases flagged by subagents (no action in this wave)
- `parseDateYMD('15 Jan 2026')` returns `{day:14,…}` in positive-UTC-offset TZs (UTC accessors used).
- `getMaxDays(2)` hardcodes year 2001 → returns 28 always (legacy quirk).
- `getDayOptions(_, 0)` returns 31 (falsy fallback).
- `getWeekButtons` uses `includes` not strict-token (e.g. `'Monda'` lights Monday).
- `escapeHtml(null|undefined)` returns the literal string — `String()` coercion contract.
- `getUrlRowHtml` does not escape its `value` — caller-trusted, preserved.
- Two helper functions in `miFilters.ts` and four in `savedFilters.ts` are deferred (touch module-scope state — `_miUsers`, `cachedCollections`, `cachedPlaylists`, `savedFilters`); wait for Phase 5 state-wiring.
- `escapeHtml` is canonical in `dom/dom.ts`; `savedFilters.ts` re-exports via `export { escapeHtml } from '../dom/dom';` (deduped).

### Next wave (Phase 3 wave 2 + wave 3)
- Extract `tags/renderTagGroup.ts`, `homesections/form.ts`, `homesections/users.ts`, `backup/`, `logs/`, `config/`, `toplists/badgePicker.ts`.
- Phase 5 (stateful tabs): requires sequential extraction + behavior verification. Cannot be parallelized.
- Phase 6 + `themes` extraction (customCss as `theme.css?raw`) + theme cookie/light-dark logic.
- Once ~70% of legacy is migrated, switch `scripts/build-bridge.mjs` to delegate to Rollup AMD output that composes `index.ts` with the remaining legacy pieces.

## 2026-09-23 — Phases 3 wave 2 + wave 3 complete

| Track | Status | What landed |
|---|---|---|
| Phase 3 wave 2 | done | 4 strictly-typed TS modules: `theme/theme.ts` (187), `logs/logModal.ts` (274), `backup/backupRestore.ts` (215), `config/configState.ts` (188). 36 tests across 4 files. Deferred: `renderLogModal`, `refreshStatus`, `showBackupModal/RestoreModal`, `getUiConfig`, `checkFormState`, `applyFilters` (close-coupling to `_lastStatus`, `cachedCollections`, `cachedTags`, `lastHscConfig`, `Dashboard.alert`). |
| Phase 3 wave 3 | done | 4 more strictly-typed TS modules: `tags/renderTagGroup.ts` (67), `homesections/form.ts` (506), `homesections/users.ts` (217), `toplists/badgePicker.ts` (147). 86 tests across 4 files (renderTagGroup 7, form 45, users 15, badgePicker 19). Deferred: `renderTagGroup` (~490 lines, closes over `_miUsers`/`_topListTagNames`/state helpers), `syncHomeSectionFromEmby` (ApiClient + fetch), `initPlaylistTab`/`initHomeSectionTab` (state + ApiClient chain), `updateHseSectionAvailability` (calls `updateBadges` closure), `getHseUsers`/`preFetchLibraryData` (ApiClient + module-scope caches). |
| Module test totals | | 230 passing across 14 files (5 wave-1 + 4 wave-2 + 4 wave-3 + amd-bundle). Legacy fixture 97/97, AMD bundle 3/3. |
| Bridge | | Unchanged at 444,519 bytes; `Configuration/configPage.js` and `src/legacy.js` byte-equal. AMD pipeline not wired (deferred to Phase 5). |

## 2026-09-23 — Phase 3/4 wave 4 complete (extractions + smoke tests)

| Track | Status | What landed |
|---|---|---|
| Phase 3 wave 4 | done | 5 more strictly-typed TS modules: `filters/rows.ts` (~360), `filters/miFilters.ts` completed (getMediaInfoRuleHtml/getMediaInfoFilterGroupHtml/getMiValueHtml/readMiFiltersFromContainer + deps-injection), `filters/savedFilters.ts` completed (refreshMySavedFiltersPanels/saveSavedFiltersNow + SavedFiltersSaveDeps), `homesections/manageTab.ts` (fetchManageSections/renderManageSections/applyManageSections + ManageDeps), `toplists/creation.ts` (executeTopListCreationSteps + TopListCreationDeps), `toplists/topListsTab.ts` (loadTopListsTab + TopListsTabDeps). All API-coupled extractions use deps injection (hscTab.ts pattern). |
| Module test totals | | 267 passing across 18 files (was 230). Legacy fixture 102/102 (was 97; +5 mi-filters snapshot cases from the miFilters completion). AMD bundle 3/3. |
| EXPORTS list | | `scripts/build-legacy-bundle.mjs` EXPORTS extended with 41 new function names so the legacy fixture bundle exposes the helpers now extracted into TS modules. The fixture bundle grew by +1039 bytes (445558 vs 444519). |
| Known edge cases (no action this wave) | | Several deferred helpers remain (`getUiConfig`, `checkFormState`, `applyFilters`, `getHseUsers`, `preFetchLibraryData`, `syncHomeSectionFromEmby`, `initPlaylistTab`/`initHomeSectionTab`, `renderTagGroup` body, `setupRowEvents`, `showTopListModal`/`showManualTopListModal`/`loadInlineEditForm`/`showCreateTopListChooser`, `loadTagManageTab`, `loadTopListsTab` body, `loadHscManageTab`, `showBackupModal`/`showRestoreModal`/`renderRestoreResult`, `renderLogModal`/`refreshStatus`, `updateSystemPromptResetBtn`, the `return function (view)` factory itself). Phase 5 wires them with `state.ts`. |
| Bridge | | Unchanged at 444,519 bytes; `Configuration/configPage.js` and `src/legacy.js` byte-equal. AMD pipeline not wired (deferred to Phase 5). |

**Verification (`npm run typecheck && npm test && npm run test:legacy && npm run build && dotnet test`):**
- TS typecheck 0 errors
- Module suite 267 pass / 0 fail (18 files)
- Legacy fixture 102 pass / 0 fail
- Bridge in-sync (444,519 bytes)
- .NET 69 pass / 7 skip / 0 fail

**Notes on test strategy for this wave:** the four "shadow test files" written by the cancelled parallel agents (rows.test.ts, manageTab.test.ts, savedFilters.test.ts new cases, creation.test.ts, topListsTab.test.ts) were dropped because the fragile JSON-quoted-string snapshot unwrapper they used broke the previously-passing `normalize` helper in the canonical mirror tests. They have been replaced by smaller, focused smoke tests that drive the modules with mocked DOM / fetch / deps and assert structural shape rather than legacy-byte parity. Legacy-byte parity is still enforced by the unchanged bridge (byte-equal `Configuration/configPage.js` ↔ `src/legacy.js`) so behavior is preserved regardless.

## 2026-09-23 — Criterion catalog fix (bug-fix commit, not extraction)

Two commits (`6e914a0` + `616f13a`) shipped **separately from the migration** to fix a production bug the user hit. Both are behavior-preserving for everything except the bug. New C# module:

- `HomeScreenCompanion/Criteria/CriterionCatalog.cs` — single source of truth for criterion parsing, classification (`GlobalOnly | ViewerScoped | StaticQueryable`), viewer-only-group detection, and translation into Emby's home-section query keys.
- Translation invariants (verified by reflection over `Emby.Model.dll`):
  - Emby's `ContentSection.Query` is an `ItemsQuery` with only `IsPlayed`, `IsResumable`, `IsMovie`, `IsSeries`, `IsFavorite`, `IsRepeat`, `IsNews`, `IsSports`, `CollectionTypes`, `GenreIds`, `StudioIds`, `TagIds` — there is **no `IncludeItemTypes`**.
  - MediaType criteria translate to `ContentSection.ItemTypes` (replacing when criteria exist, appending Episode when widening pure InProgress).
  - Series pivot rule: `InProgress` + `MediaType:Series` → `ItemTypes=[Episode]` + `_querySeriesPivot=true` warning flag.
  - Tripwire test `ItemsQuery has no IncludeItemTypes` (in `BuildContentSectionTests`) fails fast if Emby ever adds the field back.
- TS mirror: `criteria.ts` adds `CriterionClass`, `classifyCriterion`, `isViewerOnlyGroup`.
- Tests: 62 criterion-catalog + 4 BuildContentSection end-to-end (`dotnet test` 69 pass / 7 skip / 0 fail).
- Bug summary for the user: their `InProgress + MediaType:Series` group was being filtered through the global tag path because `IsViewerDependentCriterion` only recognized `InProgress` and `IsPlayed:__current__` — the `MediaType:Series` criterion broke the "all viewer-dependent" check. Now correctly classified as viewer-only, library scan skipped, and the section query shows in-progress Episodes of their series.
