/**
 * Prompts Manager feature — browse, create, edit, and insert prompt templates.
 *
 * Includes:
 *   - Prompt library (local + optional cloud sync)
 *   - Prompt editor modal with multi-step chains
 *   - Template variable substitution ({{variable}})
 *   - Prompt chains (run multiple prompts in sequence)
 *   - "/" command insertion in the textarea
 *   - Smart steps (AI-generated prompt from instructions)
 *   - File attachments per step
 *   - Prompt manager modal with folders, search, sort, tags
 *
 * Original source: content.isolated.end.js
 *   - Insert & chain core: lines 10940-11918
 *   - Input helpers: lines 7128-7427
 *   - Prompt manager UI: lines 20026-21025+
 */

import { cachedSettings } from '../isolated-world/settings';
import {
  toast,
  showConfirmDialog,
  addTooltip,
  loadingSpinner,
  createInfoIcon,
  dropdown,
  addDropdownEventListener,
  createSwitch,
  isDescendant,
} from '../isolated-world/ui/primitives';
import { stopAnimateFavicon } from '../isolated-world/ui/floating-buttons';
import type { Prompt } from '../../types/conversation';
import {
  isDarkMode,
  isWindows,
  closeMenus,
  escapeHTML,
  highlightBracket,
  debounce,
  throttle,
  generateRandomDarkColor,
  getWordCount,
  getCharCount,
  getSubmitButton,
  getConversationIdFromUrl,
  isOnNewChatPage,
  errorUpgradeConfirmation,
  createModal,
  downloadFileFromUrl,
  getSelectionPosition,
  previousCharPosition,
  getStringBetween,
  insertTextAtPosition,
  getCharAtPosition,
  getSelectionOffsetRelativeToParent,
  setSelectionAtEnd,
  convertToParagraphs,
  getPlusButton,
  isOnNewGizmoPage,
  refreshPage,
  elementResizeObserver,
  adjustMenuPosition,
  rgba2hex,
} from '../../utils/shared';
import { translate, languageList, promptsSortByList, reportReasonList } from './i18n';
import { initializeContinueButton } from './minimap';
import { updateAccountUserSetting, getGizmoDiscovery, getGizmosPinned } from '../isolated-world/api';
import { getConversationName } from '../isolated-world/ui/markdown';
import { sanitizeHtml } from './conversation-renderer';
import { addConversationToSidebarAndSync } from '../isolated-world/event-bridge';
import { showRewritePromptSettings } from './prompt-rewriter';
import { generateSplitterChain } from './export';
import { initiateNewChatFolderIndicator, folderForNewChat } from './folders';
import { getPromptVariable, addPromptVariableValue } from './prompt-variables';
import {
  createManager,
  buttonGenerator,
  promptManagerSidebarContent,
  managerModalCurrentTab,
  faviconTimeout,
} from './manager';

// ---------------------------------------------------------------------------
// Prompt-folder types & constants
// ---------------------------------------------------------------------------

/** Shape of a default prompt folder entry. */
interface DefaultPromptFolder {
  id: string;
  name: string;
  displayName: string;
}

/** The built-in default prompt folders shown at the top of the sidebar. */
export const defaultPromptFolders: DefaultPromptFolder[] = [
  {
    id: 'recent',
    name: '<div class="flex items-center"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="icon icon-sm me-2" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" > <circle cx="12" cy="12" r="10"></circle> <polyline points="12 6 12 12 16 14"></polyline></svg> Recent</div>',
    displayName: 'Recent Prompts',
  },
  {
    id: 'favorites',
    name: '<div class="flex items-center"><svg class="icon icon-sm me-2" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg> Favorites</div>',
    displayName: 'Favorite Prompts',
  },
  {
    id: 'public',
    name: '<div class="flex items-center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-sm me-2" height="1em" width="1em"><path d="M319.9 320c57.41 0 103.1-46.56 103.1-104c0-57.44-46.54-104-103.1-104c-57.41 0-103.1 46.56-103.1 104C215.9 273.4 262.5 320 319.9 320zM369.9 352H270.1C191.6 352 128 411.7 128 485.3C128 500.1 140.7 512 156.4 512h327.2C499.3 512 512 500.1 512 485.3C512 411.7 448.4 352 369.9 352zM512 160c44.18 0 80-35.82 80-80S556.2 0 512 0c-44.18 0-80 35.82-80 80S467.8 160 512 160zM183.9 216c0-5.449 .9824-10.63 1.609-15.91C174.6 194.1 162.6 192 149.9 192H88.08C39.44 192 0 233.8 0 285.3C0 295.6 7.887 304 17.62 304h199.5C196.7 280.2 183.9 249.7 183.9 216zM128 160c44.18 0 80-35.82 80-80S172.2 0 128 0C83.82 0 48 35.82 48 80S83.82 160 128 160zM551.9 192h-61.84c-12.8 0-24.88 3.037-35.86 8.24C454.8 205.5 455.8 210.6 455.8 216c0 33.71-12.78 64.21-33.16 88h199.7C632.1 304 640 295.6 640 285.3C640 233.8 600.6 192 551.9 192z"/></svg> Public</div>',
    displayName: 'Public Prompts',
  },
];

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Breadcrumb path tracking the currently selected prompt folder hierarchy. */
export let selectedPromptFolderBreadcrumb: Array<{
  id: string | number;
  name?: string;
  displayName?: string;
  parent_folder?: string | number;
  color?: string;
  image?: string;
  image_url?: string;
  subfolders?: any[];
  prompt_count?: number;
}> = [];

let runningPromptChain: PromptLike | undefined;
let runningPromptChainStepIndex = 0;
let lastPromptChainId: string | number | null = null;
let templateWordsMap: Record<string, string> = {};
export let lastSelectedPromptCardId = '';
let lastSelectedPromptCheckboxId = '';

/** Minimal prompt-like shape used internally (may come from storage or from editor). */
interface PromptLike {
  id?: string | number;
  title?: string;
  steps: string[];
  steps_delay?: number;
  mode?: string;
  is_public?: boolean;
  is_mine?: boolean;
  is_favorite?: boolean;
  folder?: { id: string | number; name?: string; image?: string; image_url?: string };
  instruction?: string;
  language?: string;
  tags?: Array<{ id: string | number; name: string }>;
}

// ---------------------------------------------------------------------------
// Prompt folder management helpers
// Original: content.isolated.end.js lines 10752-10811, 19661-20045, 20818-20839, 23518-23561
// ---------------------------------------------------------------------------

// SVG constants used by breadcrumb / folder elements
const PROMPT_CHEVRON_RIGHT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md-heavy me-1"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.29289 18.7071C8.90237 18.3166 8.90237 17.6834 9.29289 17.2929L14.5858 12L9.29289 6.70711C8.90237 6.31658 8.90237 5.68342 9.29289 5.29289C9.68342 4.90237 10.3166 4.90237 10.7071 5.29289L16.7071 11.2929C16.8946 11.4804 17 11.7348 17 12C17 12.2652 16.8946 12.5196 16.7071 12.7071L10.7071 18.7071C10.3166 19.0976 9.68342 19.0976 9.29289 18.7071Z" fill="currentColor"></path></svg>';

function folderIconSvg(isActive: boolean): string {
  return `<svg stroke="currentColor" fill="currentColor" class="icon icon-sm me-1 ${isActive ? 'text-token-text-primary' : ''} group-hover:text-token-text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M147.8 192H480V144C480 117.5 458.5 96 432 96h-160l-64-64h-160C21.49 32 0 53.49 0 80v328.4l90.54-181.1C101.4 205.6 123.4 192 147.8 192zM543.1 224H147.8C135.7 224 124.6 230.8 119.2 241.7L0 480h447.1c12.12 0 23.2-6.852 28.62-17.69l96-192C583.2 249 567.7 224 543.1 224z"/></svg>`;
}

/**
 * Get the last (deepest) selected prompt folder from the breadcrumb.
 * Original: line 19661
 */
export function getLastSelectedPromptFolder(): (typeof selectedPromptFolderBreadcrumb)[number] | null {
  return selectedPromptFolderBreadcrumb.length === 0
    ? null
    : selectedPromptFolderBreadcrumb[selectedPromptFolderBreadcrumb.length - 1]!;
}

/** Check whether a folder ID is already in the breadcrumb. */
export function promptBreadcrumbIncludesFolder(folderId: string | number): boolean {
  return selectedPromptFolderBreadcrumb.map((f) => f.id.toString()).some((id) => id === folderId.toString());
}

/**
 * Generate breadcrumb HTML for prompt folders and inject into the given element.
 * Original: line 19669
 */
export function generatePromptFolderBreadcrumb(el: HTMLElement): void {
  el.innerHTML = '';
  el.innerHTML += PROMPT_CHEVRON_RIGHT_SVG;

  const isDefault = isDefaultPromptFolder(selectedPromptFolderBreadcrumb[0]?.id);
  const newFolderBtn = document.querySelector('#modal-manager #prompt-manager-new-folder-button');
  if (isDefault) {
    newFolderBtn?.classList.replace('flex', 'hidden');
  } else {
    newFolderBtn?.classList.replace('hidden', 'flex');
  }

  const crumbs = selectedPromptFolderBreadcrumb;
  crumbs.forEach((crumb, idx) => {
    const span = document.createElement('span');
    span.className = 'flex items-center text-token-text-tertiary text-sm group';
    const isLast = idx === crumbs.length - 1;
    const labelHtml = `<span id="folder-breadcrumb-${crumb.id}" class="me-1 text-nowrap hover:underline cursor-pointer ${isLast ? 'text-token-text-primary' : 'text-token-text-tertiary hover:text-token-text-primary'}" data-folder-id="${crumb.id}">
      ${isDefaultPromptFolder(crumb.id) ? (crumb as any).displayName : crumb.name}
    </span>`;
    span.innerHTML = `${folderIconSvg(isLast)}${labelHtml}`;
    if (!isLast) {
      span.innerHTML += PROMPT_CHEVRON_RIGHT_SVG;
    }
    el.appendChild(span);
  });
}

/**
 * Check if a folder ID represents one of the built-in default prompt folders.
 * Original: line 19701
 */
export function isDefaultPromptFolder(id: string | number | undefined): boolean {
  if (!id) return false;
  return defaultPromptFolders.map((f) => f.id).includes(id.toString());
}

/**
 * Create a DOM element for a prompt folder row in the sidebar.
 * Original: line 19878
 */
export function promptFolderElement(folder: any, isTopLevel = false, isSubfolder = false): HTMLElement | null {
  if (!folder) return null;

  const isDefault = isDefaultPromptFolder(folder.id);
  const isLocked = folder.id === -1;

  const wrapper = document.createElement('div');
  wrapper.id = `prompt-folder-wrapper-${folder.id}`;
  wrapper.className = `relative flex items-center justify-between p-2 ${isDefault ? '' : 'py-1'} cursor-pointer border bg-token-main-surface-secondary border-token-border-medium rounded-md mb-2 group ${isLocked ? 'opacity-50' : ''}`;
  wrapper.style.minHeight = '42px';
  if (folder.color) wrapper.style.backgroundColor = folder.color;
  if (!isDefault) wrapper.draggable = true;

  // Selection indicator
  const indicator = document.createElement('div');
  indicator.id = `selected-prompt-folder-indicator-${folder.id}`;
  indicator.className = `w-1 h-10 rounded-s-xl absolute ${selectedPromptFolderBreadcrumb[0]?.id?.toString() === folder.id.toString() ? 'bg-black dark:bg-white' : ''}`;
  indicator.style.right = '-9px';
  wrapper.appendChild(indicator);

  // Click handler
  wrapper.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();

    if (isLocked) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message: 'With free account, you can only have up to 5 prompt categories. Upgrade to Pro to remove all limits.',
      });
      return;
    }

    const lastFolder = getLastSelectedPromptFolder();
    if (lastFolder?.id?.toString() === folder.id.toString() && !ev.shiftKey) return;

    if (folder.parent_folder && folder.parent_folder === lastFolder?.id) {
      selectedPromptFolderBreadcrumb.push(folder);
    } else {
      selectedPromptFolderBreadcrumb = [folder];
    }

    const breadcrumbEl = document.querySelector('#modal-manager #prompt-manager-breadcrumb') as HTMLElement | null;
    if (breadcrumbEl) generatePromptFolderBreadcrumb(breadcrumbEl);

    chrome.storage.local.set({ selectedPromptFolderBreadcrumb });

    document.querySelectorAll('#modal-manager div[id^="prompt-folder-wrapper-"]').forEach((el) => {
      el.querySelector('div[id^="selected-prompt-folder-indicator-"]')?.classList.remove('bg-black', 'dark:bg-white');
    });
    document
      .querySelector(`#modal-manager #prompt-folder-wrapper-${selectedPromptFolderBreadcrumb[0]?.id}`)
      ?.querySelector('div[id^="selected-prompt-folder-indicator-"]')
      ?.classList?.add('bg-black', 'dark:bg-white');

    resetPromptManagerSelection();
    throttleGetPromptSubFolders(folder.id, ev.shiftKey);
    fetchPrompts(1, ev.shiftKey);
  });

  // Context menu
  wrapper.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    (document.querySelector(`#prompt-folder-settings-button-${folder.id}`) as HTMLElement)?.click();
  });

  // Double-click to rename
  wrapper.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!isLocked && !isDefault) handleRenamePromptFolderClick(folder.id);
  });

  // Mouse enter / leave
  wrapper.addEventListener('mouseenter', () => {
    closeMenus();
    document.querySelectorAll('div[id^="prompt-folder-settings-button-"]').forEach((el) => {
      el.classList.replace('flex', 'hidden');
    });
    const nameEl = document.querySelector(`#prompt-folder-name-${folder.id}`) as HTMLElement | null;
    if (nameEl) nameEl.style.paddingRight = '36px';
  });
  wrapper.addEventListener('mouseleave', () => {
    const nameEl = document.querySelector(`#prompt-folder-name-${folder.id}`) as HTMLElement | null;
    if (nameEl) nameEl.style.paddingRight = '0px';
  });

  // Drag start / end
  wrapper.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    ev.dataTransfer!.setData('text/plain', JSON.stringify({ draggingObject: 'folder', folder }));
    ev.dataTransfer!.effectAllowed = 'move';
    wrapper.classList.add('folder-dragging');
  });
  wrapper.addEventListener('dragend', (ev) => {
    ev.stopPropagation();
    ev.dataTransfer!.clearData();
    try {
      wrapper.classList.remove('folder-dragging');
    } catch (_e) {
      /* ignore */
    }
  });

  // Drag over / leave / drop
  wrapper.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (isLocked) return;
    if (document.querySelector('.folder-dragging') && isDefaultPromptFolder(folder.id)) return;
    ev.dataTransfer!.dropEffect = 'move';
    if (folder.id !== 'recent') wrapper.classList.add('folder-drag-hover');
  });
  wrapper.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!isLocked && folder.id !== 'recent') wrapper.classList.remove('folder-drag-hover');
  });
  wrapper.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resetPromptManagerSelection();
    if (isLocked) return;
    wrapper.classList.remove('folder-drag-hover');
    let dragData: any;
    try {
      dragData = JSON.parse(ev.dataTransfer!.getData('text/plain'));
    } catch (_e) {
      return;
    }
    if (!dragData) return;

    if (dragData.draggingObject === 'prompt') {
      const promptId = dragData.prompt?.id;
      if (!promptId) return;
      const lastFolder = getLastSelectedPromptFolder();
      if (folder.id === lastFolder?.id) return;
      if (folder.id === 'favorites') {
        const favBtn = document
          .querySelector(`#modal-manager #prompt-card-${promptId}`)
          ?.querySelector('#modal-manager #prompt-card-favorite') as HTMLElement | null;
        if (favBtn?.querySelector('svg')?.getAttribute('fill') !== 'gold') favBtn?.click();
        return;
      }
      if (folder.id === 'public') {
        if (dragData.prompt?.is_public) return;
        chrome.runtime.sendMessage(
          { type: 'togglePromptPublic', forceRefresh: true, detail: { promptId } },
          (resp: any) => {
            addOrReplacePromptCard(resp.prompt);
          },
        );
        return;
      }
      if (folder.id === 'recent') return;
      movePromptToFolder([promptId], folder.id, folder.name, folder.color);
    }

    if (dragData.draggingObject === 'folder') {
      if (isDefaultPromptFolder(folder.id)) return;
      const draggedFolder = dragData.folder;
      if (!draggedFolder) return;
      const lastFolder = getLastSelectedPromptFolder();
      if (draggedFolder.id === lastFolder?.id || folder.id === draggedFolder.id) return;
      movePromptFolder(draggedFolder, folder.id);
    }
  });

  // Folder content (icon + name + counts)
  const content = document.createElement('div');
  content.className = 'flex items-center justify-start w-full h-full';

  const hasImage = folder.image || folder.image_url;
  const imgSrc = folder.image || folder.image_url || (isDefault ? '' : chrome.runtime.getURL('icons/folder.png'));
  const img = document.createElement('img');
  img.id = `prompt-folder-image-${folder.id}`;
  img.src = imgSrc;
  img.className = `${hasImage ? 'w-6 h-6 me-2' : 'w-5 h-5 me-3'} rounded-md object-cover ${imgSrc ? '' : 'hidden'}`;
  img.style.cssText = 'filter:drop-shadow(0px 0px 1px black);padding-left:1px;';
  content.appendChild(img);

  const textWrapper = document.createElement('div');
  textWrapper.className = 'flex items-center justify-start w-full flex-wrap overflow-hidden';
  content.appendChild(textWrapper);

  const nameSpan = document.createElement('span');
  nameSpan.id = `prompt-folder-name-${folder.id}`;
  nameSpan.className = `w-full truncate max-h-5 relative text-sm ${isDefault ? 'text-token-text-primary' : 'text-white'}`;
  nameSpan.innerHTML = folder.name;
  textWrapper.appendChild(nameSpan);

  if (!isDefault) {
    const subfolderCount = document.createElement('span');
    subfolderCount.id = `folder-subfolder-count-${folder.id}`;
    subfolderCount.style.cssText = 'color: rgba(255, 255, 255, 0.6); font-size: 0.7rem;margin-right: 4px;';
    subfolderCount.innerText = `${folder?.subfolders?.length || 0} folder${folder?.subfolders?.length === 1 ? '' : 's'} -`;
    textWrapper.appendChild(subfolderCount);

    const promptCount = document.createElement('span');
    promptCount.id = `folder-prompt-count-${folder.id}`;
    promptCount.style.cssText = 'color: rgba(255, 255, 255, 0.6); font-size: 0.7rem;';
    promptCount.innerText = `${folder.prompt_count || 0} prompt${folder.prompt_count !== 1 ? 's' : ''}`;
    textWrapper.appendChild(promptCount);
  }

  wrapper.appendChild(content);

  // Settings button (three-dot menu)
  const settingsBtn = document.createElement('div');
  settingsBtn.id = `prompt-folder-settings-button-${folder.id}`;
  settingsBtn.className =
    'absolute end-1 items-center justify-center h-6 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary hidden group-hover:flex';
  settingsBtn.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg>';
  settingsBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    settingsBtn.classList.replace('hidden', 'flex');
    showPromptManagerFolderMenu(settingsBtn, folder, isTopLevel, isSubfolder);
  });

  if (folder.id !== 'public' && !isLocked) wrapper.appendChild(settingsBtn);

  if (isLocked) {
    const lockIcon = document.createElement('div');
    lockIcon.className = 'absolute end-1 flex items-center justify-center h-6 rounded-lg px-2';
    lockIcon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="icon icon-lg" fill="#ef4146"><path d="M80 192V144C80 64.47 144.5 0 224 0C303.5 0 368 64.47 368 144V192H384C419.3 192 448 220.7 448 256V448C448 483.3 419.3 512 384 512H64C28.65 512 0 483.3 0 448V256C0 220.7 28.65 192 64 192H80zM144 192H304V144C304 99.82 268.2 64 224 64C179.8 64 144 99.82 144 144V192z"/></svg>';
    wrapper.appendChild(lockIcon);
  }

  return wrapper;
}

/**
 * Update the prompt count displayed on folder elements in the DOM.
 * Original: line 20005
 */
export function updatePromptFolderCount(folderId: string | number | null, promptIds: string[]): void {
  const targetCountEls = document.querySelectorAll(`#folder-prompt-count-${folderId}`);

  promptIds.forEach((pid) => {
    const card = document.querySelector(`div#prompt-card-${pid}[data-folder-id]`) as HTMLElement | null;
    if (card) {
      const cardFolderId = card.dataset.folderId;
      if (!cardFolderId || cardFolderId === folderId) return;
      if (!isDefaultPromptFolder(cardFolderId)) {
        document.querySelectorAll(`#folder-prompt-count-${cardFolderId}`).forEach((el) => {
          const count = parseInt(el.textContent!.split(' ')[0]!, 10) - 1;
          el.textContent = `${count} prompt${count !== 1 ? 's' : ''}`;
        });
      }
    }
    if (folderId && !isDefaultPromptFolder(folderId)) {
      targetCountEls.forEach((el) => {
        const count = parseInt(el.textContent!.split(' ')[0]!, 10) + 1;
        el.textContent = `${count} prompt${count !== 1 ? 's' : ''}`;
      });
    }
  });
}

/**
 * Fetch sub-folders for a given prompt folder (with throttling).
 * Original: line 20023
 */
export const throttleGetPromptSubFolders = throttle(async (folderId?: string | number, forceRefresh = false) => {
  await getPromptSubFolders(folderId, forceRefresh);
}, 500);

/** Internal: fetch prompt sub-folders from the background and render them. */
async function getPromptSubFolders(folderId?: string | number, forceRefresh = false): Promise<void> {
  if (!folderId) return;
  const subfolderList = document.querySelector('#modal-manager #prompt-manager-subfolder-list') as HTMLElement | null;
  if (subfolderList) subfolderList.innerHTML = '';
  if (isDefaultPromptFolder(folderId)) return;

  const { selectedPromptsManagerFoldersSortBy: sortBy = 'alphabetical' } = cachedSettings as any;
  chrome.runtime.sendMessage(
    { type: 'getPromptFolders', forceRefresh, detail: { sortBy, parentFolderId: folderId } },
    (resp: any) => {
      if (resp && Array.isArray(resp) && resp.length > 0) {
        resp.forEach((sub: any) => {
          subfolderList?.appendChild(promptFolderElement(sub, false, true)!);
        });
      }
    },
  );
}

/**
 * Handle the inline rename flow for a prompt folder.
 * Original: line 20818
 */
export function handleRenamePromptFolderClick(folderId: string | number): void {
  let committed = false;
  closeMenus();

  const input = document.createElement('input');
  const nameEl = document.querySelector(`#prompt-folder-name-${folderId}`) as HTMLElement | null;
  if (!nameEl) return;
  const originalName = nameEl.innerText;

  input.id = `prompt-folder-rename-${folderId}`;
  input.className = 'border-0 bg-transparent p-0 focus:ring-0 focus-visible:ring-0 w-full text-white text-sm';
  input.value = originalName;
  nameEl.parentElement?.replaceChild(input, nameEl);
  input.focus();
  setTimeout(() => input.select(), 50);

  input.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();
    input.focus();
  });

  input.addEventListener('blur', () => {
    if (committed) return;
    const newName = input.value;
    if (newName !== originalName) updatePromptFolderNameElement(nameEl, folderId, newName);
    input.parentElement?.replaceChild(nameEl, input);
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.which === 13) {
      committed = true;
      const newName = input.value;
      if (newName !== originalName) updatePromptFolderNameElement(nameEl, folderId, newName);
      input.parentElement?.replaceChild(nameEl, input);
    }
    if (ev.key === 'Escape') {
      committed = true;
      nameEl.innerText = originalName;
      input.parentElement?.replaceChild(nameEl, input);
    }
  });
}

/**
 * Open a modal dialog to move prompts into a different folder.
 * Original: line 23518
 */
export async function openMovePromptToFolderModal(promptIds: string[]): Promise<void> {
  const html = `
  <div id="move-prompt-to-folder-modal" class="absolute inset-0" style="z-index: 10000;">
    <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
      <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
        <div id="move-prompt-to-folder-content" role="dialog" aria-describedby="radix-:r3o:" aria-labelledby="radix-:r3n:" data-state="open" class="popover bg-token-main-surface-primary relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col focus:outline-hidden overflow-hidden max-w-lg" tabindex="-1" style="pointer-events: auto;">
          <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
            <div class="flex">
              <div class="flex items-center">
                <div class="flex grow flex-col gap-1">
                  <h2 as="h3" class="text-lg font-medium leading-6 text-token-text-primary">${translate('Select a folder')}</h2>
                </div>
              </div>
            </div>
            <div class="flex items-center">
              <button id="move-prompt-to-folder-new-folder" class="btn flex justify-center gap-2 composer-submit-btn composer-submit-button-color me-2 border" data-default="true" style="min-width: 72px; height: 34px;">${translate('plus New Folder')}</button>
              <button id="move-prompt-to-folder-close-button" class="text-token-text-tertiary hover:text-token-text-primary transition">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20"
                  xmlns="http://www.w3.org/2000/svg">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="px-4 pt-4">
            <input id="move-prompt-to-folder-search-input" type="search" placeholder="${translate('Search folders')}" class="w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary">
          </div>
          <div id="move-prompt-to-folder-list" class="p-4 overflow-y-auto" style="height:500px;">
            <!-- folder list here -->
          </div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  await movePromptToFolderLoadFolderList();
  addMovePromptToFolderModalEventListener(promptIds);

  const debouncedSearch = debounce(async (term: string) => {
    await movePromptToFolderLoadFolderList(term);
    addMovePromptToFolderModalEventListener(promptIds);
  }, 500);

  const searchInput = document.querySelector('#move-prompt-to-folder-search-input') as HTMLInputElement | null;
  searchInput?.addEventListener('input', async () => {
    debouncedSearch(searchInput.value);
  });
}

/**
 * Debounced wrapper that refreshes quick-access menu items.
 * Original: line 10752
 */
export const debounceUpdateQuickAccessMenuItems = debounce(() => {
  updateQuickAccessMenuItems();
}, 300);

/** Internal: update the quick-access menu items based on current cursor position. */
function updateQuickAccessMenuItems(): void {
  const menuWrapper = document.querySelector('#quick-access-menu-wrapper') as HTMLElement | null;
  if (!menuWrapper) return;
  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  const menuContent = document.querySelector('#quick-access-menu-content') as HTMLElement | null;
  if (!textarea || !menuContent) return;

  if (textarea.innerText.length === 0) {
    menuWrapper.remove();
    return;
  }

  const sel = getSelectionPosition();
  if (!sel?.parentElement) return;

  const fullText = textarea.innerText;
  const atPos = -1;
  const slashPos = previousCharPosition(sel.parentElement, '/', sel.start);

  if (sel.start === 0 || (atPos === -1 && slashPos === -1)) {
    menuWrapper.remove();
    return;
  }

  let spacePos = nextCharPosition(sel.parentElement, ' ', sel.start);
  let newlinePos = nextCharPosition(sel.parentElement, '\n', sel.start);
  if (spacePos === -1) spacePos = fullText.length;
  if (newlinePos === -1) newlinePos = fullText.length;

  const endPos = Math.min(spacePos, newlinePos);
  const startPos = Math.max(atPos, slashPos);
  const triggerChar = getCharAtPosition(sel.parentElement, startPos);
  const searchTerm = getStringBetween(sel.parentElement, startPos + 1, endPos);

  if (triggerChar === '@') {
    loadCustomGPTs(searchTerm);
  } else if (triggerChar === '/') {
    loadPrompts(1, searchTerm);
  }
}

/**
 * Build and insert the quick-access menu (triggered by "/" or "@" in the textarea).
 * Original: line 10786
 */
export function quickAccessMenu(char: string): void {
  const existing = document.querySelector('#quick-access-menu-wrapper');
  if (existing) {
    existing.remove();
    return;
  }

  const menuWrapper = document.createElement('div');
  menuWrapper.id = 'quick-access-menu-wrapper';
  menuWrapper.className =
    'absolute flex flex-col gap-2 rounded-2xl popover bg-token-main-surface-primary shadow-long  px-1';
  menuWrapper.style.cssText = 'height: 300px; top:-304px; left:0; width:100%; z-index: 10000;';

  const header = document.createElement('div');
  header.className = 'flex justify-between items-center py-2 px-3 border-b border-token-border-medium';

  const title = document.createElement('h3');
  title.className = 'text-lg font-bold';
  header.appendChild(title);

  const actionBtn = document.createElement('button');
  actionBtn.className = 'btn flex justify-center gap-2 composer-submit-btn composer-submit-button-color border';
  actionBtn.type = 'button';
  header.appendChild(actionBtn);

  menuWrapper.appendChild(header);

  const form = document.querySelector('main form') as HTMLElement | null;
  if (!form) return;

  form.classList.add('relative');
  form.appendChild(menuWrapper);
  actionBtn.focus();

  if (char === '/') {
    title.textContent = `${translate('All Prompts')} (${char})`;
    actionBtn.id = 'see-all-custom-prompts';
    actionBtn.textContent = translate('plus Add New Prompt');
    actionBtn.addEventListener('click', () => {
      menuWrapper.remove();
      openPromptEditorModal({ title: '', steps: [''] });
    });

    const content = document.createElement('div');
    content.id = 'quick-access-menu-content';
    content.className = 'flex flex-col';
    content.style.cssText = 'overflow-y: auto;height: 100%; width: 100%;padding:3px;gap:2px;';
    content.innerHTML = '';
    content.appendChild(loadingSpinner('quick-access-menu-content'));
    menuWrapper.appendChild(content);

    updateQuickAccessMenuItems();
  }
}

// ---------------------------------------------------------------------------
// Text area helpers
// Original: content.isolated.end.js lines 7157-7235
// ---------------------------------------------------------------------------

/** Set the ChatGPT textarea value and dispatch input/change events. */
export function setTextAreaElementValue(text: string): void {
  const el = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!el) return;
  el.innerText = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  setSelectionAtEnd(el);
  updateInputCounter();
}

/** Add the character/word counter below the textarea. */
export function addInputCounter(): void {
  const existing = document.querySelector('#gptx-input-counter');
  existing?.remove();
  const counter = document.createElement('span');
  counter.id = 'gptx-input-counter';
  counter.classList.add('text-token-text-tertiary', 'select-none', 'absolute', 'text-xs', 'z-100');
  counter.style.cssText = 'bottom: -20px; right: 20px;';
  counter.innerText = `0 ${translate('chars')} \u2022 0 ${translate('words')}`;
  const form = document.querySelector('main form');
  if (form) {
    form.classList.add('relative');
    form.appendChild(counter);
  }
}

/** Update the character/word counter. */
export function updateInputCounter(): void {
  const el = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!el) return;
  const text = el.innerText;
  const counter = document.querySelector('#gptx-input-counter');
  if (counter) {
    const words = getWordCount(text);
    const chars = getCharCount(text);
    (counter as HTMLElement).innerText =
      `${Math.max(chars, 0)} ${translate('chars')} \u2022 ${Math.max(words, 0)} ${translate('words')}`;
  }
}

// ---------------------------------------------------------------------------
// Navigation helpers
// Original: content.isolated.end.js lines 10960-10999
// ---------------------------------------------------------------------------

/** Navigate to a new chat (optionally in a specific Gizmo). */
export function startNewChat(reload = false, gizmoId: string | null = null): void {
  if (gizmoId) {
    if (reload && isOnNewGizmoPage(gizmoId)) {
      refreshPage();
      return;
    }
    const link = document.querySelector(`nav a[href^="/g/${gizmoId}"]`) as HTMLAnchorElement | null;
    if (link) {
      link.click();
      return;
    }
    window.history.pushState({}, '', `/g/${gizmoId}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    return;
  }
  if (reload && isOnNewChatPage()) {
    refreshPage();
    return;
  }
  let btn = document.querySelector('nav a[href="/"]') as HTMLElement | null;
  const path = window.location.pathname;
  if (btn && path !== '/') {
    btn.click();
    return;
  }
  btn = document.querySelector('nav button[data-testid="create-new-chat-button"]');
  btn?.click();
}

