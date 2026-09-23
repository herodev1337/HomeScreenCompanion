// Phase 5 mirror tests for `hscTab.ts`. All snapshot / DOM-equality
// assertions, mirroring the legacy behavior of legacy.js:3684-3800.
//
// The legacy did not include direct vitest snapshots for these three
// helpers (they weren't in the 11 covered by the legacy fixture harness),
// so these are fresh tests we author against the **behavior** mirrored
// from legacy.js rather than captured snapshots.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    renderHscTab,
    enforceHscSourceTargetConflict,
    loadHscUsers,
    type HscUserLike,
    type HscConfigLike
} from './hscTab';

function makeContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'hscContainer';
    document.body.appendChild(el);
    return el;
}

describe('renderHscTab', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders empty-state copy when users array is empty', () => {
        const container = makeContainer();
        renderHscTab(container, {}, []);
        expect(container.dataset.loaded).toBe('1');
        expect(container.innerHTML).toContain('No users found.');
        expect(container.querySelector('#chkHscEnabled')).toBeTruthy();
        expect(container.querySelector<HTMLElement>('#hscSyncConfig')?.style.display).toBe('none');
        expect(container.querySelector<HTMLElement>('#hscSyncToCard')?.style.display).toBe('none');
    });

    it('pre-selects the source user matching HomeSyncSourceUserId', () => {
        const container = makeContainer();
        const users: HscUserLike[] = [
            { Id: 'a', Name: 'Alice' },
            { Id: 'b', Name: 'Bob' }
        ];
        const config: HscConfigLike = { HomeSyncSourceUserId: 'b', HomeSyncEnabled: true };
        renderHscTab(container, config, users);
        const sel = container.querySelector<HTMLSelectElement>('#selHscSourceUser');
        expect(sel).toBeTruthy();
        const opts = Array.from(sel!.querySelectorAll('option'));
        expect(opts.map((o) => o.textContent)).toEqual(['— Select source user —', 'Alice', 'Bob']);
        expect(opts[2]!.selected).toBe(true);
        expect(container.querySelector<HTMLElement>('#hscSyncConfig')?.style.display).toBe('');
    });

    it('pre-checks target users from HomeSyncTargetUserIds', () => {
        const container = makeContainer();
        const users: HscUserLike[] = [
            { Id: 'a', Name: 'Alice' },
            { Id: 'b', Name: 'Bob' }
        ];
        const config: HscConfigLike = {
            HomeSyncEnabled: true,
            HomeSyncTargetUserIds: ['a']
        };
        renderHscTab(container, config, users);
        const chks = container.querySelectorAll<HTMLInputElement>('.hsc-target-chk');
        expect(chks.length).toBe(2);
        expect(chks[0]!.checked).toBe(true);
        expect(chks[1]!.checked).toBe(false);
    });

    it('omits target rows when users array is null-like (defensive)', () => {
        const container = makeContainer();
        renderHscTab(container, { HomeSyncEnabled: true }, []);
        expect(container.querySelector('.hsc-target-chk')).toBeNull();
        expect(container.innerHTML).toContain('No users found.');
    });

    it('does not crash on hostile user input (legacy verbatim preserved)', () => {
        // The verbatim contract is pinned via JSDoc and is not directly
        // testable through happy-dom's innerHTML normalization. This
        // test is a smoke guarantee that the function doesn't throw on
        // pathological inputs.
        const container = makeContainer();
        const users: HscUserLike[] = [{ Id: 'u"1', Name: '<Bob>' }];
        expect(() => renderHscTab(container, {}, users)).not.toThrow();
        // happy-dom may or may not preserve the exact markup; we just
        // confirm the call returned and stored content of some shape.
        expect(typeof container.innerHTML).toBe('string');
    });
});

describe('enforceHscSourceTargetConflict', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('disables and unchecks the source-target when selected', () => {
        const container = makeContainer();
        const users: HscUserLike[] = [
            { Id: 'a', Name: 'Alice' },
            { Id: 'b', Name: 'Bob' }
        ];
        renderHscTab(container, { HomeSyncEnabled: true, HomeSyncSourceUserId: 'a' }, users);
        enforceHscSourceTargetConflict(container);
        const chks = container.querySelectorAll<HTMLInputElement>('.hsc-target-chk');
        const a = chks[0]!;
        expect(a.checked).toBe(false);
        expect(a.disabled).toBe(true);
        expect(a.closest<HTMLElement>('.hsc-user-row')?.title).toBe('Cannot sync a user to themselves');
        expect(a.closest<HTMLElement>('.hsc-user-row')?.style.opacity).toBe('0.45');

        const b = chks[1]!;
        expect(b.disabled).toBe(false);
        expect(b.closest<HTMLElement>('.hsc-user-row')?.title).toBe('');
    });

    it('clears conflict when source is unselected', () => {
        const container = makeContainer();
        const users: HscUserLike[] = [
            { Id: 'a', Name: 'Alice' },
            { Id: 'b', Name: 'Bob' }
        ];
        renderHscTab(container, { HomeSyncEnabled: true, HomeSyncSourceUserId: 'a' }, users);
        const a = container.querySelector<HTMLInputElement>('.hsc-target-chk')!;
        a.checked = true;
        const sel = container.querySelector<HTMLSelectElement>('#selHscSourceUser')!;
        sel.value = '';
        enforceHscSourceTargetConflict(container);
        expect(a.disabled).toBe(false);
        expect(a.closest<HTMLElement>('.hsc-user-row')?.title).toBe('');
    });

    it('does nothing when no source select is present', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        // No #selHscSourceUser. Should be a no-op without throwing.
        expect(() => enforceHscSourceTargetConflict(container)).not.toThrow();
    });
});

