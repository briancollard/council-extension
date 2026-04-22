/**
 * Search feature — search through conversation history from the sidebar.
 *
 * Provides:
 *   - Search input in sidebar folder drawer
 *   - Query both local cached conversations and backend-api/conversations/search
 *   - Search result rendering with highlighted matches
 *   - Click to navigate to conversation
 *   - Debounced input handling
 *   - "Load more" / full search fallback
 *   - IntersectionObserver-based pagination for search results
 *
 * Original source: content.isolated.end.js lines 12934-13432, 18066-18158
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  isDarkMode,
  debounce,
  throttle,
  escapeHTML,
  isWindows,
  closeMenus,
  closeModals,
  formatDate,
  formatTime,
  getConversationIdFromUrl,
  conversationHasAttachments,
} from '../../utils/shared';
import { loadingSpinner, toast, addTooltip, isDescendant } from '../isolated-world/ui/primitives';
import { getConversationById, getConversations, getGizmoById } from '../isolated-world/api';
import { translate } from './i18n';
import {
  addConversationElementEventListeners,
  conversationIndicators,
  createConversationElement,
  generateConvFolderBreadcrumb,
  getLastSelectedConversationFolder,
  getOriginalHistory,
  isDefaultConvFolder,
  loadSidebarFolders,
  matchConversationNames,
  noConversationElement,
  resetConversationManagerSelection,
  resetSidebarConversationSelection,
  selectedConversationFolderBreadcrumb,
  setSelectedConversationFolderBreadcrumb,
  sidebarFolderIsOpen,
  sidebarSelectedConversationIds,
  syncHistoryResponseToConversationDB,
  toggleFavoriteIndicator,
  toggleNewConversationInFolderButton,
} from './folders';
import { cachedSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  conversationId: string;
  title: string;
  snippet: string;
  matchedAt: 'title' | 'content';
  timestamp: number;
}

interface SidebarConversation {
  conversation_id: string;
  id?: string;
  title: string;
  update_time?: number;
  create_time?: number;
  is_favorite?: boolean;
  has_note?: boolean;
  is_archived?: boolean;
  folder?: { id: string | number; name?: string; color?: string };
  gizmo_id?: string;
  default_model_slug?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let lastSearchTerm = '';

// ---------------------------------------------------------------------------
// Throttled sidebar conversation fetch
// ---------------------------------------------------------------------------

/**
 * Throttled wrapper around `fetchSidebarConversations`.
 *
 * Original: `throttleFetchSidebarConversations` (line 12934)
 */
export const throttleFetchSidebarConversations = throttle(
  async (pageNumber = 1, fullSearch = false, forceRefresh = false) => {
    await fetchSidebarConversations(pageNumber, fullSearch, forceRefresh);
  },
  1000,
);

// ---------------------------------------------------------------------------
// Sidebar conversation fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch conversations for the sidebar folder drawer, combining local DB
 * and remote API results. Supports pagination via IntersectionObserver.
 *
 * Original: `fetchSidebarConversations` (line 12937)
 */
