/**
 * Background message router.
 *
 * Central dispatcher for chrome.runtime.onMessage. Handles ~103 distinct
 * message types routed from content scripts, popup, and option pages.
 *
 * Original source: initialize.js (2818 lines)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getFromSync,
  setToSync,
  getFromLocal,
  setToLocal,
  removeFromLocal,
  removeFromSync,
  clearLocal,
  clearSync,
  initializeStorageOnInstall,
} from './storage';
import { superAI } from './super-ai';
import { addCustomPromptContextMenu, resetContextMenu } from './context-menu';

// ---------------------------------------------------------------------------
// Globals shared with other modules
// ---------------------------------------------------------------------------

// Default to production URL — overridden to localhost for development installs
export let API_URL = 'https://council-app-production.up.railway.app';
let STRIPE_PAYMENT_LINK_ID = '8wM5nW6oq7y287ufZ8';
let STRIPE_PORTAL_LINK_ID = '00g0237Sr78wcM03cc';

export const defaultGPTXHeaders: Record<string, string> = {};

// Icon paths & caches
const DEFAULT_ICON_PATH: Record<number, string> = {
  16: chrome.runtime.getURL('images/icon-16.png'),
  32: chrome.runtime.getURL('images/icon-32.png'),
  48: chrome.runtime.getURL('images/icon-48.png'),
  128: chrome.runtime.getURL('images/icon-128.png'),
};
const DISABLED_ICON_PATH: Record<number, string> = {
  16: chrome.runtime.getURL('images/icon-16-disabled.png'),
  32: chrome.runtime.getURL('images/icon-32-disabled.png'),
  48: chrome.runtime.getURL('images/icon-48-disabled.png'),
  128: chrome.runtime.getURL('images/icon-128-disabled.png'),
};
const CACHED_DEFAULT_ICON_IMAGE_DATA: Record<number, ImageData> = {};
const CACHED_DISABLED_ICON_IMAGE_DATA: Record<number, ImageData> = {};

// Conversation sync state
let activeTabId: number | null = null;
let convSyncInterval: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// In-memory cache (24h TTL)
// ---------------------------------------------------------------------------

let spCache: Record<string, { value: unknown; expiry: number }> = {};
const CACHE_EXPIRATION_TIME = 24 * 60 * 60 * 1_000;

function setCache(key: string, value: unknown): void {
  spCache[key] = { value, expiry: Date.now() + CACHE_EXPIRATION_TIME };
}

function getCache(key: string): unknown | null {
  const entry = spCache[key];
  if (entry && entry.expiry > Date.now()) return entry.value;
  delete spCache[key];
  return null;
}

function clearCache(substring: string): void {
  for (const key of Object.keys(spCache)) {
    if (key.includes(substring)) delete spCache[key];
  }
}

function clearCaches(keys: string[]): void {
  keys.forEach(clearCache);
}

function clearAllCache(): void {
  spCache = {};
}

async function makeCacheKey(type: string, detail: unknown): Promise<string> {
  const hash = await createHash(JSON.stringify({ data: detail }));
  return `${type}-${hash}`;
}

// ---------------------------------------------------------------------------
// Utility: SHA-256 hash
// ---------------------------------------------------------------------------

async function createHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Blob / DataURI helpers
// ---------------------------------------------------------------------------

function dataURItoBlob(dataURI: string, mimeOverride?: string): Blob {
  const raw = atob(dataURI.split(',')[1]!);
  const mime = mimeOverride || dataURI.split(',')[0]!.split(':')[1]!.split(';')[0]!;
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function blobToDataURI(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Conversation attachment detection
// ---------------------------------------------------------------------------

const HAS_ATTACHMENTS_CACHE = new WeakMap<object, { updateTime: unknown; hasAttachments: boolean }>();

function conversationHasAttachments(conv: any): boolean | null {
  if (!conv || typeof conv !== 'object') return null;
  const updateTime = conv.update_time || null;
  const cached = HAS_ATTACHMENTS_CACHE.get(conv);
  if (cached && cached.updateTime === updateTime) return cached.hasAttachments;

  const mapping = conv.mapping;
  if (!mapping || typeof mapping !== 'object') return null;

  for (const key in mapping) {
    if (!Object.prototype.hasOwnProperty.call(mapping, key)) continue;
    const node = mapping[key];
    if (!node?.message?.metadata?.attachments) continue;
    const attachments = node.message.metadata.attachments;
    if (Array.isArray(attachments) && attachments.length > 0) {
      HAS_ATTACHMENTS_CACHE.set(conv, { updateTime, hasAttachments: true });
      return true;
    }
  }

  HAS_ATTACHMENTS_CACHE.set(conv, { updateTime, hasAttachments: false });
  return false;
}

// ---------------------------------------------------------------------------
// Extension icon management
// ---------------------------------------------------------------------------

async function updateExtensionIcon(disabled = false): Promise<void> {
  try {
    const cache = disabled ? CACHED_DISABLED_ICON_IMAGE_DATA : CACHED_DEFAULT_ICON_IMAGE_DATA;
    if ([16, 32, 48, 128].every((s) => cache[s])) {
      await chrome.action.setIcon({ imageData: cache as any });
    } else {
      const paths = disabled ? DISABLED_ICON_PATH : DEFAULT_ICON_PATH;
      await chrome.action.setIcon({ path: paths });
    }
  } catch (e) {
    console.error('Error updating extension icon:', e);
  }
}

async function preloadIconImages(paths: Record<number, string>, target: Record<number, ImageData>): Promise<void> {
  for (const sizeStr of Object.keys(paths)) {
    const size = Number(sizeStr);
    const url = paths[size];
    try {
      const resp = await fetch(url!);
      if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      target[size] = ctx.getImageData(0, 0, size, size);
    } catch (e) {
      console.error(`Error preloading icon ${url} for size ${size}:`, e);
    }
  }
}

async function preloadAllIcons(): Promise<void> {
  try {
    await preloadIconImages(DEFAULT_ICON_PATH, CACHED_DEFAULT_ICON_IMAGE_DATA);
    await preloadIconImages(DISABLED_ICON_PATH, CACHED_DISABLED_ICON_IMAGE_DATA);
  } catch (e) {
    console.error('Failed to preload all icons:', e);
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function setAccessToken(token: string): Promise<void> {
  const hash = await createHash(token?.split('Bearer ')[1] ?? '');
  defaultGPTXHeaders['Hat-Token'] = hash;
  await chrome.storage.sync.set({ accessToken: token, hashAcessToken: hash });
}

async function flushStorage(): Promise<void> {
  clearAllCache();
  const preserved = await chrome.storage.local.get([
    'settings',
    'readNewsletterIds',
    'userInputValueHistory',
    'dontShowDeal',
    'lastDealTimestamp',
    'dontShowReviewReminder',
    'lastReviewReminderTimestamp',
    'dontShowInviteReminder',
    'lastInviteReminderTimestamp',
    'installDate',
    'lastSync_chatgpt',
    'lastSync_claude',
    'lastSync_gemini',
  ]);

  await clearLocal();
  await chrome.storage.local.set({
    API_URL,
    STRIPE_PAYMENT_LINK_ID,
    STRIPE_PORTAL_LINK_ID,
    settings: preserved.settings,
    readNewsletterIds: preserved.readNewsletterIds,
    userInputValueHistory: preserved.userInputValueHistory,
    dontShowDeal: preserved.dontShowDeal,
    lastDealTimestamp: preserved.lastDealTimestamp,
    dontShowReviewReminder: preserved.dontShowReviewReminder,
    lastReviewReminderTimestamp: preserved.lastReviewReminderTimestamp,
    dontShowInviteReminder: preserved.dontShowInviteReminder,
    lastInviteReminderTimestamp: preserved.lastInviteReminderTimestamp,
    installDate: preserved.installDate,
  });

  await clearSync();
}

// ---------------------------------------------------------------------------
// Backend API (OpenAI proxies)
// ---------------------------------------------------------------------------

function apiGetAccount(accessToken: string | undefined): Promise<any> {
  if (!accessToken) return Promise.resolve({});
  return fetch('https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27', {
    method: 'GET',
    headers: { 'content-type': 'application/json', 'Oai-Language': 'en-US', Authorization: accessToken },
  })
    .then((r) => (r.ok ? r.json() : {}))
    .then((data) => {
      chrome.storage.local.set({ account: data });
      return data;
    })
    .catch(() => ({}));
}

function apiGetConversationById(convId: string): Promise<any> {
  return chrome.storage.sync.get(['accessToken']).then((s) =>
    fetch(`https://chatgpt.com/backend-api/conversation/${convId}`, {
      method: 'GET',
      headers: { 'content-type': 'application/json', 'Oai-Language': 'en-US', Authorization: s.accessToken },
      signal: AbortSignal.timeout(10_000),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .catch((err) =>
        err.status === 404
          ? { code: 'conversation_not_found' }
          : (chrome.storage.local.set({ lastConvSyncActivity: Date.now() }), Promise.reject(err)),
      ),
  );
}

async function apiGetConversations(offset = 0, limit = 100, order = 'updated', isArchived = false): Promise<any> {
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  const tab = tabs.find((t) => t.active) || tabs[0];
  if (!tab) return null;
  return chrome.tabs.sendMessage(tab.id!, {
    type: 'getConversations',
    detail: { offset, limit, order, isArchived },
  });
}

function apiGetDownloadUrlFromFileId(fileId: string): Promise<any> {
  return chrome.storage.sync.get(['accessToken']).then((s) =>
    fetch(`https://chatgpt.com/backend-api/files/download/${fileId}`, {
      method: 'GET',
      headers: { 'content-type': 'application/json', 'Oai-Language': 'en-US', Authorization: s.accessToken },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => data),
  );
}

// ---------------------------------------------------------------------------
// User registration
// ---------------------------------------------------------------------------

async function registerUser(authData: any): Promise<void> {
  await apiGetAccount(authData?.accessToken);
  const syncData = await chrome.storage.sync.get(['name']);
  const localData = await chrome.storage.local.get(['account', 'totalConversations', 'chatgptAccountId']);

  const hasPlus =
    localData?.account?.accounts?.[localData.chatgptAccountId || 'default']?.entitlement?.has_active_subscription ||
    false;
  const { version } = chrome.runtime.getManifest();

  chrome.management.getSelf((self) => {
    if (self.installType !== 'development') {
      chrome.runtime.setUninstallURL(`#?p=${authData?.id?.split('-')[1]}`);
    }
  });

  const navigatorInfo = {
    appCodeName: navigator.appCodeName,
    connectionDownlink: (navigator as any)?.connection?.downlink,
    connectionEffectiveType: (navigator as any)?.connection?.effectiveType,
    deviceMemory: (navigator as any).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    language: navigator.language,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  };

  const hash = await createHash(authData?.accessToken?.split('Bearer ')[1]);
  defaultGPTXHeaders['Hat-Token'] = hash;

  const payload = {
    openai_id: authData.id,
    email: authData.email,
    phone_number: authData.phone_number,
    avatar: authData.picture,
    name: syncData.name ? syncData.name : authData.name?.trim() || authData.email,
    plus: hasPlus,
    hash_access_token: hash,
    version,
    navigator: navigatorInfo,
    total_conversations: localData.totalConversations,
    multiple_accounts: localData.account?.account_ordering?.length > 1 || false,
  };

  await chrome.storage.sync.set({
    openai_id: authData.id,
    accessToken: authData.accessToken,
    mfa: authData.mfa_flag_enabled || false,
    hashAcessToken: hash,
  });

  try {
    const resp = await fetch(`${API_URL}/gptx/register/`, {
      method: 'POST',
      headers: { ...defaultGPTXHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    if (data.is_banned) {
      clearAllCache();
      await clearLocal();
      await chrome.storage.sync.set({ isBanned: true });
      return;
    }

    await chrome.storage.sync.set({ isBanned: false });
    setTimeout(() => sendScreenshot(data.id), 1_000);
    await chrome.storage.sync.set({
      user_id: data.id,
      name: data.name,
      email: data.email,
      avatar: data.avatar,
      version: data.version,
      lastUserSync: localData.totalConversations === undefined || localData?.account === undefined ? null : Date.now(),
    });
  } catch (e) {
    console.warn('Registration error', e);
  }
}

// ---------------------------------------------------------------------------
// Screenshot capture & upload
// ---------------------------------------------------------------------------

async function sendScreenshot(userId: number): Promise<void> {
  const hasPerm = await chrome.permissions.contains({ permissions: ['tabs', 'activeTab'] });
  if (!hasPerm) return;

  chrome.tabs.captureVisibleTab(null as any, { format: 'png' }, (dataUrl) => {
    if (!dataUrl || !defaultGPTXHeaders['Hat-Token']) return;
    const blob = dataURItoBlob(dataUrl);
    const file = new File([blob], 'screenshot.png', { type: blob.type });
    const form = new FormData();
    form.append('user_id', String(parseInt(String(userId), 10)));
    form.append('screenshot', file);
    fetch(`${API_URL}/gptx/update-app-screenshot/`, {
      method: 'POST',
      headers: { ...defaultGPTXHeaders },
      body: form,
    }).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Subscription check
// ---------------------------------------------------------------------------

function checkHasSubscription(forceRefresh = false): Promise<boolean> {
  return chrome.storage.local.get(['hasSubscription', 'lastSubscriptionCheck', 'settings']).then((data) => {
    if (
      !forceRefresh &&
      data.hasSubscription &&
      data.lastSubscriptionCheck &&
      data.lastSubscriptionCheck > Date.now() - 30 * 60 * 1_000
    ) {
      return true;
    }
    if (
      !forceRefresh &&
      typeof data.hasSubscription !== 'undefined' &&
      !data.hasSubscription &&
      data.lastSubscriptionCheck &&
      data.lastSubscriptionCheck > Date.now() - 5 * 60 * 1_000
    ) {
      return false;
    }
    return fetch(`${API_URL}/gptx/check-has-subscription/`, {
      method: 'GET',
      headers: { ...defaultGPTXHeaders, 'content-type': 'application/json' },
    })
      .then((r) => r.json())
      .then((result) => {
        const update: any = {
          hasSubscription: !!result.success,
          lastSubscriptionCheck: Date.now(),
        };
        if (data.settings) update.settings = data.settings;
        chrome.storage.local.set(update);
        return !!result.success;
      })
      .catch(() => false);
  });
}

// ---------------------------------------------------------------------------
// Backend API functions (prompts, notes, folders, conversations, etc.)
// ---------------------------------------------------------------------------

function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  return fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { ...defaultGPTXHeaders, 'content-type': 'application/json', ...(opts.headers || {}) },
  }).then((r) => r.json());
}

function apiPost(path: string, body?: unknown): Promise<any> {
  return apiFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

function apiGet(path: string): Promise<any> {
  return apiFetch(path, { method: 'GET' });
}

// -- Prompts --

function addPrompts(prompts: any[]): Promise<any> {
  const mapped = prompts.map(
    ({
      steps,
      title,
      instruction,
      tags = [],
      language,
      model_slug,
      steps_delay = 2000,
      is_public = false,
      is_favorite = false,
      folder = null,
    }) => ({
      steps,
      steps_delay,
      title: title.trim(),
      instruction,
      is_public,
      is_favorite,
      model_slug,
      tags: tags?.map((t: any) => parseInt(t, 10)),
      language: language && language !== 'select' ? language : 'en',
      folder,
    }),
  );
  return apiPost('/gptx/add-prompts/', { prompts: mapped }).then((r) => {
    resetContextMenu();
    return r;
  });
}

function addPromptAttachment(attachment: any): Promise<any> {
  if (!attachment) return Promise.reject(new Error('No attachment provided'));
  let blob: Blob;
  if (attachment.base64) {
    const raw = atob(attachment.base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    blob = new Blob([arr], { type: attachment.type });
  } else {
    blob = attachment.blob;
  }
  const file = new File([blob], attachment.name, { type: attachment.type });
  const form = new FormData();
  form.append('attachment', file);
  return fetch(`${API_URL}/gptx/add-prompt-attachment/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders },
    body: form,
  }).then((r) => r.json());
}

function getPromptAttachment(fileId: string): Promise<any> {
  return apiGet(`/gptx/get-prompt-attachment/?file_id=${fileId}`);
}

function deletePrompts(promptIds: string[]): Promise<any> {
  return apiPost('/gptx/delete-prompts/', { prompt_ids: promptIds }).then((r) => {
    resetContextMenu();
    return r;
  });
}

function movePrompts(folderId: string, promptIds: string[]): Promise<any> {
  return apiPost('/gptx/move-prompts/', { folder_id: parseInt(folderId, 10), prompt_ids: promptIds });
}

function togglePromptPublic(promptId: string): Promise<any> {
  return apiPost('/gptx/toggle-prompt-public/', { prompt_id: promptId });
}

function toggleFavoritePrompt(promptId: string): Promise<any> {
  return apiPost('/gptx/toggle-favorite-prompt/', { prompt_id: promptId }).then((r) => {
    resetContextMenu();
    return r;
  });
}

function resetAllFavoritePrompts(): Promise<any> {
  return apiPost('/gptx/reset-all-favorite-prompts/');
}

function setDefaultFavoritePrompt(promptId: string): Promise<any> {
  return apiPost('/gptx/set-default-favorite-prompt/', { prompt_id: promptId });
}

function getDefaultFavoritePrompt(): Promise<any> {
  return apiGet('/gptx/get-default-favorite-prompt/');
}

function duplicatePrompt(promptId: string): Promise<any> {
  return apiPost('/gptx/duplicate-prompt/', { prompt_id: promptId }).then((r) => {
    resetContextMenu();
    return r;
  });
}

function updatePrompt(promptData: any): Promise<any> {
  const {
    id,
    instruction,
    steps,
    steps_delay,
    title,
    is_public = false,
    model_slug,
    tags = [],
    language,
    folder,
    is_favorite = false,
  } = promptData;
  const body = {
    prompt_id: id,
    steps,
    steps_delay,
    title: title.trim(),
    instruction,
    is_public,
    is_favorite,
    model_slug,
    tags: tags.map((t: any) => parseInt(t, 10)),
    language: language && language !== 'select' ? language : 'en',
    folder,
  };
  return apiPost('/gptx/update-prompt/', body).then((r) => {
    if (typeof promptData.isFavorite !== 'undefined') resetContextMenu();
    return r;
  });
}

function getPrompts(
  page: number,
  search: string,
  sortBy = 'created_at',
  language = 'all',
  tag = 'all',
  folderId: string | null = null,
  isFavorite: boolean | null = null,
  isPublic: boolean | null = null,
  deepSearch = false,
): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-prompts/?order_by=${sortBy}`;
  if (folderId) url += `&folder_id=${folderId}`;
  if (isFavorite !== null) url += `&is_favorite=${isFavorite}`;
  if (isPublic !== null) url += `&is_public=${isPublic}`;
  if (page) url += `&page=${page}`;
  if (language !== 'all') url += `&language=${language}`;
  if (tag !== 'all') url += `&tag=${tag}`;
  if (search && search.trim().length > 0) url += `&search=${search}`;
  if (deepSearch) url += '&deep_search=true';
  return apiGet(url).then((r) => (r.ok === false ? { results: [], count: 0, error: 'Something went wrong!' } : r));
}

function getAllPrompts(folderId: string | null = null): Promise<any> {
  return apiGet(`/gptx/all-prompts/${folderId ? `?folder_id=${folderId}` : ''}`);
}

function getPrompt(promptId: string): Promise<any> {
  return apiGet(`/gptx/${promptId}/`);
}

function getPromptsCount(): Promise<any> {
  return apiGet('/gptx/prompts-count/');
}

function getAllFavoritePrompts(): Promise<any> {
  return apiGet('/gptx/get-all-favorite-prompts/');
}

function getPromptByTitle(title: string): Promise<any> {
  return apiGet(`/gptx/prompt-by-title/?title=${title}`);
}

function incrementPromptUseCount(promptId: string): Promise<any> {
  return fetch(`${API_URL}/gptx/${promptId}/use-count/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json());
}

function votePrompt(promptId: string, voteType: string): Promise<any> {
  return fetch(`${API_URL}/gptx/${promptId}/vote/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ vote_type: voteType }),
  }).then((r) => r.json());
}

function reportPrompt(promptId: string): Promise<any> {
  return fetch(`${API_URL}/gptx/${promptId}/report/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).then((r) => r.json());
}

function getPromptTags(): Promise<any> {
  return apiGet('/gptx/get-prompt-tags/');
}

// -- Prompt Folders --

function getPromptFolders(parentId: string | null = null, sortBy = 'created_at', search = ''): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-prompt-folders/?order_by=${sortBy}`;
  if (parentId) url += `&parent_folder_id=${parentId}`;
  if (search && search.trim().length > 0) url += `&search=${search}`;
  return apiGet(url);
}

function getAllPromptFolders(sortBy = 'alphabetical'): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  return apiGet(`/gptx/get-all-prompt-folders/?order_by=${sortBy}`);
}

function addPromptFolders(folders: any[]): Promise<any> {
  return apiPost('/gptx/add-prompt-folders/', { folders });
}

function deletePromptFolder(folderId: string): Promise<any> {
  return apiPost('/gptx/delete-prompt-folder/', { folder_id: parseInt(folderId, 10) }).then((r) => {
    resetContextMenu();
    return r;
  });
}

function updatePromptFolder(folderId: string, newData: any): Promise<any> {
  if (newData.image) {
    let blob: Blob;
    if (newData.image.base64) {
      const raw = atob(newData.image.base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      blob = new Blob([arr], { type: newData.image.type });
    } else {
      blob = newData.image.blob;
    }
    newData.image = new File([blob], newData.image.name, { type: newData.image.type });
  }
  const form = new FormData();
  form.append('folder_id', String(parseInt(folderId, 10)));
  Object.keys(newData).forEach((k) => form.append(k, newData[k]));
  return fetch(`${API_URL}/gptx/update-prompt-folder/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders },
    body: form,
  }).then((r) => r.json());
}

function removePromptFolderImage(folderId: string): Promise<any> {
  return apiPost('/gptx/remove-prompt-folder-image/', { folder_id: parseInt(folderId, 10) });
}

// -- Notes --

function updateNote(convId: string, name: string, text: string): Promise<any> {
  return apiPost('/gptx/update-note/', { conversation_id: convId, name, text });
}

function renameNote(noteId: string, newName: string): Promise<any> {
  return apiPost('/gptx/rename-note/', { note_id: noteId, new_name: newName });
}

function deleteNote(noteId: string): Promise<any> {
  return apiPost('/gptx/delete-note/', { note_id: noteId });
}

function getNote(convId: string): Promise<any> {
  return apiGet(`/gptx/get-note/?conversation_id=${convId}`);
}

function getNoteForIds(convIds: string[]): Promise<any> {
  return apiPost('/gptx/get-note-for-ids/', { conversation_ids: convIds });
}

function getNotes(page: number, search = '', sortBy = 'created_at'): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-notes/?page=${page}&order_by=${sortBy}`;
  if (search && search.trim().length > 0) url += `&search=${search.trim()}`;
  return apiGet(url);
}

// -- Newsletters / Announcements --

function getNewsletters(page: number): Promise<any> {
  return apiGet(`/gptx/newsletters-paginated/?page=${page}`);
}

function getNewsletter(id: string): Promise<any> {
  return apiGet(`/gptx/${id}/newsletter/`);
}

function getLatestNewsletter(): Promise<any> {
  return apiGet('/gptx/latest-newsletter/');
}

function getLatestAnnouncement(): Promise<any> {
  return apiGet('/gptx/announcements/');
}

function getReleaseNote(version: string): Promise<any> {
  return apiPost('/gptx/release-notes/', { version });
}

function getLatestVersion(): Promise<any> {
  return apiGet('/gptx/latest-version/').then((data) => {
    const currentVersion = chrome.runtime.getManifest().version;
    const latest = data?.latest_version;
    if (latest && currentVersion !== latest) {
      return chrome.runtime
        .requestUpdateCheck()
        .then((result) =>
          result.status === 'update_available' && result.version === latest
            ? result
            : { status: 'no_update', version: '' },
        );
    }
    return { status: 'no_update', version: '' };
  });
}

function reloadExtension(): Promise<boolean> {
  chrome.runtime.reload();
  return Promise.resolve(true);
}

function openPromoLink(link: string): void {
  chrome.tabs.create({ url: link, active: false });
}

function incrementOpenRate(announcementId: string): Promise<any> {
  return apiPost('/gptx/increment-open-rate/', { announcement_id: announcementId });
}

function incrementClickRate(announcementId: string): Promise<any> {
  return apiPost('/gptx/increment-click-rate/', { announcement_id: announcementId });
}

function incrementPromoLinkClickRate(announcementId: string, promoLink: string): Promise<any> {
  return apiPost('/gptx/increment-promo-link-click-rate/', { announcement_id: announcementId, promo_link: promoLink });
}

function getRemoteSettings(): Promise<any> {
  return apiGet('/gptx/remote-settings/').then((data) => {
    const out: Record<string, unknown> = {};
    data?.forEach?.((item: any) => {
      out[item.key] = item.value;
    });
    return out;
  });
}

function getInvites(): Promise<any> {
  return apiGet('/gptx/get-invites/');
}

function sendInvite(email: string): Promise<any> {
  return fetch(`${API_URL}/gptx/send-invite/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then((r) =>
    r.status === 429
      ? { success: false, message: "You've reached your 5 daily invite limit. Try again tomorrow." }
      : r.json(),
  );
}

// -- Gizmos --

function submitCouncilGizmos(gizmos: any[], category = ''): Promise<any> {
  return apiPost('/gptx/add-gizmos/', { gizmos, category });
}

function updateGizmoMetrics(gizmoId: string, metricName: string, direction: string): Promise<any> {
  return apiPost('/gptx/update-gizmo-metrics/', { gizmo_id: gizmoId, metric_name: metricName, direction });
}

function deleteCouncilGizmo(gizmoId: string): Promise<any> {
  return apiPost('/gptx/delete-gizmo/', { gizmo_id: gizmoId });
}

function getCouncilGizmos(page: number, search: string, sortBy = 'recent', category = 'all'): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-gizmos/?order_by=${sortBy}`;
  if (page) url += `&page=${page}`;
  if (category !== 'all') url += `&category=${category}`;
  if (search && search.trim().length > 0) url += `&search=${search.trim()}`;
  return apiGet(url).then((data) => {
    data.results = data?.results?.map((g: any) => ({
      ...g,
      id: g.gizmo_id,
      vanity_metrics: {
        num_conversations_str: g.num_conversations_str,
        created_ago_str: g.created_ago_str,
        review_stats: g.review_stats,
      },
    }));
    return data;
  });
}

function getRandomGizmo(): Promise<any> {
  return apiGet('/gptx/get-random-gizmo/').then((data) => ({ gizmo: { ...data[0], id: data[0].gizmo_id } }));
}

// -- Gallery Images --

function getRedirectUrl(url: string): Promise<string> {
  return chrome.storage.sync
    .get(['accessToken'])
    .then((s) => fetch(url, { headers: { Authorization: s.accessToken } }).then((r) => (r.redirected ? r.url : url)));
}

async function addGalleryImages(images: any[]): Promise<any> {
  const resolved = await Promise.all(
    images.map(async (img) => {
      if (img?.download_url?.startsWith('/api/content')) {
        const redirected = await getRedirectUrl(`https://chatgpt.com${img.download_url}`);
        return { ...img, download_url: redirected };
      }
      return img;
    }),
  );
  return apiPost('/gptx/add-gallery-images/', { gallery_images: resolved });
}

function uploadImageToGallery(imageId: string, imageName: string, dataURI: string, downloadUrl = ''): any {
  const blob = dataURItoBlob(dataURI);
  const file = new File([blob], imageName, { type: blob.type });
  const form = new FormData();
  form.append('image_id', imageId);
  form.append('image', file);
  if (downloadUrl) form.append('download_url', downloadUrl);
  if (!defaultGPTXHeaders['Hat-Token']) return null;
  return fetch(`${API_URL}/gptx/upload-image-to-gallery/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders },
    body: form,
  }).then((r) => r.json());
}

function getGalleryImages(
  showAll = false,
  page = 1,
  search = '',
  byUserId = '',
  sortBy = 'created_at',
  category = 'dalle',
  isPublic = false,
): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-gallery-images/?order_by=${sortBy}&category=${category}`;
  if (showAll) url += '&show_all=true';
  if (search && search.trim().length > 0) url += `&search=${search}`;
  if (page) url += `&page=${page}`;
  if (byUserId) url += `&by_user_id=${byUserId}`;
  if (isPublic) url += `&is_public=${isPublic}`;
  return fetch(`${API_URL}${url}`, {
    method: 'GET',
    headers: { ...defaultGPTXHeaders, 'content-type': 'application/json' },
  }).then((r) => (r.ok ? r.json() : { results: [], count: 0, error: 'Something went wrong!' }));
}

function getSelectedGalleryImages(
  category = 'dalle',
  imageIds: string[] = [],
  conversationId: string | null = null,
): Promise<any> {
  return apiPost('/gptx/get-selected-gallery-images/', {
    image_ids: imageIds,
    category,
    conversation_id: conversationId,
  });
}

function getGalleryImagesByDateRange(startDate: string, endDate: string, category = 'dalle'): Promise<any> {
  return apiGet(
    `/gptx/get-gallery-images-by-date-range/?start_date=${startDate}&end_date=${endDate}&category=${category}`,
  );
}

function deleteGalleryImages(imageIds: string[] = [], category = 'dalle'): Promise<any> {
  return apiPost('/gptx/delete-gallery-images/', { image_ids: imageIds, category });
}

function shareGalleryImages(imageIds: string[] = [], category = 'dalle'): Promise<any> {
  return apiPost('/gptx/share-gallery-images/', { image_ids: imageIds, category });
}

function downloadImage(url: string): Promise<string> {
  return fetch(`${url}?cache=false`, {
    method: 'GET',
    headers: { ...defaultGPTXHeaders, 'content-type': 'application/json', origin: 'https://chatgpt.com' },
  }).then(async (r) => {
    if (!r.ok) throw new Error('Network response was not ok');
    return blobToDataURI(await r.blob());
  });
}

// -- Bulk gallery download --

// Expose on globalThis so it can be called from the service worker console
(globalThis as any).bulkDownloadGalleryImages = bulkDownloadGalleryImages;

async function bulkDownloadGalleryImages(
  category = 'dalle',
): Promise<{ downloaded: number; failed: number; skipped: number }> {
  const stats = { downloaded: 0, failed: 0, skipped: 0 };
  const { accessToken } = await chrome.storage.sync.get(['accessToken']);
  if (!accessToken) return { ...stats, failed: -1 };

  // Paginate all gallery images from our local server
  let allImages: any[] = [];
  let page = 1;
  while (true) {
    const data = await getGalleryImages(false, page, '', '', 'created_at', category, false);
    const results = data.results || [];
    allImages = allImages.concat(results);
    if (!data.next) break;
    page++;
  }

  console.log(`[Council] Bulk gallery download: ${allImages.length} images to process`);

  for (const img of allImages) {
    const fileId = img.imageId || img.image_id;
    if (!fileId) {
      stats.failed++;
      continue;
    }

    try {
      // Get fresh download URL from ChatGPT
      const dlRes = await fetch(`https://chatgpt.com/backend-api/files/download/${fileId}`, {
        method: 'GET',
        headers: { 'content-type': 'application/json', 'Oai-Language': 'en-US', Authorization: accessToken },
      });

      if (!dlRes.ok) {
        console.log(`[Council] File API ${fileId}: ${dlRes.status}`);
        stats.failed++;
        continue;
      }

      const dlData = await dlRes.json();
      const url = dlData.download_url;
      if (!url) {
        stats.failed++;
        continue;
      }

      // Download the actual image
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        stats.failed++;
        continue;
      }

      const blob = await imgRes.blob();
      const base64 = await blobToBase64(blob);

      // Send to local server
      const saveRes = await fetch(`${API_URL}/gptx/save-gallery-image/`, {
        method: 'POST',
        headers: { ...defaultGPTXHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          image_id: fileId,
          image_data: base64,
          content_type: blob.type || 'image/webp',
        }),
      });

      const saveData = await saveRes.json();
      if (saveData.skipped) stats.skipped++;
      else if (saveData.success) stats.downloaded++;
      else stats.failed++;

      if ((stats.downloaded + stats.skipped) % 20 === 0 && stats.downloaded + stats.skipped > 0) {
        console.log(
          `[Council] Gallery progress: ${stats.downloaded} downloaded, ${stats.skipped} skipped, ${stats.failed} failed`,
        );
      }
    } catch (e) {
      console.log(`[Council] Error ${fileId}:`, e);
      stats.failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`[Council] Gallery download complete:`, stats);
  return stats;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// -- Custom Instruction Profiles --

function getCustomInstructionProfile(profileId: string): Promise<any> {
  return apiGet(`/gptx/get-custom-instruction-profile/?profile_id=${profileId}`);
}

function getEnabledCustomInstructionProfile(): Promise<any> {
  return apiGet('/gptx/get-enabled-custom-instruction-profile/');
}

function getCustomInstructionProfiles(page: number, search = '', sortBy = 'created_at'): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-custom-instruction-profiles/?order_by=${sortBy}`;
  if (page) url += `&page=${page}`;
  if (search && search.trim().length > 0) url += `&search=${search}`;
  return apiGet(url);
}

function addCustomInstructionProfile(profile: any): Promise<any> {
  return apiPost('/gptx/add-custom-instruction-profile/', { profile });
}

function deleteCustomInstructionProfile(profileId: string): Promise<any> {
  return apiPost('/gptx/delete-custom-instruction-profile/', { profile_id: profileId });
}

function updateCustomInstructionProfile(profileId: string, profile: any): Promise<any> {
  return apiPost('/gptx/update-custom-instruction-profile/', { profile_id: parseInt(profileId, 10), profile });
}

function updateEnabledCustomInstructionProfile(profile: any): Promise<any> {
  return apiPost('/gptx/update-enabled-custom-instruction-profile/', { profile });
}

function updateCustomInstructionProfileByData(profile: any): Promise<any> {
  return apiPost('/gptx/update-custom-instruction-profile-by-data/', {
    name_user_message: profile.nameUserMessage,
    role_user_message: profile.roleUserMessage,
    other_user_message: profile.otherUserMessage,
    traits_model_message: profile.traitsModelMessage,
    personality_type_selection: profile.personalityTypeSelection,
    personality_traits: profile.personalityTraits,
    enabled: profile.enabled,
    disabled_tools: profile.disabledTools,
  });
}

function duplicateCustomInstructionProfile(profileId: string): Promise<any> {
  return apiPost('/gptx/duplicate-custom-instruction-profile/', { profile_id: profileId });
}

// -- Pinned Messages --

function getPinnedMessages(page: number, conversationId: string | null = null, search = ''): Promise<any> {
  let url = '/gptx/get-pinned-messages/';
  if (page) url += `?page=${page}`;
  if (conversationId) url += `&conversation_id=${conversationId}`;
  if (search && search.trim().length > 0) url += `&search=${search}`;
  return apiGet(url);
}

function getAllPinnedMessagesByConversationId(convId: string): Promise<any> {
  return apiGet(`/gptx/get-all-pinned-messages-by-conversation-id/?conversation_id=${convId}`);
}

function addPinnedMessages(pinnedMessages: any[]): Promise<any> {
  return apiPost('/gptx/add-pinned-messages/', { pinned_messages: pinnedMessages });
}

function addPinnedMessage(convId: string, messageId: string, message: string): Promise<any> {
  return apiPost('/gptx/add-pinned-message/', { conversation_id: convId, message_id: messageId, message });
}

function deletePinnedMessage(messageId: string): Promise<any> {
  return apiPost('/gptx/delete-pinned-message/', { message_id: messageId });
}

// -- Textdocs --

function addTextdocs(convId: string, textdocs: any): Promise<any> {
  return apiPost('/gptx/add-textdocs/', { conversation_id: convId, textdocs });
}

// -- Conversation Folders --

function getConversationFolder(folderId: string): Promise<any> {
  return apiGet(`/gptx/get-conversation-folder/?folder_id=${folderId}`);
}

function getFolderForConversationId(convId: string): Promise<any> {
  return apiGet(`/gptx/get-folder-for-conversation-id/?conversation_id=${convId}`);
}

function getConversationFolderByGizmoId(gizmoId: string): Promise<any> {
  return apiGet(`/gptx/get-conversation-folder-by-gizmo-id/?gizmo_id=${gizmoId}`);
}

function getConversationFolders(parentId: string | null = null, sortBy = 'created_at', search = ''): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-conversation-folders/?order_by=${sortBy}`;
  if (parentId) url += `&parent_folder_id=${parentId}`;
  if (search && search.trim().length > 0) url += `&search=${search}`;
  return apiGet(url);
}

function addConversationFolders(folders: any[]): Promise<any> {
  return apiPost('/gptx/add-conversation-folders/', { folders });
}

function deleteConversationFolders(folderIds: string[]): Promise<any> {
  return apiPost('/gptx/delete-conversation-folders/', { folder_ids: folderIds });
}

function getConversationFolderDescription(folderId: string): Promise<any> {
  return apiGet(`/gptx/get-conversation-folder-description/?folder_id=${folderId}`);
}

function updateConversationFolderDescription(folderId: string, description: string): Promise<any> {
  return apiPost('/gptx/update-conversation-folder-description/', { folder_id: parseInt(folderId, 10), description });
}

function updateConversationFolder(folderId: string, newData: any): Promise<any> {
  if (newData.image) {
    let blob: Blob;
    if (newData.image.base64) {
      const raw = atob(newData.image.base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      blob = new Blob([arr], { type: newData.image.type });
    } else {
      blob = newData.image.blob;
    }
    newData.image = new File([blob], newData.image.name, { type: newData.image.type });
  }
  const form = new FormData();
  form.append('folder_id', String(parseInt(folderId, 10)));
  Object.keys(newData).forEach((k) => form.append(k, newData[k]));
  return fetch(`${API_URL}/gptx/update-conversation-folder/`, {
    method: 'POST',
    headers: { ...defaultGPTXHeaders },
    body: form,
  }).then((r) => r.json());
}

function removeConversationFolderImage(folderId: string): Promise<any> {
  return apiPost('/gptx/remove-conversation-folder-image/', { folder_id: parseInt(folderId, 10) });
}

function moveConversationsToFolder(folderId: string, conversations: any[]): Promise<any> {
  const mapped = conversations.map((c) => ({
    ...c,
    conversation_id: c.conversation_id || c.id,
    create_time: typeof c.create_time === 'number' ? c.create_time : new Date(c.create_time).getTime() / 1000,
    update_time: typeof c.update_time === 'number' ? c.update_time : new Date(c.update_time).getTime() / 1000,
    has_attachments: conversationHasAttachments(c),
  }));
  return apiPost('/gptx/move-conversations-to-folder/', { folder_id: parseInt(folderId, 10), convs: mapped });
}

function removeConversationsFromFolder(convIds: string[]): Promise<any> {
  return apiPost('/gptx/remove-conversations-from-folder/', { conversation_ids: convIds });
}

function moveConversationIdsToFolder(folderId: string, convIds: string[]): Promise<any> {
  return apiPost('/gptx/move-conversation-ids-to-folder/', {
    folder_id: parseInt(folderId, 10),
    conversation_ids: convIds,
  });
}

// -- Conversations --

function getConversations(
  folderId: string | null,
  sortBy = 'updated_at',
  page = 1,
  fullSearch = false,
  search = '',
  isFavorite: boolean | null = null,
  isArchived: boolean | null = null,
  excludeConvInFolders = false,
): Promise<any> {
  if (sortBy.startsWith('-')) sortBy = sortBy.substring(1);
  let url = `/gptx/get-conversations/?order_by=${sortBy}`;
  if (folderId) url += `&folder_id=${folderId}`;
  if (page) url += `&page=${page}`;
  if (search && search.trim().length > 0) url += `&search=${search}`;
  if (fullSearch) url += '&full_search=true';
  if (isFavorite !== null) url += `&is_favorite=${isFavorite}`;
  if (isArchived !== null) url += `&is_archived=${isArchived}`;
  if (excludeConvInFolders) url += '&exclude_conv_in_folders=true';
  return apiGet(url);
}

function getConversationIds(
  startDate: string | null = null,
  endDate: string | null = null,
  includeArchived = true,
  excludeConvInFolders = false,
): Promise<any> {
  let url = `/gptx/get-conversation-ids/?include_archived=${includeArchived}&exclude_conv_in_folders=${excludeConvInFolders}`;
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;
  return apiGet(url);
}

function getNonSyncedConversationIds(): Promise<any> {
  return apiGet('/gptx/get-non-synced-conversation-ids/');
}

function getNonSyncedConversationCount(): Promise<any> {
  return apiGet('/gptx/get-non-synced-conversation-count/');
}

function getSyncedConversationCount(): Promise<any> {
  return apiGet('/gptx/get-synced-conversation-count/');
}

function getConversation(convId: string): Promise<any> {
  return apiGet(`/gptx/get-conversation/?conversation_id=${convId}`);
}

function getRandomConversationId(): Promise<any> {
  return apiGet('/gptx/get-random-conversation-id/');
}

function getTotalConversationsCount(): Promise<any> {
  return apiGet('/gptx/get-total-conversations-count/');
}

function getTotalArchivedConversationsCount(): Promise<any> {
  return apiGet('/gptx/get-total-archived-conversations-count/');
}

function getAllFavoriteConversationIds(): Promise<any> {
  return apiGet('/gptx/get-all-favorite-conversation-ids/');
}

function getAllFolderConversationIds(folderId: string): Promise<any> {
  return apiGet(`/gptx/get-all-folder-conversation-ids/?folder_id=${folderId}`);
}

function getAllNoteConversationIds(): Promise<any> {
  return apiGet('/gptx/get-all-note-conversation-ids/');
}

function addConversations(conversations: any[]): Promise<any> {
  const mapped = conversations.map((c) => ({
    ...c,
    conversation_id: c.conversation_id || c.id,
    create_time: typeof c.create_time === 'number' ? c.create_time : new Date(c.create_time).getTime() / 1000,
    update_time: typeof c.update_time === 'number' ? c.update_time : new Date(c.update_time).getTime() / 1000,
    has_attachments: conversationHasAttachments(c),
  }));
  return apiPost('/gptx/add-conversations/', { conversations: mapped });
}

function addConversation(conv: any): Promise<any> {
  conv = {
    ...conv,
    conversation_id: conv.conversation_id || conv.id,
    create_time: typeof conv.create_time === 'number' ? conv.create_time : new Date(conv.create_time).getTime() / 1000,
    update_time: typeof conv.update_time === 'number' ? conv.update_time : new Date(conv.update_time).getTime() / 1000,
    has_attachments: conversationHasAttachments(conv),
  };
  return apiPost('/gptx/add-conversation/', { conversation: conv });
}

function renameConversation(convId: string, title: string): Promise<any> {
  return apiPost('/gptx/rename-conversation/', { conversation_id: convId, title });
}

function toggleConversationFavorite(conv: any): Promise<any> {
  conv = {
    ...conv,
    conversation_id: conv.conversation_id || conv.id,
    create_time: typeof conv.create_time === 'number' ? conv.create_time : new Date(conv.create_time).getTime() / 1000,
    update_time: typeof conv.update_time === 'number' ? conv.update_time : new Date(conv.update_time).getTime() / 1000,
    has_attachments: conversationHasAttachments(conv),
  };
  return apiPost('/gptx/toggle-conversation-favorite/', { conversation: conv });
}

function updateConversationProject(convId: string, gizmoId: string): Promise<any> {
  return apiPost('/gptx/update-conversation-project/', { conversation_id: convId, gizmo_id: gizmoId });
}

function resetAllFavoriteConversations(): Promise<any> {
  return apiPost('/gptx/reset-all-favorite-conversations/');
}

function deleteConversations(convIds: string[]): Promise<any> {
  return apiPost('/gptx/delete-conversations/', { conversation_ids: convIds });
}

function deleteAllConversations(): Promise<any> {
  return apiPost('/gptx/delete-all-conversations/');
}

function deleteAllArchivedConversations(): Promise<any> {
  return apiPost('/gptx/delete-all-archived-conversations/');
}

function archiveConversations(convIds: string[]): Promise<any> {
  return apiPost('/gptx/archive-conversations/', { conversation_ids: convIds });
}

function unarchiveConversations(convIds: string[]): Promise<any> {
  return apiPost('/gptx/unarchive-conversations/', { conversation_ids: convIds });
}

function archiveAllConversations(): Promise<any> {
  return apiPost('/gptx/archive-all-conversations/');
}

// ---------------------------------------------------------------------------
// Conversation sync
// ---------------------------------------------------------------------------

function formatTime(t: any): number {
  if (!t) return t;
  const s = t.toString();
  if (s.indexOf('T') !== -1) return new Date(t).getTime();
  if (s.indexOf('.') !== -1 && s.split('.')[0].length === 10) return new Date(t * 1000).getTime();
  if (s.indexOf('.') !== -1 && s.split('.')[0].length === 13) return new Date(t).getTime();
  if (s.length === 13) return new Date(t).getTime();
  if (s.length === 10) return new Date(t * 1000).getTime();
  return t;
}

function backendExtractPromptFromNode(mapping: any, parentId: string): string | null {
  const node = mapping[parentId];
  if (!node?.message?.content?.parts && !node?.message?.content?.text) return null;
  try {
    const { parts = [], text, content_type } = node.message.content;
    if (text) parts.push(text);
    for (const part of parts) {
      try {
        const parsed = JSON.parse(part);
        if (parsed.prompt || content_type === 'code') return parsed.prompt;
      } catch {
        /* not JSON */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function backendExtractTitleFromCode(code: string): string {
  if (!code || !code.includes('title')) return '';
  const match = code.match(/plt\.title\(['"]([^'"]+)['"]\)/);
  return match?.[1] || '';
}

