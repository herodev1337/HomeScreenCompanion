# HomeScreenCompanionTask Refactor — Implementation Plan

**Source:** `HomeScreenCompanionTask-decomposition-plan.md` (the "why") + live codebase map (the "where").
**Goal:** Split `Execute` and `RunSingleEntryInternalAsync` into per-feature partials via a `RunContext` landing pad. Pure mechanical — no behavior change.
**Bonus:** Fix the cosmetic `TopList/Status` 404 in the config screen (pollutes network tab every 5s; doesn't break UI).

## Current state (verified against live code)

- **Host:** `HomeScreenCompanion/HomeScreenCompanionTask.cs` — **3,110 lines**.
- **`Execute`** (lines 137-1517, ~1,380 lines). **10 real phases** — the plan's labels are shifted by one:
  - Prologue (137-167) · Library scan + `imdbLookup` (168-192) · Cache init (194-468) · Per-group fetch/match loop (470-1064) · Playlists (1067-1091) · Tag-cache housekeeping (1093-1125) · Apply tags (1128-1251) · Collections (1252-1371) · Home sections (1373-1379) · Top-lists (1381-1385) · Epilogue (1387-1516).
- **`RunSingleEntryInternalAsync`** (lines 1535-2488, ~955 lines). 6 real phases:
  - Prologue incl. **AI refresh early-exit (1562-1573)** · Library scan + `imdbLookup` (1609-1623) · Cache init (1625-1846, conditional on `needsMediaInfoEval`) · Fetching sources (1848-2114) · Apply tags (2199-2355) · Collections + Playlists + Home sections + epilogue (2357-2487).
- **Partial files** (already extracted, 7 total): `Tagging/59`, `Collections/59`, `TopLists/255`, `Playlists/345`, `HomeSections/574`, `MediaInfo/743`, `Diagnostics/299`. All in namespace `HomeScreenCompanion`, all `public partial class HomeScreenCompanionTask`.
- **No `RunContext` exists** today. State flows through closure locals + 5 `public static` fields + 23 instance fields of `HomeScreenCompanionTask`.
- **`displayStatsList`** is created exactly once at line 1391 (epilogue), not per-phase as the plan implies.
- **`_formAc` and `matchedItemsByTag`** from the plan are **not in the code** — they were plan typos. Ignore.
- **Test suite:** xUnit 2.9.3, 69 pass / 7 skip / 0 fail, reflection-based DLL snapshot tests only. No orchestration coverage exists; manual smoke against a live Jellyfin is required.
- **CI commands** (mirror locally before each commit):
  ```bash
  dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release
  dotnet test  tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
  dotnet format whitespace HomeScreenCompanion/HomeScreenCompanion.csproj --verify-no-changes --no-restore
  ```

## Out of scope

- Nullable-warning sweep (~99 warnings). Own pass.
- Behavior changes / bug fixes. Own commits.
- Test rewrite (orchestration tests would require Jellyfin runtime; not viable).

## Migration order (8 atomic commits, each independently shippable)

### Commit 0 — Fix TopList Status 404 cosmetic poll

**Why:** Browser requests `/web/HomeScreenCompanion/TopList/Status` every 5s from `ClientApp/src/modules/logs/logModal.ts:435` (already wrapped in `.catch(() => null)`). The endpoint exists in source at `Contracts/TopListContracts.cs:9` + `Endpoints/TopListEndpoints.cs:32` — the deployed DLL is just stale. To avoid the noise for users on older DLLs (and as a defensive improvement), feature-detect once.

**Changes (frontend only):**
- `ClientApp/src/modules/logs/logModal.ts:432-435` — wrap the third `Promise.all` entry so the endpoint is only probed once and a 404 turns the per-5s poll off (cache `hasTopListStatus = false` in `appState.logStatus` after first 404, skip future polls).
- `ClientApp/src/modules/logs/logModal.test.ts:400` — update mock expectation if the URL string changes (it should not).

**Verify:** `npm test`, `npm run typecheck`, `npm run lint` from `ClientApp/`. No backend change required.

**Risk:** zero — purely defensive.

---

### Commit 1 — Add `RunContext` landing pad (only Execute populates it)

**Why:** Both `Execute` and `RunSingleEntryInternalAsync` share ~12 closure locals (debug/dryRun/logMissing/startTime/RunLog/imdbLookup/movieCount/seriesCount/allItems/…). Route them through a context object so phases can take it as a parameter.

**Changes:**
1. **New partial file** `HomeScreenCompanion/RunContext/HomeScreenCompanionTask.cs` — define `private sealed class RunContext`:
   ```csharp
   public required PluginConfiguration Config;
   public required bool Debug;
   public required bool DryRun;
   public required bool LogMissing;
   public required RunLog Log;
   public required DateTime StartTime;
   public required Stopwatch RunTimer;
   public required List<BaseItem> AllItems;
   public required Dictionary<string, List<BaseItem>> ImdbLookup;
   public required int MovieCount;
   public required int SeriesCount;
   public required List<GroupRunStats> StatsList;          // shared accumulator
   public required Dictionary<string, GroupRunStats> StatsByGroupKey;
   public TagConfig? EntryConfig;                          // single-entry only
   public List<TagConfig>? GroupEntries;                   // single-entry only
   ```
2. In `HomeScreenCompanionTask.cs`, extract the prologue+library-scan block (lines 137-192) into a private helper `BuildRunContext(out RunContext ctx)` that returns a fully populated context. `Execute` now reads:
   ```csharp
   if (!BuildRunContext(out var ctx)) return;
   // rest of Execute unchanged — closure locals become ctx. fields
   ```
3. Replace the 12 closure locals with `ctx.X` references throughout `Execute` only. `RunSingleEntryInternalAsync` stays untouched this commit.

**Verify:**
- `dotnet build -c Release` — zero new warnings.
- `dotnet test ... -c Release` — 69/7/0 unchanged.
- `dotnet format whitespace ... --verify-no-changes` — clean.
- Manual smoke: full sync against live Jellyfin (1 movie, 1 series, 1 tagged group) → log/results block identical to pre-refactor.

**Risk:** medium. Mechanical, but many touch points. The diff touches `Execute` only, leaving `RunSingleEntryInternalAsync` as the reference shape for the next step.

---

### Commit 2 — Move Tagging phase into `Tagging/HomeScreenCompanionTask.cs`

**Why:** Tagging is the largest single block (~390 lines in `Execute`: 1128-1251, plus the per-group fetch/match loop 470-1064 is conceptually *also* tagging — it's "fetch, then defer tag application"). Splitting the apply pass first; the per-group loop stays in the host for now.

**Changes:**
1. Move `Apply tags` (lines 1128-1251) verbatim into `Tagging/HomeScreenCompanionTask.cs` as `internal void ApplyTagsPhase(RunContext ctx)`:
   - Inputs: `ctx` (reads `.AllItems`, `.StatsList`, `.Config`, `.DryRun`, `.Debug`, `.Log`).
   - Closes over (read): `desiredTagsMap`, `allScannedEpisodeItems`, `allScannedSeasonItems`, `tagAddedByTag`, `tagRemovedByTag`. These stay as instance fields of `HomeScreenCompanionTask` (already class-scope); the helper just consumes them.
   - Outputs: `tagsAdded` counter back via `out int` parameter; calls `WriteTagDiffDebug`.
2. `Execute` shrinks to call `ApplyTagsPhase(ctx, out tagsAdded, out tagsRemoved, out itemsChanged)`.

**Verify:** same as commit 1, plus manual smoke that the `» Applying tags` banner output matches pre-refactor character-for-character (RunLog output is the easiest regression detector).

**Risk:** low-medium. The apply phase is purely linear; no branching state.

---

### Commit 3 — Move Collections phase into `Collections/HomeScreenCompanionTask.cs`

**Why:** Collections is the second-largest block (~280 lines: 1252-1371). Independent of tagging — can ship without waiting.

**Changes:**
1. Move `Collections` block (lines 1252-1371) verbatim into `Collections/HomeScreenCompanionTask.cs` as `internal void CollectionsPhase(RunContext ctx)`:
   - Inputs: `ctx` + reads instance fields `desiredCollectionsMap`, `collectionDescriptions`, `collectionPosters`, `activeCollections`, `previouslyManagedCollections`, `failedFetches`, `collCreatedSet`, `collItemsAdded`, `collItemsRemoved`.
   - Calls: `CleanupBoxSetTags` (already in this partial), `ApplyCollectionMeta`, `_collectionManager.*`, `_libraryManager.DeleteItem`, `SaveFileHistory`, `Plugin.Instance.SaveConfiguration()`.
   - Outputs: `tagsRemoved` += cleanup-boxset-tags result.
2. `Execute` calls `CollectionsPhase(ctx)`.

**Verify:** same commands + smoke that `» Collections` output is identical (collection count + cleanup count).

**Risk:** low.

---

### Commit 4 — Move Playlists + TopLists phases (do together)

**Why:** Plan notes these share the `groupPlaylistItems` accumulator (`Execute` lines 1067-1091 + 1381-1385). Splitting them apart would require a third intermediate type. ~155 lines total.

**Changes:**
1. `Playlists/HomeScreenCompanionTask.cs` — add `internal async Task PlaylistsPhase(RunContext ctx)` wrapping the `» Playlists` block (1067-1091). Reads `groupPlaylistItems`, `playlistGroupsToSkip`, `statsByGroupKey`.
2. `TopLists/HomeScreenCompanionTask.cs` — add `internal void TopListsPhase(RunContext ctx)` wrapping the `» Top-lists` block (1381-1385). Calls `CleanupDisabledPlaylists`, `SyncTopListFolders`, `TopListSyncTask.SyncAll`.
3. `Execute` calls both in sequence.

**Verify:** same + smoke that playlists still create/update (requires an actual playlist-configured group).

**Risk:** low.

---

### Commit 5 — Move HomeSections phase

**Why:** Smallest of the five phases (~7 lines in `Execute`: 1373-1379, delegating to `ManageHomeSections` which is already in `HomeSections/HomeScreenCompanionTask.cs:24`). Trivial wrapper.

**Changes:**
1. `HomeSections/HomeScreenCompanionTask.cs` — add `internal void HomeSectionsPhase(RunContext ctx)` wrapping the banner + `ManageHomeSections` call.
2. `Execute` calls `HomeSectionsPhase(ctx)`.

**Verify:** same + smoke that home sections are created/removed as before.

**Risk:** low.

---

### Commit 6 — Refactor `RunSingleEntryInternalAsync` to reuse the phase helpers

**Why:** Once `Execute` is a thin dispatcher over phase methods, single-entry mode can do the same — but with a single-entry `RunContext` (sets `EntryConfig` + `GroupEntries` to the resolved `tagConfig` and `config.Tags.Where(GroupKey match)`). This collapses `RunSingleEntryInternalAsync` from ~955 lines to ~150.

**Changes:**
1. In `RunContext` partial, add a factory `RunContext.ForSingleEntry(PluginConfiguration config, TagConfig entry, List<TagConfig> groupEntries, LibraryManager lm, ...)` that does the AI-skip-check internally (line 1562-1573) and either returns `null` (caller returns skipped tuple) or returns the populated context.
2. Rewrite `RunSingleEntryInternalAsync` as:
   ```csharp
   if (BuildSingleEntryContext(entryName, out var ctx, out var skipMessage))
       return (true, skipMessage);
   var gs = new GroupRunStats { ... };
   // ... apply tags, collections, playlists, home sections — same phase helpers
   return (gs.ErrorMessage == null, BuildSingleEntrySummary(...));
   ```
3. The four phase methods called by `RunSingleEntryInternalAsync` may need minor overloads (e.g. `ApplyTagsPhase` needs to operate on `tagOutputItems`/`collectionOutputItems` for a single group, not the all-items pass). Solution: keep two thin overloads per phase, both delegating to a shared internal core.

**Verify:** same + one-shot single-entry smoke (matches full-sync row for the same group).

**Risk:** medium-high. This is the most behaviorally subtle commit because single-entry mode has three unique branches (AI early-exit, `TagCacheManager.Instance.RemoveTagFromAllEntries` at 1855, immediate `SaveConfiguration()` at 2101). Keep all three in the `BuildSingleEntryContext` factory or in single-entry-specific guards.

---

### Commit 7 — Trim host file + remove stale index comment

**Why:** With phases extracted, host drops from 3,110 to ~400 lines. The `// Moved-to-partial method index` block (lines 3070-3110) now references methods that are all in their final homes — delete it.

**Changes:**
1. Final shrink of `HomeScreenCompanionTask.cs`:
   - `Execute` (~30 lines: prologue → context build → 5 phase calls → epilogue).
   - `RunSingleEntryAsync` (~10 lines: delegate to internal).
   - `RunSingleEntryInternalAsync` (~30 lines: context build → 4 phase calls → summary).
   - `BuildRunContext`, `BuildSingleEntryContext` helpers (~80 lines combined).
   - `BuildSingleEntrySummary`, `WriteResultsBlock` (~25 lines, already extracted).
   - Cross-cutting helpers kept in host per the index (~600 lines — leave intact, they're shared by both modes and many phases).
2. Delete the comment block at lines 3070-3110.
3. Update the new "Phase helpers" comment at lines 3055-3060 to reflect that the phases are now in partials.

**Verify:** `wc -l HomeScreenCompanion/HomeScreenCompanionTask.cs` should be ≤ 800. All CI commands green. Manual full smoke + single-entry smoke.

**Risk:** low. Mechanical trim only.

---

## Per-commit verification checklist

For every commit:
```bash
# 1. Build the main DLL (CI order is critical — tests load from bin/Release)
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release

# 2. Whitespace gate
dotnet format whitespace HomeScreenCompanion/HomeScreenCompanion.csproj --verify-no-changes --no-restore

# 3. Snapshot tests (69 pass / 7 skip / 0 fail baseline)
dotnet test tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
```

For commits 1-7, additionally run a **manual smoke** against a live Jellyfin:
1. Full sync on a library with ≥1 movie, ≥1 series, ≥1 tagged group, ≥1 collection, ≥1 playlist.
2. Single-entry run on the same group; results row matches full-sync row.
3. AI-tagged group: confirm refresh-due skip still works.
4. Dry-run mode: confirm no library writes.
5. Empty library case: confirm `displayStatsList` records zero matched/skipped.

## Per-commit atomicity rules

- One commit per `git commit` — never bundle two phase moves.
- Commit messages follow the repo style (`type(scope): subject`, e.g. `refactor(task): move apply-tags phase to Tagging partial`).
- Each commit's `Execute` and `RunSingleEntryInternalAsync` must remain functionally identical to the previous commit (no behavior drift allowed during the refactor).

## Effort estimate

| Commit | Effort | Risk |
|---|---|---|
| 0 (TopList 404) | 30 min | zero |
| 1 (RunContext) | 1 day | medium |
| 2 (Tagging) | 0.5 day | low-medium |
| 3 (Collections) | 0.5 day | low |
| 4 (Playlists+TopLists) | 0.5 day | low |
| 5 (HomeSections) | 0.25 day | low |
| 6 (SingleEntry refactor) | 0.5 day | medium-high |
| 7 (host trim) | 0.25 day | low |
| **Total** | **~3-4 days focused** | |

## Definition of done

After commit 7 lands:
- `wc -l HomeScreenCompanion/HomeScreenCompanionTask.cs` ≤ 800 (target ~400).
- No file in `HomeScreenCompanion/` exceeds ~750 lines.
- `dotnet test` baseline unchanged: 69 pass / 7 skip / 0 fail.
- `dotnet format whitespace --verify-no-changes` clean.
- Manual smoke (5 cases above) produces identical output to pre-refactor.
- Plan §10 C# refactor fully complete.
