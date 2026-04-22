/**
 * Navigation feature -- navbar initialization and random conversation opening.
 *
 * Original source: content.isolated.end.js
 *   - initializeNavbar: line 14244
 *   - openRandomConversation: line 22476
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getConversationIdFromUrl } from '../../utils/shared';
import { addInstructionDropdowns } from './instruction-dropdowns';
import { removeMiniMap } from './minimap';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the Council navbar by prepending an instruction-dropdown
 * wrapper into the conversation header actions bar.
 *
 * Original: content.isolated.end.js line 14244
 */
export function initializeNavbar(): void {
  if (document.querySelector('#gptx-nav-wrapper')) return;

  const headerActions = document.querySelector('#conversation-header-actions') as HTMLElement | null;
  if (!headerActions) return;

  // Remove overflow clipping from parent containers
  (headerActions.parentElement as HTMLElement)?.classList.remove('overflow-x-hidden');
  (headerActions.parentElement?.parentElement as HTMLElement)?.classList.remove('overflow-x-hidden');

  // Style the page header
  const pageHeader = document.querySelector('#page-header') as HTMLElement | null;
  if (pageHeader) {
    pageHeader.style.boxShadow = 'var(--sharp-edge-top-shadow) !important';
    pageHeader.style.backgroundColor = 'var(--main-surface-primary) !important';
    const main = document.querySelector('main') as HTMLElement | null;
    if (main) {
      pageHeader.style.width = main.style.width;
    }
  }

  const conversationId = getConversationIdFromUrl();
  const pathname = window.location.pathname;
  const isProject = pathname.startsWith('/g/g-p-') && pathname.endsWith('/project');

  // Only render if we have a conversation, are on the home page, or on a project page
  if (!conversationId && pathname !== '/' && !isProject) return;

  const navWrapper = document.createElement('div');
  navWrapper.id = 'gptx-nav-wrapper';
  navWrapper.className = 'bg-transparent flex items-center justify-end px-3 gap-2 ';
  headerActions.prepend(navWrapper);

  addInstructionDropdowns(navWrapper);
}

/**
 * Navigate to a random conversation. Fetches a random conversation ID
 * via the background script and navigates to it.
 *
 * Original: content.isolated.end.js line 22476
 */
export async function openRandomConversation(): Promise<void> {
  removeMiniMap();

  const result = await chrome.runtime.sendMessage({
    type: 'getRandomConversationId',
    forceRefresh: true,
    detail: {},
  });

  window.history.pushState({}, '', `/c/${result.conversation_id}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}
