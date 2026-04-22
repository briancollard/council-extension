/**
 * Timestamps & counters feature — date dividers, message timestamps,
 * and character/word count indicators.
 *
 * - addDateDividersInConversation: inserts date separator divs between
 *   messages on different days
 * - addMessageTimestamps: adds a timestamp below assistant messages using
 *   IntersectionObserver for lazy rendering
 * - addMessageCharWordCounters: adds "N chars - N words" indicators
 *
 * Original source: content.isolated.end.js lines 22279-22475
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  getConversationIdFromUrl,
  formatTime,
  formatDate,
  getCharCount,
  getWordCount,
  getThreadLeftButton,
  getThreadRightButton,
} from '../../utils/shared';
import { showConfirmDialog } from '../isolated-world/ui/primitives';
import { getConversationById, deleteConversation } from '../isolated-world/api';
import { updateConversationFolderCount, noConversationElement } from './folders';
import { startNewChat } from './prompts';
import { createPinButtons } from './pins';
import { createConversationMiniMap } from './minimap';
import { cachedSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let lastMessageDateString: string | null = null;

// ---------------------------------------------------------------------------
// Date dividers
// ---------------------------------------------------------------------------

/**
 * Insert date divider elements between conversation messages that fall on
 * different calendar dates.
 */
export async function addDateDividersInConversation(): Promise<void> {
  const existing = document.querySelectorAll('#conversation-date-divider');

  if (!cachedSettings.showDateDividersInConversation) {
    existing.forEach((el) => el.remove());
    return;
  }

  if (existing.length > 0) return;

  const convId = getConversationIdFromUrl();
  if (!convId) return;

  const main = document.querySelector('main');
  if (!main) return;

  const articles = main.querySelectorAll('article');
  if (articles.length === 0) return;

  const conv = await getConversationById(convId);

  lastMessageDateString = null;

  Array.from(articles).forEach((article) => {
    const userDiv = article.querySelector('div[data-message-author-role="user"]');
    if (!userDiv) return;

    const messageId = userDiv.getAttribute('data-message-id');
    const mapping = conv?.mapping[messageId!];
    if (!mapping) return;

    const date = new Date(formatTime(mapping?.message?.create_time));
    const dateStr = formatDate(date, false, true);

    if (!lastMessageDateString || dateStr !== lastMessageDateString) {
      lastMessageDateString = dateStr;

      const divider = document.createElement('div');
      divider.id = 'conversation-date-divider';
      divider.classList.value = 'flex items-center my-4';
      divider.style.userSelect = 'none';
      divider.innerHTML = `<div class="flex-grow border-t border-token-border-secondary"></div><div class="px-3 text-token-text-secondary text-sm">${dateStr}</div><div class="flex-grow border-t border-token-border-secondary"></div>`;

      article.parentNode!.insertBefore(divider, article);
    }
  });
}

/**
 * Add a "Today" date divider above the last user message (used when the
 * user sends a new message in an existing conversation).
 */
export function addDateDividerToLastUserMessage(article: Element | null): void {
  if (!cachedSettings.showDateDividersInConversation || !article || lastMessageDateString === 'Today') return;

  lastMessageDateString = 'Today';

  const divider = document.createElement('div');
  divider.id = 'conversation-date-divider';
  divider.classList.value = 'flex items-center my-4';
  divider.style.userSelect = 'none';
  divider.innerHTML =
    '<div class="flex-grow border-t border-token-border-secondary"></div><div class="px-3 text-token-text-secondary text-sm">Today</div><div class="flex-grow border-t border-token-border-secondary"></div>';

  article.parentNode!.insertBefore(divider, article);
}

/**
 * Remove all date divider elements from the conversation.
 */
export function removeDateDividersInConversation(): void {
  document.querySelectorAll('#conversation-date-divider').forEach((el) => el.remove());
}

// ---------------------------------------------------------------------------
// Message timestamps
// ---------------------------------------------------------------------------

/**
 * Add timestamp indicators below assistant messages. Uses
 * IntersectionObserver to lazily render only visible articles.
 */
export async function addMessageTimestamps(): Promise<void> {
  if (!cachedSettings.showMessageTimestamp) return;

  const convId = getConversationIdFromUrl();
  const main = document.querySelector('main');
  if (!main) return;

  const articles = main.querySelectorAll('article');
  if (!convId || articles.length === 0) return;

  const assistantDivs = main.querySelectorAll('article div[data-message-author-role="assistant"]');
  if (convId && assistantDivs.length === 0) return;

  const conv = await getConversationById(convId);

  if (document.querySelectorAll('#message-timestamp').length !== assistantDivs.length) {
    articles.forEach((article) => {
      new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              addMessageTimestamp(conv, entry.target as HTMLElement);
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0 },
      ).observe(article);
    });
  }
}

