/**
 * Conversation message rendering — user and assistant message HTML generators.
 *
 * Used by the conversation preview dialog and export features to render
 * conversation messages outside of ChatGPT's native React components.
 *
 * Includes:
 *   - rowAssistant(): Full assistant message row with avatar, content,
 *     thread nav, word count, timestamps, plugin/DALL-E rendering
 *   - rowUser(): Full user message row with attachments, reply-to,
 *     language/tone/style indicators, thread nav
 *   - assistantRenderer(): Markdown-rendered assistant content
 *   - assistantContentGenerator(): Raw content extraction + markdown render
 *   - replaceCitations(): Citation link replacement in assistant text
 *   - Asset rendering (images, documents, spreadsheets, code files)
 *
 * Original source: content.isolated.end.js lines 9977-10681
 */

import { cachedSettings } from '../isolated-world/settings';
import { renderMarkdown } from '../isolated-world/ui/markdown';
import {
  pluginDropdownRenderer,
  pythonImageSkeleton,
  actionConfirmationRenderer,
  strawberryDropdownRenderer,
} from './dalle-plugins';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageNode {
  message?: {
    id?: string;
    role?: string;
    status?: string;
    content?: {
      content_type?: string;
      parts?: any[];
      text?: string;
    };
    recipient?: string;
    author?: { role?: string; name?: string };
    metadata?: Record<string, unknown>;
    create_time?: number | string;
  };
  parent?: string;
  children?: string[];
  pinned?: boolean;
}

interface ConversationMapping {
  [nodeId: string]: MessageNode;
}

interface Conversation {
  conversation_id: string;
  mapping: ConversationMapping;
}

interface ModelInfo {
  slug: string;
  title: string;
}

interface GizmoInfo {
  resource?: {
    gizmo?: {
      id?: string;
      display?: {
        name?: string;
        profile_picture_url?: string;
      };
    };
  };
}

interface Attachment {
  id: string;
  name: string;
  width?: number;
  height?: number;
}

interface CitationMetadata {
  type?: string;
  url?: string;
  title?: string;
  extra?: {
    cited_message_idx?: number;
    evidence_text?: string;
  };
}

interface Citation {
  metadata: CitationMetadata;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(time: unknown): number {
  if (!time) return 0;
  const s = String(time);
  if (s.indexOf('T') !== -1) return new Date(s).getTime();
  if (s.length === 13) return new Date(Number(time)).getTime();
  if (s.length === 10) return new Date(Number(time) * 1000).getTime();
  return Number(time);
}

export function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFileType(filename?: string): string {
  switch (filename?.split('.').pop()?.toLowerCase()) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return 'Image';
    case 'pdf':
      return 'PDF';
    case 'doc':
    case 'docx':
    case 'txt':
      return 'Document';
    case 'csv':
    case 'xls':
    case 'xlsx':
      return 'Spreadsheet';
    case 'js':
      return 'JavaScript';
    case 'py':
      return 'Python';
    default:
      return 'File';
  }
}

function isImageGeneratorTool(name?: string): boolean {
  return name === 'dalle.text2im' || name === 't2uay3k.sj1i4kz';
}

// ---------------------------------------------------------------------------
// Citation replacement
// ---------------------------------------------------------------------------

/**
 * Replace citation markers (e.g. 【4†source】) with clickable links.
 *
 * Original: content.isolated.end.js lines 10528-10553
 */
export function replaceCitations(
  text: string,
  citations?: Citation[],
  format: 'html' | 'markdown' | 'text' = 'html',
): string {
  if (!citations?.length || !text) return text;

  const reversed = [...citations].reverse();
  for (const citation of reversed) {
    const meta = citation.metadata;
    const idx = meta?.extra?.cited_message_idx;
    const evidence = meta?.extra?.evidence_text;
    if (!meta) continue;

    let replacement = '';
    if (meta.type === 'webpage') {
      const { url, title } = meta;
      if (!url || !title || url.startsWith('file://')) continue;

      if (format === 'html') {
        replacement = `<span id="citation">[<a href="${url}" title="${title}" target="_blank" rel="noopener">${title}</a>]</span>`;
      } else if (format === 'markdown') {
        replacement = ` [${title}](${url})`;
      } else {
        replacement = ` ${title} (${url})`;
      }
    }

    // Replace 【idx†evidence】 pattern
    const pattern = new RegExp(`\u3010${idx}.*?${evidence}\u3011`, 'g');
    text = text.replace(pattern, replacement);
  }

  return text;
}

