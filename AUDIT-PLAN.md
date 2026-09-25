# Codebase Audit — Remediation Plan v2

**Source:** 2026-09-25 audit + 2026-09-25 SDK-driven rewrite decision.
**Branch:** `refactor/sdk-declarative-ui` (CI: build + test only, no release bump).
**Goal:** Finish v1's audit fixes, then collapse the bespoke HTML+TS config UI
into the Emby SDK's declarative UI model (`IHasUIPages` + `EditableOptionsBase`)
and replace our hand-rolled DTOs/endpoints with SDK types where the shape
matches. Verified against `Emby.SDK` and https://dev.emby.media.

This is the **dispatch plan**. Each task is subagent-deployable, references
its fileset explicitly, and is independently shippable. Findings closed by
v1 are listed under `✅ Shipped` so we don't redo them.

---

## Why v2 exists

`AUDIT-PLAN.md` (v1) fixed the security/correctness/lifecycle/structure
issues but kept the **2,051-line hand-rolled HTML config page + 25,395 lines
of TS** plus the AMD/Rollup/esbuild pipeline, the 84 hand-written `innerHTML`
sites, the XSS escape library, the dirty-state tracking, the config
serializer, and the load/save round-trip. v2 replaces all of that with the
SDK's declarative UI, which the spike at `spike/` proves compiles against
our pinned `MediaBrowser.Server.Core 4.10.0.24-beta2`:

- `IHasUIPages.UIPageControllers` — the new declarative-UI hook
- `IPluginUIPageController` + `IPluginPageView` + `IPluginUIView`
- `EditableOptionsBase` + `[DisplayName]` / `[Description]` /
  `[EditFolderPicker]` / `[EditFilePicker]` / `[EditMultiline]` /
  `[Required]` / `[MaxLength]` / `[MinValue]` / `[MaxValue]` /
  `[VisibleCondition]` / `[EnabledCondition]` / `[SelectItemsSource]` /
  `[RadioItemsSource]` / `[GridDataSource]` / `[PropertyCondition]` /
  `Validate(ValidationContext)`
- Elements: `SpacerItem`, `CaptionItem`, `StatusItem`, `ButtonItem`,
  `ToggleButtonItem`, `EditorItemList`, `EditorDxGrid` (drag-reorder,
  filter, paging, sort, validation rules, master-detail), `EditorBoolean`,
  `EditorNumeric`, `EditorDateTime`, `EditorRadioGroup`, `EditorSelect`
- Dialogs/wizards: `IPluginDialogView`, `IPluginWizardView`
- Server→client event: `RaiseUIViewInfoChanged()` after `RunCommand` so
  the UI re-renders without a custom polling loop

The SDK also gives us typed C#/TS REST clients (`EmbyClient.Dotnet` +
`api.ts`) generated from the OpenAPI spec at
`Emby.SDK/Resources/OpenApi/openapi_v3.json` — relevant APIs we plan to
reuse: `ScheduledTaskServiceApi`, `ItemsServiceApi`, `UserServiceApi`,
`LibraryServiceApi`, `UserLibraryServiceApi`, `SystemServiceApi`,
`PluginServiceApi`, `PackageServiceApi`, `TaskInfo`, `TaskTriggerInfo`,
`TaskState`, `BaseItemDto`, `UserDto`, `PublicSystemInfo`, `ContentSection`.

---

## ✅ Shipped (do not redo)

| ID | Commit | What |
|---|---|---|
| S1 | `20eb5c6` | `[Authenticated]`/`[Authenticated(Roles="Admin")]` on every route; self-scoped user via `IRequiresRequest`+`IAuthorizationContext`; `request.UserId` no longer trusted |
| S2 | `039f5a6` | SSRF allowlist (`api.mdblist.com`/`api.trakt.tv`/`api.themoviedb.org`); AI errors surface; AI bodies serialized |
| C1 | `576dd52` | `dom/dom.ts` is the single HTML-escape source; 6 duplicates removed; eslint guardrail |
| C2 | `246c7ae` | Document-click listener + show-scoped listeners + interval all use one `AbortController`; `{once:true}` gone; single `viewhide` handler |
| E1 | `f169bdf` | Per-run state moved to `RunContext`; `RunGate` (`SemaphoreSlim(1,1)`) at top of `Execute` + `RunSingleEntryAsync` |
| E2 | `2507658` | Catch triage + `ILogger.ErrorException`; `RunLog` capped at 2,000 lines; `InvariantCulture` on parses; type-sniffing helpers (`IsSeriesLike`/`IsMovieLike`) |
| E3 | `93964b3` | `BindingFlags`/`dynamic` in `TopListEndpoints` + `HscEndpoints` replaced with direct `IUserManager`/`IUserViewManager` calls |
| E4 | `61b5268` | `BuildMatchCaches` + library-snapshot builder deduped (one body, parameterized by iteration source) |
| N1 | `f169bdf` | Partial files renamed `HomeScreenCompanionTask.<Area>.cs`; stale `REFACTOR_MAP.md` header removed |
| D1 | `5da8968` | `index.ts` (1,963 → 712 lines) split into `app/apiAdapter.ts`, `app/configIo.ts`, `app/viewLifecycle.ts`, `app/customCss.ts` |
| D2 | `98f38aa` | `setupRowEvents.ts` (1,447 → ~250 lines) split into 8 domain modules + `createRowController` |
| D3 | `056d312` | `toplists/modals.ts` (1,528 → ~350 lines) split into `modalShell.ts`/`moviePicker.ts`/`presetSelects.ts` |
| D4 | (untracked) | `form.ts` → `formHtml.ts`/`hseVisibility.ts`/`hseCriteria.ts`/`hseSync.ts`/`hseTabInit.ts`; `configState.ts` → `configSerialize.ts`/`dirtyState.ts`/`tagFilterChips.ts`/`updates.ts`; `renderTagGroup.ts` → `miPresets.ts`/`badges.ts`/`topListBadgesRefresh.ts` |

