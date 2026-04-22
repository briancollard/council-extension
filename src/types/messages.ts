/**
 * Background message type definitions.
 *
 * The extension uses `chrome.runtime.sendMessage` with a discriminated
 * `{ type, detail?, forceRefresh? }` pattern. The background service worker
 * dispatches on `type` to call the appropriate handler function.
 *
 * Rather than defining 103 individual interfaces (one per message type),
 * this file uses a string-union approach with a generic message shape.
 *
 * @see extension-source-beautified/scripts/background/initialize.js lines 2441-2819
 * @see docs/extraction-report.md "Background Message Types (103 total)"
 */

// ---------------------------------------------------------------------------
// Message type string unions — grouped by feature domain
// ---------------------------------------------------------------------------

/** Subscription / auth management messages. */
export type SubscriptionMessageType = 'setAccessToken' | 'checkHasSubscription';

/** Conversation folder CRUD and queries. */
export type FolderMessageType =
  | 'getConversationFolder'
  | 'getFolderForConversationId'
  | 'getConversationFolderByGizmoId'
  | 'getConversationFolders'
  | 'addConversationFolders'
  | 'updateConversationFolder'
  | 'deleteConversationFolders'
  | 'getConversationFolderDescription'
  | 'updateConversationFolderDescription'
  | 'removeConversationFolderImage'
  | 'moveConversationsToFolder'
  | 'removeConversationsFromFolder'
  | 'moveConversationIdsToFolder';

/** Conversation CRUD, search, and bulk operations. */
export type ConversationMessageType =
  | 'getConversations'
  | 'getConversation'
  | 'getConversationIds'
  | 'getNonSyncedConversationIds'
  | 'getNonSyncedConversationCount'
  | 'getSyncedConversationCount'
  | 'getTotalConversationsCount'
  | 'getTotalArchivedConversationsCount'
  | 'getAllFavoriteConversationIds'
  | 'getAllFolderConversationIds'
  | 'getAllNoteConversationIds'
  | 'getRandomConversationId'
  | 'addConversations'
  | 'addConversation'
  | 'renameConversation'
  | 'toggleConversationFavorite'
  | 'updateConversationProject'
  | 'resetAllFavoriteConversations'
  | 'deleteConversations'
  | 'deleteAllConversations'
  | 'deleteAllArchivedConversations'
  | 'archiveConversations'
  | 'unarchiveConversations'
  | 'archiveAllConversations'
  | 'addTextdocs';

/** Custom instruction profile messages. */
export type ProfileMessageType =
  | 'getCustomInstructionProfile'
  | 'getEnabledCustomInstructionProfile'
  | 'getCustomInstructionProfiles'
  | 'addCustomInstructionProfile'
  | 'updateCustomInstructionProfile'
  | 'updateEnabledCustomInstructionProfile'
  | 'updateCustomInstructionProfileByData'
  | 'duplicateCustomInstructionProfile'
  | 'deleteCustomInstructionProfile';

/** Pinned message messages. */
export type PinnedMessageMessageType =
  | 'getPinnedMessages'
  | 'getAllPinnedMessagesByConversationId'
  | 'addPinnedMessages'
  | 'addPinnedMessage'
  | 'deletePinnedMessage';

/** Prompt CRUD, search, folders, favorites. */
export type PromptMessageType =
  | 'addPrompts'
  | 'addPromptAttachment'
  | 'updatePrompt'
  | 'getPrompt'
  | 'getPromptAttachment'
  | 'getPromptsCount'
  | 'getPrompts'
  | 'getAllPrompts'
  | 'getPromptByTitle'
  | 'getAllFavoritePrompts'
  | 'deletePrompts'
  | 'movePrompts'
  | 'togglePromptPublic'
  | 'toggleFavoritePrompt'
  | 'resetAllFavoritePrompts'
  | 'setDefaultFavoritePrompt'
  | 'getDefaultFavoritePrompt'
  | 'duplicatePrompt'
  | 'incrementPromptUseCount'
  | 'votePrompt'
  | 'reportPrompt'
  | 'getPromptTags';

/** Prompt folder messages. */
export type PromptFolderMessageType =
  | 'getPromptFolders'
  | 'getAllPromptFolders'
  | 'addPromptFolders'
  | 'deletePromptFolder'
  | 'updatePromptFolder'
  | 'removePromptFolderImage';

/** Note CRUD messages. */
export type NoteMessageType = 'updateNote' | 'renameNote' | 'deleteNote' | 'getNote' | 'getNoteForIds' | 'getNotes';

