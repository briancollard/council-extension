/**
 * SPA navigation observer.
 *
 * ChatGPT is a single-page application — navigating between conversations
 * does not trigger a full page load. This module detects route changes and
 * re-injects the Council UI elements that need to be re-mounted.
 *
 * Two complementary strategies:
 *   1. Navigation API (`navigation.addEventListener("navigate")`) for
 *      modern browsers that support it (Chrome 105+).
 *   2. MutationObserver on document.body as a fallback — watches for
 *      article count changes that signal a new conversation loaded.
 *
 * Original source: content.isolated.end.js lines 6529-6678
 *   - navigationCallback (6529-6544): MutationObserver that re-injects UI
 *   - initializeNavigation (6546-6563): Navigation API listener
 *   - canvasObserver (6602-6638): Canvas/Voice mode detection
 *   - initializeSpeechToText (6642-6678): Speech-to-text init
 */

import { cachedSettings, setConversationWidthForArticle } from './settings';
import { spSet } from '../../utils/storage';
import { addFloatingButtons } from './ui/floating-buttons';
import { createSidebarNotesButton } from '../features/notes';
import { createSidebarFolderButton, initiateNewChatFolderIndicator } from '../features/folders';
import { initializeContinueButton, createConversationMiniMap } from '../features/minimap';
import { initializeCustomInstructionProfileSelector } from '../features/profiles';
import { replaceAllInstructionsInConversation } from '../features/instruction-dropdowns';
import {
  addMessageCharWordCounters,
  addMessageTimestamps,
  addDateDividersInConversation,
  addThreadEditButtonEventListener,
} from '../features/timestamps';
import { createPinButtons } from '../features/pins';
import { showRerunLastPromptChain, resetPromptChain, addInputCounter, updateInputCounter } from '../features/prompts';
import { pageHeaderObserver, setSelectedModel } from '../features/model-switcher';
import { stopAnimateFavicon } from './ui/floating-buttons';

// ---------------------------------------------------------------------------
// TypeScript declarations for the Navigation API (not yet in lib.dom.d.ts)
// ---------------------------------------------------------------------------

interface NavigateEvent extends Event {
  readonly destination: { readonly url: string };
}