export async function fetchSidebarConversations(
  pageNumber = 1,
  fullSearch = false,
  forceRefresh = false,
): Promise<void> {
  const searchTerm = (document.querySelector('#sidebar-folder-search-input') as HTMLInputElement | null)?.value ?? '';
  const folder = getLastSelectedConversationFolder();
  const newChatBtnWrapper = document.querySelector('#new-conversation-in-folder-button-wrapper');

  if (!folder && !searchTerm) return;

  const container = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
  if (!container) return;

  // Clear and show spinner on first page
  if (pageNumber === 1) {
    document.querySelectorAll('#sidebar-folder-drawer #load-more-conversations-button')?.forEach((el) => el.remove());
    container.querySelector('button[id^="full-search-button"]')?.remove();
    container.querySelector('p[id^="no-conversations-found"]')?.remove();
    container.querySelector('p[id^="no-conversation-folder"]')?.remove();
    container.querySelectorAll('div[id^="conversation-card-"]')?.forEach((el) => el.remove());
    container.appendChild(loadingSpinner('sidebar-folder-content'));
  }

  // Hide "new conversation" button when searching
  if (searchTerm) {
    newChatBtnWrapper?.classList.replace('flex', 'hidden');
  }

  let results: SidebarConversation[] = [];
  let hasMore = false;
  const favoriteIds: string[] = [];
  const noteIds: string[] = [];

  if (searchTerm === '' && folder?.id === 'archived') {
    // Direct API fetch for archived conversations
    const pageSize = 100;
    const offset = (pageNumber - 1) * pageSize;
    const isArchived = folder?.id === 'archived';

    try {
      const response = await getConversations(offset, pageSize, 'updated', isArchived, forceRefresh);
      results = syncHistoryResponseToConversationDB(response, isArchived);
      hasMore = response.total > offset + pageSize;
    } catch {
      const loadMoreBtn = document.querySelector(
        '#sidebar-folder-drawer #load-more-conversations-button',
      ) as HTMLElement | null;
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<div class="w-full h-full flex items-center justify-center">Load more...</div>';
        loadMoreBtn.onclick = () => fetchSidebarConversations(pageNumber + 1, fullSearch, forceRefresh);
        return;
      }
    }
  } else {
    // Fetch via background worker (local DB + optional full search)
    document.querySelectorAll('#sidebar-folder-drawer #load-more-conversations-button')?.forEach((el) => el.remove());

    const { selectedConversationsManagerSortBy: sortByObj, excludeConvInFolders: excludeConvInFolders } =
      cachedSettings;
    const sortBy = sortByObj?.code;

    const response = await chrome.runtime.sendMessage({
      type: 'getConversations',
      forceRefresh,
      detail: {
        pageNumber,
        searchTerm,
        sortBy: searchTerm || ['all', 'archived'].includes(folder?.id as string) ? 'updated_at' : sortBy,
        fullSearch,
        folderId: searchTerm || typeof folder?.id === 'string' ? null : folder?.id,
        isArchived: folder?.id === 'archived' ? true : null,
        isFavorite: folder?.id === 'favorites' ? true : null,
        excludeConvInFolders: folder?.id === 'all' && excludeConvInFolders,
      },
    });

    results = response.results;
    hasMore = response.next;
  }

  // Remove spinner
  const spinner = document.querySelector('#sidebar-folder-drawer #loading-spinner-sidebar-folder-content');
  if (spinner) spinner.remove();

  // Render results
  if (results?.length === 0 && pageNumber === 1) {
    if (searchTerm && !fullSearch) {
      const fullSearchBtn = createFullSearchButton(true);
      container.appendChild(fullSearchBtn);
      fullSearchBtn.click();
    } else {
      container.appendChild(noConversationElement());
    }
  } else if (results?.forEach) {
    results.forEach((conv) => {
      const enriched: SidebarConversation = {
        ...conv,
        is_favorite: favoriteIds.includes(conv.conversation_id) || conv.is_favorite,
        has_note: noteIds.includes(conv.conversation_id) || conv.has_note,
      };
      const el = createConversationElement(enriched);
      container.appendChild(el);
      addConversationElementEventListeners(el, enriched);
    });

    matchConversationNames();

    if (hasMore) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.id = 'load-more-conversations-button';
      loadMoreBtn.classList.value =
        'flex items-center justify-between text-token-text-primary text-sm relative rounded-lg px-2 py-1 cursor-pointer w-full h-10';
      loadMoreBtn.appendChild(loadingSpinner('load-more-conversations-button'));
      container.appendChild(loadMoreBtn);

      loadMoreBtn.onclick = () => {
        fetchSidebarConversations(pageNumber + 1, fullSearch, forceRefresh);
      };

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              fetchSidebarConversations(pageNumber + 1, fullSearch, forceRefresh);
              observer.disconnect();
            }
          });
        },
        { threshold: 0.5 },
      );

      if (loadMoreBtn) observer.observe(loadMoreBtn);
    } else if (searchTerm && !fullSearch) {
      const fullSearchBtn = createFullSearchButton(true);
      container.appendChild(fullSearchBtn);
    }
  }
}

// ---------------------------------------------------------------------------
// Full search fallback button
// ---------------------------------------------------------------------------

/**
 * Create a "Click to load more" button that triggers a full (server-side) search.
 *
 * Original: `createFullSearchButton` (line 18151)
 */
export function createFullSearchButton(isSidebar = false): HTMLElement {
  const btn = document.createElement('button');
  btn.id = 'full-search-button';
  btn.classList.value = `flex items-center justify-center text-2xl bg-token-main-surface-secondary p-4 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${
    isSidebar ? 'mt-2' : ''
  } ${isSidebar || cachedSettings.selectedConversationView === 'list' ? 'w-full h-14' : 'h-auto aspect-1.5'} relative`;
  btn.innerHTML = `<div class="flex items-center justify-center"><div class="w-full text-sm">Click to load more</div></div>`;

  btn.addEventListener('click', (ev: MouseEvent) => {
    if (isSidebar) {
      throttleFetchSidebarConversations(1, true, ev.shiftKey);
    } else {
      fetchConversations(1, true, ev.shiftKey);
    }
  });

  return btn;
}

