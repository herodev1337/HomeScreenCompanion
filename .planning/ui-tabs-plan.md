# HSC UI/UX — User Journeys & Emby.SDK Plan

**Goal:** Replace the current 4-site panel split with **one menu entry, multiple tabs**, using Emby's declarative UI (`IHasUIPages` + `IHasTabbedUIPages` + `EditableOptionsBase`). Match the old `Configuration/configPage.html` (the "big .js file") feature-for-feature, then improve where the SDK is naturally better.

**Reference SDK sample:** `Emby.SDK/SampleCode/Examples/EmbyPluginUiDemo/` — specifically `MainPageController1.cs` for the `IHasTabbedUIPages` pattern, `ButtonsAndLinksPageView.cs` for `RunCommand`/`StatusItem`/`ItemListIconMode.LargeRegular`/`HasPercentage` patterns, `SelectDialogView.cs` for `EditorSelectOption` + return-value dialogs, `ChildCollectionsView.cs` for `IEditableObjectCollection` dynamic rows, `ListsPageView.cs` for `AutoPostBack`/`GenericItemList`.

---

## Old UI (big .js file) — what's there now

`Configuration/configPage.html` is **one page** with **5 main tabs** + nested sub-tabs + 4 modal overlays.

| # | Tab | Content | Notes |
|---|-----|---------|-------|
| 1 | **Tag & Collection** (default) | Add-tag button, search/filter/sort bar, list of `TagConfig` rows. Each row is a collapsible body with sub-tabs: Sources / Schedule / MediaInfo Filters / Collection / Home Section / Playlist. Per-row: enable toggle, drag, duplicate, delete, "Run now", status badge | Heaviest tab. Each row embeds the entire sub-config inline. |
| 2 | **Top Lists** | List of `TopListHomeSection` items. "+ MDBList / + Trakt / + TMDB / + Manual" buttons. Inline edit per item. | |
| 3 | **Home Screen** | 2 sub-tabs: (a) **Manage** — list of source user's current `ContentSection`s from `IUserManager.GetHomeSections`, drag to reorder, delete; (b) **Copy & Sync** — source/target user picker, "Sync now" | |
| 4 | **Cleanup** | Delete tags/collections from library (`Tags/[name]/Items`). "Confirm-then-go" dialog. | |
| 5 | **Settings** | (a) External list API keys (Trakt/MDBList/TMDB) — collapsible panels; (b) AI providers (Gemini/OpenAI/Claude/Ollama) with edit-system-prompt — collapsible; (c) Advanced toggles (extended log, log missing, dry run, preserve tags); (d) Backup & Restore (custom modal with section checkboxes) | All the API keys + AI provider settings live here. |
| — | **Floating actions** | "Save" + speed-dial "Run" with 3 targets (Full sync / Home sync / Tag sync) | |
| — | **Header buttons** | Help (8-section setup guide modal), Report bug, Logs, "Last run" indicator with status dot | |
| — | **Modal overlays** | `bugReportModalOverlay`, `logModalOverlay`, `helpModalOverlay`, `miHelpModalOverlay`, `tagTargetHelpModalOverlay` | |

## Current HSC UI (post-U8) — the regression

`Plugin.cs` exposes 4 **separate** `IPluginUIPageController`s → **4 menu entries**:

1. `HomeScreenCompanion` (Main) — flat list of scalars + an empty `EditorDxGrid Tags`
2. `HomeScreenCompanionTopLists` — empty `GenericItemList` + 3 placeholder buttons
3. `HomeScreenCompanionHomeSections` — empty `EditorDxGrid Sections` + a no-op "Apply tag" button
4. `HomeScreenCompanionLogs` — read-only log display

**Problems vs the old .js UI:**

| Problem | Impact |
|---------|--------|
| 4 menu entries instead of 1 | Visual noise; user can't tell they're related; back-navigation between tabs is awkward |
| The Tag grid is empty — no way to add/edit tag configs | **Blocker.** The plugin's entire main feature is unreachable from the UI |
| The Home Sections page has no "manage source user's sections" UX | User can't see/create/reorder sections — the old "Manage" sub-tab is gone |
| The Top Lists page buttons are stubs | Can't add a list from the UI |
| No Backup/Restore in the UI | Config-page-only feature dropped |
| No Help, no Bug Report, no AI System Prompt reset | Support friction |
| No "Run now" / status indicator | User can't tell what the plugin is doing |
| No 5th tab (Settings → API keys + AI providers + Run interval) | API keys are on Main but separated from "where you set them" for tags |

---

## New plan — single page, 5 tabs (`IHasTabbedUIPages`)

