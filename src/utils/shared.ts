/**
 * Shared utility functions.
 *
 * Contains general-purpose helpers used across many feature modules.
 * Ported faithfully from content.isolated.end.js.
 */

import { translate } from '../content/features/i18n';
import { showConfirmDialog, toast } from '../content/isolated-world/ui/primitives';
import { cachedSettings } from '../content/isolated-world/settings';

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

/**
 * Check if the current ChatGPT theme is dark mode.
 *
 * Original: content.isolated.end.js line 5159
 */
export function isDarkMode(): boolean {
  return document.querySelector('html')?.classList.contains('dark') ?? false;
}

/**
 * Check if the current platform is Windows.
 *
 * Original: content.isolated.end.js line 5155
 */
export function isWindows(): boolean {
  return navigator.platform.indexOf('Win') > -1;
}

/**
 * Detect the browser vendor.
 *
 * Original: content.isolated.end.js line 5163
 */
export function getBrowser(): 'Chrome' | 'Firefox' | 'Edge' {
  return typeof chrome !== 'undefined'
    ? typeof (globalThis as any).browser !== 'undefined'
      ? 'Firefox'
      : 'Chrome'
    : 'Edge';
}

/**
 * Browser detection constants.
 *
 * Original: content.isolated.end.js line 5165-5166
 */
export const isFirefox = /firefox/i.test(navigator.userAgent);
export const isOpera = /opr\//i.test(navigator.userAgent);

// ---------------------------------------------------------------------------
// Async / timing
// ---------------------------------------------------------------------------

/**
 * Promise-based delay.
 *
 * Original: content.isolated.end.js line 5153
 */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Debounce a function. Supports dynamic delay via a function argument.
 *
 * Original: content.isolated.end.js line 5269
 */
export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number | (() => number) = 1000,
): ((...args: Parameters<T>) => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return function (this: any, ...args: Parameters<T>) {
    const invoke = () => {
      clearTimeout(timer);
      fn.apply(this, args);
    };
    clearTimeout(timer);
    if (typeof delay === 'function') {
      timer = setTimeout(invoke, delay());
    } else {
      timer = setTimeout(invoke, delay);
    }
  };
};

/**
 * Throttle a function (leading-edge).
 *
 * Original: content.isolated.end.js line 5281
 */
export const throttle = <T extends (...args: any[]) => any>(fn: T, delay = 100): ((...args: Parameters<T>) => void) => {
  let blocked = false;
  return function (this: any, ...args: Parameters<T>) {
    if (!blocked) {
      fn.apply(this, args);
      blocked = true;
      setTimeout(() => (blocked = false), delay);
    }
  };
};

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/**
 * Generate a random dark color as hex.
 *
 * Original: content.isolated.end.js line 5804
 */
export function generateRandomDarkColor(): string {
  const r = Math.floor(Math.random() * 180);
  const g = Math.floor(Math.random() * 180);
  const b = Math.floor(Math.random() * 180);
  const channels = [r, g, b];
  channels.sort(() => Math.random() - 0.5);
  return `#${channels[0]!.toString(16).padStart(2, '0')}${channels[1]!.toString(16).padStart(2, '0')}${channels[2]!.toString(16).padStart(2, '0')}`;
}

/**
 * Convert an `rgba(r,g,b,a)` CSS string to a hex color string.
 *
 * Original: content.isolated.end.js line 6357
 */
export function rgba2hex(rgba: string): string {
  if (!rgba) return '';
  const match = rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.?\d*))?\)$/);
  if (!match) return '';
  return `#${match
    .slice(1)
    .map((val, idx) =>
      (idx === 3 ? Math.round(parseFloat(val) * 255) : parseFloat(val))
        .toString(16)
        .padStart(2, '0')
        .replace('NaN', ''),
    )
    .join('')}`;
}

// ---------------------------------------------------------------------------
// String / text utilities
// ---------------------------------------------------------------------------

/**
 * Escape HTML entities using the DOM's built-in text node escaping.
 *
 * Original: content.isolated.end.js line 6160
 */
export function escapeHTML(text: string): string {
  const textNode = document.createTextNode(text);
  const p = document.createElement('p');
  p.appendChild(textNode);
  return p.innerHTML;
}

/**
 * Highlight `{{variable}}` bracket syntax with styled `<strong>` elements.
 *
 * Original: content.isolated.end.js line 6286
 */
export function highlightBracket(text: string): string {
  if (!text || text.trim().length === 0) return '';
  return text.replace(
    /\{\{.*?\}\}/g,
    (match) =>
      `<strong data-word="${match.replace(/[{}]/g, '')}" class="rounded-md bg-token-main-surface-tertiary italic border-2 border-token-border-medium" style="margin:0 2px; padding:1px 4px;">${match.replace(/[{}]/g, '')}</strong>`,
  );
}

/**
 * Get the character count of a string.
 *
 * Original: content.isolated.end.js line 5367
 */
export function getCharCount(text: string): number {
  return (text && text.length) || 0;
}

/**
 * Get the word count of a string.
 *
 * Original: content.isolated.end.js line 5371
 */
export function getWordCount(text: string): number {
  return (text && text.split(/[\s\n]+/).length) || 0;
}

// ---------------------------------------------------------------------------
// Date / time formatting
// ---------------------------------------------------------------------------

/**
 * Normalize various timestamp formats into millisecond epoch time.
 *
 * Handles ISO strings, unix seconds (10 digits), unix milliseconds
 * (13 digits), and float timestamps.
 *
 * Original: content.isolated.end.js line 6082
 */
export function formatTime(timestamp: any): number {
  if (!timestamp) return timestamp;
  const str = timestamp.toString();
  if (str.indexOf('T') !== -1) return new Date(timestamp).getTime();
  if (str.indexOf('.') !== -1 && str.split('.')[0].length === 10) return new Date(timestamp * 1000).getTime();
  if (str.indexOf('.') !== -1 && str.split('.')[0].length === 13) return new Date(timestamp).getTime();
  if (str.length === 13) return new Date(timestamp).getTime();
  if (str.length === 10) return new Date(timestamp * 1000).getTime();
  return timestamp;
}

/**
 * Format a Date into a human-readable string.
 *
 * Returns "Today"/"Yesterday" when applicable, with optional time.
 *
 * Original: content.isolated.end.js line 6086
 */
export function formatDate(date: Date | null | undefined, showTime = true, longFormat = false): string {
  if (!date) return '';
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const timeStr = showTime ? ` ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' })}` : '';

  if (
    now.getDate() === date.getDate() &&
    now.getMonth() === date.getMonth() &&
    now.getFullYear() === date.getFullYear()
  ) {
    return `Today${timeStr}`;
  }

  if (
    yesterday.getDate() === date.getDate() &&
    yesterday.getMonth() === date.getMonth() &&
    yesterday.getFullYear() === date.getFullYear()
  ) {
    return `Yesterday${timeStr}`;
  }

  return `${date.toLocaleDateString('en-US', {
    year: longFormat ? 'numeric' : '2-digit',
    month: longFormat ? 'long' : '2-digit',
    day: '2-digit',
  })}${timeStr}`;
}

// ---------------------------------------------------------------------------
// URL / navigation helpers
// ---------------------------------------------------------------------------

