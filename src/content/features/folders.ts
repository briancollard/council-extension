/**
 * Folders feature -- organise conversations into a hierarchical folder tree.
 *
 * Includes:
 *   - A collapsible folder drawer in the sidebar
 *   - Drag-and-drop reordering (native HTML5 drag events)
 *   - Folder CRUD (create, rename, delete, colour, image)
 *   - Per-folder custom instruction profiles
 *   - Folder navigation and breadcrumbs
 *   - Conversation manager modal with sidebar + main content
 *   - Move-to-folder modals for conversations and folders
 *   - Sidebar bulk actions (move, export, archive, delete)
 *
 * Original source: content.isolated.end.js
 *   - Folder helpers: lines 6811-7127
 *   - Folder data model & storage: lines 12905-13640
 *   - Sidebar drawer UI: lines 13278-13425
 *   - Conversation manager modal: lines 17323-18050
 *   - Conversation manager main content: lines 17766-18050
 *   - Fetch conversations: lines 18066-18149
 *   - Folder settings / rename: lines 18520-18840
 *   - Move modals: lines 23022-23520
 */

import type { Folder, ConversationSummary } from '../../types/conversation';

import {
  getConversationIdFromUrl,
  isDarkMode,
  debounce,
  throttle,
  generateRandomDarkColor,
  rgba2hex,
  isWindows,
  adjustMenuPosition,
  closeMenus,
  closeModals,
  isOnNewChatPage,
  formatDate,
  formatTime,
  errorUpgradeConfirmation,
  createModal,
  closeRadix,
  conversationHasAttachments,
  elementResizeObserver,
  getProjectIdFromUrl,
  getProjectName,
  refreshPage,
  downloadFileFromUrl,
} from '../../utils/shared';

import {
  toast,
  loadingSpinner,
  addTooltip,
  showConfirmDialog,
  dropdown,
  addDropdownEventListener,
  isDescendant,
} from '../isolated-world/ui/primitives';

import {
  archiveConversation,
  deleteAllConversations,
  deleteConversation,
  getConversationById,
  getConversations,
  getGizmoById,
  getProjectConversations,
  getProjects,
  addConversationToProject,
  unarchiveConversation,
  archiveAllConversations,
  getConversationIds,
  getDownloadUrlFromFileId,
  renameConversation,
  getDownloadUrlFromSandBoxPath,
} from '../isolated-world/api';

import { translate } from './i18n';
import { openExportModal, showDateSelectorDialog, saveResponseAsPDF, handleCopyText, handleCopyHtml } from './export';
import { removeConversationElements, handleDeleteConversation, renameConversationElements } from './timestamps';
import { closeSidebarNote, openNotePreviewModal, highlightSearch, canAttacheFile, sidebarNoteIsOpen } from './notes';
import { openFolderProfileSelectorModal, updateCustomInstructionProfileSelector } from './profiles';
import { startNewChat } from './prompts';
import { downloadSelectedImages } from './gallery';
import { replaceCitations, rowUser, rowAssistant } from './conversation-renderer';
import { removeSystemMessages, addCopyCodeButtonsEventListeners } from '../isolated-world/ui/markdown';
import { renderAllDalleImages, renderAllPythonImages, pluginVisualizationRenderer } from './dalle-plugins';
import { removeMiniMap } from './minimap';
import { shareConversation } from './share';
import { uploadTextToInput } from './notes';
import { createManager, buttonGenerator } from './manager';
import { stopAllAudios } from './speech';
import { getCitationAttributions } from '../isolated-world/api';
import { cachedSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Private helpers (utilities needed by the ported functions)
// ---------------------------------------------------------------------------

/**
 * Return the mouse position from a MouseEvent.
 * Original: content.isolated.end.js line 5951
 */
function getMousePosition(event: MouseEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY };
}

/**
 * Collect all CSS custom highlight entries from `CSS.highlights`.
 * Original: content.isolated.end.js line 6210
 */
function getCustomHighlights(): Array<{ name: string; highlight: Highlight }> {
  const cssH = (CSS as any).highlights as any;
  if (!cssH) return [];
  const results: Array<{ name: string; highlight: Highlight }> = [];

  if (typeof cssH.forEach === 'function') {
    cssH.forEach((highlight: Highlight, name: string) => results.push({ name, highlight }));
    return results;
  }
  if (typeof cssH.entries === 'function') {
    for (const [name, highlight] of cssH.entries()) {
      results.push({ name, highlight });
    }
    return results;
  }
  if (cssH[Symbol.iterator]) {
    for (const [name, highlight] of cssH) {
      results.push({ name, highlight });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Ported functions (formerly `declare function` stubs)
// ---------------------------------------------------------------------------

/**
 * Get all Range objects stored in CSS custom highlights.
 * Original: content.isolated.end.js line 6232
 */
export function getAllHighlightRanges(): Range[] {
  const entries = getCustomHighlights();
  const ranges: Range[] = [];
  for (const { highlight } of entries) {
    if (!highlight) continue;
    for (const item of highlight as any) {
      if (item instanceof Range) ranges.push(item);
    }
  }
  return ranges;
}

/**
 * Show a context menu with copy/export options for a message.
 * Original: content.isolated.end.js line 22782
 */
export async function showCopyMenu(event: MouseEvent, messageId: string, conversationId: string): Promise<void> {
  const { x, y } = getMousePosition(event);
  const article = (event.target as HTMLElement).closest('article');
  const hasSubscription = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const isLast = !article?.nextElementSibling || article.nextElementSibling?.tagName !== 'ARTICLE';
  const left = x + (isLast ? 16 : 4) + window.scrollX;
  const top = y + (isLast ? -48 : 4) + window.scrollY;
  const previewWrapper = document.querySelector('#conversation-preview-wrapper');

  const html = `<div id="copy-message-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${left}px,${top}px,0);min-width:max-content;z-index:1000000;--radix-popper-anchor-width:18px;--radix-popper-anchor-height:18px;--radix-popper-available-width:1167px;--radix-popper-available-height:604px;--radix-popper-transform-origin:0% 0px"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" data-radix-menu-content="" dir="ltr" aria-labelledby="radix-:r6g:" class="mt-2 min-w-[100px] max-w-xs rounded-lg border border-gray-100 bg-token-main-surface-primary shadow-long dark:border-gray-700" tabindex="-1" data-orientation="vertical" style="outline:0;--radix-dropdown-menu-content-transform-origin:var(--radix-popper-transform-origin);--radix-dropdown-menu-content-available-width:var(--radix-popper-available-width);--radix-dropdown-menu-content-available-height:var(--radix-popper-available-height);--radix-dropdown-menu-trigger-width:var(--radix-popper-anchor-width);--radix-dropdown-menu-trigger-height:var(--radix-popper-anchor-height);pointer-events:auto">
  <div role="menuitem" id="save-as-pdf-button-${messageId}" class="flex gap-2 m-1.5 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-secondary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item="">${translate('Save as PDF')}</div>
  <div role="menuitem" id="copy-html-button-${messageId}" class="flex gap-2 m-1.5 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-secondary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item="">${translate('Copy with Format')}</div>
  ${previewWrapper ? '' : `<div role="menuitem" id="add-to-notes-button-${messageId}" class="flex items-center justify-between gap-2 m-1.5 rounded p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-secondary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical" data-radix-collection-item="">${translate('Add to Notes')} ${hasSubscription ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>'}</div>`}
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  addCopyMenuEventListeners(messageId, conversationId);
}

/**
 * Attach event listeners to the copy-menu items.
 * Original: content.isolated.end.js line 22800
 */
function addCopyMenuEventListeners(messageId: string, conversationId: string): void {
  const pdfBtn = document.querySelector(`#save-as-pdf-button-${messageId}`);
  const htmlBtn = document.querySelector(`#copy-html-button-${messageId}`);
  const notesBtn = document.querySelector(`#add-to-notes-button-${messageId}`);

  pdfBtn?.addEventListener('click', () => {
    closeMenus();
    saveResponseAsPDF(messageId, conversationId);
  });
  htmlBtn?.addEventListener('click', (ev) => {
    closeMenus();
    handleCopyHtml(messageId, conversationId, (ev as MouseEvent).shiftKey);
  });
  notesBtn?.addEventListener('click', () => {
    closeMenus();
    handleCopyText(messageId, conversationId, true);
  });
}

/**
 * Load a conversation starting from a specific thread node ID.
 * Original: content.isolated.end.js line 22661
 */
export function loadConversationFromNode(conversationId: string, nodeId: string, currentNodeId: string): void {
  const searchTerm = (document.querySelector('#conversation-search') as HTMLInputElement | null)?.value || '';
  stopAllAudios();
  chrome.storage.sync.get(['name', 'avatar'], async (syncData: Record<string, any>) => {
    const fullConv: any = await getConversationById(conversationId, true);
    chrome.storage.local.get(['models'], (localData: Record<string, any>) => {
      const conv = removeSystemMessages(fullConv) as any;
      if (!conv) return;
      getGizmoById(conv?.gizmo_id).then((gizmo: any) => {
        // Walk from nodeId to the end of its thread
        let current = conv.mapping[nodeId];
        const chain: any[] = [];
        while (current) {
          const parentId = current.parent;
          const siblings: string[] = conv.mapping[parentId].children;
          const idx = siblings.findIndex((s: string) => s === nodeId);
          const threadIndex = idx === -1 ? 1 : idx + 1;
          const threadCount = siblings.length;
          chain.push({ ...current, threadIndex, threadCount });
          current = conv.mapping[current.children[0]];
        }

        let html = '';
        for (let i = 0; i < chain.length; i += 1) {
          const { message, threadCount, threadIndex } = chain[i];
          if (!message || message?.content?.content_type === 'user_editable_context') continue;
          const role = message.role || message.author?.role;
          if (!role || role === 'system') continue;

          if (role === 'user') {
            html += rowUser(conv, chain[i], threadIndex, threadCount, syncData.name, syncData.avatar);
          } else {
            const group = [chain[i]];
            let nextMsg = chain[i + 1]?.message;
            while (nextMsg && nextMsg.role !== 'user' && nextMsg.author?.role !== 'user') {
              group.push(chain[i + 1]);
              i += 1;
              nextMsg = chain[i + 1]?.message;
            }
            html += rowAssistant(conv, group, threadIndex, threadCount, localData.models, gizmo, false, false);
          }
        }

        const bottomMarker = document.querySelector('#conversation-preview-bottom');
        const currentWrapper = document.querySelector(
          `#conversation-preview-wrapper #message-wrapper-${currentNodeId}`,
        );
        if (!currentWrapper) return;

        // Remove all subsequent message wrappers
        while (
          currentWrapper.nextElementSibling &&
          currentWrapper.nextElementSibling.id.startsWith('message-wrapper-')
        ) {
          currentWrapper.nextElementSibling.remove();
        }
        currentWrapper.remove();
        bottomMarker?.insertAdjacentHTML('beforebegin', html);

        if (searchTerm) {
          const previewInner = document.querySelector(
            '#conversation-preview-wrapper #conversation-inner-div',
          ) as HTMLElement | null;
          const topTitle = document.querySelector('#conversation-top-title') as HTMLElement | null;
          highlightSearch([topTitle, previewInner].filter(Boolean) as HTMLElement[], searchTerm);
          setTimeout(() => {
            scrollToHighlight(previewInner);
          }, 100);
        }

        addFinalCompletionClassToLastMessageWrapper();
        renderAllDalleImages(conv, getDownloadUrlFromFileId as any);
        renderAllPythonImages(conv, getDownloadUrlFromFileId as any);
        renderAllPluginVisualizations(conv);
        addMissingGizmoNamesAndAvatars();
        addConversationsEventListeners(conv.conversation_id as string);
      });
    });
  });
}

/**
 * Create a full-size image preview overlay.
 * Original: called globally but not defined as a named function in the
 * beautified source. Implementation derived from usage context.
 */
export function createFullSizeFileWrapper(src: string): void {
  // Remove any existing wrapper first
  document.querySelector('#full-size-file-wrapper')?.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'full-size-file-wrapper';
  wrapper.style.cssText =
    'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);cursor:zoom-out;';

  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;';
  wrapper.appendChild(img);
  document.body.appendChild(wrapper);
}

/**
 * Add event listeners to close the full-size image preview overlay.
 * Original: called globally but not defined as a named function in the
 * beautified source. Implementation derived from usage context.
 */
export function addFullSizeFileWrapperEventListener(): void {
  const wrapper = document.querySelector('#full-size-file-wrapper') as HTMLElement | null;
  if (!wrapper) return;

  wrapper.addEventListener('click', () => {
    wrapper.remove();
  });

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      wrapper.remove();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);
}

/**
 * Show a tooltip when hovering over a citation link.
 * Original: content.isolated.end.js line 22986
 */
export function showCitationTooltip(event: MouseEvent, anchor: HTMLAnchorElement): void {
  const url = new URL(anchor.getAttribute('href')!);
  const title = url.host ? anchor.title : anchor.href.includes('sandbox') ? 'Download file' : '';
  const hostname = url.hostname;
  const { x, y } = anchor.getBoundingClientRect();

  if (!title) return;

  const externalLinkSvg =
    '<div class="shrink-0"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="icon icon-xs" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></div>';

  const html = `<div id="citation-tooltip" style="position: fixed; left: 0px; top: 0px; transform: translate3d(${x}px, ${y - 30}px, 0px); min-width: max-content; z-index: auto; --radix-popper-anchor-width: 25px; --radix-popper-anchor-height: 21px; --radix-popper-available-width: 753.3125px; --radix-popper-available-height: 535px; --radix-popper-transform-origin: 50% 34px;"><div data-side="top" data-align="center" data-state="delayed-open" class="relative rounded-lg border border-token-border-medium bg-black p-1 shadow-xs transition-opacity max-w-sm" style="--radix-tooltip-content-transform-origin: var(--radix-popper-transform-origin); --radix-tooltip-content-available-width: var(--radix-popper-available-width); --radix-tooltip-content-available-height: var(--radix-popper-available-height); --radix-tooltip-trigger-width: var(--radix-popper-anchor-width); --radix-tooltip-trigger-height: var(--radix-popper-anchor-height);"><span class="flex items-center whitespace-pre-wrap px-2 py-1 text-center font-medium normal-case text-gray-100 text-sm"><a href="${url.href}" target="_blank" rel="noreferrer" class="text-xs !no-underline"><div class="flex items-center gap-2">${url.host ? `<div class="flex shrink-0 items-center justify-center"><img src="https://icons.duckduckgo.com/ip3/${hostname}.ico" alt="Favicon" width="16" height="16" class="my-0"></div>` : ''}<div class="max-w-xs truncate">${title}</div>${url.host ? externalLinkSvg : ''}</div></a></span></div></div>`;

  if (document.querySelector('#citation-tooltip')) return;
  document.body.insertAdjacentHTML('beforeend', html);

  const tooltip = document.querySelector('#citation-tooltip') as HTMLElement;
  const tooltipWidth = tooltip.offsetWidth;
  tooltip.style.transform = `translate3d(${x - tooltipWidth / 2}px, ${y - 30}px, 0px)`;
  tooltip.addEventListener('mouseout', (ev) => {
    hideCitationTooltip(ev as MouseEvent);
  });
}

/**
 * Hide the citation tooltip unless the mouse moved into the tooltip itself.
 * Original: content.isolated.end.js line 23005
 */
export function hideCitationTooltip(event: MouseEvent): void {
  const tooltip = document.querySelector('#citation-tooltip');
  if (tooltip && !tooltip.contains(event.relatedTarget as Node)) {
    tooltip.remove();
  }
}

/**
 * Replace citation SVG icons with attribution data and wrap links with parentheses.
 * Original: content.isolated.end.js line 23010
 */
export function updateCitationAttributes(citations: Element[], origins: string[]): void {
  const uniqueOrigins = [...new Set(origins)];
  if (!uniqueOrigins.length) return;

  getCitationAttributions(uniqueOrigins).then((attributions: any[]) => {
    citations.forEach((citation) => {
      const anchor = citation.querySelector('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const origin = new URL(anchor.href).origin;
      const match = attributions.find((a: any) => a.url === origin);
      if (!match) return;

      const svg = citation.querySelector('svg');
      if (svg) svg.outerHTML = match.attribution;
      anchor.insertAdjacentHTML('beforebegin', '<span class="text-token-text-tertiary"> (</span>');
      anchor.insertAdjacentHTML('afterend', '<span class="text-token-text-tertiary">)</span>');
    });
  });
}

/**
 * Toggle visibility of plugin visualization content blocks.
 * Original: content.isolated.end.js line 22963
 */
export function addMessagePluginToggleButtonsEventListeners(elements: NodeListOf<Element> | undefined): void {
  elements?.forEach((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    el.parentNode!.replaceChild(clone, el);
    clone.addEventListener('click', () => {
      const msgId = clone.id.split('message-plugin-toggle-').pop()!;
      const content = document.querySelector(`#message-plugin-content-${msgId}`);
      if (!content) return;
      if (content.classList.contains('hidden')) {
        clone.querySelector('polyline')?.setAttribute('points', '18 15 12 9 6 15');
        content.classList.remove('hidden');
      } else {
        clone.querySelector('polyline')?.setAttribute('points', '6 9 12 15 18 9');
        content.classList.add('hidden');
      }
    });
  });
}

/**
 * Toggle visibility of strawberry/reasoning content blocks.
 * Original: content.isolated.end.js line 22974
 */
export function addMessageStrawberryToggleButtonsEventListeners(elements: NodeListOf<Element> | undefined): void {
  elements?.forEach((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    el.parentNode!.replaceChild(clone, el);
    clone.addEventListener('click', () => {
      const msgId = clone.id.split('strawberry-dropdown-wrapper-').pop()!;
      const content = document.querySelector(`#strawberry-content-${msgId}`);
      const toggle = document.querySelector(`#strawberry-dropdown-toggle-${msgId}`);
      if (!content) return;
      content.classList.toggle('hidden');
      if (content.classList.contains('hidden')) {
        toggle?.classList.remove('rotate-180');
      } else {
        toggle?.classList.add('rotate-180');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Ported functions (originally in folders.ts)
// ---------------------------------------------------------------------------

/**
 * Scroll the first CSS custom-highlight range into view inside `container`.
 * Falls back to `scrollIntoView` when `getClientRects` returns an empty rect.
 */
export function scrollToHighlight(container: HTMLElement | null = null): void {
  if (!(CSS as any).highlights) return;
  const ranges = getAllHighlightRanges();
  if (!ranges.length) return;
  ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
  const first = ranges[0]!;
  try {
    const rects = first.getClientRects();
    const rect =
      rects && rects.length
        ? Array.from(rects).find((r) => r.width > 0 && r.height > 0) || rects[0]
        : first.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      container?.scrollTo({
        top: container.scrollTop + rect.top - container.clientHeight / 2,
        left: container.scrollLeft + rect.left - container.clientWidth / 2,
        behavior: 'instant' as ScrollBehavior,
      });
      return;
    }
  } catch {
    // ignore
  }
  const startNode = first.startContainer;
  const el: Element | null =
    startNode?.nodeType === Node.TEXT_NODE ? (startNode as Text).parentElement : (startNode as Element);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
}

/**
 * Render all `[id^="message-plugin-visualization-"]` placeholders for
 * plugin visualisations in the given conversation object.
 */
export async function renderAllPluginVisualizations(conv: any, preview = false): Promise<void> {
  const nodes = document.querySelectorAll('[id^="message-plugin-visualization-"]');
  if (nodes.length === 0) return;
  const tasks = Array.from(nodes).map(async (node) => {
    if (node.innerHTML !== '') return;
    const nodeId = node.id.split('message-plugin-visualization-').pop()!;
    const mapping = conv.mapping[nodeId];
    if (!mapping) return;
    const lastChild = mapping.children[mapping.children.length - 1];
    const childNode = conv.mapping[lastChild];
    await pluginVisualizationRenderer(conv, childNode, getDownloadUrlFromFileId as any);
    if (preview) {
      const inner = document.querySelector('#conversation-inner-div') as HTMLElement | null;
      if (inner) {
        inner.style.cssText = 'scroll-behavior: auto;';
        inner.scrollTop = inner.scrollHeight;
        inner.style.cssText = 'scroll-behavior: smooth;';
      }
    }
  });
  await Promise.all(tasks);
}

/**
 * Marks the very last `[id^="message-wrapper-"]` element with
 * the `final-completion` CSS class, removing it from all others.
 */
export function addFinalCompletionClassToLastMessageWrapper(): void {
  document.querySelectorAll('[id^="message-wrapper-"]').forEach((el) => {
    el.classList.remove('final-completion');
  });
  const wrappers = [...document.querySelectorAll('[id^="message-wrapper-"]')];
  wrappers.pop()?.classList.add('final-completion');
}

/**
 * Fill in missing GPT avatar images by fetching the gizmo profile picture URL.
 */
export function addMissingGizmoNamesAndAvatars(): void {
  document.querySelectorAll<HTMLImageElement>('[id="gizmo-avatar"]').forEach((img) => {
    const gizmoId = img.dataset.gizmoid;
    if (!gizmoId) return;
    getGizmoById(gizmoId).then((gizmo: any) => {
      if (img.src.includes('wikimedia')) {
        const url = gizmo?.resource?.gizmo?.display?.profile_picture_url;
        if (url) img.src = url;
      }
    });
  });
}

/**
 * Private helper: update the conversation title element in the DOM and sync
 * the new name to the API and chrome runtime.
 */
function updateConversationNameElement(titleEl: HTMLElement, conversationId: string, newTitle: string): void {
  if (!newTitle.trim()) return;
  titleEl.innerText = newTitle;
  document.querySelectorAll(`#conversation-card-${conversationId} #conversation-title`).forEach((el) => {
    (el as HTMLElement).innerText = newTitle;
  });
  const navTitle = document.querySelector('nav #history div[class*="truncate"]') as HTMLElement | null;
  if (navTitle) {
    navTitle.title = newTitle;
    const span = navTitle.querySelector('span');
    if (span) span.innerText = newTitle;
  }
  if (getConversationIdFromUrl() === conversationId) {
    document.title = newTitle;
  }
  renameConversation(conversationId, newTitle);
  renameConversationElements(conversationId, newTitle);
  chrome.runtime.sendMessage({
    type: 'renameConversation',
    detail: { conversationId, title: newTitle },
  });
}

/**
 * Replace the conversation title with an inline `<input>` for renaming.
 * Commits on Enter / blur, cancels on Escape.
 */
export function handleRenameConversationClick(convId: string, isSidebar = false): void {
  let enterPressed = false;
  closeMenus();

  const input = document.createElement('input');
  const selector = `${isSidebar ? '#sidebar-folder-drawer' : '#modal-manager'} #conversation-card-${convId} #conversation-title`;
  const titleEl = document.querySelector(selector) as HTMLElement | null;
  if (!titleEl) return;
  const originalText = titleEl.innerText;

  input.id = `conversation-rename-${convId}`;
  input.className = 'border-0 bg-transparent p-0 focus:ring-0 focus-visible:ring-0 w-full';
  input.value = originalText;
  titleEl.parentElement?.replaceChild(input, titleEl);
  input.focus();
  setTimeout(() => {
    input.select();
  }, 50);

  input.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMenus();
    input.focus();
  });

  input.addEventListener('blur', () => {
    if (enterPressed) return;
    const val = input.value;
    if (val !== originalText) updateConversationNameElement(titleEl, convId, val);
    input.parentElement?.replaceChild(titleEl, input);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.which === 13) {
      enterPressed = true;
      const val = input.value;
      if (val !== originalText) updateConversationNameElement(titleEl, convId, val);
      input.parentElement?.replaceChild(titleEl, input);
    }
    if (e.key === 'Escape') {
      enterPressed = true;
      titleEl.innerText = originalText;
      input.parentElement?.replaceChild(titleEl, input);
    }
  });
}

/**
 * Attach event listeners for copy buttons, thread navigation, assets,
 * plugin toggles, citations, and sandbox download links within the
 * rendered conversation.
 */
export function addConversationsEventListeners(conversationId: string, lastOnly = false): void {
  const lastWrapper = [...document.querySelectorAll('[id^="message-wrapper-"]')].pop() as HTMLElement | undefined;

  let copyButtons = document.querySelectorAll('[id^="copy-message-button-"]');
  let prevButtons = document.querySelectorAll('#conversation-preview-wrapper [id^="thread-prev-button-"]');
  let nextButtons = document.querySelectorAll('#conversation-preview-wrapper [id^="thread-next-button-"]');
  let assets = document.querySelectorAll('[id^="asset-"]');
  let pluginToggles = document.querySelectorAll('[id^="message-plugin-toggle-"]');
  let strawberryToggles = document.querySelectorAll('[id^="strawberry-dropdown-wrapper-"]');
  let sandboxLinks = document.querySelectorAll<HTMLAnchorElement>('a[href^="sandbox:/"]');
  let citations = document.querySelectorAll('span[id="citation"]');

  if (lastOnly) {
    copyButtons = nodeListSliceLast(copyButtons, 1);
    prevButtons = nodeListSliceLast(prevButtons, 2);
    nextButtons = nodeListSliceLast(nextButtons, 2);
    assets = nodeListSliceLast(assets, 2);
    pluginToggles =
      lastWrapper?.querySelectorAll('[id^="message-plugin-toggle-"]') ?? document.querySelectorAll('#__never__');
    strawberryToggles =
      lastWrapper?.querySelectorAll('[id^="strawberry-dropdown-wrapper-"]') ?? document.querySelectorAll('#__never__');
    citations = lastWrapper?.querySelectorAll('span[id="citation"]') ?? document.querySelectorAll('#__never__');
    sandboxLinks = (lastWrapper?.querySelectorAll('a[href^="sandbox:/"]') ??
      document.querySelectorAll('#__never__')) as NodeListOf<HTMLAnchorElement>;
  }

  addCopyCodeButtonsEventListeners();

  // Copy message buttons
  copyButtons.forEach((btn) => {
    const clone = btn.cloneNode(true) as HTMLElement;
    btn.parentNode!.replaceChild(clone, btn);
    const messageId = clone.id.split('copy-message-button-').pop()!;
    clone.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeMenus();
      showCopyMenu(ev as MouseEvent, messageId, conversationId);
    });
  });

  // Thread previous buttons
  prevButtons.forEach((btn) => {
    const clone = btn.cloneNode(true) as HTMLElement;
    btn.parentNode!.replaceChild(clone, btn);
    clone.addEventListener('click', async () => {
      const conv = await getConversationById(conversationId);
      const cleaned: any = removeSystemMessages(conv as any);
      const nodeId = clone.id.split('thread-prev-button-').pop()!;
      const prevSibling = document.querySelector(`#message-wrapper-${nodeId}`)
        ?.previousElementSibling as HTMLElement | null;
      let parentId: string = cleaned.mapping[nodeId].parent;
      if (prevSibling && prevSibling.id.startsWith('message-wrapper-')) {
        parentId = prevSibling.id.split('message-wrapper-').pop()!;
      }
      const siblings: string[] = cleaned.mapping[parentId].children;
      const countEl = document.querySelector(`#thread-count-wrapper-${nodeId}`);
      const parts = countEl!.textContent!.split(' / ').map((s: string) => parseInt(s, 10));
      const current = parts[0] ?? 0;
      if (current > 1) {
        const idx = current - 1;
        const targetNodeId = siblings[idx - 1]!;
        loadConversationFromNode(cleaned.conversation_id, targetNodeId, nodeId);
      }
    });
  });

  // Thread next buttons
  nextButtons.forEach((btn) => {
    const clone = btn.cloneNode(true) as HTMLElement;
    btn.parentNode!.replaceChild(clone, btn);
    clone.addEventListener('click', async () => {
      const conv = await getConversationById(conversationId);
      const cleaned: any = removeSystemMessages(conv as any);
      const nodeId = clone.id.split('thread-next-button-').pop()!;
      const prevSibling = document.querySelector(`#message-wrapper-${nodeId}`)
        ?.previousElementSibling as HTMLElement | null;
      let parentId: string = cleaned.mapping[nodeId].parent;
      if (prevSibling && prevSibling.id.startsWith('message-wrapper-')) {
        parentId = prevSibling.id.split('message-wrapper-').pop()!;
      }
      const siblings: string[] = cleaned.mapping[parentId].children;
      const countEl = document.querySelector(`#thread-count-wrapper-${nodeId}`);
      const parts = countEl!.textContent!.split(' / ').map((s: string) => parseInt(s, 10));
      const current = parts[0] ?? 0;
      const total = parts[1] ?? 0;
      if (current < total) {
        const idx = current + 1;
        const targetNodeId = siblings[idx - 1]!;
        loadConversationFromNode(cleaned.conversation_id, targetNodeId, nodeId);
      }
    });
  });

  // Asset click handlers (full-size image preview)
  assets?.forEach((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    el.parentNode!.replaceChild(clone, el);
    clone.addEventListener('click', () => {
      let src = '';
      if (clone.tagName === 'IMG') src = clone.getAttribute('src') || '';
      if (clone.tagName === 'SPAN') src = (clone as HTMLElement).style.backgroundImage.split('"')[1] || '';
      createFullSizeFileWrapper(src);
      addFullSizeFileWrapperEventListener();
    });
  });

  // Citation hover tooltips
  const citationElements: Element[] = [];
  const citationOrigins: string[] = [];
  citations?.forEach((span) => {
    const anchor = span.querySelector('a') as HTMLAnchorElement | null;
    if (!anchor || !anchor.href || !anchor.href.startsWith('http')) return;
    if (span.querySelector('svg')) {
      citationElements.push(span);
      const url = new URL(anchor.href);
      citationOrigins.push(url.origin);
    }
    const anchorClone = anchor.cloneNode(true) as HTMLAnchorElement;
    anchor.parentNode!.replaceChild(anchorClone, anchor);
    anchorClone.addEventListener('mouseenter', (ev) => {
      showCitationTooltip(ev as MouseEvent, anchorClone);
    });
    anchorClone.addEventListener('mouseleave', (ev) => {
      hideCitationTooltip(ev as MouseEvent);
    });
  });
  updateCitationAttributes(citationElements, citationOrigins);

  // Sandbox download links
  sandboxLinks?.forEach((link) => {
    const clone = link.cloneNode(true) as HTMLAnchorElement;
    link.parentNode!.replaceChild(clone, link);
    clone.addEventListener('click', (ev) => {
      ev.preventDefault();
      closeMenus();
      const conv = getConversationById(conversationId) as any;
      const href = clone.getAttribute('href')!;
      const fileName = href.split('/').pop()!;
      const sandboxPath = href.split('sandbox:').pop()!;
      const matchingNode = Object.values(conv.mapping as Record<string, any>).find((n: any) =>
        n.message?.metadata?.aggregate_result?.final_expression_output?.includes(`'${sandboxPath}'`),
      ) as any;
      const imageUrl: string | undefined = matchingNode?.message?.metadata?.aggregate_result?.messages
        ?.filter((m: any) => m?.message_type === 'image')?.[0]
        ?.image_url?.split('://')
        ?.pop();
      if (imageUrl) {
        getDownloadUrlFromFileId(conversationId, imageUrl).then((res: any) => {
          if (res.status === 'error') {
            toast('Code interpreter session expired', 'error');
            return;
          }
          downloadFileFromUrl(res.download_url, fileName);
        });
      } else {
        getDownloadUrlFromSandBoxPath(conversationId, matchingNode.id, sandboxPath).then((res: any) => {
          if (res.status === 'error') {
            toast('Code interpreter session expired', 'error');
            return;
          }
          downloadFileFromUrl(res.download_url, fileName);
        });
      }
    });
  });

  addMessagePluginToggleButtonsEventListeners(pluginToggles);
  addMessageStrawberryToggleButtonsEventListeners(strawberryToggles);
}

/**
 * Helper: slice a NodeList to keep only the last `n` elements,
 * returning a new NodeList-compatible iterable.
 */
function nodeListSliceLast<T extends Element>(list: NodeListOf<T>, n: number): NodeListOf<T> {
  // We return a real NodeList by re-querying, but since that's not always possible
  // we wrap Array.from(...).slice(-n) in a proxy that quacks like a NodeList.
  const arr = Array.from(list).slice(-n);
  return arr as unknown as NodeListOf<T>;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

export let selectedConversationFolderBreadcrumb: any[] = [];
export let folderForNewChat: any = null;
export let sidebarSelectedConversationIds: string[] = [];
let lastSelectedConversationCardId = '';
let lastSelectedConversationCheckboxId = '';

/** Setters for mutable folders state (needed by external modules). */
export function setSelectedConversationFolderBreadcrumb(v: any[]) {
  selectedConversationFolderBreadcrumb = v;
}
export function setFolderForNewChat(v: any) {
  folderForNewChat = v;
}

interface DefaultFolder {
  id: string;
  name: string;
  code: string;
  displayName: string;
}

export const defaultConversationFolders: DefaultFolder[] = [
  {
    id: 'all',
    name: '<div class="flex items-center"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-2" viewBox="0 0 512 512" fill="currentColor"><path d="M360 144h-208C138.8 144 128 154.8 128 168S138.8 192 152 192h208C373.3 192 384 181.3 384 168S373.3 144 360 144zM264 240h-112C138.8 240 128 250.8 128 264S138.8 288 152 288h112C277.3 288 288 277.3 288 264S277.3 240 264 240zM447.1 0h-384c-35.25 0-64 28.75-64 63.1v287.1c0 35.25 28.75 63.1 64 63.1h96v83.1c0 9.836 11.02 15.55 19.12 9.7l124.9-93.7h144c35.25 0 64-28.75 64-63.1V63.1C511.1 28.75 483.2 0 447.1 0zM464 352c0 8.75-7.25 16-16 16h-160l-80 60v-60H64c-8.75 0-16-7.25-16-16V64c0-8.75 7.25-16 16-16h384c8.75 0 16 7.25 16 16V352z"/></svg> All conversations</div>',
    code: 'all-conversations',
    displayName: 'All Conversations',
  },
  {
    id: 'favorites',
    name: '<div class="flex items-center"><svg class="icon icon-sm me-2" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg> Favorites</div>',
    code: 'favorites',
    displayName: 'Favorite Conversations',
  },
  {
    id: 'archived',
    name: '<div class="flex items-center"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-2"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.62188 3.07918C3.87597 2.571 4.39537 2.25 4.96353 2.25H13.0365C13.6046 2.25 14.124 2.571 14.3781 3.07918L15.75 5.82295V13.5C15.75 14.7426 14.7426 15.75 13.5 15.75H4.5C3.25736 15.75 2.25 14.7426 2.25 13.5V5.82295L3.62188 3.07918ZM13.0365 3.75H4.96353L4.21353 5.25H13.7865L13.0365 3.75ZM14.25 6.75H3.75V13.5C3.75 13.9142 4.08579 14.25 4.5 14.25H13.5C13.9142 14.25 14.25 13.9142 14.25 13.5V6.75ZM6.75 9C6.75 8.58579 7.08579 8.25 7.5 8.25H10.5C10.9142 8.25 11.25 8.58579 11.25 9C11.25 9.41421 10.9142 9.75 10.5 9.75H7.5C7.08579 9.75 6.75 9.41421 6.75 9Z" fill="currentColor"></path></svg> Archived</div>',
    code: 'archived',
    displayName: 'Archived Conversations',
  },
];

const conversationsSortByList = [
  { name: 'Last updated', code: 'updated_at' },
  { name: 'Created', code: 'created_at' },
  { name: 'A \u2192 Z', code: 'alphabetical' },
  { name: 'Z \u2192 A', code: 'alphabetical-reverse' },
];

// ---------------------------------------------------------------------------
// SVG icon constants
// ---------------------------------------------------------------------------

const CHEVRON_RIGHT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md-heavy me-1"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.29289 18.7071C8.90237 18.3166 8.90237 17.6834 9.29289 17.2929L14.5858 12L9.29289 6.70711C8.90237 6.31658 8.90237 5.68342 9.29289 5.29289C9.68342 4.90237 10.3166 4.90237 10.7071 5.29289L16.7071 11.2929C16.8946 11.4804 17 11.7348 17 12C17 12.2652 16.8946 12.5196 16.7071 12.7071L10.7071 18.7071C10.3166 19.0976 9.68342 19.0976 9.29289 18.7071Z" fill="currentColor"></path></svg>';

const DOTS_MENU_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg>';

const NEW_FOLDER_SVG =
  '<svg stroke="currentColor" fill="currentColor" class="icon icon-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M464 96h-192l-64-64h-160C21.5 32 0 53.5 0 80v352C0 458.5 21.5 480 48 480h416c26.5 0 48-21.5 48-48v-288C512 117.5 490.5 96 464 96zM336 311.1h-56v56C279.1 381.3 269.3 392 256 392c-13.27 0-23.1-10.74-23.1-23.1V311.1H175.1C162.7 311.1 152 301.3 152 288c0-13.26 10.74-23.1 23.1-23.1h56V207.1C232 194.7 242.7 184 256 184s23.1 10.74 23.1 23.1V264h56C349.3 264 360 274.7 360 288S349.3 311.1 336 311.1z"/></svg>';

const FOLDER_ICON_FN = (active: boolean) =>
  `<svg stroke="currentColor" fill="currentColor" class="icon icon-sm me-1 ${active ? 'text-token-text-primary' : ''} group-hover:text-token-text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M147.8 192H480V144C480 117.5 458.5 96 432 96h-160l-64-64h-160C21.49 32 0 53.49 0 80v328.4l90.54-181.1C101.4 205.6 123.4 192 147.8 192zM543.1 224H147.8C135.7 224 124.6 230.8 119.2 241.7L0 480h447.1c12.12 0 23.2-6.852 28.62-17.69l96-192C583.2 249 567.7 224 543.1 224z"/></svg>`;

const CHEVRON_SMALL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm mx-1"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.29289 18.7071C8.90237 18.3166 8.90237 17.6834 9.29289 17.2929L14.5858 12L9.29289 6.70711C8.90237 6.31658 8.90237 5.68342 9.29289 5.29289C9.68342 4.90237 10.3166 4.90237 10.7071 5.29289L16.7071 11.2929C16.8946 11.4804 17 11.7348 17 12C17 12.2652 16.8946 12.5196 16.7071 12.7071L10.7071 18.7071C10.3166 19.0976 9.68342 19.0976 9.29289 18.7071Z" fill="currentColor"></path></svg>';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isDefaultConvFolder(id: string | number | undefined | null): boolean {
  if (!id) return false;
  return defaultConversationFolders.map((f) => f.id).includes(id.toString());
}

export function getLastSelectedConversationFolder(): any {
  return selectedConversationFolderBreadcrumb[selectedConversationFolderBreadcrumb.length - 1] ?? null;
}

export function sidebarFolderIsOpen(): boolean {
  return window.localStorage.getItem('sp/sidebarFolderIsOpen') === 'true';
}

export function getOriginalHistory(): HTMLElement | null {
  return (
    (document.querySelector('nav div[id="history"]') as HTMLElement) ??
    (document.querySelector(
      'nav div[class="flex flex-col gap-2 text-token-text-primary text-sm mt-5 first:mt-0 false"]',
    ) as HTMLElement) ??
    (document.querySelector(
      'nav div[class="flex flex-col gap-2 text-token-text-primary text-sm false mt-5 pb-2"]',
    ) as HTMLElement) ??
    null
  );
}

export function clearSidebarSearchInput(): void {
  const input = document.querySelector('#sidebar-folder-search-input') as HTMLInputElement | null;
  if (input) input.value = '';
  const hint = document.querySelector('#sidebar-folder-search-hint') as HTMLElement | null;
  if (hint) {
    hint.classList.add('hidden');
    hint.innerText = '';
  }
}

// ---------------------------------------------------------------------------
// Utility: escapeHTML
// ---------------------------------------------------------------------------

function escapeHTML(str: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Indicator helpers
// ---------------------------------------------------------------------------

export function isProjectConversation(conv: any): boolean {
  return conv.gizmo_id?.startsWith('g-p-') && conv.gizmo_id !== 'g-p-688945422f8c8191a1825cd5ccf29079';
}

export function isStudyMode(conv: any): boolean {
  return conv.gizmo_id === 'g-p-688945422f8c8191a1825cd5ccf29079' || conv.is_study_mode === true;
}

export function isDeepResearch(conv: any): boolean {
  return conv.default_model_slug === 'research';
}

export function letterIndicator(letter: string, bg = '#3c80f5', fg = '#000'): string {
  return `<span class="inline-flex items-center justify-center w-4 h-4 text-xs font-semibold rounded-sm" style="background-color: ${bg}; color: ${fg};">${letter}</span>`;
}

export function conversationIndicators(conv: any): string {
  if (!conv) return '';
  const hasAttach = conv.has_attachments || conversationHasAttachments(conv);
  // Async gizmo image load
  setTimeout(async () => {
    if (!conv?.gizmo_id) return;
    const gizmo = await getGizmoById(conv.gizmo_id);
    const name = gizmo?.resource?.gizmo?.display?.name || '';
    const pic = gizmo?.resource?.gizmo?.display?.profile_picture_url;
    const els = document.querySelectorAll(`#conversation-gizmo-indicator-${conv.conversation_id}`);
    if (els.length === 0) return;
    els.forEach((el) => {
      if (pic) {
        el.innerHTML = `<img src="${pic}" alt="${name}" class="w-4 h-4 rounded-sm" />`;
        (el as HTMLElement).title = name;
      } else {
        el.innerHTML = '';
        (el as HTMLElement).title = '';
      }
    });
  }, 100);

  return `
    <div class="flex me-1 ${hasAttach ? '' : 'hidden'}" title="This conversations has attachments" id="conversation-attachments-indicator-${conv.conversation_id}">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M4.33496 12.5V7.5C4.33496 7.13273 4.63273 6.83496 5 6.83496C5.36727 6.83496 5.66504 7.13273 5.66504 7.5V12.5C5.66504 14.8942 7.60585 16.835 10 16.835C12.3942 16.835 14.335 14.8942 14.335 12.5V5.83301C14.3348 4.35959 13.1404 3.16522 11.667 3.16504C10.1934 3.16504 8.99822 4.35948 8.99805 5.83301V12.5C8.99805 13.0532 9.44679 13.502 10 13.502C10.5532 13.502 11.002 13.0532 11.002 12.5V7.5C11.002 7.13273 11.2997 6.83496 11.667 6.83496C12.0341 6.83514 12.332 7.13284 12.332 7.5V12.5C12.332 13.7877 11.2877 14.832 10 14.832C8.71226 14.832 7.66797 13.7877 7.66797 12.5V5.83301C7.66814 3.62494 9.45888 1.83496 11.667 1.83496C13.875 1.83514 15.6649 3.62505 15.665 5.83301V12.5C15.665 15.6287 13.1287 18.165 10 18.165C6.87131 18.165 4.33496 15.6287 4.33496 12.5Z"></path></svg>
    </div>
    <div class="flex me-1 ${conv?.gizmo_id ? '' : 'hidden'}" title="" id="conversation-gizmo-indicator-${conv.conversation_id}"></div>
    <div class="flex me-1 ${isProjectConversation(conv) ? '' : 'hidden'}" title="This conversations belongs to a project" id="conversation-project-indicator-${conv.conversation_id}">
      ${letterIndicator('P', 'royalblue', '#fff')}
    </div>
    <div class="flex me-1 ${isStudyMode(conv) ? '' : 'hidden'}" title="Study Mode" id="conversation-study-indicator-${conv.conversation_id}">
      ${letterIndicator('S', 'skyblue', '#000')}
    </div>
    <div class="flex me-1 ${isDeepResearch(conv) ? '' : 'hidden'}" title="Deep Research" id="conversation-research-indicator-${conv.conversation_id}">
      ${letterIndicator('D', 'hotpink', '#000')}
    </div>
    <span class="flex me-1" title="This conversation has notes">
      <svg id="conversation-note-indicator-${conv.conversation_id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="#19c37d" class="ms-1 icon icon-sm ${conv.has_note ? '' : 'hidden'}"><path d="M320 480l128-128h-128V480zM400 31.1h-352c-26.51 0-48 21.49-48 48v352C0 458.5 21.49 480 48 480H288l.0039-128c0-17.67 14.33-32 32-32H448v-240C448 53.49 426.5 31.1 400 31.1z"/></svg>
    </span>
  `;
}

export function toggleProjectIndicators(convId: string, gizmoId: string): void {
  const els = document.querySelectorAll(`#conversation-project-indicator-${convId}`);
  if (els.length === 0) return;
  els.forEach((el) => {
    if (gizmoId?.startsWith('g-p-')) {
      el.classList.remove('hidden');
      el.addEventListener('click', async (ev: Event) => {
        ev.stopPropagation();
        closeMenus();
        if ((ev as MouseEvent).metaKey || (isWindows() && (ev as MouseEvent).ctrlKey)) {
          window.open(`/g/${gizmoId}/project`, '_blank');
          return;
        }
        window.history.pushState({}, '', `/g/${gizmoId}/project`);
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      });
    } else {
      el.classList.add('hidden');
    }
  });
}

// ---------------------------------------------------------------------------
// No-element helpers
// ---------------------------------------------------------------------------

export function noConversationElement(): HTMLElement {
  const el = document.createElement('p');
  el.className = 'absolute text-center text-sm text-token-text-tertiary w-full p-4';
  el.id = 'no-conversations-found';
  el.innerText = translate('No conversations found');
  return el;
}

export function noConversationFolderElemet(): HTMLElement {
  const el = document.createElement('p');
  el.id = 'no-conversation-folders';
  el.className = 'text-token-text-tertiary text-center text-sm py-4';
  el.innerText = translate('new_folder_hint');
  return el;
}

// ---------------------------------------------------------------------------
// syncHistoryResponseToConversationDB
// ---------------------------------------------------------------------------

export function syncHistoryResponseToConversationDB(response: any, archived = false, sync = false): any[] {
  const results = response.items.slice(0, archived || cachedSettings?.syncHistoryResponses ? response.items.length : 5);
  if (sync) {
    chrome.runtime.sendMessage({ type: 'addConversations', detail: { conversations: results } }, () => {
      chrome.runtime.sendMessage({ type: 'initializeConversationSync', forceRefresh: true });
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// initiateNewChatFolderIndicator
// ---------------------------------------------------------------------------

export async function initiateNewChatFolderIndicator(): Promise<void> {
  const existing = document.querySelector('#new-chat-folder-indicator-wrapper');
  if (existing) existing.remove();
  if (!folderForNewChat || folderForNewChat.gizmo_id) return;

  let isNewChat = isOnNewChatPage(false);
  let articles = Array.from(document.querySelectorAll('main article'));
  if (!isNewChat || articles.length > 0) {
    let retries = 0;
    const interval = setInterval(() => {
      isNewChat = isOnNewChatPage(false);
      articles = Array.from(document.querySelectorAll('main article'));
      if ((isNewChat && articles.length === 0) || retries >= 50) {
        clearInterval(interval);
        initiateNewChatFolderIndicator();
      }
      retries += 1;
    }, 300);
  }
  if (!isNewChat) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'new-chat-folder-indicator-wrapper';
  wrapper.className = 'w-full flex flex-wrap items-center justify-start relative';
  wrapper.style.top = '-24px';
  wrapper.innerHTML =
    '<div class="w-full flex items-center justify-start text-xs mb-2 text-token-text-tertiary">Starting new chat in</div>';
  const folderEl = conversationFolderElement(folderForNewChat, true, false, true, true, true);
  if (folderEl) wrapper.appendChild(folderEl);

  const form = document.querySelector('main form');
  if (form) {
    (form.parentElement!.parentElement! as HTMLElement).classList.add('flex-wrap');
    form.parentElement!.parentElement!.prepend(wrapper);
    if (folderForNewChat.profile?.id) {
      const fullFolder = await chrome.runtime.sendMessage({
        type: 'getConversationFolder',
        forceRefresh: true,
        detail: { folderId: folderForNewChat.id },
      });
      updateCustomInstructionProfileSelector(fullFolder.profile, true);
    }
  }
}

// ---------------------------------------------------------------------------
// createFullSearchButton
// ---------------------------------------------------------------------------

export function createFullSearchButton(isSidebar = false): HTMLElement {
  const btn = document.createElement('button');
  btn.id = 'full-search-button';
  btn.className = `flex items-center justify-center text-2xl bg-token-main-surface-secondary p-4 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${isSidebar ? 'mt-2' : ''} ${isSidebar || cachedSettings.selectedConversationView === 'list' ? 'w-full h-14' : 'h-auto aspect-1.5'} relative`;
  btn.innerHTML =
    '<div class="flex items-center justify-center"><div class="w-full text-sm">Click to load more</div></div>';
  btn.addEventListener('click', (ev) => {
    if (isSidebar) {
      throttleFetchSidebarConversations(1, true, (ev as MouseEvent).shiftKey);
    } else {
      fetchConversations(1, true, (ev as MouseEvent).shiftKey);
    }
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

export function generateConvFolderBreadcrumb(container: HTMLElement, isSidebar = false): void {
  container.innerHTML = '';
  container.innerHTML += CHEVRON_RIGHT_SVG;

  if (!isSidebar) {
    const isDefault = isDefaultConvFolder(selectedConversationFolderBreadcrumb[0]?.id);
    const newFolderBtn = document.querySelector(
      '#modal-manager #conversation-manager-new-folder-button',
    ) as HTMLElement | null;
    if (isDefault) {
      newFolderBtn?.classList.replace('flex', 'hidden');
    } else {
      newFolderBtn?.classList.replace('hidden', 'flex');
    }
  }

  const items = isSidebar
    ? [{ id: 'root', name: 'Root' }, ...selectedConversationFolderBreadcrumb]
    : selectedConversationFolderBreadcrumb;

  items.forEach((item, idx) => {
    const span = document.createElement('span');
    span.classList.add('flex', 'items-center', 'text-token-text-tertiary', 'text-sm', 'group');
    const label = `<span id="folder-breadcrumb-${item.id}" class="me-1 ${isSidebar ? '' : 'text-nowrap'} hover:underline cursor-pointer ${idx === items.length - 1 ? 'text-token-text-primary' : 'text-token-text-tertiary hover:text-token-text-primary'}" data-folder-id="${item.id}">
      ${isDefaultConvFolder(item.id) ? item.displayName : item.name}
    </span>`;
    span.innerHTML = `${FOLDER_ICON_FN(idx === items.length - 1)}${label}`;
    if (idx < items.length - 1) span.innerHTML += CHEVRON_RIGHT_SVG;
    container.appendChild(span);
  });
}

// ---------------------------------------------------------------------------
// Default folders list
// ---------------------------------------------------------------------------

export function defaultConversationFoldersList(isSidebar = false): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = 'default-conversation-folders';
  wrapper.classList.add('pb-2', 'mb-4', 'border-b', 'border-token-border-medium', 'relative');

  const { showFoldersInLeftSidebar } = cachedSettings;
  defaultConversationFolders.forEach((f) => {
    const el = conversationFolderElement(f as any, isSidebar);
    if (el) wrapper.appendChild(el);
  });

  const selectedConversationsManagerFoldersSortBy =
    (cachedSettings as any).selectedConversationsManagerFoldersSortBy ?? 'alphabetical';
  const sortLabels: Record<string, string> = {
    alphabetical: 'A\u2192Z',
    'alphabetical-reverse': 'Z\u2192A',
    created_at: 'Created At',
    updated_at: 'Updated At',
  };

  const sortBtn = document.createElement('button');
  sortBtn.innerText = `\u21C5 ${sortLabels[selectedConversationsManagerFoldersSortBy] || 'A\u2192Z'}`;
  sortBtn.id = 'conversation-manager-folders-sort-button';
  sortBtn.className = `absolute ${isSidebar && !showFoldersInLeftSidebar ? 'start-0 pe-2' : 'end-0 ps-2'} text-token-text-tertiary hover:text-token-text-primary cursor-pointer ${isSidebar ? 'bg-token-sidebar-surface-primary' : 'bg-token-main-surface-primary'}`;
  sortBtn.style.cssText = 'bottom:-10px; font-size: 12px;';
  addTooltip(sortBtn, { value: 'Sort Folders', position: isSidebar && !showFoldersInLeftSidebar ? 'left' : 'right' });
  sortBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    showConversationFolderSortByMenu(sortBtn, isSidebar, !!showFoldersInLeftSidebar);
  });
  wrapper.appendChild(sortBtn);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Conversation folder element
// ---------------------------------------------------------------------------

export function conversationFolderElement(
  folder: any,
  isSidebar = false,
  isSubfolder = false,
  fixedWidth = false,
  showCloseButton = false,
  isReadOnly = false,
): HTMLElement | null {
  if (!folder) return null as any;
  const isDefault = isDefaultConvFolder(folder.id);
  const isLocked = folder.id === -1;

  const el = document.createElement('div');
  el.id = `conversation-folder-wrapper-${folder.id}`;
  el.className = `relative flex items-center justify-between p-2 ${isDefault ? '' : 'py-1'} ${isReadOnly ? '' : 'cursor-pointer'} border bg-token-main-surface-secondary border-token-border-medium rounded-md mb-2 group ${isLocked ? 'opacity-50' : ''}`;

  // Search breadcrumb tooltip
  const searchInput = document.querySelector('#sidebar-folder-search-input') as HTMLInputElement | null;
  if (searchInput && searchInput.value.trim() !== '') {
    const trail = [{ name: 'Root' }, ...(folder.breadcrumb || []), { name: folder.name }]
      .map((b: any) => b.name)
      .join(CHEVRON_SMALL_SVG);
    if (folder.breadcrumb) {
      addTooltip(el, { value: `<div class="flex items-center">${trail}</div>`, position: 'right' });
    }
  }

  if (!isDefault) el.draggable = true;
  el.style.minHeight = '42px';
  if (fixedWidth) el.style.width = '240px';
  if (folder.color) el.style.backgroundColor = folder.color;

  // Selection indicator (manager modal only)
  if (!isSidebar) {
    const indicator = document.createElement('div');
    indicator.id = `selected-conversation-folder-indicator-${folder.id}`;
    indicator.className = `w-1 h-10 rounded-s-xl absolute ${selectedConversationFolderBreadcrumb[0]?.id?.toString() === folder.id.toString() ? 'bg-black dark:bg-white' : ''}`;
    indicator.style.right = '-9px';
    el.appendChild(indicator);
  }

  // Click handler
  el.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (isReadOnly) return;
    if (closeMenus) closeMenus();

    if (isLocked) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message:
          'With free account, you can only have up to 5 conversation folders. Upgrade to Pro to remove all limits.',
      });
      return;
    }

    folder.name = (el.querySelector(`#conversation-folder-name-${folder.id}`) as HTMLElement)?.innerHTML ?? folder.name;
    folder.color = rgba2hex(el.style.backgroundColor);
    const imgEl = el.querySelector(`#conversation-folder-image-${folder.id}`) as HTMLImageElement | null;
    if (!isDefault && imgEl && !imgEl.src?.startsWith('chrome-extension://')) {
      folder.image = imgEl.src;
    }

    const lastFolder = getLastSelectedConversationFolder();
    if (!isSidebar && !(ev as MouseEvent).shiftKey && lastFolder?.id?.toString() === folder.id.toString()) return;

    clearSidebarSearchInput();
    if (folder.parent_folder && folder.parent_folder === lastFolder?.id) {
      selectedConversationFolderBreadcrumb.push(folder);
    } else {
      selectedConversationFolderBreadcrumb = [folder];
    }

    const managerBreadcrumb = document.querySelector(
      '#modal-manager #conversation-manager-breadcrumb',
    ) as HTMLElement | null;
    if (managerBreadcrumb) generateConvFolderBreadcrumb(managerBreadcrumb);
    const sidebarBreadcrumb = document.querySelector(
      '#sidebar-folder-drawer #sidebar-folder-breadcrumb',
    ) as HTMLElement | null;
    if (sidebarBreadcrumb) generateConvFolderBreadcrumb(sidebarBreadcrumb, true);

    chrome.storage.local.set({ selectedConversationFolderBreadcrumb });
    toggleNewConversationInFolderButton(isDefaultConvFolder(folder.id));

    document.querySelectorAll('#modal-manager div[id^="conversation-folder-wrapper-"]')?.forEach((w) => {
      w.querySelector('div[id^="selected-conversation-folder-indicator-"]')?.classList.remove(
        'bg-black',
        'dark:bg-white',
      );
    });
    document
      .querySelector(`#modal-manager #conversation-folder-wrapper-${selectedConversationFolderBreadcrumb[0]?.id}`)
      ?.querySelector('div[id^="selected-conversation-folder-indicator-"]')
      ?.classList.add('bg-black', 'dark:bg-white');

    resetConversationManagerSelection();
    resetSidebarConversationSelection();
    throttleGetConvSubFolders(folder.id, (ev as MouseEvent).shiftKey);

    if (isSidebar) {
      throttleFetchSidebarConversations(1, false, (ev as MouseEvent).shiftKey);
    } else {
      fetchConversations(1, false, (ev as MouseEvent).shiftKey);
      throttleFetchSidebarConversations(1, false, false);
    }
  });

  el.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    (document.querySelector(`#conversation-folder-settings-button-${folder.id}`) as HTMLElement)?.click();
  });

  el.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!isLocked && !isReadOnly && !isDefault) handleRenameConversationFolderClick(folder.id);
  });

  el.addEventListener('mouseenter', () => {
    if (closeMenus) closeMenus();
    if (isReadOnly) return;
    document.querySelectorAll('div[id^="conversation-folder-settings-button-"]').forEach((b) => {
      b.classList.replace('flex', 'hidden');
    });
    const nameEl = document.querySelector(`#conversation-folder-name-${folder.id}`) as HTMLElement | null;
    if (nameEl) nameEl.style.paddingRight = '36px';
  });

  el.addEventListener('mouseleave', () => {
    const nameEl = document.querySelector(`#conversation-folder-name-${folder.id}`) as HTMLElement | null;
    if (nameEl) nameEl.style.paddingRight = '0px';
  });

  // Drag events
  el.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    ev.dataTransfer!.setData('text/plain', JSON.stringify({ draggingObject: 'folder', folder }));
    ev.dataTransfer!.effectAllowed = 'move';
    el.classList.add('folder-dragging');
  });

  el.addEventListener('dragend', (ev) => {
    ev.stopPropagation();
    ev.dataTransfer!.clearData();
    try {
      el.classList.remove('folder-dragging');
    } catch (err) {
      console.error('Error removing folder-dragging class:', err);
    }
  });

  el.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (isReadOnly || isLocked) return;
    if (document.querySelector('.folder-dragging') && isDefaultConvFolder(folder.id)) return;
    ev.dataTransfer!.dropEffect = 'move';
    const last = getLastSelectedConversationFolder();
    if (folder.id === 'all' && last?.id !== 'archived') return;
    el.classList.add('folder-drag-hover');
  });

  el.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (isReadOnly || isLocked) return;
    const last = getLastSelectedConversationFolder();
    if (folder.id === 'all' && last?.id !== 'archived') return;
    el.classList.remove('folder-drag-hover');
  });

  el.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resetConversationManagerSelection();
    if (isReadOnly || isLocked) return;
    el.classList.remove('folder-drag-hover');

    let data: any;
    try {
      data = JSON.parse(ev.dataTransfer!.getData('text/plain'));
    } catch (err) {
      console.error('Error parsing dragged data:', err);
      return;
    }
    if (!data) return;

    if (data.draggingObject === 'conversation') {
      const convId = data.conversation?.conversation_id;
      if (!convId) return;
      const lastFolder = getLastSelectedConversationFolder();
      if (folder.id === lastFolder?.id) return;
      if (folder.id === 'favorites') {
        const favBtn = document
          .querySelector(`#modal-manager #conversation-card-${convId}`)
          ?.querySelector('#modal-manager #conversation-card-favorite') as HTMLElement | null;
        if (favBtn?.querySelector('svg')?.getAttribute('fill') !== 'gold') favBtn?.click();
        return;
      }
      if (folder.id === 'archived') {
        handleClickArchiveConversationsButton([convId]);
        return;
      }
      if (lastFolder?.id === 'archived') handleClickUnarchiveConversationsButton([convId]);
      if (folder.id === 'all') return;
      moveConvToFolder([convId], folder.id, folder.name, folder.color);
    }

    if (data.draggingObject === 'folder') {
      if (isDefaultConvFolder(folder.id)) return;
      const draggedFolder = data.folder;
      if (!draggedFolder) return;
      const lastFolder = getLastSelectedConversationFolder();
      if (draggedFolder.id === lastFolder?.id || folder.id === draggedFolder.id) return;
      moveConvFolder(draggedFolder, folder.id);
    }
  });

  // Content: image + name + counts
  const content = document.createElement('div');
  content.className = 'flex items-center justify-start w-full h-full overflow-hidden';

  const imgUrl = folder.image || folder.image_url;
  const imgSrc = folder.image || folder.image_url || (isDefault ? '' : chrome.runtime.getURL('icons/folder.png'));
  const img = document.createElement('img');
  img.id = `conversation-folder-image-${folder.id}`;
  img.src = imgSrc;
  img.className = `${imgUrl ? 'w-6 h-6 me-2' : 'w-5 h-5 me-3'} rounded-md object-cover ${imgSrc ? '' : 'hidden'}`;
  img.style.cssText = 'filter:drop-shadow(0px 0px 1px black);padding-left:1px;';
  content.appendChild(img);

  const info = document.createElement('div');
  info.className = 'flex items-center justify-start w-full flex-wrap overflow-hidden';
  content.appendChild(info);

  const nameSpan = document.createElement('span');
  nameSpan.id = `conversation-folder-name-${folder.id}`;
  nameSpan.className = `w-full truncate max-h-5 relative text-sm ${isDefault ? 'text-token-text-primary' : 'text-white'}`;
  nameSpan.innerHTML = folder.name;
  nameSpan.title = folder.name;
  info.appendChild(nameSpan);

  if (!isDefault) {
    const subCount = document.createElement('span');
    subCount.id = `folder-subfolder-count-${folder.id}`;
    subCount.style.cssText = 'color: rgba(255, 255, 255, 0.6); font-size: 0.7rem;margin-right: 4px;';
    subCount.innerText = `${folder?.subfolders?.length || 0} folder${folder?.subfolders?.length === 1 ? '' : 's'} -`;
    info.appendChild(subCount);

    const convCount = document.createElement('span');
    convCount.id = `folder-conv-count-${folder.id}`;
    convCount.style.cssText = 'color: rgba(255, 255, 255, 0.6); font-size: 0.7rem;';
    convCount.innerText = `${folder.conversation_count || 0} chat${folder.conversation_count === 1 ? '' : 's'}`;
    info.appendChild(convCount);
  }

  el.appendChild(content);

  // Settings button
  const settingsBtn = document.createElement('div');
  settingsBtn.id = `conversation-folder-settings-button-${folder.id}`;
  settingsBtn.className =
    'absolute end-1 items-center justify-center h-6 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary hidden group-hover:flex';
  settingsBtn.innerHTML = DOTS_MENU_SVG;
  settingsBtn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    settingsBtn.classList.replace('hidden', 'flex');
    showConversationManagerFolderMenu(settingsBtn, folder, isSidebar, isSubfolder);
  });

  if (!isReadOnly && folder.id !== 'archived' && !isLocked) {
    el.appendChild(settingsBtn);
  }

  // Close button (for new-chat-in-folder indicator)
  if (showCloseButton) {
    const closeBtn = document.createElement('div');
    closeBtn.id = `conversation-folder-settings-button-${folder.id}`;
    closeBtn.className =
      'cursor-pointer items-center justify-center p-1 rounded-full text-token-text-primary focus-visible:outline-0 bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary';
    closeBtn.innerHTML =
      '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.addEventListener('click', () => {
      folderForNewChat = null;
      initiateNewChatFolderIndicator();
    });
    el.appendChild(closeBtn);
  }

  // Lock icon for premium-only folders
  if (isLocked) {
    const lockDiv = document.createElement('div');
    lockDiv.className = 'absolute end-1 flex items-center justify-center h-6 rounded-lg px-2';
    lockDiv.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="icon icon-lg" fill="#ef4146"><path d="M80 192V144C80 64.47 144.5 0 224 0C303.5 0 368 64.47 368 144V192H384C419.3 192 448 220.7 448 256V448C448 483.3 419.3 512 384 512H64C28.65 512 0 483.3 0 448V256C0 220.7 28.65 192 64 192H80zM144 192H304V144C304 99.82 268.2 64 224 64C179.8 64 144 99.82 144 144V192z"/></svg>';
    el.appendChild(lockDiv);
  }

  return el;
}

