/**
 * Gemini fetch interceptor — runs in the MAIN world.
 *
 * Intercepts Google Gemini's API calls and dispatches CustomEvents.
 *
 * Gemini API endpoints:
 *   POST /api/generate     — streaming completion
 *   GET  /_/BardChatUi/*   — conversation data (legacy Bard endpoints)
 *   Various batch RPC endpoints for conversation CRUD
 *
 * Gemini uses a mix of REST and batch RPC calls. The main data flows through
 * StreamGenerate and batch endpoints. We capture what we can from the
 * network responses.
 */

export {};

const geminiOriginalFetch: typeof window.fetch = window.fetch;

const GEMINI_API_PATTERNS = [
  'generativelanguage.googleapis.com',
  'alkalimakersuite-pa.clients6.google.com',
  'BardChatUi',
  'StreamGenerate',
  'ReqId',
];

function isGeminiApi(url: string): boolean {
  return GEMINI_API_PATTERNS.some((p) => url.includes(p));
}

function dispatch(eventName: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const [input, init] = args;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

  if (!isGeminiApi(url)) {
    return geminiOriginalFetch.apply(window, args);
  }

  const response = await geminiOriginalFetch.apply(window, args);
  const clone = response.clone();

  (async () => {
    try {
      const contentType = clone.headers.get('content-type') ?? '';

      // JSON responses — conversation list or single conversation data
      if (contentType.includes('application/json')) {
        const data = await clone.json();
        dispatch('council:gemini:response', { url, data });
      }

      // Streaming responses — capture text content
      if (
        contentType.includes('text/event-stream') ||
        contentType.includes('application/x-ndjson') ||
        url.includes('StreamGenerate')
      ) {
        const reader = clone.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let fullText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });

            // Try to extract text from various Gemini response formats
            try {
              // Gemini sometimes returns JSON arrays or newline-delimited JSON
              const lines = chunk.split('\n').filter(Boolean);
              for (const line of lines) {
                try {
                  const parsed = JSON.parse(line);
                  // Extract text from nested response structure
                  const text = extractTextFromGeminiResponse(parsed);
                  if (text) fullText += text;
                } catch {
                  // Not JSON — might be raw text
                }
              }
            } catch {
              // Skip unparseable chunks
            }
          }

          if (fullText) {
            dispatch('council:gemini:completion', { url, text: fullText });
          }
        }
      }
    } catch {
      // Don't crash the page
    }
  })();

  return response;
};

/**
 * Extract text content from Gemini's nested response structure.
 * Gemini uses several formats — this handles the common ones.
 */
function extractTextFromGeminiResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return '';

  const obj = data as Record<string, unknown>;

  // Format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  if (Array.isArray(obj.candidates)) {
    return obj.candidates.map((c: any) => c?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '').join('');
  }

  // Format: [["...", null, null, [["text content"]]]]
  if (Array.isArray(data)) {
    return extractFromNestedArray(data);
  }

  // Format: { text: "..." }
  if (typeof obj.text === 'string') return obj.text;

  return '';
}

function extractFromNestedArray(arr: unknown[]): string {
  let text = '';
  for (const item of arr) {
    if (typeof item === 'string' && item.length > 10) {
      text += item;
    } else if (Array.isArray(item)) {
      text += extractFromNestedArray(item);
    }
  }
  return text;
}

console.log('[Council] Gemini fetch interceptor active');
