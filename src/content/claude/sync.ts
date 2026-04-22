/**
 * Claude.ai sync script — runs in the ISOLATED world.
 *
 * Listens for CustomEvents dispatched by the fetch interceptor
 * and syncs conversation data to Council's backend.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  model?: string;
  chat_messages?: ClaudeChatMessage[];
  [key: string]: unknown;
}

interface ClaudeChatMessage {
  uuid: string;
  text: string;
  sender: 'human' | 'assistant';
  created_at: string;
  updated_at: string;
  attachments?: unknown[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cache to avoid re-syncing unchanged conversations */
const syncCache = new Map<string, string>(); // uuid -> updated_at

function getSettings(): { syncHistoryResponses: boolean } {
  // Read from chrome.storage.local (set by Council web app)
  return { syncHistoryResponses: true }; // default to true
}

// ---------------------------------------------------------------------------
// Data mappers: Claude format -> Council format
// ---------------------------------------------------------------------------

function mapConversation(conv: ClaudeConversation) {
  return {
    conversation_id: conv.uuid,
    title: conv.name || 'Untitled',
    create_time: new Date(conv.created_at).getTime() / 1000,
    update_time: new Date(conv.updated_at).getTime() / 1000,
    source: 'claude',
    source_id: conv.uuid,
    source_url: `https://claude.ai/chat/${conv.uuid}`,
    gizmo_id: null,
    has_attachments: conv.chat_messages?.some((m) => m.attachments?.length) ?? false,
  };
}

function mapMessage(msg: ClaudeChatMessage, conversationId: string) {
  return {
    messageId: msg.uuid,
    conversationId,
    role: msg.sender === 'human' ? 'user' : 'assistant',
    content: [{ type: 'text', text: msg.text }],
    provider: msg.sender === 'assistant' ? 'anthropic' : null,
    model: null, // Claude doesn't expose model per-message in the API
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Sync functions
// ---------------------------------------------------------------------------

function safeSendMessage(msg: unknown): void {
  try {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage(msg);
    }
  } catch {
    // Extension context invalidated — ignore
  }
}

async function syncConversationList(conversations: ClaudeConversation[]) {
  const settings = getSettings();
  if (!settings.syncHistoryResponses) return;

  // Filter to only new/updated conversations
  const toSync = conversations.filter((conv) => {
    const cached = syncCache.get(conv.uuid);
    if (cached === conv.updated_at) return false;
    syncCache.set(conv.uuid, conv.updated_at);
    return true;
  });

  if (toSync.length === 0) return;

  const mapped = toSync.map(mapConversation);

  safeSendMessage({
    type: 'addConversations',
    detail: { conversations: mapped },
  });

  console.log(`[Council] Synced ${mapped.length} Claude conversations`);
}

async function syncConversationMessages(conversationId: string, messages: ClaudeChatMessage[]) {
  if (!messages?.length) return;

  const mapped = messages.map((m) => mapMessage(m, conversationId));

  // Send messages to Council backend via background script
  safeSendMessage({
    type: 'syncClaudeMessages',
    detail: { conversationId, messages: mapped },
  });

  console.log(`[Council] Synced ${mapped.length} messages for Claude conversation ${conversationId.slice(0, 8)}...`);
}

interface Artifact {
  id: string;
  type: string;
  title: string;
  language?: string;
  content: string;
}

async function syncCompletion(data: {
  conversationId: string;
  messageId: string;
  model: string;
  text: string;
  artifacts?: Artifact[];
}) {
  // Build content blocks — parse artifacts from text
  const contentBlocks: Array<Record<string, unknown>> = [];
  const artifacts = data.artifacts ?? [];

  if (artifacts.length > 0) {
    // Split text around artifacts and interleave
    let remainingText = data.text;
    for (const artifact of artifacts) {
      const artifactTag = `<antArtifact`;
      const idx = remainingText.indexOf(artifactTag);
      if (idx > 0) {
        const before = remainingText.slice(0, idx).trim();
        if (before) contentBlocks.push({ type: 'text', text: before });
      }
      contentBlocks.push({
        type: 'artifact',
        artifact_id: artifact.id,
        artifact_type: artifact.type,
        title: artifact.title,
        language: artifact.language ?? null,
        text: artifact.content,
      });
      // Skip past this artifact in the remaining text
      const closeTag = '</antArtifact>';
      const closeIdx = remainingText.indexOf(closeTag);
      if (closeIdx >= 0) {
        remainingText = remainingText.slice(closeIdx + closeTag.length);
      }
    }
    const trailing = remainingText.trim();
    if (trailing) contentBlocks.push({ type: 'text', text: trailing });
  } else {
    contentBlocks.push({ type: 'text', text: data.text });
  }

  safeSendMessage({
    type: 'syncClaudeMessages',
    detail: {
      conversationId: data.conversationId,
      messages: [
        {
          messageId: data.messageId,
          conversationId: data.conversationId,
          role: 'assistant',
          content: contentBlocks,
          provider: 'anthropic',
          model: data.model,
          metadata: {},
        },
      ],
    },
  });

  // Send artifacts to the artifacts API
  if (artifacts.length > 0) {
    safeSendMessage({
      type: 'syncArtifacts',
      detail: {
        artifacts: artifacts.map((a) => ({
          conversation_id: data.conversationId,
          message_id: data.messageId,
          artifact_id: a.id,
          source: 'claude',
          type: a.type,
          title: a.title,
          language: a.language,
          content: a.content,
        })),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

window.addEventListener('council:claude:conversations', ((e: CustomEvent) => {
  const data = e.detail;
  if (Array.isArray(data)) {
    syncConversationList(data);
  } else if (data?.results) {
    // Some endpoints return { results: [...] }
    syncConversationList(data.results);
  }
}) as EventListener);

window.addEventListener('council:claude:conversation', ((e: CustomEvent) => {
  const conv = e.detail as ClaudeConversation;
  if (conv?.uuid) {
    syncConversationList([conv]);
    if (conv.chat_messages?.length) {
      syncConversationMessages(conv.uuid, conv.chat_messages);
    }
  }
}) as EventListener);

window.addEventListener('council:claude:messages', ((e: CustomEvent) => {
  const { conversationId, messages } = e.detail;
  if (conversationId && messages) {
    const msgs = Array.isArray(messages) ? messages : (messages?.results ?? []);
    syncConversationMessages(conversationId, msgs);
  }
}) as EventListener);

window.addEventListener('council:claude:completion', ((e: CustomEvent) => {
  syncCompletion(e.detail);
}) as EventListener);

console.log('[Council] Claude sync script active');
