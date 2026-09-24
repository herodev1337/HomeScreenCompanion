import { DEFAULT_AI_SYSTEM_PROMPT } from '../state/state';

/**
 * Toggle the visibility of the `#btnResetAiSystemPrompt` reset button based
 * on whether the user has modified the AI system prompt away from
 * {@link DEFAULT_AI_SYSTEM_PROMPT}.
 *
 * Lifted from `Configuration/configPage.js` (legacy.js:14-19). The function
 * looks up two child elements by ID inside the supplied view: the prompt
 * textarea (`#txtAiSystemPrompt`) and the reset button
 * (`#btnResetAiSystemPrompt`). If either is missing or has the wrong type,
 * the call is a no-op (early return). Otherwise it sets `btn.style.display`
 * to `''` (visible) when the trimmed prompt differs from the trimmed
 * default, and to `'none'` when it matches — i.e. the button only shows
 * when there is something to reset to.
 *
 * @param view  The root container element that owns the two IDs above
 *              (typically the page-level view shown by the legacy AMD
 *              factory). Any HTMLElement with those descendants.
 */
export function updateSystemPromptResetBtn(view: HTMLElement): void {
    const ta = view.querySelector('#txtAiSystemPrompt');
    const btn = view.querySelector('#btnResetAiSystemPrompt');
    if (!(ta instanceof HTMLTextAreaElement) || !(btn instanceof HTMLElement)) return;
    btn.style.display = ta.value.trim() !== DEFAULT_AI_SYSTEM_PROMPT.trim() ? '' : 'none';
}