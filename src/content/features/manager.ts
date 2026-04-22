/**
 * Manager feature -- central tabbed modal for managing conversations, prompts,
 * images, GPTs, notes, profiles, pinned messages, and newsletters.
 *
 * Also includes the settings modal and keyboard shortcuts reference modal.
 *
 * Original source: content.isolated.end.js
 *   - managerTabList / upgradeButton: lines 15732-15786
 *   - selectedManagerTab*: lines 15788-15878
 *   - noTabActions: line 15880
 *   - createManagerSideTab: lines 15884-15927
 *   - postModalCreate: lines 15929-15977
 *   - addNewsletterIndicator: lines 15979-15987
 *   - createManager: lines 15989-16007
 *   - createSettingsModal: lines 21358-21362
 *   - settingsModalContent: lines 21387-21411
 *   - settingsModalActions: lines 22111-22147
 *   - createKeyboardShortcutsModal: lines 11920-11924
 *   - keyboardShortcutsModalContent: lines 11938-12079
 *   - keyboardShortcutsModalActions: lines 12081-12083
 *   - buttonGenerator: lines 11926-11936
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  closeMenus,
  closeModals,
  createModal,
  openUpgradeModal,
  refreshPage,
  isWindows,
  isOnNewChatPage,
  escapeHTML,
  isDarkMode,
  managerUpgradeButton,
  debounce,
  elementResizeObserver,
  errorUpgradeConfirmation,
  generateRandomDarkColor,
  formatDate,
  formatTime,
  conversationHasAttachments,
  getConversationIdFromUrl,
  isFirefox,
  isOpera,
} from '../../utils/shared';

import { createImageGallery, addImageGalleryEventListeners, loadImageList } from './gallery';

import {
  addTooltip,
  addDropdownEventListener,
  animatePing,
  createSwitch,
  dropdown,
  toast,
  loadingSpinner,
  showConfirmDialog,
  isDescendant,
} from '../isolated-world/ui/primitives';

import { getVoices, updateAccountUserSetting, getConversations, getGizmoById } from '../isolated-world/api';

import {
  translate,
  languageList,
  conversationsSortByList,
  promptsSortByList,
  notesSortByList,
  profilesSortByList,
  speechToTextLanguageList,
  gizmoSortByList,
} from './i18n';

import {
  selectedPromptFolderBreadcrumb,
  getLastSelectedPromptFolder,
  isDefaultPromptFolder,
  promptBreadcrumbIncludesFolder,
  resetPromptManagerParams,
  promptManagerMainContent,
  resetPromptManagerSelection,
  movePromptFolder,
  openPromptEditorModal,
  startNewChat,
  handleRenamePromptFolderClick,
  createPromptCard,
  noPromptFolderElemet,
  promptFolderElement,
  generatePromptFolderBreadcrumb,
  throttleGetPromptSubFolders,
  addNewPromptFolderElementToManagerSidebar,
  formatAttachmentsForPromptStep,
  runPromptChain,
  loadRecentPrompts,
  noPromptElement,
  updateSelectedPromptCard,
  addPromptCardEventListeners,
  addMemoryTogglesToPromptInput,
  defaultPromptFolders,
  defaultPromptFoldersList,
  showPromptManagerSidebarSettingsMenu,
  lastSelectedPromptCardId,
} from './prompts';
import {
  renderNoteCards,
  openNotePreviewModal,
  resetNoteManagerParams,
  noteListComponent,
  updateSelectedNoteCard,
  noteListSearchTerm,
  noteListPageNumber,
  setNoteListSearchTerm,
  setNoteListPageNumber,
} from './notes';
import {
  fetchGizmos,
  selectedGizmoCategoryId,
  gizmoCategories,
  gizmoMoreCategories,
  gizmoSortBy,
  gizmoPageNumber,
  gizmoCursor,
  noMoreGizmo,
  setSelectedGizmoCategoryId,
  setGizmoSortBy,
  setGizmoPageNumber,
  setGizmoCursor,
  setNoMoreGizmo,
} from './gpt-store';
import { toggleAutoArchive } from './auto-cleanup';
import {
  loadSidebarFolders,
  toggleLeftSidebarSwitch,
  clearSidebarSearchInput,
  conversationManagerSidebarContent,
  conversationManagerMainContent,
  getLastSelectedConversationFolder,
  isDefaultConvFolder,
  convBreadcrumbIncludesFolder,
  moveConvFolder,
  resetConversationManagerSelection,
  defaultConversationFoldersList,
  noConversationFolderElemet,
  conversationFolderElement,
  generateConvFolderBreadcrumb,
  toggleNewConversationInFolderButton,
  showConversationManagerSidebarSettingsMenu,
  handleRenameConversationFolderClick,
  initiateNewChatFolderIndicator,
  createConversationCard,
  addConversationCardEventListeners,
  noConversationElement,
  syncHistoryResponseToConversationDB,
  showConversationPreviewWrapper,
  resetConversationManagerParams,
  throttleFetchSidebarConversations,
  throttleGetConvSubFolders,
  addNewConvFolderElementToManagerSidebar,
  defaultConversationFolders,
  folderForNewChat,
  setFolderForNewChat,
} from './folders';
import {
  addDateDividersInConversation,
  removeDateDividersInConversation,
  addMessageTimestamps,
  removeMessageTimestamps,
  addMessageCharWordCounters,
  removeMessageCharWordCounters,
} from './timestamps';
import { overrideModelSwitchers, resetModelSwitchers } from './model-switcher';
import { createConversationMiniMap, articleObservers, initializeContinueButton } from './minimap';
import { addEyeButtonToFloatingButtons } from '../isolated-world/ui/floating-buttons';
import {
  initializeCustomInstructionProfileSelector,
  createCustomInstructionProfileEditor,
  createCustomInstructionProfileCard,
  addCustomInstructionProfileCardEventListeners,
} from './profiles';
import { cachedSettings } from '../isolated-world/settings';

// (All former extern declarations are now proper imports above.)

// -- Announcement dependencies --
// Original: content.isolated.end.js lines 14411-14418
const titleMap: Record<string, string> = {
  general: 'Announcement',
  newsletter: 'Newsletter',
};
const subtitleMap: Record<string, string> = {
  general: 'You can see the latest announcement here',
  newsletter: 'Daily dose of AI news and resources from the community',
};

// -- Article toggle constants --
// Original: content.isolated.end.js lines 15369-15371
const messageHideIconSmall =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-sm" viewBox="0 0 640 640"><path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM236.5 202.7C260 185.9 288.9 176 320 176C399.5 176 464 240.5 464 320C464 351.1 454.1 379.9 437.3 403.5L402.6 368.8C415.3 347.4 419.6 321.1 412.7 295.1C399 243.9 346.3 213.5 295.1 227.2C286.5 229.5 278.4 232.9 271.1 237.2L236.4 202.5zM357.3 459.1C345.4 462.3 332.9 464 320 464C240.5 464 176 399.5 176 320C176 307.1 177.7 294.6 180.9 282.7L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L357.4 459.2z"/></svg>';
const messageShowIconSmall =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-sm" viewBox="0 0 640 640"><path d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"/></svg>';
const hiddenArticleClass = 'hidden';

// -- TTS test audio state --
let settingTestAudio: HTMLAudioElement | null = null;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let selectedConversationFolderBreadcrumb: any[] = [];
export let managerModalCurrentTab = 'prompts';
export let faviconTimeout: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Manager tab list
// ---------------------------------------------------------------------------

interface ManagerTab {
  code: string;
  name: string;
  icon: string;
  keyboard?: string[];
}

const managerTabList: ManagerTab[] = [
  {
    code: 'conversations',
    name: 'Conversations manager',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" viewBox="0 0 512 512" fill="currentColor"><path d="M360 144h-208C138.8 144 128 154.8 128 168S138.8 192 152 192h208C373.3 192 384 181.3 384 168S373.3 144 360 144zM264 240h-112C138.8 240 128 250.8 128 264S138.8 288 152 288h112C277.3 288 288 277.3 288 264S277.3 240 264 240zM447.1 0h-384c-35.25 0-64 28.75-64 63.1v287.1c0 35.25 28.75 63.1 64 63.1h96v83.1c0 9.836 11.02 15.55 19.12 9.7l124.9-93.7h144c35.25 0 64-28.75 64-63.1V63.1C511.1 28.75 483.2 0 447.1 0zM464 352c0 8.75-7.25 16-16 16h-160l-80 60v-60H64c-8.75 0-16-7.25-16-16V64c0-8.75 7.25-16 16-16h384c8.75 0 16 7.25 16 16V352z"/></svg>',
    keyboard: ['\u2318', '\u21E7', 'X'],
  },
  {
    code: 'prompts',
    name: 'Prompts manager',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" viewBox="0 0 512 512" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0" fill="currentColor"><path d="M72 48C85.25 48 96 58.75 96 72V120C96 133.3 85.25 144 72 144V232H128C128 218.7 138.7 208 152 208H200C213.3 208 224 218.7 224 232V280C224 293.3 213.3 304 200 304H152C138.7 304 128 293.3 128 280H72V384C72 388.4 75.58 392 80 392H128C128 378.7 138.7 368 152 368H200C213.3 368 224 378.7 224 392V440C224 453.3 213.3 464 200 464H152C138.7 464 128 453.3 128 440H80C49.07 440 24 414.9 24 384V144C10.75 144 0 133.3 0 120V72C0 58.75 10.75 48 24 48H72zM160 96C160 82.75 170.7 72 184 72H488C501.3 72 512 82.75 512 96C512 109.3 501.3 120 488 120H184C170.7 120 160 109.3 160 96zM288 256C288 242.7 298.7 232 312 232H488C501.3 232 512 242.7 512 256C512 269.3 501.3 280 488 280H312C298.7 280 288 269.3 288 256zM288 416C288 402.7 298.7 392 312 392H488C501.3 392 512 402.7 512 416C512 429.3 501.3 440 488 440H312C298.7 440 288 429.3 288 416z"/></svg>',
    keyboard: ['\u2318', '\u21E7', 'P'],
  },
  {
    code: 'gallery',
    name: 'Image gallery',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="icon icon-lg" fill="currentColor"><path d="M152 120c-26.51 0-48 21.49-48 48s21.49 48 48 48s48-21.49 48-48S178.5 120 152 120zM447.1 32h-384C28.65 32-.0091 60.65-.0091 96v320c0 35.35 28.65 64 63.1 64h384c35.35 0 64-28.65 64-64V96C511.1 60.65 483.3 32 447.1 32zM463.1 409.3l-136.8-185.9C323.8 218.8 318.1 216 312 216c-6.113 0-11.82 2.768-15.21 7.379l-106.6 144.1l-37.09-46.1c-3.441-4.279-8.934-6.809-14.77-6.809c-5.842 0-11.33 2.529-14.78 6.809l-75.52 93.81c0-.0293 0 .0293 0 0L47.99 96c0-8.822 7.178-16 16-16h384c8.822 0 16 7.178 16 16V409.3z"/></svg>',
    keyboard: ['\u2318', '\u21E7', 'Y'],
  },
  {
    code: 'gpts',
    name: 'GPT Store',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-lg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.75 4.5C5.50736 4.5 4.5 5.50736 4.5 6.75C4.5 7.99264 5.50736 9 6.75 9C7.99264 9 9 7.99264 9 6.75C9 5.50736 7.99264 4.5 6.75 4.5ZM2.5 6.75C2.5 4.40279 4.40279 2.5 6.75 2.5C9.09721 2.5 11 4.40279 11 6.75C11 9.09721 9.09721 11 6.75 11C4.40279 11 2.5 9.09721 2.5 6.75Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M17.25 4.5C16.0074 4.5 15 5.50736 15 6.75C15 7.99264 16.0074 9 17.25 9C18.4926 9 19.5 7.99264 19.5 6.75C19.5 5.50736 18.4926 4.5 17.25 4.5ZM13 6.75C13 4.40279 14.9028 2.5 17.25 2.5C19.5972 2.5 21.5 4.40279 21.5 6.75C21.5 9.09721 19.5972 11 17.25 11C14.9028 11 13 9.09721 13 6.75Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M6.75 15C5.50736 15 4.5 16.0074 4.5 17.25C4.5 18.4926 5.50736 19.5 6.75 19.5C7.99264 19.5 9 18.4926 9 17.25C9 16.0074 7.99264 15 6.75 15ZM2.5 17.25C2.5 14.9028 4.40279 13 6.75 13C9.09721 13 11 14.9028 11 17.25C11 19.5972 9.09721 21.5 6.75 21.5C4.40279 21.5 2.5 19.5972 2.5 17.25Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M17.25 15C16.0074 15 15 16.0074 15 17.25C15 18.4926 16.0074 19.5 17.25 19.5C18.4926 19.5 19.5 18.4926 19.5 17.25C19.5 16.0074 18.4926 15 17.25 15ZM13 17.25C13 14.9028 14.9028 13 17.25 13C19.5972 13 21.5 14.9028 21.5 17.25C21.5 19.5972 19.5972 21.5 17.25 21.5C14.9028 21.5 13 19.5972 13 17.25Z" fill="currentColor"></path></svg>',
    keyboard: ['\u2318', '\u21E7', 'F'],
  },
  {
    code: 'notes',
    name: 'Notes',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="icon icon-lg" fill="currentColor"><path d="M320 480l128-128h-128V480zM400 31.1h-352c-26.51 0-48 21.49-48 48v352C0 458.5 21.49 480 48 480H288l.0039-128c0-17.67 14.33-32 32-32H448v-240C448 53.49 426.5 31.1 400 31.1z"/></svg>',
    keyboard: ['\u2318', '\u21E7', 'E'],
  },
  {
    code: 'custom-instruction-profiles',
    name: 'Custom instruction profiles',
    icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-xl" style="position:relative;left:-2px;"><path d="M10.663 6.3872C10.8152 6.29068 11 6.40984 11 6.59007V8C11 8.55229 11.4477 9 12 9C12.5523 9 13 8.55229 13 8V6.59007C13 6.40984 13.1848 6.29068 13.337 6.3872C14.036 6.83047 14.5 7.61105 14.5 8.5C14.5 9.53284 13.8737 10.4194 12.9801 10.8006C12.9932 10.865 13 10.9317 13 11V13C13 13.5523 12.5523 14 12 14C11.4477 14 11 13.5523 11 13V11C11 10.9317 11.0068 10.865 11.0199 10.8006C10.1263 10.4194 9.5 9.53284 9.5 8.5C9.5 7.61105 9.96397 6.83047 10.663 6.3872Z" fill="currentColor"></path><path d="M17.9754 4.01031C17.8588 4.00078 17.6965 4.00001 17.4 4.00001H9.8C8.94342 4.00001 8.36113 4.00078 7.91104 4.03756C7.47262 4.07338 7.24842 4.1383 7.09202 4.21799C6.7157 4.40974 6.40973 4.7157 6.21799 5.09202C6.1383 5.24842 6.07337 5.47263 6.03755 5.91104C6.00078 6.36113 6 6.94343 6 7.80001V16.1707C6.31278 16.0602 6.64937 16 7 16H18L18 4.60001C18 4.30348 17.9992 4.14122 17.9897 4.02464C17.9893 4.02 17.9889 4.0156 17.9886 4.01145C17.9844 4.01107 17.98 4.01069 17.9754 4.01031ZM17.657 18H7C6.44772 18 6 18.4477 6 19C6 19.5523 6.44772 20 7 20H17.657C17.5343 19.3301 17.5343 18.6699 17.657 18ZM4 19L4 7.75871C3.99999 6.95374 3.99998 6.28937 4.04419 5.74818C4.09012 5.18608 4.18868 4.66938 4.43597 4.18404C4.81947 3.43139 5.43139 2.81947 6.18404 2.43598C6.66937 2.18869 7.18608 2.09012 7.74818 2.0442C8.28937 1.99998 8.95373 1.99999 9.7587 2L17.4319 2C17.6843 1.99997 17.9301 1.99994 18.1382 2.01695C18.3668 2.03563 18.6366 2.07969 18.908 2.21799C19.2843 2.40974 19.5903 2.7157 19.782 3.09203C19.9203 3.36345 19.9644 3.63318 19.9831 3.86178C20.0001 4.06994 20 4.31574 20 4.56812L20 17C20 17.1325 19.9736 17.2638 19.9225 17.386C19.4458 18.5253 19.4458 19.4747 19.9225 20.614C20.0517 20.9227 20.0179 21.2755 19.8325 21.5541C19.6471 21.8326 19.3346 22 19 22H7C5.34315 22 4 20.6569 4 19Z" fill="currentColor"></path></svg>',
    keyboard: ['\u2318', '\u21E7', 'I'],
  },
  {
    code: 'pinned-messages',
    name: 'Pinned messages',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor" class="icon icon-lg"><path d="M336 0h-288C21.49 0 0 21.49 0 48v431.9c0 24.7 26.79 40.08 48.12 27.64L192 423.6l143.9 83.93C357.2 519.1 384 504.6 384 479.9V48C384 21.49 362.5 0 336 0zM336 452L192 368l-144 84V54C48 50.63 50.63 48 53.1 48h276C333.4 48 336 50.63 336 54V452z"/></svg>',
    keyboard: ['\u2318', '\u21E7', 'M'],
  },
  {
    code: 'newsletters',
    name: 'Newsletters',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="icon icon-lg" fill="currentColor"><path d="M456 32h-304C121.1 32 96 57.13 96 88v320c0 13.22-10.77 24-24 24S48 421.2 48 408V112c0-13.25-10.75-24-24-24S0 98.75 0 112v296C0 447.7 32.3 480 72 480h352c48.53 0 88-39.47 88-88v-304C512 57.13 486.9 32 456 32zM464 392c0 22.06-17.94 40-40 40H139.9C142.5 424.5 144 416.4 144 408v-320c0-4.406 3.594-8 8-8h304c4.406 0 8 3.594 8 8V392zM264 272h-64C186.8 272 176 282.8 176 296S186.8 320 200 320h64C277.3 320 288 309.3 288 296S277.3 272 264 272zM408 272h-64C330.8 272 320 282.8 320 296S330.8 320 344 320h64c13.25 0 24-10.75 24-24S421.3 272 408 272zM264 352h-64c-13.25 0-24 10.75-24 24s10.75 24 24 24h64c13.25 0 24-10.75 24-24S277.3 352 264 352zM408 352h-64C330.8 352 320 362.8 320 376s10.75 24 24 24h64c13.25 0 24-10.75 24-24S421.3 352 408 352zM400 112h-192c-17.67 0-32 14.33-32 32v64c0 17.67 14.33 32 32 32h192c17.67 0 32-14.33 32-32v-64C432 126.3 417.7 112 400 112z"/></svg>',
    keyboard: ['\u2318', '\u21E7', 'L'],
  },
  {
    code: 'invite',
    name: 'Invite friends',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" class="icon icon-xl" fill="currentColor" style="position:relative;left:2px;"><path d="M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304l91.4 0C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7L29.7 512C13.3 512 0 498.7 0 482.3zM504 312l0-64-64 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l64 0 0-64c0-13.3 10.7-24 24-24s24 10.7 24 24l0 64 64 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-64 0 0 64c0 13.3-10.7 24-24 24s-24-10.7-24-24z"/></svg>',
  },
  {
    code: 'settings',
    name: 'Settings',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" fill="currentColor" viewBox="0 0 512 512"><path d="M495.9 166.6C499.2 175.2 496.4 184.9 489.6 191.2L446.3 230.6C447.4 238.9 448 247.4 448 256C448 264.6 447.4 273.1 446.3 281.4L489.6 320.8C496.4 327.1 499.2 336.8 495.9 345.4C491.5 357.3 486.2 368.8 480.2 379.7L475.5 387.8C468.9 398.8 461.5 409.2 453.4 419.1C447.4 426.2 437.7 428.7 428.9 425.9L373.2 408.1C359.8 418.4 344.1 427 329.2 433.6L316.7 490.7C314.7 499.7 307.7 506.1 298.5 508.5C284.7 510.8 270.5 512 255.1 512C241.5 512 227.3 510.8 213.5 508.5C204.3 506.1 197.3 499.7 195.3 490.7L182.8 433.6C167 427 152.2 418.4 138.8 408.1L83.14 425.9C74.3 428.7 64.55 426.2 58.63 419.1C50.52 409.2 43.12 398.8 36.52 387.8L31.84 379.7C25.77 368.8 20.49 357.3 16.06 345.4C12.82 336.8 15.55 327.1 22.41 320.8L65.67 281.4C64.57 273.1 64 264.6 64 256C64 247.4 64.57 238.9 65.67 230.6L22.41 191.2C15.55 184.9 12.82 175.3 16.06 166.6C20.49 154.7 25.78 143.2 31.84 132.3L36.51 124.2C43.12 113.2 50.52 102.8 58.63 92.95C64.55 85.8 74.3 83.32 83.14 86.14L138.8 103.9C152.2 93.56 167 84.96 182.8 78.43L195.3 21.33C197.3 12.25 204.3 5.04 213.5 3.51C227.3 1.201 241.5 0 256 0C270.5 0 284.7 1.201 298.5 3.51C307.7 5.04 314.7 12.25 316.7 21.33L329.2 78.43C344.1 84.96 359.8 93.56 373.2 103.9L428.9 86.14C437.7 83.32 447.4 85.8 453.4 92.95C461.5 102.8 468.9 113.2 475.5 124.2L480.2 132.3C486.2 143.2 491.5 154.7 495.9 166.6V166.6zM256 336C300.2 336 336 300.2 336 255.1C336 211.8 300.2 175.1 256 175.1C211.8 175.1 176 211.8 176 255.1C176 300.2 211.8 336 256 336z"/></svg>',
    keyboard: ['\u2318', '\u21E7', '.'],
  },
];

const upgradeButton: ManagerTab = {
  code: 'upgrade',
  name: 'Upgrade to Pro',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="icon icon-lg" fill="#ef4146"><path d="M80 192V144C80 64.47 144.5 0 224 0C303.5 0 368 64.47 368 144V192H384C419.3 192 448 220.7 448 256V448C448 483.3 419.3 512 384 512H64C28.65 512 0 483.3 0 448V256C0 220.7 28.65 192 64 192H80zM144 192H304V144C304 99.82 268.2 64 224 64C179.8 64 144 99.82 144 144V192z"/></svg>',
};

// ---------------------------------------------------------------------------
// Helper: capitalize
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// buttonGenerator -- renders keyboard shortcut badges
//
// Original: content.isolated.end.js line 11926
// ---------------------------------------------------------------------------

export function buttonGenerator(keys: string[], size: 'md' | 'xs' = 'md'): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const symbolNames: Record<string, string> = {
    '\u2318': isMac ? 'CMD' : 'CTRL',
    '\u2325': isMac ? 'OPTION' : 'ALT',
    '\u21E7': 'SHIFT',
  };

  return `<div class="flex flex-row gap-2">
  ${keys
    .map((key) => {
      if (!isMac && key.includes('\u2318')) key = key.replace('\u2318', 'CTRL');
      if (!isMac && key.includes('\u2325')) key = key.replace('\u2325', 'Alt');
      if (!isMac && key.includes('\u21E7')) key = key.replace('\u21E7', 'Shift');
      return key;
    })
    .map(
      (key) =>
        `<div ${symbolNames[key] ? `title="${symbolNames[key]}"` : ''} class="${
          size === 'xs'
            ? 'h-5 px-1 text-xs text-token-icon icon-secondary'
            : 'my-2 h-8 text-sm px-2 text-token-icon icon-primary'
        } flex items-center justify-center rounded-md border border-token-border-medium capitalize">${key}</div>`,
    )
    .join('')}
  </div>`;
}

// ---------------------------------------------------------------------------
// selectedManagerTabTitle
//
// Original: content.isolated.end.js line 15788
// ---------------------------------------------------------------------------

function selectedManagerTabTitle(tab: string): string {
  switch (tab) {
    case 'conversations':
      return 'Conversations manager';
    case 'prompts':
      return 'Prompts manager';
    case 'gallery':
      return 'Image gallery';
    case 'notes':
      return 'Notes';
    case 'custom-instruction-profiles':
      return 'Custom instruction profiles';
    case 'gpts':
      return 'GPT Store';
    case 'pinned-messages':
      return 'Pinned messages';
    case 'newsletters':
      return "What's happening in the world of AI";
    case 'invite':
      return 'Invite friends. Earn Pro Subscription';
    default:
      return 'Prompts manager';
  }
}

// ---------------------------------------------------------------------------
// selectedManagerTabSubtitle
//
// Original: content.isolated.end.js line 15813
// ---------------------------------------------------------------------------

function selectedManagerTabSubtitle(tab: string): string {
  switch (tab) {
    case 'conversations':
      return 'Organize all your conversations in one place  <a href="https://www.youtube.com/watch?v=cfp0df9gSJcT" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
    case 'prompts':
      return 'Create and manage all your prompts in one place  <a href="https://www.youtube.com/watch?v=cfp0df9gSJcT" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
    case 'gallery':
      return 'Manage all your images in one place  <a href="https://www.youtube.com/watch?v=cfp0df9gSJcT" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
    case 'notes':
      return 'All of your notes in one place  <a href="https://www.youtube.com/watch?v=JjBuaNtvTv4" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
    case 'custom-instruction-profiles':
      return 'Create and manage all your custom instruction profiles in one place  <a href="https://help.openai.com/en/articles/8096356-custom-instructions-for-chatgpt" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
    case 'gpts':
      return 'Enhanced GPT Store with full list of GPTs  <a href="https://youtu.be/vrC0FAeUi1E?si=zDDUNL2UVPCxcUbd" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
    case 'pinned-messages':
      return 'Manage all your pinned messages in one place  <a href="https://www.youtube.com/watch?v=cfp0df9gSJcT" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
    case 'newsletters':
      return 'You can find all of our previous newsletters here (<a href="#" target="_blank" rel="noopener noreferrer" class="underline">Read Online</a>)';
    case 'invite':
      return 'Get a free month of Pro Subscription for every friend you invite after they upgrade to the Pro subscription.';
    default:
      return 'Create and manage all your prompts in one place  <a href="https://www.youtube.com/watch?v=ha2AiwOglt4" target="_blank" class="underline" rel="noreferrer">Learn more</a>';
  }
}

// ---------------------------------------------------------------------------
// selectedManagerTabContent
//
// Original: content.isolated.end.js line 15838
// ---------------------------------------------------------------------------

function selectedManagerTabContent(tab: string): HTMLElement {
  switch (tab) {
    case 'conversations':
      return conversationManagerModalContent();
    case 'prompts':
      return promptManagerModalContent();
    case 'newsletters':
      return newsletterListModalContent();
    case 'notes':
      return noteListModalContent();
    case 'custom-instruction-profiles':
      return customInstructionProfileManagerModalContent();
    case 'gpts':
      return renderGizmoDiscoveryPage();
    case 'pinned-messages':
      return pinnedMessageManagerModalContent();
    case 'gallery':
      return createImageGallery();
    case 'invite':
      return inviteManagerModalContent();
    default:
      return promptManagerModalContent();
  }
}

// ---------------------------------------------------------------------------
// selectedManagerTabAction
//
// Original: content.isolated.end.js line 15863
// ---------------------------------------------------------------------------

function selectedManagerTabAction(tab: string): HTMLElement {
  switch (tab) {
    case 'prompts':
      return promptManagerModalActions();
    case 'conversations':
      return conversationManagerModalActions();
    case 'custom-instruction-profiles':
      return customInstructionProfileManagerModalActions();
    case 'gpts':
      return gizmoManagerModalActions();
    case 'invite':
      return inviteManagerModalActions();
    default:
      return noTabActions();
  }
}

// ---------------------------------------------------------------------------
// noTabActions
//
// Original: content.isolated.end.js line 15880
// ---------------------------------------------------------------------------

function noTabActions(): HTMLElement {
  return document.createElement('div');
}

// ---------------------------------------------------------------------------
// createManagerSideTab
//
// Original: content.isolated.end.js line 15884
// ---------------------------------------------------------------------------

function createManagerSideTab(activeTab: string): HTMLElement {
  const container = document.createElement('div');
  container.id = 'modal-manager-side-tab';
  container.classList.add('flex', 'flex-col', 'items-start', 'justify-start', 'h-full', 'pt-4');
  container.style.zIndex = '100000';

  const tabs = [...managerTabList] as ManagerTab[];
  tabs.splice(managerTabList.length - 2, 0, upgradeButton);

  tabs.forEach((tab) => {
    const row = document.createElement('div');
    row.id = `modal-manager-side-tab-${tab.code}`;
    row.className = 'flex items-start gap-1.5 relative mb-2';

    if (tab.code === 'upgrade') {
      row.classList.add('hidden', 'mt-auto');
    }
    if (tab.code === 'invite') {
      row.classList.add('mt-auto');
    }

    // Active indicator bar
    const indicator = document.createElement('div');
    indicator.className = `w-1.5 h-11 rounded-e-xl ${activeTab === tab.code ? 'bg-black dark:bg-white' : ''}`;
    row.appendChild(indicator);

    // Tab button
    const btn = document.createElement('button');
    btn.className = `flex items-center gap-1.5 rounded-md p-2 m-auto text-token-text-${
      activeTab === tab.code ? 'primary' : 'tertiary'
    } hover:text-token-text-primary rounded-lg bg-token-sidebar-surface-secondary cursor-pointer`;
    btn.innerHTML = tab.icon;

    btn.addEventListener('click', async (ev) => {
      if (tab.code === 'settings') {
        ev.stopPropagation();
        ev.preventDefault();
        closeMenus();
        const hasSub: boolean = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
        const showSync = (ev as MouseEvent).shiftKey && (ev as MouseEvent).altKey;
        showManagerSidebarSettingsMenu(btn, hasSub, showSync);
        return;
      }

      if (tab.code === 'upgrade') {
        ev.stopPropagation();
        ev.preventDefault();
        openUpgradeModal();
        return;
      }

      const wrapper = document.querySelector('[id="modal-wrapper-manager"]') as HTMLElement | null;
      const isFullscreen = wrapper !== null && wrapper.style.width === '100vw' && wrapper.style.height === '100vh';
      createManager(tab.code, isFullscreen);
    });

    row.appendChild(btn);

    addTooltip(row, {
      value: `<div class="me-2">${translate(tab.name)}</div><div claass="text-token-text-tertiary ms-2">${buttonGenerator(tab.keyboard ?? [], 'xs')}</div>`,
      position: 'right',
    });

    container.appendChild(row);
  });

  // Version footer
  const footer = document.createElement('div');
  footer.className = 'w-full flex items-center justify-center cursor-pointer';

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    if (!hasSub) {
      document.querySelector('#modal-manager-side-tab-upgrade')?.classList.remove('hidden');
      document.querySelector('#modal-manager-side-tab-invite')?.classList.remove('mt-auto');
    }
    footer.innerHTML = `<span class="flex items-center text-xs text-token-text-tertiary mb-1 ms-1">v${chrome.runtime.getManifest().version} <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="ms-1 icon icon-xs" stroke="currentColor" fill="${hasSub ? 'gold' : 'currentColor'}"><path d="M240.5 224H352C365.3 224 377.3 232.3 381.1 244.7C386.6 257.2 383.1 271.3 373.1 280.1L117.1 504.1C105.8 513.9 89.27 514.7 77.19 505.9C65.1 497.1 60.7 481.1 66.59 467.4L143.5 288H31.1C18.67 288 6.733 279.7 2.044 267.3C-2.645 254.8 .8944 240.7 10.93 231.9L266.9 7.918C278.2-1.92 294.7-2.669 306.8 6.114C318.9 14.9 323.3 30.87 317.4 44.61L240.5 224z"/></svg></span>`;
  });

  footer.addEventListener('click', () => {
    const { version } = chrome.runtime.getManifest();
    createReleaseNoteModal(version);
  });

  container.appendChild(footer);
  return container;
}

// ---------------------------------------------------------------------------
// postModalCreate -- runs tab-specific initialization after modal is shown
//
// Original: content.isolated.end.js line 15929
// ---------------------------------------------------------------------------

function postModalCreate(title: string, tab: string): void {
  window.location.hash = `manager/${tab}`;

  const titleEl = document.querySelector('#modal-title');
  if (titleEl) titleEl.innerHTML = title;

  document.querySelector('#modal-close-button-manager')?.addEventListener('click', () => {
    chrome.storage.local.set({
      selectedPromptFolderBreadcrumb,
      selectedConversationFolderBreadcrumb,
      managerModalCurrentTab,
    });
  });

  const modal = document.querySelector('#modal-manager') as HTMLElement | null;
  const wrapper = document.querySelector('#modal-wrapper-manager') as HTMLElement | null;

  if (modal && wrapper) {
    modal.addEventListener('mousedown', (ev) => {
      if (!wrapper.contains(ev.target as Node)) {
        chrome.storage.local.set({
          selectedPromptFolderBreadcrumb,
          selectedConversationFolderBreadcrumb,
          managerModalCurrentTab,
        });
      }
    });
  }

  addNewsletterIndicator();

  const allLanguages = [{ code: 'all', name: 'All' }, ...languageList.slice(1)];

  switch (tab) {
    case 'conversations':
      addDropdownEventListener('Conversations-Manager-SortBy', conversationsSortByList as any[], 'code', () =>
        fetchConversations(),
      );
      break;
    case 'prompts':
      addDropdownEventListener('Prompts-Manager-SortBy', promptsSortByList as any[], 'code', () => fetchPrompts());
      addDropdownEventListener('Prompts-Manager-Language', allLanguages as any[], 'code', () => fetchPrompts());
      break;
    case 'notes':
      fetchNotes();
      addDropdownEventListener('Notes-SortBy', notesSortByList as any[], 'code', () => fetchNotes());
      break;
    case 'newsletters':
      loadNewsletterList();
      break;
    case 'gallery':
      addImageGalleryEventListeners();
      loadImageList();
      break;
    case 'custom-instruction-profiles':
      fetchCustomInstructionProfiles();
      addDropdownEventListener('Profiles-Manager-SortBy', profilesSortByList as any[], 'code', () =>
        fetchCustomInstructionProfiles(),
      );
      break;
    case 'pinned-messages':
      fetchPinnedMessages();
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// addNewsletterIndicator
//
// Original: content.isolated.end.js line 15979
// ---------------------------------------------------------------------------

function addNewsletterIndicator(): void {
  chrome.storage.local.get(['readNewsletterIds'], (result) => {
    const readIds: string[] = result.readNewsletterIds || [];

    chrome.runtime.sendMessage({ type: 'getLatestNewsletter' }, (newsletter: any) => {
      if (!newsletter || !newsletter.id || readIds.includes(newsletter.id)) return;
      document
        .querySelector('#modal-manager-side-tab-newsletters')
        ?.insertAdjacentElement('beforeend', animatePing('#ef4146'));
    });
  });
}

// ---------------------------------------------------------------------------
// createManager -- the big central tabbed modal
//
// Original: content.isolated.end.js line 15989
// ---------------------------------------------------------------------------

export async function createManager(tab = 'prompts', fullscreen = false): Promise<void> {
  closeMenus();
  closeModals();

  // Bail if unknown tab
  if (managerTabList.map((t) => t.code).indexOf(tab) === -1) {
    window.location.hash = '';
    return;
  }

  managerModalCurrentTab = tab;
  chrome.storage.local.set({
    selectedPromptFolderBreadcrumb,
    selectedConversationFolderBreadcrumb,
    managerModalCurrentTab,
  });

  // Remove any existing manager modal
  const existing = document.querySelector('#modal-manager');
  if (existing) existing.remove();

  const sideTab = createManagerSideTab(managerModalCurrentTab);
  const title = translate(selectedManagerTabTitle(managerModalCurrentTab));
  const subtitle = selectedManagerTabSubtitle(managerModalCurrentTab);
  const content = selectedManagerTabContent(managerModalCurrentTab);
  const actions = selectedManagerTabAction(managerModalCurrentTab);

  createModal('Manager', subtitle, content, actions, true, 'large', sideTab, fullscreen);
  postModalCreate(title, managerModalCurrentTab);
}

// ---------------------------------------------------------------------------
// addManagerButton — the floating purple lightning-bolt button
//
// Original: content.isolated.end.js lines 16008-16070
// ---------------------------------------------------------------------------

const MANAGER_BOLT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="icon icon-lg" stroke="purple" fill="purple"><path d="M240.5 224H352C365.3 224 377.3 232.3 381.1 244.7C386.6 257.2 383.1 271.3 373.1 280.1L117.1 504.1C105.8 513.9 89.27 514.7 77.19 505.9C65.1 497.1 60.7 481.1 66.59 467.4L143.5 288H31.1C18.67 288 6.733 279.7 2.044 267.3C-2.645 254.8 .8944 240.7 10.93 231.9L266.9 7.918C278.2-1.92 294.7-2.669 306.8 6.114C318.9 14.9 323.3 30.87 317.4 44.61L240.5 224z"/></svg>';

export async function addManagerButton(): Promise<void> {
  if (document.querySelector('#manager-button')) return;

  // Retry until the floating button wrapper exists
  setTimeout(() => {
    addManagerButton();
  }, 1500);

  const btnWrapper = document.createElement('div');
  btnWrapper.id = 'manager-button-wrapper';
  btnWrapper.className = 'flex flex-wrap z-10';
  btnWrapper.style.cssText = 'margin-bottom: 1rem;right: 0;padding:0 12px;min-width: 56px;';

  // Hidden quick-access list (shown on hover)
  const hiddenList = document.createElement('div');
  hiddenList.id = 'manager-button-hidden-list';
  hiddenList.className = 'hidden mb-2 flex flex-wrap w-full gap-1.5 bg-token-main-surface-primary rounded-md';
  hiddenList.style.cssText = 'backdrop-filter: blur(10px);';
  btnWrapper.appendChild(hiddenList);

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    const tabs = [...managerTabList].reverse();
    tabs.forEach((tab) => {
      if (['conversations', 'prompts', 'gallery', 'settings'].includes(tab.code)) {
        const btn = document.createElement('button');
        btn.className =
          'flex items-center justify-center border border-token-border-medium text-token-text-tertiary bg-token-main-surface-primary hover:text-token-text-primary text-xs font-sans cursor-pointer rounded-md w-8 h-8 shadow-long';
        btn.innerHTML = tab.icon.replace('icon icon-lg', 'icon icon-sm').replace('icon icon-xl', 'icon icon-sm');
        addTooltip(btn, {
          value: `<div class="me-2">${translate(tab.code)}</div><div class="text-token-text-tertiary ms-2">${buttonGenerator(tab.keyboard || [], 'xs')}</div>`,
          position: 'left',
        });
        btn.addEventListener('click', () => {
          if (tab.code === 'settings') {
            createSettingsModal();
            return;
          }
          createManager(tab.code);
        });
        hiddenList.appendChild(btn);
      }
    });
  });

  // Main lightning bolt button
  const mainBtn = document.createElement('button');
  mainBtn.id = 'manager-button';
  mainBtn.innerHTML = MANAGER_BOLT_ICON;
  mainBtn.className =
    'flex items-center justify-center border border-token-border-medium text-token-text-tertiary bg-gold hover:bg-gold-dark hover:text-token-text-primary text-xs font-sans cursor-pointer rounded-md w-8 h-8 shadow-long';
  addTooltip(mainBtn, { value: translate('Manager'), position: 'left' });

  mainBtn.addEventListener('click', async (ev) => {
    if (ev.shiftKey) {
      // Shift+Click = clear cache & reload
      if (ev.metaKey || ev.ctrlKey) {
        await chrome.storage.local.set({ lastFullSyncRun: null });
        chrome.runtime.sendMessage({
          type: 'initConvHistorySync',
          forceRefresh: true,
          detail: { syncIntervalTime: 5000 },
        });
      }
      chrome.runtime.sendMessage({ type: 'clearAllCache', forceRefresh: true }, () => {
        window.location.reload();
      });
      return;
    }
    createManager(managerModalCurrentTab);
  });

  btnWrapper.appendChild(mainBtn);

  // Show/hide quick-access list on hover
  btnWrapper.addEventListener('mouseenter', () => {
    hiddenList.classList.remove('hidden');
  });
  btnWrapper.addEventListener('mouseleave', () => {
    hiddenList.classList.add('hidden');
  });

  // Insert into the floating button wrapper
  let floatingWrapper = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
  if (!floatingWrapper) {
    // addFloatingButtons should have been called already, but just in case
    const { addFloatingButtons } = await import('../isolated-world/ui/floating-buttons');
    addFloatingButtons();
    floatingWrapper = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
  }
  floatingWrapper?.insertAdjacentElement('afterbegin', btnWrapper);
}

// ---------------------------------------------------------------------------
// conversationManagerModalContent
//
// Original: content.isolated.end.js line 17366
// ---------------------------------------------------------------------------

function conversationManagerModalContent(): HTMLElement {
  resetConversationManagerParams();
  clearSidebarSearchInput();

  const wrapper = document.createElement('div');
  wrapper.id = 'modal-content-conversation-manager';
  wrapper.style.cssText = 'overflow-y: hidden;position: relative;height:100%; width:100%';
  wrapper.classList.add('markdown', 'prose-invert', 'flex');

  const { managerSidebarWidth: sidebarWidth = 220 } = cachedSettings;
  const sidebar = document.createElement('div');
  sidebar.id = 'conversation-manager-sidebar';
  sidebar.style.cssText = `width:${sidebarWidth}px;min-width:220px;resize:horizontal;overflow:hidden;`;
  sidebar.classList.add(
    'bg-token-main-surface-primary',
    'border-e',
    'border-token-border-medium',
    'relative',
    'h-full',
  );
  sidebar.appendChild(conversationManagerSidebarContent());
  elementResizeObserver(sidebar, 'managerSidebarWidth');
  wrapper.appendChild(sidebar);

  const main = document.createElement('div');
  main.id = 'conversation-manager-main-content';
  main.style.cssText = `width:calc(100% - ${sidebarWidth}px)`;
  main.classList.add('overflow-y-auto', 'h-full');

  main.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!document.querySelector('.folder-dragging')) return;
    const folder = getLastSelectedConversationFolder();
    if (!isDefaultConvFolder(folder.id)) {
      (ev as DragEvent).dataTransfer!.dropEffect = 'move';
      main.classList.add('conversation-list-drag-hover');
    }
  });

  main.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!document.querySelector('.folder-dragging')) return;
    const folder = getLastSelectedConversationFolder();
    if (!isDefaultConvFolder(folder.id)) {
      main.classList.remove('conversation-list-drag-hover');
    }
  });

  main.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resetConversationManagerSelection();
    if (!document.querySelector('.folder-dragging')) return;
    const folder = getLastSelectedConversationFolder();
    if (isDefaultConvFolder(folder.id)) return;
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
      if (!f || f.id === folder?.id || convBreadcrumbIncludesFolder(f.id)) return;
      moveConvFolder(f, folder.id);
    }
  });

  main.appendChild(conversationManagerMainContent());
  wrapper.appendChild(main);
  return wrapper;
}

// ---------------------------------------------------------------------------
// conversationManagerModalActions
//
// Original: content.isolated.end.js line 17403
// ---------------------------------------------------------------------------

function conversationManagerModalActions(): HTMLElement {
  const folder = getLastSelectedConversationFolder();
  const isDefault = isDefaultConvFolder(folder?.id);
  const container = document.createElement('div');
  container.classList.add('flex', 'items-center', 'justify-end', 'w-full', 'mt-2');

  const btn = document.createElement('button');
  btn.id = 'conversation-manager-start-new-chat-button';
  btn.className = 'btn composer-submit-btn composer-submit-button-color';
  btn.innerText = isDefault
    ? translate('Start a New Chat')
    : folder?.gizmo_id
      ? translate('Start a new chat with this GPT')
      : translate('Start a new chat in this folder');

  btn.addEventListener('click', () => {
    closeMenus();
    const f = getLastSelectedConversationFolder();
    if (!isDefaultConvFolder(f?.id)) {
      setFolderForNewChat(f);
      initiateNewChatFolderIndicator();
    }
    const closeBtn = document.querySelector('#modal-manager #modal-close-button-manager') as HTMLElement | null;
    if (closeBtn) closeBtn.click();
    startNewChat(false, f.gizmo_id);
  });

  container.appendChild(btn);
  return container;
}

// ---------------------------------------------------------------------------
// fetchConversations
//
// Original: content.isolated.end.js line 18066
// ---------------------------------------------------------------------------

async function fetchConversations(page = 1, fullSearch = false, forceRefresh = false): Promise<void> {
  const folder = getLastSelectedConversationFolder();
  if (!folder) return;
  const listEl = document.querySelector('#modal-manager #conversation-manager-conversation-list') as HTMLElement | null;
  if (!listEl) return;

  if (page === 1) {
    listEl.innerHTML = '';
    listEl.appendChild(loadingSpinner('conversation-manager-main-content'));
  }

  let conversations: any[] = [];
  let hasMore = false;
  let favoriteIds: string[] = [];
  let noteIds: string[] = [];

  const searchTerm = (
    document.querySelector('#modal-manager input[id=conversation-manager-search-input]') as HTMLInputElement | null
  )?.value;

  if (searchTerm === '' && folder?.id === 'archived') {
    if (page === 1) {
      favoriteIds = await chrome.runtime.sendMessage({ type: 'getAllFavoriteConversationIds' });
      noteIds = await chrome.runtime.sendMessage({ type: 'getAllNoteConversationIds' });
    }
    const pageSize = 100;
    const offset = (page - 1) * pageSize;
    const isArchived = folder?.id === 'archived';
    try {
      const resp = await getConversations(offset, pageSize, 'updated', isArchived, forceRefresh);
      conversations = syncHistoryResponseToConversationDB(resp, isArchived);
      hasMore = resp.total > offset + pageSize;
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
    const { selectedConversationsManagerSortBy: sortBy, excludeConvInFolders: excludeConvInFolders } = cachedSettings;
    const sortCode = sortBy?.code;
    const resp = await chrome.runtime.sendMessage({
      type: 'getConversations',
      forceRefresh,
      detail: {
        pageNumber: page,
        searchTerm,
        sortBy: ['all', 'archived'].includes(folder?.id) ? 'updated_at' : sortCode,
        fullSearch,
        folderId: searchTerm || typeof folder?.id === 'string' ? null : folder?.id,
        isArchived: folder?.id === 'archived' ? true : null,
        isFavorite: folder?.id === 'favorites' ? true : null,
        excludeConvInFolders: folder?.id === 'all' && excludeConvInFolders,
      },
    });
    conversations = resp.results;
    hasMore = resp.next;
  }

  const spinner = document.querySelector('#modal-manager #loading-spinner-conversation-manager-main-content');
  if (spinner) spinner.remove();

  if (conversations?.length === 0 && page === 1) {
    if (searchTerm && !fullSearch) {
      const fullSearchBtn = createFullSearchButton();
      listEl.appendChild(fullSearchBtn);
      fullSearchBtn.click();
    } else {
      listEl.appendChild(noConversationElement());
    }
  } else {
    conversations?.forEach((conv: any) => {
      const isFav = favoriteIds.includes(conv.conversation_id) || conv.is_favorite;
      const hasNote = noteIds.includes(conv.conversation_id) || conv.has_note;
      const enriched = { ...conv, is_favorite: isFav, has_note: hasNote };
      const card = createConversationCard(enriched);
      listEl.appendChild(card);
      addConversationCardEventListeners(card, enriched);
    });

    if (hasMore) {
      const loadBtn = document.createElement('button');
      loadBtn.id = 'load-more-conversations-button';
      loadBtn.className = `bg-token-main-surface-secondary p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${cachedSettings.selectedConversationView === 'list' ? 'h-14' : 'h-auto aspect-1.5'} flex flex-col relative`;
      loadBtn.appendChild(loadingSpinner('load-more-conversations-button'));
      listEl.appendChild(loadBtn);
      loadBtn.onclick = () => fetchConversations(page + 1, fullSearch, forceRefresh);

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
      if (loadBtn) observer.observe(loadBtn);
    } else if (searchTerm && !fullSearch) {
      const fullSearchBtn = createFullSearchButton();
      listEl.appendChild(fullSearchBtn);
    }
  }
}

function createFullSearchButton(isSidebar = false): HTMLElement {
  const btn = document.createElement('button');
  btn.id = 'full-search-button';
  btn.className = `flex items-center justify-center text-2xl bg-token-main-surface-secondary p-4 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${isSidebar ? 'mt-2' : ''} ${isSidebar || cachedSettings.selectedConversationView === 'list' ? 'w-full h-14' : 'h-auto aspect-1.5'} relative`;
  btn.innerHTML = `<div class="flex items-center justify-center">
      <div class="w-full text-sm">Click to load more</div>
      </div>`;
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
// noteListModalContent
//
// Original: content.isolated.end.js line 12420
// ---------------------------------------------------------------------------

function noteListModalContent(): HTMLElement {
  resetNoteManagerParams();
  const wrapper = document.createElement('div');
  wrapper.id = 'modal-content-note-list';
  wrapper.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: hidden;height:100%;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start; width: 100%; z-index: 100; position: sticky; top: 0;';
  toolbar.className = 'bg-token-main-surface-primary p-2 border-b border-token-border-medium';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className =
    'text-token-text-primary bg-token-main-surface-secondary border border-token-border-medium text-sm rounded-md w-full h-full';
  searchInput.placeholder = translate('Search notes');
  searchInput.id = 'note-manager-search-input';
  searchInput.autocomplete = 'off';

  const debouncedSearch = debounce((ev: Event) => {
    const { value } = ev.target as HTMLInputElement;
    setNoteListSearchTerm(value);
    setNoteListPageNumber(1);
    fetchNotes(noteListPageNumber);
  });

  searchInput.addEventListener('input', (ev) => {
    const val = (ev.target as HTMLInputElement).value.trim();
    if (val !== '') {
      debouncedSearch(ev);
    } else {
      setNoteListSearchTerm('');
      setNoteListPageNumber(1);
      fetchNotes(noteListPageNumber);
    }
    const pill = document.querySelector('#note-manager-search-term-pill') as HTMLElement | null;
    const pillText = document.querySelector('#note-manager-search-term-pill-text') as HTMLElement | null;
    if (val !== '') {
      if (pillText) pillText.innerText = val;
      pill?.classList.remove('hidden');
    } else {
      if (pillText) pillText.innerText = '';
      pill?.classList.add('hidden');
    }
  });
  toolbar.appendChild(searchInput);

  const { selectedNotesSortBy: notesSortBy, selectedNotesView: notesView } = cachedSettings;

  const sortByWrapper = document.createElement('div');
  sortByWrapper.style.cssText = 'position:relative;width:150px;z-index:1000;margin-left:8px;';
  sortByWrapper.innerHTML = dropdown('Notes-SortBy', notesSortByList as any[], notesSortBy, 'code', 'right');
  toolbar.appendChild(sortByWrapper);

  const viewToggle = document.createElement('button');
  viewToggle.className =
    'h-full aspect-1 flex items-center justify-center rounded-lg px-2 ms-2 text-token-text-tertiary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-secondary';
  viewToggle.innerHTML =
    notesView === 'list'
      ? '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM206.4 335.1L152 394.9V56.02C152 42.76 141.3 32 128 32S104 42.76 104 56.02v338.9l-54.37-58.95c-4.719-5.125-11.16-7.719-17.62-7.719c-5.812 0-11.66 2.094-16.28 6.375c-9.75 8.977-10.34 24.18-1.344 33.94l95.1 104.1c9.062 9.82 26.19 9.82 35.25 0l95.1-104.1c9-9.758 8.406-24.96-1.344-33.94C230.5 325.5 215.3 326.2 206.4 335.1z"/></svg>'
      : '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM145.6 39.37c-9.062-9.82-26.19-9.82-35.25 0L14.38 143.4c-9 9.758-8.406 24.96 1.344 33.94C20.35 181.7 26.19 183.8 32 183.8c6.469 0 12.91-2.594 17.62-7.719L104 117.1v338.9C104 469.2 114.8 480 128 480s24-10.76 24-24.02V117.1l54.37 58.95C215.3 185.8 230.5 186.5 240.3 177.4C250 168.4 250.6 153.2 241.6 143.4L145.6 39.37z"/></svg>';

  viewToggle.addEventListener('click', () => {
    document.querySelectorAll('[id^=note-item-]').forEach((el) => {
      if (cachedSettings.selectedNotesView === 'list') {
        el.classList.remove('aspect-2');
        el.classList.add('aspect-1');
      } else {
        el.classList.remove('aspect-1');
        el.classList.add('aspect-2');
      }
    });
    if (cachedSettings.selectedNotesView === 'list') {
      viewToggle.innerHTML =
        '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM145.6 39.37c-9.062-9.82-26.19-9.82-35.25 0L14.38 143.4c-9 9.758-8.406 24.96 1.344 33.94C20.35 181.7 26.19 183.8 32 183.8c6.469 0 12.91-2.594 17.62-7.719L104 117.1v338.9C104 469.2 114.8 480 128 480s24-10.76 24-24.02V117.1l54.37 58.95C215.3 185.8 230.5 186.5 240.3 177.4C250 168.4 250.6 153.2 241.6 143.4L145.6 39.37z"/></svg>';
    } else {
      viewToggle.innerHTML =
        '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM206.4 335.1L152 394.9V56.02C152 42.76 141.3 32 128 32S104 42.76 104 56.02v338.9l-54.37-58.95c-4.719-5.125-11.16-7.719-17.62-7.719c-5.812 0-11.66 2.094-16.28 6.375c-9.75 8.977-10.34 24.18-1.344 33.94l95.1 104.1c9.062 9.82 26.19 9.82 35.25 0l95.1-104.1c9-9.758 8.406-24.96-1.344-33.94C230.5 325.5 215.3 326.2 206.4 335.1z"/></svg>';
    }
    chrome.storage.local.set({
      settings: {
        ...cachedSettings,
        selectedNotesView: cachedSettings.selectedNotesView === 'list' ? 'grid' : 'list',
      },
    });
  });
  toolbar.appendChild(viewToggle);
  wrapper.appendChild(toolbar);

  const pill = document.createElement('div');
  pill.id = 'note-manager-search-term-pill';
  pill.className =
    'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 mt-2 ms-4 border border-token-border-medium max-w-fit';
  pill.innerHTML =
    '<button id="note-manager-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"> <line x1="18" y1="6" x2="6" y2="18"></line> <line x1="6" y1="6" x2="18" y2="18"></line> </svg></button><span id="note-manager-search-term-pill-text" class="text-sm mx-1 text-danger"></span>';
  pill.querySelector('#note-manager-search-term-pill-clear-button')!.addEventListener('click', () => {
    const input = document.querySelector('#note-manager-search-input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
  });
  wrapper.appendChild(pill);

  const list = noteListComponent();
  wrapper.appendChild(list);
  return wrapper;
}

// ---------------------------------------------------------------------------
// fetchNotes
//
// Original: content.isolated.end.js line 12465
// ---------------------------------------------------------------------------

function fetchNotes(page = 1): void {
  const { selectedNotesSortBy: sortBy } = cachedSettings;
  setNoteListPageNumber(page);
  chrome.runtime.sendMessage(
    {
      type: 'getNotes',
      detail: {
        page: noteListPageNumber,
        sortBy: sortBy.code,
        searchTerm: noteListSearchTerm,
      },
    },
    (data: any) => {
      renderNoteCards(data);
      if (page === 1) {
        document.querySelector('#note-list')?.scrollTo(0, 0);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// gizmoManagerModalActions
//
// Original: content.isolated.end.js line 8314
// ---------------------------------------------------------------------------

function gizmoManagerModalActions(): HTMLElement {
  const container = document.createElement('div');
  container.classList.add('flex', 'items-center', 'justify-end', 'w-full', 'mt-2');

  const btn = document.createElement('button');
  btn.className = 'btn composer-submit-btn composer-submit-button-color';
  btn.innerText = translate('plus Create a GPT');
  btn.addEventListener('click', () => {
    closeModals();
    window.history.pushState({}, '', `https://${window.location.host}/gpts/editor`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });

  container.appendChild(btn);
  return container;
}

// ---------------------------------------------------------------------------
// renderGizmoDiscoveryPage
//
// Original: content.isolated.end.js line 8256
// ---------------------------------------------------------------------------

function renderGizmoDiscoveryPage(category = 'all'): HTMLElement {
  let cat = category || 'all';
  const wrapper = document.createElement('div');
  wrapper.appendChild(loadingSpinner('gizmo-discovery-loading'));

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    if (!hasSub && cat === 'all') cat = 'featured_store';
    setSelectedGizmoCategoryId(cat);

    chrome.storage.sync.get(['openai_id']).then((result: any) => {
      const { openai_id: openaiId } = result;
      wrapper.className = 'mx-auto w-full p-4 pt-0 h-full';

      const header = document.createElement('div');
      header.style.cssText = 'position: sticky; top: 0; z-index: 1000;';
      header.classList.add('pb-1', 'pt-4');

      const topRow = document.createElement('div');
      topRow.classList.add('flex', 'justify-between', 'items-start');

      const tabs = document.createElement('div');
      tabs.id = 'gizmo-discovery-tabs';
      tabs.classList.add('flex', 'justify-start', 'gap-2', 'mb-4');

      gizmoCategories.forEach((gc: any) => {
        const tabBtn = document.createElement('button');
        tabBtn.id = `gizmo-discovery-${gc.id}-tab`;
        tabBtn.className = `btn relative ${gc.id === cat ? 'btn-primary' : 'btn-secondary'}`;
        tabBtn.title = gc.description;
        tabBtn.style.fontSize = '12px';
        tabBtn.innerHTML = gc.title;
        tabBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          closeMenus();
          if (gc.id === 'more_categories') {
            showMoreCategories(openaiId, hasSub);
          } else {
            const moreMenu = document.querySelector('#more-categories-menu');
            if (moreMenu) moreMenu.remove();
            setSelectedGizmoCategoryId(gc.id);
            resetGizmoDiscoveryPageLocal(gc.id, hasSub);
            fetchGizmos(gc.id, openaiId, hasSub);
            setActiveGizmoTab(`gizmo-discovery-${gc.id}-tab`);
          }
        });
        tabs.appendChild(tabBtn);
      });
      topRow.appendChild(tabs);

      const rightControls = document.createElement('div');
      rightControls.classList.add('flex', 'justify-end', 'items-start');

      const sortWrapper = document.createElement('div');
      sortWrapper.id = 'gizmo-sort-by-selector-wrapper';
      sortWrapper.style.cssText = 'position:relative;width:155px;z-index:1000;margin-right:12px;';
      sortWrapper.innerHTML = dropdown(
        'GPTs-SortBy',
        gizmoSortByList,
        gizmoSortByList[0] ?? null,
        'code',
        'right',
        'bg-token-main-surface-primary',
      );
      rightControls.appendChild(sortWrapper);

      const searchWrapper = document.createElement('div');
      searchWrapper.classList.add('flex', 'justify-start', 'items-center', 'gap-2', 'mb-4', 'pe-3');
      searchWrapper.style.cssText = 'width: 200px;';
      searchWrapper.innerHTML =
        '<input id="gizmo-search-input" class="form-input w-full rounded-md shadow-sm bg-token-main-surface-secondary" type="search" placeholder="Name, author, desc..." />';
      rightControls.appendChild(searchWrapper);
      topRow.appendChild(rightControls);
      header.appendChild(topRow);

      const catDesc = document.createElement('div');
      catDesc.id = 'gizmo-category-description';
      catDesc.className = 'mb-2 text-sm text-token-text-tertiary md:text-base';
      catDesc.innerText = gizmoCategories.find((gc: any) => gc.id === cat)?.description || '';
      header.appendChild(catDesc);

      const searchPill = document.createElement('div');
      searchPill.id = 'gizmo-search-term-pill';
      searchPill.className =
        'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 border border-token-border-medium max-w-fit';
      searchPill.innerHTML =
        '<button id="gizmo-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"> <line x1="18" y1="6" x2="6" y2="18"></line> <line x1="6" y1="6" x2="18" y2="18"></line> </svg></button><span id="gizmo-search-term-pill-text" class="text-sm mx-1 text-danger"></span>';
      searchPill.querySelector('#gizmo-search-term-pill-clear-button')!.addEventListener('click', () => {
        const inp = document.querySelector('#gizmo-search-input') as HTMLInputElement;
        inp.value = '';
        inp.dispatchEvent(new Event('input'));
      });
      header.appendChild(searchPill);

      wrapper.innerHTML = '';
      wrapper.appendChild(header);

      const grid = document.createElement('div');
      grid.id = 'gizmo-discovery-grid';
      grid.style.cssText = 'position:relative;height:100%; overflow-y: auto;padding-bottom: 120px;';
      grid.className = 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      wrapper.appendChild(grid);

      const oldSpinner = document.querySelector('#gizmo-discovery-loading');
      if (oldSpinner) oldSpinner.remove();

      resetGizmoDiscoveryPageLocal(cat, hasSub);
      addDropdownEventListener('GPTs-SortBy', gizmoSortByList, 'code', (val: any) =>
        toggleGizmoSortByDropdown(val, openaiId, hasSub),
      );
      fetchGizmos(cat, openaiId, hasSub);

      const gizmoSearchInput = document.querySelector('#gizmo-search-input') as HTMLInputElement | null;
      if (gizmoSearchInput) {
        gizmoSearchInput.addEventListener(
          'input',
          debounce(() => {
            resetGizmoDiscoveryPageLocal('all', hasSub);
            const pill2 = document.querySelector('#gizmo-search-term-pill') as HTMLElement | null;
            const pillText = document.querySelector('#gizmo-search-term-pill-text') as HTMLElement | null;
            if (gizmoSearchInput.value.trim() !== '') {
              if (pillText) pillText.innerText = gizmoSearchInput.value.trim();
              pill2?.classList.remove('hidden');
            } else {
              if (pillText) pillText.innerText = '';
              pill2?.classList.add('hidden');
            }
            const activeBtn = document.querySelector('#gizmo-discovery-tabs button.btn-primary') as HTMLElement | null;
            if (activeBtn && activeBtn.id !== 'gizmo-discovery-all-tab') {
              activeBtn.classList.replace('btn-primary', 'btn-secondary');
              document.querySelector('#gizmo-discovery-all-tab')?.classList.replace('btn-secondary', 'btn-primary');
            }
            const searchVal = gizmoSearchInput.value;
            fetchGizmos('all', openaiId, hasSub, true, 1, null, searchVal);
          }, 500),
        );
      }
    });
  });

  return wrapper;
}

// -- Gizmo helper functions (local to this module) --

function showMoreCategories(openaiId: string, hasSub = false): void {
  const btn = document.querySelector('#gizmo-discovery-more_categories-tab') as HTMLElement | null;
  if (!btn) return;
  const { x, y } = btn.getBoundingClientRect();
  const existing = document.querySelector('#more-categories-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'more-categories-menu';
  menu.style.cssText = `position: fixed; left: 0px; top: 0px; transform: translate3d(${x + 45}px, ${y - 60}px, 0px); min-width: max-content; z-index: 100001;`;
  menu.className = 'bg-token-main-surface-secondary shadow-long rounded-2xl p-1';

  gizmoMoreCategories.forEach((gc: any) => {
    if (selectedGizmoCategoryId === gc.id) return;
    const item = document.createElement('button');
    item.id = `gizmo-discovery-${gc.id}-tab`;
    item.className =
      'block px-4 py-2 text-sm text-token-text-primary w-full text-start hover:bg-token-main-surface-tertiary rounded-xl';
    item.title = gc.description;
    item.innerHTML = gc.title;
    item.addEventListener('click', () => {
      setSelectedGizmoCategoryId(gc.id);
      resetGizmoDiscoveryPageLocal(gc.id, hasSub);
      fetchGizmos(gc.id, openaiId, hasSub);
      setActiveMoreCategoryTab(`gizmo-discovery-${gc.id}-tab`);
      closeMoreCategoriesMenu();
    });
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
}

function closeMoreCategoriesMenu(): void {
  const menu = document.querySelector('#more-categories-menu');
  if (menu) menu.remove();
}

function toggleGizmoSortByDropdown(val: any, openaiId: string, hasSub = false): void {
  setGizmoSortBy(val.code);
  const searchVal = (document.querySelector('#gizmo-search-input') as HTMLInputElement | null)?.value || '';
  fetchGizmos(selectedGizmoCategoryId, openaiId, hasSub, true, 1, null, searchVal);
}

function resetGizmoDiscoveryPageLocal(category: string, hasSub = false): void {
  const searchInput = document.querySelector('#gizmo-search-input') as HTMLInputElement | null;
  const sortWrapper = document.querySelector('#gizmo-sort-by-selector-wrapper') as HTMLElement | null;
  if (category === 'all' || (hasSub && !['pinned', 'recent', 'mine'].includes(category))) {
    if (sortWrapper) sortWrapper.style.display = 'block';
  } else {
    if (searchInput) searchInput.value = '';
    if (sortWrapper) sortWrapper.style.display = 'none';
    const pill = document.querySelector('#gizmo-search-term-pill') as HTMLElement | null;
    const pillText = document.querySelector('#gizmo-search-term-pill-text') as HTMLElement | null;
    if (pillText) pillText.innerText = '';
    pill?.classList.add('hidden');
  }
  setGizmoPageNumber(1);
  setGizmoCursor(null);
  setNoMoreGizmo(false);
}

function setActiveGizmoTab(tabId: string): void {
  const tabsContainer = document.querySelector('#gizmo-discovery-tabs');
  if (!tabsContainer) return;
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    if (btn.id === tabId) btn.classList.replace('btn-secondary', 'btn-primary');
    else btn.classList.replace('btn-primary', 'btn-secondary');
  });
}

function setActiveMoreCategoryTab(tabId: string): void {
  const tabsContainer = document.querySelector('#gizmo-discovery-tabs');
  if (!tabsContainer) return;
  tabsContainer.querySelectorAll('button').forEach((btn) => {
    btn.classList.replace('btn-primary', 'btn-secondary');
  });
  const moreBtn = document.querySelector('#gizmo-discovery-more_categories-tab') as HTMLElement | null;
  if (moreBtn) {
    moreBtn.classList.replace('btn-secondary', 'btn-primary');
    const prev = moreBtn.previousElementSibling;
    if (prev) {
      prev.classList.replace('btn-primary', 'btn-secondary');
    }
  }
}

// ---------------------------------------------------------------------------
// fetchPrompts
//
// Original: content.isolated.end.js line 20278
// ---------------------------------------------------------------------------

async function fetchPrompts(page = 1, forceRefresh = false): Promise<void> {
  const folder = getLastSelectedPromptFolder();
  if (!folder) return;
  const listEl = document.querySelector('#modal-manager #prompt-manager-prompt-list') as HTMLElement | null;
  if (!listEl) return;

  if (page === 1) {
    listEl.innerHTML = '';
    listEl.appendChild(loadingSpinner('prompt-manager-main-content'));
  }

  if (folder?.id === 'recent') {
    loadRecentPrompts();
    return;
  }

  const {
    selectedPromptsManagerSortBy: sortByPref = { name: 'Update date', code: 'updated_at' },
    selectedPromptsManagerTag: tagPref = { name: 'All', code: 'all' },
    selectedPromptsManagerLanguage: langPref = { name: 'All', code: 'all' },
  } = cachedSettings;

  let sortCode =
    folder?.id !== 'public' && ['vote', 'use'].includes(sortByPref?.code) ? 'created_at' : sortByPref?.code;

  if (sortCode !== sortByPref?.code) {
    const titleEl = document.querySelector('#modal-manager #selected-prompts-manager-sortby-title');
    if (titleEl) titleEl.textContent = 'Create date';
    const optionEl = document.querySelector('#modal-manager #prompts-manager-sortby-selector-option-created_at');
    const checkmark = document.querySelector('#modal-manager #prompts-manager-sortby-selector-checkmark');
    if (checkmark && optionEl) {
      checkmark.remove();
      optionEl.appendChild(checkmark);
    } else if (optionEl) {
      optionEl.insertAdjacentHTML(
        'beforeend',
        `<span id="prompts-manager-sortby-selector-checkmark" class="absolute inset-y-0 end-0 flex items-center pe-4 text-token-text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg>
        </span>`,
      );
    }
    chrome.storage.local.set({
      settings: {
        ...cachedSettings,
        selectedPromptsManagerSortBy: { code: 'created_at', name: 'Create date' },
      },
    });
  }

  const searchTerm = (
    document.querySelector('#modal-manager input[id="prompt-manager-search-input"]') as HTMLInputElement | null
  )?.value;

  chrome.runtime.sendMessage(
    {
      type: 'getPrompts',
      forceRefresh,
      detail: {
        pageNumber: page,
        searchTerm,
        sortBy: sortCode,
        language: langPref?.code,
        tag: tagPref.code,
        folderId: typeof folder?.id === 'string' ? null : folder?.id,
        isPublic: folder?.id === 'public',
        isFavorite: folder?.id === 'favorites',
        deepSearch: true,
      },
    },
    (data: any) => {
      const results = data?.results;
      if (!results) return;

      const loadMoreBtn = document.querySelector('#modal-manager #load-more-prompts-button');
      if (loadMoreBtn) loadMoreBtn.remove();
      const spinner = document.querySelector('#modal-manager #loading-spinner-prompt-manager-main-content');
      if (spinner) spinner.remove();

      if (results.length === 0 && page === 1) {
        listEl.appendChild(noPromptElement());
      } else {
        results.forEach((prompt: any) => {
          const card = createPromptCard(prompt);
          listEl.appendChild(card);
          addPromptCardEventListeners(card, prompt);
        });

        if (data.next) {
          const loadBtn = document.createElement('button');
          loadBtn.id = 'load-more-prompts-button';
          loadBtn.className = `bg-token-main-surface-secondary p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${cachedSettings.selectedPromptView === 'list' ? 'h-14' : 'h-auto aspect-1.5'} flex flex-col relative`;
          loadBtn.appendChild(loadingSpinner('load-more-prompts-button'));
          listEl.appendChild(loadBtn);

          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  fetchPrompts(page + 1, forceRefresh);
                  observer.disconnect();
                }
              });
            },
            { threshold: 0.5 },
          );
          if (loadBtn) observer.observe(loadBtn);
        }
      }
    },
  );
}

// ---------------------------------------------------------------------------
// promptManagerSidebarContent
//
// Original: content.isolated.end.js line 19759
// ---------------------------------------------------------------------------

export function promptManagerSidebarContent(): HTMLElement {
  const container = document.createElement('div');
  container.classList.add('relative', 'h-full');

  const title = document.createElement('div');
  title.className = 'text-lg p-4';
  title.innerText = translate('Categories');
  container.appendChild(title);

  const foldersEl = document.createElement('div');
  foldersEl.id = 'prompt-manager-sidebar-folders';
  foldersEl.className = 'px-2 pb-32 overflow-y-auto h-full';
  foldersEl.addEventListener('scroll', () => {
    const menu = document.querySelector('#modal-manager #prompt-manager-folder-menu');
    if (menu) menu.remove();
  });
  container.appendChild(foldersEl);
  foldersEl.appendChild(defaultPromptFoldersList());
  foldersEl.appendChild(loadingSpinner('prompt-manager-sidebar'));

  const { selectedPromptsManagerFoldersSortBy: folderSort = 'alphabetical' } = cachedSettings;

  chrome.runtime.sendMessage({ type: 'getPromptFolders', detail: { sortBy: folderSort } }, async (folders: any[]) => {
    if (!folders || !Array.isArray(folders)) return;
    const spinner = document.querySelector('#modal-manager #loading-spinner-prompt-manager-sidebar');
    if (spinner) spinner.remove();

    let selected = getLastSelectedPromptFolder();
    if (folders.length === 0) {
      foldersEl.appendChild(noPromptFolderElemet());
      if (!selected || !isDefaultPromptFolder(selected?.id?.toString())) {
        selectedPromptFolderBreadcrumb.splice(0, selectedPromptFolderBreadcrumb.length, defaultPromptFolders[0] as any);
        document
          .querySelector(`#modal-manager #prompt-folder-wrapper-${selectedPromptFolderBreadcrumb[0]?.id}`)
          ?.querySelector('div[id^="selected-prompt-folder-indicator-"]')
          ?.classList?.add('bg-black', 'dark:bg-white');
      }
    } else {
      if (
        !selected ||
        ![...defaultPromptFolders, ...folders]
          .map((f) => f.id.toString())
          .includes(selectedPromptFolderBreadcrumb?.[0]?.id?.toString())
      ) {
        selectedPromptFolderBreadcrumb.splice(0, selectedPromptFolderBreadcrumb.length, folders[0]);
      }
      folders.forEach((f: any) => {
        const el = promptFolderElement(f, true, true);
        if (el) foldersEl.appendChild(el);
      });
    }

    selected = getLastSelectedPromptFolder();
    chrome.storage.local.set({ selectedPromptFolderBreadcrumb });

    const breadcrumb = document.querySelector('#modal-manager #prompt-manager-breadcrumb') as HTMLElement | null;
    if (breadcrumb) generatePromptFolderBreadcrumb(breadcrumb);

    await fetchPrompts();
    throttleGetPromptSubFolders(selected?.id);
  });

  const bottomBar = document.createElement('div');
  bottomBar.className =
    'flex items-center justify-between absolute start-0 bottom-0 w-full bg-token-main-surface-secondary border-t border-token-border-medium px-2 h-10 z-10';
  container.appendChild(bottomBar);

  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'prompt-manager-sidebar-settings-button';
  settingsBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary';
  settingsBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="currentColor" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" fill="currentColor" viewBox="0 0 448 512"><path d="M0 88C0 74.75 10.75 64 24 64H424C437.3 64 448 74.75 448 88C448 101.3 437.3 112 424 112H24C10.75 112 0 101.3 0 88zM0 248C0 234.7 10.75 224 24 224H424C437.3 224 448 234.7 448 248C448 261.3 437.3 272 424 272H24C10.75 272 0 261.3 0 248zM424 432H24C10.75 432 0 421.3 0 408C0 394.7 10.75 384 24 384H424C437.3 384 448 394.7 448 408C448 421.3 437.3 432 424 432z"/></svg>';
  settingsBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    closeMenus();
    showPromptManagerSidebarSettingsMenu(settingsBtn);
  });
  bottomBar.appendChild(settingsBtn);

  const addBtn = document.createElement('button');
  addBtn.id = 'add-prompt-folder-button';
  addBtn.className =
    'flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary';
  addBtn.innerHTML =
    '<svg stroke="currentColor" fill="currentColor" stroke-width="2" viewBox="0 0 448 512" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"> <path d="M432 256C432 269.3 421.3 280 408 280h-160v160c0 13.25-10.75 24.01-24 24.01S200 453.3 200 440v-160h-160c-13.25 0-24-10.74-24-23.99C16 242.8 26.75 232 40 232h160v-160c0-13.25 10.75-23.99 24-23.99S248 58.75 248 72v160h160C421.3 232 432 242.8 432 256z"> </path> </svg>';
  addTooltip(addBtn, { value: 'Add New Folder', position: 'top' });

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    addBtn.addEventListener('click', () => {
      const noFolders = document.querySelector('#modal-manager #no-prompt-folders');
      if (noFolders) noFolders.remove();
      const existingFolders = document.querySelectorAll(
        '#modal-manager #prompt-manager-sidebar-folders > div[id^="prompt-folder-wrapper-"]',
      );
      if (!hasSub && existingFolders.length >= 5) {
        errorUpgradeConfirmation({
          type: 'limit',
          title: 'You have reached the limit',
          message:
            'You have reached the limits of Prompt Categories with free account. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: 'addPromptFolders',
          detail: { folders: [{ name: 'New Category', color: generateRandomDarkColor() }] },
        },
        (result: any) => {
          if (result.error && result.error.type === 'limit') {
            errorUpgradeConfirmation(result.error);
            return;
          }
          if (!result || result.length === 0) return;
          addNewPromptFolderElementToManagerSidebar(result[0]);
          document
            .querySelector(`#modal-manager #prompt-folder-wrapper-${result[0].id}`)
            ?.dispatchEvent(new Event('click', { bubbles: true }));
          handleRenamePromptFolderClick(result[0].id);
        },
      );
    });
  });
  bottomBar.appendChild(addBtn);

  container.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.querySelector('.folder-dragging')) {
      (ev as DragEvent).dataTransfer!.dropEffect = 'move';
      container.classList.add('prompt-sidebar-drag-hover');
    }
  });
  container.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.querySelector('.folder-dragging')) container.classList.remove('prompt-sidebar-drag-hover');
  });
  container.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resetPromptManagerSelection();
    if (!document.querySelector('.folder-dragging')) return;
    container.classList.remove('prompt-sidebar-drag-hover');
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
      movePromptFolder(f, 0);
    }
  });

  return container;
}

// ---------------------------------------------------------------------------
// createPinnedMessageCard
//
// Original: content.isolated.end.js line 19467
// ---------------------------------------------------------------------------

function createPinnedMessageCard(pm: any): HTMLElement {
  const card = document.createElement('div');
  card.id = `pinned-message-card-${pm.message_id}`;
  card.dataset.conversationId = pm.conversation.conversation_id;
  card.dataset.messageId = pm.message_id;
  card.className = `bg-token-main-surface-primary border border-token-border-medium p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${cachedSettings.selectedPinnedMessageView === 'list' ? 'aspect-2' : 'aspect-1'} flex flex-col h-auto`;
  card.style.cssText = 'height: max-content;outline-offset: 4px; outline: none;';
  card.innerHTML = `<div class="flex items-center justify-between border-b border-token-border-medium pb-1"><div class="text-sm text-token-text-tertiary whitespace-nowrap overflow-hidden text-ellipsis flex items-center w-full">${formatDate(new Date(pm.created_at))}</div>
  </div>
  <div class="flex-1 text-token-text-primary text-sm whitespace-wrap overflow-hidden text-ellipsis  break-all">${escapeHTML(pm.message.substring(0, 250))}</div>


  <div class="border-t border-token-border-medium flex justify-between items-center pt-1">

    <div class="flex items-center justify-between w-full">
      <a id="pinned-messaged-link-button-${pm.id}" href="/c/${pm.conversation.conversation_id}?mid=${pm.message_id}" target="_self" title="${isWindows() ? 'Ctrl' : '\u2318'} + Click to open in new tab" class="flex relative text-xs rounded-md hover:bg-token-sidebar-surface-tertiary text-token-link focus-visible:outline-0 focus-visible:bg-token-sidebar-surface-secondary no-underline" style="width: max-content;text-decoration-line: none !important; padding: 8px 4px !important;">${translate('open conversation')} </a>

      <div id="pinned-messaged-delete-button-${pm.id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-red focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md "><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>
      </div>

    </div>
  </div>`;

  card.addEventListener('click', () => {
    updateSelectedPinnedMessageCard(pm.message_id);
    showConversationPreviewWrapper(pm.conversation.conversation_id, pm.message_id);
  });

  return card;
}

// ---------------------------------------------------------------------------
// addPinnedMessageCardEventListeners
//
// Original: content.isolated.end.js line 19499
// ---------------------------------------------------------------------------

function addPinnedMessageCardEventListeners(pm: any): void {
  const linkBtn = document.querySelector(`#pinned-messaged-link-button-${pm.id}`);
  const deleteBtn = document.querySelector(`#pinned-messaged-delete-button-${pm.id}`);

  linkBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
  });

  deleteBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    showConfirmDialog(
      'Delete pinned message',
      'Are you sure you want to delete the selected pinned message?',
      'Cancel',
      'Delete',
      null,
      async () => {
        chrome.runtime.sendMessage({ type: 'deletePinnedMessage', detail: { messageId: pm.message_id } }, () => {
          document.querySelector(`#pinned-message-card-${pm.message_id}`)?.remove();
          const list = document.querySelector(
            '#modal-manager #pinned-message-manager-pinned-message-list',
          ) as HTMLElement | null;
          if (list && list.children.length === 0) {
            const noMsg = document.createElement('p');
            noMsg.id = 'no-pinned-messages-found';
            noMsg.style.cssText =
              'position:absolute;display: flex; justify-content: center; align-items: center; height: 340px; width: 100%;';
            noMsg.textContent = translate('No pinned messages found');
            list.appendChild(noMsg);
          }
        });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// pinnedMessageCardCompactViewButton
//
// Original: content.isolated.end.js line 19451
// ---------------------------------------------------------------------------

function pinnedMessageCardCompactViewButton(): HTMLElement {
  const { selectedPinnedMessageView: view } = cachedSettings;
  const btn = document.createElement('button');
  btn.className =
    'h-full aspect-1 flex items-center justify-center rounded-lg px-2 ms-2 text-token-text-tertiary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-secondary';
  btn.innerHTML =
    view === 'list'
      ? '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM206.4 335.1L152 394.9V56.02C152 42.76 141.3 32 128 32S104 42.76 104 56.02v338.9l-54.37-58.95c-4.719-5.125-11.16-7.719-17.62-7.719c-5.812 0-11.66 2.094-16.28 6.375c-9.75 8.977-10.34 24.18-1.344 33.94l95.1 104.1c9.062 9.82 26.19 9.82 35.25 0l95.1-104.1c9-9.758 8.406-24.96-1.344-33.94C230.5 325.5 215.3 326.2 206.4 335.1z"/></svg>'
      : '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM145.6 39.37c-9.062-9.82-26.19-9.82-35.25 0L14.38 143.4c-9 9.758-8.406 24.96 1.344 33.94C20.35 181.7 26.19 183.8 32 183.8c6.469 0 12.91-2.594 17.62-7.719L104 117.1v338.9C104 469.2 114.8 480 128 480s24-10.76 24-24.02V117.1l54.37 58.95C215.3 185.8 230.5 186.5 240.3 177.4C250 168.4 250.6 153.2 241.6 143.4L145.6 39.37z"/></svg>';

  btn.addEventListener('click', () => {
    document.querySelectorAll('#modal-manager div[id^="pinned-message-card-"]').forEach((el) => {
      if (cachedSettings.selectedPinnedMessageView === 'list') {
        el.classList.remove('aspect-2');
        el.classList.add('aspect-1');
      } else {
        el.classList.remove('aspect-1');
        el.classList.add('aspect-2');
      }
    });
    if (cachedSettings.selectedPinnedMessageView === 'list') {
      btn.innerHTML =
        '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM145.6 39.37c-9.062-9.82-26.19-9.82-35.25 0L14.38 143.4c-9 9.758-8.406 24.96 1.344 33.94C20.35 181.7 26.19 183.8 32 183.8c6.469 0 12.91-2.594 17.62-7.719L104 117.1v338.9C104 469.2 114.8 480 128 480s24-10.76 24-24.02V117.1l54.37 58.95C215.3 185.8 230.5 186.5 240.3 177.4C250 168.4 250.6 153.2 241.6 143.4L145.6 39.37z"/></svg>';
    } else {
      btn.innerHTML =
        '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM206.4 335.1L152 394.9V56.02C152 42.76 141.3 32 128 32S104 42.76 104 56.02v338.9l-54.37-58.95c-4.719-5.125-11.16-7.719-17.62-7.719c-5.812 0-11.66 2.094-16.28 6.375c-9.75 8.977-10.34 24.18-1.344 33.94l95.1 104.1c9.062 9.82 26.19 9.82 35.25 0l95.1-104.1c9-9.758 8.406-24.96-1.344-33.94C230.5 325.5 215.3 326.2 206.4 335.1z"/></svg>';
    }
    chrome.storage.local.set({
      settings: {
        ...cachedSettings,
        selectedPinnedMessageView: cachedSettings.selectedPinnedMessageView === 'list' ? 'grid' : 'list',
      },
    });
  });

  return btn;
}

// ---------------------------------------------------------------------------
// createNewsletterCard
//
// Original: content.isolated.end.js line 14634
// ---------------------------------------------------------------------------

function createNewsletterCard(newsletter: any, isRead = false): HTMLElement {
  const releaseDate = new Date(newsletter.release_date);
  const adjustedDate = new Date(releaseDate.getTime() + releaseDate.getTimezoneOffset() * 60000);

  const card = document.createElement('div');
  card.id = `newsletter-card-${newsletter.id}`;
  card.className = `relative bg-token-main-surface-primary border border-token-border-medium rounded-md cursor-pointer hover:bg-token-main-surface-tertiary flex flex-col h-auto ${isRead ? 'opacity-50' : ''}`;
  card.style.cssText = 'height: max-content;outline-offset: 4px; outline: none;';
  card.innerHTML = `<div class="flex flex-col items-start justify-between border-b border-token-border-medium pb-1 flex-grow">

  <figure class="h-full overflow-hidden w-full"><img loading="eager" src="${newsletter.thumbnail_url || 'https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto,onerror=redirect,quality=80/uploads/publication/logo/99fb7747-3ebe-4c53-9e43-47a744e8fa86/thumb_logo-bg.png'}" alt="${newsletter.title}" class="rounded-t-md w-full h-full object-cover" style="max-height:150px;"></figure>

  <div class="flex items-start w-full break-all text-md p-2" style="min-height:100px;">${escapeHTML(newsletter.title)}</div>
  </div>
  <div class="flex justify-between items-center p-2">
    <div class="flex items-center text-xs text-token-text-tertiary">
      ${adjustedDate.toDateString()}
    </div>
    <div id="newsletter-card-action-right-${newsletter.id}" class="flex items-center">
      <div class="flex items-center text-xs ${isRead ? 'visible' : 'invisible'}" id="newsletter-read-indicator">Read <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="icon icon-sm ms-2"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg></div>
    </div>
  </div>`;

  card.addEventListener('click', (ev) => {
    ev.preventDefault();
    closeMenus();
    updateSelectedNewsletterCard(newsletter.id);
    chrome.runtime.sendMessage({ type: 'getNewsletter', detail: { id: newsletter.id } }, (fullNewsletter: any) => {
      createAnnouncementModal(fullNewsletter);
      chrome.storage.local.get(['readNewsletterIds'], (result) => {
        const readIds: string[] = result.readNewsletterIds || [];
        if (!readIds.includes(newsletter.id)) {
          chrome.runtime.sendMessage({
            type: 'incrementOpenRate',
            forceRefresh: true,
            detail: { announcementId: newsletter.id },
          });
        }
        chrome.storage.local.set({ readNewsletterIds: [newsletter.id, ...readIds.slice(0, 100)] }, () => {
          const cardEl = document.querySelector(`#newsletter-card-${newsletter.id}`) as HTMLElement | null;
          if (cardEl) {
            cardEl.classList.add('opacity-50');
            if (cardEl.querySelector('#ping')) {
              cardEl.querySelector('#ping')?.remove();
              const sideTab = document.querySelector('#modal-manager-side-tab-newsletters');
              sideTab?.querySelector('#ping')?.remove();
            }
            cardEl.querySelector('#newsletter-read-indicator')?.classList?.replace('invisible', 'visible');
          }
        });
      });
    });
  });

  return card;
}

// ---------------------------------------------------------------------------
// profileCardCompactViewButton
//
// Original: content.isolated.end.js line 16324
// ---------------------------------------------------------------------------

function profileCardCompactViewButton(): HTMLElement {
  const { selectedProfileView: view } = cachedSettings;
  const btn = document.createElement('button');
  btn.className =
    'h-10 aspect-1 flex items-center justify-center rounded-lg px-2 ms-2 text-token-text-tertiary focus-visible:outline-0 bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-secondary';
  btn.innerHTML =
    view === 'list'
      ? '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM206.4 335.1L152 394.9V56.02C152 42.76 141.3 32 128 32S104 42.76 104 56.02v338.9l-54.37-58.95c-4.719-5.125-11.16-7.719-17.62-7.719c-5.812 0-11.66 2.094-16.28 6.375c-9.75 8.977-10.34 24.18-1.344 33.94l95.1 104.1c9.062 9.82 26.19 9.82 35.25 0l95.1-104.1c9-9.758 8.406-24.96-1.344-33.94C230.5 325.5 215.3 326.2 206.4 335.1z"/></svg>'
      : '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM145.6 39.37c-9.062-9.82-26.19-9.82-35.25 0L14.38 143.4c-9 9.758-8.406 24.96 1.344 33.94C20.35 181.7 26.19 183.8 32 183.8c6.469 0 12.91-2.594 17.62-7.719L104 117.1v338.9C104 469.2 114.8 480 128 480s24-10.76 24-24.02V117.1l54.37 58.95C215.3 185.8 230.5 186.5 240.3 177.4C250 168.4 250.6 153.2 241.6 143.4L145.6 39.37z"/></svg>';

  btn.addEventListener('click', () => {
    document.querySelectorAll('#modal-manager div[id^="custom-instruction-profile-card-"]').forEach((el) => {
      if (cachedSettings.selectedProfileView === 'list') {
        el.classList.remove('aspect-2');
        el.classList.add('aspect-1');
      } else {
        el.classList.remove('aspect-1');
        el.classList.add('aspect-2');
      }
    });
    if (cachedSettings.selectedProfileView === 'list') {
      btn.innerHTML =
        '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM145.6 39.37c-9.062-9.82-26.19-9.82-35.25 0L14.38 143.4c-9 9.758-8.406 24.96 1.344 33.94C20.35 181.7 26.19 183.8 32 183.8c6.469 0 12.91-2.594 17.62-7.719L104 117.1v338.9C104 469.2 114.8 480 128 480s24-10.76 24-24.02V117.1l54.37 58.95C215.3 185.8 230.5 186.5 240.3 177.4C250 168.4 250.6 153.2 241.6 143.4L145.6 39.37z"/></svg>';
    } else {
      btn.innerHTML =
        '<svg fill="currentColor" class="icon icon-md" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M320 192h96c17.6 0 32-14.4 32-32V64c0-17.6-14.4-32-32-32h-96c-17.6 0-32 14.4-32 32v96C288 177.6 302.4 192 320 192zM336 80h64v64h-64V80zM480 256h-160c-17.67 0-32 14.33-32 32v160c0 17.67 14.33 32 32 32h160c17.67 0 32-14.33 32-32V288C512 270.3 497.7 256 480 256zM464 432h-128v-128h128V432zM206.4 335.1L152 394.9V56.02C152 42.76 141.3 32 128 32S104 42.76 104 56.02v338.9l-54.37-58.95c-4.719-5.125-11.16-7.719-17.62-7.719c-5.812 0-11.66 2.094-16.28 6.375c-9.75 8.977-10.34 24.18-1.344 33.94l95.1 104.1c9.062 9.82 26.19 9.82 35.25 0l95.1-104.1c9-9.758 8.406-24.96-1.344-33.94C230.5 325.5 215.3 326.2 206.4 335.1z"/></svg>';
    }
    chrome.storage.local.set({
      settings: {
        ...cachedSettings,
        selectedProfileView: cachedSettings.selectedProfileView === 'list' ? 'grid' : 'list',
      },
    });
  });

  return btn;
}

// ---------------------------------------------------------------------------
// createAnnouncementModal
//
// Original: content.isolated.end.js line 14420
// ---------------------------------------------------------------------------

export function createAnnouncementModal(data: any, email = ''): void {
  const content = announcementModalContent(data, email);
  const actions = announcementModalActions(data);
  const modalTitle = titleMap[data.category] || data.category || '';
  const modalSubtitle = subtitleMap[data.category] || '';
  const releaseDate = new Date(data.release_date);
  const adjustedDate = new Date(releaseDate.getTime() + releaseDate.getTimezoneOffset() * 60000);
  const subtitle = `${modalSubtitle} (${adjustedDate.toDateString()}${data.link ? ` - <a href="${data.link}" target="_blank" rel="noopener noreferrer" class="underline">Read Online</a>` : ''})`;
  createModal(modalTitle, subtitle, content, actions, true);
}

function announcementModalContent(data: any, email = ''): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = `modal-content-${data.category}`;
  wrapper.tabIndex = 0;
  wrapper.style.cssText = 'position:relative;height:100%;overflow-y:auto;';
  wrapper.className = 'markdown prose-invert';

  const base = document.createElement('base');
  base.target = '_blank';
  wrapper.appendChild(base);

  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icons/logo.png');
  logo.style.cssText =
    'position: fixed; top: 50%; right: 50%; width: 400px; height: 400px; opacity: 0.07; transform: translate(50%, -50%);box-shadow:none !important;';
  wrapper.appendChild(logo);

  const article = document.createElement('article');
  article.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start; min-height: 100%; width: 100%; white-space: break-spaces; overflow-wrap: break-word;position: relative;z-index:10;';

  const text = data.text.replace(/href="([^"]*)"/g, 'href="$1?ref=council-extension"').replace(/\{\{email\}\}/g, email);

  article.innerHTML =
    data.category === 'newsletter' ? text : `<h1 style="margin-bottom: 24px; ">${data.title}</h1>${data.text}`;
  wrapper.appendChild(article);

  wrapper.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'incrementClickRate',
      forceRefresh: true,
      detail: { announcementId: data.id },
    });
  });

  return wrapper;
}

function announcementModalActions(data: any): HTMLElement {
  const container = document.createElement('div');
  container.className = 'flex items-center justify-between mt-3 w-full';

  if (data.category === 'newsletter') {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'hide-newsletter-checkbox';
    checkbox.className = 'me-2 cursor-pointer w-3 h-3';
    checkbox.checked = cachedSettings?.hideNewsletter || false;
    checkbox.addEventListener('change', (ev) => {
      chrome.storage.local.set({
        settings: { ...cachedSettings, hideNewsletter: (ev.target as HTMLInputElement).checked },
      });
    });

    const label = document.createElement('label');
    label.htmlFor = 'hide-newsletter-checkbox';
    label.textContent = 'Don\u2019t show me this newsletter again';
    label.className = 'text-xs text-token-text-secondary';

    const row = document.createElement('div');
    row.className = 'flex items-center justify-start';
    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);
  }

  return container;
}

// ---------------------------------------------------------------------------
// openInviteUserModal
//
// Original: content.isolated.end.js line 21268
// ---------------------------------------------------------------------------

function openInviteUserModal(): void {
  const existing = document.querySelector('#invite-user-dialog');
  if (existing) existing.remove();

  const html = `<div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
    <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
      <div id="invite-user-dialog-content" role="dialog" data-state="open" class="relative col-auto col-start-2 row-auto row-start-2 w-full rounded-xl text-start shadow-xl transition-all start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 bg-token-sidebar-surface-primary max-w-xl border-token-border-medium border" tabindex="-1" style="pointer-events: auto;">
        <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
          <div class="flex">
            <div class="flex items-center">
              <div class="flex grow flex-col gap-1">
                <h2 as="h3" class="text-lg font-medium leading-6 text-token-text-tertiary">Invite A Friend</h2>
              </div>
            </div>
          </div>
        </div>
        <div class="p-4">
          <div class="text-sm text-token-text-primary">Please enter their email address</div>
          <div class="mt-2">
            <input id="invite-email-input" type="email" placeholder="Enter email address" class="p-2 rounded-md border border-token-border-medium bg-token-main-surface-primary text-token-text-primary w-full" />
          </div>
          <div class="mt-5">
            <div class="mt-5 flex justify-between">
              <div class="flex flex-row-reverse gap-3 ms-auto">
                <button id="confirm-button" class="btn relative btn-success text-white" as="button">
                  <div class="flex w-full gap-2 items-center justify-center">Send invite</div>
                </button>
                <button id="cancel-button" class="btn relative btn-secondary" as="button">
                  <div class="flex w-full gap-2 items-center justify-center">Cancel</div>
                </button>
              </div>
            </div>
            <div class="w-full flex mt-2 text-token-text-tertiary text-xs">
              <div>
                * Invite will only be sent if the email address is not already registered with the service.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;

  const dialog = document.createElement('div');
  dialog.id = 'invite-user-dialog';
  dialog.className = 'absolute inset-0';
  dialog.style.zIndex = '100101';
  dialog.innerHTML = html;
  document.body.appendChild(dialog);

  const emailInput = document.querySelector('#invite-user-dialog #invite-email-input') as HTMLInputElement;
  const confirmBtn = document.querySelector('#invite-user-dialog #confirm-button') as HTMLElement;
  const cancelBtn = document.querySelector('#invite-user-dialog #cancel-button') as HTMLElement;

  confirmBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();
    if (document.querySelector('#invite-user-dialog #confirm-button')?.querySelector('#progress-spinner')) return;

    if (!emailInput.value || !emailInput.value.includes('@')) {
      toast('Please enter a valid Email address', 'error');
      return;
    }

    chrome.runtime.sendMessage(
      { type: 'sendInvite', detail: { email: emailInput.value.trim() } },
      async (response: any) => {
        if (response.success) {
          const content = document.querySelector('#modal-content-invite-manager');
          if (content) {
            const item = document.createElement('div');
            item.className =
              'flex items-center justify-between p-4 bg-token-sidebar-surface-secondary rounded-lg shadow-md';
            item.innerHTML = `
            <p class="font-semibold w-1/2">${emailInput.value.trim()}</p>
            <p class="text-sm py-1 px-4 rounded-full" style="background-color:${statusMap.invited?.color || '#999'}">${statusMap.invited?.title || 'Invited'}</p>
            <p class="text-gray-500 text-sm">Last update: ${new Date().toLocaleString()}</p>
          `;
            const noInvites = document.querySelector('#no-invites-found');
            if (noInvites) {
              noInvites.remove();
              const list = document.createElement('div');
              list.id = 'invite-list';
              list.className = 'flex flex-col gap-4 w-full overflow-y-auto p-4';
              content.appendChild(list);
            }
            content.querySelector('#invite-list')?.insertAdjacentElement('afterbegin', item);
          }
        }
        toast(response.message, response.success ? 'success' : 'error');
      },
    );
    dialog.remove();
  });

  cancelBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenus();
    if (!document.querySelector('#invite-user-dialog #confirm-button')?.querySelector('#progress-spinner')) {
      dialog.remove();
    }
  });

  dialog.addEventListener('click', (ev) => {
    if (document.querySelector('#invite-user-dialog #confirm-button')?.querySelector('#progress-spinner')) return;
    const dialogContent = document.querySelector('#invite-user-dialog-content');
    if (!isDescendant(dialogContent, ev.target)) dialog.remove();
  });
}

// ---------------------------------------------------------------------------
// addToggleButtonToArticle (singular) + addArticleToggleButtonEventListener
//
// Original: content.isolated.end.js lines 15373-15401
// Adds a collapse/expand toggle button to an individual article (message).
// ---------------------------------------------------------------------------

/**
 * Add (or refresh) a visibility toggle button on a single chat article.
 * Called by `addToggleButtonToArticles` for each `<article>` in the
 * conversation.
 *
 * @param article  The `<article>` DOM element for the message.
 * @param _index   The zero-based position of the article in the list.
 * @param visibility  `"visible"` or `"hidden"` -- desired initial state.
 */
