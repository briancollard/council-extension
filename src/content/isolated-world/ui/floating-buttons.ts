/**
 * Floating action buttons panel.
 *
 * The fixed-position button bar that hovers in the bottom-right corner
 * of the conversation view. Contains scroll-up, scroll-down, and an
 * "eye" toggle for message visibility.
 *
 * Original source: content.isolated.end.js lines 5401-5555
 */

import { addTooltip } from './primitives';
import { getSettings } from '../settings';

// ---------------------------------------------------------------------------
// SVG icon constants
// ---------------------------------------------------------------------------

const MESSAGE_HIDE_ICON_SMALL =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-sm" viewBox="0 0 640 640"><path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM236.5 202.7C260 185.9 288.9 176 320 176C399.5 176 464 240.5 464 320C464 351.1 454.1 379.9 437.3 403.5L402.6 368.8C415.3 347.4 419.6 321.1 412.7 295.1C399 243.9 346.3 213.5 295.1 227.2C286.5 229.5 278.4 232.9 271.1 237.2L236.4 202.5zM357.3 459.1C345.4 462.3 332.9 464 320 464C240.5 464 176 399.5 176 320C176 307.1 177.7 294.6 180.9 282.7L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L357.4 459.2z"/></svg>';

const MESSAGE_SHOW_ICON_SMALL =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="icon icon-sm" viewBox="0 0 640 640"><path d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"/></svg>';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let lastFocusedArticle: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Article flash animation
// ---------------------------------------------------------------------------

/**
 * Briefly highlight an article element with a gold flash and scroll it into
 * view if it is not already visible.
 *
 * Original: `flashArticle` (line 5405)
 */
export function flashArticle(element: HTMLElement, _direction: 'up' | 'down' = 'up'): void {
  element.style.transition = 'background-color 0.5s ease';
  element.style.backgroundColor = '#ffd70030';
  setTimeout(() => {
    element.style.backgroundColor = '';
  }, 1000);

  const rect = element.getBoundingClientRect();
  if (!(rect.top >= 0 && rect.bottom <= window.innerHeight)) {
    element.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'start' });
  }
}

// ---------------------------------------------------------------------------
// Scroll helpers
// ---------------------------------------------------------------------------

/**
 * Scroll up to the previous user-message article.
 *
 * Original: `scrollUpOneArticle` (line 5419)
 */
export function scrollUpOneArticle(): void {
  if (lastFocusedArticle) {
    const prev = lastFocusedArticle.previousElementSibling?.previousElementSibling as HTMLElement | null;
    if (prev && prev.tagName === 'ARTICLE') {
      lastFocusedArticle = prev;
      flashArticle(prev, 'up');
    } else {
      flashArticle(lastFocusedArticle, 'up');
    }
    return;
  }

  const articles = document.querySelectorAll<HTMLElement>("article[data-testid^='conversation-turn']");
  if (articles.length === 0) return;

  let closest = articles[0]!;
  let closestDist = Math.abs(closest.getBoundingClientRect().top);

  articles.forEach((article) => {
    if (article.querySelector('div[data-message-author-role="assistant"]')) return;
    const top = article.getBoundingClientRect().top;
    if (top > 0) return;
    const dist = Math.abs(top);
    if (dist < closestDist) {
      closest = article;
      closestDist = dist;
    }
  });

  lastFocusedArticle = closest;
  flashArticle(closest, 'up');
}

/**
 * Scroll down to the next user-message article.
 *
 * Original: `scrollDownOneArticle` (line 5438)
 */
export function scrollDownOneArticle(): void {
  if (lastFocusedArticle) {
    const next = lastFocusedArticle.nextElementSibling?.nextElementSibling as HTMLElement | null;
    if (next && next.tagName === 'ARTICLE') {
      lastFocusedArticle = next;
      flashArticle(next, 'down');
    } else {
      flashArticle(lastFocusedArticle, 'down');
    }
    return;
  }

  const articles = document.querySelectorAll<HTMLElement>("article[data-testid^='conversation-turn']");
  if (articles.length === 0) return;

  let closest = articles[articles.length - 2] ?? articles[articles.length - 1]!;
  let closestDist = Math.abs(closest.getBoundingClientRect().top);

  articles.forEach((article, idx) => {
    if (article.querySelector('div[data-message-author-role="assistant"]')) return;
    const top = article.getBoundingClientRect().top;
    if (top > 60 && idx < articles.length - 2) return;
    const dist = Math.abs(top);
    if (dist < closestDist) {
      closest = article;
      closestDist = dist;
    }
  });

  const next = closest?.nextElementSibling?.nextElementSibling as HTMLElement | null;
  if (!next || next.tagName !== 'ARTICLE') {
    lastFocusedArticle = closest;
    flashArticle(closest, 'down');
    return;
  }

  lastFocusedArticle = next;
  flashArticle(next, 'down');
}