const CONV_ID_RE = /\/c\/(.*?)(\/|\?|#|$)/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the conversation UUID from a ChatGPT URL.
 *
 * Original: content.isolated.end.js (shared pattern across modules)
 */
export function getConversationIdFromUrl(url?: string): string | null {
  const href = url ?? window.location.href;
  const match = href.match(CONV_ID_RE);
  return match && match[1] && UUID_RE.test(match[1]) ? match[1] : null;
}

/**
 * Check if the current page is the new-chat page.
 *
 * When `includeGizmo` is true, also matches `/g/g-*` without `/c/`.
 *
 * Original: content.isolated.end.js line 10993
 */
export function isOnNewChatPage(includeGizmo = true): boolean {
  return includeGizmo
    ? window.location.pathname === '/' ||
        (window.location.pathname.startsWith('/g/g-') && !window.location.pathname.includes('/c/'))
    : window.location.pathname === '/';
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Get the ChatGPT submit/send button from the composer.
 *
 * Uses multiple fallback selectors to handle different ChatGPT UI versions.
 *
 * Original: content.isolated.end.js line 7724
 */
export function getSubmitButton(): HTMLButtonElement | null {
  return (
    (document.querySelector(
      'main form button[id="composer-submit-button"][data-testid*="send-button"]',
    ) as HTMLButtonElement | null) ||
    (document
      .querySelector(
        'main form button svg > path[d="M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z"]',
      )
      ?.closest('button') as HTMLButtonElement | null) ||
    (document
      .querySelector('main form button svg > use[href*="01bab7"]')
      ?.closest('button') as HTMLButtonElement | null)
  );
}

/**
 * Flash an article element with a gold highlight and scroll it into view.
 *
 * Original: content.isolated.end.js line 5405
 */
export function flashArticle(el: HTMLElement, _direction = 'up'): void {
  el.style.transition = 'background-color 0.5s ease';
  el.style.backgroundColor = '#ffd70030';
  setTimeout(() => {
    el.style.backgroundColor = '';
  }, 1000);
  const rect = el.getBoundingClientRect();
  if (!(rect.top >= 0 && rect.bottom <= window.innerHeight)) {
    el.scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
      block: 'start',
    });
  }
}

/**
 * Reposition a menu element if it overflows the viewport bottom.
 *
 * Original: content.isolated.end.js line 5334
 */
export function adjustMenuPosition(el: HTMLElement | null): void {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    const height = el.offsetHeight;
    el.style.top = `-${height + 8}px`;
    const newRect = el.getBoundingClientRect();
    if (newRect.top < 0) {
      el.style.top = `-${height + newRect.top - 24}px`;
    }
  }
}

// ---------------------------------------------------------------------------
// Menu / modal closing
// ---------------------------------------------------------------------------

/**
 * Close all open SP context menus.
 *
 * Original: content.isolated.end.js line 5706
 */
export function closeMenus(): void {
  const menus = document.querySelectorAll('[id$=-menu]');
  if (menus.length > 0) menus.forEach((m) => m.remove());
}

/**
 * Close all open SP modals.
 *
 * Original: content.isolated.end.js line 5711
 */
export function closeModals(): void {
  const modals = document.querySelectorAll('[id^=modal-]');
  if (modals.length > 0) modals.forEach((m) => m.remove());
}

/**
 * Close Radix UI popper menus by dispatching an Escape event.
 *
 * Original: content.isolated.end.js line 5716
 */
export function closeRadix(event: Event, btn: HTMLElement | null = null): void {
  if (
    (event.target as HTMLElement)?.closest('div[data-radix-popper-content-wrapper]') ||
    (btn && btn.closest('div[data-radix-popper-content-wrapper]'))
  ) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.body.style.pointerEvents = 'auto';
    document.body.click();
  }
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/**
 * Copy text to clipboard and show a toast notification.
 *
 * Original: content.isolated.end.js line 15059
 */
export function copyToClipboard(text: string, label = 'text'): void {
  navigator.clipboard.writeText(text).then(
    () => {
      toast(`Conversation ${label} copied to clipboard`);
    },
    () => {
      toast('Failed to copy conversation to clipboard', 'error');
    },
  );
}

// ---------------------------------------------------------------------------
// File download
// ---------------------------------------------------------------------------

/**
 * Download a file from a URL, optionally returning the blob instead of
 * triggering a browser download.
 *
 * Original: content.isolated.end.js line 6340
 */
export async function downloadFileFromUrl(url: string, filename: string, asBlob = false): Promise<Blob> {
  let resolvedUrl = url;
  // Handle relative ChatGPT content URLs
  if (resolvedUrl.startsWith('/api/content') || resolvedUrl.startsWith('/backend-api/content')) {
    resolvedUrl = `https://chatgpt.com${resolvedUrl}`;
  }
  // TODO: Add cache-busting for Council CDN URLs when applicable
  const response = await fetch(resolvedUrl, {
    method: 'GET',
    headers: { origin: 'https://chatgpt.com' },
  });
  const blob = await response.blob();
  if (asBlob) return blob;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.style.display = 'none';
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return blob;
}

// ---------------------------------------------------------------------------
// Upgrade / subscription
// ---------------------------------------------------------------------------

/**
 * Show a confirmation dialog for errors that require a Pro upgrade.
 *
 * Original: content.isolated.end.js line 9027
 */
export function errorUpgradeConfirmation(error: { type?: string; title?: string; message?: string }): void {
  showConfirmDialog(
    `<div class="flex items-center">${translate(error.title ?? '')} <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-sm ms-2" viewBox="0 0 512 512"><path d="M506.3 417l-213.3-364c-16.33-28-57.54-28-73.98 0l-213.2 364C-10.59 444.9 9.849 480 42.74 480h426.6C502.1 480 522.6 445 506.3 417zM232 168c0-13.25 10.75-24 24-24S280 154.8 280 168v128c0 13.25-10.75 24-23.1 24S232 309.3 232 296V168zM256 416c-17.36 0-31.44-14.08-31.44-31.44c0-17.36 14.07-31.44 31.44-31.44s31.44 14.08 31.44 31.44C287.4 401.9 273.4 416 256 416z"/></svg></div>`,
    error.message ?? '',
    translate('Maybe later'),
    translate('Upgrade to Pro'),
    null,
    () => openUpgradeModal(),
    'green',
  );
}

/**
 * Open the upgrade-to-Pro subscription modal.
 *
 * Builds a two-column Free vs Pro comparison with Stripe payment links.
 *
 * Original: content.isolated.end.js line 8819 (~200 lines)
 */
