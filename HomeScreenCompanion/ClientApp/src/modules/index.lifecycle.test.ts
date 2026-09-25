/// <reference types="vitest" />
// C2 view-lifecycle regression: the config page factory must not start the
// status poll at mount, must scope every per-show listener (form handlers,
// document click handlers, the beforeunload guard) to one AbortController
// that is aborted on viewhide, and must clear the poll on every hide.
//
// The factory lives in `index.ts` with AMD side-effect imports of the four
// `emby-*` custom-element modules. Those bare specifiers do not resolve in
// Vitest's happy-dom (web) transform, and config aliasing is out of this
// task's file set, so the factory is bundled from source with esbuild and
// the four externals are stubbed at evaluation time.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { build } from 'esbuild';
import path from 'node:path';

interface ListenerCall {
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject;
    options: boolean | AddEventListenerOptions | undefined;
}

const EMBY_EXTERNALS = ['emby-input', 'emby-button', 'emby-select', 'emby-checkbox'];

let cachedFactory: ((view: HTMLElement) => void) | undefined;

async function loadFactory(): Promise<(view: HTMLElement) => void> {
    if (cachedFactory) return cachedFactory;
    const result = await build({
        entryPoints: [path.resolve(__dirname, 'index.ts')],
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'browser',
        target: 'es2020',
        external: EMBY_EXTERNALS,
        logLevel: 'silent',
    });
    const code = result.outputFiles?.[0]?.text;
    if (!code) throw new Error('esbuild produced no output for index.ts');
    const moduleObj: { exports: { default?: (view: HTMLElement) => void } } = { exports: {} };
    const requireShim = (id: string): Record<string, unknown> => {
        if (EMBY_EXTERNALS.includes(id)) return {};
        throw new Error('unexpected external require: ' + id);
    };
    (globalThis as unknown as Record<string, unknown>).define = (): void => undefined;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- sandboxed CJS evaluation of the bundled factory
    new Function('module', 'exports', 'require', code)(moduleObj, moduleObj.exports, requireShim);
    if (typeof moduleObj.exports.default !== 'function') {
        throw new Error('index.ts did not export a factory');
    }
    cachedFactory = moduleObj.exports.default;
    return cachedFactory;
}

function makeApiClient() {
    return {
        accessToken: () => 'TOKEN',
        getCurrentUserId: () => 'user1',
        getUrl: (name: string, params?: Record<string, unknown>): string => {
            let url = 'https://emby.test/emby/' + name;
            if (params && Object.keys(params).length > 0) {
                url += '?' + Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join('&');
            }
            return url;
        },
        getJSON: (url: string): Promise<unknown> => {
            const u = String(url);
            if (u.includes('Users')) return Promise.resolve([]);
            if (u.includes('Items')) return Promise.resolve({ Items: [] });
            if (u.includes('Filters2')) return Promise.resolve({ Tags: [] });
            return Promise.resolve({});
        },
        getPluginConfiguration: (): Promise<Record<string, unknown>> => new Promise(() => undefined),
        updatePluginConfiguration: (): Promise<unknown> => Promise.resolve({}),
        getScheduledTasks: (): Promise<unknown[]> => Promise.resolve([]),
        startScheduledTask: (): Promise<unknown> => Promise.resolve({}),
    };
}

function makeView(): HTMLElement {
    document.body.innerHTML = `
    <div id="HomeScreenCompanionConfigPage" data-role="page">
      <form class="HomeScreenCompanionForm" id="homeScreenCompanionForm">
        <div id="tagListContainer"></div>
        <button is="emby-button" type="submit" class="btn-save" disabled><span>Save Settings</span></button>
      </form>
      <button is="emby-button" type="button" id="btnRunSync"></button>
      <div id="runSpeedDial"></div>
      <div id="runSyncMenu"></div>
    </div>`;
    return document.getElementById('HomeScreenCompanionConfigPage') as HTMLElement;
}

function signalOf(call: ListenerCall): AbortSignal | undefined {
    const opts = call.options;
    return typeof opts === 'object' && opts !== null ? opts.signal : undefined;
}

function signalBound(calls: ListenerCall[]): ListenerCall[] {
    return calls.filter((c) => signalOf(c) !== undefined);
}

function listenerName(call: ListenerCall): string | undefined {
    return (call.listener as { name?: string }).name;
}

