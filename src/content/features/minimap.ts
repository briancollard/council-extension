/**
 * Minimap feature -- scrollable overview of all messages in a conversation.
 *
 * Includes:
 *   - Mini article bars proportional to message height
 *   - Hover preview with cloned message content
 *   - Click-to-scroll navigation
 *   - Pin/bookmark highlight on minimap bars
 *   - Article intersection observers for active indicator
 *   - Continue generating button with favorite prompt support
 *
 * Original source: content.isolated.end.js lines 14314-15065
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  getConversationIdFromUrl,
  isDarkMode,
  flashArticle,
  adjustMenuPosition,
  formatDate,
  formatTime,
  getCharCount,
  getWordCount,
} from '../../utils/shared';
import { addTooltip } from '../isolated-world/ui/primitives';
import { getConversationById } from '../isolated-world/api';
import { cachedSettings } from '../isolated-world/settings';
import { promptDropdown, fetchFavoritePrompts } from './prompt-favorites';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let lastConvIDForMinimap: string | null = null;
export const articleObservers: IntersectionObserver[] = [];

// ---------------------------------------------------------------------------
// Ported helpers
// ---------------------------------------------------------------------------

/**
 * Remove the minimap element from the DOM and disconnect all article
 * intersection observers.
 *
 * Original: content.isolated.end.js line 14308
 */
export function removeMiniMap(): void {
  const wrapper = document.querySelector('#minimap-wrapper');
  if (wrapper) wrapper.remove();

  articleObservers.forEach((observer) => {
    observer.disconnect();
  });
}

// ---------------------------------------------------------------------------
// Minimap creation
// ---------------------------------------------------------------------------

