/**
 * ChatGPT backend-api wrapper.
 *
 * These functions make direct authenticated fetch calls to ChatGPT's
 * /backend-api/* and /public-api/* endpoints from the ISOLATED content-script
 * world. They bypass the fetch interceptor because they use the extension's
 * own fetch (not the page's patched one).
 *
 * The accessToken is stored in chrome.storage.sync after being captured
 * by the event bridge's authReceived handler.
 *
 * Original source: content.isolated.end.js lines 3329-4587
 */

import { API } from '../../constants/api-endpoints';
import type { Conversation, ConversationSummary } from '../../types/conversation';

// ---------------------------------------------------------------------------
// Internal: headers & state
// ---------------------------------------------------------------------------

/** Default headers sent with every ChatGPT API request. */
export function getDefaultHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Oai-Language': 'en-US',
  };
  const deviceId = window.localStorage.getItem('oai-did')?.replaceAll('"', '');
  if (deviceId) {
    headers['Oai-Device-Id'] = deviceId;
  }
  const accountCookie = document.cookie
    ?.split('; ')
    ?.find((c) => c.startsWith('_account='))
    ?.split('=')[1];
  const accountId = accountCookie === 'personal' ? 'default' : accountCookie || 'default';
  if (accountId !== 'default') {
    headers['Chatgpt-Account-Id'] = accountId;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

/** In-memory conversation cache. */
const conversationsCache: Record<string, Conversation> = {};

/** In-memory conversation list cache (by offset-limit-order-archived key). */
let historyCache: Record<string, ConversationsPage> = {};

/** File download URL cache. */
const fileIdToDownloadUrlCache: Record<string, { timestamp: number; data: FileDownloadInfo }> = {};

/** Project sidebar cache. */
const projectCache: Record<string | number, unknown> = {};

/** Conversation text docs cache. */
const conversationTextDocsCache: Record<string, unknown> = {};

/** Text doc cache. */
const textDocCache: Record<string, unknown> = {};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationsPage {
  items: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
  [key: string]: unknown;
}

interface FileDownloadInfo {
  download_url?: string;
  status?: string;
  file_name?: string;
  [key: string]: unknown;
}

interface ChatRequirementsResult {
  arkoseDX?: string;
  [key: string]: unknown;
}

interface UserSystemMessagePayload {
  object: string;
  about_model_message: string;
  about_user_message: string;
  name_user_message: string;
  other_user_message: string;
  role_user_message: string;
  traits_model_message: string;
  personality_type_selection: string;
  personality_traits: Record<string, unknown>;
  traits_enabled: boolean;
  enabled: boolean;
  disabled_tools: string[];
}

// ---------------------------------------------------------------------------
// Internal: authenticated fetch helper
// ---------------------------------------------------------------------------

/**
 * Perform a fetch with the user's ChatGPT access token attached.
 * Reads the token from chrome.storage.sync each time (it may rotate).
 */
/** Resolve a relative API path to a full chatgpt.com URL. */
function resolveUrl(path: string): string {
  return path.startsWith('http') ? path : `https://chatgpt.com${path}`;
}

async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
  overrideToken?: string | null,
): Promise<Response> {
  const { accessToken } = await chrome.storage.sync.get(['accessToken']);
  const token = overrideToken || (accessToken as string | undefined);

  const defaultHeaders = getDefaultHeaders();
  const url = resolveUrl(path);

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...(token ? { Authorization: token } : {}),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Chat Requirements
// ---------------------------------------------------------------------------

let loadingChatRequirements = false;
let lastChatRequirementsFetch = new Date(0);

/**
 * POST /backend-api/sentinel/chat-requirements
 *
 * Returns cached result if tokens are fresh (< 5 min).
 * Stores proof-of-work / turnstile tokens in localStorage.
 */
export async function getChatRequirements(): Promise<ChatRequirementsResult> {
  const chatReqToken = window.localStorage.getItem('sp/chatRequirementsToken');
  const powToken = window.localStorage.getItem('sp/proofOfWorkToken');
  const turnstileToken = window.localStorage.getItem('sp/turnstileToken');
  const arkoseDX = window.localStorage.getItem('sp/arkoseDX');

  if (loadingChatRequirements) return {};

  if (
    chatReqToken &&
    turnstileToken &&
    powToken &&
    arkoseDX &&
    Date.now() - lastChatRequirementsFetch.getTime() < 5 * 60 * 1000
  ) {
    return { arkoseDX };
  }

  loadingChatRequirements = true;
  try {
    const res = await fetchWithAuth(API.CHAT_REQUIREMENTS, {
      method: 'POST',
      body: JSON.stringify({
        p: window.localStorage.getItem('sp/chatRequirementsPayload'),
      }),
    });
    const data = await res.json();
    lastChatRequirementsFetch = new Date();
    loadingChatRequirements = false;
    // processChatRequirements is handled by the main world
    return { arkoseDX: data.arkose?.dx };
  } catch {
    loadingChatRequirements = false;
    return {};
  }
}

// ---------------------------------------------------------------------------
// Auth / Session
// ---------------------------------------------------------------------------

/** GET /api/auth/session */
export async function getSession(): Promise<unknown> {
  const defaultHeaders = getDefaultHeaders();
  const res = await fetch(resolveUrl(API.SESSION), {
    method: 'GET',
    credentials: 'include',
    headers: { ...defaultHeaders },
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** GET /backend-api/me */
export async function me(overrideToken: string | null = null): Promise<unknown> {
  const res = await fetchWithAuth(API.ME, { method: 'GET' }, overrideToken);
  if (!res.ok) {
    console.warn('Failed to fetch me');
    return Promise.reject(res);
  }
  return res.json();
}

/** GET /backend-api/accounts/check/v4-2023-04-27 */
export async function getAccount(): Promise<unknown> {
  const res = await fetchWithAuth('/backend-api/accounts/check/v4-2023-04-27');
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  chrome.storage.local.set({ account: data });
  return data;
}

// ---------------------------------------------------------------------------
// Conversations — single
// ---------------------------------------------------------------------------

/**
 * GET /backend-api/conversation/:id
 *
 * Uses in-memory cache unless `forceRefresh` is true.
 * On 404 tells the background to delete the conversation record.
 * On 5xx returns the raw response (for retry logic).
 */
export async function getConversationById(conversationId: string, forceRefresh = false): Promise<Conversation> {
  if (conversationsCache[conversationId] && !forceRefresh) {
    const cached = conversationsCache[conversationId];
    return { ...cached, conversation_id: cached.conversation_id || (cached as any).id };
  }

  const res = await fetchWithAuth(`${API.CONVERSATION_BY_ID}${conversationId}`, {
    method: 'GET',
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 404) {
      chrome.runtime.sendMessage({
        type: 'deleteConversations',
        detail: { conversationIds: [conversationId] },
      });
    }
    if (res.status?.toString().startsWith('5')) {
      return res as any;
    }
    return Promise.reject(res);
  }

  const data = await res.json();
  const conv = {
    ...data,
    conversation_id: data.conversation_id || data.id,
  };
  conversationsCache[conversationId] = conv;
  return conv;
}

/** POST /backend-api/conversation/init */
export async function initConversation(conversationId: string | null = null): Promise<void> {
  const body = {
    conversation_id: conversationId,
    gizmo_id: null,
    requested_default_model: null,
    timezone_offset_min: new Date().getTimezoneOffset(),
  };
  const res = await fetchWithAuth('/backend-api/conversation/init', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  // updateRateLimitBanner is a UI concern handled elsewhere
  return data;
}

// ---------------------------------------------------------------------------
// Conversations — list / paginated
// ---------------------------------------------------------------------------

/**
 * GET /backend-api/conversations?offset=&limit=&order=&is_archived=
 */
export async function getConversations(
  offset = 0,
  limit = 100,
  order = 'updated',
  isArchived = false,
  forceRefresh = false,
): Promise<ConversationsPage> {
  const cacheKey = `${offset}-${limit}-${order}-${isArchived}`;
  if (historyCache[cacheKey] && !forceRefresh) {
    return historyCache[cacheKey];
  }

  const url = new URL(`https://${window.location.host}/backend-api/conversations`);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('order', order);
  url.searchParams.append('is_archived', String(isArchived));

  const res = await fetchWithAuth(url.toString());
  if (!res.ok) {
    return { items: [], total: 0, limit, offset };
  }

  const data = await res.json();
  const page: ConversationsPage = {
    ...data,
    items: (data.items || []).map((item: any) => ({
      ...item,
      conversation_id: item.id,
    })),
  };
  historyCache[cacheKey] = page;
  return page;
}

/**
 * GET /backend-api/conversations/search?query=&cursor=
 */
export async function searchConversations(query: string, cursor: string | null = null): Promise<unknown> {
  const url = new URL(`https://${window.location.host}/backend-api/conversations/search`);
  url.searchParams.append('query', query);
  if (cursor) url.searchParams.append('cursor', cursor);

  const res = await fetchWithAuth(url.toString());
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** Fetch all conversations by paginating through the full list. */
export async function getAllConversations(): Promise<ConversationSummary[]> {
  const all: ConversationSummary[] = [];
  const first = await getConversations(0, 1);
  const total = first.total;
  if (typeof total !== 'undefined') {
    chrome.storage.local.set({ totalConversations: total });
  }

  const pageSize = 100;
  for (let offset = 0; offset < total; offset += pageSize) {
    const page = await getConversations(offset, pageSize);
    if (!page?.items?.length) break;
    all.push(
      ...page.items.map((item: any) => ({
        ...item,
        conversation_id: item.id || item.conversation_id,
      })),
    );
  }
  return all;
}

/**
 * Get conversation IDs from the background service worker (which has the DB).
 */
export async function getConversationIds(
  startDate: string | null = null,
  endDate: string | null = null,
  includeArchived = true,
  excludeConvInFolders = false,
): Promise<string[]> {
  return chrome.runtime.sendMessage({
    type: 'getConversationIds',
    detail: { startDate, endDate, includeArchived, excludeConvInFolders },
  });
}

/**
 * Get conversation IDs within a date range by paginating through history.
 */
export async function getConversationIdsByDateRange(startTimestamp: number, endTimestamp: number): Promise<string[]> {
  let done = false;
  const first = await getConversations(0, 1);
  const total = first.total;
  const pageSize = 100;
  const ids: string[] = [];

  for (let offset = 0; offset < total && !done; offset += pageSize) {
    const page = await getConversations(offset, pageSize);
    if (!page?.items?.length) break;

    for (const item of page.items) {
      const time = new Date((item.update_time as any)?.toString().split('T')[0]).getTime();
      if (time >= startTimestamp && time <= endTimestamp) {
        ids.push(item.id);
      } else if (time < startTimestamp) {
        done = true;
      } else if (done) {
        break;
      }
    }
  }
  return ids;
}

/**
 * Fetch multiple conversations by their IDs (sequential to avoid rate limits).
 */
export async function getConversationsByIds(ids: string[]): Promise<Conversation[]> {
  if (!ids?.length) return [];
  const results: Conversation[] = [];
  for (const id of ids) {
    if (!id) continue;
    try {
      const conv = await getConversationById(id);
      if (conv && ((conv as any).conversation_id || (conv as any).id)) {
        results.push({
          ...conv,
          conversation_id: conv.conversation_id || (conv as any).id,
        });
      }
    } catch (err) {
      console.error(`Failed to get conversation with ID: ${id}`, err);
    }
  }
  return results;
}

/** GET shared conversations */
export async function getSharedConversations(): Promise<unknown> {
  const url = new URL(`https://${window.location.host}/backend-api/shared_conversations`);
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Conversations — mutations
// ---------------------------------------------------------------------------

/** PATCH /backend-api/conversation/:id with arbitrary body. */
export async function updateConversation(conversationId: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetchWithAuth(`${API.CONVERSATION_BY_ID}${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.json();
}

/** PATCH /backend-api/conversation/:id { title } */
export async function renameConversation(conversationId: string, title: string): Promise<unknown> {
  historyCache = {};
  delete conversationsCache[conversationId];
  const res = await fetchWithAuth(`${API.CONVERSATION_BY_ID}${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
  return res.json();
}

/** POST /backend-api/conversation/gen_title/:id */
export async function generateTitle(conversationId: string, messageId: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/conversation/gen_title/${conversationId}`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId }),
  });
  return res.json();
}

/** PATCH /backend-api/conversation/:id { is_archived: true } */
export async function archiveConversation(conversationId: string): Promise<unknown> {
  historyCache = {};
  delete conversationsCache[conversationId];
  const res = await fetchWithAuth(`${API.CONVERSATION_BY_ID}${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_archived: true }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** PATCH /backend-api/conversation/:id { is_archived: false } */
export async function unarchiveConversation(conversationId: string): Promise<unknown> {
  historyCache = {};
  delete conversationsCache[conversationId];
  const res = await fetchWithAuth(`${API.CONVERSATION_BY_ID}${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_archived: false }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** PATCH /backend-api/conversations { is_archived: true } (archive all) */
export async function archiveAllConversations(): Promise<unknown> {
  historyCache = {};
  Object.keys(conversationsCache).forEach((k) => delete conversationsCache[k]);
  const res = await fetchWithAuth(API.CONVERSATIONS, {
    method: 'PATCH',
    body: JSON.stringify({ is_archived: true }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** PATCH /backend-api/conversation/:id { is_visible: false } */
export async function deleteConversation(conversationId: string): Promise<unknown> {
  historyCache = {};
  delete conversationsCache[conversationId];
  const res = await fetchWithAuth(`${API.CONVERSATION_BY_ID}${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_visible: false }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** PATCH /backend-api/conversations { is_visible: false } (delete all) */
export async function deleteAllConversations(): Promise<unknown> {
  historyCache = {};
  Object.keys(conversationsCache).forEach((k) => delete conversationsCache[k]);
  const res = await fetchWithAuth(API.CONVERSATIONS, {
    method: 'PATCH',
    body: JSON.stringify({ is_visible: false }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** PATCH /backend-api/conversation/:id { gizmo_id } — add to project. */
export async function addConversationToProject(conversationId: string, gizmoId: string): Promise<unknown> {
  const res = await fetchWithAuth(`https://${window.location.host}/backend-api/conversation/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ gizmo_id: gizmoId }),
  });
  if (!res.ok) return Promise.reject(res);
  window.dispatchEvent(
    new CustomEvent('conversationProjectUpdated', {
      detail: { conversationId, gizmoId },
    }),
  );
  return res.json();
}

/** POST /backend-api/conversation/:id/async-status */
export async function updateAsyncStatus(conversationId: string): Promise<unknown> {
  const indicator = document.querySelector(`#conversation-button-${conversationId} #async-indicator-${conversationId}`);
  if (indicator) indicator.remove();

  const res = await fetchWithAuth(`/backend-api/conversation/${conversationId}/async-status`, { method: 'POST' });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * GET /backend-api/models
 *
 * Original guards against missing access token — if no token is available
 * yet (e.g. page just loaded, event bridge hasn't captured auth), return
 * undefined instead of firing a doomed fetch.
 */
export async function getModels(): Promise<unknown> {
  const { accessToken } = await chrome.storage.sync.get(['accessToken']);
  if (!accessToken) return undefined;
  const res = await fetchWithAuth(API.MODELS, {}, accessToken as string);
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** GET /public-api/conversation_limit */
export async function getConversationLimit(): Promise<unknown> {
  const res = await fetchWithAuth('/public-api/conversation_limit');
  const data = await res.json();
  if (data.message_cap) {
    chrome.storage.local.set({ conversationLimit: data });
  }
  return data;
}

// ---------------------------------------------------------------------------
// Gizmos / GPTs
// ---------------------------------------------------------------------------

/** Gizmo map for caching fetched gizmo data. */
const gizmoMap: Record<string, unknown> = {};

/**
 * GET /backend-api/gizmos/:id
 *
 * Checks local caches (gizmoMap, gizmosBootstrap, gizmosPinned) first.
 * On 404 tells the background to remove the gizmo.
 */
export async function getGizmoById(gizmoId: string, forceRefresh = false): Promise<any> {
  if (!gizmoId) return null;

  const { gizmosBootstrap, gizmosPinned } = await chrome.storage.local.get(['gizmosBootstrap', 'gizmosPinned']);

  const cached =
    (gizmoMap[gizmoId] as any) ||
    gizmosBootstrap?.gizmos?.find((g: any) => g?.resource?.gizmo?.id === gizmoId) ||
    (gizmosPinned as any[])?.find((g: any) => g?.gizmo?.id === gizmoId);

  if (cached && !forceRefresh) return cached;

  const res = await fetchWithAuth(`/backend-api/gizmos/${gizmoId}`);
  if (!res.ok) {
    if (res.status === 404) {
      chrome.runtime.sendMessage({
        type: 'deleteCouncilGizmo',
        detail: { gizmoId },
      });
    }
    return {};
  }

  const data = await res.json();
  if (data?.gizmo) {
    chrome.runtime.sendMessage({
      type: 'submitCouncilGizmos',
      detail: { gizmos: [data.gizmo] },
    });
  }
  gizmoMap[gizmoId] = { flair: { kind: 'recent' }, resource: data };
  return gizmoMap[gizmoId];
}

/** GET /backend-api/gizmos/:id/about */
export async function getGizmoAbout(gizmoId: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/gizmos/${gizmoId}/about`);
  if (!res.ok) return {};
  return res.json();
}

/** GET /backend-api/gizmos/bootstrap */
export async function getGizmosBootstrap(forceRefresh = false): Promise<unknown> {
  const { gizmosBootstrap } = await chrome.storage.local.get(['gizmosBootstrap']);
  if (gizmosBootstrap && !forceRefresh) return gizmosBootstrap;

  const res = await fetchWithAuth('/backend-api/gizmos/bootstrap');
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  chrome.storage.local.set({ gizmosBootstrap: data });
  return data;
}

/** GET /backend-api/gizmos/pinned */
export async function getGizmosPinned(forceRefresh = false): Promise<unknown> {
  const { gizmosPinned } = await chrome.storage.local.get(['gizmosPinned']);
  if (gizmosPinned && !forceRefresh) return gizmosPinned;

  const res = await fetchWithAuth('/backend-api/gizmos/pinned');
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  chrome.storage.local.set({ gizmosPinned: data.items });
  return data;
}

/** POST /backend-api/gizmos/:id/sidebar */
export async function updateGizmoSidebar(gizmoId: string, action: string): Promise<void> {
  await fetchWithAuth(`/backend-api/gizmos/${gizmoId}/sidebar`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  getGizmosBootstrap(true);
}

/** DELETE /backend-api/gizmos/:id */
export async function deleteGizmo(gizmoId: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/gizmos/${gizmoId}`, { method: 'DELETE' });
  if (!res.ok) return Promise.reject(res);
  chrome.runtime.sendMessage({
    type: 'deleteCouncilGizmo',
    detail: { gizmoId },
  });
  return res.json();
}

/** GET /public-api/gizmos/discovery/:category? */
export async function getGizmoDiscovery(
  category: string,
  cursor: string | null = null,
  limit = 24,
  locale = 'global',
  forceRefresh = true,
): Promise<unknown> {
  const { gizmoDiscovery } = await chrome.storage.local.get(['gizmoDiscovery']);
  if (!forceRefresh && gizmoDiscovery?.[category]) return gizmoDiscovery[category];

  let url: URL;
  if (category) {
    url = new URL(`https://${window.location.host}/public-api/gizmos/discovery/${category}`);
  } else {
    url = new URL(`https://${window.location.host}/public-api/gizmos/discovery`);
  }
  if (cursor) url.searchParams.append('cursor', cursor);
  if (limit) url.searchParams.append('limit', String(limit));
  if (locale) url.searchParams.append('locale', locale);

  const res = await fetchWithAuth(url.toString());
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();

  // Cache discovery data
  const existing = (await chrome.storage.local.get({ gizmoDiscovery: {} })).gizmoDiscovery || {};
  chrome.storage.local.set({ gizmoDiscovery: { ...existing, [category]: data } });

  // Sync gizmos to Council API
  const gizmos = category
    ? data.list.items.map((item: any) => item.resource.gizmo)
    : data.cuts.map((cut: any) => cut.list.items.map((item: any) => item.resource.gizmo)).flat();

  chrome.runtime.sendMessage({
    type: 'submitCouncilGizmos',
    detail: { gizmos, category },
  });

  return data;
}

/** GET /backend-api/gizmo_creators/:userId/gizmos */
export async function getGizmosByUser(userId: string, cursor: string | null = null): Promise<unknown> {
  const url = new URL(`https://${window.location.host}/backend-api/gizmo_creators/${userId}/gizmos`);
  if (cursor) url.searchParams.append('cursor', cursor);
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// User Settings
// ---------------------------------------------------------------------------

/** GET /backend-api/settings/user */
export async function getUserSettings(): Promise<unknown> {
  const res = await fetchWithAuth(API.USER_SETTINGS);
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  chrome.storage.local.set({ openAIUserSettings: data });
  return data;
}

/** PATCH /backend-api/settings/account_user_setting?feature=&value= */
export async function updateAccountUserSetting(feature: string, value: unknown): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/settings/account_user_setting?feature=${feature}&value=${value}`, {
    method: 'PATCH',
  });
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  getUserSettings(); // refresh cached settings
  return data;
}

/** GET /backend-api/settings/voices */
export async function getVoices(): Promise<unknown> {
  const res = await fetchWithAuth('/backend-api/settings/voices');
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** GET /backend-api/memories */
export async function getMemories(includeEntries = false): Promise<unknown> {
  const path = includeEntries ? '/backend-api/memories' : '/backend-api/memories?include_memory_entries=false';
  const res = await fetchWithAuth(path);
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Custom Instructions (User System Messages)
// ---------------------------------------------------------------------------

/**
 * POST /backend-api/user_system_messages
 *
 * Sets the user's custom instruction profile. Handles voice/connector
 * tool toggles as side effects.
 */
export async function setUserSystemMessage(
  name: string,
  role: string,
  aboutModel: string,
  aboutUser: string,
  personalityType: string,
  personalityTraits: Record<string, unknown>,
  enabled: boolean,
  disabledTools: string[] = [],
): Promise<unknown> {
  let tools = [...disabledTools];

  // Handle chatgpt_voice toggle
  if (tools.includes('chatgpt_voice')) {
    tools = tools.filter((t) => t !== 'chatgpt_voice');
    updateAccountUserSetting('voice_enabled', !enabled);
  } else {
    updateAccountUserSetting('voice_enabled', true);
  }

  // Handle connector_search toggle
  if (tools.includes('connector_search')) {
    tools = tools.filter((t) => t !== 'connector_search');
    updateAccountUserSetting('connector_search_enabled', !enabled);
  } else {
    updateAccountUserSetting('connector_search_enabled', true);
  }

  const payload: UserSystemMessagePayload = {
    object: 'user_system_message_detail',
    about_model_message: (enabled && aboutModel?.toString()) || '',
    about_user_message: (enabled && aboutUser?.toString()) || '',
    name_user_message: (enabled && name?.toString()) || '',
    other_user_message: (enabled && aboutUser?.toString()) || '',
    role_user_message: (enabled && role?.toString()) || '',
    traits_model_message: (enabled && aboutModel?.toString()) || '',
    personality_type_selection: (enabled && personalityType) || 'default',
    personality_traits: enabled ? personalityTraits || {} : {},
    traits_enabled: true,
    enabled: true,
    disabled_tools: enabled ? tools : [],
  };

  const res = await fetchWithAuth(API.USER_SYSTEM_MESSAGE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** GET /backend-api/user_system_messages */
export async function getUserSystemMessage(syncToBackground = false): Promise<unknown> {
  const res = await fetchWithAuth(API.USER_SYSTEM_MESSAGE);
  const data = await res.json();

  if (syncToBackground) {
    chrome.runtime.sendMessage({
      type: 'updateCustomInstructionProfileByData',
      detail: {
        profile: {
          aboutModelMessage: data.about_model_message?.toString() || '',
          aboutUserMessage: data.about_user_message?.toString() || '',
          nameUserMessage: data.name_user_message?.toString() || '',
          roleUserMessage: data.role_user_message?.toString() || '',
          otherUserMessage: data.other_user_message?.toString() || '',
          traitsModelMessage: data.traits_model_message?.toString() || '',
          personalityTypeSelection: data.personality_type_selection || 'default',
          personalityTraits: data.personality_traits || {},
          enabled: data.enabled,
          disabledTools: data.disabled_tools,
        },
      },
    });
  }
  return data;
}

/** GET /backend-api/user_system_message_trait_pills */
let cachedTraitPills: unknown[] = [];
export async function getUserSystemMessageTraitPills(): Promise<unknown[]> {
  if (cachedTraitPills.length > 0) return cachedTraitPills;
  const res = await fetchWithAuth('/backend-api/user_system_message_trait_pills');
  const data = await res.json();
  cachedTraitPills = data;
  return data;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** POST /backend-api/files — create file record on server. */
export async function createFileInServer(file: { name: string; size: number }, useCase: string): Promise<unknown> {
  const res = await fetchWithAuth(API.FILES, {
    method: 'POST',
    body: JSON.stringify({
      file_name: file.name,
      file_size: file.size,
      use_case: useCase,
    }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** GET /backend-api/files/:id — file status. */
export async function getFileStatus(fileId: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/files/${fileId}`);
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** PUT upload to the URL returned by createFileInServer. */
export async function uploadFileAPI(_fileId: string, uploadUrl: string, body: Blob | ArrayBuffer): Promise<Response> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob' },
    body,
  });
  if (!res.ok) return Promise.reject(res);
  return res;
}

/** POST /backend-api/files/uploaded/:id — confirm upload. */
export async function uploadedAPI(fileId: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/files/uploaded/${fileId}`, {
    method: 'POST',
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/**
 * GET download URL for a file ID.
 *
 * Uses a 3-minute cache. Handles both `file_*` (attachment) and regular file IDs.
 */
export async function getDownloadUrlFromFileId(
  conversationId: string,
  fileId: string,
  forceRefresh = false,
): Promise<FileDownloadInfo> {
  const cached = fileIdToDownloadUrlCache[fileId];
  if (cached?.timestamp && Date.now() - cached.timestamp < 3 * 60 * 1000 && !forceRefresh) {
    return { ...cached.data };
  }

  const path = fileId.startsWith('file_')
    ? `/backend-api/conversation/${conversationId}/attachment/${fileId}/download`
    : `/backend-api/files/download/${fileId}`;

  const res = await fetchWithAuth(path);
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();

  if (fileId) {
    fileIdToDownloadUrlCache[fileId] = { timestamp: Date.now(), data };
  }
  return data;
}

/** GET download URL from sandbox path. */
export async function getDownloadUrlFromSandBoxPath(
  conversationId: string,
  messageId: string,
  sandboxPath: string,
): Promise<unknown> {
  const res = await fetchWithAuth(
    `/backend-api/conversation/${conversationId}/interpreter/download?message_id=${messageId}&sandbox_path=${sandboxPath}`,
  );
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

/** POST /backend-api/share/create */
export async function createShare(conversationId: string, currentNodeId: string, isAnonymous = true): Promise<unknown> {
  const res = await fetchWithAuth(`https://${window.location.host}/backend-api/share/create`, {
    method: 'POST',
    body: JSON.stringify({
      is_anonymous: isAnonymous,
      conversation_id: conversationId,
      current_node_id: currentNodeId,
    }),
  });
  return res.json();
}

/** PATCH /backend-api/share/:shareId */
export async function shareConv(shareData: {
  share_id: string;
  current_node_id?: string;
  highlighted_message_id?: string;
  is_anonymous?: boolean;
  is_discoverable?: boolean;
  is_public?: boolean;
  is_visible?: boolean;
  title?: string;
}): Promise<unknown> {
  const res = await fetchWithAuth(`https://${window.location.host}/backend-api/share/${shareData.share_id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      current_node_id: shareData.current_node_id,
      highlighted_message_id: shareData.highlighted_message_id,
      is_anonymous: shareData.is_anonymous,
      is_discoverable: shareData.is_discoverable,
      is_public: shareData.is_public,
      is_visible: shareData.is_visible,
      share_id: shareData.share_id,
      title: shareData.title,
    }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** DELETE /backend-api/share/:shareId */
export async function deleteShare(shareId: string): Promise<unknown> {
  const res = await fetchWithAuth(`https://${window.location.host}/backend-api/share/${shareId}`, { method: 'DELETE' });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** POST /backend-api/conversation/message_feedback */
export async function messageFeedback(
  conversationId: string,
  messageId: string,
  rating: string,
  text = '',
): Promise<unknown> {
  const body: Record<string, unknown> = {
    conversation_id: conversationId,
    message_id: messageId,
    rating,
    tags: [],
  };
  if (text) body.text = text;

  const res = await fetchWithAuth(API.FEEDBACK, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * GET /backend-api/gizmos/snorlax/sidebar
 *
 * Fetches the projects sidebar. Caches by cursor.
 */
export async function getProjects(cursor: string | number | null = null, conversationsPerGizmo = 1): Promise<unknown> {
  const cacheKey = cursor || 0;
  if (projectCache[cacheKey]) return projectCache[cacheKey];

  const url = new URL(`https://${window.location.host}/backend-api/gizmos/snorlax/sidebar`);
  if (conversationsPerGizmo) {
    url.searchParams.append('conversations_per_gizmo', String(conversationsPerGizmo));
  }
  if (cursor) url.searchParams.append('cursor', String(cursor));

  const res = await fetchWithAuth(url.toString());
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  projectCache[cacheKey] = data;
  return data;
}

/**
 * GET /backend-api/gizmos/:gizmoId/conversations
 *
 * Recursively fetches all conversations for a project.
 */
export async function getProjectConversations(gizmoId: string): Promise<unknown[]> {
  async function fetchPage(cursor: string | null = null): Promise<unknown[]> {
    const url = new URL(`https://${window.location.host}/backend-api/gizmos/${gizmoId}/conversations`);
    if (cursor) url.searchParams.append('cursor', cursor);

    const res = await fetchWithAuth(url.toString());
    if (!res.ok) return Promise.reject(res);
    const data = await res.json();
    return data.cursor ? data.items.concat(await fetchPage(data.cursor)) : data.items;
  }
  return fetchPage();
}

// ---------------------------------------------------------------------------
// Prompts / Suggestions
// ---------------------------------------------------------------------------

let lastPromptSuggestions: string[] = [];

/** GET /backend-api/prompt_library/ */
export async function getExamplePrompts(offset = 0, limit = 4): Promise<unknown> {
  const url = new URL(`https://${window.location.host}/backend-api/prompt_library/`);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));

  const res = await fetchWithAuth(url.toString());
  const data = await res.json();
  lastPromptSuggestions = data?.items?.map((item: any) => item.prompt) || [];
  return data;
}

/** POST /backend-api/conversation/:id/experimental/generate_suggestions */
export async function generateSuggestions(
  conversationId: string,
  messageId: string,
  model: string,
  numSuggestions = 2,
): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/conversation/${conversationId}/experimental/generate_suggestions`, {
    method: 'POST',
    body: JSON.stringify({
      message_id: messageId,
      model,
      num_suggestions: numSuggestions,
    }),
  });
  const data = await res.json();
  lastPromptSuggestions = data.suggestions || [];
  return data;
}

/** Get the last set of prompt suggestions. */
export function getLastPromptSuggestions(): string[] {
  return lastPromptSuggestions;
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

const citationAttributions: unknown[] = [];

/** POST /backend-api/attributions */
export async function getCitationAttributions(urls: string[]): Promise<unknown[]> {
  const res = await fetchWithAuth('/backend-api/attributions', {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) return Promise.reject(res);

  const contentType = res.headers.get('content-type');
  let data: unknown[];
  if (contentType?.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = text
      .split('\n')
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  citationAttributions.push(...data);
  return data;
}

// ---------------------------------------------------------------------------
// Text Docs (Canvas)
// ---------------------------------------------------------------------------

/** GET /backend-api/conversation/:id/textdocs */
export async function getConversationTextDocs(conversationId: string, forceRefresh = false): Promise<unknown> {
  if (conversationTextDocsCache[conversationId] && !forceRefresh) {
    return conversationTextDocsCache[conversationId];
  }
  const res = await fetchWithAuth(`/backend-api/conversation/${conversationId}/textdocs`);
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** GET /backend-api/textdoc/:id */
export async function getTextDoc(textDocId: string, forceRefresh = false): Promise<unknown> {
  if (textDocCache[textDocId] && !forceRefresh) return textDocCache[textDocId];
  const res = await fetchWithAuth(`/backend-api/textdoc/${textDocId}`);
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** GET /backend-api/textdoc/:id/history?before_version= */
export async function getTextDocHistory(textDocId: string, beforeVersion: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/textdoc/${textDocId}/history?before_version=${beforeVersion}`);
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** GET /backend-api/gizmo_creator_profile */
export async function gizmoCreatorProfile(): Promise<unknown> {
  const res = await fetchWithAuth('/backend-api/gizmo_creator_profile');
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** GET /backend-api/opengraph/tags?url= */
export async function openGraph(url: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/opengraph/tags?url=${encodeURIComponent(url)}`);
  return res.json();
}

/** GET /backend-api/workspaces/:workspaceId/conversation_templates/:templateId */
export async function getConversationTemplates(workspaceId: string, templateId: string): Promise<unknown> {
  const res = await fetchWithAuth(`/backend-api/workspaces/${workspaceId}/conversation_templates/${templateId}`);
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

/** POST /backend-api/accounts/transfer */
export async function accountTransfer(workspaceId: string): Promise<unknown> {
  const res = await fetchWithAuth('/backend-api/accounts/transfer', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  if (!res.ok) return Promise.reject(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Cache management (used by event bridge)
// ---------------------------------------------------------------------------

/** Clear the history list cache. */
export function clearHistoryCache(): void {
  historyCache = {};
}

/** Remove a single conversation from the cache. */
export function evictConversationCache(conversationId: string): void {
  delete conversationsCache[conversationId];
}

/** Clear all conversation caches. */
export function clearAllConversationCaches(): void {
  historyCache = {};
  Object.keys(conversationsCache).forEach((k) => delete conversationsCache[k]);
}

/** Cache a file download URL entry. */
export function cacheFileDownloadUrl(fileId: string, data: FileDownloadInfo): void {
  fileIdToDownloadUrlCache[fileId] = { timestamp: Date.now(), data };
}

/** Cache a conversation. */
export function cacheConversation(conversationId: string, data: Conversation): void {
  conversationsCache[conversationId] = data;
}

/** Read a cached conversation (or undefined). */
export function getCachedConversation(conversationId: string): Conversation | undefined {
  return conversationsCache[conversationId];
}

/** Cache text docs for a conversation. */
export function cacheConversationTextDocs(conversationId: string, docs: unknown): void {
  conversationTextDocsCache[conversationId] = docs;
}

/** Expose projectCache for event bridge. */
export function cacheProject(key: string | number, data: unknown): void {
  projectCache[key] = data;
}

/** Register a chrome.runtime.onMessage listener for getConversations calls. */
export function registerConversationsMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'getConversations') {
      const { offset, limit, order, isArchived } = message.detail;
      getConversations(offset, limit, order, isArchived, true).then(sendResponse);
      return true; // async response
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

/** Social share post cache. */
const sharePostCache: Record<string, unknown> = {};

/** Gizmo user action settings cache. */
const gizmoUserActionSettingsCache: Record<string, unknown> = {};

/** Cached audios. */
const cachedAudios: Record<string, unknown> = {};

/**
 * Flush all in-memory API caches.
 *
 * Original: content.isolated.end.js line 3311
 */
export function flushCache(): void {
  Object.keys(historyCache).forEach((k) => delete historyCache[k]);
  Object.keys(textDocCache).forEach((k) => delete textDocCache[k]);
  Object.keys(cachedAudios).forEach((k) => delete cachedAudios[k]);
  Object.keys(conversationsCache).forEach((k) => delete conversationsCache[k]);
  Object.keys(conversationTextDocsCache).forEach((k) => delete conversationTextDocsCache[k]);
  Object.keys(fileIdToDownloadUrlCache).forEach((k) => delete fileIdToDownloadUrlCache[k]);
  Object.keys(sharePostCache).forEach((k) => delete sharePostCache[k]);
  Object.keys(gizmoMap).forEach((k) => delete gizmoMap[k]);
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Extract the ChatGPT account ID from the `_account` cookie.
 * Returns "default" for personal accounts or if the cookie is missing.
 *
 * Original: content.isolated.end.js line 3329
 */
export function getChatGPTAccountIdFromCookie(): string {
  const value = document.cookie
    ?.split('; ')
    ?.find((c) => c.startsWith('_account='))
    ?.split('=')[1];
  return value === 'personal' ? 'default' : value || 'default';
}

// ---------------------------------------------------------------------------
// Gizmo payload conversion
// ---------------------------------------------------------------------------

/**
 * Convert a full gizmo resource object to the minimal API payload shape
 * used when creating/updating custom GPTs.
 *
 * Original: content.isolated.end.js line 3521
 */
export function convertGizmoToPayload(resource: any): Record<string, unknown> {
  const gizmo = resource.gizmo;
  return {
    id: gizmo.id,
    name: gizmo.display.name,
    author: gizmo.author,
    config: {
      context_message: gizmo.instructions,
      model_slug: null,
      assistant_welcome_message: gizmo.display.welcome_message,
      prompt_starters: gizmo.display.prompt_starters,
      enabled_tools: resource.tools.map((t: any) => ({ tool_id: t.type })),
      files: resource.files,
      tags: gizmo.tags,
    },
    description: gizmo.display.description,
    owner_id: gizmo.author.user_id.split('__')?.[0],
    updated_at: gizmo.updated_at,
    profile_pic_permalink: gizmo.display.profile_picture_url,
    share_recipient: gizmo.share_recipient,
    version: gizmo.version,
    live_version: gizmo.live_version,
    short_url: gizmo.short_url,
    vanity_metrics: gizmo.vanity_metrics,
    allowed_sharing_recipients: gizmo.allowed_sharing_recipients,
    product_features: resource.product_features,
  };
}

// ---------------------------------------------------------------------------
// Gizmo action settings (OAuth / plugin actions)
// ---------------------------------------------------------------------------

/**
 * POST /backend-api/gizmos/action_settings — update action settings for a gizmo.
 *
 * Original: content.isolated.end.js line 3808
 */
export async function updateActionSettings(
  gizmoId: string,
  domain: string,
  gizmoActionId: string,
  actionSettings: Record<string, unknown>,
): Promise<unknown> {
  const body = { domain, gizmo_action_id: gizmoActionId, action_settings: actionSettings };
  const res = await fetchWithAuth('/backend-api/gizmos/action_settings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) return Promise.reject(res);
  // Refresh the action settings cache after update
  getGizmoUserActionSettings(gizmoId, true);
  return res.json();
}

/**
 * POST /backend-api/gizmos/oauth_redirect — open OAuth dialog for a gizmo action.
 *
 * Original: content.isolated.end.js line 3824
 */
export async function openOAuthDialog(
  gizmoId: string,
  domain: string,
  gizmoActionId: string,
  redirectTo: string,
): Promise<void> {
  const body = {
    gizmo_id: gizmoId,
    domain,
    gizmo_action_id: gizmoActionId,
    redirect_to: redirectTo,
  };
  const res = await fetchWithAuth('/backend-api/gizmos/oauth_redirect', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) return Promise.reject(res) as any;
  const data = await res.json();
  window.history.pushState({}, '', data.redirect_uri);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

/**
 * GET /backend-api/gizmos/user_action_settings — cached per gizmo ID.
 *
 * Original: content.isolated.end.js line 3845
 */
export async function getGizmoUserActionSettings(gizmoId: string, forceRefresh = false): Promise<unknown> {
  if (gizmoUserActionSettingsCache[gizmoId] && !forceRefresh) {
    return gizmoUserActionSettingsCache[gizmoId];
  }
  const res = await fetchWithAuth(`/backend-api/gizmos/user_action_settings?gizmo_id=${gizmoId}`);
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  gizmoUserActionSettingsCache[gizmoId] = data;
  return data;
}

// ---------------------------------------------------------------------------
// Social sharing
// ---------------------------------------------------------------------------

/**
 * POST /backend-api/share/post — create a shareable social post for an image.
 *
 * Original: content.isolated.end.js line 4160
 */
export async function sharePost(
  shareData: {
    share_id?: string;
    attachments_to_create: Array<Record<string, unknown>>;
    post_text: string;
  },
  forceRefresh = false,
): Promise<any> {
  const cacheKey = shareData.share_id || '';
  if (sharePostCache[cacheKey] && !forceRefresh) {
    return sharePostCache[cacheKey];
  }

  const url = `https://${window.location.host}/backend-api/share/post`;
  const body = {
    attachments_to_create: shareData.attachments_to_create,
    post_text: shareData.post_text,
  };
  const res = await fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  sharePostCache[cacheKey] = data;
  return data;
}

// ---------------------------------------------------------------------------
// Legacy conversations fetch
// ---------------------------------------------------------------------------

/**
 * Fetch all conversations using the old REST pagination approach.
 * Uses getConversations() internally with offset/limit pagination.
 *
 * Original: content.isolated.end.js line 4274
 */
export async function getAllConversationsOld(): Promise<ConversationSummary[]> {
  const all: ConversationSummary[] = [];
  const first = await getConversations(0, 100);
  const { limit, offset, items, total } = first;
  if (typeof total !== 'undefined') {
    chrome.storage.local.set({ totalConversations: total });
  }
  if (!items?.length || total === 0) return [];

  all.push(...items.map((item: any) => ({ ...item, conversation_id: item.id })));

  if (offset + limit < total) {
    const pages = Math.ceil(total / limit);
    const promises: Promise<ConversationsPage>[] = [];
    for (let i = 1; i < pages; i += 1) {
      promises.push(getConversations(i * limit, limit));
    }
    try {
      const results = await Promise.all(promises);
      results.forEach((page) => {
        if (page.items) {
          all.push(...page.items.map((item: any) => ({ ...item, conversation_id: item.id })));
        }
      });
    } catch (err) {
      console.warn('error getting conversations promise', err);
      return Promise.reject(err) as any;
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// GraphQL conversations
// ---------------------------------------------------------------------------

/**
 * Fetch conversations using ChatGPT's GraphQL endpoint.
 *
 * Original: content.isolated.end.js line 4413
 */
export async function getConversationsGraphql(
  first = 100,
  after = 'aWR4Oi0x',
  order = 'updated',
  expand = true,
  isArchived = false,
): Promise<{ items: any[]; pageInfo: any }> {
  const url = new URL('https://chatgpt.com/graphql');
  const variables = { first, after, order, expand, isArchived };
  const extensions = {
    persistedQuery: {
      sha256Hash: '5f5770417560c56ba8fa929b84900b53f40cdcc3906d5197003e9ecf7adf3bb7',
      version: 1,
    },
  };

  url.searchParams.append('variables', JSON.stringify(variables));
  url.searchParams.append('extensions', JSON.stringify(extensions));

  const res = await fetchWithAuth(url.toString());
  if (!res.ok) return Promise.reject(res);
  const data = await res.json();
  return {
    items: data.data.conversationDisplayHistory.edges.map((e: any) => e.node),
    pageInfo: data.data.conversationDisplayHistory.pageInfo,
  };
}