// ---------------------------------------------------------------------------
// Assistant content rendering
// ---------------------------------------------------------------------------

/**
 * Generate rendered HTML for an assistant message's text content.
 * Applies markdown rendering, citation replacement, and math (KaTeX) rendering.
 *
 * Original: content.isolated.end.js lines 10555-10593
 */
export function assistantContentGenerator(
  node: MessageNode,
  countWords = true,
): { assistantMessageHTML: string; wordCount?: number; charCount?: number } {
  const message = node.message;

  // Show continue button for partial completions
  if (
    message?.status === 'finished_partial_completion' ||
    (message?.metadata as any)?.finish_details?.type === 'max_tokens'
  ) {
    const continueBtn = [...document.querySelectorAll('[id^="message-continue-button-"]')].pop();
    continueBtn?.classList.add('group-[.final-completion]:visible');
  }

  let text = (message?.content?.parts ?? []).filter((p): p is string => typeof p === 'string').join('\n');

  const citations = (message?.metadata as Record<string, unknown>)?.citations as Citation[];
  text = replaceCitations(text, citations, 'html');

  // Fix LaTeX display math delimiter
  text = text.replace(/\\{1}\[/g, '\n\\[');

  const rendered = renderMarkdown(text, 'assistant');

  if (countWords) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rendered;
    const plainText = tempDiv.innerText;
    const wordCount = plainText.split(/\s+/).filter((w) => w !== '').length;
    const charCount = plainText.replace(/\n/g, '').length;
    return { assistantMessageHTML: rendered, wordCount, charCount };
  }

  return { assistantMessageHTML: rendered };
}

/**
 * Wrap assistant content in the standard message container HTML.
 *
 * Original: content.isolated.end.js lines 10505-10526
 */
export function assistantRenderer(
  node: MessageNode,
  isStreaming = false,
): { renderedNode: string; wordCount: number; charCount: number } {
  const msgId = node.message?.id;
  const { assistantMessageHTML, wordCount = 0, charCount = 0 } = assistantContentGenerator(node, true);

  if (!assistantMessageHTML) {
    return { renderedNode: '', wordCount: 0, charCount: 0 };
  }

  return {
    renderedNode:
      `<div dir="auto" class="min-h-[20px] overflow-x-auto flex flex-col items-start whitespace-pre-wrap gap-4 break-words">` +
      `<div id="message-text-${msgId}" data-message-id="${msgId}" class="${isStreaming ? 'result-streaming' : ''} markdown prose w-full flex flex-col break-words dark:prose-invert">` +
      assistantMessageHTML +
      `</div></div>`,
    wordCount,
    charCount,
  };
}

// ---------------------------------------------------------------------------
// Assistant message row
// ---------------------------------------------------------------------------

/**
 * Render a full assistant message article row for the conversation preview.
 *
 * Original: content.isolated.end.js lines 9977-10061
 */
