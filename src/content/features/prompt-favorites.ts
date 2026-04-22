/**
 * Favorite prompts dropdown — shown when clicking the dropdown
 * trigger next to the "Continue" button.
 *
 * Includes paginated fetch via chrome.runtime, context menu with
 * Insert, Run, Set Default, Edit, Remove actions.
 *
 * Original source: content.isolated.end.js lines 14700-14847
 */

import { translate } from './i18n';
import { addTooltip, loadingSpinner } from '../isolated-world/ui/primitives';
import { adjustMenuPosition } from '../../utils/shared';
import {
  openPromptEditorModal,
  canRunPrompts,
  runPromptChain,
  insertPromptIntoTextArea,
  formatAttachmentsForPromptStep,
  resetPromptChain,
} from './prompts';
import { toast } from '../isolated-world/ui/primitives';
import { initializeContinueButton } from './minimap';

import type { Prompt } from '../../types/conversation';

// ---------------------------------------------------------------------------
// promptDropdown
// Original: content.isolated.end.js line 14700
// ---------------------------------------------------------------------------

/**
 * Create the favorite-prompts dropdown element. Returns the wrapper
 * div — it is initially hidden and toggled by the dropdown trigger.
 */
export function promptDropdown(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.id = 'favorite-prompts-dropdown-wrapper';
  wrapper.style.cssText = 'max-height:300px;min-width:240px;max-width:fit-content;bottom:40px;left:0;z-index:200;';
  wrapper.className =
    'hidden absolute z-10 end-0 overflow-auto rounded-lg text-base focus:outline-none dark:ring-white/20 text-sm -translate-x-1/4 bg-token-main-surface-secondary shadow-long';

  // Header with "Favorite Prompts" title and "+" button
  const header = document.createElement('div');
  header.className =
    'flex items-center text-token-text-primary font-bold relative cursor-pointer select-none p-2 py-3 bg-token-main-surface-tertiary sticky top-0 z-10';
  header.innerHTML = `<svg class="icon icon-md me-2" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg> ${translate('Favorite Prompts')} <span class="flex items-center justify-center bg-white rounded-full h-4 w-4 ms-auto"><svg class="icon" style="width:12px;height:12px;" fill="#000" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M288 224H480C497.7 224 512 238.3 512 256C512 273.7 497.7 288 480 288H288V480C288 497.7 273.7 512 255.1 512C238.3 512 223.1 497.7 223.1 480V288H32C14.33 288 0 273.7 0 256C0 238.3 14.33 224 32 224H223.1V32C223.1 14.33 238.3 0 255.1 0C273.7 0 288 14.33 288 32V224z"/></svg></span>`;

  addTooltip(header, { value: 'Create New Favorite Prompt', position: 'right' });
  header.addEventListener('click', () => {
    openPromptEditorModal({ title: '', steps: [''], is_favorite: true } as any);
  });
  wrapper.appendChild(header);

  // Empty list container
  const list = document.createElement('ul');
  list.id = 'favorite-prompts-dropdown-list';
  list.className = 'w-full h-full relative p-1';
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-orientation', 'vertical');
  list.setAttribute('aria-labelledby', 'continue-conversation-dropdown-button');
  list.setAttribute('tabindex', '-1');
  wrapper.appendChild(list);

  // Close dropdown on outside click
  document.body.addEventListener('click', (ev) => {
    const dd = document.querySelector('#favorite-prompts-dropdown-wrapper');
    if (
      dd?.classList?.contains('block') &&
      !(ev.target as HTMLElement)?.closest('#continue-conversation-dropdown-button')
    ) {
      dd.classList.replace('block', 'hidden');
    }
  });

  return wrapper;
}

// ---------------------------------------------------------------------------
// fetchFavoritePrompts
// Original: content.isolated.end.js line 14721
// ---------------------------------------------------------------------------

/**
 * Fetch favorite prompts (paginated) and populate the dropdown list.
 * Uses IntersectionObserver for infinite-scroll loading.
 */