export async function createConversationMiniMap(forceRefresh = false, append = false): Promise<void> {
  const existing = document.querySelector('#minimap-wrapper');
  if (!cachedSettings?.showMiniMap) {
    removeMiniMap();
    return;
  }

  const conversationId = getConversationIdFromUrl();
  if (!conversationId) {
    removeMiniMap();
    return;
  }

  if (existing && conversationId === lastConvIDForMinimap && !forceRefresh && !append) return;

  removeMiniMap();
  lastConvIDForMinimap = conversationId;

  const conversation = await getConversationById(conversationId);
  const wrapper = document.createElement('div');
  wrapper.id = 'minimap-wrapper';
  wrapper.classList.value = 'absolute top-0 start-0 z-50 flex flex-col items-start transition-all duration-300';
  wrapper.style.padding = '60px 0 170px 0';
  wrapper.style.height = '100%';

  const dark = isDarkMode();
  const mainContainer = document.querySelector('div[class*="@container/main"]') as HTMLElement;

  mainContainer.querySelectorAll('article').forEach((article) => {
    const dataEl = article.querySelector('div[data-message-author-role]') as HTMLElement | null;
    if (!dataEl) return;

    const messageId = dataEl.dataset?.messageId;
    if (!messageId) return;

    // If appending, skip already-rendered messages
    if (append && document.querySelector(`#minimap-wrapper #mini-article-${messageId}`)) return;

    // Ensure max-width on first child
    if (dataEl.firstChild && (dataEl.firstChild as HTMLElement).firstChild) {
      ((dataEl.firstChild as HTMLElement).firstChild as HTMLElement).style.maxWidth = '100%';
    }

    const isUser = dataEl.dataset.messageAuthorRole === 'user';
    const miniWrapper = document.createElement('div');
    miniWrapper.id = `mini-article-wrapper-${messageId}`;
    miniWrapper.classList.value = `flex flex-col relative ${isUser ? 'pt-1.5' : 'pt-0.5'}`;

    // Proportional height
    const parentHeight = article.parentElement?.offsetHeight || 1;
    const proportion = Math.max((article.offsetHeight * (mainContainer.offsetHeight - 240)) / parentHeight, 10);
    miniWrapper.style.height = `${proportion}%`;

    // Click to scroll
    miniWrapper.addEventListener('click', () => {
      flashArticle(article, 'up');
    });

    // Hover preview
    miniWrapper.addEventListener('mouseenter', () => {
      if (miniWrapper.querySelector('#floating-article-preview')) return;

      const preview = document.createElement('div');
      preview.id = 'floating-article-preview';
      preview.classList.value = `absolute top-0 start-6 z-50 p-3 pb-8 bg-token-main-surface-secondary rounded-md shadow-md overflow-hidden text-xs border border-token-border-medium ${isUser ? 'mt-1.5' : 'mt-0.5'}`;
      preview.style.width = '500px';
      preview.style.maxWidth = '90vw';
      preview.style.minHeight = '100px';

      const contentHeight = Math.min(
        Math.max(dataEl.parentElement?.offsetHeight ?? 0, (dataEl.firstChild as HTMLElement)?.offsetHeight ?? 0),
        300,
      );
      preview.style.height = contentHeight !== 0 ? `${contentHeight}px` : '300px';
      preview.style.maxHeight = `${Math.max(miniWrapper.offsetHeight, 300)}px`;

      const clone = dataEl.parentElement?.cloneNode(true) as HTMLElement | undefined;
      if (clone) {
        clone.id = `article-preview-${messageId}`;
        clone.style.width = '100%';
        clone.style.height = '100%';
        clone.style.overflow = 'scroll';
        preview.appendChild(clone);
      }

      // Clean up cloned elements
      preview.querySelectorAll('.relative').forEach((el) => {
        el.classList.remove('max-w-[var(--user-chat-width,70%)]', 'px-5', 'py-2.5', 'bg-token-message-surface');
      });
      preview
        .querySelectorAll(
          '#message-char-word-counter, #message-timestamp, #message-instructions, div[id^="message-actions-"]',
        )
        .forEach((el) => el.remove());
      preview.querySelector('div[data-message-author-role]')?.classList.remove('bottom-fade-blur');

      miniWrapper.appendChild(preview);

      // Adjust height after render
      const previewContent = preview
        .querySelector(`#article-preview-${messageId}`)
        ?.querySelector('div[data-message-author-role]') as HTMLElement | null;
      if (previewContent) {
        preview.style.height = `${Math.min(previewContent.offsetHeight, 300)}px`;
      }
      adjustMenuPosition(document.querySelector('#floating-article-preview'));

      // Fade gradient at bottom
      const fade = document.createElement('div');
      fade.classList.value = 'absolute bottom-0 start-0 end-0 h-24';
      fade.style.maxHeight = '50%';
      fade.style.background = dark
        ? 'linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(10, 10, 10, 1))'
        : 'linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1))';

      const infoBar = document.createElement('div');
      infoBar.classList.value = 'flex items-end justify-end gap-2 text-xs text-token-text-tertiary w-full h-full p-2';
      fade.appendChild(infoBar);

      // Timestamp
      const messageIds = article.querySelectorAll('div[data-message-author-role]');
      const lastMessageId = (messageIds[messageIds.length - 1] as HTMLElement | undefined)?.dataset.messageId;
      const node = lastMessageId ? conversation?.mapping[lastMessageId] : null;
      const dateStr = formatDate(node ? new Date(formatTime(node?.message?.create_time)) : new Date());
      const dateEl = document.createElement('div');
      dateEl.innerHTML = `${dateStr} <span style="margin: 0 8px;">\u2022</span>`;
      infoBar.appendChild(dateEl);

      // Word/char count
      const text = preview.firstChild?.textContent || '';
      const chars = getCharCount(text);
      const words = getWordCount(text);
      const statsEl = document.createElement('div');
      statsEl.textContent = `${chars} chars \u2022 ${words} words`;
      infoBar.appendChild(statsEl);

      preview.appendChild(fade);
    });

    miniWrapper.addEventListener('mouseleave', () => {
      document.querySelectorAll('#floating-article-preview').forEach((el) => el.remove());
    });

    // Mini bar
    const isPinned = article.classList.contains('bg-pinned');
    const miniBar = document.createElement('div');
    miniBar.id = `mini-article-${messageId}`;
    miniBar.classList.value = `${isPinned ? 'bg-gold' : 'bg-token-main-surface-tertiary'} w-4 hover:w-6 ${isUser ? 'rounded-te-md' : 'rounded-be-md'} cursor-pointer transition-all duration-300 ms-auto h-full`;
    miniWrapper.appendChild(miniBar);

    wrapper.appendChild(miniWrapper);
  });

  mainContainer.appendChild(wrapper);
}

