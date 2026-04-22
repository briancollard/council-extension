/**
 * Auto-cleanup feature — automatically delete or archive old conversations.
 *
 * - autoDeleteConversations: delete conversations older than N days
 * - autoArchiveConversations: archive conversations older than N days
 * - Triggered by "syncIsDone" message from the background worker
 * - Excludes conversations in protected folders
 *
 * Original source: content.isolated.end.js lines 21769-21860
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { deleteConversation, archiveConversation } from '../isolated-world/api';
import { removeConversationElements } from './timestamps';
import { refreshPage, sleep } from '../../utils/shared';
import { cachedSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let autoArchiveIsRunning = false;
let autoDeleteIsRunning = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Delete conversations older than the configured number of days.
 * Iterates one-by-one with a 2 s pause between to avoid rate-limiting.
 */
export async function autoDeleteConversations(): Promise<void> {
  const { autoDelete, autoDeleteNumDays, autoDeleteExcludeFolders } = cachedSettings;

  if (!autoDelete) return;

  const ids: string[] = await chrome.runtime.sendMessage({
    type: 'getConversationIds',
    detail: {
      endDate: new Date(Date.now() - autoDeleteNumDays * 24 * 60 * 60 * 1000).getTime(),
      includeArchived: false,
      excludeConvInFolders: autoDeleteExcludeFolders,
    },
  });
  if (!Array.isArray(ids)) return;

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!;

    chrome.runtime.sendMessage({
      type: 'deleteConversations',
      detail: { conversationIds: [id] },
    });

    try {
      await deleteConversation(id);
      removeConversationElements(id);
    } catch (err) {
      console.error(err);
    }

    await sleep(2000);
  }
}

/**
 * Archive conversations older than the configured number of days.
 * Iterates one-by-one with a 2 s pause between to avoid rate-limiting.
 */
export async function autoArchiveConversations(): Promise<void> {
  const { autoArchive, autoArchiveNumDays, autoArchiveExcludeFolders } = cachedSettings;

  if (!autoArchive) return;

  const ids: string[] = await chrome.runtime.sendMessage({
    type: 'getConversationIds',
    detail: {
      endDate: new Date(Date.now() - autoArchiveNumDays * 24 * 60 * 60 * 1000).getTime(),
      includeArchived: false,
      excludeConvInFolders: autoArchiveExcludeFolders,
    },
  });
  if (!Array.isArray(ids)) return;

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!;

    chrome.runtime.sendMessage({
      type: 'archiveConversations',
      detail: { conversationIds: [id] },
    });

    try {
      await archiveConversation(id);
      removeConversationElements(id);
    } catch (err) {
      console.error(err);
    }

    await sleep(2000);
  }
}

/**
 * Toggle auto-archive UI elements (enable/disable inputs).
 */
export function toggleAutoArchive(enabled: boolean): void {
  const details = document.querySelector('#auto-archive-details') as HTMLElement | null;
  const input = document.querySelector('#auto-archive-input') as HTMLInputElement | null;
  const excludeInput = document.querySelector('#auto-archive-exclude-folders-input') as HTMLInputElement | null;

  if (!input) return;

  if (enabled) {
    if (details) details.style.opacity = '1';
    input.disabled = false;
    if (excludeInput) excludeInput.disabled = false;
  } else {
    if (details) details.style.opacity = '0.5';
    input.disabled = true;
    if (excludeInput) excludeInput.disabled = true;
    refreshPage();
  }
}

/**
 * Listen for the "syncIsDone" message from the background worker and
 * trigger auto-archive / auto-delete if configured.
 */
export function initAutoCleanupListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    (async () => {
      if (message.type === 'syncIsDone') {
        const hasSub = await chrome.runtime.sendMessage({
          type: 'checkHasSubscription',
        });
        if (!hasSub) return;

        if (cachedSettings.autoArchive && !autoArchiveIsRunning) {
          autoArchiveIsRunning = true;
          autoArchiveConversations();
        } else if (cachedSettings.autoDelete && !autoDeleteIsRunning) {
          autoDeleteIsRunning = true;
          autoDeleteConversations();
        }
      }
    })();
    return true;
  });
}