export function openUpgradeModal(isPro = false): void {
  chrome.storage.local.set({ lastSubscriptionCheck: null });
  chrome.storage.local.get(
    {
      STRIPE_PAYMENT_LINK_ID: '8wM5nW6oq7y287ufZ8',
      STRIPE_PORTAL_LINK_ID: '00g0237Sr78wcM03cc',
    },
    (result) => {
      const paymentLink = result.STRIPE_PAYMENT_LINK_ID;
      const portalLink = result.STRIPE_PORTAL_LINK_ID;
      const offerLine = isPro ? '' : '<span class="text-xs self-end pb-1">Limited time offer</span>';
      const priceLine = isPro
        ? ''
        : 'USD <span class="line-through">$19.99</span> <span>$10/month <span class="text-xs">(billed yearly) - or - $15/mo (billed monthly)</span></span>';

      chrome.storage.sync.get(['email'], ({ email }) => {
        const emailParam = email ? `?prefilled_email=${encodeURIComponent(email)}` : '';
        const html = `<div id="upgrade-to-pro-modal" style="position:fixed;top:0;left:0;width:100vw;height:100vh;display:flex;justify-content:center;align-items:center;z-index:100000;" class="bg-black/50 dark:bg-black/80">
  <div id="upgrade-to-pro-modal-content" style="border-radius:12px;max-width:800px;width:90vw;max-height:90vh;overflow-y:auto;padding:32px;" class="bg-token-sidebar-surface-primary text-token-text-primary">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
      <h2 style="font-size:1.5em;font-weight:bold;">${translate('Council')}</h2>
      <button id="upgrade-modal-close-button" class="text-token-text-tertiary hover:text-token-text-primary" style="font-size:1.5em;cursor:pointer;">&times;</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div style="border:1px solid var(--token-border-medium,#333);border-radius:12px;padding:24px;">
        <h3 style="font-size:1.2em;font-weight:bold;margin-bottom:8px;">${translate('Free')}</h3>
        <p class="text-token-text-tertiary text-sm" style="margin-bottom:16px;">Basic features</p>
        <ul style="list-style:none;padding:0;margin:0;">
          <li style="padding:4px 0;">&#10003; ${translate('Conversation folders')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Basic prompts')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Export conversations')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Custom instructions')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Keyboard shortcuts')}</li>
        </ul>
      </div>
      <div style="border:2px solid #19c37d;border-radius:12px;padding:24px;position:relative;">
        ${isPro ? '<div style="position:absolute;top:-12px;right:16px;background:#19c37d;color:white;padding:2px 12px;border-radius:12px;font-size:0.8em;">Your current plan</div>' : ''}
        <h3 style="font-size:1.2em;font-weight:bold;margin-bottom:8px;">&#9889; ${translate('Pro')}</h3>
        <div class="text-sm" style="margin-bottom:8px;">${offerLine}</div>
        <div class="text-sm" style="margin-bottom:16px;">${priceLine}</div>
        <ul style="list-style:none;padding:0;margin:0;">
          <li style="padding:4px 0;">&#10003; ${translate('Everything in Free')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Unlimited folders & subfolders')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Unlimited prompts & steps')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Image gallery')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Notes & annotations')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('GPT Store analytics')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Advanced export (PDF, Markdown)')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Auto-sync & backup')}</li>
          <li style="padding:4px 0;">&#10003; ${translate('Priority support')}</li>
        </ul>
        ${isPro ? `<a href="https://billing.stripe.com/p/login/${portalLink}" target="_blank" style="display:block;text-align:center;margin-top:16px;padding:12px;background:#19c37d;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Manage subscription</a>` : `<a href="https://buy.stripe.com/${paymentLink}${emailParam}" target="_blank" style="display:block;text-align:center;margin-top:16px;padding:12px;background:#19c37d;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Upgrade to Pro</a>`}
      </div>
    </div>
  </div>
</div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        document.querySelector('#upgrade-modal-close-button')?.addEventListener('click', () => {
          document.querySelector('#upgrade-to-pro-modal')?.remove();
        });
        const content = document.querySelector('#upgrade-to-pro-modal-content') as HTMLElement | null;
        document.querySelector('#upgrade-to-pro-modal')?.addEventListener('click', (ev) => {
          if (content && !content.contains(ev.target as Node)) {
            document.querySelector('#upgrade-to-pro-modal')?.remove();
          }
        });
      });
    },
  );
}

/**
 * Create an "Upgrade to Pro" button for the manager UI.
 *
 * Original: content.isolated.end.js line 9031
 */
export function managerUpgradeButton(feature: string, subtitle = '', size: 'lg' | 'sm' = 'lg'): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'group relative flex flex-col w-full justify-start items-start cursor-pointer';
  const lightningPath =
    'M240.5 224H352C365.3 224 377.3 232.3 381.1 244.7C386.6 257.2 383.1 271.3 373.1 280.1L117.1 504.1C105.8 513.9 89.27 514.7 77.19 505.9C65.1 497.1 60.7 481.1 66.59 467.4L143.5 288H31.1C18.67 288 6.733 279.7 2.044 267.3C-2.645 254.8 .8944 240.7 10.93 231.9L266.9 7.918C278.2-1.92 294.7-2.669 306.8 6.114C318.9 14.9 323.3 30.87 317.4 44.61L240.5 224z';
  if (size === 'lg') {
    wrapper.innerHTML = `<div id="upgrade-to-pro-button-${feature}" class="relative flex flex-col flex-wrap w-full h-full justify-center items-center gap-2 p-1 text-black cursor-pointer bg-gold hover:bg-gold-dark hover:shadow-xl rounded-xl" style="aspect-ratio:1;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width:42px;height:42px;" stroke="purple" fill="purple"><path d="${lightningPath}"></path></svg>
      <div class="w-full text-sm font-bold flex justify-center">Upgrade to Pro</div>
      <div class="text-xs w-full flex justify-center">${subtitle}</div>
    </div>`;
  } else {
    wrapper.innerHTML = `<div id="upgrade-to-pro-button-${feature}" class="relative flex w-full h-full justify-center items-center gap-2 p-1 text-black cursor-pointer bg-gold hover:bg-gold-dark hover:shadow-xl rounded-xl">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width:28px;height:28px;" stroke="purple" fill="purple"><path d="${lightningPath}"></path></svg>
      <div class="w-full flex flex-col flex-wrap text-sm font-bold flex justify-center"><span>Upgrade to Pro</span><div class="text-xs w-full font-normal flex justify-start">${subtitle}</div></div>
    </div>`;
  }
  wrapper.addEventListener('click', () => openUpgradeModal(false));
  return wrapper;
}

// ---------------------------------------------------------------------------
// Modal factory
// ---------------------------------------------------------------------------

/**
 * Create a full-featured modal dialog with title, subtitle, body, and
 * action bar. Supports fullscreen toggle and optional side tab.
 *
 * Original: content.isolated.end.js line 14263
 */
