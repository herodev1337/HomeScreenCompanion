/**
 * Domain: the row's `.drag-handle` mousedown / mouseup / touchstart
 * + the row-level `dragstart` / `dragend` handlers. Manual-sort
 * ordering via the live `.sort-placeholder` (touch pipeline places +
 * deletes; drag pipeline restores the row's display).
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body
 * (`:1219-1327`).
 */
import { getDragAfterElement } from '../dom/dom';
import type { SetupRowEventsDeps } from './setupRowEvents';

export function wireRowDrag(row: HTMLElement, deps: SetupRowEventsDeps): void {
    const handle = row.querySelector<HTMLElement>('.drag-handle');
    if (handle) {
        handle.addEventListener('mousedown', () => {
            if (localStorage.getItem('HomeScreenCompanion_SortBy') === 'Manual') {
                row.setAttribute('draggable', 'true');
            }
        });
        handle.addEventListener('mouseup', () => {
            row.setAttribute('draggable', 'false');
        });
        handle.addEventListener('touchstart', (e: Event) => {
            if (localStorage.getItem('HomeScreenCompanion_SortBy') !== 'Manual') return;
            const touchEvent = e as TouchEvent;
            touchEvent.preventDefault();
            const tagContainer = row.closest<HTMLElement>('#tagListContainer') || row.parentElement;
            if (!tagContainer) return;
            document.querySelectorAll<HTMLElement>('.tag-body').forEach((b) => { b.style.display = 'none'; });
            document.querySelectorAll<HTMLElement>('.expand-icon').forEach((i) => { i.innerText = 'expand_more'; });
            row.classList.add('dragging');

            const onTouchMove = (ev: Event) => {
                const tEv = ev as TouchEvent;
                tEv.preventDefault();
                const touch = tEv.touches[0];
                if (!touch) return;
                const afterEl = getDragAfterElement(tagContainer, touch.clientY);
                let ph = tagContainer.querySelector<HTMLElement>('.sort-placeholder');
                if (!ph) {
                    ph = document.createElement('div');
                    ph.className = 'sort-placeholder';
                }
                if (afterEl == null) {
                    if (ph.nextElementSibling !== null) tagContainer.appendChild(ph);
                } else {
                    if (ph.nextElementSibling !== afterEl) tagContainer.insertBefore(ph, afterEl);
                }
            };

            const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchCancel);
                row.classList.remove('dragging');
                const ph = tagContainer.querySelector<HTMLElement>('.sort-placeholder');
                if (ph) {
                    tagContainer.insertBefore(row, ph);
                    ph.remove();
                }
                row.classList.add('just-moved');
                setTimeout(() => { row.classList.remove('just-moved'); }, 2000);
                setTimeout(deps.checkFormState, 0);
            };

            const onTouchCancel = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchCancel);
                row.classList.remove('dragging');
                const ph = tagContainer.querySelector<HTMLElement>('.sort-placeholder');
                if (ph) ph.remove();
            };

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
            document.addEventListener('touchcancel', onTouchCancel);
        }, { passive: false });
    }

    row.addEventListener('dragstart', (e: Event) => {
        if (localStorage.getItem('HomeScreenCompanion_SortBy') !== 'Manual') {
            e.preventDefault();
            return;
        }
        document.querySelectorAll<HTMLElement>('.tag-body').forEach((b) => { b.style.display = 'none'; });
        document.querySelectorAll<HTMLElement>('.expand-icon').forEach((i) => { i.innerText = 'expand_more'; });
        row.classList.add('dragging');
        const dragEv = e as DragEvent;
        if (dragEv.dataTransfer) {
            dragEv.dataTransfer.effectAllowed = 'move';
            dragEv.dataTransfer.setData('text/plain', '');
        }
        setTimeout(() => { row.style.display = 'none'; }, 0);
    });

    row.addEventListener('dragend', () => {
        row.style.display = '';
        row.classList.remove('dragging');
        row.setAttribute('draggable', 'false');
        const existingPlaceholder = document.querySelector<HTMLElement>('.sort-placeholder');
        if (existingPlaceholder) existingPlaceholder.remove();
        row.classList.add('just-moved');
        setTimeout(() => { row.classList.remove('just-moved'); }, 2000);
        setTimeout(deps.checkFormState, 0);
    });
}
