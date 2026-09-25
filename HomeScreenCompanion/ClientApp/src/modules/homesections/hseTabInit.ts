// D4 (form.ts split): tab initializers + the enable-section toggle.
// Extracted from `form.ts:506-590` (interfaces) and `form.ts:723-951`
// (init functions; legacy.js:3116-3260).
//
// This module owns the orchestrators: they stitch together the
// pure-HTML builder, the visibility helpers, the network sync, and the
// factory-bound closures (`getUiConfig`, `checkFormState`,
// `originalConfigState`). The closures live on `InitHomeSectionTabDeps`
// so the orchestrators can be called without touching module-scope state.

import type { OriginalConfigStateRef } from '../state/state';
import type { HscUserLike } from './hscTab';
import { escapeHtml } from '../dom/dom';
import { rowHasViewerCriteria } from './hseCriteria';
import { buildHomeSectionFormHtml, type HseLibraryOption, type HseLibraryWithFlag, type HseSavedSettings } from './formHtml';
import { wireHomeSectionTypeChange } from './hseVisibility';
import type { HomeSectionApiClient, SyncHomeSectionDeps } from './hseSync';

/**
 * Dependencies for {@link initPlaylistTab}. The `getHseUsers` getter
 * is the bound form (factory wires `HseUsersDeps` once and passes the
 * resulting `() => Promise<HscUserLike[]>` here).
 */
export interface InitPlaylistTabDeps {
    readonly getHseUsers: () => Promise<HscUserLike[]>;
    readonly buildUserMultiSelectHtml: (
        users: readonly HscUserLike[],
        selectedIds: readonly string[],
        checkboxClass: string,
    ) => string;
    readonly wireUserMultiSelect: (container: Element | null) => void;
}

/**
 * One server-side `VirtualFolders` entry as returned by
 * `Library/VirtualFolders`. The legacy code reads `ItemId`, `Name`,
 * and `Locations[]`; other fields pass through untouched.
 */
interface VirtualFolderLike {
    readonly ItemId: string;
    readonly Name: string;
    readonly Locations?: readonly string[];
    readonly [k: string]: unknown;
}

/**
 * Dependencies for {@link initHomeSectionTab}. Inherits the user-list
 * helpers from {@link InitPlaylistTabDeps}, then adds the stateful
 * loaders (`preFetchLibraryData`), the live-section sync, the
 * `originalConfigState` ref, and the factory-bound
 * `getUiConfig` / `checkFormState` closures. `syncHomeSectionFromEmby`
 * is bound at the factory to its own `SyncHomeSectionDeps` so this
 * deps surface stays flat.
 */
export interface InitHomeSectionTabDeps extends InitPlaylistTabDeps {
    readonly preFetchLibraryData: () => Promise<unknown>;
    readonly syncHomeSectionFromEmby: (
        tab: HTMLElement,
        syncDeps: SyncHomeSectionDeps,
    ) => Promise<void>;
    readonly getUiConfig: (view: HTMLElement, forComparison: boolean) => unknown;
    readonly checkFormState: () => void;
    readonly originalConfigState: OriginalConfigStateRef;
}

/**
 * Dependencies for {@link updateHseSectionAvailability}. `updateBadges`
 * is a closure defined inside the lifted `setupRowEvents`; until that
 * function is extracted, callers stub it via deps.
 */
export interface UpdateHseSectionAvailabilityDeps {
    readonly rowHasViewerCriteria: (row: HTMLElement) => boolean;
    readonly refreshHseSectionTypeOptions: (
        tab: HTMLElement,
        tagEnabled: boolean,
        collEnabled: boolean,
        viewerOnly: boolean,
    ) => void;
    readonly updateBadges: (row: HTMLElement) => void;
}

/**
 * Wire the playlist sub-tab's user-list dropdown (legacy.js:3116–3128).
 *
 * Idempotent: short-circuits when the `.playlist-tab` is absent or
 * already loaded (flagged via `dataset.plLoaded === '1'`). On first
 * invocation, resolves the Emby user list via `deps.getHseUsers()`,
 * renders the dropdown into `.playlist-user-list` via
 * {@link buildUserMultiSelectHtml}, and wires its listeners via
 * {@link wireUserMultiSelect}. The pre-selected user IDs come from
 * the URL-encoded `dataset.plUserids` JSON.
 *
 * @param row  The tag-row element containing the `.playlist-tab`.
 * @param deps See {@link InitPlaylistTabDeps}.
 */
