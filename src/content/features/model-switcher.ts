/**
 * Model Switcher feature — override the model used for conversations.
 *
 * Allows users to select a specific model instead of the default chosen by
 * ChatGPT's UI. The selected model slug is persisted in sessionStorage and
 * chrome.storage.local, then injected into the conversation POST body by the
 * fetch interceptor.
 *
 * Original source: content.isolated.end.js lines 15587-15728
 */

import { getSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_SESSION_KEY = 'sp/selectedModel';

/**
 * Maps model slugs to friendly display titles/descriptions.
 * These override the raw API-provided title when rendering the switcher.
 */
const modelSwitcherMap: Record<string, { title?: string; description?: string }> = {};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelInfo {
  slug: string;
  title: string;
  description?: string;
  tags?: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Observe the page header for mutations and re-run overrideModelSwitchers
 * whenever the ChatGPT model selector re-renders.
 */
export async function pageHeaderObserver(): Promise<void> {
  const settings = getSettings();
  if (!(settings as any).overrideModelSwitcher) {
    window.sessionStorage.removeItem(MODEL_SESSION_KEY);
    return;
  }

  const observer = new MutationObserver(() => {
    overrideModelSwitchers();
  });

  const header = document.querySelector('#page-header');
  if (header) {
    observer.observe(header, { childList: true, subtree: true });
  }
}

/**
 * Find all native model-switcher buttons and replace them with the
 * Council custom dropdown.
 */
export async function overrideModelSwitchers(): Promise<void> {
  const buttons =
    document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"]') ||
    document.querySelectorAll('#model-switcher-button');

  if (buttons.length === 0) return;

  for (let i = 0; i < buttons.length; i += 1) {
    await overrideSingleModelSwitcher(buttons[i] as HTMLElement);
  }
}

/**
 * Replace a single native model-switcher button with the custom dropdown.
 */
async function overrideSingleModelSwitcher(btn: HTMLElement): Promise<void> {
  if (btn?.classList?.contains('hidden')) return;
  btn?.classList?.add('hidden');

  const { models } = await chrome.storage.local.get(['models']);
  const settings = getSettings();

  if (!(settings as any).overrideModelSwitcher || !models || models.length === 0) {
    window.sessionStorage.removeItem(MODEL_SESSION_KEY);
    btn?.classList?.remove('hidden');
    return;
  }

  const selected = await getSelectedModel();

  if (btn.parentElement && !btn.parentElement.querySelector('#model-switcher-button')) {
    const html = modelSwitcherHTML(selected, models);
    if (btn.parentElement.parentElement) {
      btn.parentElement.parentElement.style.zIndex = '10000';
    }
    btn.parentElement.classList.value = 'flex flex-row-reverse h-full';
    btn.parentElement.insertAdjacentHTML('afterbegin', html);

    const newBtn = btn.parentElement.querySelector('#model-switcher-button') as HTMLElement | null;
    addModelSwitcherEventListener(newBtn);
  }
}

/**
 * Remove all custom model-switcher buttons and restore native ones.
 */
export function resetModelSwitchers(): void {
  document.querySelectorAll('#model-switcher-button').forEach((el) => el.remove());

  const nativeButtons =
    document.querySelectorAll('button[data-testid="model-switcher-dropdown-button"]') ||
    document.querySelectorAll('#model-switcher-button');
  nativeButtons.forEach((el) => el.classList.remove('hidden'));
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function modelSwitcherHTML(selected: ModelInfo | null, models: ModelInfo[]): string {
  if (!selected) return '';

  const titleDisplay = modelSwitcherMap[selected.slug]?.title
    ? `ChatGPT <span class="text-token-text-tertiary">${modelSwitcherMap[selected.slug]?.title?.split('ChatGPT ')[1]}</span>`
    : selected.title;

  return `<div style="width: min-content;height:100%;"><button id="model-switcher-button" class="relative w-full h-full cursor-pointer rounded-lg bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary ps-3 pe-10 text-start focus:outline-none sm:text-sm" type="button">
  <span class="inline-flex w-full truncate text-token-text-primary">
    <span class="flex h-5 items-center gap-1 truncate relative text-lg">
      <span id="selected-model-title">${titleDisplay}</span>
    </span>
  </span>
  <span class="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2">
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 text-gray-400" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  </span>
</button>
<ul id="model-list-dropdown" style="width:300px;max-height:400px" class="hidden shadow-long transition-all absolute z-10 mt-1 overflow-auto rounded-2xl text-base focus:outline-none bg-token-main-surface-secondary sm:text-sm -translate-x-1/4" role="menu" aria-orientation="vertical" aria-labelledby="model-switcher-button" tabindex="-1">
  ${createModelListDropDown(models, selected)}
  <div role="separator" aria-orientation="horizontal" style="bottom:44px;" class="sticky h-[1px] border-token-border-medium"></div>
</ul></div>`;
}

function createModelListDropDown(models: ModelInfo[], selected: ModelInfo): string {
  return models
    .filter((m) => !m.slug.includes('plugins'))
    .map(
      (
        m,
      ) => `<li class="group relative cursor-pointer select-none mx-2 py-2 ps-4 pe-12 rounded-md hover:bg-token-main-surface-tertiary" id="model-switcher-option-${m.slug}" role="option" tabindex="-1">
 <div class="flex flex-col">
   <span class="font-semibold flex h-6 items-center gap-1 truncate text-token-text-primary">${m.title || modelSwitcherMap[m.slug]?.title}</span>
   <span class="text-token-text-tertiary text-xs">${modelSwitcherMap[m.slug]?.description || m.description || ''}</span>
 </div>
 ${
   m.slug === selected.slug
     ? `<span id="model-switcher-checkmark" style="right:36px;" class="absolute inset-y-0 flex items-center text-token-text-primary">
 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg>
 </span>`
     : ''
 }
</li>`,
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function addModelSwitcherEventListener(btn: HTMLElement | null): void {
  if (!btn) return;

  // Toggle dropdown
  btn.addEventListener('click', () => {
    if (!btn.parentElement) return;
    const dropdown = btn.parentElement.querySelector('#model-list-dropdown');
    if (!dropdown) return;
    if (dropdown.classList.contains('block')) {
      dropdown.classList.replace('block', 'hidden');
    } else {
      dropdown.classList.replace('hidden', 'block');
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e: MouseEvent) => {
    if (!btn.parentElement) return;
    const dropdown = btn.parentElement.querySelector('#model-list-dropdown');
    if (dropdown?.classList.contains('block') && !(e.target as HTMLElement)?.closest('#model-switcher-button')) {
      dropdown.classList.replace('block', 'hidden');
    }
  });

  // Option click handlers
  btn.parentElement?.querySelectorAll('[id^=model-switcher-option-]').forEach((option) => {
    option.addEventListener('click', () => {
      chrome.storage.local.get(['models'], ({ models }) => {
        const allModels: ModelInfo[] = Array.isArray(models) ? models : ((models as any)?.models ?? []);
        const slug = option.id.split('model-switcher-option-')[1];
        const model = allModels.find((m) => m.slug === slug);
        if (!model) return;

        window.sessionStorage.setItem(MODEL_SESSION_KEY, model.slug);

        const dropdown = btn.parentElement?.querySelector('#model-list-dropdown');
        if (!dropdown) return;
        dropdown.classList.replace('block', 'hidden');

        // Move checkmark
        const checkmarks = document.querySelectorAll('#model-switcher-checkmark');
        checkmarks.forEach((c) => c.remove());

        // Update title display
        document.querySelectorAll('#selected-model-title').forEach((el) => {
          el.innerHTML = modelSwitcherMap[model.slug]?.title
            ? `ChatGPT <span class="text-token-text-tertiary">${modelSwitcherMap[model.slug]?.title?.split('ChatGPT ')[1]}</span>`
            : model.title;
        });

        // Re-attach checkmark to selected option
        const escapedSlug = model.slug.replaceAll('.', '\\.');
        const selectedOptions = document.querySelectorAll(`#model-switcher-option-${escapedSlug}`);
        if (selectedOptions.length !== 0 && checkmarks.length !== 0) {
          selectedOptions.forEach((opt) => opt.appendChild(checkmarks[0]!));
          chrome.storage.local.set({ selectedModel: model }, () => {
            const textarea = document.querySelector('main #prompt-textarea') as HTMLElement | null;
            textarea?.focus();
          });
        }
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Model selection get/set
// ---------------------------------------------------------------------------

/**
 * Read the currently selected model, falling back to storage.
 */
export async function getSelectedModel(): Promise<ModelInfo | null> {
  const { models: rawModels, selectedModel } = await chrome.storage.local.get(['models', 'selectedModel']);
  const models: ModelInfo[] = Array.isArray(rawModels) ? rawModels : ((rawModels as any)?.models ?? []);
  if (models.length === 0) return null;

  const sessionSlug = window.sessionStorage.getItem(MODEL_SESSION_KEY);
  if (sessionSlug) {
    const found = models.find((m) => m.slug === sessionSlug);
    if (found) return found;
  }

  return selectedModel || models[0] || null;
}

/**
 * Persist the selected model to sessionStorage + chrome.storage.local.
 */
export function setSelectedModel(): void {
  const settings = getSettings();
  chrome.storage.local.get(['selectedModel', 'models'], ({ selectedModel, models }) => {
    if ((settings as any).overrideModelSwitcher) {
      if (selectedModel) {
        window.sessionStorage.setItem(MODEL_SESSION_KEY, selectedModel.slug);
      } else {
        window.sessionStorage.setItem(MODEL_SESSION_KEY, models?.[0]?.slug);
      }
    } else {
      window.sessionStorage.removeItem(MODEL_SESSION_KEY);
    }
  });
}
