/// <reference types="vitest" />
//
// Fresh structural tests for `modules/homesections/users.ts`. These
// helpers have no legacy snapshot suite, so the assertions here
// cover observable properties of the generated HTML / event handlers
// rather than diffing full strings.
//
// Conventions (mirrors `miFilters.test.ts`, `savedFilters.test.ts`):
//   - `toContain` substring assertions on key HTML fragments.
//   - `happy-dom` for `wireUserMultiSelect` (event dispatching).
//   - `buildUserMultiSelectHtml` is tested against representative
//     empty / partial / all-selected cases.

import { describe, it, expect, afterEach } from 'vitest';
import {
    buildUserMultiSelectHtml,
    wireUserMultiSelect,
    type UserOption,
} from './users';

const USERS: readonly UserOption[] = [
    { Id: 'a', Name: 'Alice' },
    { Id: 'b', Name: 'Bob' },
    { Id: 'c', Name: 'Carol' },
];

// Each `wireUserMultiSelect` adds a `document`-level click listener.
// When tests run sequentially, those listeners stay alive across
// `it()`s, so the first test's `closeUserDrop` handler still fires on
// subsequent clicks. We track and unmount every container so the
// leftover listeners self-remove (via the `wrapper.isConnected` check)
// before the next test runs.
const mounted: HTMLElement[] = [];

function trackMount(container: HTMLElement): HTMLElement {
    mounted.push(container);
    return container;
}

afterEach(() => {
    while (mounted.length > 0) {
        const c = mounted.pop();
        c?.remove();
    }
});

// ---------------------------------------------------------------------------
// `buildUserMultiSelectHtml`
// ---------------------------------------------------------------------------