function addMessageTimestamp(conv: any, article: HTMLElement): void {
  if (!conv || !article) return;

  const assistantDivs = article.querySelectorAll('div[data-message-author-role=assistant]');
  if (assistantDivs.length === 0) return;

  const lastDiv = assistantDivs[assistantDivs.length - 1] as HTMLElement;
  lastDiv.classList.add('relative');

  const messageId = lastDiv.getAttribute('data-message-id');
  const mapping = conv?.mapping[messageId!];

  const dateStr = formatDate(mapping ? new Date(formatTime(mapping?.message?.create_time)) : new Date());

  const existing = lastDiv.querySelector('#message-timestamp') as HTMLElement | null;
  if (existing && existing.innerText.includes(dateStr)) return;
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'message-timestamp';
  el.classList.value = 'text-xs text-token-text-tertiary';
  el.style.userSelect = 'none';

  const counter = lastDiv.querySelector('#message-char-word-counter');
  el.textContent = dateStr;
  if (counter) {
    el.innerHTML = `${dateStr} <span id="message-timestamp-separator" style="margin-left: 8px;">\u2022</span>`;
  }

  let wrapper = lastDiv.querySelector('div[id="message-info-wrapper"]') as HTMLElement | null;
  if (wrapper) {
    wrapper.prepend(el);
    return;
  }

  wrapper = document.createElement('div');
  wrapper.id = 'message-info-wrapper';
  wrapper.classList.value = 'relative w-full absolute end-0 flex justify-end gap-2';
  wrapper.style.bottom = '-32px';
  wrapper.prepend(el);
  lastDiv.appendChild(wrapper);
}

/**
 * Remove all message timestamp elements.
 */
export function removeMessageTimestamps(): void {
  document.querySelectorAll('#message-timestamp').forEach((el) => el.remove());
}

// ---------------------------------------------------------------------------
// Character & word counters
// ---------------------------------------------------------------------------

/**
 * Add character + word count indicators below assistant messages.
 * Uses IntersectionObserver for lazy rendering.
 */
export function addMessageCharWordCounters(): void {
  if (!cachedSettings.showMessageCharWordCount) return;

  const convId = getConversationIdFromUrl();
  const main = document.querySelector('main');
  if (!main) return;

  const articles = main.querySelectorAll('article');
  if (!convId || articles.length === 0) return;

  const assistantDivs = main.querySelectorAll('article div[data-message-author-role="assistant"]');
  if (convId && assistantDivs.length === 0) return;

  if (document.querySelectorAll('#message-char-word-counter').length === assistantDivs.length) return;

  articles.forEach((article) => {
    new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            addMessageCharWordCounter(entry.target as HTMLElement);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0 },
    ).observe(article);
  });
}

function addMessageCharWordCounter(article: HTMLElement): void {
  if (!article) return;

  const assistantDivs = article.querySelectorAll('div[data-message-author-role=assistant]');
  if (assistantDivs.length === 0) return;

  const lastDiv = assistantDivs[assistantDivs.length - 1] as HTMLElement;
  if (!lastDiv) return;

  lastDiv.classList.add('relative');

  let fullText = '';
  assistantDivs.forEach((div) => {
    fullText += ` ${
      (div as HTMLElement)?.firstChild ? ((div as HTMLElement).firstChild as HTMLElement)?.innerText || '' : ''
    }`;
  });

  const chars = getCharCount(fullText);
  const words = getWordCount(fullText);
  const label = `${chars} chars \u2022 ${words} words`;

  const existing = lastDiv.querySelector('#message-char-word-counter') as HTMLElement | null;
  if (existing && existing.innerText === label) return;
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'message-char-word-counter';
  el.classList.value = 'text-xs text-token-text-tertiary';
  el.style.userSelect = 'none';
  el.textContent = label;

  const timestamp = lastDiv.querySelector('#message-timestamp') as HTMLElement | null;
  if (timestamp && !timestamp.querySelector('#message-timestamp-separator')) {
    const sep = document.createElement('span');
    sep.id = 'message-timestamp-separator';
    sep.style.marginLeft = '8px';
    sep.textContent = '\u2022';
    timestamp.appendChild(sep);
  }

  let wrapper = lastDiv.querySelector('div[id="message-info-wrapper"]') as HTMLElement | null;
  if (wrapper) {
    wrapper.appendChild(el);
    return;
  }

  wrapper = document.createElement('div');
  wrapper.id = 'message-info-wrapper';
  wrapper.classList.value = 'relative w-full absolute end-0 flex justify-end gap-2';
  wrapper.style.bottom = '-32px';
  wrapper.appendChild(el);
  lastDiv.appendChild(wrapper);
}

