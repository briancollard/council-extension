/**
 * Settings handler.
 *
 * Loads the user's settings from chrome.storage.local on startup,
 * merges with defaults, and sets up a chrome.storage.onChanged listener
 * to keep the in-memory copy in sync. Also dispatches side-effect
 * handlers when specific settings are toggled at runtime.
 *
 * Other modules import `getSettings()` or `cachedSettings` to read the
 * current snapshot without touching chrome.storage again.
 *
 * Original source: content.isolated.end.js lines 22148-22278 (initializeSettings)
 *                  content.isolated.end.js line 22279 (onChanged listener)
 *                  content.isolated.end.js lines 21456-21810 (setting change handlers)
 */

import { type Settings, DEFAULT_SETTINGS } from '../../types/settings';
import {
  addDateDividersInConversation,
  removeDateDividersInConversation,
  addMessageTimestamps,
  removeMessageTimestamps,
  addMessageCharWordCounters,
  removeMessageCharWordCounters,
} from '../features/timestamps';
import { createConversationMiniMap } from '../features/minimap';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/**
 * In-memory copy of the user's settings, initialised to defaults.
 * Exported for direct read access by other isolated-world modules.
 */
export let cachedSettings: Settings = { ...DEFAULT_SETTINGS };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the current (in-memory) settings snapshot.
 * Non-blocking — call `initializeSettings()` first to ensure it is populated.
 */
export function getSettings(): Readonly<Settings> {
  return cachedSettings;
}

// ---------------------------------------------------------------------------
// Setting change side-effect handlers
// ---------------------------------------------------------------------------

/**
 * Apply conversation width to all thread content elements using
 * IntersectionObserver for lazy application.
 *
 * Original: content.isolated.end.js lines 21456-21470
 */
function setConversationWidth(width: number): void {
  if (!cachedSettings.customConversationWidth) {
    resetConversationWidth();
    return;
  }

  const selector =
    '[class*="[--thread-content-max-width:40rem]"], ' +
    '[class*="[--thread-content-max-width:32rem]"], ' +
    '[class*="agent-turn"]';

  const articles = document.querySelectorAll('main article');
  const isNewChat = window.location.pathname === '/';
  if (articles.length === 0 && !isNewChat) return;

  Array.from(document.querySelectorAll(selector)).forEach((el) => {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setConversationWidthForElement(entry.target as HTMLElement, width);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0 },
    );
    observer.observe(el);
  });
}

/**
 * Apply conversation width to a specific article's children.
 *
 * Original: content.isolated.end.js lines 21472-21480
 */
export function setConversationWidthForArticle(article: HTMLElement, width: number): void {
  if (!cachedSettings.customConversationWidth) {
    resetConversationWidth();
    return;
  }

  const selector =
    '[class*="[--thread-content-max-width:40rem]"], ' +
    '[class*="[--thread-content-max-width:32rem]"], ' +
    '[class*="agent-turn"]';

  Array.from(article.querySelectorAll(selector)).forEach((el) => {
    setConversationWidthForElement(el as HTMLElement, width);
  });
}

/**
 * Set max-width on a single thread content element.
 *
 * Original: content.isolated.end.js lines 21482-21484
 */
function setConversationWidthForElement(el: HTMLElement, width: number): void {
  // Skip elements inside paragen (canvas) roots
  if (el.closest('div[data-paragen-root="true"]')) return;

  el.style.maxWidth = `${width}%`;
  el.style.marginLeft = 'auto';
  el.style.marginRight = 'auto';
  el.classList.remove('[width:min(90cqw,var(--thread-content-max-width))]');
  el.parentElement?.classList.remove('mx-auto');
}

/**
 * Remove custom conversation width and restore ChatGPT defaults.
 *
 * Original: content.isolated.end.js lines 21486-21489
 */
function resetConversationWidth(): void {
  const selector =
    '[class*="[--thread-content-max-width:40rem]"], ' +
    '[class*="[--thread-content-max-width:32rem]"], ' +
    '[class*="agent-turn"]';

  const articles = document.querySelectorAll('main article');
  const isNewChat = window.location.pathname === '/';
  if (articles.length === 0 && !isNewChat) return;

  Array.from(document.querySelectorAll(selector)).forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.removeProperty('max-width');
    htmlEl.style.removeProperty('margin-left');
    htmlEl.style.removeProperty('margin-right');
    htmlEl.classList.add('[width:min(90cqw,var(--thread-content-max-width))]');
    htmlEl.parentElement?.classList.add('mx-auto');
  });
}

/**
 * Handle customConversationWidth toggle — enable/disable the width slider
 * and apply or reset widths.
 *
 * Original: content.isolated.end.js lines 21492-21496
 */
function onCustomConversationWidthChanged(enabled: boolean): void {
  if (enabled) {
    setConversationWidth(cachedSettings.conversationWidth);
  } else {
    resetConversationWidth();
  }
}

