/**
 * Shared UI primitive components.
 *
 * These are reusable building blocks used across multiple features:
 * dialogs, toasts, tooltips, switches, dropdowns, loading spinners,
 * and update notifications.
 *
 * Original source: content.isolated.end.js lines 5557-6082
 */

import { getSettings } from '../settings';
import { translate } from '../../features/i18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether `child` is a descendant of `parent`. */
export function isDescendant(parent: Element | null, child: EventTarget | null): boolean {
  let node = (child as HTMLElement | null)?.parentNode ?? null;
  while (node != null) {
    if (node === parent) return true;
    node = node.parentNode;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

type ButtonColor = 'red' | 'orange' | 'green';

const BUTTON_COLOR_MAP: Record<ButtonColor, string> = {
  red: 'btn-danger',
  orange: 'btn-warning',
  green: 'btn-success',
};

/**
 * Show a modal confirmation dialog.
 *
 * Faithfully reproduces the original DOM structure including the grid overlay,
 * optional "Do not show again" checkbox, and auto-close on backdrop click.
 *
 * Original: `showConfirmDialog` (line 5557)
 */
export function showConfirmDialog(
  title: string,
  message: string,
  cancelText: string,
  confirmText: string,
  onCancel: (() => void) | null,
  onConfirm: (() => void) | null,
  color: ButtonColor = 'red',
  closeOnConfirm = true,
  onDoNotShowChange: ((checked: boolean) => void) | false = false,
  doNotShowLabel = 'Do not show again',
  footerNote = '',
): void {
  const existing = document.querySelector('#confirm-action-dialog');
  if (existing) existing.remove();

  const colorClass = BUTTON_COLOR_MAP[color];

  const html = `<div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
    <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
      <div id="confirm-action-dialog-content" role="dialog" data-state="open" class="relative col-auto col-start-2 row-auto row-start-2 w-full rounded-xl text-start shadow-xl transition-all start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 bg-token-sidebar-surface-primary max-w-xl border-token-border-medium border" tabindex="-1" style="pointer-events: auto;">
        <div class="px-4 pb-4 pt-5 flex items-center justify-between border-b border-token-border-medium">
          <div class="flex">
            <div class="flex items-center">
              <div class="flex grow flex-col gap-1">
                <h2 as="h3" class="text-lg font-medium leading-6 text-token-text-tertiary">${translate(title)}</h2>
              </div>
            </div>
          </div>
        </div>
        <div class="p-4">
          <div class="text-sm text-token-text-primary">${translate(message)}</div>
          <div class="mt-5">
            <div class="mt-5 flex justify-between">${
              onDoNotShowChange
                ? `
              <div style="display: flex; justify-content: flex-start; align-items: center;">
                <input type="checkbox" id="do-not-show-checkbox" style="margin-right: 8px; width: 12px; height: 12px;" />
                <label for="do-not-show-checkbox" class="text-sm text-token-text-tertiary">${translate(doNotShowLabel)}</label>
              </div>`
                : ''
            }
              <div class="flex flex-row-reverse gap-3 ms-auto">
                <button autofocus tabindex="0" id="confirm-button" class="btn relative ${colorClass} text-white" as="button">
                  <div class="flex w-full gap-2 items-center justify-center">${translate(confirmText)}</div>
                </button>
                <button tabindex="0" id="cancel-button" class="btn relative btn-secondary" as="button">
                  <div class="flex w-full gap-2 items-center justify-center">${translate(cancelText)}</div>
                </button>
              </div>
            </div>
            <div class="w-full flex justify-end mt-2 text-token-text-primary text-xs">${footerNote}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  const wrapper = document.createElement('div');
  wrapper.id = 'confirm-action-dialog';
  wrapper.className = 'absolute inset-0';
  wrapper.style.cssText = 'z-index: 100101;';
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  const confirmBtn = document.querySelector('#confirm-action-dialog #confirm-button') as HTMLButtonElement | null;
  const cancelBtn = document.querySelector('#confirm-action-dialog #cancel-button') as HTMLButtonElement | null;

  confirmBtn?.focus();

  confirmBtn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.querySelector('#confirm-action-dialog #confirm-button')?.querySelector('#progress-spinner')) return;
    onConfirm?.();
    if (closeOnConfirm) wrapper.remove();
  });

  cancelBtn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.querySelector('#confirm-action-dialog #confirm-button')?.querySelector('#progress-spinner')) return;
    onCancel?.();
    wrapper.remove();
  });

  wrapper.addEventListener('click', (ev) => {
    if (document.querySelector('#confirm-action-dialog #confirm-button')?.querySelector('#progress-spinner')) return;
    const content = document.querySelector('#confirm-action-dialog-content') as HTMLElement | null;
    if (content && !isDescendant(content, ev.target)) {
      onCancel?.();
      wrapper.remove();
    }
  });

  const checkbox = document.querySelector('#do-not-show-checkbox') as HTMLInputElement | null;
  if (checkbox && onDoNotShowChange) {
    checkbox.addEventListener('change', () => {
      onDoNotShowChange(checkbox.checked);
    });
  }
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'warning';

/**
 * Display a temporary toast notification at the top-right of the screen.
 *
 * Original: `toast` (line 6396)
 */
export function toast(message: string, type: ToastType = 'success', duration = 4000): void {
  const existing = document.querySelector('#gptx-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'gptx-toast';
  el.style.cssText =
    'position:fixed;right:24px;top:24px;border-radius:4px;background-color:#19c37d;padding:8px 16px;z-index:1000001;max-width:600px;color:white;';

  if (type === 'error') el.style.backgroundColor = '#ef4146';
  if (type === 'warning') el.style.backgroundColor = '#e06c2b';

  el.innerHTML = translate(message);
  document.body.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, duration);
}

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------

export type TooltipPosition =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface TooltipOptions {
  value: string | (() => string | Promise<string>) | (() => HTMLElement | Promise<HTMLElement>);
  position?: TooltipPosition;
  id?: string;
}

/**
 * Attach a hover tooltip to an element.
 *
 * Supports string content, async content functions, and HTMLElement content.
 * Positions the tooltip around the element with an 8px gap.
 *
 * Original: `addTooltip` (line 5978)
 */
export function addTooltip(
  element: HTMLElement,
  options: TooltipOptions,
  offset: { top?: number; left?: number } = {},
): void {
  if (!element || !options || !options.value) return;

  removeAllTooltips();

  let tooltipEl: HTMLDivElement | null = null;
  const GAP = 8;

  const show = async () => {
    try {
      let content: string | HTMLElement =
        typeof options.value === 'function' ? await (options.value as any)(element) : options.value;
      if (!content) return;

      tooltipEl = document.createElement('div');
      tooltipEl.id = options.id || '';
      tooltipEl.className = 'sp-tooltip';

      if (typeof content === 'string') {
        tooltipEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        tooltipEl.appendChild(content);
      } else {
        return;
      }

      document.body.appendChild(tooltipEl);

      const { width: elW, height: elH, top: elT, left: elL } = element.getBoundingClientRect();
      const { offsetWidth: ttW, offsetHeight: ttH } = tooltipEl;

      let left: number;
      let top: number;

      switch (options.position) {
        case 'top':
          left = elL + elW / 2 - ttW / 2;
          top = elT - ttH - GAP;
          break;
        case 'bottom':
          left = elL + elW / 2 - ttW / 2;
          top = elT + elH + GAP;
          break;
        case 'left':
          left = elL - ttW - GAP;
          top = elT + elH / 2 - ttH / 2;
          break;
        case 'right':
          left = elL + elW + GAP;
          top = elT + elH / 2 - ttH / 2;
          break;
        case 'top-left':
          left = elL - ttW - GAP;
          top = elT - ttH - GAP;
          break;
        case 'top-right':
          left = elL + elW + GAP;
          top = elT - ttH - GAP;
          break;
        case 'bottom-left':
          left = elL - ttW - GAP;
          top = elT + elH + GAP;
          break;
        case 'bottom-right':
          left = elL + elW + GAP;
          top = elT + elH + GAP;
          break;
        default:
          left = elL + elW / 2 - ttW / 2;
          top = elT - ttH - GAP;
      }

      tooltipEl.style.left = `${left + (offset.left || 0)}px`;
      tooltipEl.style.top = `${top + (offset.top || 0)}px`;
      tooltipEl.classList.add('tooltip-visible');
    } catch (err) {
      console.error('Error showing tooltip:', err);
    }
  };

  const hide = () => {
    removeAllTooltips();
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  };

  element.addEventListener('mouseenter', show);
  element.addEventListener('mouseleave', hide);
  element.addEventListener('mousedown', hide);
  element.addEventListener('scroll', hide);
}

/**
 * Remove all SP tooltips currently visible in the DOM.
 *
 * Original: `removeAllTooltips` (line 6042)
 */
export function removeAllTooltips(): void {
  document.querySelectorAll('.sp-tooltip').forEach((el) => el.remove());
}

// Global listeners for tooltip cleanup
document.addEventListener('click', () => removeAllTooltips());
document.addEventListener('scroll', () => removeAllTooltips(), true);
document.addEventListener('keydown', () => removeAllTooltips());

// ---------------------------------------------------------------------------
// Loading spinner
// ---------------------------------------------------------------------------

/**
 * Create an absolute-positioned loading spinner element.
 *
 * Original: `loadingSpinner` (line 6391)
 */
export function loadingSpinner(id: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = `loading-spinner-${id}`;
  el.className = 'absolute top-0 start-0 flex items-center justify-center w-full h-full';
  el.innerHTML =
    '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-xl"><circle fill="transparent" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>';
  return el;
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

/**
 * Create a toggle switch component with label, description, and optional badges.
 *
 * Original: `createSwitch` (line 6446)
 */
export function createSwitch(
  label: string,
  description: string,
  settingsKey: string | null,
  defaultValue: boolean,
  onChange: ((checked: boolean, event: Event) => void) | null = null,
  badges: string[] = [],
  disabled = false,
  showBorder = true,
  compact = false,
): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.id = `sp-switch-wrapper-${label.toLowerCase().replaceAll(' ', '-')}`;
  wrapper.style.cssText = `display: flex; flex-direction: column; justify-content: start; align-items: start; width: 100%; ${compact ? '' : 'padding: 8px 0;'} ${showBorder ? 'border-bottom: 1px solid #333;' : ''} transition: all 0.2s ease-in-out;`;

  const row = document.createElement('div');
  row.style.cssText = `display: flex; flex-direction: row; justify-content: start; align-items: center; width: 100%; ${compact ? '' : 'margin: 8px 0;'}`;
  row.innerHTML = `<div style="white-space: nowrap;">${translate(label)}</div>`;

  const switchLabel = document.createElement('label');
  switchLabel.className = 'sp-switch';
  switchLabel.style.marginLeft = 'auto';
  if (compact) {
    switchLabel.style.transform = 'scale(0.75)';
    switchLabel.style.margin = '0';
  }
  switchLabel.style.opacity = disabled ? '0.5' : '1';

  const input = document.createElement('input');
  input.id = `switch-${label.toLowerCase().replaceAll(' ', '-')}`;
  input.type = 'checkbox';
  input.disabled = disabled;

  const badgeContainer = document.createElement('div');
  badgeContainer.className = 'flex items-center gap-2 mx-2';
  badges.forEach((badge) => {
    const span = document.createElement('span');
    const isPro = badge === '\u26A1\uFE0F Requires Pro Account';
    const isNew = badge === 'New';
    span.style.cssText = `${isPro ? 'background-color: #19c37d; color: black;' : isNew ? 'background-color: #ef4146; color: white;' : 'background-color: #ff9800; color: black;'} padding: 2px 4px; border-radius: 8px; font-size: 0.7em;`;
    span.textContent = badge;
    if (isPro) {
      span.role = 'button';
      span.addEventListener('click', () => {
        document.querySelector<HTMLElement>('#upgrade-to-pro-button-settings')?.click();
      });
    }
    badgeContainer.appendChild(span);
  });

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size: 12px; color: #999;';
  desc.innerHTML = translate(description);

  if (settingsKey) {
    const settings = getSettings() as Record<string, unknown>;
    const stored = settings[settingsKey];
    if (stored === undefined && defaultValue !== undefined) {
      const updated = { ...settings, [settingsKey]: defaultValue };
      chrome.storage.local.set({ settings: updated });
      input.checked = defaultValue;
    } else {
      input.checked = stored as boolean;
    }

    input.addEventListener('change', (ev) => {
      const current = getSettings() as Record<string, unknown>;
      const updated = { ...current, [settingsKey]: input.checked };
      chrome.storage.local.set({ settings: updated }, () => {
        if (onChange && ev.isTrusted) onChange(input.checked, ev);
      });
    });
  } else {
    input.checked = defaultValue;
    input.addEventListener('change', (ev) => {
      if (onChange && ev.isTrusted) onChange(input.checked, ev);
    });
  }

  const slider = document.createElement('span');
  slider.className = 'sp-switch-slider round';

  if (badges.length > 0) row.appendChild(badgeContainer);
  switchLabel.appendChild(input);
  switchLabel.appendChild(slider);
  row.appendChild(switchLabel);
  wrapper.appendChild(row);
  wrapper.appendChild(desc);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Dropdown
// ---------------------------------------------------------------------------

export interface DropdownItem {
  name: string;
  description?: string;
  subtitle?: string;
  [key: string]: unknown;
}

/**
 * Render a dropdown selector with a button and a hidden option list.
 *
 * Returns the HTML string to be inserted via `innerHTML`.
 *
 * Original: `dropdown` (line 13557)
 */
export function dropdown(
  name: string,
  items: DropdownItem[],
  selected: DropdownItem | null,
  valueKey = 'code',
  align: 'left' | 'right' = 'right',
  bgClass: string | null = null,
  showLabel = true,
): string {
  if (!selected) selected = items[0] ?? null;
  if (!selected) return '';

  const sectionLabel = name.replaceAll('-', ' ').split(' ').pop() ?? '';
  const id = name.toLowerCase();
  const bg = bgClass || 'bg-token-main-surface-secondary';

  return `<button id="${id}-selector-button" class="relative w-full h-full cursor-pointer rounded-lg ${bg} hover:bg-token-main-surface-tertiary ps-3 pe-6 text-start focus:outline-none text-sm" type="button">
  ${showLabel ? `<label class="relative text-xs text-token-text-tertiary" style="top:-2px;">${translate(sectionLabel)}</label>` : ''}
  <span class="inline-flex w-full truncate text-token-text-primary pe-2">
    <span class="flex h-5 items-center gap-1 truncate relative" style="${showLabel ? 'top:-2px;' : ''}"><span class="truncate" id="selected-${id}-title" data-option="${selected[valueKey]}">${translate(String(selected.name))}</span>
    </span>
  </span>
  <span class="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-2">
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 text-gray-400" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  </span>
</button>
<ul id="${id}-list-dropdown" style="max-height:400px;overflow-y:auto;width:250px;" class="hidden shadow-long transition-all absolute z-10 ${align === 'right' ? 'end-0' : 'start-0'} mt-1 overflow-auto rounded-2xl p-1 text-base focus:outline-none ${bg} dark:ring-white/20 text-sm -translate-x-1/4" role="menu" aria-orientation="vertical" aria-labelledby="${id}-selector-button" tabindex="-1">
  ${items
    .map(
      (
        item,
      ) => `<li title="${item.description || item.subtitle || ''}" class="text-token-text-primary relative cursor-pointer select-none py-1 ps-3 pe-9 hover:bg-token-main-surface-tertiary rounded-xl min-h-9 flex items-center" id="${id}-selector-option-${item[valueKey]}" role="option" tabindex="-1">
    <div class="flex flex-col">
      <span class="flex h-6 items-center gap-1 truncate text-token-text-primary">${translate(String(item.name))}</span>
      ${item.subtitle ? `<span class="text-xs text-token-text-tertiary overflow-wrap">${translate(String(item.subtitle))}</span>` : ''}
    </div>
    ${
      String(item[valueKey]) === String(selected![valueKey])
        ? `<span id="${id}-selector-checkmark" class="absolute inset-y-0 end-0 flex items-center pe-4 text-token-text-primary">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg>
    </span>`
        : ''
    }
  </li>`,
    )
    .join('')}
</ul>`;
}

const CHECKMARK_SVG = `<span class="absolute inset-y-0 end-0 flex items-center pe-4 text-token-text-primary">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md"><path fill="currentColor" fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12m14.076-4.068a1 1 0 0 1 .242 1.393l-4.75 6.75a1 1 0 0 1-1.558.098l-2.5-2.75a1 1 0 0 1 1.48-1.346l1.66 1.827 4.032-5.73a1 1 0 0 1 1.394-.242" clip-rule="evenodd"></path></svg>
    </span>`;

/**
 * Attach event listeners to a rendered dropdown (produced by `dropdown()`).
 *
 * Handles open/close toggling, body-click-to-close, option selection with
 * checkmark movement, and persisting the selection to settings.
 *
 * Original: `addDropdownEventListener` (line 13585)
 */
export function addDropdownEventListener(
  name: string,
  items: DropdownItem[],
  valueKey = 'code',
  onSelect: ((item: DropdownItem) => void) | null = null,
): void {
  const id = name.toLowerCase();

  document.querySelector(`#${id}-selector-button`)?.addEventListener('click', () => {
    const list = document.querySelector(`#${id}-list-dropdown`);
    if (!list) return;
    if (list.classList.contains('block')) {
      list.classList.replace('block', 'hidden');
    } else {
      list.classList.replace('hidden', 'block');
    }
  });

  document.body.addEventListener('click', (ev) => {
    const list = document.querySelector(`#${id}-list-dropdown`);
    if (list?.classList.contains('block') && !(ev.target as HTMLElement).closest(`#${id}-selector-button`)) {
      list.classList.replace('block', 'hidden');
    }
  });

  document.querySelectorAll<HTMLElement>(`[id^=${id}-selector-option-]`).forEach((option) => {
    option.addEventListener('click', () => {
      document.querySelector(`#${id}-list-dropdown`)?.classList.replace('block', 'hidden');

      const existingCheck = document.querySelector(`#${id}-selector-checkmark`);
      if (existingCheck) {
        existingCheck.remove();
        option.appendChild(existingCheck);
      } else {
        option.insertAdjacentHTML(
          'beforeend',
          CHECKMARK_SVG.replace('class="absolute', `id="${id}-selector-checkmark" class="absolute`),
        );
      }

      const optionValue = option.id.split(`${id}-selector-option-`)[1];
      const item = items.find((i) => String(i[valueKey]) === String(optionValue));
      if (!item) return;

      const titleEl = document.querySelector(`#selected-${id}-title`);
      if (titleEl) {
        titleEl.textContent = translate(String(item.name));
        titleEl.setAttribute('data-option', String(item[valueKey]));
      }

      const settings = getSettings() as Record<string, unknown>;
      chrome.storage.local.set(
        {
          settings: {
            ...settings,
            [`selected${name.replaceAll('-', '')}`]: item,
          },
        },
        () => {
          onSelect?.(item);
        },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Update notification
// ---------------------------------------------------------------------------

/**
 * Check for a new extension update and show a notification if available.
 *
 * Original: `checkForNewUpdate` (line 6062)
 */
export function checkForNewUpdate(): void {
  const settings = getSettings() as Record<string, unknown>;
  if (settings.hideUpdateNotification) return;

  chrome.runtime.sendMessage(
    { type: 'getLatestVersion' },
    (response: { status?: string; version?: string } | undefined) => {
      if (response?.status === 'update_available') {
        showUpdateAvailableNotification(response.version ?? '');
      }
    },
  );
}

/**
 * Show a dialog prompting the user to update the extension.
 *
 * Original: `showUpdateAvailableNotification` (line 6071)
 */
export function showUpdateAvailableNotification(version = ''): void {
  showConfirmDialog(
    'New update available',
    `A new version${version ? ` (v${version})` : ''} of <b>Council</b> is available. Update now to get the latest features and bug fixes.`,
    'Cancel',
    'Update now',
    null,
    () => {
      chrome.runtime.sendMessage({ type: 'reloadExtension', forceRefresh: true }, () => {
        window.location.reload();
      });
    },
    'green',
    true,
  );
}

// ---------------------------------------------------------------------------
// Misc UI helpers
// ---------------------------------------------------------------------------

/**
 * Create an info icon (circled "i") with a tooltip.
 *
 * Original: `createInfoIcon` (line 5375)
 */
export function createInfoIcon(tooltipText = '', position: TooltipPosition = 'top', style = ''): HTMLSpanElement {
  const span = document.createElement('span');
  span.style.cssText = style;
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" class="icon icon-md ps-0.5 text-token-text-tertiary h-5 w-5 ms-2" style="${style}"><path fill="currentColor" d="M13 12a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0zM12 9.5A1.25 1.25 0 1 0 12 7a1.25 1.25 0 0 0 0 2.5"></path><path fill="currentColor" fill-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0" clip-rule="evenodd"></path></svg>`;
  addTooltip(span, { value: tooltipText, position });
  return span;
}

/**
 * Create an animated ping indicator dot.
 *
 * Original: `animatePing` (line 5969)
 */
export function animatePing(color: string): HTMLSpanElement {
  const container = document.createElement('span');
  container.className = 'absolute flex h-3 w-3';
  container.style.cssText = 'top: -6px; right: -6px;';
  container.id = 'ping';

  const ping = document.createElement('span');
  ping.className = 'animate-ping absolute inline-flex h-full w-full rounded-full';
  ping.style.cssText = `background-color: ${color}; opacity: 0.75;`;

  const dot = document.createElement('span');
  dot.className = 'relative inline-flex rounded-full h-3 w-3';
  dot.style.cssText = `background-color: ${color};`;

  container.appendChild(ping);
  container.appendChild(dot);
  return container;
}

// ---------------------------------------------------------------------------
// Range slider
// Original: content.isolated.end.js lines 6405-6444
// ---------------------------------------------------------------------------

/**
 * Create a range slider with an optional settings key for persistence.
 */
export function createSlider(
  label: string,
  description: string,
  key: string,
  defaultValue: string,
  min: string,
  max: string,
  step: string,
  callback: ((oldVal: string, newVal: string) => void) | null = null,
  _opts: string[] = [],
  disabled = false,
): HTMLDivElement {
  const settings = getSettings();

  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display: flex; flex-direction:column; justify-content: flex-start; align-items: flex-start; width: 100%; margin: 8px 0;';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items: center; width: 100%; margin: 8px 0;';

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'min-width: fit-content; font-size: 16px;';
  labelEl.innerHTML = label;

  const descEl = document.createElement('div');
  descEl.style.cssText = 'font-size: 12px; color: #999;';
  descEl.innerHTML = description;

  row.appendChild(labelEl);

  const slider = document.createElement('input');
  slider.id = `sp-range-slider-${key}`;
  slider.className = 'sp-range-slider';
  slider.style.cssText = 'width: 100%; margin: 8px';
  slider.type = 'range';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.disabled = disabled;

  const valueSpan = document.createElement('span');
  valueSpan.id = `sp-range-slider-value-${key}`;
  valueSpan.style.cssText = 'min-width: fit-content;font-size: 14px; color: #999; margin: 0 16px;';
  valueSpan.textContent = defaultValue;

  if (key) {
    const stored = (settings as Record<string, unknown>)[key] as string | undefined;
    if (stored === undefined && defaultValue !== undefined) {
      const updated = { ...settings } as Record<string, unknown>;
      updated[key] = defaultValue;
      valueSpan.textContent = defaultValue;
      chrome.storage.local.set({ settings: updated });
    } else {
      slider.value = stored!;
      valueSpan.textContent = stored!;
    }
    slider.addEventListener('input', () => {
      valueSpan.textContent = slider.value;
    });
    slider.addEventListener('change', () => {
      const oldVal = (getSettings() as Record<string, unknown>)[key] as string;
      const updated = { ...getSettings() } as Record<string, unknown>;
      updated[key] = slider.value;
      valueSpan.textContent = slider.value;
      chrome.storage.local.set({ settings: updated }, () => {
        if (callback) callback(oldVal, slider.value);
      });
    });
  } else {
    slider.value = defaultValue;
    valueSpan.textContent = defaultValue;
    slider.addEventListener('change', () => {
      if (callback) callback(slider.value, slider.value);
    });
  }

  row.appendChild(valueSpan);
  row.appendChild(slider);
  wrapper.appendChild(row);
  wrapper.appendChild(descEl);
  return wrapper;
}
