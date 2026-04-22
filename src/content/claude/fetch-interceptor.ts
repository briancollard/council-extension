/**
 * Claude.ai fetch interceptor — runs in the MAIN world.
 *
 * Intercepts Claude's API calls and dispatches CustomEvents
 * so the sync script can capture conversation data.
 *
 * Wrapped in IIFE to avoid global scope conflicts with other interceptors.
 *
 * Claude API endpoints:
 *   GET  /api/organizations/{orgId}/chat_conversations          — list conversations
 *   GET  /api/organizations/{orgId}/chat_conversations/{uuid}   — single conversation
 *   POST /api/organizations/{orgId}/chat_conversations/{uuid}/completion — stream response
 *   GET  /api/organizations/{orgId}/chat_conversations/{uuid}/chat_messages — messages
 */

export {};

const claudeOriginalFetch: typeof window.fetch = window.fetch;

// Claude API path patterns
const CLAUDE_API_PATTERNS = ['/api/organizations/'];

function isClaudeApi(url: string): boolean {
  return CLAUDE_API_PATTERNS.some((p) => url.includes(p));
}

function dispatch(eventName: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const [input, init] = args;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

  if (!isClaudeApi(url)) {
    return claudeOriginalFetch.apply(window, args);
  }

  const method = init?.method?.toUpperCase() ?? 'GET';

  // Log all Claude API calls to debug
  if (method === 'POST') {
    console.log(`[Council] Claude API POST: ${url.split('?')[0]}`);
  }

  const response = await claudeOriginalFetch.apply(window, args);

  // Clone response so we can read the body without consuming it
  const clone = response.clone();

  // Process asynchronously to not block the fetch
  (async () => {
    try {
      const contentType = clone.headers.get('content-type') ?? '';

      // Conversation list
      if (
        url.includes('/chat_conversations') &&
        !url.includes('/completion') &&
        !url.includes('/chat_messages') &&
        method === 'GET'
      ) {
        // Check if this is a list (no UUID at end) or a single conversation
        const parts = url.split('/chat_conversations');
        const after = parts[1] ?? '';

        if (!after || after === '/' || after.startsWith('?')) {
          // List of conversations
          if (contentType.includes('application/json')) {
            const data = await clone.json();
            dispatch('council:claude:conversations', data);
          }
        } else {
          // Single conversation (has UUID after /chat_conversations/)
          if (contentType.includes('application/json')) {
            const data = await clone.json();
            dispatch('council:claude:conversation', data);
          }
        }
      }

      // Chat messages for a conversation
      if (url.includes('/chat_messages') && method === 'GET') {
        if (contentType.includes('application/json')) {
          const data = await clone.json();
          // Extract conversation UUID from URL
          const match = url.match(/chat_conversations\/([a-f0-9-]+)\//);
          const conversationId = match?.[1] ?? '';
          dispatch('council:claude:messages', { conversationId, messages: data });
        }
      }

      // Streaming completion — capture the assistant's response
      if (url.includes('/completion') && method === 'POST') {
        const urlMatch = url.match(/chat_conversations\/([a-f0-9-]+)\//);
        const conversationId = urlMatch?.[1] ?? '';
        // Capture streaming completion response for artifact extraction

        // SSE stream — read chunks
        const reader = clone.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let fullText = '';
          let model = '';
          let messageId = '';

          // Track content blocks for artifact extraction
          interface ContentBlock {
            type: string;
            id?: string;
            name?: string;
            input?: string;
            text?: string;
          }
          const contentBlocks: ContentBlock[] = [];
          let currentBlock: ContentBlock | null = null;
          let currentInput = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'message_start') {
                  model = parsed.message?.model ?? '';
                  messageId = parsed.message?.id ?? '';
                }

                if (parsed.type === 'content_block_start') {
                  const block = parsed.content_block;
                  currentBlock = {
                    type: block?.type ?? 'text',
                    id: block?.id,
                    name: block?.name,
                  };
                  currentInput = '';
                }

                if (parsed.type === 'content_block_delta') {
                  if (parsed.delta?.text) {
                    fullText += parsed.delta.text;
                    currentInput += parsed.delta.text;
                  }
                  // Tool use input comes as partial_json
                  if (parsed.delta?.partial_json) {
                    currentInput += parsed.delta.partial_json;
                  }
                }

                if (parsed.type === 'content_block_stop' && currentBlock) {
                  if (currentBlock.type === 'text') {
                    currentBlock.text = currentInput;
                  } else if (currentBlock.type === 'tool_use') {
                    currentBlock.input = currentInput;
                  } else if (currentBlock.type === 'tool_result') {
                    currentBlock.text = currentInput;
                  }
                  contentBlocks.push(currentBlock);
                  currentBlock = null;
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }

          // Extract artifacts from tool_use blocks
          const artifacts: Array<{ id: string; type: string; title: string; language?: string; content: string }> = [];
          for (const block of contentBlocks) {
            if (block.type === 'tool_use') {
              if (block.input) {
                try {
                  const input = JSON.parse(block.input);
                  // Artifact tool calls: create_file uses file_text, others use content/code
                  const artifactContent = input.content ?? input.code ?? input.file_content ?? input.file_text;
                  if (artifactContent) {
                    const ext = input.path?.split('.').pop();
                    const langFromExt =
                      ext === 'py'
                        ? 'python'
                        : ext === 'js'
                          ? 'javascript'
                          : ext === 'ts'
                            ? 'typescript'
                            : ext === 'html'
                              ? 'html'
                              : ext === 'css'
                                ? 'css'
                                : ext;
                    artifacts.push({
                      id: block.id ?? block.name ?? '',
                      type: input.type ?? langFromExt ?? 'text',
                      title:
                        input.title ?? input.description ?? input.path?.split('/').pop() ?? block.name ?? 'Artifact',
                      language: input.language ?? langFromExt,
                      content: artifactContent,
                    });
                  }
                } catch {
                  // Input wasn't valid JSON
                }
              }
            }
          }

          if (fullText || artifacts.length > 0) {
            if (artifacts.length > 0) console.log(`[Council] Claude: captured ${artifacts.length} artifacts`);
            dispatch('council:claude:completion', {
              conversationId,
              messageId,
              model,
              text: fullText,
              artifacts,
            });
          }
        }
      }
    } catch {
      // Don't crash the page if our interception fails
    }
  })();

  return response;
};

console.log('[Council] Claude fetch interceptor active');
