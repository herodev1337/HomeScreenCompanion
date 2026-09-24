// Phase 3 wave 3 + Phase 5 follow-up: home-section user multi-select
// helpers and the deferred loaders, leaf module extracted from
// `Configuration/configPage.js` (legacy.js:2748-2756, 2758-2822, 2824-2843).
//
// Functions here:
//
//   - `getHseUsers(deps)`              — fetches the Emby `Users`
//                                        endpoint, trims to `{Id, Name}`,
//                                        memoizes into `deps.cache.users`.
//                                        legacy.js:2748-2756.
//   - `buildUserMultiSelectHtml(...)`  — pure HTML-string builder for
//                                        the dropdown panel.
//                                        legacy.js:2758-2785.
//   - `wireUserMultiSelect(container)` — DOM-only event wiring for the
//                                        dropdown. legacy.js:2787-2822.
//   - `preFetchLibraryData(deps)`      — memoized `Promise.all` of
//                                        `TopList/List` + `VirtualFolders`
//                                        fetches, normalized into
//                                        `{topListFolderNames, virtualFolders}`.
//                                        legacy.js:2824-2843.
//
// Two PHASE-5 STATE CACHES (`HseUserCacheState` in `modules/state/state.ts`)
// replace the legacy module-scope `_hseUsersCache` /
// `_hseLibraryCachePromise` vars; the future `index.ts` factory
// instantiates the cache once and passes it via deps.

import type { HseUserCacheState } from '../state/state';
import type { HscUserLike } from './hscTab';

/**
 * Minimal slice of the Jellyfin `ApiClient` surface that
 * {@link getHseUsers} and {@link preFetchLibraryData} need. Mirrors the
 * `ManageApiClient` shape in `manageTab.ts` plus a `getJSON` method for
 * the user-list call.
 */
export interface HseUsersApiClient {
    getJSON(name: string, params?: Record<string, unknown>): Promise<unknown>;
    getUrl(name: string, params?: Record<string, unknown>): string;
    accessToken(): string;
}

/**
 * Dependencies for {@link getHseUsers} and {@link preFetchLibraryData}.
 * `cache` replaces the legacy module-scope `_hseUsersCache` /
 * `_hseLibraryCachePromise` vars; `getApiClient` replaces
 * `window.ApiClient`. The global `fetch` is still used for the library
 * pre-fetch (matching legacy) — see {@link preFetchLibraryData}.
 */
export interface HseUsersDeps {
    readonly getApiClient: () => HseUsersApiClient;
    readonly cache: HseUserCacheState;
}

/**
 * Fetch the Emby `Users` endpoint, trim each entry to `{Id, Name}`, and
 * memoize the result. Mirrors `getHseUsers` in legacy.js:2748-2756.
 *
 * Behavior contract (byte-for-byte with legacy):
 *   - `deps.cache.users` non-null → returns `Promise.resolve(cache.users)`
 *     without touching the network.
 *   - Otherwise → `apiClient.getJSON('Users', { IsDisabled: false })`,
 *     `(resp || []).map(u => ({ Id: u.Id, Name: u.Name }))`, stores the
 *     result in `deps.cache.users`, and returns it.
 *
 * @param deps  `HseUsersApiClient` + `HseUserCacheState` (from `state.ts`).
 * @returns     The trimmed `{Id, Name}[]` user list.
 */
export function getHseUsers(deps: HseUsersDeps): Promise<HscUserLike[]> {
    if (deps.cache.users) return Promise.resolve(deps.cache.users);
    return deps.getApiClient().getJSON('Users', { IsDisabled: false }).then((resp) => {
        const raw = (resp || []) as readonly { Id: string; Name: string }[];
        const list: HscUserLike[] = raw.map((u) => ({ Id: u.Id, Name: u.Name }));
        deps.cache.users = list;
        return list;
    });
}

/**
 * Memoized `Promise.all` of two server payloads: the plugin's
 * `HomeScreenCompanion/TopList/List` endpoint and the global
 * `Library/VirtualFolders` endpoint. Mirrors `preFetchLibraryData` in
 * legacy.js:2824-2843.
 *
 * Behavior contract (byte-for-byte with legacy):
 *   - `deps.cache.libraryPromise` non-null → returns it untouched.
 *   - Otherwise → builds `Promise.all` of two `fetch` calls (each with
 *     `X-MediaBrowser-Token: <accessToken()>`), with `.catch` fallbacks:
 *     * `TopList/List`     → `{ FolderNames: [] }` on rejection.
 *     * `Library/VirtualFolders` → `[]` on rejection.
 *   - Then combines into
 *     `{ topListFolderNames: Set<string>, virtualFolders: readonly unknown[] }`,
 *     lowercasing every folder name on the way in.
 *   - Final `.catch` clears `deps.cache.libraryPromise` and returns the
 *     empty shape — legacy quirk that allows retries on failure.
 *
 * @param deps  `HseUsersApiClient` + `HseUserCacheState` (from `state.ts`).
 * @returns     Promise resolving to the combined shape (or empty shape
 *              on failure).
 */