async function syncConversationImages(conv: any): Promise<void> {
  const images: any[] = [];
  const mapping = conv?.mapping;
  if (!mapping) return;

  const nodes = Object.values(mapping) as any[];
  for (const node of nodes) {
    const { message, parent } = node;
    const assetParts = (message?.content?.parts || [])
      .filter((p: any) => p?.content_type === 'image_asset_pointer')
      .map((p: any) => ({ category: p?.metadata?.dalle || p?.metadata?.generation ? 'dalle' : 'upload', ...p }));

    const chartParts = (message?.metadata?.aggregate_result?.messages || [])
      .filter((m: any) => m?.message_type === 'image')
      .map((m: any) => ({ category: 'chart', ...m }));

    const allParts = [...assetParts, ...chartParts];

    for (const part of allParts) {
      const fileId =
        part.category === 'dalle' ? part?.asset_pointer?.split('://')[1] : part?.image_url?.split('://')[1];
      if (!fileId) continue;

      const prompt =
        part.category === 'dalle' ? part?.metadata?.dalle?.prompt : message?.metadata?.aggregate_result?.code;
      const title =
        part.category === 'dalle'
          ? message?.metadata?.image_gen_title
          : backendExtractTitleFromCode(message?.metadata?.aggregate_result?.code);
      const parentPrompt = backendExtractPromptFromNode(mapping, parent);

      const entry: any = {
        message_id: message?.id,
        title: title || '',
        conversation_id: conv.conversation_id,
        image_id: fileId,
        width: part.width,
        height: part.height,
        prompt: parentPrompt || prompt,
        gen_id: part?.metadata?.dalle?.gen_id || part?.metadata?.generation?.gen_id,
        seed: part?.metadata?.dalle?.seed,
        category: part.category,
        is_public: false,
      };

      const fileData = await apiGetDownloadUrlFromFileId(fileId).catch(() => null);
      if (!fileData?.download_url) continue;

      const skipExtensions = ['.json', '.csv', '.xlsx', '.txt', '.pdf', '.md', '.docx'];
      if (fileData.file_name && skipExtensions.some((ext) => fileData.file_name.endsWith(ext))) continue;

      entry.download_url = fileData.download_url;
      entry.created_at = fileData.creation_time
        ? new Date(fileData.creation_time)
        : message?.create_time
          ? new Date(formatTime(message.create_time))
          : new Date();
      images.push(entry);
    }
  }

  if (images.length > 0) {
    await addGalleryImages(images);
    clearCache('getGalleryImages');
    clearCache('getGalleryImagesByDateRange');
  }
}

