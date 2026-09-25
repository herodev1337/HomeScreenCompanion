# AGENTS.md

## Platform targeting (IMPORTANT)

- **Target platform: Emby only.** The plugin is built, tested and deployed
  against Emby Server (see `HomeScreenCompanion.csproj` — `MediaBrowser.Common`
  / `MediaBrowser.Server.Core` 4.10.x packages).
- **Jellyfin is NOT a target right now.** Do not add Jellyfin-specific code
  paths or server-side branching. If code happens to run on Jellyfin, that is
  a bonus — but do not claim or document Jellyfin support until it has been
  verified end-to-end (see checklist below).

## Client/API compatibility notes

The web client (`HomeScreenCompanion/ClientApp`) is written against a
Jellyfin-shaped `ApiClient` surface (`getJSON(name, params)`), but runs on
Emby, where `ApiClient.getJSON(url, signal)` treats the second argument as an
`AbortSignal` (`fetchhelper` calls `signal.throwIfAborted()` synchronously).

`getApi()` in `ClientApp/src/modules/index.ts` adapts the raw
`window.ApiClient`:

- `getJSON(name, params)` -> `raw.getJSON(raw.getUrl(name, params))`
- absolute URLs (already produced by `getUrl`) pass through unchanged
- plain `fetch(getUrl(...))` calls must send an auth header
  (`X-Emby-Token` / `X-MediaBrowser-Token`) or they 401

Regression coverage: `ClientApp/src/__tests__/emby-compat.test.ts` loads the
built AMD bundle against an Emby-style `ApiClient` mock.

### Jellyfin support checklist (only then may it be documented)

All unverified. To claim Jellyfin support, verify each on a live Jellyfin:

1. `ApiClient.getPluginConfiguration` / `updatePluginConfiguration` exist and
   behave the same.
2. `ApiClient.getCurrentUserId`, `getScheduledTasks`, `startScheduledTask`
   exist.
3. `X-Emby-Token` auth header (or query param fallback) is accepted by the
   Jellyfin server for plugin routes.
4. The AMD externals (`emby-input`, `emby-button`, `emby-select`,
   `emby-checkbox`) resolve in jellyfin-web.
5. Plugin config page loads, rows expand, save/run/log flows work.
6. Server side: any Emby-specific APIs used (home sections, user manager,
   etc.) behave identically on Jellyfin.

When (and only when) that passes, document it in `README.md` + this file.

## Build / test / lint

Client (bundle is GENERATED — never hand-edit `Configuration/configPage.js`):

```sh
cd HomeScreenCompanion/ClientApp
npm run build       # rollup -> ../Configuration/configPage.js (embedded resource)
npm run typecheck   # tsc --noEmit
npm test            # vitest (happy-dom), 419 tests
npm run lint        # eslint
```

Server:

```sh
dotnet build HomeScreenCompanion/HomeScreenCompanion.csproj -c Release
```

`Configuration/configPage.js` and `Configuration/configPage.html` are embedded
into the DLL via the csproj, so a normal rebuild/deploy picks up client changes.

## Versioning & releases

- `version.txt` (repo root) is the single source of truth for the plugin
  version (4-part, e.g. `4.1.5.1`). Never hardcode a version in the csproj
  or elsewhere — `HomeScreenCompanion.csproj` reads it for the
  assembly/file version, appends `-<short commit sha>` for the
  informational version (e.g. `4.1.5.1-1a2b3c4`), and
  `ClientApp/rollup.config.mjs` reads it for the bundle footer.
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
  tests,   then creates tag `vX.Y.Z.B` and a GitHub release carrying the built
  DLL. A manual `workflow_dispatch` overrides the bump type (`auto` =
  derive from the selected branch, `none` = build only, no tag).