// ---------------------------------------------------------------------------
// Folder counts
// ---------------------------------------------------------------------------

export function updateConversationFolderCount(targetFolderId: string | number | null, conversationIds: string[]): void {
  const targetCounts = document.querySelectorAll(`#folder-conv-count-${targetFolderId}`);
  conversationIds.forEach((cid) => {
    const card = document.querySelector(`div#conversation-card-${cid}[data-folder-id]`) as HTMLElement | null;
    if (card) {
      const srcFolder = card.dataset.folderId;
      if (!srcFolder || srcFolder === targetFolderId?.toString()) return;
      if (!isDefaultConvFolder(srcFolder)) {
        document.querySelectorAll(`#folder-conv-count-${srcFolder}`).forEach((el) => {
          const count = parseInt(el.textContent!.split(' ')[0]!, 10) - 1;
          el.textContent = `${count} chat${count !== 1 ? 's' : ''}`;
        });
      }
    }
    if (targetFolderId && !isDefaultConvFolder(targetFolderId.toString())) {
      targetCounts.forEach((el) => {
        const count = parseInt(el.textContent!.split(' ')[0]!, 10) + 1;
        el.textContent = `${count} chat${count !== 1 ? 's' : ''}`;
      });
    }
  });
}

export function resetConversationCounts(): void {
  document.querySelectorAll('span[id^="folder-conv-count-"]').forEach((el) => {
    el.textContent = '0 chats';
  });
}

// ---------------------------------------------------------------------------
// Subfolder fetching
// ---------------------------------------------------------------------------

export const throttleGetConvSubFolders = throttle(async (folderId?: string | number, forceRefresh = false) => {
  await getConvSubFolders(folderId, forceRefresh);
}, 500);

