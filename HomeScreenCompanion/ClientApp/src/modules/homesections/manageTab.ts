// Phase 5 (state wiring): Manage Home Screen tab helpers.
//
// Four functions extracted verbatim from legacy.js:6253-6519:
//
//   - loadHscManageTab      (legacy.js:6253) -- entry point: users +
//                                               section-list wiring
//   - fetchManageSections   (legacy.js:6340) -- fetch + store Sections
//   - renderManageSections  (legacy.js:6364) -- rows + drag/touch wiring
//   - applyManageSections   (legacy.js:6483) -- POST the current order
//
// The legacy trio reads/writes the module-scope array
// `currentManageSections` and calls the module-scope `checkFormState`,
// plus `window.ApiClient`, the global `fetch`, and `window.Dashboard.alert`.
// All of those are lifted onto an explicit surface:
//
//   - `ManageSectionsState` -- a caller-owned holder for the current
//     section list (replaces `currentManageSections`; never module-level
//     mutable state).
//   - `ManageDeps`          -- injection surface for ApiClient, fetch,
//     Dashboard.alert, checkFormState, and the two sibling helpers
//     (`renderManageSections`, `getManDragAfterElement`).
//
// This mirrors the `hscTab.ts` deps pattern: the legacy caller
// (`loadHscManageTab`, legacy.js:6253) keeps wrapping these with the
// closure-bound arguments until the rest of the tab is migrated.

import type { ManageState } from '../state/state';
import { escapeAttr, escapeHtml } from '../dom/dom';

/**
 * Minimal shape of one home-screen section row. The legacy code only
 * renders `CustomName || Name || SectionType || 'Section N'`; every other
 * field (e.g. `Id`, `Type`, `DisplayPreferencesId`) passes through
 * verbatim when the list is persisted, so it is intentionally left loose
 * on this type's callers.
 */
export interface ManageSectionLike {
    readonly Name?: string;
    readonly CustomName?: string;
    readonly SectionType?: string;
    // The server payload is permissive — renderManageSections ignores
    // anything other than Name / CustomName / SectionType, but callers
    // (and tests) may carry arbitrary fields alongside.
    readonly [k: string]: unknown;
}

/**
 * Caller-owned holder for the sections currently being managed. The
 * legacy module-scope `currentManageSections` is this object's `sections`
 * member: `fetchManageSections` replaces it wholesale, `renderManageSections`
 * reorders/deletes it in place.
 */
export interface ManageSectionsState {
    sections: ManageSectionLike[];
}

/**
 * The two ApiClient methods the manage tab touches. Mirrors the Jellyfin
 * `ApiClient` surface without importing its globals.
 */
export interface ManageApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
}

/**
 * Dependencies for the manage-tab helpers. Until the rest of the tab is
 * migrated, the legacy caller wraps these with its closures:
 *
 *   - `getApiClient`          `window.ApiClient` (token + url building).
 *   - `fetchFn`               the global `fetch`.
 *   - `renderSections`        bound {@link renderManageSections} -- the
 *                             sibling fetch pipeline step.
 *   - `getManDragAfterElement` the lifted drag-target lookup
 *                             (`modules/dom/dom.ts`, legacy.js:3803).
 *   - `checkFormState`        closure target (legacy.js:3482).
 *   - `alert`                 `window.Dashboard.alert`.
 */
export interface ManageDeps {
    readonly getApiClient: () => ManageApiClient;
    readonly fetchFn: typeof fetch;
    readonly renderSections: typeof renderManageSections;
    readonly getManDragAfterElement: (container: HTMLElement, y: number) => HTMLElement | null;
    readonly checkFormState: () => void;
    readonly alert: (message: string) => void;
}

/**
 * Fetch the home-screen sections of `userId` and render them into the
 * manage tab (legacy.js:6340).
 *
 * Side effects, byte-for-byte legacy:
 *   - writes the "Loading sections..." placeholder into `#manSectionList`;
 *   - disables `#btnApplyManage` (no null-guard -- the legacy code throws
 *     here if the button is missing, and that is preserved);
 *   - GETs `HomeScreenCompanion/Hsc/UserSections?userId=...` with an
 *     `X-Emby-Token` header when a token exists;
 *   - on success replaces `state.sections` with `result.Sections || []`
 *     and re-renders via `deps.renderSections`;
 *   - on failure writes the red "Failed to load sections." copy.
 */
