/**
 * Domain: the four `enable` checkboxes (`.chkEnableTag`,
 * `.chkEnableCollection`, `.chkEnablePlaylist`,
 * `.chkEnableHomeSection`) and the override-when-active
 * (`.chkOverrideWhenActive`) swap. Each handler toggles its
 * `.tag-settings` / `.collection-settings` / `.playlist-settings` /
 * `.hse-details` block and pings `updateBadges` (and
 * `updateHseSectionAvailability` where applicable).
 *
 * Also wires `.chkTagActive` + `.lblActiveStatus` swap, the
 * `.chkAiRecentlyWatched` panel toggle, the `.selAiProvider` ollama
 * warning, the header click expand/collapse, the three URL/Local/Date
 * add buttons, the two target-help buttons, and the
 * `.btnAddMiRule`/`.btnRemoveMiRule` / `.btnRemoveGroup`
 * `.btnRunEntry` row-remove + rule helpers. Those are kept on the
 * `rowBadges` module because they too directly mutate badges or the
 * row's structural toggles. The click-driven MI helpers live in
 * {@link miFilterEvents}, saved-filters in {@link savedFilterEvents},
 * the AI test in {@link runEntry}.
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body (the
 * `<header>` / `.chk*` / `.btnAdd*` / `.btnTag/CollTargetHelp`
 * blocks at `:631-766` plus the textual `.chkTagActive` /
 * `.chkOverrideWhenActive` handlers at `:648-704`).
 */
import type { RowController } from './rowController';
import type { SetupRowEventsDeps } from './setupRowEvents';

export interface RowBadgesContext {
    readonly controller: RowController;
}

/**
 * Wire every checkbox / button that toggles per-row state (badges,
 * settings panels, AI options, header expand, row-add buttons,
 * target-help buttons). Returns nothing; side effects only on the
 * row it is called with.
 */
export function wireRowBadges(row: HTMLElement, deps: SetupRowEventsDeps, ctx: RowBadgesContext): void {
    const { controller } = ctx;

    const header = row.querySelector<HTMLElement>('.tag-header');
    const body = row.querySelector<HTMLElement>('.tag-body');
    const icon = row.querySelector<HTMLElement>('.expand-icon');
    if (header && body) {
        header.addEventListener('click', (e: Event) => {
            const ev = e as MouseEvent;
            if (ev.target instanceof Element && ev.target.closest('.header-actions')) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            if (icon) icon.innerText = isHidden ? 'expand_less' : 'expand_more';
            if (isHidden) {
                body.querySelectorAll<HTMLTextAreaElement>('textarea.txtMiValue, textarea.txtTagBlacklist').forEach((ta) => {
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                    ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden';
                });
            }
        });
    }

    const chk = row.querySelector<HTMLInputElement>('.chkTagActive');
    const lblStatus = row.querySelector<HTMLElement>('.lblActiveStatus');
    if (chk && lblStatus) {
        chk.addEventListener('change', function (this: HTMLInputElement) {
            lblStatus.textContent = this.checked ? 'Active' : 'Disabled';
            lblStatus.style.color = this.checked ? '#52B54B' : 'var(--theme-text-secondary)';
            if (this.checked) row.classList.remove('inactive');
            else row.classList.add('inactive');
            controller.updateRunGroupBtn(row);
        });
    }

    const chkEnableTag = row.querySelector<HTMLInputElement>('.chkEnableTag');
    if (chkEnableTag) {
        chkEnableTag.addEventListener('change', function (this: HTMLInputElement) {
            const tagSettings = row.querySelector<HTMLElement>('.tag-settings');
            if (tagSettings) tagSettings.style.display = this.checked ? 'block' : 'none';
            controller.updateBadges(row);
            deps.updateHseSectionAvailability(row);
        });
    }

    const chkEnableCollection = row.querySelector<HTMLInputElement>('.chkEnableCollection');
    if (chkEnableCollection) {
        chkEnableCollection.addEventListener('change', function (this: HTMLInputElement) {
            const collSettings = row.querySelector<HTMLElement>('.collection-settings');
            if (collSettings) collSettings.style.display = this.checked ? 'block' : 'none';
            controller.updateBadges(row);
            deps.updateHseSectionAvailability(row);
        });
    }

    const chkEnablePlaylist = row.querySelector<HTMLInputElement>('.chkEnablePlaylist');
    if (chkEnablePlaylist) {
        chkEnablePlaylist.addEventListener('change', function (this: HTMLInputElement) {
            const plSettings = row.querySelector<HTMLElement>('.playlist-settings');
            if (plSettings) plSettings.style.display = this.checked ? 'block' : 'none';
            controller.updateBadges(row);
        });
    }

    const chkOverride = row.querySelector<HTMLInputElement>('.chkOverrideWhenActive');
    if (chkOverride) {
        chkOverride.addEventListener('change', () => {
            controller.updateBadges(row);
        });
    }

    const chkEnableHse = row.querySelector<HTMLInputElement>('.chkEnableHomeSection');
    if (chkEnableHse) {
        chkEnableHse.addEventListener('change', function (this: HTMLInputElement) {
            const hseDetails = row.querySelector<HTMLElement>('.hse-details');
            if (hseDetails) hseDetails.style.display = this.checked ? 'block' : 'none';
            controller.updateBadges(row);
        });
    }

    const chkAiWatched = row.querySelector<HTMLInputElement>('.chkAiRecentlyWatched');
    if (chkAiWatched) {
        chkAiWatched.addEventListener('change', function (this: HTMLInputElement) {
            const opts = row.querySelector<HTMLElement>('.ai-recently-watched-options');
            if (opts) opts.style.display = this.checked ? 'block' : 'none';
        });
    }

    const selAiProv = row.querySelector<HTMLSelectElement>('.selAiProvider');
    if (selAiProv) {
        selAiProv.addEventListener('change', function (this: HTMLSelectElement) {
            const warn = row.querySelector<HTMLElement>('.ollama-experimental-warning');
            if (warn) warn.style.display = this.value === 'Ollama' ? 'flex' : 'none';
        });
    }
}
