// Ambient declarations for the bits of the Jellyfin web shell that this
// client app reaches. The plugin is loaded via the AMD wrapper
// (`define([...], function(){…return factory})`); while running under
// happy-dom for tests we mock `ApiClient` on `globalThis` directly.
//
// This file grows as more Jellyfin globals show up. Everything here is
// `unknown` until the underlying API surface narrows to a real type.

export interface ApiClientLike {
    getUrl(name: string, params?: Record<string, unknown>): string;
    getJSON(url: string): Promise<unknown>;
    fetch(
        url: string,
        init?: { method?: string; headers?: Record<string, string>; body?: string }
    ): Promise<{ json: () => Promise<unknown>; ok: boolean }>;
    accessToken(): string;
    getCurrentUserId(): string;
    serverId(): string;
    getPluginConfiguration(pluginId: string): Promise<unknown>;
    updatePluginConfiguration(pluginId: string, config: unknown): Promise<unknown>;
    startScheduledTask(id: string): Promise<unknown>;
    getScheduledTasks(): Promise<unknown[]>;
    processPluginConfigurationUpdateResult?: (result: unknown) => void;
}

export interface DashboardLike {
    alert(msg: string): void;
    processPluginConfigurationUpdateResult?(result: unknown): void;
}

declare global {
    interface Window {
        ApiClient?: ApiClientLike;
        Dashboard?: DashboardLike;
    }
}