export function initPlaylistTab(row: HTMLElement, deps: InitPlaylistTabDeps): void {
    const tab = row.querySelector<HTMLElement>('.playlist-tab');
    if (!tab || tab.dataset.plLoaded === '1') return;
    tab.dataset.plLoaded = '1';
    let savedUserIds: string[] = [];
    try {
        savedUserIds = JSON.parse(decodeURIComponent(tab.dataset.plUserids || '%5B%5D')) as string[];
    } catch { /* swallow malformed JSON */ }
    void deps.getHseUsers().then((users) => {
        const listEl = tab.querySelector<HTMLElement>('.playlist-user-list');
        if (!listEl) return;
        listEl.innerHTML = deps.buildUserMultiSelectHtml(users, savedUserIds, 'chkPlaylistUser');
        deps.wireUserMultiSelect(listEl);
    });
}

/**
 * Wire the home-section sub-tab inside a tag row (legacy.js:3130–3203).
 *
 * Orchestrates four sub-loaders:
 *
 *   1. `getHseUsers()` → renders `.hse-user-list-inner` via
 *      {@link buildUserMultiSelectHtml} + {@link wireUserMultiSelect}.
 *   2. `preFetchLibraryData()` → builds two derived lists from the
 *      plugin's `TopList/List` and the global `Library/VirtualFolders`
 *      payloads: the hidden boxset `libraryOptions` (all non-top-list
 *      folders) and the `allLibraries` list (with `isTopList` flags)
 *      that drives `chkHseLibrary`.
 *   3. {@link buildHomeSectionFormHtml} + {@link wireHomeSectionTypeChange}
 *      paint the structured section-settings form into `.hse-fields-inner`
 *      and wire its Section/View Type listeners.
 *   4. {@link deps.syncHomeSectionFromEmby} mirrors the live `ContentSection`
 *      from Emby into the freshly-rendered form. After the live sync,
 *      `originalConfigState` is re-anchored to the current DOM so the
 *      dirty state stays clean (only when the form was *not* already
 *      dirty before this tab opened). Finally
 *      `setTimeout(checkFormState, 0)` re-evaluates the save button.
 *
 * Idempotency / re-entry guards:
 *   - short-circuits when `.homescreen-tab` is absent or already
 *     loaded (`dataset.hseLoaded === '1'`);
 *   - sets `dataset.hseLoaded = 'loading'` while the loaders run so
 *     re-entry is blocked until `dataset.hseLoaded = '1'` is stamped
 *     after the form is in the DOM (so `getUiConfig` reads the form
 *     values, not the saved defaults);
 *   - on error, resets `dataset.hseLoaded = '0'` so the caller can
 *     retry.
 *
 * Quirks preserved verbatim:
 *   - the live `_hseView` reference is `document.querySelector('#HomeScreenCompanionConfigPage')`,
 *     matching the legacy closure (the factory-level `view` is *not*
 *     used here — only the global config-page root);
 *   - `defaultTagName = row.querySelector('.txtEntryLabel').value || row.querySelector('.txtTagName').value || ''`
 *     throws when `.txtEntryLabel` is missing (legacy contract — that
 *     input is always rendered);
 *   - `_wasAlreadyDirty` is captured BEFORE the form render so a
 *     user who already had unsaved changes does not get the new tab
 *     values silently swallowed by a baseline reset.
 *
 * @param row  The tag-row element containing the `.homescreen-tab`.
 * @param deps See {@link InitHomeSectionTabDeps}.
 */
