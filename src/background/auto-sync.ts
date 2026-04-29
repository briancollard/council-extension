/**
 * Auto-sync — thin token relay.
 *
 * The heavy sync work (fetching conversations, messages, images) now
 * happens on the server via the sync engine. The extension only:
 * 1. Detects provider sessions via cookies
 * 2. Pushes session tokens to the Council server
 * 3. Checks sync status and broadcasts to the web app
 */

import { API_URL } from './messaging';

/** Send sync progress to connected web app tabs */
function syncProgress(provider: string, phase: string, current?: number, total?: number, detail?: string) {
  const broadcast = (globalThis as Record<string, unknown>).__councilBroadcast as
    | ((data: Record<string, unknown>) => void)
    | undefined;
  broadcast?.({ provider, phase, current, total, detail });
}

// ---------------------------------------------------------------------------
// Council API helper
// ---------------------------------------------------------------------------

/**
 * Get the auth token for Council API calls.
 * Prefers the Bearer token (pasted from web app) over the legacy Hat-Token.
 */
async function getAuthToken(): Promise<{ token: string } | null> {
  // 1. Read council_token cookie set by web app login (preferred — always fresh)
  try {
    const cookie = await chrome.cookies.get({ url: API_URL, name: 'council_token' });
    if (cookie?.value) return { token: cookie.value };
  } catch {
    // cookies API not available
  }

  // 2. Fallback: check chrome.storage (set by popup login — may be stale)
  const stored = await new Promise<string | null>((resolve) => {
    chrome.storage.local.get(['councilBearerToken'], (data) => {
      resolve(data.councilBearerToken || null);
    });
  });
  if (stored) return { token: stored };

  return null;
}