export function addToggleButtonToArticle(article: HTMLElement, _index: number, visibility = 'visible'): void {
  if (!article) return;

  const copyBtn = article.querySelector('button[data-testid="copy-turn-action-button"]');
  if (!copyBtn) return;

  const existingToggle = article.querySelector(
    'button[data-testid="toggle-message-turn-action-button"]',
  ) as HTMLButtonElement | null;

  if (existingToggle) {
    // If the button already exists, check whether the state needs updating.
    const convId = getConversationIdFromUrl();
    const storedState = JSON.parse(window.localStorage.getItem('sp/allMessagesToggleState') || 'null') || {
      convId,
      state: 'visible',
    };

    const currentState = article.querySelector('div')?.lastElementChild?.classList.contains(hiddenArticleClass)
      ? 'hidden'
      : 'visible';

    if (currentState === visibility || storedState.state === 'hidden') return;
  }

  const turnId = article?.dataset?.turnId ?? '';

  const btnHtml =
    visibility === 'visible'
      ? `<button class="${copyBtn.classList} absolute" aria-label="Toggle message" data-testid="toggle-message-turn-action-button" data-turn-id="${turnId}"><span class="touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center">${messageHideIconSmall}</span></button>`
      : `<button class="${copyBtn.classList} relative" aria-label="Toggle message" data-testid="toggle-message-turn-action-button" data-turn-id="${turnId}"><span class="touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center">${messageShowIconSmall}</span></button>`;

  article.querySelector('div')?.insertAdjacentHTML('afterbegin', btnHtml);
  if (existingToggle) existingToggle.remove();

  const newToggle = article.querySelector(
    'button[data-testid="toggle-message-turn-action-button"]',
  ) as HTMLButtonElement;

  addTooltip(newToggle, {
    value: () =>
      newToggle.closest('article')?.querySelector('div')?.lastElementChild?.classList.contains(hiddenArticleClass)
        ? 'Show'
        : 'Hide',
    position: 'right',
  });

  addArticleToggleButtonEventListener(article, newToggle);

  if (visibility === 'hidden') {
    article.querySelector('div')?.lastElementChild?.classList.add(hiddenArticleClass);
  } else {
    article.querySelector('div')?.lastElementChild?.classList.remove(hiddenArticleClass);
  }
}

