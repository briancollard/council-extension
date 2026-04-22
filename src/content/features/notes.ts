/**
 * Notes feature -- attach free-form notes to conversations.
 *
 * Includes:
 *   - Sidebar note input (per-conversation or global)
 *   - Note manager modal with grid/list view
 *   - Note cards with search, sort, rename, download, delete
 *   - Link notes to conversations, reference note as attachment
 *
 * Original source: content.isolated.end.js lines 12323-12900
 */

import type { Note } from '../../types/conversation';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  getConversationIdFromUrl,
  isDarkMode,
  debounce,
  adjustMenuPosition,
  closeMenus,
  formatDate,
  formatTime,
  getCharCount,
  getWordCount,
  errorUpgradeConfirmation,
  createModal,
  flashArticle,
  managerUpgradeButton,
  getPlusButton,
} from '../../utils/shared';
import {
  toast,
  loadingSpinner,
  addTooltip,
  showConfirmDialog,
  dropdown,
  addDropdownEventListener,
  animatePing,
} from '../isolated-world/ui/primitives';
import { translate } from './i18n';
import { getConversationName } from '../isolated-world/ui/markdown';
import { closeSidebarFolder } from './folders';
import { createManager } from './manager';
import { cachedSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Ported helpers
// ---------------------------------------------------------------------------

/**
 * Handle adding text to the sidebar note. Shows a toast and optionally
 * pings the note button if the sidebar note is not open.
 *
 * Original: content.isolated.end.js line 22839
 */
export function handleAddToNoteText(text: string, label = ''): void {
  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    if (!hasSub) {
      errorUpgradeConfirmation({
        title: 'This is a Pro feature',
        message: 'Using the Notes feature requires a Pro subscription. Upgrade to Pro to remove all limits.',
      });
      return;
    }

    toast(`Copied to clipboard${label ? ` ${label}` : ''} and added to notes`, 'success');

    const noteInput = document.querySelector('#sidebar-note-input') as HTMLTextAreaElement | null;
    if (!noteInput) return;

    noteInput.value += `${text}`;
    noteInput.blur();

    if (sidebarNoteIsOpen) return;

    const noteButton = document.querySelector('#sidebar-note-button');
    if (noteButton) {
      noteButton.insertAdjacentElement('beforeend', animatePing('#19c37d'));
    }
  });
}

/**
 * Create a highlight overlay element for a textarea, matching its text
 * content and highlighting search matches.
 *
 * Original: content.isolated.end.js line 6271
 */
export function createHighlightOverlay(textarea: HTMLTextAreaElement, term: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = `${textarea.id}-highlight-overlay`;
  overlay.className = `${textarea.classList} highlight-overlay`;
  overlay.innerText = textarea.value;
  textarea.appendChild(overlay);

  highlightSearch([overlay], term);

  textarea.addEventListener('input', () => {
    const el = document.querySelector(`#${textarea.id}-highlight-overlay`) as HTMLElement | null;
    if (!el) return;
    const input = document.querySelector(`#${textarea.id}`) as HTMLTextAreaElement | null;
    if (input) {
      el.innerHTML = input.value.replace(/\n/g, '<br>');
      if (term) highlightSearch([el], term);
    }
  });

  textarea.addEventListener('scroll', () => {
    const el = document.querySelector(`#${textarea.id}-highlight-overlay`) as HTMLElement | null;
    if (!el) return;
    const input = document.querySelector(`#${textarea.id}`) as HTMLTextAreaElement | null;
    if (input) el.scrollTop = input.scrollTop;
  });

  return overlay;
}

/**
 * Upload text content as a text file attachment to the ChatGPT input.
 *
 * Original: content.isolated.end.js line 7893
 */