/** Newsletter / announcements messages. */
export type NewsletterMessageType =
  | 'getNewsletters'
  | 'getNewsletter'
  | 'getLatestNewsletter'
  | 'getReleaseNote'
  | 'getLatestVersion'
  | 'getLatestAnnouncement'
  | 'openPromoLink'
  | 'incrementOpenRate'
  | 'incrementClickRate'
  | 'incrementPromoLinkClickRate';

/** Gizmo (Custom GPT) / GPT Store messages. */
export type GizmoMessageType =
  | 'getRandomGizmo'
  | 'getCouncilGizmos'
  | 'submitCouncilGizmos'
  | 'updateGizmoMetrics'
  | 'deleteCouncilGizmo';

/** Gallery image messages. */
export type GalleryMessageType =
  | 'addGalleryImages'
  | 'uploadImageToGallery'
  | 'getGalleryImages'
  | 'getSelectedGalleryImages'
  | 'getGalleryImagesByDateRange'
  | 'deleteGalleryImages'
  | 'shareGalleryImages'
  | 'downloadImage';

/** Sync-related messages. */
export type SyncMessageType = 'initializeConversationSync' | 'initConvHistorySync';

/** Settings messages. */
export type SettingsMessageType = 'getRemoteSettings';

/** Invite messages. */
export type InviteMessageType = 'getInvites' | 'sendInvite';

/** Context menu messages. */
export type ContextMenuMessageType = 'resetContextMenu';

/** Cache management messages. */
export type CacheMessageType = 'clearCaches' | 'clearAllCache';

/** Storage messages. */
export type StorageMessageType = 'flushStorage';

/** AI rewriting / prompting messages. */
export type SuperAIMessageType = 'rewritePrompt' | 'prompt' | 'promptSameLanguage';

/** Extension lifecycle messages. */
export type ExtensionMessageType = 'reloadExtension';

// ---------------------------------------------------------------------------
// Combined union of ALL background message types
// ---------------------------------------------------------------------------

/**
 * Discriminated union of every known `chrome.runtime.sendMessage` type.
 *
 * Use this as the type for the `type` field in a `BackgroundMessage`.
 */
export type BackgroundMessageType =
  | SubscriptionMessageType
  | FolderMessageType
  | ConversationMessageType
  | ProfileMessageType
  | PinnedMessageMessageType
  | PromptMessageType
  | PromptFolderMessageType
  | NoteMessageType
  | NewsletterMessageType
  | GizmoMessageType
  | GalleryMessageType
  | SyncMessageType
  | SettingsMessageType
  | InviteMessageType
  | ContextMenuMessageType
  | CacheMessageType
  | StorageMessageType
  | SuperAIMessageType
  | ExtensionMessageType;

// ---------------------------------------------------------------------------
// Message shape
// ---------------------------------------------------------------------------

/**
 * A message sent via `chrome.runtime.sendMessage()` from a content script
 * to the background service worker.
 *
 * @template D - Type of the `detail` payload. Defaults to `Record<string, unknown>`.
 */
export interface BackgroundMessage<D = Record<string, unknown>> {
  /** The message type discriminator, dispatched via a long if/else chain in the background. */
  type: BackgroundMessageType;
  /**
   * Payload data for the message. The shape depends on `type`.
   * For example, `getConversation` expects `{ conversationId: string }`.
   */
  detail?: D;
  /** When true, bypass the in-memory response cache and fetch fresh data. */
  forceRefresh?: boolean;
}

// ---------------------------------------------------------------------------
// Tab-to-content messages (background → content script)
// ---------------------------------------------------------------------------

/**
 * Messages sent from the background to a content script tab via
 * `chrome.tabs.sendMessage()`.
 */
export type TabMessageType =
  | 'updateAvailable'
  | 'insertScreenshot'
  | 'insertImage'
  | 'insertPrompt'
  | 'syncIsDone'
  | 'syncProgress'
  | 'syncError';

/** A message sent from the background to a specific tab's content script. */
export interface TabMessage<D = Record<string, unknown>> {
  type: TabMessageType;
  detail?: D;
}

// ---------------------------------------------------------------------------
// Commonly used detail payloads
// ---------------------------------------------------------------------------

/** Detail for `setAccessToken`. */
export interface SetAccessTokenDetail {
  accessToken: string;
}

/** Detail for `getConversation`. */
export interface GetConversationDetail {
  conversationId: string;
}

/** Detail for `getConversations`. */
export interface GetConversationsDetail {
  folderId?: string | number;
  sortBy?: string;
  pageNumber?: number;
  fullSearch?: boolean;
  searchTerm?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  excludeConvInFolders?: boolean;
}

