/**
 * Markdown rendering utilities.
 *
 * Wraps markdown-it with the plugins used by the extension:
 *   - highlight.js for code syntax highlighting
 *   - KaTeX / texmath for LaTeX math rendering
 *   - markdownit-sup for superscript
 *   - Custom renderer rules for code blocks (copy button, language label)
 *   - Custom link renderer (open in new tab)
 *
 * Also provides message parsing helpers used by the export and minimap features.
 *
 * Original source: content.isolated.end.js lines 5186-5202, 10555-10593
 */

import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import markdownitSup from 'markdown-it-sup';

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

/** Languages that can contain raw HTML-like syntax and must be sanitised. */
const UNSAFE_LANGS = ['vue', 'liquid', 'razor'];

function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Copy-code button SVG constants
// ---------------------------------------------------------------------------

const COPY_ICON_SVG =
  '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>';

const COPIED_ICON_SVG =
  '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg>';

// ---------------------------------------------------------------------------
// Markdown-it factory
// ---------------------------------------------------------------------------

/**
 * Create a configured markdown-it instance.
 *
 * The `role` parameter controls whether raw HTML is allowed
 * (assistant messages allow HTML, user messages do not).
 *
 * Original: `markdown` factory (line 5187)
 */
function createMarkdownInstance(role: 'assistant' | 'user'): MarkdownIt {
  const md = new MarkdownIt({
    html: role === 'assistant',
    linkify: true,
    highlight(str: string, lang: string): string {
      let language: string;
      let value: string;

      if (lang && hljs.getLanguage(lang)) {
        const result = hljs.highlight(str, { language: lang });
        language = result.language ?? lang;
        value = result.value;
      } else {
        language = lang;
        value = UNSAFE_LANGS.includes(lang) || str.includes('</') ? sanitizeHtml(str) : str;
      }

      return `<pre dir="ltr" class="w-full"><div class="dark bg-black mb-4 rounded-md"><div id='code-header' class="flex select-none items-center relative text-token-text-tertiary bg-token-sidebar-surface-primary px-4 py-2 text-xs font-sans rounded-t-md" style='border-top-left-radius:6px;border-top-right-radius:6px;'><span class="">${language}</span><button id='copy-code' data-initialized="false" class="flex ms-auto gap-2 text-token-text-tertiary hover:text-token-text-primary">${COPY_ICON_SVG}Copy code</button></div><div class="p-4 overflow-y-auto"><code id="code-content" class="!whitespace-pre hljs language-${language}">${value}</code></div></div></pre>`;
    },
  });

  md.use(markdownitSup);
  md.use(texmath, {
    engine: katex,
    delimiters: ['dollars', 'brackets'],
    katexOptions: {
      macros: { '\\RR': '\\mathbb{R}' },
    },
  });

  return md;
}

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

let assistantMd: MarkdownIt | null = null;
let userMd: MarkdownIt | null = null;

function getAssistantMd(): MarkdownIt {
  if (!assistantMd) assistantMd = createMarkdownInstance('assistant');
  return assistantMd;
}