export function createModal(
  title: string,
  subtitle: string,
  content: HTMLElement,
  actions: HTMLElement,
  closable = false,
  size: 'small' | 'large' = 'small',
  sideTab: HTMLElement | null = null,
  startFullscreen = false,
): void {
  const modalId = title.toLowerCase().replaceAll(' ', '-');

  const overlay = document.createElement('div');
  overlay.id = `modal-${modalId}`;
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;display:flex;justify-content:center;align-items:center;z-index:10000;';
  overlay.className = 'bg-black/50 dark:bg-black/80';

  const wrapper = document.createElement('div');
  wrapper.id = `modal-wrapper-${modalId}`;
  wrapper.style.cssText =
    'border-radius:8px;display:flex;flex-direction:row;box-shadow:rgb(0 0 0 / 72%) 0px 0px 20px 0px;';
  wrapper.className = 'bg-white dark:bg-black text-token-text-primary';

  if (startFullscreen) {
    wrapper.style.maxWidth = 'none';
    wrapper.style.width = '100vw';
    wrapper.style.height = '100vh';
  } else {
    wrapper.style.maxWidth = '1400px';
    wrapper.style.width = window.innerWidth > 780 ? (size === 'small' ? '65vw' : '90vw') : '100vw';
    wrapper.style.height = window.innerWidth > 780 ? (size === 'small' ? '80vh' : '90vh') : '80vh';
  }

  overlay.appendChild(wrapper);

  // Close on backdrop click
  overlay.addEventListener('mousedown', (ev) => {
    const w = document.querySelector(`[id="modal-wrapper-${modalId}"]`);
    if (w && !w.contains(ev.target as Node)) {
      closeMenus();
      window.location.hash = '';
      overlay.remove();
    }
  });

  // Resize handler
  window.addEventListener('resize', () => {
    wrapper.style.width = window.innerWidth > 780 ? (size === 'small' ? '65vw' : '90vw') : '100vw';
    wrapper.style.height = window.innerWidth > 780 ? (size === 'small' ? '80vh' : '90vh') : '80vh';
  });

  // Optional side tab
  if (sideTab) {
    const sideEl = document.createElement('div');
    sideEl.id = 'modal-sidetab';
    sideEl.className = 'bg-token-sidebar-surface-secondary rounded-s-md';
    sideEl.style.cssText =
      'width:64px;border-radius:8px 0 0 8px;display:flex;flex-direction:column;justify-content:start;align-items:start;';
    sideEl.appendChild(sideTab);
    wrapper.appendChild(sideEl);
  }

  // Main content area
  const main = document.createElement('div');
  main.id = 'modal-main';
  main.className = `bg-token-sidebar-surface-primary ${sideTab ? 'rounded-e-md' : 'rounded-md'}`;
  main.style.cssText = `display:flex;flex-direction:column;justify-content:space-between;padding:16px;width:calc(100% - ${sideTab ? '64px' : '0px'});height:100%;`;
  wrapper.appendChild(main);

  // Header row
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const titleGroup = document.createElement('div');
  titleGroup.style.cssText = 'display:flex;align-items:start;flex-direction:column;';

  const titleEl = document.createElement('div');
  titleEl.id = 'modal-title';
  titleEl.className = 'text-token-text-primary';
  titleEl.style.fontSize = '1.5em';
  titleEl.innerHTML = translate(title);

  const subtitleEl = document.createElement('div');
  subtitleEl.id = 'modal-subtitle';
  subtitleEl.className = 'text-xs text-token-text-tertiary my-1';
  subtitleEl.innerHTML = subtitle;

  titleGroup.appendChild(titleEl);
  titleGroup.appendChild(subtitleEl);
  header.appendChild(titleGroup);

  // Header buttons
  const headerButtons = document.createElement('div');
  headerButtons.style.cssText = 'display:flex;align-items:center;';

  // Fullscreen toggle
  if (closable) {
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.id = `modal-fullscreen-button-${modalId}`;
    fullscreenBtn.className =
      'me-2 p-2 rounded-lg text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-secondary focus-visible:bg-token-sidebar-surface-secondary';
    fullscreenBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5M.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5"/></svg>';
    fullscreenBtn.addEventListener('click', () => {
      if (wrapper.style.width === '100vw' && wrapper.style.height === '100vh') {
        wrapper.style.maxWidth = '1400px';
        wrapper.style.width = window.innerWidth > 780 ? (size === 'small' ? '65vw' : '90vw') : '100vw';
        wrapper.style.height = window.innerWidth > 780 ? (size === 'small' ? '80vh' : '90vh') : '80vh';
      } else {
        wrapper.style.maxWidth = 'none';
        wrapper.style.width = '100vw';
        wrapper.style.height = '100vh';
      }
    });
    headerButtons.appendChild(fullscreenBtn);
  }

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.id = `modal-close-button-${modalId}`;
  closeBtn.className =
    'text-xs text-token-text-tertiary border border-token-border-medium rounded-md px-3 py-2 hover:bg-token-main-surface-secondary cursor-pointer hover:text-token-text-primary';
  closeBtn.textContent = translate('Close');
  closeBtn.addEventListener('click', () => {
    closeMenus();
    window.location.hash = '';
    overlay.remove();
  });
  headerButtons.appendChild(closeBtn);
  header.appendChild(headerButtons);

  main.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.id = 'modal-body';
  body.className =
    'text-token-text-primary flex flex-col justify-between rounded-md h-full relative border border-token-border-medium';
  body.style.overflowY = 'hidden';
  body.appendChild(content);
  main.appendChild(body);

  // Action bar
  const actionBar = document.createElement('div');
  actionBar.id = 'modal-action-bar';
  actionBar.style.cssText = 'display:flex;justify-content:start;';
  actionBar.appendChild(actions);
  main.appendChild(actionBar);

  document.body.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// Textarea helpers
// ---------------------------------------------------------------------------

/**
 * Set the ChatGPT prompt textarea value, dispatch React events, and
 * place the cursor at the end.
 *
 * Original: content.isolated.end.js line 7228
 */
export function setTextAreaElementValue(value: string): void {
  const textArea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (!textArea) return;
  textArea.innerText = value;
  textArea.dispatchEvent(new Event('input', { bubbles: true }));
  textArea.dispatchEvent(new Event('change', { bubbles: true }));
  setSelectionAtEnd(textArea);
}

// ---------------------------------------------------------------------------
// Text cursor / selection utilities
// ---------------------------------------------------------------------------

let cachedSelectionPosition: {
  start: number;
  end: number;
  parentElement: HTMLElement;
} | null = null;

/**
 * Get the current text selection position within a `<p>` element.
 *
 * Original: content.isolated.end.js line 7473
 */
export function getSelectionPosition(): {
  start: number;
  end: number;
  parentElement: HTMLElement;
} | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return cachedSelectionPosition;
  const range = sel.getRangeAt(0);
  let container: Node | null = range.startContainer;
  if (container?.nodeType === Node.TEXT_NODE) container = container.parentElement;
  if (container && (container as HTMLElement).tagName === 'P') {
    let offset = 0;
    let found = false;
    (container as HTMLElement).childNodes.forEach((child) => {
      if (child === range.startContainer) {
        found = true;
        if (child.nodeType === Node.TEXT_NODE) {
          offset += range.startOffset;
        } else if (child.nodeName === 'BR') {
          offset += 1;
        }
      } else if (!found) {
        if (child.nodeType === Node.TEXT_NODE) {
          offset += child.textContent?.length ?? 0;
        } else if (child.nodeName === 'BR') {
          offset += 1;
        }
      }
    });
    const end = offset + range.toString().length;
    cachedSelectionPosition = {
      start: offset,
      end,
      parentElement: container as HTMLElement,
    };
    return cachedSelectionPosition;
  }
  return cachedSelectionPosition;
}

/**
 * Replace text between `start` and `end` positions with `text`,
 * placing cursor at the end.
 *
 * Original: content.isolated.end.js line 7494
 */
export function insertTextAtPosition(
  el: HTMLElement | ChildNode | null,
  text: string,
  start: number,
  end: number,
): void {
  if (!el || typeof start !== 'number' || typeof end !== 'number') {
    console.error('Invalid parameters');
    return;
  }
  const htmlEl = el as HTMLElement;
  const current = htmlEl.innerText;
  const before = current.slice(0, start);
  const after = current.slice(end);
  htmlEl.innerText = before + text + after;
  const rangeObj = document.createRange();
  const selection = window.getSelection();
  const { lastChild } = htmlEl;
  if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
    rangeObj.setStart(lastChild, (lastChild as Text).length);
  } else if (lastChild) {
    rangeObj.setStart(lastChild, lastChild.childNodes.length);
  } else {
    rangeObj.setStart(htmlEl, htmlEl.childNodes.length);
  }
  rangeObj.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(rangeObj);
}

/**
 * Find the position of the last occurrence of `char` before `offset`.
 *
 * Original: content.isolated.end.js line 7593
 */
export function previousCharPosition(el: HTMLElement, char = '/', offset = 0): number {
  if (!el || !el.hasChildNodes()) return -1;
  let pos = 0;
  let result = -1;

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (pos + text.length >= offset) {
        const sub = text.substring(0, offset - pos);
        const idx = sub.lastIndexOf(char);
        if (idx !== -1) result = pos + idx;
      }
      pos += text.length;
    } else if (node.nodeName === 'BR') {
      pos += 1;
    } else if (['P', 'DIV', 'BLOCKQUOTE'].includes(node.nodeName)) {
      node.childNodes.forEach(walk);
      pos += 1;
    } else {
      node.childNodes.forEach(walk);
    }
  }
  walk(el);
  return result;
}

/**
 * Get the character at a given position in the DOM tree.
 *
 * Original: content.isolated.end.js line 7643
 */
export function getCharAtPosition(el: HTMLElement, position: number): string | null {
  if (!el || !el.hasChildNodes()) return null;
  let pos = 0;
  let result: string | null = null;

  function walk(node: Node): void {
    if (result !== null) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (pos + text.length > position) {
        result = text[position - pos] ?? null;
        return;
      }
      pos += text.length;
    } else if (node.nodeName === 'BR') {
      if (pos === position) {
        result = '\n';
        return;
      }
      pos += 1;
    } else if (['P', 'DIV', 'BLOCKQUOTE'].includes(node.nodeName)) {
      node.childNodes.forEach(walk);
      if (pos === position && result === null) {
        result = '\n';
        return;
      }
      pos += 1;
    } else if (node.childNodes) {
      node.childNodes.forEach(walk);
    }
  }
  walk(el);
  return result;
}

/**
 * Place the text cursor at the very end of an element.
 *
 * Original: content.isolated.end.js line 7558
 */
