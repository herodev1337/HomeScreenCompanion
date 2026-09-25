/**
 * Domain: the `.btnRunEntry` handler (legacy.js:2255-2355). Reads the
 * entry name, warns when missing, asks to save-when-dirty, and POSTs
 * the entry to `HomeScreenCompanion/RunEntry` via
 * {@link getApiClient}. Lives on `runEntry.ts` per the audit plan
 * (`runEntry.ts:1023-1090`).
 *
 * Also handles the `.btnRemoveUrl` / `.btnRemoveLocal` /
 * `.btnRemoveDate` (`.btnRemoveDate` pings `controller.updateBadges`),
 * `.btnAddUrl` / `.btnAddLocal` / `.btnAddDate` (the date add also
 * pings `controller.updateBadges`), `.btnTagTargetHelp` /
 * `.btnCollTargetHelp` (open `#tagTargetHelpModalOverlay`), the
 * `.txtEntryLabel` / `.txtTagName` input listener that pings
 * `controller.updateTagTitle`, the `.btnDuplicateRow` clone, and the
 * `.btnTestUrl` / `.btnTestAiSource` server probes (which also reach
 * `window.ApiClient` via {@link getApiClient}).
 *
 * Lifted verbatim from the pre-D2 `setupRowEvents.ts` body
 * (`:1032-1103` for the run-group; the URL/Local/Date add/remove,
 * `.txtEntryLabel`, `.btnDuplicateRow`, and `.btnTestUrl` /
 * `.btnTestAiSource` siblings live in this same module because they
 * share the row-level `click` listener as well as the timeline).
 */
import { getApiClient } from './apiAccess';
import { getDateRowHtml, getLocalRowHtml, readRowAsConfig } from '../filters/rows';
import { getUrlRowHtml } from '../dom/dom';
import type { RowController } from './rowController';
import type { SetupRowEventsDeps } from './setupRowEvents';

export interface RunEntryContext {
    readonly controller: RowController;
}