`Plugin.cs` keeps `IHasUIPages` but registers **one** `MainPageController`. That controller implements `IHasTabbedUIPages` and exposes 5 `TabPageController`s (modeled on `EmbyPluginUiDemo/UI/TabPageController.cs`).

```
HomeScreenCompanion (one menu entry)
├── Tab: Tag & Collection      ← default (CreateDefaultPageView returns this)
├── Tab: Top Lists
├── Tab: Home Screen
├── Tab: Logs & Status
└── Tab: Settings
```

Mapping each old tab to its new tab + concrete SDK primitives:

---

### Tab 1 — Tag & Collection  *(default landing tab)*

**User journey:** open plugin → see all tag rules in a sortable grid → click a row → a full-screen edit dialog opens with sub-tabs → edit → save → row reflects change.

**Layout (`TagRulesTabUI : EditableOptionsBase`):**

```text
[ CaptionItem "Tag & collection sources"                       ]
[ ButtonItem "+ Add new source"  → opens AddSourceDialog       ]
[ EditorSelectSingle "Filter source type"   ← visiblecondition ]   (All | External | MediaInfo | AI | Playlist | Collection)
[ SpacerItem                                                       ]
[ EditorDxGrid Tags   ← DxDataGrid of TagConfigRow items           ]
```

**Grid columns (from `DxDataGrid` builder):** Name | Tag | Source type | Active | Enable tag | Enable collection | Enable home section | Last run | (Edit button)

**Edit dialog (`TagRowEditDialog : PluginDialogView`)** — full-screen, modeled on the old sub-tabbed row body but as `EditorSelectSingle` "Section" picker that swaps which property group is shown (or use 6 `CaptionItem`-gated sections). Sections:

| Section | Old JS sub-tab | New SDK implementation |
|---------|----------------|------------------------|
| Sources | `urls[]` / `local[]` | nested `EditableObjectCollection<SourceRowUI>` with `[VisibleCondition(SourceType, "External")]` |
| Schedule | `date-row` x N | nested `EditableObjectCollection<DateIntervalUI>` (Type=Specific/Recurring/WeekDays) |
| MediaInfo Filters | filter groups | nested `EditableObjectCollection<MediaInfoGroupUI>` with Operator/GroupOperator |
| Collection | name/desc/poster/enabled | CaptionItem + inputs, `[VisibleCondition(EnableCollection, true)]` |
| Home Section | sectionType, itemTypes, library, settings | CaptionItem + inputs, `[VisibleCondition(EnableHomeSection, true)]` |
| Playlist | name, userIds | CaptionItem + inputs, `[VisibleCondition(EnablePlaylist, true)]` |

Dialog footer buttons: **Save** | **Run now** | **Open logs** | **Cancel** (`StatusItem` shows last-run status, modeled on `ButtonsAndLinksPageView.HandleActionButton1`)

**AddSourceDialog (`PluginDialogView`)** — single-select "Type" dropdown → renders the right sub-form. Mirrors the old "Add new source" flow.

**Why this is better than the old JS:** the old row body was a 1500-line mini-page with collapsible sections, drag/drop URL rows, date pickers, day toggles, and inline user multi-selects all hand-coded. The SDK version uses native dialogs, native grids, native `EditorSelectSingle`, native `[VisibleCondition]`, native multi-select.

---

### Tab 2 — Top Lists

**User journey:** open tab → see list of top lists → add / edit / delete.

**Layout (`TopListsTabUI : EditableOptionsBase`):**

```text
[ CaptionItem "Top lists"                                      ]
[ ButtonItem "+ Add list"  → AddTopListDialog (sub-menu)       ]
[ SpacerItem                                                    ]
[ GenericItemList Lists  ← list of TopListSummary items         ]
```

`AddTopListDialog` uses `ButtonItem.SubMenuButtons` (per `ButtonsAndLinksUI.cs`) to expose "+ MDBList / + Trakt / + TMDB / + Manual" choices; each choice opens the appropriate **inline edit dialog** (`TopListEditDialog : PluginDialogView`).

Per-item row actions: Edit, Run sync for this list, Delete (with `ConfirmationPrompt`).

---

### Tab 3 — Home Screen

**User journey:** see source user's current sections → reorder / delete / add new → set up Copy & Sync → run.