export function fetchFavoritePrompts(page = 1): void {
  const list = document.querySelector('#favorite-prompts-dropdown-list');
  if (!list) return;

  if (page === 1) {
    list.innerHTML = '';
    list.appendChild(loadingSpinner('favorite-prompts-dropdown-list'));
  } else {
    document.querySelector('#load-more-prompts-button')?.remove();
  }

  chrome.runtime.sendMessage(
    {
      type: 'getPrompts',
      detail: { pageNumber: page, sortBy: 'alphabetical', isFavorite: true, deepSearch: false },
    },
    (response: any) => {
      const results: Prompt[] | undefined = response?.results;
      if (!results) return;

      document.querySelector('#loading-spinner-favorite-prompts-dropdown-list')?.remove();

      if (results.length === 0 && page === 1) {
        const empty = document.createElement('p');
        empty.className = 'text-token-text-tertiary p-4';
        empty.innerText = translate('No prompts found');
        list.appendChild(empty);
        return;
      }

      results.forEach((prompt) => {
        const stepsText = prompt.steps.map((s: string, i: number) => `step ${i + 1}:\n${s}`).join('\n');

        const li = document.createElement('li');
        li.id = `continue-conversation-dropdown-item-${prompt.id}`;
        li.dir = 'auto';
        li.className = 'text-token-text-primary relative cursor-pointer select-none p-2 rounded-lg';

        const span = document.createElement('span');
        span.className = 'flex h-6 items-center justify-between text-token-text-primary';

        const titleSpan = document.createElement('span');
        titleSpan.style.textTransform = 'capitalize';
        titleSpan.className = 'truncate';
        titleSpan.innerText = prompt.title;

        span.appendChild(titleSpan);
        span.title = `${prompt.title}\n\n${formatAttachmentsForPromptStep(stepsText)}`;
        li.appendChild(span);
        li.setAttribute('role', 'option');
        li.setAttribute('tabindex', '-1');

        li.addEventListener('mouseenter', (ev) => {
          document.querySelectorAll('#prompt-action-menu').forEach((m) => m.remove());
          document
            .querySelectorAll('#favorite-prompts-dropdown-list > li')
            .forEach((el) => el.classList.remove('bg-token-main-surface-tertiary'));
          li.classList.add('bg-token-main-surface-tertiary');
          showPromptActionMenu(ev, prompt, li);
        });

        li.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        });

        list.appendChild(li);
      });

      // Infinite scroll — load more when bottom sentinel is visible
      if (response.next) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-prompts-button';
        loadMoreBtn.className = 'p-2 cursor-pointer flex items-center justify-center h-auto relative';
        loadMoreBtn.appendChild(loadingSpinner('load-more-prompts-button'));
        list.appendChild(loadMoreBtn);

        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                fetchFavoritePrompts(page + 1);
                observer.disconnect();
              }
            });
          },
          { threshold: 0 },
        );
        observer.observe(loadMoreBtn);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// showPromptActionMenu
// Original: content.isolated.end.js line 14777
// ---------------------------------------------------------------------------

/**
 * Show the context menu for a favorite prompt with actions:
 * Insert & Run, Insert, Set as Default, Edit, Remove from Favorites.
 */