/**
 * Wire up the click handler on a single article's toggle button.
 *
 * Original: content.isolated.end.js line 15396
 */
function addArticleToggleButtonEventListener(article: HTMLElement, toggleBtn: HTMLButtonElement): void {
  toggleBtn?.addEventListener('click', async () => {
    const btn = article.querySelector(
      'button[data-testid="toggle-message-turn-action-button"]',
    ) as HTMLButtonElement | null;
    if (!btn) return;

    const lastChild = article.querySelector('div')?.lastElementChild;

    if (lastChild?.classList.contains(hiddenArticleClass)) {
      // Show
      lastChild.classList.remove(hiddenArticleClass);
      btn.classList.replace('relative', 'absolute');
      btn.innerHTML = `<span class="touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center">${messageHideIconSmall}</span>`;
    } else {
      // Hide
      lastChild?.classList.add(hiddenArticleClass);
      btn.classList.replace('absolute', 'relative');
      btn.innerHTML = `<span class="touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center">${messageShowIconSmall}</span>`;
    }
  });
}

// ---------------------------------------------------------------------------
// addToggleButtonToArticles
//
// Original: content.isolated.end.js line 15403
// ---------------------------------------------------------------------------

function addToggleButtonToArticles(reset = false, isNew = false): void {
  const {
    autoHideOldMessages,
    autoHideOldMessagesThreshold: threshold,
    autoHideOldMessagesRecent: recent,
    showMessageVisibilityToggleButtons: showToggle,
  } = cachedSettings;

  if (!showToggle && !autoHideOldMessages) {
    document.querySelectorAll('button[data-testid="toggle-message-turn-action-button"]').forEach((btn) => {
      const article = btn.closest('article');
      if (article) {
        btn.remove();
        article.querySelector('div')?.lastElementChild?.classList?.remove(hiddenArticleClass);
      }
    });
    const toggleAll = document.querySelector('#toggle-all-messages-button');
    if (toggleAll) toggleAll.remove();
    return;
  }

  const toggleCount = document.querySelectorAll(
    'article button[data-testid="toggle-message-turn-action-button"]',
  ).length;
  const copyCount = document.querySelectorAll('button[data-testid="copy-turn-action-button"]').length;
  const articles = document.querySelectorAll('main article');
  if (articles.length === 0) return;

  if (toggleCount === copyCount && !reset) return;

  articles.forEach((article, index) => {
    if (isNew) {
      const currentState = article.querySelector('div')?.lastElementChild?.classList?.contains(hiddenArticleClass)
        ? 'hidden'
        : 'visible';
      if (
        article.querySelector('button[data-testid="toggle-message-turn-action-button"]') &&
        currentState !== 'visible'
      )
        return;
    }
    const visibility =
      autoHideOldMessages && articles.length > threshold && index < articles.length - recent ? 'hidden' : 'visible';
    addToggleButtonToArticle(article as HTMLElement, index, visibility);
  });
}