export function uploadTextToInput(text: string, filename = 'conversation.txt'): void {
  if (!canAttacheFile(filename)) return;

  const fileInput = document.querySelector('main form input[type="file"]') as HTMLInputElement | null;
  if (!fileInput) return;

  const blob = new Blob([text], { type: 'text/plain' });
  const file = new File([blob], filename.toLowerCase(), { type: 'text/plain' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

export let sidebarNoteIsOpen = false;
export let noteListPageNumber = 1;
export let noteListSearchTerm = '';
let lastSelectedNoteCardId: string | number | null = null;

/** Setters for mutable notes state (needed by external modules). */
export function setNoteListPageNumber(v: number) {
  noteListPageNumber = v;
}
export function setNoteListSearchTerm(v: string) {
  noteListSearchTerm = v;
}

const chatNotePlaceholderText = `Add notes here...\n- Each conversation has its own note\n- Notes are synced across devices`;
const globalNotePlaceholderText = `Add notes here...\n- This is a global note\n- Notes are synced across devices`;

const notesSortByList = [
  { name: 'Last updated', code: 'updated_at' },
  { name: 'Created', code: 'created_at' },
  { name: 'A → Z', code: 'alphabetical' },
  { name: 'Z → A', code: 'alphabetical-reverse' },
];

// ---------------------------------------------------------------------------
// Sidebar note -- load / toggle / create
// ---------------------------------------------------------------------------

export async function loadNote(): Promise<void> {
  const noteState = window.localStorage.getItem('sp/sidebar-note-state') || 'global';
  const noteButton = document.querySelector('#sidebar-note-button');
  noteButton?.querySelector('#ping')?.remove();

  const noteInput = document.querySelector('#sidebar-note-input') as HTMLTextAreaElement | null;
  if (!noteInput) {
    addSidebarNoteInput();
    return;
  }

  const conversationId = getConversationIdFromUrl();
  if (noteState === 'chat' && !conversationId) {
    noteInput.value = '';
    noteInput.disabled = true;
    addStartChatOverlayToNote();
    return;
  }

  hideStartChatOverlayFromNote();
  let loading = true;

  if (sidebarNoteIsOpen) {
    setTimeout(() => {
      if (loading) {
        noteInput.value = '';
        noteInput.disabled = true;
        addNoteLoadingOverlay();
      }
    }, 500);
  }

  const { openai_id } = await chrome.storage.sync.get(['openai_id']);
  chrome.runtime.sendMessage(
    {
      type: 'getNote',
      detail: { conversationId: noteState === 'chat' ? conversationId : openai_id },
    },
    (response) => {
      noteInput.disabled = false;
      loading = false;
      removeNoteLoadingOverlay();
      if (response) {
        const currentConvId = getConversationIdFromUrl();
        if (conversationId === currentConvId) {
          noteInput.value = response.text || '';
        }
        if (noteState === 'chat') {
          toggleNoteIndicator(conversationId!, response.text);
        }
      }
    },
  );
}

function hideStartChatOverlayFromNote(): void {
  document.querySelector('#start-chat-overlay')?.remove();
}

function addStartChatOverlayToNote(): void {
  const wrapper = document.querySelector('#sidebar-note-input-wrapper');
  if (!wrapper || wrapper.querySelector('#start-chat-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'start-chat-overlay';
  overlay.classList.value =
    'w-full absolute top-0 bg-black/50 dark:bg-black/80 rounded-bs-md flex justify-center items-center';
  overlay.style.cssText = 'top: 56px; height: calc(100% - 56px);';
  wrapper.appendChild(overlay);

  const inner = document.createElement('div');
  inner.classList.value =
    'flex flex-wrap p-3 items-center rounded-md bg-token-main-surface-primary text-token-text-primary text-sm';
  inner.innerHTML = 'Start the chat to enable notes';
  overlay.appendChild(inner);
}

function addNoteLoadingOverlay(): void {
  const wrapper = document.querySelector('#sidebar-note-input-wrapper');
  if (!wrapper) return;
  const el = document.createElement('div');
  el.id = 'note-loading-wrapper';
  el.classList.value =
    'w-full absolute top-0 bg-black/50 dark:bg-black/80 rounded-bs-md flex justify-center items-center';
  el.style.cssText = 'top: 56px; height: calc(100% - 56px);';
  el.innerHTML =
    '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-xl"><circle fill="transparent" stroke="#ffffff50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>';
  wrapper.appendChild(el);
}

function removeNoteLoadingOverlay(): void {
  document.querySelector('#note-loading-wrapper')?.remove();
}

export function toggleSidebarNote(): void {
  closeSidebarFolder();
  const wrapper = document.querySelector('#sidebar-note-input-wrapper') as HTMLElement | null;
  if (!wrapper) {
    addSidebarNoteInput();
    setTimeout(() => toggleSidebarNote(), 1000);
    return;
  }

  const mainContainer = document.querySelector('div[class*="@container/main"]') as HTMLElement | null;
  const header = document.querySelector('header[id="page-header"]') as HTMLElement | null;
  if (!mainContainer || !header) return;

  const floatingWrapper = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
  const main = document.querySelector('main') as HTMLElement | null;
  if (!main) return;

  if (sidebarNoteIsOpen) {
    sidebarNoteIsOpen = false;
    wrapper.style.width = '0';
    main.style.width = '100%';
    header.style.width = '100%';
    if (floatingWrapper) floatingWrapper.style.right = '3rem';
  } else {
    sidebarNoteIsOpen = true;
    wrapper.style.width = '30%';
    main.style.width = '70%';
    header.style.width = '70%';
    if (floatingWrapper) {
      floatingWrapper.style.right = `calc(1rem + ${mainContainer.offsetWidth * (30 / 100)}px)`;
    }
  }
}

export function closeSidebarNote(): void {
  const wrapper = document.querySelector('#sidebar-note-input-wrapper') as HTMLElement | null;
  if (wrapper) wrapper.style.width = '0';
  sidebarNoteIsOpen = false;
}

export function addSidebarNoteButton(): void {
  document.querySelector('#sidebar-note-button')?.remove();
  const { showSidebarNoteButton } = cachedSettings;

  const button = document.createElement('button');
  button.id = 'sidebar-note-button';
  button.innerHTML = translate('Notes');
  button.classList.value = `absolute flex items-center justify-center border border-token-border-medium text-token-text-tertiary hover:border-token-border-medium hover:text-token-text-primary text-xs font-sans cursor-pointer rounded-t-md z-10 bg-token-main-surface-primary hover:bg-token-main-surface-secondary opacity-85 hover:opacity-100 ${showSidebarNoteButton ? '' : 'hidden'}`;
  button.style.cssText = 'top: 12rem;right: -1rem;width: 4rem;height: 2rem;flex-wrap:wrap;transform: rotate(-90deg);';
  addTooltip(button, {
    value: () => (sidebarNoteIsOpen ? 'Close Notes' : 'Open Notes'),
    position: 'left',
  });
  button.addEventListener('click', () => {
    toggleSidebarNote();
    button.querySelector('#ping')?.remove();
  });
  document.body.appendChild(button);
}

// ---------------------------------------------------------------------------
// Note manager modal
// ---------------------------------------------------------------------------

export function resetNoteManagerParams(): void {
  noteListPageNumber = 1;
  noteListSearchTerm = '';
  lastSelectedNoteCardId = null;
}

export function noteListModalContent(): HTMLElement {
  resetNoteManagerParams();

  const container = document.createElement('div');
  container.id = 'modal-content-note-list';
  container.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: hidden;height:100%;';

  // Header bar
  const headerBar = document.createElement('div');
  headerBar.style.cssText =
    'display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start; width: 100%; z-index: 100; position: sticky; top: 0;';
  headerBar.classList.value = 'bg-token-main-surface-primary p-2 border-b border-token-border-medium';

  // Search input
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.classList.value =
    'text-token-text-primary bg-token-main-surface-secondary border border-token-border-medium text-sm rounded-md w-full h-full';
  searchInput.placeholder = translate('Search notes');
  searchInput.id = 'note-manager-search-input';
  searchInput.autocomplete = 'off';

  const debouncedSearch = debounce((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    noteListSearchTerm = value;
    noteListPageNumber = 1;
    fetchNotes(noteListPageNumber);
  });

  searchInput.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.value.trim() !== '') {
      debouncedSearch(e);
    } else {
      noteListSearchTerm = '';
      noteListPageNumber = 1;
      fetchNotes(noteListPageNumber);
    }
    const pill = document.querySelector('#note-manager-search-term-pill') as HTMLElement | null;
    const pillText = document.querySelector('#note-manager-search-term-pill-text') as HTMLElement | null;
    if (target.value.trim() !== '') {
      if (pillText) pillText.innerText = target.value.trim();
      pill?.classList.remove('hidden');
    } else {
      if (pillText) pillText.innerText = '';
      pill?.classList.add('hidden');
    }
  });
  headerBar.appendChild(searchInput);

  // Sort dropdown
  const { selectedNotesSortBy, selectedNotesView } = cachedSettings;
  const sortWrapper = document.createElement('div');
  sortWrapper.style.cssText = 'position:relative;width:150px;z-index:1000;margin-left:8px;';
  sortWrapper.innerHTML = dropdown('Notes-SortBy', notesSortByList, selectedNotesSortBy, 'code', 'right');
  headerBar.appendChild(sortWrapper);

  // Grid/list toggle
  const viewToggle = document.createElement('button');
  viewToggle.classList.value =
    'h-full aspect-1 flex items-center justify-center rounded-lg px-2 ms-2 text-token-text-tertiary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-secondary';
  const gridIcon =
    '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM206.4 335.1L152 394.9V56.02C152 42.76 141.3 32 128 32S104 42.76 104 56.02v338.9l-54.37-58.95c-4.719-5.125-11.16-7.719-17.62-7.719c-5.812 0-11.66 2.094-16.28 6.375c-9.75 8.977-10.34 24.18-1.344 33.94l95.1 104.1c9.062 9.82 26.19 9.82 35.25 0l95.1-104.1c9-9.758 8.406-24.96-1.344-33.94C230.5 325.5 215.3 326.2 206.4 335.1z"/></svg>';
  const listIcon =
    '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM145.6 39.37c-9.062-9.82-26.19-9.82-35.25 0L14.38 143.4c-9 9.758-8.406 24.96 1.344 33.94C20.35 181.7 26.19 183.8 32 183.8c6.469 0 12.91-2.594 17.62-7.719L104 117.1v338.9C104 469.2 114.8 480 128 480s24-10.76 24-24.02V117.1l54.37 58.95C215.3 185.8 230.5 186.5 240.3 177.4C250 168.4 250.6 153.2 241.6 143.4L145.6 39.37z"/></svg>';
  viewToggle.innerHTML = selectedNotesView === 'list' ? gridIcon : listIcon;
  viewToggle.addEventListener('click', () => {
    document.querySelectorAll('[id^=note-item-]').forEach((card) => {
      if (cachedSettings.selectedNotesView === 'list') {
        card.classList.remove('aspect-2');
        card.classList.add('aspect-1');
      } else {
        card.classList.remove('aspect-1');
        card.classList.add('aspect-2');
      }
    });
    viewToggle.innerHTML = cachedSettings.selectedNotesView === 'list' ? listIcon : gridIcon;
    chrome.storage.local.set({
      settings: {
        ...cachedSettings,
        selectedNotesView: cachedSettings.selectedNotesView === 'list' ? 'grid' : 'list',
      },
    });
  });
  headerBar.appendChild(viewToggle);
  container.appendChild(headerBar);

  // Search term pill
  const pill = document.createElement('div');
  pill.id = 'note-manager-search-term-pill';
  pill.classList.value =
    'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 mt-2 ms-4 border border-token-border-medium max-w-fit';
  pill.innerHTML =
    '<button id="note-manager-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"> <line x1="18" y1="6" x2="6" y2="18"></line> <line x1="6" y1="6" x2="18" y2="18"></line> </svg></button><span id="note-manager-search-term-pill-text" class="text-sm mx-1 text-danger"></span>';
  pill.querySelector('#note-manager-search-term-pill-clear-button')!.addEventListener('click', () => {
    const input = document.querySelector('#note-manager-search-input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
  });
  container.appendChild(pill);

  const listEl = noteListComponent();
  container.appendChild(listEl);
  return container;
}

export function fetchNotes(page = 1): void {
  const { selectedNotesSortBy } = cachedSettings;
  noteListPageNumber = page;
  chrome.runtime.sendMessage(
    {
      type: 'getNotes',
      detail: {
        page: noteListPageNumber,
        sortBy: selectedNotesSortBy.code,
        searchTerm: noteListSearchTerm,
      },
    },
    (response) => {
      renderNoteCards(response);
      if (page === 1) {
        document.querySelector('#note-list')?.scrollTo(0, 0);
      }
    },
  );
}

export function noteListComponent(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'note-list';
  el.classList.value =
    'w-full grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 overflow-y-auto p-4 pb-32 h-full content-start';

  const spinner = document.createElement('div');
  spinner.style.cssText =
    'position:absolute;display: flex; justify-content: center; align-items: center; height: 340px; width: 100%;';
  spinner.innerHTML =
    '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-xl"><circle fill="transparent" stroke="#ffffff50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>';
  el.appendChild(spinner);
  return el;
}

// ---------------------------------------------------------------------------
// Note cards rendering
// ---------------------------------------------------------------------------

export async function renderNoteCards(data: { results: any[]; next: string | null } | undefined): Promise<void> {
  const list = document.querySelector('#note-list') as HTMLElement | null;
  if (!list) return;

  const loadMoreBtn = list.querySelector('#load-more-notes-button');
  if (loadMoreBtn) loadMoreBtn.remove();

  if (noteListPageNumber === 1) list.innerHTML = '';

  if (!data?.results || data.results.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'position:absolute;display: flex; justify-content: center; align-items: center; height: 340px; width: 100%;';
    empty.textContent = translate('No notes found');
    list.appendChild(empty);
    return;
  }

  const { openai_id } = await chrome.storage.sync.get(['openai_id']);

  data.results.forEach((note) => {
    const card = document.createElement('div');
    card.id = `note-item-${note.id}`;
    card.dataset.conversationId = note.conversation_id;
    card.classList.value = `group flex flex-col w-full ${cachedSettings.selectedNotesView === 'list' ? 'aspect-2' : 'aspect-1'} p-3 pb-2 h-auto cursor-pointer border bg-token-main-surface-primary border-token-border-medium rounded-md overflow-hidden`;
    card.style.cssText = 'height:max-content;outline-offset: 4px; outline: none;';
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenus();
      updateSelectedNoteCard(note.id);
      openNotePreviewModal(note);
    });

    // Header
    const header = document.createElement('div');
    header.classList.value = 'flex justify-between items-center border-b border-token-border-medium pb-1';

    const nameEl = document.createElement('div');
    nameEl.id = `note-name-${note.id}`;
    nameEl.classList.value = 'text-token-text-primary text-md whitespace-nowrap overflow-hidden text-ellipsis';
    nameEl.textContent = note.name;
    nameEl.title = note.name;
    header.appendChild(nameEl);

    if (note.conversation_id === openai_id) {
      const globalIcon = document.createElement('div');
      globalIcon.classList.value = 'ml-2 text-token-accent-text-primary';
      globalIcon.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="icon icon-md" width="20" height="20" fill="#19c37d"><path d="M415.9 344L225 344C227.9 408.5 242.2 467.9 262.5 511.4C273.9 535.9 286.2 553.2 297.6 563.8C308.8 574.3 316.5 576 320.5 576C324.5 576 332.2 574.3 343.4 563.8C354.8 553.2 367.1 535.8 378.5 511.4C398.8 467.9 413.1 408.5 416 344zM224.9 296L415.8 296C413 231.5 398.7 172.1 378.4 128.6C367 104.2 354.7 86.8 343.3 76.2C332.1 65.7 324.4 64 320.4 64C316.4 64 308.7 65.7 297.5 76.2C286.1 86.8 273.8 104.2 262.4 128.6C242.1 172.1 227.8 231.5 224.9 296zM176.9 296C180.4 210.4 202.5 130.9 234.8 78.7C142.7 111.3 74.9 195.2 65.5 296L176.9 296zM65.5 344C74.9 444.8 142.7 528.7 234.8 561.3C202.5 509.1 180.4 429.6 176.9 344L65.5 344zM463.9 344C460.4 429.6 438.3 509.1 406 561.3C498.1 528.6 565.9 444.8 575.3 344L463.9 344zM575.3 296C565.9 195.2 498.1 111.3 406 78.7C438.3 130.9 460.4 210.4 463.9 296L575.3 296z"/></svg>';
      addTooltip(globalIcon, { value: 'Global', position: 'top' });
      header.appendChild(globalIcon);
    }

    // Body
    const body = document.createElement('div');
    body.id = `note-item-body-${note.conversation_id}`;
    body.classList.value =
      'flex flex-1 text-token-text-tertiary text-sm py-1 whitespace-wrap overflow-hidden text-ellipsis break-all border-b border-token-border-medium';
    body.textContent = note.text;
    body.title = note.text;

    // Footer
    const footer = document.createElement('div');
    footer.classList.value = 'flex justify-between items-center pt-2';

    const dateEl = document.createElement('div');
    dateEl.id = `note-date-${note.id}`;
    dateEl.classList.value = 'text-token-text-tertiary text-xs';
    if (cachedSettings.selectedNotesSortBy.code === 'created_at') {
      dateEl.textContent = new Date(note.created_at).toLocaleString();
      dateEl.title = `Created: ${new Date(note.created_at).toLocaleString()}`;
    } else {
      dateEl.textContent = new Date(note.updated_at).toLocaleString();
      dateEl.title = `Last updated: ${new Date(note.updated_at).toLocaleString()}`;
    }
    footer.appendChild(dateEl);

    const settingsBtn = document.createElement('button');
    settingsBtn.id = `note-settings-button-${note.id}`;
    settingsBtn.classList.value =
      'relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary';
    settingsBtn.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg>';
    settingsBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      closeMenus();
      showNoteSettingsMenu(settingsBtn, note, true);
    });
    footer.appendChild(settingsBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    list.appendChild(card);
  });

  // Check subscription for load-more
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  if (!hasSub) {
    list.appendChild(managerUpgradeButton('notes', 'to see all Notes'));
    return;
  }

  if (data.next) {
    const loadMore = document.createElement('button');
    loadMore.id = 'load-more-notes-button';
    loadMore.classList.value = 'w-full h-full flex justify-center items-center';
    loadMore.innerHTML =
      '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-xl"><circle fill="transparent" stroke="#ffffff50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>';
    loadMore.addEventListener('click', () => {
      fetchNotes(noteListPageNumber + 1);
    });
    list.appendChild(loadMore);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadMore.click();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(loadMore);
  }
}