async function getConvSubFolders(folderId?: string | number, forceRefresh = false): Promise<void> {
  const searchTerm = (
    document.querySelector('#modal-manager input[id=conversation-manager-search-input]') as HTMLInputElement
  )?.value;
  if (!folderId && !searchTerm) return;

  const managerList = document.querySelector(
    '#modal-manager #conversation-manager-subfolder-list',
  ) as HTMLElement | null;
  if (managerList) managerList.innerHTML = '';

  const sidebarContent = document.querySelector('#sidebar-folder-drawer #sidebar-folder-content') as HTMLElement | null;
  sidebarContent?.querySelector('#default-conversation-folders')?.remove();
  sidebarContent?.querySelectorAll('div[id^="conversation-folder-wrapper-"]').forEach((el) => el.remove());

  if (isDefaultConvFolder(folderId)) return;

  const { selectedConversationsManagerFoldersSortBy = 'alphabetical' } = cachedSettings;
  chrome.runtime.sendMessage(
    {
      type: 'getConversationFolders',
      forceRefresh,
      detail: searchTerm
        ? { sortBy: selectedConversationsManagerFoldersSortBy, searchTerm }
        : { sortBy: selectedConversationsManagerFoldersSortBy, parentFolderId: folderId },
    },
    (folders: any[]) => {
      if (!folders || !Array.isArray(folders) || folders.length === 0) return;
      folders.forEach((f) => {
        managerList?.appendChild(conversationFolderElement(f, false, true)!);
      });
      if (!searchTerm) {
        [...folders].reverse().forEach((f) => {
          sidebarContent?.prepend(conversationFolderElement(f, true)!);
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Toggle new conversation in folder button
// ---------------------------------------------------------------------------

export function toggleNewConversationInFolderButton(isDefault = true): void {
  folderForNewChat = null;
  initiateNewChatFolderIndicator();
  const lastFolder = getLastSelectedConversationFolder();
  const wrapper = document.querySelector('#new-conversation-in-folder-button-wrapper') as HTMLElement | null;
  const btn = document.querySelector('#new-conversation-in-folder-button') as HTMLElement | null;
  const managerBtn = document.querySelector('#conversation-manager-start-new-chat-button') as HTMLElement | null;

  if (isDefault) {
    wrapper?.classList?.replace('flex', 'hidden');
    if (btn) btn.innerText = translate('Start a New Chat');
    if (managerBtn) managerBtn.innerText = translate('Start a New Chat');
  } else {
    wrapper?.classList?.replace('hidden', 'flex');
    const label = lastFolder?.gizmo_id
      ? translate('Start a new chat with this GPT')
      : translate('Start a new chat in this folder');
    if (btn) btn.innerText = label;
    if (managerBtn) managerBtn.innerText = label;
  }
}

// ---------------------------------------------------------------------------
// Conversation element
// ---------------------------------------------------------------------------

export function createConversationElement(conv: any): HTMLElement {
  const cid = conv.conversation_id || conv.id;
  const lastFolder = getLastSelectedConversationFolder();
  const currentConvId = getConversationIdFromUrl();
  const isDefault = isDefaultConvFolder(lastFolder?.id);
  const searchTerm = (document.querySelector('#sidebar-folder-search-input') as HTMLInputElement)?.value;

  const el = document.createElement('div');
  el.id = `conversation-card-${cid}`;
  el.dataset.conversationId = cid;
  el.style.cssText = 'min-height: 42px;';
  el.draggable = true;
  el.className = `flex items-center justify-between text-token-text-primary text-sm relative rounded-lg ${currentConvId === cid ? 'bg-token-sidebar-surface-tertiary' : ''} hover:bg-token-sidebar-surface-tertiary px-2 py-1 cursor-pointer group`;

  el.innerHTML = `
    ${isDefault || searchTerm ? `<div id="conversation-card-folder-color-indicator-${cid}" data-folder-id="${conv?.folder?.id}" title="${conv?.folder?.name || ''}" class="absolute w-1 h-full top-0 start-0 rounded-s-xl" style="background-color: ${conv?.folder?.name ? `${conv?.folder?.color}` : 'transparent'};"></div>` : ''}
    <div class="flex flex-wrap grow overflow-hidden w-full">
      <div id="conversation-title" title="${conv.title}" class="relative grow overflow-hidden whitespace-nowrap flex items-center ">
        <input id="sidebar-conversation-checkbox-${cid}" data-conversation-id="${cid}" type="checkbox" class="manager-modal border border-token-border-medium me-2" style="margin-left:1px; cursor: pointer; border-radius: 2px; display: ${sidebarSelectedConversationIds.length > 0 ? 'block' : 'none'};">
        <span class="w-full truncate relative">${conv.title || 'New chat'}</span>
      </div>
      <div class="w-full flex flex-wrap text-token-text-tertiary items-center" style="font-size: 0.7rem">
        ${cachedSettings?.showConversationTimestampInSidebar ? `<span class="me-1">${formatDate(new Date(formatTime(conv.update_time || conv.create_time)))}</span>` : ''}
        ${
          cachedSettings?.showConversationIndicatorsInSidebar
            ? `${conversationIndicators(conv)}
        <span title="Favorite conversation" class="me-1">
          <svg id="conversation-favorite-indicator-${cid}" class="icon icon-xs ${conv.is_favorite ? '' : 'hidden'}" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"></path></svg>
        </span>`
            : ''
        }
      </div>
    </div>
    <div id="conversation-card-settings-button-${cid}" class="absolute end-1 items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary hidden group-hover:flex">
      ${DOTS_MENU_SVG}
    </div>
  `;

  // Click: navigate to conversation
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    if (getConversationIdFromUrl() === cid) return;
    removeMiniMap();
    if ((ev as MouseEvent).metaKey || (isWindows() && (ev as MouseEvent).ctrlKey)) {
      window.open(`/c/${cid}`, '_blank');
      return;
    }
    const navLink = document.querySelector(`nav a[href$="/c/${cid}"]`) as HTMLAnchorElement | null;
    const search = (document.querySelector('#sidebar-folder-search-input') as HTMLInputElement)?.value;
    if (navLink && !search) {
      navLink.click();
      setTimeout(() => {
        document.title = navLink.innerText;
      }, 500);
    } else if (search) {
      showConversationPreviewWrapper(cid, null, true);
    } else if (!window.location.href.includes(`/c/${cid}`)) {
      window.history.pushState({}, '', `/c/${cid}`);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    }
    updateSelectedConvCard(cid, true);
  });

  // Hover: show checkbox + settings
  el.addEventListener('mouseenter', () => {
    closeMenus();
    document
      .querySelectorAll('#sidebar-folder-content div[id^="conversation-card-settings-button-"]')
      .forEach((b) => b.classList.replace('flex', 'hidden'));
    const cb = document.querySelector(`#sidebar-conversation-checkbox-${cid}`) as HTMLInputElement | null;
    if (cb) cb.style.display = 'block';
    const title = document.querySelector(`#conversation-card-${cid} #conversation-title`) as HTMLElement | null;
    if (title) title.style.paddingRight = '36px';
  });

  el.addEventListener('mouseleave', () => {
    const cb = document.querySelector(`#sidebar-conversation-checkbox-${cid}`) as HTMLInputElement | null;
    if (cb && sidebarSelectedConversationIds.length === 0) cb.style.display = 'none';
    const title = document.querySelector(`#conversation-card-${cid} #conversation-title`) as HTMLElement | null;
    if (title) title.style.paddingRight = '0px';
  });

  // Checkbox selection with shift-click support
  el.querySelector(`#sidebar-conversation-checkbox-${cid}`)?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    const target = ev.target as HTMLInputElement;
    if (target.checked) {
      if ((ev as MouseEvent).shiftKey && sidebarSelectedConversationIds.length > 0) {
        const lastId = sidebarSelectedConversationIds[sidebarSelectedConversationIds.length - 1];
        sidebarSelectedConversationIds.push(cid);
        const allCbs = document.querySelectorAll(
          'input[id^="sidebar-conversation-checkbox-"]',
        ) as NodeListOf<HTMLInputElement>;
        let inRange = false;
        allCbs.forEach((cb) => {
          if (cb.dataset.conversationId === lastId || cb.dataset.conversationId === cid) inRange = !inRange;
          if (inRange && !sidebarSelectedConversationIds.includes(cb.dataset.conversationId!)) {
            cb.checked = true;
            sidebarSelectedConversationIds.push(cb.dataset.conversationId!);
          }
        });
      } else {
        sidebarSelectedConversationIds.push(cid);
      }
    } else {
      sidebarSelectedConversationIds = sidebarSelectedConversationIds.filter((id) => id !== cid);
    }

    const countLabel = document.querySelector('#sidebar-bulk-action-selected-count') as HTMLElement | null;
    if (countLabel)
      countLabel.textContent = `${sidebarSelectedConversationIds.length} chat${sidebarSelectedConversationIds.length !== 1 ? 's' : ''} selected`;

    const allCheckboxes = document.querySelectorAll(
      'input[id^="sidebar-conversation-checkbox-"]',
    ) as NodeListOf<HTMLInputElement>;
    if (sidebarSelectedConversationIds.length > 0) {
      allCheckboxes.forEach((cb) => {
        cb.style.display = 'block';
      });
      showSidebarBulkActions();
    } else {
      allCheckboxes.forEach((cb) => {
        cb.style.display = 'none';
      });
      hideSidebarBulkActions();
    }
  });

  // Drag events
  el.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    ev.dataTransfer!.setData('text/plain', JSON.stringify({ draggingObject: 'conversation', conversation: conv }));
    ev.dataTransfer!.effectAllowed = 'move';
    el.classList.add('card-dragging');
  });

  el.addEventListener('dragend', (ev) => {
    ev.stopPropagation();
    ev.dataTransfer!.clearData();
    try {
      el.classList.remove('card-dragging');
    } catch (err) {
      console.error('Error removing card-dragging class:', err);
    }
  });

  return el;
}

export function addConversationElementEventListeners(el: HTMLElement, conv: any): void {
  addConversationCardEventListeners(el, conv, true);
}

// ---------------------------------------------------------------------------
// Sidebar bulk actions
// ---------------------------------------------------------------------------

function showSidebarBulkActions(): void {
  if (document.querySelector('#sidebar-bulk-action-wrapper')) return;
  const { showFoldersInLeftSidebar } = cachedSettings;
  const nav = document.querySelector('nav') as HTMLElement | null;
  if (nav) nav.style.position = 'unset';
  const drawer = document.querySelector('#sidebar-folder-drawer') as HTMLElement | null;
  const parent = showFoldersInLeftSidebar ? nav : drawer;
  if (!parent) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'sidebar-bulk-action-wrapper';
  wrapper.className =
    'w-full m-2 p-1 absolute bottom-0 start-0 bg-token-main-surface-tertiary z-50 rounded-lg shadow-long';
  wrapper.style.cssText = `width: calc(100% - 16px);backdrop-filter: blur(3px);background: ${isDarkMode() ? '#3e3e3ee0' : '#ececece0'}`;
  wrapper.innerHTML = `
    <div class="w-full p-2 flex items-center justify-between text-token-text-primary text-sm font-medium">
      <span id="sidebar-bulk-action-selected-count">1 chat selected</span>
      <div id="sidebar-bulk-action-reset-button" class="btn btn-secondary btn-small cursor-pointer">Cancel</div>
    </div>
    <div class="grid" style="grid-template-columns: repeat(5, minmax(0, 1fr));">
      <div id="sidebar-bulk-action-move-button" class="relative flex items-center justify-center px-2 text-token-red focus-visible:outline-0 hover:bg-token-main-surface-secondary focus-visible:bg-token-sidebar-surface-secondary h-12 rounded-lg cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" stroke-width="2" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>
      </div>
      <div id="sidebar-bulk-action-add-to-project-button" class="relative flex items-center justify-center px-2 text-token-red focus-visible:outline-0 hover:bg-token-main-surface-secondary focus-visible:bg-token-sidebar-surface-secondary h-12 rounded-lg cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" stroke="currentColor" fill="currentColor" class="icon icon-md"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>
      </div>
      <div id="sidebar-bulk-action-export-button" class="relative flex items-center justify-center px-2 text-token-red focus-visible:outline-0 hover:bg-token-main-surface-secondary focus-visible:bg-token-sidebar-surface-secondary h-12 rounded-lg cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linejoin="round" class="icon icon-md"><path d="M568.1 303l-80-80c-9.375-9.375-24.56-9.375-33.94 0s-9.375 24.56 0 33.94L494.1 296H216C202.8 296 192 306.8 192 320s10.75 24 24 24h278.1l-39.03 39.03C450.3 387.7 448 393.8 448 400s2.344 12.28 7.031 16.97c9.375 9.375 24.56 9.375 33.94 0l80-80C578.3 327.6 578.3 312.4 568.1 303zM360 384c-13.25 0-24 10.74-24 24V448c0 8.836-7.164 16-16 16H64.02c-8.836 0-16-7.164-16-16L48 64.13c0-8.836 7.164-16 16-16h160L224 128c0 17.67 14.33 32 32 32h79.1v72c0 13.25 10.74 24 23.1 24S384 245.3 384 232V138.6c0-16.98-6.742-33.26-18.75-45.26l-74.63-74.64C278.6 6.742 262.3 0 245.4 0H63.1C28.65 0-.002 28.66 0 64l.0065 384c.002 35.34 28.65 64 64 64H320c35.2 0 64-28.8 64-64v-40C384 394.7 373.3 384 360 384z"/></svg>
      </div>
      <div id="sidebar-bulk-action-archive-button" class="relative flex items-center justify-center px-2 text-token-red focus-visible:outline-0 hover:bg-token-main-surface-secondary focus-visible:bg-token-sidebar-surface-secondary h-12 rounded-lg cursor-pointer">
        <svg viewBox="0 0 18 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.62188 3.07918C3.87597 2.571 4.39537 2.25 4.96353 2.25H13.0365C13.6046 2.25 14.124 2.571 14.3781 3.07918L15.75 5.82295V13.5C15.75 14.7426 14.7426 15.75 13.5 15.75H4.5C3.25736 15.75 2.25 14.7426 2.25 13.5V5.82295L3.62188 3.07918ZM13.0365 3.75H4.96353L4.21353 5.25H13.7865L13.0365 3.75ZM14.25 6.75H3.75V13.5C3.75 13.9142 4.08579 14.25 4.5 14.25H13.5C13.9142 14.25 14.25 13.9142 14.25 13.5V6.75ZM6.75 9C6.75 8.58579 7.08579 8.25 7.5 8.25H10.5C10.9142 8.25 11.25 8.58579 11.25 9C11.25 9.41421 10.9142 9.75 10.5 9.75H7.5C7.08579 9.75 6.75 9.41421 6.75 9Z" fill="currentColor"></path></svg>
      </div>
      <div id="sidebar-bulk-action-delete-button" class="relative flex items-center justify-center px-2 text-token-red focus-visible:outline-0 hover:bg-token-main-surface-secondary focus-visible:bg-token-sidebar-surface-secondary text-red-500 h-12 rounded-lg cursor-pointer">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>
      </div>
    </div>`;
  parent.appendChild(wrapper);

  const isArchived = getLastSelectedConversationFolder()?.id === 'archived';
  const resetBtn = document.querySelector('#sidebar-bulk-action-reset-button') as HTMLElement;
  const moveBtn = document.querySelector('#sidebar-bulk-action-move-button') as HTMLElement;
  const projectBtn = document.querySelector('#sidebar-bulk-action-add-to-project-button') as HTMLElement;
  const exportBtn = document.querySelector('#sidebar-bulk-action-export-button') as HTMLElement;
  const archiveBtn = document.querySelector('#sidebar-bulk-action-archive-button') as HTMLElement;
  const deleteBtn = document.querySelector('#sidebar-bulk-action-delete-button') as HTMLElement;

  addTooltip(moveBtn, { value: 'Move to folder', position: 'top' }, { left: 20 });
  addTooltip(projectBtn, { value: 'Add to project', position: 'top' });
  addTooltip(exportBtn, { value: 'Export', position: 'top' });
  addTooltip(archiveBtn, { value: isArchived ? 'Unarchive' : 'Archive', position: 'top' });
  addTooltip(deleteBtn, { value: 'Delete', position: 'top' });

  resetBtn?.addEventListener('click', () => resetSidebarConversationSelection());
  moveBtn?.addEventListener('click', () => openMoveConvToFolderModal(sidebarSelectedConversationIds));
  projectBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    showProjectsList(projectBtn, sidebarSelectedConversationIds, true);
  });
  exportBtn?.addEventListener('click', () => openExportModal(sidebarSelectedConversationIds, 'selected'));
  archiveBtn?.addEventListener('click', () => {
    getLastSelectedConversationFolder()?.id === 'archived'
      ? handleClickUnarchiveConversationsButton(sidebarSelectedConversationIds)
      : handleClickArchiveConversationsButton(sidebarSelectedConversationIds);
  });
  deleteBtn?.addEventListener('click', () => handleDeleteSelectedConversations(sidebarSelectedConversationIds));
}

function hideSidebarBulkActions(): void {
  document.querySelector('#sidebar-bulk-action-wrapper')?.remove();
}

export function resetSidebarConversationSelection(): void {
  hideSidebarBulkActions();
  sidebarSelectedConversationIds = [];
  document.querySelectorAll('input[id^="sidebar-conversation-checkbox-"]').forEach((el) => {
    (el as HTMLInputElement).checked = false;
    (el as HTMLElement).style.display = 'none';
  });
}

// ---------------------------------------------------------------------------
// Favorite / project indicator toggles
// ---------------------------------------------------------------------------

export function toggleFavoriteIndicator(convId: string, show: boolean): void {
  document.querySelectorAll(`#conversation-favorite-indicator-${convId}`).forEach((el) => {
    show ? el.classList.remove('hidden') : el.classList.add('hidden');
  });
}

// ---------------------------------------------------------------------------
// Sidebar folder drawer
// ---------------------------------------------------------------------------

export async function addSidebarFolderDrawer(): Promise<void> {
  const { showFoldersInLeftSidebar } = cachedSettings;
  if (showFoldersInLeftSidebar) closeSidebarFolder();

  const lastFolder = getLastSelectedConversationFolder();
  const isDefault = isDefaultConvFolder(lastFolder?.id);
  const isAllOrNone = !lastFolder || lastFolder?.id === 'all';

  const drawer = document.createElement('div');
  drawer.id = 'sidebar-folder-drawer';
  drawer.className = `overflow-hidden transition transition-width flex flex-col h-full z-20 ${showFoldersInLeftSidebar ? 'w-full bg-transparent' : 'absolute end-0 top-0 w-0 bg-token-sidebar-surface-primary'}`;

  // Header row: move-to-left, search, new folder, move-to-right
  const header = document.createElement('div');
  header.className = `w-full ${showFoldersInLeftSidebar ? 'pb-3' : 'p-3'} flex justify-between`;

  // Move to left sidebar button
  const moveLeftBtn = document.createElement('button');
  moveLeftBtn.id = 'move-to-left-sidebar';
  moveLeftBtn.className = `flex items-center justify-center h-full rounded-lg me-1 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary px-1 ${showFoldersInLeftSidebar ? 'hidden' : ''}`;
  moveLeftBtn.innerHTML =
    '<svg fill="currentColor" class="icon icon-sm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M105.4 233.8C99.13 240 96 248.2 96 256.4S99.13 272.8 105.4 279l150.4 135.9C286.7 442.8 336 420.9 336 379.3v-42.91h64c26.51 0 48-21.49 48-48v-64c0-26.51-21.49-48-48-48h-64V133.1c0-41.63-49.37-63.52-80.23-35.58L105.4 233.8zM288 224.4h112v64H288v89.37L150.6 256.4L288 135V224.4zM48 424V88C48 74.75 37.25 64 24 64S0 74.75 0 88v336C0 437.3 10.75 448 24 448S48 437.3 48 424z"/></svg>';
  addTooltip(moveLeftBtn, { value: 'Move to Left Sidebar', position: 'left' });
  moveLeftBtn.addEventListener('click', () => {
    chrome.storage.local
      .set({ settings: { ...cachedSettings, showFoldersInLeftSidebar: true } })
      .then(() => toggleLeftSidebarSwitch(true));
  });
  header.appendChild(moveLeftBtn);

  // Search input
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'flex-grow w-full';
  header.appendChild(searchWrapper);

  const searchInput = document.createElement('input');
  searchInput.id = 'sidebar-folder-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = translate('Search conversations');
  searchInput.className =
    'w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary';

  const debouncedSearch = debounce(() => {
    const content = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
    if (content) content.innerHTML = '';
    loadSidebarFolders();
    const bc = document.querySelector('#sidebar-folder-breadcrumb') as HTMLElement | null;
    if (bc) {
      selectedConversationFolderBreadcrumb = [];
      chrome.storage.local.set({ selectedConversationFolderBreadcrumb });
      generateConvFolderBreadcrumb(bc, true);
    }
    fetchSidebarConversations();
  });

  searchInput.addEventListener('input', (ev) => {
    const val = (ev.target as HTMLInputElement).value.trim();
    if (val.length > 2) debouncedSearch();
    else if ((ev.target as HTMLInputElement).value.length === 0) loadSidebarFolders();
  });
  searchWrapper.appendChild(searchInput);

  // Search hint
  const searchHint = document.createElement('div');
  searchHint.id = 'sidebar-folder-search-hint';
  searchHint.className = `flex w-full items-center text-token-text-tertiary text-xs mt-1 ${searchInput.value.length === 0 ? 'hidden' : ''}`;
  searchWrapper.appendChild(searchHint);

  searchInput.addEventListener('input', (ev) => {
    const val = (ev.target as HTMLInputElement).value.trim();
    if (val.length > 0) {
      searchHint.classList.remove('hidden');
      searchHint.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-sm me-2"><path d="M14.086 8.75a5.335 5.335 0 1 0-10.67 0 5.335 5.335 0 0 0 10.67 0m1.33 0a6.64 6.64 0 0 1-1.512 4.225l.066.055 3 3 .086.104a.666.666 0 0 1-.922.922l-.104-.085-3-3-.055-.068a6.665 6.665 0 1 1 2.44-5.153"/></svg> <span class="text-danger truncate">${val}</span>`;
    } else {
      searchHint.classList.add('hidden');
      searchHint.innerText = '';
    }
  });

  // New folder button
  const newFolderBtn = document.createElement('button');
  newFolderBtn.id = 'sidebar-new-folder-button';
  newFolderBtn.className =
    'flex items-center justify-center h-full rounded-lg p-2 ms-1 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary';
  newFolderBtn.innerHTML = NEW_FOLDER_SVG;
  addTooltip(newFolderBtn, { value: 'Add New Folder', position: showFoldersInLeftSidebar ? 'top' : 'left' });

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    newFolderBtn.addEventListener('click', () => {
      const current = getLastSelectedConversationFolder();
      if (current && isDefaultConvFolder(current.id)) {
        toast('You cannot add a folder to this folder.', 'error');
        return;
      }
      const existing = document.querySelectorAll(
        '#sidebar-folder-drawer #sidebar-folder-content > div[id^="conversation-folder-wrapper-"]',
      );
      if (!hasSub && existing.length >= 5) {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message:
            'You have reached the limits of Conversation Folders with free account. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      document.querySelectorAll('#no-conversation-folders').forEach((el) => el.remove());
      const newData: any = { name: 'New Folder', color: generateRandomDarkColor() };
      if (current) {
        newData.profile = current.profile?.id;
        newData.color = current.color;
        newData.parent_folder = current.id;
        newData.image_url = current.image || current.image_url;
        newData.gizmo_id = current.gizmo_id;
      }
      chrome.runtime.sendMessage({ type: 'addConversationFolders', detail: { folders: [newData] } }, (result: any) => {
        if (result?.error?.type === 'limit') {
          errorUpgradeConfirmation(result.error);
          return;
        }
        if (!result || result.length === 0) return;
        addNewConvFolderElementToSidebar(result[0]);
        handleRenameConversationFolderClick(result[0].id, true);
      });
    });
  });
  header.appendChild(newFolderBtn);

  // Move to right sidebar button
  const moveRightBtn = document.createElement('button');
  moveRightBtn.id = 'move-to-right-sidebar';
  moveRightBtn.className = `flex items-center justify-center h-full rounded-lg text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary py-3 px-1 ${showFoldersInLeftSidebar ? '' : 'hidden'}`;
  moveRightBtn.innerHTML =
    '<svg fill="currentColor" class="icon icon-sm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M448 424V88C448 74.75 437.3 64 424 64S400 74.75 400 88v336c0 13.25 10.75 24 24 24S448 437.3 448 424zM342.6 278.3C348.9 272 352 263.8 352 255.6S348.9 239.3 342.6 233L192.2 97.09C161.3 69.21 112 91.11 112 132.7v42.91h-64c-26.51 0-48 21.49-48 48v64c0 26.51 21.49 48 48 48h64v43.29c0 41.63 49.37 63.52 80.23 35.58L342.6 278.3zM160 287.6H48v-64H160V134.3l137.4 121.4L160 376.1V287.6z"/></svg>';
  addTooltip(moveRightBtn, { value: 'Move to Right Sidebar', position: 'top' });
  moveRightBtn.addEventListener('click', () => {
    chrome.storage.local
      .set({ settings: { ...cachedSettings, showFoldersInLeftSidebar: false } })
      .then(() => toggleLeftSidebarSwitch(false));
  });
  header.appendChild(moveRightBtn);
  drawer.appendChild(header);

  // Breadcrumb row
  const bcRow = document.createElement('div');
  bcRow.className = `flex items-center justify-start pb-3 ${showFoldersInLeftSidebar ? '' : 'px-3'} w-full`;
  const bcEl = document.createElement('div');
  bcEl.id = 'sidebar-folder-breadcrumb';
  bcEl.className =
    'flex flex-wrap items-center justify-start bg-token-main-surface-tertiary p-2 rounded-lg border border-token-border-medium w-full';

  bcEl.addEventListener('click', async (ev) => {
    const target = ev.target as HTMLElement;
    if (!target?.matches('[data-folder-id]')) return;
    const fid = target.getAttribute('data-folder-id')!;
    resetSidebarConversationSelection();

    if (fid === 'root') {
      const si = document.querySelector('#sidebar-folder-search-input') as HTMLInputElement | null;
      if (
        !document.querySelector('#sidebar-folder-content #loading-spinner-sidebar-folder-content') &&
        selectedConversationFolderBreadcrumb.length === 0 &&
        si?.value === ''
      )
        return;
      selectedConversationFolderBreadcrumb = [];
      clearSidebarSearchInput();
      await chrome.storage.local.set({ selectedConversationFolderBreadcrumb });
      generateConvFolderBreadcrumb(bcEl, true);
      loadSidebarFolders();
      toggleNewConversationInFolderButton(true);
      return;
    }

    const idx = selectedConversationFolderBreadcrumb.findIndex((f: any) => f.id.toString() === fid.toString());
    if (idx !== -1 && (idx < selectedConversationFolderBreadcrumb.length - 1 || (ev as MouseEvent).shiftKey)) {
      selectedConversationFolderBreadcrumb = selectedConversationFolderBreadcrumb.slice(0, idx + 1);
      await chrome.storage.local.set({ selectedConversationFolderBreadcrumb });
      toggleNewConversationInFolderButton(isDefaultConvFolder(fid));
      generateConvFolderBreadcrumb(bcEl, true);
      throttleGetConvSubFolders(fid, (ev as MouseEvent).shiftKey);
      throttleFetchSidebarConversations(1, false, (ev as MouseEvent).shiftKey);
    }
  });

  bcRow.appendChild(bcEl);
  drawer.appendChild(bcRow);

  // New conversation in folder button
  const newConvWrapper = document.createElement('div');
  newConvWrapper.id = 'new-conversation-in-folder-button-wrapper';
  newConvWrapper.className = `items-center justify-start pb-3 ${showFoldersInLeftSidebar ? '' : 'px-3'} w-full ${isDefault || isAllOrNone ? 'hidden' : 'flex'}`;
  const newConvBtn = document.createElement('button');
  newConvBtn.id = 'new-conversation-in-folder-button';
  newConvBtn.className = 'btn btn-secondary w-full';
  newConvBtn.innerHTML = lastFolder?.gizmo_id
    ? translate('Start a new chat with this GPT')
    : translate('Start a new chat in this folder');
  newConvBtn.addEventListener('click', () => {
    const current = getLastSelectedConversationFolder();
    folderForNewChat = current;
    startNewChat(false, current?.gizmo_id);
    initiateNewChatFolderIndicator();
  });
  newConvWrapper.appendChild(newConvBtn);
  drawer.appendChild(newConvWrapper);

  // Content area
  const contentArea = document.createElement('div');
  contentArea.id = 'sidebar-folder-content';
  contentArea.className = `relative pb-20 ${showFoldersInLeftSidebar ? '' : 'px-3'} overflow-y-auto min-w-full h-full`;
  contentArea.appendChild(loadingSpinner('sidebar-folder-content'));
  drawer.appendChild(contentArea);

  // Prevent duplicate
  if (document.querySelector('#sidebar-folder-drawer')) return;

  // Insert into DOM
  const nav = document.querySelector('nav') as HTMLElement | null;
  if (nav && showFoldersInLeftSidebar) {
    const history = getOriginalHistory();
    if (history) {
      history.style.padding = '8px';
      history.classList.add('hide-asides');
      history.appendChild(drawer);
      setTimeout(() => history.classList.add('hide-asides'), 1000);
    }
  } else {
    const mainContainer = document.querySelector('div[class*="@container/main"]') as HTMLElement | null;
    if (!mainContainer) return;
    mainContainer.appendChild(drawer);
  }

  generateConvFolderBreadcrumb(bcEl, true);

  const floatingBtns = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
  if (showFoldersInLeftSidebar) {
    drawer.style.width = '100%';
  } else {
    const pageHeader = document.querySelector('header[id="page-header"]') as HTMLElement | null;
    const main = document.querySelector('main') as HTMLElement | null;
    if (!pageHeader || !main) return;
    if (sidebarFolderIsOpen()) {
      drawer.style.width = '280px';
      main.style.width = 'calc(100% - 280px)';
      pageHeader.style.width = 'calc(100% - 280px)';
      if (floatingBtns) floatingBtns.style.right = 'calc(1rem + 280px)';
    } else if (!sidebarNoteIsOpen) {
      drawer.style.width = '0';
      main.style.width = '100%';
      pageHeader.style.width = '100%';
      if (floatingBtns) floatingBtns.style.right = '3rem';
    }
  }
}

// ---------------------------------------------------------------------------
// Sidebar toggle
// ---------------------------------------------------------------------------

export async function toggleSidebarFolder(): Promise<void> {
  closeSidebarNote();
  const pageHeader = document.querySelector('header[id="page-header"]') as HTMLElement | null;
  const main = document.querySelector('main') as HTMLElement | null;
  if (!pageHeader || !main) return;

  const floatingBtns = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
  const drawer = document.querySelector('#sidebar-folder-drawer') as HTMLElement | null;
  if (!drawer) await addSidebarFolderDrawer();

  if (sidebarFolderIsOpen()) {
    if (drawer) drawer.style.width = '0';
    window.localStorage.setItem('sp/sidebarFolderIsOpen', 'false');
    main.style.width = '100%';
    pageHeader.style.width = '100%';
    if (floatingBtns) floatingBtns.style.right = '3rem';
  } else {
    window.localStorage.setItem('sp/sidebarFolderIsOpen', 'true');
    if (drawer) drawer.style.width = '280px';
    main.style.width = 'calc(100% - 280px)';
    pageHeader.style.width = 'calc(100% - 280px)';
    if (floatingBtns) floatingBtns.style.right = 'calc(1rem + 280px)';
  }
}

export function closeSidebarFolder(): void {
  const { showFoldersInLeftSidebar } = cachedSettings;
  if (showFoldersInLeftSidebar) return;
  const drawer = document.querySelector('#sidebar-folder-drawer') as HTMLElement | null;
  if (drawer) drawer.style.width = '0';
  window.localStorage.setItem('sp/sidebarFolderIsOpen', 'false');
}

// ---------------------------------------------------------------------------
// Load sidebar folders
// ---------------------------------------------------------------------------

export async function loadSidebarFolders(forceRefresh = false): Promise<void> {
  const { selectedConversationsManagerFoldersSortBy = 'alphabetical' } = cachedSettings;
  const content = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
  if (!content) return;

  if (!document.querySelector('#sidebar-folder-drawer #loading-spinner-sidebar-folder-content')) {
    content.innerHTML = '';
    content.appendChild(loadingSpinner('sidebar-folder-content'));
  }

  const searchTerm = (document.querySelector('#sidebar-folder-search-input') as HTMLInputElement)?.value;

  chrome.runtime.sendMessage(
    {
      type: 'getConversationFolders',
      forceRefresh,
      detail: { sortBy: selectedConversationsManagerFoldersSortBy, searchTerm },
    },
    async (folders: any[]) => {
      if (!folders || !Array.isArray(folders)) return;
      document.querySelector('#loading-spinner-sidebar-folder-content')?.remove();

      if (!document.querySelector('#sidebar-folder-drawer')) await addSidebarFolderDrawer();
      if (!searchTerm) {
        content.innerHTML = '';
        content.appendChild(defaultConversationFoldersList(true));
      }

      if (folders.length === 0 && !searchTerm) {
        const last = getLastSelectedConversationFolder();
        if (!last || last?.id === 'root') content.appendChild(noConversationFolderElemet());
      }

      folders.forEach((f) => content.appendChild(conversationFolderElement(f, true)!));

      if (selectedConversationFolderBreadcrumb.length > 0) {
        const last = getLastSelectedConversationFolder();
        throttleGetConvSubFolders(last.id);
        throttleFetchSidebarConversations();
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Fetch sidebar conversations
// ---------------------------------------------------------------------------

export const throttleFetchSidebarConversations = throttle(
  async (page = 1, fullSearch = false, forceRefresh = false) => {
    await fetchSidebarConversations(page, fullSearch, forceRefresh);
  },
  1000,
);

export async function fetchSidebarConversations(page = 1, fullSearch = false, forceRefresh = false): Promise<void> {
  const searchTerm = (document.querySelector('#sidebar-folder-search-input') as HTMLInputElement)?.value;
  const lastFolder = getLastSelectedConversationFolder();
  const newConvWrapper = document.querySelector('#new-conversation-in-folder-button-wrapper') as HTMLElement | null;
  if (!lastFolder && !searchTerm) return;
  const content = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
  if (!content) return;

  if (page === 1) {
    document.querySelectorAll('#sidebar-folder-drawer #load-more-conversations-button')?.forEach((el) => el.remove());
    content.querySelector('button[id^="full-search-button"]')?.remove();
    content.querySelector('p[id^="no-conversations-found"]')?.remove();
    content.querySelector('p[id^="no-conversation-folder"]')?.remove();
    content.querySelectorAll('div[id^="conversation-card-"]')?.forEach((el) => el.remove());
    content.appendChild(loadingSpinner('sidebar-folder-content'));
  }

  if (searchTerm) newConvWrapper?.classList.replace('flex', 'hidden');

  let results: any[] = [];
  let hasMore = false;

  if (searchTerm === '' && lastFolder?.id === 'archived') {
    const offset = (page - 1) * 100;
    const limit = 100;
    try {
      const resp = await getConversations(offset, limit, 'updated', true, forceRefresh);
      results = syncHistoryResponseToConversationDB(resp, true);
      hasMore = resp.total > offset + limit;
    } catch {
      const loadMoreBtn = document.querySelector(
        '#sidebar-folder-drawer #load-more-conversations-button',
      ) as HTMLElement | null;
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<div class="w-full h-full flex items-center justify-center">Load more...</div>';
        loadMoreBtn.onclick = () => fetchSidebarConversations(page + 1, fullSearch, forceRefresh);
        return;
      }
    }
  } else {
    document.querySelectorAll('#sidebar-folder-drawer #load-more-conversations-button')?.forEach((el) => el.remove());
    const { selectedConversationsManagerSortBy, excludeConvInFolders } = cachedSettings;
    const sortCode = selectedConversationsManagerSortBy?.code;
    const resp = await chrome.runtime.sendMessage({
      type: 'getConversations',
      forceRefresh,
      detail: {
        pageNumber: page,
        searchTerm,
        sortBy: searchTerm || ['all', 'archived'].includes(lastFolder?.id) ? 'updated_at' : sortCode,
        fullSearch,
        folderId: searchTerm || typeof lastFolder?.id === 'string' ? null : lastFolder?.id,
        isArchived: lastFolder?.id === 'archived' ? true : null,
        isFavorite: lastFolder?.id === 'favorites' ? true : null,
        excludeConvInFolders: lastFolder?.id === 'all' && excludeConvInFolders,
      },
    });
    results = resp.results;
    hasMore = resp.next;
  }

  document.querySelector('#sidebar-folder-drawer #loading-spinner-sidebar-folder-content')?.remove();

  if (results?.length === 0 && page === 1) {
    if (searchTerm && !fullSearch) {
      const fullBtn = createFullSearchButton(true);
      content.appendChild(fullBtn);
      fullBtn.click();
    } else {
      content.appendChild(noConversationElement());
    }
  } else {
    results?.forEach((conv) => {
      const el = createConversationElement(conv);
      content.appendChild(el);
      addConversationElementEventListeners(el, conv);
    });
    matchConversationNames();

    if (hasMore) {
      const loadMore = document.createElement('button');
      loadMore.id = 'load-more-conversations-button';
      loadMore.className =
        'flex items-center justify-between text-token-text-primary text-sm relative rounded-lg px-2 py-1 cursor-pointer w-full h-10';
      loadMore.appendChild(loadingSpinner('load-more-conversations-button'));
      content.appendChild(loadMore);
      loadMore.onclick = () => fetchSidebarConversations(page + 1, fullSearch, forceRefresh);

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              fetchSidebarConversations(page + 1, fullSearch, forceRefresh);
              observer.disconnect();
            }
          });
        },
        { threshold: 0.5 },
      );
      observer.observe(loadMore);
    } else if (searchTerm && !fullSearch) {
      content.appendChild(createFullSearchButton(true));
    }
  }
}

// ---------------------------------------------------------------------------
// Match conversation names from native sidebar
// ---------------------------------------------------------------------------

export function matchConversationNames(animate = false): void {
  const cards = Array.from(
    document.querySelectorAll('#sidebar-folder-content div[id^=conversation-card-][data-conversation-id]'),
  ).slice(0, 5);
  cards.forEach((card, idx) => {
    const cid = (card as HTMLElement).dataset.conversationId!;
    const navLink = document.querySelector(`nav a[href$="/c/${cid}"]`) as HTMLElement | null;
    if (!navLink || navLink.innerText === 'New chat') return;
    const titleEl = card.querySelector('#conversation-title') as HTMLElement | null;
    if (!titleEl || titleEl.innerText === navLink.innerText || titleEl.innerText !== 'New chat') return;
    if (idx === 0 && animate) {
      animateConversationName(titleEl, navLink.innerText);
    } else {
      titleEl.innerHTML = navLink.innerText;
    }
  });
}

function animateConversationName(el: HTMLElement, text: string): void {
  el.innerText = '';
  text.split('').forEach((char, i) => {
    setTimeout(() => {
      el.innerHTML += char;
    }, i * 50);
  });
}

// ---------------------------------------------------------------------------
// Add new folder element to sidebar
// ---------------------------------------------------------------------------