async function sendSyncIsDoneMessage(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  const tab = tabs.find((t) => t.active) || tabs[0];
  if (tab) chrome.tabs.sendMessage(tab.id!, { type: 'syncIsDone', detail: {} });
}

async function initConvHistorySync(tabId: number, syncIntervalTime = 5000): Promise<void> {
  const { lastFullSyncRun } = await chrome.storage.local.get(['lastFullSyncRun']);
  if (lastFullSyncRun) return;

  const batchSize = 100;
  const maxBatches = lastFullSyncRun ? 100 : 10_000;

  for (let offset = 0; offset < maxBatches; offset += batchSize) {
    const data = await apiGetConversations(offset, batchSize);
    if (!data?.items || data.items.length === 0) {
      chrome.storage.local.set({ lastFullSyncRun: Date.now() });
      runConversationSync(tabId, syncIntervalTime);
      break;
    }
    const mapped = data.items.map((c: any) => ({
      ...c,
      conversation_id: c.id,
      create_time: new Date(c.create_time).getTime() / 1000,
      update_time: new Date(c.update_time).getTime() / 1000,
    }));
    await addConversations(mapped);
    clearCache('getConversations');
    clearCache('getConversationIds');
    clearCache('getConversation');
    const delay = Math.min(syncIntervalTime, offset / 100);
    await new Promise((r) => setTimeout(r, delay));
  }
}