D4 is the last client-side split still mid-flight on the branch. Finish it
**before** the SDK UI lands (the spike confirmed we can build the SDK UI
without D4 being done, but merging D4's net-new files first keeps the
subagent blast radius small).

---

## Outstanding scope (this plan)

```
Wave 0  D4-finish ──► (SDK-UI migration depends on D4 landing)
Wave 1  U1 ──► U2 ──► U3 ──► U4 ──► U5 ──► U6 ──► U7  (SDK UI port — sequential, single owner)
Wave 2  T1 ──► T2 (server-side DTO/REST-client swap — independent)
Wave 3  B1 ──► B2 ──► B3 ──► B5   (build/CI/packaging — sequential)
        B4 (deps)        [P with B*]
```

Each task lists `Files (own)` and `Files (touch)`. A subagent must never
edit outside its set. Tests are mandatory; no `Assert.Skip` without a
recorded blocker.

**Verify per task:**
```bash
# C# tasks
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release
dotnet test  tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
dotnet format whitespace HomeScreenCompanion/HomeScreenCompanion.csproj --verify-no-changes --no-restore
# Client tasks (Wave 0 only — Wave 1 deletes the client)
cd HomeScreenCompanion/ClientApp && npm run typecheck && npm run lint && npm test
```

---

## Wave 0 — Finish D4 (carry-over from v1)

### D4-finish — Land in-flight splits + delete the AMD pipeline scaffolding
- **Files (own):** the 11 untracked files under `ClientApp/src/modules/`
  (`config/{configSerialize,dirtyState,tagFilterChips,updates}.ts`,
  `homesections/{formHtml,hseVisibility,hseCriteria,hseSync,hseTabInit}.ts`,
  `tags/{badges,miPresets,topListBadgesRefresh}.ts`) + the modified
  `configState.ts` and `form.ts`. Owns the imports in `index.ts` that
  point at them.
- **Do:** verify the new files import cleanly, all 419 existing tests
  stay green, lint clean, typecheck clean. Do **not** change public
  surface yet — this commit only lands the moved code so subsequent
  Wave-1 commits can delete the source files in one swoop.
- **Tests:** characterization — no new tests needed if the existing
  419 still pass against the moved files. If a test references the old
  module path, move the test alongside the code (rule 8 from v1).
- **Risk note:** Wave 1 will delete the legacy `tags/renderTagGroup.ts`,
  `homesections/form.ts` (root of the partial), and
  `config/configState.ts` files after porting. Until Wave 1 lands,
  parallel ownership is fine — D4-finish only changes the *new* files
  and the two root partials to *call* them.

---

## Wave 1 — Port the config UI to `IHasUIPages`

All Wave-1 tasks touch `Plugin.cs` (the constructor signature), `csproj`
(removing the `EmbeddedResource` for `configPage.html`/`configPage.js`),
and the new `HomeScreenCompanion/UIBaseClasses/` tree. One owner per task
(file-set discipline prevents merge conflicts). **Sequential**, because
U1 lands the base classes, then U2 swaps the host, then U3–U7 each own
one page/controller. U8 is the client-app demolition and runs last.

### U1 — Lift UIBaseClasses into the plugin
- **Finding:** the SDK sample at `Emby.SDK/SampleCode/Templates/EmbyPluginUiTemplate/`
  ships the base classes we need, but they target `MediaBrowser.Server.Core 4.9.1.90`
  and have `internal` visibility that breaks inheritance outside the sample.
  The spike at `spike/UIBaseClasses/` proves the minimum set that compiles
  against our pin.
