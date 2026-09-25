// Phase 5 (state wiring): Home Screen Companion tab sub-tab helpers.
//
// Three functions extracted verbatim from legacy.js:3684-3800:
//
//   - renderHscTab                       (legacy.js:3684) -- PURE given inputs
//   - enforceHscSourceTargetConflict     (legacy.js:3737) -- PURE given container
//   - loadHscUsers                       (legacy.js:3754) -- reads three clos­ures
//                                                    `lastHscConfig`,
//                                                    `renderHscTab`,
//                                                    `enforce­HscSourceTargetConflict`,
//                                                    `checkFormState`.
//
// We extract `renderHscTab` and `enforceHscSourceTargetConflict` as plain
// pure functions, then shape `loadHscUsers` to take its three closures as
// an explicit `HscDeps` arg. This is the canonical Phase-5 pattern: lift
// every module-scope read/write to an explicit parameter or a state
// surface. Until the rest of the HSC handling is migrated, the caller in
// legacy.js keeps wrapping this with the closure-bound arguments.

import { escapeAttr, escapeHtml } from '../dom/dom';

/**
 * Minimal shape we need from the saved HSC config. The full shape lives
 * in `types/dtos.ts` (Phase 4 deliverable); this avoids a cross-cycle import.
 */
export interface HscConfigLike {
    HomeSyncEnabled?: boolean;
    HomeSyncLibraryOrder?: boolean;
    HomeSyncSourceUserId?: string;
    HomeSyncTargetUserIds?: readonly string[];
}

/**
 * Minimal shape from the user list endpoint. Mirrors `HscUserDto` in
 * `DTOs.cs:57`.
 */
export interface HscUserLike {
    readonly Id: string;
    readonly Name: string;
}

/**
 * Render the HSC tab content into the container. Pure given inputs.
 *
 * The `users` array drives both the `Source User` dropdown and the
 * `Sync to` checkbox list. The `config.HomeSyncTargetUserIds` array
 * pre-selects checkboxes. `config.HomeSyncEnabled` toggles the visibility
 * of the source/target cards via inline `style="display:none"`.
 *
 * When `config.HomeSyncSourceUserId` matches a target user id, callers
 * should follow this with {@link enforceHscSourceTargetConflict}; this
 * function does NOT enforce that on its own -- the conflict is a UX
 * nicety that depends on DOM state mutations and is best tested with
 * the enforcement function.
 *
 * The function sets `container.dataset.loaded = '1'` after rendering
 * so callers can detect "first time populated" via the `data-loaded`
 * attribute.
 */
export function renderHscTab(
    container: HTMLElement,
    config: HscConfigLike,
    users: readonly HscUserLike[]
): void {
    const sourceOptions = users
        .map((u) => {
            const selected = config.HomeSyncSourceUserId === u.Id ? ' selected' : '';
            return `<option value="${escapeAttr(u.Id)}"${selected}>${escapeHtml(u.Name)}</option>`;
        })
        .join('');

    const targetRows = users
        .map((u) => {
            const checked = (config.HomeSyncTargetUserIds || []).indexOf(u.Id) >= 0 ? ' checked' : '';
            return (
                '<div class="hsc-user-row"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;">' +
                `<input is="emby-checkbox" type="checkbox" class="hsc-target-chk" value="${escapeAttr(u.Id)}"${checked} />` +
                `<span>${escapeHtml(u.Name)}</span>` +
                '</label></div>'
            );
        })
        .join('');

    const enabled = config.HomeSyncEnabled ? ' checked' : '';
    const libOrderChk = config.HomeSyncLibraryOrder ? ' checked' : '';
    const syncDisplay = config.HomeSyncEnabled ? '' : 'none';

    container.innerHTML = [
        '<div class="hsc-card">',
        '<h3 class="hsc-section-title">Configuration</h3>',
        '<div class="checkboxContainer checkboxContainer-withDescription">',
        `<label><input is="emby-checkbox" type="checkbox" id="chkHscEnabled"${enabled} /><span>Enable Home Screen sync</span></label>`,
        '<div class="fieldDescription">When enabled, the plugin syncs all Home Sections from the target user and applies it to those selected. When disabled, the task always skips — even if triggered manually.</div>',
        '</div>',
        `<div id="hscSyncConfig" style="display:${syncDisplay}">`,
        '<div class="checkboxContainer checkboxContainer-withDescription" style="margin-top:8px;">',
        `<label><input is="emby-checkbox" type="checkbox" id="chkHscLibraryOrder"${libOrderChk} /><span>Also copy library order</span></label>`,
        '<div class="fieldDescription">Also syncs the order of media libraries in the navigation sidebar.</div>',
        '</div>',
        '<div class="inputContainer" style="margin-top:16px;">',
        '<select is="emby-select" id="selHscSourceUser" label="Source User">',
        '<option value="">— Select source user —</option>',
        sourceOptions,
        '</select>',
        '<div class="fieldDescription">Home screen sections will be copied FROM this user to all users selected below.</div>',
        '</div>',
        '</div>',
        '</div>',

        `<div class="hsc-card" id="hscSyncToCard" style="display:${syncDisplay}">`,
        '<h3 class="hsc-section-title">Sync to</h3>',
        '<p class="textMuted" style="font-size:0.88em;margin-bottom:12px;">These users will receive the source user\'s home screen layout on each sync.</p>',
        '<div class="hsc-user-list" id="hscTargetList">',
        targetRows || '<p class="textMuted" style="font-size:0.85em;">No users found.</p>',
        '</div>',
        '</div>',
    ].join('');

    container.dataset.loaded = '1';
}