export function wireRunEntry(
    row: HTMLElement,
    deps: SetupRowEventsDeps,
    ctx: RunEntryContext,
): void {
    const { controller } = ctx;

    // URL row add.
    const btnAddUrl = row.querySelector<HTMLButtonElement>('.btnAddUrl');
    if (btnAddUrl) {
        btnAddUrl.addEventListener('click', () => {
            const urlListContainer = row.querySelector<HTMLElement>('.url-list-container');
            if (urlListContainer) {
                urlListContainer.insertAdjacentHTML('beforeend', getUrlRowHtml('', 0));
            }
        });
    }

    // Local row add.
    const btnAddLocal = row.querySelector<HTMLButtonElement>('.btnAddLocal');
    if (btnAddLocal) {
        btnAddLocal.addEventListener('click', () => {
            const st = row.querySelector<HTMLSelectElement>('.selSourceType')?.value || '';
            const localListContainer = row.querySelector<HTMLElement>('.local-list-container');
            if (localListContainer) {
                localListContainer.insertAdjacentHTML('beforeend', getLocalRowHtml(st, '', 0));
            }
        });
    }

    // Date row add (pings badges when a new date row appears).
    const btnAddDate = row.querySelector<HTMLButtonElement>('.btnAddDate');
    if (btnAddDate) {
        btnAddDate.addEventListener('click', () => {
            const dateListContainer = row.querySelector<HTMLElement>('.date-list-container');
            if (dateListContainer) {
                dateListContainer.insertAdjacentHTML('beforeend', getDateRowHtml({ Type: 'SpecificDate' }));
            }
            controller.updateBadges(row);
        });
    }

    // Tag / Collection target help — open the shared modal.
    const btnTagTargetHelp = row.querySelector<HTMLButtonElement>('.btnTagTargetHelp');
    if (btnTagTargetHelp) {
        btnTagTargetHelp.addEventListener('click', () => {
            document.getElementById('tagTargetHelpModalOverlay')?.classList.add('modal-visible');
        });
    }
    const btnCollTargetHelp = row.querySelector<HTMLButtonElement>('.btnCollTargetHelp');
    if (btnCollTargetHelp) {
        btnCollTargetHelp.addEventListener('click', () => {
            document.getElementById('tagTargetHelpModalOverlay')?.classList.add('modal-visible');
        });
    }

    // Row-level click delegation: URL/Local/Date remove + run-group + test URL/AI.
    row.addEventListener('click', (e: Event) => {
        const ev = e as MouseEvent;
        const clickTarget = ev.target as Element | null;
        if (!clickTarget) return;

        const removeUrlBtn = clickTarget.closest('.btnRemoveUrl');
        if (removeUrlBtn) {
            const urlRow = removeUrlBtn.closest('.url-row');
            if (urlRow) urlRow.remove();
            return;
        }

        const removeLocalBtn = clickTarget.closest('.btnRemoveLocal');
        if (removeLocalBtn) {
            const localRow = removeLocalBtn.closest('.local-row');
            if (localRow) localRow.remove();
            return;
        }

        const removeDateBtn = clickTarget.closest('.btnRemoveDate');
        if (removeDateBtn) {
            const dateRow = removeDateBtn.closest('.date-row');
            if (dateRow) dateRow.remove();
            controller.updateBadges(row);
            return;
        }

        const runEntryBtn = clickTarget.closest('.btnRunEntry');
        if (runEntryBtn) {
            const entryName =
                row.querySelector<HTMLInputElement>('.txtEntryLabel')?.value ||
                row.querySelector<HTMLInputElement>('.txtTagName')?.value ||
                '';
            if (!entryName) {
                deps.alert('Entry has no name or tag.');
                return;
            }
            const doRun = () => {
                const liveView = row.closest<HTMLElement>('#HomeScreenCompanionConfigPage');
                const btn = row.querySelector<HTMLButtonElement>('.btnRunEntry');
                const lbl = btn?.querySelector<HTMLElement>('.btnRunEntryLabel');
                const btnSaveEl = liveView?.querySelector<HTMLButtonElement>('.btn-save');
                const dotEl = liveView?.querySelector<HTMLElement>('#dotStatus');
                const labelEl = liveView?.querySelector<HTMLElement>('#lastRunStatusLabel');
                if (lbl) lbl.textContent = 'Running…';
                if (btn) btn.disabled = true;
                if (btnSaveEl) {
                    btnSaveEl.disabled = true;
                    btnSaveEl.style.opacity = '0.5';
                    const sp = btnSaveEl.querySelector<HTMLElement>('span');
                    if (sp) sp.textContent = 'Sync in progress...';
                }
                if (dotEl) dotEl.className = 'status-dot running';
                if (labelEl) labelEl.textContent = 'Running...';
                const apiClient = getApiClient();
                if (!apiClient) return;
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'X-MediaBrowser-Token': apiClient.accessToken(),
                };
                fetch(apiClient.getUrl('HomeScreenCompanion/RunEntry'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ EntryName: entryName }),
                })
                    .then((r) => r.json())
                    .then((result: { Success?: boolean; Message?: string }) => {
                        if (lbl) lbl.textContent = 'Run Group';
                        if (btn) btn.disabled = false;
                        if (liveView) deps.refreshStatus(liveView);
                        deps.alert(result.Success ? 'Done: ' + result.Message : 'Failed: ' + result.Message);
                    })
                    .catch(() => {
                        if (lbl) lbl.textContent = 'Run Group';
                        if (btn) btn.disabled = false;
                        if (liveView) deps.refreshStatus(liveView);
                        deps.alert('Request failed.');
                    });
            };
            const liveView = row.closest<HTMLElement>('#HomeScreenCompanionConfigPage');
            const _saveBtn = liveView
                ? liveView.querySelector<HTMLButtonElement>('.btn-save')
                : document.querySelector<HTMLButtonElement>('.btn-save');
            const isDirty = !!_saveBtn && !_saveBtn.disabled;
            if (isDirty) {
                const confirmed = typeof confirm === 'function'
                    ? confirm('You have unsaved changes. Save and run?')
                    : window.confirm('You have unsaved changes. Save and run?');
                if (confirmed) {
                    _saveBtn?.click();
                    setTimeout(doRun, 800);
                }
            } else {
                doRun();
            }
            return;
        }

        const btnTest = clickTarget.closest('.btnTestUrl');
        if (btnTest) {
            const uRow = btnTest.closest('.url-row');
            if (uRow) {
                const urlInput = uRow.querySelector<HTMLInputElement>('.txtTagUrl');
                const url = urlInput?.value || '';
                if (!url) return;
                const limitInput = uRow.querySelector<HTMLInputElement>('.txtUrlLimit');
                const limitVal = parseInt(limitInput?.value || '0', 10) || 0;
                const testBtn = btnTest as HTMLButtonElement;
                testBtn.disabled = true;
                const apiClient = getApiClient();
                if (apiClient) {
                    void apiClient
                        .getJSON(apiClient.getUrl('HomeScreenCompanion/TestUrl', { Url: url, Limit: limitVal }))
                        .then((result: unknown) => {
                            const msg = (result as { Message?: string })?.Message || '';
                            deps.alert(msg);
                        })
                        .finally(() => { testBtn.disabled = false; });
                } else {
                    testBtn.disabled = false;
                }
            }
            return;
        }

        const btnTestAi = clickTarget.closest('.btnTestAiSource');
        if (btnTestAi) {
            const aiContainer = btnTestAi.closest('.source-ai-container');
            if (aiContainer) {
                const aiProvider = aiContainer.querySelector<HTMLSelectElement>('.selAiProvider')?.value || 'OpenAI';
                const aiPrompt = (aiContainer.querySelector<HTMLTextAreaElement>('.txtAiPrompt')?.value || '').trim();
                const aiIncludeWatched = !!aiContainer.querySelector<HTMLInputElement>('.chkAiRecentlyWatched')?.checked;
                const aiWatchedUserId = aiIncludeWatched
                    ? (aiContainer.querySelector<HTMLSelectElement>('.selAiWatchedUser')?.value || '')
                    : '';
                const aiWatchedCount = parseInt(
                    aiContainer.querySelector<HTMLInputElement>('.txtAiWatchedCount')?.value || '20',
                    10,
                ) || 20;
                const resultSpan = aiContainer.querySelector<HTMLElement>('.ai-test-result');
                if (!aiPrompt) {
                    if (resultSpan) resultSpan.textContent = 'Please enter a prompt first.';
                    return;
                }
                const testBtn = btnTestAi as HTMLButtonElement;
                testBtn.disabled = true;
                if (resultSpan) resultSpan.textContent = 'Testing...';
                const apiClient = getApiClient();
                if (!apiClient) {
                    testBtn.disabled = false;
                    return;
                }
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'X-MediaBrowser-Token': apiClient.accessToken(),
                };
                fetch(apiClient.getUrl('HomeScreenCompanion/TestAiSource'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        Provider: aiProvider,
                        Prompt: aiPrompt,
                        IncludeRecentlyWatched: aiIncludeWatched,
                        RecentlyWatchedUserId: aiWatchedUserId,
                        RecentlyWatchedCount: aiWatchedCount,
                    }),
                })
                    .then((r) => r.json())
                    .then((result: { Success?: boolean; Message?: string; Preview?: string[]; Count?: number }) => {
                        if (resultSpan) {
                            resultSpan.textContent = result.Success
                                ? result.Message || ''
                                : 'Failed: ' + result.Message;
                        }
                        if (result.Success && result.Preview && result.Preview.length > 0) {
                            deps.alert('AI returned ' + result.Count + ' items:\n\n' + result.Preview.join('\n'));
                        } else if (!result.Success) {
                            deps.alert('AI test failed:\n' + result.Message);
                        }
                    })
                    .catch((err: unknown) => {
                        if (resultSpan) {
                            resultSpan.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
                        }
                    })
                    .finally(() => { testBtn.disabled = false; });
            }
            return;
        }
    });

    // Title-sync input listeners.
    const txtEntryLabel = row.querySelector<HTMLInputElement>('.txtEntryLabel');
    if (txtEntryLabel) {
        txtEntryLabel.addEventListener('input', () => {
            controller.updateTagTitle(row);
        });
    }
    const txtTagName = row.querySelector<HTMLInputElement>('.txtTagName');
    if (txtTagName) {
        txtTagName.addEventListener('input', () => {
            controller.updateTagTitle(row);
        });
    }

    // Row duplicate.
    const btnDuplicateRow = row.querySelector<HTMLButtonElement>('.btnDuplicateRow');
    if (btnDuplicateRow) {
        btnDuplicateRow.addEventListener('click', () => {
            const config = readRowAsConfig(row);
            const tagged: ReturnType<typeof readRowAsConfig> = {
                ...config,
                Name: (config.Name || config.Tag || 'Source') + ' (copy)',
            };
            const tagContainer = row.closest<HTMLElement>('#tagListContainer');
            deps.renderTagGroup(tagged, tagContainer, true, undefined, true);
            deps.applyFilters(deps.view);
            setTimeout(deps.checkFormState, 0);
        });
    }
}
