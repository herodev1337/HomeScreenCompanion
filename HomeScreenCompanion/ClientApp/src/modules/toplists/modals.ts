/**
 * Phase 5: top-list modal functions, extracted verbatim from
 * `Configuration/configPage.js`:
 *
 *   - `showTopListModal(tagName, displayName, onSuccess, existingData)`
 *     legacy.js:4736-4873 — tag-driven create/edit modal.
 *   - `showManualTopListModal(onSuccess, existingData)`
 *     legacy.js:4876-5185 — manually-curated create/edit modal with the
 *     `AllMovies` library-search picker.
 *   - `loadInlineEditForm(row, body, onSuccess)`
 *     legacy.js:5187-5570 — per-row inline-edit panel for the top-list
 *     list (attaches `body.tlSaveForm`).
 *   - `showCreateTopListChooser(tagsData, existingTopLists, onSuccess)`
 *     legacy.js:5572-5694 — entry-point chooser that routes the user
 *     to either `showManualTopListModal` (Manual) or
 *     `showTopListModal` (By tag).
 *
 * The legacy functions closed over the following module-scope surfaces,
 * all lifted into the explicit `TopListModalDeps` object so the
 * extracted functions are pure functions of their args + deps:
 *
 *   - `window.ApiClient`  (accessToken / getUrl)
 *   - the global `fetch`
 *   - `pluginId`
 *   - `getHseUsers`           (Phase-5-extracted, legacy.js:2748)
 *   - `buildUserMultiSelectHtml` / `wireUserMultiSelect`
 *                              (Phase-5-extracted, legacy.js:2758-2822)
 *   - `buildBadgePickerHtml` / `initBadgePicker` / `readBadgeStyle`
 *                              (Phase-3-extracted, legacy.js:4691-4734)
 *   - `executeTopListCreationSteps`
 *                              (Phase-5-extracted, legacy.js:4399-4689)
 *   - `showTopListModal` / `showManualTopListModal` / `loadInlineEditForm`
 *                              (this module — `showCreateTopListChooser`
 *                              routes to them)
 *   - `_topListTagNames`      (mutable Set — registered on success)
 *   - the Dashboard globals `confirm` / `alert`
 *
 * `escapeHtml` is imported from `../dom/dom` (the canonical leaf). The
 * two local escape helpers in the legacy (`escAttr` / `escHtml`) match
 * `users.ts` byte-for-byte and stay local helpers.
 *
 * Legacy quirks preserved on purpose:
 * - checkbox class names are `chkTlmUser` for tag-driven modals and
 *   `chkMtlUser` for manual modals;
 * - the manual modal's search field filters the already-loaded
 *   `HomeScreenCompanion/TopList/AllMovies` payload locally — no IMDB
 *   HTTP call;
 * - the `displayName` parameter on `showTopListModal` is plumbed
 *   straight into `executeTopListCreationSteps` as a no-op legacy
 *   carry-over;
 * - `loadInlineEditForm` attaches the save closure as
 *   `body.tlSaveForm = () => Promise<void>` so the future row-event
 *   helper can invoke it (the Apply button lives outside this fn);
 * - manual-list create uses `maxItems: 0` (irrelevant for the
 *   `.strm`-emitting flow) and `customNameVal` for both the display
 *   name and the home-section title;
 * - `showCreateTopListChooser`'s tag-row count falls back through
 *   `MovieCount → ItemCount → 0`;
 * - a tag whose sanitized name is in `existingTopLists` gets a
 *   `top-list` badge but is still selectable (legacy behavior).
 */

import type { TopListsState, HseUserCacheState } from '../state/state';
import { escapeHtml } from '../dom/dom';
import type { HscUserLike } from '../homesections/hscTab';
import type { FetchLike, PluginConfigLike, PrepareResultLike, TopListCreationDeps, TopListCreationUi } from './creation';
import { executeTopListCreationSteps } from './creation';
import { getHseUsers, buildUserMultiSelectHtml, wireUserMultiSelect } from '../homesections/users';
import { buildBadgePickerHtml, initBadgePicker, readBadgeStyle } from './badgePicker';
import { PLUGIN_ID } from '../state/state';

/**
 * Minimal slice of the Jellyfin `ApiClient` surface consumed by the
 * four modal functions. `getJSON`, `getPluginConfiguration`, and
 * `updatePluginConfiguration` are listed for completeness (the
 * chooser/manual-list flows don't call them directly, but the future
 * factory will pass the same client object to every deps surface).
 */
export interface TopListModalApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
}

/**
 * Function signature for the full `executeTopListCreationSteps` from
 * `creation.ts`. Re-typed here so callers can mock or wrap without
 * importing the full module.
 */
export type ExecuteTopListCreationSteps = typeof executeTopListCreationSteps;

/**
 * Dependencies for the four top-list modal functions. Until the
 * surrounding legacy helpers are extracted, the legacy.js caller wraps
 * each function with its closure-bound state and passes the resulting
 * bundle here.
 *
 *   - `fetch` — the global fetch; only `.json()` is read.
 *   - `getApiClient` — replaces `window.ApiClient`.
 *   - `alert` / `confirm` — the Dashboard globals.
 *   - `closeModal` — shared `modal.remove()` replacement (used by the
 *                    chooser).
 *   - `escapeHtml` — re-exported from `../dom/dom`.
 *   - `executeTopListCreationSteps` — the live function from
 *                    `creation.ts`; called with its full 11-argument
 *                    signature.
 *   - `getHseUsers` — pre-bound to its `HseUsersDeps`.
 *   - `showTopListModal` / `showManualTopListModal` /
 *     `loadInlineEditForm` — these four functions route to each other
 *                    (`showCreateTopListChooser` calls two of them);
 *                    they are injected so the chooser can be tested
 *                    without actually opening modals.
 *   - `state.topLists` — the live `TopListsState` whose `tagNames`
 *                    Set the success path appends to.
 *   - `state.hseUserCache` — memoization cache for `getHseUsers`.
 *   - `pluginId` — propagated to `getPluginConfiguration` /
 *                    `updatePluginConfiguration` (kept on the surface
 *                    for parity with the legacy factory).
 */
export interface TopListModalDeps {
    readonly fetch: FetchLike;
    readonly getApiClient: () => TopListModalApiClient;
    readonly alert: (message: string) => void;
    readonly confirm: (message: string) => boolean;
    readonly closeModal: () => void;
    readonly escapeHtml: (s: unknown) => string;
    readonly executeTopListCreationSteps: ExecuteTopListCreationSteps;
    readonly getHseUsers: () => Promise<HscUserLike[]>;
    readonly buildUserMultiSelectHtml: typeof buildUserMultiSelectHtml;
    readonly wireUserMultiSelect: typeof wireUserMultiSelect;
    readonly buildBadgePickerHtml: typeof buildBadgePickerHtml;
    readonly initBadgePicker: typeof initBadgePicker;
    readonly readBadgeStyle: typeof readBadgeStyle;
    readonly showTopListModal: (
        tagName: string | null,
        displayName: string | null,
        onSuccess: () => void,
        existingData: unknown,
        deps: TopListModalDeps,
    ) => void;
    readonly showManualTopListModal: (
        onSuccess: () => void,
        existingData: unknown,
        deps: TopListModalDeps,
    ) => void;
    readonly loadInlineEditForm: (
        row: HTMLElement,
        body: HTMLElement,
        onSuccess: () => void,
        deps: TopListModalDeps,
    ) => void;
    readonly state: {
        readonly topLists: TopListsState;
        readonly hseUserCache: HseUserCacheState;
    };
    readonly pluginId: string;
}

/** Minimal slice of one tag entry as returned by `HomeScreenCompanion/Manage/Tags`. */
interface TagRowLike {
    Name?: string;
    MovieCount?: number;
    ItemCount?: number;
}

/** One movie entry inside `HomeScreenCompanion/TopList/AllMovies`. */
interface AllMoviesRowLike {
    ItemId?: string;
    ImdbId?: string;
    Name?: string;
    Year?: number | null;
}

/** Result of `HomeScreenCompanion/TopList/AllMovies`. */
interface AllMoviesResultLike {
    Movies?: AllMoviesRowLike[];
}

/** One movie entry inside the manual-list payloads. */
interface ManualMovieRowLike {
    ItemId?: string;
    ImdbId?: string;
    Name?: string;
    Year?: number | null;
}

/** Result of `HomeScreenCompanion/TopList/ManualItems`. */
interface ManualItemsResultLike {
    Success?: boolean;
    Message?: string;
    UserIds?: string[];
    DisplayMode?: string;
    ImageType?: string;
    BadgeStyle?: string;
    CustomName?: string;
    Movies?: ManualMovieRowLike[];
}

/** One row of the inline-edit `data-editjson` payload. */
interface EditJsonLike {
    tagName?: string;
    isManual?: boolean;
    displayName?: string;
    userIds?: readonly string[];
    customName?: string;
    displayMode?: string;
    imageType?: string;
    badgeStyle?: string;
    maxItems?: string | number;
}

/** Type guard for `EditJsonLike`. */
function isEditJsonLike(v: unknown): v is EditJsonLike {
    return typeof v === 'object' && v !== null;
}