// ---------------------------------------------------------------------------
// Modal conversation fetcher (for conversation manager modal)
// ---------------------------------------------------------------------------

/**
 * Fetch conversations for the full-screen conversation manager modal.
 * Supports pagination, search, and IntersectionObserver-based loading.
 *
 * Original: `fetchConversations` (line 18066)
 */
export async function fetchConversations(pageNumber = 1, fullSearch = false, forceRefresh = false): Promise<void> {
  const folder = getLastSelectedConversationFolder();
  if (!folder) return;

  const listContainer = document.querySelector(
    '#modal-manager #conversation-manager-conversation-list',
  ) as HTMLElement | null;
  if (!listContainer) return;

  if (pageNumber === 1) {
    listContainer.innerHTML = '';
    listContainer.appendChild(loadingSpinner('conversation-manager-main-content'));
  }

  let results: any[] = [];
  let hasMore = false;
  let favoriteIds: string[] = [];
  let noteIds: string[] = [];

  const searchValue =
    (document.querySelector('#modal-manager input[id=conversation-manager-search-input]') as HTMLInputElement | null)
      ?.value ?? '';

  if (searchValue === '' && folder?.id === 'archived') {
    if (pageNumber === 1) {
      favoriteIds = await chrome.runtime.sendMessage({ type: 'getAllFavoriteConversationIds' });
      noteIds = await chrome.runtime.sendMessage({ type: 'getAllNoteConversationIds' });
    }

    const pageSize = 100;
    const offset = (pageNumber - 1) * pageSize;
    const isArchived = folder?.id === 'archived';

    try {
      const response = await getConversations(offset, pageSize, 'updated', isArchived, forceRefresh);
      results = syncHistoryResponseToConversationDB(response, isArchived);
      hasMore = response.total > offset + pageSize;
    } catch {
      const loadMoreBtn = document.querySelector(
        '#modal-manager #load-more-conversations-button',
      ) as HTMLElement | null;
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<div class="w-full h-full flex items-center justify-center">Load more...</div>';
        loadMoreBtn.onclick = () => fetchConversations(pageNumber + 1, fullSearch, forceRefresh);
        return;
      }
    }
  } else {
    document.querySelectorAll('#modal-manager #load-more-conversations-button')?.forEach((el) => el.remove());

    const { selectedConversationsManagerSortBy: sortByObj, excludeConvInFolders: excludeConvInFolders } =
      cachedSettings;
    const sortBy = sortByObj?.code;

    const response = await chrome.runtime.sendMessage({
      type: 'getConversations',
      forceRefresh,
      detail: {
        pageNumber,
        searchTerm: searchValue,
        sortBy: ['all', 'archived'].includes(folder?.id as string) ? 'updated_at' : sortBy,
        fullSearch,
        folderId: searchValue || typeof folder?.id === 'string' ? null : folder?.id,
        isArchived: folder?.id === 'archived' ? true : null,
        isFavorite: folder?.id === 'favorites' ? true : null,
        excludeConvInFolders: folder?.id === 'all' && excludeConvInFolders,
      },
    });

    results = response.results;
    hasMore = response.next;
  }

  // Remove spinner
  const spinner = document.querySelector('#modal-manager #loading-spinner-conversation-manager-main-content');
  if (spinner) spinner.remove();

  if (results?.length === 0 && pageNumber === 1) {
    if (searchValue && !fullSearch) {
      const fullSearchBtn = createFullSearchButton();
      listContainer.appendChild(fullSearchBtn);
      fullSearchBtn.click();
    } else {
      listContainer.appendChild(noConversationElement());
    }
  } else if (results?.forEach) {
    results.forEach((conv: any) => {
      const enriched = {
        ...conv,
        is_favorite: favoriteIds.includes(conv.conversation_id) || conv.is_favorite,
        has_note: noteIds.includes(conv.conversation_id) || conv.has_note,
      };
      const cardEl = createConversationCard(enriched);
      listContainer.appendChild(cardEl);
      addConversationCardEventListeners(cardEl, enriched);
    });

    if (hasMore) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.id = 'load-more-conversations-button';
      loadMoreBtn.classList.value = `bg-token-main-surface-secondary p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${
        cachedSettings.selectedConversationView === 'list' ? 'h-14' : 'h-auto aspect-1.5'
      } flex flex-col relative`;
      loadMoreBtn.appendChild(loadingSpinner('load-more-conversations-button'));
      listContainer.appendChild(loadMoreBtn);

      loadMoreBtn.onclick = () => fetchConversations(pageNumber + 1, fullSearch, forceRefresh);

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              fetchConversations(pageNumber + 1, fullSearch, forceRefresh);
              observer.disconnect();
            }
          });
        },
        { threshold: 0.5 },
      );

      if (loadMoreBtn) observer.observe(loadMoreBtn);
    } else if (searchValue && !fullSearch) {
      const fullSearchBtn = createFullSearchButton();
      listContainer.appendChild(fullSearchBtn);
    }
  }
}