export function updateSelectedNoteCard(id: string | number): void {
  if (lastSelectedNoteCardId) {
    const prev = document.querySelector(`#modal-manager #note-item-${lastSelectedNoteCardId}`) as HTMLElement | null;
    if (prev) prev.style.outline = 'none';
  }
  if (!id) return;
  const card = document.querySelector(`#modal-manager #note-item-${id}`) as HTMLElement | null;
  lastSelectedNoteCardId = id;
  if (card) card.style.outline = `2px solid ${isDarkMode() ? '#fff' : '#000'}`;
}

// ---------------------------------------------------------------------------
// Note preview modal
// ---------------------------------------------------------------------------

export function openNotePreviewModal(note: any): void {
  const content = notePreviewModalContent(note);
  const actions = notePreviewModalActions(note);
  const safeName = note.name.toLowerCase().replaceAll(' ', '-');
  createModal(note.name, '', content, actions, false, 'small');
  document.querySelector(`#modal-close-button-${safeName}`)?.addEventListener('click', () => {
    setTimeout(() => {
      const bodyEl = document.querySelector(`#note-item-body-${note.conversation_id}`);
      if (bodyEl && bodyEl.textContent === '') {
        document.querySelector(`#modal-manager #note-item-${note.id}`)?.remove();
      }
    }, 200);
  });
}