function addNewConvFolderElementToSidebar(folder: any): void {
  const defaultEl = document.querySelector('#sidebar-folder-content #default-conversation-folders');
  const newEl = conversationFolderElement(folder, true)!;
  if (defaultEl) {
    defaultEl.after(newEl);
  } else {
    document.querySelector('#sidebar-folder-content')?.prepend(newEl);
  }
  document
    .querySelector(`#sidebar-folder-content #conversation-folder-wrapper-${folder.id}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

export function addNewConvFolderElementToManagerSidebar(folder: any): void {
  const sidebar = document.querySelector('#modal-manager #conversation-manager-sidebar-folders');
  if (!sidebar) return;
  sidebar.appendChild(conversationFolderElement(folder)!);
  sidebar.scrollTop = sidebar.scrollHeight;
}

// ---------------------------------------------------------------------------
// Sidebar folder button (right sidebar toggle tab)
// ---------------------------------------------------------------------------

function addSidebarFolderButton(): void {
  document.querySelector('#sidebar-folder-button')?.remove();
  const { showSidebarFolderButton } = cachedSettings;
  const btn = document.createElement('button');
  btn.id = 'sidebar-folder-button';
  btn.innerHTML = translate('Folders');
  btn.className = `absolute flex items-center justify-center border border-token-border-medium text-token-text-tertiary hover:border-token-border-medium hover:text-token-text-primary text-xs font-sans cursor-pointer rounded-t-md z-10 bg-token-main-surface-primary hover:bg-token-main-surface-secondary opacity-85 hover:opacity-100 ${showSidebarFolderButton ? '' : 'hidden'}`;
  btn.style.cssText = 'top: 16rem;right: -1rem;width: 4rem;height: 2rem;flex-wrap:wrap;transform: rotate(-90deg);';
  addTooltip(btn, { value: () => (sidebarFolderIsOpen() ? 'Close Folders' : 'Open Folders'), position: 'left' });
  btn.addEventListener('click', () => toggleSidebarFolder());
  document.body.appendChild(btn);
}

export async function createSidebarFolderButton(location: Location = window.location): Promise<void> {
  const nav = document.querySelector('nav') as HTMLElement | null;
  let history = getOriginalHistory();
  const { showFoldersInLeftSidebar } = cachedSettings;

  if (document.querySelector('#sidebar-folder-drawer')) {
    if (showFoldersInLeftSidebar && nav) history?.classList.add('hide-asides');
    return;
  }

  if (showFoldersInLeftSidebar && !nav) return;

  if (showFoldersInLeftSidebar && nav) {
    if (history) {
      const prev = history.previousElementSibling as HTMLElement | null;
      if (prev?.hasAttribute('aria-expanded')) prev.style.display = 'none';
    } else {
      let attempts = 0;
      const interval = setInterval(() => {
        history = getOriginalHistory();
        if (history || attempts >= 50) {
          clearInterval(interval);
          createSidebarFolderButton(location);
        }
        attempts += 1;
      }, 100);
      return;
    }
  }

  const isGpts = location.pathname.includes('/gpts');
  const isAdmin = location.pathname.includes('/admin');

  if (!showFoldersInLeftSidebar) {
    const existing = document.querySelector('#sidebar-folder-button');
    if (existing) (existing as HTMLElement).classList.remove('hidden');
    else addSidebarFolderButton();
  }

  await addSidebarFolderDrawer();

  if (!showFoldersInLeftSidebar && (isGpts || isAdmin)) {
    (document.querySelector('#sidebar-folder-button') as HTMLElement)?.classList.add('hidden');
    const floatingBtns = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
    if (floatingBtns) floatingBtns.style.right = '3rem';
  } else {
    loadSidebarFolders();
    setTimeout(() => {
      if (document.querySelector('#sidebar-folder-drawer #loading-spinner-sidebar-folder-content'))
        loadSidebarFolders();
    }, 2000);
  }
}

// ---------------------------------------------------------------------------
// Add conversation to sidebar folder
// ---------------------------------------------------------------------------

export async function addConversationToSidebarFolder(conv: any, folderId: string | number = 'all'): Promise<void> {
  const lastFolder = getLastSelectedConversationFolder();
  if (lastFolder?.id !== 'all' && lastFolder?.id !== folderId) return;
  const { excludeConvInFolders } = cachedSettings;
  if (lastFolder?.id === 'all' && excludeConvInFolders && folderId !== 'favorites') return;

  const content = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
  if (!content) return;

  if (content.querySelector('#loading-spinner-sidebar-folder-content')) {
    setTimeout(() => addConversationToSidebarFolder(conv, folderId), 300);
    return;
  }

  const existing = document.querySelector(
    `#sidebar-folder-content #conversation-card-${conv.conversation_id}`,
  ) as HTMLElement | null;
  let isFav = false;
  let hasNote = false;
  let folderInfo: any = {};

  if (existing) {
    isFav = !existing.querySelector('svg[id^="conversation-favorite-indicator-"]')?.classList.contains('hidden');
    hasNote = !existing.querySelector('svg[id^="conversation-note-indicator-"]')?.classList.contains('hidden');
    const colorIndicator = existing.querySelector(
      'div[id^="conversation-card-folder-color-indicator-"]',
    ) as HTMLElement | null;
    if (colorIndicator) {
      folderInfo = {
        id: colorIndicator.dataset.folderId,
        name: colorIndicator.title,
        color: rgba2hex(colorIndicator.style.backgroundColor),
      };
    }
    existing.remove();
  } else {
    const indicator = document.querySelector(
      `#sidebar-folder-content div[id^="conversation-card-folder-color-indicator-"][data-folder-id="${folderId}"]`,
    ) as HTMLElement | null;
    if (indicator) {
      folderInfo = {
        id: indicator.dataset.folderId,
        name: indicator.title,
        color: rgba2hex(indicator.style.backgroundColor),
      };
    }
  }

  const newEl = createConversationElement({ ...conv, is_favorite: isFav, has_note: hasNote, folder: folderInfo });
  const noConv = document.querySelector('#sidebar-folder-content #no-conversations-found');
  const firstCard = document.querySelector('#sidebar-folder-content div[id^=conversation-card-]');
  if (noConv) {
    noConv.remove();
    content.appendChild(newEl);
  } else if (firstCard) firstCard.before(newEl);
  else content.appendChild(newEl);

  addConversationElementEventListeners(newEl, conv);
  setTimeout(() => matchConversationNames(true), 2000);
}

export async function replaceConversationInSidebarFolder(conv: any): Promise<void> {
  if (!document.querySelector('#sidebar-folder-content')) return;
  const newEl = createConversationElement(conv);
  const existing = document.querySelector(`#sidebar-folder-content #conversation-card-${conv.conversation_id}`);
  if (existing) existing.replaceWith(newEl);
  addConversationElementEventListeners(newEl, conv);
}

// ---------------------------------------------------------------------------
// Go to folder
// ---------------------------------------------------------------------------

export async function goToFolder(breadcrumb: any[]): Promise<void> {
  const content = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
  if (!content) return;
  content.innerHTML = '';

  const bcEl = document.querySelector('#sidebar-folder-breadcrumb') as HTMLElement | null;
  if (bcEl) {
    selectedConversationFolderBreadcrumb = breadcrumb;
    chrome.storage.local.set({ selectedConversationFolderBreadcrumb });
    generateConvFolderBreadcrumb(bcEl, true);
  }

  const lastId = breadcrumb[breadcrumb.length - 1]?.id;
  toggleNewConversationInFolderButton(isDefaultConvFolder(lastId));
  await throttleGetConvSubFolders(lastId || 'root');
  await throttleFetchSidebarConversations(1, false, true);
}

// ---------------------------------------------------------------------------
// Rename folder
// ---------------------------------------------------------------------------

export function handleRenameConversationFolderClick(folderId: string | number, isSidebar = false): void {
  let submitted = false;
  closeMenus();

  const input = document.createElement('input');
  const nameEl = document.querySelector(
    `${isSidebar ? '#sidebar-folder-drawer' : '#modal-manager'} #conversation-folder-name-${folderId}`,
  ) as HTMLElement | null;
  const oldName = nameEl?.innerText || '';

  input.id = `conversation-folder-rename-${folderId}`;
  input.className = 'border-0 bg-transparent p-0 focus:ring-0 focus-visible:ring-0 w-full text-white text-sm';
  input.value = oldName;
  nameEl?.parentElement?.replaceChild(input, nameEl);
  input.focus();
  setTimeout(() => input.select(), 50);

  input.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();
    input.focus();
  });

  input.addEventListener('blur', () => {
    if (submitted) return;
    const newName = input.value;
    if (newName !== oldName) updateConversationFolderNameElement(nameEl!, folderId, newName);
    input.parentElement?.replaceChild(nameEl!, input);
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.which === 13) {
      ev.preventDefault();
      ev.stopPropagation();
      submitted = true;
      const newName = input.value;
      if (newName !== oldName) updateConversationFolderNameElement(nameEl!, folderId, newName);
      input.parentElement?.replaceChild(nameEl!, input);
    }
    if (ev.key === 'Escape') {
      submitted = true;
      nameEl!.innerText = oldName;
      input.parentElement?.replaceChild(nameEl!, input);
    }
  });
}

function updateConversationFolderNameElement(nameEl: HTMLElement, folderId: string | number, newName: string): void {
  if (!newName.trim()) return;
  nameEl.innerText = newName;
  document.querySelectorAll(`#conversation-folder-name-${folderId}`).forEach((el) => {
    (el as HTMLElement).innerText = newName;
  });

  const data = { name: newName };
  updateConversationFolderIndicators(folderId, data);

  document.querySelectorAll(`#folder-breadcrumb-${folderId}`).forEach((el) => {
    (el as HTMLElement).innerText = newName;
  });
  selectedConversationFolderBreadcrumb.forEach((f) => {
    if (f.id === folderId) f.name = newName;
  });

  chrome.runtime.sendMessage({ type: 'updateConversationFolder', detail: { folderId, newData: data } });
}

// ---------------------------------------------------------------------------
// Folder description editor
// ---------------------------------------------------------------------------

export async function handleEditConversationFolderDescriptionClick(
  folderId: string | number,
  _isSidebar = false,
): Promise<void> {
  closeMenus();
  const html = `<div id="folder-description-modal" class="absolute inset-0" style="z-index: 10000;">
    <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
      <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
        <div id="folder-description-modal-content" role="dialog" data-state="open" class="popover bg-token-main-surface-primary relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col focus:outline-hidden overflow-hidden max-w-lg" tabindex="-1" style="pointer-events: auto;">
          <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
            <div class="flex"><div class="flex items-center"><div class="flex grow flex-col gap-1">
              <h2 class="text-lg font-medium leading-6 text-token-text-primary">${translate('Folder description')}</h2>
              <div class="text-sm font-medium leading-6 text-token-text-tertiary">See and edit the description of this folder</div>
            </div></div></div>
            <button id="folder-description-modal-close-button" class="text-token-text-tertiary hover:text-token-text-primary transition">
              <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="folder-description-modal-wrapper" class="p-4 overflow-y-auto">
            <div class="mb-3"><textarea id="folder-description-modal-text" class="w-full rounded-xl bg-token-main-surface-secondary p-4 placeholder:text-gray-500 focus-token-border-heavy border-token-border-medium" rows="5"></textarea></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  document
    .querySelector('#folder-description-modal-close-button')
    ?.addEventListener('click', () => document.querySelector('#folder-description-modal')?.remove());
  document.querySelector('#folder-description-modal')?.addEventListener('click', (ev) => {
    const content = document.querySelector('#folder-description-modal-content');
    if (!isDescendant(content, ev.target)) document.querySelector('#folder-description-modal')?.remove();
  });

  const resp = await chrome.runtime.sendMessage({ type: 'getConversationFolderDescription', detail: { folderId } });
  const textarea = document.querySelector('#folder-description-modal-text') as HTMLTextAreaElement | null;
  if (textarea) {
    textarea.value = resp?.description || '';
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.addEventListener(
      'input',
      debounce((ev: Event) => {
        const text = (ev.target as HTMLTextAreaElement).value;
        chrome.runtime.sendMessage({
          type: 'updateConversationFolderDescription',
          detail: { folderId, description: text },
        });
      }, 300),
    );
  }
}

// ---------------------------------------------------------------------------
// Bulk action handlers
// ---------------------------------------------------------------------------

export function handleDeleteSelectedConversations(ids: string[]): void {
  showConfirmDialog(
    'Delete conversation',
    `Are you sure you want to delete the ${ids.length} selected conversations?`,
    'Cancel',
    'Delete',
    null,
    async () => {
      resetConversationManagerSelection();
      resetSidebarConversationSelection();
      updateConversationFolderCount(null, ids);
      ids.forEach((id) => removeConversationElements(id));
      chrome.runtime.sendMessage({ type: 'deleteConversations', detail: { conversationIds: ids } });

      const progressEl = document.querySelector('#confirm-action-dialog #confirm-button div') as HTMLElement | null;
      for (let i = 0; i < ids.length; i += 1) {
        try {
          await deleteConversation(ids[i]!);
        } catch (err) {
          console.error(err);
        }
        if (progressEl && ids.length > 1) {
          progressEl.innerHTML = `<div class="w-full h-full inset-0 flex items-center justify-center text-white"><svg x="0" y="0" viewbox="0 0 40 40" style="width:16px; height:16px;" class="spinner icon icon-xl me-2"><circle fill="transparent" stroke="#ffffff50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg><span class="visually-hidden">${i + 1} / ${ids.length}</span></div>`;
        }
      }
      document.querySelector('#confirm-action-dialog')?.remove();
    },
    'red',
    false,
  );
}

function handleClickMoveConversationsButton(): void {
  const checked = Array.from(
    document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked'),
  ) as HTMLInputElement[];
  if (checked.length === 0) return;
  openMoveConvToFolderModal(checked.map((el) => el.dataset.conversationId!));
}

function handleClickRemoveConversationsButton(): void {
  const ids = Array.from(
    document.querySelectorAll(
      '#modal-manager input[id^="conversation-checkbox-"]:checked',
    ) as NodeListOf<HTMLInputElement>,
  ).map((el) => el.dataset.conversationId!);
  if (ids.length === 0) return;
  resetConversationManagerSelection();
  updateConversationFolderCount(null, ids);
  ids.forEach((id) => {
    document.querySelectorAll(`#conversation-card-${id}`).forEach((el) => el.remove());
  });
  chrome.runtime.sendMessage({ type: 'removeConversationsFromFolder', detail: { conversationIds: ids } }, () =>
    toast('Conversations removed from folder'),
  );
}

export async function handleClickArchiveConversationsButton(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  resetConversationManagerSelection();
  resetSidebarConversationSelection();
  updateConversationFolderCount(null, ids);
  ids.forEach((id) => removeConversationElements(id));
  chrome.runtime.sendMessage({ type: 'archiveConversations', detail: { conversationIds: ids } });
  for (const id of ids) {
    try {
      await archiveConversation(id);
    } catch (err) {
      console.error(err);
    }
  }
}

export async function handleClickUnarchiveConversationsButton(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  resetConversationManagerSelection();
  resetSidebarConversationSelection();
  ids.forEach((id) => removeConversationElements(id));
  chrome.runtime.sendMessage({ type: 'unarchiveConversations', detail: { conversationIds: ids } });
  for (const id of ids) {
    try {
      await unarchiveConversation(id);
    } catch (err) {
      console.error(err);
    }
  }
}

function handleClickExportConversationsButton(): void {
  const ids = Array.from(
    document.querySelectorAll(
      '#modal-manager input[id^="conversation-checkbox-"]:checked',
    ) as NodeListOf<HTMLInputElement>,
  ).map((el) => el.dataset.conversationId!);
  if (ids.length === 0) return;
  openExportModal(ids, 'selected');
}

// ---------------------------------------------------------------------------
// Conversation manager params / selection reset
// ---------------------------------------------------------------------------

export function resetConversationManagerParams(): void {
  lastSelectedConversationCardId = '';
  lastSelectedConversationCheckboxId = '';
}

export function resetConversationManagerSelection(): void {
  if (!document.querySelector('#modal-manager #modal-content-conversation-manager')) return;
  const lastFolder = getLastSelectedConversationFolder();
  lastSelectedConversationCheckboxId = '';

  if (lastFolder?.id !== 'all') {
    const searchInput = document.querySelector(
      '#modal-manager input[id="conversation-manager-search-input"]',
    ) as HTMLInputElement | null;
    if (searchInput) searchInput.value = '';
    const pillText = document.querySelector('#conversation-manager-search-term-pill-text') as HTMLElement | null;
    if (pillText) pillText.innerText = '';
    const pill = document.querySelector('#conversation-manager-search-term-pill') as HTMLElement | null;
    if (pill) pill.classList.add('hidden');
  }

  clearSidebarSearchInput();
  const filters = document.querySelector(
    '#modal-manager #conversation-manager-filters-right-section',
  ) as HTMLElement | null;
  if (filters) {
    lastFolder?.id === 'all' || lastFolder?.id === 'archived'
      ? filters.classList.add('hidden')
      : filters.classList.remove('hidden');
  }

  document.querySelector('#modal-manager #conversation-card-menu')?.remove();
  document.querySelector('#modal-manager div[id="conversation-manager-selection-bar"]')?.classList.add('hidden');
  const contentWrapper = document.querySelector(
    '#modal-manager div[id="conversation-manager-content-wrapper"]',
  ) as HTMLElement | null;
  if (contentWrapper) contentWrapper.style.paddingBottom = '59px';

  const moveBtn = document.querySelector(
    '#modal-manager button[id="conversation-manager-move-button"]',
  ) as HTMLElement | null;
  if (moveBtn)
    isDefaultConvFolder(lastFolder?.id) ? moveBtn.classList.add('hidden') : moveBtn.classList.remove('hidden');
  const removeBtn = document.querySelector(
    '#modal-manager button[id="conversation-manager-remove-button"]',
  ) as HTMLElement | null;
  if (removeBtn)
    isDefaultConvFolder(lastFolder?.id) ? removeBtn.classList.add('hidden') : removeBtn.classList.remove('hidden');
  const addToFolderBtn = document.querySelector(
    '#modal-manager button[id="conversation-manager-add-to-folder-button"]',
  ) as HTMLElement | null;
  if (addToFolderBtn)
    ['all'].includes(lastFolder?.id)
      ? addToFolderBtn.classList.remove('hidden')
      : addToFolderBtn.classList.add('hidden');
  const archiveBtn = document.querySelector(
    '#modal-manager button[id="conversation-manager-archive-button"]',
  ) as HTMLElement | null;
  if (archiveBtn)
    ['archived'].includes(lastFolder?.id) ? archiveBtn.classList.add('hidden') : archiveBtn.classList.remove('hidden');
  const unarchiveBtn = document.querySelector(
    '#modal-manager button[id="conversation-manager-unarchive-button"]',
  ) as HTMLElement | null;
  if (unarchiveBtn)
    lastFolder?.id === 'archived' ? unarchiveBtn.classList.remove('hidden') : unarchiveBtn.classList.add('hidden');

  document
    .querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]')
    .forEach((el) => ((el as HTMLInputElement).checked = false));
  const countEl = document.querySelector(
    '#modal-manager span[id="conversation-manager-selection-count"]',
  ) as HTMLElement | null;
  if (countEl) countEl.innerText = '0 selected';
}

// ---------------------------------------------------------------------------
// Conversation manager modal layout
// ---------------------------------------------------------------------------

export function conversationManagerModalContent(): HTMLElement {
  resetConversationManagerParams();
  clearSidebarSearchInput();

  const wrapper = document.createElement('div');
  wrapper.id = 'modal-content-conversation-manager';
  wrapper.style.cssText = 'overflow-y: hidden;position: relative;height:100%; width:100%';
  wrapper.className = 'markdown prose-invert flex';

  const { managerSidebarWidth: sw = 220 } = cachedSettings;

  const sidebar = document.createElement('div');
  sidebar.id = 'conversation-manager-sidebar';
  sidebar.style.cssText = `width:${sw}px;min-width:220px;resize:horizontal;overflow:hidden;`;
  sidebar.className = 'bg-token-main-surface-primary border-e border-token-border-medium relative h-full';
  sidebar.appendChild(conversationManagerSidebarContent());
  elementResizeObserver(sidebar, 'managerSidebarWidth');
  wrapper.appendChild(sidebar);

  const main = document.createElement('div');
  main.id = 'conversation-manager-main-content';
  main.style.width = `calc(100% - ${sw}px)`;
  main.className = 'overflow-y-auto h-full';

  main.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!document.querySelector('.folder-dragging')) return;
    const lf = getLastSelectedConversationFolder();
    if (!isDefaultConvFolder(lf?.id)) {
      (ev as DragEvent).dataTransfer!.dropEffect = 'move';
      main.classList.add('conversation-list-drag-hover');
    }
  });
  main.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!document.querySelector('.folder-dragging')) return;
    const lf = getLastSelectedConversationFolder();
    if (!isDefaultConvFolder(lf?.id)) main.classList.remove('conversation-list-drag-hover');
  });
  main.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resetConversationManagerSelection();
    if (!document.querySelector('.folder-dragging')) return;
    const lf = getLastSelectedConversationFolder();
    if (isDefaultConvFolder(lf?.id)) return;
    main.classList.remove('conversation-list-drag-hover');
    let data: any;
    try {
      data = JSON.parse((ev as DragEvent).dataTransfer!.getData('text/plain'));
    } catch (err) {
      console.error('Error parsing dragged data:', err);
      return;
    }
    if (data && data.draggingObject === 'folder') {
      const f = data.folder;
      if (!f || f.id === lf?.id || convBreadcrumbIncludesFolder(f.id)) return;
      moveConvFolder(f, lf.id);
    }
  });

  main.appendChild(conversationManagerMainContent());
  wrapper.appendChild(main);
  return wrapper;
}

export function conversationManagerModalActions(): HTMLElement {
  const lastFolder = getLastSelectedConversationFolder();
  const isDefault = isDefaultConvFolder(lastFolder?.id);
  const container = document.createElement('div');
  container.className = 'flex items-center justify-end w-full mt-2';

  const btn = document.createElement('button');
  btn.id = 'conversation-manager-start-new-chat-button';
  btn.className = 'btn composer-submit-btn composer-submit-button-color';
  btn.innerText = isDefault
    ? translate('Start a New Chat')
    : lastFolder?.gizmo_id
      ? translate('Start a new chat with this GPT')
      : translate('Start a new chat in this folder');

  btn.addEventListener('click', () => {
    closeMenus();
    const f = getLastSelectedConversationFolder();
    if (!isDefaultConvFolder(f?.id)) {
      folderForNewChat = f;
      initiateNewChatFolderIndicator();
    }
    const closeBtn = document.querySelector('#modal-manager #modal-close-button-manager') as HTMLElement | null;
    if (closeBtn) closeBtn.click();
    startNewChat(false, f?.gizmo_id);
  });

  container.appendChild(btn);
  return container;
}

export function conversationManagerSidebarContent(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'relative h-full';

  const title = document.createElement('div');
  title.className = 'text-lg p-4';
  title.innerText = translate('Folders');
  root.appendChild(title);

  const foldersEl = document.createElement('div');
  foldersEl.id = 'conversation-manager-sidebar-folders';
  foldersEl.className = 'px-2 pb-64 overflow-y-auto h-full';
  foldersEl.addEventListener('scroll', () => {
    document.querySelector('#modal-manager #conversation-manager-folder-menu')?.remove();
  });
  root.appendChild(foldersEl);

  foldersEl.appendChild(defaultConversationFoldersList());
  foldersEl.appendChild(loadingSpinner('conversation-manager-sidebar'));

  const { selectedConversationsManagerFoldersSortBy: sortBy = 'alphabetical' } = cachedSettings;
  chrome.runtime.sendMessage({ type: 'getConversationFolders', detail: { sortBy } }, async (folders: any) => {
    if (!folders || !Array.isArray(folders)) return;
    document.querySelector('#modal-manager #loading-spinner-conversation-manager-sidebar')?.remove();

    let lastFolder = getLastSelectedConversationFolder();
    if (folders.length === 0) {
      foldersEl.appendChild(noConversationFolderElemet());
      if (!lastFolder || !isDefaultConvFolder(lastFolder?.id?.toString())) {
        selectedConversationFolderBreadcrumb = [defaultConversationFolders[0]];
        document
          .querySelector(`#modal-manager #conversation-folder-wrapper-${selectedConversationFolderBreadcrumb[0]?.id}`)
          ?.querySelector('div[id^="selected-conversation-folder-indicator-"]')
          ?.classList?.add('bg-black', 'dark:bg-white');
      }
    } else {
      if (
        !lastFolder ||
        ![...defaultConversationFolders, ...folders]
          .map((m: any) => m.id.toString())
          .includes(selectedConversationFolderBreadcrumb?.[0]?.id?.toString())
      ) {
        selectedConversationFolderBreadcrumb = [folders[0]];
      }
      folders.forEach((f: any) => {
        const el = conversationFolderElement(f);
        if (el) foldersEl.appendChild(el);
      });
    }

    lastFolder = getLastSelectedConversationFolder();
    chrome.storage.local.set({ selectedConversationFolderBreadcrumb });

    const managerBreadcrumb = document.querySelector(
      '#modal-manager #conversation-manager-breadcrumb',
    ) as HTMLElement | null;
    if (managerBreadcrumb) generateConvFolderBreadcrumb(managerBreadcrumb);
    const sidebarBreadcrumb = document.querySelector(
      '#sidebar-folder-drawer #sidebar-folder-breadcrumb',
    ) as HTMLElement | null;
    if (sidebarBreadcrumb) generateConvFolderBreadcrumb(sidebarBreadcrumb, true);

    toggleNewConversationInFolderButton(isDefaultConvFolder(lastFolder?.id));
    await fetchConversations();
    await throttleFetchSidebarConversations(1, false, false);
    throttleGetConvSubFolders(lastFolder?.id);
  });

  // Bottom bar with settings and add buttons
  const bottomBar = document.createElement('div');
  bottomBar.className =
    'flex items-center justify-between absolute start-0 bottom-0 w-full bg-token-main-surface-secondary border-t border-token-border-medium px-2 h-10 z-10';
  root.appendChild(bottomBar);

  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'conversation-manager-sidebar-settings-button';
  settingsBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary';
  settingsBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" viewBox="0 0 448 512"><path d="M0 88C0 74.75 10.75 64 24 64H424C437.3 64 448 74.75 448 88C448 101.3 437.3 112 424 112H24C10.75 112 0 101.3 0 88zM0 248C0 234.7 10.75 224 24 224H424C437.3 224 448 234.7 448 248C448 261.3 437.3 272 424 272H24C10.75 272 0 261.3 0 248zM424 432H24C10.75 432 0 421.3 0 408C0 394.7 10.75 384 24 384H424C437.3 384 448 394.7 448 408C448 421.3 437.3 432 424 432z"/></svg>';
  settingsBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    showConversationManagerSidebarSettingsMenu(settingsBtn);
  });
  bottomBar.appendChild(settingsBtn);

  const addBtn = document.createElement('button');
  addBtn.id = 'add-conversation-folder-button';
  addBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary';
  addBtn.innerHTML =
    '<svg stroke="currentColor" fill="currentColor" stroke-width="2" viewBox="0 0 448 512" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"><path d="M432 256C432 269.3 421.3 280 408 280h-160v160c0 13.25-10.75 24.01-24 24.01S200 453.3 200 440v-160h-160c-13.25 0-24-10.74-24-23.99C16 242.8 26.75 232 40 232h160v-160c0-13.25 10.75-23.99 24-23.99S248 58.75 248 72v160h160C421.3 232 432 242.8 432 256z"></path></svg>';
  addTooltip(addBtn, { value: 'Add New Root Folder', position: 'top' });

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    addBtn.addEventListener('click', () => {
      document.querySelectorAll('#no-conversation-folders').forEach((el) => el.remove());
      const existing = document.querySelectorAll(
        '#modal-manager #conversation-manager-sidebar-folders > div[id^="conversation-folder-wrapper-"]',
      );
      if (!hasSub && existing.length >= 5) {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message:
            'You have reached the limits of Conversation Folders with free account. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: 'addConversationFolders',
          detail: { folders: [{ name: 'New Folder', color: generateRandomDarkColor() }] },
        },
        (result: any) => {
          if (result?.error?.type === 'limit') {
            errorUpgradeConfirmation(result.error);
            return;
          }
          if (!result || result.length === 0) return;
          addNewConvFolderElementToManagerSidebar(result[0]);
          (
            document.querySelector(`#modal-manager #conversation-folder-wrapper-${result[0].id}`) as HTMLElement
          )?.click();
          handleRenameConversationFolderClick(result[0].id);
        },
      );
    });
  });
  bottomBar.appendChild(addBtn);

  // Drag-and-drop on sidebar (for moving folders to root)
  root.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.querySelector('.folder-dragging')) {
      (ev as DragEvent).dataTransfer!.dropEffect = 'move';
      root.classList.add('conversation-sidebar-drag-hover');
    }
  });
  root.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.querySelector('.folder-dragging')) root.classList.remove('conversation-sidebar-drag-hover');
  });
  root.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resetConversationManagerSelection();
    if (!document.querySelector('.folder-dragging')) return;
    root.classList.remove('conversation-sidebar-drag-hover');
    let data: any;
    try {
      data = JSON.parse((ev as DragEvent).dataTransfer!.getData('text/plain'));
    } catch (err) {
      console.error('Error parsing dragged data:', err);
      return;
    }
    if (data && data.draggingObject === 'folder') {
      const f = data.folder;
      if (!f || !f.parent_folder) return;
      moveConvFolder(f, 0);
    }
  });

  return root;
}

// ---------------------------------------------------------------------------
// Compact view toggle
// ---------------------------------------------------------------------------

const GRID_VIEW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-md" viewBox="0 0 448 512"><path d="M88 32C110.1 32 128 49.91 128 72V120C128 142.1 110.1 160 88 160H40C17.91 160 0 142.1 0 120V72C0 49.91 17.91 32 40 32H88zM88 64H40C35.58 64 32 67.58 32 72V120C32 124.4 35.58 128 40 128H88C92.42 128 96 124.4 96 120V72C96 67.58 92.42 64 88 64zM88 192C110.1 192 128 209.9 128 232V280C128 302.1 110.1 320 88 320H40C17.91 320 0 302.1 0 280V232C0 209.9 17.91 192 40 192H88zM88 224H40C35.58 224 32 227.6 32 232V280C32 284.4 35.58 288 40 288H88C92.42 288 96 284.4 96 280V232C96 227.6 92.42 224 88 224zM0 392C0 369.9 17.91 352 40 352H88C110.1 352 128 369.9 128 392V440C128 462.1 110.1 480 88 480H40C17.91 480 0 462.1 0 440V392zM32 392V440C32 444.4 35.58 448 40 448H88C92.42 448 96 444.4 96 440V392C96 387.6 92.42 384 88 384H40C35.58 384 32 387.6 32 392zM248 32C270.1 32 288 49.91 288 72V120C288 142.1 270.1 160 248 160H200C177.9 160 160 142.1 160 120V72C160 49.91 177.9 32 200 32H248zM248 64H200C195.6 64 192 67.58 192 72V120C192 124.4 195.6 128 200 128H248C252.4 128 256 124.4 256 120V72C256 67.58 252.4 64 248 64zM160 232C160 209.9 177.9 192 200 192H248C270.1 192 288 209.9 288 232V280C288 302.1 270.1 320 248 320H200C177.9 320 160 302.1 160 280V232zM192 232V280C192 284.4 195.6 288 200 288H248C252.4 288 256 284.4 256 280V232C256 227.6 252.4 224 248 224H200C195.6 224 192 227.6 192 232zM248 352C270.1 352 288 369.9 288 392V440C288 462.1 270.1 480 248 480H200C177.9 480 160 462.1 160 440V392C160 369.9 177.9 352 200 352H248zM248 384H200C195.6 384 192 387.6 192 392V440C192 444.4 195.6 448 200 448H248C252.4 448 256 444.4 256 440V392C256 387.6 252.4 384 248 384zM320 72C320 49.91 337.9 32 360 32H408C430.1 32 448 49.91 448 72V120C448 142.1 430.1 160 408 160H360C337.9 160 320 142.1 320 120V72zM352 72V120C352 124.4 355.6 128 360 128H408C412.4 128 416 124.4 416 120V72C416 67.58 412.4 64 408 64H360C355.6 64 352 67.58 352 72zM408 192C430.1 192 448 209.9 448 232V280C448 302.1 430.1 320 408 320H360C337.9 320 320 302.1 320 280V232C320 209.9 337.9 192 360 192H408zM408 224H360C355.6 224 352 227.6 352 232V280C352 284.4 355.6 288 360 288H408C412.4 288 416 284.4 416 280V232C416 227.6 412.4 224 408 224zM320 392C320 369.9 337.9 352 360 352H408C430.1 352 448 369.9 448 392V440C448 462.1 430.1 480 408 480H360C337.9 480 320 462.1 320 440V392zM352 392V440C352 444.4 355.6 448 360 448H408C412.4 448 416 444.4 416 440V392C416 387.6 412.4 384 408 384H360C355.6 384 352 387.6 352 392z"/></svg>';
const LIST_VIEW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-md" viewBox="0 0 512 512"><path d="M16 72C16 58.75 26.75 48 40 48H88C101.3 48 112 58.75 112 72V120C112 133.3 101.3 144 88 144H40C26.75 144 16 133.3 16 120V72zM80 112V80H48V112H80zM496 80C504.8 80 512 87.16 512 96C512 104.8 504.8 112 496 112H176C167.2 112 160 104.8 160 96C160 87.16 167.2 80 176 80H496zM496 240C504.8 240 512 247.2 512 256C512 264.8 504.8 272 496 272H176C167.2 272 160 264.8 160 256C160 247.2 167.2 240 176 240H496zM496 400C504.8 400 512 407.2 512 416C512 424.8 504.8 432 496 432H176C167.2 432 160 424.8 160 416C160 407.2 167.2 400 176 400H496zM88 208C101.3 208 112 218.7 112 232V280C112 293.3 101.3 304 88 304H40C26.75 304 16 293.3 16 280V232C16 218.7 26.75 208 40 208H88zM48 240V272H80V240H48zM16 392C16 378.7 26.75 368 40 368H88C101.3 368 112 378.7 112 392V440C112 453.3 101.3 464 88 464H40C26.75 464 16 453.3 16 440V392zM80 432V400H48V432H80z"/></svg>';