// ---------------------------------------------------------------------------
// Minimap highlight helpers
// ---------------------------------------------------------------------------

export function highlightMiniMap(messageId: string): void {
  const bar = document.querySelector(`#minimap-wrapper #mini-article-${messageId}`);
  if (bar) bar.classList.replace('bg-token-main-surface-tertiary', 'bg-gold');
}

export function unHighlightMiniMap(messageId: string): void {
  const bar = document.querySelector(`#minimap-wrapper #mini-article-${messageId}`);
  if (bar) bar.classList.replace('bg-gold', 'bg-token-main-surface-tertiary');
}

// ---------------------------------------------------------------------------
// Article intersection observer (active indicator on minimap)
// ---------------------------------------------------------------------------

export function observeArticle(article: HTMLElement): void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const messageId = (article.querySelector('div[data-message-author-role]') as HTMLElement | null)?.dataset
          ?.messageId;
        if (!messageId) return;

        const allMiniBars = document.querySelectorAll('#minimap-wrapper div[id^="mini-article-"]');
        const thisBar = document.querySelector(`#minimap-wrapper #mini-article-${messageId}`);
        if (!thisBar) return;

        if (entry.isIntersecting) {
          allMiniBars.forEach((bar) => bar.classList.replace('w-6', 'w-4'));
          thisBar.classList.replace('w-4', 'w-6');
        } else {
          thisBar.classList.replace('w-6', 'w-4');
        }
      });
    },
    { threshold: article.offsetHeight > window.innerHeight ? 0.1 : 1 },
  );

  articleObservers.push(observer);
  observer.observe(article);
}

// ---------------------------------------------------------------------------
// Continue button (favorite prompts quick-access)
// ---------------------------------------------------------------------------

