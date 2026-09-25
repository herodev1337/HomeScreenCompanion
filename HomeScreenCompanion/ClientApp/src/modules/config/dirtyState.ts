// D4 (configState.ts split): dirty-state detection + the dry-run
// warning banner. Extracted from `configState.ts:190-218`
// (`updateDryRunWarning`) and `configState.ts:569-647`
// (`checkFormState`; legacy.js:3482-3514).
//
// Both helpers are written against the legacy module-scope
// `originalConfigState` ref. After D1 the factory passes that ref via
// `CheckFormStateDeps.originalConfigState`; `updateDryRunWarning` keeps
// the simpler signature (it reads the snapshot once, on demand).

import type { OriginalConfigStateRef } from '../state/state';
import type { GetUiConfigDeps } from './configSerialize';

/**
 * Toggle the dry-run warning banner.
 *
 * Looks up `#HomeScreenCompanionConfigPage .dry-run-warning` and sets
 * `style.display` based on `savedConfig.DryRunMode`. Mirrors
 * `legacy.js:3516-3528`. The legacy closure read `originalConfigState`;
 * here we take it as a parameter so the helper is testable in
 * isolation.
 *
 * @param originalConfigState  The JSON-encoded saved-config snapshot.
 *                              `null` or a parse error → the banner
 *                              hides. The `JSON.parse` failure path
 *                              is swallowed by the inner try/catch
 *                              (matching legacy behavior — losing the
 *                              banner on a corrupt snapshot is fine).
 */
export function updateDryRunWarning(originalConfigState: string | null): void {
    const view = document.querySelector('#HomeScreenCompanionConfigPage');
    if (!view || !originalConfigState) return;
    const warn = view.querySelector<HTMLElement>('.dry-run-warning');
    if (warn) {
        try {
            const savedConfig = JSON.parse(originalConfigState) as { DryRunMode?: boolean };
            warn.style.display = savedConfig.DryRunMode ? 'flex' : 'none';
        } catch {
            warn.style.display = 'none';
        }
    }
}

/**
 * Dependencies for {@link checkFormState}. The factory binds
 * `getUiConfig` with the `GetUiConfigDeps` once per view-show and
 * passes the resulting function here, so this deps object only carries
 * the per-call inputs:
 *
 *   - `view`              The config page root. When `null`, the call
 *                         is a no-op (legacy.js:3484 guards with
 *                         `!view || !originalConfigState`).
 *   - `originalConfigState` The saved snapshot ref. The dirty check
 *                         runs only when its current value is truthy.
 *   - `getUiConfig`       The pre-bound `getUiConfig` (factory wires
 *                         the `GetUiConfigDeps`).
 */
export interface CheckFormStateDeps {
    readonly view: HTMLElement | null;
    readonly originalConfigState: OriginalConfigStateRef;
    readonly getUiConfig: (view: HTMLElement, forComparison: boolean, deps: GetUiConfigDeps) => unknown;
}

/**
 * Recompute the form's dirty flag and toggle `.btn-save` accordingly
 * (legacy.js:3482-3514).
 *
 *   1. `isDirty` starts as `false`; if `JSON.stringify(getUiConfig(view, true))`
 *      differs from `originalConfigState` (or the stringify throws), it's
 *      flipped to `true`.
 *   2. The apply-manage button being enabled, the tag-manage container's
 *      `_tcHasPending` flag, or the presence of a `.tag-body[data-dirty="1"]`
 *      in the toplists container each force `isDirty = true`.
 *   3. `.btn-save` is enabled iff `isDirty`; while the sync button's
 *      `<span>` text contains "progress", the button is force-disabled
 *      regardless of `isDirty`.
 *
 * When either `view` or `originalConfigState` is missing, the call is a
 * silent no-op.
 *
 * @param deps  See {@link CheckFormStateDeps}.
 */
export function checkFormState(deps: CheckFormStateDeps): void {
    const view = deps.view;
    const originalConfigState = deps.originalConfigState.getOriginalConfigState();
    if (!view || !originalConfigState) return;

    let isDirty = false;
    try {
        const current = JSON.stringify(deps.getUiConfig(view, true, {
            hsc: { config: {} },
            savedFilters: { filters: [] },
            miUsers: { users: null },
            readRowAsConfig: () => ({}),
        }));
        isDirty = current !== originalConfigState;
    } catch {
        isDirty = true;
    }

    const btnApplyManage = view.querySelector<HTMLButtonElement>('#btnApplyManage');
    if (btnApplyManage && !btnApplyManage.disabled) isDirty = true;

    const tcContainer = view.querySelector<HTMLElement>('#tcManageContainer') as (HTMLElement & { _tcHasPending?: boolean }) | null;
    if (tcContainer && tcContainer._tcHasPending) isDirty = true;

    const tlContainer = view.querySelector<HTMLElement>('#tlContainer');
    if (tlContainer && tlContainer.querySelector('.tag-body[data-dirty="1"]')) isDirty = true;

    const btnSave = view.querySelector<HTMLButtonElement>('.btn-save');
    if (btnSave) {
        const span = btnSave.querySelector('span');
        const isSyncRunning = !!(span && (span.textContent || '').includes('progress'));
        if (isSyncRunning) {
            btnSave.disabled = true;
            btnSave.style.opacity = '0.5';
        } else {
            btnSave.disabled = !isDirty;
            btnSave.style.opacity = isDirty ? '1' : '0.5';
        }
    }
}