Old UI had two sub-tabs. New UI uses **two `CaptionItem`-gated sections** under one `EditorSelectSingle "View"` picker (`VisibleCondition` switches between the two — same pattern as `ListsPageView`'s `DemoChoice`).

**Layout (`HomeScreenTabUI : EditableOptionsBase`):**

```text
[ EditorSelectSingle "View" → "Manage" | "Copy & sync"        ]
[ SpacerItem                                                    ]
[ ── Visible when View="Manage" ────────────────────────────    ]
[ EditorSelectSingle "Source user"                              ]
[ CaptionItem "Sections on this user's home screen"             ]
[ DxDataGrid Sections  ← ContentSection[] from IUserViewManager ]
    (Name | Type | Custom name | Item count | Reorder/Delete)    ]
[ ButtonItem "+ Add section"  → AddHomeSectionDialog            ]
[ ButtonItem "Apply now"  → IUserViewManager.AddHomeSection     ]
[ ── Visible when View="Copy & sync" ─────────────────────      ]
[ EditorSelectSingle "Source user"                              ]
[ EditorSelectSingle (multi) "Target users"                     ]
[ CheckBox "Sync library order"                                 ]
[ ButtonItem "Sync now"  → HomeSectionSyncTask via REST         ]
[ StatusItem SyncStatus                                         ]
```

`AddHomeSectionDialog` collects: section type (`boxset` | `items`), display mode, max items, item types, parent/collection picker (via `SelectDialogView` pattern), excluded folders. Posts to `IUserViewManager.AddHomeSection`.

---

### Tab 4 — Logs & Status  *(replaces Logs page + absorbs status indicator)*

**User journey:** see last run, current run progress, full log.

**Layout (`LogsTabUI : EditableOptionsBase`):**

```text
[ StatusItem LastRunStatus       ← LastSyncTime + LastSyncResult  ]
[ StatusItem CurrentRun          ← IsRunning / progress 0.0–1.0   ]
[ ButtonItem "Refresh"           ← re-reads ExecutionLog          ]
[ SpacerItem                                                    ]
[ LabelItem "Live execution log"                                 ]
[ EditMultiline(20) ReadOnly RunLog  ← full log, last entry bottom ]
```

Already has `LogsPageUI` working — mostly just a rename + small extension to show the schedule/runs status. No need to use JS.

---

### Tab 5 — Settings  *(absorbs old Settings tab + drops the misplaced scalars on Main)*

**User journey:** set up API keys, AI providers, run interval, advanced toggles, backup/restore.

**Layout (`SettingsTabUI : EditableOptionsBase`):**

```text
[ CaptionItem "External lists"                                  ]
[ IsPassword TraktClientId                                       ]
[ IsPassword MdblistApiKey                                       ]
[ IsPassword TmdbApiKey                                          ]
[ SpacerItem                                                    ]
[ CaptionItem "AI providers"                                    ]
[ IsPassword OpenAiApiKey                                        ]
[ Text       OpenAiModel                                         ]
[ IsPassword GeminiApiKey                                       ]
[ Text       GeminiModel                                         ]
[ IsPassword ClaudeApiKey                                       ]
[ Text       ClaudeModel                                         ]
[ Text       OllamaBaseUrl                                       ]
[ Text       OllamaModel                                         ]
[ SpacerItem                                                    ]
[ CaptionItem "System prompt"                                   ]
[ EditMultiline(7) AiSystemPrompt                                ]
[ ButtonItem "Reset to default"  (visible only when dirty)       ]
[ SpacerItem                                                    ]
[ CaptionItem "Schedule"                                        ]
[ Number MinValue(5) MaxValue(1440) RunIntervalMinutes           ]
[ SpacerItem                                                    ]
[ CaptionItem "Run behavior"                                    ]
[ CheckBox DryRunMode                                            ]
[ CheckBox ExtendedConsoleOutput                                 ]
[ CheckBox LogMissingItems                                       ]
[ CheckBox PreserveTagsOnEmptyResult                             ]
[ SpacerItem                                                    ]
[ CaptionItem "Backup & restore"                                ]
[ ButtonItem "Export backup…"  → opens BackupDialog              ]
[ ButtonItem "Import backup…"  → opens RestoreDialog             ]
[ SpacerItem                                                    ]
[ CaptionItem "Plugin"                                          ]
[ LabelItem  Version / GitHub link / Forum link                  ]
```

All scalars that were on the old Main tab (and the misplaced AI keys on the current Main) move here. **The Main tab becomes pure Tag & Collection** — its only job is the work surface.

**BackupDialog (`PluginDialogView`)** — 6 checkboxes (Settings, ApiKeys, Tags, SavedFilters, TopLists, HomeSync) + Download button → POSTs to the existing `HomeScreenCompanion/Backup/Export` endpoint. Mirrors the old `dt()` modal.

**RestoreDialog (`PluginDialogView`)** — file picker + same 6 checkboxes + Restore button → POSTs `HomeScreenCompanion/Backup/Import`.

---

### Shared page chrome — replaced by `Caption` / `HelpUrl` / `SubCaption`

The old floating buttons (Save, Run, Help, Bug Report, Logs, last-run indicator) cannot live on the parent of a tabbed page (each tab is its own `IPluginUIView`). The Emby-native equivalents:

| Old JS chrome | New SDK replacement |
|---------------|---------------------|
| Floating "Save" button on every tab | Each tab's own Save button (SDK provides it natively when `ShowSave=true` on the view) |
| Floating "Run" speed-dial | Per-tab "Run now" buttons + a `StatusItem` on the Logs tab |
| Header "Help" → 8-section modal | `HelpUrl` per-tab pointing at the existing GitHub wiki/help page |
| Header "Report bug" → modal | `LabelItem` with `HyperLink` to the existing GitHub Issues URL |
| Header "Logs" modal | **The Logs tab itself** — no modal needed |
| "Last run" status dot | `StatusItem` on the Logs tab |

This is a **deliberate** simplification — the SDK model is "every tab is a full page; the page chrome moves into each tab's content". It removes the need for a sticky floating-action bar while keeping every action reachable.

---

## Phased delivery

Given the scope, I'll ship in 4 phases so you can validate at each step.

### Phase U9 — Scaffold tabbed shell
- `Plugin.cs` keeps `IHasUIPages`, drops 3 of 4 controllers, keeps only `MainPageController`.
- `MainPageController` implements `IHasTabbedUIPages` (copy from `EmbyPluginUiDemo/UI/MainPageController1.cs`).
- Add `TabPageController` helper.
- 5 tab controllers (one per tab) each backed by a stub `*TabUI : EditableOptionsBase` showing just `[CaptionItem "TODO"]`.
- `UIBaseClasses/ControllerBase.cs` already matches the demo; no change needed.
- Delete `HomeSectionsPageUI/View.cs`, `TopListsPageUI/View.cs`, `LogsPageUI/View.cs` (replaced by tab views).
- Build + lint must pass.

### Phase U10 — Settings tab (full)
- Wire `MainPageConfigMapper` to mirror all 4 UI scalar groups into `PluginConfiguration`.
- 4 dialogs: BackupDialog, RestoreDialog, ResetSystemPrompt, HelpUrl labels.
- Backup/Restore reuse existing `HomeScreenCompanionService` endpoints (no new C#).

### Phase U11 — Tag & Collection tab + TagRowEditDialog
- DxGrid of `TagConfigRow` populated from `PluginConfiguration.Tags`.
- "+ Add new source" dialog with type picker.
- Full-screen `TagRowEditDialog` with the 6 section groups (Sources / Schedule / MediaInfo / Collection / Home Section / Playlist).
- Per-row Run/Logs/Status.

### Phase U12 — Top Lists + Home Screen tabs
- Top Lists tab with Add sub-menu (4 source types), per-list edit dialog, delete confirmation.
- Home Screen tab with the 2-section (Manage / Copy & sync) picker, ContentSection CRUD via `IUserViewManager`, sync now button.

### Phase U13 — Logs & Status tab + final polish
- Move the Logs page content into a tab.
- Add `StatusItem` for current run + last run.
- Add `HelpUrl` per tab.
- Delete the now-orphan files from `UIBaseClasses/`.

After each phase: `dotnet build -c Release && dotnet format whitespace --verify-no-changes --no-restore`. Phase boundaries correspond to commits on a `feat/ui-tabs` branch.

---

## Open questions for you (decide before Phase U9 starts)

1. **Tabs order**: I propose `Tag & Collection` first (it's the work surface, matches old default). OK?
2. **Settings tab scope**: should it own the "Run interval" + "Dry run" + "Advanced toggles" or should those stay on the Tag tab where users will look first? *(My take: Settings tab — they're global, not per-tag.)*
3. **Inline `ApplyHomeSections` button on tag rows** (the old "Run this tag's home section logic" — currently exposed as a no-op stub `ApplyTag` button). Useful as a button on each `TagRowEditDialog`, OR keep it as a tag-level action via the row status badge?
4. **Delete-tag UX**: confirm-via-`ConfirmationPrompt` attribute on the row's `ButtonItem`, or a dedicated dialog? *(My take: `ConfirmationPrompt` is enough for delete.)*
5. **Run speed-dial on the old UI had 3 modes** (Full sync / Home sync / Tag sync). With tabs, the natural fit is per-tab Run buttons. OK to drop the "Full sync" convenience and let users trigger Full sync only from the Logs tab?
6. **Backup/Restore inside Settings**: old JS used a custom modal with 6 checkboxes; SDK gives us a `PluginDialogView` with the same controls. OK?
