/**
 * Prompt Rewriter feature — AI-powered prompt optimization.
 *
 * Adds a sparkle button to the prompt input that opens a small popup
 * where users can choose tone (Casual / As-is / Formal), length
 * (Shorter / As-is / Longer), and a preset instruction context
 * (clarity / precision / creative / tutor / redteam / custom).
 *
 * The rewrite request is sent to the background worker which calls the
 * Council API.
 *
 * Original source: content.isolated.end.js lines 7944-8191
 */

import { getSettings } from '../isolated-world/settings';
import { toast, addTooltip } from '../isolated-world/ui/primitives';
import {
  getSubmitButton,
  setTextAreaElementValue,
  errorUpgradeConfirmation,
  createModal,
  getDictateButton,
} from '../../utils/shared';

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const modelMap: Record<string, string> = {
  'ChatGPT 5 Thinking': 'gpt-5-thinking',
  'ChatGPT 5 Thinking mini': 'gpt-5-t-mini',
  'ChatGPT 5': 'gpt-5',
  'ChatGPT 5 Instant': 'gpt-5-instant',
  'ChatGPT 5 Pro': 'gpt-5-pro',
  'ChatGPT 4o': 'gpt-4o',
  'ChatGPT 4.1': 'gpt-4-1',
  'ChatGPT o3': 'o3',
  'ChatGPT o4': 'o4',
  'ChatGPT o4-mini': 'o4-mini',
};

const PRESET_CONTEXTS: Record<string, string> = {
  clarity:
    'Rewrite the prompt to preserve its intent while removing ambiguity and filler. Specify the task in one sentence, list clear constraints, define inputs/outputs, and note success criteria. Keep domain terms intact, preserve variable/placeholders exactly as written (e.g., ${var}, {{ handlebars }}, <tags>, code). Prefer concrete verbs and numbered steps. Avoid rhetorical questions and fluff. Do not add external facts or alter the user\u2019s goal.',
  precision:
    'Rewrite the prompt into a compact spec: Role \u2192 Task \u2192 Constraints \u2192 I/O format \u2192 Edge cases \u2192 Acceptance checks. Convert vague words (like \u201Csome\u201D, \u201Cquick\u201D, \u201Coptimize\u201D) into measurable targets or explicit assumptions. For code, keep language, library, and versions unchanged. For safety, forbid hallucinated data and require an \u201CUnknown if not provided\u201D stance. Avoid metaphors; prefer exactness.',
  creative:
    'Rewrite to preserve the original goal while boosting creative range and distinct options. Ask for 3\u20135 divergent approaches, each with a one-line rationale and a trade-off. Keep constraints intact. Encourage tasteful analogies/examples only if they clarify the idea. No new facts beyond what the user provided; label assumptions clearly. End with a brief recommendation on when to pick each option.',
  tutor:
    'Rewrite to produce a stepwise plan that teaches the concept as it solves it. Define prerequisites, outline steps with short explanations, and include a minimal example. Use plain language for tough parts; name common pitfalls and how to avoid them. Keep all original technical specs and variables exact. Do not expand scope beyond the request.',
  redteam:
    'Rewrite to make the prompt robust against failure: enumerate likely edge cases, specify fallback behaviors, and define validation checks for outputs. Require explicit handling for incomplete inputs and ask for clarifying questions only when critical. For code, lock API contracts and input schemas; for text, lock required sections and output format. No scope creep, no invented data.',
};

const TONE_RULES: Record<string, string> = {
  'more-casual':
    'Adopt approachable, friendly language. Prefer contractions and short, direct sentences, but keep technical terms intact.',
  'as-is': 'Preserve the original tone; do not shift register.',
  'more-formal':
    'Adopt precise, neutral, professional language. Avoid slang and contractions; maintain technical rigor.',
};

