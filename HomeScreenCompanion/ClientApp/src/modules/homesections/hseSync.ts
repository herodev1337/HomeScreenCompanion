// D4 (form.ts split): network sync for the home-section sub-tab.
// Extracted from `form.ts:512-708` (legacy.js:3035-3112).
//
// `syncHomeSectionFromEmby` is the only network caller left in the
// home-sections surface after D4. It reads the row's tracked-section
// payload, fetches the live `HomeScreenCompanion/Hsc/UserSections` JSON
// for the row's user, and mirrors the matching `ContentSection` back
// into the freshly-rendered form. Network errors are swallowed silently.

import { updateHseImageTypeState, updateHseItemsOnlyVisibility } from './hseVisibility';

/**
 * Minimal slice of the Jellyfin `ApiClient` surface consumed by
 * {@link syncHomeSectionFromEmby}. Mirrors `ManageApiClient` in
 * `manageTab.ts` plus a `getJSON` method kept for symmetry with
 * `HseUsersApiClient` (the live sync path uses `fetch` directly).
 */
export interface HomeSectionApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON(name: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Dependencies for {@link syncHomeSectionFromEmby}. Replaces the
 * legacy module-scope `window.ApiClient` and the global `fetch`.
 */
export interface SyncHomeSectionDeps {
    readonly fetch: typeof fetch;
    readonly getApiClient: () => HomeSectionApiClient;
}

/**
 * Sync the home-section tab's form values with the live `ContentSection`
 * from Emby (legacy.js:3035–3112).
 *
 *   1. Reads `tab.dataset.hseTracked` (URL-encoded JSON) and picks the
 *      first entry whose `SectionId` does NOT start with `hsc__` (the
 *      plugin-internal sentinel for synthetic rows). No matching entry
 *      → resolves to `Promise.resolve()` with no DOM touches.
 *   2. Builds the headers (with `X-Emby-Token` when a token exists)
 *      and the URL via `ApiClient.getUrl`, then `fetch`es
 *      `HomeScreenCompanion/Hsc/UserSections?UserId=<entry.UserId>`.
 *   3. On a 200 response, maps the matching section's fields into the
 *      tab's `[data-field="…"]` controls:
 *        - `SELECT` elements have their `selectedIndex` set to the
 *          matching option (when present);
 *        - non-SELECT elements get `el.value = val`.
 *      The `_hsePlaystate` field is derived from `section.Query`
 *      (`IsResumable` → `inprogress`, `IsPlayed === true` → `played`,
 *      `IsUnplayed === true` / `IsPlayed === false` → `unplayed`).
 *   4. Syncs `.selHseItemTypes` from `section.ItemTypes.join(',')` and
 *      every `.chkHseLibrary` from `section.ExcludedFolders` (a
 *      missing `ExcludedFolders` array leaves the checkboxes alone —
 *      legacy quirk).
 *   5. Calls {@link updateHseItemsOnlyVisibility} and
 *      {@link updateHseImageTypeState} to refresh the dependent
 *      visibility state.
 *
 * Network errors are swallowed by the trailing `.catch(function () { return undefined; })`.
 *
 * @param tab  The home-section container (`.homescreen-tab`).
 * @param deps See {@link SyncHomeSectionDeps}.
 * @returns    A promise that resolves when the sync is complete (or
 *             immediately when no tracked section exists).
 */
export function syncHomeSectionFromEmby(
    tab: HTMLElement,
    deps: SyncHomeSectionDeps,
): Promise<void> {
    const tracked: Array<{ SectionId?: string; UserId?: string }> = [];
    try {
        const parsed = JSON.parse(decodeURIComponent(tab.dataset.hseTracked || '%5B%5D')) as Array<{ SectionId?: string; UserId?: string }>;
        tracked.push(...parsed);
    } catch { /* swallow malformed JSON */ }
    const entry = tracked.find((t) => t.SectionId && !t.SectionId.startsWith('hsc__'));
    if (!entry || !entry.UserId) return Promise.resolve();

    const syncHeaders: Record<string, string> = {};
    const syncToken = deps.getApiClient().accessToken();
    if (syncToken) syncHeaders['X-Emby-Token'] = syncToken;
    const syncUrl = deps.getApiClient().getUrl('HomeScreenCompanion/Hsc/UserSections', { UserId: entry.UserId });

    return deps.fetch(syncUrl, { headers: syncHeaders })
        .then((r) => r.json())
        .then((data) => {
            const payload = (data && typeof data === 'object') ? data as { Sections?: Array<Record<string, unknown>> } : null;
            const sections = payload?.Sections || [];
            const section = sections.find((s) => s && s['Id'] === entry.SectionId);
            if (!section) return;

            const query = (section['Query'] && typeof section['Query'] === 'object')
                ? section['Query'] as { IsResumable?: unknown; IsPlayed?: unknown; IsUnplayed?: unknown }
                : null;
            const sd = section['ScrollDirection'];
            const str = (v: unknown): string => typeof v === 'string' ? v : '';
            const numToDir = (v: unknown): string => v === 0 ? 'Horizontal' : v === 1 ? 'Vertical' : '';
            const fieldMap: Record<string, string> = {
                SectionType: str(section['SectionType']),
                CustomName: str(section['CustomName']),
                DisplayMode: str(section['DisplayMode']),
                ViewType: str(section['ViewType']),
                ImageType: str(section['ImageType']),
                SortBy: str(section['SortBy']),
                SortOrder: str(section['SortOrder']),
                ScrollDirection:
                    sd === null || sd === undefined ? '' :
                    typeof sd === 'number' ? numToDir(sd) :
                    str(sd),
                _hsePlaystate:
                    query?.IsResumable === true ? 'inprogress' :
                    query?.IsPlayed === true ? 'played' :
                    (query?.IsUnplayed === true || query?.IsPlayed === false) ? 'unplayed' :
                    '',
            };

            Object.keys(fieldMap).forEach((field) => {
                const el = tab.querySelector<HTMLElement>(`[data-field="${field}"]`);
                if (!el) return;
                const val = fieldMap[field]!;
                if (el.tagName === 'SELECT') {
                    const sel = el as HTMLSelectElement;
                    for (let i = 0; i < sel.options.length; i++) {
                        if (sel.options[i]!.value === val) { sel.selectedIndex = i; break; }
                    }
                } else {
                    (el as HTMLInputElement).value = val;
                }
            });

            const itemTypesSel = tab.querySelector<HTMLSelectElement>('.selHseItemTypes');
            if (itemTypesSel && Array.isArray(section['ItemTypes']) && (section['ItemTypes'] as unknown[]).length > 0) {
                const itemTypesStr = (section['ItemTypes'] as unknown[]).map(String).join(',');
                for (let i = 0; i < itemTypesSel.options.length; i++) {
                    if (itemTypesSel.options[i]!.value === itemTypesStr) { itemTypesSel.options[i]!.selected = true; break; }
                }
            }

            if (Array.isArray(section['ExcludedFolders'])) {
                const embyExcluded = new Set((section['ExcludedFolders'] as unknown[]).map((id) => String(id)));
                tab.querySelectorAll<HTMLInputElement>('.chkHseLibrary').forEach((chk) => {
                    chk.checked = !embyExcluded.has(chk.value);
                });
            }

            updateHseItemsOnlyVisibility(tab);
            updateHseImageTypeState(tab);
        })
        .catch(() => undefined);
}