function initializeConversationSync(tabId: number, syncIntervalTime = 5000): void {
  chrome.storage.local.get(['isRunningConvSync'], (data) => {
    if (data.isRunningConvSync) return;
    chrome.storage.local.set({ isRunningConvSync: true }, () => {
      activeTabId = tabId;
      runConversationSync(tabId, syncIntervalTime);
    });
  });
}

function runConversationSync(tabId: number, interval: number): void {
  chrome.storage.local.set({ lastConvSyncActivity: Date.now() });
  getNonSyncedConversationIds().then((ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      sendSyncIsDoneMessage();
      return;
    }
    let idx = 0;
    if (convSyncInterval) clearInterval(convSyncInterval);
    convSyncInterval = setInterval(async () => {
      if (idx >= ids.length) {
        clearInterval(convSyncInterval!);
        chrome.storage.local.set({ isRunningConvSync: false, lastConvSyncActivity: null }, () => {
          activeTabId = null;
        });
        sendSyncIsDoneMessage();
        return;
      }
      const convId = ids[idx];
      try {
        chrome.storage.local.set({ lastConvSyncActivity: Date.now() });
        const conv = await apiGetConversationById(convId);
        if (conv) {
          if (conv.code === 'conversation_not_found') {
            await deleteConversations([convId]);
          } else {
            await addConversations([conv]);
            await syncConversationImages(conv);
          }
          clearCache('getConversations');
          clearCache('getConversationIds');
          clearCache('getConversation');
        }
      } catch {
        /* continue on error */
      }
      idx += 1;
    }, interval);
  });
}