function notePreviewModalContent(note: any): HTMLElement {
  const container = document.createElement('div');
  container.id = 'modal-content-note-preview';
  container.classList.value = 'w-full h-full flex justify-center items-center overflow-hidden';

  const inner = document.createElement('div');
  inner.classList.value = 'w-full rounded-md flex justify-center items-center relative';
  inner.style.height = '100%';
  inner.innerHTML =
    '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-xl"><circle fill="transparent" stroke="#ffffff50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>';

  const textarea = document.createElement('textarea');
  textarea.id = 'note-preview-text';
  textarea.classList.value =
    'w-full h-full bg-token-main-surface-primary border border-token-border-medium text-token-text-primary p-3 rounded-md placeholder:text-gray-500 text-lg resize-none';
  textarea.placeholder = `Add notes here...\n- Each conversation has its own note\n- Notes are synced across devices`;

  chrome.runtime.sendMessage({ type: 'getNote', detail: { conversationId: note.conversation_id } }, (response) => {
    const r = response ?? {};
    inner.innerHTML = '';
    textarea.value = r.text || '';

    const convId = r.conversation_id || note.conversation_id;
    const name = r.name || note.name;

    textarea.addEventListener('blur', () => {
      chrome.runtime.sendMessage(
        {
          type: 'updateNote',
          detail: { conversationId: convId, name, text: textarea.value },
        },
        async (result) => {
          if (result.error && result.error.type === 'limit') {
            errorUpgradeConfirmation(result.error);
            return;
          }
          const bodyEl = document.querySelector(`#note-item-body-${convId}`);
          if (bodyEl) bodyEl.textContent = textarea.value;

          const dateEl = document.querySelector(`#note-date-${response.id}`) as HTMLElement | null;
          if (dateEl && dateEl.title?.includes('updated')) {
            dateEl.textContent = new Date().toLocaleString();
            dateEl.title = `Last updated: ${new Date().toLocaleString()}`;
          }
          toggleNoteIndicator(convId, textarea.value);

          const { openai_id } = await chrome.storage.sync.get(['openai_id']);
          const state = window.localStorage.getItem('sp/sidebar-note-state') || 'global';
          const currentConvId = getConversationIdFromUrl();

          if (state === 'chat' && currentConvId && currentConvId === convId) {
            const sidebarInput = document.querySelector('#sidebar-note-input') as HTMLTextAreaElement | null;
            if (sidebarInput) sidebarInput.value = textarea.value;
          } else if (state === 'global' && openai_id === convId) {
            const sidebarInput = document.querySelector('#sidebar-note-input') as HTMLTextAreaElement | null;
            if (sidebarInput) sidebarInput.value = textarea.value;
          }
        },
      );
    });

    const searchTerm = (
      document.querySelector('#modal-manager input[id$="-manager-search-input"]') as HTMLInputElement | null
    )?.value;
    if (searchTerm) {
      const overlay = createHighlightOverlay(textarea, searchTerm);
      inner.appendChild(overlay);
    }
    inner.appendChild(textarea);
  });

  container.appendChild(inner);
  return container;
}