// ---------------------------------------------------------------------------
// setConversationWidth
//
// Original: content.isolated.end.js line 21456
// ---------------------------------------------------------------------------

function setConversationWidth(width: number): void {
  if (!cachedSettings.customConversationWidth) {
    resetConversationWidth();
    return;
  }
  if (document.querySelectorAll('main article').length === 0 && !isOnNewChatPage()) return;

  Array.from(
    document.querySelectorAll(
      '[class*="[--thread-content-max-width:40rem]"], [class*="[--thread-content-max-width:32rem]"], [class*="agent-turn"]',
    ),
  ).forEach((el) => {
    new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setConversationWidthForElement(entry.target as HTMLElement, width);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0 },
    ).observe(el);
  });
}

function setConversationWidthForElement(el: HTMLElement, width: number): void {
  if (el.closest('div[data-paragen-root="true"]')) return;
  el.style.maxWidth = `${width}%`;
  el.style.marginLeft = 'auto';
  el.style.marginRight = 'auto';
  el.classList.remove('[width:min(90cqw,var(--thread-content-max-width))]');
  el.parentElement?.classList.remove('mx-auto');
}

// ---------------------------------------------------------------------------
// resetConversationWidth
//
// Original: content.isolated.end.js line 21486
// ---------------------------------------------------------------------------

function resetConversationWidth(): void {
  if (document.querySelectorAll('main article').length === 0 && !isOnNewChatPage()) return;
  Array.from(
    document.querySelectorAll(
      '[class*="[--thread-content-max-width:40rem]"], [class*="[--thread-content-max-width:32rem]"], [class*="agent-turn"]',
    ),
  ).forEach((el) => {
    (el as HTMLElement).style.removeProperty('max-width');
    (el as HTMLElement).style.removeProperty('margin-left');
    (el as HTMLElement).style.removeProperty('margin-right');
    el.classList.add('[width:min(90cqw,var(--thread-content-max-width))]');
    el.parentElement?.classList.add('mx-auto');
  });
}

// ---------------------------------------------------------------------------
// Toggle helpers for conversation settings
//
// Original: content.isolated.end.js lines 21456-21884
// ---------------------------------------------------------------------------

function toggleCustomWidthSwitch(enabled: boolean): void {
  const widthInput = document.querySelector('#conversation-width-input') as HTMLInputElement | null;
  const widthDetail = document.querySelector('#conversation-width-detail') as HTMLElement | null;
  if (!widthInput || !widthDetail) return;
  widthInput.disabled = !enabled;
  if (enabled) {
    setConversationWidth(cachedSettings.conversationWidth);
    widthDetail.className =
      'flex flex-row justify-start items-center w-full pb-2 text-token-text-secondary opacity-100';
    widthDetail.style.cssText = 'border-bottom: 1px solid #333;';
  } else {
    resetConversationWidth();
    widthDetail.className = 'flex flex-row justify-start items-center w-full pb-2 text-token-text-secondary opacity-50';
    widthDetail.style.cssText = 'border-bottom: 1px solid #555; pointer-events: none;';
  }
}