export function initHomeSectionTab(row: HTMLElement, deps: InitHomeSectionTabDeps): void {
    const tab = row.querySelector<HTMLElement>('.homescreen-tab');
    if (!tab || tab.dataset.hseLoaded === '1') return;
    tab.dataset.hseLoaded = 'loading';

    let savedUserIds: string[] = [];
    let savedSettings: Record<string, unknown> = {};
    try {
        savedUserIds = JSON.parse(decodeURIComponent(tab.dataset.hseUserids || '%5B%5D')) as string[];
    } catch { /* swallow malformed JSON */ }
    try {
        savedSettings = JSON.parse(decodeURIComponent(tab.dataset.hseSettings || '%7B%7D')) as Record<string, unknown>;
    } catch { /* swallow malformed JSON */ }
    const defaultSectionType = tab.dataset.hseDefaultType || 'items';
    const savedLibraryId = decodeURIComponent(tab.dataset.hseLibraryid || 'auto');

    Promise.all([deps.getHseUsers(), deps.preFetchLibraryData()])
        .then((results) => {
            const users = results[0] as HscUserLike[];
            const libData = (results[1] && typeof results[1] === 'object')
                ? results[1] as { topListFolderNames: Set<string>; virtualFolders: readonly unknown[] }
                : { topListFolderNames: new Set<string>(), virtualFolders: [] as readonly unknown[] };
            const topListFolderNames = libData.topListFolderNames;
            const virtualFolders = (libData.virtualFolders || []) as readonly VirtualFolderLike[];

            const libraryOptions: HseLibraryOption[] = virtualFolders
                .filter((f) => !(f.Locations || []).some((loc) => {
                    const parts = loc.replace(/\\/g, '/').split('/');
                    const folderName = parts[parts.length - 1] || parts[parts.length - 2] || '';
                    return topListFolderNames.has(folderName.toLowerCase());
                }))
                .map((f) => ({ id: f.ItemId, name: f.Name }));

            const allLibraries: HseLibraryWithFlag[] = virtualFolders.map((f) => {
                const isTopList = (f.Locations || []).some((loc) => {
                    const parts = loc.replace(/\\/g, '/').split('/');
                    const folderName = parts[parts.length - 1] || parts[parts.length - 2] || '';
                    return topListFolderNames.has(folderName.toLowerCase());
                });
                return { id: f.ItemId, name: f.Name, isTopList };
            });

            const userListEl = tab.querySelector<HTMLElement>('.hse-user-list-inner');
            if (userListEl) {
                userListEl.innerHTML = deps.buildUserMultiSelectHtml(users, savedUserIds, 'chkHseUser');
                deps.wireUserMultiSelect(userListEl);
            }

            const entryLabelEl = row.querySelector<HTMLInputElement>('.txtEntryLabel');
            const tagNameEl = row.querySelector<HTMLInputElement>('.txtTagName');
            const defaultTagName = (entryLabelEl?.value || tagNameEl?.value || '');
            const tagEnabled  = !!(row.querySelector<HTMLInputElement>('.chkEnableTag'))?.checked;
            const collEnabled = !!(row.querySelector<HTMLInputElement>('.chkEnableCollection'))?.checked;
            const selSourceType = row.querySelector<HTMLSelectElement>('.selSourceType');
            const viewerOnly  = (selSourceType?.value || '') === 'MediaInfo' && rowHasViewerCriteria(row);

            const hseView = document.querySelector<HTMLElement>('#HomeScreenCompanionConfigPage');
            const originalSnapshot = deps.originalConfigState.getOriginalConfigState();
            let wasAlreadyDirty = false;
            if (hseView && originalSnapshot) {
                try {
                    wasAlreadyDirty = JSON.stringify(deps.getUiConfig(hseView, true)) !== originalSnapshot;
                } catch { /* swallow stringify errors */ }
            }

            const fieldsEl = tab.querySelector<HTMLElement>('.hse-fields-inner');
            if (fieldsEl) {
                fieldsEl.innerHTML = buildHomeSectionFormHtml(
                    savedSettings as HseSavedSettings,
                    defaultSectionType,
                    defaultTagName,
                    tagEnabled,
                    collEnabled,
                    libraryOptions,
                    savedLibraryId,
                    allLibraries,
                    viewerOnly,
                );
            }
            wireHomeSectionTypeChange(tab);

            tab.dataset.hseLoaded = '1';

            void deps.syncHomeSectionFromEmby(tab, {
                fetch: (typeof fetch !== 'undefined') ? fetch.bind(globalThis) : (() => Promise.reject(new Error('fetch unavailable'))) as typeof fetch,
                getApiClient: () => {
                    const ac = (typeof window !== 'undefined') ? (window as unknown as { ApiClient?: HomeSectionApiClient }).ApiClient : undefined;
                    if (ac) return ac;
                    return {
                        accessToken: () => '',
                        getUrl: (_name: string, _params?: Record<string, unknown>) => '',
                        getJSON: () => Promise.resolve({}),
                    };
                },
            }).then(() => {
                if (!wasAlreadyDirty && hseView && deps.originalConfigState.getOriginalConfigState()) {
                    try {
                        deps.originalConfigState.setOriginalConfigState(
                            JSON.stringify(deps.getUiConfig(hseView, true)),
                        );
                    } catch { /* swallow stringify errors */ }
                }
                setTimeout(deps.checkFormState, 0);
            });
        })
        .catch((e: unknown) => {
            const fieldsEl = tab.querySelector<HTMLElement>('.hse-fields-inner');
            if (fieldsEl) {
                const message = (e instanceof Error) ? e.message : String(e);
                fieldsEl.innerHTML = '<em style="color:#cc4444">Failed to load: ' + escapeHtml(message) + '</em>';
            }
            tab.dataset.hseLoaded = '0';
        });
}

