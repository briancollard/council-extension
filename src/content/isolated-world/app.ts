/**
 * Main application orchestrator for the isolated-world content script.
 *
 * This is the primary entry point that boots the entire Council UI.
 * It runs at document_end so the DOM is available.
 *
 * Lifecycle:
 *   1. Guard: only proceed on chatgpt.com, skip /codex pages.
 *   2. Check banned status and login state.
 *   3. Load user settings from chrome.storage.local.
 *   4. Wire up the event bridge (MAIN world -> ISOLATED world).
 *   5. Set up SPA navigation observers.
 *   6. initializePostHistoryLoad() — main feature initialization.
 *   7. initializedDelayedFunctions() — delayed remote config + sync.
 *
 * Original source: content.isolated.end.js lines 23973-24040
 */

import 'katex/dist/katex.min.css';

import { initializeSettings, cachedSettings } from './settings';
import { initializeEventBridge, registerPostHistoryLoadCallback } from './event-bridge';
import { initializeNavigation } from './navigation';
import { spSet } from '../../utils/storage';

// Feature imports — initialization functions called in initializePostHistoryLoad()
import { addFloatingButtons } from './ui/floating-buttons';
import { initializeKeyboardShortcuts, overrideOriginalButtons } from '../features/keyboard-shortcuts';
import {
  initializeSpeechToText,
  addAudioEventListener,
  addMessageMoreActionMenuEventListener,
  observeSpeechButtonAvailability,
  observePlusButtonAvailability,
} from '../features/speech';
import {
  addSubmitButtonEventListener,
  addStopButtonEventListener,
  addPromptInputKeyDownEventListeners,
  addPromptInputKeyUpEventListeners,
  setTextAreaElementValue,
  runPromptChain,
  startNewChat,
  resetPromptChain,
  quickAccessMenu,
} from '../features/prompts';
import {
  addConversationMenuEventListener,
  addProjectMenuEventListener,
  createSidebarFolderButton,
  initiateNewChatFolderIndicator,
} from '../features/folders';
import { addThreadEditButtonEventListener } from '../features/timestamps';
import { pageHeaderObserver, getSelectedModel, setSelectedModel } from '../features/model-switcher';
import { setTranslation } from '../features/i18n';
import { gizmoCreatorProfile, getModels } from './api';
import {
  addManagerButton,
  createManager,
  createSettingsModal,
  createReleaseNoteModal,
  createAnnouncementModal,
} from '../features/manager';
import { initializeInput, inputActionWrapperObserver } from '../features/input';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let appInitialized = false;

import { getSelectionPosition, previousCharPosition, getCharAtPosition, remoteFunction } from '../../utils/shared';

import { showUpdateAvailableNotification } from './ui/primitives';

// ---------------------------------------------------------------------------
// Suppress noisy Chrome extension messaging errors (service worker idle, context invalidated)
// ---------------------------------------------------------------------------
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message ?? '';
  if (
    msg.includes('message channel closed') ||
    msg.includes('Extension context invalidated') ||
    msg.includes('Receiving end does not exist')
  ) {
    e.preventDefault();
  }
});

// ---------------------------------------------------------------------------
// Small utility functions (inlined from original — too small for own files)
// ---------------------------------------------------------------------------

/**
 * Make all links open in new tabs by adding a <base target="_blank">.
 * Original: content.isolated.end.js line 5167-5169
 */
function openLinksInNewTab(): void {
  const base = document.createElement('base');
  base.target = '_blank';
  document.head.appendChild(base);
}

/**
 * Close all menus when clicking anywhere on the page.
 * Original: content.isolated.end.js lines 5702-5703
 */
function closeMenusEventListener(): void {
  document.body.addEventListener('click', () => {
    document.querySelectorAll('[id$=-menu]').forEach((el) => el.remove());
  });
}

/**
 * Create the beep sound audio element.
 * Original: content.isolated.end.js lines 5204-5208
 */
function addSounds(): void {
  setTimeout(() => {
    const audio = document.createElement('audio');
    audio.id = 'beep-sound';
    audio.src = chrome.runtime.getURL('sounds/beep.mp3');
    document.body.appendChild(audio);
  }, 2000);
}

/**
 * Get ChatGPT account ID from cookie and store it.
 * Original: content.isolated.end.js lines 5180-5184
 */
function setChatGPTAccountIdFromCookie(): void {
  const cookies = document.cookie.split(';');
  let accountId = '';
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'oai-did') {
      accountId = value ?? '';
      break;
    }
  }
  chrome.storage.local.set({ chatgptAccountId: accountId });
}