// ---------------------------------------------------------------------------
// Attachment helpers
// Original: content.isolated.end.js lines 11343-11423
// ---------------------------------------------------------------------------

/** Extract file IDs from a prompt step's {sp_attachments:[...]} block. */
export function getFilesFromPromptStep(step: string): string[] {
  const re = /\{sp_attachments:\s*\[([^\]]*)\]\}/;
  const match = step.match(re);
  return match && match[1] ? match[1]!.split(',').map((s) => s.trim()) : [];
}

/** Attach files referenced in a prompt step to the ChatGPT file input. */
export async function attachFilesFromPromptToInput(step: string): Promise<void> {
  const fileRefs = getFilesFromPromptStep(step);
  if (fileRefs.length === 0) return;
  const fileInput = document.querySelector('main form input[type="file"]') as HTMLInputElement | null;
  if (!fileInput) return;

  const dt = new DataTransfer();
  for (const ref of fileRefs) {
    const parts = ref.split('__');
    const fileId = parts[0]!;
    const fileName = parts.slice(1).join('__') || 'attachment';
    const resp = await chrome.runtime.sendMessage({
      type: 'getPromptAttachment',
      detail: { fileId },
    });
    if (!resp || !resp.file) continue;
    const blob = await downloadFileFromUrl(resp.file, resp.file_id, true);
    const file = new File([blob], fileName || 'attachment', { type: blob.type });
    dt.items.add(file);
  }
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Create an attachment pill element for the prompt editor. */
export function createAttachmentPill(
  name: string,
  fileId: string | null = null,
  loadingIndex: number | null = null,
): HTMLDivElement {
  const pill = document.createElement('div');
  pill.className =
    'flex items-center justify-between bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary text-token-text-primary border border-token-border-medium rounded-lg px-3 py-1 text-sm me-2 mb-1 max-w-full relative';
  pill.style.cssText = 'height:32px;min-width:fit-content;overflow:hidden;';
  pill.title = name;
  if (fileId) {
    pill.dataset.fileId = fileId;
  } else {
    pill.id = `prompt-attachment-loading-pill-${loadingIndex}`;
  }

  const left = document.createElement('div');
  left.className = 'flex items-center justify-start overflow-hidden';
  pill.appendChild(left);

  const icon = document.createElement('span');
  icon.className = 'me-1';
  icon.innerHTML =
    '<svg viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon" height="20" width="20"><path d="M4.33496 12.5V7.5C4.33496 7.13273 4.63273 6.83496 5 6.83496C5.36727 6.83496 5.66504 7.13273 5.66504 7.5V12.5C5.66504 14.8942 7.60585 16.835 10 16.835C12.3942 16.835 14.335 14.8942 14.335 12.5V5.83301C14.3348 4.35959 13.1404 3.16522 11.667 3.16504C10.1934 3.16504 8.99822 4.35948 8.99805 5.83301V12.5C8.99805 13.0532 9.44679 13.502 10 13.502C10.5532 13.502 11.002 13.0532 11.002 12.5V7.5C11.002 7.13273 11.2997 6.83496 11.667 6.83496C12.0341 6.83514 12.332 7.13284 12.332 7.5V12.5C12.332 13.7877 11.2877 14.832 10 14.832C8.71226 14.832 7.66797 13.7877 7.66797 12.5V5.83301C7.66814 3.62494 9.45888 1.83496 11.667 1.83496C13.875 1.83514 15.6649 3.62505 15.665 5.83301V12.5C15.665 15.6287 13.1287 18.165 10 18.165C6.87131 18.165 4.33496 15.6287 4.33496 12.5Z"></path></svg>';
  left.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'me-2';
  label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;';
  label.textContent = name;
  left.appendChild(label);

  if (fileId) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'flex items-center justify-center text-token-text-tertiary hover:text-token-text-primary';
    removeBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-sm"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeBtn.addEventListener('click', () => pill.remove());
    pill.appendChild(removeBtn);
  } else {
    const spinner = document.createElement('button');
    spinner.className =
      'flex items-center justify-center text-token-text-tertiary hover:text-token-text-primary relative px-3';
    spinner.style.transform = 'scale(0.75)';
    spinner.appendChild(loadingSpinner('prompt-attachment-pill'));
    pill.appendChild(spinner);
  }

  return pill;
}

/** Convert attachment pills in a step wrapper back to the {sp_attachments:[...]} string. */
export function convertPillsToAttachmentString(stepIndex: number): string {
  const wrapper = document.querySelector(`#attachment-pills-wrapper-${stepIndex}`);
  if (!wrapper) return '';
  const pills = wrapper.querySelectorAll('div[data-file-id]');
  if (pills.length === 0) return '';
  const refs: string[] = [];
  pills.forEach((pill) => {
    const el = pill as HTMLElement;
    refs.push(`${el.dataset.fileId}__${el.textContent!.trim()}`);
  });
  return `{sp_attachments: [${refs.join(', ')}]}`;
}

/** Remove {sp_attachments:[...]} blocks from a step string. */
export function removeAttachmentsFromPromptStep(step: string): string {
  return step.replace(/\{sp_attachments:\s*\[([^\]]*)\]\}/, '');
}

/** Format attachments for display (replace block with readable list). */
export function formatAttachmentsForPromptStep(step: string): string {
  if (!step || step.trim() === '') return step;
  const re = /\{sp_attachments:\s*\[([^\]]*)\]\}/;
  const match = step.match(re);
  if (match && match[1]) {
    const names = match[1]!
      .split(',')
      .map((s) => s.trim())
      .map((s) => s.split('__').slice(1).join('__') || 'attachment')
      .join('\n- ');
    const formatted = `Attachments:\n- ${names}`;
    return step.replace(re, formatted);
  }
  return step;
}

/** Extract the instruction text from a smart step {{sp_instruction:...}} wrapper. */
export function extractInstructionsFromSmartStep(text: string): string {
  return text.match(/\{\{sp_instruction:(?<instruction>(?:[^{}]|\{\{[^{}]*\}\})*)\}\}/)?.groups?.instruction || '';
}

/** Clean up step text: remove attachments, extract smart step instructions, trim. */
export function cleanupStepText(step: string): string {
  let text = step;
  text = removeAttachmentsFromPromptStep(text);
  const instruction = extractInstructionsFromSmartStep(text);
  if (instruction) text = instruction;
  return text.trim();
}

// ---------------------------------------------------------------------------
// Insert prompt into textarea
// Original: content.isolated.end.js lines 10940-10958
// ---------------------------------------------------------------------------

/** Insert a prompt step's text into the ChatGPT textarea. */
export async function insertPromptIntoTextArea(prompt: PromptLike, stepIndex = 0): Promise<void> {
  const { steps } = prompt;
  await attachFilesFromPromptToInput(steps[stepIndex]!);
  let text = removeAttachmentsFromPromptStep(steps[stepIndex]!);
  const instruction = extractInstructionsFromSmartStep(text);
  if (instruction) text = (await generateNextPrompt(instruction)) || text;

  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!textarea) return;

  if (textarea.innerText && prompt.mode !== 'splitter') {
    const sel = getSelectionPosition();
    if (!sel?.parentElement) return;
    const slashPos = previousCharPosition(sel.parentElement, '/', sel.start);
    if (
      sel.start !== -1 &&
      slashPos !== -1 &&
      !getStringBetween(sel.parentElement, slashPos, sel.start).includes(' ')
    ) {
      insertTextAtPosition(sel.parentElement, text, slashPos, sel.end);
    } else {
      insertTextAtPosition(sel.parentElement, text, sel.start, sel.end);
    }
  } else {
    textarea.innerHTML = '<p></p>';
    insertTextAtPosition(textarea.firstChild, text, 0, 1e6);
  }
  updateInputCounter();
}

// ---------------------------------------------------------------------------
// Prompt chain execution
// Original: content.isolated.end.js lines 11641-11803
// ---------------------------------------------------------------------------

/** Reset the running prompt chain state. */
export function resetPromptChain(): void {
  const counter = document.querySelector('#running-prompt-chain-step-count');
  if (counter) {
    counter.remove();
    if (runningPromptChain || runningPromptChainStepIndex > 0) {
      setTimeout(() => {
        document.title = getConversationName();
      }, 500);
    }
  }
  runningPromptChain = undefined;
  runningPromptChainStepIndex = 0;
  templateWordsMap = {};
  hideGeneratingPromptText();
  showRerunLastPromptChain();
}

/** Check if the user can run prompts (subscription + limits). */
export async function canRunPrompts(prompt?: PromptLike): Promise<boolean> {
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  if (!hasSub) {
    if (prompt?.steps && prompt.steps.length > 2) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message: 'Running prompts with more than 2 steps requires a Pro account. Upgrade to Pro to remove all limits.',
      });
      return false;
    }
    const countResp = await chrome.runtime.sendMessage({ type: 'getPromptsCount', forceRefresh: true });
    if (countResp.count > 5) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message:
          'You have more than 5 prompts in your account. Remove some prompts or upgrade to Pro to remove all limits.',
      });
      return false;
    }
  }
  return true;
}

/** Run a prompt chain from a given step. */
export async function runPromptChain(prompt: PromptLike, startStep = 0, newChat = true): Promise<void> {
  if (prompt?.mode !== 'splitter' && !(await canRunPrompts(prompt))) return;
  initiateRunPromptChain(prompt, startStep, newChat);
}

/** Internal: initiate running a prompt chain. */
async function initiateRunPromptChain(prompt: PromptLike, step: number, newChat = true): Promise<void> {
  lastPromptChainId = null;
  resetPromptChain();

  if (newChat) {
    startNewChat();
    setTimeout(() => {
      const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
      if (textarea) {
        textarea.innerHTML = '<p></p>';
        runPromptChain(prompt, step, false);
      }
    }, 1000);
    return;
  }

  const form = document.querySelector('main form');
  if (!form) return;
  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!textarea) return;

  await insertPromptIntoTextArea(prompt, step);
  runningPromptChain = prompt;
  runningPromptChainStepIndex = step;
  lastPromptChainId = runningPromptChain.id ?? null;

  const existing = document.querySelector('#running-prompt-chain-step-count');
  existing?.remove();
  if (runningPromptChain.steps.length > 1) {
    const counter = createPromptChainStepCounter();
    document.title = `${runningPromptChainStepIndex + 1} / ${runningPromptChain.steps.length}`;
    form.appendChild(counter);
  }

  if (prompt.is_public && step === 0) {
    chrome.runtime.sendMessage({
      type: 'incrementPromptUseCount',
      forceRefresh: true,
      detail: { promptId: prompt.id },
    });
  }

  await promptTemplateHandler(prompt.steps[step]!);
  textarea.innerHTML = convertToParagraphs(textarea);

  const startTime = Date.now();
  const interval = setInterval(() => {
    const btn = getSubmitButton();
    if (btn && !btn.disabled) {
      clearInterval(interval);
      btn.click();
      updateInputCounter();
      return;
    }
    if (Date.now() - startTime > 30000) {
      clearInterval(interval);
      toast('Failed to run the prompt chain. Please try again.', 'error');
    }
  }, 300);
}

/** Create the running prompt chain step counter element. */
function createPromptChainStepCounter(): HTMLDivElement {
  const isSplitter = runningPromptChain?.mode === 'splitter';
  const el = document.createElement('div');
  el.id = 'running-prompt-chain-step-count';
  el.className = 'cursor-pointer text-xs absolute text-token-text-tertiary flex items-center justify-center z-10';
  el.style.cssText = 'top:-30px;right:16px;';

  if (runningPromptChain && runningPromptChain.steps.length > 1) {
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor" class="icon icon-xs me-1" viewBox="0 0 512 512"><path d="M328 160h-144C170.8 160 160 170.8 160 184v144C160 341.2 170.8 352 184 352h144c13.2 0 24-10.8 24-24v-144C352 170.8 341.2 160 328 160zM256 0C114.6 0 0 114.6 0 256s114.6 256 256 256s256-114.6 256-256S397.4 0 256 0zM256 464c-114.7 0-208-93.31-208-208S141.3 48 256 48s208 93.31 208 208S370.7 464 256 464z"/></svg> Running ${isSplitter ? 'splitter' : 'prompt chain'}: ${runningPromptChainStepIndex + 1} / ${runningPromptChain.steps.length} <span class="animate-flicker inline-block ms-1 w-2 h-2 rounded-full bg-gold"></span>`;
  }

  const convId = getConversationIdFromUrl();
  addTooltip(el, { value: 'Stop', position: 'left' });
  el.addEventListener('click', () => {
    stopAnimateFavicon(faviconTimeout);
    resetPromptChain();
    const name = getConversationName(null);
    if (convId) addConversationToSidebarAndSync(name, convId);
  });
  return el;
}

/** Add the prompt chain counter element to the form if missing. */
export function addPromptChainCounterElement(): void {
  const form = document.querySelector('main form');
  if (!form) return;
  let counter = document.querySelector('#running-prompt-chain-step-count');
  if (!counter) {
    counter = createPromptChainStepCounter();
    form.appendChild(counter);
  }
}