// ---------------------------------------------------------------------------
// Sidebar search input initialization
// ---------------------------------------------------------------------------

/**
 * Clear the sidebar search input and hint.
 *
 * Original: `clearSidebarSearchInput` (line 13427)
 */
export function clearSidebarSearchInput(): void {
  const input = document.querySelector('#sidebar-folder-search-input') as HTMLInputElement | null;
  if (input) input.value = '';

  const hint = document.querySelector('#sidebar-folder-search-hint') as HTMLElement | null;
  if (hint) {
    hint.classList.add('hidden');
    hint.textContent = '';
  }
}

/**
 * Create the sidebar search input element with debounced search and hint display.
 *
 * Original: lines 13306-13322
 */
export function createSidebarSearchInput(): { inputWrapper: HTMLElement; hintEl: HTMLElement } {
  const inputWrapper = document.createElement('div');
  inputWrapper.classList.value = 'flex-grow w-full';

  const input = document.createElement('input');
  input.id = 'sidebar-folder-search-input';
  input.type = 'search';
  input.placeholder = translate('Search conversations');
  input.classList.value =
    'w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary';

  const debouncedSearch = debounce(() => {
    const content = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
    if (content) content.innerHTML = '';
    loadSidebarFolders();

    const breadcrumb = document.querySelector('#sidebar-folder-breadcrumb') as HTMLElement | null;
    if (breadcrumb) {
      setSelectedConversationFolderBreadcrumb([]);
      chrome.storage.local.set({ selectedConversationFolderBreadcrumb });
      generateConvFolderBreadcrumb(breadcrumb, true);
    }

    fetchSidebarConversations();
  }, 300);

  input.addEventListener('input', (ev: Event) => {
    const target = ev.target as HTMLInputElement;
    if (target.value.trim().length > 2) {
      debouncedSearch();
    } else if (target.value.length === 0) {
      loadSidebarFolders();
    }
  });

  inputWrapper.appendChild(input);

  // Search hint element
  const hintEl = document.createElement('div');
  hintEl.id = 'sidebar-folder-search-hint';
  hintEl.classList.value = `flex w-full items-center text-token-text-tertiary text-xs mt-1 ${input.value.length === 0 ? 'hidden' : ''}`;

  const SEARCH_ICON =
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-sm me-2"><path d="M14.086 8.75a5.335 5.335 0 1 0-10.67 0 5.335 5.335 0 0 0 10.67 0m1.33 0a6.64 6.64 0 0 1-1.512 4.225l.066.055 3 3 .086.104a.666.666 0 0 1-.922.922l-.104-.085-3-3-.055-.068a6.665 6.665 0 1 1 2.44-5.153"/></svg>';

  input.addEventListener('input', (ev: Event) => {
    const target = ev.target as HTMLInputElement;
    if (target.value.trim().length > 0) {
      hintEl.classList.remove('hidden');
      hintEl.innerHTML = `${SEARCH_ICON} <span class="text-danger truncate">${target.value.trim()}</span>`;
    } else {
      hintEl.classList.add('hidden');
      hintEl.textContent = '';
    }
  });

  inputWrapper.appendChild(hintEl);

  return { inputWrapper, hintEl };
}

// ---------------------------------------------------------------------------
// Conversation card (for manager modal)
// ---------------------------------------------------------------------------

import { showConversationPreviewWrapper, showConversationManagerCardMenu } from './folders';