export function setSelectionAtEnd(el: HTMLElement): void {
  if (!el || !el.hasChildNodes()) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  const range = document.createRange();
  let last: Node | null = el.lastChild;
  while (last && last.nodeType === Node.ELEMENT_NODE && last.hasChildNodes()) {
    last = last.lastChild;
  }
  if (!last) return;
  if (last.nodeType === Node.TEXT_NODE) {
    range.setStart(last, (last as Text).length);
    range.setEnd(last, (last as Text).length);
  } else {
    range.setStart(last, 0);
    range.setEnd(last, 0);
  }
  sel.addRange(range);
}

/**
 * Extract the text between two character positions in the DOM.
 *
 * Original: content.isolated.end.js line 7678
 */
export function getStringBetween(el: HTMLElement, start: number, end: number): string {
  if (!el || !el.hasChildNodes()) return '';
  let pos = 0;
  let result = '';

  function walk(node: Node): void {
    if (pos >= end) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      const len = text.length;
      if (pos + len > start && pos < end) {
        const sliceStart = Math.max(0, start - pos);
        const sliceEnd = Math.min(len, end - pos);
        result += text.substring(sliceStart, sliceEnd);
      }
      pos += len;
    } else if (node.nodeName === 'BR') {
      if (pos >= start && pos < end) result += '\n';
      pos += 1;
    } else if (['P', 'DIV', 'BLOCKQUOTE'].includes(node.nodeName)) {
      node.childNodes.forEach(walk);
      if (pos >= start && pos < end) result += '\n';
      pos += 1;
    } else if (node.childNodes) {
      node.childNodes.forEach(walk);
    }
  }
  walk(el);
  return result;
}

/**
 * Convert an element's innerHTML to use `<p>` tags instead of `<br>`.
 *
 * Original: content.isolated.end.js line 7462
 */
export function convertToParagraphs(el: HTMLElement): string {
  const { innerHTML, innerText } = el;
  if (!innerText) return innerHTML;
  let result = innerHTML.replace(/<br\s*\/?>/g, '</p><p>');
  result = result.replace(/<br class="ProseMirror-trailingBreak">/g, '');
  if (!result.startsWith('<p>')) result = `<p>${result}`;
  if (!result.endsWith('</p>')) result += '</p>';
  return result;
}

/** Count text length including breaks/tabs in a DOM node. */
function countNodeLengthWithBreaksAndTabs(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ').length;
  }
  if (node.nodeName === 'BR') return 1;
  if (['P', 'DIV', 'BLOCKQUOTE'].includes(node.nodeName)) {
    let count = 0;
    node.childNodes.forEach((child) => {
      count += countNodeLengthWithBreaksAndTabs(child);
    });
    return count + 1;
  }
  if (node.childNodes) {
    let count = 0;
    node.childNodes.forEach((child) => {
      count += countNodeLengthWithBreaksAndTabs(child);
    });
    return count;
  }
  return 0;
}

/** Walk backwards from a node to the parent, summing text lengths. */
function getOffsetWithBreaksAndTabs(node: Node, offset: number, parent: Node): number {
  let current: Node | null = node;
  let total = 0;
  while (current && current !== parent) {
    if (current.previousSibling) {
      current = current.previousSibling;
      total += countNodeLengthWithBreaksAndTabs(current);
    } else {
      current = current.parentNode;
    }
  }
  return total + offset;
}

/**
 * Get the selection offset relative to a parent element.
 *
 * Original: content.isolated.end.js line 7511
 */
export function getSelectionOffsetRelativeToParent(parent: HTMLElement): {
  start: number | null;
  end: number | null;
  node?: Node;
} {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: null, end: null };
  const range = sel.getRangeAt(0);
  let ancestor: Node | null = range.commonAncestorContainer;
  while (ancestor && ancestor !== parent) ancestor = ancestor.parentNode;
  if (!ancestor) return { start: null, end: null };
  const start = getOffsetWithBreaksAndTabs(range.startContainer, range.startOffset, parent);
  const end = getOffsetWithBreaksAndTabs(range.endContainer, range.endOffset, parent);
  return { start, end, node: range.startContainer };
}

// ---------------------------------------------------------------------------
// Conversation attachment detection
// ---------------------------------------------------------------------------

const HAS_ATTACHMENTS_CACHE = new WeakMap<object, { updateTime: unknown; hasAttachments: boolean }>();

export function conversationHasAttachments(conv: any): boolean | null {
  if (!conv || typeof conv !== 'object') return null;
  const updateTime = conv.update_time || null;
  const cached = HAS_ATTACHMENTS_CACHE.get(conv);
  if (cached && cached.updateTime === updateTime) return cached.hasAttachments;

  const mapping = conv.mapping;
  if (!mapping || typeof mapping !== 'object') return null;

  for (const key in mapping) {
    if (!Object.prototype.hasOwnProperty.call(mapping, key)) continue;
    const node = mapping[key];
    if (!node?.message?.metadata?.attachments) continue;
    const attachments = node.message.metadata.attachments;
    if (Array.isArray(attachments) && attachments.length > 0) {
      HAS_ATTACHMENTS_CACHE.set(conv, { updateTime, hasAttachments: true });
      return true;
    }
  }

  HAS_ATTACHMENTS_CACHE.set(conv, { updateTime, hasAttachments: false });
  return false;
}

// ---------------------------------------------------------------------------
// Resize observer
// ---------------------------------------------------------------------------

/**
 * Callback for resize observer — persists element width to settings.
 *
 * Original: content.isolated.end.js line 5289
 */
function resizeObserverCallback(width: number, settingsKey: string): void {
  if (settingsKey.startsWith('sp/')) {
    window.localStorage.setItem(settingsKey, String(Math.round(width)));
  } else {
    const settings = cachedSettings as Record<string, any>;
    settings[settingsKey] = Math.round(width);
    chrome.storage.local.set({ settings });
  }
}

/**
 * Observe an element's width changes (while mouse is down) and persist
 * the width to the given settings key.
 *
 * Original: content.isolated.end.js line 5299
 */
export function elementResizeObserver(el: HTMLElement, settingsKey: string): void {
  new ResizeObserver((entries) => {
    if (
      window.localStorage.getItem('sp/mouseDown') !== 'true' ||
      entries.length === 0 ||
      !entries[0]!.contentRect ||
      entries[0]!.target !== el
    ) {
      return;
    }
    const { width } = entries[0]!.contentRect;
    if (width !== 0) {
      resizeObserverCallback(width, settingsKey);
    }
  }).observe(el);
}

// ---------------------------------------------------------------------------
// Rich text clipboard
// ---------------------------------------------------------------------------

/**
 * Copy an element's rich text (HTML) to the clipboard.
 *
 * Cleans up `<pre>` blocks to keep only the code content before copying.
 *
 * Original: content.isolated.end.js line 5308
 */
export const copyRichText = (el: HTMLElement): void => {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('pre').forEach((pre) => {
    const codeContent = pre.firstChild ? (pre.firstChild as HTMLElement).lastElementChild : null;
    if (codeContent) {
      pre.innerHTML = codeContent.outerHTML;
    }
  });
  const html = clone.innerHTML.trim();
  const item = new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([html], { type: 'text/plain' }),
  });
  navigator.clipboard.write([item]);
};

// ---------------------------------------------------------------------------
// URL helpers (project / gizmo)
// ---------------------------------------------------------------------------

/**
 * Extract a project ID (e.g. `g-p-abc123`) from a URL path.
 *
 * Original: content.isolated.end.js line 6139
 */
export function getProjectIdFromUrl(url?: string): string | null {
  const target = url ?? window.location.pathname;
  const match = target.match(/g-(p-[a-f0-9]+)/);
  return match ? `g-${match[1]}` : null;
}

/**
 * Get the display name for a project, looking in the nav sidebar first,
 * then falling back to the project cache.
 *
 * Original: content.isolated.end.js line 6144
 */