function toggleAutoDelete(enabled: boolean): void {
  const details = document.querySelector('#auto-delete-details') as HTMLElement | null;
  const input = document.querySelector('#auto-delete-input') as HTMLInputElement | null;
  const excludeInput = document.querySelector('#auto-delete-exclude-folders-input') as HTMLInputElement | null;
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

function toggleAutoHideOldMessages(enabled: boolean): void {
  const thresholdInput = document.querySelector('#auto-hide-old-messages-threshold-input') as HTMLInputElement | null;
  const recentInput = document.querySelector('#auto-hide-old-messages-recent-input') as HTMLInputElement | null;
  const thresholdDetails = document.querySelector('#auto-hide-old-messages-threshold-details') as HTMLElement | null;
  const recentDetails = document.querySelector('#auto-hide-old-messages-recent-details') as HTMLElement | null;

  if (thresholdInput && recentInput) {
    if (enabled) {
      if (thresholdDetails) thresholdDetails.style.opacity = '1';
      if (recentDetails) recentDetails.style.opacity = '1';
      thresholdInput.disabled = false;
      recentInput.disabled = false;
      addEyeButtonToFloatingButtons();
      const visibilitySwitch = document.querySelector(
        '#switch-show-message-visibility-toggle-buttons',
      ) as HTMLInputElement | null;
      if (visibilitySwitch && !visibilitySwitch.checked) visibilitySwitch.click();
    } else {
      if (thresholdDetails) thresholdDetails.style.opacity = '0.5';
      if (recentDetails) recentDetails.style.opacity = '0.5';
      thresholdInput.disabled = true;
      recentInput.disabled = true;
    }
  }
  addToggleButtonToArticles(true);
}

function toggleMessageVisibilityToggleButtonsSwitch(enabled: boolean): void {
  if (enabled) {
    addEyeButtonToFloatingButtons();
  } else {
    const autoHideSwitch = document.querySelector('#switch-auto-hide-messages') as HTMLInputElement | null;
    if (autoHideSwitch && autoHideSwitch.checked) autoHideSwitch.click();
  }
  addToggleButtonToArticles(true);
}

function toggleSidebarNoteVisibilitySwitch(enabled: boolean): void {
  const btn = document.querySelector('#sidebar-note-button');
  if (btn) {
    if (enabled) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
  }
}

function toggleShowDateDividersInConversation(enabled: boolean): void {
  if (enabled) {
    addDateDividersInConversation();
    toast('Date dividers added in conversation!', 'success', 2000);
  } else {
    removeDateDividersInConversation();
    toast('Date dividers removed from conversation!', 'success', 2000);
  }
}

function toggleOverrideModelSwitcher(enabled: boolean): void {
  if (enabled) {
    overrideModelSwitchers();
    toast('Model switchers overridden!', 'success', 2000);
  } else {
    resetModelSwitchers();
    toast('Model switchers reset!', 'success', 2000);
  }
}

function toggleShowMessageCharWordCount(enabled: boolean): void {
  if (enabled) {
    addMessageCharWordCounters();
    toast('Character and word count added to messages!', 'success', 2000);
  } else {
    removeMessageCharWordCounters();
    toast('Character and word count removed from messages!', 'success', 2000);
  }
}

function toggleShowMessageTimestamp(enabled: boolean): void {
  if (enabled) {
    addMessageTimestamps();
    toast('Timestamps added to messages!', 'success', 2000);
  } else {
    removeMessageTimestamps();
    toast('Timestamps removed from messages!', 'success', 2000);
  }
}

function toggleShowMiniMap(enabled: boolean): void {
  if (enabled) {
    createConversationMiniMap(true);
  } else {
    const wrapper = document.querySelector('#minimap-wrapper');
    if (wrapper) wrapper.remove();
    articleObservers?.forEach((o) => o.disconnect());
  }
}

function toggleShowLanguageSelector(enabled: boolean): void {
  const wrapper = document.querySelector('#language-selector-wrapper') as HTMLElement | null;
  if (wrapper) {
    if (enabled) {
      wrapper.style.display = 'block';
    } else {
      wrapper.style.display = 'none';
      chrome.storage.local.set({
        settings: { ...cachedSettings, selectedLanguage: 'default' },
      });
    }
  }
}

function toggleShowWritingStyleSelector(enabled: boolean): void {
  const wrapper = document.querySelector('#writing-style-selector-wrapper') as HTMLElement | null;
  if (wrapper) {
    if (enabled) {
      wrapper.style.display = 'block';
    } else {
      wrapper.style.display = 'none';
      chrome.storage.local.set({
        settings: { ...cachedSettings, selectedWritingStyle: 'default' },
      });
    }
  }
}

function toggleShowToneSelector(enabled: boolean): void {
  const wrapper = document.querySelector('#tone-selector-wrapper') as HTMLElement | null;
  if (wrapper) {
    if (enabled) {
      wrapper.style.display = 'block';
    } else {
      wrapper.style.display = 'none';
      chrome.storage.local.set({
        settings: { ...cachedSettings, selectedTone: 'default' },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Toggle helpers for folder settings
//
// Original: content.isolated.end.js lines 21903-21910
// ---------------------------------------------------------------------------

function toggleSidebarFolderVisibilitySwitch(enabled: boolean): void {
  const btn = document.querySelector('#sidebar-folder-button');
  if (btn) {
    if (enabled) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Toggle helpers for prompt-input settings
//
// Original: content.isolated.end.js lines 21998-22013
// ---------------------------------------------------------------------------

function toggleMemoryTogglesInInputVisibility(enabled: boolean): void {
  const wrapper = document.querySelector('#memory-toggles-wrapper');
  if (wrapper) {
    if (enabled) addMemoryTogglesToPromptInput();
    else wrapper.remove();
  }
}

function toggleRerunLastPromptChainButtonVisibility(enabled: boolean): void {
  if (!enabled) {
    const wrapper = document.querySelector('#rerun-prompt-chain-wrapper');
    if (wrapper) wrapper.remove();
  }
}

function togglePromptRewriterButtonInInputVisibility(enabled: boolean): void {
  const btn = document.querySelector('#prompt-rewrite-button');
  if (btn) {
    if (enabled) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
  }
}

function toggleFavoritePromptsButtonVisibility(enabled: boolean): void {
  if (enabled) {
    initializeContinueButton(true);
  } else {
    document.querySelector('#continue-conversation-button-wrapper')?.remove();
  }
}

function toggleCustomInstructionProfileSelectorVisibility(enabled: boolean): void {
  if (enabled) {
    initializeCustomInstructionProfileSelector(true);
  } else {
    document.querySelector('#custom-instruction-profile-selector-wrapper')?.remove();
  }
}

// ---------------------------------------------------------------------------
// Toggle helpers for splitter settings
//
// Original: content.isolated.end.js lines 22072-22101
// ---------------------------------------------------------------------------

function toggleAutoSummarizerSwitch(enabled: boolean): void {
  if (enabled) {
    refreshPage();
  } else {
    const autoSummarizeSwitch = document.querySelector('#switch-auto-summarize') as HTMLInputElement | null;
    if (autoSummarizeSwitch && autoSummarizeSwitch.checked) {
      autoSummarizeSwitch.checked = false;
      chrome.storage.local.set(
        {
          settings: { ...cachedSettings, autoSummarize: false },
        },
        () => {
          refreshPage();
        },
      );
    } else {
      refreshPage();
    }
  }
}

function updateAutoSplitPrompt(enabled: boolean): void {
  const noSummary = `Reply with OK: [CHUNK x/TOTAL]\nDon't reply with anything else!`;
  const withSummary = `Reply with OK: [CHUNK x/TOTAL]\nSummary: A short summary of the last chunk. Keep important facts and names in the summary. Don't reply with anything else!`;

  chrome.storage.local.set(
    {
      settings: { ...cachedSettings, autoSplitChunkPrompt: enabled ? withSummary : noSummary },
    },
    () => {
      const textarea = document.querySelector('#split-chunk-prompt-textarea') as HTMLTextAreaElement | null;
      if (textarea) textarea.value = enabled ? withSummary : noSummary;
      refreshPage();
    },
  );
}

// ---------------------------------------------------------------------------
// generalTabContent
//
// Original: content.isolated.end.js line 21413
// ---------------------------------------------------------------------------

function generalTabContent(_hasSub = false): HTMLElement {
  const container = document.createElement('div');
  container.id = 'settings-modal-tab-content';
  container.style.cssText =
    'display: flex; justify-content: start; align-items: start;overflow-y: auto; width:100%; padding: 16px; height: 100%;padding-bottom:80px;';

  const leftCol = document.createElement('div');
  leftCol.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start; width: 50%;padding-right: 8px;';

  const rightCol = document.createElement('div');
  rightCol.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: end; width: 50%;padding-left: 8px;';

  // Dark mode switch
  const darkModeSection = document.createElement('div');
  darkModeSection.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start; width: 100%; padding: 8px 0;border-bottom: 1px solid #333;';
  const darkModeRow = document.createElement('div');
  darkModeRow.style.cssText =
    'display: flex; flex-direction: row; justify-content: start; align-items: center; width: 100%; margin: 8px 0;';
  darkModeRow.textContent = 'Dark mode';
  const darkModeLabel = document.createElement('label');
  darkModeLabel.className = 'sp-switch';
  darkModeLabel.style.marginLeft = 'auto';
  const darkModeInput = document.createElement('input');
  darkModeInput.type = 'checkbox';
  darkModeInput.checked = !!document.querySelector('html')?.classList.contains('dark');
  darkModeInput.addEventListener('change', () => {
    const htmlEl = document.querySelector('html')!;
    if (htmlEl.classList.contains('dark')) {
      htmlEl.classList.replace('dark', 'light');
      htmlEl.style.cssText = 'color-scheme: light;';
      window.localStorage.setItem('theme', 'light');
    } else {
      htmlEl.classList.replace('light', 'dark');
      htmlEl.style.cssText = 'color-scheme: dark;';
      window.localStorage.setItem('theme', 'dark');
    }
    refreshPage();
  });
  const darkModeSlider = document.createElement('span');
  darkModeSlider.className = 'sp-switch-slider round';
  darkModeLabel.appendChild(darkModeInput);
  darkModeLabel.appendChild(darkModeSlider);
  darkModeRow.appendChild(darkModeLabel);
  darkModeSection.appendChild(darkModeRow);
  leftCol.appendChild(darkModeSection);

  leftCol.appendChild(
    createSwitch(
      'Auto Reload on Update',
      'Automatically reload all ChatGPT tabs when extension is updated',
      'autoReloadOnUpdate',
      true,
    ),
  );
  leftCol.appendChild(
    createSwitch(
      'Hide Release Note',
      'Don\u2019t show release note when extension is updated',
      'hideReleaseNote',
      true,
    ),
  );
  leftCol.appendChild(
    createSwitch(
      'Hide Update Notification',
      'Don\u2019t show update notification when new version is available',
      'hideUpdateNotification',
      false,
    ),
  );
  leftCol.appendChild(
    createSwitch(
      'Hide Daily Newsletter',
      'Do not show the daily newsletter popup inside ChatGPT.',
      'hideNewsletter',
      false,
      null,
      [],
      false,
      false,
    ),
  );

  const discordBox = document.createElement('div');
  discordBox.className = 'shadow-long rounded-lg';
  discordBox.innerHTML =
    '<iframe style="border-radius:8px;width:350px; max-width:100%;height:400px;" src="https://discord.com/widget?id=1083455984489476220&theme=dark" allowtransparency="true" frameborder="0" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe>';
  rightCol.appendChild(discordBox);

  container.appendChild(leftCol);
  container.appendChild(rightCol);

  const bottomBar = document.createElement('div');
  bottomBar.className =
    'text-xs text-token-text-tertiary flex justify-start items-center flex-wrap w-full px-4 py-2 bg-token-sidebar-surface-primary border-t border-token-border-medium absolute bottom-0 start-0';
  const links: Array<{ href: string; text: string }> = [
    { href: 'https://help.openai.com/en/collections/3742473-chatgpt', text: 'Get help \u279C' },
    { href: '#', text: 'Partner with us \u279C' },
    { href: '#', text: 'FAQ \u279C' },
    { href: '#', text: 'YouTube \u279C' },
    { href: '#', text: 'Affiliate \u279C' },
  ];
  links.forEach((link) => {
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.textContent = link.text;
    a.style.cssText =
      'color: #999; font-size: 12px; margin: 8px 0;min-width: 20%;text-align:center;padding-right: 8px;';
    bottomBar.appendChild(a);
  });
  container.appendChild(bottomBar);
  return container;
}

// ---------------------------------------------------------------------------
// conversationTabContent
//
// Original: content.isolated.end.js line 21498
// ---------------------------------------------------------------------------

function conversationTabContent(hasSub = false): HTMLElement {
  const container = document.createElement('div');
  container.id = 'settings-modal-tab-content';
  container.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: auto; width:100%; padding: 16px; margin-width:100%; height: 100%;';

  const {
    customConversationWidth,
    conversationWidth,
    autoDelete,
    autoDeleteNumDays,
    autoDeleteExcludeFolders,
    autoArchive: autoArchiveEnabled,
    autoArchiveNumDays,
    autoArchiveExcludeFolders,
    autoHideOldMessages,
    autoHideOldMessagesThreshold,
    autoHideOldMessagesRecent,
  } = cachedSettings;

  container.appendChild(
    createSwitch(
      'Custom Conversation Width',
      'OFF: Use default / ON: Set Conversation Width (30%-90%) (<a style="text-decoration:underline; " href="https://youtu.be/UYX-J4ybB14?si=uq7UwE92uds7pIAr" target="blank">Learn More</a>)',
      'customConversationWidth',
      false,
      toggleCustomWidthSwitch,
      [],
      false,
      false,
    ),
  );

  const widthDetail = document.createElement('div');
  widthDetail.id = 'conversation-width-detail';
  widthDetail.className = `flex flex-row justify-start items-center w-full pb-2 text-token-text-secondary opacity-${customConversationWidth ? '100' : '50'}`;
  widthDetail.style.cssText = 'border-bottom: 1px solid #555;';
  container.appendChild(widthDetail);

  const widthArrow = document.createElement('div');
  widthArrow.className = 'flex flex-row justify-start items-center me-2';
  widthArrow.style.cssText = 'transform: scale(-1, 1);';
  widthArrow.textContent = '\u21B2';
  widthDetail.appendChild(widthArrow);

  const widthLabel = document.createElement('div');
  widthLabel.className = 'flex flex-row justify-start items-center me-2';
  widthLabel.textContent = 'Width';
  widthDetail.appendChild(widthLabel);

  const widthInput = document.createElement('input');
  widthInput.id = 'conversation-width-input';
  widthInput.type = 'number';
  widthInput.className =
    'max-w-full min-w-20 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-token-main-surface-secondary disabled:opacity-40 text-token-text-primary';
  widthInput.disabled = !customConversationWidth;
  widthInput.value = String(conversationWidth);
  widthInput.min = '30';
  widthInput.max = '90';
  const onWidthChange = () => {
    const el = document.querySelector('#conversation-width-input') as HTMLInputElement;
    let val = Math.round(Number(el.value));
    el.value = String(val);
    if (val < 30) val = 30;
    if (val > 90) val = 90;
    setConversationWidth(val);
    chrome.storage.local.set({
      settings: { ...cachedSettings, conversationWidth: val, customConversationWidth: true },
    });
  };
  widthInput.addEventListener('change', onWidthChange);
  widthInput.addEventListener('input', onWidthChange);
  widthDetail.appendChild(widthInput);

  const widthPercent = document.createElement('div');
  widthPercent.className = 'flex flex-row justify-start items-center ms-2';
  widthPercent.textContent = '%';
  widthDetail.appendChild(widthPercent);

  // Auto Delete
  container.appendChild(
    createSwitch(
      'Auto Delete',
      'Automatically delete old conversations after selected # of days',
      'autoDelete',
      false,
      toggleAutoDelete,
      hasSub ? ['New'] : ['New', '\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
      false,
    ),
  );
  const autoDeleteDetails = document.createElement('div');
  autoDeleteDetails.id = 'auto-delete-details';
  autoDeleteDetails.className = `flex flex-row justify-start items-center w-full pb-2 text-token-text-secondary opacity-${autoDelete ? '100' : '50'}`;
  autoDeleteDetails.style.cssText = 'border-bottom: 1px solid #444;';
  container.appendChild(autoDeleteDetails);
  const deleteArrow = document.createElement('div');
  deleteArrow.className = 'flex flex-row justify-start items-center me-2';
  deleteArrow.style.cssText = 'transform: scale(-1, 1);';
  deleteArrow.textContent = '\u21B2';
  autoDeleteDetails.appendChild(deleteArrow);
  const deleteAfterLabel = document.createElement('div');
  deleteAfterLabel.className = 'flex flex-row justify-start items-center me-2';
  deleteAfterLabel.textContent = 'Delete after';
  autoDeleteDetails.appendChild(deleteAfterLabel);
  const deleteInput = document.createElement('input');
  deleteInput.id = 'auto-delete-input';
  deleteInput.type = 'number';
  deleteInput.className =
    'max-w-full min-w-20 px-4 py-2 me-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-token-main-surface-secondary disabled:opacity-40 text-token-text-primary';
  deleteInput.disabled = !autoDelete;
  deleteInput.value = String(autoDeleteNumDays);
  deleteInput.min = '1';
  deleteInput.max = '365';
  const onDeleteChange = () => {
    const el = document.querySelector('#auto-delete-input') as HTMLInputElement;
    let val = Math.round(Number(el.value));
    el.value = String(val);
    if (val < 1) val = 1;
    if (val > 365) val = 365;
    chrome.storage.local.set({ settings: { ...cachedSettings, autoDeleteNumDays: val } });
  };
  deleteInput.addEventListener('change', onDeleteChange);
  deleteInput.addEventListener('input', onDeleteChange);
  autoDeleteDetails.appendChild(deleteInput);
  const deleteDaysLabel = document.createElement('div');
  deleteDaysLabel.className = 'flex flex-row justify-start items-center ms-2';
  deleteDaysLabel.textContent = 'days';
  autoDeleteDetails.appendChild(deleteDaysLabel);
  const deleteSep = document.createElement('div');
  deleteSep.className = 'mx-4';
  deleteSep.innerText = '\u2014';
  autoDeleteDetails.appendChild(deleteSep);
  const deleteExcludeLabel = document.createElement('label');
  deleteExcludeLabel.className = 'flex flex-row justify-start items-center';
  deleteExcludeLabel.textContent = 'Skip conversations in folders';
  const deleteExcludeCheckbox = document.createElement('input');
  deleteExcludeCheckbox.id = 'auto-delete-exclude-folders-input';
  deleteExcludeCheckbox.className = 'ms-2';
  deleteExcludeCheckbox.type = 'checkbox';
  deleteExcludeCheckbox.disabled = !autoDelete;
  deleteExcludeCheckbox.checked = autoDeleteExcludeFolders;
  deleteExcludeCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({
      settings: { ...cachedSettings, autoDeleteExcludeFolders: deleteExcludeCheckbox.checked },
    });
  });
  deleteExcludeLabel.appendChild(deleteExcludeCheckbox);
  autoDeleteDetails.appendChild(deleteExcludeLabel);

  // Auto Archive
  container.appendChild(
    createSwitch(
      'Auto Archive',
      'Automatically archive old conversations after selected # of days',
      'autoArchive',
      false,
      toggleAutoArchive,
      hasSub ? ['New'] : ['New', '\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
      false,
    ),
  );
  const autoArchiveDetails = document.createElement('div');
  autoArchiveDetails.id = 'auto-archive-details';
  autoArchiveDetails.className = `flex flex-row justify-start items-center w-full pb-2 text-token-text-secondary opacity-${autoArchiveEnabled ? '100' : '50'}`;
  autoArchiveDetails.style.cssText = 'border-bottom: 1px solid #444;';
  container.appendChild(autoArchiveDetails);
  const archiveArrow = document.createElement('div');
  archiveArrow.className = 'flex flex-row justify-start items-center me-2';
  archiveArrow.style.cssText = 'transform: scale(-1, 1);';
  archiveArrow.textContent = '\u21B2';
  autoArchiveDetails.appendChild(archiveArrow);
  const archiveAfterLabel = document.createElement('div');
  archiveAfterLabel.className = 'flex flex-row justify-start items-center me-2';
  archiveAfterLabel.textContent = 'Archive after';
  autoArchiveDetails.appendChild(archiveAfterLabel);
  const archiveInput = document.createElement('input');
  archiveInput.id = 'auto-archive-input';
  archiveInput.type = 'number';
  archiveInput.className =
    'max-w-full min-w-20 px-4 py-2 me-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-token-main-surface-secondary disabled:opacity-40 text-token-text-primary';
  archiveInput.disabled = !autoArchiveEnabled;
  archiveInput.value = String(autoArchiveNumDays);
  archiveInput.min = '1';
  archiveInput.max = '365';
  const onArchiveChange = () => {
    const el = document.querySelector('#auto-archive-input') as HTMLInputElement;
    let val = Math.round(Number(el.value));
    el.value = String(val);
    if (val < 1) val = 1;
    if (val > 365) val = 365;
    chrome.storage.local.set({ settings: { ...cachedSettings, autoArchiveNumDays: val } });
  };
  archiveInput.addEventListener('change', onArchiveChange);
  archiveInput.addEventListener('input', onArchiveChange);
  autoArchiveDetails.appendChild(archiveInput);
  const archiveDaysLabel = document.createElement('div');
  archiveDaysLabel.className = 'flex flex-row justify-start items-center ms-2';
  archiveDaysLabel.textContent = 'days';
  autoArchiveDetails.appendChild(archiveDaysLabel);
  const archiveSep = document.createElement('div');
  archiveSep.className = 'mx-4';
  archiveSep.innerText = '\u2014';
  autoArchiveDetails.appendChild(archiveSep);
  const archiveExcludeLabel = document.createElement('label');
  archiveExcludeLabel.className = 'flex flex-row justify-start items-center';
  archiveExcludeLabel.textContent = 'Skip conversations in folders';
  const archiveExcludeCheckbox = document.createElement('input');
  archiveExcludeCheckbox.id = 'auto-archive-exclude-folders-input';
  archiveExcludeCheckbox.className = 'ms-2';
  archiveExcludeCheckbox.type = 'checkbox';
  archiveExcludeCheckbox.disabled = !autoArchiveEnabled;
  archiveExcludeCheckbox.checked = autoArchiveExcludeFolders;
  archiveExcludeCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({
      settings: { ...cachedSettings, autoArchiveExcludeFolders: archiveExcludeCheckbox.checked },
    });
  });
  archiveExcludeLabel.appendChild(archiveExcludeCheckbox);
  autoArchiveDetails.appendChild(archiveExcludeLabel);

  // Auto Hide Old Messages
  container.appendChild(
    createSwitch(
      'Auto Hide Messages',
      'Automatically hide older messages in long conversations to improve performance',
      'autoHideOldMessages',
      false,
      toggleAutoHideOldMessages,
      hasSub ? ['New'] : ['New', '\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
      false,
    ),
  );
  const hideThresholdDetails = document.createElement('div');
  hideThresholdDetails.id = 'auto-hide-old-messages-threshold-details';
  hideThresholdDetails.className = `flex flex-row justify-start items-center w-full pb-2 text-token-text-secondary opacity-${autoHideOldMessages ? '100' : '50'}`;
  container.appendChild(hideThresholdDetails);
  const hideThresholdArrow = document.createElement('div');
  hideThresholdArrow.className = 'flex flex-row justify-start items-center me-2';
  hideThresholdArrow.style.cssText = 'transform: scale(-1, 1);';
  hideThresholdArrow.textContent = '\u21B2';
  hideThresholdDetails.appendChild(hideThresholdArrow);
  const hideThresholdLabel = document.createElement('div');
  hideThresholdLabel.className = 'flex flex-row justify-start items-center me-2';
  hideThresholdLabel.textContent = 'Hide old messages if conversation has more than ';
  hideThresholdDetails.appendChild(hideThresholdLabel);
  const hideThresholdInput = document.createElement('input');
  hideThresholdInput.id = 'auto-hide-old-messages-threshold-input';
  hideThresholdInput.type = 'number';
  hideThresholdInput.className =
    'max-w-full min-w-20 px-4 py-2 me-2 ms-auto border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-token-main-surface-secondary disabled:opacity-40 text-token-text-primary';
  hideThresholdInput.style.maxWidth = '60px';
  hideThresholdInput.disabled = !autoHideOldMessages;
  hideThresholdInput.value = String(autoHideOldMessagesThreshold || 10);
  hideThresholdInput.min = '1';
  const onThresholdChange = () => {
    const el = document.querySelector('#auto-hide-old-messages-threshold-input') as HTMLInputElement;
    let val = Math.round(Number(el.value));
    el.value = String(val);
    if (val < 1) val = 1;
    chrome.storage.local.set({ settings: { ...cachedSettings, autoHideOldMessagesThreshold: val } });
  };
  hideThresholdInput.addEventListener('change', onThresholdChange);
  hideThresholdInput.addEventListener('input', onThresholdChange);
  hideThresholdDetails.appendChild(hideThresholdInput);
  const hideThresholdMessages = document.createElement('div');
  hideThresholdMessages.className = 'flex flex-row justify-start items-center ms-2';
  hideThresholdMessages.textContent = 'messages';
  hideThresholdDetails.appendChild(hideThresholdMessages);

  const hideRecentDetails = document.createElement('div');
  hideRecentDetails.id = 'auto-hide-old-messages-recent-details';
  hideRecentDetails.className = `flex flex-row justify-start items-center w-full pb-2 text-token-text-secondary opacity-${autoHideOldMessages ? '100' : '50'}`;
  hideRecentDetails.style.cssText = 'border-bottom: 1px solid #444;';
  container.appendChild(hideRecentDetails);
  const hideRecentArrow = document.createElement('div');
  hideRecentArrow.className = 'flex flex-row justify-start items-center me-2';
  hideRecentArrow.style.cssText = 'transform: scale(-1, 1);';
  hideRecentArrow.textContent = '\u21B2';
  hideRecentDetails.appendChild(hideRecentArrow);
  const hideRecentLabel = document.createElement('div');
  hideRecentLabel.className = 'flex flex-row justify-start items-center me-2';
  hideRecentLabel.textContent = 'Always show the most recent ';
  hideRecentDetails.appendChild(hideRecentLabel);
  const hideRecentInput = document.createElement('input');
  hideRecentInput.id = 'auto-hide-old-messages-recent-input';
  hideRecentInput.type = 'number';
  hideRecentInput.className =
    'max-w-full min-w-20 px-4 py-2 me-2 ms-auto border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-token-main-surface-secondary disabled:opacity-40 text-token-text-primary';
  hideRecentInput.style.maxWidth = '60px';
  hideRecentInput.disabled = !autoHideOldMessages;
  hideRecentInput.value = String(autoHideOldMessagesRecent || 2);
  hideRecentInput.min = '1';
  const onRecentChange = () => {
    const el = document.querySelector('#auto-hide-old-messages-recent-input') as HTMLInputElement;
    let val = Math.round(Number(el.value));
    el.value = String(val);
    if (val < 1) val = 1;
    chrome.storage.local.set({ settings: { ...cachedSettings, autoHideOldMessagesRecent: val } });
  };
  hideRecentInput.addEventListener('change', onRecentChange);
  hideRecentInput.addEventListener('input', onRecentChange);
  hideRecentDetails.appendChild(hideRecentInput);
  const hideRecentMessages = document.createElement('div');
  hideRecentMessages.className = 'flex flex-row justify-start items-center ms-2';
  hideRecentMessages.textContent = 'messages';
  hideRecentDetails.appendChild(hideRecentMessages);

  // Remaining switches
  container.appendChild(
    createSwitch(
      'Show Message Visibility Toggle Buttons',
      'Show buttons to hide/show individual messages in the conversation',
      'showMessageVisibilityToggleButtons',
      false,
      toggleMessageVisibilityToggleButtonsSwitch,
      ['New'],
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Mini Map',
      'Show a mini map of the full conversation on the right side of the conversation',
      'showMiniMap',
      false,
      toggleShowMiniMap,
      ['New'],
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Sidebar Note Button',
      'Show the note button on the right edge of screen',
      'showSidebarNoteButton',
      true,
      toggleSidebarNoteVisibilitySwitch,
    ),
  );
  container.appendChild(
    createSwitch(
      'Override Model Switcher',
      'Replace the default model switcher to show all available models',
      'overrideModelSwitcher',
      false,
      toggleOverrideModelSwitcher,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Language Selector',
      'Show the language selector in top nav',
      'showLanguageSelector',
      false,
      toggleShowLanguageSelector,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Writing Style Selector',
      'Show the writing style selector in top nav',
      'showWritingStyleSelector',
      false,
      toggleShowWritingStyleSelector,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Tone Selector',
      'Show the tone selector in top nav',
      'showToneSelector',
      false,
      toggleShowToneSelector,
    ),
  );
  container.appendChild(
    createSwitch(
      'Auto Reset Top Navbar',
      'Automatically reset the tone, writing style, and language to default when switching to new chats',
      'autoResetTopNav',
      true,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Message Char/Word Count',
      'Show the character and word count for each message',
      'showMessageCharWordCount',
      false,
      toggleShowMessageCharWordCount,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Message Timestamp',
      'Show the timestamp for each message',
      'showMessageTimestamp',
      false,
      toggleShowMessageTimestamp,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Date Dividers in Conversation',
      'Show date dividers between messages from different days',
      'showDateDividersInConversation',
      false,
      toggleShowDateDividersInConversation,
      ['New'],
    ),
  );
  container.appendChild(
    createSwitch('Sound Alarm', 'Play a sound when the ChatGPT finish responding', 'chatEndedSound', false),
  );
  container.appendChild(
    createSwitch(
      'Animate Favicon',
      'Animate the ChatGPT icon on browser tab while chat is responding',
      'animateFavicon',
      false,
    ),
  );
  container.appendChild(
    createSwitch(
      'Copy mode',
      'OFF: only copy response / ON: copy both request and response',
      'copyMode',
      false,
      null,
      [],
      false,
      false,
    ),
  );

  return container;
}

// ---------------------------------------------------------------------------
// foldersTabContent  --  Original: line 21886
// ---------------------------------------------------------------------------

function foldersTabContent(hasSub = false): HTMLElement {
  const container = document.createElement('div');
  container.id = 'settings-modal-tab-content';
  container.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: auto; width:100%; padding: 16px; margin-width:100%; height: 100%;';
  container.appendChild(
    createSwitch(
      'Auto Folder Custom GPTs',
      'Automatically create folders for custom GPTs and save new conversations in them',
      'autoFolderCustomGPTs',
      false,
      null,
      hasSub ? ['New'] : ['New', '\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Sidebar Folder Button',
      'Show the folder button on the right edge of screen (Only for when "Show Folders in Left Sidebar" \u{1F447} is OFF)',
      'showSidebarFolderButton',
      true,
      toggleSidebarFolderVisibilitySwitch,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Folders in Left Sidebar',
      'Show the folders in the left sidebar',
      'showFoldersInLeftSidebar',
      false,
      toggleLeftSidebarSwitch as unknown as (checked: boolean, event: Event) => void,
      ['Requires Refresh'],
    ),
  );
  container.appendChild(
    createSwitch(
      'Exclude Conversations in Folders',
      'Hide conversations saved in folders from the All Conversation list',
      'excludeConvInFolders',
      false,
      loadSidebarFolders as unknown as (checked: boolean, event: Event) => void,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Conversation Timestamp in Sidebar',
      'Show the timestamp for each conversation in the sidebar',
      'showConversationTimestampInSidebar',
      true,
      loadSidebarFolders as unknown as (checked: boolean, event: Event) => void,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Conversation Indicators in Sidebar',
      'Show note, favorite, and other indicators for each conversation in the sidebar',
      'showConversationIndicatorsInSidebar',
      true,
      loadSidebarFolders as unknown as (checked: boolean, event: Event) => void,
    ),
  );
  return container;
}

// ---------------------------------------------------------------------------
// textToSpeechTabContent  --  Original: line 21912
// ---------------------------------------------------------------------------

function textToSpeechTabContent(hasSub = false): HTMLElement {
  const container = document.createElement('div');
  container.id = 'settings-modal-tab-content';
  container.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: auto; width:100%; padding: 16px; margin-width:100%; height: 100%;';

  const ttsHeaderRow = document.createElement('div');
  ttsHeaderRow.style.cssText =
    'display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; margin: 8px 0;';
  const ttsLabel = document.createElement('div');
  ttsLabel.innerHTML =
    'Text To Speech<span class="text-xs"> \u2014 ChatGPT talks to you. <a class="underline " href="https://www.youtube.com/watch?v=ckHAyrVqj-w">Learn more</a></span>';
  ttsHeaderRow.appendChild(ttsLabel);
  const ttsVoiceWrapper = document.createElement('div');
  ttsVoiceWrapper.id = 'tts-voice-selector-wrapper';
  ttsVoiceWrapper.style.cssText = 'position:relative;width:250px;margin-left:8px;';
  ttsHeaderRow.appendChild(ttsVoiceWrapper);
  container.appendChild(ttsHeaderRow);

  const ttsBox = document.createElement('div');
  ttsBox.className =
    'relative flex flex-wrap justify-start items-center w-full p-4 bg-token-sidebar-surface-tertiary rounded-md mt-3 mb-6';
  ttsBox.appendChild(
    createSwitch(
      'Auto Speak',
      "Automatically speak the response once it's finished",
      'autoSpeak',
      false,
      null,
      hasSub ? [] : ['\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
      false,
    ),
  );

  const testAudioBtn = document.createElement('button');
  testAudioBtn.className = 'btn flex justify-center gap-2 border composer-submit-btn composer-submit-button-color';
  testAudioBtn.style.cssText = 'min-width:120px;height:34px;margin-left:auto;';
  testAudioBtn.textContent = 'Test Audio \u{1F3A7}';
  ttsBox.appendChild(testAudioBtn);

  getVoices().then((voiceData: any) => {
    const voices: any[] = voiceData.voices;
    const selected = voices.find((v: any) => v.voice === voiceData.selected) || voices[0];
    ttsVoiceWrapper.innerHTML = dropdown(
      'TTS-Voice',
      voices.map((v: any) => ({ ...v, name: `${v.name} (${v.description})` })),
      selected,
      'voice',
      'right',
      'bg-token-main-surface-primary',
    );
    addDropdownEventListener('TTS-Voice', voices, 'voice', (val: any) => {
      updateAccountUserSetting('voice_name', val.voice);
    });
    testAudioBtn.addEventListener('click', () => {
      if (settingTestAudio) settingTestAudio.pause();
      if (testAudioBtn.innerText === 'Stop Audio \u{1F3A7}') {
        testAudioBtn.innerText = 'Test Audio \u{1F3A7}';
        return;
      }
      const selectedTitle = (document.querySelector('#selected-tts-voice-title') as HTMLElement)?.innerText;
      let voice = voices.find((v: any) => v.name === selectedTitle);
      if (!voice) voice = voices[0];
      const audio = new Audio(voice.preview_url);
      audio.play();
      testAudioBtn.innerText = 'Stop Audio \u{1F3A7}';
      settingTestAudio = audio;
      audio.addEventListener('ended', () => {
        testAudioBtn.innerText = 'Test Audio \u{1F3A7}';
        settingTestAudio = null;
      });
    });
    testAudioBtn.addEventListener('blur', () => {
      if (settingTestAudio) settingTestAudio.pause();
      settingTestAudio = null;
      testAudioBtn.innerText = 'Test Audio \u{1F3A7}';
    });
  });
  container.appendChild(ttsBox);

  const sttHeaderRow = document.createElement('div');
  sttHeaderRow.style.cssText =
    'display: flex; flex-direction: row; justify-content: space-between; align-items: center; width: 100%; margin: 8px 0;';
  const sttLabel = document.createElement('div');
  sttLabel.innerHTML =
    typeof isFirefox !== 'undefined' && (isFirefox || isOpera)
      ? 'Speech To Text<span class="text-xs"> (Firefox and Opera do not support <a class="underline " href="https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition#browser_compatibility">Speech Recognition</a>)</span>'
      : 'Speech To Text<span class="text-xs"> \u2014 You talk to ChatGPT. <a class="underline " href="https://www.youtube.com/watch?v=ckHAyrVqj-w">Learn more</a></span>';
  sttHeaderRow.appendChild(sttLabel);
  const sttLangWrapper = document.createElement('div');
  sttLangWrapper.style.cssText = 'position:relative;width:150px;margin-left:8px;';
  if (typeof isFirefox !== 'undefined' && (isFirefox || isOpera)) {
    sttLangWrapper.style.opacity = '0.5';
    sttLangWrapper.style.pointerEvents = 'none';
  }
  const { speechToTextLanguage } = cachedSettings;
  sttLangWrapper.innerHTML = dropdown(
    'STT-Language',
    speechToTextLanguageList as any[],
    speechToTextLanguage,
    'code',
    'right',
    'bg-token-main-surface-primary',
  );
  setTimeout(() => {
    addDropdownEventListener('STT-Language', speechToTextLanguageList as any[], 'code', (val: any) => {
      chrome.storage.local.set({ settings: { ...cachedSettings, speechToTextLanguage: val } });
    });
  }, 1000);
  sttHeaderRow.appendChild(sttLangWrapper);
  container.appendChild(sttHeaderRow);

  const sttBox = document.createElement('div');
  sttBox.className =
    'relative flex flex-wrap justify-start items-center w-full p-4 bg-token-sidebar-surface-tertiary rounded-md my-3';
  if (typeof isFirefox !== 'undefined' && (isFirefox || isOpera)) {
    sttBox.style.opacity = '0.5';
    sttBox.style.pointerEvents = 'none';
  }
  sttBox.appendChild(
    createSwitch(
      'Enable Speech To Text Shortkey',
      `Enable/disable the ${isWindows() ? 'ALT' : 'Option'} key to start/stop speech to text input`,
      'enableSpeechToTextShortkey',
      true,
      refreshPage as unknown as (checked: boolean, event: Event) => void,
      hasSub ? ['Requires Refresh'] : ['\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
      false,
    ),
  );
  sttBox.appendChild(
    createSwitch(
      'Interim Results',
      'Show interim results while speaking',
      'speechToTextInterimResults',
      true,
      null,
      hasSub ? [] : ['\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
      false,
    ),
  );
  sttBox.appendChild(
    createSwitch(
      'Auto Submit When Release Alt',
      'Automatically submit the message when you release the Alt key',
      'autoSubmitWhenReleaseAlt',
      false,
      null,
      hasSub ? [] : ['\u26A1\uFE0F Requires Pro Account'],
      !hasSub,
      false,
    ),
  );
  container.appendChild(sttBox);
  return container;
}

// ---------------------------------------------------------------------------
// promptInputTabContent  --  Original: line 21975
// ---------------------------------------------------------------------------

function promptInputTabContent(hasSub = false): HTMLElement {
  const container = document.createElement('div');
  container.id = 'settings-modal-tab-content';
  container.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: auto; width:100%; padding: 16px; margin-width:100%; height: 100%;';
  container.appendChild(
    createSwitch(
      'Recent Prompts Shortkey',
      'Enable/disable the up and down arrow keys to cycle through recent prompt history.',
      'promptHistoryUpDownKey',
      true,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Memory Toggles in Input',
      'Show/hide the memory toggles in the prompt input area.',
      'showMemoryTogglesInInput',
      true,
      toggleMemoryTogglesInInputVisibility,
      ['New'],
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Prompt Optimizer Button in Input',
      'Show/hide the prompt optimizer button in the prompt input area.',
      'showPromptRewriterButtonInInput',
      true,
      togglePromptRewriterButtonInInputVisibility,
      hasSub ? ['New'] : ['New', '\u26A1\uFE0F Requires Pro Account'],
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Last Prompt Chain Actions',
      'Show/hide the button above input to rerun/edit the last prompt chain.',
      'showRerunLastPromptChainButton',
      true,
      toggleRerunLastPromptChainButtonVisibility,
      ['New'],
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Favorite Prompts Button',
      'Show/hide the button above input to use favorite prompts. <a href="https://www.youtube.com/watch?v=FBgR7YmrxUk" target="_blank" class="underline " rel="noreferrer">Learn more</a>',
      'showFavoritePromptsButton',
      true,
      toggleFavoritePromptsButtonVisibility,
    ),
  );
  container.appendChild(
    createSwitch(
      'Show Custom Instruction Profile Selector',
      'Show/hide the profile selector for custom instructions.',
      'showCustomInstructionProfileSelector',
      true,
      toggleCustomInstructionProfileSelectorVisibility,
      ['New'],
    ),
  );
  container.appendChild(
    createSwitch(
      'Auto Continue When Available',
      'Automatically continue the response when the option is available at the end of a long response',
      'autoContinueWhenPossible',
      true,
    ),
  );
  container.appendChild(
    createSwitch(
      'Prompt Template',
      'Enable/disable the doube {{curly}} brackets replacement (<a style="text-decoration:underline; " href="https://www.youtube.com/watch?v=JMBjq0XtutA" target="blank">Learn More</a>)',
      'promptTemplate',
      true,
    ),
  );
  container.appendChild(
    createSwitch(
      'Submit Prompt on Enter',
      `Submit the prompt when you press Enter. If disable, you can submit prompt using ${isWindows() ? 'CTRL' : 'CMD'} + Enter`,
      'submitPromptOnEnter',
      true,
      refreshPage as unknown as (checked: boolean, event: Event) => void,
      ['Requires Refresh'],
      false,
      false,
    ),
  );
  return container;
}

// ---------------------------------------------------------------------------
// splitterTabContent  --  Original: line 22015
// ---------------------------------------------------------------------------

function splitterTabContent(_hasSub = false): HTMLElement {
  const container = document.createElement('div');
  container.id = 'settings-modal-tab-content';
  container.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: scroll; width:100%; padding: 16px; margin-width:100%; height: 100%;';
  const switchRow = document.createElement('div');
  switchRow.style.cssText =
    'display: flex; gap:16px; justify-content: start; align-items: start; width: 100%; margin: 8px 0;';
  switchRow.appendChild(
    createSwitch(
      'Auto Split',
      'Automatically split long prompts into smaller chunks (<a style="text-decoration:underline; color:gold;" href="https://www.youtube.com/watch?v=IhRbmIhAm3I" target="blank">Learn More</a>)',
      'autoSplit',
      false,
      toggleAutoSummarizerSwitch,
      ['Requires Refresh'],
    ),
  );
  switchRow.appendChild(
    createSwitch(
      'Auto Summarize',
      'Automatically summarize each chunk after auto split (<a style="text-decoration:underline; color:gold;" href="https://www.youtube.com/watch?v=IhRbmIhAm3I" target="blank">Learn More</a>)',
      'autoSummarize',
      false,
      updateAutoSplitPrompt,
      ['Requires Refresh'],
    ),
  );
  container.appendChild(switchRow);

  const chunkSizeLabel = document.createElement('div');
  chunkSizeLabel.style.cssText =
    'display: flex; flex-direction: row; justify-content: start; align-items: center; width: 100%; margin: 8px 0; color:white;';
  chunkSizeLabel.textContent = 'Auto Split Chunk Size (<100,000)';
  container.appendChild(chunkSizeLabel);
  const chunkSizeInput = document.createElement('input');
  chunkSizeInput.id = 'split-prompt-limit-input';
  chunkSizeInput.type = 'number';
  chunkSizeInput.className =
    'w-full px-4 py-2 mb-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-token-main-surface-secondary disabled:opacity-40';
  chunkSizeInput.value = String(cachedSettings.autoSplitLimit);
  const onChunkSizeChange = () => {
    const el = document.querySelector('#split-prompt-limit-input') as HTMLInputElement;
    const val = Math.round(Number(el.value));
    el.value = String(val);
    chrome.storage.local.set({ settings: { ...cachedSettings, autoSplitLimit: val } });
  };
  chunkSizeInput.addEventListener('change', onChunkSizeChange);
  chunkSizeInput.addEventListener('input', onChunkSizeChange);
  container.appendChild(chunkSizeInput);

  const splitPromptLabel = document.createElement('div');
  splitPromptLabel.style.cssText =
    'display: flex; flex-direction: row; justify-content: start; align-items: center; width: 100%; margin-top: 16px; color:white;';
  splitPromptLabel.textContent = 'Auto Split Prompt';
  container.appendChild(splitPromptLabel);
  const splitPromptDesc = document.createElement('div');
  splitPromptDesc.style.cssText = 'font-size: 12px; color: #999;margin-bottom: 8px;';
  splitPromptDesc.textContent =
    'Auto Split Prompt is a instruction that will be used to split long user inputs into multiple chunks.';
  container.appendChild(splitPromptDesc);
  const splitPromptTextarea = document.createElement('textarea');
  splitPromptTextarea.id = 'split-initial-prompt-textarea';
  splitPromptTextarea.className = 'bg-token-main-surface-secondary text-token-text-primary';
  splitPromptTextarea.style.cssText =
    'width: 100%; height: 200px; min-height: 200px; border-radius: 4px; border: 1px solid #565869; padding: 4px 8px; font-size: 14px;';
  splitPromptTextarea.placeholder = 'Enter Auto Split Prompt here...';
  splitPromptTextarea.value = cachedSettings.autoSplitInitialPrompt;
  splitPromptTextarea.dir = 'auto';
  splitPromptTextarea.addEventListener('input', () => {
    splitPromptTextarea.style.borderColor = '#565869';
    chrome.storage.local.set({ settings: { ...cachedSettings, autoSplitInitialPrompt: splitPromptTextarea.value } });
  });
  container.appendChild(splitPromptTextarea);

  const chunkPromptLabel = document.createElement('div');
  chunkPromptLabel.style.cssText =
    'display: flex; flex-direction: row; justify-content: start; align-items: center; width: 100%; margin-top: 16px; color:white;';
  chunkPromptLabel.textContent = 'Auto Split Chunk Prompt';
  container.appendChild(chunkPromptLabel);
  const chunkPromptDesc = document.createElement('div');
  chunkPromptDesc.style.cssText = 'font-size: 12px; color: #999;margin-bottom: 8px;';
  chunkPromptDesc.textContent =
    'Auto Split Chunk Prompt is the instruction used to process each chunk. For instance, it can be used to summarize the chunk.';
  container.appendChild(chunkPromptDesc);
  const chunkPromptTextarea = document.createElement('textarea');
  chunkPromptTextarea.id = 'split-chunk-prompt-textarea';
  chunkPromptTextarea.className = 'bg-token-main-surface-secondary text-token-text-primary';
  chunkPromptTextarea.style.cssText =
    'width: 100%; height: 100px; min-height: 100px; border-radius: 4px; border: 1px solid #565869; padding: 4px 8px; font-size: 14px;';
  chunkPromptTextarea.placeholder = 'Enter splitter prompt here...';
  chunkPromptTextarea.value = cachedSettings.autoSplitChunkPrompt;
  chunkPromptTextarea.dir = 'auto';
  chunkPromptTextarea.addEventListener('input', () => {
    chunkPromptTextarea.style.borderColor = '#565869';
    chrome.storage.local.set({ settings: { ...cachedSettings, autoSplitChunkPrompt: chunkPromptTextarea.value } });
  });
  container.appendChild(chunkPromptTextarea);

  return container;
}

// ---------------------------------------------------------------------------
// showHelpModal  --  Original: line 16137
// ---------------------------------------------------------------------------

export function showHelpModal(): void {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="manager-help-modal" class="absolute inset-0" style="z-index:10000;"><div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;"><div class="z-50 h-full w-full overflow-y-auto grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)]"><div id="manager-help-modal-dialog" role="dialog" data-state="open" class="popover relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full bg-token-main-surface-primary text-start shadow-xl ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl flex flex-col focus:outline-none max-w-[550px]" tabindex="-1" style="pointer-events: auto;"><div class="p-4 flex items-center justify-between border-b border-black/10 dark:border-white/10"><div class="flex"><div class="flex items-center"><div class="flex grow items-center gap-1"><h2 class="text-lg font-semibold leading-6 text-token-text-primary">Help center</h2></div></div></div><button data-testid="close-button" class="flex h-8 w-8 items-center justify-center rounded-full text-token-text-primary bg-transparent hover:bg-token-main-surface-tertiary focus-visible:outline-none" aria-label="Close"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.63603 5.63604C6.02656 5.24552 6.65972 5.24552 7.05025 5.63604L12 10.5858L16.9497 5.63604C17.3403 5.24552 17.9734 5.24552 18.364 5.63604C18.7545 6.02657 18.7545 6.65973 18.364 7.05025L13.4142 12L18.364 16.9497C18.7545 17.3403 18.7545 17.9734 18.364 18.364C17.9734 18.7545 17.3403 18.7545 16.9497 18.364L12 13.4142L7.05025 18.364C6.65972 18.7545 6.02656 18.7545 5.63603 18.364C5.24551 17.9734 5.24551 17.3403 5.63603 16.9497L10.5858 12L5.63603 7.05025C5.24551 6.65973 5.24551 6.02657 5.63603 5.63604Z"></path></svg></button></div><div class="flex-grow overflow-y-auto p-4 sm:p-6"><div class="w-full"><p>Here are some resources to help you get started with Council:</p><ul class="list-disc list-inside mt-4"><li class="text-token-text-tertiary">Join our <a href="https://#" class="inline-flex items-center gap-2 text-token-text-tertiary underline" target="_blank" rel="noreferrer">Discord</a> community</li><li class="text-token-text-tertiary">Watch our <a href="#" class="inline-flex items-center gap-2 text-token-text-tertiary underline" target="_blank" rel="noreferrer">YouTube</a> channel</li><li class="text-token-text-tertiary">Read our <a href="#" class="inline-flex items-center gap-2 text-token-text-tertiary underline" target="_blank" rel="noreferrer">FAQ</a></li><li class="text-token-text-tertiary">Visit <a href="https://help.openai.com/en/collections/3742473-chatgpt" class="inline-flex items-center gap-2 text-token-text-tertiary underline" target="_blank" rel="noreferrer">ChatGPT help center</a></li></ul><br/><p>Feel free to <a target="_blank" class="mx-1 font-semibold underline" href="mailto:#?subject=Council Pro Subscription">Email Us</a> or <a target="_blank" class="mx-1 font-semibold underline" href="#">Book a call</a> with us.</p></div></div></div></div></div>`,
  );
  const modal = document.querySelector('#manager-help-modal');
  const closeBtn = modal?.querySelector('[data-testid="close-button"]');
  modal?.addEventListener('click', (ev) => {
    const dialog = document.querySelector('#manager-help-modal-dialog');
    if (dialog && !dialog.contains(ev.target as Node)) modal?.remove();
  });
  closeBtn?.addEventListener('click', () => modal?.remove());
}

// ---------------------------------------------------------------------------
// showAboutModal  --  Original: line 16195
// ---------------------------------------------------------------------------

export function showAboutModal(): void {
  const { version } = chrome.runtime.getManifest();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="manager-about-modal" class="absolute inset-0" style="z-index:10000;"><div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;"><div class="z-50 h-full w-full overflow-y-auto grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)]"><div id="manager-about-modal-dialog" role="dialog" data-state="open" class="popover relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full bg-token-main-surface-primary text-start shadow-xl ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl flex flex-col focus:outline-none max-w-[550px]" tabindex="-1" style="pointer-events: auto;"><div class="p-4 flex items-center justify-between border-b border-black/10 dark:border-white/10"><div class="flex"><div class="flex items-center"><div class="flex grow items-center gap-1"><h2 class="text-lg font-semibold leading-6 text-token-text-primary">Council</h2></div></div></div><button data-testid="close-button" class="flex h-8 w-8 items-center justify-center rounded-full text-token-text-primary bg-transparent hover:bg-token-main-surface-tertiary focus-visible:outline-none" aria-label="Close"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.63603 5.63604C6.02656 5.24552 6.65972 5.24552 7.05025 5.63604L12 10.5858L16.9497 5.63604C17.3403 5.24552 17.9734 5.24552 18.364 5.63604C18.7545 6.02657 18.7545 6.65973 18.364 7.05025L13.4142 12L18.364 16.9497C18.7545 17.3403 18.7545 17.9734 18.364 18.364C17.9734 18.7545 17.3403 18.7545 16.9497 18.364L12 13.4142L7.05025 18.364C6.65972 18.7545 6.02656 18.7545 5.63603 18.364C5.24551 17.9734 5.24551 17.3403 5.63603 16.9497L10.5858 12L5.63603 7.05025C5.24551 6.65973 5.24551 6.02657 5.63603 5.63604Z"></path></svg></button></div><div class="flex-grow overflow-y-auto p-4 sm:p-6"><div class="w-full"><p class="mb-6 text-token-text-tertiary"><span>Take ChatGPT to the next level with folders, search, enhanced GPT store, image gallery, voice GPT, custom prompts, and more... <a href="#" class="text-token-text-tertiary underline" target="_blank" rel="noreferrer">Learn more</a></span></p><p class="mb-6 text-token-text-tertiary"><span>Enjoy Council? <a href="#" class="text-token-text-tertiary underline" target="_blank" rel="noreferrer">Become an affiliate</a></span></p><p class="mb-6 text-token-text-tertiary"><span>Version v${version} - <span id="manager-release-note" class="underline cursor-pointer text-token-text-tertiary">Release Note</span></span></p><p class="mb-6 text-token-text-tertiary"><span>Created by <a href="#" target="_blank" class="underline text-token-text-tertiary">Saeed Ezzati</a> - <a href="#" target="_blank" class="underline text-token-text-tertiary">\u{1F355} Buy me a pizza \u279C</a></span></p></div></div></div></div></div>`,
  );
  const modal = document.querySelector('#manager-about-modal');
  if (!modal) return;
  const closeBtn = modal.querySelector('[data-testid="close-button"]');
  const releaseNoteLink = modal.querySelector('#manager-release-note');
  modal.addEventListener('click', (ev) => {
    const dialog = document.querySelector('#manager-about-modal-dialog');
    if (dialog && !dialog.contains(ev.target as Node)) modal.remove();
  });
  closeBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    modal.remove();
  });
  releaseNoteLink?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
    modal.remove();
    createReleaseNoteModal(version);
  });
}

// ---------------------------------------------------------------------------
// createReleaseNoteModal  --  Original: line 14535
// ---------------------------------------------------------------------------

export function createReleaseNoteModal(version: string, onlyIfNew = false): void {
  chrome.runtime.sendMessage({ type: 'getReleaseNote', detail: { version } }, (releaseNote: any) => {
    if (!releaseNote || (onlyIfNew && releaseNote.skip)) return;
    const content = releaseNoteModalContent(version, releaseNote);
    const actions = releaseNoteModalActions();
    createModal(`Release note (v ${version})`, 'You can see the latest changes here', content, actions, true);
  });
}

function releaseNoteModalContent(version: string, releaseNote: any): HTMLElement {
  const outer = document.createElement('div');
  outer.id = `modal-content-release-note-(v-${version})`;
  outer.style.cssText = 'position: relative;height:100%;';
  outer.className = 'markdown prose-invert';
  const base = document.createElement('base');
  base.target = '_blank';
  outer.appendChild(base);
  const bgLogo = document.createElement('img');
  bgLogo.src = chrome.runtime.getURL('icons/logo.png');
  bgLogo.style.cssText =
    'position: fixed; top: 50%; right: 50%; width: 400px; height: 400px; opacity: 0.07; transform: translate(50%, -50%);box-shadow:none !important;';
  outer.appendChild(bgLogo);
  const article = document.createElement('article');
  article.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;height: 100%; width: 100%; white-space: break-spaces; overflow-wrap: break-word;position: relative;z-index:10;overflow-y:auto;';
  article.innerHTML = `<div style="font-size:1em;padding:8px 16px;width:100%;">Release date: ${new Date(releaseNote?.created_at || new Date()).toDateString()} (<span id="previous-version" data-version="${releaseNote.previous_version}" style="cursor:pointer;text-decoration:underline;">Previous release note</span>)</div><div style="display: flex; flex-direction: column; justify-content: start; align-items: start;height: 100%; width: 100%; white-space: break-spaces; overflow-wrap: break-word;position: relative;z-index:10;padding:16px;">${releaseNote.text}</div>`;
  setTimeout(() => {
    const prevLink = document.querySelector('#previous-version') as HTMLElement | null;
    if (prevLink) {
      prevLink.addEventListener('click', () => {
        (
          document.querySelector(`button[id="modal-close-button-release-note-(v-${version})"]`) as HTMLElement | null
        )?.click();
        createReleaseNoteModal(prevLink.dataset.version!);
      });
    }
  }, 1000);
  outer.appendChild(article);
  return outer;
}

function releaseNoteModalActions(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display: flex; flex-wrap:wrap;justify-content: space-between; align-items: center;width: 100%; font-size: 12px;';
  wrapper.appendChild(settingsModalActions());
  const hideCheckbox = document.createElement('input');
  hideCheckbox.type = 'checkbox';
  hideCheckbox.id = 'hide-release-note-checkbox';
  hideCheckbox.style.cssText = 'margin-right: 8px; width:12px; height:12px;';
  hideCheckbox.checked = cachedSettings?.hideReleaseNote || false;
  hideCheckbox.addEventListener('change', (ev) => {
    chrome.storage.local.set({
      settings: { ...cachedSettings, hideReleaseNote: (ev.target as HTMLInputElement).checked },
    });
  });
  const hideLabel = document.createElement('label');
  hideLabel.htmlFor = 'hide-release-note-checkbox';
  hideLabel.textContent = 'Don\u2019t show release note when extension is updated';
  hideLabel.style.cssText = 'color: lightslategray;';
  const hideRow = document.createElement('div');
  hideRow.style.cssText =
    'display: flex; justify-content: flex-start; align-items: center; margin-left:48px;min-width:220px;';
  hideRow.appendChild(hideCheckbox);
  hideRow.appendChild(hideLabel);
  wrapper.appendChild(hideRow);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Settings modal styles
// ---------------------------------------------------------------------------

const inactiveTabElementStyles =
  'border-right: 1px solid; border-bottom:2px solid; border-top-right-radius: 16px; min-width:150px;';
const activeTabElementStyles = 'border:solid 2px ; border-bottom:0; border-top-right-radius: 16px;min-width:150px;';
const inactiveTabElementClasses =
  'bg-token-sidebar-surface-primary text-sm text-token-text-primary px-2 py-3 h-full border-token-border-medium';
const activeTabElementClasses =
  'bg-token-sidebar-surface-secondary text-sm text-token-text-primary px-2 py-3 h-full border-token-border-medium active-tab';

// ---------------------------------------------------------------------------
// selectedSettingsTabContent
//
// Original: content.isolated.end.js line 21368
// ---------------------------------------------------------------------------

function selectedSettingsTabContent(tab: string, hasSub: boolean): HTMLElement {
  switch (tab) {
    case 'general':
      return generalTabContent(hasSub);
    case 'conversation':
      return conversationTabContent(hasSub);
    case 'folders':
      return foldersTabContent(hasSub);
    case 'voice':
      return textToSpeechTabContent(hasSub);
    case 'prompt-input':
      return promptInputTabContent(hasSub);
    case 'splitter':
      return splitterTabContent(hasSub);
    default:
      return generalTabContent(hasSub);
  }
}

// ---------------------------------------------------------------------------
// settingsModalContent
//
// Original: content.isolated.end.js line 21387
// ---------------------------------------------------------------------------

function settingsModalContent(initialTab = 'general'): HTMLElement {
  const tabNames = ['general', 'conversation', 'folders', 'voice', 'prompt-input', 'splitter'];
  let currentTab = initialTab;
  window.location.hash = `setting/${currentTab}`;

  const outer = document.createElement('div');
  outer.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;width:100%; height: 100%;';

  const tabBar = document.createElement('div');
  tabBar.style.cssText =
    'display: flex; flex-direction: row; justify-content: start; align-items: center; width: 100%; z-index:1000;overflow:hidden; overflow-x:scroll;-ms-overflow-style: none; scrollbar-width: none;';
  tabBar.className = 'scrollbar-hide bg-token-sidebar-surface-primary';

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    tabNames.forEach((tabName) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = currentTab === tabName ? activeTabElementClasses : inactiveTabElementClasses;
      tabBtn.style.cssText = currentTab === tabName ? activeTabElementStyles : inactiveTabElementStyles;
      tabBtn.textContent = translate(capitalize(tabName).replace('-', ' '));

      tabBtn.addEventListener('click', () => {
        window.location.hash = `setting/${tabName}`;
        currentTab = tabName;

        const activeEl = document.querySelector('.active-tab');
        if (activeEl) {
          activeEl.className = inactiveTabElementClasses;
          (activeEl as HTMLElement).style.cssText = inactiveTabElementStyles;
        }

        tabBtn.className = activeTabElementClasses;
        tabBtn.style.cssText = activeTabElementStyles;

        const oldContent = document.querySelector('#settings-modal-tab-content');
        const newContent = selectedSettingsTabContent(currentTab, hasSub);
        if (oldContent && oldContent.parentNode) {
          oldContent.parentNode.replaceChild(newContent, oldContent);
        }
      });

      tabBar.appendChild(tabBtn);
    });

    const spacer = document.createElement('div');
    spacer.className = 'w-full h-full border-b-2 border-token-border-xheavy';
    tabBar.appendChild(spacer);

    outer.appendChild(selectedSettingsTabContent(currentTab, hasSub));
  });

  outer.appendChild(tabBar);
  return outer;
}

// ---------------------------------------------------------------------------
// settingsModalActions
//
// Original: content.isolated.end.js line 22111
// ---------------------------------------------------------------------------

function settingsModalActions(): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText =
    'display: flex; flex-direction: row; justify-content: start; align-items: end; margin-top: 8px;width:100%;';

  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icons/logo.png');
  logo.style.cssText = 'width: 40px; height: 40px;';
  container.appendChild(logo);

  const infoCol = document.createElement('div');
  infoCol.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start; margin-left: 8px;';

  // "Powered by" row
  const poweredBy = document.createElement('div');
  poweredBy.textContent = 'Powered by';
  poweredBy.style.cssText = 'color: #999; font-size: 12px;';

  const siteLink = document.createElement('a');
  siteLink.href = '#';
  siteLink.target = '_blank';
  siteLink.textContent = 'Council';
  siteLink.style.cssText = 'color: #999; font-size: 12px; margin-left: 4px; text-decoration: underline;';
  poweredBy.appendChild(siteLink);

  const { version } = chrome.runtime.getManifest();

  const versionSpan = document.createElement('span');
  versionSpan.textContent = `(v ${version}`;
  versionSpan.style.cssText = 'color: #999; font-size: 12px; margin-left: 4px;';
  poweredBy.appendChild(versionSpan);

  const releaseNoteSpan = document.createElement('span');
  releaseNoteSpan.textContent = 'Release Note)';
  releaseNoteSpan.style.cssText =
    'color: #999; font-size: 12px; margin-left: 4px; text-decoration: underline; cursor: pointer;';
  releaseNoteSpan.addEventListener('click', () => {
    (document.querySelector('button[id^=modal-close-button-release-note]') as HTMLElement | null)?.click();
    createReleaseNoteModal(version);
  });
  poweredBy.appendChild(releaseNoteSpan);

  infoCol.appendChild(poweredBy);

  // "Made by" row
  const madeBy = document.createElement('div');
  madeBy.textContent = 'Made by';
  madeBy.style.cssText = 'color: #999; font-size: 12px;';

  const authorLink = document.createElement('a');
  authorLink.href = '#';
  authorLink.target = '_blank';
  authorLink.textContent = 'Council Team';
  authorLink.style.cssText = 'color: #999; font-size: 12px; margin-left: 4px; text-decoration: underline;';

  const separator = document.createElement('span');
  separator.textContent = ' - ';
  separator.style.cssText = 'color: #999; font-size: 12px;';

  const pizzaLink = document.createElement('a');
  pizzaLink.href = '#';
  pizzaLink.target = '_blank';
  pizzaLink.textContent = '\u{1F355} Buy me a pizza \u279C';
  pizzaLink.style.cssText = 'color: #999; font-size: 12px; margin-left: 4px; text-decoration: underline;';

  separator.appendChild(pizzaLink);
  madeBy.appendChild(authorLink);
  madeBy.appendChild(separator);

  infoCol.appendChild(madeBy);
  container.appendChild(infoCol);

  // Upgrade / Pro button
  const upgradeBtn = document.createElement('button');
  upgradeBtn.id = 'upgrade-to-pro-button-settings';
  upgradeBtn.className =
    'flex flex-wrap p-1 items-center rounded-md bg-gold hover:bg-gold-dark transition-colors duration-200 text-black cursor-pointer text-sm ms-auto font-bold';
  upgradeBtn.style.cssText = 'width: 230px;';
  upgradeBtn.innerHTML =
    '<div class="flex w-full"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width:20px; height:20px; margin-right:6px;position:relative; top:10px;" stroke="purple" fill="purple"><path d="M240.5 224H352C365.3 224 377.3 232.3 381.1 244.7C386.6 257.2 383.1 271.3 373.1 280.1L117.1 504.1C105.8 513.9 89.27 514.7 77.19 505.9C65.1 497.1 60.7 481.1 66.59 467.4L143.5 288H31.1C18.67 288 6.733 279.7 2.044 267.3C-2.645 254.8 .8944 240.7 10.93 231.9L266.9 7.918C278.2-1.92 294.7-2.669 306.8 6.114C318.9 14.9 323.3 30.87 317.4 44.61L240.5 224z"/></svg> Upgrade to Pro</div><div style="font-size:10px;font-weight:400;margin-left:28px;" class="flex w-full">GPT Store, Image Gallery, Voice & more</div>';

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    if (hasSub) {
      upgradeBtn.className =
        'flex p-3 items-center rounded-md bg-gold hover:bg-gold-dark transition-colors duration-200 text-black cursor-pointer text-sm ms-auto font-bold';
      upgradeBtn.style.cssText = 'width: auto;';
      upgradeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width:20px; height:20px;margin-right:6px;" stroke="purple" fill="purple"><path d="M240.5 224H352C365.3 224 377.3 232.3 381.1 244.7C386.6 257.2 383.1 271.3 373.1 280.1L117.1 504.1C105.8 513.9 89.27 514.7 77.19 505.9C65.1 497.1 60.7 481.1 66.59 467.4L143.5 288H31.1C18.67 288 6.733 279.7 2.044 267.3C-2.645 254.8 .8944 240.7 10.93 231.9L266.9 7.918C278.2-1.92 294.7-2.669 306.8 6.114C318.9 14.9 323.3 30.87 317.4 44.61L240.5 224z"/></svg> ${translate('Pro account')}`;
    }

    upgradeBtn.addEventListener('click', () => {
      openUpgradeModal(hasSub);
    });

    container.appendChild(upgradeBtn);
  });

  return container;
}