const LENGTH_RULES: Record<string, string> = {
  shorter: 'Condense aggressively without losing constraints or acceptance criteria. Remove filler and repetition.',
  'as-is': 'Keep the length approximately the same while improving clarity and structure.',
  longer:
    'Expand where necessary to add structure, steps, examples, and acceptance checks\u2014without adding new external facts.',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add the sparkle "Optimize Prompt" button next to the submit button
 * in the prompt input area.
 */
export async function addPromptRewriteButtonToPromptInput(): Promise<void> {
  const existing = document.querySelector('form #prompt-rewrite-button');

  const settings = getSettings() as Record<string, any>;
  if (!settings.showPromptRewriterButtonInInput) {
    existing?.remove();
    return;
  }

  if (existing) return;

  const form = document.querySelector('main form');
  if (!form) return;

  const submitBtn = getSubmitButton();
  const dictateBtn = getDictateButton();
  if (!submitBtn && !dictateBtn) return;

  const textarea = form.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!textarea) return;

  // Enable/disable the button based on textarea content
  ['input', 'change', 'paste', 'cut', 'keydown', 'keyup'].forEach((evt) => {
    textarea.addEventListener(evt, () => {
      const btn = document.querySelector('form #prompt-rewrite-button') as HTMLButtonElement | null;
      if (btn) btn.disabled = textarea.innerText.trim().length === 0;
    });
  });

  const container = submitBtn?.closest('span')?.closest('div') || dictateBtn?.closest('span')?.closest('div');
  if (!container) return;

  const btn = document.createElement('button');
  btn.id = 'prompt-rewrite-button';
  btn.classList.value = 'composer-btn';
  btn.type = 'button';
  btn.disabled = textarea.innerText.trim().length === 0;
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="currentColor" width="20" height="20" viewBox="0 0 512 512"><path d="M327.5 85.19L384 64L405.2 7.491C406.9 2.985 411.2 0 416 0C420.8 0 425.1 2.985 426.8 7.491L448 64L504.5 85.19C509 86.88 512 91.19 512 96C512 100.8 509 105.1 504.5 106.8L448 128L426.8 184.5C425.1 189 420.8 192 416 192C411.2 192 406.9 189 405.2 184.5L384 128L327.5 106.8C322.1 105.1 320 100.8 320 96C320 91.19 322.1 86.88 327.5 85.19V85.19zM176 73.29C178.6 67.63 184.3 64 190.6 64C196.8 64 202.5 67.63 205.1 73.29L257.8 187.3L371.8 240C377.5 242.6 381.1 248.3 381.1 254.6C381.1 260.8 377.5 266.5 371.8 269.1L257.8 321.8L205.1 435.8C202.5 441.5 196.8 445.1 190.6 445.1C184.3 445.1 178.6 441.5 176 435.8L123.3 321.8L9.292 269.1C3.627 266.5 0 260.8 0 254.6C0 248.3 3.627 242.6 9.292 240L123.3 187.3L176 73.29zM166.9 207.5C162.1 217.8 153.8 226.1 143.5 230.9L92.32 254.6L143.5 278.2C153.8 282.1 162.1 291.3 166.9 301.6L190.6 352.8L214.2 301.6C218.1 291.3 227.3 282.1 237.6 278.2L288.8 254.6L237.6 230.9C227.3 226.1 218.1 217.8 214.2 207.5L190.6 156.3L166.9 207.5zM405.2 327.5C406.9 322.1 411.2 320 416 320C420.8 320 425.1 322.1 426.8 327.5L448 384L504.5 405.2C509 406.9 512 411.2 512 416C512 420.8 509 425.1 504.5 426.8L448 448L426.8 504.5C425.1 509 420.8 512 416 512C411.2 512 406.9 509 405.2 504.5L384 448L327.5 426.8C322.1 425.1 320 420.8 320 416C320 411.2 322.1 406.9 327.5 405.2L384 384L405.2 327.5z"/></svg>';

  addTooltip(btn, { value: 'Optimize Prompt', position: 'bottom' });

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ta = document.querySelector('#prompt-textarea') as HTMLElement | null;
    if (ta) showRewritePromptSettings(btn, ta);
  });

  container.insertBefore(btn, container.firstChild);
}

// ---------------------------------------------------------------------------
// Settings popup
// ---------------------------------------------------------------------------