- **Files (own):** new
  - `HomeScreenCompanion/UIBaseClasses/ControllerBase.cs`
  - `HomeScreenCompanion/UIBaseClasses/Views/PluginViewBase.cs` (public, not internal)
  - `HomeScreenCompanion/UIBaseClasses/Views/PluginPageView.cs` (public)
  - `HomeScreenCompanion/UIBaseClasses/Views/PluginDialogView.cs` (public)
  - `HomeScreenCompanion/UIBaseClasses/Views/PluginWizardView.cs` (public)
  - `HomeScreenCompanion/UIBaseClasses/Store/SimpleContentStore.cs` (public)
  - `HomeScreenCompanion/UIBaseClasses/Store/SimpleFileStore.cs` (public, lifted from spike)
  - `HomeScreenCompanion/UIBaseClasses/Store/FileSavingEventArgs.cs`
  - `HomeScreenCompanion/UIBaseClasses/Store/FileSavedEventArgs.cs`
- **Do:** copy from the spike (clean), update namespaces from
  `HomeScreenCompanion.Spike` to `HomeScreenCompanion.UIBaseClasses`,
  delete `spike/`. Public visibility on every abstract base (the sample
  uses `internal` because it's all one assembly).
- **Tests:** `BaseClassesShapeTests` (reflection) — the four abstract
  bases exist, are `public`, derive from the SDK interfaces
  (`IPluginUIView`/`IPluginPageView`/`IPluginDialogView`/`IPluginWizardView`),
  and `SimpleFileStore<T>.ctor` takes
  `(IApplicationHost, ILogger, string)` as expected by the integration
  tests we'll add later.
- **Coverage:** `RaiseUIViewInfoChanged()`, `IsCommandAllowed(string)`,
  `RunCommand(string,string,string)`, `OnSaveCommand(string,string,string)`,
  `Cancel()`, `OnDialogResult(IPluginUIView,bool,object)` — all surface
  methods the page controllers will override.

### U2 — Swap `IHasWebPages` → `IHasUIPages` on `Plugin.cs`
- **Finding:** `Plugin.cs:13-62` registers two `PluginPageInfo` (HTML + JS
  bundle). After this task, the plugin exposes `IHasUIPages.UIPageControllers`
  returning a single page controller wired to `MainPageUI`. The current
  `GetPages()` method is removed.
- **Files (own):** `HomeScreenCompanion/Plugin.cs`,
  `HomeScreenCompanion/HomeScreenCompanion.csproj`.
- **Do:**
  1. Change `Plugin : BasePlugin<PluginConfiguration>, IHasWebPages, IHasThumbImage`
     to `..., IHasUIPages, IHasThumbImage`.
  2. Remove `GetPages()` (returns the HTML+JS pages).
  3. Implement `IReadOnlyCollection<IPluginUIPageController> UIPageControllers`
     returning a single `MainPageController` (new file, in U3). For
     this task, return an empty list with a TODO pointing at U3 — the
     build must stay green at every intermediate step.
  4. csproj: remove the two `<EmbeddedResource>` entries for
     `Configuration\configPage.html` and `Configuration\configPage.js`.
     **Do not delete the files yet** — U8 owns that.
  5. Update `Configuration/configPage.html` references in `tests/`
     fixtures if any.
- **Tests:** `PluginImplementsUIPagesTests` — `Plugin` implements
  `IHasUIPages`, has `UIPageControllers` getter, no longer implements
  `IHasWebPages`. Reflection-only; no DLL needed.
- **Risk:** if Emby's plugin loader hits an unhandled exception while
  enumerating `UIPageControllers`, the whole plugin fails to register.
  The empty-list stub avoids that.

### U3 — Port `MainPageUI` (the main config page model)
- **Finding:** `ClientApp/src/modules/{config/configState,homesections/form,tags/renderTagGroup}.ts`
  together implement the "general" tab: per-tag row config, media-info
  filter, AI prompts, backup settings. The SDK declarative equivalent is
  one `MainPageUI : EditableOptionsBase` with one `EditorDxGrid` for
  the tag rows and several `[DisplayName]` properties for the scalar
  settings.
- **Files (own):** new `HomeScreenCompanion/UI/MainPageUI.cs` +
  `HomeScreenCompanion/UI/MainPageController.cs` +
  `HomeScreenCompanion/UI/MainPageView.cs` +
  `HomeScreenCompanion/UI/MainPageOptionsStore.cs`.
- **Do:**
  1. `MainPageUI` extends `EditableOptionsBase`. Properties:
     - One `EditorDxGrid Tags` whose row type is the **new** `TagConfigRow`
       (T6 lifts `PluginConfiguration.TagConfig` into a DTO-shaped model).
     - Scalar settings: `DryRunMode` (`bool`), `ExtendedConsoleOutput` (`bool`),
       `LogMissingItems` (`bool`), `RunIntervalMinutes` (`int` with
       `[MinValue(5)]`/`[MaxValue(1440)]`), `ReleaseNotesUrl` (`string`).
     - AI source settings: nested `EditorGroup AiSources` containing
       `OpenAI`/`Ollama`/`Gemini`/`Claude`/`MdbList`/`Trakt`/`Tmdb`
       groups, each with the API key (`[IsPassword]`), base URL
       (`[EditFolderPicker]` for Ollama), and model name.
     - One `ButtonItem ExportBackup` (`Data1 = "ExportBackup"`) +
       one `ButtonItem ImportBackup` (`Data1 = "ImportBackup"`).
     - One `StatusItem LastSyncStatus` + `EditorProgressItem SyncProgress`
       polled via `RunCommand("RefreshStatus")`.
     - One `EditorItemList SavedFilters` (was `Filters/SavedFilters.ts`)
       with a `ButtonItem AddFilter` (`Data1 = "AddFilter"`).
  2. `MainPageController : ControllerBase` — `PageInfo = new PluginPageInfo
     { Name = "HomeScreenCompanion", EnableInMainMenu = true,
     DisplayName = "Home Screen Companion", MenuIcon = "home",
     IsMainConfigPage = true }`. `CreateDefaultPageView()` returns
     `new MainPageView(...)`.
  3. `MainPageView : PluginPageView` — overrides `OnSaveCommand` (writes
     `IJsonSerializer` + `IApplicationPaths.PluginConfigurationsPath`),
     overrides `RunCommand` (handles `RefreshStatus`, `RunTag`,
     `RunAll`, `ExportBackup`, `ImportBackup`, `AddFilter`, `RemoveFilter`).
     All async work uses `Task.Run(...).ContinueWith(t => RaiseUIViewInfoChanged())`.
  4. `MainPageOptionsStore : SimpleFileStore<MainPageUI>` (lifted from
     `EmbyPluginUiTemplate/Storage/MyOptionsStore.cs`).
- **Tests:** `MainPageUITests` (reflection):
  - every public property has either `[DisplayName]` or is a known
    control (`ButtonItem`/`StatusItem`/`EditorItemList`/`EditorDxGrid`/
    `EditorProgressItem`/`SpacerItem`/`CaptionItem`);
  - the `EditorDxGrid` for `Tags` declares a row type with at least the
    fields `Name`, `Tag`, `Enabled`, `Source`, `Collection`;
  - `MainPageUI` round-trips through `MainPageOptionsStore`:
    `SetOptions(new MainPageUI { DryRunMode = true })` →
    `GetOptions().DryRunMode == true` and survives `ReloadOptions()`.
- **Source-file ownership note:** this commit does NOT delete the TS files
  it replaces. U8 owns the demolition.

### U4 — Port tag rows (`TagManageTab` + `setupRowEvents`)
- **Finding:** `ClientApp/src/modules/tags/tagManageTab.ts` (771 lines) +
  `ClientApp/src/modules/rows/setupRowEvents.ts` (now ~250 lines after
  v1's split) + `ClientApp/src/modules/tags/renderTagGroup.ts` (~200
  lines after v1's split) collectively define the tag-row edit UI:
  expand-collapse body, drag-reorder, per-row "run", per-row "open logs",
  per-row filter source (MdbList/Trakt/TMDB/AI).
- **Files (own):** new `HomeScreenCompanion/UI/TagRowEditDialog.cs` +
  `HomeScreenCompanion/UI/TagRowEditor.cs` (server-side builder for
  the per-row edit dialog). Owns the per-row `EditorDxGrid` columns.
- **Do:**
  1. `TagRowEditDialog : PluginDialogView` opens when the user clicks
     "Edit" on a row in `MainPageUI.Tags`. `ContentData` is the row's
     `TagConfigRow` (a derived `EditableOptionsBase` built in T6).
  2. Per-row controls map 1:1 from the current UI:
     - `EnableCollection` toggle → `[VisibleCondition("EnableCollection",
       EditorVisibilityCondition.ShowWhenTrue)]`
     - `CollectionName`, `CollectionDescription`, `CollectionPosterUrl`,
       `EnableHomeSection`, `HomeSectionTracked` list, etc. → `[DisplayName]`
       properties on the row model.
     - "Run" button per row → `ButtonItem` with `Data1 = "RunTag:{TagName}"`,
       handled by `RunCommand`.
     - "Open logs" button per row → `ButtonItem` with `Data1 = "OpenLogs:{TagName}"`,
       opens a `PluginDialogView` with the recent run logs.
     - Speed-dial home section reorder → `EditorDxGrid` with
       `DxGridRowDragging { allowReordering = true }`.
     - Media-info filter builder (Is4k/IsHevc/IsHdr/...) → grouped
       `EditorBoolean` properties with `[RadioItemsSource(typeof(YesNoTri))]`.
- **Tests:** `TagRowDialogTests`:
  - `TagRowEditDialog.Page` reflects changes back to the parent's
    `Tags` `EditorDxGrid` (round-trip through the view state).
  - the `[VisibleCondition]` on `CollectionName` evaluates correctly for
    `EnableCollection = true/false` (compile a tiny `PropertyCondition`
    evaluator and assert).
  - `RunCommand("RunTag:foo")` triggers the actual task and surfaces
    status into the dialog's `StatusItem` via `RaiseUIViewInfoChanged()`.

### U5 — Port toplists (`topListsTab` + `modals`)
- **Finding:** `ClientApp/src/modules/toplists/{topListsTab,modals,creation}.ts`
  manage the IMDB/Trakt/MDBList lists that drive tag sources, plus the
  movies picker modal used when "Add AI source → choose movies" is
  invoked.
- **Files (own):** new `HomeScreenCompanion/UI/TopListsPage.cs` +
  `HomeScreenCompanion/UI/TopListsPageController.cs` +
  `HomeScreenCompanion/UI/TopListsPageView.cs` +
  `HomeScreenCompanion/UI/MoviesPickerDialog.cs`.
- **Do:**
  1. `TopListsPageUI : EditableOptionsBase` with one `EditorItemList Lists`
     (each `GenericListItem` carries `PrimaryText`=list name,
     `SecondaryText`=source type, `Icon`=source icon) and three
     `ButtonItem`s: `AddMdbList`/`AddTrakt`/`AddTmdb`.
  2. `TopListsPageController.PageInfo` adds a second menu entry
     ("Home Screen Companion — Lists"). `Plugin.UIPageControllers`
     returns both controllers.
  3. `MoviesPickerDialog : PluginDialogView` opened via
     `RunCommand("PickMovies:{TagName}")`. Search runs server-side via
     `Task.Run(...).ContinueWith(t => RaiseUIViewInfoChanged())` — the
     current TS code polls every keystroke; the SDK UI's dialog re-renders
     on the event, so the loop is the same but simpler.
  4. `EditorDxGrid Movies` shows the search results; `RunCommand("AddMovie:{id}")`
     adds to the parent list and returns `this` (the dialog stays open).
- **Tests:** `TopListsUITests` — `MoviesPickerDialog` re-renders after
  each `RunCommand` (event subscription round-trip); adding a movie
  produces an `EditorDxGrid` row with the right `Name`/`Year`/`Type`.

### U6 — Port home-section sync (`hscTab` + `manageTab` + `users`)
- **Finding:** `ClientApp/src/modules/homesections/{hscTab,manageTab,users}.ts`
  implement "Home Sections" — which home-screen sections exist per user
  and which tracked sections a tag config owns.
- **Files (own):** new `HomeScreenCompanion/UI/HomeSectionsPage.cs` +
  `HomeScreenCompanion/UI/HomeSectionsPageController.cs` +
  `HomeScreenCompanion/UI/HomeSectionsPageView.cs`.
- **Do:**
  1. `HomeSectionsPageUI` — one `EditorSelect UserSelector` (sourced from
     `IUserManager.GetUsersAsync()` via `[GridDataSource]`), one `EditorDxGrid Sections`
     with `DxGridRowDragging`, one `ButtonItem ApplyTag`.
  2. `HomeSectionsPageController` — third menu entry.
  3. View: reads/writes through `IUserManager.GetHomeSections(long, ...)` /
     `MoveHomeSections(long, string[], int, CancellationToken)` — both
     verified on the SDK `IUserManager` interface (see v1's "Emby API
     facts" block).
- **Tests:** `HomeSectionsUITests` — drag-reorder produces a `MoveHomeSections`
  call with the new order; an admin user can move sections on behalf of
  another user (covered by S1's `[Authenticated(Roles="Admin")]`).

### U7 — Port logs (`logs/logModal` + `config/updates` for release notes)
- **Finding:** `ClientApp/src/modules/logs/logModal.ts` polls `/HSC/Logs`
  every 5s and renders the latest run log. `config/updates.ts` shows the
  latest GitHub release with markdown rendering.
- **Files (own):** new `HomeScreenCompanion/UI/LogsPage.cs` +
  `HomeScreenCompanion/UI/LogsPageController.cs` +
  `HomeScreenCompanion/UI/LogsPageView.cs`.
- **Do:**
  1. `LogsPageUI` — one `EditorTextArea RunLog` (read-only, `[EditMultiline]`)
     + one `ButtonItem Refresh` + one `EditorProgressItem SyncProgress`.
  2. `LogsPageView.RunCommand("Refresh")` re-reads `HomeScreenCompanionTask.ExecutionLog`
     and calls `RaiseUIViewInfoChanged()`. The SDK dialog refreshes
     automatically — no 5s poll needed.
  3. Release notes move into `MainPageUI` (under the "Updates" group) as
     one `ButtonItem OpenReleaseNotes` → opens a `PluginDialogView`
     containing one `EditorTextArea` with the markdown body fetched
     server-side.
- **Tests:** `LogsPageTests` — `RunCommand("Refresh")` after a fake log
  append produces a `RunLog` property containing the appended line.

### U8 — Demolish the client app (lands last)
- **Finding:** U1–U7 cover the UI surface. U8 deletes the *implementation*
  of the old UI: `Configuration/configPage.html`, `Configuration/configPage.js`,
  the entire `ClientApp/` tree (except the tests, which can move into a
  `_legacy/` dir or be deleted — they're for the AMD bundle that no longer
  exists). Delete the rollup pipeline, the npm scripts, and the GitHub
  Actions client-build job (B1–B5).
- **Files (own):** deletes
  - `HomeScreenCompanion/Configuration/configPage.html`
  - `HomeScreenCompanion/Configuration/configPage.js`
  - `HomeScreenCompanion/ClientApp/` (whole tree)
  - `rollup.config.mjs` at repo root (if any)
  - `scripts/bump-version.mjs` rollup-banner block (handled by B1)
- **Do:** verify the 419 tests that live in `ClientApp/src/__tests__/` and
  `ClientApp/src/modules/**/*.test.ts` either:
  - move into a new `tests/HomeScreenCompanion.LegacyUITests/` project
    marked `[Trait("Legacy", "Skip")]` (so the v2 plan can decide later),
    OR
  - get deleted with a `git log` note pointing at the deleted paths.
  Pick **delete** unless an existing test covers SDK-UI behaviour we
  can't easily re-exercise (e.g. `emby-compat.test.ts` mocks the
  ApiClient — that test is obsolete after Wave 1).
- **Verify:** `dotnet build -c Release` and `dotnet test` must both pass.
  Remove the `npm ci` / `npm run build` step from `.github/workflows/build.yml`
  (handled by B2).
- **Tests:** `NoClientArtifactsTests` — `Configuration/configPage.html`
  and `Configuration/configPage.js` no longer exist; the csproj has no
  `<EmbeddedResource>` for them; `ClientApp/` directory is gone; no
  `package.json` / `node_modules` references remain in the repo.

---

## Wave 2 — Server-side DTO & REST-client swap (independent of Wave 1)

T1 and T2 can run in parallel (different filesets). T3 depends on both.

### T1 — Replace Emby-shaped DTOs with SDK types
- **Finding:** `HomeScreenCompanion/DTOs.cs` (244 lines) and the five
  contract files under `Contracts/` re-declare types the SDK already
  models: `ContentSection` (already used), `BaseItemDto`, `UserDto`,
  `HscUserDto` (= `UserDto` with `Id` + `Name`), `TaskInfo`,
  `PublicSystemInfo`, `LogFile`, `TaskTriggerInfo`, `Version`.
- **Files (own):** `HomeScreenCompanion/DTOs.cs`,
  `HomeScreenCompanion/Contracts/*.cs`.
- **Do:**
  1. `HscUserDto` → `MediaBrowser.Model.Dto.UserDto` (use `.Id.ToString()`
     at the call site where the current `HscUserDto.Id` is `string`).
  2. `HscSyncStatusResponse` keeps its `Logs : List<string>` and
     `StartedUtc : string` but uses `TaskInfo` for `LastSyncResult`
     (`TaskInfo.LastExecutionResult`).
  3. `HscUserSectionsResponse.Sections` already uses `ContentSection[]`
     — keep.
  4. Drop the `ExternalItemDto` class (was unused outside `ListFetcher`).
  5. **Keep** the external-API DTOs (`MdbListResponse`, `TraktBaseObject`,
     `TraktMovie`, `TraktShow`, `TraktIds`, `OpenAiResponse`,
     `OpenAiChoice`, `OpenAiMessage`, `GeminiResponse`, `GeminiCandidate`,
     `GeminiContent`, `GeminiPart`, `OllamaResponse`, `OllamaMessage`,
     `ClaudeResponse`, `ClaudeContent`, `AiListItem`, `TmdbListResponse`,
     `TmdbListItem`, `TmdbExternalIds`) — SDK doesn't model third-party APIs.
- **Tests:** `DtoContractTests` (reflection) — every property on the
  remaining `Hsc*` response types serialises to a JSON property name
  that matches what the (now-deleted) ClientApp used; an integration
  test issues `GET /HSC/UserSections?UserId=Y` (admin) and asserts the
  response shape matches a captured snapshot.

### T2 — Use SDK REST client from server code where it adds value
- **Finding:** `HscEndpoints.cs:13-95` (`DebugSectionsRequest`) still does
  a reflection BFS over `_userManager.GetMethods()`. We can replace it
  with a direct call to `UserServiceApi.GetUsersAsync()` (or, since this
  is server-side, the existing `IUserManager` is fine). The bigger win
  is exposing *typed* `/HSC/Run/{TaskId}` and `/HSC/Status` endpoints
  that wrap `TaskInfo` and `TaskState` (SDK types) so the new SDK-UI
  pages (U3, U7) can deserialize into SDK DTOs.
- **Files (own):** `HomeScreenCompanion/Endpoints/HscEndpoints.cs`,
  new `HomeScreenCompanion/Endpoints/HscStatusEndpoints.cs`.
- **Do:**
  1. Replace `DebugSectionsRequest` reflection with a direct
     `IUserManager` call (already known to expose `GetHomeSections`,
     `MoveHomeSections`, etc.).
  2. New `HscStatusEndpoints.Get(HscGetStatusRequest req)` returns
     `HscStatusResponse { TaskInfo = ... }` — typed against
     `MediaBrowser.Model.Tasks.TaskInfo`. The SDK-UI `MainPageView`
     binds directly.
  3. New `HscRunEndpoints` wraps `IScheduledTaskWorker` / `ITaskManager`
     so `RunCommand("RunTag:foo")` in U3 calls them.
- **Tests:** `EndpointReflectionTests` (source scan) — `HscEndpoints.cs`
  has zero `BindingFlags` / `dynamic`; `HscStatusResponse` has a
  `TaskInfo` property whose type is the SDK one.

### T3 — Slim `PluginConfiguration.cs` (server-side DTOs no longer mirror UI state)
- **Finding:** `HomeScreenCompanion/PluginConfiguration.cs` (151 lines)
  today carries `Tags : List<TagConfig>` (the same shape as the row
  DTO + per-row filters + per-row tracking). U3's `MainPageUI` carries
  the *same* data. We want one canonical shape (the SDK `TagConfigRow`)
  and `PluginConfiguration` should be a thin file-store snapshot of it.
- **Files (own):** `HomeScreenCompanion/PluginConfiguration.cs`,
  `HomeScreenCompanion/TagCacheManager.cs`,
  `HomeScreenCompanion/Criteria/*`.
- **Do:** U3's `MainPageUI.SaveCommand` calls
  `Plugin.Instance.UpdateConfiguration(MainPageUI.ToPluginConfig())`.
  The mapping is mechanical and stays here.
- **Tests:** `PluginConfigRoundTripTests` — `MainPageUI` ↔ `PluginConfiguration`
  via the mapper; lossy fields (`Debug`, `Dirty`) are filtered out.

---

## Wave 3 — Build / CI / packaging

B1–B5 are largely the v1 tasks that were never landed. They become
*cleaner* after Wave 1 (no npm step, no client bundle, no AMD pipeline).

### B1 — Package like an Emby plugin (meta.json + zip)
- **Files (own):** new `HomeScreenCompanion/meta.json`,
  `.github/workflows/build.yml`, `scripts/*`.
- **Do:** ship `HomeScreenCompanion_<version>.zip` containing the DLL +
  `meta.json` (`Plugin.Id`, `Plugin.Name`, templated version from
  `version.txt`).
- **Tests:** `PackagingTests` — `meta.json` parses; GUID == `Plugin.Id`;
  smoke run of the packaging script produces the expected zip layout.

### B2 — Stop the version bump racing the build
- **Files (own):** `.github/workflows/build.yml`.
- **Do:** compute version → build + test + package → single gate →
  commit + tag + release; `git pull --rebase` before push.
- **Tests:** manual on a scratch branch — verify a forced test failure
  leaves `version.txt` untouched with no tag.

### B3 — Make C# tests unable to skip silently
- **Files (own):** `tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj`,
  `tests/HomeScreenCompanion.Tests/HscAssembly.cs`,
  `tests/HomeScreenCompanion.Tests/README.md`,
  `.github/workflows/build.yml`.
- **Do:** add `<ProjectReference ReferenceOutputAssembly="false" />`;
  `EnsureAvailable()` fails (not skips) when `CI`/`GITHUB_ACTIONS` is set.
  Fix `tests/README.md` ("Jellyfin" → "Emby").
- **Tests:** `ShouldFailFast(bool isCi, bool dllAvailable)` — CI+missing
  fails, non-CI+missing skips, available passes.

### B4 — Client dep + tooling hygiene
- **Files (own):** (none — Wave 1 deleted the client). Drop this task
  or convert it to "remove any leftover npm references in CI".

### B5 — Analyzers + bundle drift guard (now: none, since the bundle is gone)
- **Files (own):** `Directory.Build.props`,
  `.github/workflows/build.yml`,
  `HomeScreenCompanion/.gitignore`.
- **Do:** enable `EnableNETAnalyzers` + `AnalysisLevel`; `git diff` on
  the embedded resource is moot after Wave 1 (no embedded JS/HTML);
  add `dotnet format whitespace --verify-no-changes` to CI (already
  there from v1's cleanup sweep, just verify).
- **Tests:** CI build = regression test.

---

## Emby API facts (verified against `MediaBrowser.Controller` /
`MediaBrowser.Model` 4.10.0.24-beta2 binaries and https://dev.emby.media)

- `MediaBrowser.Controller.Net.AuthenticatedAttribute(Roles = "Admin")`
  works (v1 verified).
- `IUserManager.GetHomeSections(long, CancellationToken)` /
  `MoveHomeSections(long, string[], int, CancellationToken)` /
  `DeleteHomeSections(long, string[], CancellationToken)` /
  `UpdateHomeSection(long, ContentSection, CancellationToken)` are all
  on the interface (v1 verified) — U6 uses them directly.
- `MediaBrowser.Model.Plugins.UI.IHasUIPages.UIPageControllers` exists
  and returns `IReadOnlyCollection<IPluginUIPageController>` (spike
  verified).
- `MediaBrowser.Model.Plugins.UI.Views.IPluginUIPageController.PageInfo
  { get; }` and `CreateDefaultPageView()` exist; `IPluginPageView` has
  `ShowSave` / `AllowSave` / `OnSaveCommand(string,string,string)`;
  `IPluginUIView` has `ContentData` / `User` / `RedirectViewUrl` /
  `RunCommand(string,string,string)` / `Cancel()` (spike verified).
- `Emby.Web.GenericEdit.EditableOptionsBase` exists with `Validate`,
  `EditorTitle`, `EditorDescription`, `GetChangesFromDefault`,
  `DeserializeFromJsonStream`, `DeserializeFromJsonString` (spike
  verified, XML doc confirmed).
- All attribute helpers used in U3/U4/U5/U6/U7 exist
  (`DisplayNameAttribute`, `DescriptionAttribute`, `EditFolderPickerAttribute`,
  `EditFilePickerAttribute`, `EditMultilineAttribute`, `RequiredAttribute`,
  `MaxLengthAttribute`, `MinValueAttribute`, `MaxValueAttribute`,
  `IsAdvancedAttribute`, `IsPasswordAttribute`, `VisibleConditionAttribute`,
  `EnabledConditionAttribute`, `PropertyConditionAttribute`,
  `SelectItemsSourceAttribute`, `RadioItemsSourceAttribute`,
  `GridDataSourceAttribute`, `GridFilterSourceAttribute`,
  `GetRefreshPropertiesAttribute`, `TristateTrueTextAttribute`,
  `TristateFalseTextAttribute`, `SelectShowRadioGroupAttribute`) —
  string-grepped from `Emby.Web.GenericEdit.dll`.
- `EditorDxGrid` has both a parameterless ctor and a 8-arg ctor;
  properties incl. `DisplayName`/`Description` (XML doc confirmed); the
  data-binding surface (`keyExpr`, `dataSource`, `columns`,
  `editing`, `filterRow`, `headerFilter`, `paging`, `pager`,
  `rowDragging`, `scrolling`, `searchPanel`, `selection`, `sorting`,
  `summary`, `masterDetail`, `twoWayBindingEnabled`) all live on
  `DxGridOptions` (XML doc confirmed).
- `Emby.Media.Common.Extensions.TimeSpanExtensions` exists for the
  `5.seconds()` pattern used in the sample (XML doc confirmed type
  exists; method names verified separately via `strings`).

---

## Definition of done (whole plan v2)

- [ ] Every Wave-1 task lands and `dotnet build -c Release` is green.
- [ ] `Configuration/configPage.html` and `Configuration/configPage.js`
      deleted; the entire `ClientApp/` tree deleted; no `node_modules`
      referenced from CI.
- [ ] Every public page controller implements `IPluginUIPageController`;
      every page view implements `IPluginPageView` and exposes
      `ShowSave = true` + `OnSaveCommand` that writes to
      `IApplicationPaths.PluginConfigurationsPath/<PluginName>.json`.
- [ ] `Plugin.cs` implements `IHasUIPages`; `UIPageControllers` returns
      all registered controllers; `IHasWebPages` removed.
- [ ] No `BindingFlags` / `dynamic` in any server endpoint.
- [ ] `HscSyncStatusResponse`/`HscUserDto` use SDK DTOs; external-API
      DTOs kept as-is.
- [ ] `meta.json` + zip ship with every release; `dotnet test` cannot
      skip green in CI.
- [ ] Every `Tests:` block merged and green; no new test relies on
      `Assert.Skip`.

## Explicitly out of scope

- Nullable-warning sweep (~99 pre-existing warnings; analyzer ratchet
  handles it gradually).
- Full end-to-end test of the new SDK UI against a live Emby — by
  construction the SDK UI is what Emby renders, so a load-the-DLL test
  is sufficient.
- Jellyfin support (AGENTS.md: not a target).
- Migrating the existing `IMPLEMENTATION-PLAN.md` / `plan.md` work —
  v2 subsumes it; those docs get archived.

## Spike

`spike/` (committed on this branch) is a self-contained proof-of-concept
that the 4.10.0.24-beta2 SDK exposes every API Wave 1 plans to depend on.
It builds clean (`dotnet build spike/Spike.csproj -c Release`) and is
deleted by U1 when the base classes move into the plugin proper.