export function rowAssistant(
  conversation: Conversation,
  thread: MessageNode[],
  threadIndex: number,
  threadCount: number,
  models: ModelInfo[],
  gizmo: GizmoInfo | null,
  isStreaming = false,
  isStreamingContent = false,
): string {
  const { customConversationWidth, conversationWidth, showMessageTimestamp, showMessageCharWordCount } = cachedSettings;

  const lastNode = thread[thread.length - 1]!;
  const { pinned, message } = lastNode;
  if (!message) return '';

  const { id: msgId, metadata } = message;
  let createTime = message.create_time;
  if (!createTime) createTime = new Date().toISOString();

  const modelSlug = (metadata as Record<string, unknown>)?.model_slug as string;
  const timeStr = new Date(formatTime(createTime)).toLocaleString();
  const modelList = Array.isArray(models) ? models : ((models as any)?.models ?? []);
  const modelTitle = modelList.find((m: ModelInfo) => m.slug === modelSlug)?.title;

  // Gizmo (GPT) avatar
  const gizmoId = (thread[0]?.message?.metadata as Record<string, unknown>)?.gizmo_id as string;
  const gizmoMatch = gizmo?.resource?.gizmo?.id === gizmoId;
  const avatarUrl = gizmoMatch ? (gizmo?.resource?.gizmo?.display?.profile_picture_url ?? '') : '';
  const gizmoName = gizmoMatch ? (gizmo?.resource?.gizmo?.display?.name ?? '') : '';

  // Build content from thread messages
  let contentHtml = '';
  let totalWordCount = 0;
  let totalCharCount = 0;

  for (const node of thread) {
    const role = node.message?.role ?? node.message?.author?.role;
    const recipient = node.message?.recipient;

    if (role === 'assistant') {
      if (node.message?.content?.content_type === 'model_editable_context') continue;
      if (recipient === 'all') {
        const { renderedNode, wordCount, charCount } = assistantRenderer(node, isStreamingContent);
        contentHtml += renderedNode;
        totalWordCount += wordCount;
        totalCharCount += charCount;
      } else {
        contentHtml += pluginDropdownRenderer(node, isStreaming, false);
      }
    } else if (recipient === 'all') {
      const isPlugin =
        'invoked_plugin' in ((node.message?.metadata as Record<string, unknown>) ?? {}) ||
        node.message?.author?.name === 'python';
      const isStrawberry = node.message?.author?.name === 'a8km123';
      const hasImage = ((node.message?.content?.text ?? '') as string).includes('<<ImageDisplayed>>');

      if (isPlugin) {
        if (hasImage) {
          contentHtml += pythonImageSkeleton(node);
        } else {
          // Append plugin content to the last plugin dropdown
          const temp = document.createElement('div');
          temp.innerHTML = contentHtml;
          const lastContent = [...temp.querySelectorAll('[id^=message-plugin-content-]')].pop();
          if (lastContent) {
            const { pluginContentRenderer } = require('./dalle-plugins');
            lastContent.insertAdjacentHTML('beforeend', pluginContentRenderer(node));
            contentHtml = temp.innerHTML;
          }
        }
      } else if (isStrawberry) {
        contentHtml += strawberryDropdownRenderer(node);
      }
    } else if (recipient === 'assistant') {
      const childIdx = threadIndex - 1;
      const childNode = conversation.mapping[node.children?.[childIdx] ?? ''];
      contentHtml += actionConfirmationRenderer(node, childNode, gizmoName);
    }
  }

  // Avatar HTML
  const avatarHtml = avatarUrl
    ? `<div class="gizmo-shadow-stroke relative flex h-8 w-8"><img id="gizmo-avatar" data-gizmoid="${gizmoId}" src="${avatarUrl}" class="h-full w-full bg-token-main-surface-tertiary rounded-full" alt="GPT" width="80" height="80"></div>`
    : `<div class="gizmo-bot-avatar flex h-8 w-8 items-center justify-center overflow-hidden rounded-full"><div style="width:24px;height:24px;" title="${modelTitle ?? ''}" class="relative p-1 rounded-sm flex items-center justify-center bg-token-main-surface-primary text-token-text-primary h-8 w-8"><svg width="41" height="41" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md" role="img"><text x="-9999" y="-9999">ChatGPT</text><path d="M37.5324 16.8707C37.9808 15.5241 38.1363 14.0974 37.9886 12.6859C37.8409 11.2744 37.3934 9.91076 36.676 8.68622C35.6126 6.83404 33.9882 5.3676 32.0373 4.4985C30.0864 3.62941 27.9098 3.40259 25.8215 3.85078C24.8796 2.7893 23.7219 1.94125 22.4257 1.36341C21.1295 0.785575 19.7249 0.491269 18.3058 0.500197C16.1708 0.495044 14.0893 1.16803 12.3614 2.42214C10.6335 3.67624 9.34853 5.44666 8.6917 7.47815C7.30085 7.76286 5.98686 8.3414 4.8377 9.17505C3.68854 10.0087 2.73073 11.0782 2.02839 12.312C0.956464 14.1591 0.498905 16.2988 0.721698 18.4228C0.944492 20.5467 1.83612 22.5449 3.268 24.1293C2.81966 25.4759 2.66413 26.9026 2.81182 28.3141C2.95951 29.7256 3.40701 31.0892 4.12437 32.3138C5.18791 34.1659 6.8123 35.6322 8.76321 36.5013C10.7141 37.3704 12.8907 37.5973 14.9789 37.1492C15.9208 38.2107 17.0786 39.0587 18.3747 39.6366C19.6709 40.2144 21.0755 40.5087 22.4946 40.4998C24.6307 40.5054 26.7133 39.8321 28.4418 38.5772C30.1704 37.3223 31.4556 35.5506 32.1119 33.5179C33.5027 33.2332 34.8167 32.6547 35.9659 31.821C37.115 30.9874 38.0728 29.9178 38.7752 28.684C39.8458 26.8371 40.3023 24.6979 40.0789 22.5748C39.8556 20.4517 38.9639 18.4544 37.5324 16.8707ZM22.4978 37.8849C20.7443 37.8874 19.0459 37.2733 17.6994 36.1501C17.7601 36.117 17.8666 36.0586 17.936 36.0161L25.9004 31.4156C26.1003 31.3019 26.2663 31.137 26.3813 30.9378C26.4964 30.7386 26.5563 30.5124 26.5549 30.2825V19.0542L29.9213 20.998C29.9389 21.0068 29.9541 21.0198 29.9656 21.0359C29.977 21.052 29.9842 21.0707 29.9867 21.0902V30.3889C29.9842 32.375 29.1946 34.2791 27.7909 35.6841C26.3872 37.0892 24.4838 37.8806 22.4978 37.8849ZM6.39227 31.0064C5.51397 29.4888 5.19742 27.7107 5.49804 25.9832C5.55718 26.0187 5.66048 26.0818 5.73461 26.1244L13.699 30.7248C13.8975 30.8408 14.1233 30.902 14.3532 30.902C14.583 30.902 14.8088 30.8408 15.0073 30.7248L24.731 25.1103V28.9979C24.7321 29.0177 24.7283 29.0376 24.7199 29.0556C24.7115 29.0736 24.6988 29.0893 24.6829 29.1012L16.6317 33.7497C14.9096 34.7416 12.8643 35.0097 10.9447 34.4954C9.02506 33.9811 7.38785 32.7263 6.39227 31.0064ZM4.29707 13.6194C5.17156 12.0998 6.55279 10.9364 8.19885 10.3327C8.19885 10.4013 8.19491 10.5228 8.19491 10.6071V19.808C8.19351 20.0378 8.25334 20.2638 8.36823 20.4629C8.48312 20.6619 8.64893 20.8267 8.84863 20.9404L18.5723 26.5542L15.206 28.4979C15.1894 28.5089 15.1703 28.5155 15.1505 28.5173C15.1307 28.5191 15.1107 28.516 15.0924 28.5082L7.04046 23.8557C5.32135 22.8601 4.06716 21.2235 3.55289 19.3046C3.03862 17.3858 3.30624 15.3413 4.29707 13.6194ZM31.955 20.0556L22.2312 14.4411L25.5976 12.4981C25.6142 12.4872 25.6333 12.4805 25.6531 12.4787C25.6729 12.4769 25.6928 12.4801 25.7111 12.4879L33.7631 17.1364C34.9967 17.849 36.0017 18.8982 36.6606 20.1613C37.3194 21.4244 37.6047 22.849 37.4832 24.2684C37.3617 25.6878 36.8382 27.0432 35.9743 28.1759C35.1103 29.3086 33.9415 30.1717 32.6047 30.6641C32.6047 30.5947 32.6047 30.4733 32.6047 30.3889V21.188C32.6066 20.9586 32.5474 20.7328 32.4332 20.5338C32.319 20.3348 32.154 20.1698 31.955 20.0556ZM35.3055 15.0128C35.2464 14.9765 35.1431 14.9142 35.069 14.8717L27.1045 10.2712C26.906 10.1554 26.6803 10.0943 26.4504 10.0943C26.2206 10.0943 25.9948 10.1554 25.7963 10.2712L16.0726 15.8858V11.9982C16.0715 11.9783 16.0753 11.9585 16.0837 11.9405C16.0921 11.9225 16.1048 11.9068 16.1207 11.8949L24.1719 7.25025C25.4053 6.53903 26.8158 6.19376 28.2383 6.25482C29.6608 6.31589 31.0364 6.78077 32.2044 7.59508C33.3723 8.40939 34.2842 9.53945 34.8334 10.8531C35.3826 12.1667 35.5464 13.6095 35.3055 15.0128ZM14.2424 21.9419L10.8752 19.9981C10.8576 19.9893 10.8423 19.9763 10.8309 19.9602C10.8195 19.9441 10.8122 19.9254 10.8098 19.9058V10.6071C10.8107 9.18295 11.2173 7.78848 11.9819 6.58696C12.7466 5.38544 13.8377 4.42659 15.1275 3.82264C16.4173 3.21869 17.8524 2.99464 19.2649 3.1767C20.6775 3.35876 22.0089 3.93941 23.1034 4.85067C23.0427 4.88379 22.937 4.94215 22.8668 4.98473L14.9024 9.58517C14.7025 9.69878 14.5366 9.86356 14.4215 10.0626C14.3065 10.2616 14.2466 10.4877 14.2479 10.7175L14.2424 21.9419ZM16.071 17.9991L20.4018 15.4978L24.7325 17.9975V22.9985L20.4018 25.4983L16.071 22.9985V17.9991Z" fill="currentColor"></path></svg></div></div>`;

  // Thread navigation
  const threadNavHtml =
    threadCount > 1
      ? `<div id="thread-buttons-wrapper-${msgId}" class="text-xs flex items-center justify-center gap-1 self-center">` +
        `<button id="thread-prev-button-${msgId}" class="flex h-[30px] w-[30px] items-center justify-center rounded-md hover:bg-token-main-surface-secondary disabled:opacity-50" ${threadIndex === 1 ? 'disabled' : ''}>` +
        `<svg viewBox="0 0 24 24" fill="none" class="icon icon-md-heavy"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.7071 5.29289C15.0976 5.68342 15.0976 6.31658 14.7071 6.70711L9.41421 12L14.7071 17.2929C15.0976 17.6834 15.0976 18.3166 14.7071 18.7071C14.3166 19.0976 13.6834 19.0976 13.2929 18.7071L7.29289 12.7071C7.10536 12.5196 7 12.2652 7 12C7 11.7348 7.10536 11.4804 7.29289 11.2929L13.2929 5.29289C13.6834 4.90237 14.3166 4.90237 14.7071 5.29289Z" fill="currentColor"></path></svg></button>` +
        `<span>${threadIndex} / ${threadCount}</span>` +
        `<button id="thread-next-button-${msgId}" class="flex h-[30px] w-[30px] items-center justify-center rounded-md hover:bg-token-main-surface-secondary disabled:opacity-50" ${threadIndex === threadCount ? 'disabled' : ''}>` +
        `<svg viewBox="0 0 24 24" fill="none" class="icon icon-md-heavy"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.29289 18.7071C8.90237 18.3166 8.90237 17.6834 9.29289 17.2929L14.5858 12L9.29289 6.70711C8.90237 6.31658 8.90237 5.68342 9.29289 5.29289C9.68342 4.90237 10.3166 4.90237 10.7071 5.29289L16.7071 11.2929C16.8946 11.4804 17 11.7348 17 12C17 12.2652 16.8946 12.5196 16.7071 12.7071L10.7071 18.7071C10.3166 19.0976 9.68342 19.0976 9.29289 18.7071Z" fill="currentColor"></path></svg></button></div>`
      : '';

  const widthStyle = customConversationWidth ? `max-width:${conversationWidth}%` : '';
  const pinnedClass = pinned
    ? 'border-r-pinned bg-pinned dark:bg-pinned border-b scroll-margin-top-60'
    : 'bg-token-main-surface-primary';

  return (
    `<article id="message-wrapper-${msgId}" data-role="assistant" class="group w-full p-5 pb-0 text-token-text-primary ${pinnedClass}">` +
    `<div class="relative text-base gap-4 m-auto md:max-w-2xl lg:max-w-2xl xl:max-w-3xl flex" style="${widthStyle}">` +
    `<div class="flex-shrink-0 flex flex-col relative items-end">${avatarHtml}</div>` +
    `<div class="relative flex flex-col agent-turn" style="width:calc(100% - 80px);">` +
    `<div class="flex flex-grow flex-col gap-1 max-w-full">${contentHtml}` +
    `<div id="message-action-wrapper-${msgId}" class="flex justify-between empty:hidden lg:block">` +
    `<div class="text-token-text-secondary flex self-end mt-2 visible gap-1">${threadNavHtml}</div></div>` +
    `<div id="message-info-wrapper-${msgId}" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7em; width: 100%; max-height: 40px;">` +
    (showMessageCharWordCount
      ? `<div id="message-counter-${msgId}" class="text-token-text-tertiary select-none">${totalCharCount} chars \u2022 ${totalWordCount} words</div>`
      : '') +
    (showMessageTimestamp
      ? `<div class="text-token-text-tertiary select-none" style="position: absolute; bottom: 4px; right: 0px;">${timeStr}</div>`
      : '') +
    `</div></div></div></div></article>`
  );
}

