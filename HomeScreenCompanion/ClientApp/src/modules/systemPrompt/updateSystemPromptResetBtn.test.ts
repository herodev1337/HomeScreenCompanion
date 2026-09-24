/// <reference types="vitest" />

import { describe, it, expect, afterEach } from 'vitest';

import { updateSystemPromptResetBtn } from './updateSystemPromptResetBtn';
import { DEFAULT_AI_SYSTEM_PROMPT } from '../state/state';

function buildView(value: string): HTMLElement {
    document.body.innerHTML = '';
    const view = document.createElement('div');
    view.innerHTML = [
        '<textarea id="txtAiSystemPrompt"></textarea>',
        '<button type="button" id="btnResetAiSystemPrompt">Reset</button>',
    ].join('');
    const ta = view.querySelector('#txtAiSystemPrompt') as HTMLTextAreaElement;
    ta.value = value;
    document.body.appendChild(view);
    return view;
}

describe('updateSystemPromptResetBtn', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('hides the button when the textarea still holds the default prompt', () => {
        const view = buildView(DEFAULT_AI_SYSTEM_PROMPT);
        updateSystemPromptResetBtn(view);
        const btn = view.querySelector('#btnResetAiSystemPrompt') as HTMLElement;
        expect(btn.style.display).toBe('none');
    });

    it('shows the button when the textarea has been modified away from the default', () => {
        const view = buildView('modified prompt');
        updateSystemPromptResetBtn(view);
        const btn = view.querySelector('#btnResetAiSystemPrompt') as HTMLElement;
        expect(btn.style.display).toBe('');
    });

    it('hides the button when the textarea has only whitespace around the default prompt', () => {
        const view = buildView(`\n  ${DEFAULT_AI_SYSTEM_PROMPT}  \n`);
        updateSystemPromptResetBtn(view);
        const btn = view.querySelector('#btnResetAiSystemPrompt') as HTMLElement;
        expect(btn.style.display).toBe('none');
    });

    it('is a no-op (does not throw) when the expected child elements are absent', () => {
        document.body.innerHTML = '<div id="other"></div>';
        const view = document.getElementById('other') as HTMLElement;
        expect(() => updateSystemPromptResetBtn(view)).not.toThrow();
    });
});