export function conversationCardCompactViewButton(): HTMLElement {
  const { selectedConversationView: view } = cachedSettings;
  const btn = document.createElement('button');
  btn.className =
    'h-10 aspect-1 flex items-center justify-center rounded-lg px-2 ms-2 text-token-text-tertiary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary';
  btn.innerHTML = view === 'list' ? GRID_VIEW_SVG : LIST_VIEW_SVG;

  btn.addEventListener('click', () => {
    const listEl = document.querySelector('#modal-manager #conversation-manager-conversation-list') as HTMLElement;
    if (!listEl) return;
    listEl.className = `grid ${cachedSettings.selectedConversationView !== 'list' ? 'grid-cols-1 gap-2' : 'grid-cols-1 sm:grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4'} w-full content-start`;
    btn.innerHTML = cachedSettings.selectedConversationView === 'list' ? LIST_VIEW_SVG : GRID_VIEW_SVG;
    chrome.storage.local.set(
      {
        settings: {
          ...cachedSettings,
          selectedConversationView: cachedSettings.selectedConversationView === 'list' ? 'grid' : 'list',
        },
      },
      () => {
        fetchConversations();
      },
    );
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Conversation manager main content
// ---------------------------------------------------------------------------

export function conversationManagerMainContent(): HTMLElement {
  const lastFolder = getLastSelectedConversationFolder();
  const isDefault = isDefaultConvFolder(selectedConversationFolderBreadcrumb[0]?.id);

  const outer = document.createElement('div');
  outer.id = 'conversation-manager-content-wrapper';
  outer.className = 'relative h-full overflow-hidden';
  outer.style.paddingBottom = '59px';

  // Top bar: search + sort + view toggle
  const topBar = document.createElement('div');
  topBar.className =
    'flex items-center justify-between p-2 bg-token-main-surface-primary border-b border-token-border-medium sticky top-0 z-10';
  outer.appendChild(topBar);

  const searchInput = document.createElement('input');
  searchInput.id = 'conversation-manager-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = translate('Search conversations');
  searchInput.className =
    'w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary';
  const debouncedSearch = debounce(() => {
    fetchConversations();
    throttleGetConvSubFolders();
  });
  searchInput.addEventListener('input', (ev) => {
    const lf = getLastSelectedConversationFolder();
    const val = (ev.target as HTMLInputElement).value.trim();
    if (lf?.id !== 'all' && lf?.id !== 'archived')
      (document.querySelector('#modal-manager #conversation-folder-wrapper-all') as HTMLElement)?.click();
    if (val.length > 0) {
      const listEl = document.querySelector('#modal-manager #conversation-manager-conversation-list') as HTMLElement;
      if (listEl) {
        listEl.innerHTML = '';
        listEl.appendChild(loadingSpinner('conversation-manager-main-content'));
      }
      debouncedSearch();
    } else {
      fetchConversations();
      throttleGetConvSubFolders();
    }
    const pillText = document.querySelector('#conversation-manager-search-term-pill-text') as HTMLElement;
    const pill = document.querySelector('#conversation-manager-search-term-pill') as HTMLElement;
    if (val.length > 0) {
      if (pillText) pillText.innerText = val;
      pill?.classList.remove('hidden');
    } else {
      if (pillText) pillText.innerText = '';
      pill?.classList.add('hidden');
    }
  });
  topBar.appendChild(searchInput);

  const filtersRight = document.createElement('div');
  filtersRight.id = 'conversation-manager-filters-right-section';
  filtersRight.className = `flex items-center ${lastFolder?.id === 'all' || lastFolder?.id === 'archived' ? 'hidden' : ''}`;
  topBar.appendChild(filtersRight);

  const { selectedConversationsManagerSortBy: sortSel } = cachedSettings;
  const sortWrapper = document.createElement('div');
  sortWrapper.id = 'conversation-manager-sort-by-wrapper';
  sortWrapper.style.cssText = 'position:relative;width:150px;z-index:1000;margin-left:8px;';
  sortWrapper.innerHTML = dropdown('Conversations-Manager-SortBy', conversationsSortByList, sortSel, 'code', 'right');
  filtersRight.appendChild(sortWrapper);

  topBar.appendChild(conversationCardCompactViewButton());

  // Selection bar
  const selBar = document.createElement('div');
  selBar.id = 'conversation-manager-selection-bar';
  selBar.className = 'flex items-center justify-end px-2 py-3 hidden sticky top-0 bg-token-main-surface-primary z-10';
  outer.appendChild(selBar);

  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'conversation-manager-selection-cancel-button';
  cancelBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary ms-2 me-auto border border-token-border-medium';
  cancelBtn.innerText = translate('Cancel');
  cancelBtn.addEventListener('click', () => resetConversationManagerSelection());
  selBar.appendChild(cancelBtn);

  const countSpan = document.createElement('span');
  countSpan.id = 'conversation-manager-selection-count';
  countSpan.className = 'text-token-text-tertiary text-xs me-4';
  countSpan.innerText = '0 selected';
  selBar.appendChild(countSpan);

  const deleteBtn = document.createElement('button');
  deleteBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium';
  deleteBtn.innerText = translate('Delete');
  deleteBtn.addEventListener('click', () => {
    const checked = Array.from(document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked'));
    if (checked.length === 0) return;
    handleDeleteSelectedConversations(checked.map((el: any) => el.dataset.conversationId));
  });
  selBar.appendChild(deleteBtn);

  const removeBtn = document.createElement('button');
  removeBtn.id = 'conversation-manager-remove-button';
  removeBtn.className = `flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium ${isDefault ? 'hidden' : ''}`;
  removeBtn.innerText = translate('Remove from folder');
  removeBtn.addEventListener('click', () => handleClickRemoveConversationsButton());
  selBar.appendChild(removeBtn);

  const moveBtn = document.createElement('button');
  moveBtn.id = 'conversation-manager-move-button';
  moveBtn.className = `flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium ${isDefault ? 'hidden' : ''}`;
  moveBtn.innerText = translate('Move to folder');
  moveBtn.addEventListener('click', () => handleClickMoveConversationsButton());
  selBar.appendChild(moveBtn);

  const projectBtn = document.createElement('button');
  projectBtn.id = 'conversation-manager-add-to-project-button';
  projectBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium';
  projectBtn.innerText = translate('Add to project');
  projectBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const ids = Array.from(document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked')).map(
      (el: any) => el.dataset.conversationId,
    );
    showProjectsList(projectBtn, ids, false);
  });
  selBar.appendChild(projectBtn);

  const addToFolderBtn = document.createElement('button');
  addToFolderBtn.id = 'conversation-manager-add-to-folder-button';
  addToFolderBtn.className = `flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium ${['all'].includes(lastFolder?.id) ? '' : 'hidden'}`;
  addToFolderBtn.innerText = translate('Add to folder');
  addToFolderBtn.addEventListener('click', () => handleClickMoveConversationsButton());
  selBar.appendChild(addToFolderBtn);

  const archiveBtn = document.createElement('button');
  archiveBtn.id = 'conversation-manager-archive-button';
  archiveBtn.className = `flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium ${['archived'].includes(lastFolder?.id) ? 'hidden' : ''}`;
  archiveBtn.innerText = translate('Archive');
  archiveBtn.addEventListener('click', () => {
    const ids = Array.from(document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked')).map(
      (el: any) => el.dataset.conversationId,
    );
    handleClickArchiveConversationsButton(ids);
  });
  selBar.appendChild(archiveBtn);

  const unarchiveBtn = document.createElement('button');
  unarchiveBtn.id = 'conversation-manager-unarchive-button';
  unarchiveBtn.className = `flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium ${lastFolder?.id === 'archived' ? '' : 'hidden'}`;
  unarchiveBtn.innerText = translate('Unarchive');
  unarchiveBtn.addEventListener('click', () => {
    const ids = Array.from(document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked')).map(
      (el: any) => el.dataset.conversationId,
    );
    handleClickUnarchiveConversationsButton(ids);
  });
  selBar.appendChild(unarchiveBtn);

  const exportBtn = document.createElement('button');
  exportBtn.id = 'conversation-manager-export-button';
  exportBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-primary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary me-2 border border-token-border-medium';
  exportBtn.innerText = translate('Export');
  exportBtn.addEventListener('click', () => handleClickExportConversationsButton());
  selBar.appendChild(exportBtn);

  // Folder content wrapper (breadcrumb + subfolders + conversation list)
  const contentArea = document.createElement('div');
  contentArea.id = 'conversation-manager-folder-content-wrapper';
  contentArea.className =
    'bg-token-sidebar-surface-primary flex flex-wrap h-full overflow-y-auto p-4 pb-32 content-start';
  outer.appendChild(contentArea);

  // Header row
  const header = document.createElement('div');
  header.id = 'conversation-manager-header';
  header.className = 'flex items-center justify-between mb-4 w-full';
  contentArea.appendChild(header);

  // Breadcrumb
  const breadcrumb = document.createElement('div');
  breadcrumb.id = 'conversation-manager-breadcrumb';
  breadcrumb.className =
    'flex items-center justify-start bg-token-main-surface-secondary p-2 rounded-lg border border-token-border-medium overflow-x-auto';
  breadcrumb.style.maxWidth = 'calc(100% - 48px)';
  breadcrumb.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    if (!target?.matches?.('[data-folder-id]')) return;
    const fId = target.getAttribute('data-folder-id')!;
    const idx = selectedConversationFolderBreadcrumb.findIndex((f: any) => f.id.toString() === fId.toString());
    if (idx !== -1 && (idx < selectedConversationFolderBreadcrumb.length - 1 || (ev as MouseEvent).shiftKey)) {
      resetConversationManagerSelection();
      selectedConversationFolderBreadcrumb = selectedConversationFolderBreadcrumb.slice(0, idx + 1);
      chrome.storage.local.set({ selectedConversationFolderBreadcrumb });
      toggleNewConversationInFolderButton(fId === 'root' || isDefaultConvFolder(fId));
      generateConvFolderBreadcrumb(breadcrumb);
      const sb = document.querySelector('#sidebar-folder-breadcrumb') as HTMLElement | null;
      if (sb) generateConvFolderBreadcrumb(sb, true);
      throttleGetConvSubFolders(fId, (ev as MouseEvent).shiftKey);
      fetchConversations(1, false, (ev as MouseEvent).shiftKey);
    }
  });
  header.appendChild(breadcrumb);

  // New subfolder button
  const newFolderBtn = document.createElement('button');
  newFolderBtn.id = 'conversation-manager-new-folder-button';
  newFolderBtn.className = `${isDefault ? 'hidden' : 'flex'} items-center justify-center h-full rounded-lg p-2 ms-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary`;
  newFolderBtn.innerHTML = NEW_FOLDER_SVG;
  addTooltip(newFolderBtn, { value: 'Add New Folder', position: 'top' });
  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    newFolderBtn.addEventListener('click', () => {
      const lf = getLastSelectedConversationFolder();
      if (lf && isDefaultConvFolder(lf.id)) {
        toast('You cannot add a folder to this folder.', 'error');
        return;
      }
      const existing = document.querySelectorAll(
        '#modal-manager #conversation-manager-sidebar-folders > div[id^="conversation-folder-wrapper-"]',
      );
      if (!hasSub && existing.length >= 5) {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message:
            'You have reached the limits of Conversation Folders with free account. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      document.querySelectorAll('#no-conversation-folders').forEach((el) => el.remove());
      const newData: any = { name: 'New Folder', color: generateRandomDarkColor() };
      if (lf) {
        newData.profile = lf.profile?.id;
        newData.color = lf.color;
        newData.parent_folder = lf.id;
        newData.image_url = lf.image || lf.image_url;
        newData.gizmo_id = lf.gizmo_id;
      }
      chrome.runtime.sendMessage({ type: 'addConversationFolders', detail: { folders: [newData] } }, (result: any) => {
        if (result?.error?.type === 'limit') {
          errorUpgradeConfirmation(result.error);
          return;
        }
        if (!result || result.length === 0) return;
        const subList = document.querySelector('#conversation-manager-subfolder-list');
        const newFolderEl = conversationFolderElement(result[0]);
        if (newFolderEl) subList?.prepend(newFolderEl);
        subList?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        addNewConvFolderElementToSidebar(result[0]);
        document.querySelectorAll(`#folder-subfolder-count-${lf?.id}`).forEach((el) => {
          const c = parseInt(el.textContent!.split(' ')[0]!, 10);
          el.textContent = `${c + 1} folder${c + 1 === 1 ? '' : 's'} -`;
        });
        handleRenameConversationFolderClick(result[0].id, false);
      });
    });
  });
  header.appendChild(newFolderBtn);

  // Search term pill
  const pill = document.createElement('div');
  pill.id = 'conversation-manager-search-term-pill';
  pill.className =
    'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 border border-token-border-medium';
  pill.innerHTML =
    '<button id="conversation-manager-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><span id="conversation-manager-search-term-pill-text" class="text-sm mx-1 text-danger"></span>';
  pill.querySelector('#conversation-manager-search-term-pill-clear-button')!.addEventListener('click', () => {
    const input = document.querySelector('#conversation-manager-search-input') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
  });
  contentArea.appendChild(pill);

  // Subfolder list
  const subfolderList = document.createElement('div');
  subfolderList.id = 'conversation-manager-subfolder-list';
  subfolderList.className =
    'grid grid-cols-1 sm:grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 content-start w-full mb-2';
  contentArea.appendChild(subfolderList);

  // Conversation list
  const convList = document.createElement('div');
  convList.id = 'conversation-manager-conversation-list';
  convList.className = `grid ${cachedSettings.selectedConversationView === 'list' ? 'grid-cols-1 gap-2' : 'grid-cols-1 sm:grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4'} content-start w-full`;
  contentArea.appendChild(convList);

  return outer;
}

// ---------------------------------------------------------------------------
// Fetch conversations (manager modal)
// ---------------------------------------------------------------------------

export async function fetchConversations(page = 1, fullSearch = false, forceRefresh = false): Promise<void> {
  const lastFolder = getLastSelectedConversationFolder();
  if (!lastFolder) return;
  const list = document.querySelector('#modal-manager #conversation-manager-conversation-list') as HTMLElement | null;
  if (!list) return;

  if (page === 1) {
    list.innerHTML = '';
    list.appendChild(loadingSpinner('conversation-manager-main-content'));
  }

  let results: any[] = [];
  let hasMore = false;
  let favoriteIds: string[] = [];
  let noteIds: string[] = [];
  const searchTerm = (
    document.querySelector('#modal-manager input[id=conversation-manager-search-input]') as HTMLInputElement
  )?.value;

  if (searchTerm === '' && lastFolder?.id === 'archived') {
    if (page === 1) {
      favoriteIds = await chrome.runtime.sendMessage({ type: 'getAllFavoriteConversationIds' });
      noteIds = await chrome.runtime.sendMessage({ type: 'getAllNoteConversationIds' });
    }
    const limit = 100;
    const offset = (page - 1) * limit;
    const isArchived = lastFolder?.id === 'archived';
    try {
      const resp = await getConversations(offset, limit, 'updated', isArchived, forceRefresh);
      results = syncHistoryResponseToConversationDB(resp, isArchived);
      hasMore = resp.total > offset + limit;
    } catch {
      const loadMoreBtn = document.querySelector(
        '#modal-manager #load-more-conversations-button',
      ) as HTMLElement | null;
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<div class="w-full h-full flex items-center justify-center">Load more...</div>';
        loadMoreBtn.onclick = () => fetchConversations(page + 1, fullSearch, forceRefresh);
        return;
      }
    }
  } else {
    document.querySelectorAll('#modal-manager #load-more-conversations-button')?.forEach((el) => el.remove());
    const { selectedConversationsManagerSortBy, excludeConvInFolders } = cachedSettings;
    const sortCode = selectedConversationsManagerSortBy?.code;
    const resp = await chrome.runtime.sendMessage({
      type: 'getConversations',
      forceRefresh,
      detail: {
        pageNumber: page,
        searchTerm,
        sortBy: ['all', 'archived'].includes(lastFolder?.id) ? 'updated_at' : sortCode,
        fullSearch,
        folderId: searchTerm || typeof lastFolder?.id === 'string' ? null : lastFolder?.id,
        isArchived: lastFolder?.id === 'archived' ? true : null,
        isFavorite: lastFolder?.id === 'favorites' ? true : null,
        excludeConvInFolders: lastFolder?.id === 'all' && excludeConvInFolders,
      },
    });
    results = resp.results;
    hasMore = resp.next;
  }

  document.querySelector('#modal-manager #loading-spinner-conversation-manager-main-content')?.remove();

  if (results?.length === 0 && page === 1) {
    if (searchTerm && !fullSearch) {
      const fullBtn = createFullSearchButton(false);
      list.appendChild(fullBtn);
      fullBtn.click();
    } else {
      list.appendChild(noConversationElement());
    }
    return;
  }

  if (results?.forEach) {
    results.forEach((conv: any) => {
      const isFav = favoriteIds.includes(conv.conversation_id) || conv.is_favorite;
      const hasNote = noteIds.includes(conv.conversation_id) || conv.has_note;
      const enriched = { ...conv, is_favorite: isFav, has_note: hasNote };
      const card = createConversationCard(enriched);
      list.appendChild(card);
      addConversationCardEventListeners(card, enriched);
    });
  }

  if (hasMore) {
    const loadMore = document.createElement('button');
    loadMore.id = 'load-more-conversations-button';
    loadMore.className = `bg-token-main-surface-secondary p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${cachedSettings.selectedConversationView === 'list' ? 'h-14' : 'h-auto aspect-1.5'} flex flex-col relative`;
    loadMore.appendChild(loadingSpinner('load-more-conversations-button'));
    list.appendChild(loadMore);
    loadMore.onclick = () => fetchConversations(page + 1, fullSearch, forceRefresh);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            fetchConversations(page + 1, fullSearch, forceRefresh);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(loadMore);
  } else if (searchTerm && !fullSearch) {
    const fullBtn = createFullSearchButton(false);
    list.appendChild(fullBtn);
  }
}

// ---------------------------------------------------------------------------
// Conversation card views (list / grid)
// ---------------------------------------------------------------------------

const STAR_FILLED_SVG =
  '<svg class="icon icon-md" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg>';
const STAR_OUTLINE_SVG =
  '<svg class="icon icon-md" fill="#b4b4b4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M287.9 0C297.1 0 305.5 5.25 309.5 13.52L378.1 154.8L531.4 177.5C540.4 178.8 547.8 185.1 550.7 193.7C553.5 202.4 551.2 211.9 544.8 218.2L433.6 328.4L459.9 483.9C461.4 492.9 457.7 502.1 450.2 507.4C442.8 512.7 432.1 513.4 424.9 509.1L287.9 435.9L150.1 509.1C142.9 513.4 133.1 512.7 125.6 507.4C118.2 502.1 114.5 492.9 115.1 483.9L142.2 328.4L31.11 218.2C24.65 211.9 22.36 202.4 25.2 193.7C28.03 185.1 35.5 178.8 44.49 177.5L197.7 154.8L266.3 13.52C270.4 5.249 278.7 0 287.9 0L287.9 0zM287.9 78.95L235.4 187.2C231.9 194.3 225.1 199.3 217.3 200.5L98.98 217.9L184.9 303C190.4 308.5 192.9 316.4 191.6 324.1L171.4 443.7L276.6 387.5C283.7 383.7 292.2 383.7 299.2 387.5L404.4 443.7L384.2 324.1C382.9 316.4 385.5 308.5 391 303L476.9 217.9L358.6 200.5C350.7 199.3 343.9 194.3 340.5 187.2L287.9 78.95z"/></svg>';
const ARCHIVED_SVG =
  '<span title="Archived"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md me-2 text-token-text-tertiary"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.62188 3.07918C3.87597 2.571 4.39537 2.25 4.96353 2.25H13.0365C13.6046 2.25 14.124 2.571 14.3781 3.07918L15.75 5.82295V13.5C15.75 14.7426 14.7426 15.75 13.5 15.75H4.5C3.25736 15.75 2.25 14.7426 2.25 13.5V5.82295L3.62188 3.07918ZM13.0365 3.75H4.96353L4.21353 5.25H13.7865L13.0365 3.75ZM14.25 6.75H3.75V13.5C3.75 13.9142 4.08579 14.25 4.5 14.25H13.5C13.9142 14.25 14.25 13.9142 14.25 13.5V6.75ZM6.75 9C6.75 8.58579 7.08579 8.25 7.5 8.25H10.5C10.9142 8.25 11.25 8.58579 11.25 9C11.25 9.41421 10.9142 9.75 10.5 9.75H7.5C7.08579 9.75 6.75 9.41421 6.75 9Z" fill="currentColor"></path></svg></span>';

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
            <span id="conversation-card-folder-name-${conv.conversation_id}">${conv?.folder?.name || ''}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="flex justify-between items-center pt-1">
    <span class="text-xs text-token-text-tertiary me-2">${formatDate(new Date(formatTime(conv.update_time)))}</span>
    ${conv.is_archived ? ARCHIVED_SVG : ''}
    ${conversationIndicators(conv)}
    <div id="conversation-card-favorite" title="favorite conversation" class="me-1">${conv.is_favorite ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</div>
    <div id="conversation-card-action-right-${conv.conversation_id}" class="flex items-center">
      <div id="conversation-card-settings-button-${conv.conversation_id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary">${DOTS_MENU_SVG}</div>
    </div>
  </div>`;
}

function conversationGridView(conv: any): string {
  if (!conv) return '';
  const lf = getLastSelectedConversationFolder();
  return `<div class="flex items-center justify-between border-b border-token-border-medium pb-1"><div class="truncate text-xs text-token-text-tertiary flex items-center w-full"><div id="conversation-card-folder-wrapper-${conv.conversation_id}" class="flex items-center ${conv?.folder?.name && typeof lf?.id !== 'number' ? '' : 'hidden'}"><div class="flex items-center border border-token-border-medium rounded-md px-1 text-xs font-normal overflow-hidden hover:w-fit-sp w-auto min-w-5 max-w-5"><svg stroke="currentColor" fill="currentColor" class="icon icon-xs me-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M147.8 192H480V144C480 117.5 458.5 96 432 96h-160l-64-64h-160C21.49 32 0 53.49 0 80v328.4l90.54-181.1C101.4 205.6 123.4 192 147.8 192zM543.1 224H147.8C135.7 224 124.6 230.8 119.2 241.7L0 480h447.1c12.12 0 23.2-6.852 28.62-17.69l96-192C583.2 249 567.7 224 543.1 224z"/></svg><span id="conversation-card-folder-name-${conv.conversation_id}">${conv?.folder?.name || ''}</span></div> <svg aria-hidden="true" fill="none" focusable="false" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" style="min-width:16px" viewBox="0 0 24 24" width="1em"><path d="m9 18 6-6-6-6"></path></svg></div>${formatDate(new Date(formatTime(conv.update_time)))}</div>
  <div id="conversation-card-favorite" title="favorite conversation" class="ps-1">${conv.is_favorite ? STAR_FILLED_SVG : STAR_OUTLINE_SVG}</div></div>
  <div id="conversation-title" class="flex-1 text-sm truncate">${escapeHTML(conv.title || 'New chat')}</div>
  <div class="border-t border-token-border-medium flex justify-between items-center pt-1">
    <div class="flex items-center">
      <input id="conversation-checkbox-${conv.conversation_id}" data-conversation-id="${conv.conversation_id}" type="checkbox" class="manager-modal border border-token-border-medium me-2" style="cursor: pointer; border-radius: 2px;">
      ${conversationIndicators(conv)}
    </div>
    <div id="conversation-card-action-right-${conv.conversation_id}" class="flex items-center">
      ${conv.is_archived ? ARCHIVED_SVG : ''}
      <div id="conversation-card-settings-button-${conv.conversation_id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary">${DOTS_MENU_SVG}</div>
    </div>
    <div id="conversation-card-folder-color-indicator-${conv.conversation_id}" title="${conv?.folder?.name || ''}" data-folder-id="${conv?.folder?.id}" class="absolute w-full h-2 bottom-0 start-0 rounded-b-md" style="background-color: ${conv?.folder?.name ? conv?.folder?.color : 'transparent'};"></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Conversation card builder + events
// ---------------------------------------------------------------------------

export function createConversationCard(conv: any): HTMLElement {
  const card = document.createElement('div');
  card.id = `conversation-card-${conv.conversation_id}`;
  card.draggable = true;
  card.dataset.conversationId = conv.conversation_id;
  card.className = `relative flex bg-token-main-surface-primary border border-token-border-medium rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${cachedSettings.selectedConversationView === 'list' ? 'w-full p-2 flex-row h-10' : 'aspect-1.5 p-4 pb-2 flex-col h-auto'}`;
  if (conv.folder) card.dataset.folderId = conv.folder.id;
  card.style.cssText = 'height: max-content;outline-offset: 4px; outline: none;';
  card.innerHTML =
    cachedSettings.selectedConversationView === 'list' ? conversationListView(conv) : conversationGridView(conv);

  card.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    if ((ev as MouseEvent).metaKey || (isWindows() && (ev as MouseEvent).ctrlKey)) {
      window.open(`/c/${conv.conversation_id}`, '_blank');
    } else {
      updateSelectedConvCard(conv.conversation_id);
      showConversationPreviewWrapper(conv.conversation_id, null, false);
    }
  });
  card.addEventListener('mouseenter', () => closeMenus());
  card.addEventListener('dragstart', (ev) => {
    ev.stopPropagation();
    (ev as DragEvent).dataTransfer!.setData(
      'text/plain',
      JSON.stringify({ draggingObject: 'conversation', conversation: conv }),
    );
    (ev as DragEvent).dataTransfer!.effectAllowed = 'move';
    card.classList.add('card-dragging');
  });
  card.addEventListener('dragend', (ev) => {
    ev.stopPropagation();
    (ev as DragEvent).dataTransfer!.clearData();
    try {
      card.classList.remove('card-dragging');
    } catch (err) {
      console.error('Error removing card-dragging class:', err);
    }
  });
  return card;
}

export function updateSelectedConvCard(convId: string, silent = false): void {
  document.querySelectorAll('div[id^="conversation-card-"][data-conversation-id]').forEach((el) => {
    (el as HTMLElement).style.outline = 'none';
    el.classList.remove('bg-token-sidebar-surface-tertiary');
  });
  if (!convId) return;
  lastSelectedConversationCardId = convId;
  document.querySelectorAll(`#conversation-card-${convId}`).forEach((el) => {
    if (!silent) (el as HTMLElement).style.outline = `2px solid ${isDarkMode() ? '#fff' : '#000'}`;
    el.classList.add('bg-token-sidebar-surface-tertiary');
  });
}

export function addOrReplaceConversationCard(conv: any, afterEl: HTMLElement | null = null): void {
  const lf = getLastSelectedConversationFolder();
  if (!lf || lf?.id?.toString() !== conv.folder?.id?.toString()) return;
  const existing = document.querySelector(`#modal-manager [data-conversation-id="${conv.conversation_id}"]`);
  if (existing) {
    const card = createConversationCard(conv);
    existing.replaceWith(card);
    addConversationCardEventListeners(card, conv);
  } else {
    const listEl = document.querySelector('#modal-manager #conversation-manager-conversation-list');
    document.querySelector('#modal-manager #no-conversations-found')?.remove();
    const card = createConversationCard(conv);
    if (afterEl) afterEl.after(card);
    else listEl?.prepend(card);
    addConversationCardEventListeners(card, conv);
  }
}

export function addConversationCardEventListeners(el: HTMLElement, conv: any, isSidebar = false): void {
  el.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    (el.querySelector(`#conversation-card-settings-button-${conv.conversation_id}`) as HTMLElement)?.click();
  });

  el.querySelector(`#modal-manager #conversation-checkbox-${conv.conversation_id}`)?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    const allChecked = Array.from(
      document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked'),
    );
    if (allChecked.length > 0) {
      if (
        (ev as MouseEvent).shiftKey &&
        allChecked.filter((c: any) => c.id !== `conversation-checkbox-${conv.id}`).length > 0
      ) {
        const cId = conv.conversation_id;
        const cards = document.querySelectorAll('#modal-manager div[id^="conversation-card-"]');
        let started = false,
          ended = false;
        cards.forEach((card) => {
          const hId = card.id.split('conversation-card-')[1];
          if ((hId === lastSelectedConversationCheckboxId || hId === cId) && !ended) {
            started ? (ended = true) : (started = true);
          }
          if (started && !ended) {
            const cb = document.querySelector(`#modal-manager #conversation-checkbox-${hId}`) as HTMLInputElement;
            if (cb) cb.checked = true;
          }
        });
      }
      lastSelectedConversationCheckboxId = conv.conversation_id;
      const count = document.querySelectorAll('#modal-manager input[id^="conversation-checkbox-"]:checked').length;
      const countEl = document.querySelector(
        '#modal-manager span[id="conversation-manager-selection-count"]',
      ) as HTMLElement;
      if (countEl) countEl.innerText = `${count} selected`;
      document.querySelector('#modal-manager div[id="conversation-manager-selection-bar"]')?.classList.remove('hidden');
      const cw = document.querySelector('#modal-manager div[id="conversation-manager-content-wrapper"]') as HTMLElement;
      if (cw) cw.style.paddingBottom = 'calc(59px + 56px)';
    } else {
      resetConversationManagerSelection();
    }
  });

  const favEl = el.querySelector('#modal-manager #conversation-card-favorite');
  favEl?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const lf = getLastSelectedConversationFolder();
    if (lf?.id === 'favorites')
      document.querySelectorAll(`#conversation-card-${conv.conversation_id}`).forEach((c) => c.remove());
    const fullConv = await getConversationById(conv.conversation_id);
    const result = await chrome.runtime.sendMessage({
      type: 'toggleConversationFavorite',
      forceRefresh: true,
      detail: { conversation: fullConv },
    });
    if (lf?.id !== 'favorites') {
      (favEl as HTMLElement).innerHTML = result.is_favorite ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
      toggleFavoriteIndicator(conv.conversation_id, result.is_favorite);
    }
  });

  el.querySelector(`#conversation-project-indicator-${conv.conversation_id}`)?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    closeMenus();
    if ((ev as MouseEvent).metaKey || (isWindows() && (ev as MouseEvent).ctrlKey)) {
      window.open(`/g/${conv.gizmo_id}/project`, '_blank');
      return;
    }
    closeModals();
    window.history.pushState({}, '', `/g/${conv.gizmo_id}/project`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });

  const settingsBtn = el.querySelector(`#conversation-card-settings-button-${conv.conversation_id}`) as HTMLElement;
  settingsBtn?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    closeMenus();
    settingsBtn.classList.replace('hidden', 'flex');
    showConversationManagerCardMenu(settingsBtn, conv, isSidebar, true);
  });
}

// ---------------------------------------------------------------------------
// Folder settings context menu
// ---------------------------------------------------------------------------