interface NavigationApi {
  addEventListener(type: 'navigate', listener: (event: NavigateEvent) => void): void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Track the last article turn-id we processed to avoid duplicate work. */
let prevLastArticleTurnId: string | number = -1;

/** Track the last URL pathname for path-change detection. */
let lastPathname: string = window.location.pathname;

/** Track the last full URL for conversation ID change detection. */
let lastHref: string = window.location.href;

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const CONV_ID_RE = /\/c\/(.*?)(\/|\?|#|$)/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getConversationIdFromUrl(url?: string): string | null {
  const href = url ?? window.location.href;
  const match = href.match(CONV_ID_RE);
  return match && match[1] && UUID_RE.test(match[1]) ? match[1] : null;
}

function pathHasChanged(oldUrl: string, newUrl: string): boolean {
  return new URL(oldUrl).pathname !== new URL(newUrl).pathname;
}

function conversationIdHasChanged(oldUrl: string, newUrl: string): boolean {
  const oldId = getConversationIdFromUrl(oldUrl);
  const newId = getConversationIdFromUrl(newUrl);
  if (!oldId || !newId) return false;
  return oldId !== newId;
}

function newConversationStarted(oldUrl: string, newUrl: string): boolean {
  const oldId = getConversationIdFromUrl(oldUrl);
  const newId = getConversationIdFromUrl(newUrl);
  return !!oldId && !newId;
}

function refreshOnNewChat(oldUrl: string, newUrl: string): boolean {
  return oldUrl === newUrl && oldUrl === 'https://chatgpt.com/';
}

// ---------------------------------------------------------------------------
// Route change callbacks
// ---------------------------------------------------------------------------

/**
 * Called whenever articles change in the DOM, indicating new content loaded.
 * Re-injects all SP UI elements onto the new page.
 *
 * Original: content.isolated.end.js lines 6529-6543
 */
function navigationCallback(navEvent?: NavigateEvent): void {
  new MutationObserver(async (_mutations, observer) => {
    const main = document.querySelector('main');
    if (!main) return;

    const articles = main.querySelectorAll('article');
    const lastTurnId = articles.length > 0 ? (articles[articles.length - 1]!.getAttribute('data-turn-id') ?? -1) : -1;

    const convId = getConversationIdFromUrl();

    // Skip if we are on a conversation URL but articles haven't loaded yet
    if (convId && articles.length === 0) return;

    // Skip if nothing has changed
    if (lastTurnId === prevLastArticleTurnId && articles.length !== 0) return;

    prevLastArticleTurnId = lastTurnId;

    const url = navEvent ? new URL(navEvent.destination.url) : new URL(window.location.href);

    // Re-inject SP UI elements for the new page.
    // Each function is guarded internally and will no-op if its feature is disabled.
    // Original: content.isolated.end.js line 6538
    createSidebarNotesButton(url as unknown as Location);
    createSidebarFolderButton(url as unknown as Location);
    // initializeInput() equivalent: addInputCounter + addPromptChainCounterElement
    setTimeout(() => {
      addInputCounter();
    }, 100);
    initializeContinueButton();
    initializeCustomInstructionProfileSelector();
    replaceAllInstructionsInConversation();
    pageHeaderObserver();
    addMessageCharWordCounters();
    addMessageTimestamps();
    if (cachedSettings.customConversationWidth) {
      const mainEl = document.querySelector('main');
      if (mainEl) {
        mainEl.querySelectorAll('article').forEach((article) => {
          setConversationWidthForArticle(article as HTMLElement, cachedSettings.conversationWidth);
        });
      }
    }
    addDateDividersInConversation();
    await createPinButtons();
    createConversationMiniMap();
    showRerunLastPromptChain();
    addFloatingButtons();

    console.debug('[Council] Navigation callback fired for', url.pathname);

    // Disconnect — this observer is one-shot per navigation
    observer.disconnect();
  }).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Called when the SPA navigates via the Navigation API.
 * Handles state resets and triggers navigationCallback.
 *
 * Original: content.isolated.end.js lines 6546-6563
 */
function onNavigate(event: NavigateEvent): void {
  const oldUrl = lastHref;
  const newUrl = event.destination.url;
  const newHost = new URL(newUrl).hostname;

  if (newHost !== 'chatgpt.com') return;

  // Clear toggle state on any navigation
  spSet('allMessagesToggleState', null);

  // Preserve prompt textarea content across navigation
  const textArea = document.querySelector('#prompt-textarea');
  const savedContent = textArea?.innerHTML ?? '';

  // Handle new conversation started (had ID, now doesn't)
  if (newConversationStarted(oldUrl, newUrl)) {
    resetPromptChain();
    console.debug('[Council] New conversation started');
  }

  // Handle conversation ID change
  if (conversationIdHasChanged(oldUrl, newUrl)) {
    stopAnimateFavicon();
    resetPromptChain();
    console.debug('[Council] Conversation ID changed');
  }

  // Handle path change or new-chat refresh
  if (pathHasChanged(oldUrl, newUrl) || refreshOnNewChat(oldUrl, newUrl)) {
    const waitForNavigation = (): void => {
      if (window.location.href === newUrl) {
        setTimeout(() => {
          navigationCallback(event);
          restoreTextArea(savedContent);
        }, 500);
      } else {
        requestAnimationFrame(waitForNavigation);
      }
    };
    requestAnimationFrame(waitForNavigation);
  }

  lastHref = newUrl;
  lastPathname = new URL(newUrl).pathname;
}

/**
 * Restore prompt textarea content after SPA navigation.
 *
 * Original: content.isolated.end.js lines 6569-6583
 */
function restoreTextArea(content: string): void {
  if (!content) return;

  const textArea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (textArea) {
    textArea.innerHTML = content;
    // Place cursor at end
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return;
  }

  // If textarea isn't available yet, wait for it
  new MutationObserver((_mutations, observer) => {
    const el = document.querySelector('#prompt-textarea') as HTMLElement | null;
    if (el) {
      el.innerHTML = content;
      observer.disconnect();
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Canvas / Voice mode detection
// ---------------------------------------------------------------------------

/** Throttle helper — simple trailing-edge throttle. */
function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = ms - (now - lastCall);
    if (remaining <= 0) {
      if (timer) clearTimeout(timer);
      lastCall = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        timer = undefined;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

/**
 * Detect whether Canvas mode, a voice call, or advanced voice is active
 * and hide/show SP UI elements accordingly.
 *
 * Original: content.isolated.end.js lines 6602-6638
 */
function canvasObserverCallback(): void {
  // Canvas mode: two or more <header> elements
  const hasMultipleHeaders = document.querySelectorAll('header').length >= 2;
  // Advanced voice button
  const hasVoiceButton = !!document.querySelector('header button svg > use[href*="1a24f4"]')?.closest('button');
  // LiveKit room container (voice call)
  const hasLiveKitRoom = !!document.querySelector('div[class*="lk-room-container"]');

  if (hasMultipleHeaders || hasVoiceButton || hasLiveKitRoom) {
    throttledInitializeCanvasChanges();
  } else {
    throttledUndoCanvasChanges();
  }
}

/**
 * Hide SP UI elements when Canvas/Voice mode is active.
 *
 * Original: content.isolated.end.js lines 6621-6623
 */
function initializeCanvasChanges(): void {
  window.localStorage.setItem('sp/canvasIsOpen', 'true');

  const selectors = [
    '#floating-button-wrapper',
    '#sidebar-note-button',
    '#sidebar-folder-button',
    '#gptx-nav-wrapper',
    '#memory-toggles-wrapper',
  ];

  selectors.forEach((sel) => {
    document.body.querySelector(sel)?.classList.add('hidden');
  });

  // Close sidebar note/folder if open
  const notePanel = document.querySelector('#sidebar-note-panel');
  if (notePanel && !notePanel.classList.contains('hidden')) {
    notePanel.classList.add('hidden');
  }
  const folderPanel = document.querySelector('#sidebar-folder-panel');
  if (folderPanel && !folderPanel.classList.contains('hidden')) {
    folderPanel.classList.add('hidden');
  }
}

const throttledInitializeCanvasChanges = throttle(initializeCanvasChanges, 100);

/**
 * Re-show SP UI elements when exiting Canvas/Voice mode.
 *
 * Original: content.isolated.end.js lines 6628-6638
 */
function undoCanvasChanges(): void {
  window.localStorage.setItem('sp/canvasIsOpen', 'false');

  const isGptsPage = window.location.pathname.includes('/gpts');
  const isAdminPage = window.location.pathname.includes('/admin');
  const isProjectPage = window.location.pathname.startsWith('/g/g-p-') && window.location.pathname.endsWith('/project');

  if (!isGptsPage && !isAdminPage && !isProjectPage) {
    const { showSidebarNoteButton, showSidebarFolderButton } = cachedSettings;
    if (showSidebarNoteButton) {
      document.body.querySelector('#sidebar-note-button')?.classList.remove('hidden');
    }
    if (showSidebarFolderButton) {
      document.body.querySelector('#sidebar-folder-button')?.classList.remove('hidden');
      createSidebarFolderButton();
    }
  }

  const showSelectors = ['#floating-button-wrapper', '#gptx-nav-wrapper', '#memory-toggles-wrapper'];
  showSelectors.forEach((sel) => {
    document.body.querySelector(sel)?.classList.remove('hidden');
  });
}

const throttledUndoCanvasChanges = throttle(undoCanvasChanges, 100);

/**
 * Set up a MutationObserver to continuously detect Canvas/Voice mode changes.
 *
 * Original: content.isolated.end.js lines 6602-6609
 */
function startCanvasObserver(): void {
  new MutationObserver(() => {
    canvasObserverCallback();
  }).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Sets up navigation detection. Called once from app.ts.
 *
 * Original: content.isolated.end.js lines 6546-6563
 */
export function initializeNavigation(): void {
  // --- Strategy 1: Navigation API (Chrome 105+) ---
  if ('navigation' in window) {
    const nav = (window as unknown as { navigation: NavigationApi }).navigation;
    nav.addEventListener('navigate', (event: NavigateEvent) => {
      onNavigate(event);
    });
  } else {
    console.warn('[Council] Navigation API is not supported in this browser.');
  }

  // --- Strategy 2: MutationObserver fallback ---
  // Also used for initial page load to inject UI elements.
  navigationCallback();

  // --- Canvas / Voice mode observer ---
  startCanvasObserver();

  console.log('[Council] Navigation observer initialised');
}

// ---------------------------------------------------------------------------
// removeUpdateButton
// Original: content.isolated.end.js lines 6778-6790
// ---------------------------------------------------------------------------

/**
 * Hide ChatGPT's update notification button in the nav sidebar.
 */
export function removeUpdateButton(): void {
  const navs = document.querySelectorAll('nav');
  if (navs.length === 0) return;
  for (let i = 0; i < navs.length; i += 1) {
    const nav = navs[i]!;
    (nav.parentElement!.parentElement! as HTMLElement).style.zIndex = '100000';
    (nav.parentElement!.parentElement! as HTMLElement).style.position = 'relative';
    const btn = nav.querySelector<HTMLElement>(
      'div[data-testid="accounts-profile-button"] > div > button[class*="__menu-item"]',
    );
    if (btn) {
      const parent = btn.parentElement;
      if (parent) (parent as HTMLElement).style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// addProjectHeaderGap
// Original: content.isolated.end.js lines 15137-15143
// ---------------------------------------------------------------------------

/**
 * Add extra margin to the project header when on a GPT project page.
 */
export function addProjectHeaderGap(location: Location = window.location): void {
  if (!(location.pathname.startsWith('/g/g-p-') && location.pathname.endsWith('/project'))) return;
  const trigger = document.querySelector<HTMLElement>('main button[data-testid="project-modal-trigger"]');
  if (!trigger) return;
  const container = trigger.parentElement!.parentElement! as HTMLElement;
  container.classList.remove('mb-8');
  container.classList.add('relative', 'mb-20');
}