/** Type guard narrowing a parsed `editJson` row. */
function readEditJson(row: HTMLElement): EditJsonLike {
    try {
        const parsed: unknown = JSON.parse(row.dataset.editjson || '{}');
        return isEditJsonLike(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/** Type guard for one manual-list selected-movie row. */
function asManualMovie(m: unknown): ManualMovieRowLike {
    if (typeof m !== 'object' || m === null) return {};
    return m as ManualMovieRowLike;
}

/** Internal: strip filesystem-unsafe characters from a folder/tag name (legacy `sanitizeName`). */
function sanitizeTlName(name: string | null | undefined): string {
    const safe = (name || 'unknown').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+|\.+$/g, '').trim();
    return safe.length === 0 ? 'unknown' : safe;
}

/** Shared inline `escAttr` / `escHtml` helpers — same shapes as in `users.ts` / `legacy.js`. */
function escAttr(s: unknown): string {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escHtml(s: unknown): string {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Read one of the `existingData` fields with a type-narrowing cast. */
function readExistingString(d: unknown, key: string): string {
    if (typeof d !== 'object' || d === null) return '';
    const v = (d as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : '';
}

/** Read one of the `existingData` array fields. */
function readExistingArray(d: unknown, key: string): readonly unknown[] {
    if (typeof d !== 'object' || d === null) return [];
    const v = (d as Record<string, unknown>)[key];
    return Array.isArray(v) ? v : [];
}

/** One selected-movie row in the manual modal's right-hand list. */
interface SelectedMovie {
    ItemId: string;
    ImdbId: string;
    Name: string;
    Year: number | null;
}

/** Type guard for one selected-movie row. */
function asSelectedMovie(m: ManualMovieRowLike): SelectedMovie | null {
    if (typeof m.ItemId !== 'string') return null;
    return {
        ItemId: m.ItemId,
        ImdbId: typeof m.ImdbId === 'string' ? m.ImdbId : '',
        Name: typeof m.Name === 'string' ? m.Name : '',
        Year: typeof m.Year === 'number' ? m.Year : null,
    };
}

/**
 * Build a `TopListCreationDeps` from the modal's `TopListModalDeps`
 * surface. `tok` is captured at call time (legacy re-reads the token
 * several times during the pipeline).
 */
function buildTopListCreationDeps(
    api: TopListModalApiClient,
    deps: TopListModalDeps,
    tok: string,
): TopListCreationDeps {
    return {
        getUrl: (path) => api.getUrl(path),
        getAccessToken: () => tok,
        getPluginConfiguration: () => api.getPluginConfiguration(deps.pluginId).then((cfg) => cfg as unknown as PluginConfigLike),
        updatePluginConfiguration: (config) => api.updatePluginConfiguration(deps.pluginId, config as unknown as Record<string, unknown>),
        fetch: deps.fetch,
        registerTopList: (tagNameLower) => { deps.state.topLists.tagNames.add(tagNameLower); },
    };
}

/**
 * Show the tag-driven top-list create/edit modal (legacy.js:4736-4873).
 *
 * Behavior contract:
 *   - Renders a centered overlay with a loading state, then a form
 *     containing the target-users multi-select, the display-mode select,
 *     a custom-title text field, an image-type select, the badge-style
 *     picker, and a max-items number input.
 *   - When `existingData` is supplied the modal title reads "Edit" and
 *     the saved values pre-populate the form (the `tagName` input is
 *     not rendered — only the manual modal surfaces it).
 *   - The Apply button reads the form, calls
 *     `HomeScreenCompanion/TopList/PrepareFolder` (via
 *     `deps.fetch` + `deps.getApiClient().getUrl`), and on success
 *     hands off to `deps.executeTopListCreationSteps` with the full
 *     11-argument signature from `creation.ts`.
 *   - On `getHseUsers` rejection the modal swaps to a failure view
 *     with a Close button.
 *
 * @param tagName      Lowercased tag identifier backing the top-list.
 * @param displayName  Display label shown in the header and used as
 *                     the placeholder for the custom-title field.
 * @param onSuccess    Callback invoked after the modal closes on a
 *                     successful create/update.
 * @param existingData Optional persisted form state
 *                     (`{userIds, customName, displayMode, imageType,
 *                     badgeStyle, maxItems}`).
 * @param deps         See {@link TopListModalDeps}.
 */
export function showTopListModal(
    tagName: string | null,
    displayName: string | null,
    onSuccess: () => void,
    existingData: unknown | undefined,
    deps: TopListModalDeps,
): void {
    const inputStyle = 'background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);border-radius:4px;padding:6px 10px;font-size:0.9em;color:var(--plugin-popup-color);width:100%;box-sizing:border-box;';
    const labelStyle = 'font-size:0.82em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;opacity:0.65;display:block;margin-bottom:5px;';
    const fieldStyle = 'margin-bottom:16px;';
    const api = deps.getApiClient();

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;';

    function renderBox(content: string): void {
        modal.innerHTML =
            '<div style="background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);' +
            'border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;' +
            'padding:28px;max-width:520px;width:90%;max-height:85vh;overflow-y:auto;">' +
            content + '</div>';
    }

    renderBox('<div style="padding:10px 0;display:flex;align-items:center;gap:10px;">Loading <span class="tc-dot-loader"><span></span><span></span><span></span></span></div>');
    document.body.appendChild(modal);

    deps.getHseUsers().then((users) => {
        const existingObj = (typeof existingData === 'object' && existingData !== null) ? existingData as Record<string, unknown> : null;
        const presetUserIds: readonly string[] = existingObj && Array.isArray(existingObj['userIds'])
            ? (existingObj['userIds'] as readonly string[])
            : [];
        const presetBadgeStyle = existingObj ? readExistingString(existingObj, 'badgeStyle') : '';
        const usersHtml = deps.buildUserMultiSelectHtml(users, presetUserIds, 'chkTlmUser');

        const html =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;">' +
            '<h3 style="margin:0;font-size:1.1em;color:#52B54B;">' + (existingData ? 'Edit' : 'Create') + ' Top-List: ' + escHtml(displayName) + '</h3>' +
            '<button type="button" class="btnTlmClose" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:2px;opacity:0.6;line-height:1;"><i class="md-icon">close</i></button>' +
            '</div>' +

            '<div style="' + fieldStyle + '">' +
            '<span style="' + labelStyle + '">Target Users</span>' +
            '<div class="tlm-user-list">' + usersHtml + '</div>' +
            '</div>' +

            '<div style="' + fieldStyle + '">' +
            '<label style="' + labelStyle + '">Show this section</label>' +
            '<select is="emby-select" class="tlm-display-mode" style="width:100%;">' +
            '<option value="">Always</option>' +
            '<option value="tv">When TV Display Mode is on</option>' +
            '<option value="mobile,desktop">When TV Display Mode is off</option>' +
            '</select></div>' +

            '<div style="' + fieldStyle + '">' +
            '<label style="' + labelStyle + '">Custom Title</label>' +
            '<input type="text" class="tlm-custom-name" style="' + inputStyle + '" placeholder="' + escAttr(displayName) + '" />' +
            '</div>' +

            '<div style="' + fieldStyle + '">' +
            '<label style="' + labelStyle + '">Image Type</label>' +
            '<select is="emby-select" class="tlm-image-type" style="width:100%;">' +
            '<option value="">Auto</option>' +
            '<option value="Primary">Primary</option>' +
            '<option value="Thumb">Thumb</option>' +
            '</select></div>' +

            deps.buildBadgePickerHtml(existingData ? presetBadgeStyle || 'neutral' : 'neutral') +

            '<div style="' + fieldStyle + '">' +
            '<label style="' + labelStyle + '">Max items <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.7;">(0 = all)</span></label>' +
            '<input type="number" class="tlm-max-items" min="0" step="1" style="' + inputStyle + '" placeholder="0" />' +
            '</div>' +

            '<div class="tlm-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-bottom:4px;"></div>' +
            '<div style="border-top:1px solid var(--line-color);padding-top:16px;display:flex;gap:10px;align-items:center;justify-content:flex-end;">' +
            '<button type="button" class="btnTlmCancel" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-primary);border-radius:3px;padding:8px 18px;font-size:0.9em;">Cancel</button>' +
            '<button type="button" class="btnTlmSave" style="cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:4px;padding:10px 26px;font-size:0.95em;font-weight:600;">' +
            '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">check</i>Save and apply</button>' +
            '</div>';

        renderBox(html);
        deps.initBadgePicker(modal);
        deps.wireUserMultiSelect(modal);

        if (existingObj) {
            const customNameInput = modal.querySelector<HTMLInputElement>('.tlm-custom-name');
            const displayModeSel = modal.querySelector<HTMLSelectElement>('.tlm-display-mode');
            const imageTypeSel = modal.querySelector<HTMLSelectElement>('.tlm-image-type');
            const maxItemsInput = modal.querySelector<HTMLInputElement>('.tlm-max-items');
            const customName = readExistingString(existingObj, 'customName');
            const displayMode = readExistingString(existingObj, 'displayMode');
            const imageType = readExistingString(existingObj, 'imageType');
            const maxItems = readExistingString(existingObj, 'maxItems');
            if (customName && customNameInput) customNameInput.value = customName;
            if (displayMode && displayModeSel) displayModeSel.value = displayMode;
            if (imageType && imageTypeSel) imageTypeSel.value = imageType;
            if (maxItems && maxItems !== '0' && maxItemsInput) maxItemsInput.value = maxItems;
        }

        const closeBtn = modal.querySelector<HTMLButtonElement>('.btnTlmClose');
        const cancelBtn = modal.querySelector<HTMLButtonElement>('.btnTlmCancel');
        if (closeBtn) closeBtn.addEventListener('click', () => { modal.remove(); });
        if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.remove(); });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        const saveBtn = modal.querySelector<HTMLButtonElement>('.btnTlmSave');
        if (!saveBtn) return;
        saveBtn.addEventListener('click', () => {
            const errEl = modal.querySelector<HTMLElement>('.tlm-error');
            if (!errEl) return;
            errEl.textContent = '';

            const selectedUserIds = Array.from(modal.querySelectorAll<HTMLInputElement>('.chkTlmUser:checked')).map((c) => c.value);
            if (selectedUserIds.length === 0) {
                errEl.textContent = 'Please select at least one target user.';
                return;
            }

            const customNameInput = modal.querySelector<HTMLInputElement>('.tlm-custom-name');
            const displayModeSel = modal.querySelector<HTMLSelectElement>('.tlm-display-mode');
            const imageTypeSel = modal.querySelector<HTMLSelectElement>('.tlm-image-type');
            const maxItemsInput = modal.querySelector<HTMLInputElement>('.tlm-max-items');
            const customName = (customNameInput ? customNameInput.value : '').trim() || (displayName || '');
            const displayMode = displayModeSel ? displayModeSel.value : '';
            const imageType = imageTypeSel ? imageTypeSel.value : '';
            const badgeStyle = deps.readBadgeStyle(modal);
            const maxItems = Math.max(0, parseInt(maxItemsInput ? maxItemsInput.value : '0', 10) || 0);
            const tok = api.accessToken();

            saveBtn.disabled = true;
            saveBtn.innerHTML = 'Preparing files <span class="tc-dot-loader"><span></span><span></span><span></span></span>';

            deps.fetch(api.getUrl('HomeScreenCompanion/TopList/PrepareFolder'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok },
                body: JSON.stringify({ TagName: tagName, MaxItems: maxItems, BadgeStyle: badgeStyle })
            })
                .then((r) => r.json())
                .then((prepareRaw) => {
                    const prepareResult = prepareRaw as PrepareResultLike;
                    if (!prepareResult.Success) throw new Error(prepareResult.Message || 'Failed to create folder.');
                    const ui: TopListCreationUi = { saveBtn: saveBtn, errEl: errEl, modal: modal, badgeStyle: badgeStyle };
                    const tlDeps = buildTopListCreationDeps(api, deps, tok);
                    deps.executeTopListCreationSteps(
                        tagName || '',
                        displayName || '',
                        selectedUserIds,
                        displayMode,
                        customName,
                        imageType,
                        maxItems,
                        prepareResult,
                        ui,
                        () => {
                            modal.remove();
                            if (typeof onSuccess === 'function') onSuccess();
                        },
                        tlDeps,
                    );
                })
                .catch((err: unknown) => {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">check</i>Save and apply';
                    errEl.textContent = (err as { message?: string }).message || String(err);
                });
        });
    }).catch((err: unknown) => {
        renderBox('<div style="color:#cc3333;padding:10px 0;">Failed to load: ' + ((err as { message?: string }).message || String(err)) + '</div>' +
            '<div style="margin-top:16px;text-align:right;"><button type="button" class="btnTlmClose" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:inherit;border-radius:3px;padding:6px 14px;font-size:0.9em;">Close</button></div>');
        const closeBtn = modal.querySelector<HTMLButtonElement>('.btnTlmClose');
        if (closeBtn) closeBtn.addEventListener('click', () => { modal.remove(); });
    });
}

/**
 * Show the manual-list create/edit modal (legacy.js:4876-5185).
 *
 * Behavior contract:
 *   - Two-column layout: home-section settings on the left, movie-list
 *     picker on the right.
 *   - The movie list is loaded once via
 *     `HomeScreenCompanion/TopList/AllMovies`; the search input filters
 *     the already-loaded array locally (no IMDB HTTP call).
 *   - Selected movies persist via the `chkMtlUser` checkboxes, the
 *     badge picker, and the per-row up/down/remove buttons.
 *   - On Apply the function posts to
 *     `HomeScreenCompanion/TopList/PrepareManualFolder` then forwards
 *     to `deps.executeTopListCreationSteps` with `maxItems: 0`.
 *   - `existingData` (when supplied) seeds the list name, custom name,
 *     users, display mode, image type, badge style, and movie list.
 *
 * @param onSuccess    Callback invoked after the modal closes on a
 *                     successful save.
 * @param existingData Optional persisted form state
 *                     (`{listName, customName, userIds, displayMode,
 *                     imageType, badgeStyle, movies}`).
 * @param deps         See {@link TopListModalDeps}.
 */
export function showManualTopListModal(
    onSuccess: () => void,
    existingData: unknown | undefined,
    deps: TopListModalDeps,
): void {
    const isEdit = !!existingData;
    const inputStyle = 'background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);border-radius:4px;padding:6px 10px;font-size:0.9em;color:var(--plugin-popup-color);width:100%;box-sizing:border-box;';
    const labelStyle = 'font-size:0.82em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;opacity:0.65;display:block;margin-bottom:5px;';
    const fieldStyle = 'margin-bottom:14px;';
    const colHeaderStyle = 'font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#52B54B;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid rgba(82,181,75,0.3);';
    const api = deps.getApiClient();

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML =
        '<div style="background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);' +
        'border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;' +
        'padding:28px;max-width:720px;width:95%;max-height:90vh;overflow-y:auto;">' +
        '<div style="padding:10px 0;display:flex;align-items:center;gap:10px;">Loading <span class="tc-dot-loader"><span></span><span></span><span></span></span></div>' +
        '</div>';
    document.body.appendChild(modal);

    function onEsc(e: KeyboardEvent): void { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove(); document.removeEventListener('keydown', onEsc); } });

    const tok = api.accessToken();

    Promise.all([
        deps.fetch(api.getUrl('HomeScreenCompanion/TopList/AllMovies'), {
            headers: { 'X-MediaBrowser-Token': tok }
        }).then((r) => r.json()),
        deps.getHseUsers()
    ])
        .then((results) => {
            const allMoviesRaw = results[0] as AllMoviesResultLike;
            const users = results[1];
            const allMovies = allMoviesRaw.Movies || [];

            const existingObj = (typeof existingData === 'object' && existingData !== null) ? existingData as Record<string, unknown> : null;
            const presetUserIds: readonly string[] = existingObj && Array.isArray(existingObj['userIds'])
                ? (existingObj['userIds'] as readonly string[])
                : [];
            const usersHtml = deps.buildUserMultiSelectHtml(users, presetUserIds, 'chkMtlUser');

            const presetName = existingObj ? readExistingString(existingObj, 'listName') : '';
            const presetCustomName = existingObj ? readExistingString(existingObj, 'customName') : '';
            const presetDisplay = existingObj ? readExistingString(existingObj, 'displayMode') : '';
            const presetImageType = existingObj ? readExistingString(existingObj, 'imageType') : '';
            const presetBadgeStyle = existingObj ? readExistingString(existingObj, 'badgeStyle') : '';

            const displayOptions = [
                { val: '', label: 'Always' },
                { val: 'tv', label: 'When TV Display Mode is on' },
                { val: 'mobile,desktop', label: 'When TV Display Mode is off' }
            ].map((o) => {
                return '<option value="' + escAttr(o.val) + '"' + (o.val === presetDisplay ? ' selected' : '') + '>' + escHtml(o.label) + '</option>';
            }).join('');

            const imageOptions = [
                { val: '', label: 'Auto' },
                { val: 'Primary', label: 'Primary' },
                { val: 'Thumb', label: 'Thumb' }
            ].map((o) => {
                return '<option value="' + escAttr(o.val) + '"' + (o.val === presetImageType ? ' selected' : '') + '>' + escHtml(o.label) + '</option>';
            }).join('');

            const titleText = isEdit ? 'Edit Manual Top-List' : 'Create Manual Top-List';
            const createBtnLabel = isEdit ? 'Save changes' : 'Create top-list';

            const innerBox = modal.querySelector<HTMLElement>('div');
            if (!innerBox) return;
            innerBox.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
                '<h3 style="margin:0;font-size:1.1em;color:#52B54B;">' + escHtml(titleText) + '</h3>' +
                '<button type="button" class="btnMtlClose" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:2px;opacity:0.6;line-height:1;"><i class="md-icon">close</i></button>' +
                '</div>' +

                '<div style="display:flex;gap:0;align-items:stretch;">' +

                '<div style="flex:1;min-width:0;padding-right:20px;border-right:1px solid var(--line-color);">' +
                '<div style="' + colHeaderStyle + '"><i class="md-icon" style="font-size:0.9em;vertical-align:middle;margin-right:5px;">home</i>Home Section Settings</div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">List Name</label>' +
                '<input type="text" class="mtlListName" style="' + inputStyle + '" placeholder="e.g. My Favorites"' + (isEdit ? ' readonly style="' + inputStyle + 'opacity:0.6;cursor:not-allowed;"' : '') + ' value="' + escAttr(presetName) + '" /></div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Custom Title <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.7;">(shown on home screen)</span></label>' +
                '<input type="text" class="mtlCustomName" style="' + inputStyle + '" placeholder="Defaults to list name" value="' + escAttr(presetCustomName) + '" /></div>' +

                '<div style="' + fieldStyle + '"><span style="' + labelStyle + '">Target Users</span>' +
                '<div>' + usersHtml + '</div></div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Show this section</label>' +
                '<select is="emby-select" class="mtlDisplayMode" style="width:100%;">' + displayOptions + '</select></div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Image Type</label>' +
                '<select is="emby-select" class="mtlImageType" style="width:100%;">' + imageOptions + '</select></div>' +

                '</div>' +

                '<div style="flex:1;min-width:0;padding-left:20px;">' +
                '<div style="' + colHeaderStyle + '"><i class="md-icon" style="font-size:0.9em;vertical-align:middle;margin-right:5px;">format_list_numbered</i>Movie List</div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Add Movie</label>' +
                '<div style="position:relative;">' +
                '<input type="text" class="mtlMovieSearch" autocomplete="off" style="' + inputStyle + '" placeholder="Type to search…" />' +
                '<div class="mtlSearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--plugin-popup-bg,#2a2a2a);border:1px solid var(--line-color);border-radius:4px;max-height:200px;overflow-y:auto;margin-top:2px;box-shadow:0 4px 12px rgba(0,0,0,0.45);"></div>' +
                '</div></div>' +

                '<div class="mtlSelectedList" style="max-height:500px;overflow-y:auto;border:1px solid var(--line-color);border-radius:4px;padding:4px 8px;min-height:60px;"></div>' +
                '</div>' +

                '</div>' +

                '<div style="border-top:1px solid var(--line-color);padding-top:14px;margin-top:4px;">' +
                deps.buildBadgePickerHtml(presetBadgeStyle || 'neutral') +
                '</div>' +

                '<div class="mtl-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-top:12px;margin-bottom:4px;"></div>' +
                '<div style="border-top:1px solid var(--line-color);padding-top:16px;margin-top:8px;display:flex;gap:10px;align-items:center;justify-content:flex-end;">' +
                '<button type="button" class="btnMtlCancel" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-primary);border-radius:3px;padding:8px 18px;font-size:0.9em;">Cancel</button>' +
                '<button type="button" class="btnMtlCreate" disabled style="cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:4px;padding:10px 26px;font-size:0.95em;font-weight:600;display:flex;align-items:center;gap:6px;">' +
                '<i class="md-icon" style="font-size:1em;">playlist_add</i>' + escHtml(createBtnLabel) + '</button>' +
                '</div>';

            deps.initBadgePicker(modal);
            deps.wireUserMultiSelect(modal);

            if (isEdit) {
                const nameInput = modal.querySelector<HTMLInputElement>('.mtlListName');
                if (nameInput) {
                    nameInput.readOnly = true;
                    nameInput.style.opacity = '0.6';
                    nameInput.style.cursor = 'not-allowed';
                }
            }

            const presetMoviesRaw = existingObj ? readExistingArray(existingObj, 'movies') : [];
            const selectedMovies: SelectedMovie[] = presetMoviesRaw
                .map((m) => asSelectedMovie(asManualMovie(m)))
                .filter((m): m is SelectedMovie => m !== null);

            function renderSelectedList(): void {
                const listEl = modal.querySelector<HTMLElement>('.mtlSelectedList');
                if (!listEl) return;
                if (selectedMovies.length === 0) {
                    listEl.innerHTML = '<div style="padding:8px 4px;opacity:0.5;font-size:0.9em;">No movies added yet.</div>';
                    return;
                }
                listEl.innerHTML = selectedMovies.map((m, idx) => {
                    const label = escHtml(m.Name) + (m.Year ? ' (' + escHtml(String(m.Year)) + ')' : '');
                    const upDis = idx === 0 ? ' disabled' : '';
                    const dnDis = idx === selectedMovies.length - 1 ? ' disabled' : '';
                    return '<div style="display:flex;align-items:center;gap:5px;padding:5px 2px;border-bottom:1px solid rgba(128,128,128,0.15);">' +
                        '<span style="min-width:22px;font-size:0.8em;opacity:0.55;font-weight:600;text-align:right;">' + (idx + 1) + '.</span>' +
                        '<span style="flex:1;font-size:0.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escAttr(m.Name) + '">' + label + '</span>' +
                        '<button type="button" class="btnMtlUp" data-idx="' + idx + '"' + upDis + ' style="cursor:pointer;border:none;background:transparent;color:inherit;padding:2px 4px;opacity:0.7;font-size:0.9em;line-height:1;" title="Move up">▲</button>' +
                        '<button type="button" class="btnMtlDown" data-idx="' + idx + '"' + dnDis + ' style="cursor:pointer;border:none;background:transparent;color:inherit;padding:2px 4px;opacity:0.7;font-size:0.9em;line-height:1;" title="Move down">▼</button>' +
                        '<button type="button" class="btnMtlRemove" data-idx="' + idx + '" style="cursor:pointer;border:none;background:transparent;color:#cc3333;padding:2px 4px;font-size:0.9em;line-height:1;" title="Remove">✕</button>' +
                        '</div>';
                }).join('');
            }

            function updateCreateBtn(): void {
                const listNameInput = modal.querySelector<HTMLInputElement>('.mtlListName');
                const createBtn = modal.querySelector<HTMLButtonElement>('.btnMtlCreate');
                if (!listNameInput || !createBtn) return;
                const nameVal = (listNameInput.value || '').trim();
                const hasUsers = modal.querySelectorAll<HTMLInputElement>('.chkMtlUser:checked').length > 0;
                createBtn.disabled = (nameVal.length === 0 || selectedMovies.length === 0 || !hasUsers);
            }

            renderSelectedList();
            updateCreateBtn();

            const closeBtn2 = modal.querySelector<HTMLButtonElement>('.btnMtlClose');
            const cancelBtn2 = modal.querySelector<HTMLButtonElement>('.btnMtlCancel');
            if (closeBtn2) closeBtn2.addEventListener('click', () => { modal.remove(); document.removeEventListener('keydown', onEsc); });
            if (cancelBtn2) cancelBtn2.addEventListener('click', () => { modal.remove(); document.removeEventListener('keydown', onEsc); });

            const listNameInput = modal.querySelector<HTMLInputElement>('.mtlListName');
            if (listNameInput) listNameInput.addEventListener('input', updateCreateBtn);

            modal.querySelectorAll<HTMLInputElement>('.chkMtlUser').forEach((cb) => {
                cb.addEventListener('change', updateCreateBtn);
            });

            const searchInput = modal.querySelector<HTMLInputElement>('.mtlMovieSearch');
            const resultsBox = modal.querySelector<HTMLElement>('.mtlSearchResults');
            if (!searchInput || !resultsBox) return;

            function showSearchResults(q: string): void {
                q = (q || '').trim().toLowerCase();
                if (q.length < 1) { resultsBox!.style.display = 'none'; resultsBox!.innerHTML = ''; return; }
                const hits = allMovies.filter((m) => {
                    const name = (m.Name || '').toLowerCase();
                    const yearMatch = m.Year != null && String(m.Year).indexOf(q) !== -1;
                    return name.indexOf(q) !== -1 || yearMatch;
                }).slice(0, 20);
                if (hits.length === 0) { resultsBox!.style.display = 'none'; return; }
                const alreadyIds = new Set(selectedMovies.map((m) => m.ItemId));
                resultsBox!.innerHTML = hits.map((m) => {
                    const itemId = typeof m.ItemId === 'string' ? m.ItemId : '';
                    const added = itemId ? alreadyIds.has(itemId) : false;
                    const label = escHtml(m.Name || '') + (m.Year != null ? ' (' + m.Year + ')' : '');
                    return '<div class="mtlSearchResult" data-itemid="' + escAttr(itemId) + '"' +
                        ' data-imdbid="' + escAttr(m.ImdbId) + '"' +
                        ' data-name="' + escAttr(m.Name) + '"' +
                        ' data-year="' + escAttr(String(m.Year || '')) + '"' +
                        ' style="padding:7px 12px;cursor:pointer;font-size:0.9em;border-bottom:1px solid rgba(128,128,128,0.12);' +
                        (added ? 'opacity:0.42;pointer-events:none;' : '') + '">' +
                        label + (added ? ' <span style="font-size:0.8em;">(already added)</span>' : '') + '</div>';
                }).join('');
                resultsBox!.style.display = 'block';
            }

            searchInput.addEventListener('input', function () { showSearchResults(this.value); });
            searchInput.addEventListener('focus', function () { showSearchResults(this.value); });

            resultsBox.addEventListener('mousedown', (e) => {
                const row = (e.target as Element | null)?.closest<HTMLElement>('.mtlSearchResult');
                if (!row || !row.dataset.itemid) return;
                e.preventDefault();
                const itemId = row.dataset.itemid;
                if (selectedMovies.some((m) => m.ItemId === itemId)) return;
                selectedMovies.push({
                    ItemId: itemId,
                    ImdbId: row.dataset.imdbid || '',
                    Name: row.dataset.name || '',
                    Year: row.dataset.year ? parseInt(row.dataset.year, 10) : null
                });
                searchInput.value = '';
                resultsBox.style.display = 'none';
                renderSelectedList();
                updateCreateBtn();
            });

            searchInput.addEventListener('blur', () => {
                setTimeout(() => { resultsBox.style.display = 'none'; }, 150);
            });

            const selectedListEl = modal.querySelector<HTMLElement>('.mtlSelectedList');
            if (selectedListEl) {
                selectedListEl.addEventListener('click', (e) => {
                    const btn = (e.target as Element | null)?.closest('button');
                    if (!btn) return;
                    const idx = parseInt(btn.dataset.idx || '-1', 10);
                    if (isNaN(idx)) return;
                    let tmp: SelectedMovie;
                    if (btn.classList.contains('btnMtlUp') && idx > 0) {
                        tmp = selectedMovies[idx - 1]!;
                        selectedMovies[idx - 1] = selectedMovies[idx]!;
                        selectedMovies[idx] = tmp;
                    } else if (btn.classList.contains('btnMtlDown') && idx < selectedMovies.length - 1) {
                        tmp = selectedMovies[idx + 1]!;
                        selectedMovies[idx + 1] = selectedMovies[idx]!;
                        selectedMovies[idx] = tmp;
                    } else if (btn.classList.contains('btnMtlRemove')) {
                        selectedMovies.splice(idx, 1);
                    }
                    renderSelectedList();
                    updateCreateBtn();
                });
            }

            const createBtn = modal.querySelector<HTMLButtonElement>('.btnMtlCreate');
            if (!createBtn) return;
            createBtn.addEventListener('click', () => {
                const errEl = modal.querySelector<HTMLElement>('.mtl-error');
                if (!errEl) return;
                errEl.textContent = '';

                const listNameInput2 = modal.querySelector<HTMLInputElement>('.mtlListName');
                const customNameInput2 = modal.querySelector<HTMLInputElement>('.mtlCustomName');
                const displayModeSel2 = modal.querySelector<HTMLSelectElement>('.mtlDisplayMode');
                const imageTypeSel2 = modal.querySelector<HTMLSelectElement>('.mtlImageType');
                const listName = (listNameInput2 ? listNameInput2.value : '').trim();
                const customNameVal = (customNameInput2 ? customNameInput2.value : '').trim() || listName;
                const displayMode = displayModeSel2 ? displayModeSel2.value : '';
                const imageType = imageTypeSel2 ? imageTypeSel2.value : '';
                const badgeStyle = deps.readBadgeStyle(modal);
                const selectedUserIds = Array.from(modal.querySelectorAll<HTMLInputElement>('.chkMtlUser:checked')).map((c) => c.value);

                if (!listName) { errEl.textContent = 'Please enter a name for the list.'; return; }
                if (selectedUserIds.length === 0) { errEl.textContent = 'Please select at least one target user.'; return; }
                if (selectedMovies.length === 0) { errEl.textContent = 'Please add at least one movie.'; return; }

                createBtn.disabled = true;
                createBtn.innerHTML = 'Preparing files <span class="tc-dot-loader"><span></span><span></span><span></span></span>';

                const tok2 = api.accessToken();
                deps.fetch(api.getUrl('HomeScreenCompanion/TopList/PrepareManualFolder'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok2 },
                    body: JSON.stringify({
                        ListName: listName,
                        BadgeStyle: badgeStyle,
                        Items: selectedMovies.map((m) => { return { ImdbId: m.ImdbId, ItemId: m.ItemId }; })
                    })
                })
                    .then((r) => r.json())
                    .then((prepareRaw) => {
                        const prepareResult = prepareRaw as PrepareResultLike;
                        if (!prepareResult.Success) throw new Error(prepareResult.Message || 'Failed to create folder.');
                        const ui: TopListCreationUi = { saveBtn: createBtn, errEl: errEl, modal: modal, badgeStyle: badgeStyle };
                        const tlDeps = buildTopListCreationDeps(api, deps, tok2);
                        deps.executeTopListCreationSteps(
                            listName,
                            customNameVal,
                            selectedUserIds,
                            displayMode,
                            customNameVal,
                            imageType,
                            0,
                            prepareResult,
                            ui,
                            () => {
                                document.removeEventListener('keydown', onEsc);
                                modal.remove();
                                if (typeof onSuccess === 'function') onSuccess();
                            },
                            tlDeps,
                        );
                    })
                    .catch((err: unknown) => {
                        createBtn.disabled = false;
                        createBtn.innerHTML = '<i class="md-icon" style="font-size:1em;">playlist_add</i>' + escHtml(createBtnLabel);
                        errEl.textContent = (err as { message?: string }).message || String(err);
                    });
            });
        })
        .catch((err: unknown) => {
            const innerBox = modal.querySelector<HTMLElement>('div');
            if (!innerBox) return;
            innerBox.innerHTML =
                '<div style="color:#cc3333;padding:10px 0;">Failed to load: ' + ((err as { message?: string }).message || String(err)).replace(/</g, '&lt;') + '</div>' +
                '<div style="margin-top:16px;text-align:right;">' +
                '<button type="button" class="btnMtlClose" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:inherit;border-radius:3px;padding:6px 14px;font-size:0.9em;">Close</button>' +
                '</div>';
            const closeBtn3 = modal.querySelector<HTMLButtonElement>('.btnMtlClose');
            if (closeBtn3) closeBtn3.addEventListener('click', () => { modal.remove(); document.removeEventListener('keydown', onEsc); });
        });
}