function getUserMd(): MarkdownIt {
  if (!userMd) userMd = createMarkdownInstance('user');
  return userMd;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a markdown string to HTML.
 *
 * @param source  The markdown source text.
 * @param role    Message author role. Controls whether raw HTML is allowed.
 */
export function renderMarkdown(source: string, role: 'assistant' | 'user' = 'assistant'): string {
  const md = role === 'assistant' ? getAssistantMd() : getUserMd();
  return md.render(source);
}

/**
 * Add click-to-copy event listeners to all copy-code buttons that haven't
 * been initialised yet.
 *
 * Original: `addCopyCodeButtonsEventListeners` (line 22732)
 */
export function addCopyCodeButtonsEventListeners(): void {
  document.querySelectorAll<HTMLButtonElement>('[id="copy-code"][data-initialized="false"]').forEach((btn) => {
    const clone = btn.cloneNode(true) as HTMLButtonElement;
    clone.dataset.initialized = 'true';
    btn.parentNode?.replaceChild(clone, btn);

    clone.addEventListener('click', () => {
      const codeEl = clone.closest('pre')?.querySelector('code');
      if (!codeEl) return;
      navigator.clipboard.writeText(codeEl.innerText);
      clone.innerHTML = `${COPIED_ICON_SVG}Copied!`;
      setTimeout(() => {
        clone.innerHTML = `${COPY_ICON_SVG}Copy code`;
      }, 1500);
    });
  });
}

// ---------------------------------------------------------------------------
// Message parsing helpers
// ---------------------------------------------------------------------------

/** A node in ChatGPT's conversation mapping. */
interface ConversationNode {
  id?: string;
  parent?: string;
  children?: string[];
  message?: {
    id?: string;
    role?: string;
    author?: { role?: string };
    status?: string;
    content?: {
      parts?: (string | Record<string, unknown>)[];
      text?: string;
      content_type?: string;
    };
    metadata?: {
      citations?: unknown[];
      finish_details?: { type?: string };
      [key: string]: unknown;
    };
    create_time?: number;
    [key: string]: unknown;
  };
}

interface ConversationData {
  title?: string;
  mapping: Record<string, ConversationNode>;
  [key: string]: unknown;
}

/**
 * Parse a message node's content parts into a single text string.
 *
 * Original: part of `assistantContentGenerator` (line 10563)
 */
export function parseMessage(
  message: { content?: { parts?: (string | Record<string, unknown>)[]; text?: string } } | undefined,
): string {
  if (!message?.content) return '';

  const parts = message.content.parts ?? [];
  const textParts = parts.filter((part): part is string => typeof part === 'string');
  if (message.content.text) textParts.push(message.content.text);

  return textParts.join('\n');
}

/**
 * Remove system messages from a conversation mapping.
 *
 * Re-links parent/child references so the tree remains valid after
 * removing system nodes.
 *
 * Original: `removeSystemMessages` (line 22716)
 */
export function removeSystemMessages(conversation: ConversationData): ConversationData {
  if (!conversation) return conversation;
  const clone = structuredClone(conversation);

  Object.keys(clone.mapping).forEach((nodeId) => {
    const node = clone.mapping[nodeId];
    if (!node) return;

    const role = node.message?.role || node.message?.author?.role;
    if (role !== 'system') return;

    const parentId = node.parent;
    const childIds = node.children ?? [];

    if (parentId) {
      const parent = clone.mapping[parentId];
      if (parent) {
        parent.children = (parent.children ?? []).filter((id) => id !== nodeId);
        parent.children.push(...childIds);
      }
    }

    if (childIds.length > 0) {
      const firstChild = clone.mapping[childIds[0]!];
      if (firstChild && parentId) {
        firstChild.parent = parentId;
      }
    }
  });

  return clone;
}

/**
 * Get the conversation title from the sidebar nav link or cache.
 *
 * Original: `getConversationName` (line 6127)
 */
export function getConversationName(conversationId: string | null = null): string {
  if (!conversationId) {
    const match = window.location.href.match(/\/c\/(.*?)(\/|\?|#|$)/);
    if (!match || !match[1] || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match[1])) {
      return 'New chat';
    }
    conversationId = match[1];
  }

  const navLink = document.querySelector<HTMLElement>(`nav a[href$="/c/${conversationId}"]`);
  if (navLink) return navLink.textContent ?? 'New chat';

  return 'New chat';
}

/**
 * Count characters in a string.
 *
 * Original: `getCharCount` (line 5367)
 */
export function getCharCount(text: string | null | undefined): number {
  return text?.length ?? 0;
}

/**
 * Count words in a string by splitting on whitespace.
 *
 * Original: `getWordCount` (line 5371)
 */
export function getWordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.split(/[\s\n]+/).length;
}