export function preFetchLibraryData(deps: HseUsersDeps): Promise<unknown> {
    if (deps.cache.libraryPromise) return deps.cache.libraryPromise;
    const apiClient = deps.getApiClient();
    const token = apiClient.accessToken();
    const headers: Record<string, string> = { 'X-MediaBrowser-Token': token };
    deps.cache.libraryPromise = Promise.all([
        fetch(apiClient.getUrl('HomeScreenCompanion/TopList/List'), { headers })
            .then((r) => r.json())
            .catch(() => ({ FolderNames: [] })),
        fetch(apiClient.getUrl('Library/VirtualFolders'), { headers })
            .then((r) => r.json())
            .catch(() => [] as readonly unknown[]),
    ])
        .then((results) => {
            const first = results[0] as { FolderNames?: readonly string[] } | undefined;
            const second = results[1] as readonly unknown[] | undefined;
            return {
                topListFolderNames: new Set((first?.FolderNames || []).map((n) => n.toLowerCase())),
                virtualFolders: second || [],
            };
        })
        .catch(() => {
            deps.cache.libraryPromise = null;
            return { topListFolderNames: new Set<string>(), virtualFolders: [] as readonly unknown[] };
        });
    return deps.cache.libraryPromise;
}

/**
 * Minimal user shape consumed by `buildUserMultiSelectHtml`. The
 * legacy code passes through `{ Id, Name }` from the Emby `Users`
 * endpoint, so the type here is deliberately narrow — only those
 * two fields are rendered.
 */
export interface UserOption {
    Id: string;
    Name: string;
}

/**
 * Escape characters that have a special meaning inside HTML
 * **attribute** values. Replacements:
 *   - `&` → `&amp;`
 *   - `"` → `&quot;`
 *
 * Single quotes are intentionally NOT escaped because the legacy
 * function embedded these strings into double-quoted attributes only
 * (the `value="..."`, `data-name="..."`, and `class="..."` slots).
 * Mirrors the canonical `escapeHtml` in `modules/dom/dom.ts` minus
 * the `<` / `>` replacements — those are not needed inside
 * attribute values, and the snapshot equivalence is preserved.
 *
 * Non-string input is coerced via `String()`. `null` / `undefined`
 * become `''` after the `||` short-circuit, which matches the
 * legacy contract for missing fields.
 */