/**
 * Clear folder selection when clicking in nav outside the folder drawer.
 * Original: content.isolated.end.js lines 6792-6799
 */
function addNavClickEventListener(): void {
  document.body.addEventListener('click', (ev) => {
    if (!ev.isTrusted) return;
    const nav = document.querySelector('nav');
    if (!nav) return;
    const drawer = document.querySelector('#sidebar-folder-drawer');
    if (nav.contains(ev.target as Node) && !drawer?.contains(ev.target as Node)) {
      initiateNewChatFolderIndicator();
    }
  });
}

/**
 * Re-create sidebar folder button when sidebar is opened.
 * Original: content.isolated.end.js lines 6802-6809
 */
function addSidebarOpenButtonEventListener(): void {
  document.body.addEventListener('click', (ev) => {
    if (!ev.isTrusted) return;
    const btn = document.querySelector('button svg > use[href*="836f7a"]')?.closest('button');
    if (btn && btn.contains(ev.target as Node)) {
      setTimeout(() => createSidebarFolderButton(), 500);
    }
  });
}

/**
 * Handle paste events in the prompt textarea — scroll to bottom.
 * Original: content.isolated.end.js lines 7424-7434
 */
function addPromptInputPasteEventListener(): void {
  document.body.addEventListener('paste', () => {
    if ((document.activeElement as HTMLElement)?.id !== 'prompt-textarea') return;
    const el = document.querySelector('#prompt-textarea') as HTMLElement | null;
    if (!el) return;
    // Scroll parent to bottom after paste
    if (el.parentElement) {
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  });
}

/**
 * Track selection position when the prompt textarea loses focus.
 * Original: content.isolated.end.js lines 7418-7421
 */
function addPromptInputBlurEventListener(): void {
  document.body.addEventListener(
    'blur',
    (ev) => {
      if ((ev.target as HTMLElement)?.id !== 'prompt-textarea') return;
      // Selection position is read by other modules when needed
    },
    true,
  );
}

/**
 * Handle URL query parameters for deep links.
 * Original: content.isolated.end.js lines 5916-5948
 */
function handleQueryParams(): void {
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get('p');
  const promptId = params.get('pid');
  const messageId = params.get('mid');

  // #manager/... opens a manager modal
  if (window.location.hash.startsWith('#manager')) {
    const tab = window.location.hash.split('/')[1] || 'prompts';
    createManager(tab);
  }

  // #setting/... opens settings modal
  if (window.location.hash.startsWith('#setting') && !window.location.hash.startsWith('#settings')) {
    const tab = window.location.hash.split('/')[1] || 'general';
    createSettingsModal(tab);
  }

  const textArea = document.querySelector('#prompt-textarea') as HTMLElement | null;

  if (prompt) {
    setTextAreaElementValue(prompt);
    textArea?.focus();
    const submitBtn = document.querySelector('button[data-testid="send-button"]') as HTMLElement | null;
    submitBtn?.click();
  } else if (promptId) {
    chrome.runtime.sendMessage({ type: 'getPrompt', detail: { promptId } }, (result: any) => {
      if (result?.steps?.[0]) {
        setTextAreaElementValue(result.steps[0]);
        textArea?.focus();
      }
    });
  } else if (messageId) {
    setTimeout(() => {
      const msgEl = document.querySelector(`main [data-message-id="${messageId}"]`);
      msgEl?.closest('article')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 1500);
  }
}

/**
 * Listen for right-click context menu insertions (prompts, screenshots).
 * Original: content.isolated.end.js lines 7918-7942
 */
function addRightClickInsertEventListener(): void {
  chrome.runtime.onMessage.addListener(async (message: any) => {
    if (message.action === 'insertPrompt') {
      const { pathname } = new URL(window.location.toString());
      if (message.newChat && pathname !== '/') startNewChat();
      setTimeout(() => {
        if (!document.querySelector('#prompt-textarea')) return;
        const prompt = message.prompt;
        prompt.steps[0] = `${message.selectionText}\n\n${prompt.steps[0]}`;
        runPromptChain(prompt);
      }, 500);
    }
  });
}

/**
 * Monitor article mouseover for copy button enhancement.
 * Original: content.isolated.end.js lines 22761-22780
 */
function addCopyButtonEventListener(): void {
  let lastArticle: HTMLElement | null = null;
  document.body.addEventListener('mouseover', (ev) => {
    const article = (ev.target as HTMLElement).closest('article') as HTMLElement | null;
    if (article && article !== lastArticle) {
      lastArticle = article;
      const copyBtn = article.querySelector('button[data-testid="copy-turn-action-button"]');
      if (!copyBtn || article.querySelector('button[data-testid="copy-turn-action-button-original"]')) return;
      const clone = copyBtn.cloneNode(true) as HTMLElement;
      clone.style.position = 'relative';
      copyBtn.insertAdjacentElement('afterend', clone);
      (copyBtn as HTMLElement).dataset.testid = 'copy-turn-action-button-original';
      (copyBtn as HTMLElement).style.display = 'none';
    } else if (!article) {
      lastArticle = null;
    }
  });
}

/**
 * Quick access menu event listener for "/" slash commands in prompt.
 * Original: content.isolated.end.js lines 10683-10751
 */
/**
 * Quick-access menu event listener.
 * Detects "/" or "@" typed in the prompt textarea via selectionchange,
 * then opens the quick-access menu. Also handles close-on-click and
 * keyboard navigation (arrow up/down) within the menu.
 *
 * Original: content.isolated.end.js lines 10683-10762
 */
function addQuickAccessMenuEventListener(): void {
  // Detect "/" or "@" in the textarea via selectionchange
  document.addEventListener('selectionchange', () => {
    if ((document.activeElement as HTMLElement)?.id !== 'prompt-textarea') return;

    const menu = document.querySelector('#quick-access-menu-wrapper');
    const sel = getSelectionPosition();
    if (!sel?.parentElement) return;

    const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
    if (!textarea?.innerText?.includes('/') && !textarea?.innerText?.includes('@')) {
      menu?.remove();
      return;
    }

    const slashPos = previousCharPosition(sel.parentElement, '/', sel.start);
    const atPos = previousCharPosition(sel.parentElement, '@', sel.start);
    const spacePos = previousCharPosition(sel.parentElement, ' ', sel.start);

    if (sel.start === 0 || (slashPos === -1 && atPos === -1)) {
      menu?.remove();
      return;
    }

    const triggerPos = Math.max(slashPos, atPos);
    const triggerChar = getCharAtPosition(sel.parentElement, triggerPos);
    const preceding = getCharAtPosition(sel.parentElement, triggerPos - 1);

    if (
      (!preceding ||
        preceding === ' ' ||
        preceding === '\n' ||
        preceding === '.' ||
        preceding === '?' ||
        preceding === '!') &&
      !menu &&
      triggerPos !== -1 &&
      sel.start > triggerPos &&
      spacePos < triggerPos
    ) {
      quickAccessMenu(triggerChar!);
    } else if (menu && (triggerPos === -1 || spacePos > triggerPos)) {
      menu.remove();
    }
  });

  // Close menu on outside click
  document.body.addEventListener('click', (ev) => {
    const wrapper = document.querySelector('#quick-access-menu-wrapper');
    const textArea = document.querySelector('#prompt-textarea');
    if (wrapper && !textArea?.contains(ev.target as Node) && !wrapper.contains(ev.target as Node)) {
      wrapper.remove();
    }
  });

  // Keyboard navigation within the menu
  document.body.addEventListener('keydown', (ev) => {
    const wrapper = document.querySelector('#quick-access-menu-wrapper');
    if (!wrapper) return;
    const content = wrapper.querySelector('#quick-access-menu-content');
    if (!content) return;

    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      const items = content.querySelectorAll('button[id^=quick-access-menu-item-]:not([style*="display: none"])');
      if (items.length === 0) return;

      ev.preventDefault();
      const currentIdx = Array.from(items).indexOf(document.activeElement as Element);

      if (ev.key === 'ArrowUp') {
        const nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
        (items[nextIdx] as HTMLElement)?.focus();
      } else {
        const nextIdx = currentIdx >= items.length - 1 ? 0 : currentIdx + 1;
        (items[nextIdx] as HTMLElement)?.focus();
      }
      return;
    }

    if (ev.key === 'Backspace' && (document.activeElement as HTMLElement)?.id !== 'prompt-textarea') {
      ev.preventDefault();
      (document.querySelector('#prompt-textarea') as HTMLElement)?.focus();
      return;
    }

    if (ev.key !== 'Enter') {
      (document.querySelector('#prompt-textarea') as HTMLElement)?.focus();
    }
  });
}

/**
 * Fetch user's gizmo creator profile and store name/url.
 * Original: content.isolated.end.js lines 6053-6059
 */
function getUserProfile(): void {
  gizmoCreatorProfile()
    .then((profile: any) => {
      const data: Record<string, string> = {};
      if (profile?.name) data.name = profile.name;
      if (profile?.website_url) data.url = profile.website_url;
      if (Object.keys(data).length > 0) chrome.storage.sync.set(data);
    })
    .catch(() => {
      /* 401 pre-login is expected */
    });
}

/**
 * Check for extension updates.
 * Original: content.isolated.end.js lines 6062-6067
 */
function checkForNewUpdate(): void {
  if (cachedSettings?.hideUpdateNotification) return;
  chrome.runtime.sendMessage({ type: 'getLatestVersion' }, (result: any) => {
    if (result?.status === 'update_available') {
      showUpdateAvailableNotification(result.version);
    }
  });
}

/**
 * Initialize announcements and newsletters.
 * Original: content.isolated.end.js lines 14471-14532
 */
function initializeAnnouncement(): void {
  setTimeout(() => {
    chrome.storage.sync.get(['lastSeenAnnouncementId'], (syncData: any) => {
      chrome.storage.local.get(['hasSubscription', 'readNewsletterIds', 'installDate'], (localData: any) => {
        chrome.runtime.sendMessage({ type: 'getLatestAnnouncement' }, (announcement: any) => {
          if (announcement?.id && syncData.lastSeenAnnouncementId !== announcement.id) {
            chrome.storage.sync.set({ lastSeenAnnouncementId: announcement.id });
            chrome.runtime.sendMessage({
              type: 'incrementOpenRate',
              detail: { announcementId: announcement.id },
            });
            createAnnouncementModal(announcement);
          }
        });
      });
    });
  }, 120000); // 2 minutes delay, same as original
}

/**
 * Check if release note should be shown.
 * Original: content.isolated.end.js lines 14583-14600
 */
function initializeReleaseNote(): void {
  setTimeout(() => {
    const { version } = chrome.runtime.getManifest();
    chrome.storage.local.get(['installDate'], (data: any) => {
      if (cachedSettings?.hideReleaseNote) return;
      const installDate = data.installDate;
      // Don't show for new installs (< 2 days)
      if (!installDate || Date.now() - new Date(installDate).getTime() < 172800000) return;
      chrome.storage.sync.get(['lastSeenReleaseNoteVersion'], (syncData: any) => {
        if (syncData.lastSeenReleaseNoteVersion !== version) {
          chrome.storage.sync.set({ lastSeenReleaseNoteVersion: version });
          createReleaseNoteModal(version, true);
        }
      });
    });
  }, 5000);
}

// ---------------------------------------------------------------------------
// Delayed / post-history functions
// ---------------------------------------------------------------------------

/**
 * Runs 5 seconds after the main initialization to fetch remote settings,
 * check subscription status, sync history, and show promotions.
 *
 * Original: content.isolated.end.js lines 23991-24026
 */
async function initializedDelayedFunctions(): Promise<void> {
  setTimeout(async () => {
    try {
      const hasSubscription = await chrome.runtime.sendMessage({
        type: 'checkHasSubscription',
        forceRefresh: true,
      });

      const { settings } = await chrome.storage.local.get(['settings']);

      const remoteResponse = await chrome.runtime.sendMessage({
        type: 'getRemoteSettings',
        forceRefresh: true,
      });

      const appSettings = remoteResponse?.appSettings ?? {};

      // Merge remote settings into local settings
      chrome.storage.local.set({
        settings: { ...settings, ...appSettings },
      });

      const remoteArgs = remoteResponse?.remoteArgs ?? [];
      if (remoteArgs.length > 0) {
        remoteFunction(remoteArgs);
      }

      getUserProfile();
      checkForNewUpdate();

      // Sync history if enabled
      if (remoteResponse?.syncHistory) {
        chrome.runtime.sendMessage({
          type: 'initConvHistorySync',
          forceRefresh: true,
          detail: {
            syncIntervalTime: remoteResponse?.syncIntervalTime ?? 5000,
          },
        });
      }

      // Reset context menu
      chrome.runtime.sendMessage({
        type: 'resetContextMenu',
        forceRefresh: true,
        detail: {},
      });
    } catch (err: unknown) {
      // Suppress "Extension context invalidated" after extension reload — harmless
      if (err instanceof Error && err.message.includes('Extension context invalidated')) return;
      console.error('[Council] Delayed functions error:', err);
    }
  }, 5000);
}

/**
 * Main feature initialization — called once after history loads or
 * 2 seconds after page load (whichever comes first).
 *
 * Guards against double-init, codex pages, and logged-out state.
 *
 * Original: content.isolated.end.js lines 23980-23990
 */
async function initializePostHistoryLoad(): Promise<void> {
  if (!window.location.href.startsWith('https://chat') || window.location.href.includes('/codex') || appInitialized) {
    return;
  }

  // Check login state
  if (window.localStorage.getItem('sp/isLoggedIn') === 'false') return;

  appInitialized = true;

  const { settings } = await chrome.storage.local.get(['settings']);
  if (!settings) return;

  const { councilIsEnabled = true } = settings;
  if (!councilIsEnabled) return;

  // Start delayed functions (remote config, sync, etc.)
  initializedDelayedFunctions();

  // Reset message toggle state
  spSet('allMessagesToggleState', null);

  // -----------------------------------------------------------------------
  // Feature initialization chain
  // Original: content.isolated.end.js line 23989 — all called in sequence
  // -----------------------------------------------------------------------

  addPromptInputPasteEventListener();
  addPromptInputBlurEventListener();
  addQuickAccessMenuEventListener();
  addFloatingButtons();
  addManagerButton();
  handleQueryParams();
  initializeAnnouncement();
  openLinksInNewTab();
  closeMenusEventListener();
  initializeKeyboardShortcuts();
  initializeReleaseNote();
  initializeSpeechToText();
  addRightClickInsertEventListener();
  await addSubmitButtonEventListener();
  addStopButtonEventListener();
  addNavClickEventListener();
  addConversationMenuEventListener();
  addProjectMenuEventListener();
  addMessageMoreActionMenuEventListener();
  addSidebarOpenButtonEventListener();
  addAudioEventListener();
  addThreadEditButtonEventListener();
  addSounds();
  initializeInput();
  inputActionWrapperObserver();
  observeSpeechButtonAvailability();
  observePlusButtonAvailability();
  // canvasObserver() — handled by navigation.ts startCanvasObserver()
  pageHeaderObserver();
  addCopyButtonEventListener();
  overrideOriginalButtons();
  // navigationCallback() — handled by navigation.ts initializeNavigation()

  console.log('[Council] Post-history initialization complete');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Boot the extension UI. Called immediately on script load.
 *
 * Original: content.isolated.end.js lines 24027-24040
 */
async function initializeApp(): Promise<void> {
  // Guard: only run on ChatGPT pages
  if (
    !window.location.href.startsWith('https://chatgpt.com') &&
    !window.location.href.startsWith('https://chat.openai.com')
  ) {
    return;
  }

  // Guard: skip codex pages
  if (window.location.href.includes('/codex')) return;

  // Guard: check banned status
  const { isBanned } = await chrome.storage.sync.get(['isBanned']);
  if (isBanned) return;

  // Load settings
  const { settings } = await chrome.storage.local.get(['settings']);
  if (!settings) return;

  const { councilIsEnabled = true } = settings;
  if (!councilIsEnabled) return;

  console.log('[Council] Initialising app on', window.location.href);

  // 1. Set translation (i18n)
  await setTranslation();

  // 2. Initialize settings (loads from storage, sets up onChanged listener)
  await initializeSettings();

  // 3. Event bridge (MAIN world events -> handlers in ISOLATED world)
  initializeEventBridge();
  registerPostHistoryLoadCallback(() => initializePostHistoryLoad());

  // 4. SPA navigation observer + Canvas/Voice mode detection
  initializeNavigation();

  // 5. Store ChatGPT account ID from cookie
  setChatGPTAccountIdFromCookie();

  // 6. Fetch available models (fire-and-forget, matches original pattern)
  // Original calls getModels() in initializePostHistoryLoad, not here.
  // We keep it lightweight — just pre-fetch if token is available.
  getModels()
    .then((resp: any) => {
      const models = Array.isArray(resp) ? resp : (resp?.models ?? resp);
      if (models) chrome.storage.local.set({ models });
    })
    .catch(() => {
      // Non-fatal — models loaded later via event bridge
    });

  // 7. Set selected model from storage
  setSelectedModel();

  console.log('[Council] App initialised');
}

// ---------------------------------------------------------------------------
// Self-invoking initialization
// ---------------------------------------------------------------------------

// Start the app immediately
initializeApp().catch((err) => {
  console.error('[Council] Failed to initialise app:', err);
});

// Fallback: also trigger post-history-load after 2 seconds
// (mirrors original behavior for cases where history loads slowly)
setTimeout(async () => {
  const { isBanned } = await chrome.storage.sync.get(['isBanned']);
  if (!isBanned) {
    initializePostHistoryLoad();
  }
}, 2000);