// ---------------------------------------------------------------------------
// createSettingsModal
//
// Original: content.isolated.end.js line 21358
// ---------------------------------------------------------------------------

export function createSettingsModal(tab = 'general'): void {
  const content = settingsModalContent(tab);
  const actions = settingsModalActions();
  createModal('Settings', 'You can change the Council settings here', content, actions, false);

  // Dev: add "Run Wiring Test" button in modal header area
  setTimeout(() => {
    const headerBtns = document.querySelector(
      '#modal-settings #modal-main div[style*="display:flex"][style*="align-items:center"]:last-of-type',
    ) as HTMLElement | null;
    // Fallback: find the close button's parent
    const fallback = document.querySelector('[id^="modal-close-button-settings"]')?.parentElement as HTMLElement | null;
    const target = headerBtns ?? fallback;
    if (!target) return;
    const testBtn = document.createElement('button');
    testBtn.textContent = 'Run Wiring Test';
    testBtn.style.cssText =
      'margin-right:8px;padding:4px 12px;font-size:12px;border-radius:6px;background:#ffd700;color:#000;font-weight:600;cursor:pointer;';
    testBtn.addEventListener('click', () => runSettingsWiringTest());
    target.insertBefore(testBtn, target.firstChild);
  }, 300);
}

// ---------------------------------------------------------------------------
// keyboardShortcutsModalContent
//
// Original: content.isolated.end.js line 11938
// ---------------------------------------------------------------------------