// ---------------------------------------------------------------------------
// Favicon animation
// ---------------------------------------------------------------------------

let faviconFrame = 0;
let faviconIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Change the page favicon to the given URL.
 *
 * Original: `changeFavicon` (line 5359)
 */
function changeFavicon(href: string): void {
  const link = document.createElement('link');
  const existing = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
  link.rel = 'icon';
  link.type = 'image/gif';
  link.href = href;
  existing.forEach((el) => {
    if (el.href.includes('favicon')) document.head.removeChild(el);
  });
  document.head.appendChild(link);
}

function switchFavicon(): void {
  switch (faviconFrame) {
    case 0:
      changeFavicon(chrome.runtime.getURL('icons/favicon-1.png'));
      break;
    case 1:
    default:
      changeFavicon(chrome.runtime.getURL('icons/favicon-0.png'));
      break;
  }
  faviconFrame = faviconFrame === 1 ? 0 : 1;
}

/**
 * Start animating the favicon (swap between two frames every 500ms).
 * Also stores the interval ID so stopAnimateFavicon() can be called without args.
 *
 * Original: `animateFavicon` (line 5397)
 */
export function animateFavicon(): ReturnType<typeof setInterval> {
  faviconIntervalId = setInterval(switchFavicon, 500);
  return faviconIntervalId;
}

/**
 * Stop the favicon animation and restore the default favicon.
 * Can be called with or without an interval ID — uses the module-level
 * tracker if no ID is provided.
 *
 * Original: `stopAnimateFavicon` (line 5401)
 */
export function stopAnimateFavicon(intervalId?: ReturnType<typeof setInterval> | null): void {
  changeFavicon(chrome.runtime.getURL('icons/favicon-0.png'));
  const id = intervalId ?? faviconIntervalId;
  if (id) clearInterval(id);
  faviconIntervalId = null;
}

// ---------------------------------------------------------------------------
// Eye toggle button
// ---------------------------------------------------------------------------

/**
 * Add the "toggle all messages" eye button to the floating button wrapper.
 *
 * Original: `addEyeButtonToFloatingButtons` (line 5527)
 */
export function addEyeButtonToFloatingButtons(): void {
  const wrapper = document.querySelector('#floating-button-wrapper') as HTMLElement | null;
  if (!wrapper || document.querySelector('#toggle-all-messages-button')) return;

  const btn = document.createElement('button');
  btn.id = 'toggle-all-messages-button';
  btn.innerHTML = MESSAGE_HIDE_ICON_SMALL;
  btn.className =
    'flex items-center justify-center border border-token-border-medium text-token-text-tertiary hover:text-token-text-primary bg-token-main-surface-primary text-xs font-sans cursor-pointer z-10 rounded-md';
  btn.style.cssText = 'width: 2rem;height: 2rem; margin-top: 1rem';

  addTooltip(btn, {
    value: () => {
      const convId = getConversationIdFromUrl();
      const stored = JSON.parse(window.localStorage.getItem('sp/allMessagesToggleState') || 'null') as {
        convId: string;
        state: string;
      } | null;
      const state = stored ?? { convId, state: 'visible' };
      return state.state === 'visible' ? 'Hide all messages' : 'Show all messages';
    },
    position: 'left',
  });

  btn.addEventListener('click', () => {
    const convId = getConversationIdFromUrl();
    const stored = JSON.parse(window.localStorage.getItem('sp/allMessagesToggleState') || 'null') as {
      convId: string;
      state: string;
    } | null;
    const current = stored ?? { convId, state: 'visible' };
    const newState = current.convId === convId && current.state === 'visible' ? 'hidden' : 'visible';

    window.localStorage.setItem('sp/allMessagesToggleState', JSON.stringify({ convId, state: newState }));

    document.querySelectorAll<HTMLElement>('main article').forEach((article) => {
      const toggleBtn = article.querySelector<HTMLButtonElement>(
        'button[data-testid="toggle-message-turn-action-button"]',
      );
      if (!toggleBtn) return;

      if (newState === 'hidden') {
        article.querySelector('div')?.lastElementChild?.classList.add('hidden');
        toggleBtn.classList.replace('absolute', 'relative');
        toggleBtn.innerHTML = `<span class="touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center">${MESSAGE_SHOW_ICON_SMALL}</span>`;
        btn.innerHTML = MESSAGE_SHOW_ICON_SMALL;
      } else {
        article.querySelector('div')?.lastElementChild?.classList.remove('hidden');
        toggleBtn.classList.replace('relative', 'absolute');
        toggleBtn.innerHTML = `<span class="touch:w-[38px] flex h-[30px] w-[30px] items-center justify-center">${MESSAGE_HIDE_ICON_SMALL}</span>`;
        btn.innerHTML = MESSAGE_HIDE_ICON_SMALL;
      }
    });
  });

  wrapper.appendChild(btn);
}

