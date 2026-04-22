/**
 * Event bridge — MAIN world -> ISOLATED world.
 *
 * The fetch interceptor (MAIN world) dispatches CustomEvents on `window`.
 * This module listens for all custom event types and routes them to the
 * appropriate handlers in the isolated world.
 *
 * Includes:
 * - Event listeners for ~30 custom event types
 * - Gzip decompression for rgstrEventReceived payloads
 * - Post-submit logic (checkPostSubmit, runPostSubmit, addConversationToSidebarAndSync)
 *
 * Original source: content.isolated.end.js lines 4589-5160
 */

import type {
  HistoryLoadedReceivedDetail,
  ProjectsReceivedDetail,
  FileReceivedDetail,
  TextdocsReceivedDetail,
  AuthReceivedDetail,
  SignoutReceivedDetail,
  AccountReceivedDetail,
  GizmoReceivedDetail,
  GizmosBootstrapReceivedDetail,
  GizmoDiscoveryReceivedDetail,
  ConversationRenameReceivedDetail,
  ConversationDeleteReceivedDetail,
  ConversationArchivedReceivedDetail,
  ConversationUnarchivedReceivedDetail,
  ConversationProjectUpdatedDetail,
  SubscriptionsReceivedDetail,
  UserSettingsReceivedDetail,
  ProfileUpdatedReceivedDetail,
  ModelsReceivedDetail,
  ConversationSubmittedDetail,
  StopConversationReceivedDetail,
  ConversationReceivedDetail,
  ConversationAsyncMessageReceivedDetail,
  RgstrEventReceivedDetail,
  ConversationResponseEndedDetail,
  DeepResearchFinalMessageReceivedDetail,
  DeleteAllReceivedDetail,
  ArchivedAllReceivedDetail,
  GizmoNotFoundDetail,
} from '../../types/events';

import {
  getConversationById,
  getGizmoById,
  me,
  clearHistoryCache,
  evictConversationCache,
  clearAllConversationCaches,
  cacheFileDownloadUrl,
  cacheConversation,
  cacheConversationTextDocs,
  cacheProject,
  registerConversationsMessageListener,
} from './api';

import { getSettings } from './settings';
import { addUserPromptToHistory } from '../features/input';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let firstPageSynced = false;
let postSubmitTriggerMessageId: string | undefined;
let checkPostSubmitInterval: ReturnType<typeof setInterval> | undefined;
let authReceivedDispatched = false;
let branchedConversationOriginalFolderId: string | null = null;
let lastCurrentNode: string | null = null;

/**
 * Callback to trigger post-history-load initialization from app.ts.
 * Registered via registerPostHistoryLoadCallback() to avoid circular imports.
 */
let postHistoryLoadCallback: (() => void) | null = null;

/** Register the initializePostHistoryLoad callback from app.ts */
export function registerPostHistoryLoadCallback(cb: () => void): void {
  postHistoryLoadCallback = cb;
}

/** Sync conversation cache — tracks update_time to avoid re-syncing. */
const syncConvCache: Record<string, string> = {};

/** File IDs already sent to gallery to avoid duplicates. */
const galleyImageAddedFileIdsCache: string[] = [];

// ---------------------------------------------------------------------------
// Gzip decompression (for rgstrEventReceived)
// ---------------------------------------------------------------------------

const COMPRESSION_FORMAT = 'gzip' as const;

