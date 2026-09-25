/**
 * Domain: the delegated `change` handler on the row, focused on the
 * `.selSourceType` branch (and the sibling `.selMiProperty` /
 * `.selMiUser` / `.selMiValue` branches that mutate the
 * `MediaType:Episode` parent-include chip and run the
 * `updateHseSectionAvailability` + `checkFormState` ping). Date-type
 * and start/end-month changes are also handled here because they too
 * ride the same row-level `change` event.
 *
 * The source-type branch reveals the matching `.source-external-container` /
 * `.source-local-container` / `.source-mediainfo-container` /
 * `.source-ai-container`, swaps the source-type hint, refreshes the
 * `.mi-presets-section` / `.mi-limit-row` / `.mi-help-btn-row` /
 * `.mi-toggle-row` / `.mi-filter-body` visibility, seeds an empty
 * filter group when switching to `MediaInfo`, repaints the
 * `.source-badge` via `controller.updateBadges`, and finally pings
 * the HSE-availability + form-state callbacks.
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body
 * (`:477-626`).
 */
import {
    getMiHintHtml,
    getMiValueHtml,
    getMediaInfoFilterGroupHtml,
} from '../filters/miFilters';
import { getLocalRowHtml } from '../filters/rows';
import type { RowController } from './rowController';
import type { SetupRowEventsDeps } from './setupRowEvents';

export interface SourceTypeChangeContext {
    readonly controller: RowController;
}

/**
 * Wire the row-level delegated `change` listener responsible for
 * `.selSourceType`, `.selMiProperty`, `.selMiUser`, `.selMiValue`,
 * `.selDateType`, `.selStartMonth` / `.selEndMonth`. Appends one
 * listener to `row`.
 */