/**
 * Load the inline-edit form into a top-list row's body (legacy.js:5187-5570).
 *
 * Behavior contract:
 *   - Reads `row.dataset.editjson` (the JSON-encoded snapshot written
 *     by `topListsTab.renderTopListRows`).
 *   - Manual branch: preloads `AllMovies` + users + `ManualItems`,
 *     then renders the full two-column form and attaches the save
 *     closure to `body.tlSaveForm`.
 *   - Non-manual branch: just preloads users, renders the tag-driven
 *     form, and attaches the save closure to `body.tlSaveForm`.
 *   - On any field change, `body.dataset.dirty` is toggled to `"1"` /
 *     `"0"` (and the dirty-state helper is called).
 *   - The Apply button is intentionally NOT created here — it lives in
 *     the surrounding `tlContainer` and calls `body.tlSaveForm()`.
 *
 * @param row        The top-list `.tag-row` whose `data-editjson`
 *                   carries the persisted values.
 * @param body       The `.tag-body` element the form is appended into.
 * @param onSuccess  Callback invoked after a successful save (the
 *                   manual modal triggers it via `body.tlSaveForm`).
 * @param deps       See {@link TopListModalDeps}.
 */
export function loadInlineEditForm(
    row: HTMLElement,
    body: HTMLElement,
    onSuccess: () => void,
    deps: TopListModalDeps,
): void {
    const editJson = readEditJson(row);
    const tagName = editJson.tagName || '';
    const isManual = !!editJson.isManual;
    const displayName = editJson.displayName || editJson.customName || tagName;

    const inputStyle = 'background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);border-radius:4px;padding:6px 10px;font-size:0.9em;color:var(--plugin-popup-color);width:100%;box-sizing:border-box;';
    const labelStyle = 'font-size:0.82em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;opacity:0.65;display:block;margin-bottom:5px;';
    const fieldStyle = 'margin-bottom:14px;';

    const deleteHtml = '<button type="button" is="emby-button" class="raised btnTlDelete" data-name="' + escAttr(tagName) + '" style="background:#cc3333 !important;color:#fff;"><i class="md-icon" style="margin-right:5px;">delete</i>Delete top-list</button>';

    body.innerHTML = '<div style="padding:8px 0;opacity:0.6;font-size:0.9em;">Loading… <span class="tc-dot-loader"><span></span><span></span><span></span></span></div>';

    const api = deps.getApiClient();
    const tok = api.accessToken();

    if (isManual) {
        Promise.all([
            deps.fetch(api.getUrl('HomeScreenCompanion/TopList/AllMovies'), {
                headers: { 'X-MediaBrowser-Token': tok }
            }).then((r) => r.json()),
            deps.getHseUsers(),
            deps.fetch(api.getUrl('HomeScreenCompanion/TopList/ManualItems') + '?ListName=' + encodeURIComponent(tagName), {
                headers: { 'X-MediaBrowser-Token': tok }
            }).then((r) => r.json())
        ]).then((res) => {
            const allMoviesRaw = res[0] as AllMoviesResultLike;
            const users = res[1];
            const allMovies = allMoviesRaw.Movies || [];
            const data = res[2] as ManualItemsResultLike;

            if (!data.Success) {
                body.innerHTML = '<div style="color:#cc3333;padding:8px 0;">Failed to load: ' + escHtml(data.Message || 'Unknown error') + '</div>';
                return;
            }

            const presetUserIds: readonly string[] = data.UserIds || editJson.userIds || [];
            const presetDisplay = data.DisplayMode || editJson.displayMode || '';
            const presetImageType = data.ImageType || editJson.imageType || '';
            const presetBadgeStyle = data.BadgeStyle || editJson.badgeStyle || 'neutral';
            const presetCustomName = data.CustomName || editJson.customName || '';
            const presetMoviesRaw = data.Movies || [];

            const colHeaderStyle = 'font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#52B54B;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid rgba(82,181,75,0.3);';

            const usersHtml = deps.buildUserMultiSelectHtml(users, presetUserIds, 'chkMtlUser');

            const displayOptions = [
                { val: '', label: 'Always' },
                { val: 'tv', label: 'When TV Display Mode is on' },
                { val: 'mobile,desktop', label: 'When TV Display Mode is off' }
            ].map((o) => {
                return '<option value="' + escAttr(o.val) + '"' + (o.val === presetDisplay ? ' selected' : '') + '>' + escHtml(o.label) + '</option>';
            }).join('');

            const imageOptions = [
                { val: '', label: 'Auto' },
                { val: 'Primary', label: 'Primary' },
                { val: 'Thumb', label: 'Thumb' }
            ].map((o) => {
                return '<option value="' + escAttr(o.val) + '"' + (o.val === presetImageType ? ' selected' : '') + '>' + escHtml(o.label) + '</option>';
            }).join('');

            const wrapper = document.createElement('div');
            wrapper.innerHTML =
                '<div style="display:flex;gap:0;align-items:stretch;">' +

                '<div style="flex:1;min-width:0;padding-right:20px;border-right:1px solid var(--line-color);">' +
                '<div style="' + colHeaderStyle + '"><i class="md-icon" style="font-size:0.9em;vertical-align:middle;margin-right:5px;">home</i>Home Section Settings</div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Custom Title <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.7;">(shown on home screen)</span></label>' +
                '<input type="text" class="mtlCustomName" style="' + inputStyle + '" placeholder="Defaults to list name" value="' + escAttr(presetCustomName) + '" /></div>' +

                '<div style="' + fieldStyle + '"><span style="' + labelStyle + '">Target Users</span>' +
                '<div>' + usersHtml + '</div></div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Show this section</label>' +
                '<select is="emby-select" class="mtlDisplayMode" style="width:100%;">' + displayOptions + '</select></div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Image Type</label>' +
                '<select is="emby-select" class="mtlImageType" style="width:100%;">' + imageOptions + '</select></div>' +

                '</div>' +

                '<div style="flex:1;min-width:0;padding-left:20px;">' +
                '<div style="' + colHeaderStyle + '"><i class="md-icon" style="font-size:0.9em;vertical-align:middle;margin-right:5px;">format_list_numbered</i>Movie List</div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Add Movie</label>' +
                '<div style="position:relative;">' +
                '<input type="text" class="mtlMovieSearch" autocomplete="off" style="' + inputStyle + '" placeholder="Type to search…" />' +
                '<div class="mtlSearchResults" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--plugin-popup-bg,#2a2a2a);border:1px solid var(--line-color);border-radius:4px;max-height:200px;overflow-y:auto;margin-top:2px;box-shadow:0 4px 12px rgba(0,0,0,0.45);"></div>' +
                '</div></div>' +

                '<div class="mtlSelectedList" style="max-height:280px;overflow-y:auto;border:1px solid var(--line-color);border-radius:4px;padding:4px 8px;min-height:60px;"></div>' +
                '</div>' +

                '</div>' +

                '<div style="border-top:1px solid var(--line-color);padding-top:14px;margin-top:4px;">' +
                deps.buildBadgePickerHtml(presetBadgeStyle) +
                '</div>' +

                '<div class="mtl-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-top:12px;margin-bottom:4px;"></div>' +
                '<div style="border-top:1px solid var(--line-color);padding-top:16px;margin-top:8px;display:flex;gap:10px;align-items:center;justify-content:flex-end;">' +
                deleteHtml +
                '</div>';

            body.innerHTML = '';
            body.appendChild(wrapper);
            deps.initBadgePicker(body);
            deps.wireUserMultiSelect(wrapper);

            const selectedMovies: SelectedMovie[] = presetMoviesRaw
                .map((m) => asSelectedMovie(m))
                .filter((m): m is SelectedMovie => m !== null);
            let originalManualState: string | undefined;

            function renderSelectedList(): void {
                const listEl = wrapper.querySelector<HTMLElement>('.mtlSelectedList');
                if (!listEl) return;
                if (selectedMovies.length === 0) {
                    listEl.innerHTML = '<div style="padding:8px 4px;opacity:0.5;font-size:0.9em;">No movies added yet.</div>';
                    updateManualDirty();
                    return;
                }
                listEl.innerHTML = selectedMovies.map((m, idx) => {
                    const label = escHtml(m.Name) + (m.Year ? ' (' + escHtml(String(m.Year)) + ')' : '');
                    const upDis = idx === 0 ? ' disabled' : '';
                    const dnDis = idx === selectedMovies.length - 1 ? ' disabled' : '';
                    return '<div style="display:flex;align-items:center;gap:5px;padding:5px 2px;border-bottom:1px solid rgba(128,128,128,0.15);">' +
                        '<span style="min-width:22px;font-size:0.8em;opacity:0.55;font-weight:600;text-align:right;">' + (idx + 1) + '.</span>' +
                        '<span style="flex:1;font-size:0.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escAttr(m.Name) + '">' + label + '</span>' +
                        '<button type="button" class="btnMtlUp" data-idx="' + idx + '"' + upDis + ' style="cursor:pointer;border:none;background:transparent;color:inherit;padding:2px 4px;opacity:0.7;font-size:0.9em;line-height:1;" title="Move up">▲</button>' +
                        '<button type="button" class="btnMtlDown" data-idx="' + idx + '"' + dnDis + ' style="cursor:pointer;border:none;background:transparent;color:inherit;padding:2px 4px;opacity:0.7;font-size:0.9em;line-height:1;" title="Move down">▼</button>' +
                        '<button type="button" class="btnMtlRemove" data-idx="' + idx + '" style="cursor:pointer;border:none;background:transparent;color:#cc3333;padding:2px 4px;font-size:0.9em;line-height:1;" title="Remove">✕</button>' +
                        '</div>';
                }).join('');
                updateManualDirty();
            }

            renderSelectedList();
            originalManualState = getManualFormState();

            const searchInput2 = wrapper.querySelector<HTMLInputElement>('.mtlMovieSearch');
            const resultsBox2 = wrapper.querySelector<HTMLElement>('.mtlSearchResults');
            if (!searchInput2 || !resultsBox2) return;

            function showSearchResults2(q: string): void {
                q = (q || '').trim().toLowerCase();
                if (q.length < 1) { resultsBox2!.style.display = 'none'; resultsBox2!.innerHTML = ''; return; }
                const alreadyIds = new Set(selectedMovies.map((m) => m.ItemId));
                const hits = allMovies.filter((m) => {
                    const name = (m.Name || '').toLowerCase();
                    const yearMatch = m.Year != null && String(m.Year).indexOf(q) !== -1;
                    return name.indexOf(q) !== -1 || yearMatch;
                }).slice(0, 20);
                if (hits.length === 0) { resultsBox2!.style.display = 'none'; return; }
                resultsBox2!.innerHTML = hits.map((m) => {
                    const itemId = typeof m.ItemId === 'string' ? m.ItemId : '';
                    const added = itemId ? alreadyIds.has(itemId) : false;
                    const lbl = escHtml(m.Name || '') + (m.Year != null ? ' (' + m.Year + ')' : '');
                    return '<div class="mtlSearchResult" data-itemid="' + escAttr(itemId) + '" data-imdbid="' + escAttr(m.ImdbId) + '" data-name="' + escAttr(m.Name) + '" data-year="' + escAttr(String(m.Year || '')) + '" style="padding:7px 12px;cursor:pointer;font-size:0.9em;border-bottom:1px solid rgba(128,128,128,0.12);' + (added ? 'opacity:0.42;pointer-events:none;' : '') + '">' + lbl + (added ? ' <span style="font-size:0.8em;">(already added)</span>' : '') + '</div>';
                }).join('');
                resultsBox2!.style.display = 'block';
            }

            searchInput2.addEventListener('input', function () { showSearchResults2(this.value); });
            searchInput2.addEventListener('focus', function () { showSearchResults2(this.value); });
            searchInput2.addEventListener('blur', () => {
                setTimeout(() => { resultsBox2.style.display = 'none'; }, 150);
            });

            resultsBox2.addEventListener('mousedown', (e) => {
                const resultRow = (e.target as Element | null)?.closest<HTMLElement>('.mtlSearchResult');
                if (!resultRow || !resultRow.dataset.itemid) return;
                e.preventDefault();
                const itemId = resultRow.dataset.itemid;
                if (selectedMovies.some((m) => m.ItemId === itemId)) return;
                selectedMovies.push({
                    ItemId: itemId,
                    ImdbId: resultRow.dataset.imdbid || '',
                    Name: resultRow.dataset.name || '',
                    Year: resultRow.dataset.year ? parseInt(resultRow.dataset.year, 10) : null
                });
                searchInput2.value = '';
                resultsBox2.style.display = 'none';
                renderSelectedList();
            });

            const selectedListEl2 = wrapper.querySelector<HTMLElement>('.mtlSelectedList');
            if (selectedListEl2) {
                selectedListEl2.addEventListener('click', (e) => {
                    const btn = (e.target as Element | null)?.closest('button');
                    if (!btn) return;
                    const idx = parseInt(btn.dataset.idx || '-1', 10);
                    if (isNaN(idx)) return;
                    let tmp: SelectedMovie;
                    if (btn.classList.contains('btnMtlUp') && idx > 0) {
                        tmp = selectedMovies[idx - 1]!;
                        selectedMovies[idx - 1] = selectedMovies[idx]!;
                        selectedMovies[idx] = tmp;
                    } else if (btn.classList.contains('btnMtlDown') && idx < selectedMovies.length - 1) {
                        tmp = selectedMovies[idx + 1]!;
                        selectedMovies[idx + 1] = selectedMovies[idx]!;
                        selectedMovies[idx] = tmp;
                    } else if (btn.classList.contains('btnMtlRemove')) {
                        selectedMovies.splice(idx, 1);
                    }
                    renderSelectedList();
                });
            }

            function getManualFormState(): string {
                const customNameEl = wrapper.querySelector<HTMLInputElement>('.mtlCustomName');
                const displayModeEl = wrapper.querySelector<HTMLSelectElement>('.mtlDisplayMode');
                const imageTypeEl = wrapper.querySelector<HTMLSelectElement>('.mtlImageType');
                const userIds = Array.from(wrapper.querySelectorAll<HTMLInputElement>('.chkMtlUser:checked')).map((c) => c.value).sort();
                return JSON.stringify({
                    customName: (customNameEl ? customNameEl.value : '').trim(),
                    displayMode: displayModeEl ? displayModeEl.value : '',
                    imageType: imageTypeEl ? imageTypeEl.value : '',
                    badgeStyle: deps.readBadgeStyle(body),
                    userIds: userIds,
                    movies: selectedMovies.map((m) => m.ItemId)
                });
            }
            function updateManualDirty(): void {
                if (!originalManualState) return;
                body.dataset.dirty = getManualFormState() !== originalManualState ? '1' : '0';
                deps.closeModal();
            }
            wrapper.querySelectorAll('input, select').forEach((el) => {
                el.addEventListener('change', updateManualDirty);
            });
            wrapper.querySelectorAll('input[type="text"], input[type="number"]').forEach((el) => {
                el.addEventListener('input', updateManualDirty);
            });

            const manualSaveForm = function (): Promise<void> {
                return new Promise<void>((resolve, reject) => {
                    const customNameEl2 = wrapper.querySelector<HTMLInputElement>('.mtlCustomName');
                    const displayModeEl2 = wrapper.querySelector<HTMLSelectElement>('.mtlDisplayMode');
                    const imageTypeEl2 = wrapper.querySelector<HTMLSelectElement>('.mtlImageType');
                    const customNameVal = (customNameEl2 ? customNameEl2.value : '').trim() || tagName;
                    const displayMode = displayModeEl2 ? displayModeEl2.value : '';
                    const imageType = imageTypeEl2 ? imageTypeEl2.value : '';
                    const badgeStyle = deps.readBadgeStyle(body);
                    const userIds = Array.from(wrapper.querySelectorAll<HTMLInputElement>('.chkMtlUser:checked')).map((c) => c.value);

                    if (userIds.length === 0) { reject(new Error('Please select at least one target user.')); return; }
                    if (selectedMovies.length === 0) { reject(new Error('Please add at least one movie.')); return; }

                    const tok2 = api.accessToken();
                    deps.fetch(api.getUrl('HomeScreenCompanion/TopList/PrepareManualFolder'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok2 },
                        body: JSON.stringify({
                            ListName: tagName, BadgeStyle: badgeStyle,
                            Items: selectedMovies.map((m) => { return { ImdbId: m.ImdbId, ItemId: m.ItemId }; })
                        })
                    })
                        .then((r) => r.json())
                        .then((prepareRaw) => {
                            const prepareResult = prepareRaw as PrepareResultLike;
                            if (!prepareResult.Success) throw new Error(prepareResult.Message || 'Failed to prepare folder.');
                            const fakeBtn = { disabled: false, innerHTML: '' };
                            const errEl = wrapper.querySelector<HTMLElement>('.mtl-error');
                            const ui: TopListCreationUi = {
                                saveBtn: fakeBtn,
                                errEl: errEl || body,
                                modal: body,
                                innerBox: wrapper,
                                badgeStyle: badgeStyle,
                                closeHandler: resolve,
                                silent: true,
                            };
                            const tlDeps = buildTopListCreationDeps(api, deps, tok2);
                            deps.executeTopListCreationSteps(
                                tagName,
                                customNameVal,
                                userIds,
                                displayMode,
                                customNameVal,
                                imageType,
                                0,
                                prepareResult,
                                ui,
                                () => {
                                    resolve();
                                    if (typeof onSuccess === 'function') onSuccess();
                                },
                                tlDeps,
                            );
                        })
                        .catch(reject);
                });
            };
            (body as HTMLElement & { tlSaveForm?: () => Promise<void> }).tlSaveForm = manualSaveForm;

        }).catch((err: unknown) => {
            body.innerHTML = '<div style="color:#cc3333;padding:8px 0;">Failed to load: ' + escHtml((err as { message?: string }).message || String(err)) + '</div>';
        });

    } else {
        deps.getHseUsers().then((users) => {
            const presetUserIds = editJson.userIds || [];
            const presetDisplay = editJson.displayMode || '';
            const presetImageType = editJson.imageType || '';
            const presetBadgeStyle = editJson.badgeStyle || 'neutral';
            const presetCustomName = editJson.customName || '';
            const presetMaxItems = editJson.maxItems || '0';

            const usersHtml = deps.buildUserMultiSelectHtml(users, presetUserIds, 'chkTlmUser');

            const wrapper = document.createElement('div');
            wrapper.innerHTML =
                '<div style="' + fieldStyle + '">' +
                '<span style="' + labelStyle + '">Target Users</span>' +
                '<div>' + usersHtml + '</div>' +
                '</div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Show this section</label>' +
                '<select is="emby-select" class="tlm-display-mode" style="width:100%;">' +
                '<option value="">Always</option>' +
                '<option value="tv">When TV Display Mode is on</option>' +
                '<option value="mobile,desktop">When TV Display Mode is off</option>' +
                '</select></div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Custom Title</label>' +
                '<input type="text" class="tlm-custom-name" style="' + inputStyle + '" placeholder="' + escAttr(displayName) + '" />' +
                '</div>' +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Image Type</label>' +
                '<select is="emby-select" class="tlm-image-type" style="width:100%;">' +
                '<option value="">Auto</option>' +
                '<option value="Primary">Primary</option>' +
                '<option value="Thumb">Thumb</option>' +
                '</select></div>' +

                deps.buildBadgePickerHtml(presetBadgeStyle) +

                '<div style="' + fieldStyle + '">' +
                '<label style="' + labelStyle + '">Max items <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.7;">(0 = all)</span></label>' +
                '<input type="number" class="tlm-max-items" min="0" step="1" style="' + inputStyle + '" placeholder="0" />' +
                '</div>' +

                '<div class="tlm-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-bottom:4px;"></div>' +
                '<div style="border-top:1px solid var(--line-color);padding-top:16px;display:flex;gap:10px;align-items:center;justify-content:flex-end;">' +
                deleteHtml +
                '</div>';

            body.innerHTML = '';
            body.appendChild(wrapper);
            deps.initBadgePicker(body);
            deps.wireUserMultiSelect(wrapper);

            const customNameInput3 = wrapper.querySelector<HTMLInputElement>('.tlm-custom-name');
            const displayModeSel3 = wrapper.querySelector<HTMLSelectElement>('.tlm-display-mode');
            const imageTypeSel3 = wrapper.querySelector<HTMLSelectElement>('.tlm-image-type');
            const maxItemsInput3 = wrapper.querySelector<HTMLInputElement>('.tlm-max-items');
            if (presetCustomName && customNameInput3) customNameInput3.value = presetCustomName;
            if (presetDisplay && displayModeSel3) displayModeSel3.value = presetDisplay;
            if (presetImageType && imageTypeSel3) imageTypeSel3.value = presetImageType;
            if (presetMaxItems && String(presetMaxItems) !== '0' && maxItemsInput3) maxItemsInput3.value = String(presetMaxItems);

            function getRegularFormState(): string {
                const customNameEl3 = wrapper.querySelector<HTMLInputElement>('.tlm-custom-name');
                const displayModeEl3 = wrapper.querySelector<HTMLSelectElement>('.tlm-display-mode');
                const imageTypeEl3 = wrapper.querySelector<HTMLSelectElement>('.tlm-image-type');
                const maxItemsEl3 = wrapper.querySelector<HTMLInputElement>('.tlm-max-items');
                const userIds = Array.from(wrapper.querySelectorAll<HTMLInputElement>('.chkTlmUser:checked')).map((c) => c.value).sort();
                return JSON.stringify({
                    customName: (customNameEl3 ? customNameEl3.value : '').trim(),
                    displayMode: displayModeEl3 ? displayModeEl3.value : '',
                    imageType: imageTypeEl3 ? imageTypeEl3.value : '',
                    badgeStyle: deps.readBadgeStyle(body),
                    maxItems: maxItemsEl3 ? maxItemsEl3.value : '',
                    userIds: userIds
                });
            }
            const originalRegularState = getRegularFormState();
            function updateRegularDirty(): void {
                body.dataset.dirty = getRegularFormState() !== originalRegularState ? '1' : '0';
                deps.closeModal();
            }
            wrapper.querySelectorAll('input, select').forEach((el) => {
                el.addEventListener('change', updateRegularDirty);
            });
            wrapper.querySelectorAll('input[type="text"], input[type="number"]').forEach((el) => {
                el.addEventListener('input', updateRegularDirty);
            });

            const regularSaveForm = function (): Promise<void> {
                return new Promise<void>((resolve, reject) => {
                    const userIds = Array.from(wrapper.querySelectorAll<HTMLInputElement>('.chkTlmUser:checked')).map((c) => c.value);
                    if (userIds.length === 0) { reject(new Error('Please select at least one target user.')); return; }

                    const customNameEl4 = wrapper.querySelector<HTMLInputElement>('.tlm-custom-name');
                    const displayModeEl4 = wrapper.querySelector<HTMLSelectElement>('.tlm-display-mode');
                    const imageTypeEl4 = wrapper.querySelector<HTMLSelectElement>('.tlm-image-type');
                    const maxItemsEl4 = wrapper.querySelector<HTMLInputElement>('.tlm-max-items');
                    const customNameVal = (customNameEl4 ? customNameEl4.value : '').trim() || displayName;
                    const displayMode = displayModeEl4 ? displayModeEl4.value : '';
                    const imageType = imageTypeEl4 ? imageTypeEl4.value : '';
                    const badgeStyle = deps.readBadgeStyle(body);
                    const maxItems = Math.max(0, parseInt(maxItemsEl4 ? maxItemsEl4.value : '0', 10) || 0);
                    const tok2 = api.accessToken();

                    deps.fetch(api.getUrl('HomeScreenCompanion/TopList/PrepareFolder'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': tok2 },
                        body: JSON.stringify({ TagName: tagName, MaxItems: maxItems, BadgeStyle: badgeStyle })
                    })
                        .then((r) => r.json())
                        .then((prepareRaw) => {
                            const prepareResult = prepareRaw as PrepareResultLike;
                            if (!prepareResult.Success) throw new Error(prepareResult.Message || 'Failed to prepare folder.');
                            const fakeBtn = { disabled: false, innerHTML: '' };
                            const errEl = wrapper.querySelector<HTMLElement>('.tlm-error');
                            const ui: TopListCreationUi = {
                                saveBtn: fakeBtn,
                                errEl: errEl || body,
                                modal: body,
                                innerBox: wrapper,
                                badgeStyle: badgeStyle,
                                closeHandler: resolve,
                                silent: true,
                            };
                            const tlDeps = buildTopListCreationDeps(api, deps, tok2);
                            deps.executeTopListCreationSteps(
                                tagName,
                                customNameVal,
                                userIds,
                                displayMode,
                                customNameVal,
                                imageType,
                                maxItems,
                                prepareResult,
                                ui,
                                () => {
                                    resolve();
                                    if (typeof onSuccess === 'function') onSuccess();
                                },
                                tlDeps,
                            );
                        })
                        .catch(reject);
                });
            };
            (body as HTMLElement & { tlSaveForm?: () => Promise<void> }).tlSaveForm = regularSaveForm;

        }).catch((err: unknown) => {
            body.innerHTML = '<div style="color:#cc3333;padding:8px 0;">Failed to load users: ' + escHtml((err as { message?: string }).message || String(err)) + '</div>';
        });
    }
}