// ---------------------------------------------------------------------------
// Main floating buttons container
// ---------------------------------------------------------------------------

/**
 * Create and inject the floating button bar into the page.
 *
 * Creates a fixed-position container at the bottom-right with scroll-up,
 * scroll-down buttons. Optionally adds the eye toggle button based on settings.
 *
 * Original: `addFloatingButtons` (line 5463)
 */
export function addFloatingButtons(): void {
  if (document.querySelector('#floating-button-wrapper')) return;

  const isGpts = window.location.pathname.includes('/gpts');
  const isAdmin = window.location.pathname.includes('/admin');

  const wrapper = document.createElement('div');
  wrapper.id = 'floating-button-wrapper';
  wrapper.className =
    'absolute flex items-center justify-center text-xs font-sans cursor-pointer rounded-md z-10 transition-all duration-300';
  wrapper.style.cssText = 'bottom: 11rem;right: 3rem;width: 2rem;flex-wrap:wrap;';

  // Adjust position if sidebar drawers are open
  if (!isGpts && !isAdmin) {
    wrapper.style.right = '3rem';
  }

  // --- Scroll Up button ---
  const scrollUpBtn = document.createElement('button');
  scrollUpBtn.id = 'scroll-up-button';
  scrollUpBtn.innerHTML =
    '<svg stroke="currentColor" fill="none" stroke-width="4" viewBox="0 0 48 48" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M24 44V4m20 20L24 4 4 24"></path></svg>';
  scrollUpBtn.className =
    'flex items-center justify-center border border-token-border-medium text-token-text-tertiary hover:text-token-text-primary bg-token-main-surface-primary text-xs font-sans cursor-pointer rounded-t-md z-10';
  scrollUpBtn.style.cssText = 'width: 2rem;height: 2rem;';

  scrollUpBtn.addEventListener('click', (ev) => {
    if (ev.shiftKey) {
      scrollUpOneArticle();
      return;
    }
    // Try various scroll targets in order
    const messageWrapper = document.querySelector("[id^='message-wrapper-']");
    if (messageWrapper) {
      messageWrapper.parentElement?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const slotContent = document.querySelector<HTMLElement>("main div[slot='content']");
    if (slotContent) {
      slotContent.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const articles = document.querySelectorAll("article[data-testid^='conversation-turn']");
    if (articles.length > 0) {
      articles[articles.length - 1]!.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // --- Scroll Down button ---
  const scrollDownBtn = document.createElement('button');
  scrollDownBtn.id = 'scroll-down-button';
  scrollDownBtn.innerHTML =
    '<svg stroke="currentColor" fill="none" stroke-width="4" viewBox="0 0 48 48" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M24 4v40M4 24l20 20 20-20"></path></svg>';
  scrollDownBtn.className =
    'flex items-center justify-center border border-token-border-medium text-token-text-tertiary hover:text-token-text-primary bg-token-main-surface-primary text-xs font-sans cursor-pointer rounded-b-md z-10';
  scrollDownBtn.style.cssText = 'width: 2rem;height: 2rem; border-top: none;';

  scrollDownBtn.addEventListener('click', (ev) => {
    if (ev.shiftKey) {
      scrollDownOneArticle();
      return;
    }
    const bottom = document.querySelector('#conversation-bottom');
    if (bottom) {
      bottom.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    const slotContent = document.querySelector<HTMLElement>("main div[slot='content']");
    if (slotContent) {
      slotContent.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    const articles = document.querySelectorAll("article[data-testid^='conversation-turn']");
    if (articles.length > 0) {
      articles[articles.length - 1]!.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  });

  wrapper.appendChild(scrollUpBtn);
  wrapper.appendChild(scrollDownBtn);
  document.body.appendChild(wrapper);

  const settings = getSettings() as Record<string, unknown>;
  if (settings.showMessageVisibilityToggleButtons || settings.autoHideOldMessages) {
    addEyeButtonToFloatingButtons();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract conversation ID from the current URL.
 * Duplicated from navigation to avoid circular imports.
 */
function getConversationIdFromUrl(href: string | null = null): string {
  const url = href || window.location.href;
  const match = url.match(/\/c\/(.*?)(\/|\?|#|$)/);
  if (match && match[1] && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match[1])) {
    return match[1];
  }
  return '';
}
