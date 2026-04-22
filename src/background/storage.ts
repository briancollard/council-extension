/**
 * Chrome storage abstraction layer.
 *
 * Wraps chrome.storage.sync and chrome.storage.local with Promise-based
 * helpers so the rest of the codebase can use async/await.
 *
 * Original source: initialize.js storage helpers + initializeStorageOnInstall()
 */

// ---------------------------------------------------------------------------
// chrome.storage.sync  (small data, synced across devices, 100 KB total)
// ---------------------------------------------------------------------------

export async function getFromSync<T = unknown>(key: string): Promise<T | undefined>;
export async function getFromSync<T = unknown>(keys: string[]): Promise<Record<string, T>>;
export async function getFromSync<T = unknown>(
  keyOrKeys: string | string[],
): Promise<T | undefined | Record<string, T>> {
  const result = await chrome.storage.sync.get(keyOrKeys);
  if (typeof keyOrKeys === 'string') return result[keyOrKeys] as T | undefined;
  return result as Record<string, T>;
}

export async function setToSync(items: Record<string, unknown>): Promise<void>;
export async function setToSync(key: string, value: unknown): Promise<void>;
export async function setToSync(keyOrItems: string | Record<string, unknown>, value?: unknown): Promise<void> {
  if (typeof keyOrItems === 'string') {
    await chrome.storage.sync.set({ [keyOrItems]: value });
  } else {
    await chrome.storage.sync.set(keyOrItems);
  }
}

export async function removeFromSync(...keys: string[]): Promise<void> {
  await chrome.storage.sync.remove(keys);
}

// ---------------------------------------------------------------------------
// chrome.storage.local  (large data, device-local, unlimited with permission)
// ---------------------------------------------------------------------------

export async function getFromLocal<T = unknown>(key: string): Promise<T | undefined>;
export async function getFromLocal<T = unknown>(keys: string[]): Promise<Record<string, T>>;
export async function getFromLocal<T = unknown>(
  keyOrKeys: string | string[],
): Promise<T | undefined | Record<string, T>> {
  const result = await chrome.storage.local.get(keyOrKeys);
  if (typeof keyOrKeys === 'string') return result[keyOrKeys] as T | undefined;
  return result as Record<string, T>;
}

export async function setToLocal(items: Record<string, unknown>): Promise<void>;
export async function setToLocal(key: string, value: unknown): Promise<void>;
export async function setToLocal(keyOrItems: string | Record<string, unknown>, value?: unknown): Promise<void> {
  if (typeof keyOrItems === 'string') {
    await chrome.storage.local.set({ [keyOrItems]: value });
  } else {
    await chrome.storage.local.set(keyOrItems);
  }
}

export async function removeFromLocal(...keys: string[]): Promise<void> {
  await chrome.storage.local.remove(keys);
}

// ---------------------------------------------------------------------------
// Bulk helpers
// ---------------------------------------------------------------------------

export async function clearLocal(): Promise<void> {
  await chrome.storage.local.clear();
}

export async function clearSync(): Promise<void> {
  await chrome.storage.sync.clear();
}

// ---------------------------------------------------------------------------
// Default settings (written on install)
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  councilIsEnabled: true,
  animateFavicon: false,
  dontShowPromptManagerMoveHelper: false,
  promptHistoryUpDownKey: true,
  copyMode: false,
  autoResetTopNav: true,
  showFavoritePromptsButton: true,
  hideNewsletter: true,
  hideReleaseNote: true,
  hideUpdateNotification: false,
  chatEndedSound: false,
  customConversationWidth: false,
  conversationWidth: 50,
  submitPromptOnEnter: true,
  promptTemplate: true,
  autoClick: false,
  showLanguageSelector: false,
  showToneSelector: false,
  showWritingStyleSelector: false,
  selectedLanguage: { code: 'default', name: 'Default' },
  selectedTone: {
    code: 'default',
    name: 'Default',
    description: 'No specific tone instruction',
  },
  selectedWritingStyle: {
    code: 'default',
    name: 'Default',
    description: 'No specific writing style instruction',
  },
  selectedNotesSortBy: { name: 'Update date', code: 'updated_at' },
  selectedNotesView: 'grid',
  selectedConversationsManagerSortBy: { name: 'Update date', code: 'updated_at' },
  selectedPromptsManagerSortBy: { name: 'Update date', code: 'updated_at' },
  selectedPromptsManagerTag: { name: 'All', code: 'all' },
  selectedPromptsManagerLanguage: { name: 'All', code: 'all' },
  selectedPromptEditorLanguage: { name: 'Select', code: 'select' },
  autoContinueWhenPossible: true,
  autoSpeak: false,
  enableSpeechToTextShortkey: true,
  speechToTextLanguage: { name: 'English (United Kingdom)', code: 'en-GB' },
  speechToTextInterimResults: true,
  autoSubmitWhenReleaseAlt: false,
  managerSidebarWidth: 220,
  excludeConvInFolders: false,
  autoReloadOnUpdate: true,
  showSidebarNoteButton: true,
  showSidebarFolderButton: true,
  showMemoryTogglesInInput: true,
  showRerunLastPromptChainButton: true,
  showPromptRewriterButtonInInput: true,
  rewriteTone: 'as-is',
  rewriteLength: 'as-is',
  selectedRewriteContext: 'clarity',
  customRewriteContext: '',
  showMessageTimestamp: false,
  showMessageCharWordCount: false,
  showConversationTimestampInSidebar: true,
  showConversationIndicatorsInSidebar: true,
  showCustomInstructionProfileSelector: true,
  autoFolderCustomGPTs: false,
  showFoldersInLeftSidebar: false,
  syncGizmos: false,
  sidebysideVoice: false,
  showMiniMap: false,
  overrideModelSwitcher: false,
  syncProjects: false,
  syncHistoryResponses: true,
  triggerEndOfConvOnEvent: false,
  autoDelete: false,
  autoDeleteNumDays: 7,
  autoDeleteExcludeFolders: true,
  autoArchive: false,
  autoArchiveNumDays: 7,
  autoArchiveExcludeFolders: true,
  autoHideOldMessages: false,
  autoHideOldMessagesThreshold: 10,
  autoHideOldMessagesRecent: 2,
  showMessageVisibilityToggleButtons: false,
  showDateDividersInConversation: false,
  autoSummarize: false,
  autoSplit: false,
  autoSplitLimit: 24_000,
  autoSplitInitialPrompt: `Act like a document/text loader until you load and remember the content of the next text/s or document/s.
There might be multiple files, each file is marked by name in the format ### DOCUMENT NAME.
I will send them to you in chunks. Each chunk starts will be noted as [START CHUNK x/TOTAL], and the end of this chunk will be noted as [END CHUNK x/TOTAL], where x is the number of current chunks, and TOTAL is the number of all chunks I will send you.
I will split the message in chunks, and send them to you one by one. For each message follow the instructions at the end of the message.
Let's begin:

`,
  autoSplitChunkPrompt: `Reply with OK: [CHUNK x/TOTAL]
Don't reply with anything else!`,
} as const;

export function initializeStorageOnInstall(): void {
  chrome.storage.local.set({
    account: {},
    lastSelectedConversation: null,
    customInstructionProfiles: [],
    gizmoDiscovery: {},
    models: [],
    selecteModel: null,
    readNewsletterIds: [],
    userInputValueHistory: [],
    settings: { ...DEFAULT_SETTINGS },
  });
}