/**
 * Toggle the Enable Home Section checkbox (and its hint copy) based on
 * whether any of the row's tag/collection/viewer-criteria inputs is
 * active (legacy.js:3234–3260).
 *
 *   - `tagEnabled || collEnabled || viewerOnly` is the gate;
 *   - when the gate is OFF the checkbox is disabled + unchecked, the
 *     `.hse-disabled-hint` block is shown, the `.hse-details` panel is
 *     hidden, and `deps.updateBadges(row)` is pinged;
 *   - when the gate is ON the checkbox is enabled and the hint is hidden;
 *   - if the `.homescreen-tab` is already loaded
 *     (`dataset.hseLoaded === '1'`), the Section Type options are
 *     refreshed via {@link wireHomeSectionTypeChange}'s sibling
 *     helper so they match the new flags.
 *
 * Short-circuits when `.chkEnableHomeSection` is absent.
 *
 * @param row  The tag-row element.
 * @param deps See {@link UpdateHseSectionAvailabilityDeps}.
 */
export function updateHseSectionAvailability(
    row: HTMLElement,
    deps: UpdateHseSectionAvailabilityDeps,
): void {
    const tagEnabled  = !!(row.querySelector<HTMLInputElement>('.chkEnableTag'))?.checked;
    const collEnabled = !!(row.querySelector<HTMLInputElement>('.chkEnableCollection'))?.checked;
    const selSourceType = row.querySelector<HTMLSelectElement>('.selSourceType');
    const isMediaInfo = (selSourceType?.value || '') === 'MediaInfo';
    const viewerOnly  = isMediaInfo && deps.rowHasViewerCriteria(row);
    const allowed = tagEnabled || collEnabled || viewerOnly;
    const hseCbx = row.querySelector<HTMLInputElement>('.chkEnableHomeSection');
    if (!hseCbx) return;

    const hint = row.querySelector<HTMLElement>('.hse-disabled-hint');
    if (!allowed) {
        hseCbx.disabled = true;
        hseCbx.checked = false;
        if (hint) hint.style.display = 'block';
        const hseDetails = row.querySelector<HTMLElement>('.hse-details');
        if (hseDetails) hseDetails.style.display = 'none';
        deps.updateBadges(row);
    } else {
        hseCbx.disabled = false;
        if (hint) hint.style.display = 'none';
    }

    const tab = row.querySelector<HTMLElement>('.homescreen-tab');
    if (tab && tab.dataset.hseLoaded === '1') {
        deps.refreshHseSectionTypeOptions(tab, tagEnabled, collEnabled, viewerOnly);
    }
}