/**
 * Handle showDateDividersInConversation toggle.
 *
 * Original: content.isolated.end.js lines 21719-21721
 */
function onShowDateDividersChanged(enabled: boolean): void {
  if (enabled) {
    addDateDividersInConversation();
  } else {
    removeDateDividersInConversation();
  }
}

/**
 * Handle showMessageCharWordCount toggle.
 *
 * Original: content.isolated.end.js lines 21727-21728
 */
function onShowMessageCharWordCountChanged(enabled: boolean): void {
  if (enabled) {
    addMessageCharWordCounters();
  } else {
    removeMessageCharWordCounters();
  }
}

/**
 * Handle showMessageTimestamp toggle.
 *
 * Original: content.isolated.end.js lines 21731-21732
 */
function onShowMessageTimestampChanged(enabled: boolean): void {
  if (enabled) {
    addMessageTimestamps();
  } else {
    removeMessageTimestamps();
  }
}

/**
 * Handle showMiniMap toggle.
 *
 * Original: content.isolated.end.js lines 21802-21810
 */
function onShowMiniMapChanged(enabled: boolean): void {
  if (enabled) {
    createConversationMiniMap();
  } else {
    document.querySelector('#minimap-wrapper')?.remove();
  }
}

/**
 * Handle showSidebarNoteButton toggle.
 *
 * Original: content.isolated.end.js lines 21758-21761
 */
function onSidebarNoteButtonChanged(enabled: boolean): void {
  const btn = document.querySelector('#sidebar-note-button');
  if (!btn) return;
  if (enabled) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

/**
 * Handle showSidebarFolderButton toggle.
 */
function onSidebarFolderButtonChanged(enabled: boolean): void {
  const btn = document.querySelector('#sidebar-folder-button');
  if (!btn) return;
  if (enabled) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Mapping of setting keys to their side-effect handlers
// ---------------------------------------------------------------------------

type SettingChangeHandler = (newValue: unknown) => void;

const SETTING_CHANGE_HANDLERS: Partial<Record<keyof Settings, SettingChangeHandler>> = {
  customConversationWidth: (v) => onCustomConversationWidthChanged(v as boolean),
  conversationWidth: (v) => {
    if (cachedSettings.customConversationWidth) {
      setConversationWidth(v as number);
    }
  },
  showDateDividersInConversation: (v) => onShowDateDividersChanged(v as boolean),
  showMessageCharWordCount: (v) => onShowMessageCharWordCountChanged(v as boolean),
  showMessageTimestamp: (v) => onShowMessageTimestampChanged(v as boolean),
  showMiniMap: (v) => onShowMiniMapChanged(v as boolean),
  showSidebarNoteButton: (v) => onSidebarNoteButtonChanged(v as boolean),
  showSidebarFolderButton: (v) => onSidebarFolderButtonChanged(v as boolean),
};

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Load settings from chrome.storage.local and merge with defaults.
 * Registers the onChanged listener for live updates.
 *
 * Called once from app.ts during bootstrap.
 *
 * Original: content.isolated.end.js lines 22148-22281
 */
export async function initializeSettings(): Promise<void> {
  const { settings: stored } = await chrome.storage.local.get(['settings']);

  if (!stored) return;

  // Merge stored values with defaults, applying per-key fallbacks.
  // The original extension does this explicitly for each key with
  // `e.key !== void 0 ? e.key : default`. Our DEFAULT_SETTINGS spread
  // achieves the same result for most keys. Special cases below handle
  // the legacy `showPinNav` -> `showMiniMap` migration.
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    // Legacy migration: showPinNav was renamed to showMiniMap
    showMiniMap:
      stored.showMiniMap !== undefined
        ? stored.showMiniMap
        : (stored as Record<string, unknown>).showPinNav === true
          ? true
          : DEFAULT_SETTINGS.showMiniMap,
  };

  cachedSettings = merged;

  // Persist merged settings (back-fills any newly added defaults)
  chrome.storage.local.set({ settings: merged });

  // Keep in-memory copy in sync when settings change from popup, other tabs, etc.
  // Original: content.isolated.end.js line 22279-22281
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.settings) return;

    const oldSettings = cachedSettings;
    const newValue = changes.settings.newValue as Settings | undefined;
    if (!newValue) return;

    cachedSettings = newValue;

    // Fire side-effect handlers for any changed keys
    for (const [key, handler] of Object.entries(SETTING_CHANGE_HANDLERS)) {
      const settingKey = key as keyof Settings;
      if (oldSettings[settingKey] !== newValue[settingKey]) {
        handler?.(newValue[settingKey] as any);
      }
    }

    console.debug('[Council] Settings updated');
  });

  console.log('[Council] Settings initialised');
}