export function getProjectName(projectId: string | null = null): string {
  let id = projectId;
  if (!id) {
    const fromUrl = getProjectIdFromUrl();
    if (!fromUrl) return 'New project';
    id = fromUrl;
  }
  const navLink = document.querySelector(`nav a[href^="/g/${id}"]`);
  if (navLink) return navLink.textContent ?? 'New project';
  // projectCache is not directly accessible here — fall back to a simple label.
  return 'New project';
}

/**
 * Check whether the current page is the "new gizmo" page for a given ID.
 *
 * Original: content.isolated.end.js line 10989
 */
export function isOnNewGizmoPage(gizmoId: string): boolean {
  return window.location.pathname.startsWith(`/g/${gizmoId}`) && !window.location.pathname.includes('/c/');
}

// ---------------------------------------------------------------------------
// Page navigation
// ---------------------------------------------------------------------------

/**
 * Reload the current page.
 *
 * Original: content.isolated.end.js line 10997
 */
export function refreshPage(): void {
  window.location.reload();
}

// ---------------------------------------------------------------------------
// File format helpers
// ---------------------------------------------------------------------------

/**
 * Map a logical format name to a file extension.
 *
 * Original: content.isolated.end.js line 14925
 */
export function fileFormatConverter(fmt: string): 'json' | 'txt' | 'md' | 'html' {
  switch (fmt) {
    case 'json':
      return 'json';
    case 'text':
      return 'txt';
    case 'markdown':
      return 'md';
    case 'html':
      return 'html';
    default:
      return 'txt';
  }
}

// ---------------------------------------------------------------------------
// Blurred placeholder list
// ---------------------------------------------------------------------------

/**
 * Return an HTML string for a blurred placeholder grid of GPT cards.
 *
 * Used as a loading / locked-content indicator in the GPT store.
 *
 * Original: content.isolated.end.js line 8636
 */
export function blurredList(): string {
  return '<div style="position:absolute;display: flex;flex-flow: wrap;justify-content: start;align-items: stretch;filter: blur(12px); pointer-events: none;"><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-SxYQO0Fq1ZkPagkFtg67DRVb?se=2123-10-12T23%3A57%3A32Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3Dagent_3.webp&amp;sig=pLlQh8oUktqQzhM09SDDxn5aakqFuM2FAPptuA0mbqc%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">DALL\xB7E</div> <div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">Let me turn your imagination into imagery</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div> </div> </div><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-id374Jq85g2WfDgpuOdAMTEk?se=2123-10-13T00%3A31%3A06Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3Dagent_2.png&amp;sig=qFnFnFDVevdJL3xvtDE8vysDpTQmkSlF1zhYLAMiqmM%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">Data Analysis</div> <div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">Drop in any files and I can help analyze and visualize your data</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div> </div> </div><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-i9IUxiJyRubSIOooY5XyfcmP?se=2123-10-13T01%3A11%3A31Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3Dgpt-4.jpg&amp;sig=ZZP%2B7IWlgVpHrIdhD1C9wZqIvEPkTLfMIjx4PFezhfE%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">ChatGPT Classic</div> <div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">The latest version of GPT-4 with no additional capabilities</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div> </div> </div><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-JxYoHzuJQ2TXHBYy6UGC4Xs8?se=2123-10-13T00%3A46%3A49Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3Dc0bba883-a507-42dd-acfd-211509efd97c.png&amp;sig=jZeFDXgC4ZbNC8mVNuQK7zeKS7ssRCh5QTlqa81WJEM%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">Game Time</div> <div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">I can quickly explain board games  or card games to players of any age. Let the games begin!</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div> </div> </div><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-MjvVb8L9Se5PdSC1gMLopCHh?se=2123-10-13T00%3A50%3A51Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3Dnegotiator.png&amp;sig=GDq28k4lIHIZbvXfm9PjQerwO1kGUnkNn6a5aQD/7/M%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">The Negotiator</div> <div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">I\u2019ll help you advocate for yourself  and get better outcomes. Become a great negotiator.</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div> </div> </div><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-KSheuuQR8UjcxzFjjSfjfEOP?se=2123-10-13T00%3A52%3A56Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3Dcreative-writing.png&amp;sig=MA3AFe4yhExdlgBje00y4%2BCLHpBkJ%2BUQKkiwknp46as%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">Creative Writing Coach</div> <div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">I\u2019m eager to read your work  and give you feedback to improve your skills.</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div> </div> </div><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-M12eDkWHmobmgj5mhcWkMMVI?se=2123-10-13T07%3A48%3A21Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3D28de0bdd-4c74-45a4-8d52-0fac85aea31a.png&amp;sig=KdG%2BVt6/480jvqtjdwa4DulLX7BRqVN6FQfuuS9QaVI%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">Cosmic Dream</div><div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">Visionary painter of digital wonder</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div> </div> </div><div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"> <div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"> <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"> <img src="https://files.oaiusercontent.com/file-soqNFMszjoxK9d3BFD3rAGA5?se=2123-10-13T00%3A53%3A58Z&amp;sp=r&amp;sv=2021-08-06&amp;sr=b&amp;rscc=max-age%3D31536000%2C%20immutable&amp;rscd=attachment%3B%20filename%3DTechSupport.jpg&amp;sig=ztG5CVAIZeK5/C/wQkWdewTJVlXtRmmSRd5Z7XRsJ04%3D" class="w-24 h-24 rounded-md border border-gray-300"> </div> <div class="text-lg font-bold">Tech Support Advisor</div> <div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">From setting up a printer to troubleshooting a device, I\u2019m here to help you step-by-step.</div> <div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div></div></div></div>';
}

// ---------------------------------------------------------------------------
// Copy cleanup
// ---------------------------------------------------------------------------

/**
 * Remove timestamp and character/word counter elements from a cloned DOM
 * node before copying to clipboard.
 *
 * Original: content.isolated.end.js line 22813
 */
export function removeTimeStampCounterFromCopy(el: HTMLElement): HTMLElement {
  el.querySelectorAll('#message-char-word-counter').forEach((counter) => {
    counter.remove();
  });
  el.querySelectorAll('#message-timestamp').forEach((ts) => {
    ts.remove();
  });
  return el;
}

// ---------------------------------------------------------------------------
// DOM button finders
// ---------------------------------------------------------------------------

/**
 * Find the "More actions" button inside a message article.
 *
 * Original: content.isolated.end.js line 7706
 */
export function getMoreActionsButton(root: Element | Document | null = null): HTMLButtonElement | null {
  const container = root || document;
  return (
    (container
      .querySelector('div[id^="message-actions-"] button svg > use[href*="f6d0e2"]')
      ?.closest('button') as HTMLButtonElement | null) ?? null
  );
}

/**
 * Find the thread left-arrow navigation button.
 *
 * Original: content.isolated.end.js line 7710
 */
export function getThreadLeftButton(root: Element | Document | null = null): Element | null {
  const container = root || document;
  return (
    container.querySelector(
      'svg > path[d="M14.7071 5.29289C15.0976 5.68342 15.0976 6.31658 14.7071 6.70711L9.41421 12L14.7071 17.2929C15.0976 17.6834 15.0976 18.3166 14.7071 18.7071C14.3166 19.0976 13.6834 19.0976 13.2929 18.7071L7.29289 12.7071C7.10536 12.5196 7 12.2652 7 12C7 11.7348 7.10536 11.4804 7.29289 11.2929L13.2929 5.29289C13.6834 4.90237 14.3166 4.90237 14.7071 5.29289Z"]',
    ) ?? container.querySelector('svg > use[href*="8ee2e9"]')
  );
}

/**
 * Find the thread right-arrow navigation button.
 *
 * Original: content.isolated.end.js line 7715
 */
