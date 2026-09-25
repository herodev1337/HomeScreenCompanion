/**
 * Phase 6 (D3): the Escape-key + backdrop-click dismissal logic that
 * was duplicated between `showManualTopListModal` (legacy.js:4876) and
 * `showCreateTopListChooser` (legacy.js:5572). One implementation,
 * one close-callback contract: {@link createModalShell} returns
 * `{ modal, close }`; pressing Escape, clicking the backdrop, or
 * calling `close()` directly all funnel through the same idempotent
 * `close()` so the `onClose` callback is invoked at most once.
 *
 * Behavior contract (matches legacy verbatim):
 *   - the backdrop is the overlay div itself (`modal`), the inner box
 *     is a child; clicking a non-backdrop child does NOT close;
 *   - `close()` removes the keydown listener, removes the modal from
 *     the DOM, and invokes `onClose()` exactly once;
 *   - calling `close()` after the modal is already gone is a no-op.
 */

export interface ModalShellOptions {
    /** The element the modal is appended to (e.g. `document.body`). */
    readonly container: HTMLElement;
    /** Fired exactly once on close (Escape, backdrop, or explicit `close()`). */
    readonly onClose: () => void;
}

export interface ModalShell {
    /** The overlay backdrop `<div>` appended to `container`. */
    readonly modal: HTMLElement;
    /** Idempotent close — removes listeners, removes DOM, fires `onClose` once. */
    readonly close: () => void;
}

/**
 * Create a modal shell: an overlay backdrop appended to `container`,
 * with Escape-key and backdrop-click dismissal both routed through a
 * single idempotent `close()` that fires `onClose()` exactly once.
 *
 * The shell is intentionally minimal — it owns ONLY the dismissal
 * behavior. Callers keep rendering their own content via
 * `shell.modal.innerHTML = …` and wire their own close/cancel buttons
 * to `shell.close()`.
 */
export function createModalShell(opts: ModalShellOptions): ModalShell {
    const { container, onClose } = opts;

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;';
    container.appendChild(modal);

    let closed = false;

    function onEsc(e: KeyboardEvent): void {
        if (e.key === 'Escape') close();
    }

    function close(): void {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onEsc);
        modal.remove();
        onClose();
    }

    document.addEventListener('keydown', onEsc);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    return { modal, close };
}