let lastSelectedConversationCardId: string | null = null;
let lastSelectedConversationCheckboxId: string | null = null;

/**
 * Create a conversation card element for the manager modal grid/list view.
 *
 * Original: `createConversationCard` (line 18285)
 */
export function createConversationCard(conv: any): HTMLElement {
  const el = document.createElement('div');
  el.id = `conversation-card-${conv.conversation_id}`;
  el.draggable = true;
  el.dataset.conversationId = conv.conversation_id;
  el.classList.value = `relative flex bg-token-main-surface-primary border border-token-border-medium rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${
    cachedSettings.selectedConversationView === 'list'
      ? 'w-full p-2 flex-row h-10'
      : 'aspect-1.5 p-4 pb-2 flex-col h-auto'
  }`;

  if (conv.folder) {
    el.dataset.folderId = String(conv.folder.id);
  }
  el.style.cssText = 'height: max-content;outline-offset: 4px; outline: none;';

  el.innerHTML =
    cachedSettings.selectedConversationView === 'list' ? conversationListView(conv) : conversationGridView(conv);

  el.addEventListener('click', (ev: MouseEvent) => {
    ev.stopPropagation();
    closeMenus();
    if (ev.metaKey || (isWindows() && ev.ctrlKey)) {
      window.open(`/c/${conv.conversation_id}`, '_blank');
    } else {
      updateSelectedConvCard(conv.conversation_id);
      showConversationPreviewWrapper(conv.conversation_id);
    }
  });

  el.addEventListener('mouseenter', () => closeMenus());

  el.addEventListener('dragstart', (ev: DragEvent) => {
    ev.stopPropagation();
    ev.dataTransfer?.setData(
      'text/plain',
      JSON.stringify({
        draggingObject: 'conversation',
        conversation: conv,
      }),
    );
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    el.classList.add('card-dragging');
  });

  el.addEventListener('dragend', (ev: DragEvent) => {
    ev.stopPropagation();
    ev.dataTransfer?.clearData();
    try {
      el.classList.remove('card-dragging');
    } catch (err) {
      console.error('Error removing card-dragging class:', err);
    }
  });

  return el;
}

// ---------------------------------------------------------------------------
// Card view renderers
// ---------------------------------------------------------------------------

function conversationListView(conv: any): string {
  if (!conv) return '';
  return `<div class="flex items-center">
    <input id="conversation-checkbox-${conv.conversation_id}" data-conversation-id="${conv.conversation_id}" type="checkbox" class="manager-modal border border-token-border-medium me-2" style="cursor: pointer; border-radius: 2px;">
  </div>
  <div class="flex flex-1 items-center pe-2">
    <div id="conversation-title" class="flex items-center text-sm truncate">${escapeHTML(conv.title || 'New chat')}</div>
    <div class="flex items-center justify-between">
      <div class="truncate text-xs text-token-text-tertiary flex items-center w-full">
        <div id="conversation-card-folder-tag-${conv.conversation_id}" class="flex items-center py-1 px-2 ms-2 rounded-md text-white ${conv?.folder?.name ? '' : 'hidden'}" style="background-color: ${conv?.folder?.name ? conv?.folder?.color : 'transparent'};">
          <div class="flex items-center rounded-md px-1 text-xs font-normal overflow-hidden">
            <svg stroke="currentColor" fill="currentColor" class="icon icon-xs me-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M147.8 192H480V144C480 117.5 458.5 96 432 96h-160l-64-64h-160C21.49 32 0 53.49 0 80v328.4l90.54-181.1C101.4 205.6 123.4 192 147.8 192zM543.1 224H147.8C135.7 224 124.6 230.8 119.2 241.7L0 480h447.1c12.12 0 23.2-6.852 28.62-17.69l96-192C583.2 249 567.7 224 543.1 224z"/></svg>
            <span id="conversation-card-folder-name-${conv.conversation_id}">${conv?.folder?.name ?? ''}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="flex justify-between items-center pt-1">
    <span class="text-xs text-token-text-tertiary me-2">${formatDate(new Date(formatTime(conv.update_time)))}</span>
    ${conv.is_archived ? '<span title="Archived"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md me-2 text-token-text-tertiary"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.62188 3.07918C3.87597 2.571 4.39537 2.25 4.96353 2.25H13.0365C13.6046 2.25 14.124 2.571 14.3781 3.07918L15.75 5.82295V13.5C15.75 14.7426 14.7426 15.75 13.5 15.75H4.5C3.25736 15.75 2.25 14.7426 2.25 13.5V5.82295L3.62188 3.07918ZM13.0365 3.75H4.96353L4.21353 5.25H13.7865L13.0365 3.75ZM14.25 6.75H3.75V13.5C3.75 13.9142 4.08579 14.25 4.5 14.25H13.5C13.9142 14.25 14.25 13.9142 14.25 13.5V6.75ZM6.75 9C6.75 8.58579 7.08579 8.25 7.5 8.25H10.5C10.9142 8.25 11.25 8.58579 11.25 9C11.25 9.41421 10.9142 9.75 10.5 9.75H7.5C7.08579 9.75 6.75 9.41421 6.75 9Z" fill="currentColor"></path></svg></span>' : ''}
    ${conversationIndicators(conv)}
    <div id="conversation-card-favorite" title="favorite conversation" class="me-1">
      ${conv.is_favorite ? favStarFilled() : favStarOutline()}
    </div>
    <div id="conversation-card-action-right-${conv.conversation_id}" class="flex items-center">
      <div id="conversation-card-settings-button-${conv.conversation_id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg></div>
    </div>
  </div>`;
}

