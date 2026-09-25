/// <reference types="vitest" />
//
// D1 regression tests for `modules/app/apiAdapter.ts`.
//
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    getApi,
    getDashboard,
    requireApi,
    ApiClientUnavailableError,
    type WindowApiClient,
} from './apiAdapter';

interface EmbyApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(url: string, signal?: unknown): Promise<T>;
    getPluginConfiguration(id: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(id: string, cfg: Record<string, unknown>): Promise<unknown>;
    getScheduledTasks(): Promise<Array<{ Id: string; Key: string }>>;
    startScheduledTask(id: string): Promise<unknown>;
    getCurrentUserId(): string;
}

function makeApiClient(): EmbyApiClient {
    return {
        accessToken: () => 'TOKEN',
        getUrl: (name: string, params?: Record<string, unknown>) => {
            let url = 'https://emby.test/emby/' + name;
            if (params && Object.keys(params).length > 0) {
                url += '?' + Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join('&');
            }
            return url;
        },
        getJSON: <T,>(_url: string): Promise<T> => Promise.resolve({} as T),
        getPluginConfiguration: () => Promise.resolve({}),
        updatePluginConfiguration: () => Promise.resolve({}),
        getScheduledTasks: () => Promise.resolve([]),
        startScheduledTask: () => Promise.resolve({}),
        getCurrentUserId: () => 'user1',
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    delete (window as unknown as Record<string, unknown>).ApiClient;
    delete (window as unknown as Record<string, unknown>).Dashboard;
});

describe('apiAdapter.getApi', () => {
    it('returns undefined when window.ApiClient is absent', () => {
        delete (window as unknown as Record<string, unknown>).ApiClient;
        const api = getApi();
        expect(api).toBeUndefined();
    });

    it('wraps the raw Emby ApiClient into a Jellyfin-shaped adapter', () => {
        (window as unknown as Record<string, unknown>).ApiClient = makeApiClient();
        const api = getApi();
        expect(api).toBeDefined();
        expect(typeof api!.accessToken).toBe('function');
        expect(typeof api!.getUrl).toBe('function');
        expect(typeof api!.getJSON).toBe('function');
        expect(typeof api!.getPluginConfiguration).toBe('function');
        expect(typeof api!.updatePluginConfiguration).toBe('function');
    });

    it('getJSON builds an absolute URL via getUrl when no absolute URL is supplied', () => {
        const raw = makeApiClient();
        const getJSONSpy = vi.spyOn(raw, 'getJSON');
        (window as unknown as Record<string, unknown>).ApiClient = raw;
        const api = getApi() as WindowApiClient;
        void api.getJSON<unknown>('Users', { IsDisabled: false });
        expect(getJSONSpy).toHaveBeenCalledTimes(1);
        const passedUrl = getJSONSpy.mock.calls[0]![0] as string;
        expect(passedUrl).toBe('https://emby.test/emby/Users?IsDisabled=false');
    });

    it('getJSON passes an already-absolute URL through unchanged', () => {
        const raw = makeApiClient();
        const getJSONSpy = vi.spyOn(raw, 'getJSON');
        (window as unknown as Record<string, unknown>).ApiClient = raw;
        const api = getApi() as WindowApiClient;
        void api.getJSON<unknown>('https://other.test/foo');
        expect(getJSONSpy).toHaveBeenCalledWith('https://other.test/foo');
    });
});

describe('apiAdapter.getDashboard', () => {
    it('returns undefined when window.Dashboard is absent', () => {
        delete (window as unknown as Record<string, unknown>).Dashboard;
        expect(getDashboard()).toBeUndefined();
    });

    it('returns window.Dashboard when present', () => {
        const db = { alert: vi.fn(), processPluginConfigurationUpdateResult: vi.fn() };
        (window as unknown as Record<string, unknown>).Dashboard = db;
        expect(getDashboard()).toBe(db);
    });
});

describe('apiAdapter.requireApi', () => {
    it('throws ApiClientUnavailableError when window.ApiClient is absent', () => {
        delete (window as unknown as Record<string, unknown>).ApiClient;
        expect(() => requireApi()).toThrow(ApiClientUnavailableError);
    });

    it('error name is ApiClientUnavailableError', () => {
        delete (window as unknown as Record<string, unknown>).ApiClient;
        try {
            requireApi();
            throw new Error('expected throw');
        } catch (e) {
            expect(e).toBeInstanceOf(ApiClientUnavailableError);
            expect((e as Error).name).toBe('ApiClientUnavailableError');
        }
    });

    it('returns the adapter when the client is present (no throw)', () => {
        (window as unknown as Record<string, unknown>).ApiClient = makeApiClient();
        const api = requireApi();
        expect(api).toBeDefined();
        expect(api.accessToken()).toBe('TOKEN');
    });
});