/** Insert the next step in a running prompt chain. */
export async function insertNextChain(prompt: PromptLike | undefined, step: number): Promise<void> {
  if (!prompt || !step) return;
  const isSplitter = prompt.mode === 'splitter';
  const { steps } = prompt;
  runningPromptChain = prompt;
  runningPromptChainStepIndex = step;

  const form = document.querySelector('main form');
  if (!form) return;
  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!textarea) return;

  await attachFilesFromPromptToInput(steps[step]!);
  let text = removeAttachmentsFromPromptStep(steps[step]!);
  const instruction = extractInstructionsFromSmartStep(text);
  if (instruction) text = (await generateNextPrompt(instruction)) || text;
  setTextAreaElementValue(text);

  let counter = document.querySelector('#running-prompt-chain-step-count') as HTMLElement | null;
  if (!counter) {
    counter = createPromptChainStepCounter();
    form.appendChild(counter);
  }
  counter.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor" class="icon icon-xs me-1" viewBox="0 0 512 512"><path d="M328 160h-144C170.8 160 160 170.8 160 184v144C160 341.2 170.8 352 184 352h144c13.2 0 24-10.8 24-24v-144C352 170.8 341.2 160 328 160zM256 0C114.6 0 0 114.6 0 256s114.6 256 256 256s256-114.6 256-256S397.4 0 256 0zM256 464c-114.7 0-208-93.31-208-208S141.3 48 256 48s208 93.31 208 208S370.7 464 256 464z"/></svg> Running ${isSplitter ? 'splitter' : 'prompt chain'}: ${step + 1} / ${steps.length} <span class="animate-flicker inline-block ms-1 w-2 h-2 rounded-full bg-gold"></span>`;
  document.title = `${step + 1} / ${steps.length}`;

  await promptTemplateHandler(text);
  textarea.innerHTML = convertToParagraphs(textarea);

  const startTime = Date.now();
  const interval = setInterval(() => {
    const btn = getSubmitButton();
    if (btn && !btn.disabled) {
      clearInterval(interval);
      btn.click();
      updateInputCounter();
      return;
    }
    if (Date.now() - startTime > 30000) {
      clearInterval(interval);
      toast('Failed to run the prompt chain. Please try again.', 'error');
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// Template variable handling
// Original: content.isolated.end.js lines 11804-11853
// ---------------------------------------------------------------------------

/** Handle {{variable}} template substitution in a prompt step. */
export async function promptTemplateHandler(text: string): Promise<void> {
  if (!cachedSettings.promptTemplate) {
    if (!window.localStorage.getItem('seenPromptTemplateToast')) {
      toast('Did you mean to use {{prompt templates}}? If yes, first turn it on in the Settings menu', 'success', 6000);
      window.localStorage.setItem('seenPromptTemplateToast', 'true');
    }
    return;
  }

  let processed = text;

  // Handle {{clipboard}}
  if (processed.includes('{{clipboard}}')) {
    let clipText = '';
    try {
      clipText = await navigator.clipboard.readText();
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      toast('Failed to read clipboard contents. Please allow clipboard access and try again.', 'error', 8000);
    }
    processed = processed.replace(/\{\{clipboard\}\}/g, clipText);
    setTextAreaElementValue(processed);
  }

  // Handle named template variables
  const matches = processed.match(/\{\{(?!files|file|clipboard)[^{}]+\}\}/g);
  if (matches && matches.length > 0) {
    const varNames = matches.map((m) => m.replace(/\{\{|\}\}/g, ''));
    const existingKeys = Object.keys(templateWordsMap);
    if (varNames.every((v) => existingKeys.includes(v))) {
      varNames.forEach((v) => {
        processed = processed.replace(`{{${v}}}`, templateWordsMap[v]!);
      });
      setTextAreaElementValue(processed);
    } else {
      processed = await createTemplateWordsModal(varNames);
    }
  }

  // Handle {{files}} / {{file}}
  if (processed.includes('{{files}}') || processed.includes('{{file}}')) {
    if (getPlusButton()) {
      const fileInput = document.querySelector('main form input[type="file"]') as HTMLInputElement | null;
      if (fileInput) {
        return new Promise<void>((resolve) => {
          const onChange = () => {
            const cleaned = processed.replace(/\{\{files\}\}/g, '').replace(/\{\{file\}\}/g, '');
            setTextAreaElementValue(cleaned);
            const waitInterval = setInterval(() => {
              const btn = getSubmitButton();
              if (btn && !btn.disabled) {
                clearInterval(waitInterval);
                resolve();
              }
            }, 200);
          };
          fileInput.addEventListener('change', onChange, { once: true });
          showConfirmDialog(
            'File Upload Required',
            `<div class="text-token-text-primary w-full text-md capitalize mb-2">Prompt preview</div><div class="w-full text-token-text-tertiary text-sm bg-token-sidebar-surface-secondary rounded-md border border-token-border-medium p-4 mb-8 italic" style="line-height: 2rem; white-space: pre-wrap; word-break: break-word;">${highlightBracket(processed)}</div>`,
            'Cancel',
            'Choose file\u2026',
            () => resetPromptChain(),
            () => fileInput.click(),
            'green',
          );
        });
      }
      console.error('File input element not found');
    }
    console.error('Upload file button not found');
  }
}

/**
 * Full template variable modal — left panel with input fields + suggestions,
 * right panel with live prompt preview. Uses createModal() for consistent UI.
 *
 * Original: content.isolated.end.js lines 13821-13913
 */
async function createTemplateWordsModal(varNames: string[]): Promise<string> {
  return new Promise<string>((resolve) => {
    const existing = document.querySelector('#modal-prompt-variables');
    existing?.remove();

    const uniqueNames = [...new Set(varNames)];
    const contentEl = templateWordsModalContent(uniqueNames);
    const actionsEl = templateWordsModalActions(varNames, resolve);

    createModal(
      'Prompt variables',
      'Please enter the value for the variables in your prompt',
      contentEl,
      actionsEl,
      true,
      'large',
    );

    setTimeout(() => {
      const allInputs = document.querySelectorAll<HTMLTextAreaElement>('[id^=template-input-]');
      const firstEmpty = Array.from(allInputs).find((inp) => inp.value === '');
      (firstEmpty || allInputs[0])?.focus();

      document.querySelector('#modal-close-button-prompt-variables')?.addEventListener('click', () => {
        resetPromptChain();
      });
      document.querySelector('#modal-prompt-variables')?.addEventListener('mousedown', (ev) => {
        const wrapper = document.querySelector('#modal-wrapper-prompt-variables');
        if (wrapper && !isDescendant(wrapper as HTMLElement, ev.target as HTMLElement)) {
          resetPromptChain();
        }
      });
    }, 100);
  });
}

/** Left panel: variable input fields with suggestion chips. Right panel: prompt preview. */
function templateWordsModalContent(uniqueNames: string[]): HTMLDivElement {
  const container = document.createElement('div');
  container.id = 'modal-content-prompt-variables';
  container.className = 'flex relative overflow-hidden h-full';

  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;

  // Left panel — input fields
  const leftPanel = document.createElement('div');
  leftPanel.className = 'overflow-y-auto h-full p-4';
  leftPanel.style.width = '60%';

  uniqueNames.forEach((name, idx) => {
    const row = document.createElement('div');
    row.id = `prompt-variable-row-${idx}`;
    row.style.cssText =
      'display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;width:100%;margin-bottom:12px;';

    const label = document.createElement('label');
    label.className = 'text-token-text-primary w-full text-sm capitalize mb-2';
    label.innerHTML = name;

    const input = document.createElement('textarea');
    input.className =
      'w-full h-24 text-token-text-primary text-sm bg-token-main-surface-secondary rounded-md border border-token-border-medium px-2 py-1';
    input.id = `template-input-${name}`;
    input.placeholder = `Enter the value for "${name}"`;
    input.value = templateWordsMap[name] || '';

    input.addEventListener('input', () => {
      const highlights = document.querySelectorAll<HTMLElement>(`#prompt-preview strong[data-word="${name}"]`);
      if (input.value.length === 0) {
        highlights.forEach((el) => {
          el.innerText = name;
        });
      }
    });
    input.addEventListener('focus', () => {
      document
        .querySelectorAll<HTMLElement>(`#prompt-preview strong[data-word="${name}"]`)
        .forEach((el) => el.classList.add('border-gold', 'text-gold'));
    });
    input.addEventListener('blur', () => {
      document
        .querySelectorAll<HTMLElement>(`#prompt-preview strong[data-word="${name}"]`)
        .forEach((el) => el.classList.remove('border-gold', 'text-gold'));
    });

    // Suggestion chips from stored prompt variable values
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'text-token-text-tertiary text-xs mt-2 flex gap-2 items-center flex-wrap';

    getPromptVariable(name).then((values) => {
      if (values && values.length > 0) {
        const chips = values
          .slice(0, 5)
          .map(
            (v, i) =>
              `<div id="suggestion-${i}" title="${v}" class="cursor-pointer rounded-md border border-token-border-medium bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary py-0.5 px-2">${v.length > 30 ? `${v.slice(0, 30)}...` : v}</div>`,
          );
        suggestionsDiv.innerHTML = `Suggestions: ${chips.join('')}`;
        values.slice(0, 5).forEach((val, i) => {
          suggestionsDiv.querySelector(`#suggestion-${i}`)?.addEventListener('click', () => {
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.selectionStart = input.selectionEnd = val.length;
            input.focus();
          });
        });
        row.appendChild(suggestionsDiv);
      }
    });

    row.appendChild(label);
    row.appendChild(input);
    leftPanel.appendChild(row);
  });

  container.appendChild(leftPanel);

  // Right panel — prompt preview
  const rightPanel = document.createElement('div');
  rightPanel.className = 'overflow-y-auto h-full bg-token-main-surface-secondary p-4';
  rightPanel.style.width = '40%';

  // Show instruction if running prompt chain has one
  if (runningPromptChain?.instruction) {
    const instrTitle = document.createElement('div');
    instrTitle.className = 'text-token-text-primary w-full text-md capitalize mb-2';
    instrTitle.innerHTML = 'Prompt Instruction';
    rightPanel.appendChild(instrTitle);

    const instrBody = document.createElement('div');
    instrBody.className =
      'w-full text-token-text-tertiary text-sm bg-token-sidebar-surface-secondary rounded-md border border-token-border-medium p-4 mb-8 italic';
    instrBody.innerText = runningPromptChain.instruction;
    rightPanel.appendChild(instrBody);
  }

  const previewTitle = document.createElement('div');
  previewTitle.className = 'text-token-text-primary w-full text-md capitalize mb-2';
  previewTitle.innerHTML = 'Prompt preview';
  rightPanel.appendChild(previewTitle);

  const preview = document.createElement('div');
  preview.id = 'prompt-preview';
  preview.className =
    'w-full text-token-text-tertiary text-sm bg-token-sidebar-surface-secondary rounded-md border border-token-border-medium p-4 mb-8 italic';
  preview.style.cssText = 'line-height:2rem;white-space:pre-wrap;word-break:break-word;';
  preview.innerHTML = highlightBracket(textarea?.innerText || '');
  rightPanel.appendChild(preview);

  container.appendChild(rightPanel);
  return container;
}

/** Actions bar for the template variables modal — "Continue" button. */
function templateWordsModalActions(allVarNames: string[], resolve: (value: string) => void): HTMLDivElement {
  const actions = document.createElement('div');
  actions.className = 'flex items-center justify-end flex-wrap w-full mt-2';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn composer-submit-btn composer-submit-button-color';
  submitBtn.innerHTML = 'Continue';
  submitBtn.id = 'modal-submit-button';
  submitBtn.addEventListener('click', () => {
    const textareaEl = document.querySelector('#prompt-textarea') as HTMLElement | null;
    let text = textareaEl?.innerText || '';

    allVarNames.forEach((name) => {
      const inputEl = document.getElementById(`template-input-${name}`) as HTMLTextAreaElement | null;
      const value = inputEl?.value || '';
      text = text.replace(`{{${name}}}`, value);
      templateWordsMap[name] = value;
      addPromptVariableValue(name, value);
    });

    setTextAreaElementValue(text);
    textareaEl?.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#modal-prompt-variables')?.remove();
    resolve(text);
  });

  actions.appendChild(submitBtn);
  return actions;
}

// ---------------------------------------------------------------------------
// Smart step AI generation
// Original: content.isolated.end.js lines 11856-11918
// ---------------------------------------------------------------------------

/** Show "Generating next prompt..." indicator. */
function showGeneratingPromptText(): void {
  const existing = document.querySelector('#smart-prompt-loading-wrapper');
  existing?.remove();
  if (!runningPromptChain) return;
  const form = document.querySelector('main form');
  if (!form) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'smart-prompt-loading-wrapper';
  wrapper.className = 'gap-2 flex items-center text-token-text-primary mx-auto absolute z-20';
  wrapper.style.cssText = 'top:-30px;left:50%;transform:translateX(-50%);';
  form.appendChild(wrapper);

  const icon = document.createElement('div');
  icon.className = 'cursor-pointer text-token-text-tertiary hover:text-token-text-primary feather-wave';
  icon.id = 'smart-prompt-loading';
  icon.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm"><path d="M467.1 44.85C438.3 15.97 401.7 0 361.7 0c-46.75 0-98.01 21.88-146.9 70.63L129.1 156.3c-74.99 75.12-72.23 196.4-56.24 248.9l-65.84 65.77c-9.374 9.374-9.374 24.6 0 33.98c9.374 9.374 24.6 9.374 33.98 0l65.64-65.62c17.37 5.25 42.36 9.138 70.86 9.138c57.12 0 127.1-15.56 178.1-65.56l85.75-85.75C531.1 206.6 529.6 107.5 467.1 44.85zM147.4 398.6l46.62-46.62h123.1c-44.5 41.87-106.7 48.5-140.5 48.5C166 400.5 156.1 399.6 147.4 398.6zM350.6 319.1H226l63.1-63.1h123.7c-2.25 2.375-3.1 4.875-6.375 7.25L350.6 319.1zM438.9 223.1h-116.9l22.5-22.5c9.374-9.374 9.374-24.62 0-33.1c-9.374-9.374-24.62-9.374-33.1 0l-196.1 196.1c-5.25-45.87-.25-124.2 49.5-174.1l85.74-85.74c36.1-36.1 75.99-56.62 112.9-56.62c26.62 0 51.37 10.75 71.49 30.87C472.2 117.1 473.1 171.1 438.9 223.1z"/></svg>';
  wrapper.appendChild(icon);

  const text = document.createElement('div');
  text.className = 'cursor-pointer text-token-text-tertiary hover:text-token-text-primary text-xs ms-1';
  text.id = 'smart-prompt-loading-text';
  text.textContent = 'Generating next prompt...';
  wrapper.appendChild(text);
}

/** Hide the generating prompt indicator. */
function hideGeneratingPromptText(): void {
  document.querySelector('#smart-prompt-loading-wrapper')?.remove();
}

/** Use AI to generate the next prompt from smart step instructions. */
async function generateNextPrompt(instruction: string): Promise<string | undefined> {
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  if (!hasSub) return instruction;

  showGeneratingPromptText();
  const articles = Array.from(document.querySelectorAll('main article'));
  const lastAssistant = articles.pop();
  const lastUser = articles.pop();
  const userText = (lastUser as HTMLElement | undefined)?.innerText?.trim().replace(/^You said:\s*/i, '') || '';
  const assistantText = (lastAssistant as HTMLElement | undefined)?.innerText?.trim() || '';

  const resp = await chrome.runtime.sendMessage({
    type: 'promptSameLanguage',
    detail: {
      prompt: [
        { role: 'user', content: userText },
        { role: 'assistant', content: assistantText },
        {
          role: 'user',
          content: `${instruction}\n\n\n  Response Rules:\n  - Respond only with the next user prompt.\n  - Do not include any explanations, notes, or additional information.\n  - Ensure the prompt is concise, actionable, and goal-seeking.\n  - Avoid using filler words or phrases.\n  - Do not reference previous messages or context.\n  - Focus solely on crafting the next user input based on the instruction provided.\n  `,
        },
      ],
      createOptions: {
        systemPrompt: 'Return only the user\u2019s next message\u2014concise, actionable, and goal-seeking.',
      },
      promptOptions: {},
      forceRefresh: false,
    },
  });

  hideGeneratingPromptText();
  if (chrome.runtime.lastError) {
    console.error('Background error:', chrome.runtime.lastError.message);
    return undefined;
  }
  if (resp?.ok) return (resp.text || '').trim();
  console.error('Prompt failed:', resp?.error, resp?.meta);
  return undefined;
}

// ---------------------------------------------------------------------------
// Rerun last prompt chain button
// Original: content.isolated.end.js lines 11647-11695
// ---------------------------------------------------------------------------

/** Show the "rerun last prompt chain" floating bar above the textarea. */
export async function showRerunLastPromptChain(): Promise<void> {
  const existing = document.querySelector('#rerun-prompt-chain-wrapper');
  existing?.remove();
  if (!cachedSettings.showRerunLastPromptChainButton || !lastPromptChainId || runningPromptChain) return;

  const prompt = await chrome.runtime.sendMessage({
    type: 'getPrompt',
    detail: { promptId: lastPromptChainId },
  });
  if (!prompt?.steps || prompt.steps.length === 0) return;

  const form = document.querySelector('main form');
  if (!form) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'rerun-prompt-chain-wrapper';
  wrapper.className =
    'w-40 gap-2 flex items-center bg-token-main-surface-secondary text-token-text-primary rounded-full px-1 py-1 mb-2 hover:bg-token-main-surface-tertiary border border-token-border-medium mx-auto absolute z-20';
  wrapper.style.cssText = 'top:-40px;left:50%;transform:translateX(-50%);';
  form.appendChild(wrapper);

  // Rerun button
  const rerunBtn = document.createElement('div');
  rerunBtn.className = 'cursor-pointer text-token-text-tertiary hover:text-token-text-primary';
  rerunBtn.id = 'rerun-prompt-chain-button';
  rerunBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm"><path d="M3.502 16.6663V13.3333C3.502 12.9661 3.79977 12.6683 4.16704 12.6683H7.50004L7.63383 12.682C7.93691 12.7439 8.16508 13.0119 8.16508 13.3333C8.16508 13.6547 7.93691 13.9227 7.63383 13.9847L7.50004 13.9984H5.47465C6.58682 15.2249 8.21842 16.0013 10 16.0013C13.06 16.0012 15.5859 13.711 15.9551 10.7513L15.9854 10.6195C16.0845 10.3266 16.3785 10.1334 16.6973 10.1732C17.0617 10.2186 17.3198 10.551 17.2745 10.9154L17.2247 11.2523C16.6301 14.7051 13.6224 17.3313 10 17.3314C8.01103 17.3314 6.17188 16.5383 4.83208 15.2474V16.6663C4.83208 17.0335 4.53411 17.3311 4.16704 17.3314C3.79977 17.3314 3.502 17.0336 3.502 16.6663ZM4.04497 9.24935C3.99936 9.61353 3.66701 9.87178 3.30278 9.8265C2.93833 9.78105 2.67921 9.44876 2.72465 9.08431L4.04497 9.24935ZM10 2.66829C11.9939 2.66833 13.8372 3.46551 15.1778 4.76204V3.33333C15.1778 2.96616 15.4757 2.66844 15.8428 2.66829C16.2101 2.66829 16.5079 2.96606 16.5079 3.33333V6.66634C16.5079 7.03361 16.2101 7.33138 15.8428 7.33138H12.5098C12.1425 7.33138 11.8448 7.03361 11.8448 6.66634C11.8449 6.29922 12.1426 6.0013 12.5098 6.0013H14.5254C13.4133 4.77488 11.7816 3.99841 10 3.99837C6.93998 3.99837 4.41406 6.28947 4.04497 9.24935L3.38481 9.16634L2.72465 9.08431C3.17574 5.46702 6.26076 2.66829 10 2.66829Z"></path></svg>';
  addTooltip(rerunBtn, { value: 'Rerun last prompt chain', position: 'top' });
  wrapper.appendChild(rerunBtn);
  rerunBtn.addEventListener('click', async () => {
    const p = await chrome.runtime.sendMessage({ type: 'getPrompt', detail: { promptId: lastPromptChainId } });
    wrapper.remove();
    lastPromptChainId = null;
    runPromptChain(p, 0, false);
  });

  // Edit button
  const editBtn = document.createElement('div');
  editBtn.className = 'cursor-pointer text-token-text-tertiary hover:text-token-text-primary';
  editBtn.id = 'edit-prompt-chain-button';
  editBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor"></path></svg>';
  addTooltip(editBtn, { value: 'Edit last prompt chain', position: 'top' });
  wrapper.appendChild(editBtn);
  editBtn.addEventListener('click', async () => {
    const p = await chrome.runtime.sendMessage({ type: 'getPrompt', detail: { promptId: lastPromptChainId } });
    openPromptEditorModal(p);
  });

  // Title
  const titleEl = document.createElement('div');
  titleEl.className = 'text-xs text-token-text-primary truncate ms-1 capitalize';
  titleEl.style.maxWidth = '120px';
  titleEl.id = 'prompt-chain-name';
  titleEl.textContent = prompt?.title || 'Prompt Chain';
  titleEl.title = prompt?.title || 'Prompt Chain';
  wrapper.appendChild(titleEl);

  // Close button
  const closeBtn = document.createElement('div');
  closeBtn.className = 'cursor-pointer text-token-text-tertiary hover:text-token-text-primary ms-auto pe-2';
  closeBtn.id = 'close-rerun-prompt-chain-button';
  closeBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm"><path d="M11.4142 10L15.7071 5.70711C16.0976 5.31658 16.0976 4.68342 15.7071 4.29289C15.3166 3.90237 14.6834 3.90237 14.2929 4.29289L10 8.58579L5.70711 4.29289C5.31658 3.90237 4.68342 3.90237 4.29289 4.29289C3.90237 4.68342 3.90237 5.31658 4.29289 5.70711L8.58579 10L4.29289 14.2929C3.90237 14.6834 3.90237 15.3166 4.29289 15.7071C4.68342 16.0976 5.31658 16.0976 5.70711 15.7071L10 11.4142L14.2929 15.7071C14.6834 16.0976 15.3166 16.0976 15.7071 15.7071C16.0976 15.3166 16.0976 14.6834 15.7071 14.2929L11.4142 10Z" fill="currentColor"></path></svg>';
  addTooltip(closeBtn, { value: 'Close', position: 'top' });
  wrapper.appendChild(closeBtn);
  closeBtn.addEventListener('click', () => {
    wrapper.remove();
    lastPromptChainId = null;
  });
}

// ---------------------------------------------------------------------------
// Prompt editor modal
// Original: content.isolated.end.js lines 11002-11331
// ---------------------------------------------------------------------------

/**
 * Show a dialog when user has no prompt folders, prompting them to create one.
 *
 * Original: content.isolated.end.js lines 11333-11341
 */
function addFolderConfirmDialog(): void {
  showConfirmDialog(
    "You don't have any prompt categories",
    'To create prompts, you need to have at least one category.',
    'Cancel',
    'Create New Prompt Category',
    () => {
      document.querySelector('#prompt-editor-modal')?.remove();
    },
    () => {
      document.querySelector('#prompt-editor-modal')?.remove();
      if (!document.querySelector('#modal-manager') || managerModalCurrentTab !== 'prompts') {
        createManager('prompts');
      }
      setTimeout(() => {
        document.querySelector<HTMLElement>('#add-prompt-folder-button')?.click();
      }, 500);
    },
    'green',
  );
}

/**
 * Create the tag selector UI with toggleable tag chips.
 *
 * Original: content.isolated.end.js lines 11616-11639
 */
function createTagSelector(
  selectedTags: Array<{ id: string | number; name: string }> = [],
  startVisible = false,
): HTMLDivElement {
  const section = document.createElement('div');
  section.id = 'tag-selector-section';
  section.className = `flex flex-col w-full items-start justify-start ${startVisible ? '' : 'hidden'}`;

  const title = document.createElement('div');
  title.className = 'text-token-text-tertiary text-sm my-2';
  title.id = 'tag-selector-title';
  title.textContent = translate('Select up to 3');
  section.appendChild(title);

  const container = document.createElement('div');

  chrome.runtime.sendMessage({ type: 'getPromptTags' }, (allTags: Array<{ id: string | number; name: string }>) => {
    if (!allTags) return;
    allTags.sort((a, b) => a.name.localeCompare(b.name));

    container.className = 'flex flex-wrap w-full items-center justify-start mt-2';
    container.id = 'tag-selector-container';

    for (const tag of allTags) {
      const isSelected = selectedTags.some((t) => t.id.toString() === tag.id.toString());
      const chip = document.createElement('div');
      chip.id = `tag-${String(tag.id).replace(/ /g, '-')}`;
      chip.className = `text-xs ${isSelected ? (isDarkMode() ? 'text-black bg-white' : 'text-white bg-black') : 'text-token-text-tertiary bg-transparent hover:bg-token-main-surface-secondary'} border border-token-border-medium rounded-md px-2 py-1 cursor-pointer me-2 mb-2 capitalize`;
      chip.dataset.selected = String(isSelected);
      chip.textContent = tag.name;
      chip.title = tag.name;

      chip.addEventListener('click', () => {
        title.classList.replace('text-red-500', 'text-token-text-tertiary');
        const selectedCount = document.querySelectorAll('#tag-selector-container > div[data-selected="true"]').length;
        if (selectedCount >= 3 && chip.dataset.selected === 'false') {
          toast('You can only select up to 3 tags');
          return;
        }
        if (chip.dataset.selected === 'false') {
          chip.classList.replace('text-token-text-tertiary', isDarkMode() ? 'text-black' : 'text-white');
          chip.classList.replace('bg-transparent', isDarkMode() ? 'bg-white' : 'bg-black');
          chip.classList.remove('hover:bg-token-main-surface-secondary');
          chip.dataset.selected = 'true';
        } else {
          chip.classList.replace(isDarkMode() ? 'text-black' : 'text-white', 'text-token-text-tertiary');
          chip.classList.replace(isDarkMode() ? 'bg-white' : 'bg-black', 'bg-transparent');
          chip.classList.add('hover:bg-token-main-surface-secondary');
          chip.dataset.selected = 'false';
        }
        const countEl = document.querySelector('#prompt-editor-modal #tag-selector-button-count');
        if (countEl) {
          countEl.textContent = `(${document.querySelectorAll('#tag-selector-container > div[data-selected="true"]').length})`;
        }
      });

      container.appendChild(chip);
    }
  });

  section.appendChild(container);
  return section;
}

/**
 * Open the prompt editor modal for creating or editing a prompt.
 *
 * Faithfully ports the full DOM construction including category/language
 * dropdowns, tag selector, instruction textarea, SortableJS step
 * reordering, auto-generate from conversation, unsaved changes detection,
 * and save/cancel with validation.
 *
 * Original: content.isolated.end.js lines 11002-11325
 */
export async function openPromptEditorModal(prompt: PromptLike): Promise<void> {
  // If prompt is a favorite, refresh data from backend
  let data = prompt;
  if (prompt.is_favorite && prompt.id) {
    const fresh = await chrome.runtime.sendMessage({
      type: 'getPrompt',
      detail: { promptId: prompt.id },
    });
    if (fresh) data = fresh;
  }

  const {
    id: promptId,
    title = '',
    instruction = '',
    steps = [''],
    language = 'en',
    tags = [],
    folder,
    steps_delay: stepsDelay,
    is_mine: isMine,
    is_public: isPublic = false,
    is_favorite: isFavorite = false,
  } = data;

  const isNew = promptId === undefined;

  // --- Overlay ---
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:10000;overflow-y:auto;max-height:100vh;';
  overlay.className = 'bg-black/50 dark:bg-black/80';
  overlay.id = 'prompt-editor-modal';

  // --- Content wrapper ---
  const content = document.createElement('div');
  content.style.cssText = 'max-width:100%;width:840px;height:90vh;max-height:90vh;';
  content.className =
    'bg-token-main-surface-primary rounded-xl flex flex-col items-start justify-start border border-token-border-medium relative py-4 shadow-md';
  content.id = 'prompt-editor-modal-content';
  if (promptId) content.dataset.id = String(promptId);

  // --- Header ---
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between w-full font-bold mb-9 px-4 text-token-text-primary text-lg';
  header.innerHTML = `<span class="flex items-center">${translate(isNew ? 'Create a new prompt' : 'Edit prompt')} <a href="https://www.youtube.com/watch?v=ha2AiwOglt4" target="_blank" rel="noreferrer"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md ps-0.5 text-token-text-tertiary h-5 w-5 ms-2"><path fill="currentColor" d="M13 12a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0zM12 9.5A1.25 1.25 0 1 0 12 7a1.25 1.25 0 0 0 0 2.5"></path><path fill="currentColor" fill-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0" clip-rule="evenodd"></path></svg></a></span> <button class="btn composer-submit-btn composer-submit-button-color flex justify-center gap-2 border" id="see-all-prompt-chains">${translate('See all prompts')}</button>`;
  content.appendChild(header);

  // --- Category + Language dropdown row ---
  const dropdownRow = document.createElement('div');
  dropdownRow.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:8px;position:relative;padding:0 16px 16px 16px;';
  content.appendChild(dropdownRow);

  const categoryWrapper = document.createElement('div');
  categoryWrapper.style.cssText = 'position:relative;min-width:170px;width:170px;z-index:1000;';
  dropdownRow.appendChild(categoryWrapper);

  const languageWrapper = document.createElement('div');
  languageWrapper.style.cssText = 'position:relative;min-width:170px;width:170px;z-index:1000;';
  dropdownRow.appendChild(languageWrapper);

  // Populate category dropdown
  let selectedLang = (cachedSettings as Record<string, any>).selectedPromptEditorLanguage;

  chrome.runtime.sendMessage(
    { type: 'getAllPromptFolders', forceRefresh: true, detail: { sortBy: 'alphabetical' } },
    (folders: any[]) => {
      if (!folders) return;
      if (folders.length === 0 && !title) addFolderConfirmDialog();
      const selected =
        folder && typeof folder.id === 'number'
          ? folders.find((f) => f.id.toString() === folder.id.toString())
          : folders[0];
      chrome.storage.local.set({
        settings: { ...cachedSettings, selectedPromptEditorCategory: selected },
      });
      categoryWrapper.innerHTML = dropdown('Prompt-Editor-Category', folders, selected ?? null, 'id', 'left');
      addDropdownEventListener('Prompt-Editor-Category', folders, 'id');
    },
  );

  // Populate language dropdown
  if (language) {
    const match = languageList.find((l) => l.code === language);
    if (match) selectedLang = match;
  }
  const langItems = [{ code: 'select', name: 'Select' }, ...languageList.slice(1)];
  languageWrapper.innerHTML = dropdown('Prompt-Editor-Language', langItems, selectedLang ?? null, 'code', 'right');

  // --- Name + Delay row ---
  const nameRow = document.createElement('div');
  nameRow.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:8px;position:relative;padding:0 16px 16px 16px;';
  content.appendChild(nameRow);

  const nameCol = document.createElement('div');
  nameCol.style.cssText = 'width:100%;margin-right:16px;';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'w-full text-sm text-token-text-tertiary';
  nameLabel.textContent = translate('Prompt Name');
  nameCol.appendChild(nameLabel);
  const nameInput = document.createElement('input');
  nameInput.id = 'prompt-editor-name-input';
  nameInput.className =
    'w-full text-sm text-token-text-primary border border-token-border-medium rounded-md bg-token-main-surface-secondary px-2 py-1 text-sm h-10';
  nameInput.placeholder = 'Test Prompt';
  nameInput.value = title;
  nameInput.addEventListener('input', () => {
    nameInput.style.border = '1px solid #565869';
  });
  nameCol.appendChild(nameInput);
  nameRow.appendChild(nameCol);

  const delayCol = document.createElement('div');
  delayCol.style.cssText = 'min-width:200px;';
  const delayLabel = document.createElement('label');
  delayLabel.className = 'flex w-full text-sm text-token-text-tertiary';
  delayLabel.textContent = translate('Delay between steps');
  delayLabel.appendChild(
    createInfoIcon(
      'The delay (in milliseconds) after last step response is received and before sending the next step. This can help prevent rate limiting.',
      'top',
      'margin-left:0',
    ),
  );
  delayCol.appendChild(delayLabel);
  const delayInput = document.createElement('input');
  delayInput.id = 'prompt-editor-delay-input';
  delayInput.className =
    'w-full text-sm text-token-text-primary border border-token-border-medium rounded-md bg-token-main-surface-secondary px-2 py-1 text-sm h-10';
  delayInput.placeholder = '2000';
  delayInput.value = String(stepsDelay || '2000');
  delayInput.addEventListener('input', () => {
    delayInput.style.border = '1px solid #565869';
  });
  delayCol.appendChild(delayInput);
  nameRow.appendChild(delayCol);

  const msLabel = document.createElement('span');
  msLabel.style.cssText = 'right:24px;z-index:999;bottom:24px;';
  msLabel.className = 'text-sm text-token-text-tertiary absolute';
  msLabel.textContent = 'ms';
  nameRow.appendChild(msLabel);

  // --- Tag selector + Instruction toggle buttons ---
  const toggleRow = document.createElement('div');
  toggleRow.className = 'flex items-center justify-start w-full px-4';
  content.appendChild(toggleRow);

  const tagToggleBtn = document.createElement('button');
  tagToggleBtn.id = 'tag-selector-button';
  tagToggleBtn.className = 'btn flex justify-center gap-2 btn-secondary me-2';
  tagToggleBtn.innerHTML = `<span id="tag-selector-button-text">${translate('Show tags')}</span><span id="tag-selector-button-count">(${tags.length})</span>`;
  tagToggleBtn.addEventListener('click', () => {
    const instrBtn = document.querySelector('#instruction-selector-button');
    if (instrBtn) instrBtn.textContent = translate('Show instructions');
    document.querySelector('#instruction-section')?.classList.add('hidden');
    const textEl = tagToggleBtn.querySelector('#tag-selector-button-text')!;
    if (textEl.textContent === translate('Hide tags')) {
      textEl.textContent = translate('Show tags');
      document.querySelector('#tag-selector-section')?.classList.add('hidden');
      return;
    }
    textEl.textContent = translate('Hide tags');
    document.querySelector('#tag-selector-section')?.classList.remove('hidden');
  });
  toggleRow.appendChild(tagToggleBtn);

  const instrToggleBtn = document.createElement('button');
  instrToggleBtn.id = 'instruction-selector-button';
  instrToggleBtn.className = 'btn flex justify-center gap-2 btn-secondary me-2';
  instrToggleBtn.textContent = translate('Show instructions');
  instrToggleBtn.addEventListener('click', () => {
    const tagBtnText = document.querySelector('#tag-selector-button #tag-selector-button-text');
    if (tagBtnText) tagBtnText.textContent = translate('Show tags');
    document.querySelector('#tag-selector-section')?.classList.add('hidden');
    if (instrToggleBtn.textContent === translate('Hide instructions')) {
      instrToggleBtn.textContent = translate('Show instructions');
      document.querySelector('#instruction-section')?.classList.add('hidden');
      return;
    }
    instrToggleBtn.textContent = translate('Hide instructions');
    document.querySelector('#instruction-section')?.classList.remove('hidden');
  });
  toggleRow.appendChild(instrToggleBtn);

  // --- Tag selector section ---
  const tagSectionWrapper = document.createElement('div');
  tagSectionWrapper.className = 'w-full ps-8 pe-4 pt-2';
  tagSectionWrapper.appendChild(createTagSelector(tags));
  content.appendChild(tagSectionWrapper);

  // --- Instruction section ---
  const instrSection = document.createElement('div');
  instrSection.id = 'instruction-section';
  instrSection.className = 'hidden w-full ps-8 pe-4 pt-2';
  const instrTextarea = document.createElement('textarea');
  instrTextarea.id = 'prompt-editor-instruction-textarea';
  instrTextarea.className =
    'w-full h-full bg-token-main-surface-secondary text-token-text-primary border border-token-border-medium rounded-xl px-2 py-1 text-sm placeholder:text-gray-500';
  instrTextarea.placeholder =
    'Add instructions on how to use this prompt, what are the expected variable and responses, etc. This instruction is only for your reference when using the prompt and will not be sent to the AI model.';
  instrTextarea.style.cssText = 'height:100px;';
  instrTextarea.value = instruction;
  instrSection.appendChild(instrTextarea);
  content.appendChild(instrSection);

  // --- Steps label + auto-generate ---
  const stepsHeaderRow = document.createElement('div');
  stepsHeaderRow.style.cssText = 'display:flex;align-items:end;justify-content:between;width:100%;padding:16px;';
  const stepsLabelText = document.createElement('label');
  stepsLabelText.className = 'w-full text-sm text-token-text-tertiary';
  stepsLabelText.textContent = translate('Steps');
  stepsHeaderRow.appendChild(stepsLabelText);

  // Steps wrapper
  const stepsWrapper = document.createElement('div');
  stepsWrapper.id = 'prompt-editor-steps-wrapper';
  stepsWrapper.style.cssText =
    'width:100%;height:100%;display:flex;flex-direction:column;align-items:start;justify-content:start;overflow:auto;padding:0 16px;scroll-behavior:smooth;';

  // Auto-generate button (new prompts only)
  if (isNew) {
    const autoGenBtn = document.createElement('button');
    autoGenBtn.className = 'btn flex justify-center gap-2 btn-secondary';
    autoGenBtn.textContent = translate('Auto generate steps from current conversation');
    stepsHeaderRow.appendChild(autoGenBtn);
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
      autoGenBtn.addEventListener('click', () => {
        const userMessages = document.querySelectorAll('main article div[data-message-author-role="user"]');
        const texts: string[] = [];
        userMessages.forEach((msg) => {
          const wrap = msg.querySelector('div.whitespace-pre-wrap');
          if (wrap) texts.push((wrap as HTMLElement).innerText);
        });
        if (texts.length === 0) {
          toast('Open an existing conversation, then try again!', 'error');
          return;
        }
        if (!hasSub && texts.length >= 2) {
          errorUpgradeConfirmation({
            type: 'limit',
            title: 'You have reached the limit',
            message: 'Prompts with free account cannot have more than 2 steps. Upgrade to Pro to remove all limits.',
          });
          return;
        }
        stepsWrapper.innerHTML = '';
        const tmpPrompt = { ...data, steps: texts };
        texts.forEach((_text, idx) => {
          stepsWrapper.appendChild(createPromptEditorStep(tmpPrompt, idx));
        });
      });
    });
  }

  content.appendChild(stepsHeaderRow);

  // Populate initial steps
  steps.forEach((_step, idx) => {
    stepsWrapper.appendChild(createPromptEditorStep(data, idx));
  });

  // SortableJS for drag-and-drop reordering
  try {
    const Sortable = (await import('sortablejs')).default;
    Sortable.create(stepsWrapper, {
      handle: '#prompt-editor-drag-handle',
      direction: 'vertical',
      selectedClass: 'multi-drag-selected',
    });
  } catch (err) {
    console.warn('[Council] SortableJS not available for prompt steps:', err);
  }

  content.appendChild(stepsWrapper);

  // --- Bottom row ---
  const bottomRow = document.createElement('div');
  bottomRow.className = 'flex items-end justify-between w-full mt-auto px-4 flex-wrap';
  content.appendChild(bottomRow);

  // Checkboxes
  const checkRow = document.createElement('div');
  checkRow.className = 'flex items-center justify-end mt-3 w-full';
  bottomRow.appendChild(checkRow);

  const favWrap = document.createElement('div');
  favWrap.className = 'flex items-center justify-end me-6';
  const favLabel = document.createElement('label');
  favLabel.htmlFor = 'favorite-prompt-checkbox';
  favLabel.textContent = translate('Favorite');
  favLabel.className = 'text-token-text-tertiary';
  favWrap.appendChild(favLabel);
  const favCheck = document.createElement('input');
  favCheck.type = 'checkbox';
  favCheck.id = 'favorite-prompt-checkbox';
  favCheck.className = 'ms-2';
  favCheck.checked = isFavorite;
  favWrap.appendChild(favCheck);
  checkRow.appendChild(favWrap);

  const pubWrap = document.createElement('div');
  pubWrap.className = 'flex items-center justify-end';
  const pubLabel = document.createElement('label');
  pubLabel.htmlFor = 'public-prompt-checkbox';
  pubLabel.textContent = translate('public');
  pubLabel.className = 'text-token-text-tertiary';
  pubWrap.appendChild(pubLabel);
  const pubCheck = document.createElement('input');
  pubCheck.type = 'checkbox';
  pubCheck.id = 'public-prompt-checkbox';
  pubCheck.className = 'ms-2';
  pubCheck.checked = isPublic;
  pubWrap.appendChild(pubCheck);
  checkRow.appendChild(pubWrap);

  // Add step buttons
  const addBtnsRow = document.createElement('div');
  addBtnsRow.className = 'flex items-center justify-start flex-wrap';
  bottomRow.appendChild(addBtnsRow);

  const addStepBtn = document.createElement('button');
  addStepBtn.className = 'btn composer-submit-btn composer-submit-button-color flex justify-center gap-2 border';
  addStepBtn.style.cssText = 'margin-top:16px;';
  addStepBtn.id = 'prompt-editor-add-step-button';
  addStepBtn.textContent = translate('plus Add New Step');
  addBtnsRow.appendChild(addStepBtn);

  const addSmartBtn = document.createElement('button');
  addSmartBtn.className = 'btn flex justify-center gap-2 btn-success border';
  addSmartBtn.style.cssText = 'margin-top:16px;margin-left:8px;';
  addSmartBtn.textContent = translate('plus Add Smart Step');
  addBtnsRow.appendChild(addSmartBtn);

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    addStepBtn.addEventListener('click', () => {
      const existing = document.querySelectorAll('[id^="prompt-editor-input-"]');
      if (!hasSub && existing.length >= 2) {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message: 'Prompts with free account cannot have more than 2 steps. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      const stepEl = createPromptEditorStep(data, existing.length);
      stepsWrapper.appendChild(stepEl);
      stepEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
      setTimeout(() => stepEl.querySelector('textarea')?.focus(), 500);
    });
    addSmartBtn.addEventListener('click', () => {
      const existing = document.querySelectorAll('[id^="prompt-editor-input-"]');
      if (!hasSub) {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'This is a Pro feature',
          message:
            'Adding Smart Steps to prompt chain requires a Pro subscription. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      const stepEl = createPromptEditorStep(data, existing.length, true);
      stepsWrapper.appendChild(stepEl);
      stepEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
      setTimeout(() => stepEl.querySelector('textarea')?.focus(), 500);
    });
  });

  // Save / cancel buttons
  const saveCancelRow = document.createElement('div');
  saveCancelRow.className = 'flex items-center justify-end flex-wrap';
  bottomRow.appendChild(saveCancelRow);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn flex justify-center gap-2 btn-secondary border me-2';
  cancelBtn.style.cssText = 'margin-top:16px;margin-left:8px;';
  cancelBtn.textContent = translate('Cancel');
  cancelBtn.id = 'prompt-editor-cancel-button';
  cancelBtn.addEventListener('click', () => {
    stepsObserver.disconnect();
    overlay.remove();
  });
  saveCancelRow.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn composer-submit-btn composer-submit-button-color flex justify-center gap-2 border';
  saveBtn.style.cssText = 'margin-top:16px;margin-left:8px;';
  saveBtn.id = 'prompt-editor-submit-button';
  saveBtn.textContent = translate(isNew ? 'Save to my Prompts' : 'Update Prompt');
  saveBtn.addEventListener('click', () => {
    saveBtn.disabled = true;

    // Validate category
    if (!document.querySelector('#selected-prompt-editor-category-title')) {
      saveBtn.disabled = false;
      addFolderConfirmDialog();
      return;
    }

    // Validate name
    const name = nameInput.value;
    if (!name) {
      saveBtn.disabled = false;
      nameInput.focus();
      nameInput.style.border = '1px solid #ff4a4a';
      toast('Please enter a prompt name', 'error');
      return;
    }
    if (name.length > 200) {
      saveBtn.disabled = false;
      nameInput.focus();
      nameInput.style.border = '1px solid #ff4a4a';
      toast('Prompt name cannot exceed 200 characters', 'error');
      return;
    }

    // Validate delay
    const delay = parseInt(delayInput.value, 10);
    if (!delay) {
      saveBtn.disabled = false;
      delayInput.focus();
      delayInput.style.border = '1px solid #ff4a4a';
      toast('Please enter a valid delay in milliseconds', 'error');
      return;
    }

    // Collect steps
    const stepTexts: string[] = [];
    document.querySelectorAll('[id^=prompt-editor-input-]').forEach((el, idx) => {
      const ta = el as HTMLTextAreaElement;
      const attachStr = convertPillsToAttachmentString(idx);
      const text =
        ta.dataset.smartstep === 'true' && ta.value.trim()
          ? `{{sp_instruction:${ta.value}}}${attachStr}`
          : `${ta.value}${attachStr}`;
      if (text) stepTexts.push(text);
    });
    if (stepTexts.length === 0) {
      saveBtn.disabled = false;
      toast('Please add at least one step to the prompt chain', 'error');
      return;
    }

    const isPublicChecked = pubCheck.checked;
    const isFavChecked = favCheck.checked;
    const instrText = instrTextarea.value;
    const tagEls = document.querySelectorAll('#tag-selector-container > div[data-selected="true"]');
    const { selectedPromptEditorCategory } = cachedSettings as Record<string, any>;

    const promptData: Record<string, unknown> = {
      title: name,
      instruction: instrText,
      steps: stepTexts,
      steps_delay: delay,
      is_public: isPublicChecked,
      is_favorite: isFavChecked,
      folder: selectedPromptEditorCategory?.id,
      language: (cachedSettings as Record<string, any>).selectedPromptEditorLanguage?.code,
      tags: Array.from(tagEls).map((el) => (el as HTMLElement).id.split('tag-')[1]),
    };

    if (!isNew) promptData.id = promptId;
    if (isNew) updatePromptFolderCount(selectedPromptEditorCategory?.id, [String(promptId || '')]);

    chrome.runtime.sendMessage(
      { type: isNew ? 'addPrompts' : 'updatePrompt', detail: { prompts: [promptData], promptData } },
      (resp: any) => {
        if (resp?.error?.type === 'limit') {
          saveBtn.disabled = false;
          errorUpgradeConfirmation(resp.error);
          return;
        }
        const saved = isNew ? resp[0] : resp;
        if (typeof isFavorite !== 'undefined') initializeContinueButton(true);
        stepsObserver.disconnect();
        overlay.remove();
        if (document.querySelector('#modal-manager') && managerModalCurrentTab === 'prompts') {
          addOrReplacePromptCard(saved);
        }
        toast(`Prompt is ${isNew ? 'added to your prompts' : 'updated'}!`);
      },
    );
  });
  saveCancelRow.appendChild(saveBtn);

  // --- Unsaved changes detection on backdrop click ---
  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'prompt-editor-modal') return;

    // Check for expanded elements
    const expandEl = document.querySelector('[data-expandtype="collapse"]');
    if (expandEl) {
      (expandEl.parentElement as HTMLElement)?.click();
      return;
    }

    // Detect unsaved changes
    const curCategory = document.querySelector('#selected-prompt-editor-category-title')?.textContent || '';
    const curName = nameInput.value;
    const curDelay = delayInput.value;
    const curTagStr = Array.from(document.querySelectorAll('#tag-selector-container > div[data-selected="true"]'))
      .map((el) => (el as HTMLElement).textContent?.toLowerCase())
      .sort()
      .join('');
    const curInstr = instrTextarea.value;
    const curSteps = Array.from(document.querySelectorAll('[id^="prompt-editor-input-"]'))
      .map((el, idx) => `${(el as HTMLTextAreaElement).value}${convertPillsToAttachmentString(idx)}`)
      .join('');
    const curPublic = pubCheck.checked;
    const curFav = favCheck.checked;

    const isNewUnsaved = isNew && ((title === '' && curName !== '') || (steps.join('') === '' && curSteps !== ''));
    const isEditUnsaved =
      !isNew &&
      (curCategory !== (folder?.name || '') ||
        curName !== title ||
        curDelay !== String(stepsDelay) ||
        curTagStr !==
          tags
            .map((t) => t.name)
            .sort()
            .join('') ||
        curInstr !== (instruction || '') ||
        curSteps !== steps.join('') ||
        curPublic !== isPublic ||
        curFav !== isFavorite);

    if (isNewUnsaved || isEditUnsaved) {
      showConfirmDialog(
        'Discard changes',
        'You have unsaved changes. Are you sure you want to discard them?',
        'Keep editing',
        'Discard changes',
        null,
        () => {
          stepsObserver.disconnect();
          overlay.remove();
        },
        'red',
      );
      return;
    }

    stepsObserver.disconnect();
    overlay.remove();
  });

  // --- Mount ---
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // "See all prompts" button
  document.querySelector('#see-all-prompt-chains')?.addEventListener('click', () => {
    overlay.remove();
    if (!document.querySelector('#modal-manager') || managerModalCurrentTab !== 'prompts') {
      createManager('prompts');
    }
  });

  // Language dropdown event listener
  addDropdownEventListener('Prompt-Editor-Language', langItems, 'code');

  // --- Steps reindex observer ---
  const stepsObserver = new MutationObserver(() => {
    const children = stepsWrapper.childNodes;
    children.forEach((child, idx) => {
      const ta = (child as HTMLElement).querySelector('textarea');
      if (ta) {
        ta.id = `prompt-editor-input-${idx}`;
        ta.dataset.index = String(idx);
      }
      const rewriteBtn = (child as HTMLElement).querySelector('[id^="rewrite-prompt-step-button-"]');
      if (rewriteBtn) {
        rewriteBtn.id = `rewrite-prompt-step-button-${idx}`;
        (rewriteBtn as HTMLElement).dataset.index = String(idx);
      }
      const pillsWrapper = (child as HTMLElement).querySelector('[id^="attachment-pills-wrapper-"]');
      if (pillsWrapper) {
        pillsWrapper.id = `attachment-pills-wrapper-${idx}`;
        (pillsWrapper as HTMLElement).dataset.index = String(idx);
      }
      const countEl = (child as HTMLElement).querySelector('#prompt-chain-step-count');
      if (countEl) countEl.innerHTML = `${idx + 1} / ${children.length}`;
    });
  });
  stepsObserver.observe(stepsWrapper, { childList: true });
}