function escAttr(s: unknown): string {
    return (typeof s === 'string' ? s : '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Escape characters that have a special meaning inside HTML text
 * content. Replacements:
 *   - `&` → `&amp;`
 *   - `<` → `&lt;`
 *   - `>` → `&gt;`
 *
 * Double quotes are NOT escaped here — the legacy function only used
 * `escHtml` inside `<span>` text nodes, never inside attribute
 * values. The asymmetry vs. `escAttr` is intentional and pinned by
 * the test suite.
 */
function escHtml(s: unknown): string {
    return (typeof s === 'string' ? s : '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build the HTML for the "Target Users" multi-select dropdown used by
 * the home-section tab and by the top-list modal.
 *
 * Output structure:
 *
 *   - Empty `users` → `<em>No users found</em>` (with legacy opacity
 *     styling).
 *   - Otherwise → a `.filter-dropdown-wrapper.hsc-user-dropdown`
 *     containing a toggle button (label + caret) and a hidden
 *     `.filter-dropdown-panel` with one row per user. Each row is a
 *     checkbox labeled with the user's name; the checkbox carries
 *     `class="<checkboxClass>"`, `value="<user.Id>"`, and
 *     `data-name="<user.Name>"`.
 *
 * The label on the toggle button summarizes the current selection:
 *
 *   - zero selected → `"No users selected"`
 *   - all selected  → `"All users"`
 *   - partial       → comma-joined `Name`s in the order they appear
 *                     in `users`
 *
 * @param users          The Emby user list (already trimmed to
 *                       `{Id, Name}` by the deferred `getHseUsers`).
 *                       Falsy / empty → renders the "No users found"
 *                       placeholder.
 * @param selectedIds    Persisted selection (`user.Id` strings).
 *                       Falsy → treated as an empty selection.
 * @param checkboxClass  Class name applied to every checkbox. Callers
 *                       use this to scope handlers (`'chkHseUser'`,
 *                       `'chkPlaylistUser'`, `'chkTlmUser'`, …).
 * @returns              The dropdown's HTML string.
 */
export function buildUserMultiSelectHtml(
    users: readonly UserOption[] | null | undefined,
    selectedIds: readonly string[] | null | undefined,
    checkboxClass: string,
): string {
    if (!users || users.length === 0) {
        return '<em style="opacity:0.5">No users found</em>';
    }
    const sel = selectedIds || [];
    const rows = users.map((u) => {
        const chk = sel.indexOf(u.Id) !== -1 ? ' checked' : '';
        return '<div class="checkboxContainer" style="margin:2px 0;">' +
            '<label><input type="checkbox" is="emby-checkbox" class="' + escAttr(checkboxClass) + '" value="' + escAttr(u.Id) + '" data-name="' + escAttr(u.Name) + '"' + chk + '>' +
            '<span>' + escHtml(u.Name) + '</span></label></div>';
    }).join('');
    const checkedNames = users
        .filter((u) => sel.indexOf(u.Id) !== -1)
        .map((u) => u.Name);
    const lbl = checkedNames.length === 0
        ? 'No users selected'
        : checkedNames.length === users.length
            ? 'All users'
            : checkedNames.join(', ');
    const btnStyle = 'display:flex;align-items:center;width:100%;padding:6px 10px;' +
        'background:var(--plugin-input-bg,rgba(128,128,128,0.08));' +
        'border:1px solid var(--plugin-input-border,var(--line-color));' +
        'border-radius:4px;font-size:0.9em;color:inherit;cursor:pointer;' +
        'box-sizing:border-box;text-align:left;';
    return '<div class="filter-dropdown-wrapper hsc-user-dropdown" style="width:100%;">' +
        '<button type="button" class="hsc-user-dropdown-btn" style="' + btnStyle + '">' +
        '<span class="hsc-user-dropdown-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(lbl) + '</span>' +
        '<i class="md-icon hsc-user-dropdown-caret" style="font-size:1em;margin-left:6px;flex-shrink:0;">expand_more</i>' +
        '</button>' +
        '<div class="filter-dropdown-panel" style="min-width:220px;width:100%;box-sizing:border-box;">' + rows + '</div>' +
        '</div>';
}

/**
 * Wire up event listeners for a user-multi-select dropdown that was
 * previously rendered by {@link buildUserMultiSelectHtml} into
 * `container` (or one of its descendants).
 *
 * Attaches three kinds of listeners:
 *
 *   1. `click` on the toggle button → flips the panel's `open` class
 *      and swaps the caret glyph (`expand_more` ⇄ `expand_less`).
 *      `e.stopPropagation()` is called so the document-level close
 *      handler does not immediately re-close the panel.
 *   2. `change` on every checkbox in the panel → recomputes the
 *      summary label.
 *   3. `click` on `document` → closes the panel when the user clicks
 *      anywhere outside the panel or the toggle button. The listener
 *      self-removes when the wrapper is detached from the DOM (i.e.
 *      the parent tab was torn down), to avoid leaks across
 *      rerenders.
 *
 * The function is a no-op when the `.hsc-user-dropdown` wrapper is
 * not present in `container` — callers can invoke it unconditionally
 * on any container that *might* have one.
 *
 * @param container  The element to search for the dropdown wrapper.
 *                   Typically the parent `.hse-user-list-inner`,
 *                   `.playlist-user-list`, or `.tlm-user-list`.
 */
export function wireUserMultiSelect(container: Element | null): void {
    const wrapper = container && container.querySelector('.hsc-user-dropdown');
    if (!wrapper) return;
    const btn   = wrapper.querySelector('.hsc-user-dropdown-btn') as HTMLButtonElement | null;
    const panel = wrapper.querySelector('.filter-dropdown-panel') as HTMLElement | null;
    const lbl   = wrapper.querySelector('.hsc-user-dropdown-label') as HTMLElement | null;
    const caret = wrapper.querySelector('.hsc-user-dropdown-caret') as HTMLElement | null;
    if (!btn || !panel || !lbl || !caret) return;

    function updateLabel(): void {
        const allBoxes = panel!.querySelectorAll('input[type="checkbox"]');
        const checkedBoxes = panel!.querySelectorAll('input[type="checkbox"]:checked');
        if (checkedBoxes.length === 0) {
            lbl!.textContent = 'No users selected';
        } else if (checkedBoxes.length === allBoxes.length) {
            lbl!.textContent = 'All users';
        } else {
            lbl!.textContent = Array.from(checkedBoxes)
                .map((cb) => (cb as HTMLInputElement).dataset.name || '')
                .join(', ');
        }
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = panel!.classList.toggle('open');
        caret!.textContent = open ? 'expand_less' : 'expand_more';
    });
    panel.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
        chk.addEventListener('change', updateLabel);
    });

    document.addEventListener('click', function closeUserDrop(e: Event) {
        if (!wrapper.isConnected) {
            document.removeEventListener('click', closeUserDrop);
            return;
        }
        const target = e.target as Node | null;
        if (!target) return;
        if (!panel!.contains(target) && target !== btn) {
            panel!.classList.remove('open');
            caret!.textContent = 'expand_more';
        }
    });
}