export function fetchManageSections(
    view: HTMLElement,
    userId: string,
    state: ManageSectionsState,
    deps: ManageDeps,
): void {
    const container = view.querySelector('#hscManageContainer');
    if (!container) return;
    const listEl = container.querySelector<HTMLElement>('#manSectionList');
    if (!listEl) return;

    listEl.innerHTML = '<p class="textMuted" style="padding:10px 0;">Loading sections...</p>';
    // Legacy has no null-guard on this lookup; keep the throw for
    // behavior parity (the element always exists in the real tab markup).
    const btnApply = container.querySelector<HTMLButtonElement>('#btnApplyManage')!;
    btnApply.disabled = true;

    const headers: Record<string, string> = {};
    const token = deps.getApiClient().accessToken();
    if (token) headers['X-Emby-Token'] = token;

    deps
        .fetchFn(deps.getApiClient().getUrl('HomeScreenCompanion/Hsc/UserSections', { userId: userId }), { headers: headers })
        .then((r) => r.json())
        .then((result: unknown) => {
            // Legacy: `currentManageSections = result.Sections || []`.
            const payload = result as { Sections?: unknown };
            state.sections = (payload.Sections || []) as ManageSectionLike[];
            deps.renderSections(view, state, deps);
        })
        .catch(() => {
            listEl.innerHTML = '<p class="textMuted" style="padding:10px 0;color:#cc3333;">Failed to load sections.</p>';
        });
}

/**
 * Render the current section list into the manage tab and wire up the
 * drag / touch reorder + delete interactions (legacy.js:6364).
 *
 * Reads `state.sections` (never mutates it except through the reorder /
 * delete handlers, exactly as the legacy closure mutated
 * `currentManageSections`):
 *
 *   - empty list      -> italic "No sections found for this user." copy;
 *   - otherwise       -> one `.man-section-row` per section with
 *     `data-section-index`, a `.drag-handle` (mousedown/up toggles
 *     `draggable`), and a `.man-btn-delete` button.
 *
 * Per-row wiring:
 *   - handle `touchstart`/`touchmove`/`touchend`/`touchcancel` (with the
 *     legacy detached-placeholder quirk: the `.sort-placeholder` is only
 *     inserted into the list when a drop target is found);
 *   - row `dragstart` (hide after 0ms) / `dragend` (reorder);
 *   - delete button `click` (splice + re-render).
 *
 * Reordering (both touch end and drag end) snapshots `state.sections`,
 * rebuilds it from the DOM row order, renumbers `data-section-index`
 * attributes, enables `#btnApplyManage`, and pings `deps.checkFormState`.
 */