export function showRewritePromptSettings(button: HTMLElement, textarea: HTMLElement): void {
  const { right, top } = button.getBoundingClientRect();
  const x = right - 200;
  const y = top - 230;

  const existing = document.querySelector('#prompt-rewrite-menu');
  if (existing) {
    existing.remove();
    return;
  }

  const settings = getSettings() as Record<string, any>;
  const { rewriteTone: tone, rewriteLength: length, selectedRewriteContext: ctx } = settings;

  const html = `<div id="prompt-rewrite-menu" dir="ltr" style="transform:translate3d(${x}px,${y}px,0);position:fixed;left:0;top:0;width:200px;min-height:200px;max-height:200px;z-index:10001;"><div class="w-full h-full rounded-2xl text-token-text-primary popover bg-token-main-surface-primary dark:bg-[#353535] shadow-long p-3" tabindex="-1" style="outline:0;">

  <div class="text-sm mb-1 text-token-text-tertiary">Instruction</div>
  <div id="open-rewrite-prompt-context-button" class="w-full flex items-center justify-between mb-3 p-2 border border-token-border-medium rounded-lg cursor-pointer hover:bg-token-main-surface-secondary">
    <div class>${capitalize(ctx)}</div>
    <div role="menuitem" class="flex rounded-xl p-1.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-secondary group" tabindex="-1">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor"></path></svg>
    </div>
  </div>

  <div id="rewrite-tone-buttons" class="flex mb-2">
    <button role="menuitem" data-value="more-casual" class="flex-1 rounded-l-xl border border-token-border-medium px-2.5 py-1 text-xs cursor-pointer focus:ring-0 ${tone === 'more-casual' ? 'bg-token-main-surface-tertiary' : 'hover:bg-token-main-surface-secondary'} group" style="width:33.33%" tabindex="-1">Casual</button>
    <button role="menuitem" data-value="as-is" class="flex-1 border border-token-border-medium px-2.5 py-1 text-xs cursor-pointer focus:ring-0 ${tone === 'as-is' ? 'bg-token-main-surface-tertiary' : 'hover:bg-token-main-surface-secondary'} group" style="width:33.33%" tabindex="-1">As is</button>
    <button role="menuitem" data-value="more-formal" class="flex-1 rounded-r-xl border border-token-border-medium px-2.5 py-1 text-xs cursor-pointer focus:ring-0 ${tone === 'more-formal' ? 'bg-token-main-surface-tertiary' : 'hover:bg-token-main-surface-secondary'} group" style="width:33.33%" tabindex="-1">Formal</button>
  </div>

  <div id="rewrite-length-buttons" class="flex mb-2">
    <button role="menuitem" data-value="shorter" class="flex-1 rounded-l-xl border border-token-border-medium px-2.5 py-1 text-xs cursor-pointer focus:ring-0 ${length === 'shorter' ? 'bg-token-main-surface-tertiary' : 'hover:bg-token-main-surface-secondary'} group" style="width:33.33%" tabindex="-1">Shorter</button>
    <button role="menuitem" data-value="as-is" class=" flex-1 border border-token-border-medium px-2.5 py-1 text-xs cursor-pointer focus:ring-0 ${length === 'as-is' ? 'bg-token-main-surface-tertiary' : 'hover:bg-token-main-surface-secondary'} group" style="width:33.33%" tabindex="-1">As is</button>
    <button role="menuitem" data-value="longer" class="flex-1 rounded-r-xl border border-token-border-medium px-2.5 py-1 text-xs cursor-pointer focus:ring-0 ${length === 'longer' ? 'bg-token-main-surface-tertiary' : 'hover:bg-token-main-surface-secondary'} group" style="width:33.33%" tabindex="-1">Longer</button>
  </div>

  <div role="menuitem" id="rewrite-prompt-button" class="flex gap-2 items-center justify-between border border-token-border-medium mt-5 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 group composer-submit-btn composer-submit-button-color" tabindex="-1">
    <span>Optimize prompt</span>
    <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="currentColor" width="20" height="20" viewBox="0 0 512 512"><path d="M327.5 85.19L384 64L405.2 7.491C406.9 2.985 411.2 0 416 0C420.8 0 425.1 2.985 426.8 7.491L448 64L504.5 85.19C509 86.88 512 91.19 512 96C512 100.8 509 105.1 504.5 106.8L448 128L426.8 184.5C425.1 189 420.8 192 416 192C411.2 192 406.9 189 405.2 184.5L384 128L327.5 106.8C322.1 105.1 320 100.8 320 96C320 91.19 322.1 86.88 327.5 85.19V85.19zM176 73.29C178.6 67.63 184.3 64 190.6 64C196.8 64 202.5 67.63 205.1 73.29L257.8 187.3L371.8 240C377.5 242.6 381.1 248.3 381.1 254.6C381.1 260.8 377.5 266.5 371.8 269.1L257.8 321.8L205.1 435.8C202.5 441.5 196.8 445.1 190.6 445.1C184.3 445.1 178.6 441.5 176 435.8L123.3 321.8L9.292 269.1C3.627 266.5 0 260.8 0 254.6C0 248.3 3.627 242.6 9.292 240L123.3 187.3L176 73.29zM166.9 207.5C162.1 217.8 153.8 226.1 143.5 230.9L92.32 254.6L143.5 278.2C153.8 282.1 162.1 291.3 166.9 301.6L190.6 352.8L214.2 301.6C218.1 291.3 227.3 282.1 237.6 278.2L288.8 254.6L237.6 230.9C227.3 226.1 218.1 217.8 214.2 207.5L190.6 156.3L166.9 207.5zM405.2 327.5C406.9 322.1 411.2 320 416 320C420.8 320 425.1 322.1 426.8 327.5L448 384L504.5 405.2C509 406.9 512 411.2 512 416C512 420.8 509 425.1 504.5 426.8L448 448L426.8 504.5C425.1 509 420.8 512 416 512C411.2 512 406.9 509 405.2 504.5L384 448L327.5 426.8C322.1 425.1 320 420.8 320 416C320 411.2 322.1 406.9 327.5 405.2L384 384L405.2 327.5z"/></svg>
  </div>

  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  addPromptRewriteMenuEventListeners(button, textarea);
}

// ---------------------------------------------------------------------------
// Event listeners for the popup
// ---------------------------------------------------------------------------

function addPromptRewriteMenuEventListeners(button: HTMLElement, textarea: HTMLElement): void {
  const menu = document.querySelector('#prompt-rewrite-menu');
  if (!menu) return;

  // Context button
  const ctxBtn = menu.querySelector('#open-rewrite-prompt-context-button');
  ctxBtn?.addEventListener('click', () => {
    openRewritePromptContextModal();
  });

  // Tone buttons
  const toneButtons = menu.querySelectorAll('#rewrite-tone-buttons button');
  toneButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      (e as Event).stopPropagation();
      const value = (btn as HTMLElement).getAttribute('data-value');
      const s = getSettings() as Record<string, any>;
      s.rewriteTone = value;
      chrome.storage.local.set({ settings: s });
      toneButtons.forEach((b) => {
        b.classList.remove('bg-token-main-surface-tertiary');
        b.classList.add('hover:bg-token-main-surface-secondary');
      });
      btn.classList.add('bg-token-main-surface-tertiary');
      btn.classList.remove('hover:bg-token-main-surface-secondary');
    });
  });

  // Length buttons
  const lengthButtons = menu.querySelectorAll('#rewrite-length-buttons button');
  lengthButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      (e as Event).stopPropagation();
      const value = (btn as HTMLElement).getAttribute('data-value');
      const s = getSettings() as Record<string, any>;
      s.rewriteLength = value;
      chrome.storage.local.set({ settings: s });
      lengthButtons.forEach((b) => {
        b.classList.remove('bg-token-main-surface-tertiary');
        b.classList.add('hover:bg-token-main-surface-secondary');
      });
      btn.classList.add('bg-token-main-surface-tertiary');
      btn.classList.remove('hover:bg-token-main-surface-secondary');
    });
  });

  // Rewrite button
  const rewriteBtn = menu.querySelector('#rewrite-prompt-button');
  rewriteBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    (e as Event).stopPropagation();
    menu.remove();
    rewritePromptInInput(button, textarea);
  });
}

// ---------------------------------------------------------------------------
// Core rewrite logic
// ---------------------------------------------------------------------------

async function rewritePromptInInput(button: HTMLElement, textarea: HTMLElement): Promise<void> {
  if (!textarea) return;

  const text = textarea.innerText.trim() || (textarea as HTMLInputElement).value?.trim();
  if (!text) return;

  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });

  // Rate limit for free users: 2 per day
  const usage = window.localStorage ? JSON.parse(window.localStorage.getItem('sp/dailyRewriteUsage') || '{}') : {};
  const today = new Date().toISOString().split('T')[0]!;

  if (!hasSub && (usage[today] || 0) >= 2) {
    errorUpgradeConfirmation({
      type: 'limit',
      title: 'You have reached the limit',
      message: 'With Free account you can use Prompt Optimizer twice per day. Upgrade to Pro to remove all limits.',
    });
    return;
  }

  (button as HTMLButtonElement).disabled = true;
  const originalHTML = button.innerHTML;
  button.innerHTML =
    '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon"><circle fill="transparent" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>';

  const context = await rewritePromptContextBuilder();

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'rewritePrompt',
      detail: {
        context,
        prompt: text,
        tone: (getSettings() as Record<string, any>).rewriteTone || 'as-is',
        length: (getSettings() as Record<string, any>).rewriteLength || 'as-is',
      },
    });

    if (result?.ok) {
      if (!hasSub) {
        if (usage[today!]) {
          usage[today!] += 1;
        } else {
          Object.keys(usage).forEach((k) => delete usage[k]);
          usage[today!] = 1;
        }
        if (window.localStorage) {
          window.localStorage.setItem('sp/dailyRewriteUsage', JSON.stringify(usage));
        }
      }

      if (textarea.id === 'prompt-textarea') {
        setTextAreaElementValue(result.text);
      } else {
        (textarea as HTMLInputElement).value = result.text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.focus();
      }

      window.dispatchEvent(new CustomEvent('inputValue', { detail: { value: result.text } }));
      toast('Prompt optimized');
    } else {
      toast(result?.error || 'Failed to optimize prompt', 'error', 10000);
    }
  } catch (err) {
    toast('Failed to optimize prompt', 'error');
    console.error('Failed to optimize prompt', err);
  } finally {
    (button as HTMLButtonElement).disabled = text.length === 0;
    button.innerHTML = originalHTML;
  }
}

// ---------------------------------------------------------------------------
// Context modal
// ---------------------------------------------------------------------------

function openRewritePromptContextModal(): void {
  const content = rewritePromptContextModalContent();
  const actions = rewritePromptContextModalActions();
  createModal(
    'Set Prompt Optimizer Instruction',
    'Provide additional instruction to help optimize your prompt. This instruction will be considered when optimizing but will not be included in the final prompt sent to ChatGPT.',
    content,
    actions,
    false,
    'small',
  );
}

function rewritePromptContextModalContent(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = 'modal-content-context-preview';
  wrapper.classList.value =
    'w-full h-full flex justify-center items-center overflow-hidden pt-3 gap-2 bg-token-main-surface-primary';

  const inner = document.createElement('div');
  inner.classList.value = 'w-full rounded-md flex flex-col justify-center items-start relative';
  inner.style.height = '100%';

  // Preset select
  const select = document.createElement('select');
  select.id = 'preset-context-select';
  select.classList.value =
    'bg-token-main-surface-primary border border-token-border-medium text-token-text-primary p-2 ms-3 rounded-md text-sm';
  select.style.width = '140px';

  Object.keys(PRESET_CONTEXTS).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = capitalize(key);
    select.appendChild(opt);
  });

  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Custom ...';
  select.appendChild(customOpt);

  select.value = (getSettings() as Record<string, any>).selectedRewriteContext || 'clarity';
  select.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (!target) return;
    const curSettings = getSettings() as Record<string, any>;
    curSettings.selectedRewriteContext = target.value;
    chrome.storage.local.set({ settings: curSettings });
    const ta = document.getElementById('context-preview-text') as HTMLTextAreaElement | null;
    if (ta) {
      ta.value =
        target.value === 'custom' ? curSettings.customRewriteContext || '' : PRESET_CONTEXTS[target.value] || '';
      ta.disabled = target.value !== 'custom';
      ta.style.cssText = target.value === 'custom' ? 'opacity:1;' : 'opacity:0.6;';
      if (target.value === 'custom') ta.focus();
    }
  });

  inner.appendChild(select);

  // Textarea
  const ta = document.createElement('textarea');
  ta.id = 'context-preview-text';
  ta.classList.value =
    'w-full h-full bg-token-main-surface-primary text-token-text-primary p-3 rounded-md placeholder:text-gray-500 text-lg resize-none border-none focus:ring-0 focus:outline-none';
  ta.placeholder = 'Write your instructions to optimize prompt...';

  const { selectedRewriteContext, customRewriteContext } = getSettings() as Record<string, any>;
  ta.value = selectedRewriteContext === 'custom' ? customRewriteContext : PRESET_CONTEXTS[selectedRewriteContext] || '';
  ta.disabled = selectedRewriteContext !== 'custom';
  ta.style.cssText = selectedRewriteContext === 'custom' ? 'opacity:1;' : 'opacity:0.6;';

  ta.addEventListener('input', (e) => {
    const target = e.target as HTMLTextAreaElement;
    if (target) {
      const curSettings = getSettings() as Record<string, any>;
      curSettings.customRewriteContext = target.value;
      chrome.storage.local.set({ settings: curSettings });
    }
  });

  inner.appendChild(ta);
  wrapper.appendChild(inner);
  return wrapper;
}

function rewritePromptContextModalActions(): HTMLElement {
  return document.createElement('div');
}

// ---------------------------------------------------------------------------
// Context builder for the rewrite API call
// ---------------------------------------------------------------------------

async function rewritePromptContextBuilder(): Promise<string> {
  const settings = getSettings() as Record<string, any>;
  const {
    rewriteTone: tone,
    rewriteLength: length,
    selectedRewriteContext: ctx,
    customRewriteContext: customCtx,
  } = settings;

  const toneRule = TONE_RULES[tone] || TONE_RULES['as-is'];
  const lengthRule = LENGTH_RULES[length] || LENGTH_RULES['as-is'];
  const presetRule = ctx === 'custom' ? customCtx : PRESET_CONTEXTS[ctx] || '';

  const globalInvariants = [
    'Preserve the original task and domain details.',
    'Do not invent facts, data, references, or APIs not present in the input.',
    'Preserve variable names, placeholders, code blocks, and file paths exactly (e.g., ${var}, {{x}}, <tag>, backticked identifiers).',
    'Keep the same programming language, libraries, and versions if the prompt involves code.',
    'If any mandatory input is missing, request only the minimum critical clarifications as a short numbered list.',
    'Prefer numbered lists and bullet points over prose where it adds clarity.',
  ].join(' ');

  const modelTitle =
    (
      document.querySelector('header button[data-testid="model-switcher-dropdown-button"]') as HTMLElement | null
    )?.textContent?.trim() ||
    (document.querySelector('#selected-model-title') as HTMLElement | null)?.textContent?.trim();

  const modelSlug = modelMap[modelTitle || ''];

  return [
    "You are a Prompt Optimizer. Your job is to rewrite the user's prompt to maximize clarity, answerability, and robustness while preserving the original intent.",
    modelSlug
      ? `Optimize for model: ${modelSlug}. Avoid model-specific tooling unless explicitly mentioned in the source prompt.`
      : '',
    `Style/tone directive: ${toneRule}`,
    `Length directive: ${lengthRule}`,
    `Preset rules: ${presetRule}`,
    `Global invariants: ${globalInvariants}`,
    'Output requirement: Return ONLY the rewritten prompt text\u2014no explanations, no headers, no JSON.',
  ]
    .filter(Boolean)
    .join(' ');
}
