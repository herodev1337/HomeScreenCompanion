/**
 * Domain: the media-info filter click handlers (delegated on the row).
 *
 *   `.btnMiHelp`                  open `#miHelpModalOverlay`.
 *   `.btnToggleAdditionalFilters` hide the toggle row + show the
 *                                 filter body + seed an empty group
 *                                 if the list is empty.
 *   `.btnPremadeFilters` /        toggle the matching `.mi-preset-panel`
 *     `.btnMySavedFilters`        or `.mi-saved-panel` (rotate the icon).
 *   `.btnAddMediaInfoFilter`      append one fresh group
 *                                 (`getMediaInfoFilterGroupHtml`).
 *   `.btnClearAllFilters`         empty the `.mediainfo-filter-list`.
 *   `.btnRemoveFilterGroup`       remove the closest group + strip the
 *                                 connector on the new head.
 *   `.btnGroupOpChoice`           AND/OR swap on the inter-group op
 *                                 (`groupOp` + style + desc).
 *   `.btnGroupInnerOpChoice`      AND/OR swap on the per-group op
 *                                 (`op` + style + desc).
 *   `.btnNotToggle`               toggle the rule's NOT state.
 *   `.mi-include-parent`          just ping `checkFormState`.
 *   `.btnAddMiRule` /             append / strip one rule row.
 *     `.btnRemoveMiRule`
 *   `.btnRemoveGroup`             `confirm` + `row.remove()`.
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body
 * (`:768-1030`, the click branch up to and including `.btnRemoveGroup`).
 */
import {
    getMediaInfoRuleHtml,
    getMediaInfoFilterGroupHtml,
} from '../filters/miFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

