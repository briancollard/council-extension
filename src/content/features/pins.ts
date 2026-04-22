/**
 * Pins feature -- pin/bookmark important messages within a conversation.
 *
 * Includes:
 *   - Pin button injection on each article (next to copy button)
 *   - Toggle pin/unpin state with gold bookmark SVG indicator
 *   - CSS class updates for pinned article highlighting
 *   - Integration with minimap highlight/unhighlight
 *
 * Original source: content.isolated.end.js lines 19568-19653
 */

import type { PinnedMessage } from '../../types/conversation';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getConversationIdFromUrl, errorUpgradeConfirmation } from '../../utils/shared';
import { addTooltip } from '../isolated-world/ui/primitives';
import { highlightMiniMap, unHighlightMiniMap } from './minimap';

// ---------------------------------------------------------------------------
// Create pin buttons for all articles in the current conversation
// ---------------------------------------------------------------------------

/**
 * Scans all `<article>` elements in main, fetches pinned messages for the
 * current conversation, applies pinned CSS classes, and injects a bookmark
 * toggle button next to each article's copy button.
 *
 * @param forceRefresh  When true and pin buttons already exist for every
 *                      article, strips pinned CSS classes instead of returning
 *                      early (used when conversation changes).
 */
export async function createPinButtons(forceRefresh = false): Promise<void> {
  const existingPinBtnCount = document.querySelectorAll(
    'article button[data-testid="pin-message-turn-action-button"]',
  ).length;
  const copyBtnCount = document.querySelectorAll('button[data-testid="copy-turn-action-button"]').length;

  const conversationId = getConversationIdFromUrl();
  if (!conversationId) return;

  const articles = document.querySelectorAll('main article');
  if (articles.length === 0) return;

  const pinnedMessages: PinnedMessage[] | undefined = await chrome.runtime.sendMessage({
    type: 'getAllPinnedMessagesByConversationId',
    detail: { conversationId },
  });

  if (!pinnedMessages || !Array.isArray(pinnedMessages)) return;

  // Apply pinned / unpinned CSS classes to every article
  articles.forEach((article) => {
    article.classList.add('scroll-margin-top-60');
    const msgEl = article.querySelector('[data-message-id]') as HTMLElement | null;
    if (!msgEl) return;
    const { messageId } = msgEl.dataset;

    const isPinned = pinnedMessages.find((p) => p.message_id === messageId);
    if (isPinned) {
      article.classList.add('border-r-pinned', 'bg-pinned', 'dark:bg-pinned', 'border-b');
      article.classList.remove('bg-token-main-surface-primary');
    } else {
      article.classList.add('bg-token-main-surface-primary');
      article.classList.remove('border-r-pinned', 'bg-pinned', 'dark:bg-pinned', 'border-b');
    }
  });

  // If every article already has a pin button, either clear classes or exit
  if (existingPinBtnCount === copyBtnCount) {
    if (forceRefresh) {
      articles.forEach((article) => {
        article.classList.remove('border-r-pinned', 'bg-pinned', 'dark:bg-pinned', 'border-b');
        article.classList.add('bg-token-main-surface-primary');
      });
    } else {
      return;
    }
  }

  // Inject pin buttons into each article
  articles.forEach((article) => {
    article.classList.add('scroll-margin-top-60');
    const msgEl = article.querySelector('[data-message-id]') as HTMLElement | null;
    if (!msgEl) return;
    const { messageId } = msgEl.dataset;
    if (!messageId) return;

    const pinned = pinnedMessages.find((p) => p.message_id === messageId);
    addPinToArticle(article as HTMLElement, messageId, conversationId, pinned);
  });
}

// ---------------------------------------------------------------------------
// Add a single pin button to an article
// ---------------------------------------------------------------------------

/**
 * Creates a bookmark SVG button and inserts it before the copy button inside
 * the given article element.
 *
 * @param article         The `<article>` DOM element
 * @param messageId       The ChatGPT message UUID
 * @param conversationId  The conversation UUID
 * @param pinned          Existing PinnedMessage record, or falsy if not pinned
 */
