/**
 * Speech feature — speech-to-text input and text-to-speech output.
 *
 * - Speech-to-text via Web Speech API (hold Alt to dictate)
 * - Auto-speak assistant responses via ChatGPT's built-in TTS
 * - Download audio of a message via the more-actions menu
 *
 * Original source: content.isolated.end.js lines 6639-6810
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  setTextAreaElementValue,
  getSubmitButton,
  isDarkMode,
  closeRadix,
  errorUpgradeConfirmation,
  getConversationIdFromUrl,
  closeMenus,
  sleep,
  getMoreActionsButton,
  isFirefox,
  isOpera,
  getPlusButton,
  makeElementDraggable,
  disableDraggable,
  downloadFileFromUrl,
} from '../../utils/shared';
import { toast, isDescendant } from '../isolated-world/ui/primitives';
import { translate } from './i18n';
import { getDefaultHeaders } from '../isolated-world/api';
import { cachedSettings } from '../isolated-world/settings';
import { canAttacheFile } from './notes';
export let playingAudios: Record<string, HTMLAudioElement> = {};

// ---------------------------------------------------------------------------
// Ported helpers
// ---------------------------------------------------------------------------

/** Cache of already-downloaded audio blob URLs keyed by message ID. */
const cachedAudios: Record<string, string> = {};

/**
 * Build event-init properties centered on an element (for synthetic pointer events).
 */
function makeEventInit(el: HTMLElement): Record<string, any> {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: Math.max(0, x),
    clientY: Math.max(0, y),
    screenX: 0,
    screenY: 0,
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
}

/**
 * Dispatch a full synthetic pointer-click sequence on an element.
 *
 * Original: content.isolated.end.js line 5743
 */
function dispatchPointerClick(el: HTMLElement): void {
  try {
    const init = makeEventInit(el);
    el.dispatchEvent(new PointerEvent('pointerover', init));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new PointerEvent('pointerenter', init));
    el.dispatchEvent(new MouseEvent('mouseenter', init));
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    if (typeof el.focus === 'function') el.focus();

    const upInit = { ...init, buttons: 0 };
    el.dispatchEvent(new PointerEvent('pointerup', upInit));
    el.dispatchEvent(new MouseEvent('mouseup', upInit));
    el.dispatchEvent(new MouseEvent('click', upInit));
  } catch (err) {
    console.warn('Error dispatching pointer click', err);
  }
}

/**
 * Dispatch keyboard Enter + Space fallback on an element.
 *
 * Original: content.isolated.end.js line 5757
 */
function dispatchKeyboardFallback(el: HTMLElement): void {
  try {
    const events = [
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }),
      new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }),
    ];
    for (const ev of events) el.dispatchEvent(ev);
  } catch (err) {
    console.warn('Error dispatching keyboard fallback', err);
  }
}

/**
 * Download TTS audio for a message. Uses the ChatGPT synthesize endpoint.
 * Caches the blob URL for subsequent downloads.
 *
 * Original: content.isolated.end.js line 3486
 */