// ---------------------------------------------------------------------------
// Prompt editor step
// Original: content.isolated.end.js lines 11436-11613
// ---------------------------------------------------------------------------

/** Create a single step element for the prompt editor. */
function createPromptEditorStep(prompt: PromptLike, index: number, isSmart = false): HTMLDivElement {
  const stepText = prompt.steps[index] || '';
  const instruction = extractInstructionsFromSmartStep(stepText);
  const isSmartStep = isSmart || !!instruction;
  const files = getFilesFromPromptStep(stepText);
  const isNew = !prompt.id;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'align-self:stretch;overflow:auto;min-height:200px;z-index:999;';
  wrapper.className =
    'w-full flex items-center justify-between mb-4 rounded-xl relative h-full border border-token-border-medium';
  if (isSmartStep) {
    wrapper.style.border = 'solid 2px #19c37d60';
    wrapper.dataset.smartstep = 'true';
  }

  // Left button column
  const btnCol = document.createElement('div');
  btnCol.style.width = '70px';
  btnCol.className = 'flex flex-col items-center justify-between h-full';

  // Rewrite button
  const rewriteBtn = document.createElement('button');
  rewriteBtn.id = `rewrite-prompt-step-button-${index}`;
  rewriteBtn.disabled = stepText.trim() === '';
  rewriteBtn.style.opacity = stepText.trim() === '' ? '0.5' : '1';
  rewriteBtn.className = `relative w-full flex items-center justify-center bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary text-token-text-primary border-b border-token-border-medium ${stepText.trim() === '' ? 'cursor-not-allowed' : ''}`;
  rewriteBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="currentColor" width="20" height="20" viewBox="0 0 512 512"><path d="M327.5 85.19L384 64L405.2 7.491C406.9 2.985 411.2 0 416 0C420.8 0 425.1 2.985 426.8 7.491L448 64L504.5 85.19C509 86.88 512 91.19 512 96C512 100.8 509 105.1 504.5 106.8L448 128L426.8 184.5C425.1 189 420.8 192 416 192C411.2 192 406.9 189 405.2 184.5L384 128L327.5 106.8C322.1 105.1 320 100.8 320 96C320 91.19 322.1 86.88 327.5 85.19V85.19zM176 73.29C178.6 67.63 184.3 64 190.6 64C196.8 64 202.5 67.63 205.1 73.29L257.8 187.3L371.8 240C377.5 242.6 381.1 248.3 381.1 254.6C381.1 260.8 377.5 266.5 371.8 269.1L257.8 321.8L205.1 435.8C202.5 441.5 196.8 445.1 190.6 445.1C184.3 445.1 178.6 441.5 176 435.8L123.3 321.8L9.292 269.1C3.627 266.5 0 260.8 0 254.6C0 248.3 3.627 242.6 9.292 240L123.3 187.3L176 73.29zM166.9 207.5C162.1 217.8 153.8 226.1 143.5 230.9L92.32 254.6L143.5 278.2C153.8 282.1 162.1 291.3 166.9 301.6L190.6 352.8L214.2 301.6C218.1 291.3 227.3 282.1 237.6 278.2L288.8 254.6L237.6 230.9C227.3 226.1 218.1 217.8 214.2 207.5L190.6 156.3L166.9 207.5zM405.2 327.5C406.9 322.1 411.2 320 416 320C420.8 320 425.1 322.1 426.8 327.5L448 384L504.5 405.2C509 406.9 512 411.2 512 416C512 420.8 509 425.1 504.5 426.8L448 448L426.8 504.5C425.1 509 420.8 512 416 512C411.2 512 406.9 509 405.2 504.5L384 448L327.5 426.8C322.1 425.1 320 420.8 320 416C320 411.2 322.1 406.9 327.5 405.2L384 384L405.2 327.5z"/></svg>';
  addTooltip(rewriteBtn, { value: 'Optimize prompt', position: 'right' });
  rewriteBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ta = document.querySelector(`#prompt-editor-input-${index}`) as HTMLTextAreaElement | null;
    if (ta) showRewritePromptSettings(rewriteBtn, ta);
  });
  btnCol.appendChild(rewriteBtn);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className =
    'relative w-full flex items-center justify-center bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary text-token-text-primary border-b border-token-border-medium';
  deleteBtn.innerHTML =
    '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
  addTooltip(deleteBtn, { value: 'Delete step', position: 'right' });
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    if (deleteBtn.title === 'Confirm delete') {
      wrapper.remove();
    } else {
      deleteBtn.title = 'Confirm delete';
      deleteBtn.style.backgroundColor = '#864e6140';
      deleteBtn.style.color = '#ff4a4a';
      deleteBtn.innerHTML =
        '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      setTimeout(() => {
        deleteBtn.title = 'Delete';
        deleteBtn.style.backgroundColor = '';
        deleteBtn.style.color = '';
        deleteBtn.innerHTML =
          '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
      }, 3000);
    }
  });
  btnCol.appendChild(deleteBtn);

  // Drag handle
  const dragHandle = document.createElement('div');
  dragHandle.className =
    'relative w-full flex items-center justify-center bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary text-token-text-primary rounded-bs-xl';
  dragHandle.id = 'prompt-editor-drag-handle';
  dragHandle.innerHTML =
    '<svg stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M32 288c-17.7 0-32 14.3-32 32s14.3 32 32 32l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 288zm0-128c-17.7 0-32 14.3-32 32s14.3 32 32 32l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 160z"/></svg>';
  addTooltip(dragHandle, { value: 'Drag to reorder', position: 'right' });
  btnCol.appendChild(dragHandle);

  wrapper.appendChild(btnCol);

  // Set equal heights for buttons
  const btnHeight = `${100 / btnCol.childNodes.length}%`;
  btnCol.childNodes.forEach((child) => {
    (child as HTMLElement).style.height = btnHeight;
  });

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.placeholder = isSmartStep
    ? 'Enter instructions for the AI to intelligently generate the best prompt for this step based on the last response.'
    : 'Enter prompt text. Use {{variable name}} to ask user for text input.\nSpecial: {{files}}, {{clipboard}}.';
  textarea.id = `prompt-editor-input-${index}`;
  textarea.className =
    'w-full h-full bg-token-main-surface-secondary text-token-text-primary border border-token-border-medium border-t-0 border-b-0 border-e-0 px-2 py-1 pb-8 text-sm placeholder:text-gray-500';
  textarea.style.cssText = 'resize:none;top:0;left:0;overflow:auto;';
  if (isSmartStep) {
    textarea.style.fontStyle = 'italic';
    textarea.style.backgroundColor = '#19c37d20';
    textarea.dataset.smartstep = 'true';
  }
  textarea.dir = 'auto';
  textarea.value = cleanupStepText(stepText);

  // Update rewrite button state on input
  ['input', 'change', 'paste', 'cut', 'keydown', 'keyup'].forEach((evt) => {
    textarea.addEventListener(evt, () => {
      const btn = document.querySelector(`#rewrite-prompt-step-button-${index}`) as HTMLButtonElement | null;
      if (btn) {
        const empty = textarea.value.trim().length === 0;
        btn.disabled = empty;
        btn.style.opacity = empty ? '0.5' : '1';
        if (empty) btn.classList.add('cursor-not-allowed');
        else btn.classList.remove('cursor-not-allowed');
      }
    });
  });

  wrapper.appendChild(textarea);

  // Attachment pills
  const pillsWrapper = document.createElement('div');
  pillsWrapper.id = `attachment-pills-wrapper-${index}`;
  pillsWrapper.className = 'absolute bottom-0 flex items-center justify-start pe-8';
  pillsWrapper.style.cssText = 'left:72px;width:calc(100% - 120px);height:40px;overflow:auto;z-index:999;';
  if (files.length > 0) {
    for (const fileRef of files) {
      const parts = fileRef.split('__');
      const fileId = parts[0]!;
      const fileName = parts.slice(1).join('__') || 'attachment';
      const pill = createAttachmentPill(fileName, fileId);
      pillsWrapper.appendChild(pill);
    }
  }
  wrapper.appendChild(pillsWrapper);

  // Step count
  const countEl = document.createElement('div');
  countEl.id = 'prompt-chain-step-count';
  countEl.style.cssText = 'bottom:4px;right:10px;';
  countEl.className = 'text-token-text-tertiary absolute text-xs';
  countEl.innerHTML = `${index + 1} / ${Math.max(prompt.steps.length, 1)}`;
  wrapper.appendChild(countEl);

  return wrapper;
}

// ---------------------------------------------------------------------------
// Prompt manager UI functions
// Original: content.isolated.end.js lines 20064-20525+
// ---------------------------------------------------------------------------

/** Create the main content area for the prompt manager modal. */
export function promptManagerMainContent(): HTMLDivElement {
  const lastFolder = getLastSelectedPromptFolder();
  const isDefault = isDefaultPromptFolder(selectedPromptFolderBreadcrumb[0]?.id);

  const wrapper = document.createElement('div');
  wrapper.id = 'prompt-manager-content-wrapper';
  wrapper.className = 'relative h-full overflow-hidden';
  wrapper.style.paddingBottom = '59px';

  // Search bar
  const filterBar = document.createElement('div');
  filterBar.className =
    'flex items-center justify-between p-2 bg-token-main-surface-primary border-b border-token-border-medium sticky top-0 z-10';
  wrapper.appendChild(filterBar);

  const searchInput = document.createElement('input');
  searchInput.id = 'prompt-manager-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = translate('Search prompts');
  searchInput.className =
    'w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary';
  const debouncedFetch = debounce(() => fetchPrompts());
  searchInput.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value.trim();
    if (val.length > 0) {
      const list = document.querySelector('#modal-manager #prompt-manager-prompt-list');
      if (list) {
        list.innerHTML = '';
        list.appendChild(loadingSpinner('prompt-manager-main-content'));
      }
      debouncedFetch();
    } else {
      fetchPrompts();
    }
    const pillText = document.querySelector('#prompt-manager-search-term-pill-text');
    const pill = document.querySelector('#prompt-manager-search-term-pill');
    if (val.length > 0) {
      if (pillText) pillText.textContent = val;
      pill?.classList.remove('hidden');
    } else {
      if (pillText) pillText.textContent = '';
      pill?.classList.add('hidden');
    }
  });
  filterBar.appendChild(searchInput);

  // Selection bar
  const selBar = document.createElement('div');
  selBar.id = 'prompt-manager-selection-bar';
  selBar.className = 'flex items-center justify-end px-2 py-3 hidden sticky top-0 bg-token-main-surface-primary z-10';
  wrapper.appendChild(selBar);

  const cancelSelBtn = document.createElement('button');
  cancelSelBtn.id = 'prompt-manager-selection-cancel-button';
  cancelSelBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary ms-2 me-auto border border-token-border-medium';
  cancelSelBtn.textContent = translate('Cancel');
  cancelSelBtn.addEventListener('click', () => resetPromptManagerSelection());
  selBar.appendChild(cancelSelBtn);

  const selCount = document.createElement('span');
  selCount.id = 'prompt-manager-selection-count';
  selCount.className = 'text-token-text-tertiary text-xs me-4';
  selCount.textContent = '0 selected';
  selBar.appendChild(selCount);

  const delSelBtn = document.createElement('button');
  delSelBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary me-2 border border-token-border-medium';
  delSelBtn.textContent = translate('Delete');
  delSelBtn.addEventListener('click', () => {
    const checked = Array.from(document.querySelectorAll('#modal-manager input[id^="prompt-checkbox-"]:checked'));
    if (checked.length === 0) return;
    showConfirmDialog(
      'Delete prompts',
      'Are you sure you want to delete the selected prompts?',
      'Cancel',
      'Delete',
      null,
      () => {
        resetPromptManagerSelection();
        const ids = checked.map((el) => el.id.split('prompt-checkbox-')[1]!);
        updatePromptFolderCount(null, ids);
        ids.forEach((id) => document.querySelector(`#modal-manager #prompt-card-${id}`)?.remove());
        const list = document.querySelector('#modal-manager #prompt-manager-prompt-list');
        if (list && list.children.length === 0) list.appendChild(noPromptElement());
        chrome.runtime.sendMessage({ type: 'deletePrompts', detail: { promptIds: ids } }, async () => {
          initializeContinueButton(true);
        });
      },
    );
  });
  selBar.appendChild(delSelBtn);

  // Folder content wrapper
  const folderContent = document.createElement('div');
  folderContent.id = 'prompt-manager-folder-content-wrapper';
  folderContent.className =
    'bg-token-sidebar-surface-primary flex flex-wrap h-full overflow-y-auto p-4 pb-32 content-start';
  wrapper.appendChild(folderContent);

  // Breadcrumb header
  const headerRow = document.createElement('div');
  headerRow.id = 'prompt-manager-header';
  headerRow.className = 'flex items-center justify-between mb-4 w-full';
  folderContent.appendChild(headerRow);

  const breadcrumb = document.createElement('div');
  breadcrumb.id = 'prompt-manager-breadcrumb';
  breadcrumb.className =
    'flex items-center justify-start bg-token-main-surface-secondary p-2 rounded-lg border border-token-border-medium overflow-x-auto';
  breadcrumb.style.maxWidth = 'calc(100% - 48px)';
  headerRow.appendChild(breadcrumb);

  // Search term pill
  const searchPill = document.createElement('div');
  searchPill.id = 'prompt-manager-search-term-pill';
  searchPill.className =
    'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 border border-token-border-medium';
  searchPill.innerHTML =
    '<button id="prompt-manager-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><span id="prompt-manager-search-term-pill-text" class="text-sm mx-1 text-danger"></span>';
  searchPill.querySelector('#prompt-manager-search-term-pill-clear-button')?.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  });
  folderContent.appendChild(searchPill);

  // Subfolder list
  const subfolderList = document.createElement('div');
  subfolderList.id = 'prompt-manager-subfolder-list';
  subfolderList.className =
    'grid grid-cols-1 sm:grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 content-start w-full mb-2';
  folderContent.appendChild(subfolderList);

  // Prompt list
  const promptList = document.createElement('div');
  promptList.id = 'prompt-manager-prompt-list';
  const view = (cachedSettings as Record<string, any>).selectedPromptView;
  promptList.className = `grid ${view === 'list' ? 'grid-cols-1 gap-2' : 'grid-cols-1 sm:grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4'} content-start w-full`;
  folderContent.appendChild(promptList);

  return wrapper;
}

// ---------------------------------------------------------------------------
// Fetch & render prompts
// Original: content.isolated.end.js lines 20278-20356
// ---------------------------------------------------------------------------

/** Fetch prompts from the backend and render them in the manager. */
export async function fetchPrompts(page = 1, forceRefresh = false): Promise<void> {
  const folder = getLastSelectedPromptFolder();
  if (!folder) return;
  const list = document.querySelector('#modal-manager #prompt-manager-prompt-list');
  if (!list) return;

  if (page === 1) {
    list.innerHTML = '';
    list.appendChild(loadingSpinner('prompt-manager-main-content'));
  }

  if (folder.id === 'recent') {
    loadRecentPrompts();
    return;
  }

  const {
    selectedPromptsManagerSortBy: sortBy = { name: 'Update date', code: 'updated_at' },
    selectedPromptsManagerTag: tag = { name: 'All', code: 'all' },
    selectedPromptsManagerLanguage: lang = { name: 'All', code: 'all' },
  } = cachedSettings as Record<string, any>;

  const sortCode = folder.id !== 'public' && ['vote', 'use'].includes(sortBy?.code) ? 'created_at' : sortBy?.code;

  const searchTerm = (
    document.querySelector('#modal-manager input[id="prompt-manager-search-input"]') as HTMLInputElement
  )?.value;

  chrome.runtime.sendMessage(
    {
      type: 'getPrompts',
      forceRefresh,
      detail: {
        pageNumber: page,
        searchTerm,
        sortBy: sortCode,
        language: lang?.code,
        tag: tag.id,
        folderId: typeof folder.id === 'string' ? null : folder.id,
        isPublic: folder.id === 'public',
        isFavorite: folder.id === 'favorites',
        deepSearch: true,
      },
    },
    (data: any) => {
      const results = data?.results;
      if (!results) return;

      const loadMore = document.querySelector('#modal-manager #load-more-prompts-button');
      loadMore?.remove();
      const spinner = document.querySelector('#modal-manager #loading-spinner-prompt-manager-main-content');
      spinner?.remove();

      if (results.length === 0 && page === 1) {
        list.appendChild(noPromptElement());
      } else {
        results.forEach((p: any) => {
          const card = createPromptCard(p);
          list.appendChild(card);
          addPromptCardEventListeners(card, p);
        });

        if (data.next) {
          const btn = document.createElement('button');
          btn.id = 'load-more-prompts-button';
          btn.className =
            'bg-token-main-surface-secondary p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary flex flex-col relative';
          btn.appendChild(loadingSpinner('load-more-prompts-button'));
          list.appendChild(btn);
          const obs = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  fetchPrompts(page + 1, forceRefresh);
                  obs.disconnect();
                }
              });
            },
            { threshold: 0.5 },
          );
          obs.observe(btn);
        }
      }
    },
  );
}

/** Load recent prompts from userInputValueHistory. */
export function loadRecentPrompts(): void {
  const spinner = document.querySelector('#modal-manager #loading-spinner-prompt-manager-main-content');
  spinner?.remove();
  const list = document.querySelector('#modal-manager #prompt-manager-prompt-list');
  if (!list) return;

  chrome.storage.local.get(['userInputValueHistory'], (data) => {
    const history: Array<{ id?: string; inputValue: string; timestamp: number }> = data.userInputValueHistory || [];
    if (history.length === 0) {
      list.innerHTML = 'No recent prompts found';
      return;
    }
    list.innerHTML = '';
    const searchTerm = (
      document.querySelector('#modal-manager input[id="prompt-manager-search-input"]') as HTMLInputElement
    )?.value;
    history
      .sort((a, b) => b.timestamp - a.timestamp)
      .forEach((item) => {
        if (searchTerm && !item.inputValue.toLowerCase().includes(searchTerm.toLowerCase())) return;
        const p: PromptLike = {
          id: item.id || self.crypto.randomUUID(),
          title: new Date(item.timestamp).toLocaleString(),
          steps: [item.inputValue],
          tags: [],
          is_favorite: false,
          folder: { id: 'recent' },
        };
        const card = createPromptCard(p);
        list.appendChild(card);
        addPromptCardEventListeners(card, p);
      });
  });
}

/** Create a "no prompts" placeholder element. */
export function noPromptElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'no-prompts-found';
  el.className = 'text-token-text-tertiary text-sm p-4';
  el.textContent = 'No prompts found';
  return el;
}

/**
 * Create a "no prompt folders" placeholder element.
 * Original: content.isolated.end.js line 20564
 * NOTE: The function name typo ("Elemet") is intentional and matches the original source.
 */
export function noPromptFolderElemet(): HTMLElement {
  const el = document.createElement('p');
  el.id = 'no-prompt-folders';
  el.classList.value = 'text-token-text-tertiary text-center text-sm py-4 w-full p-4';
  el.innerText = translate('new_category_hint');
  return el;
}

// ---------------------------------------------------------------------------
// Prompt card
// Original: content.isolated.end.js lines 20446-20472
// ---------------------------------------------------------------------------

/** Create a prompt card element. */
export function createPromptCard(prompt: PromptLike): HTMLDivElement {
  const view = (cachedSettings as Record<string, any>).selectedPromptView;
  const card = document.createElement('div');
  card.id = `prompt-card-${prompt.id}`;
  card.dataset.promptId = String(prompt.id);
  if (prompt.folder?.id !== 'recent' && (!prompt.is_public || prompt.is_mine)) {
    card.draggable = true;
  }
  card.className = `relative flex bg-token-main-surface-primary border border-token-border-medium rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${view === 'list' ? 'w-full p-2 flex-row h-10' : 'aspect-1.5 p-4 pb-2 flex-col h-auto'}`;
  if (prompt.folder) card.dataset.folderId = String(prompt.folder.id);
  card.style.cssText = 'height:max-content;outline-offset:4px;outline:none;';

  // Simplified card content
  const titleDiv = document.createElement('div');
  titleDiv.className = 'text-md text-token-text-primary truncate flex items-center w-full';
  titleDiv.textContent = escapeHTML(prompt.title || '');
  card.appendChild(titleDiv);

  if (view !== 'list') {
    const preview = document.createElement('div');
    preview.className = 'flex-1 text-token-text-tertiary text-sm truncate';
    preview.textContent = escapeHTML(formatAttachmentsForPromptStep(prompt.steps[0] || '').substring(0, 250));
    card.appendChild(preview);

    if (prompt.steps.length > 1) {
      const stepsCount = document.createElement('span');
      stepsCount.className = 'text-xs text-token-text-tertiary';
      stepsCount.textContent = `${prompt.steps.length} ${translate('steps')}`;
      card.appendChild(stepsCount);
    }
  }

  // Settings menu icon
  const menuBtn = document.createElement('div');
  menuBtn.id = `prompt-card-settings-menu-${prompt.id}`;
  menuBtn.className =
    'relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary hover:bg-token-sidebar-surface-tertiary';
  menuBtn.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg>';
  card.appendChild(menuBtn);

  // Click handler
  card.addEventListener('click', (e) => {
    if ((e as MouseEvent).metaKey || (isWindows() && (e as MouseEvent).ctrlKey)) {
      document.querySelector('#modal-manager #modal-close-button-manager')?.dispatchEvent(new MouseEvent('click'));
      runPromptChain(prompt, 0, true);
    } else {
      updateSelectedPromptCard(String(prompt.id));
      const copy = { ...prompt };
      if (!prompt.is_mine) {
        delete copy.id;
        delete copy.folder;
      }
      openPromptEditorModal(copy);
    }
  });

  // Drag handlers
  card.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    e.dataTransfer!.setData('text/plain', JSON.stringify({ draggingObject: 'prompt', prompt }));
    e.dataTransfer!.effectAllowed = 'move';
    card.classList.add('card-dragging');
  });
  card.addEventListener('dragend', (e) => {
    e.stopPropagation();
    e.dataTransfer!.clearData();
    card.classList.remove('card-dragging');
  });

  return card;
}

/** Highlight the selected prompt card. */
export function updateSelectedPromptCard(id: string): void {
  if (lastSelectedPromptCardId) {
    const prev = document.querySelector(
      `#modal-manager #prompt-card-${lastSelectedPromptCardId}`,
    ) as HTMLElement | null;
    if (prev) prev.style.outline = 'none';
  }
  if (!id) return;
  const card = document.querySelector(`#modal-manager #prompt-card-${id}`) as HTMLElement | null;
  lastSelectedPromptCardId = id;
  if (card) card.style.outline = `2px solid ${isDarkMode() ? '#fff' : '#000'}`;
}

/** Add or replace a prompt card in the manager list. */
export function addOrReplacePromptCard(prompt: PromptLike, afterEl: HTMLElement | null = null): void {
  const folder = getLastSelectedPromptFolder();
  if (!folder?.id) return;
  const folderId = folder.id.toString();
  const promptFolderId = prompt.folder?.id?.toString();
  if (
    folderId === promptFolderId ||
    (folder.id === 'favorites' && prompt.is_favorite) ||
    (folder.id === 'public' && prompt.is_public)
  ) {
    const existing = document.querySelector(`#modal-manager #prompt-card-${prompt.id}`);
    if (existing) {
      const newCard = createPromptCard(prompt);
      existing.replaceWith(newCard);
      addPromptCardEventListeners(newCard, prompt);
    } else {
      const list = document.querySelector('#modal-manager #prompt-manager-prompt-list');
      document.querySelector('#modal-manager #no-prompts-found')?.remove();
      const newCard = createPromptCard(prompt);
      if (afterEl) {
        afterEl.after(newCard);
      } else {
        list?.prepend(newCard);
      }
      addPromptCardEventListeners(newCard, prompt);
    }
  }
}

/** Add event listeners to a prompt card. */
export function addPromptCardEventListeners(card: HTMLElement, prompt: PromptLike): void {
  // Checkbox
  card.querySelector(`#prompt-checkbox-${prompt.id}`)?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    const checked = Array.from(document.querySelectorAll('#modal-manager input[id^="prompt-checkbox-"]:checked'));
    if (checked.length > 0) {
      lastSelectedPromptCheckboxId = String(prompt.id);
      const countEl = document.querySelector('#prompt-manager-selection-count');
      if (countEl) countEl.textContent = `${checked.length} selected`;
      document.querySelector('#prompt-manager-selection-bar')?.classList.remove('hidden');
    } else {
      resetPromptManagerSelection();
    }
  });

  // Favorite toggle
  const favBtn = card.querySelector('#prompt-card-favorite');
  favBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    const currentFolder = getLastSelectedPromptFolder();
    if (currentFolder?.id === 'favorites') card.remove();
    chrome.runtime.sendMessage(
      { type: 'toggleFavoritePrompt', forceRefresh: true, detail: { promptId: prompt.id } },
      (resp: any) => {
        document.querySelector('#continue-prompt-button-wrapper')?.remove();
        initializeContinueButton(true);
        if (currentFolder?.id !== 'favorites') {
          if (resp.is_favorite) {
            favBtn.innerHTML =
              '<svg class="icon icon-md" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg>';
          } else {
            favBtn.innerHTML =
              '<svg class="icon icon-md" fill="#b4b4b4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M287.9 0C297.1 0 305.5 5.25 309.5 13.52L378.1 154.8L531.4 177.5C540.4 178.8 547.8 185.1 550.7 193.7C553.5 202.4 551.2 211.9 544.8 218.2L433.6 328.4L459.9 483.9C461.4 492.9 457.7 502.1 450.2 507.4C442.8 512.7 432.1 513.4 424.9 509.1L287.9 435.9L150.1 509.1C142.9 513.4 133.1 512.7 125.6 507.4C118.2 502.1 114.5 492.9 115.1 483.9L142.2 328.4L31.11 218.2C24.65 211.9 22.36 202.4 25.2 193.7C28.03 185.1 35.5 178.8 44.49 177.5L197.7 154.8L266.3 13.52C270.4 5.249 278.7 0 287.9 0L287.9 0zM287.9 78.95L235.4 187.2C231.9 194.3 225.1 199.3 217.3 200.5L98.98 217.9L184.9 303C190.4 308.5 192.9 316.4 191.6 324.1L171.4 443.7L276.6 387.5C283.7 383.7 292.2 383.7 299.2 387.5L404.4 443.7L384.2 324.1C382.9 316.4 385.5 308.5 391 303L476.9 217.9L358.6 200.5C350.7 199.3 343.9 194.3 340.5 187.2L287.9 78.95z"/></svg>';
          }
        }
      },
    );
  });

  // Settings menu
  const menuBtn = card.querySelector(`#prompt-card-settings-menu-${prompt.id}`);
  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    showPromptCardMenu(menuBtn as HTMLElement, prompt);
  });
}