export function wireMiFilterEvents(row: HTMLElement, deps: SetupRowEventsDeps): void {
    row.addEventListener('click', (e: Event) => {
        const ev = e as MouseEvent;
        const clickTarget = ev.target as Element | null;
        if (!clickTarget) return;

        if (clickTarget.closest('.btnMiHelp')) {
            document.getElementById('miHelpModalOverlay')?.classList.add('modal-visible');
            return;
        }
        if (clickTarget.closest('.btnToggleAdditionalFilters')) {
            const miToggleRow = row.querySelector<HTMLElement>('.mi-toggle-row');
            const miFilterBody = row.querySelector<HTMLElement>('.mi-filter-body');
            if (miToggleRow) miToggleRow.style.display = 'none';
            if (miFilterBody) miFilterBody.style.display = 'block';
            const miList = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            if (miList && miList.querySelectorAll('.mediainfo-filter-group').length === 0) {
                miList.insertAdjacentHTML(
                    'beforeend',
                    getMediaInfoFilterGroupHtml({ Operator: 'AND', Criteria: [], GroupOperator: 'AND' }, 0, true, deps.miFilterDeps),
                );
            }
            return;
        }

        const groupOpBtn = clickTarget.closest('.btnGroupOpChoice');
        if (groupOpBtn) {
            const newOp = (groupOpBtn as HTMLElement).dataset.value || 'AND';
            const group = groupOpBtn.closest<HTMLElement>('.mediainfo-filter-group');
            if (group) {
                group.dataset.groupOp = newOp;
                group.querySelectorAll<HTMLElement>('.btnGroupOpChoice').forEach((b) => {
                    const active = (b.dataset.value || '') === newOp;
                    b.style.background = active
                        ? (newOp === 'AND' ? 'rgba(0,164,220,0.75)' : 'rgba(220,120,0,0.75)')
                        : 'transparent';
                    b.style.color = active ? '#fff' : '';
                });
                const desc = group.querySelector<HTMLElement>('.group-op-desc');
                if (desc) desc.textContent = newOp === 'AND' ? 'Both groups must match' : 'Either group is enough';
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        const innerOpBtn = clickTarget.closest('.btnGroupInnerOpChoice');
        if (innerOpBtn) {
            const newOp = (innerOpBtn as HTMLElement).dataset.value || 'AND';
            const group = innerOpBtn.closest<HTMLElement>('.mediainfo-filter-group');
            if (group) {
                group.dataset.op = newOp;
                group.querySelectorAll<HTMLElement>('.btnGroupInnerOpChoice').forEach((b) => {
                    const active = (b.dataset.value || '') === newOp;
                    b.style.background = active
                        ? (newOp === 'AND' ? 'rgba(0,164,220,0.75)' : 'rgba(220,120,0,0.75)')
                        : 'transparent';
                    b.style.color = active ? '#fff' : '';
                });
                const desc = group.querySelector<HTMLElement>('.inner-op-desc');
                if (desc) desc.textContent = newOp === 'AND' ? 'All rules must match' : 'Any rule is enough';
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        const notBtn = clickTarget.closest('.btnNotToggle');
        if (notBtn) {
            const active = (notBtn as HTMLElement).dataset.not === '1';
            const nextActive = !active;
            (notBtn as HTMLElement).dataset.not = nextActive ? '1' : '0';
            (notBtn as HTMLElement).style.background = nextActive ? 'rgba(200,50,50,0.75)' : 'transparent';
            (notBtn as HTMLElement).style.color = nextActive ? '#fff' : '';
            (notBtn as HTMLElement).style.border = nextActive
                ? '1px solid rgba(200,50,50,0.6)'
                : '1px solid rgba(128,128,128,0.4)';
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (clickTarget.closest('.mi-include-parent')) {
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (clickTarget.closest('.btnAddMediaInfoFilter')) {
            const list = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            if (list) {
                const idx = list.querySelectorAll('.mediainfo-filter-group').length;
                list.insertAdjacentHTML(
                    'beforeend',
                    getMediaInfoFilterGroupHtml(
                        { Operator: 'AND', Criteria: [], GroupOperator: 'AND' },
                        idx,
                        false,
                        deps.miFilterDeps,
                    ),
                );
            }
            return;
        }

        if (clickTarget.closest('.btnClearAllFilters')) {
            const list = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            if (list) list.innerHTML = '';
            return;
        }

        if (clickTarget.closest('.btnRemoveFilterGroup')) {
            const group = clickTarget.closest('.mediainfo-filter-group');
            if (group) group.remove();
            const miList = row.querySelector<HTMLElement>('.mediainfo-filter-list');
            const firstGroup = miList?.querySelector<HTMLElement>('.mediainfo-filter-group');
            if (firstGroup) {
                const conn = firstGroup.querySelector<HTMLElement>('.mi-group-connector');
                if (conn) conn.remove();
            }
            return;
        }

        if (clickTarget.closest('.btnAddMiRule')) {
            const group = clickTarget.closest('.mediainfo-filter-group');
            const rulesList = group?.querySelector<HTMLElement>('.mi-rules-list');
            if (rulesList) {
                rulesList.insertAdjacentHTML('beforeend', getMediaInfoRuleHtml('', deps.miFilterDeps));
            }
            return;
        }

        if (clickTarget.closest('.btnRemoveMiRule')) {
            const miRule = clickTarget.closest('.mi-rule');
            if (miRule) miRule.remove();
            return;
        }

        if (clickTarget.closest('.btnRemoveGroup')) {
            const removeConfirmed = typeof confirm === 'function'
                ? confirm('Delete this tag group?')
                : window.confirm('Delete this tag group?');
            if (removeConfirmed) row.remove();
            return;
        }

        const premadeBtn = clickTarget.closest('.btnPremadeFilters');
        if (premadeBtn) {
            const panel = premadeBtn.closest('.source-mediainfo-container')?.querySelector<HTMLElement>('.mi-preset-panel');
            if (panel) {
                const open = panel.style.display === 'none';
                panel.style.display = open ? '' : 'none';
                const iconEl = premadeBtn.querySelector<HTMLElement>('.mi-expand-icon');
                if (iconEl) iconEl.style.transform = open ? 'rotate(180deg)' : '';
            }
            return;
        }
    });
}