export function renderManageSections(
    view: HTMLElement,
    state: ManageSectionsState,
    deps: ManageDeps,
): void {
    const container = view.querySelector('#hscManageContainer');
    if (!container) return;
    const listEl = container.querySelector<HTMLElement>('#manSectionList');
    if (!listEl) return;

    // Aliases so closures (applyDomOrder / touch handlers) keep the
    // non-null narrowing even though TS loses it across function boundaries.
    const con: HTMLElement = container as HTMLElement;
    const list: HTMLElement = listEl;

    if (state.sections.length === 0) {
        list.innerHTML = '<p class="textMuted" style="padding:10px 0;">No sections found for this user.</p>';
        return;
    }

    list.innerHTML = state.sections
        .map((s, i) => {
            // Name falls back through CustomName -> Name -> SectionType ->
            // 'Section N' and is HTML-escaped into the text node (C1).
            const name = s.CustomName || s.Name || s.SectionType || ('Section ' + (i + 1));
            return [
                '<div class="man-section-row" draggable="false" data-section-index="' + i + '">',
                '<span class="drag-handle"><i class="md-icon">drag_indicator</i></span>',
                '<span style="flex-grow:1;">' + escapeHtml(name) + '</span>',
                '<button type="button" is="emby-button" class="man-btn-delete raised" data-section-index="' + i + '" title="Remove section">',
                '<i class="md-icon">delete</i>',
                '</button>',
            ].join('') + '</div>';
        })
        .join('');

    /** Snapshot `state.sections` from the DOM row order (legacy quirk:
     *  out-of-range / NaN indices flow `undefined` through untouched). */
    function applyDomOrder(): void {
        const domRows = Array.from(list.querySelectorAll<HTMLElement>('.man-section-row'));
        if (domRows.length > 0) {
            const snapshot = state.sections.slice();
            state.sections = domRows.map(
                (r) => snapshot[parseInt(r.dataset.sectionIndex ?? '', 10)] as ManageSectionLike,
            );
            domRows.forEach((r, pos) => {
                r.dataset.sectionIndex = String(pos);
                const delBtn = r.querySelector<HTMLElement>('.man-btn-delete');
                if (delBtn) delBtn.dataset.sectionIndex = String(pos);
            });
            const btnApply = con.querySelector<HTMLButtonElement>('#btnApplyManage');
            if (btnApply) {
                btnApply.disabled = false;
                deps.checkFormState();
            }
        }
    }

    list.querySelectorAll<HTMLElement>('.man-section-row').forEach((row) => {
        // Legacy has no null-guard on the handle lookup; keep the throw.
        const handle = row.querySelector<HTMLElement>('.drag-handle')!;

        handle.addEventListener('mousedown', () => {
            row.setAttribute('draggable', 'true');
        });
        handle.addEventListener('mouseup', () => {
            row.setAttribute('draggable', 'false');
        });

        handle.addEventListener(
            'touchstart',
            (e) => {
                e.preventDefault();
                row.classList.add('man-dragging');

                function onTouchMove(ev: TouchEvent): void {
                    ev.preventDefault();
                    // Legacy dereferences `ev.touches[0]` unguarded; keep the throw.
                    const touch = ev.touches[0]!;
                    const afterEl = deps.getManDragAfterElement(list, touch.clientY);
                    let ph = list.querySelector<HTMLElement>('.sort-placeholder');
                    if (!ph) {
                        ph = document.createElement('div');
                        ph.className = 'sort-placeholder';
                    }
                    if (afterEl == null) {
                        // Legacy quirk: a detached placeholder has
                        // `nextElementSibling === null`, so the placeholder
                        // is only ever appended when a target row exists.
                        if (ph.nextElementSibling !== null) list.appendChild(ph);
                    } else {
                        if (ph.nextElementSibling !== afterEl) list.insertBefore(ph, afterEl);
                    }
                }

                function onTouchEnd(): void {
                    document.removeEventListener('touchmove', onTouchMove);
                    document.removeEventListener('touchend', onTouchEnd);
                    document.removeEventListener('touchcancel', onTouchCancel);
                    row.classList.remove('man-dragging');
                    const ph = list.querySelector<HTMLElement>('.sort-placeholder');
                    if (ph) {
                        list.insertBefore(row, ph);
                        ph.remove();
                    }
                    applyDomOrder();
                }

                function onTouchCancel(): void {
                    document.removeEventListener('touchmove', onTouchMove);
                    document.removeEventListener('touchend', onTouchEnd);
                    document.removeEventListener('touchcancel', onTouchCancel);
                    row.classList.remove('man-dragging');
                    const ph = list.querySelector<HTMLElement>('.sort-placeholder');
                    if (ph) ph.remove();
                }

                document.addEventListener('touchmove', onTouchMove, { passive: false });
                document.addEventListener('touchend', onTouchEnd);
                document.addEventListener('touchcancel', onTouchCancel);
            },
            { passive: false },
        );

        row.addEventListener('dragstart', (e) => {
            row.classList.add('man-dragging');
            // Legacy dereferences `e.dataTransfer` unguarded; keep the throw.
            const dt = (e as DragEvent).dataTransfer!;
            dt.effectAllowed = 'move';
            dt.setData('text/plain', '');
            setTimeout(() => {
                row.style.display = 'none';
            }, 0);
        });

        row.addEventListener('dragend', () => {
            row.style.display = '';
            row.classList.remove('man-dragging');
            row.setAttribute('draggable', 'false');
            const ph = list.querySelector<HTMLElement>('.sort-placeholder');
            if (ph) ph.remove();
            applyDomOrder();
        });

        const delBtn = row.querySelector<HTMLElement>('.man-btn-delete')!;
        delBtn.addEventListener('click', () => {
            state.sections.splice(parseInt(delBtn.dataset.sectionIndex ?? '', 10), 1);
            renderManageSections(view, state, deps);
            const btnApply = con.querySelector<HTMLButtonElement>('#btnApplyManage');
            if (btnApply) {
                btnApply.disabled = false;
                deps.checkFormState();
            }
        });
    });
}