/** Show context menu for a prompt card. */
function showPromptCardMenu(anchor: HTMLElement, prompt: PromptLike): void {
  const existing = document.querySelector('#prompt-card-menu');
  existing?.remove();

  const menu = document.createElement('div');
  menu.id = 'prompt-card-menu';
  menu.className =
    'absolute bg-token-main-surface-primary border border-token-border-medium rounded-lg shadow-lg z-50 py-1';
  menu.style.cssText = 'right:0;top:100%;min-width:180px;';

  const items: Array<{ label: string; action: () => void }> = [];

  items.push({
    label: translate('Run'),
    action: () => {
      menu.remove();
      document.querySelector('#modal-manager #modal-close-button-manager')?.dispatchEvent(new MouseEvent('click'));
      runPromptChain(prompt, 0, true);
    },
  });

  items.push({
    label: translate('Run in current chat'),
    action: () => {
      menu.remove();
      document.querySelector('#modal-manager #modal-close-button-manager')?.dispatchEvent(new MouseEvent('click'));
      runPromptChain(prompt, 0, false);
    },
  });

  if (prompt.is_mine) {
    items.push({
      label: translate('Edit'),
      action: () => {
        menu.remove();
        openPromptEditorModal(prompt);
      },
    });

    items.push({
      label: translate('Delete'),
      action: () => {
        menu.remove();
        showConfirmDialog(
          'Delete prompt',
          'Are you sure you want to delete this prompt?',
          'Cancel',
          'Delete',
          null,
          () => {
            const card = document.querySelector(`#modal-manager #prompt-card-${prompt.id}`);
            card?.remove();
            updatePromptFolderCount(null, [String(prompt.id)]);
            chrome.runtime.sendMessage({ type: 'deletePrompts', detail: { promptIds: [prompt.id] } }, () =>
              initializeContinueButton(true),
            );
          },
        );
      },
    });
  }

  items.forEach(({ label, action }) => {
    const btn = document.createElement('button');
    btn.className = 'w-full text-start px-4 py-2 text-sm text-token-text-primary hover:bg-token-main-surface-tertiary';
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      action();
    });
    menu.appendChild(btn);
  });

  anchor.appendChild(menu);
}

/** Reset prompt manager selection state. */
export function resetPromptManagerSelection(): void {
  lastSelectedPromptCheckboxId = '';
  document.querySelectorAll('#modal-manager input[id^="prompt-checkbox-"]').forEach((el) => {
    (el as HTMLInputElement).checked = false;
  });
  const selBar = document.querySelector('#prompt-manager-selection-bar');
  selBar?.classList.add('hidden');
  const countEl = document.querySelector('#prompt-manager-selection-count');
  if (countEl) countEl.textContent = '0 selected';
  const contentWrapper = document.querySelector('#prompt-manager-content-wrapper') as HTMLElement | null;
  if (contentWrapper) contentWrapper.style.paddingBottom = '59px';
}

/** Reset prompt manager params. */
export function resetPromptManagerParams(): void {
  lastSelectedPromptCardId = '';
  lastSelectedPromptCheckboxId = '';
}

// ---------------------------------------------------------------------------
// Input event listeners
// Original: content.isolated.end.js lines 7128-7427
// ---------------------------------------------------------------------------

/** Add the submit button event listener for auto-split support. */
export async function addSubmitButtonEventListener(): Promise<void> {
  document.body.addEventListener(
    'click',
    async (e) => {
      const btn = getSubmitButton();
      if (!btn || !isDescendant(btn, e.target) || btn.disabled) return;
      const rewriteBtn = document.querySelector('#prompt-rewrite-button') as HTMLButtonElement | null;
      if (rewriteBtn) rewriteBtn.disabled = true;
      const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
      if (
        cachedSettings.autoSplit &&
        cachedSettings.autoSplitLimit &&
        (textarea?.innerText?.length ?? 0) > cachedSettings.autoSplitLimit
      ) {
        e.preventDefault();
        e.stopPropagation();
        const steps = await generateSplitterChain(textarea!.innerText);
        runPromptChain({ steps, mode: 'splitter' }, 0, false);
      } else if (textarea) {
        textarea.innerHTML = convertToParagraphs(textarea);
      }
    },
    { capture: true },
  );
}

/** Add the stop button event listener. */
export function addStopButtonEventListener(): void {
  document.body.addEventListener('click', (e) => {
    const btn = document.querySelector('[data-testid*="stop-button"]');
    if (!btn || !isDescendant(btn, e.target)) return;
    window.dispatchEvent(new CustomEvent('stopConversationReceived', {}));
  });
}

/** Add key down event listeners for the prompt textarea. */
export async function addPromptInputKeyDownEventListeners(e: KeyboardEvent): Promise<void> {
  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!textarea) return;
  textarea.style.height = 'auto';

  if (document.activeElement?.id === 'prompt-textarea') {
    // "/" command: detect slash commands for prompt quick-insert
    if (e.keyCode === 32) {
      const qam = document.querySelector('#quick-access-menu-wrapper');
      qam?.remove();
      if (!textarea.innerText?.trim()) return;
      const sel = getSelectionPosition();
      if (!sel?.parentElement) return;
      const preceding = sel.parentElement.innerText.substring(0, sel.start).split(' ').pop();
      if (preceding?.startsWith('/') && preceding.length > 1) {
        chrome.runtime.sendMessage(
          { type: 'getPromptByTitle', detail: { title: preceding.substring(1).toLowerCase() } },
          (resp: PromptLike | null) => {
            if (resp?.steps?.length) {
              const slashPos = previousCharPosition(sel.parentElement!, '/', sel.start);
              if (
                sel.start !== -1 &&
                slashPos !== -1 &&
                !getStringBetween(sel.parentElement!, slashPos, sel.start).includes(' ')
              ) {
                insertTextAtPosition(sel.parentElement!, resp.steps[0]!, slashPos, sel.end);
              }
            }
          },
        );
      }
      return;
    }

    // Arrow up/down for prompt history
    if (e.key === 'ArrowUp' && !e.shiftKey) {
      const qam = document.querySelector('#quick-access-menu-wrapper') as HTMLElement | null;
      if (qam && qam.style.display !== 'none') {
        e.preventDefault();
        return;
      }
      if (getSelectionOffsetRelativeToParent(textarea).start !== 0) return;
      chrome.storage.local.get(['userInputValueHistoryIndex', 'userInputValueHistory'], (data) => {
        if (cachedSettings && !cachedSettings.promptHistoryUpDownKey) return;
        const history = data.userInputValueHistory || [];
        if (history.length === 0) return;
        let idx = data.userInputValueHistoryIndex || 0;
        idx = Math.max(idx - 1, 0);
        const item = history[idx];
        chrome.storage.local.set({ userInputValueHistoryIndex: idx }, () => {
          if (item) setTextAreaElementValue(item.inputValue.replace(/\n{3,}/g, '\n\n'));
        });
      });
      return;
    }

    if (e.key === 'ArrowDown' && !e.shiftKey) {
      const qam = document.querySelector('#quick-access-menu-wrapper') as HTMLElement | null;
      if (qam && qam.style.display !== 'none') {
        e.preventDefault();
        return;
      }
      if (getSelectionOffsetRelativeToParent(textarea).start !== textarea.innerText.length) return;
      chrome.storage.local.get(['userInputValueHistoryIndex', 'userInputValueHistory', 'unsavedUserInput'], (data) => {
        if (cachedSettings && !cachedSettings.promptHistoryUpDownKey) return;
        let idx = data.userInputValueHistoryIndex || 0;
        const history = data.userInputValueHistory || [];
        if (history.length === 0) return;
        idx = Math.min(idx + 1, history.length);
        chrome.storage.local.set({ userInputValueHistoryIndex: idx }, () => {
          const item = history[idx];
          if (item) {
            setTextAreaElementValue(item.inputValue.replace(/\n{3,}/g, '\n\n'));
          } else {
            const unsaved = data.unsavedUserInput || '';
            if (textarea.innerText !== unsaved) setTextAreaElementValue(unsaved.replace(/\n{3,}/g, '\n\n'));
          }
          updateInputCounter();
        });
      });
    }

    if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && e.key !== '/' && e.key !== '@') {
      debounceUpdateQuickAccessMenuItems();
    }
  }
}

/** Add key up event listeners for the prompt textarea. */
export function addPromptInputKeyUpEventListeners(_e: KeyboardEvent): void {
  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!textarea) return;
  textarea.style.height = 'auto';
  if (document.activeElement?.id === 'prompt-textarea') {
    const text = textarea.innerText;
    updateInputCounter();
    chrome.storage.local.set({ textInputValue: text }, () => {
      chrome.storage.local.get(['userInputValueHistory'], (data) => {
        const history = data.userInputValueHistory || [];
        if (history.findIndex((h: { inputValue: string }) => h.inputValue === text) === -1) {
          chrome.storage.local.set({ unsavedUserInput: text });
        }
      });
    });
  }
}

/** Exported getter for running prompt chain state. */
export function getRunningPromptChain(): PromptLike | undefined {
  return runningPromptChain;
}

/** Exported getter for running prompt chain step index. */
export function getRunningPromptChainStepIndex(): number {
  return runningPromptChainStepIndex;
}

// ---------------------------------------------------------------------------
// nextCharPosition
// Original source: content.isolated.end.js line 7611
// ---------------------------------------------------------------------------

/**
 * Find the offset of the next occurrence of `char` starting at `offset`
 * inside the element's text content (accounting for child nodes).
 * Returns -1 if not found.
 */
export function nextCharPosition(el: HTMLElement, char = ' ', offset = 0): number {
  if (!el || !el.hasChildNodes()) return -1;
  let pos = 0;
  let found = -1;

  function walk(node: Node): void {
    if (found !== -1) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      const len = text.length;
      if (pos + len > offset) {
        const start = Math.max(0, offset - pos);
        const idx = text.indexOf(char, start);
        if (idx !== -1) {
          found = pos + idx;
          return;
        }
      }
      pos += len;
    } else if (node.nodeName === 'BR') {
      if (pos >= offset && char === '\n') {
        found = pos;
        return;
      }
      pos += 1;
    } else if (['P', 'DIV', 'BLOCKQUOTE'].includes(node.nodeName)) {
      node.childNodes.forEach(walk);
      if (pos >= offset && char === '\n' && found === -1) {
        found = pos;
      }
      pos += 1;
    } else if (node.childNodes) {
      node.childNodes.forEach(walk);
    }
  }

  walk(el);
  return found;
}

// ---------------------------------------------------------------------------
// updatePromptFolderNameElement
// Original source: content.isolated.end.js line 20842
// ---------------------------------------------------------------------------

/**
 * Update a prompt folder's display name in the DOM and persist
 * the rename to the backend.
 */
export function updatePromptFolderNameElement(nameEl: HTMLElement, folderId: string | number, newName: string): void {
  if (!newName.trim()) return;
  nameEl.innerText = newName;
  chrome.runtime.sendMessage({
    type: 'updatePromptFolder',
    detail: { folderId, newData: { name: newName } },
  });
}

// ---------------------------------------------------------------------------
// movePromptToFolderSimpleFolderElement
// Original source: content.isolated.end.js line 23575
// ---------------------------------------------------------------------------

/**
 * Generate the HTML for a single folder row inside the
 * "Move prompt to folder" modal.
 */
export function movePromptToFolderSimpleFolderElement(folder: any): string {
  const isLocked = folder.id === -1;
  const img = folder.image || folder.image_url || chrome.runtime.getURL('icons/folder.png');
  return `<div id="move-prompt-to-folder-wrapper-folder-${folder.id}" class="flex w-full mb-2 group ${isLocked ? 'opacity-50 pointer-events-none' : ''}" style="flex-wrap: wrap;"><div id="folder-${folder.id}" class="flex py-3 px-3 pe-3 w-full border border-token-border-medium items-center gap-3 relative rounded-md cursor-pointer break-all hover:pe-10 group" title="${folder.name}" style="background-color: ${folder.color};"><img class="w-6 h-6 object-cover rounded-md" src="${img}" style="filter:drop-shadow(0px 0px 1px black);" data-is-open="false"><div id="title-folder-${folder.id}" class="flex-1 text-ellipsis max-h-5 overflow-hidden whitespace-nowrap break-all relative text-white relative" style="bottom: 6px;">${folder.name}</div><div id="folder-actions-wrapper-${folder.id}" class="absolute flex end-1 z-10 text-gray-300"><button id="move-prompt-to-folder-button-${folder.id}" class="btn btn-xs btn-primary group-hover:visible ${isLocked ? '' : 'invisible'}" title="Move to folder">${isLocked ? 'Upgrade to pro' : 'Add to this folder'}</button></div><div id="count-folder-${folder.id}" style="color: rgba(255, 255, 255, 0.6); font-size: 10px; position: absolute; left: 50px; bottom: 2px; display: block;">${folder?.subfolders?.length || 0} folder${folder?.subfolders?.length === 1 ? '' : 's'} - ${folder.prompt_count} prompt${folder.prompt_count === 1 ? '' : 's'}</div></div></div>`;
}

// ---------------------------------------------------------------------------
// movePromptToFolderLoadFolderList
// Original source: content.isolated.end.js line 23562
// ---------------------------------------------------------------------------

/**
 * Load and render the folder list in the "Move prompt to folder" modal,
 * optionally filtered by search term.
 */
export async function movePromptToFolderLoadFolderList(searchTerm = ''): Promise<void> {
  const list = document.querySelector('#move-prompt-to-folder-list') as HTMLElement;
  list.innerHTML = '';
  list.appendChild(loadingSpinner('move-prompt-to-folder-list'));
  const folders: any[] = await chrome.runtime.sendMessage({
    type: 'getPromptFolders',
    detail: { sortBy: 'alphabetical', searchTerm },
  });
  list.innerHTML =
    folders.length > 0
      ? folders.map((f) => movePromptToFolderSimpleFolderElement(f)).join('')
      : '<div id="no-prompt-folders" class="text-sm text-token-text-tertiary">No folders found.</div>';
}

// ---------------------------------------------------------------------------
// movePromptToFolderOpenFolder (private helper for addMovePromptToFolderModalEventListener)
// Original source: content.isolated.end.js line 23646
// ---------------------------------------------------------------------------

function movePromptToFolderOpenFolder(el: HTMLElement, promptIds: string[], shiftKey = false): void {
  const folderId = el.id.split('move-prompt-to-folder-wrapper-folder-')[1]!;
  const next = el.nextElementSibling as HTMLElement | null;

  if (shiftKey) {
    if (next && next.id === `subfolder-wrapper-${folderId}`) next.remove();
  } else if (next && next.id === `subfolder-wrapper-${folderId}`) {
    next.classList.contains('hidden') ? next.classList.remove('hidden') : next.classList.add('hidden');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = `subfolder-wrapper-${folderId}`;
  wrapper.className = 'ps-4 border-s border-token-border-medium';
  el.insertAdjacentElement('afterend', wrapper);

  const container = document.createElement('div');
  container.className = 'flex flex-col mb-4 relative';
  container.style.minHeight = '32px';
  container.appendChild(loadingSpinner('subfolder-list'));
  wrapper.appendChild(container);

  chrome.runtime.sendMessage(
    {
      type: 'getPromptFolders',
      forceRefresh: shiftKey,
      detail: { sortBy: 'alphabetical', parentFolderId: folderId },
    },
    (subfolders: any[]) => {
      if (!subfolders || !Array.isArray(subfolders)) return;
      container.innerHTML = '';
      if (subfolders.length > 0) {
        subfolders.forEach((sub) => {
          container.insertAdjacentHTML('beforeend', movePromptToFolderSimpleFolderElement(sub));
          const subEl = document.querySelector(`#move-prompt-to-folder-wrapper-folder-${sub.id}`) as HTMLElement | null;
          if (subEl) {
            subEl.addEventListener('click', (ev) => {
              movePromptToFolderOpenFolder(subEl, promptIds, (ev as MouseEvent).shiftKey);
            });
            document.querySelector(`#move-prompt-to-folder-button-${sub.id}`)?.addEventListener('click', () => {
              movePromptToFolder(promptIds, sub.id, sub.name, sub.color);
              toast('Prompt moved to folder');
              document.querySelector('#move-prompt-to-folder-modal')?.remove();
            });
          }
        });
      }

      const newBtn = document.createElement('button');
      newBtn.className = 'btn btn-xs btn-primary mt-2';
      newBtn.innerText = '\uFF0B New Subfolder';
      container.appendChild(newBtn);
      newBtn.addEventListener('click', async () => {
        const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
        const allFolders = document.querySelectorAll(
          '#move-prompt-to-folder-content [id^=move-prompt-to-folder-wrapper-folder-]',
        );
        if (!hasSub && allFolders.length >= 5) {
          errorUpgradeConfirmation({
            type: 'limit',
            title: 'You have reached the limit',
            message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
          });
          return;
        }
        const name = prompt('Enter subfolder name:', 'New Category');
        if (!name) return;
        const parentColor =
          (el.querySelector('div[id^=folder-]') as HTMLElement)?.style?.backgroundColor || generateRandomDarkColor();
        const parentImg = (el.querySelector('div[id^=folder-] img') as HTMLImageElement)?.src || '';
        const created: any = await chrome.runtime.sendMessage({
          type: 'addPromptFolders',
          detail: {
            folders: [{ name, color: parentColor, image_url: parentImg, parent_folder: parseInt(folderId, 10) }],
          },
        });
        if (created.error && created.error.type === 'limit') {
          errorUpgradeConfirmation(created.error);
          return;
        }
        container.insertAdjacentHTML('afterbegin', movePromptToFolderSimpleFolderElement(created[0]));
        const newEl = document.querySelector(`#move-prompt-to-folder-wrapper-folder-${created[0].id}`) as HTMLElement;
        newEl.addEventListener('click', (ev) => {
          movePromptToFolderOpenFolder(newEl, promptIds, (ev as MouseEvent).shiftKey);
        });
        document.querySelector(`#move-prompt-to-folder-button-${created[0].id}`)?.addEventListener('click', () => {
          movePromptToFolder(promptIds, created[0].id, created[0].name, created[0].color);
          toast('Prompt moved successfully');
          document.querySelector('#move-prompt-to-folder-modal')?.remove();
        });
      });
    },
  );
}

// ---------------------------------------------------------------------------
// addMovePromptToFolderModalEventListener
// Original source: content.isolated.end.js line 23581
// ---------------------------------------------------------------------------

/**
 * Attach event listeners to the "Move prompt to folder" modal elements
 * (folder click, move button, new folder, close).
 */
export function addMovePromptToFolderModalEventListener(promptIds: string[]): void {
  // Folder row click -> expand sub-folders
  document.querySelectorAll('[id^=move-prompt-to-folder-wrapper-folder-]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      movePromptToFolderOpenFolder(el as HTMLElement, promptIds, (ev as MouseEvent).shiftKey);
    });
  });

  // "Add to this folder" button click
  document.querySelectorAll('button[id^=move-prompt-to-folder-button-]').forEach((btn) => {
    const folderId = btn.id.split('move-prompt-to-folder-button-')[1]!;
    const folderName = document.querySelector(`#title-folder-${folderId}`)?.textContent ?? '';
    const folderColor = (document.querySelector(`#folder-${folderId}`) as HTMLElement)?.style?.backgroundColor ?? '';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (folderId === '-1') {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message: 'With free account, you can only have up to 5 prompt folders. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      movePromptToFolder(promptIds, folderId, folderName, folderColor);
      toast('Prompt moved to folder');
      document.querySelector('#move-prompt-to-folder-modal')?.remove();
    });
  });

  // "+ New Folder" button
  document.querySelector('#move-prompt-to-folder-new-folder')?.addEventListener('click', async () => {
    const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
    const allFolders = document.querySelectorAll(
      '#move-prompt-to-folder-content [id^=move-prompt-to-folder-wrapper-folder-]',
    );
    if (!hasSub && allFolders.length >= 5) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    const name = prompt('Enter folder name:', 'New Category');
    if (!name) return;
    document.querySelectorAll('#no-prompt-folders').forEach((el) => el.remove());
    const created: any = await chrome.runtime.sendMessage({
      type: 'addPromptFolders',
      detail: { folders: [{ name, color: generateRandomDarkColor() }] },
    });
    if (created.error && created.error.type === 'limit') {
      errorUpgradeConfirmation(created.error);
      return;
    }
    document
      .querySelector('#move-prompt-to-folder-list')
      ?.insertAdjacentHTML('afterbegin', movePromptToFolderSimpleFolderElement(created[0]));
    const newEl = document.querySelector(`#move-prompt-to-folder-wrapper-folder-${created[0].id}`) as HTMLElement;
    newEl.addEventListener('click', (ev) => {
      movePromptToFolderOpenFolder(newEl, promptIds, (ev as MouseEvent).shiftKey);
    });
    document.querySelector(`#move-prompt-to-folder-button-${created[0].id}`)?.addEventListener('click', () => {
      movePromptToFolder(promptIds, created[0].id, created[0].name, created[0].color);
      toast('Prompt moved to folder');
      document.querySelector('#move-prompt-to-folder-modal')?.remove();
    });
  });

  // Close button
  document.querySelector('#move-prompt-to-folder-close-button')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    document.querySelector('#move-prompt-to-folder-modal')?.remove();
  });

  // Click-outside to close
  document.body.addEventListener('click', (ev) => {
    const modal = document.querySelector('#move-prompt-to-folder-modal');
    const content = document.querySelector('#move-prompt-to-folder-content');
    if (
      content &&
      isDescendant(modal as HTMLElement, ev.target as HTMLElement) &&
      !isDescendant(content as HTMLElement, ev.target as HTMLElement)
    ) {
      modal?.remove();
    }
  });
}

// ---------------------------------------------------------------------------
// movePromptToFolder
// Original source: content.isolated.end.js line 23718
// ---------------------------------------------------------------------------

/**
 * Move one or more prompts to a target folder, update the UI folder
 * counts, and persist via chrome.runtime.sendMessage.
 */
export async function movePromptToFolder(
  promptIds: string[],
  folderId: string | number,
  folderName: string,
  folderColor: string,
): Promise<void> {
  const lastFolder = getLastSelectedPromptFolder();

  updatePromptFolderCount(folderId, promptIds);

  if (lastFolder?.id?.toString() !== folderId.toString() && !isDefaultPromptFolder(lastFolder?.id?.toString())) {
    // Remove cards from current view
    promptIds.forEach((id) => {
      document.querySelectorAll(`#prompt-card-${id}`).forEach((el) => el.remove());
    });
    const list = document.querySelector('#modal-manager #prompt-manager-prompt-list');
    if (list && list.children.length === 0) list.appendChild(noPromptElement());
  } else {
    // Update dataset on cards
    promptIds.forEach((id) => {
      document.querySelectorAll(`#prompt-card-${id}`).forEach((el) => {
        (el as HTMLElement).dataset.folderId = String(folderId);
      });
      const checkbox = document.querySelector(`#modal-manager #prompt-checkbox-${id}`) as HTMLInputElement | null;
      if (checkbox) checkbox.checked = false;
    });
  }

  resetPromptManagerSelection();
  chrome.runtime.sendMessage({
    type: 'movePrompts',
    detail: { folderId: parseInt(String(folderId), 10), promptIds },
  });
}

// ---------------------------------------------------------------------------
// movePromptFolder
// Original source: content.isolated.end.js line 23946
// ---------------------------------------------------------------------------

/**
 * Move a prompt folder to a new parent (or root when targetId === 0).
 * Updates DOM structure and subfolder counts, then persists via backend.
 */