describe('buildUserMultiSelectHtml', () => {
    it('renders a "No users found" placeholder when users is empty', () => {
        expect(buildUserMultiSelectHtml([], [], 'chkX')).toBe(
            '<em style="opacity:0.5">No users found</em>'
        );
        expect(buildUserMultiSelectHtml(null, [], 'chkX')).toBe(
            '<em style="opacity:0.5">No users found</em>'
        );
        expect(buildUserMultiSelectHtml(undefined, [], 'chkX')).toBe(
            '<em style="opacity:0.5">No users found</em>'
        );
    });

    it('renders one checkbox per user when no users are selected', () => {
        const html = buildUserMultiSelectHtml(USERS, [], 'chkHseUser');
        // No `checked` attribute anywhere — every checkbox is off.
        expect(html).not.toContain(' checked');
        // Label summary.
        expect(html).toContain('No users selected');
        // One row per user, each carrying the requested class.
        expect(html.match(/class="chkHseUser"/g)?.length).toBe(3);
        expect(html).toContain('value="a"');
        expect(html).toContain('value="b"');
        expect(html).toContain('value="c"');
    });

    it('marks only the requested users as checked and labels them by name', () => {
        const html = buildUserMultiSelectHtml(USERS, ['a', 'c'], 'chkHseUser');
        // The exact attribute order is `class value data-name checked`,
        // so we use a regex that allows any attributes between value="x"
        // and the trailing "checked" flag.
        expect(html).toMatch(/<input[^>]*value="a"[^>]*\bchecked\b/);
        expect(html).toContain('value="b"');
        expect(html).not.toMatch(/<input[^>]*value="b"[^>]*\bchecked\b/);
        expect(html).toMatch(/<input[^>]*value="c"[^>]*\bchecked\b/);
        // Names are joined in user-list order (Alice, Carol — not Carol, Alice).
        expect(html).toContain('Alice, Carol');
    });

    it('renders the "All users" label when every user is selected', () => {
        const html = buildUserMultiSelectHtml(USERS, ['a', 'b', 'c'], 'chkHseUser');
        expect(html).toContain('All users');
        // Three checked boxes.
        expect(html.match(/ checked/g)?.length).toBe(3);
    });

    it('uses different checkbox classes for different callers', () => {
        const hseHtml = buildUserMultiSelectHtml(USERS, [], 'chkHseUser');
        expect(hseHtml).toContain('class="chkHseUser"');
        expect(hseHtml).not.toContain('class="chkPlaylistUser"');

        const plHtml = buildUserMultiSelectHtml(USERS, [], 'chkPlaylistUser');
        expect(plHtml).toContain('class="chkPlaylistUser"');
    });

    it('HTML-escapes user names in the visible label so XSS via Name is impossible', () => {
        const evil: UserOption[] = [{ Id: 'x', Name: '<img src=x onerror=alert(1)>' }];
        const html = buildUserMultiSelectHtml(evil, [], 'chkX');
        // The user-visible <span> uses escHtml (escapes &, <, >).
        expect(html).toContain('<span>&lt;img src=x onerror=alert(1)&gt;</span>');
        // The data-name attribute uses escAttr (only escapes & and "),
        // so the literal "<img …>" is preserved inside the attribute.
        // It is not a script-tag-injection because the parser treats
        // anything inside an attribute value as a string literal.
        expect(html).toContain('data-name="<img src=x onerror=alert(1)>"');
    });

    it('escapes quotes in the checkbox value and data-name attribute', () => {
        const evil: UserOption[] = [{ Id: 'x"y', Name: 'A" & B' }];
        const html = buildUserMultiSelectHtml(evil, [], 'chkX');
        expect(html).toContain('value="x&quot;y"');
        expect(html).toContain('data-name="A&quot; &amp; B"');
        expect(html).not.toMatch(/value="x"y"/);
    });

    it('treats a null selectedIds as an empty selection', () => {
        const html = buildUserMultiSelectHtml(USERS, null, 'chkX');
        expect(html).toContain('No users selected');
        expect(html).not.toContain(' checked');
    });
});

// ---------------------------------------------------------------------------
// `wireUserMultiSelect`
// ---------------------------------------------------------------------------

/**
 * Build a user-multi-select dropdown HTML and mount it under a fresh
 * container, ready for event-wiring tests. Returns the outer
 * container (which is what `wireUserMultiSelect` expects to scan),
 * the dropdown wrapper, and direct references to the elements the
 * tests assert against.
 */
function makeMountedDropdown(selectedIds: readonly string[]): {
    container: HTMLElement;
    panel: HTMLElement;
    btn: HTMLButtonElement;
    caret: HTMLElement;
    label: HTMLElement;
} {
    const container = document.createElement('div');
    container.innerHTML = buildUserMultiSelectHtml(USERS, selectedIds, 'chkHseUser');
    document.body.appendChild(container);
    trackMount(container);

    const wrapper = container.querySelector('.hsc-user-dropdown') as HTMLElement;
    const btn    = wrapper.querySelector('.hsc-user-dropdown-btn') as HTMLButtonElement;
    const panel  = wrapper.querySelector('.filter-dropdown-panel') as HTMLElement;
    const caret  = wrapper.querySelector('.hsc-user-dropdown-caret') as HTMLElement;
    const label  = wrapper.querySelector('.hsc-user-dropdown-label') as HTMLElement;
    return { container, panel, btn, caret, label };
}

describe('wireUserMultiSelect', () => {
    it('is a no-op when the dropdown wrapper is absent', () => {
        const bare = document.createElement('div');
        bare.innerHTML = '<span>nothing here</span>';
        expect(() => wireUserMultiSelect(bare)).not.toThrow();
    });

    it('opens the panel and flips the caret when the toggle is clicked', () => {
        const { container, panel, btn, caret } = makeMountedDropdown([]);
        wireUserMultiSelect(container);

        expect(panel.classList.contains('open')).toBe(false);
        expect(caret.textContent).toBe('expand_more');

        btn.click();

        expect(panel.classList.contains('open')).toBe(true);
        expect(caret.textContent).toBe('expand_less');

        btn.click();

        expect(panel.classList.contains('open')).toBe(false);
        expect(caret.textContent).toBe('expand_more');
    });

    it('recomputes the summary label when a checkbox is toggled', () => {
        const { container, panel, label } = makeMountedDropdown(['a']);
        wireUserMultiSelect(container);

        // Initial label: only Alice is selected.
        expect(label.textContent).toBe('Alice');

        // Check Bob → partial selection becomes "Alice, Bob".
        const bobCheckbox = panel.querySelector<HTMLInputElement>('input[value="b"]')!;
        bobCheckbox.checked = true;
        bobCheckbox.dispatchEvent(new Event('change'));

        expect(label.textContent).toBe('Alice, Bob');

        // Uncheck Alice → only Bob is selected.
        const aliceCheckbox = panel.querySelector<HTMLInputElement>('input[value="a"]')!;
        aliceCheckbox.checked = false;
        aliceCheckbox.dispatchEvent(new Event('change'));

        expect(label.textContent).toBe('Bob');
    });

    it('renders "All users" once every checkbox is checked', () => {
        const { container, panel, label } = makeMountedDropdown([]);
        wireUserMultiSelect(container);

        panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
            cb.checked = true;
            cb.dispatchEvent(new Event('change'));
        });

        expect(label.textContent).toBe('All users');
    });

    it('closes the panel on a document click outside the wrapper', () => {
        const { container, panel, btn, caret } = makeMountedDropdown([]);
        wireUserMultiSelect(container);

        // Open the panel.
        btn.click();
        expect(panel.classList.contains('open')).toBe(true);

        // Click outside (on the document body, far from the wrapper).
        document.body.click();
        expect(panel.classList.contains('open')).toBe(false);
        expect(caret.textContent).toBe('expand_more');
    });

    it('does not close the panel when the click target is inside the panel', () => {
        const { container, panel, btn } = makeMountedDropdown([]);
        wireUserMultiSelect(container);

        btn.click();
        expect(panel.classList.contains('open')).toBe(true);

        // Click on a checkbox inside the panel.
        const cb = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        cb.dispatchEvent(new Event('click'));

        expect(panel.classList.contains('open')).toBe(true);
    });

    it('does not close the panel when the click target is the toggle button itself', () => {
        const { container, panel, btn } = makeMountedDropdown([]);
        wireUserMultiSelect(container);

        // First click: open. Second click on the button: stopPropagation
        // fires before the document listener, so the panel toggles
        // closed by the button's own handler, not by the document handler.
        btn.click();
        expect(panel.classList.contains('open')).toBe(true);
        btn.click();
        // Toggled back to closed by the button's listener (which ran first).
        expect(panel.classList.contains('open')).toBe(false);
    });
});