/**
 * Re-style the target-user list so the source user is greyed-out and
 * cannot be a target. Pure given container (mutates the DOM, but no
 * module-state read).
 *
 * @param container  The same container passed to {@link renderHscTab}.
 */
export function enforceHscSourceTargetConflict(container: HTMLElement): void {
    const sourceEl = container.querySelector<HTMLSelectElement>('#selHscSourceUser');
    const sourceId = sourceEl?.value ?? '';
    container.querySelectorAll<HTMLInputElement>('.hsc-target-chk').forEach((chk) => {
        const isConflict = sourceId !== '' && chk.value === sourceId;
        const row = chk.closest<HTMLElement>('.hsc-user-row');
        if (isConflict) {
            chk.checked = false;
            chk.disabled = true;
            if (row) {
                row.title = 'Cannot sync a user to themselves';
                row.style.opacity = '0.45';
            }
        } else {
            chk.disabled = false;
            if (row) {
                row.title = '';
                row.style.opacity = '';
            }
        }
    });
}

/**
 * Dependencies for {@link loadHscUsers}. Until we extract
 * `checkFormState`, the legacy caller wraps the loader with its closure.
 *
 * `getConfig()`  Lazy fetch of the saved HSC config snapshot. We treat
 *                this as a getter rather than a value: `loadHscUsers` is
 *                invoked at a view-show boundary, so an explicit snapshot
 *                getter is the natural shape.
 * `renderTab`    Bound at module load; the lifted {@link renderHscTab}.
 * `enforceConflict` Lifted {@link enforceHscSourceTargetConflict}.
 * `notifyFormChanged` Closure target — wired later when getUiConfig /
 *                checkFormState are extracted.
 */
export interface HscDeps {
    readonly getConfig: () => HscConfigLike;
    readonly renderTab: typeof renderHscTab;
    readonly enforceConflict: typeof enforceHscSourceTargetConflict;
    readonly notifyFormChanged: () => void;
}

/**
 * Wire the HSC sub-tab inside the home-section tab. Loads users via
 * `ApiClient.getJSON`, renders the tab via {@link renderHscTab}, enforces
 * source-target conflict, and registers change listeners that
 * toggle visibility + ping the form-state checker.
 *
 * Reads no module-scope state directly; everything comes from `deps`.
 * Until full Phase 5 wiring, the legacy.js caller wraps this with
 * closure arg `deps`.
 */
export function loadHscUsers(view: HTMLElement, deps: HscDeps): void {
    const container = view.querySelector<HTMLElement>('#hscContainer');
    if (!container) return;

    const apiClient = (typeof window !== 'undefined' ? window.ApiClient : undefined);
    if (!apiClient) {
        container.innerHTML = '<p class="textMuted" style="padding:20px;">Failed to load users. ApiClient unavailable.</p>';
        return;
    }

    apiClient
        .getJSON(apiClient.getUrl('Users', { IsDisabled: false }))
        .then((raw: unknown) => {
            const users: readonly HscUserLike[] = normalizeUsers(raw);
            deps.renderTab(container, deps.getConfig(), users);
            deps.enforceConflict(container);

            const enableChk = container.querySelector<HTMLInputElement>('#chkHscEnabled');
            if (enableChk) {
                enableChk.addEventListener('change', function (this: HTMLInputElement) {
                    const show = this.checked;
                    const syncConfig = container.querySelector<HTMLElement>('#hscSyncConfig');
                    const syncToCard = container.querySelector<HTMLElement>('#hscSyncToCard');
                    if (syncConfig) syncConfig.style.display = show ? '' : 'none';
                    if (syncToCard) syncToCard.style.display = show ? '' : 'none';
                    setTimeout(deps.notifyFormChanged, 0);
                });
            }

            const sourceSelect = container.querySelector<HTMLSelectElement>('#selHscSourceUser');
            if (sourceSelect) {
                sourceSelect.addEventListener('change', () => {
                    deps.enforceConflict(container);
                    setTimeout(deps.notifyFormChanged, 0);
                });
            }

            container.querySelectorAll<HTMLInputElement>('.hsc-target-chk').forEach((chk) => {
                chk.addEventListener('change', () => {
                    deps.enforceConflict(container);
                    setTimeout(deps.notifyFormChanged, 0);
                });
            });

            container
                .querySelectorAll<HTMLElement>('input:not(.hsc-target-chk), select:not(#selHscSourceUser)')
                .forEach((el) => {
                    el.addEventListener('change', () => setTimeout(deps.notifyFormChanged, 0));
                    el.addEventListener('input', () => setTimeout(deps.notifyFormChanged, 0));
                });
        })
        .catch(() => {
            container.innerHTML = '<p class="textMuted" style="padding:20px;">Failed to load users. Check server connection.</p>';
        });
}

function normalizeUsers(raw: unknown): readonly HscUserLike[] {
    if (Array.isArray(raw)) {
        return raw.filter(isUserLike);
    }
    if (raw && typeof raw === 'object' && Array.isArray((raw as { Items?: unknown }).Items)) {
        return ((raw as { Items: unknown[] }).Items).filter(isUserLike);
    }
    return [];
}

function isUserLike(v: unknown): v is HscUserLike {
    return (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { Id?: unknown }).Id === 'string' &&
        typeof (v as { Name?: unknown }).Name === 'string'
    );
}