/**
 * POST the current section list for the selected user back to the server
 * (legacy.js:6483).
 *
 * Side effects, byte-for-byte legacy:
 *   - early-returns when `#selManageUser` is missing or has no value;
 *   - disables `#btnApplyManage` (no null-guard, preserved) and swaps the
 *     button's `<span>` text to "Applying…" (restored afterwards);
 *   - POSTs `{ UserId, Sections: state.sections }` as JSON with
 *     `Content-Type: application/json` + `X-Emby-Token` when available;
 *   - on `result.Success` alerts "Home screen layout saved successfully!"
 *     and leaves the button disabled (legacy quirk);
 *   - otherwise alerts "Failed to save: <Message | 'Unknown error'>" or
 *     the generic catch copy and re-enables the button.
 */
export function applyManageSections(
    view: HTMLElement,
    state: ManageSectionsState,
    deps: ManageDeps,
): void {
    const container = view.querySelector('#hscManageContainer');
    if (!container) return;
    const selUser = container.querySelector<HTMLSelectElement>('#selManageUser');
    const btnApply = container.querySelector<HTMLButtonElement>('#btnApplyManage');
    if (!selUser || !selUser.value) return;

    // Legacy has no null-guard on btnApply; keep the throw.
    btnApply!.disabled = true;
    const btnSpan = btnApply!.querySelector<HTMLElement>('span');
    const origText = btnSpan ? btnSpan.textContent : '';
    if (btnSpan) btnSpan.textContent = 'Applying\u2026';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = deps.getApiClient().accessToken();
    if (token) headers['X-Emby-Token'] = token;

    deps
        .fetchFn(deps.getApiClient().getUrl('HomeScreenCompanion/Hsc/UserSections'), {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ UserId: selUser.value, Sections: state.sections }),
        })
        .then((r) => r.json())
        .then((result: unknown) => {
            if (btnSpan) btnSpan.textContent = origText;
            const payload = result as { Success?: unknown; Message?: unknown };
            if (payload.Success) {
                deps.alert('Home screen layout saved successfully!');
            } else {
                deps.alert('Failed to save: ' + (typeof payload.Message === 'string' ? payload.Message : 'Unknown error'));
                btnApply!.disabled = false;
            }
        })
        .catch(() => {
            if (btnSpan) btnSpan.textContent = origText;
            deps.alert('Error applying changes. Check server logs.');
            btnApply!.disabled = false;
        });
}

/**
 * Dependencies for {@link loadHscManageTab}. Extends {@link ManageDeps}
 * with:
 *
 *   - `getHseUsers` — resolves to the Emby user list. Only `.Id` and
 *                     `.Name` are read, so the return type is left
 *                     loose as `unknown`; callers (and tests) provide
 *                     whatever shape the existing `getHseUsers`
 *                     helper (`modules/homesections/users.ts`)
 *                     returns.
 *   - `prompt`      — synchronous `window.prompt` analog, injected so
 *                     the "Add section" flow is testable without a
 *                     real dialog.
 *   - `fetchSections` / `applySections` — optional injection points for
 *                     the two sibling functions {@link fetchManageSections}
 *                     and {@link applyManageSections}. Both default to
 *                     the local exports, so production callers only
 *                     need to provide `getHseUsers` and `prompt`;
 *                     tests override these with spies so they can
 *                     assert on the calls without running the real
 *                     implementations.
 */
