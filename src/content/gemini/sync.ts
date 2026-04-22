/**
 * Gemini sync script — runs in the ISOLATED world.
 *
 * Listens for CustomEvents from the fetch interceptor and syncs
 * conversation data to Council's backend.
 *
 * Gemini's API is less structured than ChatGPT or Claude — it uses
 * batch RPC calls and nested array responses. We extract what we can
 * and fall back to DOM scraping for conversation metadata.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const syncedConversations = new Set<string>();

function getConversationIdFromUrl(): string | null {
  // Gemini URLs: /app/{conversationId} or /chat/{conversationId}
  const match = window.location.pathname.match(/\/(app|chat)\/([a-f0-9]+)/);
  if (!match?.[2]) return null;
  // Always use c_ prefix to match background sync IDs
  const id = match[2];
  return id.startsWith('c_') ? id : `c_${id}`;
}

function getConversationTitle(): string {
  // Try to get from document title
  const title = document.title.replace(/\s*[-|]\s*Gemini.*$/i, '').trim();
  return title || 'Gemini Conversation';
}

/**
 * Extract conversations from the Gemini sidebar DOM.
 * This is a fallback since Gemini's API format is opaque.
 */
function scrapeConversationList(): Array<{ id: string; title: string }> {
  const results: Array<{ id: string; title: string }> = [];

  // Gemini sidebar conversation items — look for links with conversation IDs
  const links = document.querySelectorAll('a[href*="/app/"], a[href*="/chat/"]');
  for (const link of links) {
    const href = (link as HTMLAnchorElement).href;
    const match = href.match(/\/(app|chat)\/([a-f0-9]+)/);
    if (match?.[2]) {
      const title = (link as HTMLElement).textContent?.trim() || 'Untitled';
      const id = match[2].startsWith('c_') ? match[2] : `c_${match[2]}`;
      results.push({ id, title });
    }
  }

  return results;
}

/**
 * Extract messages from the current Gemini conversation DOM.
 */
function scrapeCurrentMessages(): Array<{ role: string; text: string }> {
  const messages: Array<{ role: string; text: string }> = [];

  // Gemini uses various selectors for messages
  const turns = document.querySelectorAll(
    '[data-message-id], .conversation-turn, .model-response-text, .query-text, .response-container',
  );

  if (turns.length === 0) {
    // Fallback: look for message containers with role indicators
    const userMsgs = document.querySelectorAll('.query-text, [class*="user-query"], [class*="human"]');
    const aiMsgs = document.querySelectorAll('.model-response-text, [class*="model-response"], [class*="assistant"]');

    // Interleave user and AI messages
    const maxLen = Math.max(userMsgs.length, aiMsgs.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < userMsgs.length) {
        const text = userMsgs[i]?.textContent?.trim();
        if (text) messages.push({ role: 'user', text });
      }
      if (i < aiMsgs.length) {
        const text = aiMsgs[i]?.textContent?.trim();
        if (text) messages.push({ role: 'assistant', text });
      }
    }
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Sync functions
// ---------------------------------------------------------------------------

function syncConversation(id: string, title: string) {
  if (syncedConversations.has(id)) return;
  syncedConversations.add(id);

  chrome.runtime.sendMessage({
    type: 'addConversations',
    detail: {
      conversations: [
        {
          conversation_id: id,
          title,
          create_time: Date.now() / 1000,
          update_time: Date.now() / 1000,
          source: 'gemini',
          source_id: id,
          source_url: `https://gemini.google.com/app/${id}`,
          gizmo_id: null,
          has_attachments: false,
        },
      ],
    },
  });
}

function syncMessages(conversationId: string, messages: Array<{ role: string; text: string }>) {
  if (messages.length === 0) return;

  const mapped = messages.map((m, i) => ({
    messageId: `gemini-${conversationId}-${i}`,
    conversationId,
    role: m.role,
    content: [{ type: 'text', text: m.text }],
    provider: m.role === 'assistant' ? 'google' : null,
    model: null,
    metadata: {},
  }));

  chrome.runtime.sendMessage({
    type: 'syncClaudeMessages', // Reuse the same handler — it's provider-agnostic
    detail: { conversationId, messages: mapped },
  });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Listen for intercepted API responses
window.addEventListener('council:gemini:response', ((e: CustomEvent) => {
  const { data } = e.detail;

  // Try to extract conversation data from various response formats
  if (Array.isArray(data)) {
    // Could be a conversation list
    for (const item of data) {
      if (item && typeof item === 'object' && item.id) {
        syncConversation(item.id, item.title ?? item.name ?? 'Untitled');
      }
    }
  }
}) as EventListener);

// Listen for streaming completions
window.addEventListener('council:gemini:completion', ((e: CustomEvent) => {
  const { text } = e.detail;
  const convId = getConversationIdFromUrl();
  if (convId && text) {
    syncConversation(convId, getConversationTitle());
    // We have the assistant response, but not the user query from the stream
    // The full message sync happens via DOM scraping below
  }
}) as EventListener);

// ---------------------------------------------------------------------------
// Periodic DOM scraping — Gemini's API is opaque, so we supplement with DOM
// ---------------------------------------------------------------------------

let lastSyncedUrl = '';

function periodicSync() {
  const currentUrl = window.location.href;

  // Only sync when on a conversation page and URL changed
  if (currentUrl === lastSyncedUrl) return;

  const convId = getConversationIdFromUrl();
  if (!convId) return;

  lastSyncedUrl = currentUrl;

  // Wait for DOM to settle
  setTimeout(() => {
    const title = getConversationTitle();
    syncConversation(convId, title);

    const messages = scrapeCurrentMessages();
    if (messages.length > 0) {
      syncMessages(convId, messages);
    }
  }, 2000);
}

// Also scrape the sidebar for conversation list on page load
function syncSidebarConversations() {
  const convs = scrapeConversationList();
  for (const { id, title } of convs) {
    syncConversation(id, title);
  }
}

// Run periodically
setInterval(periodicSync, 5000);

// Initial sync after page load
setTimeout(() => {
  syncSidebarConversations();
  periodicSync();
}, 3000);

// Also sync on navigation (Gemini is a SPA)
const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(history, args);
  setTimeout(periodicSync, 1000);
};
window.addEventListener('popstate', () => setTimeout(periodicSync, 1000));

console.log('[Council] Gemini sync script active');
