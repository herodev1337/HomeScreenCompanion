# HomeScreenCompanion.Tests

Snapshot tests for the **DLL-comparison refactor safety net**. The test suite
loads the built `HomeScreenCompanion.dll` via reflection and invokes ~16
private static "pure-ish" functions in `HomeScreenCompanionTask.cs`. After
section 10 of `plan.md` lands (splitting the giant .cs files into partials
under `Tagging/`, `Collections/`, etc.), the same test project can be pointed
at the new DLL to catch accidental behavior drift.

## How to run

```bash
# 1. Build the main DLL (required — the test loads it from the build output).
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release

# 2. Run the tests.
dotnet test tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
```

`dotnet test` will build the test project first; that build restores the same
Jellyfin packages the main project uses (`MediaBrowser.Common`,
`MediaBrowser.Server.Core`, `SkiaSharp`) so that `Assembly.LoadFrom` can
resolve all type references at test time.

## Layout

| File | Role |
|---|---|
| `HscAssembly.cs` | Loads `HomeScreenCompanion.dll` via `Assembly.LoadFrom` and resolves types/methods by reflection. Skips cleanly with `Assert.Skip` if the DLL is missing. |
| `Snap.cs` | Tiny snapshot helper. Writes `Snapshots/<TestName>.snap.json` on first run; compares (whitespace-normalized JSON) on subsequent runs. No external snapshot library. |
| `PureFunctionTests.cs` | 16 tests that actually run against the current DLL and snapshot their output. |
| `SkippableCandidateTests.cs` | 7 tests for the candidates that need Jellyfin runtime (`BaseItem` is abstract, `HomeScreenCompanionTask` constructor needs 11 services). Each skips with a one-line reason so it's clear what would need to change to enable them. |
| `Snapshots/*.snap.json` | Generated on first test run; checked into git. |

## Snapshot semantics

1. On first run, if `<TestName>.snap.json` does not exist, the test writes the
   serialized actual value to that path and passes.
2. On subsequent runs, the test serializes the actual value, parses both
   sides as JSON, and compares them semantically (whitespace-insensitive).
   Any difference fails the test with a side-by-side dump of expected vs.
   actual JSON.
3. If a behavior change is intentional, delete the snapshot file and rerun
   the test to regenerate it. Commit the new `.snap.json` alongside the code
   change.

Snapshots are deterministic: no timestamps, no environment-dependent values,
no user-private data — every input is hard-coded test data.

## What runs vs. what skips

**Runnable (16 tests, all on `HomeScreenCompanionTask` private static methods):**

| Test | Method | Notes |
|---|---|---|
| `MatchesAny_Cases` | `MatchesAny(string[], string)` | substring + case-insensitive |
| `SplitCommaValues_Cases` | `SplitCommaValues(string)` | trims, splits on `,` `\n` `\r` |
| `MatchesImdbId_Cases` | `MatchesImdbId(string?, string)` | null/empty safe |
| `ApplyNumericOp_Cases` | `ApplyNumericOp(double, string, double)` | `= uses Math.Abs(…) < 0.01` |
| `TagConfigTargetsEpisodes_Cases` | `TagConfigTargetsEpisodes(TagConfig)` | via reflection on `TagConfig` |
| `TagConfigIncludesParentSeries_Cases` | `TagConfigIncludesParentSeries(TagConfig)` | exact `MediaType:EpisodeIncludeSeries` |
| `TagConfigTargetsSeason_Cases` | `TagConfigTargetsSeason(TagConfig)` | tag+collection fallback chain |
| `EffectiveLegacyTargetType_Cases` | `EffectiveLegacyTargetType(TagConfig)` | 3-tier fallback |
| `ConfigNeedsMusicItems_Cases` | `ConfigNeedsMusicItems(PluginConfiguration)` | active+MediaInfo gate |
| `BuildItemTypes_Cases` | `BuildItemTypes(PluginConfiguration)` | adds 4 music types conditionally |
| `ExtractTitleContains_Cases` | `ExtractTitleContains(TagConfig)` | title+negation+trim |
| `GroupKey_Cases` | `GroupKey(TagConfig)` | `Name + "\x1F" + Tag`, trimmed |
| `DescribeSourceCounts_Cases` | `DescribeSourceCounts(GroupRunStats)` | constructs nested private type via reflection |
| `BuildFinalStatus_Cases` | `BuildFinalStatus(bool, int, int)` | uses `RunLog.Plural` |
| `StatusSymbol_Cases` | `StatusSymbol(int, int)` | pure |
| `SanitizeTopListFolderName_Cases` | `SanitizeTopListFolderName(string)` | null-safe |

**Skippable (7 tests, require Jellyfin runtime):**

| Test | Reason |
|---|---|
| `MatchesPerson_NeedsBaseItem` | `BaseItem` is abstract; method reads `dynamic People` |
| `IsTaggableTopLevelItem_NeedsBaseItem` | uses `item.GetType().Name` on a `BaseItem` |
| `MatchesArtistOrAlbumArtist_NeedsBaseItem` | uses `dynamic d.AlbumArtist / d.Artists` |
| `MatchesAlbumTitle_NeedsBaseItem` | uses `dynamic d.Album` |
| `TryGetDateModified_NeedsBaseItem` | reads `dynamic d.DateModified` |
| `TryGetFileSize_NeedsBaseItem` | reads `dynamic d.Size` |
| `IsScheduleActive_NeedsTaskInstance` | instance method; constructor needs 11 Jellyfin services |

## Why this is useful for the refactor

When section 10 of `plan.md` splits `HomeScreenCompanionTask.cs` into a
`partial class` spread across `Tagging/`, `Collections/`, `TopLists/`,
`Playlists/`, `HomeSections/`, `MediaInfo/`, `Diagnostics/` folders, every
method above moves to a new file but its signature stays the same. The test
suite catches any accidental change of behavior (off-by-one in a counter,
swapped precedence, lost negation handling, etc.) by comparing the post-
refactor outputs against the snapshots committed today.

When a method becomes independently testable after extraction — for example
if `GroupKey` is pulled out into a `static class GroupKeyUtil` — the existing
skippable test should be promoted to a runnable one (drop the
`Assert.Skip` call) and a new `*.snap.json` will be written on the next run.
That's the migration hook from "skipped because impossible" to "snapshot-
checked by default".

## CI

`.github/workflows/build.yml` runs:

```yaml
- name: Build (Release)
  run: dotnet build "$PROJECT" -c Release --no-restore

- name: Test
  run: dotnet test tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release --verbosity normal
```

The test depends on the main project's build output (`HomeScreenCompanion.dll`
at `HomeScreenCompanion/bin/Release/netstandard2.0/`), so the `Test` step must
continue to run *after* `Build (Release)`. If the workflow ever restructures,
keep that ordering.