function notePreviewModalActions(note: any): HTMLElement {
  const actions = document.createElement('div');
  actions.classList.value = 'flex w-full justify-end items-center pt-2';

  const openBtn = document.createElement('button');
  openBtn.classList.value = 'btn composer-submit-btn composer-submit-button-color';
  openBtn.textContent = `${translate('Open Conversation in New Tab')} \u279C`;
  openBtn.addEventListener('click', () => {
    window.open(`https://chatgpt.com/c/${note.conversation_id}`, '_blank');
  });

  actions.appendChild(openBtn);
  return actions;
}

// ---------------------------------------------------------------------------
// Sidebar note input
// ---------------------------------------------------------------------------

export function addSidebarNoteInput(): void {
  const wrapper = document.createElement('div');
  wrapper.id = 'sidebar-note-input-wrapper';
  wrapper.classList.value =
    'absolute end-0 w-0 top-0 overflow-hidden transition transition-width z-10 flex flex-col h-full';

  // Header
  const header = document.createElement('div');
  header.classList.value =
    'w-full bg-token-main-surface-secondary border border-token-border-medium p-3 h-14 rounded-ts-md flex justify-between items-center relative';

  const titleEl = document.createElement('div');
  titleEl.innerHTML = `${translate('Notes')} <a href="https://www.youtube.com/watch?v=JjBuaNtvTv4" target="_blank" rel="noreferrer" title="Learn more"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md ps-0.5 text-token-text-tertiary h-5 w-5"><path fill="currentColor" d="M13 12a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0zM12 9.5A1.25 1.25 0 1 0 12 7a1.25 1.25 0 0 0 0 2.5"></path><path fill="currentColor" fill-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0" clip-rule="evenodd"></path></svg></a>`;
  titleEl.classList.value = 'text-token-text-primary h-14 flex items-center justify-start gap-2';
  header.appendChild(titleEl);

  // Toggle chat/global
  const noteState = window.localStorage.getItem('sp/sidebar-note-state') || 'global';
  const toggleContainer = document.createElement('div');
  toggleContainer.classList.value = 'sp-toggle-container bg-token-main-surface-secondary';

  const slider = document.createElement('div');
  slider.classList.value = 'sp-toggle-slider';
  slider.style.transform = noteState === 'chat' ? 'translateX(0%)' : 'translateX(100%)';
  toggleContainer.appendChild(slider);

  const chatOption = document.createElement('div');
  chatOption.classList.value = `sp-toggle-option ${noteState === 'chat' ? 'active' : ''}`;
  chatOption.dataset.value = 'chat';
  chatOption.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" viewBox="0 0 512 512" fill="currentColor"><path d="M360 144h-208C138.8 144 128 154.8 128 168S138.8 192 152 192h208C373.3 192 384 181.3 384 168S373.3 144 360 144zM264 240h-112C138.8 240 128 250.8 128 264S138.8 288 152 288h112C277.3 288 288 277.3 288 264S277.3 240 264 240zM447.1 0h-384c-35.25 0-64 28.75-64 63.1v287.1c0 35.25 28.75 63.1 64 63.1h96v83.1c0 9.836 11.02 15.55 19.12 9.7l124.9-93.7h144c35.25 0 64-28.75 64-63.1V63.1C511.1 28.75 483.2 0 447.1 0zM464 352c0 8.75-7.25 16-16 16h-160l-80 60v-60H64c-8.75 0-16-7.25-16-16V64c0-8.75 7.25-16 16-16h384c8.75 0 16 7.25 16 16V352z"/></svg>';
  addTooltip(chatOption, { value: translate('Chat Notes'), position: 'bottom' });

  const globalOption = document.createElement('div');
  globalOption.classList.value = `sp-toggle-option ${noteState === 'global' ? 'active' : ''}`;
  globalOption.dataset.value = 'global';
  globalOption.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="icon icon-sm" width="20" height="20" fill="currentColor"><path d="M415.9 344L225 344C227.9 408.5 242.2 467.9 262.5 511.4C273.9 535.9 286.2 553.2 297.6 563.8C308.8 574.3 316.5 576 320.5 576C324.5 576 332.2 574.3 343.4 563.8C354.8 553.2 367.1 535.8 378.5 511.4C398.8 467.9 413.1 408.5 416 344zM224.9 296L415.8 296C413 231.5 398.7 172.1 378.4 128.6C367 104.2 354.7 86.8 343.3 76.2C332.1 65.7 324.4 64 320.4 64C316.4 64 308.7 65.7 297.5 76.2C286.1 86.8 273.8 104.2 262.4 128.6C242.1 172.1 227.8 231.5 224.9 296zM176.9 296C180.4 210.4 202.5 130.9 234.8 78.7C142.7 111.3 74.9 195.2 65.5 296L176.9 296zM65.5 344C74.9 444.8 142.7 528.7 234.8 561.3C202.5 509.1 180.4 429.6 176.9 344L65.5 344zM463.9 344C460.4 429.6 438.3 509.1 406 561.3C498.1 528.6 565.9 444.8 575.3 344L463.9 344zM575.3 296C565.9 195.2 498.1 111.3 406 78.7C438.3 130.9 460.4 210.4 463.9 296L575.3 296z"/></svg>';
  addTooltip(globalOption, { value: translate('Global Notes'), position: 'bottom' });

  toggleContainer.appendChild(chatOption);
  toggleContainer.appendChild(globalOption);
  header.appendChild(toggleContainer);

  toggleContainer.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement)?.closest('div');
    if (!target || !target.classList.contains('sp-toggle-option')) return;

    toggleContainer.querySelectorAll('.sp-toggle-option').forEach((opt) => opt.classList.remove('active'));
    target.classList.add('active');
    slider.style.transform = `translateX(${target.dataset.value === 'chat' ? '0%' : '100%'})`;
    window.localStorage.setItem('sp/sidebar-note-state', target.dataset.value!);

    const noteInput = wrapper.querySelector('#sidebar-note-input') as HTMLTextAreaElement;

    if (target.dataset.value === 'chat') {
      noteInput.placeholder = chatNotePlaceholderText;
      const convId = getConversationIdFromUrl();
      if (convId) {
        chrome.runtime.sendMessage({ type: 'getNote', detail: { conversationId: convId } }, (response) => {
          noteInput.value = (response ?? {}).text || '';
        });
      } else {
        noteInput.value = '';
        addStartChatOverlayToNote();
      }
    } else {
      hideStartChatOverlayFromNote();
      noteInput.placeholder = globalNotePlaceholderText;
      const { openai_id } = await chrome.storage.sync.get(['openai_id']);
      chrome.runtime.sendMessage({ type: 'getNote', detail: { conversationId: openai_id } }, (response) => {
        noteInput.value = (response ?? {}).text || '';
      });
    }
  });

  // See All Notes button
  const seeAllBtn = document.createElement('button');
  seeAllBtn.textContent = translate('See All Notes');
  seeAllBtn.classList.value = 'btn composer-submit-btn composer-submit-button-color';
  seeAllBtn.addEventListener('click', () => createManager('notes'));
  header.appendChild(seeAllBtn);

  wrapper.appendChild(header);

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.id = 'sidebar-note-input';
  textarea.placeholder = noteState === 'chat' ? chatNotePlaceholderText : globalNotePlaceholderText;
  textarea.classList.value =
    'w-full bg-token-main-surface-secondary border border-token-border-medium text-token-text-primary p-3 rounded-bs-md flex-grow placeholder:text-gray-500';
  textarea.style.borderTop = 'none';
  wrapper.appendChild(textarea);

  textarea.addEventListener('blur', async () => {
    const convId = getConversationIdFromUrl();
    const state = window.localStorage.getItem('sp/sidebar-note-state') || 'global';
    const { openai_id } = await chrome.storage.sync.get(['openai_id']);

    if ((state === 'chat' && convId) || (state === 'global' && openai_id)) {
      const name = state === 'chat' ? getConversationName(convId!) : 'Global Note';
      const text = (document.querySelector('#sidebar-note-input') as HTMLTextAreaElement).value;
      chrome.runtime.sendMessage(
        {
          type: 'updateNote',
          detail: {
            conversationId: state === 'chat' ? convId : openai_id,
            name,
            text,
          },
        },
        (result) => {
          if (result.error && result.error.type === 'limit') {
            errorUpgradeConfirmation(result.error);
            return;
          }
          if (state === 'chat') toggleNoteIndicator(convId!, text);
        },
      );
    }
  });

  // Attach to DOM
  const mainContainer = document.querySelector('div[class*="@container/main"]') as HTMLElement | null;
  const pageHeader = document.querySelector('header[id="page-header"]') as HTMLElement | null;
  if (!mainContainer || !pageHeader || mainContainer.querySelector('#sidebar-note-input-wrapper')) return;
  mainContainer.appendChild(wrapper);

  const floatingWrapper = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
  const main = document.querySelector('main') as HTMLElement | null;
  if (main) {
    if (sidebarNoteIsOpen) {
      wrapper.style.width = '30%';
      main.style.width = '70%';
      pageHeader.style.width = '70%';
      if (floatingWrapper) {
        floatingWrapper.style.right = `calc(1rem + ${mainContainer.offsetWidth * (30 / 100)}px)`;
      }
    } else {
      wrapper.style.width = '0';
      main.style.width = '100%';
      pageHeader.style.width = '100%';
      if (floatingWrapper) floatingWrapper.style.right = '3rem';
    }
  }
}

