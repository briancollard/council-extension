/**
 * Context menu (right-click) setup for the extension.
 *
 * Creates the hierarchical right-click menu structure including:
 *   - Send Image to ChatGPT
 *   - Council Pro submenu (favourite prompts, screenshot, new/current chat toggle)
 *   - Learn more link
 *
 * Original source: contextMenu.js (208 lines)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { API_URL, defaultGPTXHeaders } from './messaging';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let newChat = true;

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

async function checkHasPermission(permissions: string[]): Promise<boolean> {
  return chrome.permissions.contains({ permissions });
}

async function askForPermission(permissions: string[]): Promise<boolean> {
  return chrome.permissions.request({ permissions });
}

// ---------------------------------------------------------------------------
// API helpers (used only within context menu flow)
// ---------------------------------------------------------------------------

function getAllFavoritePrompts(headers: Record<string, string> = {}): Promise<any[]> {
  return fetch(`${API_URL}/gptx/get-all-favorite-prompts/`, {
    method: 'GET',
    headers: { ...defaultGPTXHeaders, ...headers, 'content-type': 'application/json' },
  }).then((r) => r.json());
}

function getPrompt(promptId: string, headers: Record<string, string> = {}): Promise<any> {
  return fetch(`${API_URL}/gptx/${promptId}/`, {
    method: 'GET',
    headers: { ...defaultGPTXHeaders, ...headers, 'content-type': 'application/json' },
  }).then((r) => r.json());
}

// ---------------------------------------------------------------------------
// Find or create a ChatGPT tab, then send a message to it
// ---------------------------------------------------------------------------

function sendToChatGPTTab(payload: Record<string, unknown>): void {
  chrome.tabs.query({ url: 'https://chatgpt.com/*' }, (tabs) => {
    const existing = tabs[0];
    if (existing) {
      chrome.tabs.update(existing.id!, { active: true }).then(() => {
        chrome.tabs.sendMessage(existing.id!, payload);
      });
    } else {
      chrome.tabs.create({ url: 'https://chatgpt.com/' }).then((tab) => {
        chrome.tabs.onUpdated.addListener(function onUpdated(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id!, payload);
            }, 3_000);
            chrome.tabs.onUpdated.removeListener(onUpdated);
          }
        });
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Click handler
// ---------------------------------------------------------------------------

async function genericOnClick(info: chrome.contextMenus.OnClickData): Promise<void> {
  if (info.menuItemId === 'learnMore') {
    chrome.tabs.create({ url: 'https://youtu.be/u3LSii5XOO8?si=nDvoFW-EyL--llfD' });
    return;
  }

  if (info.menuItemId === 'newChat') {
    newChat = true;
    return;
  }

  if (info.menuItemId === 'currentChat') {
    newChat = false;
    return;
  }

  if (info.menuItemId === 'requestScreenshotPermission') {
    const granted = await askForPermission(['tabs', 'activeTab']);
    if (granted) {
      chrome.contextMenus.removeAll(() => addCustomPromptContextMenu());
    }
    return;
  }

  if (info.menuItemId === 'takeScreenshot') {
    if (!(await checkHasPermission(['tabs', 'activeTab']))) return;
    chrome.tabs.captureVisibleTab(null as any, { format: 'png' }, (dataUrl) => {
      if (!dataUrl) return;
      sendToChatGPTTab({ newChat, action: 'insertScreenshot', screenshot: dataUrl });
    });
    return;
  }

  if (info.menuItemId === 'sendImage') {
    const imageUrl = info.srcUrl;
    sendToChatGPTTab({ newChat, action: 'insertImage', imageUrl });
    return;
  }

  // Default: prompt ID was clicked -- look up the prompt and insert it
  chrome.storage.sync.get(['hashAcessToken'], (syncData) => {
    if (!syncData.hashAcessToken) return;
    const promptId = info.menuItemId.toString();
    const headers = { 'Hat-Token': syncData.hashAcessToken };

    getPrompt(promptId, headers).then((promptData) => {
      if (!promptData) return;
      sendToChatGPTTab({
        newChat,
        action: 'insertPrompt',
        prompt: promptData,
        selectionText: info.selectionText,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Build the context menu tree
// ---------------------------------------------------------------------------

export async function addCustomPromptContextMenu(): Promise<void> {
  const hasTabPermission = await checkHasPermission(['tabs', 'activeTab']);

  chrome.storage.sync.get(['hashAcessToken'], (syncData) => {
    if (!syncData.hashAcessToken) return;

    const headers = { 'Hat-Token': syncData.hashAcessToken };

    getAllFavoritePrompts(headers)
      .catch(() => [] as any[])
      .then((favorites) => {
        // "Send Image to ChatGPT" (shown on images)
        chrome.contextMenus.create({
          title: 'Send Image to ChatGPT',
          contexts: ['image'],
          id: 'sendImage',
        });

        // Root parent menu
        const rootId = chrome.contextMenus.create({
          title: 'Council Pro',
          contexts: ['page', 'selection'],
          id: 'council',
        });

        // Placeholder for page context (no selection)
        chrome.contextMenus.create({
          title: 'Select some text to see your prompts',
          contexts: ['page'],
          parentId: rootId,
          id: 'noSelection',
        });

        // Header for selection context
        chrome.contextMenus.create({
          title: 'Send selected text to ChatGPT with prompt:',
          contexts: ['selection'],
          parentId: rootId,
          id: 'selection',
        });

        chrome.contextMenus.create({
          id: 'divider1',
          type: 'separator',
          parentId: rootId,
        });

        // Favorite prompts
        if (favorites && favorites.length > 0) {
          favorites
            .sort((a: any, b: any) => a.title - b.title)
            .forEach((prompt: any) => {
              if (!prompt.id || !prompt.title) return;
              const truncatedTitle = prompt.title.substring(0, 20) + (prompt.title.length > 20 ? '...' : '');
              const stepCount = prompt.steps?.length ?? 0;
              chrome.contextMenus.create({
                title: ` \u279C ${truncatedTitle} - (${stepCount} ${stepCount > 1 ? 'steps' : 'step'})`,
                contexts: ['selection'],
                parentId: rootId,
                id: prompt.id.toString(),
              });
            });
        }

        chrome.contextMenus.create({
          id: 'divider2',
          type: 'separator',
          contexts: ['page', 'selection'],
          parentId: rootId,
        });

        // Screenshot option
        chrome.contextMenus.create({
          title: hasTabPermission ? 'Send Screenshot to ChatGPT' : 'Allow to Send Screenshot to ChatGPT',
          contexts: ['page', 'selection'],
          parentId: rootId,
          id: hasTabPermission ? 'takeScreenshot' : 'requestScreenshotPermission',
        });

        chrome.contextMenus.create({
          id: 'divider3',
          type: 'separator',
          contexts: ['page', 'selection'],
          parentId: rootId,
        });

        // New chat / current chat radio group
        const chatSettingsId = chrome.contextMenus.create({
          title: 'When send a prompt or screenshot to ChatGPT',
          contexts: ['page', 'selection'],
          id: 'newChatSettings',
          parentId: rootId,
        });

        chrome.contextMenus.create({
          title: 'Start a New Chat',
          contexts: ['page', 'selection'],
          parentId: chatSettingsId,
          id: 'newChat',
          type: 'radio',
        });

        chrome.contextMenus.create({
          title: 'Continue Current Chat',
          contexts: ['page', 'selection'],
          parentId: chatSettingsId,
          id: 'currentChat',
          type: 'radio',
        });

        // Learn more link
        chrome.contextMenus.create({
          title: 'Learn more \u279C',
          contexts: ['page', 'selection'],
          parentId: rootId,
          id: 'learnMore',
        });
      });
  });
}

// ---------------------------------------------------------------------------
// Public: called once from index.ts
// ---------------------------------------------------------------------------

export function initializeContextMenu(): void {
  chrome.contextMenus.onClicked.addListener(genericOnClick);

  chrome.runtime.onInstalled.addListener(() => {
    addCustomPromptContextMenu();
  });

  console.log('[Council] Context menu initialised');
}

export function resetContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    addCustomPromptContextMenu();
  });
}
