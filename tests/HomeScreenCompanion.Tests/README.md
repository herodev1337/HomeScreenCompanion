# HomeScreenCompanion.Tests

Direct-typed test suite for the Home Screen Companion plugin. The test
project holds a `<ProjectReference>` to `HomeScreenCompanion/HomeScreenCompanion.csproj`
and the plugin exposes its internals to `HomeScreenCompanion.Tests` via
`<InternalsVisibleTo>`, so every test calls `internal static` helpers on the
typed surface — no `Assembly.LoadFrom`, no string-based type lookup, no
on-disk snapshot harness.

## How to run

```bash
# 1. Build the main DLL.
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release

# 2. Run the tests.
dotnet test tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
```

`dotnet test` will build the test project first; that build restores the same
Jellyfin/Emby packages the main project uses (`MediaBrowser.Common`,
`MediaBrowser.Server.Core`, `SkiaSharp`).

## Layout

| File | Role |
|---|---|
| `PureFunctionTests.cs` | Direct-typed tests for the `internal static` pure helpers in `HomeScreenCompanionTask` and `FolderNames` — `MatchesAny`, `SplitCommaValues`, `MatchesImdbId`, `ApplyNumericOp`, `TagConfigTargetsEpisodes`, `TagConfigIncludesParentSeries`, `TagConfigTargetsSeason`, `EffectiveLegacyTargetType`, `ConfigNeedsMusicItems`, `BuildItemTypes`, `ExtractTitleContains`, `GroupKey`, `DescribeSourceCounts`, `BuildFinalStatus`, `StatusSymbol`, `Sanitize`, plus a few `TryGetDateModified` / `TryGetFileSize` smoke checks on a `FakeBaseItem`. |
| `SkippableCandidateTests.cs` | Methods that used to require the Emby runtime but are now reachable as `internal static` helpers. Six tests became `[Fact]` (no skip) thanks to the `FakeBaseItem` fixture; the two tests that genuinely need a constructed 11-service `HomeScreenCompanionTask` remain `[SkippableFact]` with a clear blocker reason. |
| `FakeBaseItem.cs` | Public `BaseItem` subclass used to seed static-only helpers in unit tests where the real Emby entity constructors are unavailable. |
| `CriterionCatalogTests.cs` | Behavior tests for the single source of truth for criterion classification and home-section query translation. |
| `MainPageUITests.cs`, `LogsUITests.cs`, `HomeSectionsUITests.cs`, `TopListsUITests.cs`, `TagRowDialogTests.cs`, `PluginImplementsUIPagesTests.cs`, `BaseClassesShapeTests.cs` | UI shape tests — direct `typeof()` on the typed types, reflection only for shape enumeration. |
| `BuildContentSectionTests.cs` | Direct call into the now-`internal static` `HomeScreenCompanionTask.BuildContentSection`. |
| `DtoContractTests.cs`, `EndpointReflectionTests.cs`, `EndpointAuthTests.cs` | DTO / endpoint contract checks. `EndpointAuthTests` enumerates handlers via reflection on `typeof(HomeScreenCompanionService)` (no DLL loading required); `EndpointReflectionTests` reaches SDK attribute types via the test project's existing `PrivateAssets="all"` package references. |
| `ExternalUrlTests.cs`, `FetchAiListTests.cs`, `AiRequestBodyTests.cs` | SSRF guardrails + AI provider error-propagation + JSON request body tests via direct calls into `ListFetcher`. |
| `LoggingTests.cs` | RunLog cap, source scan, `ParseHelpers.TryParseDouble` invariant helper. |
| `TypeSniffingTests.cs` | `TypeSniffing.IsSeriesLike` / `IsMovieLike` / `IsEpisodeLike` typed tests. |
| `RunGateTests.cs` | Single-run guard behavior + source scan; the integration test that needs an uninitialized task instance uses `RuntimeHelpers.GetUninitializedObject` directly (no constructor needed). |
| `NoClientArtifactsTests.cs`, `NoReflectionTests.cs`, `SourceLayoutTests.cs` | File-system / source-scan guards. |
| `PluginConfigRoundTripTests.cs` | Typed round-trip through `MainPageConfigMapper`. |

## Internal members promoted for testability

Several members had to be promoted from `private` to `internal` (or, in the
case of nested types, to `internal`) so the test project could call them
without reflection. Each promotion is documented in the
"Promotions to support direct test access" section of the refactor commit.

## CI

`.github/workflows/build.yml` runs:

```yaml
- name: Build (Release)
  run: dotnet build "$PROJECT" -c Release --no-restore

- name: Test
  run: dotnet test tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release --verbosity normal
```

The `Test` step must continue to run *after* `Build (Release)` so the
plugin DLL is up to date when the tests execute.