// ---------------------------------------------------------------------------
// Note indicator on sidebar conversation items
// ---------------------------------------------------------------------------

export function toggleNoteIndicator(conversationId: string, text: string | undefined): void {
  const indicators = document.querySelectorAll(`#conversation-note-indicator-${conversationId}`);
  indicators.forEach((indicator) => {
    if (text && text.length > 0) {
      indicator.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
    }
  });
}

export function hideNotesButton(): void {
  const button = document.querySelector('#sidebar-note-button');
  if (button) button.classList.add('hidden');
  if (sidebarNoteIsOpen) toggleSidebarNote();
}

export function createSidebarNotesButton(location = window.location): void {
  const isGpts = location.pathname.includes('/gpts');
  const isAdmin = location.pathname.includes('/admin');
  const { showSidebarNoteButton } = cachedSettings;

  const existing = document.querySelector('#sidebar-note-button');
  if (existing) {
    if (showSidebarNoteButton) existing.classList.remove('hidden');
  } else {
    addSidebarNoteButton();
  }

  if (!document.querySelector('#sidebar-note-input-wrapper')) addSidebarNoteInput();

  if (isGpts || isAdmin) {
    document.querySelector('#sidebar-note-button')?.classList.add('hidden');
    const floating = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
    if (floating) floating.style.right = '3rem';
  } else {
    loadNote();
  }
}

// ---------------------------------------------------------------------------
// Note settings menu
// ---------------------------------------------------------------------------

