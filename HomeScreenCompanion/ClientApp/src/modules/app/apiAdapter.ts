/**
 * ApiClient + Dashboard adapter for the legacy config page factory.
 *
 * Lifted from `modules/index.ts:649-702`. Owns the four window-level
 * interface declarations (`WindowApiClient`, `RawEmbyApiClient`,
 * `WindowDashboard`, `WindowGlobals`) plus the two accessors that read
 * `window.ApiClient` / `window.Dashboard`.
 *
 * Background — the modules below consume a Jellyfin-shaped client where
 * `getJSON(name, params)` takes a route name plus a query-params object.
 * Emby's `ApiClient.getJSON(url, signal)` treats the second argument as an
 * AbortSignal instead (fetchhelper calls `signal.throwIfAborted()`
 * synchronously), so passing params straight through throws synchronously
 * and breaks the whole viewshow handler. {@link getApi} therefore wraps
 * the raw `window.ApiClient` in an adapter that builds absolute URLs via
 * `getUrl` and drops the params argument. Absolute URLs (already produced
 * by `getUrl`) pass through unchanged.
 *
 * Two accessors:
 *   - {@link getApi} returns the adapter or `undefined` when
 *     `window.ApiClient` is absent. Most callers use it with the legacy
 *     `if (!api) return;` guard.
 *   - {@link requireApi} returns the adapter or throws the typed
 *     {@link ApiClientUnavailableError}. Use it where the caller used to
 *     swallow a missing client with `Promise.resolve({} as T)` — that
 *     silent fallback masks the real problem (the host page is on a build
 *     of Emby that has not yet injected the global), so the new behavior
 *     surfaces it instead.
 */

/**
 * Thrown by {@link requireApi} when `window.ApiClient` is absent. The
 * host page has not yet injected the Emby `ApiClient` global, so any
 * caller that needed it must either retry after `viewshow` resolves or
 * route through the optional {@link getApi}.
 */
export class ApiClientUnavailableError extends Error {
    constructor(message: string = 'ApiClient unavailable') {
        super(message);
        this.name = 'ApiClientUnavailableError';
    }
}

/**
 * Jellyfin-shaped {@link WindowApiClient}. The contract every consumer
 * module was written against.
 */
export interface WindowApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(name: string, params?: Record<string, unknown>): Promise<T>;
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
    getScheduledTasks(): Promise<Array<{ Id: string; Key: string }>>;
    startScheduledTask(id: string): Promise<unknown>;
    getCurrentUserId(): string;
}

/**
 * Raw Emby `ApiClient` surface (the actual `window.ApiClient` global).
 * The shape of `getJSON` differs from the Jellyfin contract: the second
 * argument is an `AbortSignal`, not a query-params object.
 */
export interface RawEmbyApiClient {
    accessToken(): string;
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON<T = unknown>(url: string, signal?: unknown): Promise<T>;
    getPluginConfiguration(pluginId: string): Promise<Record<string, unknown>>;
    updatePluginConfiguration(pluginId: string, config: Record<string, unknown>): Promise<unknown>;
    getScheduledTasks(): Promise<Array<{ Id: string; Key: string }>>;
    startScheduledTask(id: string): Promise<unknown>;
    getCurrentUserId(): string;
}

export interface WindowDashboard {
    alert(message: string): void;
    processPluginConfigurationUpdateResult(result: unknown): void;
}

interface WindowGlobals {
    ApiClient?: RawEmbyApiClient;
    Dashboard?: WindowDashboard;
}

/**
 * Build a Jellyfin-shaped adapter around `window.ApiClient`. Returns
 * `undefined` when the global is absent — callers that want a hard
 * failure on missing client should use {@link requireApi}.
 */
export function getApi(): WindowApiClient | undefined {
    const raw = (window as unknown as WindowGlobals).ApiClient;
    if (!raw) return undefined;
    return {
        accessToken: () => raw.accessToken(),
        getUrl: (name, params) => raw.getUrl(name, params),
        getJSON: <T,>(name: string, params?: Record<string, unknown>) => {
            const url = typeof name === 'string' && /^https?:\/\//i.test(name)
                ? name
                : raw.getUrl(name, params);
            return raw.getJSON<T>(url);
        },
        getPluginConfiguration: (pluginId) => raw.getPluginConfiguration(pluginId),
        updatePluginConfiguration: (pluginId, config) => raw.updatePluginConfiguration(pluginId, config),
        getScheduledTasks: () => raw.getScheduledTasks(),
        startScheduledTask: (id) => raw.startScheduledTask(id),
        getCurrentUserId: () => raw.getCurrentUserId(),
    };
}

/**
 * {@link getApi} with a hard failure: throws
 * {@link ApiClientUnavailableError} when `window.ApiClient` is absent.
 * Use this where the caller used to silently return
 * `Promise.resolve({} as T)` — the silent fallback masked missing-client
 * bugs, so we now surface them.
 */
export function requireApi(): WindowApiClient {
    const api = getApi();
    if (!api) throw new ApiClientUnavailableError();
    return api;
}

/**
 * Read `window.Dashboard`, or `undefined` when absent.
 */
export function getDashboard(): WindowDashboard | undefined {
    return (window as unknown as WindowGlobals).Dashboard;
}