export async function showConversationManagerFolderMenu(
  button: HTMLElement,
  folder: any,
  isSidebar = false,
  isSubfolder = false,
): Promise<void> {
  const { showFoldersInLeftSidebar } = cachedSettings;
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const fId = folder.id;
  const folderEl = document.querySelector(`#conversation-folder-wrapper-${fId}`) as HTMLElement | null;
  const img = folder.image || folder.image_url;
  const { right, top } = button.getBoundingClientRect();
  const x = (!showFoldersInLeftSidebar && isSidebar) || isSubfolder ? right - 224 : right - 6;
  const y = top + 12;
  const isDefault = ['all', 'favorites'].includes(fId as string);
  const isAll = ['all'].includes(fId as string);

  const defaultMenuItems = isDefault
    ? `${isAll ? `<div role="menuitem" id="view-mode-conversation-folder-button-${fId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" class="icon icon-md"><path d="M0 73.7C0 50.67 18.67 32 41.7 32H470.3C493.3 32 512 50.67 512 73.7C512 83.3 508.7 92.6 502.6 100L336 304.5V447.7C336 465.5 321.5 480 303.7 480C296.4 480 289.3 477.5 283.6 472.1L191.1 399.6C181.6 392 176 380.5 176 368.3V304.5L9.373 100C3.311 92.6 0 83.3 0 73.7V73.7zM54.96 80L218.6 280.8C222.1 285.1 224 290.5 224 296V364.4L288 415.2V296C288 290.5 289.9 285.1 293.4 280.8L457 80H54.96z"/></svg>${translate('View mode')} <svg aria-hidden="true" fill="none" focusable="false" height="1em" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" style="margin-left:auto;min-width:16px" viewBox="0 0 24 24" width="1em"><path d="m9 18 6-6-6-6"></path></svg></div>` : ''}
      <div role="menuitem" id="export-folder-conversations-button-${fId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linejoin="round" class="icon icon-md"><path d="M568.1 303l-80-80c-9.375-9.375-24.56-9.375-33.94 0s-9.375 24.56 0 33.94L494.1 296H216C202.8 296 192 306.8 192 320s10.75 24 24 24h278.1l-39.03 39.03C450.3 387.7 448 393.8 448 400s2.344 12.28 7.031 16.97c9.375 9.375 24.56 9.375 33.94 0l80-80C578.3 327.6 578.3 312.4 568.1 303zM360 384c-13.25 0-24 10.74-24 24V448c0 8.836-7.164 16-16 16H64.02c-8.836 0-16-7.164-16-16L48 64.13c0-8.836 7.164-16 16-16h160L224 128c0 17.67 14.33 32 32 32h79.1v72c0 13.25 10.74 24 23.1 24S384 245.3 384 232V138.6c0-16.98-6.742-33.26-18.75-45.26l-74.63-74.64C278.6 6.742 262.3 0 245.4 0H63.1C28.65 0-.002 28.66 0 64l.0065 384c.002 35.34 28.65 64 64 64H320c35.2 0 64-28.8 64-64v-40C384 394.7 373.3 384 360 384z"></path></svg>${translate('Export')} ${hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>'}</div></div>
      <div role="menuitem" id="clear-all-conversation-folder-button-${fId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Clear all')}</div>`
    : `<div role="menuitem" id="rename-conversation-folder-button-${fId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="none" class="icon icon-md"><path fill="currentColor" d="M184 160C193.5 160 202.1 165.6 205.9 174.3L269.9 318.3C275.3 330.4 269.9 344.5 257.7 349.9C245.6 355.3 231.5 349.9 226.1 337.7L221.7 328H146.3L141.9 337.7C136.5 349.9 122.4 355.3 110.3 349.9C98.14 344.5 92.69 330.4 98.07 318.3L162.1 174.3C165.9 165.6 174.5 160 184 160H184zM167.6 280H200.4L184 243.1L167.6 280zM304 184C304 170.7 314.7 160 328 160H380C413.1 160 440 186.9 440 220C440 229.2 437.9 237.9 434.2 245.7C447.5 256.7 456 273.4 456 292C456 325.1 429.1 352 396 352H328C314.7 352 304 341.3 304 328V184zM352 208V232H380C386.6 232 392 226.6 392 220C392 213.4 386.6 208 380 208H352zM352 304H396C402.6 304 408 298.6 408 292C408 285.4 402.6 280 396 280H352V304zM0 128C0 92.65 28.65 64 64 64H576C611.3 64 640 92.65 640 128V384C640 419.3 611.3 448 576 448H64C28.65 448 0 419.3 0 384V128zM48 128V384C48 392.8 55.16 400 64 400H576C584.8 400 592 392.8 592 384V128C592 119.2 584.8 112 576 112H64C55.16 112 48 119.2 48 128z"/></svg>${translate('Rename')}</div>
      <div role="menuitem" id="edit-description-conversation-folder-button-${fId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor"></path></svg>${translate('Edit description')}</div>
      <div role="menuitem" id="add-subfolder-conversation-folder-button-${fId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg stroke="currentColor" fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>${translate('Add subfolder')}</div>
      <div role="menuitem" id="move-folder-conversation-folder-button-${fId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" class="icon icon-md" viewBox="0 0 576 512"><path d="M544 320h-96l-44.16-27.23C398.8 289.6 392.1 288 387 288H320c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h224c17.67 0 32-14.33 32-32v-128C576 334.3 561.7 320 544 320zM528 464h-192v-128h46.5l40.3 24.86C430.4 365.5 439.1 368 448 368h80V464zM232 160C245.3 160 256 149.3 256 136C256 122.7 245.3 112 232 112H48V24C48 10.74 37.25 0 24 0S0 10.74 0 24v368C0 422.9 25.07 448 56 448h176C245.3 448 256 437.3 256 424c0-13.26-10.75-24-24-24h-176c-4.4 0-8-3.602-8-8V160H232zM544 32h-96l-44.16-27.23C398.8 1.648 392.1 0 387 0H320c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h224c17.67 0 32-14.33 32-32V64C576 46.33 561.7 32 544 32zM528 176h-192v-128h46.5l40.3 24.86C430.4 77.53 439.1 80 448 80h80V176z"/></svg>${translate('Move folder')}</div>
      <div role="menuitem" id="color-conversation-folder-button-${fId}" class="flex gap-2 items-center justify-between rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg stroke="currentColor" fill="currentColor" stroke-width="2" viewBox="0 0 512 512" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"><path d="M160 255.1C160 273.7 145.7 287.1 128 287.1C110.3 287.1 96 273.7 96 255.1C96 238.3 110.3 223.1 128 223.1C145.7 223.1 160 238.3 160 255.1zM128 159.1C128 142.3 142.3 127.1 160 127.1C177.7 127.1 192 142.3 192 159.1C192 177.7 177.7 191.1 160 191.1C142.3 191.1 128 177.7 128 159.1zM288 127.1C288 145.7 273.7 159.1 256 159.1C238.3 159.1 224 145.7 224 127.1C224 110.3 238.3 95.1 256 95.1C273.7 95.1 288 110.3 288 127.1zM320 159.1C320 142.3 334.3 127.1 352 127.1C369.7 127.1 384 142.3 384 159.1C384 177.7 369.7 191.1 352 191.1C334.3 191.1 320 177.7 320 159.1zM441.9 319.1H344C317.5 319.1 296 341.5 296 368C296 371.4 296.4 374.7 297 377.9C299.2 388.1 303.5 397.1 307.9 407.8C313.9 421.6 320 435.3 320 449.8C320 481.7 298.4 510.5 266.6 511.8C263.1 511.9 259.5 512 256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 256.9 511.1 257.8 511.1 258.7C511.6 295.2 478.4 320 441.9 320V319.1zM463.1 258.2C463.1 257.4 464 256.7 464 255.1C464 141.1 370.9 47.1 256 47.1C141.1 47.1 48 141.1 48 255.1C48 370.9 141.1 464 256 464C258.9 464 261.8 463.9 264.6 463.8C265.4 463.8 265.9 463.6 266.2 463.5C266.6 463.2 267.3 462.8 268.2 461.7C270.1 459.4 272 455.2 272 449.8C272 448.1 271.4 444.3 266.4 432.7C265.8 431.5 265.2 430.1 264.5 428.5C260.2 418.9 253.4 403.5 250.1 387.8C248.7 381.4 248 374.8 248 368C248 314.1 290.1 271.1 344 271.1H441.9C449.6 271.1 455.1 269.3 459.7 266.2C463 263.4 463.1 260.9 463.1 258.2V258.2z"/></svg>${translate('Set color')}</div>
        <div id="color-picker-button-${fId}" class="flex z-10 cursor-pointer flex items-center">
          <svg id="reset-color-picker" stroke="currentColor" fill="currentColor" stroke-width="2" viewBox="0 0 512 512" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 me-2" xmlns="http://www.w3.org/2000/svg"><path d="M496 40v160C496 213.3 485.3 224 472 224h-160C298.8 224 288 213.3 288 200s10.75-24 24-24h100.5C382.8 118.3 322.5 80 256 80C158.1 80 80 158.1 80 256s78.97 176 176 176c41.09 0 81.09-14.47 112.6-40.75c10.16-8.5 25.31-7.156 33.81 3.062c8.5 10.19 7.125 25.31-3.062 33.81c-40.16 33.44-91.17 51.77-143.5 51.77C132.4 479.9 32 379.5 32 256s100.4-223.9 223.9-223.9c79.85 0 152.4 43.46 192.1 109.1V40c0-13.25 10.75-24 24-24S496 26.75 496 40z"/></svg><input type="color" class="w-8 h-6" id="color-picker-input-${fId}" style="cursor:pointer" value="${rgba2hex(folderEl?.style?.backgroundColor || '') || '#2f2f2f'}" />
        </div>
      </div>
      <div id="set-profile-folder-conversations-button-${fId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-1"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-lg" style="position:relative;left:-2px;"><path d="M10.663 6.3872C10.8152 6.29068 11 6.40984 11 6.59007V8C11 8.55229 11.4477 9 12 9C12.5523 9 13 8.55229 13 8V6.59007C13 6.40984 13.1848 6.29068 13.337 6.3872C14.036 6.83047 14.5 7.61105 14.5 8.5C14.5 9.53284 13.8737 10.4194 12.9801 10.8006C12.9932 10.865 13 10.9317 13 11V13C13 13.5523 12.5523 14 12 14C11.4477 14 11 13.5523 11 13V11C11 10.9317 11.0068 10.865 11.0199 10.8006C10.1263 10.4194 9.5 9.53284 9.5 8.5C9.5 7.61105 9.96397 6.83047 10.663 6.3872Z" fill="currentColor"></path><path d="M17.9754 4.01031C17.8588 4.00078 17.6965 4.00001 17.4 4.00001H9.8C8.94342 4.00001 8.36113 4.00078 7.91104 4.03756C7.47262 4.07338 7.24842 4.1383 7.09202 4.21799C6.7157 4.40974 6.40973 4.7157 6.21799 5.09202C6.1383 5.24842 6.07337 5.47263 6.03755 5.91104C6.00078 6.36113 6 6.94343 6 7.80001V16.1707C6.31278 16.0602 6.64937 16 7 16H18L18 4.60001C18 4.30348 17.9992 4.14122 17.9897 4.02464C17.9893 4.02 17.9889 4.0156 17.9886 4.01145C17.9844 4.01107 17.98 4.01069 17.9754 4.01031ZM17.657 18H7C6.44772 18 6 18.4477 6 19C6 19.5523 6.44772 20 7 20H17.657C17.5343 19.3301 17.5343 18.6699 17.657 18ZM4 19L4 7.75871C3.99999 6.95374 3.99998 6.28937 4.04419 5.74818C4.09012 5.18608 4.18868 4.66938 4.43597 4.18404C4.81947 3.43139 5.43139 2.81947 6.18404 2.43598C6.66937 2.18869 7.18608 2.09012 7.74818 2.0442C8.28937 1.99998 8.95373 1.99999 9.7587 2L17.4319 2C17.6843 1.99997 17.9301 1.99994 18.1382 2.01695C18.3668 2.03563 18.6366 2.07969 18.908 2.21799C19.2843 2.40974 19.5903 2.7157 19.782 3.09203C19.9203 3.36345 19.9644 3.63318 19.9831 3.86178C20.0001 4.06994 20 4.31574 20 4.56812L20 17C20 17.1325 19.9736 17.2638 19.9225 17.386C19.4458 18.5253 19.4458 19.4747 19.9225 20.614C20.0517 20.9227 20.0179 21.2755 19.8325 21.5541C19.6471 21.8326 19.3346 22 19 22H7C5.34315 22 4 20.6569 4 19Z" fill="currentColor"></path></svg>${translate('Set profile')}</div></div>
      <div role="menuitem" id="set-image-folder-conversations-button-${fId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linejoin="round" class="icon icon-md"><path d="M112 112c-17.67 0-32 14.33-32 32s14.33 32 32 32c17.68 0 32-14.33 32-32S129.7 112 112 112zM448 96c0-35.35-28.65-64-64-64H64C28.65 32 0 60.65 0 96v320c0 35.35 28.65 64 64 64h320c35.35 0 64-28.65 64-64V96zM400 416c0 8.822-7.178 16-16 16H64c-8.822 0-16-7.178-16-16v-48h352V416zM400 320h-28.76l-96.58-144.9C271.7 170.7 266.7 168 261.3 168c-5.352 0-10.35 2.672-13.31 7.125l-62.74 94.11L162.9 238.6C159.9 234.4 155.1 232 150 232c-5.109 0-9.914 2.441-12.93 6.574L77.7 320H48V96c0-8.822 7.178-16 16-16h320c8.822 0 16 7.178 16 16V320z"/></svg>${translate('Set image')}</div></div>
      ${img ? `<div role="menuitem" id="remove-image-folder-conversations-button-${fId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linejoin="round" class="icon icon-md"><path d="M630.8 469.1l-55.95-43.85C575.3 422.2 575.1 419.2 575.1 416l.0034-320c0-35.35-28.65-64-64-64H127.1C113.6 32 100.4 36.98 89.78 45.06L38.81 5.113C28.34-3.058 13.31-1.246 5.109 9.192C-3.063 19.63-1.235 34.72 9.187 42.89L601.2 506.9C605.6 510.3 610.8 512 615.1 512c7.125 0 14.17-3.156 18.91-9.188C643.1 492.4 641.2 477.3 630.8 469.1zM527.1 388.5l-36.11-28.3l-100.7-136.8C387.8 218.8 382.1 216 376 216c-6.113 0-11.82 2.768-15.21 7.379L344.9 245L261.9 180C262.1 176.1 264 172.2 264 168c0-26.51-21.49-48-48-48c-8.336 0-16.05 2.316-22.88 6.057L134.4 80h377.6c8.822 0 16 7.178 16 16V388.5zM254.2 368.3l-37.09-46.1c-3.441-4.279-8.934-6.809-14.77-6.809c-5.842 0-11.33 2.529-14.78 6.809l-75.52 93.81c0-.0293 0 .0293 0 0L111.1 184.5l-48-37.62L63.99 416c0 35.35 28.65 64 64 64h361.1l-201.1-157.6L254.2 368.3z"/></svg>${translate('Remove image')}</div></div>` : ''}
      <div role="menuitem" id="export-folder-conversations-button-${fId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linejoin="round" class="icon icon-md"><path d="M568.1 303l-80-80c-9.375-9.375-24.56-9.375-33.94 0s-9.375 24.56 0 33.94L494.1 296H216C202.8 296 192 306.8 192 320s10.75 24 24 24h278.1l-39.03 39.03C450.3 387.7 448 393.8 448 400s2.344 12.28 7.031 16.97c9.375 9.375 24.56 9.375 33.94 0l80-80C578.3 327.6 578.3 312.4 568.1 303zM360 384c-13.25 0-24 10.74-24 24V448c0 8.836-7.164 16-16 16H64.02c-8.836 0-16-7.164-16-16L48 64.13c0-8.836 7.164-16 16-16h160L224 128c0 17.67 14.33 32 32 32h79.1v72c0 13.25 10.74 24 23.1 24S384 245.3 384 232V138.6c0-16.98-6.742-33.26-18.75-45.26l-74.63-74.64C278.6 6.742 262.3 0 245.4 0H63.1C28.65 0-.002 28.66 0 64l.0065 384c.002 35.34 28.65 64 64 64H320c35.2 0 64-28.8 64-64v-40C384 394.7 373.3 384 360 384z"></path></svg>${translate('Export')} ${hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>'}</div></div>
      <div role="menuitem" id="delete-conversation-folder-button-${fId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Delete')}</div>`;

  const menuHtml = `<div id="conversation-manager-folder-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="outline:0;pointer-events:auto">${defaultMenuItems}</div></div>`;

  document.body.insertAdjacentHTML('beforeend', menuHtml);
  adjustMenuPosition(document.querySelector('#conversation-manager-folder-menu'));
  addConversationManagerFolderMenuEventListeners(folder, isSidebar);
  document.querySelector('#conversation-manager-folder-menu')?.addEventListener('mouseleave', () => {
    button.classList.replace('flex', 'hidden');
  });
}

export async function addConversationManagerFolderMenuEventListeners(folder: any, isSidebar = false): Promise<void> {
  const fId = folder.id;
  const menu = document.querySelector('#conversation-manager-folder-menu');
  const viewModeBtn = document.querySelector(`#view-mode-conversation-folder-button-${fId}`);
  const renameBtn = document.querySelector(`#rename-conversation-folder-button-${fId}`);
  const descBtn = document.querySelector(`#edit-description-conversation-folder-button-${fId}`);
  const subfolderBtn = document.querySelector(`#add-subfolder-conversation-folder-button-${fId}`);
  const moveBtn = document.querySelector(`#move-folder-conversation-folder-button-${fId}`);
  const colorBtn = document.querySelector(`#color-conversation-folder-button-${fId}`);
  const profileBtn = document.querySelector(`#set-profile-folder-conversations-button-${fId}`);
  const imageBtn = document.querySelector(`#set-image-folder-conversations-button-${fId}`);
  const removeImgBtn = document.querySelector(`#remove-image-folder-conversations-button-${fId}`);
  const exportBtn = document.querySelector(`#export-folder-conversations-button-${fId}`);
  const deleteBtn = document.querySelector(`#delete-conversation-folder-button-${fId}`);
  const colorPicker = document.querySelector(`#color-picker-button-${fId}`);
  const clearAllBtn = document.querySelector(`#clear-all-conversation-folder-button-${fId}`);
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });

  viewModeBtn?.addEventListener('mouseenter', () => {
    showAllConversationsViewModeMenu(menu as HTMLElement);
  });
  renameBtn?.addEventListener('click', () => {
    handleRenameConversationFolderClick(fId, isSidebar);
  });
  descBtn?.addEventListener('click', () => {
    handleEditConversationFolderDescriptionClick(fId, isSidebar);
  });

  subfolderBtn?.addEventListener('click', () => {
    closeMenus();
    const existing = isSidebar
      ? document.querySelectorAll(
          '#sidebar-folder-drawer #sidebar-folder-content > div[id^="conversation-folder-wrapper-"]',
        )
      : document.querySelectorAll(
          '#modal-manager #conversation-manager-sidebar-folders > div[id^="conversation-folder-wrapper-"]',
        );
    if (!hasSub && existing.length >= 5) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message:
          'You have reached the limits of Conversation Folders with free account. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    const target = isSidebar
      ? (document.querySelector(`#sidebar-folder-content #conversation-folder-wrapper-${fId}`) as HTMLElement)
      : (document.querySelector(`#modal-manager #conversation-folder-wrapper-${fId}`) as HTMLElement);
    target?.click();
    setTimeout(() => {
      chrome.runtime.sendMessage(
        {
          type: 'addConversationFolders',
          forceRefresh: true,
          detail: {
            folders: [
              {
                name: 'New Folder',
                color: folder.color,
                profile: folder.profile?.id,
                parent_folder: fId,
                image_url: folder.image || folder.image_url,
                gizmo_id: folder.gizmo_id,
              },
            ],
          },
        },
        (result: any) => {
          if (result?.error?.type === 'limit') {
            errorUpgradeConfirmation(result.error);
            return;
          }
          if (!result || result.length === 0) return;
          if (isSidebar) {
            addNewConvFolderElementToSidebar(result[0]);
          } else {
            const subList = document.querySelector('#conversation-manager-subfolder-list');
            const newEl = conversationFolderElement(result[0]);
            if (newEl) subList?.prepend(newEl);
            subList?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            addNewConvFolderElementToSidebar(result[0]);
          }
          document.querySelectorAll(`#folder-subfolder-count-${fId}`).forEach((el) => {
            const c = parseInt(el.textContent!.split(' ')[0]!, 10);
            el.textContent = `${c + 1} folder${c + 1 === 1 ? '' : 's'} -`;
          });
          handleRenameConversationFolderClick(result[0].id);
        },
      );
    }, 100);
  });

  moveBtn?.addEventListener('click', () => {
    openMoveConvFolderModal(folder);
  });
  colorBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
  });
  colorPicker?.addEventListener('click', (ev) => {
    ev.stopPropagation();
  });

  const debouncedUpdate = debounce((data: any) => {
    chrome.runtime.sendMessage({ type: 'updateConversationFolder', detail: { folderId: fId, newData: data } });
  }, 200);

  colorPicker?.querySelector('input[id^=color-picker-input-]')?.addEventListener('input', (ev) => {
    const val = (ev.target as HTMLInputElement).value;
    document.querySelectorAll(`#conversation-folder-wrapper-${fId}`).forEach((el) => {
      (el as HTMLElement).style.backgroundColor = val;
    });
    const data = { color: val };
    updateConversationFolderIndicators(fId, data);
    debouncedUpdate(data);
  });

  colorPicker?.querySelector('#reset-color-picker')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();
    document.querySelectorAll(`#conversation-folder-wrapper-${fId}`).forEach((el) => {
      (el as HTMLElement).style.backgroundColor = '#2f2f2f';
    });
    (colorPicker.querySelector('input[id^=color-picker-input-]') as HTMLInputElement).value = '#2f2f2f';
    const data = { color: '#2f2f2f' };
    updateConversationFolderIndicators(fId, data);
    chrome.runtime.sendMessage({ type: 'updateConversationFolder', detail: { folderId: fId, newData: data } });
  });

  profileBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    openFolderProfileSelectorModal(folder);
  });

  imageBtn?.addEventListener('click', () => {
    closeMenus();
    const form = document.createElement('form');
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    form.appendChild(input);
    document.body.appendChild(form);
    input.click();
    input.onchange = async () => {
      const file = input.files![0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const newData = {
          image: { base64: (reader.result as string).split(',')[1], type: file.type, name: file.name },
        };
        const dataUrl = e.target!.result as string;
        const imgs = document.querySelectorAll(`#conversation-folder-image-${fId}`) as NodeListOf<HTMLImageElement>;
        imgs.forEach((img) => {
          img.src = dataUrl;
          img.classList.remove('hidden');
        });
        chrome.runtime.sendMessage(
          { type: 'updateConversationFolder', detail: { folderId: fId, newData } },
          (resp: any) => {
            if (resp?.error) {
              toast(resp.error, 'error');
              return;
            }
            imgs.forEach((img) => {
              img.src = resp.image;
            });
          },
        );
      };
      reader.readAsDataURL(file);
    };
  });

  removeImgBtn?.addEventListener('click', () => {
    closeMenus();
    document.querySelectorAll(`#conversation-folder-image-${fId}`).forEach((el) => {
      (el as HTMLImageElement).src = chrome.runtime.getURL('icons/folder.png');
      el.className = 'w-5 h-5 me-3 rounded-md object-cover';
    });
    chrome.runtime.sendMessage({ type: 'removeConversationFolderImage', detail: { folderId: fId } });
  });

  exportBtn?.addEventListener('click', async () => {
    if (!hasSub) {
      errorUpgradeConfirmation({
        title: 'This is a Pro feature',
        message: 'Exporting all conversations requires a Pro subscription. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    const ids =
      fId === 'all'
        ? []
        : await chrome.runtime.sendMessage({
            type: fId === 'favorites' ? 'getAllFavoriteConversationIds' : 'getAllFolderConversationIds',
            detail: { folderId: fId },
          });
    if (fId !== 'all' && ids && ids.length === 0) {
      toast('No conversations found in this folder', 'error');
      return;
    }
    openExportModal(ids, fId === 'all' ? 'all' : fId === 'favorites' ? 'favorite' : 'folder');
  });

  deleteBtn?.addEventListener('click', () => {
    showConfirmDialog(
      'Delete Folder',
      'Are you sure you want to delete this folder? All conversations and sub folders inside this folder will be deleted too.',
      'Cancel',
      'Delete Folder',
      null,
      () => confirmDeleteConversationManagerFolder(folder, isSidebar),
      'red',
      false,
    );
  });

  clearAllBtn?.addEventListener('click', () => {
    closeMenus();
    const titles: Record<string, string> = {
      all: 'Delete all conversations',
      favorites: 'Reset favorite conversations',
    };
    const msgs: Record<string, string> = {
      all: 'Are you sure you want to delete all your conversations? This will also delete all conversations in all folders.',
      favorites: 'Are you sure you want to unfave all your favorite conversations?',
    };
    showConfirmDialog(titles[fId] || '', msgs[fId] || '', 'Cancel', 'Confirm', null, () => {
      (document.querySelector('#sidebar-folder-drawer #folder-breadcrumb-root') as HTMLElement)?.click();
      if (fId === 'all' || selectedConversationFolderBreadcrumb.map((f: any) => f.id).includes(fId)) {
        const listEl = document.querySelector('#conversation-manager-conversation-list') as HTMLElement;
        if (listEl) {
          listEl.innerHTML = '';
          listEl.appendChild(noConversationElement());
        }
      }
      if (fId === 'all') {
        resetConversationCounts();
        deleteAllConversations();
        chrome.runtime.sendMessage({ type: 'deleteAllConversations' });
        return;
      }
      if (fId === 'favorites') {
        chrome.runtime.sendMessage({ type: 'resetAllFavoriteConversations' });
      }
    });
  });
}

export function confirmDeleteConversationManagerFolder(folder: any, isSidebar = false): void {
  const fId = folder.id;
  document.querySelectorAll(`#conversation-folder-wrapper-${fId}`).forEach((el) => el.remove());
  if (isSidebar) {
    const defaultEl = document.querySelector('#sidebar-folder-content #default-conversation-folders');
    if (defaultEl && !defaultEl.nextElementSibling)
      defaultEl.insertAdjacentElement('afterend', noConversationFolderElemet());
  } else {
    const first = document.querySelector(
      '#conversation-manager-sidebar-folders > div[id^="conversation-folder-wrapper-"]',
    );
    if (first) {
      if (selectedConversationFolderBreadcrumb.map((f: any) => f.id).includes(fId)) (first as HTMLElement).click();
    } else {
      document.querySelector('#conversation-manager-sidebar-folders')?.appendChild(noConversationFolderElemet());
      (document.querySelector('#modal-manager #conversation-folder-wrapper-all') as HTMLElement)?.click();
    }
  }
  const parentId = folder.parent_folder;
  document.querySelectorAll(`#folder-subfolder-count-${parentId}`).forEach((el) => {
    const c = parseInt(el.textContent!.split(' ')[0]!, 10);
    el.textContent = `${c - 1} folder${c - 1 === 1 ? '' : 's'} -`;
  });
  const progressEl = document.querySelector('#confirm-action-dialog #confirm-button div') as HTMLElement | null;
  chrome.runtime.sendMessage({ type: 'deleteConversationFolders', detail: { folderIds: [fId] } }, async (resp: any) => {
    if (resp?.error) {
      toast(resp.error, 'error');
      return;
    }
    const ids = resp.deleted_conversation_ids;
    ids.forEach((id: string) => removeConversationElements(id));
    for (let i = 0; i < ids.length; i += 1) {
      try {
        await deleteConversation(ids[i]);
      } catch (err) {
        console.warn(err);
      }
      if (progressEl && ids.length > 1)
        progressEl.innerHTML = `<div class="w-full h-full inset-0 flex items-center justify-center text-white"><svg x="0" y="0" viewbox="0 0 40 40" style="width:16px; height:16px;" class="spinner icon icon-xl me-2"><circle fill="transparent" stroke="#ffffff50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg><span class="visually-hidden">${i + 1} / ${ids.length}</span></div>`;
    }
    document.querySelector('#confirm-action-dialog')?.remove();
  });
}

function showAllConversationsViewModeMenu(parentMenu: HTMLElement): void {
  const { right, top } = parentMenu.getBoundingClientRect();
  const x = right + 2;
  const y = top - 50;
  const checkSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg>';
  const html = `<div id="prompt-manager-sidebar-settings-sort-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="outline:0;pointer-events:auto">
    <div role="menuitem" id="view-mode-all-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Show all conversations')} ${cachedSettings.excludeConvInFolders ? '' : checkSvg}</div>
    <div role="menuitem" id="view-mode-unassigned-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Only unassigned conversations')} ${cachedSettings.excludeConvInFolders ? checkSvg : ''}</div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  addAllConversationsViewModeMenuEventListeners();
}

function addAllConversationsViewModeMenuEventListeners(): void {
  document.querySelector('#view-mode-all-button')?.addEventListener('click', () => {
    const s = { ...cachedSettings };
    s.excludeConvInFolders = false;
    chrome.storage.local.set({ settings: s }, () => {
      fetchConversations();
      fetchSidebarConversations();
    });
  });
  document.querySelector('#view-mode-unassigned-button')?.addEventListener('click', () => {
    const s = { ...cachedSettings };
    s.excludeConvInFolders = true;
    chrome.storage.local.set({ settings: s }, () => {
      fetchConversations();
      fetchSidebarConversations();
    });
  });
}

// ---------------------------------------------------------------------------
// Context menu items
// ---------------------------------------------------------------------------

export function addConversationMenuEventListener(): void {
  document.body.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    if (btn.getAttribute('data-testid') === 'conversation-options-button') {
      const convId = getConversationIdFromUrl();
      if (convId) addExtraConversationMenuItems(convId, 'navbar');
      return;
    }
    const link = btn.closest('a[href*="/c/"]') as HTMLAnchorElement | null;
    if (!link || !link.closest('nav')) return;
    const convId = link.href.split('/').pop()!;
    addExtraConversationMenuItems(convId);
  });
}

export async function addExtraConversationMenuItems(convId: string, origin = 'sidebar'): Promise<void> {
  if (!convId) return;
  const menu = document.body.querySelector('div[role="menu"]');
  if (!menu) return;
  const items = menu.querySelectorAll('div[role="menuitem"]');
  if (!items || menu.querySelector('#export-conversation-menu-item')) return;

  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const dbConv = await chrome.runtime.sendMessage({ type: 'getConversation', detail: { conversationId: convId } });
  const apiConv = await getConversationById(convId);
  const conv = { ...dbConv, ...apiConv };

  const menuItems = [
    {
      text: `${conv?.is_favorite ? 'Remove from' : 'Add to'} favorites`,
      requirePro: false,
      origin: ['sidebar', 'navbar'],
      dataTestId: 'favorite-conversation-menu-item',
      icon: conv?.is_favorite
        ? '<svg width="20" height="20" class="icon" fill="gold" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3L524.9 171.5C536.8 173.2 546.8 181.6 550.6 193.1C554.4 204.7 551.3 217.3 542.7 225.9L438.5 328.1L463.1 474.7C465.1 486.7 460.2 498.9 450.2 506C440.3 513.1 427.2 514 416.5 508.3L288.1 439.8L159.8 508.3C149 514 135.9 513.1 126 506C116.1 498.9 111.1 486.7 113.2 474.7L137.8 328.1L33.58 225.9C24.97 217.3 21.91 204.7 25.69 193.1C29.46 181.6 39.43 173.2 51.42 171.5L195 150.3L259.4 17.97C264.7 6.954 275.9-.0391 288.1-.0391C300.4-.0391 311.6 6.954 316.9 17.97L381.2 150.3z"/></svg>'
        : '<svg width="20" height="20" class="icon" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M287.9 0C297.1 0 305.5 5.25 309.5 13.52L378.1 154.8L531.4 177.5C540.4 178.8 547.8 185.1 550.7 193.7C553.5 202.4 551.2 211.9 544.8 218.2L433.6 328.4L459.9 483.9C461.4 492.9 457.7 502.1 450.2 507.4C442.8 512.7 432.1 513.4 424.9 509.1L287.9 435.9L150.1 509.1C142.9 513.4 133.1 512.7 125.6 507.4C118.2 502.1 114.5 492.9 115.1 483.9L142.2 328.4L31.11 218.2C24.65 211.9 22.36 202.4 25.2 193.7C28.03 185.1 35.5 178.8 44.49 177.5L197.7 154.8L266.3 13.52C270.4 5.249 278.7 0 287.9 0L287.9 0zM287.9 78.95L235.4 187.2C231.9 194.3 225.1 199.3 217.3 200.5L98.98 217.9L184.9 303C190.4 308.5 192.9 316.4 191.6 324.1L171.4 443.7L276.6 387.5C283.7 383.7 292.2 383.7 299.2 387.5L404.4 443.7L384.2 324.1C382.9 316.4 385.5 308.5 391 303L476.9 217.9L358.6 200.5C350.7 199.3 343.9 194.3 340.5 187.2L287.9 78.95z"/></svg>',
      click: async (ctx: any) => {
        const result = await chrome.runtime.sendMessage({
          type: 'toggleConversationFavorite',
          forceRefresh: true,
          detail: { conversation: ctx.conversation },
        });
        toast(`${result.is_favorite ? 'Added to' : 'Removed from'} favorites`);
      },
    },
    {
      text: 'Export',
      requirePro: false,
      origin: ['sidebar', 'navbar'],
      dataTestId: 'export-conversation-menu-item',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linejoin="round" width="24" height="24" class="h-4 w-4 shrink-0"><path d="M568.1 303l-80-80c-9.375-9.375-24.56-9.375-33.94 0s-9.375 24.56 0 33.94L494.1 296H216C202.8 296 192 306.8 192 320s10.75 24 24 24h278.1l-39.03 39.03C450.3 387.7 448 393.8 448 400s2.344 12.28 7.031 16.97c9.375 9.375 24.56 9.375 33.94 0l80-80C578.3 327.6 578.3 312.4 568.1 303zM360 384c-13.25 0-24 10.74-24 24V448c0 8.836-7.164 16-16 16H64.02c-8.836 0-16-7.164-16-16L48 64.13c0-8.836 7.164-16 16-16h160L224 128c0 17.67 14.33 32 32 32h79.1v72c0 13.25 10.74 24 23.1 24S384 245.3 384 232V138.6c0-16.98-6.742-33.26-18.75-45.26l-74.63-74.64C278.6 6.742 262.3 0 245.4 0H63.1C28.65 0-.002 28.66 0 64l.0065 384c.002 35.34 28.65 64 64 64H320c35.2 0 64-28.8 64-64v-40C384 394.7 373.3 384 360 384z"/></svg>',
      click: (ctx: any) => {
        closeRadix(ctx.event);
        openExportModal([ctx.convId], 'selected');
      },
    },
    {
      text: 'Move to folder',
      requirePro: false,
      origin: ['sidebar', 'navbar'],
      dataTestId: 'move-conversation-menu-item',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" class="h-4 w-4 shrink-0" stroke-width="2" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>',
      click: (ctx: any) => {
        closeRadix(ctx.event);
        openMoveConvToFolderModal([ctx.convId]);
      },
    },
    {
      text: 'Edit notes',
      requirePro: false,
      origin: ['sidebar', 'navbar'],
      dataTestId: 'edit-notes-menu-item',
      icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="icon"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor"></path></svg>',
      click: (ctx: any) => {
        closeRadix(ctx.event);
        chrome.runtime.sendMessage({ type: 'getNote', detail: { conversationId: ctx.convId } }, async (note: any) => {
          const n = note ?? {};
          let title = document.querySelector(`#conversation-card-${ctx.convId} #conversation-title`)?.textContent;
          if (!title) title = (await getConversationById(ctx.convId))?.title;
          openNotePreviewModal({ ...n, conversation_id: ctx.convId, name: title });
        });
      },
    },
  ];

  const firstItem = items[0];
  if (!firstItem) return;
  menuItems.forEach((item) => {
    if (!item.origin.includes(origin)) return;
    const el = firstItem.cloneNode(true) as HTMLElement;
    el.setAttribute('data-testid', item.dataTestId);
    el.classList.add('hover:bg-token-surface-hover');
    el.classList.remove('sm:hidden', 'md:hidden', 'lg:hidden', 'xl:hidden', 'hidden');
    firstItem.parentElement!.insertBefore(el, firstItem);
    el.innerHTML = `<div class="flex shrink-0 items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon">${item.icon}</div>${translate(item.text)}`;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      item.click({ menuButton: el, convId, conversation: conv, hasSubscription: hasSub, event: ev });
    });
  });

  const sep = document.createElement('div');
  sep.setAttribute('role', 'separator');
  sep.className = 'bg-token-border-default h-px mx-4 my-1 first:hidden last:hidden';
  firstItem.parentElement!.insertBefore(sep, firstItem);
}

export function addProjectMenuEventListener(): void {
  document.body.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    const link = btn.closest('a[href*="/g/g-p-"]') as HTMLAnchorElement | null;
    if (!link || !link.closest('nav')) return;
    const projectId = getProjectIdFromUrl(link.href);
    if (!projectId) return;
    addExtraProjectMenuItems(projectId);
  });
}

export async function createFolderFromProject(name: string, convIds: string[]): Promise<void> {
  await goToFolder([]);
  const newFolder = { name, color: generateRandomDarkColor() };
  const result = await chrome.runtime.sendMessage({ type: 'addConversationFolders', detail: { folders: [newFolder] } });
  if (result?.error?.type === 'limit') {
    errorUpgradeConfirmation(result.error);
    return;
  }
  if (!result || result.length === 0) {
    toast('Failed to create folder from project conversations.', 'error');
    return;
  }
  addNewConvFolderElementToSidebar(result[0]);
  await moveConvToFolder(convIds, result[0].id, result[0].name, result[0].color);
  toast(`Created folder "${name}" and moved ${convIds.length} conversations to it.`, 'success');
}

export async function addExtraProjectMenuItems(projectId: string): Promise<void> {
  const menu = document.body.querySelector('div[role="menu"]');
  if (!menu) return;
  const items = menu.querySelectorAll('div[role="menuitem"]');
  if (!items) return;
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });

  const projectItems = [
    {
      text: 'Create folder from project',
      requirePro: true,
      icon: '<svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" class="icon-sm" stroke-width="2" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"></path></svg>',
      click: async (ctx: any) => {
        if (!hasSub) {
          errorUpgradeConfirmation({
            title: 'This is a Pro feature',
            message: 'Creating a folder from your project conversations requires a Pro subscription.',
          });
          return;
        }
        if (!ctx.projectId) return;
        const convs = await getProjectConversations(ctx.projectId);
        if (!convs || convs.length === 0) {
          toast('No conversations found in this project.', 'error');
          return;
        }
        await chrome.runtime.sendMessage({ type: 'addConversations', detail: { conversations: convs } });
        const ids = convs.map((c: any) => c.id);
        const name = getProjectName(ctx.projectId);
        createFolderFromProject(name, ids);
      },
    },
    {
      text: 'Export Conversations',
      requirePro: true,
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" stroke="currentColor" fill="currentColor" stroke-width="2" stroke-linejoin="round" width="20" height="20" class="icon-sm"><path d="M568.1 303l-80-80c-9.375-9.375-24.56-9.375-33.94 0s-9.375 24.56 0 33.94L494.1 296H216C202.8 296 192 306.8 192 320s10.75 24 24 24h278.1l-39.03 39.03C450.3 387.7 448 393.8 448 400s2.344 12.28 7.031 16.97c9.375 9.375 24.56 9.375 33.94 0l80-80C578.3 327.6 578.3 312.4 568.1 303zM360 384c-13.25 0-24 10.74-24 24V448c0 8.836-7.164 16-16 16H64.02c-8.836 0-16-7.164-16-16L48 64.13c0-8.836 7.164-16 16-16h160L224 128c0 17.67 14.33 32 32 32h79.1v72c0 13.25 10.74 24 23.1 24S384 245.3 384 232V138.6c0-16.98-6.742-33.26-18.75-45.26l-74.63-74.64C278.6 6.742 262.3 0 245.4 0H63.1C28.65 0-.002 28.66 0 64l.0065 384c.002 35.34 28.65 64 64 64H320c35.2 0 64-28.8 64-64v-40C384 394.7 373.3 384 360 384z"/></svg>',
      click: async (ctx: any) => {
        if (!hasSub) {
          errorUpgradeConfirmation({
            title: 'This is a Pro feature',
            message: 'Exporting project conversations requires a Pro subscription.',
          });
          return;
        }
        if (!ctx.projectId) return;
        const convs = await getProjectConversations(ctx.projectId);
        if (!convs || convs.length === 0) {
          toast('No conversations found in this project.', 'error');
          return;
        }
        await chrome.runtime.sendMessage({ type: 'addConversations', detail: { conversations: convs } });
        const ids = convs.map((c: any) => c.id);
        const name = getProjectName(ctx.projectId);
        openExportModal(ids, 'project');
      },
    },
  ];

  const firstItem = items[0];
  const lastItem = items[items.length - 1];
  if (!firstItem || !lastItem) return;
  projectItems.forEach((item) => {
    const el = firstItem.cloneNode(true) as HTMLElement;
    el.classList.add('hover:bg-token-surface-hover');
    el.removeAttribute('data-color');
    lastItem.parentElement!.insertBefore(el, lastItem);
    el.innerHTML = `<div class="flex min-w-0 grow items-center gap-2.5">${item.icon}${translate(item.text)}${!item.requirePro || hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm ml-auto">Pro</span>'}</div>`;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      item.click({ menuButton: el, projectId, hasSubscription: hasSub, event: ev });
    });
  });
}