function keyboardShortcutsModalContent(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = 'modal-content-keyboard-shortcuts-list';
  wrapper.style.cssText = 'overflow-y: hidden;position: relative;height:100%; width:100%';
  wrapper.className = 'markdown prose-invert';

  const bgLogo = document.createElement('img');
  bgLogo.src = chrome.runtime.getURL('icons/logo.png');
  bgLogo.style.cssText =
    'position: fixed; top: 50%; right: 50%; width: 400px; height: 400px; opacity: 0.07; transform: translate(50%, -50%);box-shadow:none !important;';
  wrapper.appendChild(bgLogo);

  const scrollable = document.createElement('div');
  scrollable.style.cssText =
    'display: flex; flex-direction: column; justify-content: start; align-items: start;overflow-y: auto; height: 100%; width: 100%; white-space: break-spaces; overflow-wrap: break-word;padding: 16px;position: relative;z-index:10;';

  scrollable.innerHTML = `
  <table style="width:100%;">
    <tr>
      <th class="text-token-text-tertiary text-left">Shortcut</th>
      <th class="text-token-text-tertiary text-left">Action</th>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'K'])}</td>
      <td>Open Keyboard Shortcut Modal</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '.'])}</td>
      <td>Open Settings</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'O'])}</td>
      <td>Open New Chat</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'X'])}</td>
      <td>Open Conversation Manager</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'P'])}</td>
      <td>Open Prompt Manager</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'Y'])}</td>
      <td>Open Gallery</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'F'])}</td>
      <td>Open Enhanced GPT Store</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'E'])}</td>
      <td>Open Note Manager</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'I'])}</td>
      <td>Open Custom Instruction Pofiles</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'M'])}</td>
      <td>Open Pinned Chats</td>
    </tr>

    <!--tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', ','])}</td>
      <td>Open Analytics</td>
    </tr -->

    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'L'])}</td>
      <td>Open Newsletter Archive</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'S'])}</td>
      <td>Toggle Sidebar</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '\u232B'])}</td>
      <td>Delete Current Conversation</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u2325', ']'])}</td>
      <td>Toggle sidebar folders</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '['])}</td>
      <td>Toggle sidebar notes</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '\u2325', 'M'])}</td>
      <td>Move Current Conversation to Folder</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '\u2325', 'E'])}</td>
      <td>Export Current Conversation</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '\u2325', 'R'])}</td>
      <td>Open a Random Conversation</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '\u2325', 'F'])}</td>
      <td>Toggle Current Conversation Favorite</td>
    </tr>

    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', 'C'])}</td>
      <td>Copy last response</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '\u2325', 'C'])}</td>
      <td>Copy last response (HTML)</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', 'P'])}</td>
      <td>Save current conversation as PDF</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u2318', '\u21E7', '\u2325', 'D'])}</td>
      <td>Save last response as PDF</td>
    </tr>


    <tr>
      <td>${buttonGenerator(['Home'])}</td>
      <td>Scroll to top</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u21E7', 'Home'])}</td>
      <td>Scroll up one message</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['Esc'])}</td>
      <td>Close Modals/Stop Generating</td>
    </tr>
    <tr>
      <td>${buttonGenerator(['\u21E7', 'End'])}</td>
      <td>Scroll down one message</td>
    </tr>
  </table>
  `;

  wrapper.appendChild(scrollable);
  return wrapper;
}

// ---------------------------------------------------------------------------
// keyboardShortcutsModalActions -- reuse settings actions
//
// Original: content.isolated.end.js line 12081
// ---------------------------------------------------------------------------

function keyboardShortcutsModalActions(): HTMLElement {
  return settingsModalActions();
}

// ---------------------------------------------------------------------------
// createKeyboardShortcutsModal
//
// Original: content.isolated.end.js line 11920
// ---------------------------------------------------------------------------

export function createKeyboardShortcutsModal(): void {
  const content = keyboardShortcutsModalContent();
  const actions = keyboardShortcutsModalActions();
  createModal(
    'Keyboard Shortcuts',
    'Some shortkeys only work when Auto-Sync is ON. Having issues? see our <a href="#" target="_blank" rel="noopener noreferrer" style="color:gold;">FAQ</a>',
    content,
    actions,
    false,
  );
}

// ===========================================================================
// Tab content / action functions
//
// Ported from content.isolated.end.js
// ===========================================================================

// ---------------------------------------------------------------------------
// promptManagerModalContent
//
// Original: content.isolated.end.js line 19705
// ---------------------------------------------------------------------------

export function promptManagerModalContent(): HTMLElement {
  resetPromptManagerParams();
  const el = document.createElement('div');
  el.id = 'modal-content-prompt-manager';
  el.style.cssText = 'overflow-y: hidden;position: relative;height:100%; width:100%';
  el.className = 'markdown prose-invert flex';

  const { managerSidebarWidth: sidebarW = 220 } = cachedSettings;
  const sidebar = document.createElement('div');
  sidebar.id = 'prompt-manager-sidebar';
  sidebar.style.cssText = `width:${sidebarW}px;min-width:220px;resize:horizontal;overflow:hidden;`;
  sidebar.className = 'bg-token-main-surface-primary border-e border-token-border-medium relative h-full';
  sidebar.appendChild(promptManagerSidebarContent());
  elementResizeObserver(sidebar, 'managerSidebarWidth');
  el.appendChild(sidebar);

  const main = document.createElement('div');
  main.id = 'prompt-manager-main-content';
  main.style.cssText = `width:calc(100% - ${sidebarW}px)`;
  main.className = 'overflow-y-auto h-full';
  main.appendChild(promptManagerMainContent());

  main.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!document.querySelector('.folder-dragging')) return;
    const folder = getLastSelectedPromptFolder();
    if (folder && isDefaultPromptFolder(folder.id)) return;
    (ev as DragEvent).dataTransfer!.dropEffect = 'move';
    main.classList.add('prompt-list-drag-hover');
  });
  main.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!document.querySelector('.folder-dragging')) return;
    const folder = getLastSelectedPromptFolder();
    if (folder && isDefaultPromptFolder(folder.id)) return;
    main.classList.remove('prompt-list-drag-hover');
  });
  main.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resetPromptManagerSelection();
    if (!document.querySelector('.folder-dragging')) return;
    const folder = getLastSelectedPromptFolder();
    if (!folder || isDefaultPromptFolder(folder.id)) return;
    main.classList.remove('prompt-list-drag-hover');
    let data: any;
    try {
      data = JSON.parse((ev as DragEvent).dataTransfer!.getData('text/plain'));
    } catch {
      return;
    }
    if (data && data.draggingObject === 'folder') {
      const f = data.folder;
      if (!f || f.id === folder?.id || promptBreadcrumbIncludesFolder(f.id)) return;
      movePromptFolder(f, folder.id);
    }
  });
  el.appendChild(main);
  return el;
}

// ---------------------------------------------------------------------------
// promptManagerModalActions
//
// Original: content.isolated.end.js line 19742
// ---------------------------------------------------------------------------

export function promptManagerModalActions(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'flex items-center justify-end w-full mt-2';
  const btn = document.createElement('button');
  btn.className = 'btn composer-submit-btn composer-submit-button-color';
  btn.innerText = translate('plus Add New Prompt');
  btn.addEventListener('click', () => {
    const folder = getLastSelectedPromptFolder();
    const folderId = folder?.id;
    const prompt = folderId != null ? { title: '', steps: [''], folder: { id: folderId } } : { title: '', steps: [''] };
    openPromptEditorModal(prompt as Parameters<typeof openPromptEditorModal>[0]);
  });
  el.appendChild(btn);
  return el;
}

// ---------------------------------------------------------------------------
// newsletterListModalContent
//
// Original: content.isolated.end.js line 14692
// ---------------------------------------------------------------------------

export function newsletterListModalContent(): HTMLElement {
  lastSelectedNewsletterCardId = null;
  const el = document.createElement('div');
  el.id = 'modal-content-newsletter-list';
  el.style.cssText = 'overflow-y: hidden;position: relative;height:100%; width:100%;';
  const article = document.createElement('article');
  article.id = 'newsletter-list';
  article.className =
    'grid grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 p-4 pb-32 overflow-y-auto h-full content-start';
  el.appendChild(article);
  return el;
}

// ---------------------------------------------------------------------------
// loadNewsletterList
//
// Original: content.isolated.end.js line 14605
// ---------------------------------------------------------------------------

export function loadNewsletterList(page = 1): void {
  chrome.runtime.sendMessage(
    {
      type: 'getNewsletters',
      detail: { page },
    },
    (response: any) => {
      const results = response.results;
      if (!results || !Array.isArray(results)) return;
      const list = document.querySelector('#newsletter-list');
      chrome.storage.local.get(['readNewsletterIds'], (stored: any) => {
        const readIds: string[] = stored.readNewsletterIds || [];
        for (let i = 0; i < results.length; i += 1) {
          const item = results[i];
          const isRead = readIds.includes(item.id);
          const card = createNewsletterCard(item, isRead);
          list?.appendChild(card);
          addNewsletterCardEventListeners(card, item);
          if (!readIds.includes(item.id) && i === 0 && page === 1) {
            card?.insertAdjacentElement('beforeend', animatePing('#ef4146'));
          }
        }
      });
      if (response.next) {
        list?.insertAdjacentHTML(
          'beforeend',
          '<div id="newsletter-list-loading" style="font-size:1em;">Loading...</div>',
        );
        const loadingEl = document.querySelector('#newsletter-list-loading');
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) {
              loadingEl?.remove();
              loadNewsletterList(page + 1);
              observer.disconnect();
            }
          },
          { threshold: 0.5 },
        );
        if (loadingEl) observer.observe(loadingEl);
      }
    },
  );
}

function addNewsletterCardEventListeners(card: HTMLElement, item: any): void {
  card.addEventListener('click', (ev) => {
    ev.preventDefault();
    closeMenus();
    updateSelectedNewsletterCard(item.id);
    chrome.runtime.sendMessage({ type: 'getNewsletter', detail: { id: item.id } }, (data: any) => {
      createAnnouncementModal(data);
      chrome.storage.local.get(['readNewsletterIds'], (stored: any) => {
        const readIds: string[] = stored.readNewsletterIds || [];
        if (!readIds.includes(item.id)) {
          chrome.runtime.sendMessage({
            type: 'incrementOpenRate',
            forceRefresh: true,
            detail: { announcementId: item.id },
          });
        }
        chrome.storage.local.set({ readNewsletterIds: [item.id, ...readIds.slice(0, 100)] }, () => {
          const el = document.querySelector(`#newsletter-card-${item.id}`);
          if (el) {
            el.classList.add('opacity-50');
            if (el.querySelector('#ping')) {
              el.querySelector('#ping')?.remove();
              const sideTab = document.querySelector('#modal-manager-side-tab-newsletters');
              sideTab?.querySelector('#ping')?.remove();
            }
            el.querySelector('#newsletter-read-indicator')?.classList?.replace('invisible', 'visible');
          }
        });
      });
    });
  });
}

function updateSelectedNewsletterCard(id: string | number): void {
  if (lastSelectedNewsletterCardId) {
    const prev = document.querySelector(
      `#modal-manager #newsletter-card-${lastSelectedNewsletterCardId}`,
    ) as HTMLElement | null;
    if (prev) prev.style.outline = 'none';
  }
  if (!id) return;
  const el = document.querySelector(`#modal-manager #newsletter-card-${id}`) as HTMLElement | null;
  lastSelectedNewsletterCardId = id;
  if (el) el.style.outline = `2px solid ${isDarkMode() ? '#fff' : '#000'}`;
}

let lastSelectedNewsletterCardId: string | number | null = null;

// ---------------------------------------------------------------------------
// customInstructionProfileManagerModalContent
//
// Original: content.isolated.end.js line 16264
// ---------------------------------------------------------------------------

export function customInstructionProfileManagerModalContent(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'modal-content-custom-instruction-profile-manager';
  el.className = 'markdown prose-invert relative h-full overflow-hidden';
  el.style.paddingBottom = '59px';

  const toolbar = document.createElement('div');
  toolbar.className =
    'flex items-center justify-between p-2 bg-token-main-surface-primary border-b border-token-border-medium sticky top-0 z-10';
  el.appendChild(toolbar);

  const searchInput = document.createElement('input');
  searchInput.id = 'custom-instruction-profile-manager-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = translate('Search profiles');
  searchInput.className =
    'text-token-text-primary bg-token-main-surface-secondary border border-token-border-medium text-sm rounded-md w-full h-10';
  searchInput.autocomplete = 'off';

  const debouncedSearch = debounce(() => {
    fetchCustomInstructionProfiles();
  });
  searchInput.addEventListener('input', (ev) => {
    const val = (ev.target as HTMLInputElement).value.trim();
    if (val !== '') {
      debouncedSearch();
    } else {
      fetchCustomInstructionProfiles();
    }
    const pill = document.querySelector('#custom-instruction-profile-manager-search-term-pill');
    const pillText = document.querySelector('#custom-instruction-profile-manager-search-term-pill-text');
    if (val !== '') {
      if (pillText) pillText.textContent = val;
      pill?.classList.remove('hidden');
    } else {
      if (pillText) pillText.textContent = '';
      pill?.classList.add('hidden');
    }
  });
  toolbar.appendChild(searchInput);

  const { selectedProfilesManagerSortBy: sortBy } = cachedSettings;
  const sortWrapper = document.createElement('div');
  sortWrapper.id = 'custom-instruction-profile-manager-sort-by-wrapper';
  sortWrapper.style.cssText = 'position:relative;width:150px;z-index:1000;margin-left:8px;';
  sortWrapper.innerHTML = dropdown(
    'Profiles-Manager-SortBy',
    profilesSortByList,
    (sortBy ?? null) as any,
    'code',
    'right',
  );
  toolbar.appendChild(sortWrapper);

  const viewBtn = profileCardCompactViewButton();
  toolbar.appendChild(viewBtn);

  const pill = document.createElement('div');
  pill.id = 'custom-instruction-profile-manager-search-term-pill';
  pill.className =
    'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 mt-2 ms-4 border border-token-border-medium max-w-fit';
  pill.innerHTML =
    '<button id="custom-instruction-profile-manager-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><span id="custom-instruction-profile-manager-search-term-pill-text" class="text-sm mx-1 text-danger"></span>';
  pill
    .querySelector('#custom-instruction-profile-manager-search-term-pill-clear-button')
    ?.addEventListener('click', () => {
      const input = document.querySelector(
        '#custom-instruction-profile-manager-search-input',
      ) as HTMLInputElement | null;
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
      }
    });
  el.appendChild(pill);

  const listEl = document.createElement('div');
  listEl.id = 'custom-instruction-profile-manager-profile-list';
  listEl.className =
    'grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 p-4 pb-32 overflow-y-auto h-full content-start';
  el.appendChild(listEl);
  return el;
}

// ---------------------------------------------------------------------------
// customInstructionProfileManagerModalActions
//
// Original: content.isolated.end.js line 16295
// ---------------------------------------------------------------------------

export function customInstructionProfileManagerModalActions(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'flex items-center justify-end w-full mt-2';
  const btn = document.createElement('button');
  btn.className = 'btn composer-submit-btn composer-submit-button-color';
  btn.innerText = translate('plus Add New Profile');
  btn.addEventListener('click', async (ev) => {
    if ((ev as MouseEvent).shiftKey) {
      chrome.storage.local.get(['customInstructionProfiles']).then((data: any) => {
        const json = JSON.stringify(data.customInstructionProfiles);
        const ta = document.createElement('textarea');
        ta.value = json;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copied to clipboard');
      });
      return;
    }
    const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
    const cards = document.querySelectorAll('#modal-manager div[id^="custom-instruction-profile-card-"]');
    if (!hasSub && cards.length >= 2) {
      errorUpgradeConfirmation({
        type: 'limit',
        title: 'You have reached the limit',
        message:
          'You have reached the limits of Custom Instruction Profiles with free account. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    createCustomInstructionProfileEditor();
  });
  el.appendChild(btn);
  return el;
}

// ---------------------------------------------------------------------------
// fetchCustomInstructionProfiles
//
// Original: content.isolated.end.js line 16416
// ---------------------------------------------------------------------------

export function fetchCustomInstructionProfiles(page = 1): void {
  const listEl = document.querySelector('#modal-manager #custom-instruction-profile-manager-profile-list');
  if (!listEl) return;
  if (page === 1) {
    listEl.innerHTML = '';
    listEl.appendChild(loadingSpinner('custom-instruction-profile-manager-main-content'));
  }
  const { selectedProfilesManagerSortBy: sortBy } = cachedSettings;
  const searchTerm = (
    document.querySelector(
      '#modal-manager [id=custom-instruction-profile-manager-search-input]',
    ) as HTMLInputElement | null
  )?.value;

  chrome.runtime.sendMessage(
    {
      type: 'getCustomInstructionProfiles',
      detail: { pageNumber: page, searchTerm, sortBy: (sortBy as any)?.code },
    },
    async (response: any) => {
      const results = response.results;
      if (!results || !Array.isArray(results)) return;
      const loadMore = document.querySelector('#modal-manager #load-more-profiles-button');
      if (loadMore) loadMore.remove();
      const spinner = document.querySelector(
        '#modal-manager #loading-spinner-custom-instruction-profile-manager-main-content',
      );
      if (spinner) spinner.remove();

      if (results.length === 0 && page === 1) {
        const p = document.createElement('p');
        p.id = 'no-profiles-found';
        p.style.cssText =
          'position:absolute;display:flex;justify-content:center;align-items:center;height:340px;width:100%;';
        p.innerText = translate('No profiles found');
        listEl.appendChild(p);
      } else {
        results.forEach((profile: any) => {
          const card = createCustomInstructionProfileCard(profile);
          listEl.appendChild(card);
          addCustomInstructionProfileCardEventListeners(profile);
        });
        const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
        if (!hasSub) {
          listEl.appendChild(managerUpgradeButton('custom-instruction-profiles', 'to see all profiles'));
          return;
        }
        if (response.next) {
          const loadBtn = document.createElement('button');
          loadBtn.id = 'load-more-profiles-button';
          loadBtn.className =
            'bg-token-main-surface-secondary p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary aspect-1 flex flex-col h-auto relative';
          loadBtn.appendChild(loadingSpinner('load-more-profiles-button'));
          listEl.appendChild(loadBtn);
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  fetchCustomInstructionProfiles(page + 1);
                  observer.disconnect();
                }
              });
            },
            { threshold: 0.5 },
          );
          if (loadBtn) observer.observe(loadBtn);
        }
      }
    },
  );
}

// ---------------------------------------------------------------------------
// pinnedMessageManagerModalContent
//
// Original: content.isolated.end.js line 19421
// ---------------------------------------------------------------------------

let lastSelectedPinnedMessageCardId = '';