async function councilFetch(path: string, method = 'POST', body?: unknown): Promise<Response | null> {
  const auth = await getAuthToken();
  if (!auth) {
    console.log('[Council] No auth token found — skipping sync. Please paste your token in the extension popup.');
    return null;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    Authorization: `Bearer ${auth.token}`,
  };

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    // Retry on 429 from our own server with exponential backoff
    if (res.status === 429) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const delay = attempt * 2000;
        console.warn(`[Council] 429 on ${path} — retrying in ${delay / 1000}s (attempt ${attempt}/3)`);
        await new Promise((r) => setTimeout(r, delay));
        const retry = await fetch(`${API_URL}${path}`, {
          method,
          headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (retry.ok) return retry;
        if (retry.status !== 429) {
          console.error(`[Council] Retry got ${retry.status} on ${path}`);
          return retry;
        }
      }
      console.error(`[Council] Still 429 after 3 retries on ${path}`);
      return res;
    }
    console.error(`[Council] API ${res.status} on ${path}`);
    // If auth failed, clear stale storage token and retry once with cookie
    if (res.status === 401) {
      chrome.storage.local.remove('councilBearerToken');
      const freshAuth = await getAuthToken();
      if (freshAuth && freshAuth.token !== auth.token) {
        console.log('[Council] Retrying with fresh token...');
        const retry = await fetch(`${API_URL}${path}`, {
          method,
          headers: { ...headers, Authorization: `Bearer ${freshAuth.token}` },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (retry.ok) return retry;
        console.error(`[Council] Retry also failed: ${retry.status}`);
      }
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Status reporting — close the silent-failure loop
// ---------------------------------------------------------------------------

/**
 * Report a sync status to the server. Used when the extension detects a
 * provider-side failure (401 / token revocation / etc.) so the UI can
 * surface the broken state instead of leaving the connection stuck at
 * 'syncing' or stale 'connected'. Best-effort — failures here are
 * logged but never thrown, since the caller already has its own bug
 * to deal with.
 */
async function reportSyncStatus(
  provider: 'chatgpt' | 'claude' | 'gemini',
  status: 'token_expired' | 'error' | 'connected',
  error?: string,
): Promise<void> {
  try {
    await councilFetch(`/api/sync/connections/${provider}/sync`, 'POST', {
      status,
      error: error ?? null,
      completedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[Council] Failed to report ${status} for ${provider}:`, e);
  }
}

// ---------------------------------------------------------------------------
// Token relay — push provider sessions to the server
// ---------------------------------------------------------------------------

/** Push ChatGPT access token to the server */
async function pushChatGPTToken(): Promise<void> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
    const sessionCookie = cookies.find(
      (c) => c.name === '__Secure-next-auth.session-token' || c.name === '__Secure-next-auth.callback-url',
    );

    if (!sessionCookie) {
      console.log('[Council] ChatGPT: no session cookies found');
      return;
    }

    // Get access token from ChatGPT's session API
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!sessionRes.ok) {
      console.log(`[Council] ChatGPT: session endpoint returned ${sessionRes.status}`);
      // 401/403 here means the cookie is stale (user signed out at chatgpt.com
      // or session revoked). Report it so the UI can flip to "Session expired"
      // instead of staying at 'connected' forever.
      if (sessionRes.status === 401 || sessionRes.status === 403) {
        await reportSyncStatus('chatgpt', 'token_expired', `chatgpt.com auth/session returned ${sessionRes.status}`);
      }
      return;
    }

    const session = await sessionRes.json();
    const accessToken = session.accessToken;
    if (!accessToken) {
      console.log('[Council] ChatGPT: no access token in session response');
      // No accessToken on a 200 response = session ended on the provider side.
      await reportSyncStatus('chatgpt', 'token_expired', 'chatgpt.com session response had no accessToken');
      return;
    }

    const res = await councilFetch('/api/sync/connections/chatgpt', 'PUT', {
      sessionToken: accessToken,
    });
    if (res?.ok) {
      console.log('[Council] ChatGPT: token pushed to server');
      syncProgress('chatgpt', 'token_pushed');
    }
  } catch (err) {
    console.error('[Council] ChatGPT token push error:', err);
  }
}

/**
 * Push the full ChatGPT conversation list from extension → server.
 *
 * chatgpt.com's sidebar uses a GraphQL persisted query with cursor pagination.
 * The legacy REST endpoint /backend-api/conversations is now capped (~29 items
 * regardless of account size), so the server can't see the full list. Running
 * this from the extension gives us:
 *   - the live persisted-query hash (chatgpt.com itself rotates it)
 *   - the user's browser IP (no datacenter rate limit)
 *   - access to the same sidebar view the user actually sees
 */
// Fallback hash — used only if we haven't yet captured a live hash from
// chatgpt.com via the main-world fetch interceptor (see content/main-world/
// fetch-interceptor.ts and content/isolated-world/index.ts). The interceptor
// stores the live hash in chrome.storage.local on every chatgpt.com page
// load. If chatgpt.com rotates the hash, the interceptor catches the new one
// next time the user visits, and sync self-heals.
const CHATGPT_GRAPHQL_HASH_FALLBACK = '5f5770417560c56ba8fa929b84900b53f40cdcc3906d5197003e9ecf7adf3bb7';
const HASH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function getChatGPTGraphqlHash(): Promise<string> {
  try {
    const stored = await new Promise<{ hash?: string; capturedAt?: number }>((resolve) => {
      chrome.storage.local.get(['chatgptGraphqlHash', 'chatgptGraphqlHashCapturedAt'], (data) =>
        resolve({ hash: data.chatgptGraphqlHash, capturedAt: data.chatgptGraphqlHashCapturedAt }),
      );
    });
    if (stored.hash && /^[a-f0-9]{64}$/.test(stored.hash)) {
      const age = Date.now() - (stored.capturedAt ?? 0);
      if (age < HASH_MAX_AGE_MS) return stored.hash;
    }
  } catch {
    // chrome.storage unavailable — fall through
  }
  return CHATGPT_GRAPHQL_HASH_FALLBACK;
}

async function pushChatGPTConversationList(): Promise<void> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
    const sessionCookie = cookies.find(
      (c) => c.name === '__Secure-next-auth.session-token' || c.name === '__Secure-next-auth.callback-url',
    );
    if (!sessionCookie) return;

    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!sessionRes.ok) {
      // Stale session at chatgpt.com → flip our connection to expired so
      // the UI surfaces it instead of leaving the user wondering why no
      // new chats appear in Council.
      if (sessionRes.status === 401 || sessionRes.status === 403) {
        await reportSyncStatus('chatgpt', 'token_expired', `chatgpt.com session returned ${sessionRes.status}`);
      }
      return;
    }
    const session = await sessionRes.json();
    const accessToken = session.accessToken;
    if (!accessToken) {
      await reportSyncStatus('chatgpt', 'token_expired', 'no accessToken in chatgpt.com session');
      return;
    }

    const graphqlHash = await getChatGPTGraphqlHash();
    let cursor: string | null = 'aWR4Oi0x'; // base64("idx:-1") — first page
    let totalFetched = 0;
    let pages = 0;
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50; // hard cap: 5000 convos
    const BATCH_PUSH = 200;
    let pendingBatch: any[] = [];

    while (cursor && pages < MAX_PAGES) {
      const variables = { first: PAGE_SIZE, after: cursor, order: 'updated', expand: true, isArchived: false };
      const extensions = { persistedQuery: { sha256Hash: graphqlHash, version: 1 } };
      const url = new URL('https://chatgpt.com/graphql');
      url.searchParams.append('variables', JSON.stringify(variables));
      url.searchParams.append('extensions', JSON.stringify(extensions));

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401) {
        // The original silent-failure bug: GraphQL list 401 means the
        // bearer token we just pushed is already stale (e.g. user signed
        // out between session-fetch and list-fetch). Tell the server so
        // the connection flips to 'token_expired' instead of staying
        // 'syncing' forever and tricking the UI into a green checkmark.
        console.log('[Council] ChatGPT list: 401 — reporting expired and stopping');
        await reportSyncStatus('chatgpt', 'token_expired', 'GraphQL conversationDisplayHistory returned 401');
        break;
      }
      if (res.status === 429) {
        console.log('[Council] ChatGPT list: 429 — backing off and stopping');
        break;
      }
      if (!res.ok) {
        console.log(`[Council] ChatGPT list: ${res.status} — stopping`);
        // Non-401 errors still indicate sync isn't healthy. Mark as 'error'
        // rather than letting status drift while sidebar fetch silently fails.
        await reportSyncStatus('chatgpt', 'error', `GraphQL list returned ${res.status}`);
        break;
      }

      const data = (await res.json()) as {
        data?: {
          conversationDisplayHistory?: {
            edges?: Array<{ node?: any }>;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string };
          };
        };
      };
      const edges = data.data?.conversationDisplayHistory?.edges ?? [];
      const pageInfo = data.data?.conversationDisplayHistory?.pageInfo;
      const items = edges.map((e) => e.node).filter(Boolean);

      // Normalize to snake_case for the server endpoint
      for (const node of items) {
        pendingBatch.push({
          id: node.id ?? node.conversation_id,
          title: node.title ?? null,
          create_time: typeof node.createTime === 'number' ? node.createTime : (node.create_time ?? null),
          update_time: typeof node.updateTime === 'number' ? node.updateTime : (node.update_time ?? null),
          gizmo_id: node.gizmoId ?? node.gizmo_id ?? null,
        });
      }
      totalFetched += items.length;
      pages++;

      if (pendingBatch.length >= BATCH_PUSH) {
        await councilFetch('/api/sync/chatgpt-conversations/bulk', 'POST', { conversations: pendingBatch });
        pendingBatch = [];
      }

      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
      cursor = pageInfo.endCursor;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (pendingBatch.length > 0) {
      await councilFetch('/api/sync/chatgpt-conversations/bulk', 'POST', { conversations: pendingBatch });
    }

    console.log(`[Council] ChatGPT list: pushed ${totalFetched} conversations across ${pages} pages`);
    syncProgress('chatgpt', 'list_synced', totalFetched, totalFetched);
  } catch (err) {
    console.error('[Council] ChatGPT list push error:', err);
  }
}

/** Backfill ChatGPT messages from extension (browser IP avoids datacenter rate limits) */
async function backfillChatGPTMessages(): Promise<void> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
    const sessionCookie = cookies.find(
      (c) => c.name === '__Secure-next-auth.session-token' || c.name === '__Secure-next-auth.callback-url',
    );
    if (!sessionCookie) return;

    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!sessionRes.ok) return;
    const session = await sessionRes.json();
    const accessToken = session.accessToken;
    if (!accessToken) return;

    // Get conversations needing messages from Council API
    const needRes = await councilFetch('/api/conversations/needing-messages?source=chatgpt', 'GET');
    if (!needRes?.ok) return;
    const needIds: string[] = await needRes.json();
    if (needIds.length === 0) return;

    const batch = needIds.slice(0, 30); // Larger batch — 500s are fast to clear
    console.log(`[Council] ChatGPT: backfilling messages for ${batch.length}/${needIds.length} conversations`);
    syncProgress('chatgpt', 'messages', 0, batch.length);

    let synced = 0;
    let consecutive429s = 0;
    for (const convId of batch) {
      try {
        const res = await fetch(`https://chatgpt.com/backend-api/conversation/${convId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 429) {
          consecutive429s++;
          if (consecutive429s >= 3) {
            console.log(`[Council] ChatGPT backfill: 3 consecutive 429s — stopping`);
            break;
          }
          console.log(`[Council] ChatGPT backfill: 429 (${consecutive429s}/3) — waiting 10s`);
          await new Promise((r) => setTimeout(r, 10000));
          continue;
        }
        consecutive429s = 0; // reset on success
        if (res.status === 401) {
          console.log('[Council] ChatGPT backfill: 401 — token expired');
          break;
        }
        if (res.status === 404 || res.status === 500) {
          // Report failure to server — server tracks attempts and decides when to stop
          console.log(`[Council] ChatGPT backfill: ${res.status} for ${convId}`);
          await councilFetch(`/api/conversations/${convId}/sync-failure`, 'POST', {
            error: res.status,
          });
          continue;
        }
        if (!res.ok) {
          console.log(`[Council] ChatGPT backfill: ${res.status} for ${convId}`);
          continue;
        }

        const convData = await res.json();
        const mapping = convData.mapping;
        if (!mapping) continue;

        // BFS walk to extract messages
        const msgs: any[] = [];
        const visited = new Set<string>();
        let root: string | null = null;
        for (const [id, node] of Object.entries(mapping) as [string, any][]) {
          if (!node.parent || !mapping[node.parent]) {
            root = id;
            break;
          }
        }
        const queue = root ? [root] : [];
        let ordinal = 0;
        while (queue.length > 0) {
          const id = queue.shift()!;
          if (visited.has(id)) continue;
          visited.add(id);
          const node = mapping[id] as any;
          if (!node) continue;
          for (const child of node.children ?? []) {
            if (!visited.has(child)) queue.push(child);
          }

          const role = node.message?.author?.role;
          if ((role === 'user' || role === 'assistant' || role === 'tool') && node.message) {
            const contentBlocks: any[] = [];
            for (const part of node.message.content?.parts ?? []) {
              if (typeof part === 'string') {
                if (part.trim()) contentBlocks.push({ type: 'text', text: part });
              } else if (
                part?.content_type === 'image_asset_pointer' ||
                part?.asset_pointer?.startsWith('file-service://')
              ) {
                const fileId = part?.asset_pointer?.split('://')[1];
                if (fileId)
                  contentBlocks.push({ type: 'image', image_id: fileId, width: part.width, height: part.height });
              } else if (typeof part === 'object' && part !== null) {
                if (
                  part.content_type === 'real_time_user_audio_video_asset_pointer' ||
                  part.content_type === 'real_time_model_audio_asset_pointer'
                )
                  continue;
                contentBlocks.push({ type: part.content_type ?? 'unknown', ...part });
              }
            }
            if (contentBlocks.length > 0) {
              msgs.push({
                messageId: node.message.id,
                parentId: node.parent ?? null,
                role: role === 'tool' ? 'assistant' : role,
                content: contentBlocks,
                provider: role === 'assistant' || role === 'tool' ? 'openai' : null,
                model: role === 'assistant' ? (convData.default_model_slug ?? null) : null,
                metadata: {},
                ordinal: ordinal++,
                createdAt: node.message.create_time
                  ? new Date(node.message.create_time * 1000).toISOString()
                  : undefined,
              });
            }
          }
        }

        if (msgs.length > 0) {
          await councilFetch(`/api/conversations/${convId}/messages/bulk`, 'POST', { messages: msgs });
          synced++;
          console.log(`[Council] ChatGPT:   ${convData.title ?? convId}: ${msgs.length} messages`);
          syncProgress('chatgpt', 'messages', synced, batch.length, convData.title);
        }
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        console.error(`[Council] ChatGPT backfill error for ${convId}:`, e);
      }
    }
    if (synced > 0) console.log(`[Council] ChatGPT: backfilled ${synced} conversations`);
    else if (batch.length > 0) console.log(`[Council] ChatGPT: backfill attempted ${batch.length} but 0 succeeded`);
    syncProgress('chatgpt', 'complete');
  } catch (err) {
    console.error('[Council] ChatGPT backfill error:', err);
  }
}

/** Push Claude session key to the server */
async function pushClaudeToken(): Promise<void> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'claude.ai' });
    const sessionCookie = cookies.find((c) => c.name === 'sessionKey');

    if (!sessionCookie) {
      console.log('[Council] Claude: no session cookie found');
      return;
    }

    const res = await councilFetch('/api/sync/connections/claude', 'PUT', {
      sessionToken: sessionCookie.value,
    });
    if (res?.ok) {
      console.log('[Council] Claude: token pushed to server');
      syncProgress('claude', 'token_pushed');
    }
  } catch (err) {
    console.error('[Council] Claude token push error:', err);
  }
}