export async function movePromptFolder(folder: any, targetId: string | number): Promise<void> {
  const lastFolder = getLastSelectedPromptFolder();

  if (targetId === 0) {
    const sidebar = document.querySelector('#prompt-manager-sidebar-folders');
    const el = document.querySelector(`#prompt-manager-subfolder-list #prompt-folder-wrapper-${folder.id}`);
    if (sidebar && el) sidebar.appendChild(el);
    document.querySelectorAll(`#sidebar-folder-content #prompt-folder-wrapper-${folder.id}`).forEach((e) => e.remove());
  } else {
    document.querySelectorAll(`#prompt-folder-wrapper-${folder.id}`).forEach((e) => e.remove());
  }

  // Update source parent subfolder count
  const parentId = folder.parent_folder;
  document.querySelectorAll(`#folder-subfolder-count-${parentId}`).forEach((el) => {
    const count = parseInt(el.textContent?.split(' ')[0] ?? '0', 10);
    el.textContent = `${count - 1} folder${count - 1 === 1 ? '' : 's'} -`;
  });

  // Update target parent subfolder count
  document.querySelectorAll(`#folder-subfolder-count-${targetId}`).forEach((el) => {
    const count = parseInt(el.textContent?.split(' ')[0] ?? '0', 10);
    el.textContent = `${count + 1} folder${count + 1 === 1 ? '' : 's'} -`;
  });

  chrome.runtime.sendMessage(
    {
      type: 'updatePromptFolder',
      forceRefresh: true,
      detail: { folderId: folder.id, newData: { parent_folder_id: targetId } },
    },
    () => {
      if (targetId.toString() === lastFolder?.id?.toString()) {
        throttleGetPromptSubFolders(lastFolder!.id, true);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// showPromptManagerFolderMenu + addPromptManagerFolderMenuEventListeners
// Original source: content.isolated.end.js lines 20568-20816
// ---------------------------------------------------------------------------

/**
 * Render the context menu for a prompt folder in the manager modal.
 */
export async function showPromptManagerFolderMenu(
  anchor: HTMLElement,
  folder: any,
  _isTopLevel = false,
  _isSubfolder = false,
): Promise<void> {
  const folderId = folder.id;
  const folderEl = document.querySelector(`#prompt-folder-wrapper-${folderId}`) as HTMLElement | null;
  const folderImage = folder.image || folder.image_url;
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const { right, top } = anchor.getBoundingClientRect();
  const x = _isTopLevel ? right + 2 : right - 236;
  const y = top + 12;

  const isSpecial = ['recent', 'favorites'].includes(folderId);

  const menuHtml = `<div id="prompt-manager-folder-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001;--radix-popper-anchor-width:18px;--radix-popper-anchor-height:18px;--radix-popper-available-width:1167px;--radix-popper-available-height:604px;--radix-popper-transform-origin:0% 0px"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" data-radix-menu-content="" dir="ltr" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" data-orientation="vertical" style="outline:0;pointer-events:auto">

  ${
    isSpecial
      ? `<div role="menuitem" id="clear-all-prompt-folder-button-${folderId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Clear all')}</div></div></div>`
      : `<div role="menuitem" id="rename-prompt-folder-button-${folderId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="none" class="icon icon-md"><path fill="currentColor" d="M184 160C193.5 160 202.1 165.6 205.9 174.3L269.9 318.3C275.3 330.4 269.9 344.5 257.7 349.9C245.6 355.3 231.5 349.9 226.1 337.7L221.7 328H146.3L141.9 337.7C136.5 349.9 122.4 355.3 110.3 349.9C98.14 344.5 92.69 330.4 98.07 318.3L162.1 174.3C165.9 165.6 174.5 160 184 160H184zM167.6 280H200.4L184 243.1L167.6 280zM304 184C304 170.7 314.7 160 328 160H380C413.1 160 440 186.9 440 220C440 229.2 437.9 237.9 434.2 245.7C447.5 256.7 456 273.4 456 292C456 325.1 429.1 352 396 352H328C314.7 352 304 341.3 304 328V184zM352 208V232H380C386.6 232 392 226.6 392 220C392 213.4 386.6 208 380 208H352zM352 304H396C402.6 304 408 298.6 408 292C408 285.4 402.6 280 396 280H352V304zM0 128C0 92.65 28.65 64 64 64H576C611.3 64 640 92.65 640 128V384C640 419.3 611.3 448 576 448H64C28.65 448 0 419.3 0 384V128zM48 128V384C48 392.8 55.16 400 64 400H576C584.8 400 592 392.8 592 384V128C592 119.2 584.8 112 576 112H64C55.16 112 48 119.2 48 128z"/></svg>${translate('Rename')}</div>

      <div role="menuitem" id="add-subfolder-prompt-folder-button-${folderId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg stroke="currentColor" fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>${translate('Add subfolder')}</div>

      <div role="menuitem" id="move-folder-prompt-folder-button-${folderId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" class="icon icon-md" viewBox="0 0 576 512"><path d="M544 320h-96l-44.16-27.23C398.8 289.6 392.1 288 387 288H320c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h224c17.67 0 32-14.33 32-32v-128C576 334.3 561.7 320 544 320zM528 464h-192v-128h46.5l40.3 24.86C430.4 365.5 439.1 368 448 368h80V464zM232 160C245.3 160 256 149.3 256 136C256 122.7 245.3 112 232 112H48V24C48 10.74 37.25 0 24 0S0 10.74 0 24v368C0 422.9 25.07 448 56 448h176C245.3 448 256 437.3 256 424c0-13.26-10.75-24-24-24h-176c-4.4 0-8-3.602-8-8V160H232zM544 32h-96l-44.16-27.23C398.8 1.648 392.1 0 387 0H320c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h224c17.67 0 32-14.33 32-32V64C576 46.33 561.7 32 544 32zM528 176h-192v-128h46.5l40.3 24.86C430.4 77.53 439.1 80 448 80h80V176z"/></svg>${translate('Move folder')}</div>

      <div role="menuitem" id="color-prompt-folder-button-${folderId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg stroke="currentColor" fill="currentColor" stroke-width="2" viewBox="0 0 512 512" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"><path d="M160 255.1C160 273.7 145.7 287.1 128 287.1C110.3 287.1 96 273.7 96 255.1C96 238.3 110.3 223.1 128 223.1C145.7 223.1 160 238.3 160 255.1zM128 159.1C128 142.3 142.3 127.1 160 127.1C177.7 127.1 192 142.3 192 159.1C192 177.7 177.7 191.1 160 191.1C142.3 191.1 128 177.7 128 159.1zM288 127.1C288 145.7 273.7 159.1 256 159.1C238.3 159.1 224 145.7 224 127.1C224 110.3 238.3 95.1 256 95.1C273.7 95.1 288 110.3 288 127.1zM320 159.1C320 142.3 334.3 127.1 352 127.1C369.7 127.1 384 142.3 384 159.1C384 177.7 369.7 191.1 352 191.1C334.3 191.1 320 177.7 320 159.1zM441.9 319.1H344C317.5 319.1 296 341.5 296 368C296 371.4 296.4 374.7 297 377.9C299.2 388.1 303.5 397.1 307.9 407.8C313.9 421.6 320 435.3 320 449.8C320 481.7 298.4 510.5 266.6 511.8C263.1 511.9 259.5 512 256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 256.9 511.1 257.8 511.1 258.7C511.6 295.2 478.4 320 441.9 320V319.1zM463.1 258.2C463.1 257.4 464 256.7 464 255.1C464 141.1 370.9 47.1 256 47.1C141.1 47.1 48 141.1 48 255.1C48 370.9 141.1 464 256 464C258.9 464 261.8 463.9 264.6 463.8C265.4 463.8 265.9 463.6 266.2 463.5C266.6 463.2 267.3 462.8 268.2 461.7C270.1 459.4 272 455.2 272 449.8C272 448.1 271.4 444.3 266.4 432.7C265.8 431.5 265.2 430.1 264.5 428.5C260.2 418.9 253.4 403.5 250.1 387.8C248.7 381.4 248 374.8 248 368C248 314.1 290.1 271.1 344 271.1H441.9C449.6 271.1 455.1 269.3 459.7 266.2C463 263.4 463.1 260.9 463.1 258.2V258.2z"/></svg>${translate('Set color')}</div>
        <div id="color-picker-button-${folderId}" class="flex z-10 cursor-pointer flex items-center">
          <svg id="reset-color-picker" stroke="currentColor" fill="currentColor" stroke-width="2" viewBox="0 0 512 512" class="h-4 w-4 me-2" xmlns="http://www.w3.org/2000/svg"><path d="M496 40v160C496 213.3 485.3 224 472 224h-160C298.8 224 288 213.3 288 200s10.75-24 24-24h100.5C382.8 118.3 322.5 80 256 80C158.1 80 80 158.1 80 256s78.97 176 176 176c41.09 0 81.09-14.47 112.6-40.75c10.16-8.5 25.31-7.156 33.81 3.062c8.5 10.19 7.125 25.31-3.062 33.81c-40.16 33.44-91.17 51.77-143.5 51.77C132.4 479.9 32 379.5 32 256s100.4-223.9 223.9-223.9c79.85 0 152.4 43.46 192.1 109.1V40c0-13.25 10.75-24 24-24S496 26.75 496 40z"/></svg><input type="color" class="w-8 h-6" id="color-picker-input-${folderId}" style="cursor:pointer" value="${rgba2hex(folderEl?.style?.backgroundColor ?? '') || '#2f2f2f'}" />
        </div>
      </div>

      <div role="menuitem" id="set-image-folder-prompts-button-${folderId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" stroke="currentColor" fill="currentColor" stroke-width="2" class="icon icon-md"><path d="M112 112c-17.67 0-32 14.33-32 32s14.33 32 32 32c17.68 0 32-14.33 32-32S129.7 112 112 112zM448 96c0-35.35-28.65-64-64-64H64C28.65 32 0 60.65 0 96v320c0 35.35 28.65 64 64 64h320c35.35 0 64-28.65 64-64V96zM400 416c0 8.822-7.178 16-16 16H64c-8.822 0-16-7.178-16-16v-48h352V416zM400 320h-28.76l-96.58-144.9C271.7 170.7 266.7 168 261.3 168c-5.352 0-10.35 2.672-13.31 7.125l-62.74 94.11L162.9 238.6C159.9 234.4 155.1 232 150 232c-5.109 0-9.914 2.441-12.93 6.574L77.7 320H48V96c0-8.822 7.178-16 16-16h320c8.822 0 16 7.178 16 16V320z"/></svg>${translate('Set image')}</div></div>

      ${folderImage ? `<div role="menuitem" id="remove-image-folder-prompts-button-${folderId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="currentColor" fill="currentColor" stroke-width="2" class="icon icon-md"><path d="M630.8 469.1l-55.95-43.85C575.3 422.2 575.1 419.2 575.1 416l.0034-320c0-35.35-28.65-64-64-64H127.1C113.6 32 100.4 36.98 89.78 45.06L38.81 5.113C28.34-3.058 13.31-1.246 5.109 9.192C-3.063 19.63-1.235 34.72 9.187 42.89L601.2 506.9C605.6 510.3 610.8 512 615.1 512c7.125 0 14.17-3.156 18.91-9.188C643.1 492.4 641.2 477.3 630.8 469.1zM527.1 388.5l-36.11-28.3l-100.7-136.8C387.8 218.8 382.1 216 376 216c-6.113 0-11.82 2.768-15.21 7.379L344.9 245L261.9 180C262.1 176.1 264 172.2 264 168c0-26.51-21.49-48-48-48c-8.336 0-16.05 2.316-22.88 6.057L134.4 80h377.6c8.822 0 16 7.178 16 16V388.5zM254.2 368.3l-37.09-46.1c-3.441-4.279-8.934-6.809-14.77-6.809c-5.842 0-11.33 2.529-14.78 6.809l-75.52 93.81c0-.0293 0 .0293 0 0L111.1 184.5l-48-37.62L63.99 416c0 35.35 28.65 64 64 64h361.1l-201.1-157.6L254.2 368.3z"/></svg>${translate('Remove image')}</div></div>` : ''}

      <div role="menuitem" id="export-folder-prompts-button-${folderId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" stroke="currentColor" fill="currentColor" stroke-width="2" class="icon icon-md"><path d="M568.1 303l-80-80c-9.375-9.375-24.56-9.375-33.94 0s-9.375 24.56 0 33.94L494.1 296H216C202.8 296 192 306.8 192 320s10.75 24 24 24h278.1l-39.03 39.03C450.3 387.7 448 393.8 448 400s2.344 12.28 7.031 16.97c9.375 9.375 24.56 9.375 33.94 0l80-80C578.3 327.6 578.3 312.4 568.1 303zM360 384c-13.25 0-24 10.74-24 24V448c0 8.836-7.164 16-16 16H64.02c-8.836 0-16-7.164-16-16L48 64.13c0-8.836 7.164-16 16-16h160L224 128c0 17.67 14.33 32 32 32h79.1v72c0 13.25 10.74 24 23.1 24S384 245.3 384 232V138.6c0-16.98-6.742-33.26-18.75-45.26l-74.63-74.64C278.6 6.742 262.3 0 245.4 0H63.1C28.65 0-.002 28.66 0 64l.0065 384c.002 35.34 28.65 64 64 64H320c35.2 0 64-28.8 64-64v-40C384 394.7 373.3 384 360 384z"></path></svg>${translate('Export')}</div>${hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>'}</div>

      <div role="menuitem" id="delete-prompt-folder-button-${folderId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Delete')}</div>`
  }

  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', menuHtml);
  adjustMenuPosition(document.querySelector('#prompt-manager-folder-menu'));
  addPromptManagerFolderMenuEventListeners(folder);
  document.querySelector('#prompt-manager-folder-menu')?.addEventListener('mouseleave', () => {
    anchor.classList.replace('flex', 'hidden');
  });
}

/**
 * Attach event listeners to the prompt folder context menu items.
 * Called internally by showPromptManagerFolderMenu.
 */
async function addPromptManagerFolderMenuEventListeners(folder: any): Promise<void> {
  const folderId = folder.id;
  const renameBtn = document.querySelector(`#rename-prompt-folder-button-${folderId}`);
  const addSubBtn = document.querySelector(`#add-subfolder-prompt-folder-button-${folderId}`);
  const moveBtn = document.querySelector(`#move-folder-prompt-folder-button-${folderId}`);
  const colorBtn = document.querySelector(`#color-prompt-folder-button-${folderId}`);
  const setImgBtn = document.querySelector(`#set-image-folder-prompts-button-${folderId}`);
  const removeImgBtn = document.querySelector(`#remove-image-folder-prompts-button-${folderId}`);
  const exportBtn = document.querySelector(`#export-folder-prompts-button-${folderId}`);
  const deleteBtn = document.querySelector(`#delete-prompt-folder-button-${folderId}`);
  const colorPicker = document.querySelector(`#color-picker-button-${folderId}`);
  const clearBtn = document.querySelector(`#clear-all-prompt-folder-button-${folderId}`);
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });

  renameBtn?.addEventListener('click', () => {
    handleRenamePromptFolderClick(folderId);
  });

  addSubBtn?.addEventListener('click', () => {
    closeMenus();
    const existing = document.querySelectorAll(
      '#modal-manager #prompt-manager-sidebar-folders > div[id^="prompt-folder-wrapper-"]',
    );
    if (!hasSub && existing.length >= 5) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message:
          'You have reached the limits of Prompt Folders with free account. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    (document.querySelector(`#modal-manager #prompt-folder-wrapper-${folderId}`) as HTMLElement | null)?.click();
    setTimeout(() => {
      chrome.runtime.sendMessage(
        {
          type: 'addPromptFolders',
          forceRefresh: true,
          detail: {
            folders: [
              {
                name: 'New Category',
                color: folder.color,
                parent_folder: parseInt(String(folderId), 10),
                image_url: folder.image || folder.image_url,
              },
            ],
          },
        },
        (result: any) => {
          if (result.error && result.error.type === 'limit') {
            errorUpgradeConfirmation(result.error);
            return;
          }
          if (!result || result.length === 0) return;
          const subList = document.querySelector('#prompt-manager-subfolder-list');
          subList?.prepend(promptFolderElement(result[0], false)!);
          subList?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          document.querySelectorAll(`#folder-subfolder-count-${folderId}`).forEach((el) => {
            const count = parseInt(el.textContent?.split(' ')[0] ?? '0', 10);
            el.textContent = `${count + 1} folder${count + 1 === 1 ? '' : 's'} -`;
          });
          handleRenamePromptFolderClick(result[0].id);
        },
      );
    }, 100);
  });

  moveBtn?.addEventListener('click', () => {
    openMovePromptFolderModal(folder);
  });

  colorBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
  });

  colorPicker?.addEventListener('click', (ev) => {
    ev.stopPropagation();
  });

  const debouncedUpdateColor = debounce((data: any) => {
    chrome.runtime.sendMessage({
      type: 'updatePromptFolder',
      detail: { folderId, newData: data },
    });
  }, 200);

  colorPicker?.querySelector('input[id^=color-picker-input-]')?.addEventListener('input', (ev) => {
    const color = (ev.target as HTMLInputElement).value;
    const folderEl = document.querySelector(`#modal-manager #prompt-folder-wrapper-${folderId}`) as HTMLElement | null;
    if (folderEl) folderEl.style.backgroundColor = color;
    debouncedUpdateColor({ color });
  });

  colorPicker?.querySelector('#reset-color-picker')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();
    const folderEl = document.querySelector(`#modal-manager #prompt-folder-wrapper-${folderId}`) as HTMLElement | null;
    if (folderEl) folderEl.style.backgroundColor = '#2f2f2f';
    const input = colorPicker.querySelector('input[id^=color-picker-input-]') as HTMLInputElement | null;
    if (input) input.value = '#2f2f2f';
    chrome.runtime.sendMessage({
      type: 'updatePromptFolder',
      detail: { folderId, newData: { color: '#2f2f2f' } },
    });
  });

  setImgBtn?.addEventListener('click', () => {
    closeMenus();
    const form = document.createElement('form');
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.style.display = 'none';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    form.appendChild(fileInput);
    document.body.appendChild(form);
    fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        const newData = {
          image: {
            base64: (reader.result as string).split(',')[1],
            type: file.type,
            name: file.name,
          },
        };
        const dataUrl = (loadEvent.target as FileReader).result as string;
        document.querySelectorAll(`#prompt-folder-image-${folderId}`).forEach((img) => {
          (img as HTMLImageElement).src = dataUrl;
          img.classList.remove('hidden');
        });
        chrome.runtime.sendMessage({
          type: 'updatePromptFolder',
          detail: { folderId, newData },
        });
      };
      reader.readAsDataURL(file);
    };
  });

  removeImgBtn?.addEventListener('click', () => {
    closeMenus();
    document.querySelectorAll(`#prompt-folder-image-${folderId}`).forEach((img) => {
      (img as HTMLImageElement).src = chrome.runtime.getURL('icons/folder.png');
      img.className = 'w-5 h-5 me-3 rounded-md object-cover';
    });
    chrome.runtime.sendMessage({
      type: 'removePromptFolderImage',
      detail: { folderId },
    });
  });

  exportBtn?.addEventListener('click', () => {
    if (!hasSub) {
      errorUpgradeConfirmation({
        title: 'This is a Pro feature',
        message: 'Exporting prompts requires a Pro subscription. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    chrome.runtime.sendMessage({ type: 'getAllPrompts', detail: { folderId } }, (result: any) => {
      if (result.error && result.error.type === 'limit') {
        errorUpgradeConfirmation(result.error);
        return;
      }
      if (!result || Object.keys(result).length === 0) {
        toast('No prompts found', 'error');
        return;
      }
      const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const ts = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}__${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
      a.download = `Council Prompts - ${Object.keys(result)[0]} - ${ts}.json`;
      a.click();
    });
  });

  deleteBtn?.addEventListener('click', () => {
    document.querySelector('#prompt-manager-folder-menu')?.remove();
    showConfirmDialog(
      'Delete prompt category',
      'All the prompts in this category and sub categories will be deleted.',
      'Cancel',
      'Delete',
      null,
      () => {
        chrome.runtime.sendMessage({ type: 'deletePromptFolder', detail: { folderId } }, () => {
          initializeContinueButton(true);
          document.querySelector(`#prompt-folder-wrapper-${folderId}`)?.remove();
          const remaining = document.querySelector(
            '#prompt-manager-sidebar-folders > div[id^="prompt-folder-wrapper-"]',
          );
          if (remaining) {
            if (selectedPromptFolderBreadcrumb.map((c) => c.id).includes(folderId)) {
              (remaining as HTMLElement).click();
            }
          } else {
            document.querySelector('#prompt-manager-sidebar-folders')?.appendChild(noPromptFolderElemet());
            const recentEl = document.querySelector('#prompt-folder-wrapper-recent') as HTMLElement | null;
            recentEl?.click();
          }
        });
      },
    );
  });

  clearBtn?.addEventListener('click', () => {
    document.querySelector('#prompt-manager-folder-menu')?.remove();
    const titles: Record<string, string> = {
      recent: 'Clear prompt history',
      favorites: 'Reset favorite prompts',
    };
    const messages: Record<string, string> = {
      recent: 'Are you sure you want to clear your prompt history? Other prompts will not be affected.',
      favorites: 'Are you sure you want to unfave all your favorite prompts?',
    };
    showConfirmDialog(titles[folderId]!, messages[folderId]!, 'Cancel', 'Confirm', null, () => {
      if (selectedPromptFolderBreadcrumb.map((c) => c.id).includes(folderId)) {
        const list = document.querySelector('#prompt-manager-prompt-list') as HTMLElement | null;
        if (list) {
          list.innerHTML = '';
          list.appendChild(noPromptElement());
        }
      }
      if (folderId === 'recent') {
        chrome.storage.local.set({ userInputValueHistory: [] });
        return;
      }
      if (folderId === 'favorites') {
        chrome.runtime.sendMessage({ type: 'resetAllFavoritePrompts', forceRefresh: true }, () => {
          initializeContinueButton(true);
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// addMemoryToggleButtonsToInput + toggle helpers
// Original source: content.isolated.end.js lines 7177-7226
// ---------------------------------------------------------------------------

/**
 * Add Memory / Reference Chats toggle switches to the composer footer.
 */
export async function addMemoryToggleButtonsToInput(): Promise<void> {
  const existing = document.querySelector('#memory-toggles-wrapper');
  if (!cachedSettings.showMemoryTogglesInInput) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const form = document.querySelector('main form');
  if (!form) return;
  const footer = form.querySelector('div[data-testid="composer-footer-actions"]') as HTMLElement | null;
  if (!footer) return;
  footer.classList.add('flex');

  const wrapper = document.createElement('div');
  wrapper.id = 'memory-toggles-wrapper';
  wrapper.className = 'ms-2 z-10 flex items-center gap-2 text-xs text-token-text-tertiary rounded-md p-1';
  footer.appendChild(wrapper);

  const { openAIUserSettings } = await chrome.storage.local.get(['openAIUserSettings']);

  const memorySwitch = createSwitch(
    'Memory',
    '',
    '',
    openAIUserSettings?.settings?.sunshine,
    toggleMemorySwitch,
    [],
    false,
    false,
    true,
  );
  addTooltip(memorySwitch, { value: 'Let ChatGPT save and use memories when responding.', position: 'top' });
  wrapper.appendChild(memorySwitch);

  const refSwitch = createSwitch(
    'Reference Chats',
    '',
    '',
    openAIUserSettings?.settings?.moonshine,
    toggleChatReferenceSwitch,
    [],
    false,
    false,
    true,
  );
  addTooltip(refSwitch, {
    value: 'Let ChatGPT reference all previous conversations when responding.',
    position: 'top',
  });
  wrapper.appendChild(refSwitch);

  if (!openAIUserSettings?.settings?.sunshine) {
    const refWrapper = document.querySelector('#sp-switch-wrapper-reference-chats') as HTMLElement | null;
    if (refWrapper) refWrapper.style.opacity = '0';
  }
}

async function toggleMemorySwitch(enabled: boolean, event: Event): Promise<void> {
  const refWrapper = document.querySelector('#sp-switch-wrapper-reference-chats') as HTMLElement | null;
  if (refWrapper) refWrapper.style.opacity = enabled ? '1' : '0';
  if ((event as any).isTrusted) {
    await updateAccountUserSetting('sunshine', enabled);
    if (!enabled) {
      const refInput = document.querySelector(
        'main form input[id="switch-reference-chats"]',
      ) as HTMLInputElement | null;
      if (refInput) {
        refInput.checked = false;
        refInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await updateAccountUserSetting('moonshine', false);
    }
  }
}

async function toggleChatReferenceSwitch(enabled: boolean, event: Event): Promise<void> {
  if ((event as any).isTrusted) {
    if (enabled) {
      const memInput = document.querySelector('main form input[id="switch-memory"]') as HTMLInputElement | null;
      if (memInput) {
        memInput.checked = true;
        memInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await updateAccountUserSetting('sunshine', true);
    }
    await updateAccountUserSetting('moonshine', enabled);
  }
}

// ---------------------------------------------------------------------------
// addMemoryTogglesToPromptInput
//
// Alias used by toggleMemoryTogglesInInputVisibility in manager.ts.
// The beautified source used different names for the same function;
// `addMemoryToggleButtonsToInput` (line 7177) is the implementation,
// `addMemoryTogglesToPromptInput` (line 22000) is the name referenced
// from the settings toggle callback.
// ---------------------------------------------------------------------------

/**
 * Re-add memory toggle switches to the composer footer.
 * Called when the "Show Memory Toggles in Input" setting is toggled on.
 */
export async function addMemoryTogglesToPromptInput(): Promise<void> {
  return addMemoryToggleButtonsToInput();
}

// ---------------------------------------------------------------------------
// focusOnFirstItem (private helper for loadCustomGPTs/loadPrompts)
// Original source: content.isolated.end.js line 10813
// ---------------------------------------------------------------------------

function focusOnFirstItem(): void {
  const wrapper = document.querySelector('#quick-access-menu-wrapper') as HTMLElement | null;
  if (!wrapper) return;
  const content = wrapper.querySelector('#quick-access-menu-content') as HTMLElement | null;
  if (!content) return;
  const items = content.querySelectorAll('button[id^=quick-access-menu-item-]:not([style*="display: none"])');
  if (items.length > 0 && !content.contains(document.activeElement)) {
    wrapper.focus();
    (items[0] as HTMLElement).focus();
    items[0]?.querySelector('span#item-arrow')?.classList?.remove('invisible');
  }
}

// ---------------------------------------------------------------------------
// loadCustomGPTs
// Original source: content.isolated.end.js line 10822
// ---------------------------------------------------------------------------

/**
 * Load recent / pinned custom GPTs into the quick-access menu,
 * optionally filtered by search term.
 */
export function loadCustomGPTs(searchTerm = ''): void {
  const content = document.querySelector('#quick-access-menu-content') as HTMLElement | null;
  if (!content) return;
  content.innerHTML = '';

  getGizmoDiscovery('recent', null, 24, 'global', false).then((discovery: any) => {
    getGizmosPinned(false).then((pinned: any) => {
      const items: any[] = discovery.list.items.map((item: any) => ({
        ...item.resource.gizmo,
        isRecent: true,
      }));
      pinned.forEach((p: any) => {
        const gid = p?.gizmo?.id;
        if (!items.find((i: any) => i.id === gid)) items.push(p.gizmo);
      });

      for (let idx = 0; idx < items.length; idx++) {
        const gizmo = items[idx]!;
        if (
          searchTerm &&
          !`${gizmo.display.name} ${gizmo?.display?.description}`.toLowerCase().includes(searchTerm.toLowerCase())
        )
          continue;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `quick-access-menu-item-${idx}`;
        btn.className =
          'btn w-full text-start focus-visible:outline-0 focus-visible:bg-token-main-surface-secondary hover:bg-token-main-surface-secondary flex justify-between items-center rounded-lg';

        const avatar = gizmo?.display?.profile_picture_url
          ? `<img src="${gizmo.display.profile_picture_url}" class="h-full w-full bg-token-main-surface-secondary dark:bg-token-main-surface-tertiary" alt="GPT" width="80" height="80" />`
          : '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="text-token-text-tertiary h-full w-full" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';

        const recentIcon = gizmo?.isRecent
          ? '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="icon icon-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
          : '<svg class="icon icon-sm" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M17.4845 2.8798C16.1773 1.57258 14.0107 1.74534 12.9272 3.24318L9.79772 7.56923C9.60945 7.82948 9.30775 7.9836 8.98654 7.9836H6.44673C3.74061 7.9836 2.27414 11.6759 4.16948 13.5713L6.59116 15.993L2.29324 20.2909C1.90225 20.6819 1.90225 21.3158 2.29324 21.7068C2.68422 22.0977 3.31812 22.0977 3.70911 21.7068L8.00703 17.4088L10.4287 19.8305C12.3241 21.7259 16.0164 20.2594 16.0164 17.5533V15.0135C16.0164 14.6923 16.1705 14.3906 16.4308 14.2023L20.7568 11.0728C22.2547 9.98926 22.4274 7.8227 21.1202 6.51549L17.4845 2.8798ZM11.8446 18.4147C12.4994 19.0694 14.0141 18.4928 14.0141 17.5533V15.0135C14.0141 14.0499 14.4764 13.1447 15.2572 12.58L19.5832 9.45047C20.0825 9.08928 20.1401 8.3671 19.7043 7.93136L16.0686 4.29567C15.6329 3.85993 14.9107 3.91751 14.5495 4.4168L11.4201 8.74285C10.8553 9.52359 9.95016 9.98594 8.98654 9.98594H6.44673C5.5072 9.98594 4.93059 11.5006 5.58535 12.1554L11.8446 18.4147Z" fill="currentColor"></path></svg>';

        btn.innerHTML = `<div class="w-full" tabindex="0"><div class="group flex h-10 items-center gap-2 rounded-lg px-2 font-medium text-sm text-token-text-primary"><div class="h-7 w-7 flex-shrink-0"><div class="gizmo-shadow-stroke overflow-hidden rounded-full">${avatar}</div></div><div class="flex h-fit grow flex-row justify-between space-x-2 overflow-hidden text-ellipsis whitespace-nowrap"><div class="flex flex-row space-x-2"><span class="shrink-0 truncate">${gizmo?.display?.name}</span><span class="flex-grow truncate text-sm font-light text-token-text-tertiary max-w-sm">${gizmo?.display?.description}</span></div><span class="shrink-0 self-center flex items-center"><span id="item-arrow" class="flex items-center justify-between text-xl me-2 rounded-md px-2 bg-token-main-surface-secondary ${idx === 0 ? '' : 'invisible'}"><span class="text-sm me-2">Enter</span> \u279C</span>${recentIcon}</span></div></div></div>`;

        content.appendChild(btn);
        btn.addEventListener('click', () => {
          const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
          if (!textarea) return;
          document.querySelector('#quick-access-menu-wrapper')?.remove();
          const text = textarea.innerText;
          const curPos = getSelectionOffsetRelativeToParent(textarea).start ?? 0;
          const atPos = text.lastIndexOf('@', curPos);
          const newText = text.substring(0, atPos) + text.substring(curPos);
          setTextAreaElementValue(newText);

          const replyPreview = document.querySelector('#reply-to-preview-wrapper');
          const imageEdit = document.querySelector('#image-edit-selection-preview');
          const existingTag = document.querySelector('#tagged-gizmo-wrapper');
          if (existingTag) existingTag.remove();

          const tagHtml = `<div id="tagged-gizmo-wrapper" data-gizmoid="${gizmo.id}" class="flex w-full flex-row items-center rounded-b-lg ${replyPreview || imageEdit ? '' : 'rounded-t-[20px]'} bg-token-main-surface-primary py-2.5 ps-3 pe-1.5 py-1 border border-token-border-medium"><div class="group flex flex-1 items-center gap-2 rounded-lg font-medium"><div class="h-6 w-6 flex-shrink-0"><div class="gizmo-shadow-stroke overflow-hidden rounded-full"><img src="${gizmo?.display?.profile_picture_url}" class="h-full w-full bg-token-main-surface-secondary dark:bg-token-main-surface-tertiary" alt="GPT" width="80" height="80"></div></div><div class="space-x-2 overflow-hidden text-ellipsis text-sm font-light text-token-text-tertiary">Talking to <span class="font-medium text-token-text-tertiary">${gizmo?.display?.name}</span></div></div><button id="tagged-gizmo-close-button" class="shrink-0"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-token-text-tertiary"><path d="M6.34315 6.34338L17.6569 17.6571M17.6569 6.34338L6.34315 17.6571" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></button></div>`;

          if (replyPreview) {
            replyPreview.classList.remove('rounded-b-lg');
            replyPreview.insertAdjacentHTML('afterend', tagHtml);
          } else if (imageEdit) {
            imageEdit.classList.remove('rounded-b-lg');
            imageEdit.insertAdjacentHTML('afterend', tagHtml);
          } else {
            textarea.parentElement?.insertAdjacentHTML('afterbegin', tagHtml);
          }
          textarea.focus();

          const closeBtn = document.querySelector('#tagged-gizmo-close-button');
          closeBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            closeMenus();
            document.querySelector('#tagged-gizmo-wrapper')?.remove();
            document.querySelector('#reply-to-preview-wrapper')?.classList.add('rounded-b-lg');
            document.querySelector('#image-edit-selection-preview')?.classList.add('rounded-b-lg');
          });
        });
      }

      if (content.querySelectorAll('button[id^=quick-access-menu-item-]').length === 0) {
        const noResult = document.createElement('div');
        noResult.className = 'text-center text-token-text-tertiary';
        noResult.textContent = 'No GPT found';
        content.appendChild(noResult);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// loadPrompts
// Original source: content.isolated.end.js line 10875
// ---------------------------------------------------------------------------

/**
 * Load prompts into the quick-access menu (the "/" command menu),
 * with pagination via IntersectionObserver.
 */
export function loadPrompts(page = 1, searchTerm = ''): void {
  const content = document.querySelector('#quick-access-menu-content') as HTMLElement | null;
  if (!content) return;

  if (page === 1) {
    content.innerHTML = '';
    content.appendChild(loadingSpinner('quick-access-menu-content'));
  } else {
    document.querySelector('#load-more-prompts-button')?.remove();
  }

  chrome.runtime.sendMessage(
    {
      type: 'getPrompts',
      detail: { pageNumber: page, searchTerm, isPublic: false, orderBy: 'alphabetical', deepSearch: false },
    },
    (response: any) => {
      if (!response) return;
      if (response.error) {
        document.querySelector('#loading-spinner-quick-access-menu-content')?.remove();
        const errEl = document.createElement('div');
        errEl.className = 'text-center text-token-text-tertiary';
        errEl.textContent = 'Error loading prompts';
        content.appendChild(errEl);
        return;
      }

      const results = response?.results;
      if (!results) return;

      const spinner = document.querySelector('#loading-spinner-quick-access-menu-content');
      if (spinner) spinner.remove();

      if (results.length === 0 && page === 1) {
        if (document.querySelector('#no-results-element')) return;
        const noRes = document.createElement('div');
        noRes.id = 'no-results-element';
        noRes.className = 'text-center text-token-text-tertiary';
        noRes.textContent = 'No prompts found';
        content.appendChild(noRes);
        return;
      }

      const sorted = results.sort((a: any, b: any) => a.title.localeCompare(b.title));
      for (let idx = 0; idx < sorted.length; idx++) {
        const p = results[idx]!;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = `${p.title}\n\n${sanitizeHtml(
          p?.steps
            ?.map((s: string, si: number) => `step ${si + 1}:\n${formatAttachmentsForPromptStep(s)}`)
            .join('\n') ?? '',
        )}`;
        btn.id = `quick-access-menu-item-${idx}`;
        btn.className =
          'btn w-full text-start focus-visible:outline-0 focus-visible:bg-token-main-surface-secondary hover:bg-token-main-surface-secondary flex justify-between items-center rounded-lg py-1';
        btn.innerHTML = `<span style="width:80%;"><span style="font-weight:bold; font-size:14px; margin-right:16px;white-space: nowrap; overflow: hidden; text-overflow: ellipsis;display:block;width:100%;">${p.title} <span class="font-normal text-xs text-token-text-tertiary">(${p.steps.length} ${p.steps.length > 1 ? 'steps' : 'step'})</span></span><span style="font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;display:block;width:100%;color:#888;">${translate('Step')} 1: ${sanitizeHtml(formatAttachmentsForPromptStep(p.steps[0]))}</span></span><span id="item-arrow" class="flex items-center justify-between text-xl me-2 rounded-md px-2 bg-token-sidebar-surface-secondary ${page === 1 && idx === 0 ? '' : 'invisible'}"><span class="text-sm me-2">Enter</span> \u279C</span>`;
        btn.addEventListener('click', async (ev) => {
          if ((ev as MouseEvent).shiftKey && p.steps.length === 1) {
            if (!(await canRunPrompts(p))) return;
            await insertPromptIntoTextArea(p);
          } else {
            runPromptChain(p, 0, false);
          }
        });
        content.appendChild(btn);
      }

      focusOnFirstItem();

      if (response.next) {
        const loadMore = document.createElement('button');
        loadMore.id = 'load-more-prompts-button';
        loadMore.className = 'p-2 cursor-pointer flex items-center justify-center h-auto relative';
        loadMore.appendChild(loadingSpinner('load-more-prompts-button'));
        content.appendChild(loadMore);
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                loadPrompts(page + 1, searchTerm);
                observer.disconnect();
              }
            });
          },
          { threshold: 0 },
        );
        observer.observe(loadMore);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Prompt card context menu
// Original: content.isolated.end.js lines 20854-20882
// ---------------------------------------------------------------------------

/**
 * Show a context menu for a prompt card (run, view, duplicate, move, delete, etc.).
 */
export function showPromptManagerCardMenu(anchor: HTMLElement, prompt: any, fromManager: boolean): void {
  const id = prompt.id;
  const isPublic = prompt.is_public;
  const folder = getLastSelectedPromptFolder();
  const { right, top } = anchor.getBoundingClientRect();
  const left = fromManager ? right - 234 : right - 2;
  const topPos = top + 22;

  const html = `<div id="prompt-card-menu" dir="ltr" style="transform:translate3d(${left}px,${topPos}px,0);position:fixed;left:0;top:0;min-width:max-content;z-index:10001;--radix-popper-anchor-width:18px;--radix-popper-anchor-height:18px;--radix-popper-available-width:1167px;--radix-popper-available-height:604px;--radix-popper-transform-origin:0% 0px"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" data-radix-menu-content="" dir="ltr" aria-labelledby="radix-:r6g:" class="min-w-[200px] max-w-xs rounded-2xl text-token-text-primary bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" data-orientation="vertical" style="outline:0;--radix-dropdown-menu-content-transform-origin:var(--radix-popper-transform-origin);--radix-dropdown-menu-content-available-width:var(--radix-popper-available-width);--radix-dropdown-menu-content-available-height:var(--radix-popper-available-height);--radix-dropdown-menu-trigger-width:var(--radix-popper-anchor-width);--radix-dropdown-menu-trigger-height:var(--radix-popper-anchor-height);pointer-events:auto">

  <div role="menuitem" id="run-prompt-card-button-${id}" title="CMD/CTRL + Click on the card" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item=""><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>${translate('Run')} <span class='ms-auto'>${buttonGenerator(['\u2318', 'Click'], 'xs')}</span></div>

  ${prompt.steps.length > 1 ? `<div role="menuitem" id="run-from-step-prompt-card-button-${id}" title="CMD/CTRL + Click on the card" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group relative" tabindex="-1" data-orientation="vertical" data-radix-collection-item=""><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor" class="icon icon-md"><path d="M55.1 56.04C55.1 42.78 66.74 32.04 79.1 32.04H111.1C125.3 32.04 135.1 42.78 135.1 56.04V176H151.1C165.3 176 175.1 186.8 175.1 200C175.1 213.3 165.3 224 151.1 224H71.1C58.74 224 47.1 213.3 47.1 200C47.1 186.8 58.74 176 71.1 176H87.1V80.04H79.1C66.74 80.04 55.1 69.29 55.1 56.04V56.04zM118.7 341.2C112.1 333.8 100.4 334.3 94.65 342.4L83.53 357.9C75.83 368.7 60.84 371.2 50.05 363.5C39.26 355.8 36.77 340.8 44.47 330.1L55.59 314.5C79.33 281.2 127.9 278.8 154.8 309.6C176.1 333.1 175.6 370.5 153.7 394.3L118.8 432H152C165.3 432 176 442.7 176 456C176 469.3 165.3 480 152 480H64C54.47 480 45.84 474.4 42.02 465.6C38.19 456.9 39.9 446.7 46.36 439.7L118.4 361.7C123.7 355.9 123.8 347.1 118.7 341.2L118.7 341.2zM520 72C533.3 72 544 82.75 544 96C544 109.3 533.3 120 520 120H248C234.7 120 224 109.3 224 96C224 82.75 234.7 72 248 72H520zM520 232C533.3 232 544 242.7 544 256C544 269.3 533.3 280 520 280H248C234.7 280 224 269.3 224 256C224 242.7 234.7 232 248 232H520zM520 392C533.3 392 544 402.7 544 416C544 429.3 533.3 440 520 440H248C234.7 440 224 429.3 224 416C224 402.7 234.7 392 248 392H520z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" stroke="currentColor" fill="currentColor" class="icon icon-xs absolute" style="top:6px;left:22px;"><path d="M361 215C375.3 223.8 384 239.3 384 256C384 272.7 375.3 288.2 361 296.1L73.03 472.1C58.21 482 39.66 482.4 24.52 473.9C9.377 465.4 0 449.4 0 432V80C0 62.64 9.377 46.63 24.52 38.13C39.66 29.64 58.21 29.99 73.03 39.04L361 215z"/></svg>${translate('Run from step')}</div>` : ''}

  <div role="menuitem" id="view-prompt-card-button-${id}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item=""><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor" class="icon icon-md"><path d="M160 256C160 185.3 217.3 128 288 128C358.7 128 416 185.3 416 256C416 326.7 358.7 384 288 384C217.3 384 160 326.7 160 256zM288 336C332.2 336 368 300.2 368 256C368 211.8 332.2 176 288 176C287.3 176 286.7 176 285.1 176C287.3 181.1 288 186.5 288 192C288 227.3 259.3 256 224 256C218.5 256 213.1 255.3 208 253.1C208 254.7 208 255.3 208 255.1C208 300.2 243.8 336 288 336L288 336zM95.42 112.6C142.5 68.84 207.2 32 288 32C368.8 32 433.5 68.84 480.6 112.6C527.4 156 558.7 207.1 573.5 243.7C576.8 251.6 576.8 260.4 573.5 268.3C558.7 304 527.4 355.1 480.6 399.4C433.5 443.2 368.8 480 288 480C207.2 480 142.5 443.2 95.42 399.4C48.62 355.1 17.34 304 2.461 268.3C-.8205 260.4-.8205 251.6 2.461 243.7C17.34 207.1 48.62 156 95.42 112.6V112.6zM288 80C222.8 80 169.2 109.6 128.1 147.7C89.6 183.5 63.02 225.1 49.44 256C63.02 286 89.6 328.5 128.1 364.3C169.2 402.4 222.8 432 288 432C353.2 432 406.8 402.4 447.9 364.3C486.4 328.5 512.1 286 526.6 256C512.1 225.1 486.4 183.5 447.9 147.7C406.8 109.6 353.2 80 288 80V80z"/></svg>${translate('View')}</div>

  ${
    prompt.is_mine
      ? `<div role="menuitem" id="duplicate-prompt-card-button-${id}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item=""><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>${translate('Duplicate')}</div>

        <div role="menuitem" id="public-prompt-card-button-${id}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item="">${isPublic ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="currentColor" fill="currentColor"  class="icon icon-md"><path d="M592 288H576V212.7c0-41.84-30.03-80.04-71.66-84.27C456.5 123.6 416 161.1 416 208V288h-16C373.6 288 352 309.6 352 336v128c0 26.4 21.6 48 48 48h192c26.4 0 48-21.6 48-48v-128C640 309.6 618.4 288 592 288zM496 432c-17.62 0-32-14.38-32-32s14.38-32 32-32s32 14.38 32 32S513.6 432 496 432zM528 288h-64V208c0-17.62 14.38-32 32-32s32 14.38 32 32V288zM224 256c70.7 0 128-57.31 128-128S294.7 0 224 0C153.3 0 96 57.31 96 128S153.3 256 224 256zM320 336c0-8.672 1.738-16.87 4.303-24.7C308.6 306.6 291.9 304 274.7 304H173.3C77.61 304 0 381.7 0 477.4C0 496.5 15.52 512 34.66 512h301.7C326.3 498.6 320 482.1 320 464V336z"/></svg> ${translate('Make private')}` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" height="1em" width="1em"><path d="M319.9 320c57.41 0 103.1-46.56 103.1-104c0-57.44-46.54-104-103.1-104c-57.41 0-103.1 46.56-103.1 104C215.9 273.4 262.5 320 319.9 320zM369.9 352H270.1C191.6 352 128 411.7 128 485.3C128 500.1 140.7 512 156.4 512h327.2C499.3 512 512 500.1 512 485.3C512 411.7 448.4 352 369.9 352zM512 160c44.18 0 80-35.82 80-80S556.2 0 512 0c-44.18 0-80 35.82-80 80S467.8 160 512 160zM183.9 216c0-5.449 .9824-10.63 1.609-15.91C174.6 194.1 162.6 192 149.9 192H88.08C39.44 192 0 233.8 0 285.3C0 295.6 7.887 304 17.62 304h199.5C196.7 280.2 183.9 249.7 183.9 216zM128 160c44.18 0 80-35.82 80-80S172.2 0 128 0C83.82 0 48 35.82 48 80S83.82 160 128 160zM551.9 192h-61.84c-12.8 0-24.88 3.037-35.86 8.24C454.8 205.5 455.8 210.6 455.8 216c0 33.71-12.78 64.21-33.16 88h199.7C632.1 304 640 295.6 640 285.3C640 233.8 600.6 192 551.9 192z"/></svg> ${translate('Make public')}`}</div>
        ${
          isDefaultPromptFolder(folder?.id?.toString())
            ? ''
            : `

        <div role="menuitem" id="move-prompt-card-button-${id}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item=""><svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" stroke-width="2" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>${translate('Move to folder')}</div>`
        }`
      : ''
  }
  ${prompt.is_public && !prompt.is_mine ? `<div role="menuitem" id="report-prompt-card-button-${id}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group text-orange-500" tabindex="-1" data-orientation="vertical" data-radix-collection-item=""><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" viewBox="0 0 512 512"><path d="M498.5 6.232c-19.76-11.99-38.92-3.226-41.61-1.1c-41.75 19.06-76.02 27.94-107.8 27.94c-28.92 0-51.74-7.321-75.9-15.09C247.5 8.844 220.1 .3094 185.2 .3055C159 .3055 121.3 2.641 32 38.84V16.01c0-8.836-7.164-15.1-16-15.1S0 7.172 0 16.01V496C0 504.8 7.164 512 16 512S32 504.8 32 496v-104.9c14.47-6.441 77.75-38.93 148.8-38.93c36.8 0 67.14 7.713 99.25 15.89c30.74 7.82 62.49 15.9 99.31 15.9c35.46 0 72.08-7.553 111.1-23.09c12.28-4.781 20.38-16.6 20.38-29.78L512 32.35C512 22.01 507.4 11.6 498.5 6.232zM479.7 331c-36.11 14.07-68.93 20.91-100.3 20.91c-32.81 0-61.26-7.238-91.39-14.9C255.4 328.7 221.7 320.2 180.8 320.2c-45.89 0-93.61 11.31-145.9 34.58L32 356.1V73.37l28.01-11.35c49.34-19.98 90.29-29.7 125.2-29.7c30.74 0 53.8 7.406 78.2 15.24c25.44 8.172 51.75 16.62 85.69 16.62c69.43 0 130.9-32.17 130.9-32.17L479.7 331z"/></svg>${translate('Report')}</div></div></div>` : ''}

  ${prompt.is_mine || folder?.id === 'recent' ? `<div role="menuitem" id="delete-prompt-card-button-${id}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group text-red-500" tabindex="-1" data-orientation="vertical" data-radix-collection-item=""><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Delete')}</div></div></div>` : ''}`;

  document.body.insertAdjacentHTML('beforeend', html);
  adjustMenuPosition(document.querySelector('#prompt-card-menu')!);
  addPromptManagerCardMenuEventListeners(prompt);
}

/**
 * Attach event listeners to prompt card context menu items.
 * Original: content.isolated.end.js lines 20884-20968
 */
function addPromptManagerCardMenuEventListeners(prompt: any): void {
  const id = prompt.id;
  const runBtn = document.querySelector(`#run-prompt-card-button-${id}`);
  const runFromStepBtn = document.querySelector(`#run-from-step-prompt-card-button-${id}`);
  const duplicateBtn = document.querySelector(`#duplicate-prompt-card-button-${id}`);
  const publicBtn = document.querySelector(`#public-prompt-card-button-${id}`);
  const viewBtn = document.querySelector(`#view-prompt-card-button-${id}`);
  const moveBtn = document.querySelector(`#move-prompt-card-button-${id}`);
  const reportBtn = document.querySelector(`#report-prompt-card-button-${id}`);
  const deleteBtn = document.querySelector(`#delete-prompt-card-button-${id}`);

  runBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    (document.querySelector('#modal-manager #modal-close-button-manager') as HTMLElement | null)?.click();
    runPromptChain(prompt, 0, !(ev as MouseEvent).shiftKey);
  });

  runFromStepBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    toast('Click on the play button of the step you want to start from', 'success', 10000);
    openPromptEditorModal(prompt);
    document.querySelectorAll('#run-from-here-icon').forEach((el) => {
      (el as HTMLElement).style.fill = '#19c37d';
      (el as HTMLElement).style.stroke = '#19c37d';
    });
  });

  viewBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    const copy = { ...prompt };
    if (!prompt.is_mine) {
      copy.is_public = false;
      delete copy.id;
      delete copy.folder;
    }
    openPromptEditorModal(copy);
  });

  duplicateBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    const folder = getLastSelectedPromptFolder();
    updatePromptFolderCount(folder?.id ?? null, [id]);
    chrome.runtime.sendMessage(
      {
        type: 'duplicatePrompt',
        forceRefresh: true,
        detail: { promptId: id },
      },
      (resp: any) => {
        if (resp.error && resp.error.type === 'limit') {
          errorUpgradeConfirmation(resp.error);
          return;
        }
        initializeContinueButton(true);
        document.querySelector('#prompt-card-menu')?.remove();
        const afterCard = document.querySelector(`#prompt-card-${id}`) as HTMLElement | null;
        addOrReplacePromptCard(resp, afterCard);
      },
    );
  });

  publicBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    chrome.runtime.sendMessage(
      {
        type: 'togglePromptPublic',
        forceRefresh: true,
        detail: { promptId: id },
      },
      (resp: any) => {
        const folder = getLastSelectedPromptFolder();
        if (!resp.prompt.is_public && folder?.id === 'public') {
          document.querySelector(`#prompt-card-${id}`)?.remove();
          return;
        }
        addOrReplacePromptCard(resp.prompt);
      },
    );
  });

  moveBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    const checkbox = document.querySelector(`#prompt-checkbox-${id}`) as HTMLInputElement | null;
    if (checkbox && !checkbox.checked) checkbox.click();
    setTimeout(() => handleClickMovePromptsButton(), 100);
  });

  reportBtn?.addEventListener('click', () => {
    openReportPromptModal(prompt);
  });

  deleteBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    showConfirmDialog('Delete prompt', 'Are you sure you want to delete this prompt?', 'Cancel', 'Delete', null, () => {
      updatePromptFolderCount(null, [id]);
      document.querySelector(`#prompt-card-${id}`)?.remove();
      const list = document.querySelector('#modal-manager #prompt-manager-prompt-list');
      if (list && list.children.length === 0) list.appendChild(noPromptElement());

      if (getLastSelectedPromptFolder()?.id === 'recent') {
        chrome.storage.local.get(['userInputValueHistory'], (data: any) => {
          const filtered = data.userInputValueHistory.filter((entry: any) => entry.inputValue !== prompt.steps[0]);
          chrome.storage.local.set({ userInputValueHistory: filtered });
        });
        return;
      }
      chrome.runtime.sendMessage({ type: 'deletePrompts', detail: { promptIds: [id] } }, () => {
        initializeContinueButton(true);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Handle "move prompts" button click
// Original: content.isolated.end.js lines 20240-20245
// ---------------------------------------------------------------------------

/**
 * Collect all checked prompt checkboxes and open the move-to-folder modal.
 */
export function handleClickMovePromptsButton(): void {
  const checked = Array.from(
    document.querySelectorAll('#modal-manager input[id^="prompt-checkbox-"]:checked'),
  ) as HTMLInputElement[];
  if (checked.length === 0) return;
  const ids = checked.map((el) => el.dataset.promptId!);
  openMovePromptToFolderModal(ids);
}

// ---------------------------------------------------------------------------
// Report prompt modal
// Original: content.isolated.end.js lines 20970-21008
// ---------------------------------------------------------------------------

/**
 * Toggle the submit button of the report modal based on selected reason.
 */
function toggleReportSubmitButton(item: { code: string }): void {
  const btn = document.querySelector('#report-modal-submit-button') as HTMLButtonElement;
  btn.disabled = item.code === 'select';
}

/**
 * Open a modal to report a public prompt.
 */
export function openReportPromptModal(prompt: any): void {
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  overlay.style.cssText =
    'position:fixed;top:0px;left:0px;width:100%;height:100%;background-color:rgba(0,0,0,0.5);z-index:10010;display:flex;align-items:center;justify-content:center;color:lightslategray;';
  overlay.id = 'report-modal';
  overlay.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).id === 'report-modal') overlay.remove();
  });

  const card = document.createElement('div');
  card.style.cssText =
    'width:400px;min-height:300px;background-color:#0b0d0e;border-radius:8px;padding:16px;display:flex;flex-direction:column;align-items:flex-start;justify-content:start;border:solid 1px lightslategray;';
  overlay.appendChild(card);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:1.25rem;font-weight:500;';
  title.textContent = 'Report prompt';
  card.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:0.875rem;font-weight:500;margin-top:32px;';
  subtitle.textContent = 'Why are you reporting this prompt?';
  card.appendChild(subtitle);

  const dropdownWrapper = document.createElement('div');
  dropdownWrapper.style.cssText = 'position:relative;width:100%;z-index:1000;margin-top:16px;';
  dropdownWrapper.innerHTML = dropdown('Report-Reason', reportReasonList, reportReasonList[0] ?? null, 'code', 'left');
  card.appendChild(dropdownWrapper);
  addDropdownEventListener('Report-Reason', reportReasonList, 'code', (item: any) => toggleReportSubmitButton(item));

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;width:100%;margin-top:32px;';
  card.appendChild(actions);

  const cancelBtn = document.createElement('button');
  cancelBtn.classList.value = 'btn btn-secondary border-0';
  cancelBtn.style.cssText = 'font-size:0.875rem;font-weight:500;padding:8px 16px;margin-right:16px;';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });
  actions.appendChild(cancelBtn);

  const submitBtn = document.createElement('button');
  submitBtn.classList.value = 'btn composer-submit-btn composer-submit-button-color';
  submitBtn.id = 'report-modal-submit-button';
  submitBtn.disabled = true;
  submitBtn.style.cssText = 'font-size:0.875rem;font-weight:500;padding:8px 16px;';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      {
        type: 'reportPrompt',
        forceRefresh: true,
        detail: { promptId: prompt.id },
      },
      (resp: any) => {
        if (resp.status === 'success') toast('Prompt reported');
        if (resp.status === 'same user') toast('You have already reported this prompt');
      },
    );
    overlay.remove();
    const wrapper = document.querySelector(`#library-item-action-wrapper-${prompt.id}`) as HTMLElement;
    wrapper.style.opacity = '0.3';
    wrapper.style.pointerEvents = 'none';
  });
  actions.appendChild(submitBtn);
}