function monitorSyncHealth(): void {
  setInterval(() => {
    chrome.storage.local.get(['isRunningConvSync', 'lastConvSyncActivity'], (data) => {
      if (!data.isRunningConvSync) return;
      const lastActivity = data.lastConvSyncActivity || 0;
      if (Date.now() - lastActivity > 60_000) {
        chrome.storage.local.set({ isRunningConvSync: false, lastConvSyncActivity: null });
      }
    });
  }, 30_000);
}

// ---------------------------------------------------------------------------
// AI wrappers
// ---------------------------------------------------------------------------

async function rewritePrompt(
  text: string,
  context: string,
  tone = 'as-is',
  length = 'as-is',
  forceRefresh = false,
): Promise<any> {
  try {
    const result = await superAI.rewrite({ text, context, tone, length, forceRefresh });
    return result.ok
      ? { ok: true, text: (result as any).text, meta: (result as any).meta || {} }
      : { ok: false, error: (result as any).error, meta: (result as any).meta || {} };
  } catch (e) {
    return { ok: false, error: 'UNHANDLED_ERROR' };
  }
}

async function runPrompt(
  prompt: string | any[],
  createOptions: any = {},
  promptOptions: any = {},
  forceRefresh = false,
): Promise<any> {
  try {
    const result = await superAI.prompt({ prompt, createOptions, promptOptions, forceRefresh });
    return result.ok
      ? { ok: true, text: (result as any).text, meta: (result as any).meta || {} }
      : { ok: false, error: (result as any).error, meta: (result as any).meta || {} };
  } catch (e) {
    return { ok: false, error: 'UNHANDLED_ERROR' };
  }
}

