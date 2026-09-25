// D4 (configState.ts split): update-check footer UI. Extracted from
// `configState.ts:752-823` (legacy.js:3593-3627).
//
// D4 fixes the href-injection regression at legacy.js:795 + :814: the
// `release.html_url` returned by the GitHub `releases/latest` endpoint
// is interpolated raw into an `<a href="…">` attribute. A hostile
// release with `html_url = 'javascript:alert(1)'` (or one containing
// `"`) would break out of the attribute and execute. The fix routes
// every interpolated URL through the canonical `escapeAttr` helper so
// `"` becomes `&quot;` and `<` / `>` become entities.

import { escapeAttr } from '../dom/dom';

/**
 * Dependencies for {@link checkForUpdates}.
 *
 *   - `fetch`       the global `fetch` (also used for the GitHub call
 *                   that the legacy code hits directly).
 *   - `getApiClient` returns the Jellyfin `ApiClient` shape with the
 *                   `getUrl(name)` method the legacy code uses to build
 *                   the version URL. The legacy `getJSON(url)` path is
 *                   replaced by `fetch(getApiClient().getUrl(name))`
 *                   here so the signature stays minimal.
 */
export interface CheckForUpdatesDeps {
    readonly fetch: typeof fetch;
    readonly getApiClient: () => {
        getUrl: (name: string) => string;
        accessToken: () => string;
    };
}

/**
 * Check the installed plugin version against the latest GitHub
 * release, then update the footer DOM (legacy.js:3593-3627).
 *
 *   1. `fetch(deps.getApiClient().getUrl('HomeScreenCompanion/Version'))` →
 *      `{ Version }`. When `#footerVersionText` exists and the version
 *      is truthy, it's stamped with a `<a>` linking to the matching
 *      GitHub release tag page (the link URL is composed from the
 *      server-controlled version string; escaped through `escapeAttr`
 *      so a hostile version value cannot break out of the `href`
 *      attribute).
 *   2. If the version is empty, the GitHub fetch is skipped.
 *   3. The GitHub API is hit at the hard-coded `releases/latest`
 *      endpoint; its `tag_name` is compared segment-wise against
 *      `currentVer`. When strictly newer, `#footerUpdateInfo` is
 *      stamped with an "Update available: v…" `<a>`, and the
 *      `#footerUpdateSep` separator's `display` is reset.
 *      `release.html_url` is escaped through `escapeAttr` before
 *      interpolation (D4 fix — href injection: a malicious
 *      `html_url` of `" javascript:alert(1) "` or
 *      `"onmouseover="alert(1)""` is now safe).
 *
 * Both fetches swallow rejection silently (matching the legacy
 * `.catch(function () {})` chains).
 *
 * @param view  The config page root. Used for context only — the
 *              version / update DOM elements are looked up via
 *              `document.getElementById` (matching the legacy code).
 * @param deps  See {@link CheckForUpdatesDeps}.
 */
export function checkForUpdates(view: HTMLElement, deps: CheckForUpdatesDeps): void {
    void view;
    const versionHeaders: Record<string, string> = {};
    const versionToken = deps.getApiClient().accessToken();
    if (versionToken) versionHeaders['X-Emby-Token'] = versionToken;
    deps.fetch(deps.getApiClient().getUrl('HomeScreenCompanion/Version'), { headers: versionHeaders })
        .then((r) => r.json() as Promise<{ Version?: string }>)
        .then((result) => {
            const currentVer = result.Version || '';
            const footerVer = document.getElementById('footerVersionText');
            if (footerVer && currentVer) {
                const releaseUrl = 'https://github.com/soderlund91/HomeScreenCompanion/releases/tag/v' + currentVer;
                footerVer.innerHTML = '<a href="' + escapeAttr(releaseUrl) + '" target="_blank" style="color:inherit;text-decoration:none;">v' + escapeAttr(currentVer) + '</a>';
            }
            if (!currentVer) return;

            return deps.fetch('https://api.github.com/repos/soderlund91/HomeScreenCompanion/releases/latest')
                .then((r) => r.json() as Promise<{ tag_name?: string; html_url?: string }>)
                .then((release) => {
                    const latestTag = (release.tag_name || '').replace(/^v/i, '');
                    if (!latestTag) return;
                    const a = latestTag.split('.').map(Number);
                    const b = currentVer.split('.').map(Number);
                    let isNewer = false;
                    for (let i = 0; i < Math.max(a.length, b.length); i++) {
                        if ((a[i] || 0) > (b[i] || 0)) { isNewer = true; break; }
                        if ((a[i] || 0) < (b[i] || 0)) break;
                    }
                    if (isNewer) {
                        const footerUpdate = document.getElementById('footerUpdateInfo');
                        if (footerUpdate) {
                            const safeUrl = escapeAttr(release.html_url || '');
                            footerUpdate.innerHTML = '<a href="' + safeUrl + '"'
                                + ' target="_blank" class="footer-update-link">Update available: v' + escapeAttr(latestTag) + '</a>';
                            const footerUpdateSep = document.getElementById('footerUpdateSep');
                            if (footerUpdateSep) footerUpdateSep.style.display = '';
                        }
                    }
                })
                .catch(() => undefined);
        })
        .catch(() => undefined);
}
