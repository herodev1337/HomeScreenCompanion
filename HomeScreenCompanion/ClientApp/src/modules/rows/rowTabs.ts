/**
 * Domain: `.tag-tab[data-tab="…"]` click handler. Toggles the matching
 * `.general-tab` / `.tagname-tab` / `.schedule-tab` / `.collection-tab`
 * / `.advanced-tab` / `.homescreen-tab` / `.playlist-tab` block, swaps
 * the active-tab style (opacity + bottom-border-color), lazily calls
 * `deps.initHomeSectionTab` / `deps.initPlaylistTab` when the
 * homescreen / playlist sub-tabs become visible, and auto-resizes
 * every `textarea.txtMiValue` / `textarea.txtTagBlacklist` in the
 * activated block.
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body
 * (`:441-475`).
 */
import type { SetupRowEventsDeps } from './setupRowEvents';

export function wireRowTabs(row: HTMLElement, deps: SetupRowEventsDeps): void {
    row.querySelectorAll<HTMLElement>('.tag-tab').forEach((tab) => {
        tab.addEventListener('click', function (this: HTMLElement) {
            row.querySelectorAll<HTMLElement>('.tag-tab').forEach((t) => {
                t.style.opacity = '0.6';
                t.style.borderBottomColor = 'transparent';
            });
            this.style.opacity = '1';
            this.style.borderBottomColor = '#52B54B';
            const target = this.getAttribute('data-tab') || '';
            const generalTab = row.querySelector<HTMLElement>('.general-tab');
            const tagTab = row.querySelector<HTMLElement>('.tagname-tab');
            const schedTab = row.querySelector<HTMLElement>('.schedule-tab');
            const collTab = row.querySelector<HTMLElement>('.collection-tab');
            const advTab = row.querySelector<HTMLElement>('.advanced-tab');
            const hseTab = row.querySelector<HTMLElement>('.homescreen-tab');
            const plTab = row.querySelector<HTMLElement>('.playlist-tab');
            if (generalTab) generalTab.style.display = target === 'general' ? 'block' : 'none';
            if (tagTab) tagTab.style.display = target === 'tag' ? 'block' : 'none';
            if (schedTab) schedTab.style.display = target === 'schedule' ? 'block' : 'none';
            if (collTab) collTab.style.display = target === 'collection' ? 'block' : 'none';
            if (advTab) advTab.style.display = target === 'advanced' ? 'block' : 'none';
            if (hseTab) hseTab.style.display = target === 'homescreen' ? 'block' : 'none';
            if (plTab) plTab.style.display = target === 'playlist' ? 'block' : 'none';
            if (target === 'homescreen') deps.initHomeSectionTab(row);
            if (target === 'playlist') deps.initPlaylistTab(row);
            const activeTabEl = row.querySelector<HTMLElement>('.' + target + '-tab');
            if (activeTabEl) {
                activeTabEl.querySelectorAll<HTMLTextAreaElement>('textarea.txtMiValue, textarea.txtTagBlacklist').forEach((ta) => {
                    ta.style.height = 'auto';
                    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                    ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden';
                });
            }
        });
    });
}
