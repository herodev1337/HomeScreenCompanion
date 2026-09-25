/**
 * Domain: the row's poster controls — `.btnChoosePoster` opens the
 * hidden `.inputPosterFile` picker; `.inputPosterFile` reads the
 * chosen file as a data URL, POSTs the base64 to
 * `HomeScreenCompanion/UploadCollectionImage`; `.btnRemovePoster`
 * clears the hidden path + preview; `.btnLoadPosterUrl` POSTs the
 * remote URL to `HomeScreenCompanion/FetchCollectionImageFromUrl`.
 *
 * Replaces six legacy `ApiClient` casts with one call to
 * {@link getApiClient}. Behavior matches the pre-D2 body byte-for-byte
 * including the `X-Emby-Token` header swap (`SetupRowEventsDeps`
 * tokens from older Emby builds don't carry the prefix).
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body
 * (`:1329-1444`).
 */
import { getApiClient } from './apiAccess';
import type { SetupRowEventsDeps } from './setupRowEvents';

export function wirePosterUpload(row: HTMLElement, deps: SetupRowEventsDeps): void {
    const btnChoosePoster = row.querySelector<HTMLButtonElement>('.btnChoosePoster');
    const inputPosterFile = row.querySelector<HTMLInputElement>('.inputPosterFile');
    if (btnChoosePoster && inputPosterFile) {
        btnChoosePoster.addEventListener('click', () => {
            inputPosterFile.click();
        });
        inputPosterFile.addEventListener('change', () => {
            const file = inputPosterFile.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (re: ProgressEvent<FileReader>) => {
                const dataUrl = re.target?.result;
                if (typeof dataUrl !== 'string') return;
                const base64 = dataUrl.split(',')[1] || '';
                const img = row.querySelector<HTMLImageElement>('.poster-preview-img');
                if (img) {
                    img.src = dataUrl;
                    img.style.display = 'block';
                }
                const apiClient = getApiClient();
                if (!apiClient) return;
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                const token = apiClient.accessToken();
                if (token) headers['X-Emby-Token'] = token;
                const hiddenPath = row.querySelector<HTMLInputElement>('.hiddenPosterPath')?.value || '';
                fetch(apiClient.getUrl('HomeScreenCompanion/UploadCollectionImage'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ FileName: file.name, Base64Data: base64, OldFilePath: hiddenPath }),
                })
                    .then((r) => r.json())
                    .then((result: { Success?: boolean; Message?: string; FilePath?: string }) => {
                        if (result.Success) {
                            const pathInput = row.querySelector<HTMLInputElement>('.hiddenPosterPath');
                            if (pathInput && result.FilePath) pathInput.value = result.FilePath;
                            const fnameEl = row.querySelector<HTMLElement>('.poster-filename');
                            if (fnameEl) fnameEl.textContent = file.name;
                            const previewContainer = row.querySelector<HTMLElement>('.poster-preview-container');
                            if (previewContainer) previewContainer.style.display = 'block';
                        } else {
                            deps.alert('Upload failed: ' + (result.Message || 'Unknown error'));
                            if (img) img.style.display = 'none';
                        }
                    })
                    .catch(() => {
                        deps.alert('Upload error. Check server logs.');
                        if (img) img.style.display = 'none';
                    });
            };
            reader.readAsDataURL(file);
        });
    }

    const btnRemovePoster = row.querySelector<HTMLButtonElement>('.btnRemovePoster');
    if (btnRemovePoster) {
        btnRemovePoster.addEventListener('click', () => {
            const pathInput = row.querySelector<HTMLInputElement>('.hiddenPosterPath');
            if (pathInput) pathInput.value = '';
            const fnameEl = row.querySelector<HTMLElement>('.poster-filename');
            if (fnameEl) fnameEl.textContent = '';
            const previewContainer = row.querySelector<HTMLElement>('.poster-preview-container');
            if (previewContainer) previewContainer.style.display = 'none';
            const previewImg = row.querySelector<HTMLImageElement>('.poster-preview-img');
            if (previewImg) previewImg.style.display = 'none';
            if (inputPosterFile) inputPosterFile.value = '';
        });
    }

    const btnLoadPosterUrl = row.querySelector<HTMLButtonElement>('.btnLoadPosterUrl');
    if (btnLoadPosterUrl) {
        btnLoadPosterUrl.addEventListener('click', () => {
            const urlInput = row.querySelector<HTMLInputElement>('.txtPosterUrl');
            const url = (urlInput?.value || '').trim();
            if (!url) return;
            const apiClient = getApiClient();
            if (!apiClient) return;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            const token = apiClient.accessToken();
            if (token) headers['X-Emby-Token'] = token;
            const hiddenPath = row.querySelector<HTMLInputElement>('.hiddenPosterPath')?.value || '';
            fetch(apiClient.getUrl('HomeScreenCompanion/FetchCollectionImageFromUrl'), {
                method: 'POST',
                headers,
                body: JSON.stringify({ Url: url, OldFilePath: hiddenPath }),
            })
                .then((r) => r.json())
                .then((result: { Success?: boolean; Message?: string; FilePath?: string }) => {
                    if (result.Success) {
                        const pathInput = row.querySelector<HTMLInputElement>('.hiddenPosterPath');
                        if (pathInput && result.FilePath) pathInput.value = result.FilePath;
                        const fnameEl = row.querySelector<HTMLElement>('.poster-filename');
                        if (fnameEl) {
                            const parts = url.split('/');
                            fnameEl.textContent = (parts[parts.length - 1] || '').split('?')[0] || '';
                        }
                        const previewContainer = row.querySelector<HTMLElement>('.poster-preview-container');
                        if (previewContainer) previewContainer.style.display = 'block';
                        const img = row.querySelector<HTMLImageElement>('.poster-preview-img');
                        if (img) {
                            img.src = url;
                            img.style.display = 'block';
                        }
                        if (urlInput) urlInput.value = '';
                    } else {
                        deps.alert('Failed to load image: ' + (result.Message || 'Unknown error'));
                    }
                })
                .catch(() => {
                    deps.alert('Error fetching image. Check the URL and server logs.');
                });
        });
    }
}
