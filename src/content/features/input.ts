/**
 * Input initialization, prompt history, and memory toggles.
 *
 * Manages the prompt textarea enhancements: character/word counter,
 * prompt history (up/down arrow cycling), and memory toggle buttons.
 *
 * Original source: content.isolated.end.js lines 7110-7460
 */

import { addInputCounter, addPromptChainCounterElement, addMemoryToggleButtonsToInput } from './prompts';

// ---------------------------------------------------------------------------
// initializeInput
// Original: content.isolated.end.js line 7110
// ---------------------------------------------------------------------------

/**
 * Initialize input enhancements: counter, history state, chain counter.
 *
 * Called during post-history-load init and on SPA navigation.
 */
export function initializeInput(): void {
  setTimeout(() => {
    addInputCounter();
    initializeHistory();
    addPromptChainCounterElement();
  }, 100);
}

// ---------------------------------------------------------------------------
// initializeHistory
// Original: content.isolated.end.js line 7116
// ---------------------------------------------------------------------------

/**
 * Load prompt history state from chrome.storage and set initial index.
 *
 * Hides the ChatGPT autocomplete suggestions overlay, then stores the
 * current history length as the index (so up-arrow starts at the end).
 */
export function initializeHistory(): void {
  const el = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!el) return;

  // Hide ChatGPT's native autocomplete suggestions
  const overlay = document.querySelector('form [class*="absolute space-y-2 z-20"]');
  if (overlay) overlay.classList.add('invisible', 'select-none', 'hidden');

  chrome.storage.local.get(['userInputValueHistory'], (data) => {
    chrome.storage.local.set({
      userInputValueHistoryIndex: data.userInputValueHistory?.length || 0,
      unsavedUserInput: '',
      textInputValue: el?.innerText?.trim() || '',
    });
  });
}

// ---------------------------------------------------------------------------
// inputActionWrapperObserver
// Original: content.isolated.end.js line 7166
// ---------------------------------------------------------------------------

/**
 * Observe the composer footer for DOM changes and re-add memory toggle
 * buttons when ChatGPT re-renders the footer actions area.
 */
export function inputActionWrapperObserver(): void {
  const form = document.querySelector('main form');
  if (!form) return;

  const footer = form.querySelector('div[data-testid="composer-footer-actions"]');
  if (!footer) return;

  footer.classList.add('flex');
  addMemoryToggleButtonsToInput();

  new MutationObserver(() => {
    addMemoryToggleButtonsToInput();
  }).observe(footer.parentElement!, {
    childList: true,
    subtree: true,
  });
}

// ---------------------------------------------------------------------------
// addUserPromptToHistory
// Original: content.isolated.end.js line 7437
// ---------------------------------------------------------------------------

/**
 * Add a user prompt to the prompt history in chrome.storage.local.
 *
 * Deduplicates entries (moves existing match to the end), caps the list
 * at 200 items, and updates the history index to point past the end.
 *
 * @param text - The user's prompt text.
 */
export function addUserPromptToHistory(text: string): void {
  if (!text) return;

  // Strip custom instructions header if present
  const cleaned = text.replace(/^## Instructions[\s\S]*?## End Instructions\n\n/m, '');

  chrome.storage.local.get(['userInputValueHistory', 'selectedModel'], (data) => {
    const history: Array<{ id: string; timestamp: number; inputValue: string }> = data.userInputValueHistory || [];

    // Remove duplicate if it already exists
    const existingIdx = history.findIndex((h) => h.inputValue.trim() === cleaned.trim());
    if (existingIdx !== -1) history.splice(existingIdx, 1);

    // Add new entry
    history.push({
      id: self.crypto.randomUUID(),
      timestamp: Date.now(),
      inputValue: cleaned.trim(),
    });

    // Cap at 200 entries — keep most recent
    let trimmed = history;
    if (history.length > 200) {
      const sorted = history.sort((a, b) => a.timestamp - b.timestamp);
      const excess = sorted.length - 200;
      sorted.splice(0, excess);
      trimmed = history.filter((h) => sorted.includes(h));
    }

    chrome.storage.local.set({ userInputValueHistory: trimmed }, () => {
      chrome.storage.local.set({ userInputValueHistoryIndex: history.length });
    });
  });
}
