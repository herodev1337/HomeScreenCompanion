# Agent Quickstart — HomeScreenCompanion Migration

**Full reference**: `plan.md` (read this first if anything below is unclear).
**Repo root**: `/Users/bennoheichel/Documents/WORKSPACE/personal/HomeScreenCompanion`
**TS workdir**: `HomeScreenCompanion/ClientApp/`

## What we're doing

Replacing the 444 KB legacy AMD `Configuration/configPage.js` with strictly-typed TS modules. **No behavior changes** — the runtime bridge stays byte-equal until Phase 6 wires the AMD pipeline.

## Build / test commands

```sh
# From HomeScreenCompanion/ClientApp/
npm run typecheck          # must be 0 errors
npm test                   # module suite, TZ=UTC pinned
npm run test:legacy        # legacy fixture suite (runs build:legacy first)
npm run build              # bridge in-sync check

# From repo root
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release
dotnet test  tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
```

**Current green baseline**: typecheck 0 errors · module 267/0/0 · legacy 102/0/0 · bridge in-sync (444,519 bytes) · dotnet 69 pass / 7 skip / 0 fail.

## Critical rules

1. **Never edit `Configuration/configPage.js` or `ClientApp/src/legacy.js`** mid-migration — they must stay byte-equal. New code goes into `ClientApp/src/modules/*` only.
2. **Never commit test-fixtures/** (gitignored generated).
3. **Always run `npm run build` before committing** — if the bridge drift warning fires, something changed that shouldn't have.
4. **Phase 5 extractions must be sequential** — every remaining function in legacy.js touches the module-scope state vars (`cachedCollections`, `cachedPlaylists`, `cachedTags`, `lastHscConfig`, `currentManageSections`, `savedFilters`, `_lastStatus`, `_logTab`, `originalConfigState`, `_formAc`, `_miUsers`, `_topListTagNames`, `_hsePlaystate`).

## Module style

- Header JSDoc with `legacy.js:NNNN` source range + behavior contract.
- Strict types; `noUncheckedIndexedAccess` on — use `parts[0]!` after length checks.
- Explicit return types on exports.
- `escapeHtml` is canonical in `dom/dom.ts`; do not re-implement.
- For state/API-coupled functions: take a typed `XxxDeps` object (the `hscTab.ts` pattern) — never reach for globals. Examples: `HscDeps`, `MiFilterDeps`, `SavedFiltersSaveDeps`, `ManageDeps`, `TopListCreationDeps`, `TopListsTabDeps`.

## Testing patterns

### Pure helpers → legacy-fixture snapshot mirror (canonical)

1. Add function name to `EXPORTS` in `ClientApp/scripts/build-legacy-bundle.mjs`.
2. `npm run build:legacy` regenerates `test-fixtures/legacy/legacy.js`.
3. Add a test under `ClientApp/src/__tests__/legacy/<name>.test.ts` using `globalThis.__hsc_legacy`.
4. Mirror in `ClientApp/src/modules/<path>/<name>.test.ts` by reading the generated `.snap` file.

See `src/__tests__/legacy/README.md` and the `normalize` helper in `criteria.test.ts` for the exact recipe.

### DOM + fetch-heavy modules → focused smoke tests

For `manageTab`, `creation`, `topListsTab`, `rows`: build minimal DOM, mock `fetch` via `vi.fn(...).mockResolvedValue({ json: () => Promise.resolve(...) })`, pass deps via the `Deps` object, drain microtasks, assert structural shape. Do NOT try to use the snapshot-mirror pattern for these — it's too brittle (see §0.3 D in plan.md).

## Emby 4.10 model constraints (proven by reflection — do not "fix" in TS)

- `ContentSection` (home section) has `ItemTypes` (string[]) — **honored**.
- `ContentSection.Query` is `ItemsQuery` with **only** these fields honored: `IsPlayed`, `IsResumable`, `IsMovie`, `IsSeries`, `IsFavorite`, `IsRepeat`, `IsNews`, `IsSports`, `CollectionTypes`, `GenreIds`, `StudioIds`, `TagIds`.
- There is **NO `IncludeItemTypes`** on `ItemsQuery` — MediaType criteria must translate to `ContentSection.ItemTypes`.
- `Criteria/CriterionCatalog.cs` (C#) + `criteria.ts` (TS mirror) handle the translation. Series pivot rule: `InProgress` + `MediaType:Series` → `ItemTypes=[Episode]` (Series items never carry playback position).

## Known legacy quirks (don't "fix" — separate commit if ever)

- `parseDateYMD('15 Jan 2026')` → `{day:14,…}` in positive-UTC-offset TZs (uses UTC accessors).
- `getMaxDays(2)` hardcodes year 2001 → 28.
- `getDayOptions(_, 0)` → 31 (falsy fallback).
- `getWeekButtons` uses `includes` not strict-token — `'Monda'` lights Monday.
- `escapeHtml(null|undefined)` → literal `"null"`/`"undefined"`.
- `getUrlRowHtml` does not escape its `value` — caller-trusted.

## What's open (priority order)

1. **`state.ts`** — convert module-scope legacy vars to a typed module. Keystone for everything else.
2. **Phase 5 extractions** (sequential): `getHseUsers`/`preFetchLibraryData` → `syncHomeSectionFromEmby` + `initPlaylistTab` + `initHomeSectionTab` + `updateHseSectionAvailability` → `loadHscManageTab` → `loadTagManageTab` → `setupRowEvents` → toplist modals → `loadTopListsTab` body → `renderTagGroup` body → backup modals → log modals → `getUiConfig`/`checkFormState`/`applyFilters` → `updateSystemPromptResetBtn`.
3. **`index.ts`** — the top-level `return function (view)` factory. Last thing lifted.
4. **Wire AMD pipeline** (Phase 6) — replace `build-bridge.mjs` with Rollup AMD composition.
5. **C# split** (separate track): `HomeScreenCompanionTask.Execute` + the two ~1,000-line methods into `partial class` files; move DTOs into `Contracts/`.

## File index

```
HomeScreenCompanion/
├── Configuration/configPage.{html,js}      UNCHANGED (bridge in-sync)
├── HomeScreenCompanion/
│   ├── ClientApp/                            ← TS source + build
│   │   ├── package.json / tsconfig.json
│   │   ├── scripts/{build-bridge,build-legacy-bundle}.mjs
│   │   └── src/
│   │       ├── legacy.js                     byte-equal mirror of configPage.js
│   │       ├── modules/                      18 extracted TS modules
│   │       └── __tests__/legacy/             snapshot tests
│   ├── Criteria/CriterionCatalog.cs         C# catalog
│   └── *.cs                                  C# plugin source
├── tests/HomeScreenCompanion.Tests/          xUnit reflection tests
└── plan.md / agent-quickstart.md             this + the full plan
```

## Commit convention

`<Phase> wave N: <one-line summary>` with bulleted "What landed" + verification block in the body. Work is local — no push unless explicitly asked.