// ---------------------------------------------------------------------------
// Move conversation to folder modal
// ---------------------------------------------------------------------------

export async function openMoveConvToFolderModal(conversationIds: string[]): Promise<void> {
  const html = `
  <div id="move-conv-to-folder-modal" class="absolute inset-0" style="z-index: 10000;">
    <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
      <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
        <div id="move-conv-to-folder-content" role="dialog" data-state="open" class="popover bg-token-main-surface-primary relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col focus:outline-hidden overflow-hidden max-w-lg" tabindex="-1" style="pointer-events: auto;">
          <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
            <div class="flex"><div class="flex items-center"><div class="flex grow flex-col gap-1">
              <h2 class="text-lg font-medium leading-6 text-token-text-primary">${translate('Select a folder')}</h2>
            </div></div></div>
            <div class="flex items-center">
              <button id="move-conv-to-folder-new-folder" class="btn flex justify-center gap-2 composer-submit-btn composer-submit-button-color me-2 border" style="min-width: 72px; height: 34px;">${translate('plus New Folder')}</button>
              <button id="move-conv-to-folder-close-button" class="text-token-text-tertiary hover:text-token-text-primary transition">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <div class="px-4 pt-4 text-sm">
            <div class="text-token-text-tertiary">Moving conversation${conversationIds.length > 1 ? 's' : ''} from:</div>
            <div id="moveConvToFolderBreadcrumb"></div>
          </div>
          <div class="px-4 pt-4">
            <input autofocus id="move-conv-to-folder-search-input" type="search" placeholder="${translate('Search folders')}" class="w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary">
          </div>
          <div id="move-conv-to-folder-list" class="p-4 overflow-y-auto" style="height:500px;"></div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  await moveConvToFolderLoadFolderList();
  addMoveConvToFolderModalEventListener(conversationIds);

  const debouncedLoad = debounce(async (searchTerm: string) => {
    await moveConvToFolderLoadFolderList(searchTerm);
    addMoveConvToFolderModalEventListener(conversationIds);
  }, 500);

  const searchInput = document.querySelector('#move-conv-to-folder-search-input') as HTMLInputElement;
  searchInput.focus();
  searchInput.addEventListener('input', () => debouncedLoad(searchInput.value));

  const conv = await chrome.runtime.sendMessage({
    type: 'getConversation',
    detail: { conversationId: conversationIds[0] },
  });
  const bcHtml = convMenuBreadcrumb(conv?.breadcrumb);
  const bcEl = document.querySelector('#moveConvToFolderBreadcrumb') as HTMLElement;
  bcEl.innerHTML = bcHtml;
}

async function moveConvToFolderLoadFolderList(searchTerm = ''): Promise<void> {
  const list = document.querySelector('#move-conv-to-folder-list') as HTMLElement;
  list.innerHTML = '';
  list.appendChild(loadingSpinner('move-conv-to-folder-list'));
  const folders = await chrome.runtime.sendMessage({
    type: 'getConversationFolders',
    detail: { sortBy: 'alphabetical', searchTerm },
  });
  list.innerHTML =
    folders.length > 0
      ? folders.map((f: any) => moveConvToFolderSimpleFolderElement(f)).join('')
      : '<div id="no-conversation-folders" class="text-sm text-token-text-tertiary">No folders found.</div>';
}

function moveConvToFolderSimpleFolderElement(folder: any): string {
  const isLocked = folder.id === -1;
  const imgSrc = folder.image || folder.image_url || chrome.runtime.getURL('icons/folder.png');
  const searchTerm =
    (document.querySelector('#move-conv-to-folder-search-input') as HTMLInputElement)?.value?.toLowerCase() || '';
  const displayName = searchTerm
    ? [...(folder.breadcrumb || []), { name: folder.name }].map((b: any) => b.name).join(CHEVRON_SMALL_SVG)
    : folder.name;
  const titleText = searchTerm
    ? [...(folder.breadcrumb || []), { name: folder.name }].map((b: any) => b.name).join(' > ')
    : folder.name;

  return `<div id="move-conv-to-folder-wrapper-folder-${folder.id}" title="${titleText}" class="flex w-full mb-2 group ${isLocked ? 'opacity-50 pointer-events-none' : ''}" style="flex-wrap: wrap;"><div id="folder-${folder.id}" class="flex py-3 px-3 pe-3 w-full border border-token-border-medium items-center gap-3 relative rounded-md cursor-pointer break-all hover:pe-10 group" style="background-color: ${folder.color};"><img class="w-6 h-6 object-cover rounded-md" src="${imgSrc}" style="filter:drop-shadow(0px 0px 1px black);" data-is-open="false"><div id="title-folder-${folder.id}" class="flex flex-1 items-center text-ellipsis max-h-5 overflow-hidden whitespace-nowrap break-all relative text-white relative" style="bottom: 6px;">${displayName}</div><div id="folder-actions-wrapper-${folder.id}" class="absolute flex end-1 z-10 text-gray-300"><button id="move-conv-to-folder-button-${folder.id}" class="btn btn-xs btn-primary group-hover:visible ${isLocked ? '' : 'invisible'}" title="Move to folder">${isLocked ? 'Upgrade to pro' : 'Move to this folder'}</button></div><div id="count-folder-${folder.id}" style="color: rgba(255, 255, 255, 0.6); font-size: 10px; position: absolute; left: 50px; bottom: 2px; display: block;">${folder?.subfolders?.length || 0} folder${folder?.subfolders?.length === 1 ? '' : 's'} - ${folder.conversation_count} chat${folder.conversation_count === 1 ? '' : 's'}</div></div></div>`;
}

function addMoveConvToFolderModalEventListener(conversationIds: string[]): void {
  document.querySelectorAll('[id^=move-conv-to-folder-wrapper-folder-]').forEach((el) => {
    el.addEventListener('click', (ev) =>
      moveConvToFolderOpenFolder(el as HTMLElement, conversationIds, (ev as MouseEvent).shiftKey),
    );
  });

  document.querySelectorAll('button[id^=move-conv-to-folder-button-]').forEach((btn) => {
    const fid = btn.id.split('move-conv-to-folder-button-')[1];
    const name = (document.querySelector(`#title-folder-${fid}`) as HTMLElement)?.textContent || '';
    const color = (document.querySelector(`#folder-${fid}`) as HTMLElement)?.style.backgroundColor || '';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (fid === '-1') {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message:
            'With free account, you can only have up to 5 conversation folders. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      moveConvToFolder(conversationIds, fid!, name!, color!);
      document.querySelector('#move-conv-to-folder-modal')?.remove();
    });
  });

  document.querySelector('#move-conv-to-folder-new-folder')?.addEventListener('click', async () => {
    const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
    const existing = document.querySelectorAll(
      '#move-conv-to-folder-content [id^=move-conv-to-folder-wrapper-folder-]',
    );
    if (!hasSub && existing.length >= 5) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    const name = prompt('Enter folder name:', 'New Folder');
    if (!name) return;
    document.querySelectorAll('#no-conversation-folders').forEach((el) => el.remove());
    const result = await chrome.runtime.sendMessage({
      type: 'addConversationFolders',
      detail: { folders: [{ name, color: generateRandomDarkColor() }] },
    });
    if (result?.error?.type === 'limit') {
      errorUpgradeConfirmation(result.error);
      return;
    }
    const list = document.querySelector('#move-conv-to-folder-list') as HTMLElement;
    list.insertAdjacentHTML('afterbegin', moveConvToFolderSimpleFolderElement(result[0]));
    const newEl = document.querySelector(`#move-conv-to-folder-wrapper-folder-${result[0].id}`) as HTMLElement;
    newEl?.addEventListener('click', (ev) =>
      moveConvToFolderOpenFolder(newEl, conversationIds, (ev as MouseEvent).shiftKey),
    );
    document.querySelector(`#move-conv-to-folder-button-${result[0].id}`)?.addEventListener('click', () => {
      moveConvToFolder(conversationIds, result[0].id, result[0].name, result[0].color);
      document.querySelector('#move-conv-to-folder-modal')?.remove();
    });
    if (!getLastSelectedConversationFolder()) addNewConvFolderElementToSidebar(result[0]);
    addNewConvFolderElementToManagerSidebar(result[0]);
  });

  document.querySelector('#move-conv-to-folder-close-button')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    document.querySelector('#move-conv-to-folder-modal')?.remove();
  });

  document.body.addEventListener('click', (ev) => {
    const modal = document.querySelector('#move-conv-to-folder-modal');
    const content = document.querySelector('#move-conv-to-folder-content');
    if (content && modal && isDescendant(modal, ev.target) && !isDescendant(content, ev.target)) modal.remove();
  });
}

function moveConvToFolderOpenFolder(el: HTMLElement, conversationIds: string[], forceRefresh = false): void {
  const fid = el.id.split('move-conv-to-folder-wrapper-folder-')[1];
  const next = el.nextElementSibling as HTMLElement | null;

  if (forceRefresh) {
    if (next?.id === `subfolder-wrapper-${fid}`) next.remove();
  } else if (next?.id === `subfolder-wrapper-${fid}`) {
    next.classList.contains('hidden') ? next.classList.remove('hidden') : next.classList.add('hidden');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = `subfolder-wrapper-${fid}`;
  wrapper.className = 'ps-4 border-s border-token-border-medium';
  el.insertAdjacentElement('afterend', wrapper);

  const inner = document.createElement('div');
  inner.className = 'flex flex-col mb-4 relative';
  inner.style.minHeight = '32px';
  inner.appendChild(loadingSpinner('subfolder-list'));
  wrapper.appendChild(inner);

  chrome.runtime.sendMessage(
    { type: 'getConversationFolders', forceRefresh, detail: { sortBy: 'alphabetical', parentFolderId: fid } },
    (subfolders: any[]) => {
      if (!subfolders || !Array.isArray(subfolders)) return;
      inner.innerHTML = '';
      subfolders.forEach((sf) => {
        inner.insertAdjacentHTML('beforeend', moveConvToFolderSimpleFolderElement(sf));
        const sfEl = document.querySelector(`#move-conv-to-folder-wrapper-folder-${sf.id}`) as HTMLElement | null;
        sfEl?.addEventListener('click', (ev) =>
          moveConvToFolderOpenFolder(sfEl, conversationIds, (ev as MouseEvent).shiftKey),
        );
        document.querySelector(`#move-conv-to-folder-button-${sf.id}`)?.addEventListener('click', () => {
          moveConvToFolder(conversationIds, sf.id, sf.name, sf.color);
          document.querySelector('#move-conv-to-folder-modal')?.remove();
        });
      });

      const newSubBtn = document.createElement('button');
      newSubBtn.className = 'btn btn-xs btn-primary mt-2';
      newSubBtn.innerText = '\uFF0B New Subfolder';
      inner.appendChild(newSubBtn);
      newSubBtn.addEventListener('click', async () => {
        const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
        const existing = document.querySelectorAll(
          '#move-conv-to-folder-content [id^=move-conv-to-folder-wrapper-folder-]',
        );
        if (!hasSub && existing.length >= 5) {
          errorUpgradeConfirmation({
            type: 'limit',
            title: 'You have reached the limit',
            message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
          });
          return;
        }
        const name = prompt('Enter folder name:', 'New Folder');
        if (!name) return;
        const parentColor =
          el
            .querySelector('div[id^=folder-]')
            ?.getAttribute('style')
            ?.match(/background-color:\s*([^;]+)/)?.[1] || generateRandomDarkColor();
        const parentImg = (el.querySelector('div[id^=folder-] img') as HTMLImageElement)?.src || '';
        const result = await chrome.runtime.sendMessage({
          type: 'addConversationFolders',
          detail: { folders: [{ name, color: parentColor, image_url: parentImg, parent_folder: parseInt(fid!, 10) }] },
        });
        if (result?.error?.type === 'limit') {
          errorUpgradeConfirmation(result.error);
          return;
        }
        inner.insertAdjacentHTML('afterbegin', moveConvToFolderSimpleFolderElement(result[0]));
        const newEl = document.querySelector(`#move-conv-to-folder-wrapper-folder-${result[0].id}`) as HTMLElement;
        newEl?.addEventListener('click', (ev) =>
          moveConvToFolderOpenFolder(newEl, conversationIds, (ev as MouseEvent).shiftKey),
        );
        document.querySelector(`#move-conv-to-folder-button-${result[0].id}`)?.addEventListener('click', () => {
          moveConvToFolder(conversationIds, result[0].id, result[0].name, result[0].color);
          toast('Conversation moved successfully');
          document.querySelector('#move-conv-to-folder-modal')?.remove();
        });
      });
    },
  );
}

export async function moveConvToFolder(
  conversationIds: string[],
  folderId: string | number,
  folderName: string,
  folderColor: string,
): Promise<void> {
  toast('Conversation moved to folder');
  const lastFolder = getLastSelectedConversationFolder();
  updateConversationFolderCount(folderId, conversationIds);

  if (
    lastFolder?.id !== folderId &&
    (!isDefaultConvFolder(lastFolder?.id?.toString()) ||
      (cachedSettings?.excludeConvInFolders && lastFolder?.id?.toString() === 'all'))
  ) {
    conversationIds.forEach((cid) => {
      document.querySelectorAll(`#conversation-card-${cid}`).forEach((el) => el.remove());
    });
    const managerList = document.querySelector(
      '#modal-manager #conversation-manager-conversation-list',
    ) as HTMLElement | null;
    if (managerList && managerList.children.length === 0) managerList.appendChild(noConversationElement());
    const sidebarContent = document.querySelector('#sidebar-folder-content') as HTMLElement | null;
    if (sidebarContent && sidebarContent.querySelectorAll('[id^=conversation-card-]').length === 0)
      sidebarContent.appendChild(noConversationElement());
  } else {
    conversationIds.forEach((cid) => {
      document
        .querySelectorAll(`#conversation-card-${cid}`)
        .forEach((el) => ((el as HTMLElement).dataset.folderId = folderId.toString()));
      if (lastFolder?.id?.toString() !== folderId.toString()) {
        document
          .querySelectorAll(`#conversation-card-folder-wrapper-${cid}`)
          .forEach((el) => el.classList.remove('hidden'));
      }
      document.querySelectorAll(`#conversation-card-folder-tag-${cid}`)?.forEach((el) => {
        el.classList.remove('hidden');
        (el as HTMLElement).style.backgroundColor = folderColor;
      });
      document.querySelectorAll(`#conversation-card-folder-name-${cid}`)?.forEach((el) => {
        (el as HTMLElement).innerText = folderName;
      });
      document.querySelectorAll(`#conversation-card-folder-color-indicator-${cid}`).forEach((el) => {
        (el as HTMLElement).style.backgroundColor = folderColor;
        (el as HTMLElement).title = folderName || '';
        (el as HTMLElement).dataset.folderId = folderId.toString();
      });
      const cb = document.querySelector(`#modal-manager #conversation-checkbox-${cid}`) as HTMLInputElement | null;
      if (cb) cb.checked = false;
    });
  }

  resetConversationManagerSelection();
  resetSidebarConversationSelection();
  chrome.runtime.sendMessage({
    type: 'moveConversationIdsToFolder',
    detail: { folderId: parseInt(folderId.toString(), 10), conversationIds },
  });
}

// ---------------------------------------------------------------------------
// Move folder modal
// ---------------------------------------------------------------------------

export async function openMoveConvFolderModal(folder: any): Promise<void> {
  const html = `
  <div id="move-conv-folder-modal" class="absolute inset-0" style="z-index: 10000;">
    <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
      <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
        <div id="move-conv-folder-content" role="dialog" data-state="open" class="popover bg-token-main-surface-primary relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col focus:outline-hidden overflow-hidden max-w-lg" tabindex="-1" style="pointer-events: auto;">
          <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
            <div class="flex"><div class="flex items-center"><div class="flex grow flex-col gap-1">
              <h2 class="text-lg font-medium leading-6 text-token-text-primary">${translate('Select a folder')}</h2>
            </div></div></div>
            <div class="flex items-center">
              <button id="move-conv-folder-new-folder" class="btn flex justify-center gap-2 composer-submit-btn composer-submit-button-color me-2 border" style="min-width: 72px; height: 34px;">${translate('plus New Folder')}</button>
              <button id="move-conv-folder-close-button" class="text-token-text-tertiary hover:text-token-text-primary transition">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <div class="px-4 pt-4">
            <input autofocus id="move-conv-folder-search-input" type="search" placeholder="${translate('Search folders')}" class="w-full p-2 rounded-md border border-token-border-medium bg-token-main-surface-secondary text-token-text-tertiary">
          </div>
          <div id="move-conv-folder-list" class="p-4 overflow-y-auto" style="height:500px;"></div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  await moveConvFolderLoadFolderList(folder);
  addMoveConvFolderModalEventListener(folder);

  const debouncedLoad = debounce(async (searchTerm: string) => {
    await moveConvFolderLoadFolderList(folder, searchTerm);
    addMoveConvFolderModalEventListener(folder);
  }, 500);

  const searchInput = document.querySelector('#move-conv-folder-search-input') as HTMLInputElement;
  searchInput.focus();
  searchInput.addEventListener('input', () => debouncedLoad(searchInput.value));
}

async function moveConvFolderLoadFolderList(folder: any, searchTerm = ''): Promise<void> {
  const list = document.querySelector('#move-conv-folder-list') as HTMLElement;
  list.innerHTML = '';
  list.appendChild(loadingSpinner('move-conv-folder-list'));
  const folders = await chrome.runtime.sendMessage({
    type: 'getConversationFolders',
    detail: { sortBy: 'alphabetical', searchTerm },
  });
  const hasParent = folder.parent_folder;
  list.innerHTML =
    folders.length > 0
      ? `<button id="move-conv-to-root-button" class="btn btn-large w-full btn-primary mb-2 ${hasParent ? '' : 'opacity-50 pointer-events-none'}" ${hasParent ? '' : 'disabled="true"'}>Move to root</button>${folders.map((f: any) => moveConvFolderSimpleFolderElement(f, folder.id)).join('')}`
      : '<div id="no-conversation-folders" class="text-sm text-token-text-tertiary">No folders found.</div>';
}

function moveConvFolderSimpleFolderElement(f: any, movingFolderId: string | number): string {
  const isLocked = f.id === -1;
  const imgSrc = f.image || f.image_url || chrome.runtime.getURL('icons/folder.png');
  const searchTerm =
    (document.querySelector('#move-conv-folder-search-input') as HTMLInputElement)?.value?.toLowerCase() || '';
  const displayName = searchTerm
    ? [...(f.breadcrumb || []), { name: f.name }].map((b: any) => b.name).join(CHEVRON_SMALL_SVG)
    : f.name;
  const titleText = searchTerm
    ? [...(f.breadcrumb || []), { name: f.name }].map((b: any) => b.name).join(' > ')
    : f.name;
  const isSelf = movingFolderId === f.id;

  return `<div id="move-conv-folder-wrapper-folder-${f.id}" title="${titleText}" class="flex w-full mb-2 group ${isLocked || isSelf ? 'opacity-50 pointer-events-none' : ''}" style="flex-wrap: wrap;"><div id="folder-${f.id}" class="flex py-3 px-3 pe-3 w-full border border-token-border-medium items-center gap-3 relative rounded-md cursor-pointer break-all hover:pe-10 group" style="background-color: ${f.color};"><img class="w-6 h-6 object-cover rounded-md" src="${imgSrc}" style="filter:drop-shadow(0px 0px 1px black);" data-is-open="false"><div id="title-folder-${f.id}" class="flex flex-1 items-center text-ellipsis max-h-5 overflow-hidden whitespace-nowrap break-all relative text-white relative" style="bottom: 6px;">${displayName}</div><div id="folder-actions-wrapper-${f.id}" class="absolute flex end-1 z-10 text-gray-300"><button id="move-conv-folder-button-${f.id}" class="btn btn-xs btn-primary group-hover:visible ${isLocked || isSelf ? '' : 'invisible'}" ${isSelf ? 'disabled="true"' : ''} title="Move to folder">${isLocked ? 'Upgrade to pro' : isSelf ? 'Moving folder' : 'Move to this folder'}</button></div><div id="count-folder-${f.id}" style="color: rgba(255, 255, 255, 0.6);font-size: 10px; position: absolute; left: 50px; bottom: 2px; display: block;">${f?.subfolders?.length || 0} folder${f?.subfolders?.length === 1 ? '' : 's'} - ${f.conversation_count} chat${f.conversation_count === 1 ? '' : 's'}</div></div></div>`;
}

function addMoveConvFolderModalEventListener(folder: any): void {
  document.querySelector('#move-conv-to-root-button')?.addEventListener('click', () => {
    moveConvFolder(folder, 0);
    document.querySelector('#move-conv-folder-modal')?.remove();
  });

  document.querySelectorAll('[id^=move-conv-folder-wrapper-folder-]').forEach((el) => {
    el.addEventListener('click', (ev) =>
      moveConvFolderOpenFolder(el as HTMLElement, folder, (ev as MouseEvent).shiftKey),
    );
  });

  document.querySelectorAll('button[id^=move-conv-folder-button-]').forEach((btn) => {
    const fid = btn.id.split('move-conv-folder-button-')[1];
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (fid === '-1') {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message:
            'With free account, you can only have up to 5 conversation folders. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      moveConvFolder(folder, fid!);
      document.querySelector('#move-conv-folder-modal')?.remove();
    });
  });

  document.querySelector('#move-conv-folder-new-folder')?.addEventListener('click', async () => {
    const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
    const existing = document.querySelectorAll('#move-conv-folder-content [id^=move-conv-folder-wrapper-folder-]');
    if (!hasSub && existing.length >= 5) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    const name = prompt('Enter folder name:', 'New Folder');
    if (!name) return;
    document.querySelectorAll('#no-conversation-folders').forEach((el) => el.remove());
    const result = await chrome.runtime.sendMessage({
      type: 'addConversationFolders',
      detail: { folders: [{ name, color: generateRandomDarkColor() }] },
    });
    if (result?.error?.type === 'limit') {
      errorUpgradeConfirmation(result.error);
      return;
    }
    const rootBtn = document.querySelector('#move-conv-to-root-button');
    rootBtn?.insertAdjacentHTML('afterend', moveConvFolderSimpleFolderElement(result[0], folder.id));
    const newEl = document.querySelector(`#move-conv-folder-wrapper-folder-${result[0].id}`) as HTMLElement;
    newEl?.addEventListener('click', (ev) => moveConvFolderOpenFolder(newEl, folder, (ev as MouseEvent).shiftKey));
    document.querySelector(`#move-conv-folder-button-${result[0].id}`)?.addEventListener('click', () => {
      moveConvFolder(folder, result[0].id);
      document.querySelector('#move-conv-folder-modal')?.remove();
    });
    if (!getLastSelectedConversationFolder()) addNewConvFolderElementToSidebar(result[0]);
    addNewConvFolderElementToManagerSidebar(result[0]);
  });

  document.querySelector('#move-conv-folder-close-button')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    document.querySelector('#move-conv-folder-modal')?.remove();
  });

  document.body.addEventListener('click', (ev) => {
    const modal = document.querySelector('#move-conv-folder-modal');
    const content = document.querySelector('#move-conv-folder-content');
    if (content && modal && isDescendant(modal, ev.target) && !isDescendant(content, ev.target)) modal?.remove();
  });
}

function moveConvFolderOpenFolder(el: HTMLElement, folder: any, forceRefresh = false): void {
  const fid = el.id.split('move-conv-folder-wrapper-folder-')[1];
  const next = el.nextElementSibling as HTMLElement | null;

  if (forceRefresh) {
    if (next?.id === `subfolder-wrapper-${fid}`) next.remove();
  } else if (next?.id === `subfolder-wrapper-${fid}`) {
    next.classList.contains('hidden') ? next.classList.remove('hidden') : next.classList.add('hidden');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = `subfolder-wrapper-${fid}`;
  wrapper.className = 'ps-4 border-s border-token-border-medium';
  el.insertAdjacentElement('afterend', wrapper);

  const inner = document.createElement('div');
  inner.className = 'flex flex-col mb-4 relative';
  inner.style.minHeight = '32px';
  inner.appendChild(loadingSpinner('subfolder-list'));
  wrapper.appendChild(inner);

  chrome.runtime.sendMessage(
    { type: 'getConversationFolders', forceRefresh, detail: { sortBy: 'alphabetical', parentFolderId: fid } },
    (subfolders: any[]) => {
      if (!subfolders || !Array.isArray(subfolders)) return;
      inner.innerHTML = '';
      subfolders.forEach((sf) => {
        inner.insertAdjacentHTML('beforeend', moveConvFolderSimpleFolderElement(sf, folder.id));
        const sfEl = document.querySelector(`#move-conv-folder-wrapper-folder-${sf.id}`) as HTMLElement | null;
        sfEl?.addEventListener('click', (ev) => moveConvFolderOpenFolder(sfEl!, folder, (ev as MouseEvent).shiftKey));
        document.querySelector(`#move-conv-folder-button-${sf.id}`)?.addEventListener('click', () => {
          moveConvFolder(folder, sf.id);
          document.querySelector('#move-conv-folder-modal')?.remove();
        });
      });

      const newSubBtn = document.createElement('button');
      newSubBtn.className = 'btn btn-xs btn-primary mt-2';
      newSubBtn.innerText = '\uFF0B New Subfolder';
      inner.appendChild(newSubBtn);
      newSubBtn.addEventListener('click', async () => {
        const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
        const existing = document.querySelectorAll('#move-conv-folder-content [id^=move-conv-folder-wrapper-folder-]');
        if (!hasSub && existing.length >= 5) {
          errorUpgradeConfirmation({
            type: 'limit',
            title: 'You have reached the limit',
            message: 'You have reached the limits of Folders with free account. Upgrade to Pro to remove all limits.',
          });
          return;
        }
        const name = prompt('Enter folder name:', 'New Folder');
        if (!name) return;
        const parentColor =
          el
            .querySelector('div[id^=folder-]')
            ?.getAttribute('style')
            ?.match(/background-color:\s*([^;]+)/)?.[1] || generateRandomDarkColor();
        const parentImg = (el.querySelector('div[id^=folder-] img') as HTMLImageElement)?.src || '';
        const result = await chrome.runtime.sendMessage({
          type: 'addConversationFolders',
          detail: { folders: [{ name, color: parentColor, image_url: parentImg, parent_folder: parseInt(fid!, 10) }] },
        });
        if (result?.error?.type === 'limit') {
          errorUpgradeConfirmation(result.error);
          return;
        }
        inner.insertAdjacentHTML('afterbegin', moveConvFolderSimpleFolderElement(result[0], folder.id));
        const newEl = document.querySelector(`#move-conv-folder-wrapper-folder-${result[0].id}`) as HTMLElement;
        newEl?.addEventListener('click', (ev) => moveConvFolderOpenFolder(newEl, folder, (ev as MouseEvent).shiftKey));
        document.querySelector(`#move-conv-folder-button-${result[0].id}`)?.addEventListener('click', () => {
          moveConvFolder(folder, result[0].id);
          toast('Folder moved successfully');
          document.querySelector('#move-conv-folder-modal')?.remove();
        });
      });
    },
  );
}

export async function moveConvFolder(folder: any, targetFolderId: string | number): Promise<void> {
  toast('Folder moved successfully');
  const lastFolder = getLastSelectedConversationFolder();

  if (targetFolderId === 0) {
    const sidebar = document.querySelector('#conversation-manager-sidebar-folders');
    const subEl = document.querySelector(
      `#conversation-manager-subfolder-list #conversation-folder-wrapper-${folder.id}`,
    );
    if (sidebar && subEl) sidebar.appendChild(subEl);
    document
      .querySelectorAll(`#sidebar-folder-content #conversation-folder-wrapper-${folder.id}`)
      .forEach((el) => el.remove());
  } else {
    document.querySelectorAll(`#conversation-folder-wrapper-${folder.id}`).forEach((el) => el.remove());
  }

  const oldParent = folder.parent_folder;
  document.querySelectorAll(`#folder-subfolder-count-${oldParent}`).forEach((el) => {
    const count = parseInt(el.textContent!.split(' ')[0]!, 10);
    el.textContent = `${count - 1} folder${count - 1 === 1 ? '' : 's'} -`;
  });
  document.querySelectorAll(`#folder-subfolder-count-${targetFolderId}`).forEach((el) => {
    const count = parseInt(el.textContent!.split(' ')[0]!, 10);
    el.textContent = `${count + 1} folder${count + 1 === 1 ? '' : 's'} -`;
  });

  chrome.runtime.sendMessage(
    {
      type: 'updateConversationFolder',
      forceRefresh: true,
      detail: { folderId: folder.id, newData: { parent_folder_id: targetFolderId } },
    },
    () => {
      if (targetFolderId.toString() === lastFolder?.id?.toString()) {
        throttleGetConvSubFolders(lastFolder.id, true);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// convBreadcrumbIncludesFolder  (original line 17319)
// ---------------------------------------------------------------------------

export function convBreadcrumbIncludesFolder(folderId: string | number): boolean {
  return selectedConversationFolderBreadcrumb.map((f) => f.id.toString()).some((id) => id === folderId.toString());
}

// ---------------------------------------------------------------------------
// convMenuBreadcrumb  (original line 19185)
// ---------------------------------------------------------------------------

export function convMenuBreadcrumb(breadcrumb: Array<{ name: string }> = [{ name: 'All Conversations' }]): string {
  let result = 'Root > ';
  if (breadcrumb.length === 0) return 'Root > All Conversations';
  breadcrumb.forEach((item, idx) => {
    result += item.name;
    if (idx < breadcrumb.length - 1) result += ' > ';
  });
  return result;
}

// ---------------------------------------------------------------------------
// updateConversationFolderIndicators  (original line 18842)
// ---------------------------------------------------------------------------

export function updateConversationFolderIndicators(folderId: string | number, data: Record<string, any>): void {
  const cards = document.querySelectorAll(`#conversation-manager-conversation-list [data-folder-id="${folderId}"]`);
  const lastFolder = getLastSelectedConversationFolder();

  cards.forEach((card) => {
    const wrapper = card.querySelector('[id^=conversation-card-folder-wrapper]') as HTMLElement | null;
    if (wrapper && lastFolder?.id?.toString() !== folderId.toString()) {
      wrapper.classList.remove('hidden');
    }

    const tag = card.querySelector('[id^=conversation-card-folder-tag]') as HTMLElement | null;
    if (tag) {
      tag.classList.remove('hidden');
      tag.style.backgroundColor = data.color;
    }

    const nameEl = card.querySelector('[id^=conversation-card-folder-name]') as HTMLElement | null;
    if (nameEl && Object.keys(data).includes('name')) {
      nameEl.innerText = data.name;
    }

    const colorIndicator = card.querySelector('[id^=conversation-card-folder-color-indicator]') as HTMLElement | null;
    if (colorIndicator && Object.keys(data).includes('color')) {
      colorIndicator.style.backgroundColor = data.color;
      colorIndicator.title = data.name || '';
      (colorIndicator as any).dataset.folderId = folderId;
    }
  });
}

// ---------------------------------------------------------------------------
// openConversationCustomInstructionProfile  (original line 19071)
// ---------------------------------------------------------------------------

export async function openConversationCustomInstructionProfile(convId: string): Promise<void> {
  const html = `<div id="conversation-custom-instruction-profile-modal" class="absolute inset-0" style="z-index: 10000;">
    <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
      <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
        <div id="conversation-custom-instruction-profile-content" role="dialog" data-state="open" class="popover bg-token-main-surface-primary relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col focus:outline-hidden overflow-hidden max-w-lg" tabindex="-1" style="pointer-events: auto;">
          <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
            <div class="flex">
              <div class="flex items-center">
                <div class="flex grow flex-col gap-1">
                  <h2 class="text-lg font-medium leading-6 text-token-text-primary">${translate('Custom instruction profile')}</h2>
                  <div class="text-sm font-medium leading-6 text-token-text-tertiary">See the custom instruction profile used in this conversation</div>
                </div>
              </div>
            </div>
            <div class="flex items-center">
              <button id="conversation-custom-instruction-profile-close-button" class="text-token-text-tertiary hover:text-token-text-primary transition">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div id="conversation-custom-instruction-profile-wrapper" class="p-4 overflow-y-auto" style="height:500px;">
            <p class="text-muted pb-3 pt-2 text-sm text-token-text-primary">About you</p>
            <div class="mb-3">
              <textarea readonly id="conversation-custom-instruction-profile-about-user-input" class="w-full rounded-xl bg-token-main-surface-secondary p-4 placeholder:text-gray-500 focus-token-border-heavy border-token-border-medium" rows="5"></textarea>
            </div>
            <p class="text-muted py-3 text-sm text-token-text-primary">Custom instructions</p>
            <div>
              <textarea readonly id="conversation-custom-instruction-profile-about-model-input" class="w-full rounded-xl bg-token-main-surface-secondary p-4 placeholder:text-gray-500 focus-token-border-heavy border-token-border-medium" rows="5"></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  document.querySelector('#conversation-custom-instruction-profile-close-button')?.addEventListener('click', () => {
    document.querySelector('#conversation-custom-instruction-profile-modal')?.remove();
  });

  document.querySelector('#conversation-custom-instruction-profile-modal')?.addEventListener('click', (ev) => {
    const content = document.querySelector('#conversation-custom-instruction-profile-content');
    if (content && !isDescendant(content as HTMLElement, ev.target as HTMLElement)) {
      document.querySelector('#conversation-custom-instruction-profile-modal')?.remove();
    }
  });

  const conv = await getConversationById(convId);
  if (!conv) return;

  const contextData = findValueByKey(conv?.mapping, 'user_context_message_data');
  if (!contextData) return;

  const aboutUser = contextData?.about_user_message || '';
  const aboutModel = contextData?.about_model_message || '';

  const aboutUserInput = document.querySelector(
    '#conversation-custom-instruction-profile-about-user-input',
  ) as HTMLTextAreaElement | null;
  if (aboutUserInput) aboutUserInput.value = aboutUser;
  const aboutModelInput = document.querySelector(
    '#conversation-custom-instruction-profile-about-model-input',
  ) as HTMLTextAreaElement | null;
  if (aboutModelInput) aboutModelInput.value = aboutModel;
}

// ---------------------------------------------------------------------------
// showProjectsList  (original line 19124)
// ---------------------------------------------------------------------------

export async function showProjectsList(
  button: HTMLElement,
  conversationIds: string[],
  isSidebar = false,
  _fromSettings = false,
): Promise<void> {
  if (document.querySelector('#project-list-menu')) return;

  const { showFoldersInLeftSidebar: showInLeft } = cachedSettings;
  const { right, top, left } = button.getBoundingClientRect();
  const x = !showInLeft && isSidebar ? left - 200 : right;
  const y = top + 16;

  const html = `<div id="project-list-menu" dir="ltr" style="transform:translate3d(${x}px,${y}px,0);position:fixed;left:0;top:0;min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" class="max-w-xs rounded-2xl text-token-text-primary bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="min-width:200px;outline:0;pointer-events:auto">
  <div id="project-list-wrapper" style="height:400px; overflow-y:auto;">
    <div class="flex items-center justify-center w-full h-full text-sm text-token-text-primary">
      ${loadingSpinner('project-list-wrapper').innerHTML}
    </div>
  </div>
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  adjustMenuPosition(document.querySelector('#project-list-menu') as HTMLElement);
  fetchProjectList(null, conversationIds);
}

// ---------------------------------------------------------------------------
// showConversationFolderSortByMenu  (original line 19353)
// ---------------------------------------------------------------------------

const CHECK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg>';

export function showConversationFolderSortByMenu(
  anchorEl: HTMLElement,
  isSidebar = false,
  isLeftSidebar = false,
): void {
  const { selectedConversationsManagerFoldersSortBy: sortBy = 'alphabetical' } = cachedSettings;

  const { left, right, top } = anchorEl.getBoundingClientRect();
  const x = isSidebar && !isLeftSidebar ? left - 200 : right + 2;
  const y = top - 50;

  const menuItem = (id: string, label: string, value: string) =>
    `<div role="menuitem" id="${id}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group" tabindex="-1" data-orientation="vertical">${translate(label)} ${sortBy === value ? CHECK_SVG : ''}</div>`;

  const html = `<div id="conversation-manager-sidebar-settings-sort-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="outline:0;pointer-events:auto">
    ${menuItem('alphabetical-sort-conversations-button', 'Alphabetical (A\u2192Z)', 'alphabetical')}
    ${menuItem('alphabetical-reverse-sort-conversations-button', 'Alphabetical (Z\u2192A)', 'alphabetical-reverse')}
    ${menuItem('create-at-sort-conversations-button', 'Create date', 'created_at')}
    ${menuItem('update-at-sort-conversations-button', 'Update date', 'updated_at')}
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  addConversationFolderSortByMenuEventListeners();
}

function addConversationFolderSortByMenuEventListeners(): void {
  const alphaBtn = document.querySelector('#alphabetical-sort-conversations-button');
  const alphaRevBtn = document.querySelector('#alphabetical-reverse-sort-conversations-button');
  const createBtn = document.querySelector('#create-at-sort-conversations-button');
  const updateBtn = document.querySelector('#update-at-sort-conversations-button');

  const applySortBy = (sortValue: string) => {
    chrome.storage.local.set(
      { settings: { ...cachedSettings, selectedConversationsManagerFoldersSortBy: sortValue } },
      () => {
        const sidebar = document.querySelector('#conversation-manager-sidebar') as HTMLElement | null;
        if (sidebar) {
          sidebar.innerHTML = '';
          sidebar.insertAdjacentElement('beforeend', conversationManagerSidebarContent());
        } else {
          loadSidebarFolders();
        }
      },
    );
  };

  alphaBtn?.addEventListener('click', () => applySortBy('alphabetical'));
  alphaRevBtn?.addEventListener('click', () => applySortBy('alphabetical-reverse'));
  createBtn?.addEventListener('click', () => applySortBy('created_at'));
  updateBtn?.addEventListener('click', () => applySortBy('updated_at'));
}

// ---------------------------------------------------------------------------
// toggleLeftSidebarSwitch  (original line 21908)
// ---------------------------------------------------------------------------

export function toggleLeftSidebarSwitch(enabled: boolean): void {
  if (enabled) {
    window.localStorage.setItem('sp/sidebarFolderIsOpen', 'false');
  } else {
    window.localStorage.setItem('sp/sidebarFolderIsOpen', 'true');
  }
  refreshPage();
}

// ---------------------------------------------------------------------------
// attachConversationToInput  (original line 7868)
// ---------------------------------------------------------------------------

export async function attachConversationToInput(convId: string): Promise<void> {
  const conv = await getConversationById(convId);
  if (!conv) return;

  const filename = `${conv.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
  if (!canAttacheFile(filename)) return;

  let nodeId: string | null = conv.current_node;
  const messages: any[] = [];

  while (nodeId) {
    const node: any = conv.mapping[nodeId];
    if (!node) break;
    const { message, parent }: { message: any; parent: string | undefined } = node;
    if (message) messages.push(message);
    nodeId = parent ?? null;
  }

  const text = messages
    .reverse()
    .filter((msg) => {
      const role = msg?.author?.role;
      const parts = msg?.content?.parts?.join('');
      const contentType = msg?.content?.content_type;
      return parts && contentType !== 'user_editable_context' && (role === 'user' || role === 'assistant');
    })
    .map((msg) => {
      const parts = (msg.content?.parts || [])
        .filter((p: any) => typeof p === 'string')
        .join('\n')
        .replace(/^## Instructions[\s\S]*?## End Instructions\n\n/m, '');
      return `>> ${msg.author?.role.toUpperCase()}: ${replaceCitations(parts, msg.metadata?.citations, 'text')}`;
    })
    .join('\n\n');

  uploadTextToInput(text, filename);
}

// ---------------------------------------------------------------------------
// findValueByKey -- recursively search an object tree for a key
// ---------------------------------------------------------------------------

/**
 * Recursively search an object tree for the first occurrence of the given key
 * and return its value. Returns null if not found.
 *
 * Original: content.isolated.end.js line 5825
 */
export function findValueByKey(obj: any, key: string): any {
  let result: any = null;
  function search(node: any): void {
    if (node && typeof node === 'object') {
      for (const k in node) {
        if (k === key) {
          result = node[k];
          return;
        }
        if (typeof node[k] === 'object') search(node[k]);
      }
    }
  }
  search(obj);
  return result;
}

// ---------------------------------------------------------------------------
// fetchProjectList -- paginated loading of project items
// ---------------------------------------------------------------------------

/**
 * Fetch a page of projects and render them into the project-list dropdown.
 *
 * Original: content.isolated.end.js line 19144
 */
export function fetchProjectList(cursor: string | null, conversationIds: string[]): void {
  const wrapper = document.querySelector('#project-list-wrapper');
  getProjects(cursor).then((data: any) => {
    if (cursor === null && data.items.length === 0) {
      if (wrapper)
        wrapper.innerHTML = `<div class="flex items-center justify-center w-full h-full text-sm text-token-text-primary">${translate('No projects found')}</div>`;
      return;
    }
    if (cursor === null && wrapper) wrapper.innerHTML = '';
    const existingMore = document.querySelector('#load-more-projects');
    if (existingMore) existingMore.remove();

    data.items.forEach((item: any) => {
      const gizmo = item.gizmo.gizmo;
      const name = gizmo.display.name;
      const gizmoId = gizmo.id;
      const el = document.createElement('div');
      el.className =
        'flex items-center gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary radix-disabled:pointer-events-none radix-disabled:opacity-50 group';
      el.id = `project-${gizmoId}`;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" stroke="currentColor" fill="currentColor" width="20" height="20" class="icon"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg><span class="text-token-text-primary">${name}</span>`;
      el.addEventListener('click', async () => {
        resetSidebarConversationSelection();
        for (const cId of conversationIds) await addConversationToProject(cId, gizmoId);
        toast('Added conversation(s) to project. Refresh to see the changes.');
        closeMenus();
      });
      wrapper?.appendChild(el);
    });

    if (data.cursor) {
      const more = document.createElement('div');
      more.id = 'load-more-projects';
      more.className =
        'flex justify-center items-center gap-2 rounded-xl p-2.5 text-sm cursor-pointer bg-token-main-surface-secondary relative h-10';
      more.appendChild(loadingSpinner('load-more-projects'));
      more.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        fetchProjectList(data.cursor, conversationIds);
      });
      wrapper?.appendChild(more);
    }

    const loadMoreBtn = document.querySelector('#load-more-projects');
    if (loadMoreBtn) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              fetchProjectList(data.cursor, conversationIds);
              obs.disconnect();
            }
          });
        },
        { threshold: 0.1 },
      );
      obs.observe(loadMoreBtn);
    }
  });
}