async function runPromptSameLanguage(
  prompt: string | any[],
  createOptions: any = {},
  promptOptions: any = {},
  forceRefresh = false,
): Promise<any> {
  try {
    if (typeof superAI.promptSameLanguage === 'function') {
      const result = await superAI.promptSameLanguage({ prompt, createOptions, promptOptions, forceRefresh });
      return result.ok
        ? { ok: true, text: (result as any).text, meta: (result as any).meta || {} }
        : { ok: false, error: (result as any).error, meta: (result as any).meta || {} };
    }
    return runPrompt(prompt, createOptions, promptOptions, forceRefresh);
  } catch (e) {
    return { ok: false, error: 'UNHANDLED_ERROR' };
  }
}

// ---------------------------------------------------------------------------
// Main message dispatcher (103 message types)
// ---------------------------------------------------------------------------

type SendResponse = (response?: unknown) => void;

const CONV_CLEAR_KEYS = ['getConversations', 'getConversationIds', 'getConversation'];

const CONV_FOLDER_CLEAR_KEYS = [
  ...CONV_CLEAR_KEYS,
  'getAllFolderConversationIds',
  'getConversationFolders',
  'getConversationFolder',
  'getConversationFolderByGizmoId',
];

const CONV_ALL_CLEAR_KEYS = [...CONV_FOLDER_CLEAR_KEYS, 'getAllFavoriteConversationIds'];

const PROMPT_CLEAR_KEYS = [
  'getPrompts',
  'getPrompt',
  'getPromptFolders',
  'getAllPromptFolders',
  'getAllFavoritePrompts',
  'getDefaultFavoritePrompt',
];

const CI_CLEAR_KEYS = [
  'getCustomInstructionProfile',
  'getEnabledCustomInstructionProfile',
  'getCustomInstructionProfiles',
];