export function getThreadRightButton(root: Element | Document | null = null): Element | null {
  const container = root || document;
  return (
    container.querySelector(
      'svg > path[d="M9.29289 18.7071C8.90237 18.3166 8.90237 17.6834 9.29289 17.2929L14.5858 12L9.29289 6.70711C8.90237 6.31658 8.90237 5.68342 9.29289 5.29289C9.68342 4.90237 10.3166 4.90237 10.7071 5.29289L16.7071 11.2929C16.8946 11.4804 17 11.7348 17 12C17 12.2652 16.8946 12.5196 16.7071 12.7071L10.7071 18.7071C10.3166 19.0976 9.68342 19.0976 9.29289 18.7071Z"]',
    ) ?? container.querySelector('svg > use[href*="b140e7"]')
  );
}

/**
 * Find the "+" (plus / attach) button in the prompt form.
 *
 * Original: content.isolated.end.js line 7720
 */
export function getPlusButton(): HTMLButtonElement | null {
  return (
    (document
      .querySelector(
        'main form button svg > path[d="M12 3C12.5523 3 13 3.44772 13 4L13 11H20C20.5523 11 21 11.4477 21 12C21 12.5523 20.5523 13 20 13L13 13L13 20C13 20.5523 12.5523 21 12 21C11.4477 21 11 20.5523 11 20L11 13L4 13C3.44772 13 3 12.5523 3 12C3 11.4477 3.44772 11 4 11L11 11L11 4C11 3.44772 11.4477 3 12 3Z"]',
      )
      ?.closest('button') as HTMLButtonElement | null) ??
    (document
      .querySelector('main form button svg > use[href*="6be74c"]')
      ?.closest('button') as HTMLButtonElement | null) ??
    null
  );
}

/**
 * Find the dictate / microphone button in the prompt form.
 *
 * Original: content.isolated.end.js line 7728
 */
