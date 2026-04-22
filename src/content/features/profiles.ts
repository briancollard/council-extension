/**
 * Custom Instruction Profiles feature.
 *
 * Includes:
 *   - Profile selector dropdown on new-chat page
 *   - Folder-profile association modal
 *   - Profile editor modal (name, system/user message textareas, personality
 *     style dropdowns, tool toggles for browser/python/canvas/voice/search)
 *   - Profile card settings menu (edit, duplicate, delete)
 *   - Full CRUD via chrome.runtime.sendMessage
 *
 * Original source: content.isolated.end.js lines 16591-17720
 */

import type { CustomInstructionProfile, DisableableTool } from '../../types/conversation';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  isDarkMode,
  isOnNewChatPage,
  closeMenus,
  adjustMenuPosition,
  errorUpgradeConfirmation,
  managerUpgradeButton,
  escapeHTML,
} from '../../utils/shared';
import {
  addTooltip,
  isDescendant,
  showConfirmDialog,
  loadingSpinner,
  dropdown,
  addDropdownEventListener,
  toast,
} from '../isolated-world/ui/primitives';
import { translate } from './i18n';
import { conversationFolderElement, folderForNewChat, initiateNewChatFolderIndicator } from './folders';
import { setUserSystemMessage, updateAccountUserSetting } from '../isolated-world/api';
import { createManager } from './manager';
import { cachedSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// Profile card creation & event listeners
// Original: content.isolated.end.js lines 16340-16400
// ---------------------------------------------------------------------------

/**
 * Create an HTML element representing a custom-instruction profile card.
 */
export function createCustomInstructionProfileCard(profile: any): HTMLElement {
  const card = document.createElement('div');
  card.id = `custom-instruction-profile-card-${profile.id}`;
  card.classList.value = `bg-token-main-surface-primary border border-token-border-medium p-4 pb-2 rounded-md cursor-pointer hover:bg-token-main-surface-tertiary ${cachedSettings.selectedProfileView === 'list' ? 'aspect-2' : 'aspect-1'} flex flex-col h-auto`;
  card.style.cssText = 'height: max-content;outline-offset: 4px; outline: none;';
  card.innerHTML = `<div class="flex items-center justify-between border-b border-token-border-medium pb-1">
    <div class="text-md text-token-text-primary whitespace-nowrap overflow-hidden text-ellipsis flex items-center w-full">
      ${escapeHTML(profile.name)}
    </div>

    <button id="profile-card-settings-button-${profile.id}" class="relative flex items-center justify-center h-8 rounded-lg px-2 text-token-text-tertiary focus-visible:outline-0 hover:bg-token-sidebar-surface-tertiary focus-visible:bg-token-sidebar-surface-secondary">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg>
    </button>

  </div>
  <div class="text-token-text-tertiary text-sm whitespace-wrap overflow-hidden text-ellipsis  break-all">${escapeHTML(`${profile.name_user_message || ''} ${profile.name_user_message ? ' - ' : ''} ${profile.role_user_message || ''}`.substring(0, 250))}</div>

  <div class="flex-1 text-token-text-tertiary text-sm whitespace-wrap overflow-hidden text-ellipsis  break-all">${escapeHTML(`${profile.traits_model_message || ''} ${profile.other_user_message || ''}`.substring(0, 250))}</div>

  <div class="flex overflow-hidden my-1" style="min-height:18px;">
    ${(['browsing', 'code', 'canmore', 'advanced_voice'] as string[])
      .filter((tool) => !profile.disabled_tools.includes(tool))
      .map(
        (tool) =>
          `<span title="${tool === 'canmore' ? 'Canvas' : capitalize(tool.replaceAll('_', ' '))}" id="profile-card-tag-${tool}" class="border border-token-border-medium hover:bg-token-main-surface-secondary text-token-text-tertiary text-xs px-2 rounded-full me-1 capitalize whitespace-nowrap overflow-hidden text-ellipsis">${tool === 'canmore' ? 'Canvas' : tool.replaceAll('_', ' ')}</span>`,
      )
      .join('')}
  </div>

  <div class="border-t border-token-border-medium flex justify-between items-center pt-1">

    <div id="profile-card-action-${profile.id}" class="flex items-center w-full">
      <div class="cursor-pointer text-sm flex items-center justify-between gap-2 mt-1 w-full">${translate('Enable this profile')}<label class="sp-switch" style="margin-right:0;"><input id="profile-card-status-switch-${profile.id}" type="checkbox" ${profile.enabled ? 'checked=""' : ''}><span class="sp-switch-slider round"></span></label></div>
    </div>
  </div>`;

  card.addEventListener('click', () => {
    const checked = (card.querySelector(`#profile-card-status-switch-${profile.id}`) as HTMLInputElement).checked;
    profile.enabled = checked;
    createCustomInstructionProfileEditor(profile);
  });

  return card;
}

/**
 * Attach event listeners to profile card buttons (settings, status toggle).
 */
export function addCustomInstructionProfileCardEventListeners(profile: any): void {
  const card = document.querySelector(`#custom-instruction-profile-card-${profile.id}`) as HTMLElement;
  const actionWrapper = card.querySelector(`#profile-card-action-${profile.id}`) as HTMLElement;
  const statusSwitch = card.querySelector(`#profile-card-status-switch-${profile.id}`) as HTMLInputElement;
  const settingsButton = card.querySelector(`#profile-card-settings-button-${profile.id}`) as HTMLElement;

  settingsButton.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    closeMenus();
    const fromManager = true;
    const checked = (card.querySelector(`#profile-card-status-switch-${profile.id}`) as HTMLInputElement).checked;
    profile.enabled = checked;
    showProfileCardSettingsMenu(settingsButton, profile, fromManager);
  });

  actionWrapper.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeMenus();
  });

  statusSwitch.addEventListener('input', (ev) => {
    ev.stopPropagation();
    closeMenus();
  });

  statusSwitch.addEventListener('change', (ev) => {
    ev.stopPropagation();
    closeMenus();
    if (!(ev as Event).isTrusted) return;

    const target = ev.target as HTMLInputElement;

    if (target.checked) {
      document.querySelectorAll('#modal-manager input[id^="profile-card-status-switch-"]').forEach((el) => {
        if ((el as HTMLInputElement).id !== target.id) {
          (el as HTMLInputElement).checked = false;
        }
      });
    }

    chrome.runtime.sendMessage(
      {
        type: 'updateCustomInstructionProfile',
        detail: {
          profileId: profile.id,
          profile: { enabled: target.checked },
        },
      },
      async () => {
        if (target.checked) {
          setUserSystemMessage(
            profile.name_user_message,
            profile.role_user_message,
            profile.traits_model_message,
            profile.other_user_message,
            profile.personality_type_selection,
            profile.personality_traits,
            target.checked,
            profile.disabled_tools,
          );
        } else {
          setUserSystemMessage('', '', '', '', 'default', {}, false, []);
        }
        initializeCustomInstructionProfileSelector(true);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Style / characteristic lists
// ---------------------------------------------------------------------------

const baseStyleList = [
  { name: 'Default', code: 'default', subtitle: 'Preset style or tone' },
  { name: 'Professional', code: 'professional', subtitle: 'Polished and precise' },
  { name: 'Friendly', code: 'friendly', subtitle: 'Warm and chatty' },
  { name: 'Candid', code: 'candid', subtitle: 'Direct and encouraging' },
  { name: 'Quirky', code: 'quirky', subtitle: 'Playful and imaginative' },
  { name: 'Efficient', code: 'efficient', subtitle: 'Concise and plain' },
  { name: 'Nerdy', code: 'nerdy', subtitle: 'Exploratory and enthusiastic' },
  { name: 'Cynical', code: 'cynical', subtitle: 'Critical and sarcastic' },
];

const characteristicListWarm = [
  { name: 'More', code: 'more', subtitle: 'Friendlier and more personable' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: 'More professional and factual' },
];

const characteristicListEnthusiastic = [
  { name: 'More', code: 'more', subtitle: 'More energy and excitement' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: 'Calmer and more natural' },
];

const characteristicListScannable = [
  { name: 'More', code: 'more', subtitle: 'Use clear formatting and lists' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: 'More paragraphs instead of lists' },
];

const characteristicListEmoji = [
  { name: 'More', code: 'more', subtitle: 'Use more emoji' },
  { name: 'Default', code: 'default', subtitle: '' },
  { name: 'Less', code: 'less', subtitle: "Don't use as many emoji" },
];

// ---------------------------------------------------------------------------
// Profile selector dropdown (on new-chat page)
// ---------------------------------------------------------------------------

export async function initializeCustomInstructionProfileSelector(forceRefresh = false): Promise<void> {
  const isNewChat = isOnNewChatPage();
  const isProject = window.location.pathname.startsWith('/g/g-p-') && window.location.pathname.endsWith('/project');
  const isGpt = window.location.pathname.startsWith('/g/g-');

  const existing = document.querySelector('#custom-instruction-profile-selector-wrapper');
  if (!cachedSettings.showCustomInstructionProfileSelector) {
    existing?.remove();
    return;
  }
  if (existing) {
    if (!isNewChat) {
      existing.remove();
      return;
    }
    if (!forceRefresh) return;
    existing.remove();
  }
  if (!isNewChat || isProject || isGpt) return;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'z-index:20;right:0;top:-44px;';
  wrapper.classList.value = 'absolute flex shadow-long rounded-full';
  wrapper.id = 'custom-instruction-profile-selector-wrapper';

  const dropdownBtn = document.createElement('button');
  dropdownBtn.id = 'profile-selector-dropdown-button';
  dropdownBtn.type = 'button';
  dropdownBtn.style.cssText = 'z-index:2;';
  dropdownBtn.classList.value = 'btn flex justify-center gap-2 btn-secondary bg-token-main-surface-secondary border-0';
  dropdownBtn.appendChild(loadingSpinner('profile-selector-dropdown-button'));
  addTooltip(dropdownBtn, { value: 'Set a Custom Instruction Profile', position: 'top' });

  dropdownBtn.addEventListener('click', () => {
    const list = document.querySelector('#profile-list-dropdown-wrapper');
    if (list) {
      list.classList.contains('block')
        ? list.classList.replace('block', 'hidden')
        : list.classList.replace('hidden', 'block');
    }
  });

  chrome.runtime.sendMessage({ type: 'getEnabledCustomInstructionProfile' }, (profile) => {
    dropdownBtn.innerHTML = `<span class="me-6 truncate" style="min-width:100px; max-width:200px;">${profile?.name || 'Select a profile'}</span><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md text-token-text-tertiary absolute" style="right:10px;transform: rotate(180deg);"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.29289 9.29289C5.68342 8.90237 6.31658 8.90237 6.70711 9.29289L12 14.5858L17.2929 9.29289C17.6834 8.90237 18.3166 8.90237 18.7071 9.29289C19.0976 9.68342 19.0976 10.3166 18.7071 10.7071L12.7071 16.7071C12.5196 16.8946 12.2652 17 12 17C11.7348 17 11.4804 16.8946 11.2929 16.7071L5.29289 10.7071C4.90237 10.3166 4.90237 9.68342 5.29289 9.29289Z" fill="currentColor"></path></svg>`;
  });

  wrapper.appendChild(dropdownBtn);
  wrapper.appendChild(profileDropdown());

  const form = document.querySelector('main form') as HTMLElement | null;
  if (form) {
    form.style.marginTop = '20px';
    form.appendChild(wrapper);
    fetchDropdownProfiles();
  }
}

function profileDropdown(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = 'profile-list-dropdown-wrapper';
  wrapper.style.cssText = 'max-height:300px;min-width:240px;max-width:fit-content;bottom:40px;left:0;z-index:200;';
  wrapper.classList.value =
    'hidden absolute z-10 end-0 overflow-auto rounded-lg text-base focus:outline-none text-sm -translate-x-1/4 bg-token-main-surface-secondary shadow-long';

  const list = document.createElement('ul');
  list.id = 'profile-list-dropdown';
  list.classList.value = 'w-full h-full relative p-1';
  list.setAttribute('role', 'menu');
  wrapper.appendChild(list);

  document.body.addEventListener('click', (e) => {
    if (
      wrapper.classList.contains('block') &&
      !(e.target as HTMLElement).closest('#profile-selector-dropdown-button')
    ) {
      wrapper.classList.replace('block', 'hidden');
    }
  });

  return wrapper;
}

function fetchDropdownProfiles(page = 1): void {
  const list = document.querySelector('#profile-list-dropdown') as HTMLElement | null;
  if (!list) return;

  if (page === 1) {
    list.innerHTML = '';
    list.appendChild(loadingSpinner('profile-list-dropdown'));
  }

  chrome.runtime.sendMessage(
    { type: 'getCustomInstructionProfiles', detail: { pageNumber: page, sortBy: 'alphabetical' } },
    (response) => {
      const results = response?.results;
      if (!results) return;

      const spinner = document.querySelector('#loading-spinner-profile-list-dropdown');
      if (spinner) spinner.remove();

      if (results.length === 0 && page === 1) {
        const empty = document.createElement('p');
        empty.classList.value = 'text-token-text-tertiary p-4';
        empty.innerText = translate('No profiles found');
        list.appendChild(empty);
        return;
      }

      results.forEach((profile: any) => {
        const li = document.createElement('li');
        li.classList.value =
          'text-token-text-primary relative cursor-pointer select-none p-2 py-3 rounded-md hover:bg-token-main-surface-secondary';
        const nameSpan = document.createElement('span');
        nameSpan.classList.value = 'flex h-6 items-center justify-between text-token-text-primary';
        nameSpan.style.textTransform = 'capitalize';

        const label = document.createElement('span');
        label.classList.value = 'truncate';
        label.style.maxWidth = '200px';
        label.innerText = profile.name;
        nameSpan.appendChild(label);

        const toggle = document.createElement('div');
        toggle.classList.value = 'cursor-pointer text-sm flex items-center justify-between gap-2 ms-auto';
        toggle.innerHTML = `<label class="sp-switch" style="margin-right:0;"><input id="dropdown-profile-switch-${profile.id}" type="checkbox" ${profile.enabled ? 'checked=""' : ''}><span class="sp-switch-slider round"></span></label>`;
        nameSpan.appendChild(toggle);

        li.appendChild(nameSpan);
        li.addEventListener('click', () => {
          const isChecked = toggle.querySelector('input')!.checked;
          chrome.runtime.sendMessage(
            {
              type: isChecked ? 'disableCustomInstructionProfile' : 'enableCustomInstructionProfile',
              detail: { profileId: profile.id },
            },
            () => {
              initializeCustomInstructionProfileSelector(true);
            },
          );
        });

        list.appendChild(li);
      });

      if (response.next) {
        const loadMore = document.createElement('button');
        loadMore.classList.value = 'p-2 cursor-pointer flex items-center justify-center h-auto relative';
        loadMore.appendChild(loadingSpinner('load-more-dropdown-profiles'));
        list.appendChild(loadMore);
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                fetchDropdownProfiles(page + 1);
                observer.disconnect();
              }
            });
          },
          { threshold: 0 },
        );
        observer.observe(loadMore);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Folder-profile selector modal
// ---------------------------------------------------------------------------

export async function openFolderProfileSelectorModal(folder: any): Promise<void> {
  const modalHtml = `
  <div id="folder-profile-selector-modal" class="absolute inset-0" style="z-index: 10000;">
    <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
      <div class="h-full w-full grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)] overflow-y-auto">
        <div id="folder-profile-selector-content" role="dialog" class="popover bg-token-main-surface-primary relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col focus:outline-hidden overflow-hidden max-w-lg" tabindex="-1" style="pointer-events: auto;">
          <div class="px-4 pb-4 pt-5 flex flex-wrap items-center justify-between border-b border-token-border-medium">
            <div class="flex"><div class="flex items-center"><div class="flex grow flex-col gap-1">
              <h2 class="text-lg font-medium leading-6 text-token-text-primary">${translate('Select a profile')}</h2>
            </div></div></div>
            <div class="flex items-center">
              <button id="folder-profile-selector-new-profile" class="btn flex justify-center gap-2 composer-submit-btn composer-submit-button-color me-2 border" style="min-width: 72px; height: 34px;">${translate('plus Create new profile')}</button>
              <button id="folder-profile-selector-close-button" class="text-token-text-tertiary hover:text-token-text-primary transition">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <div class="flex text-sm text-token-text-tertiary p-4 w-full">
            Enable the profile you want to be used for all new conversations created in this folder.
          </div>
          <div id="folder-profile-selector-folder-wrapper" class="px-4 overflow-y-auto"></div>
          <div id="folder-profile-selector-profile-list" class="p-4 overflow-y-auto" style="height:500px;"></div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document
    .querySelector('#folder-profile-selector-folder-wrapper')
    ?.prepend(conversationFolderElement(folder, false, false, false, false, true)!);
  await folderProfileSelectorLoadProfileList(folder.id, 1);
  addFolderProfileSelectorModalEventListener(folder);
}

export async function folderProfileSelectorLoadProfileList(folderId: string | number, page = 1): Promise<void> {
  const listEl = document.querySelector('#folder-profile-selector-profile-list') as HTMLElement | null;
  if (!listEl) return;

  if (page === 1) {
    listEl.innerHTML = '';
    listEl.appendChild(loadingSpinner('folder-profile-selector-profile-list'));
  } else {
    document.querySelector('#load-more-folder-profile-selector')?.remove();
  }

  const folderData = await chrome.runtime.sendMessage({
    type: 'getConversationFolder',
    forceRefresh: page === 1,
    detail: { folderId },
  });

  chrome.runtime.sendMessage(
    { type: 'getCustomInstructionProfiles', detail: { pageNumber: page, sortBy: 'alphabetical' } },
    async (response) => {
      const results = response.results;
      if (!results || !Array.isArray(results)) return;

      document.querySelector('#loading-spinner-folder-profile-selector-profile-list')?.remove();

      if (results.length === 0 && page === 1) {
        const empty = document.createElement('p');
        empty.style.cssText =
          'position:absolute;display: flex; justify-content: center; align-items: center; height: 340px; width: 100%;';
        empty.innerText = translate('No profiles found');
        listEl.appendChild(empty);
        return;
      }

      results.forEach((profile: any) => {
        const isSelected = profile.id === folderData.profile?.id;
        const item = document.createElement('div');
        item.id = `folder-profile-selector-item-${profile.name}`;
        item.dir = 'auto';
        item.classList.value =
          'text-token-text-primary relative cursor-pointer select-none p-2 py-3 rounded-md hover:bg-token-main-surface-secondary';

        const row = document.createElement('span');
        row.classList.value = 'flex h-6 items-center justify-between text-token-text-primary';

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'text-transform: capitalize; max-width: 380px;';
        nameSpan.classList.value = 'truncate';
        nameSpan.innerText = profile.name;
        row.appendChild(nameSpan);

        const toggle = document.createElement('div');
        toggle.id = `enable-profile-button-${profile.id}`;
        toggle.classList.value = 'cursor-pointer text-sm flex items-center justify-between gap-2 ms-auto';
        toggle.innerHTML = `<label class="sp-switch" style="margin-right:0;"><input id="folder-profile-selector-switch-${profile.id}" type="checkbox" ${isSelected ? 'checked=""' : ''}><span class="sp-switch-slider round"></span></label>`;
        row.appendChild(toggle);

        row.title = `${profile.name}\n\nabout user message:\n${profile.about_user_message}\n\nabout model message:\n${profile.about_model_message}`;
        item.appendChild(row);

        item.addEventListener('click', () => {
          const checked = (toggle.querySelector('input') as HTMLInputElement).checked;
          const newData = { profile_id: checked ? 0 : profile.id };
          chrome.runtime.sendMessage({
            type: 'updateConversationFolder',
            detail: { folderId: folderData.id, newData },
          });
          listEl.querySelectorAll('[id^="enable-profile-button-"]').forEach((btn) => {
            (btn.querySelector('input') as HTMLInputElement).checked = false;
          });
          if (!checked) {
            (item.querySelector('[id^="enable-profile-button-"] input') as HTMLInputElement).checked = true;
          }
          if (folderForNewChat && folderForNewChat.id === folderData.id) {
            updateCustomInstructionProfileSelector(profile, !checked);
          }
        });

        listEl.appendChild(item);
      });

      const hasSub = await chrome.runtime.sendMessage({ type: 'checkHasSubscription' });
      if (!hasSub) {
        listEl.appendChild(managerUpgradeButton('custom-instruction-profiles-folder', 'to see all profiles', 'sm'));
        return;
      }

      if (response.next) {
        const loadMore = document.createElement('button');
        loadMore.id = 'load-more-folder-profile-selector';
        loadMore.classList.value = 'p-2 cursor-pointer flex items-center justify-center h-auto relative';
        loadMore.appendChild(loadingSpinner('load-more-folder-profile-selector'));
        listEl.appendChild(loadMore);
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                folderProfileSelectorLoadProfileList(folderId, page + 1);
                observer.disconnect();
              }
            });
          },
          { threshold: 0 },
        );
        observer.observe(loadMore);
      }
    },
  );
}

function addFolderProfileSelectorModalEventListener(folder: any): void {
  document.querySelector('#folder-profile-selector-close-button')!.addEventListener('click', () => {
    document.querySelector('#folder-profile-selector-modal')?.remove();
  });
  document.body.addEventListener('click', (e) => {
    const modal = document.querySelector('#folder-profile-selector-modal');
    const content = document.querySelector('#folder-profile-selector-content');
    if (
      content &&
      modal &&
      isDescendant(modal as HTMLElement, e.target as HTMLElement) &&
      !isDescendant(content as HTMLElement, e.target as HTMLElement)
    ) {
      modal.remove();
    }
  });
  document.querySelector('#folder-profile-selector-new-profile')!.addEventListener('click', () => {
    createManager('custom-instruction-profiles');
  });
}

// ---------------------------------------------------------------------------
// Profile editor modal
// ---------------------------------------------------------------------------

export async function createCustomInstructionProfileEditor(
  profile: any = {
    name: '',
    name_user_message: '',
    role_user_message: '',
    other_user_message: '',
    traits_model_message: '',
    disabled_tools: [] as string[],
    enabled: true,
  },
): Promise<void> {
  const {
    name,
    name_user_message: nameUserMsg,
    role_user_message: roleUserMsg,
    other_user_message: otherUserMsg,
    traits_model_message: traitsModelMsg,
    personality_type_selection: personalityType,
    personality_traits: personalityTraits,
    disabled_tools: disabledTools,
    enabled,
  } = profile;

  const isValid =
    name.length > 0 &&
    (nameUserMsg?.length ?? 0) < 1500 &&
    (roleUserMsg?.length ?? 0) < 1500 &&
    (otherUserMsg?.length ?? 0) < 1500 &&
    (traitsModelMsg?.length ?? 0) < 1500;

  const selectedStyle =
    baseStyleList.find((s) => s.code === (personalityType || 'default')) ?? baseStyleList[0] ?? null;
  const selectedTraits = {
    warm:
      characteristicListWarm.find((t) => t.code === (personalityTraits?.warm || 'default')) ??
      characteristicListWarm[1] ??
      null,
    enthusiastic:
      characteristicListEnthusiastic.find((t) => t.code === (personalityTraits?.enthusiastic || 'default')) ??
      characteristicListEnthusiastic[1] ??
      null,
    scannable:
      characteristicListScannable.find((t) => t.code === (personalityTraits?.scannable || 'default')) ??
      characteristicListScannable[1] ??
      null,
    emoji:
      characteristicListEmoji.find((t) => t.code === (personalityTraits?.emoji || 'default')) ??
      characteristicListEmoji[1] ??
      null,
  };

  const editorHtml = `<div id="custom-instruction-editor-wrapper" class="absolute inset-0" style="z-index:100010">
<div data-state="open" class="fixed inset-0 z-50 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
  <div class="z-50 h-full w-full overflow-y-auto grid grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,1fr)_auto_minmax(10px,1fr)] md:grid-rows-[minmax(20px,1fr)_auto_minmax(20px,1fr)]">
    <div role="dialog" id="custom-instruction-editor" class="popover relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full bg-token-main-surface-primary text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-2xl shadow-xl flex flex-col overflow-hidden focus:outline-none max-w-xl" tabindex="-1" style="pointer-events: auto;">
      <div class="px-4 pb-4 pt-5 p-6 flex items-center justify-between border-b border-black/10 dark:border-white/10">
        <div class="flex"><div class="flex items-center"><div class="flex grow flex-col gap-1">
          <h2 class="text-lg font-semibold leading-6 text-token-text-primary">Customize ChatGPT</h2>
          <p class="text-sm text-token-text-tertiary">Introduce yourself to get better, more personalized responses</p>
        </div></div></div>
      </div>
      <div class="flex-grow">
        <div class="max-h-[60vh] overflow-y-auto md:max-h-[calc(100vh-300px)] p-6">
          <div class="flex items-center pt-0 pb-3"><h3 class="w-full text-lg font-normal"><div class="truncate select-none">${translate('profile_name')}</div></h3></div>
          <input id="custom-instruction-editor-name-input" placeholder="Work, personal, coding, creative,..." class="rounded p-2 mb-3 w-full resize-none rounded bg-token-main-surface-primary placeholder:text-gray-500 border border-token-border-medium focus-within:border-token-border-xheavy focus:ring-0 focus-visible:ring-0 outline-none focus-visible:outline-none" value="${name}">

          <div class="min-h-header-height flex items-center py-3 mt-2 border-token-border-default border-b"><h3 class="w-full text-lg font-normal"><div class="truncate select-none">${translate('personalization')}</div></h3></div>

          <div class="grid [grid-auto-rows:minmax(min-content,auto)] grid-cols-[minmax(0,1fr)_max-content] items-center gap-2 my-4">
            <div class="truncate select-none">Base style and tone</div>
            <div id="custom-instruction-editor-personality-wrapper" style="position:relative;min-width:100px;width:fit-content;max-width:200px;z-index:1004;margin-left:8px;height:36px;justify-self:end;">
              ${dropdown('Personality', baseStyleList, selectedStyle, 'code', 'right', 'bg-token-main-surface-secondary', false)}
            </div>
            <div class="text-token-text-tertiary -mt-3 text-xs text-pretty">Set the style and tone of how ChatGPT responds to you.</div>
            <div data-empty="true"></div>
            <div class="col-span-full h-1.5 w-full"></div>
            <div class="col-span-full mb-2 w-full">
              <div class="w-full truncate select-none">Characteristics</div>
              <div class="text-token-text-tertiary text-xs text-pretty">Choose additional customizations on top of your base style and tone.</div>
            </div>
            <div class="truncate select-none">Warm</div>
            <div id="custom-instruction-editor-warm-wrapper" style="position:relative;min-width:100px;width:fit-content;max-width:200px;z-index:1003;margin-left:8px;height:36px;justify-self:end;">${dropdown('Warm', characteristicListWarm, selectedTraits.warm, 'code', 'right', 'bg-token-main-surface-secondary', false)}</div>
            <div class="truncate select-none">Enthusiastic</div>
            <div id="custom-instruction-editor-enthusiastic-wrapper" style="position:relative;min-width:100px;width:fit-content;max-width:200px;z-index:1002;margin-left:8px;height:36px;justify-self:end;">${dropdown('Enthusiastic', characteristicListEnthusiastic, selectedTraits.enthusiastic, 'code', 'right', 'bg-token-main-surface-secondary', false)}</div>
            <div class="truncate select-none">Headers &amp; Lists</div>
            <div id="custom-instruction-editor-headers-and-lists-wrapper" style="position:relative;min-width:100px;width:fit-content;max-width:200px;z-index:1001;margin-left:8px;height:36px;justify-self:end;">${dropdown('Scannable', characteristicListScannable, selectedTraits.scannable, 'code', 'right', 'bg-token-main-surface-secondary', false)}</div>
            <div class="truncate select-none">Emoji</div>
            <div id="custom-instruction-editor-emoji-wrapper" style="position:relative;min-width:100px;width:fit-content;max-width:200px;z-index:1000;margin-left:8px;height:36px;justify-self:end;">${dropdown('Emoji', characteristicListEmoji, selectedTraits.emoji, 'code', 'right', 'bg-token-main-surface-secondary', false)}</div>
          </div>

          <div class="flex items-center">
            <p class="text-muted my-2 py-2 me-2 text-sm font-medium text-token-text-primary">${translate('custom_instructions')}</p>
          </div>
          <div>
            <textarea id="custom-instruction-editor-traits-model-message" class="w-full resize-none bg-token-main-surface-primary rounded-lg border text-sm focus-token-border-heavy border-token-border-medium placeholder:text-gray-400" placeholder="Additional behavior, style, and tone preferences" rows="5">${traitsModelMsg || ''}</textarea>
          </div>

          <div class="min-h-header-height flex items-center py-3 mt-2 border-token-border-default border-b"><h3 class="w-full text-lg font-normal"><div class="truncate select-none">${translate('about_you')}</div></h3></div>

          <p class="text-muted py-2 mt-2 text-sm font-medium">${translate('nickname')}</p>
          <div class="mb-3">
            <textarea id="custom-instruction-editor-name-user-message" placeholder="What should ChatGPT call you?" class="w-full resize-none bg-token-main-surface-primary rounded-lg border text-sm focus-token-border-heavy border-token-border-medium placeholder:text-gray-400" rows="1">${nameUserMsg || ''}</textarea>
          </div>
          <p class="text-muted py-2 text-sm font-medium text-token-text-primary">${translate('occupation')}</p>
          <div class="mb-3">
            <textarea id="custom-instruction-editor-role-user-message" class="w-full resize-none bg-token-main-surface-primary rounded-lg border text-sm focus-token-border-heavy border-token-border-medium placeholder:text-gray-400" placeholder="interior designer, freelance copywriter, etc." rows="1">${roleUserMsg || ''}</textarea>
          </div>

          <div class="flex items-center">
            <p class="text-muted me-2 py-2 text-sm font-medium text-token-text-primary">${translate('more_about_you')}</p>
          </div>
          <div>
            <textarea id="custom-instruction-editor-other-user-message" class="w-full resize-none bg-token-main-surface-primary rounded-lg border text-sm focus-token-border-heavy border-token-border-medium placeholder:text-gray-400" placeholder="Interests, values, or preferences to keep in mind" rows="5">${otherUserMsg || ''}</textarea>
          </div>

          <div class="mt-3">
            <button id="custom-instruction-editor-advanced-button" class="text-muted flex items-center justify-between py-2 text-sm font-medium text-token-text-primary">${translate('advanced')}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms-1 h-5 w-5"><g><path fill-rule="evenodd" clip-rule="evenodd" d="M15.0337 7.74408C14.7082 7.41864 14.1806 7.41864 13.8552 7.74408L9.99998 11.5993L6.14479 7.74408C5.81935 7.41864 5.29171 7.41864 4.96628 7.74408C4.64084 8.06951 4.64084 8.59715 4.96628 8.92259L9.41072 13.367C9.73616 13.6925 10.2638 13.6925 10.5892 13.367L15.0337 8.92259C15.3591 8.59715 15.3591 8.06951 15.0337 7.74408Z" fill="currentColor"></path></g></svg>
            </button>
            <div id="custom-instruction-editor-advanced-settings" class="flex flex-col gap-2 mt-2 ps-3 hidden">
              <div class="mt-2">
                <div class="border-token-border-light flex min-h-15 items-center border-b py-2 last-of-type:border-none"><div class="w-full"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2">Web search</div><div class="flex items-center gap-1"><label class="sp-switch"><input id="custom-instruction-editor-browser-switch" data-testid="browser" type="checkbox" ${disabledTools.includes('browser') ? '' : 'checked=""'}><span class="sp-switch-slider round"></span></label></div></div><div class="text-xs text-token-text-tertiary pe-12 my-1">Let ChatGPT automatically search the web for answers.</div></div></div>
                <div class="border-token-border-light flex min-h-15 items-center border-b py-2 last-of-type:border-none"><div class="w-full"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2">Code</div><div class="flex items-center gap-1"><label class="sp-switch"><input id="custom-instruction-editor-code-switch" data-testid="python" type="checkbox" ${disabledTools.includes('python') ? '' : 'checked=""'}><span class="sp-switch-slider round"></span></label></div></div><div class="text-xs text-token-text-tertiary pe-12 my-1">Let ChatGPT execute code using Code Interpreter.</div></div></div>
                <div class="border-token-border-light flex min-h-15 items-center border-b py-2 last-of-type:border-none"><div class="w-full"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2">Canvas</div><div class="flex items-center gap-1"><label class="sp-switch"><input id="custom-instruction-editor-canvas-switch" data-testid="canmore" type="checkbox" ${disabledTools.includes('canmore') ? '' : 'checked=""'}><span class="sp-switch-slider round"></span></label></div></div><div class="text-xs text-token-text-tertiary pe-12 my-1">Collaborate with ChatGPT on text and code.</div></div></div>
                <div class="border-token-border-light flex min-h-15 items-center border-b py-2 last-of-type:border-none"><div class="w-full"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2">ChatGPT Voice</div><div class="flex items-center gap-1"><label class="sp-switch"><input id="custom-instruction-editor-chatgpt-voice-switch" data-testid="chatgpt_voice" type="checkbox" ${disabledTools.includes('chatgpt_voice') ? '' : 'checked=""'}><span class="sp-switch-slider round"></span></label></div></div><div class="text-xs text-token-text-tertiary pe-12 my-1">Enable voice mode in ChatGPT</div></div></div>
                <div id="custom-instruction-editor-advanced-voice-switch-wrapper" class="border-token-border-light flex min-h-15 items-center border-b py-2 last-of-type:border-none ${disabledTools.includes('chatgpt_voice') ? 'hidden' : ''}"><div class="w-full"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2">Advanced voice</div><div class="flex items-center gap-1"><label class="sp-switch"><input id="custom-instruction-editor-advanced-voice-switch" data-testid="advanced_voice" type="checkbox" ${disabledTools.includes('advanced_voice') ? '' : 'checked=""'}><span class="sp-switch-slider round"></span></label></div></div><div class="text-xs text-token-text-tertiary pe-12 my-1">Have more natural conversations in voice mode.</div></div></div>
                <div><div class="border-token-border-light flex min-h-15 items-center border-b py-2 last-of-type:border-none"><div class="w-full"><div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2">Connector search</div><div class="flex items-center gap-1"><label class="sp-switch"><input id="custom-instruction-editor-connector-search-switch" data-testid="connector_search" type="checkbox" ${disabledTools.includes('connector_search') ? '' : 'checked=""'}><span class="sp-switch-slider round"></span></label></div></div><div class="text-xs text-token-text-tertiary pe-12 my-1">Let ChatGPT automatically search connected sources for answers.</div></div></div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="border-t p-6">
          <div class="flex flex-grow flex-col items-stretch justify-between gap-0 flex-row items-center gap-3">
            <div class="cursor-pointer text-sm flex items-center justify-start gap-2">
              ${translate('enable_this_profile')}
              <label class="sp-switch"><input id="custom-instruction-editor-status-switch" type="checkbox" ${enabled ? 'checked=""' : ''}><span class="sp-switch-slider round"></span></label>
            </div>
            <div class="flex flex-col gap-3 flex-row-reverse">
              <button id="custom-instruction-editor-save-button" class="disabled:opacity-50 hover:bg-inherit disabled:cursor-not-allowed btn relative composer-submit-btn composer-submit-button-color" ${isValid ? '' : 'disabled=""'}><div class="flex items-center justify-center">${translate('Save')}</div></button>
              <button id="custom-instruction-editor-cancel-button" class="btn relative btn-secondary"><div class="flex items-center justify-center">${translate('Cancel')}</div></button>
              ${profile.id ? `<button id="custom-instruction-editor-delete-button" class="btn relative btn-danger"><div class="flex items-center justify-center">${translate('Delete')}</div></button>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', editorHtml);
  addCustomInstructionProfileEditorEventListeners(profile);
}

function addCustomInstructionProfileEditorEventListeners(profile: any): void {
  addDropdownEventListener('Personality', baseStyleList, 'code', () => {});
  addDropdownEventListener('Warm', characteristicListWarm, 'code', () => {});
  addDropdownEventListener('Enthusiastic', characteristicListEnthusiastic, 'code', () => {});
  addDropdownEventListener('Scannable', characteristicListScannable, 'code', () => {});
  addDropdownEventListener('Emoji', characteristicListEmoji, 'code', () => {});

  const wrapper = document.querySelector('#custom-instruction-editor-wrapper') as HTMLElement;
  const editor = document.querySelector('#custom-instruction-editor') as HTMLElement;
  const cancelBtn = editor.querySelector('#custom-instruction-editor-cancel-button') as HTMLElement;
  const deleteBtn = editor.querySelector('#custom-instruction-editor-delete-button') as HTMLElement | null;
  const saveBtn = editor.querySelector('#custom-instruction-editor-save-button') as HTMLButtonElement;
  const statusSwitch = editor.querySelector('#custom-instruction-editor-status-switch') as HTMLInputElement;
  const nameInput = editor.querySelector('#custom-instruction-editor-name-input') as HTMLInputElement;
  const personalityTitle = editor.querySelector('#selected-personality-title') as HTMLElement;
  const traitTitles = {
    warm: editor.querySelector('#selected-warm-title') as HTMLElement,
    enthusiastic: editor.querySelector('#selected-enthusiastic-title') as HTMLElement,
    scannable: editor.querySelector('#selected-scannable-title') as HTMLElement,
    emoji: editor.querySelector('#selected-emoji-title') as HTMLElement,
  };
  const nameUserMsgEl = editor.querySelector('#custom-instruction-editor-name-user-message') as HTMLTextAreaElement;
  const roleUserMsgEl = editor.querySelector('#custom-instruction-editor-role-user-message') as HTMLTextAreaElement;
  const traitsModelMsgEl = editor.querySelector(
    '#custom-instruction-editor-traits-model-message',
  ) as HTMLTextAreaElement;
  const otherUserMsgEl = editor.querySelector('#custom-instruction-editor-other-user-message') as HTMLTextAreaElement;
  const advancedBtn = editor.querySelector('#custom-instruction-editor-advanced-button') as HTMLElement;
  const advancedSettings = editor.querySelector('#custom-instruction-editor-advanced-settings') as HTMLElement;
  const browserSwitch = editor.querySelector('#custom-instruction-editor-browser-switch') as HTMLInputElement;
  const codeSwitch = editor.querySelector('#custom-instruction-editor-code-switch') as HTMLInputElement;
  const canvasSwitch = editor.querySelector('#custom-instruction-editor-canvas-switch') as HTMLInputElement;
  const voiceSwitch = editor.querySelector('#custom-instruction-editor-chatgpt-voice-switch') as HTMLInputElement;
  const advVoiceSwitch = editor.querySelector('#custom-instruction-editor-advanced-voice-switch') as HTMLInputElement;
  const connectorSwitch = editor.querySelector(
    '#custom-instruction-editor-connector-search-switch',
  ) as HTMLInputElement;
  const allToolSwitches = [browserSwitch, codeSwitch, canvasSwitch, voiceSwitch, advVoiceSwitch, connectorSwitch];

  const validateField = (el: HTMLTextAreaElement, value: string) => {
    if (value.length > 1500) {
      el.classList.add('border-red-500');
      saveBtn.setAttribute('disabled', '');
    } else {
      el.classList.remove('border-red-500');
      if (
        nameInput.value.length > 0 &&
        nameUserMsgEl.value.length <= 1500 &&
        roleUserMsgEl.value.length <= 1500 &&
        traitsModelMsgEl.value.length <= 1500 &&
        otherUserMsgEl.value.length <= 1500
      ) {
        saveBtn.removeAttribute('disabled');
      } else {
        saveBtn.setAttribute('disabled', '');
      }
    }
  };

  wrapper.addEventListener('click', (e) => {
    if (!isDescendant(editor, e.target as HTMLElement)) wrapper.remove();
  });
  nameInput.addEventListener('input', () => {
    if (
      nameInput.value.length > 0 &&
      nameUserMsgEl.value.length <= 1500 &&
      roleUserMsgEl.value.length <= 1500 &&
      traitsModelMsgEl.value.length <= 1500 &&
      otherUserMsgEl.value.length <= 1500
    ) {
      saveBtn.removeAttribute('disabled');
    } else {
      saveBtn.setAttribute('disabled', '');
    }
  });
  nameUserMsgEl.addEventListener('input', () => validateField(nameUserMsgEl, nameUserMsgEl.value));
  roleUserMsgEl.addEventListener('input', () => validateField(roleUserMsgEl, roleUserMsgEl.value));
  traitsModelMsgEl.addEventListener('input', () => validateField(traitsModelMsgEl, traitsModelMsgEl.value));
  otherUserMsgEl.addEventListener('input', () => validateField(otherUserMsgEl, otherUserMsgEl.value));
  advancedBtn.addEventListener('click', () => advancedSettings.classList.toggle('hidden'));

  voiceSwitch.addEventListener('change', () => {
    if (voiceSwitch.checked) {
      document.querySelector('#custom-instruction-editor-advanced-voice-switch-wrapper')?.classList.remove('hidden');
      if (statusSwitch.checked) updateAccountUserSetting('voice_enabled', true);
    } else {
      advVoiceSwitch.checked = false;
      document.querySelector('#custom-instruction-editor-advanced-voice-switch-wrapper')?.classList.add('hidden');
      if (statusSwitch.checked) updateAccountUserSetting('voice_enabled', false);
    }
  });
  connectorSwitch.addEventListener('change', () => {
    if (statusSwitch.checked) {
      updateAccountUserSetting('connector_search_enabled', connectorSwitch.checked);
    }
  });

  cancelBtn.addEventListener('click', () => wrapper.remove());

  deleteBtn?.addEventListener('click', () => {
    showConfirmDialog(
      'Delete profile',
      'Are you sure you want to delete this custom instruction profile?',
      'Cancel',
      'Delete',
      null,
      () => {
        chrome.runtime.sendMessage(
          { type: 'deleteCustomInstructionProfile', detail: { profileId: profile.id } },
          () => {
            document.querySelector(`#custom-instruction-profile-card-${profile.id}`)?.remove();
            const profileList = document.querySelector(
              '#modal-manager #custom-instruction-profile-manager-profile-list',
            );
            if (profileList && profileList.children.length === 0) {
              const empty = document.createElement('p');
              empty.id = 'no-conversations-found';
              empty.innerText = 'No profiles found';
              profileList.appendChild(empty);
            }
            if (profile.enabled) setUserSystemMessage('', '', '', '', 'default', {}, false, []);
            initializeCustomInstructionProfileSelector(true);
          },
        );
        wrapper.remove();
      },
    );
  });

  saveBtn.addEventListener('click', () => {
    const disabledToolsList = allToolSwitches.filter((sw) => !sw.checked).map((sw) => sw.dataset.testid!);
    const data: any = {
      name: nameInput.value,
      name_user_message: nameUserMsgEl.value,
      role_user_message: roleUserMsgEl.value,
      traits_model_message: traitsModelMsgEl.value,
      other_user_message: otherUserMsgEl.value,
      personality_type_selection: personalityTitle?.dataset.option,
      personality_traits: {
        warm: traitTitles.warm?.dataset.option,
        enthusiastic: traitTitles.enthusiastic?.dataset.option,
        scannable: traitTitles.scannable?.dataset.option,
        emoji: traitTitles.emoji?.dataset.option,
      },
      enabled: statusSwitch.checked,
      disabled_tools: disabledToolsList,
    };
    if (profile.id) data.id = profile.id;

    chrome.runtime.sendMessage(
      {
        type: profile.id ? 'updateCustomInstructionProfile' : 'addCustomInstructionProfile',
        detail: { profileId: profile.id, profile: data },
      },
      async (result) => {
        if (result.error && result.error.type === 'limit') {
          errorUpgradeConfirmation(result.error);
          return;
        }
        wrapper.remove();
        document.querySelector('#modal-manager #no-profiles-found')?.remove();
        if (result.enabled) {
          document.querySelectorAll('#modal-manager input[id^="profile-card-status-switch-"]').forEach((el) => {
            (el as HTMLInputElement).checked = false;
          });
        }
        initializeCustomInstructionProfileSelector(true);
        const existingCard = document.querySelector(
          `#custom-instruction-profile-card-${profile.id}`,
        ) as HTMLElement | null;
        addOrReplaceProfileCard(result, existingCard);
        if (result.enabled) {
          setUserSystemMessage(
            data.name_user_message,
            data.role_user_message,
            data.traits_model_message,
            data.other_user_message,
            data.personality_type_selection,
            data.personality_traits,
            data.enabled,
            data.disabled_tools,
          );
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Profile card settings menu
// ---------------------------------------------------------------------------

export async function showProfileCardSettingsMenu(
  anchor: HTMLElement,
  profile: any,
  fromManager = false,
): Promise<void> {
  const profileId = profile.id;
  const { right, top } = anchor.getBoundingClientRect();
  const x = fromManager ? right - 224 : right - 6;
  const y = top + 20;

  const menuHtml = `<div id="profile-card-settings-menu" dir="ltr" style="transform:translate3d(${x}px,${y}px,0);position:fixed;left:0;top:0;min-width:max-content;z-index:10001;"><div data-side="bottom" data-align="start" role="menu" class="max-w-xs rounded-2xl text-token-text-primary bg-token-main-surface-secondary shadow-long p-1" tabindex="-1" style="min-width:200px;outline:0;pointer-events:auto">
  <div role="menuitem" id="edit-profile-settings-button-${profileId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor"></path></svg>${translate('Edit')}</div></div>
  <div role="menuitem" id="duplicate-profile-settings-button-${profileId}" class="flex items-center justify-between gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group" tabindex="-1"><div class="flex gap-2"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="icon icon-md" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>${translate('Duplicate')}</div></div>
  <div role="menuitem" id="delete-profile-settings-button-${profileId}" class="flex gap-2 rounded-xl p-2.5 text-sm cursor-pointer focus:ring-0 hover:bg-token-main-surface-tertiary group text-red-500" tabindex="-1"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.5555 4C10.099 4 9.70052 4.30906 9.58693 4.75114L9.29382 5.8919H14.715L14.4219 4.75114C14.3083 4.30906 13.9098 4 13.4533 4H10.5555ZM16.7799 5.8919L16.3589 4.25342C16.0182 2.92719 14.8226 2 13.4533 2H10.5555C9.18616 2 7.99062 2.92719 7.64985 4.25342L7.22886 5.8919H4C3.44772 5.8919 3 6.33961 3 6.8919C3 7.44418 3.44772 7.8919 4 7.8919H4.10069L5.31544 19.3172C5.47763 20.8427 6.76455 22 8.29863 22H15.7014C17.2354 22 18.5224 20.8427 18.6846 19.3172L19.8993 7.8919H20C20.5523 7.8919 21 7.44418 21 6.8919C21 6.33961 20.5523 5.8919 20 5.8919H16.7799ZM17.888 7.8919H6.11196L7.30423 19.1057C7.3583 19.6142 7.78727 20 8.29863 20H15.7014C16.2127 20 16.6417 19.6142 16.6958 19.1057L17.888 7.8919ZM10 10C10.5523 10 11 10.4477 11 11V16C11 16.5523 10.5523 17 10 17C9.44772 17 9 16.5523 9 16V11C9 10.4477 9.44772 10 10 10ZM14 10C14.5523 10 15 10.4477 15 11V16C15 16.5523 14.5523 17 14 17C13.4477 17 13 16.5523 13 16V11C13 10.4477 13.4477 10 14 10Z" fill="currentColor"></path></svg>${translate('Delete')}</div>
  </div></div>`;

  document.body.insertAdjacentHTML('beforeend', menuHtml);
  adjustMenuPosition(document.querySelector('#profile-card-settings-menu'));
  addProfileSettingsMenuEventListeners(profile);
}

function addProfileSettingsMenuEventListeners(profile: any): void {
  const profileId = profile.id;
  const editBtn = document.getElementById(`edit-profile-settings-button-${profileId}`);
  const duplicateBtn = document.getElementById(`duplicate-profile-settings-button-${profileId}`);
  const deleteBtn = document.getElementById(`delete-profile-settings-button-${profileId}`);

  editBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    createCustomInstructionProfileEditor(profile);
  });

  duplicateBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    chrome.runtime.sendMessage(
      { type: 'duplicateCustomInstructionProfile', forceRefresh: true, detail: { profileId } },
      (result) => {
        if (result.error && result.error.type === 'limit') {
          errorUpgradeConfirmation(result.error);
          return;
        }
        initializeCustomInstructionProfileSelector(true);
        const existingCard = document.querySelector(
          `#custom-instruction-profile-card-${profileId}`,
        ) as HTMLElement | null;
        addOrReplaceProfileCard(result, existingCard);
      },
    );
  });

  deleteBtn?.addEventListener('click', () => {
    closeMenus();
    handleDeleteProfile(profile);
  });
}

function handleDeleteProfile(profile: any): void {
  showConfirmDialog(
    'Delete profile',
    'Are you sure you want to delete this custom instruction profile?',
    'Cancel',
    'Delete',
    null,
    () => {
      chrome.runtime.sendMessage({ type: 'deleteCustomInstructionProfile', detail: { profileId: profile.id } }, () => {
        document.querySelector(`#custom-instruction-profile-card-${profile.id}`)?.remove();
        const profileList = document.querySelector('#modal-manager #custom-instruction-profile-manager-profile-list');
        if (profileList && profileList.children.length === 0) {
          const empty = document.createElement('p');
          empty.id = 'no-conversations-found';
          empty.innerText = 'No profiles found';
          profileList.appendChild(empty);
        }
        if (profile.enabled) setUserSystemMessage('', '', '', '', 'default', {}, false, []);
        initializeCustomInstructionProfileSelector(true);
      });
    },
  );
}

// ---------------------------------------------------------------------------
// updateCustomInstructionProfileSelector
// Original source: content.isolated.end.js line 16571
// ---------------------------------------------------------------------------

/**
 * Enable or disable a custom instruction profile, update the backend,
 * toggle the enable-button visibility, and refresh the dropdown label.
 */
export function updateCustomInstructionProfileSelector(profile: any, enabled: boolean): void {
  chrome.runtime.sendMessage(
    {
      type: 'updateCustomInstructionProfile',
      detail: { profileId: profile.id, profile: { enabled } },
    },
    () => {
      setUserSystemMessage(
        profile.name_user_message,
        profile.role_user_message,
        profile.traits_model_message,
        profile.other_user_message,
        profile.personality_type_selection,
        profile.personality_traits,
        enabled,
        profile.disabled_tools,
      );

      // Reset all enable-buttons
      document.querySelectorAll('#profile-list-dropdown-wrapper [id^="enable-profile-button-"]').forEach((btn) => {
        btn.classList.add('hidden');
        (btn as HTMLElement).dataset.enabled = 'false';
      });

      if (enabled) {
        const btn = document.querySelector(
          `#custom-instruction-profile-selector-wrapper button[id^="enable-profile-button-${profile.id}"]`,
        );
        if (btn) {
          btn.classList.remove('hidden');
          (btn as HTMLElement).dataset.enabled = 'true';
        }
      }

      const dropdownBtn = document.querySelector('#profile-selector-dropdown-button');
      if (dropdownBtn) {
        dropdownBtn.innerHTML = `<span class="me-6 truncate" style="min-width:100px; max-width:200px;">${enabled ? profile.name : 'Select a profile'}</span><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md text-token-text-tertiary absolute" style="right:10px;transform: rotate(180deg);"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.29289 9.29289C5.68342 8.90237 6.31658 8.90237 6.70711 9.29289L12 14.5858L17.2929 9.29289C17.6834 8.90237 18.3166 8.90237 18.7071 9.29289C19.0976 9.68342 19.0976 10.3166 18.7071 10.7071L12.7071 16.7071C12.5196 16.8946 12.2652 17 12 17C11.7348 17 11.4804 16.8946 11.2929 16.7071L5.29289 10.7071C4.90237 10.3166 4.90237 9.68342 5.29289 9.29289Z" fill="currentColor"></path></svg>`;
      }
    },
  );
}

// ---------------------------------------------------------------------------
// addOrReplaceProfileCard
// Original source: content.isolated.end.js line 16402
// ---------------------------------------------------------------------------

/**
 * Insert or replace a profile card in the profile manager list.
 * If an existing card is found by id, it is replaced in-place.
 * Otherwise the new card is prepended (or inserted after `existingCard`).
 */
export function addOrReplaceProfileCard(profile: any, existingCard: HTMLElement | null = null): void {
  const existing = document.querySelector(`#modal-manager #custom-instruction-profile-card-${profile.id}`);
  if (existing) {
    const newCard = createCustomInstructionProfileCard(profile);
    existing.replaceWith(newCard);
    addCustomInstructionProfileCardEventListeners(profile);
  } else {
    const list = document.querySelector('#modal-manager #custom-instruction-profile-manager-profile-list');
    const noProfiles = document.querySelector('#modal-manager #no-profiles-found');
    if (noProfiles) noProfiles.remove();
    const newCard = createCustomInstructionProfileCard(profile);
    if (existingCard) {
      existingCard.after(newCard);
    } else {
      list?.prepend(newCard);
    }
    addCustomInstructionProfileCardEventListeners(profile);
  }
}
