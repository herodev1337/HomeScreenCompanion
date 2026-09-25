/// <reference types="vitest" />
//
// D3 extraction tests for `modules/toplists/modalShell.ts`. Pins the
// Escape-key + backdrop-click dismissal contract that was duplicated
// between `showManualTopListModal` (legacy.js:4876, now line ~531) and
// `showCreateTopListChooser` (legacy.js:5572, now line ~1311).
//
// The shell is intentionally minimal — it owns ONLY dismissal behavior.
// These tests cover the three close paths (Escape, backdrop, explicit
// close()) and assert the `onClose` callback fires exactly once across
// all of them (the duplication bug surface called out in the audit).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createModalShell } from './modalShell';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('createModalShell', () => {
    it('appends a backdrop overlay to the supplied container', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const shell = createModalShell({ container, onClose: vi.fn() });
        expect(container.contains(shell.modal)).toBe(true);
        expect(container.children.length).toBe(1);
    });

    it('closes on Escape and invokes onClose exactly once', () => {
        const onClose = vi.fn();
        const shell = createModalShell({ container: document.body, onClose });
        expect(document.body.contains(shell.modal)).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(document.body.contains(shell.modal)).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on backdrop click and invokes onClose exactly once', () => {
        const onClose = vi.fn();
        const shell = createModalShell({ container: document.body, onClose });

        // Direct click on the backdrop (e.target === modal).
        shell.modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // A second click after close must not re-fire onClose.
        shell.modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(document.body.contains(shell.modal)).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT close when a non-backdrop child is clicked', () => {
        const onClose = vi.fn();
        const shell = createModalShell({ container: document.body, onClose });
        const inner = document.createElement('div');
        shell.modal.appendChild(inner);

        inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(document.body.contains(shell.modal)).toBe(true);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('close() is idempotent — calling it multiple times fires onClose exactly once', () => {
        const onClose = vi.fn();
        const shell = createModalShell({ container: document.body, onClose });

        shell.close();
        shell.close();
        shell.close();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.body.contains(shell.modal)).toBe(false);
    });

    it('mixes Escape + explicit close + backdrop click across the lifecycle without double-firing', () => {
        const onClose = vi.fn();
        const shell = createModalShell({ container: document.body, onClose });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        shell.close();
        shell.modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