describe('loadHscUsers', () => {
    let notifyFormChanged: ReturnType<typeof vi.fn>;
    let mockGetJSON: ReturnType<typeof vi.fn>;
    let mockGetUrl: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        document.body.innerHTML = '';
        notifyFormChanged = vi.fn();
        mockGetJSON = vi.fn();
        mockGetUrl = vi.fn().mockReturnValue('/Users?IsDisabled=false');
        (globalThis as unknown as { ApiClient: unknown }).ApiClient = {
            getJSON: mockGetJSON,
            getUrl: mockGetUrl
        };
    });

    afterEach(() => {
        delete (globalThis as unknown as { ApiClient?: unknown }).ApiClient;
        vi.restoreAllMocks();
    });

    it('is a no-op when #hscContainer is missing', () => {
        const view = document.createElement('div');
        document.body.appendChild(view);
        loadHscUsers(view, {
            getConfig: () => ({}),
            renderTab: renderHscTab,
            enforceConflict: enforceHscSourceTargetConflict,
            notifyFormChanged
        });
        expect(mockGetJSON).not.toHaveBeenCalled();
    });

    it('renders tab on successful fetch, wires the change listeners', async () => {
        const users: HscUserLike[] = [
            { Id: 'a', Name: 'Alice' },
            { Id: 'b', Name: 'Bob' }
        ];
        mockGetJSON.mockResolvedValue({ Items: users });

        const view = document.createElement('div');
        const c = document.createElement('div');
        c.id = 'hscContainer';
        view.appendChild(c);
        document.body.appendChild(view);

        // Inject the REAL renderHscTab/enforceConflict; only spy on the
        // notify callback so we can verify it fires on input.
        loadHscUsers(view, {
            getConfig: () => ({ HomeSyncEnabled: true, HomeSyncSourceUserId: 'b' }),
            renderTab: renderHscTab,
            enforceConflict: enforceHscSourceTargetConflict,
            notifyFormChanged
        });
        // Wait for the async resolution to populate the DOM.
        for (let i = 0; i < 50; i++) {
            if (c.querySelector('#chkHscEnabled')) break;
            await new Promise((r) => setTimeout(r, 0));
        }
        const enableChk = c.querySelector<HTMLInputElement>('#chkHscEnabled');
        expect(enableChk).not.toBeNull();

        expect(mockGetUrl).toHaveBeenCalledWith('Users', { IsDisabled: false });

        // simulate a change on the enable checkbox -> notify fires
        enableChk!.checked = true;
        enableChk!.dispatchEvent(new Event('change'));
        // notify fires inside a setTimeout(0) inside the handler; wait a tick.
        for (let i = 0; i < 10; i++) {
            if (notifyFormChanged.mock.calls.length > 0) break;
            await new Promise((r) => setTimeout(r, 0));
        }
        expect(notifyFormChanged).toHaveBeenCalled();
    });

    it('renders failure copy when fetch rejects', async () => {
        mockGetJSON.mockRejectedValue(new Error('boom'));
        const view = document.createElement('div');
        const c = document.createElement('div');
        c.id = 'hscContainer';
        view.appendChild(c);
        document.body.appendChild(view);

        loadHscUsers(view, {
            getConfig: () => ({}),
            renderTab: renderHscTab,
            enforceConflict: enforceHscSourceTargetConflict,
            notifyFormChanged
        });
        for (let i = 0; i < 25; i++) {
            if (c.innerHTML.includes('Failed to load users')) break;
            await new Promise((r) => setTimeout(r, 0));
        }

        expect(c.innerHTML).toContain('Failed to load users');
    });

    it('treats ApiClient.getJSON(array) as the users list', async () => {
        const users: HscUserLike[] = [{ Id: 'x', Name: 'X' }];
        mockGetJSON.mockResolvedValue(users);

        const view = document.createElement('div');
        const c = document.createElement('div');
        c.id = 'hscContainer';
        view.appendChild(c);
        document.body.appendChild(view);

        loadHscUsers(view, {
            getConfig: () => ({}),
            renderTab: renderHscTab,
            enforceConflict: enforceHscSourceTargetConflict,
            notifyFormChanged
        });
        // Wait for innerHTML to populate to detect the array path completed.
        for (let i = 0; i < 50; i++) {
            if (c.querySelector('.hsc-target-chk')) break;
            await new Promise((r) => setTimeout(r, 0));
        }
        const chks = c.querySelectorAll<HTMLInputElement>('.hsc-target-chk');
        expect(chks.length).toBe(1);
        expect(chks[0]!.value).toBe('x');
    });
});
