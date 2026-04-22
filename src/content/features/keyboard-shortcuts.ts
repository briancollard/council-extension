/**
 * Keyboard Shortcuts feature — register global hotkeys for common actions.
 *
 * Original source: content.isolated.end.js lines 12084-12320
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { isWindows, getConversationIdFromUrl, closeMenus, closeRadix } from '../../utils/shared';
import { toast } from '../isolated-world/ui/primitives';
import { scrollUpOneArticle, scrollDownOneArticle } from '../isolated-world/ui/floating-buttons';
import { getConversationById } from '../isolated-world/api';
import { handleDeleteConversation } from './timestamps';
import {
  openMoveConvToFolderModal,
  addConversationToSidebarFolder,
  replaceConversationInSidebarFolder,
  getLastSelectedConversationFolder,
} from './folders';
import { saveConversationAsPDF, openExportModal, handleCopyHtml } from './export';
import { stopAllAudios } from './speech';
import { addPromptInputKeyDownEventListeners, addPromptInputKeyUpEventListeners } from './prompts';
import { allImageNodes, selectedGalleryImage } from './gallery';

import { openRandomConversation } from './navigation';
import { createManager, createSettingsModal, createKeyboardShortcutsModal } from './manager';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register all keyboard shortcuts.
 *
 * Sets up keydown + keyup listeners on `document` (capture phase) that
 * match against a table of Cmd/Ctrl+Shift combos plus special keys.
 */