// ---------------------------------------------------------------------------
// showConversationManagerCardMenu -- context menu for conversation cards
// ---------------------------------------------------------------------------

/**
 * Build and show the right-click / three-dot menu for a conversation card.
 *
 * Original: content.isolated.end.js line 18856
 */
export async function showConversationManagerCardMenu(
  button: HTMLElement,
  conv: any,
  isSidebar = false,
  fromSettings = false,
): Promise<void> {
  const { showFoldersInLeftSidebar } = cachedSettings;
  const hasSub: boolean = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const convId = conv.conversation_id;
  const isNavbar = button.id === 'navbar-conversation-menu-button';
  const { right, top } = button.getBoundingClientRect();
  let x = showFoldersInLeftSidebar && isSidebar ? right - 6 : right - 244;
  let y = top + 20;
  if (isNavbar) {
    x -= 16;
    y += 16;
  }

  /* eslint-disable max-len */
  const menuHtml = `<div id="conversation-card-menu" dir="ltr" style="transform:translate3d(${x}px,${y}px,0);position:fixed;left:0;top:0;min-width:max-content;z-index:10001"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" class="max-w-xs rounded-2xl text-token-text-primary bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="min-width:200px;outline:0;pointer-events:auto">
${
  isNavbar
    ? ''
    : `<div role="menuitem" id="preview-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor" width="20" height="20" class="icon"><path d="M288 80C222.8 80 169.2 109.6 128.1 147.7C89.6 183.5 63.02 225.1 49.44 256C63.02 286 89.6 328.5 128.1 364.3C169.2 402.4 222.8 432 288 432C353.2 432 406.8 402.4 447.9 364.3C486.4 328.5 512.1 286 526.6 256C512.1 225.1 486.4 183.5 447.9 147.7C406.8 109.6 353.2 80 288 80V80z"/></svg>${translate('Preview')}</div>
<div role="menuitem" id="open-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" width="20" height="20" class="icon"><path d="M488 0h-135.3c-13.25 0-25.09 7.906-30.19 20.16c-5.062 12.28-2.281 26.25 7.094 35.63l40.69 40.69L177.4 289.4c-12.5 12.5-12.5 32.75 0 45.25C183.6 340.9 191.8 344 200 344s16.38-3.125 22.62-9.375l192.9-192.9l40.69 40.69C462.5 188.7 470.8 192 479.3 192c4.219 0 8.469-.8125 12.56-2.5C504.1 184.4 512 172.6 512 159.3V24C512 10.75 501.3 0 488 0zM392 320c-13.25 0-24 10.75-24 24v112c0 4.406-3.594 8-8 8h-304c-4.406 0-8-3.594-8-8v-304c0-4.406 3.594-8 8-8h112C181.3 144 192 133.3 192 120S181.3 96 168 96h-112C25.13 96 0 121.1 0 152v304C0 486.9 25.13 512 56 512h304c30.88 0 56-25.12 56-56v-112C416 330.8 405.3 320 392 320z"/></svg>${translate('Open in new tab')}<span class='ms-auto'>${buttonGenerator(['\u2318', 'Click'], 'xs')}</span></div>
<div role="menuitem" id="rename-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" fill="currentColor" width="20" height="20" class="icon"><path d="M0 128C0 92.65 28.65 64 64 64H576C611.3 64 640 92.65 640 128V384C640 419.3 611.3 448 576 448H64C28.65 448 0 419.3 0 384V128z"/></svg>${translate('Rename')}</div>`
}
<div role="menuitem" id="share-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" width="20" height="20" class="icon" xmlns="http://www.w3.org/2000/svg"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>${translate('Share')}</div>
<div role="menuitem" id="move-conversation-card-button-${convId}" title="${convMenuBreadcrumb(conv.breadcrumb)}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="20" height="20" class="icon" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>${translate('Move to folder')}</div>
${conv?.folder?.id ? `<div role="menuitem" id="remove-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="20" height="20" class="icon" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>${translate('Remove from folder')}</div>` : ''}
<div role="menuitem" id="add-to-project-conversation-card-button-${convId}" class="flex items-center gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="20" height="20" class="icon" viewBox="0 0 512 512"><path d="M448 96h-172.1L226.7 50.75C214.7 38.74 198.5 32 181.5 32H64C28.66 32 0 60.66 0 96v320c0 35.34 28.66 64 64 64h384c35.34 0 64-28.66 64-64V160C512 124.7 483.3 96 448 96zM464 416c0 8.824-7.18 16-16 16H64c-8.82 0-16-7.176-16-16V96c0-8.824 7.18-16 16-16h117.5c4.273 0 8.289 1.664 11.31 4.688L256 144h192c8.82 0 16 7.176 16 16V416zM336 264h-56V207.1C279.1 194.7 269.3 184 256 184S232 194.7 232 207.1V264H175.1C162.7 264 152 274.7 152 288c0 13.26 10.73 23.1 23.1 23.1h56v56C232 381.3 242.7 392 256 392c13.26 0 23.1-10.74 23.1-23.1V311.1h56C349.3 311.1 360 301.3 360 288S349.3 264 336 264z"/></svg>${translate('Add to project')} <svg style="transform:rotate(-90deg)" stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" class="ms-auto h-4 w-4" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"/></svg></div>
<div role="menuitem" id="export-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="20" height="20" class="icon" viewBox="0 0 576 512"><path d="M568.1 303l-80-80c-9.375-9.375-24.56-9.375-33.94 0s-9.375 24.56 0 33.94L494.1 296H216C202.8 296 192 306.8 192 320s10.75 24 24 24h278.1l-39.03 39.03C450.3 387.7 448 393.8 448 400s2.344 12.28 7.031 16.97c9.375 9.375 24.56 9.375 33.94 0l80-80C578.3 327.6 578.3 312.4 568.1 303zM360 384c-13.25 0-24 10.74-24 24V448c0 8.836-7.164 16-16 16H64.02c-8.836 0-16-7.164-16-16L48 64.13c0-8.836 7.164-16 16-16h160L224 128c0 17.67 14.33 32 32 32h79.1v72c0 13.25 10.74 24 23.1 24S384 245.3 384 232V138.6c0-16.98-6.742-33.26-18.75-45.26l-74.63-74.64C278.6 6.742 262.3 0 245.4 0H63.1C28.65 0-.002 28.66 0 64l.0065 384c.002 35.34 28.65 64 64 64H320c35.2 0 64-28.8 64-64v-40C384 394.7 373.3 384 360 384z"/></svg>${translate('Export')}</div>
<div role="menuitem" id="archive-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${conv.is_archived ? `<svg width="20" height="20" fill="currentColor" class="icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2.669 14.167V8.987"/></svg>${translate('Unarchive')}` : `<svg width="20" height="20" fill="currentColor" class="icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M15.417 2.668"/></svg>${translate('Archive')}`}</div>
${isNavbar || isSidebar ? `<div role="menuitem" id="favorite-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${conv.is_favorite ? `<svg width="20" height="20" fill="gold" class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M381.2 150.3"/></svg>${translate('Remove from Favorites')}` : `<svg width="20" height="20" fill="currentColor" class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M287.9 0"/></svg>${translate('Add to Favorites')}`}</div>` : ''}
<div role="menuitem" id="edit-note-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" width="20" height="20" class="icon" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.293 4.293" fill="currentColor"/></svg>${translate('Edit note')}</div>
<div role="menuitem" id="download-images-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" width="20" height="20" class="icon" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.707 10.293" fill="currentColor"/></svg>${translate('Download images')} ${hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>'}</div>
${isNavbar ? '' : `<div role="menuitem" id="reference-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" width="20" height="20" class="icon" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.032 5.024" fill="currentColor"/></svg>${translate('Reference this chat')} ${hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>'}</div>`}
<div role="menuitem" id="delete-conversation-card-button-${convId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" width="20" height="20" class="icon" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.556 4" fill="currentColor"/></svg>${translate('Delete')}</div>
</div></div>`;
  /* eslint-enable max-len */

  document.body.insertAdjacentHTML('beforeend', menuHtml);
  adjustMenuPosition(document.querySelector('#conversation-card-menu'));
  addConversationManagerCardMenuEventListeners(conv, isSidebar, isNavbar, fromSettings);
  document.querySelector('#conversation-card-menu')?.addEventListener('mouseleave', () => {
    if (isSidebar) button.classList.replace('flex', 'hidden');
  });
}

function addConversationManagerCardMenuEventListeners(
  conv: any,
  isSidebar = false,
  isNavbar = false,
  fromSettings = false,
): void {
  const convId = conv.conversation_id;
  const previewBtn = document.querySelector(`#preview-conversation-card-button-${convId}`);
  const openBtn = document.querySelector(`#open-conversation-card-button-${convId}`);
  const renameBtn = document.querySelector(`#rename-conversation-card-button-${convId}`);
  const shareBtn = document.querySelector(`#share-conversation-card-button-${convId}`);
  const ciProfileBtn = document.querySelector(`#custom-instruction-profile-conversation-card-button-${convId}`);
  const moveBtn = document.querySelector(`#move-conversation-card-button-${convId}`);
  const removeBtn = document.querySelector(`#remove-conversation-card-button-${convId}`);
  const projectBtn = document.querySelector(`#add-to-project-conversation-card-button-${convId}`);
  const exportBtn = document.querySelector(`#export-conversation-card-button-${convId}`);
  const archiveBtn = document.querySelector(`#archive-conversation-card-button-${convId}`);
  const favBtn = document.querySelector(`#favorite-conversation-card-button-${convId}`);
  const noteBtn = document.querySelector(`#edit-note-conversation-card-button-${convId}`);
  const imgBtn = document.querySelector(`#download-images-conversation-card-button-${convId}`);
  const refBtn = document.querySelector(`#reference-conversation-card-button-${convId}`);
  const delBtn = document.querySelector(`#delete-conversation-card-button-${convId}`);

  if (refBtn)
    addTooltip(refBtn as HTMLElement, { value: 'Attach this conversation to the current chat.', position: 'right' });
  document.querySelectorAll('#conversation-card-menu [role="menuitem"]').forEach((el) => {
    el.addEventListener('mouseenter', (ev) => {
      if ((ev.target as HTMLElement).id.startsWith('add-to-project-conversation-card-button')) return;
      document.querySelector('#project-list-menu')?.remove();
    });
  });

  previewBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    updateSelectedConvCard(convId, isSidebar);
    showConversationPreviewWrapper(convId, null, isSidebar);
  });
  openBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    window.open(`/c/${convId}`, '_blank');
  });
  renameBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    handleRenameConversationClick(convId, isSidebar);
  });
  shareBtn?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    closeMenus();
    shareConversation(convId);
  });
  ciProfileBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    openConversationCustomInstructionProfile(convId);
  });
  moveBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    if (isSidebar) openMoveConvToFolderModal([convId]);
    else {
      const cb = document.querySelector(`#conversation-checkbox-${convId}`) as HTMLInputElement | null;
      if (cb && !cb.checked) cb.click();
      setTimeout(() => handleClickMoveConversationsButton(), 100);
    }
  });
  removeBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    resetConversationManagerSelection();
    updateConversationFolderCount(null, [convId]);
    document.querySelectorAll(`#conversation-card-${convId}`).forEach((el) => el.remove());
    chrome.runtime.sendMessage({ type: 'removeConversationsFromFolder', detail: { conversationIds: [convId] } }, () => {
      toast('Conversation removed from folder');
    });
  });
  projectBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    showProjectsList(projectBtn as HTMLElement, [convId], isSidebar, fromSettings);
  });
  projectBtn?.addEventListener('mouseenter', () => {
    showProjectsList(projectBtn as HTMLElement, [convId], isSidebar, fromSettings);
  });
  exportBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    openExportModal([convId], isSidebar ? 'current' : 'selected');
  });
  archiveBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    conv.is_archived
      ? handleClickUnarchiveConversationsButton([convId])
      : handleClickArchiveConversationsButton([convId]);
  });
  favBtn?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    closeMenus();
    const result = await chrome.runtime.sendMessage({
      type: 'toggleConversationFavorite',
      forceRefresh: true,
      detail: { conversation: conv },
    });
    toast(`${result.is_favorite ? 'Added to' : 'Removed from'} favorites`);
    if (getLastSelectedConversationFolder()?.id === 'favorites') {
      result.is_favorite
        ? addConversationToSidebarFolder({ ...conv, is_favorite: result.is_favorite }, 'favorites')
        : document.querySelectorAll(`#conversation-card-${convId}`).forEach((el) => el.remove());
    } else replaceConversationInSidebarFolder({ ...conv, is_favorite: result.is_favorite });
  });
  noteBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    chrome.runtime.sendMessage({ type: 'getNote', detail: { conversationId: convId } }, async (note: any) => {
      const n = note ?? {};
      let title = document.querySelector(`#conversation-card-${convId} #conversation-title`)?.textContent;
      if (!title) title = (await getConversationById(convId))?.title;
      openNotePreviewModal({ ...n, conversation_id: convId, name: title });
    });
  });
  imgBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message: 'Downloading conversation images requires a Pro subscription. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      const btn = document.querySelector(`#conversation-card-settings-button-${convId}`) as HTMLElement | null;
      downloadSelectedImages(btn, [], convId, !(ev as MouseEvent).shiftKey);
    });
  });
  refBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message: 'Referencing conversations requires a Pro subscription. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      attachConversationToInput(convId);
    });
  });
  delBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    handleDeleteConversation(convId);
  });
}

// ---------------------------------------------------------------------------
// showConversationManagerSidebarSettingsMenu
// ---------------------------------------------------------------------------

/**
 * Build and show the settings dropdown at the top-right of the sidebar.
 *
 * Original: content.isolated.end.js line 19265
 */
export async function showConversationManagerSidebarSettingsMenu(button: HTMLElement): Promise<void> {
  const { right, top } = button.getBoundingClientRect();
  const hasSub: boolean = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  const x = right + 2;
  const y = top - 215;
  const proTag = hasSub ? '' : '<span class="text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>';

  const html = `<div id="conversation-manager-sidebar-settings-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001"><div data-side="bottom" data-align="start" role="menu" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="outline:0;pointer-events:auto">
<div role="menuitem" id="sort-conversation-folders-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Sort folders')} <svg aria-hidden="true" fill="none" height="1em" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" width="1em"><path d="m9 18 6-6-6-6"/></svg></div>
<div role="menuitem" id="export-all-conversations-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Export all')} ${proTag}</div>
<div role="menuitem" id="export-conversations-date-range-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Export by date range')} ${proTag}</div>
<div role="menuitem" id="archive-all-conversations-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Archive all')}</div>
<div role="menuitem" id="delete-all-conversations-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm text-token-text-error cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Delete all')}</div>
</div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  addConversationManagerSidebarSettingsMenuEventListeners();
}

function addConversationManagerSidebarSettingsMenuEventListeners(): void {
  const menu = document.querySelector('#conversation-manager-sidebar-settings-menu');
  const sortBtn = menu?.querySelector('#sort-conversation-folders-button');
  const exportAllBtn = menu?.querySelector('#export-all-conversations-button');
  const exportDateBtn = menu?.querySelector('#export-conversations-date-range-button');
  const archiveAllBtn = menu?.querySelector('#archive-all-conversations-button');
  const deleteAllBtn = menu?.querySelector('#delete-all-conversations-button');

  sortBtn?.addEventListener('mouseenter', () => showConversationFolderSortByMenu(menu as HTMLElement));
  exportAllBtn?.addEventListener('mouseover', () => {
    document.querySelector('#conversation-manager-sidebar-settings-sort-menu')?.remove();
  });
  exportAllBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message: 'Exporting all conversations requires a Pro subscription.',
        });
        return;
      }
      menu?.remove();
      openExportModal([], 'all');
    });
  });
  exportDateBtn?.addEventListener('mouseover', () => {
    document.querySelector('#conversation-manager-sidebar-settings-sort-menu')?.remove();
  });
  exportDateBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message: 'Exporting all conversations requires a Pro subscription.',
        });
        return;
      }
      menu?.remove();
      showDateSelectorDialog(
        'Export Conversations',
        'Select date range',
        'Cancel',
        'Export',
        null,
        async (start: number, end: number) => {
          const ids = await getConversationIds(String(start / 1000), String(end / 1000));
          openExportModal(ids, 'dateRange');
          document.querySelector('#date-selector-dialog')?.remove();
        },
        'green',
        false,
      );
    });
  });
  archiveAllBtn?.addEventListener('mouseover', () => {
    document.querySelector('#conversation-manager-sidebar-settings-sort-menu')?.remove();
  });
  archiveAllBtn?.addEventListener('click', () => {
    menu?.remove();
    showConfirmDialog(
      'Archive all conversations',
      'Are you sure you want to archive all your conversations?',
      'Cancel',
      'Confirm',
      null,
      () => {
        (document.querySelector('#sidebar-folder-drawer #folder-breadcrumb-root') as HTMLElement)?.click();
        const list = document.querySelector('#conversation-manager-conversation-list') as HTMLElement;
        if (list) {
          list.innerHTML = '';
          list.appendChild(noConversationElement());
        }
        resetConversationCounts();
        archiveAllConversations();
        chrome.runtime.sendMessage({ type: 'archiveAllConversations' });
      },
    );
  });
  deleteAllBtn?.addEventListener('mouseover', () => {
    document.querySelector('#conversation-manager-sidebar-settings-sort-menu')?.remove();
  });
  deleteAllBtn?.addEventListener('click', () => {
    menu?.remove();
    showConfirmDialog(
      'Delete all conversations',
      'Are you sure you want to delete all your conversations?',
      'Cancel',
      'Confirm',
      null,
      () => {
        (document.querySelector('#sidebar-folder-drawer #folder-breadcrumb-root') as HTMLElement)?.click();
        const list = document.querySelector('#conversation-manager-conversation-list') as HTMLElement;
        if (list) {
          list.innerHTML = '';
          list.appendChild(noConversationElement());
        }
        resetConversationCounts();
        deleteAllConversations();
        chrome.runtime.sendMessage({ type: 'deleteAllConversations' });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// showConversationPreviewWrapper -- conversation preview panel
// ---------------------------------------------------------------------------

/**
 * Show a full-conversation preview in a modal overlay.
 *
 * Original: content.isolated.end.js line 22487
 */
export async function showConversationPreviewWrapper(
  convId: string,
  _messageId: string | null = null,
  isSidebar = false,
  _singleCard = false,
): Promise<void> {
  const bg = document.createElement('div');
  bg.id = 'conversation-preview-wrapper-background';
  bg.className = 'bg-black/50 dark:bg-black/80 fixed inset-0';
  bg.style.zIndex = '100000';
  bg.addEventListener('click', () => bg.remove());
  document.body.appendChild(bg);

  const wrapper = document.createElement('div');
  wrapper.id = 'conversation-preview-wrapper';
  wrapper.className =
    'flex flex-col items-center justify-center bg-token-main-surface-primary bg-opacity-90 rounded-xl border border-token-border-medium z-50 shadow-long';
  wrapper.style.cssText =
    'min-width:800px;min-height:90vh;width:50%;height:90%;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);';
  bg.appendChild(wrapper);

  if (!_singleCard) {
    for (const [id, side] of [
      ['preview-conversation-next-button', 'right:-20px'],
      ['preview-conversation-previous-button', 'left:-20px'],
    ] as const) {
      const btn = document.createElement('button');
      btn.id = id;
      btn.className =
        'absolute top-1/2 transform -translate-y-1/2 p-2 rounded-full bg-token-main-surface-secondary text-token-text-primary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary border border-token-border-medium';
      btn.style.cssText = side;
      btn.innerHTML = id.includes('next')
        ? '<svg viewBox="0 0 24 24" fill="none" class="icon icon-md-heavy" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.293 18.707a1 1 0 010-1.414L14.586 12 9.293 6.707a1 1 0 011.414-1.414l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" class="icon icon-md-heavy" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.707 5.293a1 1 0 010 1.414L9.414 12l5.293 5.293a1 1 0 01-1.414 1.414l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 0z" fill="currentColor"/></svg>';
      wrapper.appendChild(btn);
    }
  }

  const header = document.createElement('div');
  header.className =
    'flex items-center justify-between w-full bg-token-main-surface-secondary p-4 rounded-t-xl border-b border-token-border-medium';
  wrapper.appendChild(header);
  const title = document.createElement('div');
  title.className = 'text-lg font-bold';
  title.id = 'conversation-preview-title';
  header.appendChild(title);
  const headerRight = document.createElement('div');
  headerRight.className = 'flex items-center gap-2';
  header.appendChild(headerRight);

  const openBtn = document.createElement('button');
  openBtn.id = 'preview-open-conversation-button';
  openBtn.className =
    'flex relative p-2 text-xs rounded-md bg-token-main-surface-secondary text-token-link focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary';
  openBtn.style.width = 'max-content';
  openBtn.title = `${isWindows() ? 'Ctrl' : '\u2318'} + Click to open in new tab`;
  openBtn.textContent = translate('open conversation');
  headerRight.appendChild(openBtn);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'conversation-preview-close-button';
  closeBtn.className =
    'p-2 rounded-full bg-token-main-surface-secondary text-token-text-primary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary';
  closeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" class="h-6 w-6"><path d="M6 18L18 6M6 6l12 12"/></svg>';
  closeBtn.addEventListener('click', () => wrapper.remove());
  headerRight.appendChild(closeBtn);

  const scrollDiv = document.createElement('div');
  scrollDiv.className = 'h-full w-full overflow-y-auto p-4';
  scrollDiv.style.scrollBehavior = 'smooth';
  scrollDiv.id = 'conversation-inner-div';
  scrollDiv.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
  });

  const contentDiv = document.createElement('div');
  contentDiv.className = 'flex flex-col items-center text-sm h-full bg-token-main-surface-primary';
  contentDiv.id = 'preview-conversation-div';
  scrollDiv.appendChild(contentDiv);
  wrapper.appendChild(scrollDiv);

  await loadConversationInPreviewInternal(convId, _messageId, isSidebar);
}

async function loadConversationInPreviewInternal(
  convId: string,
  _messageId: string | null = null,
  isSidebar = false,
): Promise<void> {
  const previewDiv = document.querySelector('#preview-conversation-div') as HTMLElement;
  if (!previewDiv) return;
  previewDiv.innerHTML = loadingSpinner('preview-conversation-div').outerHTML;

  const conversation = await getConversationById(convId);
  if (!conversation) return;
  chrome.runtime.sendMessage({ type: 'addConversations', detail: { conversations: [conversation] } });

  const conv: any = removeSystemMessages(conversation as any);
  if (!conv?.current_node) return;

  const titleEl = document.querySelector('#conversation-preview-wrapper #conversation-preview-title');
  if (titleEl) titleEl.innerHTML = conv.title || 'New chat';

  const openBtnOld = document.querySelector(
    '#conversation-preview-wrapper #preview-open-conversation-button',
  ) as HTMLElement;
  if (openBtnOld) {
    const clone = openBtnOld.cloneNode(true) as HTMLElement;
    openBtnOld.replaceWith(clone);
    clone.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closeMenus();
      removeMiniMap();
      if (ev.metaKey || (isWindows() && ev.ctrlKey)) window.open(`/c/${convId}`, '_blank');
      else {
        document.querySelector('#conversation-preview-wrapper-background')?.remove();
        closeModals();
        window.history.pushState({}, '', `/c/${convId}`);
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      }
      updateSelectedConvCard(convId, true);
    });
  }

  const chain: any[] = [];
  let nodeId: string | null = conv.current_node;
  while (nodeId) {
    const node = conv.mapping[nodeId];
    const parentId = node?.parent;
    const parentNode = parentId ? conv.mapping[parentId] : null;
    const siblings = parentNode?.children || [];
    const idx = siblings.findIndex((s: string) => s === nodeId);
    chain.push({ ...node, threadIndex: idx === -1 ? siblings.length : idx + 1, threadCount: siblings.length });
    nodeId = parentId ?? null;
  }
  chain.reverse();

  let html = '';
  const { name, avatar } = await chrome.storage.sync.get(['name', 'avatar']);
  const { models } = await chrome.storage.local.get(['models']);
  const gizmo = await getGizmoById(conv.gizmo_id as string);

  for (let i = 0; i < chain.length; i += 1) {
    const { message, threadCount, threadIndex } = chain[i];
    if (!message || message.content?.content_type === 'user_editable_context') continue;
    const role = message.role || message.author?.role;
    if (!role || role === 'system') continue;
    if (role === 'user') {
      html += rowUser(conv, chain[i], threadIndex, threadCount, name, avatar);
    } else {
      const group = [chain[i]];
      let next = chain[i + 1]?.message;
      while (next && next.role !== 'user' && next.author?.role !== 'user') {
        group.push(chain[i + 1]);
        i += 1;
        next = chain[i + 1]?.message;
      }
      html += rowAssistant(conv, group, threadIndex, threadCount, models, gizmo, false, false);
    }
  }

  previewDiv.innerHTML = html;
  const bottom = document.createElement('div');
  bottom.id = 'conversation-preview-bottom';
  bottom.className = 'w-full h-32 md:h-48 flex-shrink-0';
  previewDiv.appendChild(bottom);

  const searchTerm = Array.from(document.querySelectorAll('input[id$="-search-input"]'))
    .map((el) => (el as HTMLInputElement).value)
    .join('')
    .trim();
  if (searchTerm) {
    highlightSearch([previewDiv], searchTerm);
    scrollToHighlight(document.querySelector('#conversation-preview-wrapper #conversation-inner-div') as HTMLElement);
  }

  renderAllDalleImages(conv as any, getDownloadUrlFromFileId as any);
  renderAllPythonImages(conv as any, getDownloadUrlFromFileId as any);
  renderAllPluginVisualizations(conv, true);
  addMissingGizmoNamesAndAvatars();
  addFinalCompletionClassToLastMessageWrapper();
  addConversationsEventListeners(conv.conversation_id as string);
}

// ---------------------------------------------------------------------------
// setFolderImageFromGizmo
// Original: content.isolated.end.js lines 5008-5028
// ---------------------------------------------------------------------------

/**
 * Download a gizmo's avatar and set it as the folder image (base64).
 */
export async function setFolderImageFromGizmo(
  folder: Folder,
  gizmoResource: { resource?: { gizmo?: { display?: { profile_picture_url?: string } } } },
): Promise<void> {
  const gizmoId = (folder as any).gizmo_id as string;
  const blob = await downloadFileFromUrl(
    gizmoResource?.resource?.gizmo?.display?.profile_picture_url ?? '',
    gizmoId,
    true,
  );
  const reader = new FileReader();
  reader.onload = async () => {
    const result = reader.result as string;
    const newData = {
      image: {
        base64: result.split(',')[1],
        type: blob.type || 'image/png',
        name: `${gizmoId}.png`,
      },
    };
    chrome.runtime.sendMessage({
      type: 'updateConversationFolder',
      detail: {
        folderId: folder.id,
        newData,
      },
    });
  };
  reader.readAsDataURL(blob);
}
