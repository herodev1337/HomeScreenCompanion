/// <reference types="vitest" />
// Emby-compatibility regression test: the AMD bundle must not crash on
// Emby's ApiClient surface (getJSON(url, signal) instead of the
// Jellyfin getJSON(name, params)) and must bind each tag row's events
// exactly once (double binding makes toggles cancel out so rows can't
// be expanded and dropdowns never open).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const BUNDLE = path.resolve(__dirname, '../../../Configuration/configPage.js');

interface EmbyLikeApiClient {
    accessToken(): string;
    getCurrentUserId(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON(url: string, signal?: unknown): Promise<unknown>;
    getPluginConfiguration(id: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(id: string, cfg: Record<string, unknown>): Promise<unknown>;
    getScheduledTasks(): Promise<unknown[]>;
    startScheduledTask(id: string): Promise<unknown>;
}

function makeEmbyApiClient(): EmbyLikeApiClient {
    const api: EmbyLikeApiClient = {
        accessToken: () => 'TOKEN',
        getCurrentUserId: () => 'user1',
        getUrl(name: string, params?: Record<string, unknown>) {
            let url = 'https://emby.test/emby/';
            url += name;
            if (params && Object.keys(params).length > 0) {
                url += '?' + Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join('&');
            }
            return url;
        },
        // Emby semantics: the 2nd arg is an AbortSignal; emby's fetchhelper
        // calls `signal.throwIfAborted()` synchronously on a truthy value.
        getJSON(url: string, signal?: unknown): Promise<unknown> {
            if (signal && typeof (signal as { throwIfAborted?: unknown }).throwIfAborted !== 'function') {
                throw new TypeError('signal.throwIfAborted is not a function');
            }
            const u = String(url);
            if (u.includes('/Users')) return Promise.resolve([]);
            if (u.includes('Items')) return Promise.resolve({ Items: [] });
            if (u.includes('Filters2')) return Promise.resolve({ Tags: [] });
            return Promise.resolve({});
        },
        getPluginConfiguration: () => Promise.resolve({ Tags: [], HomeSyncEnabled: false }),
        updatePluginConfiguration: () => Promise.resolve({}),
        getScheduledTasks: () => Promise.resolve([]),
        startScheduledTask: () => Promise.resolve({}),
    };
    return api;
}

function makeView(): HTMLElement {
    document.body.innerHTML = `
    <div id="HomeScreenCompanionConfigPage" data-role="page">
      <div class="content-primary">
        <div class="verticalSection">
          <div id="pageTabNav">
            <button class="page-tab-btn active" data-page-tab="TagCollection">Tag</button>
            <button class="page-tab-btn" data-page-tab="Settings">Settings</button>
          </div>
          <div id="tabSettings" class="page-tab-content" style="display:none;">
            <input is="emby-input" id="txtTraktClientId" />
            <textarea is="emby-textarea" id="txtAiSystemPrompt"></textarea>
            <button is="emby-button" id="btnResetAiSystemPrompt"></button>
          </div>
          <div id="tabTagCollection" class="page-tab-content">
            <form class="HomeScreenCompanionForm" id="homeScreenCompanionForm">
              <div class="sectionTitleContainer">
                <h2 class="sectionTitle">Sources</h2>
                <button is="emby-button" type="button" id="btnAddTag" class="raised button-submit">
                  <span>+ Add New Source</span>
                </button>
              </div>
              <div id="tagListContainer"></div>
            </form>
          </div>
          <div class="floating-actions">
            <button is="emby-button" type="submit" form="homeScreenCompanionForm" class="raised button-submit fab-btn btn-save">
              <i class="md-icon"></i><span>Save Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
    return document.getElementById('HomeScreenCompanionConfigPage') as HTMLElement;
}

function loadBundleFactory(): (view: HTMLElement) => void {
    const loader = (() => {
        const modules: Record<string, unknown> = {};
        return {
            define(deps: string[] | ((...a: unknown[]) => unknown), factory?: (...a: unknown[]) => unknown) {
                let fn: (...a: unknown[]) => unknown;
                let depNames: string[] = [];
                if (typeof deps === 'function') { fn = deps; } else { fn = factory!; depNames = deps as string[]; }
                const vals = depNames.map((d) => modules[d] ?? null);
                modules.__last__ = fn(...vals);
            },
            modules,
        };
    })();
    const src = fs.readFileSync(BUNDLE, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- sandboxed AMD-loader execution is the cleanest path here (see plan §0.3 A)
    new Function('define', src)(loader.define);
    return loader.modules.__last__ as (view: HTMLElement) => void;
}

describe('Emby compatibility (getJSON signature mismatch)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) } as Response));
    });

    it('viewshow does not throw on an Emby ApiClient', () => {
        (window as unknown as Record<string, unknown>).ApiClient = makeEmbyApiClient();
        (window as unknown as Record<string, unknown>).Dashboard = { alert: vi.fn() };

        const factory = loadBundleFactory();
        const view = makeView();
        factory(view);
        expect(() => view.dispatchEvent(new Event('viewshow'))).not.toThrow();
    });

    it('binds tag row events once so a new row can be expanded', () => {
        (window as unknown as Record<string, unknown>).ApiClient = makeEmbyApiClient();
        (window as unknown as Record<string, unknown>).Dashboard = { alert: vi.fn() };

        const factory = loadBundleFactory();
        const view = makeView();
        factory(view);
        view.dispatchEvent(new Event('viewshow'));

        const headerListeners: number[] = [];
        const origAdd = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type: string, ...rest: unknown[]) {
            if (type === 'click' && this instanceof Element && (this as Element).classList.contains('tag-header')) {
                headerListeners.push(1);
            }
            return origAdd.call(this, type, ...(rest as [EventListenerOrEventListenerObject, AddEventListenerOptions | boolean | undefined]));
        };

        const addBtn = view.querySelector<HTMLButtonElement>('#btnAddTag')!;
        addBtn.click();
        EventTarget.prototype.addEventListener = origAdd;

        const row = view.querySelector<HTMLElement>('.tag-row');
        expect(row).toBeTruthy();
        const body = view.querySelector<HTMLElement>('.tag-body');
        expect(body).toBeTruthy();
        expect(headerListeners).toHaveLength(1);

        view.querySelector<HTMLElement>('.tag-header')!.click();
        expect(body!.style.display).toBe('block');
    });
});