export async function showNoteSettingsMenu(anchor: HTMLElement, note: any, fromManager = false): Promise<void> {
  const noteId = note.id;
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const { right, top } = anchor.getBoundingClientRect();
  const x = fromManager ? right - 224 : right - 6;
  const y = top + 20;

  const menuHtml = `<div id="note-settings-menu" dir="ltr" style="transform:translate3d(${x}px,${y}px,0);position:fixed;left:0;top:0;min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" class="max-w-xs rounded-2xl text-token-text-primary bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="min-width:200px; outline:0;pointer-events:auto">
  <div role="menuitem" id="rename-note-settings-button-${noteId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="none" class="icon icon-md"><path fill="currentColor" d="M184 160C193.5 160 202.1 165.6 205.9 174.3L269.9 318.3C275.3 330.4 269.9 344.5 257.7 349.9C245.6 355.3 231.5 349.9 226.1 337.7L221.7 328H146.3L141.9 337.7C136.5 349.9 122.4 355.3 110.3 349.9C98.14 344.5 92.69 330.4 98.07 318.3L162.1 174.3C165.9 165.6 174.5 160 184 160H184zM167.6 280H200.4L184 243.1L167.6 280zM304 184C304 170.7 314.7 160 328 160H380C413.1 160 440 186.9 440 220C440 229.2 437.9 237.9 434.2 245.7C447.5 256.7 456 273.4 456 292C456 325.1 429.1 352 396 352H328C314.7 352 304 341.3 304 328V184zM352 208V232H380C386.6 232 392 226.6 392 220C392 213.4 386.6 208 380 208H352zM352 304H396C402.6 304 408 298.6 408 292C408 285.4 402.6 280 396 280H352V304zM0 128C0 92.65 28.65 64 64 64H576C611.3 64 640 92.65 640 128V384C640 419.3 611.3 448 576 448H64C28.65 448 0 419.3 0 384V128zM48 128V384C48 392.8 55.16 400 64 400H576C584.8 400 592 392.8 592 384V128C592 119.2 584.8 112 576 112H64C55.16 112 48 119.2 48 128z"/></svg>${translate('Rename')}</div></div>
  <div role="menuitem" id="edit-note-settings-button-${noteId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor"></path></svg>${translate('Edit')}</div></div>
  <div role="menuitem" id="download-note-settings-button-${noteId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg stroke="currentColor" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.70711 10.2929C7.31658 9.90237 6.68342 9.90237 6.29289 10.2929C5.90237 10.6834 5.90237 11.3166 6.29289 11.7071L11.2929 16.7071C11.6834 17.0976 12.3166 17.0976 12.7071 16.7071L17.7071 11.7071C18.0976 11.3166 18.0976 10.6834 17.7071 10.2929C17.3166 9.90237 16.6834 9.90237 16.2929 10.2929L13 13.5858L13 4C13 3.44771 12.5523 3 12 3C11.4477 3 11 3.44771 11 4L11 13.5858L7.70711 10.2929ZM5 19C4.44772 19 4 19.4477 4 20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20C20 19.4477 19.5523 19 19 19L5 19Z" fill="currentColor"></path></svg>${translate('Download')}</div></div>
  <div role="menuitem" id="attach-note-settings-button-${noteId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.0322 5.02393C17.7488 5.00078 17.3766 5 16.8 5H11.5002C11.3 6 11.0989 6.91141 10.8903 7.85409C10.7588 8.44955 10.6432 8.97304 10.3675 9.41399C10.1262 9.80009 9.80009 10.1262 9.41399 10.3675C8.97304 10.6432 8.44955 10.7588 7.85409 10.8903C7.81276 10.8994 7.77108 10.9086 7.72906 10.9179L5.21693 11.4762C5.1442 11.4924 5.07155 11.5001 5 11.5002V16.8C5 17.3766 5.00078 17.7488 5.02393 18.0322C5.04612 18.3038 5.0838 18.4045 5.109 18.454C5.20487 18.6422 5.35785 18.7951 5.54601 18.891C5.59546 18.9162 5.69617 18.9539 5.96784 18.9761C6.25118 18.9992 6.62345 19 7.2 19H10C10.5523 19 11 19.4477 11 20C11 20.5523 10.5523 21 10 21H7.16144C6.6343 21 6.17954 21 5.80497 20.9694C5.40963 20.9371 5.01641 20.8658 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3.13419 18.9836 3.06287 18.5904 3.03057 18.195C2.99997 17.8205 2.99998 17.3657 3 16.8385L3 11C3 8.92477 4.02755 6.93324 5.4804 5.4804C6.93324 4.02755 8.92477 3 11 3L16.8385 3C17.3657 2.99998 17.8205 2.99997 18.195 3.03057C18.5904 3.06287 18.9836 3.13419 19.362 3.32698C19.9265 3.6146 20.3854 4.07354 20.673 4.63803C20.8658 5.01641 20.9371 5.40963 20.9694 5.80497C21 6.17954 21 6.6343 21 7.16144V10C21 10.5523 20.5523 11 20 11C19.4477 11 19 10.5523 19 10V7.2C19 6.62345 18.9992 6.25118 18.9761 5.96784C18.9539 5.69617 18.9162 5.59546 18.891 5.54601C18.7951 5.35785 18.6422 5.20487 18.454 5.109C18.4045 5.0838 18.3038 5.04612 18.0322 5.02393ZM5.28014 9.41336L7.2952 8.96556C8.08861 8.78925 8.24308 8.74089 8.35381 8.67166C8.48251 8.59121 8.59121 8.48251 8.67166 8.35381C8.74089 8.24308 8.78925 8.08861 8.96556 7.2952L9.41336 5.28014C8.51014 5.59289 7.63524 6.15398 6.89461 6.89461C6.15398 7.63524 5.59289 8.51014 5.28014 9.41336ZM17 15C17 14.4477 17.4477 14 18 14C18.5523 14 19 14.4477 19 15V17H21C21.5523 17 22 17.4477 22 18C22 18.5523 21.5523 19 21 19H19V21C19 21.5523 18.5523 22 18 22C17.4477 22 17 21.5523 17 21V19H15C14.4477 19 14 18.5523 14 18C14 17.4477 14.4477 17 15 17H17V15Z" fill="currentColor"></path></svg>${translate('Reference this note')} ${hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm ms-auto">Pro</span>'}</div></div>
  <div role="menuitem" id="delete-note-settings-button-${noteId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Delete')}</div>
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', menuHtml);
  adjustMenuPosition(document.querySelector('#note-settings-menu'));
  addNoteSettingsMenuEventListeners(note);
}

function addNoteSettingsMenuEventListeners(note: any): void {
  const noteId = note.id;
  const renameBtn = document.getElementById(`rename-note-settings-button-${noteId}`);
  const editBtn = document.getElementById(`edit-note-settings-button-${noteId}`);
  const downloadBtn = document.getElementById(`download-note-settings-button-${noteId}`);
  const attachBtn = document.getElementById(`attach-note-settings-button-${noteId}`);
  const deleteBtn = document.getElementById(`delete-note-settings-button-${noteId}`);

  renameBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    const { openai_id } = await chrome.storage.sync.get(['openai_id']);
    if (note.conversation_id === openai_id) {
      toast('Renaming the global note is not allowed.', 'error');
      return;
    }
    handleRenameNoteClick(note);
  });

  editBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    updateSelectedNoteCard(note.id);
    openNotePreviewModal(note);
  });

  downloadBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    chrome.runtime.sendMessage({ type: 'getNote', detail: { conversationId: note.conversation_id } }, (response) => {
      const r = response ?? {};
      const blob = new Blob([`${r.name}\n\n${r.text || ''}`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.name}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  attachBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub) => {
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message:
            'Referencing note in conversations requires a Pro subscription. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      chrome.runtime.sendMessage({ type: 'getNote', detail: { conversationId: note.conversation_id } }, (response) => {
        const r = response ?? {};
        uploadTextToInput(r.text || '', `${r.name}.txt`);
      });
    });
  });

  deleteBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenus();
    const { openai_id } = await chrome.storage.sync.get(['openai_id']);
    if (note.conversation_id === openai_id) {
      toast('Deleting the global note is not allowed.', 'error');
      return;
    }
    showConfirmDialog('Delete note', 'Are you sure you want to delete this note?', 'Cancel', 'Delete', null, () =>
      handleDeleteNote(note),
    );
  });
}

// ---------------------------------------------------------------------------
// Rename / Delete handlers
// ---------------------------------------------------------------------------

function handleRenameNoteClick(note: any): void {
  let enterPressed = false;
  closeMenus();

  const input = document.createElement('input');
  const nameEl = document.querySelector(`#modal-manager #note-name-${note.id}`) as HTMLElement;
  const originalName = nameEl.innerText;

  input.id = `note-rename-${note.id}`;
  input.classList.value = 'border-0 bg-transparent p-0 focus:ring-0 focus-visible:ring-0 w-full';
  input.value = originalName;
  nameEl.parentElement?.replaceChild(input, nameEl);
  input.focus();
  setTimeout(() => input.select(), 50);

  input.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMenus();
    input.focus();
  });

  input.addEventListener('blur', () => {
    if (enterPressed) return;
    const newName = input.value;
    if (newName !== originalName) updateNoteNameElement(nameEl, note.id, newName);
    input.parentElement?.replaceChild(nameEl, input);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      enterPressed = true;
      const newName = input.value;
      if (newName !== originalName) updateNoteNameElement(nameEl, note.id, newName);
      input.parentElement?.replaceChild(nameEl, input);
    }
    if (e.key === 'Escape') {
      enterPressed = true;
      nameEl.innerText = originalName;
      input.parentElement?.replaceChild(nameEl, input);
    }
  });
}

