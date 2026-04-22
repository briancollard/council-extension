/**
 * DALL-E image rendering, plugin visualization, and tool-use rendering.
 *
 * Handles:
 *   - DALL-E image skeleton placeholders + async download/render
 *   - Python/Code Interpreter chart image rendering
 *   - Plugin dropdown (Used <PluginName> / Browsing... / Creating Images)
 *   - Plugin content rendering (request/response code blocks)
 *   - Plugin visualization (CSV tables from ada_visualizations)
 *   - Action confirmation/response/disclaimer renderers
 *   - Strawberry (o1) thinking dropdown renderer
 *
 * Original source: content.isolated.end.js lines 10063-10457
 */

import { downloadFileFromUrl } from '../../utils/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal message node from the conversation mapping. */
interface MessageNode {
  message?: {
    id?: string;
    role?: string;
    status?: string;
    content?: {
      content_type?: string;
      parts?: Array<string | DallePart>;
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

interface DallePart {
  asset_pointer?: string;
  width?: number;
  height?: number;
  metadata?: {
    dalle?: {
      prompt?: string;
      gen_id?: string;
      seed?: string;
    };
  };
}

interface ConversationMapping {
  [nodeId: string]: MessageNode;
}

interface Conversation {
  conversation_id: string;
  mapping: ConversationMapping;
}

interface GalleryImageData {
  image_id: string;
  width?: number;
  height?: number;
  download_url: string;
  prompt?: string;
  gen_id?: string;
  seed?: string;
  is_public: boolean;
  category: string;
  conversation_id: string;
  created_at: Date;
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

function isImageGeneratorTool(name?: string): boolean {
  return name === 'dalle.text2im' || name === 't2uay3k.sj1i4kz';
}

// ---------------------------------------------------------------------------
// Python / Code Interpreter image skeleton
// ---------------------------------------------------------------------------

/**
 * Render placeholder <img> tags for code interpreter output images.
 *
 * Original: content.isolated.end.js lines 10063-10066
 */
export function pythonImageSkeleton(node: MessageNode): string {
  const msgId = node?.message?.id;
  const messages = ((node?.message?.metadata as Record<string, unknown>)?.aggregate_result as Record<string, unknown>)
    ?.messages as Array<{
    message_type: string;
    image_url: string;
    width: number;
    height: number;
  }>;

  if (!messages) return '';

  return messages
    .filter((m) => m.message_type === 'image')
    .map(
      (m) =>
        `<img style="border-radius:8px; aspect-ratio: ${m.width}/${m.height};" id="python-image-displayed-${msgId}" data-file-id="${m.image_url.split('://').pop()}" src="https://upload.wikimedia.org/wikipedia/commons/c/ca/1x1.png" class="my-1" alt="Output image">`,
    )
    .join('');
}

/**
 * Fetch and render all code interpreter output images in the conversation preview.
 *
 * Original: content.isolated.end.js lines 10084-10109
 */
export async function renderAllPythonImages(
  conversation: Conversation,
  getDownloadUrlFromFileId: (
    convId: string,
    fileId: string,
  ) => Promise<{ download_url: string; creation_time?: string }>,
): Promise<void> {
  const placeholders = document.querySelectorAll<HTMLImageElement>('[id^="python-image-displayed-"]');
  if (placeholders.length === 0) return;

  const tasks = Array.from(placeholders).map(async (el) => {
    const nodeId = el.id.split('python-image-displayed-').pop();
    if (!nodeId) return;
    const { fileId } = el.dataset;
    if (!fileId) return;

    const fileData = await getDownloadUrlFromFileId(conversation.conversation_id, fileId);
    el.src = fileData.download_url;
  });

  await Promise.all(tasks);
}

// ---------------------------------------------------------------------------
// DALL-E image rendering
// ---------------------------------------------------------------------------

/**
 * Generate DALL-E image skeleton placeholders (loading state).
 *
 * Original: content.isolated.end.js lines 10129-10143
 */
export function dalleImageSkeleton(messageId: string, parts: DallePart[]): string {
  if (!parts.length) return '';
  const { width = 1024, height = 1024 } = parts[0] ?? {};

  return parts
    .map(
      (_, i) =>
        `<div class="flex"><div type="button" class="w-full cursor-pointer"><div class="relative overflow-hidden rounded-2xl group ${width === height ? 'max-w-[400px]' : ''}" style="aspect-ratio: ${width}/${height};">` +
        `<div style="width:${width}px; height:${height}px;" class="pointer-events-none absolute inset-0 bg-gray-100 animate-pulse w-full"></div>` +
        `<div class="relative h-full"><img id="dalle-image-${messageId}-${i}" alt="Generated by DALL-E" loading="lazy" width="${width}" height="${height}" class="w-full transition-opacity duration-300 opacity-100" src="https://upload.wikimedia.org/wikipedia/commons/c/ca/1x1.png" style="color: transparent;">` +
        `<div class="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_0.5px_rgba(0,0,0,0.5)]"></div>` +
        `<div id="dalle-image-info-${messageId}-${i}" title="Click to copy Gen ID, Shift+Click to copy Seed" class="invisible absolute bg-gray-600 px-2 py-1 rounded text-xs group-hover:visible" style="left:12px; bottom:12px;">` +
        `<div class="flex">Gen ID:&nbsp;<div class="font-bold" id="dalle-image-gen-id-${messageId}-${i}"></div></div>` +
        `<div class="flex">Seed:&nbsp;<div class="font-bold" id="dalle-image-seed-${messageId}-${i}"></div></div></div>` +
        `<div id="dalle-image-download-button-${messageId}-${i}" class="invisible absolute group-hover:visible" style="left:12px; top:12px;"><button class="flex h-8 w-8 items-center justify-center rounded bg-black/50"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm text-white"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.70711 10.2929C7.31658 9.90237 6.68342 9.90237 6.29289 10.2929C5.90237 10.6834 5.90237 11.3166 6.29289 11.7071L11.2929 16.7071C11.6834 17.0976 12.3166 17.0976 12.7071 16.7071L17.7071 11.7071C18.0976 11.3166 18.0976 10.6834 17.7071 10.2929C17.3166 9.90237 16.6834 9.90237 16.2929 10.2929L13 13.5858L13 4C13 3.44771 12.5523 3 12 3C11.4477 3 11 3.44771 11 4L11 13.5858L7.70711 10.2929ZM5 19C4.44772 19 4 19.4477 4 20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20C20 19.4477 19.5523 19 19 19L5 19Z" fill="currentColor"></path></svg></button></div>` +
        `</div></div></div></div>`,
    )
    .join('');
}

/**
 * Fetch and render all DALL-E images in the conversation preview.
 *
 * Original: content.isolated.end.js lines 10144-10202
 */
export async function renderAllDalleImages(
  conversation: Conversation,
  getDownloadUrlFromFileId: (
    convId: string,
    fileId: string,
  ) => Promise<{ download_url: string; creation_time?: string }>,
): Promise<GalleryImageData[]> {
  const containers = [...document.querySelectorAll<HTMLElement>('[id^="message-dalle-content-"]')].filter(
    (el) => el.innerHTML === '',
  );

  const messageIds = containers.map((el) => el.id.split('message-dalle-content-')[1]);
  if (messageIds.length === 0) return [];

  const allImages: GalleryImageData[] = [];

  const tasks = messageIds.map(async (msgId) => {
    const childNode = Object.values(conversation.mapping).find((n) => n?.parent === msgId);
    if (!childNode) return;
    const images = await dalleImageRenderer(childNode, conversation.conversation_id, getDownloadUrlFromFileId);
    allImages.push(...images);
  });

  await Promise.all(tasks);
  return allImages;
}

/**
 * Render DALL-E images for a single message node.
 *
 * Original: content.isolated.end.js lines 10157-10202
 */
export async function dalleImageRenderer(
  node: MessageNode,
  conversationId: string,
  getDownloadUrlFromFileId: (
    convId: string,
    fileId: string,
  ) => Promise<{ download_url: string; creation_time?: string }>,
  _inEditor = false,
): Promise<GalleryImageData[]> {
  const content = node.message?.content;
  if (content?.content_type !== 'multimodal_text') return [];

  let parentId = node.parent;
  if (!parentId) {
    const lastContainer = [...document.querySelectorAll('[id^="message-dalle-content-"]')].pop();
    parentId = lastContainer?.id.split('message-dalle-content-')[1];
  }

  const parts = (content?.parts ?? []) as DallePart[];
  const container = document.querySelector<HTMLElement>(`#message-dalle-content-${parentId}`);

  if (container) {
    if (parts.length <= 1) container.classList?.replace('grid-cols-2', 'grid-cols-1');
    if (container.innerHTML === '') {
      container.innerHTML = dalleImageSkeleton(parentId!, parts);
    }
  }

  if (!parts.length) return [];

  const images: GalleryImageData[] = [];

  const tasks = parts.map(async (part, i) => {
    const fileId = part.asset_pointer?.split('://')[1];
    if (!fileId) return;
    const { width = 1024, height = 1024 } = part;

    const fileData = await getDownloadUrlFromFileId(conversationId, fileId);

    // Hide loading spinners
    document.querySelectorAll('[id^="hidden-plugin-"]').forEach((el) => {
      (el.firstChild as HTMLElement)?.classList?.remove('conic');
      (el.firstChild as HTMLElement)?.classList?.add('hidden');
    });

    const imgEl = document.querySelector<HTMLImageElement>(`img#dalle-image-${parentId}-${i}`);

    if (imgEl) {
      imgEl.setAttribute('width', String(width));
      imgEl.setAttribute('height', String(height));
      imgEl.alt = part.metadata?.dalle?.prompt?.replace(/[^a-zA-Z0-9 ]/gi, '') ?? 'Generated by DALL-E';
      imgEl.dataset.fileId = fileId;
      imgEl.dataset.genId = part.metadata?.dalle?.gen_id;
      imgEl.src = fileData.download_url;

      // Set gen-id and seed text
      const genIdEl = imgEl.parentElement?.querySelector(`#dalle-image-gen-id-${parentId}-${i}`);
      const seedEl = imgEl.parentElement?.querySelector(`#dalle-image-seed-${parentId}-${i}`);
      if (genIdEl) genIdEl.textContent = part.metadata?.dalle?.gen_id ?? '';
      if (seedEl) seedEl.textContent = part.metadata?.dalle?.seed ?? '';

      const isUpload = !part.metadata || !part.metadata.dalle;
      images.push({
        image_id: fileId,
        width,
        height,
        download_url: fileData.download_url,
        prompt: part.metadata?.dalle?.prompt,
        gen_id: part.metadata?.dalle?.gen_id,
        seed: part.metadata?.dalle?.seed,
        is_public: false,
        category: isUpload ? 'upload' : 'dalle',
        conversation_id: conversationId,
        created_at: fileData.creation_time
          ? new Date(fileData.creation_time)
          : new Date(formatTime(node.message?.create_time)),
      });
    }
  });

  await Promise.all(tasks);
  return images;
}

// ---------------------------------------------------------------------------
// Plugin dropdown rendering
// ---------------------------------------------------------------------------

/**
 * Render a plugin/tool-use dropdown (collapsed by default).
 * Handles DALL-E, browser, bio (memory), and generic plugins.
 *
 * Original: content.isolated.end.js lines 10300-10306
 */
export function pluginDropdownRenderer(node: MessageNode, isStreaming: boolean, expanded = false): string {
  const recipient = node.message?.recipient;

  // DALL-E and browser get special "hidden" treatment
  if (isImageGeneratorTool(recipient) || recipient === 'browser') {
    return hiddenPluginDropdownRenderer(node, isStreaming);
  }

  const pluginName = recipient
    ?.split('.')[0]
    ?.replace(/([A-Z])/g, ' $1')
    ?.replace(/^./, (c) => c.toUpperCase());
  const msgId = node.message?.id;

  const label = pluginName?.toLowerCase() === 'bio' ? 'Memory updated' : `Used <b>${pluginName}</b>`;

  return (
    `<div class="flex flex-col items-start">` +
    `<div id="message-plugin-dropdown-${msgId}" class="flex items-center text-xs rounded p-3 text-token-text-secondary ${isStreaming ? 'bg-green-100' : 'bg-token-main-surface-secondary'}">` +
    `<div><div class="flex items-center gap-3"><div id="message-plugin-name-${msgId}">${label}</div></div></div>` +
    (isStreaming
      ? `<svg id="message-plugin-loading-${msgId}" stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" class="animate-spin text-center shrink-0 ms-1" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`
      : '') +
    `<div id="message-plugin-toggle-${msgId}" class="ms-12 flex items-center gap-2" role="button">` +
    `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" class="icon icon-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="${expanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"></polyline></svg>` +
    `</div></div>` +
    `<div id="message-plugin-content-${msgId}" class="${expanded ? '' : 'hidden'} my-3 flex w-full flex-col gap-3">${pluginContentRenderer(node)}</div>` +
    `<div id="message-plugin-visualization-${msgId}" class="hidden my-3 flex w-full flex-col gap-3"></div>` +
    `</div>`
  );
}

/**
 * Render a hidden plugin dropdown for DALL-E and browser tools.
 *
 * Original: content.isolated.end.js lines 10121-10127
 */
function hiddenPluginDropdownRenderer(node: MessageNode, isStreaming: boolean): string {
  const recipient = node.message?.recipient;
  const label = isImageGeneratorTool(recipient) ? 'Creating Images' : 'Browsing...';
  const msgId = node.message?.id;

  // Don't duplicate browser entries
  if (recipient === 'browser' && document.querySelector('[id^=hidden-plugin-]')) {
    return '';
  }

  return (
    `<div class="flex flex-col items-start gap-2" id="hidden-plugin-${msgId}">` +
    `<div class="max-w-full ${isStreaming ? '' : 'hidden'}">` +
    `<div class="flex items-center justify-between"><div class="min-w-0"><div class="flex items-center gap-2.5 py-2">` +
    `<div class="flex h-4 w-4 shrink-0 items-center justify-center"><svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-xl text-brand-purple"><circle fill="transparent" class="stroke-brand-purple/25 dark:stroke-brand-purple/50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg></div>` +
    `<div class="flex min-w-0 flex-1 flex-col items-start leading-[18px]"><div class="max-w-full truncate text-token-text-secondary">${label}</div></div>` +
    `</div></div></div></div>` +
    (isImageGeneratorTool(recipient)
      ? `<div id="message-dalle-content-${msgId}" class="grid gap-4 grid-cols-2 transition-opacity duration-300 opacity-100"></div>`
      : '') +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Plugin content rendering (request/response code blocks)
// ---------------------------------------------------------------------------

/**
 * Render plugin request/response as syntax-highlighted code blocks.
 *
 * Original: content.isolated.end.js lines 10382-10420
 */
export function pluginContentRenderer(node: MessageNode): string {
  const msgId = node.message?.id;
  if (!msgId) return '';

  const { content, recipient, author, metadata } = node.message!;
  const authorName = author?.name;

  // Skip DALL-E, browser — they have their own renderers
  if (isImageGeneratorTool(authorName) || isImageGeneratorTool(recipient) || authorName === 'browser') {
    return '';
  }

  const role = node.message?.role ?? author?.role;
  const contentType = content?.content_type;

  const pluginName =
    role === 'assistant'
      ? recipient
          ?.split('.')[0]
          ?.replace(/([A-Z])/g, ' $1')
          ?.replace(/^./, (c) => c.toUpperCase())
      : authorName
          ?.split('.')[0]
          ?.replace(/([A-Z])/g, ' $1')
          ?.replace(/^./, (c) => c.toUpperCase());

  const text =
    contentType === 'text'
      ? (content?.parts ?? []).filter((p): p is string => typeof p === 'string').join('\n')
      : ((content as Record<string, unknown>)?.text as string);

  if (!text) return '';

  let codeContent = text;
  try {
    codeContent = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // Not JSON, use as-is
  }

  const headerLabel =
    contentType === 'text'
      ? role === 'assistant'
        ? `Request to ${pluginName}`
        : `Response from ${pluginName}`
      : role === 'assistant'
        ? `Request to ${recipient}`
        : 'STDOUT/STDERR';

  return (
    `<div class="dark bg-black rounded-md w-full text-xs text-token-text-secondary">` +
    `<pre><div class="flex items-center relative text-token-text-secondary bg-token-main-surface-secondary px-4 py-2 text-xs font-sans justify-between rounded-t-md select-none">` +
    `<span><span class="uppercase">${headerLabel}</span></span>` +
    `</div>` +
    `<div class="p-4 overflow-y-auto"><code id="message-plugin-${role === 'assistant' ? 'request' : 'response'}-html-${msgId}" class="!whitespace-pre-wrap">${codeContent}</code></div>` +
    `</pre></div>`
  );
}

// ---------------------------------------------------------------------------
// Plugin visualization (CSV tables)
// ---------------------------------------------------------------------------

/**
 * Render ada_visualizations as interactive tables.
 *
 * Original: content.isolated.end.js lines 10421-10503
 */
export async function pluginVisualizationRenderer(
  conversation: Conversation,
  node: MessageNode,
  getDownloadUrlFromFileId: (convId: string, fileId: string) => Promise<{ download_url: string; file_name?: string }>,
): Promise<void> {
  const msgId = node.message?.id;
  if (!msgId) return;

  const metadata = node.message?.metadata as Record<string, unknown>;
  const role = node.message?.role ?? node.message?.author?.role;
  const contentType = node.message?.content?.content_type;

  if (contentType !== 'execution_output' || role !== 'tool') return;

  const adaVisualizations = metadata?.ada_visualizations as Array<{
    title: string;
    file_id: string;
  }>;
  if (!adaVisualizations?.length) return;

  const tasks = adaVisualizations.map(async (viz) => {
    const fileData = await getDownloadUrlFromFileId(conversation.conversation_id, viz.file_id);
    const csvText = await fetch(fileData.download_url, {
      method: 'GET',
      headers: { origin: 'https://chatgpt.com' },
    }).then((r) => r.text());

    if (!csvText) return;

    const parentId = metadata?.parent_id as string;
    const container = document.querySelector<HTMLElement>(`#message-plugin-visualization-${parentId}`);
    if (!container) return;

    container.id = `message-plugin-visualization-${msgId}`;
    container.classList.remove('hidden');
    container.appendChild(csvToTable(viz.title, csvText, fileData.download_url));
  });

  await Promise.all(tasks);
}

/**
 * Parse CSV text and render as an HTML table element.
 *
 * Original: content.isolated.end.js lines 10459-10503
 */
function csvToTable(title: string, csvText: string, downloadUrl: string): HTMLElement {
  const rows = parseCsv(csvText);

  const wrapper = document.createElement('div');
  wrapper.className =
    'relative overflow-auto w-full rounded-2xl bg-token-main-surface-secondary border border-token-border-medium';
  wrapper.style.maxHeight = '420px';

  // Header bar
  const header = document.createElement('div');
  header.className =
    'flex items-center justify-between gap-2 bg-token-main-surface-primary px-4 py-3 border-b border-token-border-medium sticky top-0 start-0 z-30';
  const titleEl = document.createElement('div');
  titleEl.className = 'flex-grow items-center truncate font-semibold capitalize bg-token-main-surface-primary';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'flex items-center text-xs';
  downloadBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="icon icon-md text-token-text-tertiary hover:text-token-text-primary"><path fill="currentColor" d="M7.707 10.293a1 1 0 1 0-1.414 1.414l5 5a1 1 0 0 0 1.414 0l5-5a1 1 0 0 0-1.414-1.414L13 13.586V4a1 1 0 1 0-2 0v9.586zM5 19a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2z"></path></svg>';
  downloadBtn.addEventListener('click', () => {
    downloadFileFromUrl(downloadUrl, `${title}.csv`);
  });
  header.appendChild(downloadBtn);
  wrapper.appendChild(header);

  // Table
  const table = document.createElement('table');
  table.className = 'w-full table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.className = 'sticky z-20';
  headerRow.style.top = '49px';

  ['', ...(rows[0] ?? []), ''].forEach((cellText, i) => {
    const th = document.createElement('th');
    th.className =
      'text-sm text-start text-token-text-primary font-bold bg-token-main-surface-secondary p-2 border-e border-token-border-medium sticky';
    if (i === 0) {
      th.classList.add('sticky', 'border-s', 'z-10', 'start-0');
      th.style.minWidth = '40px';
    } else if (i < (rows[0]?.length ?? 0)) {
      th.style.minWidth = '150px';
    } else {
      th.style.minWidth = '40px';
    }
    th.textContent = cellText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const emptyRow = Array.from({ length: rows[0]?.length ?? 0 }, () => '');

  [...rows, emptyRow].slice(1).forEach((row, rowIdx) => {
    const tr = document.createElement('tr');
    [String(rowIdx + 1), ...row, ''].forEach((cellText, colIdx) => {
      const td = document.createElement('td');
      td.className =
        'relative text-sm text-token-text-secondary border border-token-border-medium bg-token-main-surface-primary p-2';
      if (colIdx === 0) {
        td.classList.add(
          'text-center',
          'font-bold',
          'text-token-text-primary',
          'bg-token-main-surface-secondary',
          'sticky',
          'z-10',
          'start-0',
        );
      }
      td.textContent = rowIdx === rows.length - 1 ? '' : cellText;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);

  return wrapper;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const regex = /(?:"([^"]*(?:""[^"]*)*)"|([^",]+)|,)(?=\s*,|\s*$)/g;
  text
    .trim()
    .split('\n')
    .forEach((line) => {
      const cells: string[] = [];
      let match = regex.exec(line);
      while (match) {
        cells.push(match[1] ? match[1].replace(/""/g, '"') : (match[2] ?? ''));
        match = regex.exec(line);
      }
      rows.push(cells);
    });
  return rows;
}

// ---------------------------------------------------------------------------
// Action confirmation / response renderers
// ---------------------------------------------------------------------------

/**
 * Render tool action confirmation dialog (Allow / Always Allow / Decline).
 *
 * Original: content.isolated.end.js lines 10210-10255
 */
export function actionConfirmationRenderer(
  node: MessageNode,
  responseNode: MessageNode | undefined,
  gptName: string,
): string {
  const { id: msgId, recipient, metadata } = node.message!;
  const domain = (metadata as Record<string, unknown>)?.jit_plugin_data as Record<string, unknown>;
  const domainUrl = (domain?.from_server as Record<string, unknown>)?.body as Record<string, unknown>;
  const domainName = domainUrl?.domain as string;

  if (responseNode) {
    return actionResponseRenderer(responseNode, domainName);
  }

  const role = node.message?.role ?? node.message?.author?.role;
  if (role !== 'tool' || recipient !== 'assistant') return '';

  const serverType = (domain?.from_server as Record<string, unknown>)?.type as string;

  if (serverType === 'confirm_action') {
    return (
      `<div id="tool-action-request-wrapper-${msgId}" data-domain="${domainName}">` +
      actionDisclaimerRenderer(gptName, domainName) +
      `<div class="mb-2 flex gap-2">` +
      `<button id="tool-action-request-allow-${msgId}" class="btn relative btn-primary btn-small"><div class="flex w-full gap-2 items-center justify-center">Allow</div></button>` +
      `<button id="tool-action-request-always-allow-${msgId}" class="btn relative btn-secondary btn-small"><div class="flex w-full gap-2 items-center justify-center">Always Allow</div></button>` +
      `<button id="tool-action-request-deny-${msgId}" class="btn relative btn-secondary btn-small"><div class="flex w-full gap-2 items-center justify-center">Decline</div></button>` +
      `</div></div>`
    );
  }

  return '';
}

function actionResponseRenderer(node: MessageNode, domain: string): string {
  const role = node.message?.role ?? node.message?.author?.role;
  const recipient = node.message?.recipient;
  if (role === 'user') return '';
  if (role !== 'tool' && recipient !== 'all') return actionStoppedRenderer(domain);

  const metadata = node.message?.metadata as Record<string, unknown>;
  const jitData = metadata?.jit_plugin_data as Record<string, unknown>;
  const clientType = (jitData?.from_client as Record<string, unknown>)?.type as string;
  const serverType = (jitData?.from_server as Record<string, unknown>)?.type as string;

  if (clientType === 'allow' || clientType === 'always_allow') return actionAllowedRenderer(domain);
  if (clientType === 'deny' || serverType === 'denied_by_user') return actionDeniedRenderer();
  return '';
}

function actionDisclaimerRenderer(gptName: string, domain: string): string {
  return `<div class="my-2.5 flex items-center gap-2.5"><div class="relative h-5 w-full leading-5 -mt-[0.75px] text-token-text-secondary"><div class="absolute start-0 top-0 line-clamp-1"><div class="inline-flex items-center gap-1">${gptName || 'This GPT'} wants to talk to ${domain}</div></div></div></div>`;
}

function actionAllowedRenderer(domain: string): string {
  return `<div class="my-2.5 flex items-center gap-2.5"><div class="relative h-5 w-full leading-5 -mt-[0.75px] text-token-text-secondary"><div class="absolute start-0 top-0 line-clamp-1">Talked to ${domain}</div></div></div>`;
}

function actionDeniedRenderer(): string {
  return '<div class="my-2.5 flex items-center gap-2.5"><div class="relative h-5 w-full leading-5 -mt-[0.75px] text-token-text-tertiary"><div class="absolute start-0 top-0 line-clamp-1">You declined this action</div></div></div>';
}

function actionStoppedRenderer(domain: string): string {
  return `<div class="my-2.5 flex items-center gap-2.5"><div class="relative h-5 w-full leading-5 -mt-[0.75px] text-token-text-tertiary"><div class="absolute start-0 top-0 line-clamp-1">Stopped talking to ${domain}</div></div></div>`;
}

// ---------------------------------------------------------------------------
// Strawberry (o1) thinking dropdown
// ---------------------------------------------------------------------------

/**
 * Render the o1/strawberry thinking process dropdown.
 *
 * Original: content.isolated.end.js lines 10308-10380
 */
export function strawberryDropdownRenderer(node: MessageNode): string {
  const msgId = node.message?.id;
  const metadata = node.message?.metadata as Record<string, unknown>;
  const isFinished = node.message?.status === 'finished_successfully';
  const initialText = metadata?.initial_text as string;
  const finishedText = metadata?.finished_text as string;
  const displayText = isFinished ? finishedText : initialText;
  const content = (node.message?.content?.parts?.[0] ?? '') as string;

  return (
    `<div id="strawberry-response-${msgId}">` +
    `<div id="strawberry-dropdown-wrapper-${msgId}" class="first:mt-0 my-1.5 relative h-8 text-token-text-secondary ${content ? 'hover:text-token-text-primary' : ''}">` +
    `<div class="group absolute start-0 top-0 me-1.5 h-8 overflow-hidden mt-1">` +
    `<button class="${content ? '' : 'cursor-default'} ${isFinished ? '' : 'loading-shimmer'}">` +
    `<div class="flex items-center justify-start gap-1">` +
    `<span id="strawberry-dropdown-preview-text-${msgId}">${displayText ?? ''}</span>` +
    `<svg id="strawberry-dropdown-toggle-${msgId}" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md ${content ? '' : 'hidden'}">` +
    `<path fill-rule="evenodd" clip-rule="evenodd" d="M5.29289 9.29289C5.68342 8.90237 6.31658 8.90237 6.70711 9.29289L12 14.5858L17.2929 9.29289C17.6834 8.90237 18.3166 8.90237 18.7071 9.29289C19.0976 9.68342 19.0976 10.3166 18.7071 10.7071L12.7071 16.7071C12.5196 16.8946 12.2652 17 12 17C11.7348 17 11.4804 16.8946 11.2929 16.7071L5.29289 10.7071C4.90237 10.3166 4.90237 9.68342 5.29289 9.29289Z" fill="currentColor"></path>` +
    `</svg></div></button></div></div>` +
    `<div id="strawberry-content-${msgId}" class="overflow-hidden hidden">` +
    strawberryContentRenderer(node) +
    `</div></div>`
  );
}

/**
 * Parse and render o1 thinking content sections.
 *
 * Original: content.isolated.end.js lines 10337-10380
 */
function strawberryContentRenderer(node: MessageNode): string {
  const content = (node.message?.content?.parts?.[0] ?? '') as string;
  const sectionRegex = /\*\*(.*?)\*\*\n\n([\s\S]*?)(?=\*\*|$)/g;
  const sections: Array<{ title: string; description: string }> = [];

  let match = sectionRegex.exec(content);
  while (match !== null) {
    sections.push({ title: match[1]!.trim(), description: match[2]!.trim() });
    match = sectionRegex.exec(content);
  }

  return (
    `<div class="my-4 border-s-2 ps-4">` +
    `<div class="not-prose leading-6 markdown prose w-full break-words dark:prose-invert dark">` +
    sections
      .map(
        (s) =>
          (s.title
            ? `<p class="text-base has-[strong]:mb-1 has-[strong]:mt-3"><strong class="font-semibold text-token-text-primary">${s.title}</strong></p>`
            : '') +
          (s.description ? `<p class="text-base has-[strong]:mb-1 has-[strong]:mt-3">${s.description}</p>` : ''),
      )
      .join('') +
    `</div></div>`
  );
}