function conversationGridView(conv: any): string {
  if (!conv) return '';
  const folder = getLastSelectedConversationFolder();
  return `<div class="flex items-center justify-between border-b border-token-border-medium pb-1"><div class="truncate text-xs text-token-text-tertiary flex items-center w-full"><div id="conversation-card-folder-wrapper-${conv.conversation_id}" class="flex items-center ${conv?.folder?.name && typeof folder?.id !== 'number' ? '' : 'hidden'}"><div class="flex items-center border border-token-border-medium rounded-md px-1 text-xs font-normal overflow-hidden hover:w-fit-sp w-auto min-w-5 max-w-5"><svg stroke="currentColor" fill="currentColor" class="icon icon-xs me-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M147.8 192H480V144C480 117.5 458.5 96 432 96h-160l-64-64h-160C21.49 32 0 53.49 0 80v328.4l90.54-181.1C101.4 205.6 123.4 192 147.8 192zM543.1 224H147.8C135.7 224 124.6 230.8 119.2 241.7L0 480h447.1c12.12 0 23.2-6.852 28.62-17.69l96-192C583.2 249 567.7 224 543.1 224z"/></svg><span id="conversation-card-folder-name-${conv.conversation_id}">${conv?.folder?.name ?? ''}</span></div> <svg aria-hidden="true" fill="none" focusable="false" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" style="min-width:16px" viewBox="0 0 24 24" width="1em"><path d="m9 18 6-6-6-6"></path></svg></div>${formatDate(new Date(formatTime(conv.update_time)))}</div>
  <div id="conversation-card-favorite" title="favorite conversation" class="ps-1">
    ${conv.is_favorite ? favStarFilled() : favStarOutline()}
  </div>
  </div>
  <div id="conversation-title" class="flex-1 text-sm truncate">${escapeHTML(conv.title || 'New chat')}</div>
  <div class="border-t border-token-border-medium flex justify-between items-center pt-1">
    <div class="flex items-center">
      <input id="conversation-checkbox-${conv.conversation_id}" data-conversation-id="${conv.conversation_id}" type="checkbox" class="manager-modal border border-token-border-medium me-2" style="cursor: pointer; border-radius: 2px;">
      ${conversationIndicators(conv)}
    </div>
    <div id="conversation-card-action-right-${conv.conversation_id}" class="flex items-center">
      ${conv.is_archived ? '<span title="Archived"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md me-2 text-token-text-tertiary"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.62188 3.07918C3.87597 2.571 4.39537 2.25 4.96353 2.25H13.0365C13.6046 2.25 14.124 2.571 14.3781 3.07918L15.75 5.82295V13.5C15.75 14.7426 14.7426 15.75 13.5 15.75H4.5C3.25736 15.75 2.25 14.7426 2.25 13.5V5.82295L3.62188 3.07918ZM13.0365 3.75H4.96353L4.21353 5.25H13.7865L13.0365 3.75ZM14.25 6.75H3.75V13.5C3.75 13.9142 4.08579 14.25 4.5 14.25H13.5C13.9142 14.25 14.25 13.9142 14.25 13.5V6.75ZM6.75 9C6.75 8.58579 7.08579 8.25 7.5 8.25H10.5C10.9142 8.25 11.25 8.58579 11.25 9C11.25 9.41421 10.9142 9.75 10.5 9.75H7.5C7.08579 9.75 6.75 9.41421 6.75 9Z" fill="currentColor"></path></svg></span>' : ''}
      <div id="conversation-card-settings-button-${conv.conversation_id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg></div>
    </div>
    <div id="conversation-card-folder-color-indicator-${conv.conversation_id}" title="${conv?.folder?.name || ''}" data-folder-id="${conv?.folder?.id ?? ''}" class="absolute w-full h-2 bottom-0 start-0 rounded-b-md" style="background-color: ${conv?.folder?.name ? conv?.folder?.color : 'transparent'};"></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Selected card tracking
// ---------------------------------------------------------------------------

/**
 * Update the visual selection state for conversation cards.
 *
 * Original: `updateSelectedConvCard` (line 18306)
 */
export function updateSelectedConvCard(convId: string | null, noOutline = false): void {
  document.querySelectorAll('div[id^="conversation-card-"][data-conversation-id]').forEach((el) => {
    (el as HTMLElement).style.outline = 'none';
    el.classList.remove('bg-token-sidebar-surface-tertiary');
  });

  if (!convId) return;

  const cards = document.querySelectorAll(`#conversation-card-${convId}`);
  lastSelectedConversationCardId = convId;
  cards.forEach((el) => {
    if (!noOutline) {
      (el as HTMLElement).style.outline = `2px solid ${isDarkMode() ? '#fff' : '#000'}`;
    }
    el.classList.add('bg-token-sidebar-surface-tertiary');
  });
}