/** Push Gemini cookies + page tokens to the server.
 * Google ties sessions to the browser IP, so the server can't fetch the Gemini
 * page itself. The extension fetches it, extracts tokens, and sends everything. */
async function pushGeminiTokens(): Promise<void> {
  try {
    let googleCookies: chrome.cookies.Cookie[] = [];
    let geminiCookies: chrome.cookies.Cookie[] = [];
    try {
      googleCookies = await chrome.cookies.getAll({ domain: '.google.com' });
      geminiCookies = await chrome.cookies.getAll({ url: 'https://gemini.google.com' });
    } catch {
      return;
    }

    const allCookies = [...googleCookies, ...geminiCookies];
    const hasSession = allCookies.some(
      (c) => c.name === '__Secure-1PSID' || c.name === '__Secure-1PSIDTS' || c.name === 'SID' || c.name === 'HSID',
    );

    if (!hasSession) {
      console.log('[Council] Gemini: no session cookies found');
      return;
    }

    // Fetch the Gemini app page from the extension (browser IP + cookies)
    const cookieStr = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    let accessToken = '';
    let buildLabel = '';
    let sessionId = '';
    try {
      const pageRes = await fetch('https://gemini.google.com/app', {
        headers: {
          Cookie: cookieStr,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        accessToken = html.match(/SNlM0e":"([^"]+)"/)?.[1] ?? '';
        buildLabel = html.match(/"cfb2h":"([^"]+)"/)?.[1] ?? '';
        sessionId = html.match(/"FdrFJe":"([^"]+)"/)?.[1] ?? '';
      }
    } catch {
      // Page fetch failed — still send cookies
    }

    // Send only the cookies Gemini's API actually needs to the server —
    // NOT the entire *.google.com cookie jar. Gmail session cookies,
    // Drive auth, etc. would otherwise get relayed to Council's server
    // granting far more account access than needed if that server were
    // ever compromised (gemini-review 4 critical).
    const GEMINI_REQUIRED_COOKIES = new Set([
      '__Secure-1PSID',
      '__Secure-1PSIDTS',
      '__Secure-1PSIDCC',
      '__Secure-3PSID',
      '__Secure-3PSIDTS',
      '__Secure-3PSIDCC',
      'SID',
      'HSID',
      'SSID',
      'APISID',
      'SAPISID',
      '__Secure-1PAPISID',
      '__Secure-3PAPISID',
      'NID',
    ]);
    const cookieData = allCookies
      .filter((c) => GEMINI_REQUIRED_COOKIES.has(c.name))
      .map((c) => ({ name: c.name, value: c.value }));
    const tokenPayload = {
      sessionToken: JSON.stringify({
        cookies: cookieData,
        pageTokens: { accessToken, buildLabel, sessionId },
      }),
    };

    const res = await councilFetch('/api/sync/connections/gemini', 'PUT', tokenPayload);
    if (res?.ok) {
      console.log(`[Council] Gemini: tokens pushed to server (pageToken: ${accessToken ? 'yes' : 'no'})`);
      syncProgress('gemini', 'token_pushed');
    }
  } catch (err) {
    console.error('[Council] Gemini token push error:', err);
  }
}

// ---------------------------------------------------------------------------
// Gemini sync — runs in extension (Google API calls are IP-bound to browser)
// ---------------------------------------------------------------------------

function parseGeminiBatchResponse(text: string): string | null {
  try {
    const cleaned = text.replace(/^\)\]\}'/, '').trim();
    const lines = cleaned.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || /^\d+$/.test(trimmed)) continue;
      try {
        const outer = JSON.parse(trimmed);
        if (Array.isArray(outer) && Array.isArray(outer[0]) && typeof outer[0][2] === 'string') {
          return outer[0][2];
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function syncGeminiFromExtension(): Promise<void> {
  let googleCookies: chrome.cookies.Cookie[] = [];
  let geminiCookies: chrome.cookies.Cookie[] = [];
  try {
    googleCookies = await chrome.cookies.getAll({ domain: '.google.com' });
    geminiCookies = await chrome.cookies.getAll({ url: 'https://gemini.google.com' });
  } catch {
    return;
  }

  const allCookies = [...googleCookies, ...geminiCookies];
  const hasSession = allCookies.some(
    (c) => c.name === '__Secure-1PSID' || c.name === '__Secure-1PSIDTS' || c.name === 'SID' || c.name === 'HSID',
  );
  if (!hasSession) return;

  console.log('[Council] Gemini: syncing from extension...');

  try {
    const cookieStr = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const headers: Record<string, string> = {
      Cookie: cookieStr,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    };

    // Fetch page tokens
    const pageRes = await fetch('https://gemini.google.com/app', {
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(15000),
    });
    if (!pageRes.ok) return;
    const html = await pageRes.text();
    const accessToken = html.match(/SNlM0e":"([^"]+)"/)?.[1];
    const buildLabel = html.match(/"cfb2h":"([^"]+)"/)?.[1] ?? '';
    const sessionId = html.match(/"FdrFJe":"([^"]+)"/)?.[1] ?? '';
    if (!accessToken) {
      console.error('[Council] Gemini: no access token');
      return;
    }

    // List conversations
    const allConvs: Array<{ id: string; title: string; timestamp: number }> = [];
    for (const chatType of [0, 1]) {
      const payload = JSON.stringify([50, null, [chatType, null, 1]]);
      const rpcData = JSON.stringify([[['MaZiqc', payload, null, 'generic']]]);
      const reqId = Math.floor(Math.random() * 90000) + 10000;
      const res = await fetch(
        `https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=MaZiqc&_reqid=${reqId}&rt=c&bl=${buildLabel}&f.sid=${sessionId}`,
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            'X-Same-Domain': '1',
          },
          body: `at=${encodeURIComponent(accessToken)}&f.req=${encodeURIComponent(rpcData)}`,
          credentials: 'include',
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) continue;
      const parsed = parseGeminiBatchResponse(await res.text());
      if (!parsed) continue;
      try {
        const rawList = JSON.parse(parsed);
        const seen = new Set<string>();
        function find(arr: any): void {
          if (!Array.isArray(arr)) return;
          if (
            typeof arr[0] === 'string' &&
            arr[0].startsWith('c_') &&
            (typeof arr[1] === 'string' || arr[1] === null) &&
            arr.length >= 6
          ) {
            if (!seen.has(arr[0])) {
              seen.add(arr[0]);
              let ts = Math.floor(Date.now() / 1000);
              if (Array.isArray(arr[5])) ts = arr[5][0];
              allConvs.push({ id: arr[0], title: typeof arr[1] === 'string' ? arr[1] : 'Untitled', timestamp: ts });
            }
            return;
          }
          for (const item of arr) {
            if (Array.isArray(item)) find(item);
          }
        }
        find(rawList);
      } catch {
        /* skip */
      }
    }

    if (allConvs.length === 0) {
      console.log('[Council] Gemini: no conversations found');
      return;
    }

    // Save conversations
    await councilFetch('/gptx/add-conversations/', 'POST', {
      conversations: allConvs.map((c) => ({
        conversation_id: c.id,
        title: c.title,
        create_time: c.timestamp,
        update_time: c.timestamp,
        source: 'gemini',
        source_id: c.id,
        source_url: `https://gemini.google.com/app/${c.id}`,
        gizmo_id: null,
        has_attachments: false,
      })),
    });
    console.log(`[Council] Gemini: synced ${allConvs.length} conversations`);
    syncProgress('gemini', 'conversations', allConvs.length, allConvs.length);

    // Fetch messages for conversations needing them
    const syncedRes = await councilFetch('/api/conversations/synced-ids', 'GET');
    const syncedIds = new Set<string>(syncedRes?.ok ? await syncedRes.json() : []);
    const needMessages = allConvs.filter((c) => !syncedIds.has(c.id));
    const batch = needMessages.slice(0, 15);

    if (batch.length > 0) {
      console.log(`[Council] Gemini: fetching messages for ${batch.length} conversations`);
      syncProgress('gemini', 'messages', 0, batch.length);
    }

    let synced = 0;
    for (const conv of batch) {
      try {
        const readPayload = JSON.stringify([conv.id, 100, null, 1, [1], [4], null, 1]);
        const rpcData = JSON.stringify([[['hNvQHb', readPayload, null, 'generic']]]);
        const reqId = Math.floor(Math.random() * 90000) + 10000;
        const readRes = await fetch(
          `https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=hNvQHb&_reqid=${reqId}&rt=c&bl=${buildLabel}&f.sid=${sessionId}`,
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
              'X-Same-Domain': '1',
            },
            body: `at=${encodeURIComponent(accessToken)}&f.req=${encodeURIComponent(rpcData)}`,
            credentials: 'include',
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!readRes.ok) continue;
        const turnData = parseGeminiBatchResponse(await readRes.text());
        if (!turnData) continue;
        let turns: any;
        try {
          turns = JSON.parse(turnData);
        } catch {
          continue;
        }

        const msgs: any[] = [];
        const exchanges = Array.isArray(turns) && Array.isArray(turns[0]) ? turns[0] : [];
        let prevId: string | null = null;

        for (const ex of exchanges) {
          if (!Array.isArray(ex) || ex.length < 4) continue;
          const rid = ex[0]?.[1] ?? `gemini-${conv.id}-${msgs.length}`;
          // User
          let userText: string | null = null;
          function findText(arr: any): string | null {
            if (!Array.isArray(arr)) return null;
            for (const item of arr) {
              if (typeof item === 'string' && item.length > 2 && !item.startsWith('c_') && !/^[0-9a-f]{16}$/.test(item))
                return item;
              if (Array.isArray(item)) {
                const f = findText(item);
                if (f) return f;
              }
            }
            return null;
          }
          if (Array.isArray(ex[2])) userText = findText(ex[2]);
          if (userText) {
            msgs.push({
              messageId: `${rid}-user`,
              parentId: prevId,
              role: 'user',
              content: [{ type: 'text', text: userText }],
              provider: null,
              model: null,
              metadata: {},
            });
          }
          // Assistant
          const resp = ex[3];
          if (!Array.isArray(resp)) continue;
          const rcid = typeof resp[3] === 'string' ? resp[3] : `${rid}-asst`;
          const candidate = resp[0]?.[0];
          const blocks: any[] = [];
          if (Array.isArray(candidate)) {
            const text = Array.isArray(candidate[1]) && typeof candidate[1][0] === 'string' ? candidate[1][0] : '';
            if (text.trim()) blocks.push({ type: 'text', text: text.trim() });
          } else {
            let best = '';
            function findBest(arr: any, d: number): void {
              if (d > 3 || !Array.isArray(arr)) return;
              for (const i of arr) {
                if (typeof i === 'string' && i.length > best.length && !i.startsWith('rc_') && !i.startsWith('c_'))
                  best = i;
                else if (Array.isArray(i)) findBest(i, d + 1);
              }
            }
            findBest(resp, 0);
            if (best.trim()) blocks.push({ type: 'text', text: best.trim() });
          }
          if (blocks.length > 0) {
            msgs.push({
              messageId: rcid,
              parentId: userText ? `${rid}-user` : prevId,
              role: 'assistant',
              content: blocks,
              provider: 'google',
              model: 'gemini',
              metadata: {},
            });
            prevId = rcid;
          }
        }

        if (msgs.length > 0) {
          await councilFetch(`/api/conversations/${conv.id}/messages/bulk`, 'POST', { messages: msgs });
          synced++;
          console.log(`[Council] Gemini:   ${conv.title}: ${msgs.length} messages`);
          syncProgress('gemini', 'messages', synced, batch.length, conv.title);
        }
        await new Promise((r) => setTimeout(r, 750));
      } catch {
        /* skip conversation */
      }
    }

    if (synced > 0) console.log(`[Council] Gemini: messages synced for ${synced} conversations`);
    syncProgress('gemini', 'complete');
    console.log('[Council] Gemini: sync complete');
  } catch (err) {
    console.error('[Council] Gemini sync error:', err);
  }
}

/** Check sync status from the server and broadcast to web app */
async function checkSyncStatus(): Promise<void> {
  try {
    const res = await councilFetch('/api/sync/connections', 'GET');
    if (!res?.ok) return;

    const connections = await res.json();
    if (Array.isArray(connections)) {
      for (const conn of connections) {
        syncProgress(conn.provider, 'status', undefined, undefined, conn.status);
      }
    }
  } catch {
    // Status check is best-effort
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runAutoSync(): Promise<void> {
  console.log('[Council] Auto-sync: pushing tokens to server...');

  // Check if we have auth — if not, skip sync entirely
  const auth = await getAuthToken();
  if (!auth) {
    console.log('[Council] No auth token configured. Paste your Council token in the extension popup to enable sync.');
    return;
  }

  // Push ChatGPT + Claude tokens to server (server syncs them)
  // Gemini runs directly from extension (Google API calls are IP-bound)
  // Push tokens to server (server handles conversation list + metadata)
  // Extension handles message backfill (browser IP) + Gemini sync (IP-bound)
  await Promise.allSettled([
    pushChatGPTToken(),
    pushClaudeToken(),
    pushGeminiTokens(),
    pushChatGPTConversationList(),
    backfillChatGPTMessages(),
    syncGeminiFromExtension(),
  ]);

  // Check sync status after a short delay (give server time to start syncing)
  setTimeout(() => {
    checkSyncStatus().catch(() => {});
  }, 5000);

  console.log('[Council] Auto-sync: token relay complete.');
}
