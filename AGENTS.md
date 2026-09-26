# AGENTS.md

## Platform targeting (IMPORTANT)

- **Target platform: Emby only.** The plugin is built, tested and deployed
  against Emby Server (see `HomeScreenCompanion.csproj` — `MediaBrowser.Common`
  / `MediaBrowser.Server.Core` 4.10.x packages).
- **Jellyfin is NOT a target right now.** Do not add Jellyfin-specific code
  paths or server-side branching. If code happens to run on Jellyfin, that is
  a bonus — but do not claim or document Jellyfin support until it has been
  verified end-to-end.

## UI model

The plugin uses the Emby SDK declarative-UI model
(`MediaBrowser.Model.Plugins.UI.IHasUIPages` + `EditableOptionsBase`):

- `HomeScreenCompanion/Plugin.cs` exposes
  `IReadOnlyCollection<IPluginUIPageController> UIPageControllers` with
  four controllers: Main, Top Lists, Home Sections, Logs.
- `HomeScreenCompanion/UI/` holds the per-page model + controller + view +
  options-store. Lifted base classes live under
  `HomeScreenCompanion/UIBaseClasses/`.
- `MainPageUI` persists to `HomeScreenCompanion.json` via
  `MainPageOptionsStore` (a `SimpleFileStore<MainPageUI>` over
  `IApplicationPaths.PluginConfigurationsPath`).

There is no web client, no AMD bundle, no rollup pipeline, no npm install.
All UI is rendered server-side by the SDK.

## Build / test / lint

Server only:

```sh
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release
dotnet test  tests/HomeScreenCompanion.Tests/HomeScreenCompanion.Tests.csproj -c Release
dotnet format whitespace HomeScreenCompanion/HomeScreenCompanion.csproj --verify-no-changes --no-restore
```

## Remotes

- `origin` = `herodev1337/HomeScreenCompanion` (the active fork). **All pushes
  go here** — branches, tags, release commits.
- `upstream` = `soderlund91/HomeScreenCompanion`. **Never push here.** No
  write access on this remote, and even if credentials were added later,
  upstream releases are coordinated out-of-band with the upstream
  maintainer. To get a change upstream, open a PR from
  `origin/<branch>` → `upstream:main` and let the maintainer merge.

## Versioning & releases

- `version.txt` (repo root) is the single source of truth for the plugin
  version (4-part, e.g. `4.1.5.1`). Never hardcode a version in the csproj
  or elsewhere — `HomeScreenCompanion.csproj` reads it for the
  assembly/file version, appends `-<short commit sha>` for the
  informational version (e.g. `4.1.5.1-1a2b3c4`).
  The assembly version must stay purely numeric (Emby parses it).
- `node scripts/bump-version.mjs [build|patch|minor|major|none]` bumps it
  (default `build` = 4th segment) and prints the new version.
- CI (`.github/workflows/build.yml`) releases on merge to `main` via PR, with
  the bump type derived from the PR's head branch name (semver-style):
  `fix/*` (also `bugfix/*`, `hotfix/*`) → patch, `feat/*` (also `feature/*`)
  → minor, `breaking/*` (also `major/*`) → major. Direct pushes to `main`
  (not from a PR merge) bump the 4th build segment. Merges from any other
  branch name, and plain PR builds, only build + test — no tag/release.
  On release the pipeline commits `version.txt` (`[skip ci]`), builds +
  tests, then creates tag `vX.Y.Z.B` and a GitHub release carrying the built
  DLL. A manual `workflow_dispatch` overrides the bump type (`auto` =
  derive from the selected branch, `none` = build only, no tag).