// ---------------------------------------------------------------------------
// Card event listeners (manager modal)
// ---------------------------------------------------------------------------

/**
 * Attach event listeners (context menu, checkbox, favorite, settings) to a
 * conversation card in the manager modal.
 *
 * Original: `addConversationCardEventListeners` (line 18333)
 */
export function addConversationCardEventListeners(cardEl: HTMLElement, conv: any, inSidebar = false): void {
  // Context menu
  cardEl.addEventListener('contextmenu', (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    cardEl
      .querySelector(`#conversation-card-settings-button-${conv.conversation_id}`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  // Checkbox
  const checkbox = cardEl.querySelector(
    `#modal-manager #conversation-checkbox-${conv.conversation_id}`,
  ) as HTMLInputElement | null;
  checkbox?.addEventListener('click', (ev: MouseEvent) => {
    ev.stopPropagation();
    closeMenus();

    const checkedBoxes = Array.from(
      document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked'),
    );
    if (checkedBoxes.length > 0) {
      if (
        ev.shiftKey &&
        checkedBoxes.filter((c) => c.id !== `conversation-checkbox-${conv.conversation_id}`).length > 0
      ) {
        const currentId = conv.conversation_id;
        const allCards = document.querySelectorAll('#modal-manager div[id^="conversation-card-"]');
        let inRange = false;
        let endReached = false;

        allCards.forEach((card) => {
          const cardId = card.id.split('conversation-card-')[1];
          if ((cardId === lastSelectedConversationCheckboxId || cardId === currentId) && !endReached) {
            if (inRange) endReached = true;
            else inRange = true;
          }
          if (inRange && !endReached) {
            const cb = document.querySelector(
              `#modal-manager #conversation-checkbox-${cardId}`,
            ) as HTMLInputElement | null;
            if (cb) cb.checked = true;
          }
        });
      }

      lastSelectedConversationCheckboxId = conv.conversation_id;

      const countEl = document.querySelector('#modal-manager span[id="conversation-manager-selection-count"]');
      const allChecked = Array.from(
        document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked'),
      );
      if (countEl) countEl.textContent = `${allChecked.length} selected`;
      document.querySelector('#modal-manager div[id="conversation-manager-selection-bar"]')?.classList.remove('hidden');

      const contentWrapper = document.querySelector(
        '#modal-manager div[id="conversation-manager-content-wrapper"]',
      ) as HTMLElement | null;
      if (contentWrapper) contentWrapper.style.paddingBottom = 'calc(59px + 56px)';
    } else {
      resetConversationManagerSelection();
    }
  });

  // Favorite toggle
  const favBtn = cardEl.querySelector('#modal-manager #conversation-card-favorite');
  favBtn?.addEventListener('click', async (ev: Event) => {
    ev.stopPropagation();
    const currentFolder = getLastSelectedConversationFolder();

    if (currentFolder?.id === 'favorites') {
      document.querySelectorAll(`#conversation-card-${conv.conversation_id}`).forEach((el) => el.remove());
    }

    const fullConv = await getConversationById(conv.conversation_id);
    const updated = await chrome.runtime.sendMessage({
      type: 'toggleConversationFavorite',
      forceRefresh: true,
      detail: { conversation: fullConv },
    });

    if (currentFolder?.id !== 'favorites') {
      (favBtn as HTMLElement).innerHTML = updated.is_favorite ? favStarFilled() : favStarOutline();
      toggleFavoriteIndicator(conv.conversation_id, updated.is_favorite);
    }
  });

  // Project indicator click
  const projectIndicator = cardEl.querySelector(`#conversation-project-indicator-${conv.conversation_id}`);
  projectIndicator?.addEventListener('click', async (ev: Event) => {
    ev.stopPropagation();
    closeMenus();
    const mouseEv = ev as MouseEvent;
    if (mouseEv.metaKey || (isWindows() && mouseEv.ctrlKey)) {
      window.open(`/g/${conv.gizmo_id}/project`, '_blank');
      return;
    }
    closeModals();
    window.history.pushState({}, '', `/g/${conv.gizmo_id}/project`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });

  // Settings button
  const settingsBtn = cardEl.querySelector(`#conversation-card-settings-button-${conv.conversation_id}`);
  settingsBtn?.addEventListener('click', async (ev: Event) => {
    ev.stopPropagation();
    closeMenus();
    (settingsBtn as HTMLElement).classList.replace('hidden', 'flex');
    showConversationManagerCardMenu(settingsBtn as HTMLElement, conv, inSidebar, true);
  });
}

// ---------------------------------------------------------------------------
// Favorite star SVG helpers
// ---------------------------------------------------------------------------

function favStarFilled(): string {
  return '<svg class="icon icon-md" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg>';
}

function favStarOutline(): string {
  return '<svg class="icon icon-md" fill="#b4b4b4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M287.9 0C297.1 0 305.5 5.25 309.5 13.52L378.1 154.8L531.4 177.5C540.4 178.8 547.8 185.1 550.7 193.7C553.5 202.4 551.2 211.9 544.8 218.2L433.6 328.4L459.9 483.9C461.4 492.9 457.7 502.1 450.2 507.4C442.8 512.7 432.1 513.4 424.9 509.1L287.9 435.9L150.1 509.1C142.9 513.4 133.1 512.7 125.6 507.4C118.2 502.1 114.5 492.9 115.1 483.9L142.2 328.4L31.11 218.2C24.65 211.9 22.36 202.4 25.2 193.7C28.03 185.1 35.5 178.8 44.49 177.5L197.7 154.8L266.3 13.52C270.4 5.249 278.7 0 287.9 0L287.9 0zM287.9 78.95L235.4 187.2C231.9 194.3 225.1 199.3 217.3 200.5L98.98 217.9L184.9 303C190.4 308.5 192.9 316.4 191.6 324.1L171.4 443.7L276.6 387.5C283.7 383.7 292.2 383.7 299.2 387.5L404.4 443.7L384.2 324.1C382.9 316.4 385.5 308.5 391 303L476.9 217.9L358.6 200.5C350.7 199.3 343.9 194.3 340.5 187.2L287.9 78.95z"/></svg>';
}

// ---------------------------------------------------------------------------
// Simple search API (public interface for other modules)
// ---------------------------------------------------------------------------

/**
 * Perform a conversation search combining local cache and API results.
 *
 * This is a simplified public API that other features can call. The full
 * sidebar/manager search is handled by `fetchSidebarConversations` and
 * `fetchConversations` above.
 *
 * @param query  The search query string
 * @returns Array of matching conversation results
 */
export async function searchConversations(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const response = await chrome.runtime.sendMessage({
    type: 'getConversations',
    forceRefresh: false,
    detail: {
      pageNumber: 1,
      searchTerm: query,
      sortBy: 'updated_at',
      fullSearch: true,
      folderId: null,
      isArchived: null,
      isFavorite: null,
      excludeConvInFolders: false,
    },
  });

  return (response?.results ?? []).map((conv: any) => ({
    conversationId: conv.conversation_id || conv.id,
    title: conv.title || 'New chat',
    snippet: conv.snippet || '',
    matchedAt: conv.matched_at || 'title',
    timestamp: conv.update_time || conv.create_time || 0,
  }));
}