async function handleMessage(
  type: string,
  detail: any,
  forceRefresh: boolean,
  cacheKey: string,
  cachedValue: unknown | null,
  sendResponse: SendResponse,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  // If cached and not forced, return cached
  if (cachedValue && !forceRefresh) {
    sendResponse(cachedValue);
    return;
  }

  switch (type) {
    // == Subscription ==
    case 'checkHasSubscription': {
      const r = await checkHasSubscription(forceRefresh);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }

    // == Conversation Folders ==
    case 'getConversationFolder': {
      const r = await getConversationFolder(detail.folderId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getFolderForConversationId': {
      const r = await getFolderForConversationId(detail.conversationId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getConversationFolderByGizmoId': {
      const r = await getConversationFolderByGizmoId(detail.gizmoId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getConversationFolders': {
      const r = await getConversationFolders(detail.parentFolderId, detail.sortBy, detail.searchTerm);
      const folders = r?.results ?? r;
      setCache(cacheKey, folders);
      sendResponse(folders);
      break;
    }
    case 'addConversationFolders': {
      const r = await addConversationFolders(detail.folders);
      clearCaches(['getConversationFolders', 'getConversationFolder', 'getConversationFolderByGizmoId']);
      sendResponse(r);
      break;
    }
    case 'deleteConversationFolders': {
      const r = await deleteConversationFolders(detail.folderIds);
      clearCaches(['getConversationFolders', 'getConversationFolder', 'getConversationFolderByGizmoId']);
      sendResponse(r);
      break;
    }
    case 'getConversationFolderDescription': {
      const r = await getConversationFolderDescription(detail.folderId);
      sendResponse(r);
      break;
    }
    case 'updateConversationFolderDescription': {
      const r = await updateConversationFolderDescription(detail.folderId, detail.description);
      clearCache('getConversationFolderDescription');
      sendResponse(r);
      break;
    }
    case 'updateConversationFolder': {
      const r = await updateConversationFolder(detail.folderId, detail.newData);
      clearCaches([
        'getConversationFolders',
        'getConversationFolder',
        'getConversationFolderByGizmoId',
        'getConversations',
        'getConversationIds',
      ]);
      sendResponse(r);
      break;
    }
    case 'removeConversationFolderImage': {
      const r = await removeConversationFolderImage(detail.folderId);
      clearCaches(['getConversationFolders', 'getConversationFolder', 'getConversationFolderByGizmoId']);
      sendResponse(r);
      break;
    }
    case 'moveConversationsToFolder': {
      const r = await moveConversationsToFolder(detail.folderId, detail.conversations);
      clearCaches(CONV_FOLDER_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'removeConversationsFromFolder': {
      const r = await removeConversationsFromFolder(detail.conversationIds);
      clearCaches(CONV_FOLDER_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'moveConversationIdsToFolder': {
      const r = await moveConversationIdsToFolder(detail.folderId, detail.conversationIds);
      clearCaches(CONV_FOLDER_CLEAR_KEYS);
      sendResponse(r);
      break;
    }

    // == Conversations ==
    case 'getConversations': {
      const r = await getConversations(
        detail.folderId,
        detail.sortBy,
        detail.pageNumber,
        detail.fullSearch,
        detail.searchTerm,
        detail.isFavorite,
        detail.isArchived,
        detail.excludeConvInFolders,
      );
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getConversationIds': {
      const r = await getConversationIds(
        detail.startDate,
        detail.endDate,
        detail.includeArchived,
        detail.excludeConvInFolders,
      );
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getNonSyncedConversationIds': {
      sendResponse(await getNonSyncedConversationIds());
      break;
    }
    case 'getNonSyncedConversationCount': {
      sendResponse(await getNonSyncedConversationCount());
      break;
    }
    case 'getSyncedConversationCount': {
      sendResponse(await getSyncedConversationCount());
      break;
    }
    case 'initializeConversationSync': {
      if (sender.tab) initializeConversationSync(sender.tab.id!);
      break;
    }
    case 'initConvHistorySync': {
      if (sender.tab) initConvHistorySync(sender.tab.id!, detail.syncIntervalTime);
      break;
    }
    case 'getConversation': {
      const r = await getConversation(detail.conversationId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getTotalConversationsCount': {
      const r = await getTotalConversationsCount();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getTotalArchivedConversationsCount': {
      sendResponse(await getTotalArchivedConversationsCount());
      break;
    }
    case 'getAllFavoriteConversationIds': {
      const r = await getAllFavoriteConversationIds();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getAllFolderConversationIds': {
      const r = await getAllFolderConversationIds(detail.folderId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getAllNoteConversationIds': {
      const r = await getAllNoteConversationIds();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getRandomConversationId': {
      sendResponse(await getRandomConversationId());
      break;
    }
    case 'addConversations': {
      const r = await addConversations(detail.conversations);
      clearCaches(CONV_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'syncClaudeMessages': {
      const { conversationId, messages: msgs } = detail;
      try {
        for (const msg of msgs) {
          await apiPost(`/api/conversations/${conversationId}/messages`, msg);
        }
        sendResponse({ success: true });
      } catch (err: unknown) {
        sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
      break;
    }
    case 'syncArtifacts': {
      try {
        await apiPost('/api/artifacts/bulk', { artifacts: detail.artifacts });
        sendResponse({ success: true });
      } catch (err: unknown) {
        sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
      break;
    }
    case 'addConversation': {
      sendResponse(await addConversation(detail.conversation));
      break;
    }
    case 'renameConversation': {
      const r = await renameConversation(detail.conversationId, detail.title);
      clearCaches(CONV_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'toggleConversationFavorite': {
      const r = await toggleConversationFavorite(detail.conversation);
      clearCaches([...CONV_CLEAR_KEYS, 'getAllFavoriteConversationIds']);
      sendResponse(r);
      break;
    }
    case 'updateConversationProject': {
      const r = await updateConversationProject(detail.conversationId, detail.gizmoId);
      clearCaches(CONV_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'resetAllFavoriteConversations': {
      const r = await resetAllFavoriteConversations();
      clearCaches([...CONV_CLEAR_KEYS, 'getAllFavoriteConversationIds']);
      sendResponse(r);
      break;
    }
    case 'deleteConversations': {
      const r = await deleteConversations(detail.conversationIds);
      clearCaches(CONV_ALL_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'deleteAllConversations': {
      const r = await deleteAllConversations();
      clearCaches(CONV_ALL_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'deleteAllArchivedConversations': {
      const r = await deleteAllArchivedConversations();
      clearCaches(CONV_ALL_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'archiveConversations': {
      const r = await archiveConversations(detail.conversationIds);
      clearCaches(CONV_ALL_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'unarchiveConversations': {
      const r = await unarchiveConversations(detail.conversationIds);
      clearCaches(CONV_FOLDER_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'archiveAllConversations': {
      const r = await archiveAllConversations();
      clearCaches(CONV_ALL_CLEAR_KEYS);
      sendResponse(r);
      break;
    }

    // == Textdocs ==
    case 'addTextdocs': {
      sendResponse(await addTextdocs(detail.conversationId, detail.textdocs));
      break;
    }

    // == Custom Instruction Profiles ==
    case 'getCustomInstructionProfile': {
      const r = await getCustomInstructionProfile(detail.profileId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getEnabledCustomInstructionProfile': {
      const r = await getEnabledCustomInstructionProfile();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getCustomInstructionProfiles': {
      const r = await getCustomInstructionProfiles(detail.pageNumber, detail.searchTerm, detail.sortBy);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'addCustomInstructionProfile': {
      const r = await addCustomInstructionProfile(detail.profile);
      clearCaches(CI_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'updateCustomInstructionProfile': {
      const r = await updateCustomInstructionProfile(detail.profileId, detail.profile);
      clearCaches(CI_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'updateEnabledCustomInstructionProfile': {
      const r = await updateEnabledCustomInstructionProfile(detail.profile);
      clearCaches(CI_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'updateCustomInstructionProfileByData': {
      const r = await updateCustomInstructionProfileByData(detail.profile);
      clearCaches(CI_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'duplicateCustomInstructionProfile': {
      const r = await duplicateCustomInstructionProfile(detail.profileId);
      clearCaches(CI_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'deleteCustomInstructionProfile': {
      const r = await deleteCustomInstructionProfile(detail.profileId);
      clearCaches(CI_CLEAR_KEYS);
      sendResponse(r);
      break;
    }

    // == Pinned Messages ==
    case 'getPinnedMessages': {
      const r = await getPinnedMessages(detail.pageNumber, detail.conversationId, detail.searchTerm);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getAllPinnedMessagesByConversationId': {
      const r = await getAllPinnedMessagesByConversationId(detail.conversationId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'addPinnedMessages': {
      const r = await addPinnedMessages(detail.pinnedMessages);
      clearCaches(['getPinnedMessages', 'getAllPinnedMessagesByConversationId']);
      sendResponse(r);
      break;
    }
    case 'addPinnedMessage': {
      const r = await addPinnedMessage(detail.conversationId, detail.messageId, detail.message);
      clearCaches(['getPinnedMessages', 'getAllPinnedMessagesByConversationId']);
      sendResponse(r);
      break;
    }
    case 'deletePinnedMessage': {
      const r = await deletePinnedMessage(detail.messageId);
      clearCaches(['getPinnedMessages', 'getAllPinnedMessagesByConversationId']);
      sendResponse(r);
      break;
    }

    // == Prompts ==
    case 'addPrompts': {
      const r = await addPrompts(detail.prompts);
      clearCaches(PROMPT_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'addPromptAttachment': {
      const r = await addPromptAttachment(detail.attachment);
      clearCaches(['getPrompts', 'getPrompt']);
      sendResponse(r);
      break;
    }
    case 'updatePrompt': {
      const r = await updatePrompt(detail.promptData);
      clearCaches(['getPrompts', 'getPrompt', 'getAllFavoritePrompts', 'getDefaultFavoritePrompt']);
      sendResponse(r);
      break;
    }
    case 'getPrompt': {
      const r = await getPrompt(detail.promptId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getPromptAttachment': {
      sendResponse(await getPromptAttachment(detail.fileId));
      break;
    }
    case 'getPromptsCount': {
      sendResponse(await getPromptsCount());
      break;
    }
    case 'getPrompts': {
      const r = await getPrompts(
        detail.pageNumber,
        detail.searchTerm,
        detail.sortBy,
        detail.language,
        detail.tag,
        detail.folderId,
        detail.isFavorite,
        detail.isPublic,
      );
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getAllPrompts': {
      const r = await getAllPrompts(detail.folderId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getPromptByTitle': {
      const r = await getPromptByTitle(detail.title);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getAllFavoritePrompts': {
      const r = await getAllFavoritePrompts();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'deletePrompts': {
      const r = await deletePrompts(detail.promptIds);
      clearCaches(PROMPT_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'movePrompts': {
      const r = await movePrompts(detail.folderId, detail.promptIds);
      clearCaches(['getPrompts', 'getPrompt', 'getPromptFolders', 'getAllPromptFolders']);
      sendResponse(r);
      break;
    }
    case 'togglePromptPublic': {
      const r = await togglePromptPublic(detail.promptId);
      clearCaches(['getPrompts', 'getPrompt']);
      sendResponse(r);
      break;
    }
    case 'toggleFavoritePrompt': {
      const r = await toggleFavoritePrompt(detail.promptId);
      clearCaches(['getPrompts', 'getPrompt', 'getAllFavoritePrompts', 'getDefaultFavoritePrompt']);
      sendResponse(r);
      break;
    }
    case 'resetAllFavoritePrompts': {
      const r = await resetAllFavoritePrompts();
      clearCaches(['getPrompts', 'getPrompt', 'getAllFavoritePrompts']);
      sendResponse(r);
      break;
    }
    case 'setDefaultFavoritePrompt': {
      const r = await setDefaultFavoritePrompt(detail.promptId);
      clearCaches(['getPrompts', 'getPrompt', 'getAllFavoritePrompts', 'getDefaultFavoritePrompt']);
      sendResponse(r);
      break;
    }
    case 'getDefaultFavoritePrompt': {
      const r = await getDefaultFavoritePrompt();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'duplicatePrompt': {
      const r = await duplicatePrompt(detail.promptId);
      clearCaches(PROMPT_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'incrementPromptUseCount': {
      sendResponse(await incrementPromptUseCount(detail.promptId));
      break;
    }
    case 'votePrompt': {
      sendResponse(await votePrompt(detail.promptId, detail.voteType));
      break;
    }
    case 'reportPrompt': {
      sendResponse(await reportPrompt(detail.promptId));
      break;
    }
    case 'getPromptTags': {
      const r = await getPromptTags();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }

    // == Prompt Folders ==
    case 'getPromptFolders': {
      const r = await getPromptFolders(detail.parentFolderId, detail.sortBy, detail.searchTerm);
      const folders = r?.results ?? r;
      setCache(cacheKey, folders);
      sendResponse(folders);
      break;
    }
    case 'getAllPromptFolders': {
      const r = await getAllPromptFolders(detail.sortBy);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'addPromptFolders': {
      const r = await addPromptFolders(detail.folders);
      clearCaches(['getPromptFolders', 'getAllPromptFolders']);
      sendResponse(r);
      break;
    }
    case 'deletePromptFolder': {
      const r = await deletePromptFolder(detail.folderId);
      clearCaches(PROMPT_CLEAR_KEYS);
      sendResponse(r);
      break;
    }
    case 'updatePromptFolder': {
      const r = await updatePromptFolder(detail.folderId, detail.newData);
      clearCaches(['getPromptFolders', 'getAllPromptFolders']);
      sendResponse(r);
      break;
    }
    case 'removePromptFolderImage': {
      const r = await removePromptFolderImage(detail.folderId);
      clearCaches(['getPromptFolders', 'getAllPromptFolders', 'getPromptFolder']);
      sendResponse(r);
      break;
    }

    // == Notes ==
    case 'updateNote': {
      const r = await updateNote(detail.conversationId, detail.name, detail.text);
      clearCaches(['getNote', 'getNotes', 'getAllNoteConversationIds']);
      sendResponse(r);
      break;
    }
    case 'renameNote': {
      const r = await renameNote(detail.noteId, detail.newName);
      clearCaches(['getNote', 'getNotes']);
      sendResponse(r);
      break;
    }
    case 'deleteNote': {
      const r = await deleteNote(detail.noteId);
      clearCaches(['getNote', 'getNotes', 'getAllNoteConversationIds']);
      sendResponse(r);
      break;
    }
    case 'getNote': {
      const r = await getNote(detail.conversationId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getNoteForIds': {
      const r = await getNoteForIds(detail.conversationIds);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getNotes': {
      const r = await getNotes(detail.page, detail.searchTerm, detail.sortBy);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }

    // == Newsletters / Announcements ==
    case 'getNewsletters': {
      const r = await getNewsletters(detail.page);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getNewsletter': {
      const r = await getNewsletter(detail.id);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getLatestNewsletter': {
      const r = await getLatestNewsletter();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'openPromoLink': {
      openPromoLink(detail.link);
      sendResponse();
      break;
    }
    case 'getReleaseNote': {
      const r = await getReleaseNote(detail.version);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getLatestVersion': {
      sendResponse(await getLatestVersion());
      break;
    }
    case 'reloadExtension': {
      sendResponse(await reloadExtension());
      break;
    }
    case 'getLatestAnnouncement': {
      const r = await getLatestAnnouncement();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }

    // == Gizmos ==
    case 'getRandomGizmo': {
      sendResponse(await getRandomGizmo());
      break;
    }
    case 'getCouncilGizmos': {
      const r = await getCouncilGizmos(detail.pageNumber, detail.searchTerm, detail.sortBy, detail.category);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'submitCouncilGizmos': {
      const r = await submitCouncilGizmos(detail.gizmos, detail.category);
      clearCache('getCouncilGizmos');
      sendResponse(r);
      break;
    }
    case 'updateGizmoMetrics': {
      const r = await updateGizmoMetrics(detail.gizmoId, detail.metricName, detail.direction);
      clearCache('getCouncilGizmos');
      sendResponse(r);
      break;
    }
    case 'deleteCouncilGizmo': {
      const r = await deleteCouncilGizmo(detail.gizmoId);
      clearCache('getCouncilGizmos');
      sendResponse(r);
      break;
    }

    // == Gallery ==
    case 'addGalleryImages': {
      const r = await addGalleryImages(detail.images);
      clearCaches(['getGalleryImages', 'getGalleryImagesByDateRange']);
      sendResponse(r);
      break;
    }
    case 'uploadImageToGallery': {
      const r = await uploadImageToGallery(detail.imageId, detail.imageName, detail.dataURI, detail.downloadUrl);
      clearCaches(['getGalleryImages', 'getGalleryImagesByDateRange']);
      sendResponse(r);
      break;
    }
    case 'getGalleryImages': {
      const r = await getGalleryImages(
        detail.showAll,
        detail.pageNumber,
        detail.searchTerm,
        detail.byUserId,
        detail.sortBy,
        detail.category,
        detail.isPublic,
      );
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getSelectedGalleryImages': {
      const r = await getSelectedGalleryImages(detail.category, detail.imageIds, detail.conversationId);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getGalleryImagesByDateRange': {
      const r = await getGalleryImagesByDateRange(detail.startDate, detail.endDate, detail.category);
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'deleteGalleryImages': {
      const r = await deleteGalleryImages(detail.imageIds, detail.category);
      clearCaches(['getGalleryImages', 'getGalleryImagesByDateRange', 'getSelectedGalleryImages']);
      sendResponse(r);
      break;
    }
    case 'shareGalleryImages': {
      sendResponse(await shareGalleryImages(detail.imageIds, detail.category));
      break;
    }
    case 'downloadImage': {
      sendResponse(await downloadImage(detail.url));
      break;
    }

    // == Metrics ==
    case 'incrementOpenRate': {
      sendResponse(await incrementOpenRate(detail.announcementId));
      break;
    }
    case 'incrementClickRate': {
      sendResponse(await incrementClickRate(detail.announcementId));
      break;
    }
    case 'incrementPromoLinkClickRate': {
      sendResponse(await incrementPromoLinkClickRate(detail.announcementId, detail.promoLink));
      break;
    }

    // == Settings / Misc ==
    case 'getRemoteSettings': {
      const r = await getRemoteSettings();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'getInvites': {
      const r = await getInvites();
      setCache(cacheKey, r);
      sendResponse(r);
      break;
    }
    case 'sendInvite': {
      const r = await sendInvite(detail.email);
      clearCache('getInvites');
      sendResponse(r);
      break;
    }
    case 'resetContextMenu': {
      resetContextMenu();
      sendResponse();
      break;
    }
    case 'clearCaches': {
      clearCaches(detail.targetKeys);
      sendResponse();
      break;
    }
    case 'clearAllCache': {
      clearAllCache();
      sendResponse();
      break;
    }
    case 'flushStorage': {
      await flushStorage();
      sendResponse();
      break;
    }

    // == AI ==
    case 'rewritePrompt': {
      sendResponse(await rewritePrompt(detail.prompt, detail.context, detail.tone, detail.length));
      break;
    }
    case 'prompt': {
      sendResponse(
        await runPrompt(detail.prompt, detail.createOptions || {}, detail.promptOptions || {}, !!detail.forceRefresh),
      );
      break;
    }
    case 'promptSameLanguage': {
      sendResponse(
        await runPromptSameLanguage(
          detail.prompt,
          detail.createOptions || {},
          detail.promptOptions || {},
          !!detail.forceRefresh,
        ),
      );
      break;
    }

    // == Bulk gallery download ==
    case 'bulkDownloadGallery': {
      bulkDownloadGalleryImages(detail.category).then(sendResponse);
      break;
    }

    default:
      console.warn(`[Council] Unhandled message type: "${type}"`);
      break;
  }
}

// ---------------------------------------------------------------------------
// Public: initialise all messaging
// ---------------------------------------------------------------------------

export function initializeMessaging(): void {
  // Set API URL — always use the configured URL (Railway for alpha, localhost for local dev)
  // To use localhost, change API_URL at the top of this file
  chrome.storage.local.set({ API_URL, STRIPE_PAYMENT_LINK_ID, STRIPE_PORTAL_LINK_ID });

  // Fetch sync settings from Council server and merge into local settings
  apiFetch('/api/settings', { method: 'GET' })
    .then(async (serverSettings: Record<string, unknown>) => {
      const { settings: localSettings } = await chrome.storage.local.get(['settings']);
      const merged = { ...(localSettings || {}), ...serverSettings };
      await chrome.storage.local.set({ settings: merged });
    })
    .catch(() => {
      /* not authenticated yet */
    });

  // Preload icons
  preloadAllIcons().catch(() => {});

  // Tab update: toggle icon
  chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
    const { isBanned } = await chrome.storage.sync.get(['isBanned']);
    if (isBanned || changeInfo.status !== 'complete' || !tab.url) return;
    const { settings } = await chrome.storage.local.get(['settings']);
    if (!settings) return;
    const { councilIsEnabled = true } = settings;
    updateExtensionIcon(!councilIsEnabled);
  });

  // Update available
  chrome.runtime.onUpdateAvailable.addListener(async (details) => {
    if (!details.version) return;
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    const tab = tabs.find((t) => t.active) || tabs[0];
    if (tab) {
      chrome.tabs.sendMessage(tab.id!, { type: 'updateAvailable', detail: { version: details.version } });
    }
  });

  // On install / update
  chrome.runtime.onInstalled.addListener((details) => {
    chrome.management.getSelf((self) => {
      chrome.storage.local.get({ installDate: null }, (data) => {
        if (!data.installDate) chrome.storage.local.set({ installDate: Date.now() });
      });

      if (details.reason === 'update') {
        chrome.storage.sync.remove('lastUserSync');
        chrome.storage.local.get({ settings: null }, (data) => {
          if (data.settings?.autoReloadOnUpdate) {
            chrome.tabs.query({ url: 'https://chatgpt.com/*' }, (tabs) => {
              tabs.forEach((t) => {
                const delay = Math.floor(Math.random() * 500) + 1;
                setTimeout(() => chrome.tabs.reload(t.id!), delay * 1000);
              });
            });
          }
        });
      }

      if (details.reason === 'install') {
        clearAllCache();
        initializeStorageOnInstall();
      }

      if (self.installType !== 'development' && details.reason === 'install') {
        chrome.tabs.query({ url: 'https://chatgpt.com/*' }, (tabs) => {
          if (!tabs || tabs.length === 0) {
            chrome.tabs.create({ url: 'https://chatgpt.com', active: true });
          } else {
            tabs.forEach((t) => chrome.tabs.reload(t.id!));
          }
        });
        chrome.tabs.create({ url: '#', active: false });
        chrome.tabs.create({ url: '#', active: false });
      }
    });
  });

  // Cleanup AI on suspend
  chrome.runtime.onSuspend?.addListener(() => {
    try {
      superAI.destroy();
    } catch {
      /* ignore */
    }
  });

  // Sync health monitor
  monitorSyncHealth();

  // Tab removal / update for sync tracking
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
      chrome.storage.local.set({ isRunningConvSync: false });
      activeTabId = null;
    }
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTabId && changeInfo.status === 'loading') {
      chrome.storage.local.set({ isRunningConvSync: false });
      activeTabId = null;
    }
  });

  // -----------------------------------------------------------------------
  // Listener #1: auth / signout
  // -----------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    const type = message.type;
    if (type !== 'authReceived' && type !== 'signoutReceived') return false;
    (async () => {
      if (type === 'authReceived') {
        const detail = message.detail;
        if (!detail?.accessToken) return;
        await setAccessToken(detail.accessToken);
        const syncData = await chrome.storage.sync.get(['openai_id']);
        if (detail.id && syncData.openai_id !== detail.id) await flushStorage();
        await registerUser(detail);
      } else if (type === 'signoutReceived') {
        await flushStorage();
      }
    })().catch((err) => console.warn('[Council] Auth message handler error:', err));
    return true; // keep channel open only for auth messages
  });

  // -----------------------------------------------------------------------
  // Listener #2: main dispatch hub
  // -----------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      // Handle setAccessToken inline
      if (message.type === 'setAccessToken') {
        await setAccessToken(message.detail.accessToken);
      }

      const syncData = await chrome.storage.sync.get(['hashAcessToken']);
      if (!syncData.hashAcessToken) {
        console.warn('No access token found');
        sendResponse({ error: 'No access token found' });
        return;
      }

      defaultGPTXHeaders['Hat-Token'] = syncData.hashAcessToken;

      const type = message.type;
      const forceRefresh = message.forceRefresh || false;
      const detail = message.detail || {};
      const cacheKey = await makeCacheKey(type, detail);
      const cached = getCache(cacheKey);

      await handleMessage(type, detail, forceRefresh, cacheKey, cached, sendResponse, sender);
    })().catch((err) => {
      console.warn('[Council] Message handler error:', message.type, err);
      sendResponse({ error: String(err) });
    });
    return true; // async
  });

  console.log('[Council] Messaging initialised');
}