export async function downloadAudio(
  conversationId: string,
  messageId: string,
  voice = 'juniper',
  format = 'aac',
): Promise<void> {
  // Use cached audio if available
  if (cachedAudios[messageId]) {
    const a = document.createElement('a');
    a.href = cachedAudios[messageId];
    a.download = `${messageId}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const url = new URL(`https://${window.location.host}/backend-api/synthesize`);

  const { openAIUserSettings } = await chrome.storage.local.get(['openAIUserSettings']);
  const resolvedVoice = (openAIUserSettings as any)?.settings?.voice_name || voice;

  const params: Record<string, string> = {
    message_id: messageId,
    conversation_id: conversationId,
    voice: resolvedVoice,
    format,
  };
  url.search = new URLSearchParams(params).toString();

  const { accessToken } = await chrome.storage.sync.get(['accessToken']);
  const defaultHeaders = getDefaultHeaders();
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ...defaultHeaders,
      Authorization: accessToken as string,
    },
  });

  if (response.headers.get('content-type') !== 'audio/aac') {
    toast('Failed to download audio', 'error');
    throw new Error(`Unexpected content-type: ${response.headers.get('content-type')}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Cache the blob URL, evict oldest if over 20 entries
  cachedAudios[messageId] = blobUrl;
  const keys = Object.keys(cachedAudios);
  if (keys.length > 20 && keys[0]) {
    delete cachedAudios[keys[0]];
  }

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${messageId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Open a Radix UI menu by dispatching synthetic pointer and keyboard events.
 * Returns null if the element is disabled or not present.
 *
 * Original: content.isolated.end.js line 5785
 */
export async function openRadixMenu(el: HTMLElement | null): Promise<null | void> {
  try {
    if (!el || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')) {
      return null;
    }

    el.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(30);

    dispatchPointerClick(el);
    await sleep(30);

    // If not expanded after pointer click, try keyboard fallback
    if (el.getAttribute('aria-expanded') !== 'true') {
      dispatchKeyboardFallback(el);
      await sleep(30);
    }

    await sleep(300);
  } catch (err) {
    console.warn('Error in openMoreActionsMenu', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let speakingMessageId: string | undefined;
let isAltKeyDown = false;
const autoSpeakQueue: HTMLElement[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize speech-to-text: hold Alt to dictate into the prompt textarea.
 * Uses webkitSpeechRecognition / SpeechRecognition API.
 */
export function initializeSpeechToText(): void {
  if (isFirefox || isOpera || !initializePromptInputPlaceholder()) return;

  let timeout: ReturnType<typeof setTimeout>;
  let existingText = '';
  let isListening = false;

  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const lastIdx = event.results.length - 1;
    const transcript = event.results[lastIdx][0].transcript.trim();
    setTextAreaElementValue(`${existingText ? `${existingText} ` : ''}${transcript}`);
  };

  recognition.onspeechend = () => {
    recognition.stop();
    setTimeout(() => {
      if (isAltKeyDown) {
        existingText = (document.querySelector('#prompt-textarea') as HTMLElement)?.innerText || '';
        recognition.start();
      }
    }, 200);
  };

  recognition.onerror = (event: any) => {
    setTimeout(() => {
      if (isAltKeyDown && event.error === 'no-speech') {
        existingText = (document.querySelector('#prompt-textarea') as HTMLElement)?.innerText || '';
        recognition.start();
      }
    }, 200);
  };

  // keyup — stop listening
  document.addEventListener('keyup', (e: KeyboardEvent) => {
    isAltKeyDown = false;
    clearTimeout(timeout);
    recognition.abort();

    const submitBtn = getSubmitButton();
    if (submitBtn && isListening) {
      isListening = false;
      toast('Stopped listening');
      if ((e.key === 'Alt' || e.keyCode === 18) && cachedSettings.autoSubmitWhenReleaseAlt) {
        submitBtn.click();
      }
    }
  });

  // keydown — start listening after 1.5s hold
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const ignoredKeys = [8, 46, 37, 38, 39, 40, 36, 35, 33, 34, 13, 32];

    if (e.altKey && !(e.ctrlKey || e.shiftKey || e.metaKey || e.key === 'Tab' || ignoredKeys.includes(e.keyCode))) {
      if (isAltKeyDown) return;
      isAltKeyDown = true;

      timeout = setTimeout(() => {
        if (e.ctrlKey || e.shiftKey || e.metaKey || e.key === 'Tab' || ignoredKeys.includes(e.keyCode)) return;

        if (isAltKeyDown) {
          chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
            if (hasSub) {
              stopAllAudios();
              existingText = (document.querySelector('#prompt-textarea') as HTMLElement)?.innerText || '';
              recognition.lang = cachedSettings.speechToTextLanguage?.code || 'en-US';
              recognition.interimResults = cachedSettings.speechToTextInterimResults ?? false;

              if (!isListening) {
                isListening = true;
                recognition.start();
                toast('Started listening');
              }
            } else {
              toast('\u26A1\uFE0F Speech to text requires the Pro Subscription.', 'success', 6000);
            }
          });
        }
      }, 1500);
    } else {
      clearTimeout(timeout);
      recognition.abort();
      if (isListening) {
        isListening = false;
        toast('Stopped listening');
      }
    }
  });

  // Stop on window blur
  window.addEventListener('blur', () => {
    clearTimeout(timeout);
    recognition.abort();
    if (isListening) {
      isListening = false;
      toast('Stopped listening');
    }
  });
}

// ---------------------------------------------------------------------------
// Prompt input placeholder
// ---------------------------------------------------------------------------

function initializePromptInputPlaceholder(): boolean {
  if (!cachedSettings.enableSpeechToTextShortkey) {
    const style = document.createElement('style');
    style.innerHTML = `
    .placeholder:after {
      --tw-content: "Type / for Prompts" !important;
    }
    `;
    document.head.appendChild(style);
    return false;
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const style = document.createElement('style');

  if (isMac) {
    style.innerHTML = `
    .placeholder:after {
      --tw-content: "Type / for Prompts \u2014 Hold down \u2325 (Option) to enable speaking" !important;
    }
    `;
  } else {
    style.innerHTML = `
    .placeholder:after {
      --tw-content: "Type / for Prompts \u2014 Hold down ALT to enable speaking" !important;
    }
    `;
  }
  document.head.appendChild(style);
  return true;
}

// ---------------------------------------------------------------------------
// Audio playback
// ---------------------------------------------------------------------------

/**
 * Stop all currently playing audio elements and reset speak buttons.
 */
export function stopAllAudios(clearSpeaking = true): void {
  if (clearSpeaking) speakingMessageId = '';

  Object.values(playingAudios).forEach((audio) => {
    audio.pause();
  });
  playingAudios = {};

  document.querySelectorAll('[id^="text-to-speech-button-"]').forEach((btn) => {
    (btn as HTMLElement).style.cssText = '';
    (btn as HTMLButtonElement).disabled = false;
    btn.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md-heavy"><path fill-rule="evenodd" clip-rule="evenodd" d="M11 4.9099C11 4.47485 10.4828 4.24734 10.1621 4.54132L6.67572 7.7372C6.49129 7.90626 6.25019 8.00005 6 8.00005H4C3.44772 8.00005 3 8.44776 3 9.00005V15C3 15.5523 3.44772 16 4 16H6C6.25019 16 6.49129 16.0938 6.67572 16.2629L10.1621 19.4588C10.4828 19.7527 11 19.5252 11 19.0902V4.9099ZM8.81069 3.06701C10.4142 1.59714 13 2.73463 13 4.9099V19.0902C13 21.2655 10.4142 22.403 8.81069 20.9331L5.61102 18H4C2.34315 18 1 16.6569 1 15V9.00005C1 7.34319 2.34315 6.00005 4 6.00005H5.61102L8.81069 3.06701ZM20.3166 6.35665C20.8019 6.09313 21.409 6.27296 21.6725 6.75833C22.5191 8.3176 22.9996 10.1042 22.9996 12.0001C22.9996 13.8507 22.5418 15.5974 21.7323 17.1302C21.4744 17.6185 20.8695 17.8054 20.3811 17.5475C19.8927 17.2896 19.7059 16.6846 19.9638 16.1962C20.6249 14.9444 20.9996 13.5175 20.9996 12.0001C20.9996 10.4458 20.6064 8.98627 19.9149 7.71262C19.6514 7.22726 19.8312 6.62017 20.3166 6.35665ZM15.7994 7.90049C16.241 7.5688 16.8679 7.65789 17.1995 8.09947C18.0156 9.18593 18.4996 10.5379 18.4996 12.0001C18.4996 13.3127 18.1094 14.5372 17.4385 15.5604C17.1357 16.0222 16.5158 16.1511 16.0539 15.8483C15.5921 15.5455 15.4632 14.9255 15.766 14.4637C16.2298 13.7564 16.4996 12.9113 16.4996 12.0001C16.4996 10.9859 16.1653 10.0526 15.6004 9.30063C15.2687 8.85905 15.3578 8.23218 15.7994 7.90049Z" fill="currentColor"></path></svg>';
  });
}

/**
 * Listen for ChatGPT's built-in audio element ending so we can chain
 * auto-speak messages from the queue.
 */
export function addAudioEventListener(): void {
  const audioEl = document.querySelector('audio.fixed.bottom-0.start-0.hidden.h-0.w-0') as HTMLAudioElement | null;

  if (audioEl) {
    audioEl.addEventListener('ended', () => {
      autoSpeakQueue.shift();
      if (autoSpeakQueue.length > 0) {
        autoSpeakQueue[0]!.click();
      }
    });
  }
}

/**
 * Automatically speak the latest assistant response using ChatGPT's
 * built-in voice play button.
 */
export async function handleAutoSpeak(): Promise<void> {
  const articles = document.querySelectorAll('article[data-testid^=conversation-turn]');
  if (articles.length === 0) return;

  const lastArticle = articles[articles.length - 1]!;
  let playBtn = lastArticle.querySelector('[data-testid=voice-play-turn-action-button]') as HTMLElement | null;

  if (!playBtn) {
    const moreBtn = getMoreActionsButton(lastArticle);
    await openRadixMenu(moreBtn);
    playBtn = document.querySelector(
      'div[role="menuitem"][data-testid=voice-play-turn-action-button]',
    ) as HTMLElement | null;
    if (!playBtn) return;
  }

  if (autoSpeakQueue.length === 0) playBtn.click();
  autoSpeakQueue.push(playBtn);
}

/**
 * Listen for clicks on the message more-actions button so we can inject
 * the "Download audio" menu item.
 */
export function addMessageMoreActionMenuEventListener(): void {
  document.body.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement)?.closest('button') as HTMLElement | null;
    if (
      !btn ||
      !btn.querySelector('svg > use[href*="f6d0e2"]') ||
      btn.getAttribute('aria-haspopup') !== 'menu' ||
      !btn.parentElement?.id.startsWith('message-actions-')
    )
      return;

    const convId = getConversationIdFromUrl();
    const messageId = btn.parentElement.id.replace('message-actions-', '');
    if (convId) addDownloadAudioMenuItem(convId, messageId);
  });
}

/**
 * Inject a "Download audio" menu item into the message actions radix menu.
 */
export async function addDownloadAudioMenuItem(conversationId: string, messageId: string): Promise<void> {
  const menu = document.body.querySelector('div[role="menu"]');
  if (!menu) return;

  const items = menu.querySelectorAll('div[role="menuitem"]');
  if (!items || items.length === 0) return;

  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });

  // Only show if TTS button exists
  if (!document.querySelector('div[role="menuitem"][data-testid=voice-play-turn-action-button]')) return;

  const downloadIcon =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md text-token-text-primary"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.70711 10.2929C7.31658 9.90237 6.68342 9.90237 6.29289 10.2929C5.90237 10.6834 5.90237 11.3166 6.29289 11.7071L11.2929 16.7071C11.6834 17.0976 12.3166 17.0976 12.7071 16.7071L17.7071 11.7071C18.0976 11.3166 18.0976 10.6834 17.7071 10.2929C17.3166 9.90237 16.6834 9.90237 16.2929 10.2929L13 13.5858L13 4C13 3.44771 12.5523 3 12 3C11.4477 3 11 3.44771 11 4L11 13.5858L7.70711 10.2929ZM5 19C4.44772 19 4 19.4477 4 20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20C20 19.4477 19.5523 19 19 19L5 19Z" fill="currentColor"></path></svg>';

  interface MenuAction {
    text: string;
    icon: string;
    requirePro: boolean;
    click: (ctx: {
      menuButton: HTMLElement;
      conversationId: string;
      messageId: string;
      hasSubscription: boolean;
      event: MouseEvent;
    }) => Promise<void>;
  }

  const actions: MenuAction[] = [
    {
      text: 'Download audio',
      icon: downloadIcon,
      requirePro: true,
      click: async (ctx) => {
        if (!ctx.hasSubscription) {
          errorUpgradeConfirmation({
            title: 'This is a Pro feature',
            message: 'Downloading message audio requires a Pro subscription. Upgrade to Pro to remove all limits.',
          });
          closeRadix(ctx.event, ctx.menuButton);
          return;
        }
        const spinnerColor = isDarkMode() ? '#fff' : '#000';
        ctx.menuButton.innerHTML = `<div class="flex min-w-0 grow items-center gap-2.5"><svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-md"><circle fill="transparent" stroke="${spinnerColor}" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>Downloading...</div>`;
        await downloadAudio(ctx.conversationId, ctx.messageId);
        closeRadix(ctx.event, ctx.menuButton);
      },
    },
  ];

  const firstItem = items[0]!;
  const lastItem = items[items.length - 1]!;

  actions.forEach((action) => {
    const clone = firstItem.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-color');
    clone.classList.add('hover:bg-token-surface-hover');
    lastItem.after(clone);

    const proLabel =
      !action.requirePro || hasSub
        ? ''
        : '<span class="text-white rounded-md bg-green-500 px-2 text-sm ml-auto">Pro</span>';

    clone.innerHTML = `<div class="flex min-w-0 grow items-center gap-2.5">${action.icon}${translate(action.text)}${proLabel}</div>`;

    clone.addEventListener('click', (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      action.click({
        menuButton: clone,
        conversationId,
        messageId,
        hasSubscription: hasSub,
        event: ev,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Side-by-side voice mode SVG constants
// Original: content.isolated.end.js line 7107-7108
// ---------------------------------------------------------------------------

const sidebysideExpandSVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-lg text-token-main-surface-primary-inverse" viewBox="0 0 512 512"><path d="M183 295l-81.38 81.38l-47.03-47.03c-6.127-6.117-14.29-9.367-22.63-9.367c-4.117 0-8.279 .8086-12.25 2.43c-11.97 4.953-19.75 16.63-19.75 29.56v135.1C.0013 501.3 10.75 512 24 512h136c12.94 0 24.63-7.797 29.56-19.75c4.969-11.97 2.219-25.72-6.938-34.87l-47.03-47.03l81.38-81.38c9.375-9.375 9.375-24.56 0-33.94S192.4 285.7 183 295zM487.1 0h-136c-12.94 0-24.63 7.797-29.56 19.75c-4.969 11.97-2.219 25.72 6.938 34.87l47.04 47.03l-81.38 81.38c-9.375 9.375-9.375 24.56 0 33.94s24.56 9.375 33.94 0l81.38-81.38l47.03 47.03c6.127 6.117 14.3 9.35 22.63 9.35c4.117 0 8.275-.7918 12.24-2.413C504.2 184.6 512 172.9 512 159.1V23.1C512 10.75 501.3 0 487.1 0z"/></svg>';

const sidebysideCollapseSVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-lg text-token-main-surface-primary-inverse" viewBox="0 0 512 512"><path d="M488.1 23.03c-9.375-9.375-24.56-9.375-33.94 0l-81.38 81.38l-47.03-47.03c-6.127-6.117-14.3-9.35-22.63-9.35c-4.117 0-8.275 .7918-12.24 2.413c-11.97 4.953-19.75 16.63-19.75 29.56v135.1c0 13.25 10.74 23.1 24 23.1h136c12.94 0 24.63-7.797 29.56-19.75c4.969-11.97 2.219-25.72-6.938-34.87l-47.04-47.03l81.38-81.38C498.3 47.59 498.3 32.41 488.1 23.03zM215.1 272h-136c-12.94 0-24.63 7.797-29.56 19.75C45.47 303.7 48.22 317.5 57.37 326.6l47.04 47.03l-81.38 81.38c-9.375 9.375-9.375 24.56 0 33.94s24.56 9.375 33.94 0l81.38-81.38l47.03 47.03c6.127 6.117 14.29 9.367 22.63 9.367c4.117 0 8.279-.8086 12.25-2.43c11.97-4.953 19.75-16.63 19.75-29.56V296C239.1 282.7 229.3 272 215.1 272z"/></svg>';

// ---------------------------------------------------------------------------
// Speech button detection & voice mode
// Original: content.isolated.end.js lines 7732-7803
// ---------------------------------------------------------------------------

/**
 * Query for the speech/voice button in the composer form.
 *
 * Original: content.isolated.end.js line 7732
 */
export function getSpeechButton(): HTMLElement | null {
  return (
    document.querySelector('main form div[data-testid="composer-speech-button-container"]') ||
    document
      .querySelector(
        'main form button svg > path[d="M7.91667 3.33331C8.60702 3.33331 9.16667 3.89296 9.16667 4.58331V15.4166C9.16667 16.107 8.60702 16.6666 7.91667 16.6666C7.22631 16.6666 6.66667 16.107 6.66667 15.4166V4.58331C6.66667 3.89296 7.22631 3.33331 7.91667 3.33331ZM12.0833 5.83331C12.7737 5.83331 13.3333 6.39296 13.3333 7.08331V12.9166C13.3333 13.607 12.7737 14.1666 12.0833 14.1666C11.393 14.1666 10.8333 13.607 10.8333 12.9166V7.08331C10.8333 6.39296 11.393 5.83331 12.0833 5.83331ZM3.75 7.49998C4.44036 7.49998 5 8.05962 5 8.74998V11.25C5 11.9403 4.44036 12.5 3.75 12.5C3.05964 12.5 2.5 11.9403 2.5 11.25V8.74998C2.5 8.05962 3.05964 7.49998 3.75 7.49998ZM16.25 7.49998C16.9404 7.49998 17.5 8.05962 17.5 8.74998V11.25C17.5 11.9403 16.9404 12.5 16.25 12.5C15.5596 12.5 15 11.9403 15 11.25V8.74998C15 8.05962 15.5596 7.49998 16.25 7.49998Z"]',
      )
      ?.closest('button') ||
    document.querySelector('main form button svg > use[href*="f8aa74"]')?.closest('button') ||
    document.querySelector('main form button svg > use[href*="ac37b7"]')?.closest('button') ||
    null
  );
}

/**
 * Observe body mutations until the speech button appears, then attach
 * event listener and disconnect.
 *
 * Original: content.isolated.end.js line 7742
 */
export function observeSpeechButtonAvailability(): void {
  const observer = new MutationObserver(() => {
    const btn = getSpeechButton();
    if (btn) {
      addSpeechButtonEventListener(btn);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Attach click listener to speech button — opens bloop side-by-side UI.
 *
 * Original: content.isolated.end.js line 7753
 */
function addSpeechButtonEventListener(el: HTMLElement): void {
  el.addEventListener('click', () => {
    setTimeout(() => {
      bloopObserverCallback();
    }, 100);
  });
}

/**
 * Inject a side-by-side voice mode button into the bloop voice UI
 * when the bloop container is detected.
 *
 * Original: content.isolated.end.js line 7761
 */
function bloopObserverCallback(): void {
  const { sidebysideVoice } = cachedSettings;
  if (
    !document.querySelector('#sidebyside-voice-button') &&
    document.querySelector('div[class*="min-h-bloop min-w-bloop"]')
  ) {
    const closeBtn = document
      .querySelector('div[class*="lk-room-container"] button svg > use[href*="85f94b"]')
      ?.closest('button') as HTMLElement | null;
    if (!closeBtn) return;
    closeBtn.id = 'sidebyside-close-button';
    const parent = closeBtn.parentElement?.parentElement;
    if (!parent) return;

    const clone = parent.cloneNode(true) as HTMLElement;
    clone.id = 'sidebyside-voice-button';
    const svgEl = clone.querySelector('svg');
    if (svgEl) {
      svgEl.outerHTML = sidebysideVoice ? sidebysideExpandSVG : sidebysideCollapseSVG;
    }
    clone.addEventListener('click', async () => {
      const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
      if (!hasSub) {
        errorUpgradeConfirmation({
          title: 'This is a Pro feature',
          message:
            'Using the Side by Side voice mode requires a Pro subscription. Upgrade to Pro to remove all limits.',
        });
        return;
      }
      setVoiceModeWrapper(!cachedSettings.sidebysideVoice);
      chrome.storage.local.set({
        settings: { ...cachedSettings, sidebysideVoice: !cachedSettings.sidebysideVoice },
      });
    });
    parent.parentElement?.appendChild(clone);
    setVoiceModeWrapper(sidebysideVoice);
  }
}

/**
 * Resize/position the voice mode wrapper for side-by-side or fullscreen.
 *
 * Original: content.isolated.end.js line 7791
 */
async function setVoiceModeWrapper(enabled: boolean): Promise<void> {
  const closeBtn = document
    .querySelector('div[class*="lk-room-container"] button svg > use[href*="85f94b"]')
    ?.closest('button') as HTMLElement | null;
  if (!closeBtn) return;
  const parent = closeBtn.parentElement?.parentElement;
  if (!parent) return;
  const wrapper = parent.closest('div[class*="top-0 z-50 flex h-full w-full"]') as HTMLElement | null;
  if (!wrapper) return;

  wrapper.classList.add('end-0', 'border', 'border-token-border-medium', 'rounded-2xl', 'shadow-long');
  wrapper.classList.remove('start-0');

  if (enabled) {
    wrapper.style.cssText =
      'opacity: 1; will-change: auto; height: 500px; width: 300px; transform: scale(.5); cursor: grab;';
    makeElementDraggable(wrapper);
  } else {
    wrapper.style.cssText = 'opacity: 1; will-change: auto;';
    disableDraggable(wrapper);
  }

  const voiceBtn = document.querySelector('#sidebyside-voice-button') as HTMLElement | null;
  if (!voiceBtn) return;
  const svg = voiceBtn.querySelector('svg');
  if (svg) {
    svg.outerHTML = enabled ? sidebysideExpandSVG : sidebysideCollapseSVG;
  }
}

// ---------------------------------------------------------------------------
// Plus button observer & gallery menu injection
// Original: content.isolated.end.js lines 7805-7841
// ---------------------------------------------------------------------------

/**
 * Observe body mutations until the plus (attach) button appears,
 * then attach event listener and disconnect.
 *
 * Original: content.isolated.end.js line 7805
 */
export function observePlusButtonAvailability(): void {
  const observer = new MutationObserver(() => {
    const btn = getPlusButton();
    if (btn) {
      plusButtonObserverCallback(btn);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * When plus button is clicked, inject "Select from gallery" into
 * the opened radix popover menu.
 *
 * Original: content.isolated.end.js line 7816
 */
function plusButtonObserverCallback(el: HTMLElement): void {
  el.addEventListener('click', () => {
    setTimeout(() => {
      addSelectFromGalleryButtonToMenu();
    }, 100);
  });
}

/**
 * Inject a "Select from gallery" menu item into the file-attach popover.
 *
 * Original: content.isolated.end.js line 7823
 */
async function addSelectFromGalleryButtonToMenu(): Promise<void> {
  const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
  if (document.querySelector('#select-from-gallery-button')) return;

  const menuItem = document
    .querySelector('div[data-radix-popper-content-wrapper] div[role="menuitem"] svg > use[href*="712359"]')
    ?.closest('div[role="menuitem"]') as HTMLElement | null;
  if (!menuItem || menuItem.parentElement!.innerText.includes('Delete')) return;

  const clone = menuItem.cloneNode(true) as HTMLElement;
  clone.id = 'select-from-gallery-button';
  clone.classList.add('gap-1.5', 'hover:bg-token-main-surface-secondary');
  clone.innerHTML = `<div class="flex shrink-0 items-center justify-center group-disabled:opacity-50 group-data-disabled:opacity-50 icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="icon icon-sm" fill="currentColor"><path d="M152 120c-26.51 0-48 21.49-48 48s21.49 48 48 48s48-21.49 48-48S178.5 120 152 120zM447.1 32h-384C28.65 32-.0091 60.65-.0091 96v320c0 35.35 28.65 64 63.1 64h384c35.35 0 64-28.65 64-64V96C511.1 60.65 483.3 32 447.1 32zM463.1 409.3l-136.8-185.9C323.8 218.8 318.1 216 312 216c-6.113 0-11.82 2.768-15.21 7.379l-106.6 144.1l-37.09-46.1c-3.441-4.279-8.934-6.809-14.77-6.809c-5.842 0-11.33 2.529-14.78 6.809l-75.52 93.81c0-.0293 0 .0293 0 0L47.99 96c0-8.822 7.178-16 16-16h384c8.822 0 16 7.178 16 16V409.3z"/></svg></div>Select from gallery  ${hasSub ? '' : '<span class="ms-auto text-white rounded-md bg-green-500 px-2 text-sm">Pro</span>'}`;

  clone.addEventListener('click', async (ev) => {
    closeMenus();
    closeRadix(ev as MouseEvent);
    if (!hasSub) {
      errorUpgradeConfirmation({
        title: 'This is a Pro feature',
        message: 'Using the Gallery requires a Pro subscription. Upgrade to Pro to remove all limits.',
      });
      return;
    }
    // Dynamically import to avoid circular dependency
    const { showImagePicker } = await import('./gallery');
    showImagePicker();
  });

  menuItem.parentElement!.appendChild(clone);
}

// ---------------------------------------------------------------------------
// Image attachment to input
// Original: content.isolated.end.js lines 7842-7867
// ---------------------------------------------------------------------------

/**
 * Download multiple images and attach them to the file input in the composer.
 *
 * Original: content.isolated.end.js line 7842
 */
export async function attachImagesToInput(images: Array<{ imageUrl: string; imageId: string }>): Promise<void> {
  const fileInput = document.querySelector('main form input[type="file"]') as HTMLInputElement | null;
  if (!fileInput) return;
  const dt = new DataTransfer();
  for (const img of images) {
    const blob = await downloadFileFromUrl(img.imageUrl, img.imageId, true);
    const file = new File([blob], `${img.imageId}.png`, { type: 'image/png' });
    dt.items.add(file);
  }
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Attach a single image blob to the file input in the composer.
 *
 * Original: content.isolated.end.js line 7857
 */
export function attachImageBlobToInput(blob: Blob, filename = 'screenshot.png'): void {
  if (!canAttacheFile(filename)) return;
  const fileInput = document.querySelector('main form input[type="file"]') as HTMLInputElement | null;
  if (!fileInput) return;
  const file = new File([blob], filename.toLowerCase(), { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}
