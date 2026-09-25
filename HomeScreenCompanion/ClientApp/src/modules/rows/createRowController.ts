/**
 * `createRowController(row, deps)` returns a {@link RowController} whose
 * three updaters capture the row and the deps bag. Replaces the inner
 * closures the legacy `setupRowEvents` defined inline (`:366-1447` of
 * the pre-D2 file) and assigns back to `deps.xxx` (the old `:437-439`).
 *
 * Behavior is preserved byte-for-byte — every detail of the badge
 * builder / run-button toggle / title sync is lifted verbatim from the
 * pre-D2 file, including the nested closure `schedule-badge` helper,
 * the override-when-active checkbox swap, and the `updateBadges` call
 * at the end of `updateTagTitle`.
 */
import type { RowController } from './rowController';
import type { SetupRowEventsDeps } from './setupRowEvents';

function rowTagLower(row: HTMLElement): string {
    return (row.dataset.tag || '').toLowerCase();
}

/**
 * Compute the schedule-badge text + class for `row`. Pulled out of
 * `updateBadges` so the badge builder stays readable. The
 * `hasOverride` flag drives the "priority" copy; the active flag is
 * `isScheduleCurrentlyActive(readIntervalsFromRow(row))`.
 */
function buildScheduleBadgeHtml(
    row: HTMLElement,
    deps: SetupRowEventsDeps,
): string {
    const overrideChk = row.querySelector<HTMLInputElement>('.chkOverrideWhenActive');
    const hasSchedule = row.querySelectorAll('.date-row').length > 0;
    const hasOverride = hasSchedule && !!overrideChk && overrideChk.checked;
    const schedPriorityClass = hasOverride ? ' priority-active' : '';
    const schedActiveClass = deps.isScheduleCurrentlyActive(deps.readIntervalsFromRow(row))
        ? ' schedule-active'
        : '';
    const schedText = hasOverride ? 'Schedule priority' : 'Schedule';
    return (
        '<span class="tag-indicator schedule' +
        schedPriorityClass +
        schedActiveClass +
        '"><i class="md-icon" style="font-size:1.1em;">calendar_today</i> ' +
        schedText +
        '</span>'
    );
}

/**
 * Build the per-row controller. Returns an object whose three methods
 * are bound to the supplied `row` and read live state from the
 * supplied deps bag. All three are safe to call against arbitrary
 * DOM (they bail on missing nodes — see `updateBadges` on a row with
 * no `.badge-container`).
 */
export function createRowController(row: HTMLElement, deps: SetupRowEventsDeps): RowController {
    function updateBadges(r: HTMLElement): void {
        const container = r.querySelector('.badge-container');
        if (!container) return;

        const hasSchedule = r.querySelectorAll('.date-row').length > 0;
        const collChk = r.querySelector<HTMLInputElement>('.chkEnableCollection');
        const hseChk = r.querySelector<HTMLInputElement>('.chkEnableHomeSection');
        const tagChk = r.querySelector<HTMLInputElement>('.chkEnableTag');
        const plChk = r.querySelector<HTMLInputElement>('.chkEnablePlaylist');
        const hasCollection = !!collChk && collChk.checked;
        const hasHomeSection = !!hseChk && hseChk.checked;
        const hasTag = !!tagChk && tagChk.checked;
        const hasPlaylist = !!plChk && plChk.checked;

        const overrideChk = r.querySelector<HTMLInputElement>('.chkOverrideWhenActive');
        if (overrideChk) {
            overrideChk.disabled = !hasSchedule;
            if (!hasSchedule) overrideChk.checked = false;
            const overrideContainer = overrideChk.closest('.checkboxContainer') as HTMLElement | null;
            if (overrideContainer) overrideContainer.style.opacity = hasSchedule ? '' : '0.4';
        }

        const sourceBadge = r.querySelector<HTMLElement>('.source-badge');
        const sourceTypeEl = r.querySelector<HTMLSelectElement>('.selSourceType');
        if (sourceBadge && sourceTypeEl) {
            sourceBadge.innerHTML = deps.getSourceBadgeHtml(sourceTypeEl.value);
        }

        let html = '';
        if (hasSchedule) html += buildScheduleBadgeHtml(r, deps);
        if (hasCollection) {
            html += '<span class="tag-indicator collection"><i class="md-icon" style="font-size:1.1em;">library_books</i> Collection</span>';
        }
        if (hasHomeSection) {
            html += '<span class="tag-indicator homescreen"><i class="md-icon" style="font-size:1.1em;">home</i> Home Section</span>';
        }
        if (hasTag) {
            html += '<span class="tag-indicator tag"><i class="md-icon" style="font-size:1.1em;">label</i> Tag</span>';
        }
        if (hasPlaylist) {
            html += '<span class="tag-indicator playlist"><i class="md-icon" style="font-size:1.1em;">queue_music</i> Playlist</span>';
        }
        if (deps.topLists.tagNames.has(rowTagLower(r))) {
            html += '<span class="tag-indicator toplist"><i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List</span>';
        }
        container.innerHTML = html;
    }

    function updateRunGroupBtn(_r: HTMLElement): void {
        const runBtn = row.querySelector<HTMLButtonElement>('.btnRunEntry');
        if (!runBtn || !chk) return;
        const active = chk.checked;
        runBtn.disabled = !active;
        runBtn.style.opacity = active ? '1' : '0.4';
    }

    function updateTagTitle(_r: HTMLElement): void {
        const lbl = row.querySelector<HTMLInputElement>('.txtEntryLabel')?.value || '';
        const tag = row.querySelector<HTMLInputElement>('.txtTagName')?.value || '';
        const titleEl = row.querySelector<HTMLElement>('.tag-title');
        if (titleEl) titleEl.textContent = lbl || tag || 'New';
        const tagNameEl = row.querySelector<HTMLInputElement>('.txtTagName');
        if (tagNameEl) tagNameEl.setAttribute('placeholder', lbl);
        const collNameEl = row.querySelector<HTMLInputElement>('.txtCollectionName');
        if (collNameEl) collNameEl.setAttribute('placeholder', lbl);
        const hseCustomTitle = row.querySelector<HTMLElement>('[data-field="CustomName"]');
        if (hseCustomTitle) hseCustomTitle.setAttribute('placeholder', lbl);
        updateBadges(row);
    }

    // `chk` is the live `.chkTagActive` reference; `updateRunGroupBtn`
    // reads it on every call so the initial wiring above also gates the
    // button on the persisted state (mirrors the pre-D2 line 659).
    const chk = row.querySelector<HTMLInputElement>('.chkTagActive');

    return { updateBadges, updateRunGroupBtn, updateTagTitle };
}