// ---------------------------------------------------------------------------
// Move prompt-folder helpers
// Original: content.isolated.end.js lines 23787-23945, 19852-19855
// ---------------------------------------------------------------------------

/**
 * Add a newly created folder element to the prompt manager sidebar.
 * Original: line 19852
 */
export function addNewPromptFolderElementToManagerSidebar(folder: any): void {
  const sidebar = document.querySelector('#modal-manager #prompt-manager-sidebar-folders');
  if (!sidebar) return;
  const el = promptFolderElement(folder, true);
  if (el) sidebar.appendChild(el);
  sidebar.scrollTop = sidebar.scrollHeight;
}

/**
 * Build the HTML for a single folder row inside the move-prompt-folder modal.
 * Original: line 23801
 */
export function movePromptFolderSimpleFolderElement(folder: any, excludeId: string | number): string {
  const isLimited = folder.id === -1;
  const img = folder.image || folder.image_url || chrome.runtime.getURL('icons/folder.png');

  return `<div id="move-prompt-folder-wrapper-folder-${folder.id}" class="flex w-full mb-2 group ${isLimited || excludeId === folder.id ? 'opacity-50 pointer-events-none' : ''}" style="flex-wrap: wrap;"><div id="folder-${folder.id}" class="flex py-3 px-3 pe-3 w-full border border-token-border-medium items-center gap-3 relative rounded-md cursor-pointer break-all hover:pe-10 group" title="${folder.name}" style="background-color: ${folder.color};"><img class="w-6 h-6 object-cover rounded-md" src="${img}" style="filter:drop-shadow(0px 0px 1px black);" data-is-open="false"><div id="title-folder-${folder.id}" class="flex-1 text-ellipsis max-h-5 overflow-hidden whitespace-nowrap break-all relative text-white relative" style="bottom: 6px;">${folder.name}</div><div id="folder-actions-wrapper-${folder.id}" class="absolute flex end-1 z-10 text-gray-300"><button id="move-prompt-folder-button-${folder.id}" class="btn btn-xs btn-primary group-hover:visible ${isLimited || excludeId === folder.id ? '' : 'invisible'}" ${excludeId === folder.id ? 'disabled="true"' : ''} title="Move to folder">${isLimited ? 'Upgrade to pro' : excludeId === folder.id ? 'Moving folder' : 'Move to this folder'}</button></div><div id="count-folder-${folder.id}" style="color: rgba(255, 255, 255, 0.6);font-size: 10px; position: absolute; left: 50px; bottom: 2px; display: block;">${folder?.subfolders?.length || 0} folder${folder?.subfolders?.length === 1 ? '' : 's'} - ${folder.prompt_count} prompt${folder.prompt_count === 1 ? '' : 's'}</div></div></div>`;
}

/**
 * Load the folder list into the move-prompt-folder modal.
 * Original: line 23787
 */
export async function movePromptFolderLoadFolderList(folder: any, searchTerm = ''): Promise<void> {
  const listEl = document.querySelector('#move-prompt-folder-list') as HTMLElement;
  listEl.innerHTML = '';
  listEl.appendChild(loadingSpinner('move-prompt-folder-list'));

  const folders: any[] = await chrome.runtime.sendMessage({
    type: 'getPromptFolders',
    detail: { sortBy: 'alphabetical', searchTerm },
  });

  const parentFolder = folder.parent_folder;

  listEl.innerHTML =
    folders.length > 0
      ? `<button id="move-prompt-to-root-button" class="btn btn-large w-full btn-primary mb-2 ${parentFolder ? '' : 'opacity-50 pointer-events-none'}" ${parentFolder ? '' : 'disabled="true"'}>Move to root</button>${folders.map((f) => movePromptFolderSimpleFolderElement(f, folder.id)).join('')}`
      : '<div id="no-prompt-folders" class="text-sm text-token-text-tertiary">No folders found.</div>';
}

/**
 * Handle clicking a folder row in the move modal to drill into its subfolders.
 * Original: line 23874
 */
export function movePromptFolderOpenFolder(wrapper: HTMLElement, folder: any, shiftKey = false): void {
  const folderId = wrapper.id.split('move-prompt-folder-wrapper-folder-')[1];
  const nextSibling = wrapper.nextElementSibling as HTMLElement | null;

  // Shift-click: collapse (remove) the subfolder wrapper
  if (shiftKey) {
    if (nextSibling && nextSibling.id === `subfolder-wrapper-${folderId}`) {
      nextSibling.remove();
    }
    // fall through to re-create it below (refresh)
  } else if (nextSibling && nextSibling.id === `subfolder-wrapper-${folderId}`) {
    // Toggle visibility of an existing subfolder wrapper
    if (nextSibling.classList.contains('hidden')) {
      nextSibling.classList.remove('hidden');
    } else {
      nextSibling.classList.add('hidden');
    }
    return;
  }

  // Create a new subfolder wrapper
  const subfolderWrapper = document.createElement('div');
  subfolderWrapper.id = `subfolder-wrapper-${folderId}`;
  subfolderWrapper.className = 'ps-4 border-s border-token-border-medium';
  wrapper.insertAdjacentElement('afterend', subfolderWrapper);

  const innerContainer = document.createElement('div');
  innerContainer.className = 'flex flex-col mb-4 relative';
  innerContainer.style.minHeight = '32px';
  innerContainer.appendChild(loadingSpinner('subfolder-list'));
  subfolderWrapper.appendChild(innerContainer);

  chrome.runtime.sendMessage(
    {
      type: 'getPromptFolders',
      forceRefresh: shiftKey,
      detail: { sortBy: 'alphabetical', parentFolderId: folderId },
    },
    (subfolders: any) => {
      if (!subfolders || !Array.isArray(subfolders)) return;

      innerContainer.innerHTML = '';

      if (subfolders.length > 0) {
        subfolders.forEach((sub: any) => {
          innerContainer.insertAdjacentHTML('beforeend', movePromptFolderSimpleFolderElement(sub, folder.id));
          const subEl = document.querySelector(`#move-prompt-folder-wrapper-folder-${sub.id}`) as HTMLElement | null;
          if (subEl) {
            subEl.addEventListener('click', (ev: MouseEvent) => {
              movePromptFolderOpenFolder(subEl, folder, ev.shiftKey);
            });
            document.querySelector(`#move-prompt-folder-button-${sub.id}`)?.addEventListener('click', () => {
              movePromptFolder(folder, sub.id);
              toast('Folder moved successfully');
              document.querySelector('#move-prompt-folder-modal')?.remove();
            });
          }
        });
      }

      // "+ New Subfolder" button
      const newSubBtn = document.createElement('button');
      newSubBtn.className = 'btn btn-xs btn-primary mt-2';
      newSubBtn.innerText = '\uFF0B New Subfolder';
      innerContainer.appendChild(newSubBtn);

      newSubBtn.addEventListener('click', async () => {
        const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
        const existingFolders = document.querySelectorAll(
          '#move-prompt-folder-content [id^=move-prompt-folder-wrapper-folder-]',
        );
        if (!hasSub && existingFolders.length >= 5) {
          errorUpgradeConfirmation({
            type: 'limit',
            title: 'You have reached the limit',
            message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
          });
          return;
        }

        const name = prompt('Enter folder name:', 'New Category');
        if (!name) return;

        const parentColor =
          (wrapper.querySelector('div[id^=folder-]') as HTMLElement)?.style?.backgroundColor ||
          generateRandomDarkColor();
        const parentImage = (wrapper.querySelector('div[id^=folder-] img') as HTMLImageElement)?.src || '';

        const created: any = await chrome.runtime.sendMessage({
          type: 'addPromptFolders',
          detail: {
            folders: [
              {
                name,
                color: parentColor,
                image_url: parentImage,
                parent_folder: parseInt(folderId!, 10),
              },
            ],
          },
        });

        if (created.error && created.error.type === 'limit') {
          errorUpgradeConfirmation(created.error);
          return;
        }

        innerContainer.insertAdjacentHTML('afterbegin', movePromptFolderSimpleFolderElement(created[0], folder.id));
        const newEl = document.querySelector(`#move-prompt-folder-wrapper-folder-${created[0].id}`) as HTMLElement;
        newEl.addEventListener('click', (ev: MouseEvent) => {
          movePromptFolderOpenFolder(newEl, folder, ev.shiftKey);
        });
        document.querySelector(`#move-prompt-folder-button-${created[0].id}`)?.addEventListener('click', () => {
          movePromptFolder(folder, created[0].id);
          toast('Folder moved successfully');
          document.querySelector('#move-prompt-folder-modal')?.remove();
        });
      });
    },
  );
}

/**
 * Wire up event listeners for the move-prompt-folder modal.
 * Original: line 23807
 */
export function addMovePromptFolderModalEventListener(folder: any): void {
  // "Move to root" button
  const rootBtn = document.querySelector('#move-prompt-to-root-button');
  rootBtn?.addEventListener('click', () => {
    movePromptFolder(folder, 0);
    toast('Folder moved successfully');
    document.querySelector('#move-prompt-folder-modal')?.remove();
  });

  // Click on any folder row -> drill into subfolders
  document.querySelectorAll('[id^=move-prompt-folder-wrapper-folder-]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      movePromptFolderOpenFolder(el as HTMLElement, folder, (ev as MouseEvent).shiftKey);
    });
  });

  // "Move to this folder" buttons
  document.querySelectorAll('button[id^=move-prompt-folder-button-]').forEach((btn) => {
    const targetId = btn.id.split('move-prompt-folder-button-')[1];
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (targetId === '-1') {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message: 'With free account, you can only have up to 5 prompt folders. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      movePromptFolder(folder, targetId!);
      toast('Folder moved successfully');
      document.querySelector('#move-prompt-folder-modal')?.remove();
    });
  });

  // "+ New Folder" button
  document.querySelector('#move-prompt-folder-new-folder')?.addEventListener('click', async () => {
    const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
    const existingFolders = document.querySelectorAll(
      '#move-prompt-folder-content [id^=move-prompt-folder-wrapper-folder-]',
    );
    if (!hasSub && existingFolders.length >= 5) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
      });
      return;
    }

    const name = prompt('Enter folder name:', 'New Category');
    if (!name) return;

    document.querySelectorAll('#no-prompt-folders').forEach((el) => el.remove());

    const created: any = await chrome.runtime.sendMessage({
      type: 'addPromptFolders',
      detail: { folders: [{ name, color: generateRandomDarkColor() }] },
    });

    if (created.error && created.error.type === 'limit') {
      errorUpgradeConfirmation(created.error);
      return;
    }

    const rootButton = document.querySelector('#move-prompt-to-root-button');
    rootButton?.insertAdjacentHTML('afterend', movePromptFolderSimpleFolderElement(created[0], folder.id));

    const newEl = document.querySelector(`#move-prompt-folder-wrapper-folder-${created[0].id}`) as HTMLElement;
    newEl.addEventListener('click', (ev: MouseEvent) => {
      movePromptFolderOpenFolder(newEl, folder, ev.shiftKey);
    });
    document.querySelector(`#move-prompt-folder-button-${created[0].id}`)?.addEventListener('click', () => {
      movePromptFolder(folder, created[0].id);
      toast('Folder moved successfully');
      document.querySelector('#move-prompt-folder-modal')?.remove();
    });

    addNewPromptFolderElementToManagerSidebar(created[0]);
  });

  // Close button
  document.querySelector('#move-prompt-folder-close-button')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    document.querySelector('#move-prompt-folder-modal')?.remove();
  });

  // Click outside modal content to close
  document.body.addEventListener('click', (ev) => {
    const modal = document.querySelector('#move-prompt-folder-modal');
    const content = document.querySelector('#move-prompt-folder-content');
    if (
      content &&
      isDescendant(modal as HTMLElement, ev.target as HTMLElement) &&
      !isDescendant(content as HTMLElement, ev.target as HTMLElement)
    ) {
      modal?.remove();
    }
  });
}

// ---------------------------------------------------------------------------
// Move prompt-folder modal
// Original: content.isolated.end.js lines 23743-23786
// ---------------------------------------------------------------------------

/**
 * Open a modal for moving a prompt folder to a different parent folder.
 */