describe('view lifecycle (C2)', () => {
    let addCalls: ListenerCall[];
    let intervalSpy: MockInstance;
    let clearIntervalSpy: MockInstance;

    beforeEach(() => {
        vi.useFakeTimers();
        addCalls = [];
        const originalAdd = EventTarget.prototype.addEventListener;
        vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(
            function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
                addCalls.push({ target: this, type, listener, options });
                originalAdd.call(this, type, listener, options);
            } as never,
        );
        const originalWindowAdd = window.addEventListener.bind(window);
        vi.spyOn(window, 'addEventListener').mockImplementation(
            function (this: Window, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
                addCalls.push({ target: window, type, listener, options });
                originalWindowAdd(type, listener, options);
            } as never,
        );
        intervalSpy = vi.spyOn(globalThis, 'setInterval');
        clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
        (window as unknown as Record<string, unknown>).ApiClient = makeApiClient();
        (window as unknown as Record<string, unknown>).Dashboard = {
            alert: vi.fn(),
            processPluginConfigurationUpdateResult: vi.fn(),
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) } as Response));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
        delete (window as unknown as Record<string, unknown>).ApiClient;
        delete (window as unknown as Record<string, unknown>).Dashboard;
    });

    it('does not start the status interval at factory mount and wires one viewhide handler', async () => {
        const factory = await loadFactory();
        const view = makeView();

        factory(view);

        expect(intervalSpy).not.toHaveBeenCalled();
        expect(addCalls.filter((c) => c.type === 'viewshow')).toHaveLength(1);
        const viewhideCalls = addCalls.filter((c) => c.type === 'viewhide');
        expect(viewhideCalls).toHaveLength(1);
        expect(viewhideCalls[0]?.options).toBeUndefined();
    });

    it('starts the poll on viewshow, aborts every show listener on viewhide, and rewires on the next show', async () => {
        const factory = await loadFactory();
        const view = makeView();
        const form = view.querySelector<HTMLElement>('.HomeScreenCompanionForm');
        expect(form).toBeTruthy();
        factory(view);

        // ── show #1 ────────────────────────────────────────────────────────
        const show1Start = addCalls.length;
        view.dispatchEvent(new Event('viewshow'));

        expect(intervalSpy).toHaveBeenCalledTimes(1);
        expect(intervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 5000);
        const intervalId1 = intervalSpy.mock.results[0]?.value as unknown;

        const show1 = signalBound(addCalls.slice(show1Start));
        const show1Signals = show1.map(signalOf);
        expect(show1Signals.length).toBeGreaterThan(0);
        expect(show1Signals.every((s) => s !== undefined && !s.aborted)).toBe(true);
        expect(show1.some((c) => c.target === form && c.type === 'input')).toBe(true);
        expect(show1.some((c) => c.target === form && c.type === 'change')).toBe(true);

        const show1DocClicks = show1.filter((c) => c.target === document && c.type === 'click');
        expect(show1DocClicks.map(listenerName).sort()).toEqual(['closeFilterDrop', 'closeSpeedDial']);
        const show1Unloads = show1.filter((c) => c.target === window && c.type === 'beforeunload');
        expect(show1Unloads).toHaveLength(1);

        // ── hide #1: interval cleared, every show listener's signal aborted ─
        view.dispatchEvent(new Event('viewhide'));

        expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId1);
        expect(show1Signals.every((s) => s?.aborted === true)).toBe(true);
        expect(signalOf(show1DocClicks[0]!)?.aborted).toBe(true);
        expect(signalOf(show1Unloads[0]!)?.aborted).toBe(true);

        // ── show #2: fresh controller + fresh interval, listeners re-added ──
        const show2Start = addCalls.length;
        view.dispatchEvent(new Event('viewshow'));

        expect(intervalSpy).toHaveBeenCalledTimes(2);
        const intervalId2 = intervalSpy.mock.results[1]?.value as unknown;

        const show2 = signalBound(addCalls.slice(show2Start));
        const show2Signals = show2.map(signalOf);
        expect(show2.length).toBe(show1.length);
        expect(show2Signals.every((s) => s !== undefined && !s.aborted)).toBe(true);
        const show2DocClicks = show2.filter((c) => c.target === document && c.type === 'click');
        expect(show2DocClicks.map(listenerName).sort()).toEqual(['closeFilterDrop', 'closeSpeedDial']);
        const show2Unloads = show2.filter((c) => c.target === window && c.type === 'beforeunload');
        expect(show2Unloads).toHaveLength(1);

        const btnSave = view.querySelector<HTMLButtonElement>('.btn-save');
        expect(btnSave).toBeTruthy();
        btnSave!.disabled = false;
        const unloadEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unloadEvent);
        expect(unloadEvent.defaultPrevented).toBe(true);

        // ── hide #2: re-wired unload guard is aborted again, not once-only ──
        view.dispatchEvent(new Event('viewhide'));

        expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId2);
        expect(show2Signals.every((s) => s?.aborted === true)).toBe(true);
        expect(signalOf(show2Unloads[0]!)?.aborted).toBe(true);

        // A second hide in a row must not throw or start/clear extra timers.
        expect(() => view.dispatchEvent(new Event('viewhide'))).not.toThrow();
        expect(intervalSpy).toHaveBeenCalledTimes(2);
        expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
    });
});