function showPromptActionMenu(_ev: MouseEvent, prompt: Prompt, li: HTMLElement): void {
  document.querySelectorAll('#prompt-action-menu').forEach((el) => el.remove());

  const id = prompt.id;
  const { right, top } = li.getBoundingClientRect();
  const x = right + 4;
  const y = top - 2;

  const menuHTML = `<div id="prompt-action-menu" dir="ltr" style="transform:translate3d(${x}px,${y}px,0);position:fixed;left:0;top:0;min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" class="min-w-[200px] max-w-xs rounded-lg text-token-text-primary bg-token-main-surface-secondary shadow-long p-1" tabindex="-1">
  <div role="menuitem" id="run-favorite-prompt-button-${id}" class="flex gap-2 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>${translate('Insert & Run')}</div>
  <div role="menuitem" id="insert-favorite-prompt-button-${id}" class="flex gap-2 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-width="2" class="icon icon-md" viewBox="0 0 512 512"><path d="M416 128h-40C362.7 128 352 138.7 352 152c0 13.25 10.75 24 24 24H416c8.836 0 16 7.164 16 16v256c0 8.836-7.164 16-16 16H96c-8.836 0-16-7.164-16-16V192c0-8.836 7.164-16 16-16h40C149.3 176 160 165.3 160 152C160 138.7 149.3 128 136 128H96C60.65 128 32 156.7 32 192v256c0 35.34 28.65 64 64 64h320c35.35 0 64-28.66 64-64V192C480 156.7 451.3 128 416 128zM143.7 238.6C133.1 247.6 133.4 262.8 142.4 272.6l96 104.1c9.062 9.82 26.19 9.82 35.25 0l96-104.1c9-9.758 8.406-24.95-1.344-33.93c-9.781-9.07-24.97-8.414-33.91 1.344L280 298.9V24.02C280 10.76 269.3 0 256 0S232 10.76 232 24.02v274.9l-54.38-58.95C172.9 234.8 166.5 232.3 160 232.3C154.2 232.3 148.3 234.3 143.7 238.6z"/></svg>${translate('Insert')}</div>
  <div role="menuitem" id="default-favorite-prompt-button-${id}" class="flex gap-2 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" stroke="currentColor" fill="currentColor" class="icon icon-md"><path d="M211.8 339.8C200.9 350.7 183.1 350.7 172.2 339.8L108.2 275.8C97.27 264.9 97.27 247.1 108.2 236.2C119.1 225.3 136.9 225.3 147.8 236.2L192 280.4L300.2 172.2C311.1 161.3 328.9 161.3 339.8 172.2C350.7 183.1 350.7 200.9 339.8 211.8L211.8 339.8zM0 96C0 60.65 28.65 32 64 32H384C419.3 32 448 60.65 448 96V416C448 451.3 419.3 480 384 480H64C28.65 480 0 451.3 0 416V96zM48 96V416C48 424.8 55.16 432 64 432H384C392.8 432 400 424.8 400 416V96C400 87.16 392.8 80 384 80H64C55.16 80 48 87.16 48 96z"/></svg>${translate('Set as default')}</div>
  <div role="menuitem" id="edit-favorite-prompt-button-${id}" class="flex gap-2 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor"></path></svg>${translate('Edit')}</div>
  <div role="menuitem" id="remove-favorite-prompt-button-${id}" class="flex gap-2 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Remove from favorites')}</div>
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', menuHTML);
  adjustMenuPosition(document.querySelector('#prompt-action-menu'));
  addPromptActionMenuEventListeners(prompt);
}

// ---------------------------------------------------------------------------
// addPromptActionMenuEventListeners
// Original: content.isolated.end.js line 14802
// ---------------------------------------------------------------------------

/**
 * Wire click handlers for the 5 actions in the prompt context menu.
 */
function addPromptActionMenuEventListeners(prompt: Prompt): void {
  const id = prompt.id;

  // Insert & Run
  document.querySelector(`#run-favorite-prompt-button-${id}`)?.addEventListener('click', async () => {
    if (await canRunPrompts(prompt as any)) {
      runPromptChain(prompt as any, 0, false);
    }
  });

  // Insert only
  document.querySelector(`#insert-favorite-prompt-button-${id}`)?.addEventListener('click', async () => {
    if (await canRunPrompts(prompt as any)) {
      await insertPromptIntoTextArea(prompt as any);
    }
  });

  // Set as default
  document.querySelector(`#default-favorite-prompt-button-${id}`)?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'setDefaultFavoritePrompt', detail: { promptId: prompt.id } }, () => {
      toast('Default favorite prompt is changed', 'success');
      const btn = document.querySelector('#continue-conversation-button');
      if (btn) btn.textContent = prompt.title;
    });
  });

  // Edit
  document.querySelector(`#edit-favorite-prompt-button-${id}`)?.addEventListener('click', () => {
    openPromptEditorModal({ ...prompt, is_favorite: true } as any);
  });

  // Remove from favorites
  document.querySelector(`#remove-favorite-prompt-button-${id}`)?.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { type: 'toggleFavoritePrompt', forceRefresh: true, detail: { promptId: prompt.id } },
      () => {
        toast('Removed prompt from favorites', 'success');
        document.querySelector('#continue-prompt-button-wrapper')?.remove();
        initializeContinueButton(true);
      },
    );
  });
}
