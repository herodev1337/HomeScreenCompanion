# HomeScreenCompanionTask full per-phase decomposition

**Goal**: Take the remaining monolith inside `HomeScreenCompanionTask.cs` (3,105
lines, partial-class host for 7 feature partials) and split the two big methods
(`Execute` ~1,371 lines and `RunSingleEntryInternalAsync` ~969 lines) into the
existing per-feature partials. No behavior change — pure mechanical refactor.

This document was written as a follow-up to the cleanup sweep that fixed the
broken CI gate, consolidated solution files, shipped `Directory.Build.props` +
`dotnet format whitespace` + ESLint, and minified the AMD bundle. It is meant
to be executed in a dedicated session.

## Why this isn't done yet (background from plan §0.5 #1)

`ca8b0c3` already converted `HomeScreenCompanionTask` to a partial class and
moved 76 methods into 7 feature partials. The two remaining monsters,
`Execute` and `RunSingleEntryInternalAsync`, share many local variables
(closures built up over the phase passes), so they cannot be sliced into
`Execute_Tagging` / `Execute_Collections` / `Execute_Playlists` / …
without first routing the closed-over locals through a context object. The
mechanical context-object refactor is the prerequisite for the full per-phase
split.

`WriteResultsBlock` and `BuildSingleEntrySummary` are already extracted phase
helpers (in the main partial, per the in-code comment at
`HomeScreenCompanionTask.cs:3055-3068`). They demonstrate the pattern but
only handle the post-loop reporting — the meat of `Execute` still lives in
the main partial.

## What `Execute` does today (line ranges, approximate)

`HomeScreenCompanionTask.cs:137-1533` — 1,396 lines.

```
Line range     Phase / role
137-167        prologue (IsRunning/ExecutionLog reset, banner, dry-run note)
168-280        library scan (allItems + imdbLookup + movie/series counts)
281-510        group staging (GroupRunStats + DisplayOrder + dedupe)
511-900        tagging phase (per-group scan + WriteTagDiffDebug)
901-1180       collections phase (per-group boxset creation + ApplyCollectionMeta)
1181-1380      playlists phase (SyncPlaylistsForEntryAsync orchestration)
1381-1480      top-lists phase (SyncTopListFolders orchestration)
1481-1500      home-section phase (lightweight; mostly EnableHomeSection bookkeeping)
1501-1533      epilogue (WriteResultsBlock + LastRunStatus)
```

## What `RunSingleEntryInternalAsync` does today (line ranges, approximate)

`HomeScreenCompanionTask.cs:1535-2490` — 955 lines.

```
Line range     Phase / role
1535-1605      prologue (entry lookup, AI refresh skip-check, banner)
1606-1740      library scan + DisplayName + stats init
1741-1900      tagging phase (single-group, including AI branch)
1901-2120      collections phase (single-group boxset)
2121-2240      playlists phase (single-group)
2241-2360      top-lists phase (single-group)
2361-2480      home-section phase + epilogue
2481-2490      return
```

## The context-object refactor (the actual blocker)

Both methods build up the same locals over the same shape:

```csharp
// Shared by both methods — exact same shape, different values.
bool debug = config.ExtendedConsoleOutput;
bool dryRun = config.DryRunMode;
bool logMissing = config.LogMissingItems;
var startTime = DateTime.Now;
_log = new RunLog(ExecutionLog, _logger, "", debug);
int movieCount = allItems.Count(i => i.GetType().Name.Contains("Movie"));
int seriesCount = allItems.Count(i => i.GetType().Name.Contains("Series"));
```

Plus the inner per-group state (`GroupRunStats gs`, per-source loops, the
`displayStatsList` accumulator, the `matchedItemsByTag` / `imdbLookup`
dictionaries, the `_formAc` cache for `ApplyFilters`/apply-side checks).

### Proposed refactor

1. Introduce a `RunContext` (or `ExecuteContext`) class — internal, allocated
   once per method invocation, populated by the prologue, passed by reference
   to per-phase helpers:

   ```csharp
   private sealed class RunContext
   {
       public required PluginConfiguration Config;
       public required bool Debug;
       public required bool DryRun;
       public required bool LogMissing;
       public required RunLog Log;
       public required DateTime StartTime;
       public required List<BaseItem> AllItems;
       public required Dictionary<string, List<BaseItem>> ImdbLookup;
       public required int MovieCount;
       public required int SeriesCount;
       public required List<GroupRunStats> StatsList;
       // single-entry-only:
       public required TagConfig? EntryConfig;
       public required List<TagConfig>? GroupEntries;
   }
   ```

2. Replace the closure locals in `Execute` with a single `var ctx = new
   RunContext { … };` populated by the prologue block (lines 137-280).
   Each phase method becomes `private void PhaseX(RunContext ctx, …)`.