export function wireSourceTypeChange(
    row: HTMLElement,
    deps: SetupRowEventsDeps,
    ctx: SourceTypeChangeContext,
): void {
    const { controller } = ctx;

    row.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target || !target.classList) return;
        const classes = target.classList;

        if (classes.contains('selSourceType')) {
            const type = (target as HTMLSelectElement).value;
            const extC = row.querySelector<HTMLElement>('.source-external-container');
            const locC = row.querySelector<HTMLElement>('.source-local-container');
            const miC = row.querySelector<HTMLElement>('.source-mediainfo-container');
            const aiC = row.querySelector<HTMLElement>('.source-ai-container');
            if (extC) extC.style.display = type === 'External' ? 'block' : 'none';
            if (locC) locC.style.display = (type === 'LocalCollection' || type === 'LocalPlaylist') ? 'block' : 'none';
            if (miC) miC.style.display = (type && type !== '') ? 'block' : 'none';
            if (aiC) aiC.style.display = type === 'AI' ? 'block' : 'none';

            const hint = row.querySelector<HTMLElement>('.source-type-hint');
            if (hint) {
                const hints: Record<string, string> = {
                    'External':        'Use an external list to tag, or create a collection, from the items that match your library.',
                    'LocalCollection': 'Every item in the selected collection(s) gets the configured tag or is added to a new collection. You can also use this to create a curated list of selected collections as a home screen section.',
                    'LocalPlaylist':   'Every item in the selected playlist(s) gets the configured tag or is added to a new collection.',
                    'MediaInfo':       'Filter your own library to select which movies or shows to tag or create a collection of. This is also known as a Smart Playlist.',
                    'AI':              'Use AI to create a list. Write your prompt and the AI will build a list based on it.',
                };
                hint.textContent = hints[type] || '';
            }

            const isMi = type === 'MediaInfo';
            const miLimitRow = row.querySelector<HTMLElement>('.mi-limit-row');
            const miToggleRow = row.querySelector<HTMLElement>('.mi-toggle-row');
            const miFilterBody = row.querySelector<HTMLElement>('.mi-filter-body');
            const miHelpBtnRow = row.querySelector<HTMLElement>('.mi-help-btn-row');
            const miPresetsSection = row.querySelector<HTMLElement>('.mi-presets-section');
            if (miPresetsSection) miPresetsSection.style.display = isMi ? 'block' : 'none';
            if (miLimitRow) miLimitRow.style.display = isMi ? 'flex' : 'none';
            if (miHelpBtnRow) miHelpBtnRow.style.display = isMi ? 'none' : 'flex';
            if (isMi) {
                if (miToggleRow) miToggleRow.style.display = 'none';
                if (miFilterBody) miFilterBody.style.display = 'block';
            } else if (type) {
                if (miToggleRow) miToggleRow.style.display = 'block';
                if (miFilterBody) miFilterBody.style.display = 'none';
            }
            if (type) {
                const miList = row.querySelector<HTMLElement>('.mediainfo-filter-list');
                if (miList && isMi && miList.querySelectorAll('.mediainfo-filter-group').length === 0) {
                    miList.insertAdjacentHTML(
                        'beforeend',
                        getMediaInfoFilterGroupHtml({ Operator: 'AND', Criteria: [], GroupOperator: 'AND' }, 0, true, deps.miFilterDeps),
                    );
                }
            }

            if (type === 'LocalCollection' || type === 'LocalPlaylist') {
                const localListContainer = row.querySelector<HTMLElement>('.local-list-container');
                const localTypeLabel = row.querySelector<HTMLElement>('.local-type-label');
                if (localListContainer) {
                    localListContainer.innerHTML = getLocalRowHtml(type, '', 0);
                }
                if (localTypeLabel) {
                    localTypeLabel.textContent = type === 'LocalPlaylist' ? 'Select Playlists' : 'Select Collections';
                }
            }
            controller.updateBadges(row);
            deps.updateHseSectionAvailability(row);
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selMiProperty')) {
            const miRule = target.closest('.mi-rule');
            if (miRule) {
                const valueWrapper = miRule.querySelector<HTMLElement>('.mi-value-wrapper');
                if (valueWrapper) {
                    valueWrapper.innerHTML = getMiValueHtml(
                        (target as HTMLSelectElement).value,
                        '',
                        '',
                        '',
                        deps.miFilterDeps,
                    );
                }
                const existingHint = miRule.querySelector<HTMLElement>('.mi-rule-hint');
                if (existingHint) {
                    existingHint.outerHTML = getMiHintHtml((target as HTMLSelectElement).value);
                }
            }
            deps.updateHseSectionAvailability(row);
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selMiUser')) {
            deps.updateHseSectionAvailability(row);
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selMiValue')) {
            const miRule = target.closest('.mi-rule');
            if (miRule) {
                const propEl = miRule.querySelector<HTMLSelectElement>('.selMiProperty');
                const prop = propEl?.value || '';
                if (prop === 'MediaType') {
                    const incParent = miRule.querySelector<HTMLElement>('.mi-include-parent');
                    if (incParent) {
                        incParent.style.display = (target as HTMLSelectElement).value === 'Episode'
                            ? 'inline-flex'
                            : 'none';
                    }
                }
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selDateType')) {
            const dateRow = target.closest('.date-row');
            if (dateRow) {
                const type = (target as HTMLSelectElement).value;
                const specific = dateRow.querySelector<HTMLElement>('.inputs-specific');
                const annual = dateRow.querySelector<HTMLElement>('.inputs-annual');
                const weekly = dateRow.querySelector<HTMLElement>('.inputs-weekly');
                if (specific) specific.style.display = type === 'SpecificDate' ? 'flex' : 'none';
                if (annual) annual.style.display = type === 'EveryYear' ? 'flex' : 'none';
                if (weekly) weekly.style.display = type === 'Weekly' ? 'flex' : 'none';
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        if (classes.contains('selStartMonth') || classes.contains('selEndMonth')) {
            const isStart = classes.contains('selStartMonth');
            const dateRow = target.closest('.date-row');
            if (dateRow) {
                const month = parseInt((target as HTMLSelectElement).value, 10);
                const maxDay = deps.getMaxDays(month);
                const daySelect = dateRow.querySelector<HTMLSelectElement>(isStart ? '.selStartDay' : '.selEndDay');
                if (daySelect) {
                    const currentDay = Math.min(parseInt(daySelect.value, 10), maxDay);
                    daySelect.innerHTML = deps.getDayOptions(currentDay, maxDay);
                }
            }
            setTimeout(deps.checkFormState, 0);
            return;
        }

        setTimeout(deps.checkFormState, 0);
    });
}