async function decompressGzip(payload: unknown): Promise<string> {
  const buffer = payload instanceof Uint8Array ? (payload.buffer as ArrayBuffer) : (payload as ArrayBuffer);
  const stream = new Blob([buffer]).stream();
  const decompressionStream = new DecompressionStream(COMPRESSION_FORMAT);
  const decompressed = stream.pipeThrough(decompressionStream);
  const arrayBuffer = await new Response(decompressed).arrayBuffer();
  return new TextDecoder('utf-8').decode(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the conversation ID from the current page URL. */
function getConversationIdFromUrl(): string | null {
  const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/);
  return match?.[1] ?? null;
}

/** Extract the conversation title from the page. */
function getConversationName(_conversationId?: string | null): string {
  const titleEl = document.querySelector('title');
  const title = titleEl?.textContent?.trim() || 'New chat';
  return title === 'ChatGPT' ? 'New chat' : title;
}

/** Extract a gizmo ID from a URL string. */
function getGizmoIdFromUrl(url: string): string {
  const match = url.match(/gizmos\/(g-[a-zA-Z0-9]+)/);
  return match?.[1] ?? '';
}

/** Whether the input form is ready for a new submission. */
function canSubmit(): boolean {
  // Check if the stop button is gone and the send button is visible
  const stopButton = document.querySelector('main form button[aria-label="Stop generating"]');
  return !stopButton;
}

/** Get the first conversation ID from the sidebar. */
function getFirstConversationIdFromSidebar(): string | null {
  const el = document.querySelector('nav [id^="conversation-button-"]');
  return el?.id?.replace('conversation-button-', '') ?? null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onHistoryLoadedReceived(detail: HistoryLoadedReceivedDetail): void {
  if (detail?.total) {
    chrome.storage.local.set({ totalConversations: detail.total });
  }

  const { offset, limit } = detail;
  const order = 'updated';
  const isArchived = detail.items?.[0]?.is_archived;
  const cacheKey = `${offset}-${limit}-${order}-${isArchived}`;

  // Cache in the API module's history cache is done via the API fetch itself;
  // here we just track first-page sync.
  if (!firstPageSynced && detail.offset === 0 && (detail.items?.length ?? 0) > 0) {
    // Sync first page to conversation DB
    chrome.runtime.sendMessage({
      type: 'addConversations',
      detail: { conversations: detail.items },
    });
    firstPageSynced = true;
  }

  const settings = getSettings();
  if (detail.offset! > 0 && (detail.items?.length ?? 0) > 0 && (settings as any).syncHistoryResponses) {
    chrome.runtime.sendMessage({
      type: 'addConversations',
      detail: { conversations: detail.items },
    });
  }

  chrome.storage.sync.get(['isBanned']).then(({ isBanned }) => {
    if (!isBanned) {
      postHistoryLoadCallback?.();
    }
  });
}

function onProjectsReceived(detail: ProjectsReceivedDetail): void {
  const cursorKey = detail.cursor ? detail.cursor : '0';
  cacheProject(cursorKey, detail.responseData);

  const settings = getSettings();
  if (!(settings as any).syncProjects) return;

  const conversations =
    (detail.responseData as any)?.items?.map((item: any) => item.conversations?.items)?.flat() || [];

  if (!conversations.length) return;

  const filtered = conversations.filter((conv: any) => {
    const id = conv.conversation_id || conv.id;
    const cached = syncConvCache[id];
    if (!cached || new Date(cached).getTime() < new Date(conv.update_time).getTime()) {
      syncConvCache[id] = conv.update_time;
      return true;
    }
    return false;
  });

  if (!filtered.length) return;

  chrome.runtime.sendMessage({
    type: 'addConversations',
    detail: { conversations: filtered },
  });
}

function onFileReceived(detail: FileReceivedDetail): void {
  const { fileId, data } = detail;
  if (!fileId || galleyImageAddedFileIdsCache.includes(fileId)) return;
  galleyImageAddedFileIdsCache.push(fileId);

  const { file_name, download_url } = data;

  // Skip non-image files
  const skipExts = ['.json', '.csv', '.xlsx', '.txt', '.pdf', '.md', '.docx'];
  if (file_name && skipExts.some((ext) => (file_name as string).endsWith(ext))) return;

  // Cache the download URL
  cacheFileDownloadUrl(fileId, data);

  // Delay gallery processing to allow DOM to settle
  const userMessages = document.querySelectorAll('main article div[data-message-author-role="user"]');
  const delay = userMessages.length > 1 ? 5_000 : 10_000;

  setTimeout(async () => {
    const conversationId = getConversationIdFromUrl();
    if (!conversationId) return;

    const conv = await getConversationById(conversationId, true);
    if (!conv?.mapping) return;

    // Image processing: find DALL-E or chart images in the conversation mapping
    const imageInfo = findImageInMapping(conv.mapping, fileId);
    if (!imageInfo) return;

    const galleryEntry = {
      image_id: fileId,
      message_id: imageInfo.messageId,
      title: imageInfo.title,
      width: imageInfo.width,
      height: imageInfo.height,
      download_url,
      prompt: imageInfo.prompt,
      gen_id: imageInfo.genId,
      seed: imageInfo.seed,
      is_public: false,
      category: imageInfo.category,
      conversation_id: conversationId,
      created_at: imageInfo.createdAt,
    };

    chrome.runtime.sendMessage({
      type: 'addGalleryImages',
      detail: { images: [galleryEntry] },
    });
  }, delay);
}

/** Simplified image finder in the conversation mapping. */
function findImageInMapping(
  mapping: Record<string, any>,
  fileId: string,
): {
  messageId: string;
  title: string;
  width: number;
  height: number;
  prompt: string;
  genId?: string;
  seed?: string;
  category: string;
  createdAt: string;
} | null {
  const searchStr = `://${fileId}`;
  for (const [nodeId, node] of Object.entries(mapping)) {
    const msg = node.message;
    if (!msg) continue;
    const content = JSON.stringify(msg.content || {});
    const metadata = JSON.stringify(msg.metadata || {});
    if (content.includes(searchStr) || metadata.includes(searchStr)) {
      const dalleMetadata =
        msg.metadata?.aggregate_result?.messages?.[0] ||
        msg.content?.parts?.find?.((p: any) => typeof p === 'object' && p?.asset_pointer);
      return {
        messageId: msg.id,
        title: msg.metadata?.title || '',
        width: dalleMetadata?.width || 0,
        height: dalleMetadata?.height || 0,
        prompt: dalleMetadata?.metadata?.dalle?.prompt || dalleMetadata?.code || '',
        genId: dalleMetadata?.metadata?.dalle?.gen_id || dalleMetadata?.metadata?.generation?.gen_id,
        seed: dalleMetadata?.metadata?.dalle?.seed,
        category: dalleMetadata?.code ? 'chart' : dalleMetadata?.metadata?.dalle ? 'dalle' : 'upload',
        createdAt: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : new Date().toISOString(),
      };
    }
  }
  return null;
}

function onTextdocsReceived(detail: TextdocsReceivedDetail): void {
  const { conversationId, textdocs } = detail;
  if (!(textdocs as any[])?.length) return;
  cacheConversationTextDocs(conversationId, textdocs);
  chrome.runtime.sendMessage({
    type: 'addTextdocs',
    detail: { conversationId, textdocs },
  });
}

function onAuthReceived(detail: AuthReceivedDetail): void {
  authReceivedDispatched = true;
  chrome.runtime.sendMessage({ type: 'authReceived', detail });
}

function onSignoutReceived(detail: SignoutReceivedDetail): void {
  chrome.runtime.sendMessage({ type: 'signoutReceived', detail });
}

function onAccountReceived(detail: AccountReceivedDetail): void {
  chrome.storage.local.set({ account: detail });
}

function onGizmoNotFound(detail: GizmoNotFoundDetail): void {
  const gizmoId = getGizmoIdFromUrl(detail as unknown as string);
  chrome.runtime.sendMessage({
    type: 'deleteCouncilGizmo',
    detail: { gizmoId },
  });
}

function onGizmoReceived(detail: GizmoReceivedDetail): void {
  const settings = getSettings();
  if ((settings as any).syncGizmos && detail.gizmo) {
    chrome.runtime.sendMessage({
      type: 'submitCouncilGizmos',
      detail: { gizmos: [detail.gizmo] },
    });
  }
}

function onGizmosBootstrapReceived(detail: GizmosBootstrapReceivedDetail): void {
  const settings = getSettings();
  const shouldSync =
    Math.random() < 0.3 &&
    (settings as any).syncGizmos &&
    (!(settings as any).lastGizmosBootstrapReceivedTimestamp ||
      Date.now() - (settings as any).lastGizmosBootstrapReceivedTimestamp > 6 * 60 * 60 * 1000);

  chrome.storage.local.set({ gizmosBootstrap: detail }, async () => {
    if (shouldSync) {
      const updatedSettings = {
        ...(settings as any),
        lastGizmosBootstrapReceivedTimestamp: Date.now(),
      };
      chrome.storage.local.set({ settings: updatedSettings });
      chrome.runtime.sendMessage({
        type: 'submitCouncilGizmos',
        detail: {
          gizmos: (detail.gizmos || []).map((g: any) => g.resource?.gizmo),
        },
      });
    }
  });
}

function onGizmoDiscoveryReceived(detail: GizmoDiscoveryReceivedDetail): void {
  const settings = getSettings();
  const shouldSync =
    Math.random() < 0.3 &&
    (settings as any).syncGizmos &&
    (!(settings as any).lastGizmoDiscoveryReceivedTimestamp ||
      Date.now() - (settings as any).lastGizmoDiscoveryReceivedTimestamp > 6 * 60 * 60 * 1000);

  if (!shouldSync) return;

  const updatedSettings = {
    ...(settings as any),
    lastGizmoDiscoveryReceivedTimestamp: Date.now(),
  };
  chrome.storage.local.set({ settings: updatedSettings });

  const { cuts } = detail;
  if (!cuts) return;
  const gizmos: unknown[] = [];
  for (const cut of cuts) {
    const categoryId = cut.info?.id;
    const items = (cut.list?.items || []).map((item: any) => item.resource.gizmo);
    items.forEach((gizmo: any) => {
      if (!gizmo.display?.categories?.includes(categoryId)) {
        gizmo.display?.categories?.push(categoryId);
      }
    });
    gizmos.push(...items);
  }
  chrome.runtime.sendMessage({
    type: 'submitCouncilGizmos',
    detail: { gizmos },
  });
}

function onConversationRenameReceived(detail: ConversationRenameReceivedDetail): void {
  clearHistoryCache();
  evictConversationCache(detail.conversationId);
  chrome.runtime.sendMessage({
    type: 'renameConversation',
    detail: {
      conversationId: detail.conversationId,
      title: detail.title,
    },
  });

  // Update sidebar UI
  const titleEl = document.querySelector(
    `#sidebar-folder-content #conversation-card-${detail.conversationId} #conversation-title`,
  );
  if (titleEl) (titleEl as HTMLElement).innerText = detail.title;
}

function onDeleteAllReceived(_detail: DeleteAllReceivedDetail): void {
  clearAllConversationCaches();
  chrome.runtime.sendMessage({ type: 'deleteAllConversations' });
  (document.querySelector('#sidebar-folder-drawer #folder-breadcrumb-root') as HTMLElement)?.click();
}

function onConversationDeleteReceived(detail: ConversationDeleteReceivedDetail): void {
  clearHistoryCache();
  evictConversationCache(detail.conversationId);
  chrome.runtime.sendMessage({
    type: 'deleteConversations',
    detail: { conversationIds: [detail.conversationId] },
  });
  // Remove sidebar conversation elements
  document.querySelector(`#conversation-button-${detail.conversationId}`)?.remove();
  document.querySelector(`#conversation-card-${detail.conversationId}`)?.remove();
}

function onArchivedAllReceived(_detail: ArchivedAllReceivedDetail): void {
  clearAllConversationCaches();
  chrome.runtime.sendMessage({ type: 'archiveAllConversations' });
  (document.querySelector('#sidebar-folder-drawer #folder-breadcrumb-root') as HTMLElement)?.click();
}

function onConversationArchivedReceived(detail: ConversationArchivedReceivedDetail): void {
  clearHistoryCache();
  evictConversationCache(detail.conversationId);
  chrome.runtime.sendMessage({
    type: 'archiveConversations',
    detail: { conversationIds: [detail.conversationId] },
  });
  document.querySelector(`#sidebar-folder-content #conversation-card-${detail.conversationId}`)?.remove();
}

function onConversationUnarchivedReceived(detail: ConversationUnarchivedReceivedDetail): void {
  clearHistoryCache();
  evictConversationCache(detail.conversationId);
  chrome.runtime.sendMessage({
    type: 'unarchiveConversations',
    detail: { conversationIds: [detail.conversationId] },
  });
}

function onConversationProjectUpdated(detail: ConversationProjectUpdatedDetail): void {
  clearHistoryCache();
  evictConversationCache(detail.conversationId);
  chrome.runtime.sendMessage({
    type: 'updateConversationProject',
    detail: {
      conversationId: detail.conversationId,
      gizmoId: detail.gizmoId,
    },
  });
}

function onSubscriptionsReceived(detail: SubscriptionsReceivedDetail): void {
  chrome.storage.local.set({
    chatgptAccountId: detail.accountId || 'default',
  });
}

function onUserSettingsReceived(detail: UserSettingsReceivedDetail): void {
  const accessToken = detail.accessToken;

  // If authReceived hasn't fired yet, attempt to trigger it via /me
  setTimeout(() => {
    if (!authReceivedDispatched && accessToken) {
      me(accessToken).then((meData: any) => {
        window.dispatchEvent(
          new CustomEvent('authReceived', {
            detail: { ...meData, accessToken },
          }),
        );
      });
    }
  }, 1_000);

  // Strip accessToken before caching
  const settingsData = { ...detail } as Record<string, unknown>;
  delete settingsData.accessToken;

  if ((settingsData as any)?.settings) {
    chrome.storage.local.set({ openAIUserSettings: settingsData });

    // Update memory toggles if they exist in the DOM
    const { sunshine, moonshine } = (settingsData as any).settings || {};
    const memoryToggle = document.querySelector('main form input[id="switch-memory"]') as HTMLInputElement | null;
    if (memoryToggle) {
      memoryToggle.checked = sunshine;
      memoryToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const referenceChatsToggle = document.querySelector(
      'main form input[id="switch-reference-chats"]',
    ) as HTMLInputElement | null;
    if (referenceChatsToggle) {
      referenceChatsToggle.checked = moonshine;
      referenceChatsToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

function onProfileUpdatedReceived(detail: ProfileUpdatedReceivedDetail): void {
  chrome.runtime.sendMessage({
    type: 'updateEnabledCustomInstructionProfile',
    detail: { profile: detail },
  });
}

function onModelsReceived(detail: ModelsReceivedDetail): void {
  chrome.storage.local.get(['selectedModel'], ({ selectedModel }) => {
    const current = selectedModel;
    const newSelected = current && detail.models?.find((m) => m.slug === current.slug) ? current : detail.models?.[0];

    chrome.storage.local.set({
      models: detail.models,
      selectedModel: newSelected,
    });

    const settings = getSettings();
    if ((settings as any).overrideModelSwitcher && newSelected) {
      window.sessionStorage.setItem('sp/selectedModel', newSelected.slug);
    }
  });
}

function onConversationSubmitted(detail: ConversationSubmittedDetail): void {
  resetPostSubmit();

  const { branchingFromConversationId, messages, instructions } = detail;
  const conversationId = getConversationIdFromUrl();
  const userMessage = messages.find((m) => m.author.role === 'user');

  if (userMessage) {
    const text = userMessage.content?.parts?.filter((p: unknown) => typeof p === 'string')?.join(' ');
    if (text) addUserPromptToHistory(text);
    // addInstructionIndicators and custom width are UI concerns
    void instructions;
  }

  clearHistoryCache();
  if (conversationId) {
    evictConversationCache(conversationId);
  } else {
    clearAllConversationCaches();
  }

  // Track branched conversation's folder for re-assignment
  if (branchingFromConversationId) {
    chrome.runtime
      .sendMessage({
        type: 'getFolderForConversationId',
        detail: { conversationId: branchingFromConversationId },
      })
      .then((folder: any) => {
        branchedConversationOriginalFolderId = folder?.id ?? null;
      });
  }
}

function onStopConversationReceived(_detail: StopConversationReceivedDetail): void {
  resetPostSubmit();

  setTimeout(async () => {
    const conversationId = getConversationIdFromUrl();
    clearHistoryCache();
    if (conversationId) {
      evictConversationCache(conversationId);
    } else {
      clearAllConversationCaches();
    }

    const title = getConversationName();
    if (conversationId) {
      addConversationToSidebarAndSync(title, conversationId);
    }
  }, 100);
}

function onConversationReceived(detail: ConversationReceivedDetail): void {
  const conversationId = detail?.conversation?.conversation_id;
  if (!conversationId) return;

  // Handle "not found" conversations
  if ((detail?.conversation as any)?.detail?.code === 'conversation_not_found') {
    evictConversationCache(conversationId);
    chrome.runtime.sendMessage({
      type: 'deleteConversations',
      detail: { conversationIds: [conversationId] },
    });
    return;
  }

  const { conversation } = detail;
  cacheConversation(conversationId, {
    ...conversation,
    conversation_id: conversation.conversation_id || (conversation as any).id,
  } as any);

  const currentNode = conversation.current_node;
  const urlConversationId = getConversationIdFromUrl();

  if (currentNode && currentNode !== lastCurrentNode) {
    lastCurrentNode = currentNode;
    if (urlConversationId) {
      addConversationToSidebarAndSync(conversation.title || 'New chat', urlConversationId);
    }
  }

  chrome.storage.sync.get(['isBanned']).then(({ isBanned }) => {
    if (!isBanned) {
      postHistoryLoadCallback?.();
      // addSidebarNoteInput is called within initializePostHistoryLoad
    }
  });
}

async function onConversationAsyncMessageReceived(detail: ConversationAsyncMessageReceivedDetail): Promise<void> {
  checkPostSubmit(null, detail.conversationId);
}

async function onRgstrEventReceived(detail: RgstrEventReceivedDetail): Promise<void> {
  const { payload } = detail;
  try {
    const decompressed = await decompressGzip(payload);
    if (!decompressed) return;

    const { events } = JSON.parse(decompressed);
    if (!events || !Array.isArray(events)) return;

    for (const event of events) {
      const { eventName, metadata } = event;
      if (eventName === 'chatgpt_conversation_turn_turn_exchange_complete' && metadata?.result === 'success') {
        checkPostSubmit();
      }
    }
  } catch (err) {
    console.error('Error parsing rgstrEventReceived payload:', err);
  }
}

function onConversationResponseEnded(detail: ConversationResponseEndedDetail): void {
  const { conversationTitle, conversationId } = detail;
  checkPostSubmit(conversationTitle, conversationId);
}

function onDeepResearchFinalMessageReceived(_detail: DeepResearchFinalMessageReceivedDetail): void {
  const title = getConversationName();
  checkPostSubmit(title);
}

// ---------------------------------------------------------------------------
// Post-submit logic
// ---------------------------------------------------------------------------

/**
 * Called when a conversation response ends (from various signal sources).
 * Deduplicates by the last user message ID, then waits for the form to be
 * ready before running the actual post-submit work.
 */
async function checkPostSubmit(title: string | null = null, conversationId: string | null = null): Promise<void> {
  const userMessages = document.querySelectorAll('main article div[data-message-author-role="user"]');
  const lastUserMsgId = userMessages[userMessages.length - 1]?.getAttribute('data-message-id');

  if (postSubmitTriggerMessageId && postSubmitTriggerMessageId === lastUserMsgId) return;
  postSubmitTriggerMessageId = lastUserMsgId || undefined;

  if (canSubmit()) {
    runPostSubmit(title, conversationId);
  } else {
    if (checkPostSubmitInterval) clearInterval(checkPostSubmitInterval);
    checkPostSubmitInterval = setInterval(() => {
      if (canSubmit()) {
        clearInterval(checkPostSubmitInterval!);
        checkPostSubmitInterval = undefined;
        runPostSubmit(title, conversationId);
      }
    }, 3_000);
  }
}

function resetPostSubmit(): void {
  // Reset any post-submit state. The original clears lastFocusedArticle.
  postSubmitTriggerMessageId = undefined;
  if (checkPostSubmitInterval) {
    clearInterval(checkPostSubmitInterval);
    checkPostSubmitInterval = undefined;
  }
}

/**
 * Performs post-submit work after a conversation response has ended:
 * - Clears caches
 * - Adds the conversation to sidebar and syncs to backend
 * - Triggers UI updates (pins, timestamps, minimap, etc.)
 */
async function runPostSubmit(title: string | null = null, conversationId: string | null = null): Promise<void> {
  const isTemporaryChat = window.location.href.includes('temporary-chat=true');

  if (!title || title === 'New chat') {
    title = getConversationName(conversationId);
  }

  const urlConversationId = isTemporaryChat ? null : getConversationIdFromUrl() || getFirstConversationIdFromSidebar();
  const finalConversationId = conversationId || urlConversationId;

  clearHistoryCache();
  if (!isTemporaryChat) {
    if (finalConversationId) {
      evictConversationCache(finalConversationId);
    } else {
      clearAllConversationCaches();
    }
  }

  if (finalConversationId) {
    const conv = await getConversationById(finalConversationId);
    if (!conv) return;

    // UI updates (pins, timestamps, minimap, etc.) are handled by feature modules
    // that observe DOM changes or listen for their own events.
  }

  // Add conversation to sidebar and sync to Council API
  if (finalConversationId) {
    addConversationToSidebarAndSync(title || 'New chat', finalConversationId);
  }
}

/**
 * Adds the conversation to the sidebar folder and syncs to the Council API.
 * Handles auto-folder creation for Custom GPTs.
 */
export async function addConversationToSidebarAndSync(title: string, conversationId: string): Promise<void> {
  if (!conversationId || window.location.href.includes('temporary-chat=true')) return;

  const conv = await getConversationById(conversationId);
  if (!conv) return;

  const convData = conv as any;

  // Assign folder from "new chat folder" or branched conversation
  // (folderForNewChat is managed by the folders feature module)
  if (branchedConversationOriginalFolderId) {
    convData.folder = branchedConversationOriginalFolderId;
    branchedConversationOriginalFolderId = null;
  }

  // Auto-folder for Custom GPTs
  const settings = getSettings();
  const gizmoId = convData.gizmo_id;
  if (gizmoId && !gizmoId.startsWith('g-p-') && (settings as any).autoFolderCustomGPTs) {
    const hasSubscription = await chrome.runtime.sendMessage({
      type: 'checkHasSubscription',
    });

    if (hasSubscription) {
      let folder = await chrome.runtime.sendMessage({
        type: 'getConversationFolderByGizmoId',
        forceRefresh: true,
        detail: { gizmoId },
      });

      if (!folder?.id) {
        const gizmoInfo = await getGizmoById(gizmoId);
        const folders = await chrome.runtime.sendMessage({
          type: 'addConversationFolders',
          detail: {
            folders: [
              {
                name: gizmoInfo?.resource?.gizmo?.display?.name || gizmoId,
                gizmo_id: gizmoId,
                image_url: gizmoInfo?.resource?.gizmo?.display?.profile_picture_url,
                color: '#2e2e2e',
              },
            ],
          },
        });
        folder = folders?.[0];
      }

      if (folder?.id) {
        convData.folder = folder.id;
      }
    }
  }

  // Sync to Council API
  if (!convData.title || convData.title === 'New chat') {
    convData.title = title || convData.title;
  }

  chrome.runtime.sendMessage(
    {
      type: 'addConversations',
      detail: { conversations: [convData] },
    },
    (_response: unknown) => {
      // addConversationToSidebarFolder is a UI concern handled by the folders module
    },
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Registers window event listeners for all SP custom events.
 * Called once from app.ts during bootstrap.
 */
export function initializeEventBridge(): void {
  // Register the conversations message listener for background requests
  registerConversationsMessageListener();

  // --- History ---
  window.addEventListener('historyLoadedReceived', (e: CustomEvent) => {
    onHistoryLoadedReceived(e.detail);
  });

  // --- Projects ---
  window.addEventListener('projectsReceived', (e: CustomEvent) => {
    onProjectsReceived(e.detail);
  });

  // --- Files ---
  window.addEventListener('fileReceived', (e: CustomEvent) => {
    onFileReceived(e.detail);
  });

  // --- Text Docs ---
  window.addEventListener('textdocsReceived', (e: CustomEvent) => {
    onTextdocsReceived(e.detail);
  });

  // --- Auth ---
  window.addEventListener('authReceived', (e: CustomEvent) => {
    onAuthReceived(e.detail);
  });

  window.addEventListener('signoutReceived', (e: CustomEvent) => {
    onSignoutReceived(e.detail);
  });

  // --- Account ---
  window.addEventListener('accountReceived', (e: CustomEvent) => {
    onAccountReceived(e.detail);
  });

  // --- Gizmos ---
  window.addEventListener('gizmoNotFound', (e: CustomEvent) => {
    onGizmoNotFound(e.detail);
  });

  window.addEventListener('gizmoReceived', (e: CustomEvent) => {
    onGizmoReceived(e.detail);
  });

  window.addEventListener('gizmosBootstrapReceived', (e: CustomEvent) => {
    onGizmosBootstrapReceived(e.detail);
  });

  window.addEventListener('gizmoDiscoveryReceived', (e: CustomEvent) => {
    onGizmoDiscoveryReceived(e.detail);
  });

  // --- Conversation lifecycle ---
  window.addEventListener('conversationRenameReceived', (e: CustomEvent) => {
    onConversationRenameReceived(e.detail);
  });

  window.addEventListener('deleteAllReceived', (e: CustomEvent) => {
    onDeleteAllReceived(e.detail);
  });

  window.addEventListener('conversationDeleteReceived', (e: CustomEvent) => {
    onConversationDeleteReceived(e.detail);
  });

  window.addEventListener('archivedAllReceived', (e: CustomEvent) => {
    onArchivedAllReceived(e.detail);
  });

  window.addEventListener('conversationArchivedReceived', (e: CustomEvent) => {
    onConversationArchivedReceived(e.detail);
  });

  window.addEventListener('conversationUnarchivedReceived', (e: CustomEvent) => {
    onConversationUnarchivedReceived(e.detail);
  });

  window.addEventListener('conversationProjectUpdated', (e: CustomEvent) => {
    onConversationProjectUpdated(e.detail);
  });

  // --- Subscriptions ---
  window.addEventListener('subscriptionsReceived', (e: CustomEvent) => {
    onSubscriptionsReceived(e.detail);
  });

  // --- User Settings ---
  window.addEventListener('userSettingsReceived', (e: CustomEvent) => {
    onUserSettingsReceived(e.detail);
  });

  // --- Profile Updates ---
  window.addEventListener('profileUpdatedReceived', (e: CustomEvent) => {
    onProfileUpdatedReceived(e.detail);
  });

  // --- Models ---
  window.addEventListener('modelsReceived', (e: CustomEvent) => {
    onModelsReceived(e.detail);
  });

  // --- Conversation Submitted ---
  window.addEventListener('conversationSubmitted', (e: CustomEvent) => {
    onConversationSubmitted(e.detail);
  });

  // --- Stop Conversation ---
  window.addEventListener('stopConversationReceived', (e: CustomEvent) => {
    onStopConversationReceived(e.detail);
  });

  // --- Conversation Received ---
  window.addEventListener('conversationReceived', (e: CustomEvent) => {
    onConversationReceived(e.detail);
  });

  // --- Async Message ---
  window.addEventListener('conversationAsyncMessageReceived', (e: CustomEvent) => {
    onConversationAsyncMessageReceived(e.detail);
  });

  // --- Analytics (rgstr) ---
  window.addEventListener('rgstrEventReceived', (e: CustomEvent) => {
    onRgstrEventReceived(e.detail);
  });

  // --- Response Ended ---
  window.addEventListener('conversationResponseEnded', (e: CustomEvent) => {
    onConversationResponseEnded(e.detail);
  });

  // --- Deep Research ---
  window.addEventListener('deepResearchFinalMessageReceived', (e: CustomEvent) => {
    onDeepResearchFinalMessageReceived(e.detail);
  });

  console.log('[SP Clone] Event bridge initialised (all handlers registered)');
}