export function addPinToArticle(
  article: HTMLElement,
  messageId: string,
  conversationId: string,
  pinned: PinnedMessage | false | undefined = false,
): void {
  if (!article || !messageId) return;

  const copyBtn = article.querySelector('button[data-testid="copy-turn-action-button"]') as HTMLElement | null;
  if (!copyBtn) return;

  // Remove existing pin button if present (re-render)
  const existing = article.querySelector('button[data-testid="pin-message-turn-action-button"]');
  if (existing) existing.remove();

  const fillColor = pinned ? 'gold' : 'currentColor';
  const buttonHtml = `<button class="${copyBtn.classList}" aria-label="Pin message" data-testid="pin-message-turn-action-button" data-message-id="${messageId}"><span class="touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="none" class="icon icon-sm"><path fill="${fillColor}" d="M336 0h-288C21.49 0 0 21.49 0 48v431.9c0 24.7 26.79 40.08 48.12 27.64L192 423.6l143.9 83.93C357.2 519.1 384 504.6 384 479.9V48C384 21.49 362.5 0 336 0zM336 452L192 368l-144 84V54C48 50.63 50.63 48 53.1 48h276C333.4 48 336 50.63 336 54V452z"></path></svg></span></button>`;

  copyBtn.insertAdjacentHTML('beforebegin', buttonHtml);

  // Set parent container ID and remove mask so pin button is always visible
  if (copyBtn.parentElement) {
    copyBtn.parentElement.id = `message-actions-${messageId}`;
    copyBtn.parentElement.style.maskImage = 'none';
  }

  const pinBtn = article.querySelector('button[data-testid="pin-message-turn-action-button"]') as HTMLElement;
  addTooltip(pinBtn, { value: 'Pin message', position: 'bottom' });
  addArticlePinButtonEventListener(article, pinBtn, messageId, conversationId);
}

// ---------------------------------------------------------------------------
// Pin button click handler
// ---------------------------------------------------------------------------

/**
 * Attaches a click listener to the pin button that toggles the pin state.
 *
 * When pinned (gold fill):
 *   - Sends `deletePinnedMessage` message
 *   - Removes pinned CSS classes from the article
 *   - Calls `unHighlightMiniMap`
 *
 * When unpinned:
 *   - Sends `addPinnedMessage` message with the message text
 *   - On success, adds pinned CSS classes
 *   - Calls `highlightMiniMap`
 *   - On limit error, shows upgrade confirmation
 */
export function addArticlePinButtonEventListener(
  article: HTMLElement,
  pinBtn: HTMLElement,
  messageId: string,
  conversationId: string,
): void {
  pinBtn?.addEventListener('click', async () => {
    const btn = article.querySelector('button[data-testid="pin-message-turn-action-button"]') as HTMLElement | null;
    if (!btn) return;

    const path = btn.querySelector('svg > path') as SVGPathElement | null;
    if (!path) return;

    if (path.getAttribute('fill') === 'gold') {
      // --- Unpin ---
      chrome.runtime.sendMessage({
        type: 'deletePinnedMessage',
        detail: { messageId },
      });

      const actionsEl = document.querySelector(`#message-actions-${messageId}`);
      if (actionsEl) actionsEl.classList.remove('opacity-100');

      path.setAttribute('fill', 'currentColor');
      article.classList.remove('border-r-pinned', 'bg-pinned', 'dark:bg-pinned', 'border-b');
      article.classList.add('bg-token-main-surface-primary');
      unHighlightMiniMap(messageId);
    } else {
      // --- Pin ---
      const msgEl = document.querySelector(`main article [data-message-id="${messageId}"]`) as HTMLElement | null;

      chrome.runtime.sendMessage(
        {
          type: 'addPinnedMessage',
          detail: {
            messageId,
            conversationId,
            message: msgEl?.parentElement?.innerText ?? '',
          },
        },
        (response: any) => {
          if (response?.error && response.error.type === 'limit') {
            errorUpgradeConfirmation(response.error);
            return;
          }

          const actionsEl = document.querySelector(`#message-actions-${messageId}`);
          if (actionsEl) actionsEl.classList.add('opacity-100');

          path.setAttribute('fill', 'gold');
          article.classList.remove('bg-token-main-surface-primary');
          article.classList.add('border-r-pinned', 'bg-pinned', 'dark:bg-pinned', 'border-b');
          highlightMiniMap(messageId);
        },
      );
    }
  });
}
