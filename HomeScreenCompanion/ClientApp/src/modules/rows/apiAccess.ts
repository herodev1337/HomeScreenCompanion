/**
 * Single accessor for `window.ApiClient` (the Jellyfin/Emby global the
 * legacy config page reaches for direct `fetch` + `ApiClient.getUrl`
 * + `ApiClient.accessToken` calls in `.btnRunEntry`, `.btnTestUrl`,
 * `.btnTestAiSource`, `.btnChoosePoster` / `.inputPosterFile`
 * and `.btnLoadPosterUrl`).
 *
 * Before D2 the `setupRowEvents` body had six occurrences of the cast
 *
 *     (typeof window !== 'undefined')
 *         ? (window as unknown as { ApiClient?: ... }).ApiClient
 *         : undefined
 *
 * each one a slightly different structural type. Centralizing the cast
 * here keeps every fetch site free of inline `as unknown as` and gives
 * one place to swap the structural cast for a real surface later.
 *
 * Happy-dom and Node tests install the mock on `globalThis.ApiClient`
 * (mirroring `__tests__/emby-compat.test.ts`); the read reaches
 * `globalThis` first so the accessor works in every environment.
 */
import type { ApiClientLike } from '../../types/jellyfin';

/**
 * Read the live `ApiClient` global. Returns `undefined` when no client
 * is installed (server-side build, tests that don't simulate the
 * web shell). The returned value is typed as `ApiClientLike` — the
 * ambient declaration already covers every method the rows module
 * reaches for (`getUrl`, `getJSON`, `accessToken`).
 */
export function getApiClient(): ApiClientLike | undefined {
    if (typeof globalThis === 'undefined') return undefined;
    const g = globalThis as unknown as { ApiClient?: ApiClientLike };
    return g.ApiClient;
}