3. The partial-class files (`Tagging/`, `Collections/`, `Playlists/`,
   `TopLists/`, `HomeSections/`) get phase helpers that take the context:

   ```csharp
   // Tagging/HomeScreenCompanionTask.cs (new partial file or append)
   internal void TaggingPhase(RunContext ctx)
   {
       // lifted verbatim from HomeScreenCompanionTask.Execute lines 511-900
   }
   ```

4. `RunSingleEntryInternalAsync` becomes a thin wrapper around the same
   phase helpers, parameterized by a single-entry `RunContext`.

### Risk surface

The risk is behavior drift, not compile errors. Both methods use the same
locals but with different **scope** (full run iterates groups; single-entry
runs one). The risk is in subtle "what if the group list is empty?"
branches and in the AI refresh skip-check at the top of `RunSingleEntry`.

**Mitigation**: ship the refactor as 4 atomic commits with reflection-based
test runs between each:

| Commit | What ships                                                       | Verification                |
|--------|------------------------------------------------------------------|----------------------------|
| 1      | Add `RunContext` class + populate it from `Execute` prologue     | `dotnet test` green        |
| 2      | Move tagging phase (lines 511-900) to `Tagging/HomeScreenCompanionTask.cs` as `TaggingPhase(RunContext)` | `dotnet test` green + manual smoke (full sync of one group) |
| 3      | Move collections / playlists / top-lists / home-sections phases | `dotnet test` green + manual smoke |
| 4      | Refactor `RunSingleEntryInternalAsync` to reuse the same phase helpers via a single-entry context | one-shot single-entry smoke + `dotnet test` |

## Per-phase line budget after decomposition

Target: no file in `HomeScreenCompanion/` exceeds ~700 lines. Today:

```
File                                       Lines   Notes
HomeScreenCompanionTask.cs (host)           3,105  target: ~400
Tagging/HomeScreenCompanionTask.cs             59  target: ~600 (phase + helpers)
Collections/HomeScreenCompanionTask.cs         59  target: ~400
TopLists/HomeScreenCompanionTask.cs           255  target: ~550
Playlists/HomeScreenCompanionTask.cs          342  target: ~500
HomeSections/HomeScreenCompanionTask.cs       574  target: ~700
MediaInfo/HomeScreenCompanionTask.cs          714  already at target — no change
Diagnostics/HomeScreenCompanionTask.cs        299  target: ~400
```

## Migration order (suggested)

1. **Context object** — landing pad. ~150 lines of changes including the new
   partial. Pure mechanical; `dotnet test` 76/76 stays green.
2. **Tagging phase** — the largest single block (390 lines). Highest ROI
   because once it moves, the rest is straightforward.
3. **Collections phase** — second-largest (280 lines). Independent of
   tagging; can land in parallel if desired.
4. **Playlists + TopLists phases** — share `displayStatsList` accumulator,
   so do them together.
5. **HomeSections phase** — smallest of the five phases, can land last.
6. **`RunSingleEntryInternalAsync` consolidation** — refactor to reuse the
   same phase helpers via a single-entry `RunContext`. This is the
   mechanical win: ~969 lines collapse to ~150 (prologue + 5 phase calls +
   epilogue).
7. **`HomeScreenCompanionTask.cs` host trim** — once `Execute` and
   `RunSingleEntryInternalAsync` are both phase-call dispatchers, the host
   file drops from 3,105 to ~400 lines. Delete the
   `// Moved-to-partial method index` comment block at lines 3070-3110
   (the methods it references are now all in their final homes).

## Manual smoke checklist (run after each phase migration)

Per plan §7, no automated end-to-end coverage exists for the run pipeline.
For each migration commit, run against a live Jellyfin instance:

1. Full sync on a library with at least one movie, one series, one tagged
   group, one collection, one playlist. Confirm the log shows the same
   results block shape as before.
2. Single-entry run on the same group. Confirm results match the full-sync
   row for that group.
3. AI-tagged group (if configured). Confirm refresh-due logic still skips
   when not due and runs when due.
4. Dry-run mode. Confirm nothing is written to the library.
5. Empty library (no items match the group). Confirm `displayStatsList`
   correctly records zero matched/skipped.

## What this does NOT include (out of scope)

- **Nullable-warning cleanup** (~99 nullable warnings across the codebase).
  Out of scope — would balloon the diff and should be its own sweep.
- **Behavior changes** to the run pipeline. Bug fixes are separate commits.
- **Test rewrite**. The reflection-based DLL snapshot tests in
  `tests/HomeScreenCompanion.Tests/` cover pure functions only; they don't
  exercise `Execute` or `RunSingleEntryInternalAsync`. They continue to
  pass throughout the refactor because they're testing extracted pure
  helpers, not the orchestration.

## Estimated effort

~3–5 days focused, following the 7-commit migration order above. The
context-object landing pad is the highest-risk step (~1 day including
smoke testing); the per-phase moves are mechanical (half a day each
including smoke); the single-entry consolidation is ~half a day.

After this lands, the plan §10 C# refactor is fully complete.