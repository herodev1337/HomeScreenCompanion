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