export function getDictateButton(): HTMLButtonElement | null {
  return (
    (document
      .querySelector(
        'main form button svg > path[d="M15.7806 10.1963C16.1326 10.3011 16.3336 10.6714 16.2288 11.0234L16.1487 11.2725C15.3429 13.6262 13.2236 15.3697 10.6644 15.6299L10.6653 16.835H12.0833L12.2171 16.8486C12.5202 16.9106 12.7484 17.1786 12.7484 17.5C12.7484 17.8214 12.5202 18.0894 12.2171 18.1514L12.0833 18.165H7.91632C7.5492 18.1649 7.25128 17.8672 7.25128 17.5C7.25128 17.1328 7.5492 16.8351 7.91632 16.835H9.33527L9.33429 15.6299C6.775 15.3697 4.6558 13.6262 3.84992 11.2725L3.76984 11.0234L3.74445 10.8906C3.71751 10.5825 3.91011 10.2879 4.21808 10.1963C4.52615 10.1047 4.84769 10.2466 4.99347 10.5195L5.04523 10.6436L5.10871 10.8418C5.8047 12.8745 7.73211 14.335 9.99933 14.335C12.3396 14.3349 14.3179 12.7789 14.9534 10.6436L15.0052 10.5195C15.151 10.2466 15.4725 10.1046 15.7806 10.1963ZM12.2513 5.41699C12.2513 4.17354 11.2437 3.16521 10.0003 3.16504C8.75675 3.16504 7.74835 4.17343 7.74835 5.41699V9.16699C7.74853 10.4104 8.75685 11.418 10.0003 11.418C11.2436 11.4178 12.2511 10.4103 12.2513 9.16699V5.41699ZM13.5814 9.16699C13.5812 11.1448 11.9781 12.7479 10.0003 12.748C8.02232 12.748 6.41845 11.1449 6.41828 9.16699V5.41699C6.41828 3.43889 8.02221 1.83496 10.0003 1.83496C11.9783 1.83514 13.5814 3.439 13.5814 5.41699V9.16699Z"]',
      )
      ?.closest('button') as HTMLButtonElement | null) ??
    (document
      .querySelector('main form button svg > use[href*="29f921"]')
      ?.closest('button') as HTMLButtonElement | null) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Array comparison
// ---------------------------------------------------------------------------

/**
 * Order-independent array equality check.
 *
 * Returns `true` when both arrays contain the same elements regardless of order,
 * or when either argument is not an array.
 *
 * Original: content.isolated.end.js line 5172
 */
export function areSameArrays(a: unknown[], b: unknown[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!b.includes(a[i])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

/**
 * Play an `<audio>` element by id convention: `#${id}-sound`.
 *
 * Original: content.isolated.end.js line 5211
 */
export function playSound(id: string): void {
  const el = document.querySelector(`#${id}-sound`) as HTMLAudioElement | null;
  if (el) el.play();
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/**
 * Convert a number to a human-readable abbreviated string (1000 → "1.0k").
 *
 * Original: content.isolated.end.js line 5348
 */
export function convertNumberToHumanReadable(n: number): number | string {
  if (!n) return 0;
  if (n === 0) return n;
  const suffixes = ['', 'k', 'M', 'G', 'T', 'P', 'E'];
  const tier = (Math.log10(n) / 3) | 0;
  if (tier === 0) return n;
  const suffix = suffixes[tier];
  const scale = 10 ** (tier * 3);
  return (n / scale).toFixed(1) + suffix;
}

// ---------------------------------------------------------------------------
// Drag support
// ---------------------------------------------------------------------------

/**
 * Make an element draggable via mouse events.
 *
 * If an element with id `${el.id}header` exists it is used as the drag
 * handle; otherwise the element itself is the handle.
 *
 * Original: content.isolated.end.js line 6302
 */
export function makeElementDraggable(el: HTMLElement): void {
  let dx = 0;
  let dy = 0;
  let startX = 0;
  let startY = 0;

  const header = document.getElementById(`${el.id}header`);
  if (header) {
    header.onmousedown = dragMouseDown;
  } else {
    el.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e: MouseEvent): void {
    el.style.cursor = 'grabbing';
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e: MouseEvent): void {
    e.preventDefault();
    dx = startX - e.clientX;
    dy = startY - e.clientY;
    startX = e.clientX;
    startY = e.clientY;
    el.style.top = `${el.offsetTop - dy}px`;
    el.style.left = `${el.offsetLeft - dx}px`;
  }

  function closeDragElement(): void {
    el.style.cursor = 'grab';
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

/**
 * Remove drag handlers from an element (reverse of makeElementDraggable).
 *
 * Original: content.isolated.end.js line 6322
 */
export function disableDraggable(el: HTMLElement): void {
  const header = document.getElementById(`${el.id}header`);
  if (header) {
    header.onmousedown = null;
  } else {
    el.onmousedown = null;
  }
}

// ---------------------------------------------------------------------------
// String normalisation
// ---------------------------------------------------------------------------

/**
 * Normalize a string: strip diacritical marks and lowercase.
 *
 * Original: content.isolated.end.js line 6298
 */
export function normalizeString(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Clear all query parameters and hash from the current URL.
 *
 * Original: content.isolated.end.js line 5816
 */
export function resetQueryParams(): void {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  window.history.replaceState({}, '', url.toString());
}

// ---------------------------------------------------------------------------
// DOM element removal / CSS injection
// ---------------------------------------------------------------------------

/**
 * Remove all elements matching a CSS selector.
 *
 * Original: content.isolated.end.js line 6378
 */
export function removeElements(args: { selector?: string }): void {
  if (args?.selector) {
    document.querySelectorAll(args.selector).forEach((el) => el.remove());
  }
}

/**
 * Inject a `<style>` element into `<head>`.
 *
 * Original: content.isolated.end.js line 6384
 */
export function addCSS(args: { css?: string }): void {
  if (args?.css) {
    const style = document.createElement('style');
    style.innerHTML = args.css;
    document.head.appendChild(style);
  }
}

/**
 * Dispatch an array of remote commands (removeElements / addCSS / toast).
 *
 * Original: content.isolated.end.js line 6359
 */
export function remoteFunction(commands: Array<{ functionName: string; args: any }>): void {
  for (let i = 0; i < commands.length; i += 1) {
    const cmd = commands[i]!;
    switch (cmd.functionName) {
      case 'removeElements':
        removeElements(cmd.args);
        break;
      case 'addCSS':
        addCSS(cmd.args);
        break;
      case 'toast':
        toast(cmd.args.html, cmd.args.type, cmd.args.duration);
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Cursor positioning at exact offset
// ---------------------------------------------------------------------------

/**
 * Set the text cursor at a specific character position inside a
 * contenteditable element (counterpart to `setSelectionAtEnd`).
 *
 * Original: content.isolated.end.js line 7570
 */
export function setSelectionAtPosition(el: HTMLElement, position: number): void {
  if (!el || !el.hasChildNodes()) return;

  let offset = 0;
  let found = false;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  const range = document.createRange();

  function walk(node: Node): void {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length;
      if (offset + len >= position) {
        const charOffset = position - offset;
        range.setStart(node, charOffset);
        range.setEnd(node, charOffset);
        found = true;
        return;
      }
      offset += len;
    } else if (node.nodeName === 'BR') {
      offset += 1;
      if (offset >= position) {
        found = true;
        range.setStartAfter(node);
        range.setEndAfter(node);
      }
    } else if (['P', 'DIV', 'BLOCKQUOTE'].includes(node.nodeName)) {
      node.childNodes.forEach(walk);
      offset += 1;
      if (offset >= position && !found) {
        range.setStartAfter(node);
        range.setEndAfter(node);
        found = true;
      }
    } else if (node.childNodes) {
      node.childNodes.forEach(walk);
    }
  }

  walk(el);
  if (found) {
    sel.addRange(range);
  } else {
    console.error('Position exceeds the content length.');
  }
}

// ---------------------------------------------------------------------------
// Textarea update with fallback
// ---------------------------------------------------------------------------

/**
 * Set the `#prompt-textarea` innerHTML. If the element is not yet in
 * the DOM, a MutationObserver waits for it.
 *
 * Original: content.isolated.end.js line 6569
 */
export function updateTextArea(html: string): void {
  if (!html) return;
  const textarea = document.querySelector('#prompt-textarea') as HTMLElement | null;
  if (textarea) {
    textarea.innerHTML = html;
    setSelectionAtEnd(textarea);
    return;
  }
  new MutationObserver((_mutations, observer) => {
    const el = document.querySelector('#prompt-textarea') as HTMLElement | null;
    if (el) {
      el.innerHTML = html;
      setSelectionAtEnd(el);
      observer.disconnect();
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Data extraction helpers (DALL-E / chart images, prompts, attachments)
// ---------------------------------------------------------------------------

/**
 * Extract DALL-E/code prompt text from a conversation mapping node.
 *
 * Original: content.isolated.end.js line 5841
 */
export function extractPromptFromNode(mapping: Record<string, any>, nodeId: string): string | null {
  const node = mapping[nodeId];
  if (!node || !node.message || !node.message.content || (!node.message.content.parts && !node.message.content.text)) {
    return null;
  }
  try {
    const { parts = [], text, content_type } = node.message.content;
    if (text) parts.push(text);
    for (const part of parts) {
      try {
        const parsed = JSON.parse(part);
        if (parsed.prompt || content_type === 'code') return parsed.prompt;
      } catch {
        // not JSON — skip
      }
    }
  } catch (err) {
    console.error('Failed to parse content parts as JSON:', err);
    return null;
  }
  return null;
}

/**
 * Recursively find a DALL-E image in a conversation mapping by asset pointer.
 *
 * Original: content.isolated.end.js line 5861
 */
export function findDalleImageInMapping(
  obj: any,
  assetPointer: string,
): {
  title: string;
  create_time: number;
  message_id: string;
  parent: string;
  asset_object: any;
  status: string;
} | null {
  if (typeof obj !== 'object' || obj === null) return null;
  if (obj?.message?.content?.parts) {
    for (const part of obj.message.content.parts) {
      if (part.asset_pointer && (part.asset_pointer as string).includes(assetPointer)) {
        const now = Date.now() / 1000;
        return {
          title: obj.message?.metadata?.image_gen_title || '',
          create_time: obj.message?.create_time || now,
          message_id: obj.id,
          parent: obj.parent,
          asset_object: part,
          status: obj.message?.status || 'finished_successfully',
        };
      }
    }
  }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = findDalleImageInMapping(obj[key], assetPointer);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Extract a matplotlib title from Python code via regex.
 *
 * Original: content.isolated.end.js line 5884 (original name: extraxtTitleFromCode — typo)
 */
export function extractTitleFromCode(code: string): string {
  let title = '';
  if (code && code.includes('title')) {
    const match = code.match(/plt\.title\(['"]([^'"]+)['"]\)/);
    if (match?.[1]) title = match[1];
  }
  return title;
}

/**
 * Recursively find a chart image in a conversation mapping by image URL.
 *
 * Original: content.isolated.end.js line 5893
 */
export function findChartImageInMapping(
  obj: any,
  imageUrl: string,
): {
  title: string;
  create_time: number;
  message_id: string;
  parent: string;
  asset_object: any;
  status: string;
} | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const messages = obj?.message?.metadata?.aggregate_result?.messages;
  if (messages && messages.some((m: any) => m?.image_url?.includes(imageUrl))) {
    const agg = obj.message.metadata.aggregate_result;
    const now = Date.now() / 1000;
    const code = agg?.code as string | undefined;
    return {
      title: extractTitleFromCode(code ?? ''),
      create_time: obj.message?.create_time || now,
      message_id: obj.id,
      parent: obj.parent,
      asset_object: agg,
      status: obj.message?.status || 'finished_successfully',
    };
  }
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = findChartImageInMapping(obj[key], imageUrl);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Update `src` on all `<img>` elements that reference a specific file ID.
 *
 * Original: content.isolated.end.js line 10204
 */
export function loadUserSelectedImages(fileId: string, url: string): void {
  document.querySelectorAll<HTMLImageElement>(`img[id^=reply-to-image-][data-file-id="${fileId}"]`).forEach((img) => {
    img.src = url;
  });
}

/** WeakMap cache for extractConversationAttachments. */
const ATTACHMENTS_CACHE = new WeakMap<object, { updateTime: unknown; attachments: any[] }>();

/**
 * Extract all file attachments from a conversation's message mapping.
 * Results are cached by conversation object reference + update_time.
 *
 * Original: content.isolated.end.js line 19227
 */
export function extractConversationAttachments(
  conversation: any,
): Array<{ conversation_id: string | null; message_id: string | null; [key: string]: unknown }> {
  try {
    if (!conversation || typeof conversation !== 'object') {
      console.warn('Invalid conversation object passed to extractConversationAttachments', typeof conversation);
      return [];
    }
    const updateTime = conversation.update_time || null;
    const cached = ATTACHMENTS_CACHE.get(conversation);
    if (cached && cached.updateTime === updateTime) return cached.attachments;

    const mapping = conversation.mapping;
    if (!mapping || typeof mapping !== 'object') return [];

    const convId = conversation.conversation_id || null;
    const result: any[] = [];

    for (const nodeId in mapping) {
      if (!Object.prototype.hasOwnProperty.call(mapping, nodeId)) continue;
      const node = mapping[nodeId];
      if (!node || typeof node !== 'object') continue;
      const message = node.message;
      if (!message || typeof message !== 'object') continue;
      const metadata = message.metadata;
      if (!metadata || typeof metadata !== 'object') continue;
      const attachments = metadata.attachments;
      if (!Array.isArray(attachments) || attachments.length === 0) continue;
      const msgId = message.id || null;
      for (let i = 0; i < attachments.length; i += 1) {
        const att = attachments[i];
        if (!att || typeof att !== 'object') continue;
        result.push({ ...att, conversation_id: convId, message_id: msgId });
      }
    }

    ATTACHMENTS_CACHE.set(conversation, { updateTime, attachments: result });
    return result;
  } catch (err: any) {
    console.warn('Unexpected error in extractConversationAttachments', err?.message ?? String(err), err?.stack ?? null);
    return [];
  }
}