/**
 * Remove all character/word counter elements and timestamp separators.
 */
export function removeMessageCharWordCounters(): void {
  document.querySelectorAll('#message-char-word-counter').forEach((el) => el.remove());
  document.querySelectorAll('#message-timestamp-separator').forEach((el) => el.remove());
  document.querySelectorAll('#message-timestamp').forEach((el) => {
    (el as HTMLElement).style.right = '0px';
  });
}

// ---------------------------------------------------------------------------
// Thread edit button listener
// ---------------------------------------------------------------------------

/**
 * Listen for clicks on thread navigation buttons (left/right arrows, edit confirm)
 * and re-run pin buttons and minimap after the thread changes.
 *
 * Original source: content.isolated.end.js lines 22283-22294
 */
export function addThreadEditButtonEventListener(): void {
  document.body.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement)?.closest('button') as HTMLElement | null;
    if (!btn || !btn.closest('article')) return;

    const leftBtn = getThreadLeftButton(btn);
    const rightBtn = getThreadRightButton(btn);
    const isPrimaryAction = btn.classList?.contains('btn-primary') && btn.innerText;

    if (leftBtn || rightBtn || isPrimaryAction) {
      setTimeout(
        async () => {
          await createPinButtons(true);
          createConversationMiniMap(true);
        },
        isPrimaryAction ? 500 : 100,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Delete conversation flow
// ---------------------------------------------------------------------------

/**
 * Show a confirmation dialog and delete the conversation on confirm.
 * Notifies the background to remove from the backend, then cleans up UI elements.
 *
 * Original source: content.isolated.end.js lines 22296-22307
 */
export function handleDeleteConversation(conversationId: string | null): void {
  if (!conversationId) return;

  showConfirmDialog(
    'Delete conversation',
    'Are you sure you want to delete this conversation?',
    'Cancel',
    'Delete',
    null,
    () => {
      updateConversationFolderCount(null, [conversationId]);
      chrome.runtime.sendMessage(
        {
          type: 'deleteConversations',
          detail: { conversationIds: [conversationId] },
        },
        () => {
          deleteConversation(conversationId);
          removeConversationElements(conversationId);
        },
      );
    },
  );
}

// ---------------------------------------------------------------------------
// Remove / rename conversation elements in sidebar and manager
// ---------------------------------------------------------------------------

/**
 * Remove all UI references to a conversation after deletion:
 * nav sidebar link, conversation manager card, folder content.
 * Navigates to new chat if the deleted conversation was active.
 *
 * Original source: content.isolated.end.js lines 22309-22322
 */
export function removeConversationElements(conversationId: string): void {
  const { showFoldersInLeftSidebar } = cachedSettings;

  // Remove from left sidebar nav
  const navLink = document.querySelector(`nav a[href$="/c/${conversationId}"]`);
  if (showFoldersInLeftSidebar && navLink) navLink.remove();

  // Remove from conversation manager
  document.querySelectorAll(`#conversation-card-${conversationId}`).forEach((el) => el.remove());

  // Show empty state if manager list is empty
  const managerList = document.querySelector('#modal-manager #conversation-manager-conversation-list');
  if (managerList && managerList.children.length === 0) {
    managerList.appendChild(noConversationElement());
  }

  // Show empty state if folder content is empty
  const folderContent = document.querySelector('#sidebar-folder-content');
  if (folderContent && folderContent.children.length === 0) {
    folderContent.appendChild(noConversationElement());
  }

  // Navigate away if viewing the deleted conversation
  const currentId = getConversationIdFromUrl();
  if (showFoldersInLeftSidebar && currentId === conversationId) {
    startNewChat();
  }
}

/**
 * Update the title text of a conversation in the sidebar nav.
 *
 * Original source: content.isolated.end.js lines 22324-22329
 */
export function renameConversationElements(conversationId: string, newTitle: string): void {
  const navDiv = document.querySelector(`nav a[href$="/c/${conversationId}"] div`);
  if (!navDiv) return;

  navDiv.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = newTitle;
    }
  });
}