export async function openMovePromptFolderModal(folder: any): Promise<void> {
  const html = `
  <div id="move-prompt-folder-modal" class="absolute inset-0" style="z-index: 10000;">
    <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
      <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
        <div id="move-prompt-folder-content" role="dialog" aria-describedby="radix-:r3o:" aria-labelledby="radix-:r3n:" data-state="open" class="popover bg-token-main-surface-primary relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col focus:outline-hidden overflow-hidden max-w-lg" tabindex="-1" style="pointer-events: auto;">
          <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
            <div class="flex">
              <div class="flex items-center">
                <div class="flex grow flex-col gap-1">
                  <h2 as="h3" class="text-lg font-medium leading-6 text-token-text-primary">${translate('Select a folder')}</h2>
                </div>
              </div>
            </div>
            <div class="flex items-center">
              <button id="move-prompt-folder-new-folder" class="btn flex justify-center gap-2 composer-submit-btn composer-submit-button-color me-2 border" data-default="true" style="min-width: 72px; height: 34px;">${translate('plus New Folder')}</button>
              <button id="move-prompt-folder-close-button" class="text-token-text-tertiary hover:text-token-text-primary transition">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20"
                  xmlns="http://www.w3.org/2000/svg">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="px-4 pt-4">
            <input id="move-prompt-folder-search-input" type="search" placeholder="${translate('Search folders')}" class="w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary">
          </div>
          <div id="move-prompt-folder-list" class="p-4 overflow-y-auto" style="height:500px;">
            <!-- folder list here -->
          </div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  await movePromptFolderLoadFolderList(folder);
  addMovePromptFolderModalEventListener(folder);

  const debouncedSearch = debounce(async (term: string) => {
    await movePromptFolderLoadFolderList(folder, term);
    addMovePromptFolderModalEventListener(folder);
  }, 500);

  const searchInput = document.querySelector('#move-prompt-folder-search-input') as HTMLInputElement;
  searchInput.addEventListener('input', async () => {
    debouncedSearch(searchInput.value);
  });
}

// ---------------------------------------------------------------------------
// defaultPromptFoldersList
//
// Original: content.isolated.end.js line 19857
// The prompt-folder equivalent of defaultConversationFoldersList in folders.ts.
// ---------------------------------------------------------------------------

const SORT_CHECK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg>';

const SETTINGS_GEAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-md" fill="currentColor" viewBox="0 0 512 512"><path d="M495.9 166.6C499.2 175.2 496.4 184.9 489.6 191.2L446.3 230.6C447.4 238.9 448 247.4 448 256C448 264.6 447.4 273.1 446.3 281.4L489.6 320.8C496.4 327.1 499.2 336.8 495.9 345.4C491.5 357.3 486.2 368.8 480.2 379.7L475.5 387.8C468.9 398.8 461.5 409.2 453.4 419.1C447.4 426.2 437.7 428.7 428.9 425.9L373.2 408.1C359.8 418.4 344.1 427 329.2 433.6L316.7 490.7C314.7 499.7 307.7 506.1 298.5 508.5C284.7 510.8 270.5 512 255.1 512C241.5 512 227.3 510.8 213.5 508.5C204.3 506.1 197.3 499.7 195.3 490.7L182.8 433.6C167 427 152.2 418.4 138.8 408.1L83.14 425.9C74.3 428.7 64.55 426.2 58.63 419.1C50.52 409.2 43.12 398.8 36.52 387.8L31.84 379.7C25.77 368.8 20.49 357.3 16.06 345.4C12.82 336.8 15.55 327.1 22.41 320.8L65.67 281.4C64.57 273.1 64 264.6 64 256C64 247.4 64.57 238.9 65.67 230.6L22.41 191.2C15.55 184.9 12.82 175.3 16.06 166.6C20.49 154.7 25.78 143.2 31.84 132.3L36.51 124.2C43.12 113.2 50.52 102.8 58.63 92.95C64.55 85.8 74.3 83.32 83.14 86.14L138.8 103.9C152.2 93.56 167 84.96 182.8 78.43L195.3 21.33C197.3 12.25 204.3 5.04 213.5 3.51C227.3 1.201 241.5 0 256 0C270.5 0 284.7 1.201 298.5 3.51C307.7 5.04 314.7 12.25 316.7 21.33L329.2 78.43C344.1 84.96 359.8 93.56 373.2 103.9L428.9 86.14C437.7 83.32 447.4 85.8 453.4 92.95C461.5 102.8 468.9 113.2 475.5 124.2L480.2 132.3C486.2 143.2 491.5 154.7 495.9 166.6V166.6zM256 336C300.2 336 336 300.2 336 255.1C336 211.8 300.2 175.1 256 175.1C211.8 175.1 176 211.8 176 255.1C176 300.2 211.8 336 256 336z"/></svg>';

/**
 * Build the list of default (built-in) prompt folders shown at the top of the
 * prompt-manager sidebar.  Mirrors `defaultConversationFoldersList` in
 * folders.ts.
 *
 * Original: content.isolated.end.js line 19857
 */
export function defaultPromptFoldersList(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = 'default-prompt-folders';
  wrapper.classList.add('pb-2', 'mb-4', 'border-b', 'border-token-border-medium', 'relative');

  defaultPromptFolders.forEach((f) => {
    const el = promptFolderElement(f as any, true);
    if (el) wrapper.appendChild(el);
  });

  const sortBy = (cachedSettings.selectedPromptsManagerFoldersSortBy as string | undefined) ?? 'alphabetical';
  const sortLabels: Record<string, string> = {
    alphabetical: 'A\u2192Z',
    'alphabetical-reverse': 'Z\u2192A',
    created_at: 'Created At',
    updated_at: 'Updated At',
  };

  const sortBtn = document.createElement('button');
  sortBtn.innerText = `\u21C5 ${sortLabels[sortBy] || 'A\u2192Z'}`;
  sortBtn.id = 'conversation-manager-folders-sort-button';
  sortBtn.className =
    'absolute end-0 ps-2 text-token-text-tertiary hover:text-token-text-primary cursor-pointer bg-token-main-surface-primary';
  sortBtn.style.cssText = 'bottom:-10px; font-size: 12px;';
  addTooltip(sortBtn, { value: 'Sort Categories', position: 'right' });
  sortBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    showPromptCategorySortByMenu(sortBtn);
  });
  wrapper.appendChild(sortBtn);

  return wrapper;
}

// ---------------------------------------------------------------------------
// showPromptCategorySortByMenu + event listeners
//
// Original: content.isolated.end.js lines 21151-21215
// ---------------------------------------------------------------------------

/**
 * Show a popover sort-by menu for prompt categories (alphabetical, reverse,
 * created-at, updated-at).
 */
export function showPromptCategorySortByMenu(anchor: HTMLElement): void {
  const sortBy = (cachedSettings.selectedPromptsManagerFoldersSortBy as string | undefined) ?? 'alphabetical';
  const { right, top } = anchor.getBoundingClientRect();
  const x = right + 2;
  const y = top - 50;

  const check = (key: string) => (sortBy === key ? SORT_CHECK_SVG : '');
  const menuItemCls =
    'flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group';

  const html = `<div id="prompt-manager-sidebar-settings-sort-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001"><div data-side="bottom" data-align="start" role="menu" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="outline:0;pointer-events:auto">
    <div role="menuitem" id="alphabetical-sort-prompts-button" class="${menuItemCls}" tabindex="-1">${translate('Alphabetical (A\u2192Z)')} ${check('alphabetical')}</div>
    <div role="menuitem" id="alphabetical-reverse-sort-prompts-button" class="${menuItemCls}" tabindex="-1">${translate('Alphabetical (Z\u2192A)')} ${check('alphabetical-reverse')}</div>
    <div role="menuitem" id="create-at-sort-prompts-button" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1">${translate('Create date')} ${check('created_at')}</div>
    <div role="menuitem" id="update-at-sort-prompts-button" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1">${translate('Update date')} ${check('updated_at')}</div>
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  addPromptCategorySortByMenuEventListeners();
}

function addPromptCategorySortByMenuEventListeners(): void {
  const alphaBtn = document.querySelector('#alphabetical-sort-prompts-button');
  const alphaRevBtn = document.querySelector('#alphabetical-reverse-sort-prompts-button');
  const createBtn = document.querySelector('#create-at-sort-prompts-button');
  const updateBtn = document.querySelector('#update-at-sort-prompts-button');

  const applySortAndRefresh = (sortKey: string) => {
    chrome.storage.local.set({ settings: { ...cachedSettings, selectedPromptsManagerFoldersSortBy: sortKey } }, () => {
      const sidebar = document.querySelector('#prompt-manager-sidebar') as HTMLElement | null;
      if (sidebar) {
        sidebar.innerHTML = '';
        sidebar.insertAdjacentElement('beforeend', promptManagerSidebarContent());
      }
    });
  };

  alphaBtn?.addEventListener('click', () => applySortAndRefresh('alphabetical'));
  alphaRevBtn?.addEventListener('click', () => applySortAndRefresh('alphabetical-reverse'));
  createBtn?.addEventListener('click', () => applySortAndRefresh('created_at'));
  updateBtn?.addEventListener('click', () => applySortAndRefresh('updated_at'));
}

// ---------------------------------------------------------------------------
// showPromptManagerSidebarSettingsMenu + event listeners + reset helper
//
// Original: content.isolated.end.js lines 21009-21149
// The prompt-manager equivalent of showConversationManagerSidebarSettingsMenu
// in folders.ts.
// ---------------------------------------------------------------------------

/**
 * Show the prompt-manager sidebar settings popup (sort / export / import).
 */
export async function showPromptManagerSidebarSettingsMenu(button: HTMLElement): Promise<void> {
  const { right, top } = button.getBoundingClientRect();
  const hasSub: boolean = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const x = right + 2;
  const y = top - 120;
  const proTag = hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>';

  const menuItemCls =
    'flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group';

  const html = `<div id="prompt-manager-sidebar-settings-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001"><div data-side="bottom" data-align="start" role="menu" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="outline:0;pointer-events:auto">
    <div role="menuitem" id="sort-prompt-categories-button" class="${menuItemCls}" tabindex="-1">${translate('Sort categories')} <svg aria-hidden="true" fill="none" focusable="false" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" style="min-width:16px" viewBox="0 0 24 24" width="1em"><path d="m9 18 6-6-6-6"></path></svg></div>
    <div role="menuitem" id="export-prompts-button" class="${menuItemCls}" tabindex="-1">${translate('Export prompts')} ${proTag}</div>
    <div role="menuitem" id="import-prompts-button" class="${menuItemCls}" tabindex="-1">${translate('Import prompts')} ${proTag}</div>
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  addPromptManagerSidebarSettingsMenuEventListeners();
}

function addPromptManagerSidebarSettingsMenuEventListeners(): void {
  const menu = document.querySelector('#prompt-manager-sidebar-settings-menu');
  const sortBtn = document.querySelector('#sort-prompt-categories-button');
  const exportBtn = document.querySelector('#export-prompts-button');
  const importBtn = document.querySelector('#import-prompts-button');

  sortBtn?.addEventListener('mouseenter', () => {
    showPromptCategorySortByMenu(menu as HTMLElement);
  });

  exportBtn?.addEventListener('mouseover', () => {
    document.querySelector('#prompt-manager-sidebar-settings-sort-menu')?.remove();
  });

  exportBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message: 'Exporting prompts requires a Pro subscription. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      document.querySelector('#prompt-manager-sidebar-settings-menu')?.remove();
      const settingsBtn = document.querySelector('#prompt-manager-sidebar-settings-button') as HTMLElement | null;
      if (settingsBtn) {
        settingsBtn.innerHTML =
          '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-md"><circle fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="12"></circle></svg>';
      }
      chrome.runtime.sendMessage({ type: 'getAllPrompts', detail: {} }, async (res: any) => {
        const { userInputValueHistory } = await chrome.storage.local.get(['userInputValueHistory']);
        resetPromptManagerSidebarSettingsButton();
        if (res?.error?.type === 'limit') {
          errorUpgradeConfirmation(res.error);
          return;
        }
        if (!res || Object.keys(res).length === 0) {
          toast('No prompts found', 'error');
          return;
        }
        res.Recent = userInputValueHistory;
        const blob = new Blob([JSON.stringify(res)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const ts = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}__${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
        a.download = `Council Prompts - ${ts}.json`;
        a.click();
      });
    });
  });

  importBtn?.addEventListener('mouseover', () => {
    document.querySelector('#prompt-manager-sidebar-settings-sort-menu')?.remove();
  });

  importBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message: 'Importing prompts requires a Pro subscription. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      document.querySelector('#prompt-manager-sidebar-settings-menu')?.remove();
      const settingsBtn = document.querySelector('#prompt-manager-sidebar-settings-button') as HTMLElement | null;
      if (settingsBtn) {
        settingsBtn.innerHTML =
          '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-md"><circle fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="12"></circle></svg>';
      }
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.addEventListener('change', (ev) => {
        const target = ev.target as HTMLInputElement;
        if (!target.files?.length) {
          resetPromptManagerSidebarSettingsButton();
          return;
        }
        const file = target.files[0];
        if (!file) {
          resetPromptManagerSidebarSettingsButton();
          return;
        }
        const reader = new FileReader();
        reader.onload = (loadEv) => {
          if (!loadEv.target?.result) {
            resetPromptManagerSidebarSettingsButton();
            return;
          }
          const parsed = JSON.parse(loadEv.target.result as string);
          if (typeof parsed !== 'object') {
            resetPromptManagerSidebarSettingsButton();
            toast('Invalid file format', 'error');
            return;
          }
          const recent = parsed.Recent;
          delete parsed.Recent;
          if (recent) chrome.storage.local.set({ userInputValueHistory: recent });

          const groups: any[] = Object.values(parsed);
          if (!groups.every((g) => Array.isArray(g) && g.every((p: any) => typeof p === 'object'))) {
            resetPromptManagerSidebarSettingsButton();
            toast('Invalid file format', 'error');
            return;
          }
          chrome.runtime.sendMessage(
            {
              type: 'addPrompts',
              detail: {
                prompts: groups.flat().map((p: any) => ({
                  ...p,
                  tags: p.tags.map((t: any) => t.id),
                })),
              },
            },
            (addRes: any) => {
              resetPromptManagerSidebarSettingsButton();
              if (addRes?.error) {
                if (addRes.error.type === 'limit') errorUpgradeConfirmation(addRes.error);
                else toast('Error importing prompts', 'error');
                return;
              }
              createManager('prompts');
              toast('Imported Prompts Successfully');
            },
          );
        };
        reader.onerror = () => {
          resetPromptManagerSidebarSettingsButton();
        };
        reader.readAsText(file);
      });
      (fileInput as any).oncancel = () => {
        resetPromptManagerSidebarSettingsButton();
      };
      fileInput.click();
    });
  });
}

/**
 * Reset the prompt-manager sidebar settings button back to its default gear
 * icon (removes spinner).
 *
 * Original: content.isolated.end.js line 21146
 */
function resetPromptManagerSidebarSettingsButton(): void {
  const btn = document.querySelector('#prompt-manager-sidebar-settings-button') as HTMLElement | null;
  if (btn) btn.innerHTML = SETTINGS_GEAR_SVG;
}

// ---------------------------------------------------------------------------
// Prompt editor "See all" link handler
// Original: content.isolated.end.js lines 11327-11331
// ---------------------------------------------------------------------------

/**
 * Wire the "See all" link inside the prompt editor to open the manager modal
 * with the prompts tab.
 */
export function addPromptEditorEventListener(): void {
  document.querySelector('#see-all-prompt-chains')?.addEventListener('click', () => {
    document.querySelector('#prompt-editor-modal')?.remove();
    if (!document.querySelector('#modal-manager') || managerModalCurrentTab !== 'prompts') {
      createManager('prompts');
    }
  });
}

// ---------------------------------------------------------------------------
// Compact/List view toggle button
// Original: content.isolated.end.js lines 20047-20062
// ---------------------------------------------------------------------------

// SVG for grid icon (3x3 squares)
const GRID_VIEW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-md" viewBox="0 0 448 512"><path d="M88 32C110.1 32 128 49.91 128 72V120C128 142.1 110.1 160 88 160H40C17.91 160 0 142.1 0 120V72C0 49.91 17.91 32 40 32H88zM88 64H40C35.58 64 32 67.58 32 72V120C32 124.4 35.58 128 40 128H88C92.42 128 96 124.4 96 120V72C96 67.58 92.42 64 88 64zM88 192C110.1 192 128 209.9 128 232V280C128 302.1 110.1 320 88 320H40C17.91 320 0 302.1 0 280V232C0 209.9 17.91 192 40 192H88zM88 224H40C35.58 224 32 227.6 32 232V280C32 284.4 35.58 288 40 288H88C92.42 288 96 284.4 96 280V232C96 227.6 92.42 224 88 224zM0 392C0 369.9 17.91 352 40 352H88C110.1 352 128 369.9 128 392V440C128 462.1 110.1 480 88 480H40C17.91 480 0 462.1 0 440V392zM32 392V440C32 444.4 35.58 448 40 448H88C92.42 448 96 444.4 96 440V392C96 387.6 92.42 384 88 384H40C35.58 384 32 387.6 32 392zM248 32C270.1 32 288 49.91 288 72V120C288 142.1 270.1 160 248 160H200C177.9 160 160 142.1 160 120V72C160 49.91 177.9 32 200 32H248zM248 64H200C195.6 64 192 67.58 192 72V120C192 124.4 195.6 128 200 128H248C252.4 128 256 124.4 256 120V72C256 67.58 252.4 64 248 64zM160 232C160 209.9 177.9 192 200 192H248C270.1 192 288 209.9 288 232V280C288 302.1 270.1 320 248 320H200C177.9 320 160 302.1 160 280V232zM192 232V280C192 284.4 195.6 288 200 288H248C252.4 288 256 284.4 256 280V232C256 227.6 252.4 224 248 224H200C195.6 224 192 227.6 192 232zM248 352C270.1 352 288 369.9 288 392V440C288 462.1 270.1 480 248 480H200C177.9 480 160 462.1 160 440V392C160 369.9 177.9 352 200 352H248zM248 384H200C195.6 384 192 387.6 192 392V440C192 444.4 195.6 448 200 448H248C252.4 448 256 444.4 256 440V392C256 387.6 252.4 384 248 384zM320 72C320 49.91 337.9 32 360 32H408C430.1 32 448 49.91 448 72V120C448 142.1 430.1 160 408 160H360C337.9 160 320 142.1 320 120V72zM352 72V120C352 124.4 355.6 128 360 128H408C412.4 128 416 124.4 416 120V72C416 67.58 412.4 64 408 64H360C355.6 64 352 67.58 352 72zM408 192C430.1 192 448 209.9 448 232V280C448 302.1 430.1 320 408 320H360C337.9 320 320 302.1 320 280V232C320 209.9 337.9 192 360 192H408zM408 224H360C355.6 224 352 227.6 352 232V280C352 284.4 355.6 288 360 288H408C412.4 288 416 284.4 416 280V232C416 227.6 412.4 224 408 224zM320 392C320 369.9 337.9 352 360 352H408C430.1 352 448 369.9 448 392V440C448 462.1 430.1 480 408 480H360C337.9 480 320 462.1 320 440V392zM352 392V440C352 444.4 355.6 448 360 448H408C412.4 448 416 444.4 416 440V392C416 387.6 412.4 384 408 384H360C355.6 384 352 387.6 352 392z"/></svg>';

// SVG for list icon (rows with checkboxes)
const LIST_VIEW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-md" viewBox="0 0 512 512"><path d="M16 72C16 58.75 26.75 48 40 48H88C101.3 48 112 58.75 112 72V120C112 133.3 101.3 144 88 144H40C26.75 144 16 133.3 16 120V72zM80 112V80H48V112H80zM496 80C504.8 80 512 87.16 512 96C512 104.8 504.8 112 496 112H176C167.2 112 160 104.8 160 96C160 87.16 167.2 80 176 80H496zM496 240C504.8 240 512 247.2 512 256C512 264.8 504.8 272 496 272H176C167.2 272 160 264.8 160 256C160 247.2 167.2 240 176 240H496zM496 400C504.8 400 512 407.2 512 416C512 424.8 504.8 432 496 432H176C167.2 432 160 424.8 160 416C160 407.2 167.2 400 176 400H496zM88 208C101.3 208 112 218.7 112 232V280C112 293.3 101.3 304 88 304H40C26.75 304 16 293.3 16 280V232C16 218.7 26.75 208 40 208H88zM48 240V272H80V240H48zM16 392C16 378.7 26.75 368 40 368H88C101.3 368 112 378.7 112 392V440C112 453.3 101.3 464 88 464H40C26.75 464 16 453.3 16 440V392zM80 432V400H48V432H80z"/></svg>';

/**
 * Create the list/grid toggle button for the prompt manager.
 * Persists the setting and refreshes prompts on toggle.
 */
export function promptCardCompactViewButton(): HTMLButtonElement {
  const { selectedPromptView } = cachedSettings;
  const btn = document.createElement('button');
  btn.className =
    'h-10 aspect-1 flex items-center justify-center rounded-lg px-2 ms-2 text-token-text-tertiary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary';
  btn.innerHTML = selectedPromptView === 'list' ? GRID_VIEW_SVG : LIST_VIEW_SVG;

  btn.addEventListener('click', () => {
    const list = document.querySelector('#modal-manager #prompt-manager-prompt-list') as HTMLElement | null;
    if (list) {
      list.className = `grid ${cachedSettings.selectedPromptView !== 'list' ? 'grid-cols-1 gap-2' : 'grid-cols-1 sm:grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4'} w-full content-start`;
    }
    if (cachedSettings.selectedPromptView === 'list') {
      btn.innerHTML = LIST_VIEW_SVG;
    } else {
      btn.innerHTML = GRID_VIEW_SVG;
    }
    chrome.storage.local.set(
      {
        settings: {
          ...cachedSettings,
          selectedPromptView: cachedSettings.selectedPromptView === 'list' ? 'grid' : 'list',
        },
      },
      () => {
        fetchPrompts();
      },
    );
  });

  return btn;
}

// ---------------------------------------------------------------------------
// Prompt card views (list & grid)
// Original: content.isolated.end.js lines 20390-20444
// ---------------------------------------------------------------------------

// SVG icons used in prompt cards
const FOLDER_ICON_SVG =
  '<svg stroke="currentColor" fill="currentColor" class="icon icon-xs me-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M147.8 192H480V144C480 117.5 458.5 96 432 96h-160l-64-64h-160C21.49 32 0 53.49 0 80v328.4l90.54-181.1C101.4 205.6 123.4 192 147.8 192zM543.1 224H147.8C135.7 224 124.6 230.8 119.2 241.7L0 480h447.1c12.12 0 23.2-6.852 28.62-17.69l96-192C583.2 249 567.7 224 543.1 224z"/></svg>';
const CHEVRON_RIGHT_SVG =
  '<svg aria-hidden="true" fill="none" focusable="false" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" style="min-width:16px" viewBox="0 0 24 24" width="1em"><path d="m9 18 6-6-6-6"></path></svg>';
const PUBLIC_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 me-2" height="1em" width="1em"><path d="M319.9 320c57.41 0 103.1-46.56 103.1-104c0-57.44-46.54-104-103.1-104c-57.41 0-103.1 46.56-103.1 104C215.9 273.4 262.5 320 319.9 320zM369.9 352H270.1C191.6 352 128 411.7 128 485.3C128 500.1 140.7 512 156.4 512h327.2C499.3 512 512 500.1 512 485.3C512 411.7 448.4 352 369.9 352zM512 160c44.18 0 80-35.82 80-80S556.2 0 512 0c-44.18 0-80 35.82-80 80S467.8 160 512 160zM183.9 216c0-5.449 .9824-10.63 1.609-15.91C174.6 194.1 162.6 192 149.9 192H88.08C39.44 192 0 233.8 0 285.3C0 295.6 7.887 304 17.62 304h199.5C196.7 280.2 183.9 249.7 183.9 216zM128 160c44.18 0 80-35.82 80-80S172.2 0 128 0C83.82 0 48 35.82 48 80S83.82 160 128 160zM551.9 192h-61.84c-12.8 0-24.88 3.037-35.86 8.24C454.8 205.5 455.8 210.6 455.8 216c0 33.71-12.78 64.21-33.16 88h199.7C632.1 304 640 295.6 640 285.3C640 233.8 600.6 192 551.9 192z"/></svg>';
const STAR_FILLED_SVG =
  '<svg class="icon icon-md" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg>';
const STAR_OUTLINE_SVG =
  '<svg class="icon icon-md" fill="#b4b4b4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M287.9 0C297.1 0 305.5 5.25 309.5 13.52L378.1 154.8L531.4 177.5C540.4 178.8 547.8 185.1 550.7 193.7C553.5 202.4 551.2 211.9 544.8 218.2L433.6 328.4L459.9 483.9C461.4 492.9 457.7 502.1 450.2 507.4C442.8 512.7 432.1 513.4 424.9 509.1L287.9 435.9L150.1 509.1C142.9 513.4 133.1 512.7 125.6 507.4C118.2 502.1 114.5 492.9 115.1 483.9L142.2 328.4L31.11 218.2C24.65 211.9 22.36 202.4 25.2 193.7C28.03 185.1 35.5 178.8 44.49 177.5L197.7 154.8L266.3 13.52C270.4 5.249 278.7 0 287.9 0L287.9 0zM287.9 78.95L235.4 187.2C231.9 194.3 225.1 199.3 217.3 200.5L98.98 217.9L184.9 303C190.4 308.5 192.9 316.4 191.6 324.1L171.4 443.7L276.6 387.5C283.7 383.7 292.2 383.7 299.2 387.5L404.4 443.7L384.2 324.1C382.9 316.4 385.5 308.5 391 303L476.9 217.9L358.6 200.5C350.7 199.3 343.9 194.3 340.5 187.2L287.9 78.95z"/></svg>';
const DOTS_MENU_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg>';

interface PromptCardData {
  id: string;
  title: string;
  steps: string[];
  tags?: Array<{ id: string; name: string }>;
  is_mine?: boolean;
  is_public?: boolean;
  is_favorite?: boolean;
  folder?: { id: string; name: string };
}

/**
 * Render a prompt card in **list** (horizontal row) layout.
 *
 * Original: content.isolated.end.js lines 20390-20418
 */
export function promptListView(prompt: PromptCardData): string {
  if (!prompt) return '';
  const lastFolder = getLastSelectedPromptFolder();
  const searchTerm = (
    document.querySelector('#modal-manager input[id="prompt-manager-search-input"]') as HTMLInputElement | null
  )?.value;

  const checkboxHtml =
    prompt.is_mine || lastFolder?.id === 'recent'
      ? `<input id="prompt-checkbox-${prompt.id}" type="checkbox" data-prompt-id="${prompt.id}" class="manager-modal border border-token-border-medium me-2" style="cursor: pointer; border-radius: 2px;">`
      : '';

  const folderBreadcrumb =
    searchTerm && prompt.folder?.id !== 'recent'
      ? `<div class="flex items-center border border-token-border-medium rounded-md px-1 text-xs font-normal overflow-hidden hover:w-fit-sp w-auto min-w-5 max-w-5">${FOLDER_ICON_SVG}${prompt.folder!.name}</div> ${CHEVRON_RIGHT_SVG}`
      : '';

  const titleClass =
    prompt.folder?.id === 'recent' ? 'text-xs text-token-text-tertiary' : 'text-md text-token-text-primary';

  const favoriteHtml = prompt.is_mine
    ? prompt.folder?.id === 'recent'
      ? ''
      : `<div id="prompt-card-favorite" title="favorite prompt" class="me-2">${prompt.is_favorite ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</div>`
    : '';

  const tagsHtml =
    prompt.tags
      ?.map(
        (t) =>
          `<span id="prompt-card-tag-${t.id}" class="border border-token-border-medium hover:bg-token-main-surface-secondary text-token-text-tertiary text-xs py-1 px-2 rounded-full me-2 capitalize truncate">${t.name}</span>`,
      )
      .join('') ?? '';

  const stepsLabel = prompt.steps.length > 1 ? `(${prompt.steps.length} ${translate('steps')})` : '';

  const contentClass = prompt.folder?.id === 'recent' ? 'text-token-text-primary' : 'text-token-text-tertiary';

  return `<div class="flex items-center justify-between pb-1">
  ${checkboxHtml}
  <div class="${titleClass} truncate flex items-center w-full">${folderBreadcrumb}${escapeHTML(prompt.title)}</div>
  </div>
  <div class="flex-1 self-center ms-3 ${contentClass} text-sm truncate">${escapeHTML(formatAttachmentsForPromptStep(prompt.steps[0] ?? '').substring(0, 250))} <span class="self-center text-xs text-token-text-tertiary">${stepsLabel}</span></div>
  <div class="flex overflow-hidden items-center">${tagsHtml}</div>
  <div class="flex justify-between items-center">
    <div></div>
    <div id="prompt-card-action-right-${prompt.id}" class="flex items-center">
      ${prompt.is_public ? `<svg id="prompt-card-public-icon icon-${prompt.id}" title="public prompt">${PUBLIC_ICON_SVG}</svg>` : ''}
      ${favoriteHtml}
      <div id="prompt-card-settings-menu-${prompt.id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary">${DOTS_MENU_SVG}</div>
    </div>
  </div>`;
}

/**
 * Render a prompt card in **grid** (card tile) layout.
 *
 * Original: content.isolated.end.js lines 20420-20444
 */
export function promptGridView(prompt: PromptCardData): string {
  if (!prompt) return '';
  const lastFolder = getLastSelectedPromptFolder();
  const searchTerm = (
    document.querySelector('#modal-manager input[id="prompt-manager-search-input"]') as HTMLInputElement | null
  )?.value;

  const titleClass =
    prompt.folder?.id === 'recent' ? 'text-xs text-token-text-tertiary' : 'text-md text-token-text-primary';

  const folderBreadcrumb =
    searchTerm && prompt.folder?.id !== 'recent'
      ? `<div class="flex items-center border border-token-border-medium rounded-md px-1 text-xs font-normal overflow-hidden hover:w-fit-sp w-auto min-w-5 max-w-5">${FOLDER_ICON_SVG}${prompt.folder!.name}</div> ${CHEVRON_RIGHT_SVG}`
      : '';

  const favoriteHtml = prompt.is_mine
    ? prompt.folder?.id === 'recent'
      ? ''
      : `<div id="prompt-card-favorite" title="favorite prompt" class="ps-1">${prompt.is_favorite ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</div>`
    : '';

  const contentClass = prompt.folder?.id === 'recent' ? 'text-token-text-primary' : 'text-token-text-tertiary';

  const tagsHtml =
    prompt.tags
      ?.map(
        (t) =>
          `<span id="prompt-card-tag-${t.id}" class="border border-token-border-medium hover:bg-token-main-surface-secondary text-token-text-tertiary text-xs px-2 rounded-full me-1 capitalize truncate">${t.name}</span>`,
      )
      .join('') ?? '';

  const checkboxHtml =
    prompt.is_mine || lastFolder?.id === 'recent'
      ? `<input data-prompt-id="${prompt.id}" id="prompt-checkbox-${prompt.id}" type="checkbox" class="manager-modal border border-token-border-medium me-2" style="cursor: pointer; border-radius: 2px;">`
      : '';

  const stepsLabel = prompt.steps.length > 1 ? `${prompt.steps.length} ${translate('steps')}` : '';

  return `<div class="flex items-center justify-between border-b border-token-border-medium pb-1"><div class="${titleClass} truncate flex items-center w-full">${folderBreadcrumb}${escapeHTML(prompt.title)}</div>
  ${favoriteHtml}
  </div>
  <div class="flex-1 ${contentClass} text-sm truncate">${escapeHTML(formatAttachmentsForPromptStep(prompt.steps[0] ?? '').substring(0, 250))}</div>
  <div class="flex overflow-hidden my-1">${tagsHtml}</div>
  <div class="border-t border-token-border-medium flex justify-between items-center pt-1">
    <div class="flex items-center overflow-hidden">
    ${checkboxHtml}
    <span class="text-xs text-token-text-tertiary whitespace-nowrap">${stepsLabel}</span>
    </div>
    <div id="prompt-card-action-right-${prompt.id}" class="flex items-center">
      ${prompt.is_public ? PUBLIC_ICON_SVG : ''}
      <div id="prompt-card-settings-menu-${prompt.id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary">${DOTS_MENU_SVG}</div>
    </div>
  </div>`;
}