function updateSelectedPinnedMessageCard(messageId: any): void {
  if (lastSelectedPinnedMessageCardId) {
    const prev = document.querySelector(
      `#modal-manager #pinned-message-card-${lastSelectedPinnedMessageCardId}`,
    ) as HTMLElement | null;
    if (prev) prev.style.outline = 'none';
  }
  if (!messageId) return;
  const card = document.querySelector(`#modal-manager #pinned-message-card-${messageId}`) as HTMLElement | null;
  lastSelectedPinnedMessageCardId = messageId;
  if (card) card.style.outline = `2px solid ${isDarkMode() ? '#fff' : '#000'}`;
}

export function pinnedMessageManagerModalContent(): HTMLElement {
  lastSelectedPinnedMessageCardId = '';
  const el = document.createElement('div');
  el.id = 'modal-content-pinned-message-manager';
  el.className = 'markdown prose-invert relative h-full overflow-hidden';
  el.style.paddingBottom = '59px';

  const toolbar = document.createElement('div');
  toolbar.className =
    'flex items-center justify-between p-2 bg-token-main-surface-primary border-b border-token-border-medium sticky top-0 z-10';
  el.appendChild(toolbar);

  const searchInput = document.createElement('input');
  searchInput.id = 'pinned-message-manager-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = translate('Search pinned messages');
  searchInput.className =
    'text-token-text-primary bg-token-main-surface-secondary border border-token-border-medium text-sm rounded-md w-full h-10';

  const debouncedSearch = debounce(() => {
    fetchPinnedMessages();
  });
  searchInput.addEventListener('input', (ev) => {
    const val = (ev.target as HTMLInputElement).value.trim();
    if (val !== '') {
      debouncedSearch();
    } else {
      fetchPinnedMessages();
    }
    const pill = document.querySelector('#pinned-message-manager-search-term-pill');
    const pillText = document.querySelector('#pinned-message-manager-search-term-pill-text');
    if (val !== '') {
      if (pillText) pillText.textContent = val;
      pill?.classList.remove('hidden');
    } else {
      if (pillText) pillText.textContent = '';
      pill?.classList.add('hidden');
    }
  });
  toolbar.appendChild(searchInput);

  const filtersRight = document.createElement('div');
  filtersRight.id = 'pinned-message-manager-filters-right-section';
  filtersRight.className = 'flex items-center';
  toolbar.appendChild(filtersRight);

  const viewBtn = pinnedMessageCardCompactViewButton();
  toolbar.appendChild(viewBtn);

  const pill = document.createElement('div');
  pill.id = 'pinned-message-manager-search-term-pill';
  pill.className =
    'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 mt-2 ms-4 border border-token-border-medium max-w-fit';
  pill.innerHTML =
    '<button id="pinned-message-manager-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><span id="pinned-message-manager-search-term-pill-text" class="text-sm mx-1 text-danger"></span>';
  pill.querySelector('#pinned-message-manager-search-term-pill-clear-button')?.addEventListener('click', () => {
    const input = document.querySelector('#pinned-message-manager-search-input') as HTMLInputElement | null;
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
  });
  el.appendChild(pill);

  const listEl = document.createElement('div');
  listEl.id = 'pinned-message-manager-pinned-message-list';
  listEl.className =
    'grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 p-4 pb-32 overflow-y-auto h-full content-start';
  el.appendChild(listEl);
  return el;
}

// ---------------------------------------------------------------------------
// fetchPinnedMessages
//
// Original: content.isolated.end.js line 19523
// ---------------------------------------------------------------------------

export function fetchPinnedMessages(page = 1): void {
  const listEl = document.querySelector('#modal-manager #pinned-message-manager-pinned-message-list');
  if (!listEl) return;
  if (page === 1) {
    listEl.innerHTML = '';
    listEl.appendChild(loadingSpinner('pinned-message-manager-main-content'));
  }
  const searchTerm = (
    document.querySelector('#modal-manager [id=pinned-message-manager-search-input]') as HTMLInputElement | null
  )?.value;

  chrome.runtime.sendMessage(
    {
      type: 'getPinnedMessages',
      detail: { pageNumber: page, searchTerm },
    },
    async (response: any) => {
      const results = response.results;
      if (!results || !Array.isArray(results)) return;
      const loadMore = document.querySelector('#modal-manager #load-more-pinned-messages-button');
      if (loadMore) loadMore.remove();
      const spinner = document.querySelector('#modal-manager #loading-spinner-pinned-message-manager-main-content');
      if (spinner) spinner.remove();

      if (results.length === 0 && page === 1) {
        const p = document.createElement('div');
        p.id = 'no-pinned-messages-found';
        p.style.cssText =
          'position:absolute;display:flex;justify-content:center;align-items:center;height:340px;width:100%;';
        p.textContent = translate('No pinned messages found');
        listEl.appendChild(p);
      } else {
        results.forEach((pm: any) => {
          const card = createPinnedMessageCard(pm);
          listEl.appendChild(card);
          addPinnedMessageCardEventListeners(pm);
        });
        const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
        if (!hasSub) {
          listEl.appendChild(managerUpgradeButton('pinned-messages', 'to see all pinned messages'));
          return;
        }
        if (response.next) {
          const loadBtn = document.createElement('button');
          loadBtn.id = 'load-more-pinned-messages-button';
          loadBtn.className =
            'bg-token-main-surface-secondary p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary aspect-1 flex flex-col h-auto relative';
          loadBtn.appendChild(loadingSpinner('load-more-pinned-messages-button'));
          listEl.appendChild(loadBtn);
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  fetchPinnedMessages(page + 1);
                  observer.disconnect();
                }
              });
            },
            { threshold: 0.5 },
          );
          if (loadBtn) observer.observe(loadBtn);
        }
      }
    },
  );
}

// ---------------------------------------------------------------------------
// inviteManagerModalContent
//
// Original: content.isolated.end.js line 21231
// ---------------------------------------------------------------------------

const statusMap: Record<string, { title: string; color: string }> = {
  invited: { title: 'Invitation Sent', color: '#e06c2b' },
  accepted: { title: 'Invite Accepted', color: '#2f80ed' },
  upgraded: { title: 'Upgraded to Pro', color: '#19c37d' },
};

export function inviteManagerModalContent(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'modal-content-invite-manager';
  el.style.cssText = 'overflow-y: hidden;position: relative;height:100%; width:100%';
  el.className = 'markdown prose-invert flex';
  el.appendChild(loadingSpinner('invite-manager-content'));

  chrome.runtime.sendMessage({ type: 'getInvites', detail: {} }, async (invites: any) => {
    let list = invites;
    if (!list || !Array.isArray(list)) list = [];
    el.innerHTML = '';

    if (list.length === 0) {
      el.innerHTML = `<div id="no-invites-found" class="flex items-center justify-center w-full h-full">
        <p class="text-gray-500">
          You have not sent any invites yet. Click on the "Invite A Friend" button to send an invite and track it here.
        </p>
      </div>`;
      return;
    }

    const listEl = document.createElement('div');
    listEl.id = 'invite-list';
    listEl.className = 'flex flex-col gap-4 w-full overflow-y-auto p-4';
    list.forEach((invite: any) => {
      const row = document.createElement('div');
      row.id = `invite-item-${invite.id}`;
      row.className = 'flex items-center justify-between p-4 bg-token-sidebar-surface-secondary rounded-lg shadow-md';
      const lastUpdate = invite.upgraded_at || invite.accepted_at || invite.created_at;
      const status = statusMap[invite.status] || { title: invite.status, color: '#999' };
      row.innerHTML = `
        <p class="font-semibold w-1/2">${invite.email}</p>
        <p class="text-sm py-1 px-4 rounded-full" style="background-color:${status.color}">${status.title}</p>
        <p class="text-gray-500 text-sm">Last update: ${new Date(lastUpdate).toLocaleString()}</p>
      `;
      listEl.appendChild(row);
    });
    el.appendChild(listEl);
  });

  return el;
}

// ---------------------------------------------------------------------------
// inviteManagerModalActions
//
// Original: content.isolated.end.js line 21259
// ---------------------------------------------------------------------------

export function inviteManagerModalActions(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'flex items-center justify-end w-full mt-2';
  const btn = document.createElement('button');
  btn.className = 'btn composer-submit-btn composer-submit-button-color';
  btn.innerText = translate('Invite A Friend');
  btn.addEventListener('click', () => {
    openInviteUserModal();
  });
  el.appendChild(btn);
  return el;
}

// ---------------------------------------------------------------------------
// showManagerSidebarSettingsMenu
//
// Original: content.isolated.end.js line 16072
// ---------------------------------------------------------------------------

export function showManagerSidebarSettingsMenu(button: HTMLElement, hasSub: boolean, showSyncStatus = false): void {
  const { right, top } = button.getBoundingClientRect();
  const x = right + 2;
  const y = top - 180;

  const html = `<div id="manager-sidebar-settings-menu" dir="ltr" style="position:fixed;left:0;top:0;transform:translate3d(${x}px,${y}px,0);min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" aria-orientation="vertical" data-state="open" dir="ltr" class="text-token-text-primary mt-2 min-w-[200px] max-w-xs rounded-2xl bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="outline:0;pointer-events:auto">

  <div role="menuitem" id="manager-settings-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Settings')}</div>

  <div role="menuitem" id="manager-keyboard-shortcuts-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Keyboard shortcuts')}</div>

  <div role="menuitem" id="manager-release-note-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Release note')}</div>

  <div role="menuitem" id="manager-help-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('Help')}</div>

  <div role="menuitem" id="manager-about-button" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1">${translate('About')}</div>
  <div id="conv-sync-status" class="text-xs m-1 px-2.5 ${showSyncStatus ? '' : 'hidden'}"></div>
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  addManagerSidebarSettingsMenuEventListeners(showSyncStatus);
}

function addManagerSidebarSettingsMenuEventListeners(showSyncStatus = false): void {
  const menu = document.querySelector('#manager-sidebar-settings-menu');
  const settingsBtn = document.querySelector('#manager-settings-button');
  const upgradeBtn = document.querySelector('#manager-upgrade-button');
  const subscriptionBtn = document.querySelector('#manager-subscription-button');
  const helpBtn = document.querySelector('#manager-help-button');
  const shortcutsBtn = document.querySelector('#manager-keyboard-shortcuts-button');
  const releaseNoteBtn = document.querySelector('#manager-release-note-button');
  const aboutBtn = document.querySelector('#manager-about-button');

  settingsBtn?.addEventListener('click', () => {
    menu?.remove();
    createSettingsModal();
  });
  upgradeBtn?.addEventListener('click', () => {
    menu?.remove();
    openUpgradeModal(false);
  });
  subscriptionBtn?.addEventListener('click', () => {
    menu?.remove();
    openUpgradeModal(true);
  });
  helpBtn?.addEventListener('click', () => {
    menu?.remove();
    showHelpModal();
  });
  shortcutsBtn?.addEventListener('click', () => {
    menu?.remove();
    createKeyboardShortcutsModal();
  });
  releaseNoteBtn?.addEventListener('click', () => {
    menu?.remove();
    const { version } = chrome.runtime.getManifest();
    createReleaseNoteModal(version);
  });
  aboutBtn?.addEventListener('click', () => {
    menu?.remove();
    showAboutModal();
  });

  if (showSyncStatus) {
    chrome.runtime.sendMessage({ type: 'getTotalConversationsCount', forceRefresh: true }, (total: number) => {
      chrome.runtime.sendMessage({ type: 'getSyncedConversationCount', forceRefresh: true }, (synced: number) => {
        const statusEl = document.querySelector('#conv-sync-status');
        if (statusEl) {
          statusEl.classList.remove('hidden');
          statusEl.textContent = `${synced} / ${total} ${translate('synced')}`;
        }
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Settings Wiring Test — run from the "Run Wiring Test" button in settings
// ---------------------------------------------------------------------------

type WiringResult = {
  tab: string;
  control: string;
  type: string;
  domId: string;
  exists: boolean;
  settingsKey: string | null;
  storageBound: boolean | string;
  notes: string;
};

async function runSettingsWiringTest(): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const results: WiringResult[] = [];

  async function getStoredSettings(): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (data: Record<string, unknown>) => {
        resolve((data.settings ?? {}) as Record<string, unknown>);
      });
    });
  }

  async function setStoredSettings(s: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings: s }, () => resolve());
    });
  }

  async function findTab(name: string): Promise<boolean> {
    // Tab buttons are created async (inside chrome.runtime.sendMessage callback),
    // so we may need to wait for them to appear.
    const target = name.toLowerCase().replace(/\s+/g, ' ');
    for (let attempt = 0; attempt < 30; attempt++) {
      // Only search buttons inside the settings modal
      const modal = document.querySelector('[id^="modal-settings"], [id^="modal-wrapper-settings"]');
      const scope = modal ?? document;
      for (const btn of scope.querySelectorAll('button')) {
        const t = (btn.textContent ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (t === target || t === target.replace('-', ' ')) {
          btn.click();
          // Wait for new tab content to render with switches
          for (let w = 0; w < 15; w++) {
            await sleep(200);
            const content = document.querySelector('#settings-modal-tab-content');
            if (content && content.querySelector('.sp-switch')) return true;
          }
          return true;
        }
      }
      await sleep(200);
    }
    console.warn(`[SP Test] Could not find tab: "${name}"`);
    return false;
  }

  async function testToggle(tab: string, label: string, key: string | null, id: string): Promise<void> {
    let input = document.querySelector(`#${CSS.escape(id)}`) as HTMLInputElement | null;
    if (!input) {
      const alt = 'switch-' + label.toLowerCase().replaceAll(' ', '-');
      input = document.querySelector(`#${CSS.escape(alt)}`) as HTMLInputElement | null;
      if (input) id = alt;
    }
    if (!input) {
      results.push({
        tab,
        control: label,
        type: 'toggle',
        domId: id,
        exists: false,
        settingsKey: key,
        storageBound: 'n/a',
        notes: 'NOT FOUND',
      });
      return;
    }
    if (!key) {
      results.push({
        tab,
        control: label,
        type: 'toggle',
        domId: id,
        exists: true,
        settingsKey: null,
        storageBound: 'n/a',
        notes: 'DOM-only',
      });
      return;
    }
    const before = await getStoredSettings();
    const orig = before[key];
    const was = input.checked;
    input.checked = !was;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
    const after = await getStoredSettings();
    const bound = after[key] !== orig;
    input.checked = was;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
    const r = await getStoredSettings();
    r[key] = orig;
    await setStoredSettings(r);
    results.push({
      tab,
      control: label,
      type: 'toggle',
      domId: id,
      exists: true,
      settingsKey: key,
      storageBound: bound,
      notes: bound ? '' : 'STORAGE UNCHANGED',
    });
  }

  async function testNumber(tab: string, label: string, key: string, id: string): Promise<void> {
    const input = document.querySelector(`#${CSS.escape(id)}`) as HTMLInputElement | null;
    if (!input) {
      results.push({
        tab,
        control: label,
        type: 'number',
        domId: id,
        exists: false,
        settingsKey: key,
        storageBound: 'n/a',
        notes: 'NOT FOUND',
      });
      return;
    }
    const before = await getStoredSettings();
    const orig = before[key];
    const old = input.value;
    input.value = String(Number(old) + 1);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(400);
    const after = await getStoredSettings();
    const bound = after[key] !== orig;
    input.value = old;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
    const r = await getStoredSettings();
    r[key] = orig;
    await setStoredSettings(r);
    results.push({
      tab,
      control: label,
      type: 'number',
      domId: id,
      exists: true,
      settingsKey: key,
      storageBound: bound,
      notes: bound ? '' : 'STORAGE UNCHANGED',
    });
  }

  async function testTextarea(tab: string, label: string, key: string, id: string): Promise<void> {
    const el = document.querySelector(`#${CSS.escape(id)}`) as HTMLTextAreaElement | null;
    if (!el) {
      results.push({
        tab,
        control: label,
        type: 'textarea',
        domId: id,
        exists: false,
        settingsKey: key,
        storageBound: 'n/a',
        notes: 'NOT FOUND',
      });
      return;
    }
    const before = await getStoredSettings();
    const orig = before[key];
    const old = el.value;
    el.value = old + '__TEST__';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(400);
    const after = await getStoredSettings();
    const bound = after[key] !== orig;
    el.value = old;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    const r = await getStoredSettings();
    r[key] = orig;
    await setStoredSettings(r);
    results.push({
      tab,
      control: label,
      type: 'textarea',
      domId: id,
      exists: true,
      settingsKey: key,
      storageBound: bound,
      notes: bound ? '' : 'STORAGE UNCHANGED',
    });
  }

  async function testCheckbox(tab: string, label: string, key: string, id: string): Promise<void> {
    const input = document.querySelector(`#${CSS.escape(id)}`) as HTMLInputElement | null;
    if (!input) {
      results.push({
        tab,
        control: label,
        type: 'checkbox',
        domId: id,
        exists: false,
        settingsKey: key,
        storageBound: 'n/a',
        notes: 'NOT FOUND',
      });
      return;
    }
    const before = await getStoredSettings();
    const orig = before[key];
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
    const after = await getStoredSettings();
    const bound = after[key] !== orig;
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
    const r = await getStoredSettings();
    r[key] = orig;
    await setStoredSettings(r);
    results.push({
      tab,
      control: label,
      type: 'checkbox',
      domId: id,
      exists: true,
      settingsKey: key,
      storageBound: bound,
      notes: bound ? '' : 'STORAGE UNCHANGED',
    });
  }

  function testExists(tab: string, label: string, type: string, sel: string, note = ''): void {
    const el = document.querySelector(sel);
    results.push({
      tab,
      control: label,
      type,
      domId: sel,
      exists: !!el,
      settingsKey: null,
      storageBound: 'n/a',
      notes: el ? note : 'NOT FOUND',
    });
  }

  // Save snapshot
  const snapshot = await getStoredSettings();

  // --- General ---
  await findTab('general');
  testExists('General', 'Dark Mode Toggle', 'custom', '.sp-switch', 'DOM-only');
  await testToggle('General', 'Auto Reload on Update', 'autoReloadOnUpdate', 'switch-auto-reload-on-update');
  await testToggle('General', 'Hide Release Note', 'hideReleaseNote', 'switch-hide-release-note');
  await testToggle('General', 'Hide Update Notification', 'hideUpdateNotification', 'switch-hide-update-notification');
  await testToggle('General', 'Hide Daily Newsletter', 'hideNewsletter', 'switch-hide-daily-newsletter');

  // --- Conversation ---
  await findTab('conversation');
  await testToggle(
    'Conversation',
    'Custom Conversation Width',
    'customConversationWidth',
    'switch-custom-conversation-width',
  );
  await testNumber('Conversation', 'Conversation Width', 'conversationWidth', 'conversation-width-input');
  await testToggle('Conversation', 'Auto Delete', 'autoDelete', 'switch-auto-delete');
  await testNumber('Conversation', 'Auto Delete Days', 'autoDeleteNumDays', 'auto-delete-input');
  await testCheckbox(
    'Conversation',
    'Auto Delete Exclude Folders',
    'autoDeleteExcludeFolders',
    'auto-delete-exclude-folders-input',
  );
  await testToggle('Conversation', 'Auto Archive', 'autoArchive', 'switch-auto-archive');
  await testNumber('Conversation', 'Auto Archive Days', 'autoArchiveNumDays', 'auto-archive-input');
  await testCheckbox(
    'Conversation',
    'Auto Archive Exclude Folders',
    'autoArchiveExcludeFolders',
    'auto-archive-exclude-folders-input',
  );
  await testToggle('Conversation', 'Auto Hide Messages', 'autoHideOldMessages', 'switch-auto-hide-messages');
  await testNumber(
    'Conversation',
    'Auto Hide Threshold',
    'autoHideOldMessagesThreshold',
    'auto-hide-old-messages-threshold-input',
  );
  await testNumber(
    'Conversation',
    'Auto Hide Recent',
    'autoHideOldMessagesRecent',
    'auto-hide-old-messages-recent-input',
  );
  await testToggle(
    'Conversation',
    'Show Msg Visibility Buttons',
    'showMessageVisibilityToggleButtons',
    'switch-show-message-visibility-toggle-buttons',
  );
  await testToggle('Conversation', 'Show Mini Map', 'showMiniMap', 'switch-show-mini-map');
  await testToggle(
    'Conversation',
    'Show Sidebar Note Button',
    'showSidebarNoteButton',
    'switch-show-sidebar-note-button',
  );
  await testToggle(
    'Conversation',
    'Override Model Switcher',
    'overrideModelSwitcher',
    'switch-override-model-switcher',
  );
  await testToggle('Conversation', 'Show Language Selector', 'showLanguageSelector', 'switch-show-language-selector');
  await testToggle(
    'Conversation',
    'Show Writing Style Selector',
    'showWritingStyleSelector',
    'switch-show-writing-style-selector',
  );
  await testToggle('Conversation', 'Show Tone Selector', 'showToneSelector', 'switch-show-tone-selector');
  await testToggle('Conversation', 'Auto Reset Top Navbar', 'autoResetTopNav', 'switch-auto-reset-top-navbar');
  await testToggle(
    'Conversation',
    'Show Msg Char/Word Count',
    'showMessageCharWordCount',
    'switch-show-message-char/word-count',
  );
  await testToggle('Conversation', 'Show Message Timestamp', 'showMessageTimestamp', 'switch-show-message-timestamp');
  await testToggle(
    'Conversation',
    'Show Date Dividers',
    'showDateDividersInConversation',
    'switch-show-date-dividers-in-conversation',
  );
  await testToggle('Conversation', 'Sound Alarm', 'chatEndedSound', 'switch-sound-alarm');
  await testToggle('Conversation', 'Animate Favicon', 'animateFavicon', 'switch-animate-favicon');
  await testToggle('Conversation', 'Copy mode', 'copyMode', 'switch-copy-mode');

  // --- Folders ---
  await findTab('folders');
  await testToggle('Folders', 'Auto Folder Custom GPTs', 'autoFolderCustomGPTs', 'switch-auto-folder-custom-gpts');
  await testToggle(
    'Folders',
    'Show Sidebar Folder Button',
    'showSidebarFolderButton',
    'switch-show-sidebar-folder-button',
  );
  await testToggle(
    'Folders',
    'Show Folders in Left Sidebar',
    'showFoldersInLeftSidebar',
    'switch-show-folders-in-left-sidebar',
  );
  await testToggle(
    'Folders',
    'Exclude Convs in Folders',
    'excludeConvInFolders',
    'switch-exclude-conversations-in-folders',
  );
  await testToggle(
    'Folders',
    'Show Conv Timestamp in Sidebar',
    'showConversationTimestampInSidebar',
    'switch-show-conversation-timestamp-in-sidebar',
  );
  await testToggle(
    'Folders',
    'Show Conv Indicators in Sidebar',
    'showConversationIndicatorsInSidebar',
    'switch-show-conversation-indicators-in-sidebar',
  );

  // --- Voice ---
  await findTab('voice');
  await sleep(1000);
  testExists('Voice', 'TTS Voice Dropdown', 'dropdown', '#tts-voice-selector-wrapper');
  testExists('Voice', 'Test Audio Button', 'button', 'button.composer-submit-btn');
  await testToggle('Voice', 'Auto Speak', 'autoSpeak', 'switch-auto-speak');
  await testToggle(
    'Voice',
    'Enable STT Shortkey',
    'enableSpeechToTextShortkey',
    'switch-enable-speech-to-text-shortkey',
  );
  await testToggle('Voice', 'Interim Results', 'speechToTextInterimResults', 'switch-interim-results');
  await testToggle(
    'Voice',
    'Auto Submit on Alt Release',
    'autoSubmitWhenReleaseAlt',
    'switch-auto-submit-when-release-alt',
  );

  // --- Prompt Input ---
  await findTab('prompt input');
  await testToggle(
    'Prompt Input',
    'Recent Prompts Shortkey',
    'promptHistoryUpDownKey',
    'switch-recent-prompts-shortkey',
  );
  await testToggle(
    'Prompt Input',
    'Show Memory Toggles',
    'showMemoryTogglesInInput',
    'switch-show-memory-toggles-in-input',
  );
  await testToggle(
    'Prompt Input',
    'Show Prompt Optimizer Btn',
    'showPromptRewriterButtonInInput',
    'switch-show-prompt-optimizer-button-in-input',
  );
  await testToggle(
    'Prompt Input',
    'Show Last Chain Actions',
    'showRerunLastPromptChainButton',
    'switch-show-last-prompt-chain-actions',
  );
  await testToggle(
    'Prompt Input',
    'Show Favorite Prompts Btn',
    'showFavoritePromptsButton',
    'switch-show-favorite-prompts-button',
  );
  await testToggle(
    'Prompt Input',
    'Show CI Profile Selector',
    'showCustomInstructionProfileSelector',
    'switch-show-custom-instruction-profile-selector',
  );
  await testToggle('Prompt Input', 'Auto Continue', 'autoContinueWhenPossible', 'switch-auto-continue-when-available');
  await testToggle('Prompt Input', 'Prompt Template', 'promptTemplate', 'switch-prompt-template');
  await testToggle('Prompt Input', 'Submit on Enter', 'submitPromptOnEnter', 'switch-submit-prompt-on-enter');

  // --- Splitter ---
  await findTab('splitter');
  await testToggle('Splitter', 'Auto Split', 'autoSplit', 'switch-auto-split');
  await testToggle('Splitter', 'Auto Summarize', 'autoSummarize', 'switch-auto-summarize');
  await testNumber('Splitter', 'Chunk Size', 'autoSplitLimit', 'split-prompt-limit-input');
  await testTextarea('Splitter', 'Split Prompt', 'autoSplitInitialPrompt', 'split-initial-prompt-textarea');
  await testTextarea('Splitter', 'Chunk Prompt', 'autoSplitChunkPrompt', 'split-chunk-prompt-textarea');

  // Restore
  await setStoredSettings(snapshot);

  // --- Show results in-page ---
  const total = results.length;
  const pass = results.filter((r) => r.exists && (r.storageBound === true || r.storageBound === 'n/a')).length;
  const fail = total - pass;

  const overlay = document.createElement('div');
  overlay.id = 'sp-wiring-test-results';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const box = document.createElement('div');
  box.style.cssText =
    'background:#1e1e1e;color:#eee;border-radius:12px;padding:24px;max-width:800px;width:90%;max-height:80vh;overflow-y:auto;font-family:monospace;font-size:13px;';

  let html = `<h2 style="margin:0 0 12px;font-size:18px;color:#ffd700;">Settings Wiring Test Report</h2>`;
  html += `<div style="margin-bottom:16px;font-size:14px;">Total: <b>${total}</b> | Pass: <b style="color:#4caf50;">${pass}</b> | Fail: <b style="color:#f44336;">${fail}</b></div>`;

  html += `<table style="width:100%;border-collapse:collapse;"><tr style="background:#333;"><th style="text-align:left;padding:6px;">Tab</th><th style="text-align:left;padding:6px;">Control</th><th style="text-align:left;padding:6px;">Type</th><th style="padding:6px;">Exists</th><th style="padding:6px;">Wired</th><th style="text-align:left;padding:6px;">Notes</th></tr>`;

  for (const r of results) {
    const existsIcon = r.exists ? '\u2705' : '\u274C';
    const wiredIcon = r.storageBound === true ? '\u2705' : r.storageBound === false ? '\u274C' : '\u2014';
    const rowBg = !r.exists || r.storageBound === false ? 'background:rgba(244,67,54,0.15);' : '';
    html += `<tr style="border-bottom:1px solid #333;${rowBg}"><td style="padding:4px 6px;">${r.tab}</td><td style="padding:4px 6px;">${r.control}</td><td style="padding:4px 6px;">${r.type}</td><td style="padding:4px 6px;text-align:center;">${existsIcon}</td><td style="padding:4px 6px;text-align:center;">${wiredIcon}</td><td style="padding:4px 6px;color:#999;">${r.notes}</td></tr>`;
  }
  html += '</table>';
  html += '<p style="margin-top:16px;color:#999;font-size:11px;">Click outside to close</p>';

  box.innerHTML = html;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