/** Detail for `getConversationFolder`. */
export interface GetConversationFolderDetail {
  folderId: string | number;
}

/** Detail for `getConversationFolders`. */
export interface GetConversationFoldersDetail {
  parentFolderId?: string | number;
  sortBy?: string;
  searchTerm?: string;
}

/** Detail for `addConversationFolders`. */
export interface AddConversationFoldersDetail {
  folders: Array<{ name: string; color?: string; parent_folder_id?: string | number }>;
}

/** Detail for `updateConversationFolder`. */
export interface UpdateConversationFolderDetail {
  folderId: string | number;
  newData: Record<string, unknown>;
}

/** Detail for `moveConversationsToFolder`. */
export interface MoveConversationsToFolderDetail {
  folderId: string | number;
  conversations: Array<{ conversation_id: string }>;
}

/** Detail for `moveConversationIdsToFolder`. */
export interface MoveConversationIdsToFolderDetail {
  folderId: string | number;
  conversationIds: string[];
}

/** Detail for `deleteConversations`. */
export interface DeleteConversationsDetail {
  conversationIds: string[];
}

/** Detail for `archiveConversations` / `unarchiveConversations`. */
export interface ArchiveConversationsDetail {
  conversationIds: string[];
}

/** Detail for `renameConversation`. */
export interface RenameConversationDetail {
  conversationId: string;
  title: string;
}

/** Detail for `toggleConversationFavorite`. */
export interface ToggleConversationFavoriteDetail {
  conversation: { conversation_id: string; is_favorite?: boolean };
}

/** Detail for `getConversationIds`. */
export interface GetConversationIdsDetail {
  startDate?: string;
  endDate?: string;
  includeArchived?: boolean;
  excludeConvInFolders?: boolean;
}

/** Detail for `getPrompts`. */
export interface GetPromptsDetail {
  pageNumber?: number;
  searchTerm?: string;
  sortBy?: string;
  language?: string;
  tag?: string | number;
  folderId?: string | number;
  isFavorite?: boolean;
  isPublic?: boolean;
}

/** Detail for `addPrompts`. */
export interface AddPromptsDetail {
  prompts: Array<{
    steps: string[];
    title: string;
    instruction?: string;
    tags?: (string | number)[];
    language?: string;
    model_slug?: string;
    steps_delay?: number;
    is_public?: boolean;
    is_favorite?: boolean;
    folder?: string | number | null;
  }>;
}

/** Detail for `updatePrompt`. */
export interface UpdatePromptDetail {
  promptData: Record<string, unknown>;
}

/** Detail for `updateNote`. */
export interface UpdateNoteDetail {
  conversationId: string;
  name: string;
  text: string;
}

/** Detail for `addPinnedMessage`. */
export interface AddPinnedMessageDetail {
  conversationId: string;
  messageId: string;
  message: string;
}

/** Detail for `getPinnedMessages`. */
export interface GetPinnedMessagesDetail {
  pageNumber?: number;
  conversationId?: string;
  searchTerm?: string;
}

/** Detail for `getCustomInstructionProfiles`. */
export interface GetCustomInstructionProfilesDetail {
  pageNumber?: number;
  searchTerm?: string;
  sortBy?: string;
}

/** Detail for `rewritePrompt` (Super AI). */
export interface RewritePromptDetail {
  prompt: string;
  context: string;
  tone?: string;
  length?: string;
}

/** Detail for `prompt` (Super AI). */
export interface PromptAIDetail {
  prompt: string;
  createOptions?: Record<string, unknown>;
  promptOptions?: Record<string, unknown>;
  forceRefresh?: boolean;
}

/** Detail for `initConvHistorySync`. */
export interface InitConvHistorySyncDetail {
  syncIntervalTime?: number;
}

/** Detail for `clearCaches`. */
export interface ClearCachesDetail {
  targetKeys: string[];
}

/** Detail for `getGalleryImages`. */
export interface GetGalleryImagesDetail {
  showAll?: boolean;
  pageNumber?: number;
  searchTerm?: string;
  byUserId?: string;
  sortBy?: string;
  category?: string;
  isPublic?: boolean;
}

// ---------------------------------------------------------------------------
// Response type helper
// ---------------------------------------------------------------------------

/**
 * The callback signature for `chrome.runtime.sendMessage`.
 *
 * All message handlers in the background call `sendResponse(data)` exactly
 * once, so the response is always a single value wrapped in a Promise by
 * the Chrome messaging API.
 */
export type BackgroundMessageResponse<R = unknown> = Promise<R>;