export async function registerShortkeys(): Promise<void> {
  // -----------------------------------------------------------------------
  // keydown handler
  // -----------------------------------------------------------------------
  document.addEventListener(
    'keydown',
    async (e: KeyboardEvent) => {
      const metaOrCtrl = e.metaKey || (isWindows() && e.ctrlKey);

      // Cmd+Shift+> — Settings modal
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 190 && !e.repeat) {
        if (!document.querySelector('#modal-settings')) {
          e.preventDefault();
          e.stopPropagation();
          createSettingsModal();
        }
        return;
      }

      // Cmd+Shift+L — Newsletters
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 76 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        createManager('newsletters');
        return;
      }

      // Cmd+Shift+Y — Gallery (fullscreen)
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 89 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        createManager('gallery', true);
        return;
      }

      // Cmd+Shift+K — Keyboard shortcuts modal
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 75 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        if (!document.querySelector('#modal-keyboard-shortcuts')) {
          createKeyboardShortcutsModal();
        }
        return;
      }

      // Cmd+Shift+P — Prompts manager
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 80 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        createManager('prompts');
        return;
      }

      // Cmd+Shift+X — Conversations manager
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 88 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        createManager('conversations');
        return;
      }

      // Cmd+Shift+F — GPT Store
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 70 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        createManager('gpts');
        return;
      }

      // Cmd+Shift+I — Custom instruction profiles
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 73 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        createManager('custom-instruction-profiles');
        return;
      }

      // Cmd+Shift+M — Pinned messages
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 77 && !e.repeat) {
        e.preventDefault();
        createManager('pinned-messages');
        return;
      }

      // Cmd+Shift+E — Notes
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 69 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        createManager('notes');
        return;
      }

      // Cmd+Shift+Backspace — Delete conversation
      if (metaOrCtrl && e.shiftKey && !e.altKey && e.keyCode === 8 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const convId = getConversationIdFromUrl();
        handleDeleteConversation(convId);
        return;
      }

      // Cmd+Alt+] — Sidebar folder button
      if (metaOrCtrl && !e.shiftKey && e.altKey && e.keyCode === 221 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const btn = document.querySelector('#sidebar-folder-button') as HTMLElement | null;
        btn?.click();
      }

      // Cmd+Alt+[ — Sidebar note button
      if (metaOrCtrl && !e.shiftKey && e.altKey && e.keyCode === 219 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const btn = document.querySelector('#sidebar-note-button') as HTMLElement | null;
        btn?.click();
      }

      // Cmd+Shift+Alt+M — Move conversation to folder
      if (metaOrCtrl && e.shiftKey && e.altKey && e.keyCode === 77 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const convId = getConversationIdFromUrl();
        if (convId) openMoveConvToFolderModal([convId]);
        return;
      }

      // Cmd+Shift+Alt+E — Export current conversation
      if (metaOrCtrl && e.shiftKey && e.altKey && e.keyCode === 69 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const convId = getConversationIdFromUrl();
        if (convId) openExportModal([convId], 'current');
        return;
      }

      // Cmd+Shift+Alt+R — Open random conversation
      if (metaOrCtrl && e.shiftKey && e.altKey && e.keyCode === 82 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        openRandomConversation();
        return;
      }

      // Cmd+P — Save as PDF
      if (metaOrCtrl && !e.shiftKey && !e.altKey && e.keyCode === 80 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const convId = getConversationIdFromUrl();
        if (convId) saveConversationAsPDF(convId);
        return;
      }

      // Cmd+Shift+Alt+F — Toggle favorite
      if (metaOrCtrl && e.shiftKey && e.altKey && e.keyCode === 70 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const convId = getConversationIdFromUrl();
        if (convId) {
          const conv = await getConversationById(convId);
          const result = await chrome.runtime.sendMessage({
            type: 'toggleConversationFavorite',
            forceRefresh: true,
            detail: { conversation: conv },
          });
          if (result.is_favorite) {
            toast('Conversation marked as favorite');
          } else {
            toast('Conversation removed from favorites');
          }
          const lastFolder = getLastSelectedConversationFolder();
          if (lastFolder?.id === 'favorites') {
            if (result.is_favorite) {
              addConversationToSidebarFolder({ ...conv, is_favorite: result.is_favorite }, 'favorites');
            } else {
              document.querySelectorAll(`#conversation-card-${convId}`).forEach((el) => el.remove());
            }
          } else {
            replaceConversationInSidebarFolder({ ...conv, is_favorite: result.is_favorite });
          }
        }
        return;
      }

      // Cmd+Shift+Alt+C — Copy last message as HTML
      if (metaOrCtrl && e.shiftKey && e.altKey && e.keyCode === 67 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const convId = getConversationIdFromUrl();
        if (convId) {
          const lastMsg = Array.from(document.querySelectorAll('div[data-message-id]')).pop() as
            | HTMLElement
            | undefined;
          if (!lastMsg) return;
          const { messageId } = lastMsg.dataset;
          if (messageId) handleCopyHtml(messageId, convId);
        }
        return;
      }

      // Cmd+Shift+Alt+D — Save last article as PDF
      if (metaOrCtrl && e.shiftKey && e.altKey && e.keyCode === 68 && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        const convId = getConversationIdFromUrl();
        if (convId) {
          const articles = Array.from(document.querySelectorAll('main article'));
          if (articles.length === 0) return;
          const lastArticle = articles.pop();
          if (!lastArticle) return;
          saveConversationAsPDF(convId, lastArticle as HTMLElement);
        }
        return;
      }

      // Escape — close modals / stop audio / stop generation
      if (e.keyCode === 27 && !e.repeat) {
        stopAllAudios();
        const cancelButtons = document.querySelectorAll('[id*=cancel-button]');
        const closeButtons = document.querySelectorAll('[id*=close-button]');
        const quickAccessMenu = document.querySelector('#quick-access-menu-wrapper');
        const bulkReset = document.querySelector('#sidebar-bulk-action-reset-button') as HTMLElement | null;

        if (cancelButtons.length > 0 && isVisible(cancelButtons[cancelButtons.length - 1]!)) {
          (cancelButtons[cancelButtons.length - 1] as HTMLElement).click();
        } else if (closeButtons.length > 0 && isVisible(closeButtons[closeButtons.length - 1]!)) {
          (closeButtons[closeButtons.length - 1] as HTMLElement).click();
        } else if (quickAccessMenu) {
          quickAccessMenu.remove();
          (document.querySelector('#prompt-textarea') as HTMLElement)?.focus();
        } else if (bulkReset) {
          bulkReset.click();
        } else {
          const stopBtn = document.querySelector('[data-testid*="stop-button"]') as HTMLElement | null;
          if (stopBtn) {
            e.preventDefault();
            stopBtn.click();
          }
        }
        return;
      }

      // Home key — scroll to top
      if (e.keyCode === 36 && !e.repeat) {
        const promptTextarea = document.querySelector('#prompt-textarea');
        const activeTag = (document.activeElement as HTMLElement)?.tagName;
        if (activeTag === 'TEXTAREA' || activeTag === 'INPUT' || promptTextarea?.contains(document.activeElement))
          return;
        e.preventDefault();
        if (e.shiftKey) {
          scrollUpOneArticle();
          return;
        }
        (document.querySelector('#scroll-up-button') as HTMLElement)?.click();
        return;
      }

      // End key — scroll to bottom
      if (e.keyCode === 35 && !e.repeat) {
        const promptTextarea = document.querySelector('#prompt-textarea');
        const activeTag = (document.activeElement as HTMLElement)?.tagName;
        if (activeTag === 'TEXTAREA' || activeTag === 'INPUT' || promptTextarea?.contains(document.activeElement))
          return;
        e.preventDefault();
        if (e.shiftKey) {
          scrollDownOneArticle();
          return;
        }
        (document.querySelector('#scroll-down-button') as HTMLElement)?.click();
        return;
      }

      // Delegate to prompt-input-specific key listeners
      addPromptInputKeyDownEventListeners(e);
    },
    { capture: true },
  );

  // -----------------------------------------------------------------------
  // keyup handler (arrow keys for preview / gallery navigation)
  // -----------------------------------------------------------------------
  document.addEventListener(
    'keyup',
    (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;

      if (e.key === 'ArrowLeft') {
        if (activeTag !== 'TEXTAREA' && activeTag !== 'INPUT') {
          // Conversation preview navigation
          if (document.querySelector('#conversation-preview-wrapper')) {
            const prevBtn = document.querySelector('#preview-conversation-previous-button') as HTMLElement | null;
            prevBtn?.click();
          }
          // Image gallery navigation
          if (document.querySelector('#image-gallery-image-wrapper')) {
            const cards = document.querySelectorAll('[id^="gallery-image-card-"]');
            if (!cards) return;
            const idx = allImageNodes.findIndex((n) => n.image_id === selectedGalleryImage?.image_id);
            if (idx === 0) return;
            const prev = cards[idx - 1] as HTMLElement | undefined;
            prev?.click();
            prev?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }

      if (e.key === 'ArrowRight' && activeTag !== 'TEXTAREA' && activeTag !== 'INPUT') {
        if (document.querySelector('#conversation-preview-wrapper')) {
          const nextBtn = document.querySelector('#preview-conversation-next-button') as HTMLElement | null;
          nextBtn?.click();
        }
        if (document.querySelector('#image-gallery-image-wrapper')) {
          const cards = document.querySelectorAll('[id^="gallery-image-card-"]');
          if (!cards) return;
          const idx = allImageNodes.findIndex((n) => n.image_id === selectedGalleryImage?.image_id);
          if (idx === allImageNodes.length - 1) return;
          const next = cards[idx + 1] as HTMLElement | undefined;
          next?.click();
          next?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      addPromptInputKeyUpEventListeners(e);
    },
    { capture: true },
  );
}

/**
 * Override original ChatGPT keyboard-shortcut and custom-instruction menu items
 * to use the Council equivalents.
 */
export function overrideOriginalButtons(): void {
  document.body.addEventListener(
    'click',
    (e: MouseEvent) => {
      // Keyboard shortcuts menu item
      const kbItem = document
        .querySelector('div[role=menuitem] div svg > use[href*="25e330"]')
        ?.closest('div[role=menuitem]');
      if (kbItem && kbItem.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        closeMenus();
        closeRadix(e);
        if (!document.querySelector('#modal-keyboard-shortcuts')) {
          createKeyboardShortcutsModal();
        }
      }

      // Custom instructions menu item
      const ciIcon = document
        .querySelector('div[role=menuitem] div svg > use[href*="06188d"]')
        ?.closest('div[role=menuitem]');
      const ciItem = document
        .querySelector('div[role=menuitem] div svg > use[href*="306b75"]')
        ?.closest('div[role=menuitem]');
      if (ciIcon && ciItem && ciItem.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        closeMenus();
        closeRadix(e);
        createManager('custom-instruction-profiles');
      }
    },
    { capture: true },
  );
}

/**
 * Entry point — called from the main init flow.
 */
export function initializeKeyboardShortcuts(): void {
  registerShortkeys();
}