function updateNoteNameElement(el: HTMLElement, noteId: string | number, newName: string): void {
  if (!newName.trim()) return;
  el.innerText = newName;
  chrome.runtime.sendMessage({
    type: 'renameNote',
    detail: { noteId, newName },
  });
}

function handleDeleteNote(note: any): void {
  document.getElementById(`note-item-${note.id}`)?.remove();
  const list = document.getElementById('note-list');
  if (list && !list.children?.length) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'position:absolute;display: flex; justify-content: center; align-items: center; height: 340px; width: 100%;';
    empty.textContent = translate('No notes found');
    list.appendChild(empty);
  }
  toggleNoteIndicator(note.conversation_id, '');

  const convId = getConversationIdFromUrl();
  if (convId && convId === note.conversation_id) {
    const sidebarInput = document.querySelector('#sidebar-note-input') as HTMLTextAreaElement | null;
    if (sidebarInput) sidebarInput.value = '';
  }

  chrome.runtime.sendMessage({
    type: 'deleteNote',
    detail: { noteId: note.id },
  });
}

// ---------------------------------------------------------------------------
// highlightSearch -- highlight matching text using CSS Custom Highlights API
// ---------------------------------------------------------------------------

/**
 * Debounced wrapper around the highlight logic.
 *
 * Original: content.isolated.end.js line 6166
 */
export function highlightSearch(elements: HTMLElement[], term: string): void {
  debounce(highlightSearchDebounced, 100)(elements, term);
}

function highlightSearchDebounced(elements: HTMLElement[], term: string): void {
  if (!elements) return;
  if (!term) {
    (CSS as any).highlights?.clear();
    return;
  }

  const textNodes: Text[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    if (!elements[i]) continue;
    const walker = document.createTreeWalker(elements[i]!, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node as Text);
      node = walker.nextNode();
    }
  }

  if (!(CSS as any).highlights) return;
  (CSS as any).highlights.clear();

  const needle = term.toLowerCase();
  if (!needle.trim()) return;

  const ranges = textNodes
    .map((el) => ({ el, text: el.textContent!.toLowerCase() }))
    .map(({ text, el }) => {
      const matches: number[] = [];
      let pos = 0;
      while (pos < text.length) {
        const idx = text.indexOf(needle, pos);
        if (idx === -1) break;
        matches.push(idx);
        pos = idx + needle.length;
      }
      return matches.map((idx) => {
        const range = new Range();
        range.setStart(el, idx);
        range.setEnd(el, idx + needle.length);
        return range;
      });
    });

  const highlight = new (globalThis as any).Highlight(...ranges.flat());
  (CSS as any).highlights.set('search-results', highlight);
}

// ---------------------------------------------------------------------------
// canAttacheFile -- check whether a file can be attached to the input
// ---------------------------------------------------------------------------

/**
 * Returns true if the user can attach another file to the prompt textarea.
 * Note: the original function name has a typo ("Attache") which is preserved
 * for backward compatibility.
 *
 * Original: content.isolated.end.js line 7702
 */
export function canAttacheFile(_filename: string): boolean {
  if (!document.querySelector('#prompt-textarea')) {
    toast('Start a new conversation or go to an existing conversation', 'error');
    return false;
  }
  if (!document.querySelector('main form input[type="file"]')) {
    toast('Attachments disabled for this model', 'error');
    return false;
  }
  const attachedCount = document
    .querySelector('main form')!
    .querySelectorAll('div[class*="fit"] div[class*="group relative inline-block"]').length;
  if (attachedCount >= 10) {
    toast('You can only attach up to 10 files', 'error');
    return false;
  }
  if (getPlusButton()?.disabled) {
    toast('Attachments disabled for this model', 'error');
    return false;
  }
  return true;
}