// ---------------------------------------------------------------------------
// User message row
// ---------------------------------------------------------------------------

/**
 * Render a full user message article row for the conversation preview.
 *
 * Original: content.isolated.end.js lines 10595-10647
 */
export function rowUser(
  conversation: Conversation,
  node: MessageNode,
  threadIndex: number,
  threadCount: number,
  _models: ModelInfo[],
  _gizmo: GizmoInfo | null,
): string {
  const { customConversationWidth, conversationWidth } = cachedSettings;
  const { pinned, message } = node;
  if (!message) return '';

  const { id: msgId, content, metadata } = message;

  const rawText = (content?.parts ?? []).filter((p): p is string => typeof p === 'string').join('\n');

  const attachments = ((metadata as Record<string, unknown>)?.attachments ?? []) as Attachment[];
  const targetedReply = (metadata as Record<string, unknown>)?.targeted_reply as string | undefined;
  const dalleEditFileId = ((metadata as Record<string, unknown>)?.dalle as Record<string, unknown>)
    ?.from_client as Record<string, unknown>;
  const originalFileId = dalleEditFileId?.operation as Record<string, unknown>;
  const editFileId = originalFileId?.original_file_id as string | undefined;

  // Strip hidden instructions
  const visibleText = rawText.replace(/^## Instructions[\s\S]*?## End Instructions\n\n/m, '');
  const escapedText = sanitizeHtml(visibleText);

  // Extract instruction codes
  const langCode = rawText.match(/\(languageCode: (.*)\)/)?.[1];
  const toneCode = rawText.match(/\(toneCode: (.*)\)/)?.[1];
  const styleCode = rawText.match(/\(writingStyleCode: (.*)\)/)?.[1];

  const widthStyle = customConversationWidth ? `max-width:${conversationWidth}%` : '';
  const pinnedClass = pinned
    ? 'border-r-pinned bg-pinned dark:bg-pinned border-b scroll-margin-top-60'
    : 'bg-token-main-surface-primary';

  // Thread navigation
  const threadNavHtml =
    threadCount > 1
      ? `<div id="thread-buttons-wrapper-${msgId}" class="text-xs flex items-center justify-center gap-1 self-center">` +
        `<button id="thread-prev-button-${msgId}" class="flex h-[30px] w-[30px] items-center justify-center rounded-md hover:bg-token-main-surface-secondary disabled:opacity-50" ${threadIndex === 1 ? 'disabled' : ''}>` +
        `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="icon icon-md-heavy"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.7071 5.29289C15.0976 5.68342 15.0976 6.31658 14.7071 6.70711L9.41421 12L14.7071 17.2929C15.0976 17.6834 15.0976 18.3166 14.7071 18.7071C14.3166 19.0976 13.6834 19.0976 13.2929 18.7071L7.29289 12.7071C7.10536 12.5196 7 12.2652 7 12C7 11.7348 7.10536 11.4804 7.29289 11.2929L13.2929 5.29289C13.6834 4.90237 14.3166 4.90237 14.7071 5.29289Z" fill="currentColor"></path></svg></button>` +
        `<span>${threadIndex} / ${threadCount}</span>` +
        `<button id="thread-next-button-${msgId}" ${threadIndex === threadCount ? 'disabled' : ''} class="flex h-[30px] w-[30px] items-center justify-center rounded-md hover:bg-token-main-surface-secondary disabled:opacity-50">` +
        `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="icon icon-md-heavy"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.29289 18.7071C8.90237 18.3166 8.90237 17.6834 9.29289 17.2929L14.5858 12L9.29289 6.70711C8.90237 6.31658 8.90237 5.68342 9.29289 5.29289C9.68342 4.90237 10.3166 4.90237 10.7071 5.29289L16.7071 11.2929C16.8946 11.4804 17 11.7348 17 12C17 12.2652 16.8946 12.5196 16.7071 12.7071L10.7071 18.7071C10.3166 19.0976 9.68342 19.0976 9.29289 18.7071Z" fill="currentColor"></path></svg></button></div>`
      : '';

  return (
    `<article id="message-wrapper-${msgId}" data-role="user" class="group w-full p-5 pb-0 text-token-text-primary ${pinnedClass}">` +
    `<div class="relative text-base gap-4 m-auto md:max-w-2xl lg:max-w-2xl xl:max-w-3xl flex justify-end" style="${widthStyle}">` +
    `<div class="relative flex flex-col w-full max-w-[90%]">` +
    `<div id="user-message-text-wrapper-${msgId}" class="flex flex-grow flex-col gap-1">` +
    // Reply-to preview
    (targetedReply
      ? `<div id="message-reply-to-preview-${msgId}" class="flex text-sm text-token-text-tertiary mb-1 mt-1 items-start gap-1.5 font-normal self-end">` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md shrink-0">` +
        `<path fill="currentColor" fill-rule="evenodd" d="M5 6a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h9.586l-2.293-2.293a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414-1.414L16.586 14H7a3 3 0 0 1-3-3V7a1 1 0 0 1 1-1" clip-rule="evenodd"></path></svg>` +
        `<p class="line-clamp-3">${targetedReply}</p></div>`
      : '') +
    // DALL-E edit reference
    (editFileId
      ? `<div class="mt-2 flex items-center gap-1 text-token-text-tertiary">` +
        `<img id="reply-to-image-${editFileId}" data-file-id="${editFileId}" src="https://upload.wikimedia.org/wikipedia/commons/c/ca/1x1.png" alt="Edited image" class="h-7 w-auto rounded opacity-50">` +
        `<span class="ms-1 text-sm font-medium">Selection</span></div>`
      : '') +
    // Message text
    `<div id="message-text-${msgId}" data-message-id="${msgId}" dir="auto" class="min-h-[20px] flex flex-col items-start gap-4 whitespace-pre-wrap rounded-3xl bg-[#f4f4f4] px-5 py-2.5 dark:bg-token-main-surface-secondary self-end" style="overflow-wrap:anywhere;">` +
    assetElements(attachments) +
    escapedText +
    `</div>` +
    // Edit/thread nav wrapper
    `<div id="message-edit-wrapper-${msgId}" class="flex empty:hidden mt-1 justify-end gap-3 lg:flex">` +
    `<div class="text-token-text-secondary flex self-end justify-start mt-2 visible gap-1">${threadNavHtml}</div></div>` +
    `</div></div>` +
    // Language/tone/style indicators
    `<div class="absolute start-0 flex" style="bottom:-10px;">` +
    (langCode
      ? `<div id="language-code-${msgId}" title="Language instruction" class="h-6 p-2 me-1 flex items-center justify-center rounded-md border text-xs text-token-text-tertiary border-token-border-medium bg-token-main-surface-secondary">Language: <b>${langCode}</b></div>`
      : '') +
    (toneCode
      ? `<div id="tone-code-${msgId}" title="Tone instruction" class="h-6 p-2 me-1 flex items-center justify-center rounded-md border text-xs text-token-text-tertiary border-token-border-medium bg-token-main-surface-secondary">Tone: <b>${toneCode}</b></div>`
      : '') +
    (styleCode
      ? `<div id="writing-style-code-${msgId}" title="Writing style instruction" class="h-6 p-2 me-1 flex items-center justify-center rounded-md border text-xs text-token-text-tertiary border-token-border-medium bg-token-main-surface-secondary">Writing Style: <b>${styleCode}</b></div>`
      : '') +
    `</div></div></article>`
  );
}

// ---------------------------------------------------------------------------
// Asset elements (attachments)
// ---------------------------------------------------------------------------

/**
 * Render attachment thumbnails (images, documents, code files).
 *
 * Original: content.isolated.end.js lines 10649-10681
 */
function assetElements(attachments: Attachment[]): string {
  if (!attachments?.length) return '';

  const files = attachments.filter((a) => getFileType(a.name) !== 'Image');
  const images = attachments.filter((a) => getFileType(a.name) === 'Image');

  let html = '';

  if (files.length > 0) {
    html += `<div class="flex gap-2 flex-wrap">${files.map((f) => assetElement(f)).join('')}</div>`;
  }

  if (images.length > 0) {
    const gridClass = images.length === 1 ? 'grid' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';
    html += `<div class="${gridClass}">${images.map((img) => assetElement(img)).join('')}</div>`;
  }

  return html;
}

function assetElement(attachment: Attachment): string {
  const type = getFileType(attachment.name);

  if (type === 'Image') {
    return (
      `<div class="relative mt-1 flex h-auto w-full max-w-lg items-center justify-center overflow-hidden bg-token-main-surface-tertiary text-token-text-primary">` +
      `<img id="asset-${attachment.id}" alt="Uploaded image" loading="lazy" width="${attachment.width ?? ''}" height="${attachment.height ?? ''}" class="max-w-full transition-opacity duration-300 opacity-100" src="" style="color: transparent;">` +
      `</div>`
    );
  }

  return (
    `<div class="group relative inline-block text-sm text-token-text-primary">` +
    `<div class="relative overflow-hidden bg-token-main-surface-tertiary rounded-xl">` +
    `<div class="p-2 w-80"><div class="flex flex-row items-center gap-2">` +
    `<div class="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">${getThumbnail(type, attachment.id)}</div>` +
    `<div class="overflow-hidden"><div class="truncate font-medium">${attachment.name}</div>` +
    `<div class="truncate text-token-text-tertiary">${type}</div></div>` +
    `</div></div></div></div>`
  );
}

function getThumbnail(type: string, id = ''): string {
  const iconMap: Record<string, string> = {
    Image: `<span id="asset-${id}" class="flex items-center h-full w-full justify-center bg-gray-500 dark:bg-gray-700 bg-cover bg-center text-white" style="background-image: url('');"></span>`,
    Spreadsheet:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" class="h-10 w-10 flex-shrink-0" width="36" height="36"><rect width="36" height="36" rx="6" fill="#10A37F"></rect><path d="M15.5 10.5H12.1667C11.2462 10.5 10.5 11.2462 10.5 12.1667V13.5V18M15.5 10.5H23.8333C24.7538 10.5 25.5 11.2462 25.5 12.1667V13.5V18M15.5 10.5V25.5M15.5 25.5H18H23.8333C24.7538 25.5 25.5 24.7538 25.5 23.8333V18M15.5 25.5H12.1667C11.2462 25.5 10.5 24.7538 10.5 23.8333V18M10.5 18H25.5" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    PDF: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" class="h-10 w-10 flex-shrink-0" width="36" height="36"><rect width="36" height="36" rx="6" fill="#FF5588"></rect><path d="M19.6663 9.66663H12.9997C12.5576 9.66663 12.1337 9.84222 11.8212 10.1548C11.5086 10.4673 11.333 10.8913 11.333 11.3333V24.6666C11.333 25.1087 11.5086 25.5326 11.8212 25.8451C12.1337 26.1577 12.5576 26.3333 12.9997 26.3333H22.9997C23.4417 26.3333 23.8656 26.1577 24.1782 25.8451C24.4907 25.5326 24.6663 25.1087 24.6663 24.6666V14.6666L19.6663 9.66663Z" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    Document:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" class="h-10 w-10 flex-shrink-0" width="36" height="36"><rect width="36" height="36" rx="6" fill="#FF5588"></rect><path d="M19.6663 9.66663H12.9997C12.5576 9.66663 12.1337 9.84222 11.8212 10.1548C11.5086 10.4673 11.333 10.8913 11.333 11.3333V24.6666C11.333 25.1087 11.5086 25.5326 11.8212 25.8451C12.1337 26.1577 12.5576 26.3333 12.9997 26.3333H22.9997C23.4417 26.3333 23.8656 26.1577 24.1782 25.8451C24.4907 25.5326 24.6663 25.1087 24.6663 24.6666V14.6666L19.6663 9.66663Z" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    JavaScript:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" class="h-10 w-10 flex-shrink-0" width="36" height="36"><rect width="36" height="36" rx="6" fill="#FF6E3C"></rect><path d="M21.333 23L26.333 18L21.333 13" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path><path d="M14.667 13L9.66699 18L14.667 23" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    Python:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" class="h-10 w-10 flex-shrink-0" width="36" height="36"><rect width="36" height="36" rx="6" fill="#FF6E3C"></rect><path d="M21.333 23L26.333 18L21.333 13" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path><path d="M14.667 13L9.66699 18L14.667 23" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  };

  return (
    iconMap[type] ??
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" class="h-10 w-10 flex-shrink-0" width="36" height="36"><rect width="36" height="36" rx="6" fill="#0000FF"></rect><path d="M18.833 9.66663H12.9997C12.5576 9.66663 12.1337 9.84222 11.8212 10.1548C11.5086 10.4673 11.333 10.8913 11.333 11.3333V24.6666C11.333 25.1087 11.5086 25.5326 11.8212 25.8451C12.1337 26.1577 12.5576 26.3333 12.9997 26.3333H22.9997C23.4417 26.3333 23.8656 26.1577 24.1782 25.8451C24.4907 25.5326 24.6663 25.1087 24.6663 24.6666V15.5L18.833 9.66663Z" stroke="white" stroke-width="1.66667" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
  );
}
