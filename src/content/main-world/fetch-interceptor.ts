/**
 * Fetch interceptor — runs in the MAIN world so it shares the page's
 * `window` object and can monkey-patch `window.fetch`.
 *
 * This is the most critical file in the extension. It:
 *   1. Saves the original `window.fetch`.
 *   2. Replaces it with a wrapper that inspects every outgoing request.
 *   3. For requests to ChatGPT's own APIs it:
 *      a. (Outgoing) Injects model overrides from sessionStorage and
 *         custom instructions from localStorage into conversation POST bodies.
 *      b. (Incoming) Clones the response, parses the body, and dispatches
 *         a CustomEvent with the data so the ISOLATED world can consume it.
 *
 * Original source: content.main.start.js (446 lines)
 */

import { SP_EVENTS } from '../../constants/event-names';
import { INTERCEPT_URL_PATTERNS } from '../../constants/api-endpoints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the JSON body sent to backend-api/conversation POST */
interface ConversationRequestBody {
  messages?: ConversationMessage[];
  model?: string;
  branching_from_conversation_id?: string;
  [key: string]: unknown;
}

interface ConversationMessage {
  id: string;
  author: { role: string };
  content?: {
    parts: unknown[];
  };
  [key: string]: unknown;
}

/** Shape of parsed PATCH body for single-conversation mutations */
interface ConversationPatchBody {
  is_archived?: boolean;
  is_visible?: boolean;
  title?: string;
  gizmo_id?: string;
  status?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 1. Save original fetch
// ---------------------------------------------------------------------------
const originalFetch: typeof window.fetch = window.fetch;

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------

function isInterceptedUrl(url: string): boolean {
  return INTERCEPT_URL_PATTERNS.some((pattern) => url.includes(pattern));
}

function dispatch(eventName: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/** Test whether the last path segment is a UUID */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches both /backend-api/conversation and /backend-api/f/conversation */
function isConversationUrl(url: string): boolean {
  return url.includes('backend-api/conversation') || url.includes('backend-api/f/conversation');
}

// ---------------------------------------------------------------------------
// 3. The monkey-patch
// ---------------------------------------------------------------------------

window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const [input, init] = args;
  const request = new Request(input, init);
  const { url, method, headers } = request;

  // ── Fast path: not an intercepted URL ──────────────────────────────────
  if (!isInterceptedUrl(url)) {
    try {
      return await originalFetch(request);
    } catch (err) {
      console.error('Fetch request failed:', err);
      throw err;
    }
  }

  // ── Content-type gate: only intercept JSON / text POST bodies ─────────
  const ALLOWED_CONTENT_TYPES = ['application/json', 'text/plain'];
  const contentType = (headers && new Headers(headers).get('content-type')) || '';
  if (method === 'POST' && contentType && !ALLOWED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    return originalFetch(request);
  }

  // ── Parse request body ─────────────────────────────────────────────────
  let bodyText = '';
  let bodyJson: Record<string, unknown> = {};
  try {
    bodyText = await request.clone().text();
    bodyJson = JSON.parse(bodyText || '{}') as Record<string, unknown>;
  } catch {
    bodyText = (init?.body as string) || '';
  }

  const searchParams = new URLSearchParams(url.split('?')[1]);

  // =====================================================================
  // OUTGOING: Mutate conversation POST body
  // =====================================================================

  if ((url.endsWith('backend-api/conversation') || url.endsWith('backend-api/f/conversation')) && method === 'POST') {
    const body = bodyJson as ConversationRequestBody;
    let modified = false;

    if (body.messages) {
      // --- Model override from sessionStorage ---
      const selectedModel = window.sessionStorage.getItem('sp/selectedModel');
      if (selectedModel) {
        body.model = selectedModel;
        modified = true;
      }

      // --- Custom instruction injection from localStorage ---
      const lastInstruction = window.localStorage.getItem('sp/lastInstruction');
      if (lastInstruction && lastInstruction !== 'null') {
        const instructionsCache: Record<string, string> = JSON.parse(
          window.localStorage.getItem('sp/instructionsCache') || '{}',
        );
        const firstMessageId = body.messages[0]!.id;
        instructionsCache[firstMessageId] = lastInstruction;
        window.localStorage.setItem('sp/instructionsCache', JSON.stringify(instructionsCache));
        window.localStorage.setItem('sp/lastInstruction', 'null');

        const userMessage = body.messages.find((m) => m.author.role === 'user');
        if (userMessage) {
          const stringPart = userMessage.content?.parts.find((p): p is string => typeof p === 'string');
          if (stringPart !== undefined) {
            const merged = `${lastInstruction}${stringPart || ''}`;
            userMessage.content!.parts = userMessage.content!.parts.map((p) => (p === stringPart ? merged : p));
            body.messages = body.messages.map((m) => (m.id === userMessage.id ? userMessage : m));
          }
        }
        modified = true;
      }

      if (modified) {
        bodyText = JSON.stringify(body);
      }

      // Dispatch conversationSubmitted
      dispatch(SP_EVENTS.CONVERSATION_SUBMITTED, {
        branchingFromConversationId: body.branching_from_conversation_id,
        messages: body.messages,
        instructions: lastInstruction,
      });
    }
  }

  // =====================================================================
  // Execute the real fetch with (possibly mutated) body
  // =====================================================================

  const fetchInit: RequestInit = {
    ...init,
    method,
    headers: Object.fromEntries(headers.entries()),
    ...(method !== 'GET' && method !== 'HEAD' ? { body: bodyText } : {}),
  };

  let response: Response;
  try {
    response = await originalFetch(url, fetchInit);
  } catch (err) {
    console.error('Fetch request failed:', err);
    return originalFetch(request);
  }

  // =====================================================================
  // INCOMING: Clone response, parse, dispatch events
  // =====================================================================

  // --- backend-anon/me, /edge, /system_hints (anonymous user detection) ---
  if (
    url.endsWith('backend-anon/me') ||
    url.endsWith('backend-anon/edge') ||
    url.endsWith('backend-anon/system_hints')
  ) {
    const data = await response.clone().json();
    if (!data?.email || (data?.id as string)?.startsWith('ua-')) {
      window.localStorage.setItem('sp/isLoggedIn', 'false');
      dispatch(SP_EVENTS.SIGNOUT_RECEIVED, data);
    }
  }

  // --- backend-api/me (authenticated user) ---
  if (url.endsWith('backend-api/me')) {
    const accessToken = headers.get('Authorization');
    const data = await response.clone().json();
    if (accessToken && data?.id && !(data.id as string).startsWith('ua-')) {
      window.localStorage.setItem('sp/isLoggedIn', 'true');
      dispatch(SP_EVENTS.AUTH_RECEIVED, { ...data, accessToken });
    }
  }

  // --- api/auth/signout ---
  if (url.endsWith('api/auth/signout')) {
    const data = await response.clone().json();
    if (data?.success) {
      window.localStorage.setItem('sp/isLoggedIn', 'false');
      dispatch(SP_EVENTS.SIGNOUT_RECEIVED, data);
    }
  }

  // --- backend-api/subscriptions?account_id=... ---
  if (url.includes('backend-api/subscriptions?') && searchParams.get('account_id')) {
    const data = await response.clone().json();
    if (data?.plan_type) {
      dispatch(SP_EVENTS.SUBSCRIPTIONS_RECEIVED, {
        ...data,
        accountId: searchParams.get('account_id'),
      });
    }
  }

  // --- backend-api/stop_conversation POST ---
  if (url.endsWith('backend-api/stop_conversation') && method === 'POST') {
    const data = await response.clone().json();
    dispatch(SP_EVENTS.STOP_CONVERSATION_RECEIVED, data);
  }

  // --- backend-api/gizmos/g-... (single gizmo, not g-p-) ---
  if (url.includes('backend-api/gizmos/g-') && !url.includes('backend-api/gizmos/g-p-')) {
    const data = await response.clone().json();
    if ((data?.detail as string)?.toLowerCase().includes('not found')) {
      dispatch(SP_EVENTS.GIZMO_NOT_FOUND, url);
    } else if (data?.gizmo?.id) {
      dispatch(SP_EVENTS.GIZMO_RECEIVED, data);
    }
  }

  // --- backend-api/gizmos/bootstrap ---
  if (url.includes('backend-api/gizmos/bootstrap')) {
    const data = await response.clone().json();
    dispatch(SP_EVENTS.GIZMOS_BOOTSTRAP_RECEIVED, data);
  }

  // --- public-api/gizmos/discovery ---
  if (url.includes('public-api/gizmos/discovery')) {
    const data = await response.clone().json();
    if (data?.cuts) {
      dispatch(SP_EVENTS.GIZMO_DISCOVERY_RECEIVED, data);
    }
  }

  // --- backend-api/gizmos/g-.../sidebar POST ---
  if (url.includes('backend-api/gizmos/g-') && url.endsWith('sidebar') && method === 'POST') {
    const data = await response.clone().json();
    dispatch(SP_EVENTS.GIZMO_SIDEBAR_UPDATE_RECEIVED, data);
  }

  // --- backend-api/accounts/check ---
  if (url.includes('backend-api/accounts/check')) {
    const accessToken = headers.get('Authorization');
    const data = await response.clone().json();
    if (accessToken && data.accounts) {
      dispatch(SP_EVENTS.ACCOUNT_RECEIVED, { ...data, accessToken });
    }
  }

  // --- backend-api/files/file-.../download GET ---
  if (url.includes('backend-api/files/file') && url.endsWith('/download') && method === 'GET') {
    const fileId = url.split('/files/')[1]!.split('/download')[0]!;
    const data = await response.clone().json();
    if (data) {
      dispatch(SP_EVENTS.FILE_RECEIVED, { data, fileId });
    }
  }

  // --- backend-api/files/download/file-... GET ---
  if (url.includes('backend-api/files/download/file') && method === 'GET') {
    const fileId = url.split('/files/download/')[1]!.split('?')[0]!;
    const data = await response.clone().json();
    if (data) {
      dispatch(SP_EVENTS.FILE_RECEIVED, { data, fileId });
    }
  }

  // --- conversation/.../attachment/file-.../download GET ---
  if (isConversationUrl(url) && url.includes('/attachment/file') && url.endsWith('/download') && method === 'GET') {
    const fileId = url.split('/attachment/')[1]!.split('/download')[0]!;
    const data = await response.clone().json();
    if (data) {
      dispatch(SP_EVENTS.FILE_RECEIVED, { data, fileId });
    }
  }

  // --- conversation/.../textdocs GET ---
  if (isConversationUrl(url) && url.endsWith('/textdocs') && method === 'GET') {
    const conversationId = url.split('/conversation/')[1]!.split('/textdocs')[0]!;
    const data = await response.clone().json();
    if (data) {
      dispatch(SP_EVENTS.TEXTDOCS_RECEIVED, { textdocs: data, conversationId });
    }
  }

  // --- conversation PATCH with gizmo_id (project update) ---
  if (
    isConversationUrl(url) &&
    method === 'PATCH' &&
    typeof (bodyJson as ConversationPatchBody).gizmo_id === 'string'
  ) {
    const conversationId = url.split('/conversation/')[1];
    dispatch(SP_EVENTS.CONVERSATION_PROJECT_UPDATED, {
      conversationId,
      gizmoId: (bodyJson as ConversationPatchBody).gizmo_id,
    });
  }

  // --- backend-api/settings/user ---
  if (url.includes('backend-api/settings/user')) {
    const accessToken = headers.get('Authorization');
    const data = await response.clone().json();
    window.localStorage.setItem('sp/isLoggedIn', 'true');
    if (data) {
      dispatch(SP_EVENTS.USER_SETTINGS_RECEIVED, { ...data, accessToken });
    }
  }

  // --- backend-api/user_system_messages PATCH/POST ---
  if (url.includes('backend-api/user_system_messages') && (method === 'PATCH' || method === 'POST')) {
    const data = await response.clone().json();
    if (data) {
      dispatch(SP_EVENTS.PROFILE_UPDATED_RECEIVED, { ...data });
    }
  }

  // --- backend-api/conversations? (history list, limit=28) ---
  if (url.includes('backend-api/conversations?')) {
    const limit = parseInt(searchParams.get('limit') ?? '', 10);
    const offset = parseInt(searchParams.get('offset') ?? '', 10);
    const isArchived = searchParams.get('is_archived');
    if (limit === 28 && offset % 28 === 0 && (isArchived === 'false' || isArchived === null)) {
      const data = await response.clone().json();
      const event = new CustomEvent(SP_EVENTS.HISTORY_LOADED_RECEIVED, { detail: data });
      const page = Math.floor(offset / 28);
      setTimeout(() => {
        window.dispatchEvent(event);
      }, 1000 * page);
    }
  }

  // --- graphql? (history via GraphQL) ---
  if (url.includes('graphql?')) {
    const variables = JSON.parse(searchParams.get('variables') ?? '{}') as {
      first?: number;
      after?: string;
      isArchived?: boolean;
    };
    if (variables.first === 28 && variables.after === 'aWR4Oi0x' && variables.isArchived === false) {
      const data = await response.clone().json();
      dispatch(SP_EVENTS.HISTORY_LOADED_RECEIVED, data);
    }
  }

  // --- backend-api/gizmos/snorlax/sidebar (projects sidebar) ---
  if (url.includes('backend-api/gizmos/snorlax/sidebar')) {
    const cursor = searchParams.get('cursor');
    const data = await response.clone().json();
    dispatch(SP_EVENTS.PROJECTS_RECEIVED, { cursor, responseData: data });
  }

  // --- backend-api/conversations PATCH is_archived=true (archive all) ---
  if (
    url.includes('backend-api/conversations') &&
    (bodyJson as ConversationPatchBody).is_archived === true &&
    method === 'PATCH'
  ) {
    const data = await response.clone().json();
    dispatch(SP_EVENTS.ARCHIVED_ALL_RECEIVED, data);
  }

  // --- backend-api/conversations PATCH is_visible=false (delete all) ---
  if (
    url.includes('backend-api/conversations') &&
    (bodyJson as ConversationPatchBody).is_visible === false &&
    method === 'PATCH'
  ) {
    const data = await response.clone().json();
    dispatch(SP_EVENTS.DELETE_ALL_RECEIVED, data);
  }

  // --- Single conversation PATCH is_archived=false (unarchive) ---
  if (isConversationUrl(url) && (bodyJson as ConversationPatchBody).is_archived === false && method === 'PATCH') {
    const conversationId = url.split('/').pop()!;
    dispatch(SP_EVENTS.CONVERSATION_UNARCHIVED_RECEIVED, { conversationId });
  }

  // --- Single conversation PATCH is_archived=true (archive) ---
  if (isConversationUrl(url) && (bodyJson as ConversationPatchBody).is_archived === true && method === 'PATCH') {
    const conversationId = url.split('/').pop()!;
    dispatch(SP_EVENTS.CONVERSATION_ARCHIVED_RECEIVED, { conversationId });
  }

  // --- Single conversation PATCH is_visible=false (delete) ---
  if (isConversationUrl(url) && (bodyJson as ConversationPatchBody).is_visible === false && method === 'PATCH') {
    const conversationId = url.split('/').pop()!;
    dispatch(SP_EVENTS.CONVERSATION_DELETE_RECEIVED, { conversationId });
  }

  // --- Single conversation PATCH with title (rename) ---
  if (isConversationUrl(url) && Object.keys(bodyJson).includes('title') && method === 'PATCH') {
    const conversationId = url.split('/').pop()!;
    dispatch(SP_EVENTS.CONVERSATION_RENAME_RECEIVED, {
      conversationId,
      title: (bodyJson as ConversationPatchBody).title,
    });
  }

  // --- Single conversation GET by UUID (full conversation load) ---
  if (isConversationUrl(url) && method === 'GET') {
    const lastSegment = url.split('/').pop()!;
    if (UUID_RE.test(lastSegment)) {
      const data = await response.clone().json();
      const conversationId = (data.conversation_id as string) || (data.id as string) || lastSegment;
      if (conversationId) {
        dispatch(SP_EVENTS.CONVERSATION_RECEIVED, {
          conversation: { ...data, conversation_id: conversationId },
        });
      }
    }
  }

  // --- Deep research stream (tasks/deepresch_) ---
  if (url.includes('backend-api/tasks/deepresch_') && url.endsWith('/stream')) {
    const reader = (await response.clone()).body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let foundFinalMessage = false;

    function readDeepResearchChunk({ done, value }: ReadableStreamReadResult<Uint8Array>): void | Promise<void> {
      const chunk = decoder.decode(value, { stream: true });
      foundFinalMessage = foundFinalMessage || chunk?.includes('final_message');
      if (foundFinalMessage) {
        dispatch(SP_EVENTS.DEEP_RESEARCH_FINAL_MESSAGE_RECEIVED, {});
        reader.cancel();
        return;
      }
      if (done) {
        reader.cancel();
        return;
      }
      reader.read().then(readDeepResearchChunk);
    }

    reader.read().then(readDeepResearchChunk);
  }

  // --- Conversation POST stream (main chat response) ---
  if ((url.endsWith('backend-api/conversation') || url.endsWith('backend-api/f/conversation')) && method === 'POST') {
    const reader = (await response.clone()).body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let streamComplete = false;
    let done = false;
    let title = 'New chat';
    let conversationId: string | undefined;

    function readConversationChunk({
      done: chunkDone,
      value,
    }: ReadableStreamReadResult<Uint8Array>): void | Promise<void> {
      const chunk = decoder.decode(value, { stream: true });

      streamComplete = streamComplete || chunk?.includes('message_stream_complete');
      done = streamComplete && (done || chunkDone || chunk?.includes('DONE'));

      // Try to extract conversation ID after stream_complete
      if (streamComplete && !conversationId) {
        try {
          const parsed = JSON.parse(chunk.split('data: ')?.[1] ?? '{}');
          conversationId = parsed.conversation_id as string;
        } catch {
          // not the right chunk, keep going
        }
      }

      // Try to extract title from title_generation event
      if (chunk.includes('title_generation')) {
        try {
          const parsed = JSON.parse(chunk.split('data: ')?.[1] ?? '{}');
          title = parsed.title as string;
          if (!conversationId) {
            conversationId = parsed.conversation_id as string;
          }
        } catch {
          // ignore parse errors
        }
      }

      if (streamComplete && done) {
        dispatch(SP_EVENTS.CONVERSATION_RESPONSE_ENDED, {
          conversationId,
          conversationTitle: title,
        });
        reader.cancel();
        return;
      }

      return reader.read().then(readConversationChunk);
    }

    reader.read().then(readConversationChunk);
  }

  // --- conversation/.../async-status POST with status=4 ---
  if (
    isConversationUrl(url) &&
    url.includes('/async-status') &&
    method === 'POST' &&
    (bodyJson as ConversationPatchBody).status === 4
  ) {
    const conversationId = url.split('/conversation/')[1]!.split('/async-status')[0]!;
    const data = await response.clone().json();
    if (data.status === 'OK') {
      dispatch(SP_EVENTS.CONVERSATION_ASYNC_MESSAGE_RECEIVED, { conversationId });
    }
  }

  // --- backend-api/models ---
  if (url.includes('backend-api/models')) {
    const data = await response.clone().json();
    const accessToken = headers.get('Authorization');
    if (data.models) {
      dispatch(SP_EVENTS.MODELS_RECEIVED, { ...data, accessToken });
    }
  }

  // --- ab.chatgpt.com/v1/rgstr ---
  if (url.includes('ab.chatgpt.com/v1/rgstr')) {
    const data = await response.clone().json();
    if (data?.success) {
      dispatch(SP_EVENTS.RGSTR_EVENT_RECEIVED, { payload: bodyText });
    }
  }

  return response;
};

console.log('[SP Clone] Fetch interceptor installed (MAIN world)');
