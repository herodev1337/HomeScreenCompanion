/**
 * Domain: the saved-filter / preset click handlers (delegated on the
 * row).
 *
 *   `.btnMySavedFilters`        toggle the saved panel (icon rotation
 *                               handled by `miFilterEvents`'s
 *                               matching branch when present; here we
 *                               own the `.btnApplyMiPreset` family).
 *   `.btnConfirmSaveFilter`     validate name + non-empty filters,
 *                               push onto `deps.savedFilters.filters`,
 *                               refresh saved panels + persist.
 *   `.btnApplyMySavedFilter`    splice the saved group's filters into
 *                               `.mediainfo-filter-list`.
 *   `.btnDeleteMySavedFilter`   splice + refresh + persist.
 *   `.btnApplyMiPreset`         replace filters with the preset's
 *                               `build()` output.
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body
 * (`:826-913`). `.btnPremadeFilters` lives in `miFilterEvents.ts`
 * because both files collide on the row's `click` listener and we keep
 * each click decision in one place; saved-filter modules own the
 * save/apply/delete/mi-preset branches above.
 */
import {
    readMiFiltersFromContainer,
    getMediaInfoFilterGroupHtml,
} from '../filters/miFilters';
import type { SetupRowEventsDeps } from './setupRowEvents';

export function wireSavedFilterEvents(row: HTMLElement, deps: SetupRowEventsDeps): void {
    row.addEventListener('click', (e: Event) => {
        const ev = e as MouseEvent;
        const clickTarget = ev.target as Element | null;
        if (!clickTarget) return;

        const mySavedBtn = clickTarget.closest('.btnMySavedFilters');
        if (mySavedBtn) {
            const savedPanel = mySavedBtn.closest('.source-mediainfo-container')?.querySelector<HTMLElement>('.mi-saved-panel');
            if (savedPanel) {
                const open = savedPanel.style.display === 'none';
                savedPanel.style.display = open ? '' : 'none';
                const iconEl = mySavedBtn.querySelector<HTMLElement>('.mi-expand-icon');
                if (iconEl) iconEl.style.transform = open ? 'rotate(180deg)' : '';
            }
            return;
        }

        const confirmSaveBtn = clickTarget.closest('.btnConfirmSaveFilter');
        if (confirmSaveBtn) {
            const miContainer = confirmSaveBtn.closest('.source-mediainfo-container');
            if (miContainer) {
                const nameInput = miContainer.querySelector<HTMLInputElement>('.txtSaveFilterName');
                const name = nameInput?.value.trim() || '';
                if (!name) {
                    nameInput?.focus();
                    return;
                }
                const filters = readMiFiltersFromContainer(miContainer);
                if (filters.length === 0) {
                    nameInput?.focus();
                    return;
                }
                deps.savedFilters.filters.push({ Name: name, Filters: filters });
                if (nameInput) nameInput.value = '';
                deps.refreshMySavedFiltersPanels(deps.savedFilters.filters);
                deps.saveSavedFiltersNow();
            }
            return;
        }

        const applySavedBtn = clickTarget.closest('.btnApplyMySavedFilter');
        if (applySavedBtn) {
            const idx = parseInt((applySavedBtn as HTMLElement).dataset.index || '-1', 10);
            const sf = deps.savedFilters.filters[idx];
            if (sf) {
                const savedList = applySavedBtn
                    .closest('.source-mediainfo-container')
                    ?.querySelector<HTMLElement>('.mediainfo-filter-list');
                if (savedList) {
                    savedList.innerHTML = sf.Filters.map((f, i) =>
                        getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps),
                    ).join('');
                }
                const savedPanel = applySavedBtn.closest<HTMLElement>('.mi-saved-panel');
                if (savedPanel) savedPanel.style.display = 'none';
                setTimeout(deps.checkFormState, 0);
            }
            return;
        }

        const deleteSavedBtn = clickTarget.closest('.btnDeleteMySavedFilter');
        if (deleteSavedBtn) {
            const idx = parseInt((deleteSavedBtn as HTMLElement).dataset.index || '-1', 10);
            if (idx >= 0) deps.savedFilters.filters.splice(idx, 1);
            deps.refreshMySavedFiltersPanels(deps.savedFilters.filters);
            deps.saveSavedFiltersNow();
            return;
        }

        const applyPresetBtn = clickTarget.closest('.btnApplyMiPreset');
        if (applyPresetBtn) {
            const dataset = (applyPresetBtn as HTMLElement).dataset.preset || '';
            const idxParts = dataset.split(',');
            const catIdx = parseInt(idxParts[0] || '-1', 10);
            const presetIdx = parseInt(idxParts[1] || '-1', 10);
            const cat = deps.miPresets[catIdx];
            const preset = cat?.presets[presetIdx];
            if (preset) {
                const presetFilters = preset.build();
                const presetList = applyPresetBtn
                    .closest('.source-mediainfo-container')
                    ?.querySelector<HTMLElement>('.mediainfo-filter-list');
                if (presetList) {
                    presetList.innerHTML = presetFilters.map((f, i) =>
                        getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps),
                    ).join('');
                }
                const presetPanel = applyPresetBtn.closest<HTMLElement>('.mi-preset-panel');
                if (presetPanel) presetPanel.style.display = 'none';
                setTimeout(deps.checkFormState, 0);
            }
            return;
        }
    });
}