export interface LoadHscManageTabDeps extends ManageDeps {
    readonly getHseUsers: () => Promise<unknown>;
    readonly prompt: (message: string, defaultValue?: string) => string | null;
    readonly fetchSections?: typeof fetchManageSections;
    readonly applySections?: typeof applyManageSections;
}

/**
 * Wire the HSC Manage tab (legacy.js:6253-6338).
 *
 * Entry point for the tab. Looks up the four controls, fetches the
 * user list, populates the select dropdown, stamps the
 * `data-original-options` cache for restore, then wires the
 * change / refresh / apply / add interactions and renders the initial
 * section list.
 *
 * Behavior contract:
 *   1. `view.querySelector('#hscManageContainer')` — early-return on
 *      miss.
 *   2. Look up `#hscManageUserSelect`, `#btnAddManSection`,
 *      `#btnApplyManSections`, `#btnRefreshManSections` — early-return
 *      when any are missing.
 *   3. `deps.getHseUsers()` resolves to a `{Id, Name}[]`. Each user
 *      renders as `<option value="<Id>"><Name></option>` and is
 *      joined into `select.innerHTML` (replacing the empty default).
 *   4. `select.dataset.originalOptions` is stamped with the
 *      JSON-stringified user list.
 *   5. `select` `change` listener: when a user is picked,
 *      {@link fetchManageSections} is called with that id.
 *   6. Initial render: {@link renderManageSections} is invoked once
 *      via `deps.renderSections` so the placeholder copy or any
 *      pre-loaded sections show up immediately.
 *   7. `#btnAddManSection` `click` → `deps.prompt('Section name:', '')`.
 *      On a non-empty / non-whitespace result, a
 *      `{ CustomName: name, SectionType: 'Movies' }` record is pushed
 *      onto `state.sections` and the list is re-rendered.
 *   8. `#btnApplyManSections` `click` → {@link applyManageSections}.
 *   9. `#btnRefreshManSections` `click` → {@link fetchManageSections}
 *      for the currently selected user.
 *
 * @param view   The config page root.
 * @param state  Caller-owned holder for the managed sections.
 * @param deps   See {@link LoadHscManageTabDeps}.
 */
export function loadHscManageTab(
    view: HTMLElement,
    state: ManageState,
    deps: LoadHscManageTabDeps,
): void {
    const container = view.querySelector('#hscManageContainer');
    if (!container) return;

    const selUser = container.querySelector<HTMLSelectElement>('#hscManageUserSelect');
    const btnAdd = container.querySelector<HTMLButtonElement>('#btnAddManSection');
    const btnApply = container.querySelector<HTMLButtonElement>('#btnApplyManSections');
    const btnRefresh = container.querySelector<HTMLButtonElement>('#btnRefreshManSections');
    if (!selUser || !btnAdd || !btnApply || !btnRefresh) return;

    const fetchSections = deps.fetchSections ?? fetchManageSections;
    const applySections = deps.applySections ?? applyManageSections;

    void deps.getHseUsers().then((raw) => {
        const users = ((raw || []) as readonly { Id: string; Name: string }[]).slice();
        const userOptions = users
            .map((u) => '<option value="' + escapeAttr(u.Id) + '">' + escapeHtml(u.Name) + '</option>')
            .join('');
        selUser.innerHTML = userOptions;
        selUser.dataset.originalOptions = JSON.stringify(users);

        selUser.addEventListener('change', () => {
            if (selUser.value) fetchSections(view, selUser.value, state, deps);
        });

        deps.renderSections(view, state, deps);

        btnAdd.addEventListener('click', () => {
            const name = deps.prompt('Section name:', '');
            if (name && name.trim()) {
                state.sections.push({ CustomName: name.trim(), SectionType: 'Movies' });
                deps.renderSections(view, state, deps);
            }
        });

        btnApply.addEventListener('click', () => {
            applySections(view, state, deps);
        });

        btnRefresh.addEventListener('click', () => {
            if (selUser.value) fetchSections(view, selUser.value, state, deps);
        });
    });
}