/**
 * Show the entry-point chooser modal (legacy.js:5572-5694).
 *
 * Step 1: two cards — Manual (forwards to `showManualTopListModal`)
 * and By tag (renders step 2). Step 2: a list of managed tags from
 * `tagsData` with movie counts; clicking one forwards to
 * `showTopListModal(tagName, tagName, onSuccess)`. Tags whose
 * sanitized name appears in `existingTopLists` are marked with a
 * `top-list` badge but remain selectable (legacy behavior).
 *
 * The four show*Modal callbacks are deps fields so the chooser can
 * be tested without actually opening subsequent modals.
 *
 * @param tagsData          One row per managed tag — `Name` is
 *                          required, `MovieCount` and `ItemCount` are
 *                          used to render the count chip (legacy
 *                          falls through `MovieCount → ItemCount → 0`).
 * @param existingTopLists  Set of lowercased sanitized tag names
 *                          already backing a top-list.
 * @param onSuccess         Callback forwarded to the eventual
 *                          create/edit modal.
 * @param deps              See {@link TopListModalDeps}.
 */
export function showCreateTopListChooser(
    tagsData: readonly TagRowLike[],
    existingTopLists: ReadonlySet<string>,
    onSuccess: () => void,
    deps: TopListModalDeps,
): void {
    const innerStyle = 'background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);' +
        'border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;' +
        'padding:28px;max-width:480px;width:90%;max-height:85vh;overflow-y:auto;';

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(modal);

    function onEsc(e: KeyboardEvent): void { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove(); document.removeEventListener('keydown', onEsc); } });

    function renderStep1(): void {
        modal.innerHTML =
            '<div style="' + innerStyle + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">' +
            '<h3 style="margin:0;font-size:1.1em;color:#52B54B;">Create Top-List</h3>' +
            '<button type="button" class="btnChooserClose" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:2px;opacity:0.6;line-height:1;"><i class="md-icon">close</i></button>' +
            '</div>' +
            '<p style="margin:0 0 20px;font-size:0.9em;color:var(--theme-text-secondary);">How do you want to create this top-list?</p>' +
            '<div style="display:flex;gap:16px;">' +
            '<button type="button" class="btnChooseManual" style="flex:1;cursor:pointer;background:var(--plugin-input-bg,rgba(255,255,255,0.05));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.12));border-radius:8px;padding:20px 16px;text-align:left;color:inherit;">' +
            '<div style="font-size:1.4em;margin-bottom:10px;color:#52B54B;"><i class="md-icon">format_list_numbered</i></div>' +
            '<div style="font-weight:600;font-size:0.95em;margin-bottom:6px;">Manual</div>' +
            '<div style="font-size:0.82em;color:var(--theme-text-secondary);line-height:1.5;">Pick movies manually and build a custom list</div>' +
            '</button>' +
            '<button type="button" class="btnChooseByTag" style="flex:1;cursor:pointer;background:var(--plugin-input-bg,rgba(255,255,255,0.05));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.12));border-radius:8px;padding:20px 16px;text-align:left;color:inherit;">' +
            '<div style="font-size:1.4em;margin-bottom:10px;color:#52B54B;"><i class="md-icon">label</i></div>' +
            '<div style="font-weight:600;font-size:0.95em;margin-bottom:6px;">By tag</div>' +
            '<div style="font-size:0.82em;color:var(--theme-text-secondary);line-height:1.5;">Create from an existing tag in your library</div>' +
            '</button>' +
            '</div>' +
            '</div>';

        const closeBtn = modal.querySelector<HTMLButtonElement>('.btnChooserClose');
        if (closeBtn) closeBtn.addEventListener('click', () => { modal.remove(); document.removeEventListener('keydown', onEsc); });

        const btnManualCard = modal.querySelector<HTMLButtonElement>('.btnChooseManual');
        const btnByTagCard = modal.querySelector<HTMLButtonElement>('.btnChooseByTag');

        [btnManualCard, btnByTagCard].forEach((btn) => {
            if (!btn) return;
            btn.addEventListener('mouseover', function () { this.style.borderColor = '#52B54B'; });
            btn.addEventListener('mouseout', function () { this.style.borderColor = 'var(--plugin-input-border,rgba(255,255,255,0.12))'; });
        });

        if (btnManualCard) {
            btnManualCard.addEventListener('click', () => {
                modal.remove();
                document.removeEventListener('keydown', onEsc);
                deps.showManualTopListModal(onSuccess, undefined, deps);
            });
        }

        if (btnByTagCard) {
            btnByTagCard.addEventListener('click', () => { renderStep2(); });
        }
    }

    function renderStep2(): void {
        const inputStyle = 'background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);border-radius:4px;padding:6px 10px;font-size:0.9em;color:var(--plugin-popup-color);width:100%;box-sizing:border-box;';

        const tagRowsHtml = tagsData.length === 0
            ? '<p style="padding:12px 4px;color:var(--theme-text-secondary);font-size:0.88em;font-style:italic;">No tags found.</p>'
            : tagsData.map((tag) => {
                const name = tag.Name || '';
                const count = tag.MovieCount != null ? tag.MovieCount : (tag.ItemCount != null ? tag.ItemCount : 0);
                const hasTopList = existingTopLists.has(sanitizeTlName(name).toLowerCase());
                const badge = hasTopList
                    ? '<span style="font-size:0.72em;background:rgba(180,140,50,0.18);color:#c9a84c;border-radius:3px;padding:1px 6px;margin-left:6px;white-space:nowrap;">top-list</span>'
                    : '';
                return '<button type="button" class="btnSelectTag" data-name="' + escAttr(name) + '" ' +
                    'style="width:100%;cursor:pointer;background:transparent;border:none;border-bottom:1px solid var(--line-color);' +
                    'padding:10px 4px;display:flex;align-items:center;color:inherit;text-align:left;">' +
                    '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(name) + badge + '</span>' +
                    '<span style="margin-left:12px;white-space:nowrap;font-size:0.85em;color:var(--theme-text-secondary);">' + count + ' movies</span>' +
                    '</button>';
            }).join('');

        modal.innerHTML =
            '<div style="' + innerStyle + 'max-width:520px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
            '<button type="button" class="btnChooserBack" style="background:transparent;border:none;color:var(--theme-text-secondary);cursor:pointer;padding:2px;line-height:1;opacity:0.7;"><i class="md-icon">arrow_back</i></button>' +
            '<h3 style="margin:0;font-size:1.1em;color:#52B54B;">Select Tag</h3>' +
            '</div>' +
            '<button type="button" class="btnChooserClose" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:2px;opacity:0.6;line-height:1;"><i class="md-icon">close</i></button>' +
            '</div>' +
            '<div style="margin-bottom:14px;">' +
            '<input type="text" id="tlChooserSearch" placeholder="Search tags…" style="' + inputStyle + '" />' +
            '</div>' +
            '<div id="tlChooserTagList" style="max-height:50vh;overflow-y:auto;">' +
            tagRowsHtml +
            '</div>' +
            '</div>';

        const closeBtn2 = modal.querySelector<HTMLButtonElement>('.btnChooserClose');
        const backBtn = modal.querySelector<HTMLButtonElement>('.btnChooserBack');
        if (closeBtn2) closeBtn2.addEventListener('click', () => { modal.remove(); document.removeEventListener('keydown', onEsc); });
        if (backBtn) backBtn.addEventListener('click', () => { renderStep1(); });

        const searchInput = modal.querySelector<HTMLInputElement>('#tlChooserSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                const q = this.value.toLowerCase();
                modal.querySelectorAll<HTMLButtonElement>('.btnSelectTag').forEach((btn) => {
                    btn.style.display = (!q || (btn.dataset.name || '').toLowerCase().indexOf(q) !== -1) ? '' : 'none';
                });
            });
        }

        modal.querySelectorAll<HTMLButtonElement>('.btnSelectTag').forEach((btn) => {
            btn.addEventListener('mouseover', function () { this.style.background = 'rgba(82,181,75,0.08)'; });
            btn.addEventListener('mouseout', function () { this.style.background = 'transparent'; });
            btn.addEventListener('click', function () {
                const tagName = this.dataset.name;
                modal.remove();
                document.removeEventListener('keydown', onEsc);
                deps.showTopListModal(tagName || null, tagName || null, onSuccess, undefined, deps);
            });
        });
    }

    renderStep1();
}

/** Re-exported `PLUGIN_ID` so the future factory can use it without importing from `state.ts`. */
export const TOPLIST_MODAL_PLUGIN_ID = PLUGIN_ID;