export async function initializeContinueButton(forceRefresh = false): Promise<void> {
  const existing = document.querySelector('#continue-conversation-button-wrapper');
  if (!cachedSettings.showFavoritePromptsButton) {
    existing?.remove();
    return;
  }
  if (existing) {
    if (!forceRefresh) return;
    existing.remove();
  }

  // Reset autoClick on load
  if (cachedSettings?.autoClick) {
    chrome.storage.local.set({ settings: { ...cachedSettings, autoClick: false } });
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'z-index:20;left:0;top:-44px;';
  wrapper.id = 'continue-conversation-button-wrapper';
  wrapper.classList.value = 'absolute flex shadow-long rounded-full';

  // Dropdown trigger button
  const dropdownBtn = document.createElement('button');
  dropdownBtn.textContent = '\u22EE';
  dropdownBtn.id = 'continue-conversation-dropdown-button';
  dropdownBtn.type = 'button';
  dropdownBtn.style.cssText = 'width:38px;border-top-right-radius:0;border-bottom-right-radius:0;z-index:2;';
  dropdownBtn.classList.value =
    'btn flex justify-center gap-2 btn-secondary border-0 border-r bg-token-main-surface-secondary';
  addTooltip(dropdownBtn, { value: 'Select Favorite Prompt', position: 'top' });

  dropdownBtn.addEventListener('click', () => {
    const dd = document.querySelector('#favorite-prompts-dropdown-wrapper');
    if (!dd) return;
    if (dd.classList.contains('block')) {
      dd.classList.replace('block', 'hidden');
    } else {
      dd.classList.replace('hidden', 'block');
      const btnTop = dropdownBtn.getBoundingClientRect().top;
      const ddHeight = (dd as HTMLElement).offsetHeight;
      (dd as HTMLElement).style.bottom = btnTop < ddHeight + 5 ? `${-(ddHeight + 5)}px` : '40px';
    }
  });

  // Main continue button
  const continueBtn = document.createElement('button');
  chrome.runtime.sendMessage({ type: 'getDefaultFavoritePrompt' }, (prompt) => {
    const p = prompt?.steps ? prompt : null;
    const stepsText = p ? p.steps.map((s: string, i: number) => `step ${i + 1}:\n${s}`).join('\n') : '';
    continueBtn.title = p ? `${p.title}\n\n${stepsText}` : 'No default selected';
    continueBtn.textContent = p?.title || 'No default selected';
  });
  continueBtn.id = 'continue-conversation-button';
  continueBtn.type = 'button';
  continueBtn.dir = 'auto';
  continueBtn.classList.value =
    'btn block justify-center gap-2 btn-secondary border-0 max-w-10 truncate bg-token-main-surface-secondary';
  continueBtn.style.cssText = 'width:96px;border-radius:0;border-left:0;z-index:1;text-transform: capitalize;';

  continueBtn.addEventListener('click', (e) => {
    chrome.runtime.sendMessage({ type: 'getDefaultFavoritePrompt' }, async (prompt) => {
      if (!prompt || !prompt.id) {
        // toast('No default prompt found', 'error');
        return;
      }
      if (document.querySelector('#prompt-textarea')) {
        // shift+click inserts without running for single-step prompts
        if (e.shiftKey && prompt.steps.length === 1) {
          // insertPromptIntoTextArea(prompt)
        } else {
          // runPromptChain(prompt, 0, false)
        }
      }
    });
  });

  // Auto-click toggle button
  const autoClickBtn = document.createElement('button');
  autoClickBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-width="2" viewBox="0 0 512 512" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M256 464c114.9 0 208-93.1 208-208s-93.1-208-208-208S48 141.1 48 256c0 5.5 .2 10.9 .6 16.3L1.8 286.1C.6 276.2 0 266.2 0 256C0 114.6 114.6 0 256 0S512 114.6 512 256s-114.6 256-256 256c-10.2 0-20.2-.6-30.1-1.8l13.8-46.9c5.4 .4 10.8 .6 16.3 .6zm-2.4-48l14.3-48.6C324.2 361.4 368 313.8 368 256c0-61.9-50.1-112-112-112c-57.8 0-105.4 43.8-111.4 100.1L96 258.4c0-.8 0-1.6 0-2.4c0-88.4 71.6-160 160-160s160 71.6 160 160s-71.6 160-160 160c-.8 0-1.6 0-2.4 0zM39 308.5l204.8-60.2c12.1-3.6 23.4 7.7 19.9 19.9L203.5 473c-4.1 13.9-23.2 15.6-29.7 2.6l-28.7-57.3c-.7-1.3-1.5-2.6-2.5-3.7l-88 88c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l88-88c-1.1-1-2.3-1.9-3.7-2.5L36.4 338.2c-13-6.5-11.3-25.6 2.6-29.7z"/></svg>';
  autoClickBtn.id = 'auto-click-button';
  autoClickBtn.type = 'button';
  autoClickBtn.style.cssText = 'width:38px;border-top-left-radius:0;border-bottom-left-radius:0;z-index:1;padding:0;';
  addTooltip(autoClickBtn, {
    value: () => (cachedSettings?.autoClick ? 'Auto Click is ON' : 'Auto Click is OFF'),
    position: 'top',
  });
  autoClickBtn.classList.value =
    'btn flex justify-center gap-2 btn-secondary border-0 border-l bg-token-main-surface-secondary';

  autoClickBtn.addEventListener('click', () => {
    cachedSettings.autoClick = !cachedSettings.autoClick;
    chrome.storage.local.set({ settings: cachedSettings }, () => {
      if (cachedSettings.autoClick) {
        autoClickBtn.classList.add('composer-submit-btn', 'composer-submit-button-color');
        autoClickBtn.classList.remove(
          'btn-secondary',
          'bg-token-main-surface-secondary',
          'hover:bg-token-main-surface-tertiary',
        );
      } else {
        autoClickBtn.classList.remove('composer-submit-btn', 'composer-submit-button-color');
        autoClickBtn.classList.add(
          'btn-secondary',
          'bg-token-main-surface-secondary',
          'hover:bg-token-main-surface-tertiary',
        );
      }
    });
  });

  wrapper.appendChild(dropdownBtn);
  wrapper.appendChild(continueBtn);
  wrapper.appendChild(autoClickBtn);

  // Favorites dropdown — hidden by default, toggled by dropdownBtn
  const favDropdown = promptDropdown();
  wrapper.appendChild(favDropdown);
  fetchFavoritePrompts();

  const form = document.querySelector('main form') as HTMLElement | null;
  const isProject = window.location.pathname.startsWith('/g/g-p-') && window.location.pathname.endsWith('/project');
  if (form) {
    form.style.marginTop = isProject ? '8px' : '20px';
    form.prepend(wrapper);
  }
}
