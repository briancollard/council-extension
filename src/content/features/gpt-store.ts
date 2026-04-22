/**
 * GPT Store feature — enhanced GPT/Gizmo discovery page.
 *
 * Replaces or augments the default ChatGPT GPT store with:
 *   - Richer card layout with ratings and usage stats
 *   - Category filtering and "more categories" sub-menu
 *   - Sort by (recent / popular)
 *   - Search within the store
 *   - Gizmo card context menus (edit, delete, add/hide from sidebar, about)
 *   - Full about dialog with ratings, capabilities, conversation starters
 *   - IntersectionObserver-based "load more" pagination
 *
 * Original source: content.isolated.end.js lines 8192-8817
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { debounce, closeMenus, closeModals, isDarkMode, openUpgradeModal, blurredList } from '../../utils/shared';
import {
  loadingSpinner,
  dropdown,
  addDropdownEventListener,
  toast,
  isDescendant,
  showConfirmDialog,
  addTooltip,
} from '../isolated-world/ui/primitives';
import { translate, gizmoSortByList } from './i18n';
import {
  getGizmoDiscovery,
  getGizmoAbout,
  getGizmosBootstrap,
  getGizmosByUser,
  deleteGizmo,
  updateGizmoSidebar,
} from '../isolated-world/api';
import { cachedSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GizmoCard {
  id: string;
  display: {
    name?: string;
    description?: string;
    profile_picture_url?: string;
    categories?: string[];
    prompt_starters?: string[];
  };
  author: {
    display_name: string;
    user_id: string;
    link_to?: string;
  };
  vanity_metrics: {
    num_conversations_str?: string;
    created_ago_str?: string;
  };
  live_version?: number;
  share_recipient?: string;
  short_url?: string;
  [key: string]: unknown;
}

interface GizmoCategory {
  id: string;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

export let gizmoPageNumber = 1;
export let gizmoCursor: string | null = null;
export let noMoreGizmo = false;
export let gizmoSortBy: string =
  typeof gizmoSortByList !== 'undefined' && gizmoSortByList[0] ? gizmoSortByList[0].code : 'popular';
export let selectedGizmoCategoryId = 'all';

/** Setters for mutable gizmo state (needed by external modules). */
export function setGizmoPageNumber(v: number) {
  gizmoPageNumber = v;
}
export function setGizmoCursor(v: string | null) {
  gizmoCursor = v;
}
export function setNoMoreGizmo(v: boolean) {
  noMoreGizmo = v;
}
export function setGizmoSortBy(v: string) {
  gizmoSortBy = v;
}
export function setSelectedGizmoCategoryId(v: string) {
  selectedGizmoCategoryId = v;
}

// ---------------------------------------------------------------------------
// Category data
// ---------------------------------------------------------------------------

export const gizmoCategories: GizmoCategory[] = [
  {
    id: 'all',
    title: 'All GPTs',
    description: 'Full list of all GPTs in the store. With the ability to search and sort by most popular.',
  },
  { id: 'featured_store', title: 'Top Picks', description: 'Curated top picks from this week' },
  { id: 'trending', title: 'Trending', description: 'Most popular GPTs by our community' },
  { id: 'featured', title: 'By ChatGPT', description: 'GPTs created by the ChatGPT team' },
  { id: 'pinned', title: 'Pinned', description: 'Pinned GPTs in your sidebar' },
  { id: 'mine', title: 'My GPTs', description: 'My GPTs' },
  { id: 'more_categories', title: '. . .', description: 'More Categories' },
];

export const gizmoMoreCategories: GizmoCategory[] = [
  { id: 'dalle', title: 'DALL\u00B7E', description: 'Transform your ideas into amazing images' },
  {
    id: 'writing',
    title: 'Writing',
    description: 'Enhance your writing with tools for creation, editing, and style refinement',
  },
  { id: 'productivity', title: 'Productivity', description: 'Increase your efficiency' },
  { id: 'research', title: 'Research', description: 'Find, evaluate, interpret, and visualize information' },
  { id: 'programming', title: 'Programming', description: 'Write code, debug, test, and learn' },
  { id: 'education', title: 'Education', description: 'Explore new ideas, revisit existing skills' },
  { id: 'lifestyle', title: 'Lifestyle', description: 'Get tips on travel, workouts, style, food, and more' },
];

// ---------------------------------------------------------------------------
// SVG icons (shared across the module)
// ---------------------------------------------------------------------------

const SPINNER_SVG =
  '<svg x="0" y="0" viewbox="0 0 40 40" class="spinner icon icon-xl"><circle fill="transparent" stroke="#ffffff50" stroke-width="2" stroke-linecap="round" stroke-dasharray="125.6" cx="20" cy="20" r="18"></circle></svg>';

const THREE_DOT_MENU_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-md relative"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z" fill="currentColor"></path></svg>';

const CONVERSATIONS_ICON_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.52242 6.53608C9.7871 4.41979 12.1019 3 14.75 3C18.7541 3 22 6.24594 22 10.25C22 11.9007 21.4474 13.4239 20.5183 14.6425L21.348 15.97C21.5407 16.2783 21.5509 16.6668 21.3746 16.9848C21.1984 17.3027 20.8635 17.5 20.5 17.5H15.4559C14.1865 19.5963 11.883 21 9.25 21C9.18896 21 9.12807 20.9992 9.06735 20.9977C9.04504 20.9992 9.02258 21 9 21H3.5C3.13647 21 2.80158 20.8027 2.62536 20.4848C2.44913 20.1668 2.45933 19.7783 2.652 19.47L3.48171 18.1425C2.55263 16.9239 2 15.4007 2 13.75C2 9.99151 4.85982 6.90116 8.52242 6.53608ZM10.8938 6.68714C14.106 7.43177 16.5 10.3113 16.5 13.75C16.5 14.3527 16.4262 14.939 16.2871 15.5H18.6958L18.435 15.0828C18.1933 14.6961 18.2439 14.1949 18.5579 13.8643C19.4525 12.922 20 11.651 20 10.25C20 7.35051 17.6495 5 14.75 5C13.2265 5 11.8535 5.64888 10.8938 6.68714ZM8.89548 19C8.94178 18.9953 8.98875 18.9938 9.03611 18.9957C9.107 18.9986 9.17831 19 9.25 19C11.3195 19 13.1112 17.8027 13.9668 16.0586C14.3079 15.363 14.5 14.5804 14.5 13.75C14.5 10.8505 12.1495 8.5 9.25 8.5C9.21772 8.5 9.18553 8.50029 9.15341 8.50087C6.2987 8.55218 4 10.8828 4 13.75C4 15.151 4.54746 16.422 5.44215 17.3643C5.75613 17.6949 5.80666 18.1961 5.56498 18.5828L5.30425 19H8.89548Z" fill="currentColor"></path></svg>';

const GIZMO_DEFAULT_ICON_SVG =
  '<div class="gizmo-shadow-stroke relative flex w-full h-full items-center justify-center rounded-md bg-white text-black"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="text-token-secondary h-full w-full" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></div>';

const STAR_SVG =
  '<svg width="24" height="24" viewBox="0 0 39 39" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm"><path d="M15.6961 2.70609C17.4094 -0.33367 21.7868 -0.333671 23.5002 2.70609L27.237 9.33591C27.3648 9.56271 27.585 9.72268 27.8402 9.77418L35.3003 11.2794C38.7207 11.9695 40.0734 16.1327 37.7119 18.7015L32.5613 24.3042C32.3851 24.4958 32.301 24.7547 32.3309 25.0133L33.2046 32.5734C33.6053 36.0397 30.0639 38.6127 26.891 37.1605L19.971 33.9933C19.7342 33.885 19.4621 33.885 19.2253 33.9933L12.3052 37.1605C9.1324 38.6127 5.59103 36.0397 5.99163 32.5734L6.86537 25.0133C6.89526 24.7547 6.81116 24.4958 6.63496 24.3042L1.48438 18.7015C-0.877157 16.1327 0.475528 11.9695 3.89596 11.2794L11.356 9.77418C11.6113 9.72268 11.8314 9.56271 11.9593 9.33591L15.6961 2.70609Z" fill="currentColor"></path></svg>';

const CHECK_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-sm mt-0.5 text-green-600"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.0633 5.67375C18.5196 5.98487 18.6374 6.607 18.3262 7.06331L10.8262 18.0633C10.6585 18.3093 10.3898 18.4678 10.0934 18.4956C9.79688 18.5234 9.50345 18.4176 9.29289 18.2071L4.79289 13.7071C4.40237 13.3166 4.40237 12.6834 4.79289 12.2929C5.18342 11.9023 5.81658 11.9023 6.20711 12.2929L9.85368 15.9394L16.6738 5.93664C16.9849 5.48033 17.607 5.36263 18.0633 5.67375Z" fill="currentColor"></path></svg>';

const CHAT_ICON_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-lg"><g id="chat"><path id="vector" fill-rule="evenodd" clip-rule="evenodd" d="M12 4.5C7.58172 4.5 4 8.08172 4 12.5C4 14.6941 4.88193 16.6802 6.31295 18.1265C6.6343 18.4513 6.69466 18.9526 6.45959 19.3443L5.76619 20.5H12C16.4183 20.5 20 16.9183 20 12.5C20 8.08172 16.4183 4.5 12 4.5ZM2 12.5C2 6.97715 6.47715 2.5 12 2.5C17.5228 2.5 22 6.97715 22 12.5C22 18.0228 17.5228 22.5 12 22.5H4C3.63973 22.5 3.30731 22.3062 3.1298 21.9927C2.95229 21.6792 2.95715 21.2944 3.14251 20.9855L4.36137 18.9541C2.88894 17.2129 2 14.9595 2 12.5Z" fill="currentColor"></path></g></svg>';

// Share recipient SVGs used in "mine" view
const PRIVATE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" stroke="#ef4146cc" fill="#ef4146cc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em"><path d="M80 192V144C80 64.47 144.5 0 224 0C303.5 0 368 64.47 368 144V192H384C419.3 192 448 220.7 448 256V448C448 483.3 419.3 512 384 512H64C28.65 512 0 483.3 0 448V256C0 220.7 28.65 192 64 192H80zM144 192H304V144C304 99.82 268.2 64 224 64C179.8 64 144 99.82 144 144V192z"/></svg>';
const LINK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="#e06c2b" fill="#e06c2b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em"><path d="M172.5 131.1C228.1 75.51 320.5 75.51 376.1 131.1C426.1 181.1 433.5 260.8 392.4 318.3L391.3 319.9C381 334.2 361 337.6 346.7 327.3C332.3 317 328.9 297 339.2 282.7L340.3 281.1C363.2 249 359.6 205.1 331.7 177.2C300.3 145.8 249.2 145.8 217.7 177.2L105.5 289.5C73.99 320.1 73.99 372 105.5 403.5C133.3 431.4 177.3 435 209.3 412.1L210.9 410.1C225.3 400.7 245.3 404 255.5 418.4C265.8 432.8 262.5 452.8 248.1 463.1L246.5 464.2C188.1 505.3 110.2 498.7 60.21 448.8C3.741 392.3 3.741 300.7 60.21 244.3L172.5 131.1zM467.5 380C411 436.5 319.5 436.5 263 380C213 330 206.5 251.2 247.6 193.7L248.7 192.1C258.1 177.8 278.1 174.4 293.3 184.7C307.7 194.1 311.1 214.1 300.8 229.3L299.7 230.9C276.8 262.1 280.4 306.9 308.3 334.8C339.7 366.2 390.8 366.2 422.3 334.8L534.5 222.5C566 191 566 139.1 534.5 108.5C506.7 80.63 462.7 76.99 430.7 99.9L429.1 101C414.7 111.3 394.7 107.1 384.5 93.58C374.2 79.2 377.5 59.21 391.9 48.94L393.5 47.82C451 6.731 529.8 13.25 579.8 63.24C636.3 119.7 636.3 211.3 579.8 267.7L467.5 380z"/></svg>';
const MARKETPLACE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" stroke="#19c37d" fill="#19c37d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em"><path d="M319.9 320c57.41 0 103.1-46.56 103.1-104c0-57.44-46.54-104-103.1-104c-57.41 0-103.1 46.56-103.1 104C215.9 273.4 262.5 320 319.9 320zM369.9 352H270.1C191.6 352 128 411.7 128 485.3C128 500.1 140.7 512 156.4 512h327.2C499.3 512 512 500.1 512 485.3C512 411.7 448.4 352 369.9 352zM512 160c44.18 0 80-35.82 80-80S556.2 0 512 0c-44.18 0-80 35.82-80 80S467.8 160 512 160zM183.9 216c0-5.449 .9824-10.63 1.609-15.91C174.6 194.1 162.6 192 149.9 192H88.08C39.44 192 0 233.8 0 285.3C0 295.6 7.887 304 17.62 304h199.5C196.7 280.2 183.9 249.7 183.9 216zM128 160c44.18 0 80-35.82 80-80S172.2 0 128 0C83.82 0 48 35.82 48 80S83.82 160 128 160zM551.9 192h-61.84c-12.8 0-24.88 3.037-35.86 8.24C454.8 205.5 455.8 210.6 455.8 216c0 33.71-12.78 64.21-33.16 88h199.7C632.1 304 640 295.6 640 285.3C640 233.8 600.6 192 551.9 192z"/></svg>';

const UPGRADE_BOLT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width:20px; height:20px; margin-right:6px;position:relative; top:10px;" stroke="purple" fill="purple"><path d="M240.5 224H352C365.3 224 377.3 232.3 381.1 244.7C386.6 257.2 383.1 271.3 373.1 280.1L117.1 504.1C105.8 513.9 89.27 514.7 77.19 505.9C65.1 497.1 60.7 481.1 66.59 467.4L143.5 288H31.1C18.67 288 6.733 279.7 2.044 267.3C-2.645 254.8 .8944 240.7 10.93 231.9L266.9 7.918C278.2-1.92 294.7-2.669 306.8 6.114C318.9 14.9 323.3 30.87 317.4 44.61L240.5 224z"/></svg>';

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render the full GPT Store discovery page.
 *
 * Creates the category tabs, sort dropdown, search input, and the grid
 * container, then kicks off the first fetch.
 *
 * Original: `renderGizmoDiscoveryPage` (line 8256)
 */
export function renderGizmoDiscoveryPage(initialCategory = 'all'): HTMLElement {
  let category = initialCategory || 'all';
  const wrapper = document.createElement('div');
  wrapper.appendChild(loadingSpinner('gizmo-discovery-loading'));

  chrome.runtime.sendMessage({ type: 'checkHasSubscription' }, (hasSub: boolean) => {
    if (!hasSub && category === 'all') category = 'featured_store';
    selectedGizmoCategoryId = category;

    chrome.storage.sync.get(['openai_id']).then((result: Record<string, any>) => {
      const openaiId: string = result.openai_id ?? '';

      wrapper.classList.value = 'mx-auto w-full p-4 pt-0 h-full';

      // --- Sticky header ---
      const stickyHeader = document.createElement('div');
      stickyHeader.style.cssText = 'position: sticky; top: 0; z-index: 1000;';
      stickyHeader.classList.value = 'pb-1 pt-4';

      const topRow = document.createElement('div');
      topRow.classList.value = 'flex justify-between items-start';

      // Category tabs
      const tabs = document.createElement('div');
      tabs.id = 'gizmo-discovery-tabs';
      tabs.classList.value = 'flex justify-start gap-2 mb-4';

      gizmoCategories.forEach((cat) => {
        const btn = document.createElement('button');
        btn.id = `gizmo-discovery-${cat.id}-tab`;
        btn.classList.value = `btn relative ${cat.id === category ? 'btn-primary' : 'btn-secondary'}`;
        btn.title = cat.description;
        btn.style.fontSize = '12px';
        btn.innerHTML = cat.title;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          closeMenus();
          if (cat.id === 'more_categories') {
            showMoreCategories(openaiId, hasSub);
          } else {
            const moreMenu = document.querySelector('#more-categories-menu');
            if (moreMenu) moreMenu.remove();
            selectedGizmoCategoryId = cat.id;
            resetGizmoDiscoveryPage(cat.id, hasSub);
            fetchGizmos(cat.id, openaiId, hasSub);
            setActiveTab(`gizmo-discovery-${cat.id}-tab`);
          }
        });
        tabs.appendChild(btn);
      });

      topRow.appendChild(tabs);

      // Right side: sort + search
      const rightSide = document.createElement('div');
      rightSide.classList.value = 'flex justify-end items-start';

      const sortWrapper = document.createElement('div');
      sortWrapper.id = 'gizmo-sort-by-selector-wrapper';
      sortWrapper.style.cssText = 'position:relative;width:155px;z-index:1000;margin-right:12px;';
      sortWrapper.innerHTML = dropdown(
        'GPTs-SortBy',
        gizmoSortByList,
        gizmoSortByList[0] ?? null,
        'code',
        'right',
        'bg-token-main-surface-primary',
      );
      rightSide.appendChild(sortWrapper);

      const searchWrapper = document.createElement('div');
      searchWrapper.classList.value = 'flex justify-start items-center gap-2 mb-4 pe-3';
      searchWrapper.style.width = '200px';
      searchWrapper.innerHTML =
        '<input id="gizmo-search-input" class="form-input w-full rounded-md shadow-sm bg-token-main-surface-secondary" type="search" placeholder="Name, author, desc..." />';
      rightSide.appendChild(searchWrapper);

      topRow.appendChild(rightSide);
      stickyHeader.appendChild(topRow);

      // Category description
      const descEl = document.createElement('div');
      descEl.id = 'gizmo-category-description';
      descEl.classList.value = 'mb-2 text-sm text-token-text-tertiary md:text-base';
      descEl.innerText = gizmoCategories.find((c) => c.id === category)?.description ?? '';
      stickyHeader.appendChild(descEl);

      // Search term pill
      const pill = document.createElement('div');
      pill.id = 'gizmo-search-term-pill';
      pill.classList.value =
        'hidden flex items-center justify-center bg-token-main-surface-secondary text-token-text-primary rounded-full p-1 px-2 me-2 border border-token-border-medium max-w-fit';
      pill.innerHTML = `<button id="gizmo-search-term-pill-clear-button" class="focus-visible:outline-0 hover:bg-token-main-surface-tertiary focus-visible:bg-token-main-surface-tertiary rounded-full mx-1"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><span id="gizmo-search-term-pill-text" class="text-sm mx-1 text-danger"></span>`;

      pill.querySelector('#gizmo-search-term-pill-clear-button')?.addEventListener('click', () => {
        const input = document.querySelector('#gizmo-search-input') as HTMLInputElement | null;
        if (input) {
          input.value = '';
          input.dispatchEvent(new Event('input'));
        }
      });

      stickyHeader.appendChild(pill);

      // Build final layout
      wrapper.innerHTML = '';
      wrapper.appendChild(stickyHeader);

      const grid = document.createElement('div');
      grid.id = 'gizmo-discovery-grid';
      grid.style.cssText = 'position:relative;height:100%; overflow-y: auto;padding-bottom: 120px;';
      grid.classList.value = 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      wrapper.appendChild(grid);

      // Remove initial spinner
      const spinnerEl = document.querySelector('#gizmo-discovery-loading');
      if (spinnerEl) spinnerEl.remove();

      // Wire up sort dropdown
      resetGizmoDiscoveryPage(category, hasSub);
      addDropdownEventListener('GPTs-SortBy', gizmoSortByList, 'code', (item: any) => {
        toggleSortByDropdown(item, openaiId, hasSub);
      });

      // Initial fetch
      fetchGizmos(category, openaiId, hasSub);

      // Wire up search
      const searchInput = document.querySelector('#gizmo-search-input') as HTMLInputElement | null;
      if (searchInput) {
        searchInput.addEventListener(
          'input',
          debounce(() => {
            resetGizmoDiscoveryPage('all', hasSub);

            const pillEl = document.querySelector('#gizmo-search-term-pill');
            const pillText = document.querySelector('#gizmo-search-term-pill-text');
            if (searchInput.value.trim() !== '') {
              if (pillText) pillText.textContent = searchInput.value.trim();
              pillEl?.classList.remove('hidden');
            } else {
              if (pillText) pillText.textContent = '';
              pillEl?.classList.add('hidden');
            }

            const activeTab = document.querySelector('#gizmo-discovery-tabs button.btn-primary') as HTMLElement | null;
            if (activeTab && activeTab.id !== 'gizmo-discovery-all-tab') {
              activeTab.classList.replace('btn-primary', 'btn-secondary');
              document.querySelector('#gizmo-discovery-all-tab')?.classList.replace('btn-secondary', 'btn-primary');
            }

            fetchGizmos('all', openaiId, hasSub, true, 1, null, searchInput.value);
          }, 500),
        );
      }
    });
  });

  return wrapper;
}

// ---------------------------------------------------------------------------
// Manager modal actions
// ---------------------------------------------------------------------------

/**
 * Create the action bar for the GPT manager modal (e.g. "Create a GPT" button).
 *
 * Original: `gizmoManagerModalActions` (line 8314)
 */
export function gizmoManagerModalActions(): HTMLElement {
  const container = document.createElement('div');
  container.classList.value = 'flex items-center justify-end w-full mt-2';

  const createBtn = document.createElement('button');
  createBtn.classList.value = 'btn composer-submit-btn composer-submit-button-color';
  createBtn.innerText = translate('plus Create a GPT');
  createBtn.addEventListener('click', () => {
    closeModals();
    window.history.pushState({}, '', `https://${window.location.host}/gpts/editor`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });

  container.appendChild(createBtn);
  return container;
}

// ---------------------------------------------------------------------------
// "More categories" sub-menu
// ---------------------------------------------------------------------------

function showMoreCategories(openaiId: string, hasSub = false): void {
  const moreTabEl = document.querySelector('#gizmo-discovery-more_categories-tab');
  if (!moreTabEl) return;

  const { x, y } = moreTabEl.getBoundingClientRect();

  const existing = document.querySelector('#more-categories-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'more-categories-menu';
  menu.style.cssText = `position: fixed; left: 0px; top: 0px; transform: translate3d(${x + 45}px, ${y - 60}px, 0px); min-width: max-content; z-index: 100001;`;
  menu.classList.value = 'bg-token-main-surface-secondary shadow-long rounded-2xl p-1';

  gizmoMoreCategories.forEach((cat) => {
    if (selectedGizmoCategoryId === cat.id) return;

    const btn = document.createElement('button');
    btn.id = `gizmo-discovery-${cat.id}-tab`;
    btn.classList.value =
      'block px-4 py-2 text-sm text-token-text-primary w-full text-start hover:bg-token-main-surface-tertiary rounded-xl';
    btn.title = cat.description;
    btn.innerHTML = cat.title;
    btn.addEventListener('click', () => {
      selectedGizmoCategoryId = cat.id;
      resetGizmoDiscoveryPage(cat.id, hasSub);
      fetchGizmos(cat.id, openaiId, hasSub);
      setActiveMoreCategoryTab(`gizmo-discovery-${cat.id}-tab`);
      closeMoreCategoriesMenu();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
}

function closeMoreCategoriesMenu(): void {
  document.querySelector('#more-categories-menu')?.remove();
}

// ---------------------------------------------------------------------------
// Sort dropdown handler
// ---------------------------------------------------------------------------

function toggleSortByDropdown(item: { code: string }, openaiId: string, hasSub = false): void {
  gizmoSortBy = item.code;
  const searchValue = (document.querySelector('#gizmo-search-input') as HTMLInputElement | null)?.value ?? '';
  fetchGizmos(selectedGizmoCategoryId, openaiId, hasSub, true, 1, null, searchValue);
}

// ---------------------------------------------------------------------------
// Reset page state
// ---------------------------------------------------------------------------

function resetGizmoDiscoveryPage(categoryId: string, hasSub = false): void {
  const searchInput = document.querySelector('#gizmo-search-input') as HTMLInputElement | null;
  const sortWrapper = document.querySelector('#gizmo-sort-by-selector-wrapper') as HTMLElement | null;

  if (categoryId === 'all' || (hasSub && !['pinned', 'recent', 'mine'].includes(categoryId))) {
    if (sortWrapper) sortWrapper.style.display = 'block';
  } else {
    if (searchInput) searchInput.value = '';
    if (sortWrapper) sortWrapper.style.display = 'none';
    const pillEl = document.querySelector('#gizmo-search-term-pill');
    const pillText = document.querySelector('#gizmo-search-term-pill-text');
    if (pillText) pillText.textContent = '';
    pillEl?.classList.add('hidden');
  }

  gizmoPageNumber = 1;
  gizmoCursor = null;
  noMoreGizmo = false;
}

// ---------------------------------------------------------------------------
// Tab activation
// ---------------------------------------------------------------------------

function setActiveTab(tabId: string): void {
  const tabContainer = document.querySelector('#gizmo-discovery-tabs');
  if (!tabContainer) return;

  tabContainer.querySelectorAll('button').forEach((btn) => {
    if (btn.id === tabId) {
      btn.classList.replace('btn-secondary', 'btn-primary');
    } else {
      btn.classList.replace('btn-primary', 'btn-secondary');
    }
  });

  const moreTab = document.querySelector('#gizmo-discovery-more_categories-tab');
  if (!moreTab) return;

  const prevSibling = moreTab.previousElementSibling;
  if (prevSibling) {
    const prevCatId = prevSibling.id.replace('gizmo-discovery-', '').replace('-tab', '');
    if (!gizmoCategories.find((c) => c.id === prevCatId)) {
      prevSibling.remove();
    }
  }

  const descEl = document.querySelector('#gizmo-category-description');
  if (descEl) {
    const catId = tabId.replace('gizmo-discovery-', '').replace('-tab', '');
    const cat = gizmoCategories.find((c) => c.id === catId);
    if (cat) descEl.textContent = cat.description;
  }
}

function setActiveMoreCategoryTab(tabId: string): void {
  const tabContainer = document.querySelector('#gizmo-discovery-tabs');
  if (!tabContainer) return;

  tabContainer.querySelectorAll('button').forEach((btn) => {
    btn.classList.replace('btn-primary', 'btn-secondary');
  });

  const catId = tabId.replace('gizmo-discovery-', '').replace('-tab', '');
  const cat = gizmoMoreCategories.find((c) => c.id === catId);
  if (!cat) return;

  const newTab = document.createElement('button');
  newTab.id = `gizmo-discovery-${cat.id}-tab`;
  newTab.classList.value = 'btn relative btn-primary';
  newTab.title = cat.description;
  newTab.style.fontSize = '12px';
  newTab.innerHTML = cat.title;

  const moreTab = document.querySelector('#gizmo-discovery-more_categories-tab');
  if (!moreTab) return;

  const prevSibling = moreTab.previousElementSibling;
  if (
    prevSibling &&
    !gizmoCategories.find((c) => c.id === prevSibling.id.replace('gizmo-discovery-', '').replace('-tab', ''))
  ) {
    prevSibling.remove();
  }

  moreTab.insertAdjacentElement('beforebegin', newTab);

  const descEl = document.querySelector('#gizmo-category-description');
  if (descEl) descEl.textContent = cat.description;
}

// ---------------------------------------------------------------------------
// Fetch gizmos — dispatcher
// ---------------------------------------------------------------------------

function fetchGizmosFromCouncil(
  categoryId: string,
  openaiId: string,
  hasSub = false,
  isFirstPage = true,
  pageNumber: number | null = null,
  searchTerm: string | null = null,
): void {
  const detail: Record<string, any> = {
    sortBy: gizmoSortBy,
    category: categoryId,
  };
  if (pageNumber) detail.pageNumber = pageNumber;
  if (searchTerm) detail.searchTerm = searchTerm;

  chrome.runtime.sendMessage({ type: 'getCouncilGizmos', detail }, (response: any) => {
    const r = response ?? {};
    if (r.next) {
      gizmoPageNumber += 1;
      noMoreGizmo = false;
    } else {
      noMoreGizmo = true;
    }

    const activeTabId = document.querySelector('#gizmo-discovery-tabs button.btn-primary')?.id;
    if (activeTabId === `gizmo-discovery-${categoryId}-tab`) {
      renderGizmoGrid(r.results ?? [], categoryId, openaiId, hasSub, isFirstPage);
    }
  });
}

function fetchGizmosFromChatGPT(
  categoryId: string,
  openaiId: string,
  hasSub = false,
  isFirstPage = true,
  cursor: string | null = null,
): void {
  const grid = document.querySelector('#gizmo-discovery-grid');
  if (!grid) return;

  getGizmoDiscovery(categoryId, cursor).then(
    (data: any) => {
      if (data.list.cursor) {
        noMoreGizmo = false;
        gizmoCursor = data.list.cursor;
      } else {
        noMoreGizmo = true;
      }
      const gizmos = data.list.items.map((item: any) => item.resource.gizmo);
      if (selectedGizmoCategoryId === categoryId) {
        renderGizmoGrid(gizmos, categoryId, openaiId, hasSub, isFirstPage);
      }
    },
    () => {
      if (isFirstPage) {
        grid.innerHTML =
          '<div class="w-full h-full inset-0 flex items-center justify-center text-white">Something went wrong. Please try again!</div>';
      } else {
        const loadMoreBtn = document.querySelector('#load-more-gizmo-button');
        if (loadMoreBtn) {
          loadMoreBtn.innerHTML =
            '<div class="w-full h-full inset-0 flex items-center justify-center text-white">Something went wrong. Please try again!</div>';
          (loadMoreBtn as HTMLElement).style.pointerEvents = 'default';
        }
      }
    },
  );
}

function fetchGizmoPinned(openaiId: string, hasSub = false, isFirstPage = true): void {
  const grid = document.querySelector('#gizmo-discovery-grid');
  if (!grid) return;

  getGizmosBootstrap(false).then(
    (data: any) => {
      noMoreGizmo = true;
      const gizmos = data?.gizmos?.map((g: any) => g.resource.gizmo) || [];
      renderGizmoGrid(gizmos, 'pinned', openaiId, hasSub, isFirstPage);
    },
    () => {
      if (isFirstPage) {
        grid.innerHTML =
          '<div class="w-full h-full inset-0 flex items-center justify-center text-white">Something went wrong. Please try again!</div>';
      } else {
        const loadMoreBtn = document.querySelector('#load-more-gizmo-button');
        if (loadMoreBtn) {
          loadMoreBtn.innerHTML =
            '<div class="w-full h-full inset-0 flex items-center justify-center text-white">Something went wrong. Please try again!</div>';
          (loadMoreBtn as HTMLElement).style.pointerEvents = 'default';
        }
      }
    },
  );
}

/**
 * Fetch gizmos based on category, subscription status, etc.
 *
 * Original: `fetchGizmos` (line 8441)
 */
export function fetchGizmos(
  categoryId: string,
  openaiId: string,
  hasSub = false,
  isFirstPage = true,
  pageNumber: number | null = null,
  cursor: string | null = null,
  searchTerm: string | null = null,
): void {
  if (!pageNumber) {
    gizmoPageNumber = 1;
    noMoreGizmo = false;
  }
  if (!cursor) {
    gizmoCursor = null;
    noMoreGizmo = false;
  }

  const searchInput = document.querySelector('#gizmo-search-input') as HTMLInputElement | null;
  if (searchInput) searchInput.value = searchTerm || '';

  const pillEl = document.querySelector('#gizmo-search-term-pill');
  const pillText = document.querySelector('#gizmo-search-term-pill-text');
  if (searchTerm && searchTerm.trim() !== '') {
    if (pillText) pillText.textContent = searchTerm.trim();
    pillEl?.classList.remove('hidden');
  } else {
    if (pillText) pillText.textContent = '';
    pillEl?.classList.add('hidden');
  }

  const grid = document.querySelector('#gizmo-discovery-grid');
  if (!grid) return;

  if (isFirstPage) {
    grid.innerHTML = `<div id="gizmo-discovery-loading" class="w-full h-full inset-0 flex items-center justify-center text-white">${SPINNER_SVG}</div>`;
  }

  if (hasSub) {
    if (['recent', 'mine'].includes(categoryId)) {
      fetchGizmosFromChatGPT(categoryId, openaiId, hasSub, isFirstPage, cursor);
    } else if (categoryId === 'pinned') {
      fetchGizmoPinned(openaiId, hasSub, isFirstPage);
    } else {
      fetchGizmosFromCouncil(categoryId, openaiId, hasSub, isFirstPage, pageNumber, searchTerm);
    }
  } else if (categoryId === 'all') {
    // Non-subscriber: show upgrade prompt with blurred list
    grid.innerHTML = `<div class="absolute z-10 w-full h-full inset-0 flex items-center flex-wrap justify-center text-token-text-primary m-auto mt-4 mb-4" style="max-width:400px; max-height:200px;"><div>Get access to the full list of more than 100,000 Custom GPTs with the ability to search and sort right from inside ChatGPT. <a href="https://www.youtube.com/watch?v=q1VUONah6fE" target="_blank" class="underline text-gold" rel="noreferrer">Learn more</a></div> <button id="upgrade-to-pro-button-gpt-store" class="flex flex-wrap p-1 items-center rounded-md bg-gold hover:bg-gold-dark transition-colors duration-200 text-black cursor-pointer text-sm m-4 font-bold" style="width: 230px;"><div class="flex w-full">${UPGRADE_BOLT_SVG} Upgrade to Pro</div><div style="font-size:10px;font-weight:400;margin-left:28px;" class="flex w-full">GPT Store, Image Gallery, Voice & more</div></button></div>${blurredList()}`;

    const upgradeBtn = document.querySelector('#upgrade-to-pro-button-gpt-store');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => openUpgradeModal(hasSub));
    }
  } else if (categoryId === 'pinned') {
    fetchGizmoPinned(openaiId, hasSub, isFirstPage);
  } else {
    fetchGizmosFromChatGPT(categoryId, openaiId, hasSub, isFirstPage, cursor);
  }
}

// ---------------------------------------------------------------------------
// Render grid
// ---------------------------------------------------------------------------

function renderGizmoGrid(
  gizmos: GizmoCard[],
  categoryId: string,
  openaiId: string,
  hasSub = false,
  isFirstPage = true,
): void {
  const grid = document.querySelector('#gizmo-discovery-grid');
  if (!grid) return;

  if (isFirstPage) {
    grid.innerHTML = '';
  } else {
    const loadMore = document.querySelector('#load-more-gizmo-button');
    if (loadMore) loadMore.parentElement?.remove();
  }

  if (isFirstPage && (!gizmos || gizmos.length === 0)) {
    grid.innerHTML = `<div class="absolute w-full h-full inset-0 flex items-center justify-center text-token-text-primary text-center">${
      categoryId === 'mine'
        ? 'You have not created a GPT yet. <br/>Customize a version of ChatGPT for a specific purpose'
        : 'No GPT found.'
    }</div>`;
    return;
  }

  // Collect existing card IDs to avoid duplicates
  const existingCards = grid.querySelectorAll('[id^="gizmo-card-"]');
  const existingIds: string[] = [];
  existingCards.forEach((card) => {
    existingIds.push(card.id.replace('gizmo-card-', ''));
  });
  const newIds = gizmos?.map((g) => g.id).filter((id) => !existingIds.includes(id)) || [];

  // Create card elements
  gizmos?.forEach((gizmo) => {
    if (existingIds.includes(gizmo.id)) return;

    const isDraft = gizmo?.live_version === 0;
    const cardWrapper = document.createElement('div');
    cardWrapper.classList.value = 'flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3 h-max';
    cardWrapper.style.cssText = 'height: max-content;';

    const authorLink = gizmo.author?.link_to
      ? `<a class="break-all hover:text-green-500 hover:underline" href="${gizmo.author.link_to}" target="_blank">${gizmo.author.display_name}</a>`
      : gizmo.author?.display_name || '';

    const numConversations = gizmo?.vanity_metrics?.num_conversations_str || '';

    const showCategoryTags =
      selectedGizmoCategoryId === 'all' || (hasSub && !['mine'].includes(selectedGizmoCategoryId));
    const categoryTags: GizmoCategory[] = showCategoryTags
      ? gizmo?.display?.categories
          ?.map((catId: string) => [...gizmoCategories, ...gizmoMoreCategories].find((c) => c.id === catId))
          .filter((c): c is GizmoCategory => !!c && c.id !== selectedGizmoCategoryId) || []
      : [];

    const imgHtml = gizmo.display.profile_picture_url
      ? `<img src="${gizmo.display.profile_picture_url}" class="w-24 h-24 rounded-md border border-gray-300" />`
      : GIZMO_DEFAULT_ICON_SVG;

    const createdAgoHtml = gizmo.vanity_metrics.created_ago_str
      ? `Created<br/>${gizmo.vanity_metrics.created_ago_str}`
      : '';

    const isOwner = gizmo.author?.user_id?.split('__')?.[0] === openaiId.split('__')?.[0];
    const conversationsHtml =
      isOwner && isDraft
        ? 'Draft'
        : numConversations
          ? `${CONVERSATIONS_ICON_SVG}<div title="Number of conversations" class="text-sm flex">${numConversations}</div>`
          : '';

    let shareIndicator = '';
    if (categoryId === 'mine') {
      if (gizmo.share_recipient === 'private') {
        shareIndicator = `<div style="position:absolute;bottom:20px;right:8px;" title="Private GPT - Only you can see this GPT">${PRIVATE_SVG}</div>`;
      } else if (gizmo.share_recipient === 'link') {
        shareIndicator = `<div style="position:absolute;bottom:16px;right:8px;" title="Anyone with the link can use this GPT">${LINK_SVG}</div>`;
      } else if (gizmo.share_recipient === 'marketplace') {
        shareIndicator = `<div style="position:absolute;bottom:16px;right:8px;" title="Public GPT - Your GPT will appear in the GPT Store">${MARKETPLACE_SVG}</div>`;
      }
    }

    cardWrapper.innerHTML = `
      <div id="gizmo-card-${gizmo.id}" class="relative flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-token-main-surface-primary border border-token-border-medium hover:bg-token-main-surface-secondary hover:shadow-xl rounded-xl">
        <button id="gizmo-card-menu-${gizmo.id}" class="absolute top-0 end-0 flex w-9 h-9 items-center justify-center rounded-lg text-token-text-tertiary transition hover:text-token-text-tertiary radix-state-open:text-token-text-tertiary hover:bg-token-sidebar-surface-tertiary" type="button" aria-haspopup="menu" aria-expanded="false" data-state="closed">${THREE_DOT_MENU_SVG}</button>
        <div class="flex items-start">
          <div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200" style="min-width:96px;">${imgHtml}</div>
          <div class="flex flex-col h-full justify-between">
            <div class="ms-2 flex w-full items-center gap-1 text-token-text-tertiary text-xs">${createdAgoHtml}</div>
            <div class="ms-2 w-full flex items-center gap-1 text-token-text-tertiary">${conversationsHtml}</div>
          </div>
        </div>
        <div class="text-lg"><div style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">${gizmo.display.name || 'Untitled'}</div></div>
        <div class="text-sm text-token-text-tertiary" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">${gizmo.display.description || '...'}</div>
        <div style="min-height:22px;" class="mt-1 flex items-center gap-1 text-token-text-tertiary">${categoryTags
          .slice(0, 2)
          .map(
            (t) =>
              `<div id="category-tag-${t.id}" style="font-size:11px;" class="border rounded-full border-token-border-medium hover:border-green-500 hover:cursor-pointer hover:text-green-500 px-2">${t.title}</div>`,
          )
          .join('')}</div>
        <div class="flex items-center gap-1 text-token-text-tertiary h-5"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${gizmo.author?.display_name ? `By ${authorLink}` : ''}</div></div>
        ${shareIndicator}
      </div>
    `;

    grid.appendChild(cardWrapper);
  });

  // "Load more" button at the end
  if (!noMoreGizmo) {
    const loadMoreWrapper = document.createElement('div');
    loadMoreWrapper.classList.value = 'flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3';
    loadMoreWrapper.style.height = '314px';
    loadMoreWrapper.innerHTML =
      '<div id="load-more-gizmo-button" class="relative flex flex-col w-full h-full justify-center items-center gap-2 p-4 text-token-text-tertiary text-3xl font-bold cursor-pointer bg-token-main-surface-secondary hover:bg-token-main-surface-tertiary hover:shadow-xl rounded-xl">Load more...</div>';
    grid.appendChild(loadMoreWrapper);
  }

  // Wire up event listeners for new cards
  grid.querySelectorAll('div[id^=gizmo-card-]')?.forEach((cardEl) => {
    const gizmoId = cardEl.id.split('gizmo-card-')[1] ?? '';
    if (!newIds?.includes(gizmoId)) return;

    const gizmo = gizmos.find((g) => g.id === gizmoId);
    if (!gizmo) return;

    const isDraft = gizmo.live_version === 0;

    // Context menu button
    const menuBtn = cardEl.querySelector(`#gizmo-card-menu-${gizmoId}`);
    if (menuBtn) {
      menuBtn.addEventListener('click', async (ev: Event) => {
        ev.stopPropagation();
        const existingMenu = document.querySelector('#gizmo-card-menu');
        if (existingMenu) {
          existingMenu.remove();
        } else {
          const menuHtml = await buildGizmoCardMenu(gizmo, openaiId);
          cardEl.insertAdjacentHTML('beforeend', menuHtml);
          gizmoCardMenuEventListener(gizmoId);

          const menu = document.querySelector('#gizmo-card-menu');
          if (menu) {
            menu.addEventListener('click', (e: Event) => {
              e.stopPropagation();
              closeMenus();
            });
            menu.addEventListener('mouseleave', () => menu.remove());
          }
        }
      });
    }

    // Category tag clicks
    cardEl.querySelectorAll('[id^=category-tag-]')?.forEach((tagEl) => {
      tagEl.addEventListener('click', (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeMenus();
        const tagCatId = tagEl.id.replace('category-tag-', '');
        selectedGizmoCategoryId = tagCatId;
        resetGizmoDiscoveryPage(tagCatId, hasSub);
        fetchGizmos(tagCatId, openaiId, hasSub);
        if (gizmoCategories.find((c) => c.id === tagCatId)) {
          setActiveTab(`gizmo-discovery-${tagCatId}-tab`);
        } else {
          setActiveTab('gizmo-discovery-more_categories-tab');
          setActiveMoreCategoryTab(`gizmo-discovery-${tagCatId}-tab`);
        }
      });
    });

    // Card click: open about or editor (for drafts)
    cardEl.addEventListener('click', (ev: Event) => {
      const target = ev.target as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.id.startsWith('category-tag-')) return;

      if (isDraft) {
        window.open(`https://${window.location.host}/gpts/editor/${gizmoId}`, '_blank');
      } else {
        getGizmoAbout(gizmoId).then((aboutData: any) => {
          showGizmoAboutDialog(aboutData, true);
        });
      }

      chrome.runtime.sendMessage({
        type: 'updateGizmoMetrics',
        detail: { gizmoId: gizmo?.id, metricName: 'num_users_interacted_with' },
      });
    });
  });

  // Wire up "load more" button with IntersectionObserver
  const loadMoreBtn = document.querySelector('#load-more-gizmo-button') as HTMLElement | null;
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.innerHTML = `<div class="w-full h-full inset-0 flex items-center justify-center text-white">${SPINNER_SVG}</div>`;
      loadMoreBtn.style.pointerEvents = 'none';

      if (!document.querySelector('#gizmo-discovery-tabs')) return;

      const searchValue = (document.querySelector('#gizmo-search-input') as HTMLInputElement | null)?.value ?? '';
      fetchGizmos(categoryId, openaiId, hasSub, false, gizmoPageNumber, gizmoCursor, searchValue);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreBtn.click();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(loadMoreBtn);
  }
}

// ---------------------------------------------------------------------------
// Gizmo card context menu
// ---------------------------------------------------------------------------

async function buildGizmoCardMenu(gizmo: GizmoCard, openaiId: string): Promise<string> {
  const bootstrapData = (await getGizmosBootstrap(false)) as any;
  const isDraft = gizmo.live_version === 0;
  const isPinned = [...bootstrapData.gizmos].find((g: any) => g?.resource?.gizmo?.id === gizmo.id);
  const isOwner = gizmo.author?.user_id?.split('__')?.[0] === openaiId.split('__')?.[0];

  return `<div id="gizmo-card-menu" class="absolute top-0 end-0 mt-2 me-2 w-40 rounded-2xl shadow-long p-1 ring-opacity-5 bg-token-main-surface-tertiary text-token-text-primary">
    ${isOwner ? `<a href="/gpts/editor/${gizmo.id}" target="_self" class="block px-4 py-2 text-sm hover:bg-token-main-surface-secondary" role="menuitem">Edit</a><button id="delete-gizmo-button" class="rounded-xl block w-full flex items-start px-4 py-2 text-sm hover:bg-token-main-surface-secondary" role="menuitem">Delete</button>` : ''}
    ${isDraft ? '' : `<button id="gizmo-card-${isPinned ? 'hide-from' : 'add-to'}-sidebar" class="rounded-xl block w-full flex items-start px-4 py-2 text-sm hover:bg-token-main-surface-secondary" role="menuitem">${isPinned ? 'Hide from sidebar' : 'Add to sidebar'}</button>`}
    ${isDraft ? '' : '<button id="gizmo-card-about" class="rounded-xl block w-full flex items-start px-4 py-2 text-sm hover:bg-token-main-surface-secondary" role="menuitem">About</button>'}
  </div>`;
}

function gizmoCardMenuEventListener(gizmoId: string): void {
  const menu = document.querySelector('#gizmo-card-menu');
  if (!menu) return;

  // Delete
  const deleteBtn = menu.querySelector('#delete-gizmo-button');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      showConfirmDialog(
        'Delete GPT',
        'Are you sure you want to delete this GPT? This cannot be undone.',
        'Cancel',
        'Delete GPT',
        null,
        () => {
          deleteGizmo(gizmoId);
          toast('GPT deleted successfully!', 'success');
          const cardEl = document.querySelector(`#gizmo-card-${gizmoId}`);
          if (cardEl) cardEl.parentElement?.remove();
          const sidebarEl = document.querySelector('#gpt-list')?.querySelector(`a[href*="${gizmoId}"]`)?.parentElement;
          if (sidebarEl) sidebarEl.remove();
        },
      );
    });
  }

  // Add to sidebar
  const addBtn = menu.querySelector('#gizmo-card-add-to-sidebar');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      menu.remove();
      updateGizmoSidebar(gizmoId, 'keep');
      chrome.runtime.sendMessage({
        type: 'updateGizmoMetrics',
        detail: { gizmoId, metricName: 'num_pins', direction: 'up' },
      });
    });
  }

  // Hide from sidebar
  const hideBtn = menu.querySelector('#gizmo-card-hide-from-sidebar');
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      menu.remove();
      updateGizmoSidebar(gizmoId, 'hide');
      chrome.runtime.sendMessage({
        type: 'updateGizmoMetrics',
        detail: { gizmoId, metricName: 'num_pins', direction: 'down' },
      });
    });
  }

  // About
  const aboutBtn = menu.querySelector('#gizmo-card-about');
  if (aboutBtn) {
    aboutBtn.addEventListener('click', () => {
      menu.remove();
      getGizmoAbout(gizmoId).then((aboutData: any) => {
        showGizmoAboutDialog(aboutData, true);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// About dialog
// ---------------------------------------------------------------------------

/**
 * Pretty-print a tool type from the gizmo API.
 *
 * Original: `toolPrettyName` (line 8804)
 */
export function toolPrettyName(toolType: string): string {
  switch (toolType) {
    case 'browser':
      return 'Browsing';
    case 'python':
      return 'Data Analysis';
    case 'dalle':
      return 'DALL\u2022E';
    case 'plugins_prototype':
      return 'Actions';
    default:
      return toolType;
  }
}

/**
 * Show the full "About" dialog for a Gizmo, including ratings,
 * conversation starters, capabilities, and "More by author" section.
 *
 * Original: `showGizmoAboutDialog` (line 8640)
 */
export function showGizmoAboutDialog(aboutData: any, showStartChat = false): void {
  const tools =
    aboutData.tools?.map((t: any) => t.type).filter((t: string, i: number, a: string[]) => a.indexOf(t) === i) ?? [];
  const name = aboutData?.gizmo?.display?.name ?? '';
  const authorName = aboutData?.gizmo?.author?.display_name || 'community builder';
  const authorUrl = aboutData?.gizmo?.author?.link_to || '';
  const authorLink = authorUrl
    ? `<a href="${authorUrl}" target="_blank" class="underline">${authorName}</a>`
    : authorName;

  const ratingBlock = aboutData?.about_blocks?.find((b: any) => b.type === 'rating');
  const categoryBlock = aboutData?.about_blocks?.find((b: any) => b.type === 'category');
  const genericBlock = aboutData?.about_blocks?.find((b: any) => b.type === 'generic_title_subtitle');
  const starters: string[] = (aboutData?.gizmo?.display?.prompt_starters ?? [])
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  const ratingHtml = ratingBlock
    ? `<div class="flex flex-col justify-center items-center gap-2 border-s border-token-border-medium first:border-0 w-48 mt-4 px-2">
        <div class="flex flex-row items-center gap-1.5 pt-1 text-xl font-medium text-center leading-none">${STAR_SVG}${ratingBlock.avg}</div>
        <div class="text-xs text-token-text-tertiary">${ratingBlock.count_str}</div>
      </div>`
    : '';

  const categoryHtml = categoryBlock
    ? `<div class="flex flex-col justify-center items-center gap-2 border-s border-token-border-medium first:border-0 w-48 mt-4 px-2">
        <div class="flex flex-row items-center gap-1.5 pt-1 text-xl font-medium text-center leading-none">${categoryBlock.category_ranking ? `#${categoryBlock.category_ranking}` : categoryBlock.category_str}</div>
        <div class="text-xs text-token-text-tertiary">${categoryBlock.category_ranking ? `in ${categoryBlock.category_str} ${categoryBlock.category_locale_str}` : 'Category'}</div>
      </div>`
    : '';

  const genericHtml = genericBlock
    ? `<div class="flex flex-col justify-center items-center gap-2 border-s border-token-border-medium first:border-0 w-48 mt-4 px-2">
        <div class="flex flex-row items-center gap-1.5 pt-1 text-xl font-medium text-center leading-none">${genericBlock.title}</div>
        <div class="text-xs text-token-text-tertiary">${genericBlock.subtitle}</div>
      </div>`
    : '';

  const startersHtml = starters
    .map(
      (s) => `<div class="flex" tabindex="0">
        <a class="group border-token-border-medium bg-token-main-surface-primary hover:bg-token-main-surface-secondary relative ms-2 h-14 min-w-full grow rounded-xl border px-4 focus:outline-hidden" target="_self" href="/g/${aboutData.gizmo.short_url}?p=${s}">
          <div class="flex h-full items-center"><div class="text-sm line-clamp-2 break-all">${s}</div></div>
          <div class="border-token-border-medium bg-token-main-surface-primary group-hover:bg-token-main-surface-secondary absolute -start-2 -bottom-px h-3 w-4 border-b">
            <div class="border-token-border-medium bg-token-main-surface-primary h-3 w-2 rounded-ee-full border-e border-b"></div>
          </div>
          <div class="absolute bottom-0 end-2 top-0 items-center hidden group-hover:flex">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-token-main-surface-primary">${CHAT_ICON_SVG.replace('icon-lg', 'icon-md text-token-text-primary')}</div>
          </div>
        </a>
      </div>`,
    )
    .join('');

  const capabilitiesHtml = tools
    .map(
      (t: string) => `<div class="flex flex-row items-start gap-2 py-1 text-sm">
        ${CHECK_SVG}
        <div>${toolPrettyName(t)}${t === 'plugins_prototype' ? '<div class="text-xs text-token-text-tertiary">Retrieves or takes actions outside of ChatGPT</div>' : ''}</div>
      </div>`,
    )
    .join('');

  const reviewStats = aboutData?.review_stats?.by_rating || [];
  const ratingsHtml =
    reviewStats.length > 0
      ? [...reviewStats]
          .reverse()
          .map(
            (ratio: number, idx: number) => `<div class="flex flex-row items-center gap-2 py-1 text-xl font-medium">
            <div class="icon icon-lg relative">
              <svg width="24" height="24" viewBox="0 0 39 39" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-green-500"><path d="M15.6961 2.70609C17.4094 -0.33367 21.7868 -0.333671 23.5002 2.70609L27.237 9.33591C27.3648 9.56271 27.585 9.72268 27.8402 9.77418L35.3003 11.2794C38.7207 11.9695 40.0734 16.1327 37.7119 18.7015L32.5613 24.3042C32.3851 24.4958 32.301 24.7547 32.3309 25.0133L33.2046 32.5734C33.6053 36.0397 30.0639 38.6127 26.891 37.1605L19.971 33.9933C19.7342 33.885 19.4621 33.885 19.2253 33.9933L12.3052 37.1605C9.1324 38.6127 5.59103 36.0397 5.99163 32.5734L6.86537 25.0133C6.89526 24.7547 6.81116 24.4958 6.63496 24.3042L1.48438 18.7015C-0.877157 16.1327 0.475528 11.9695 3.89596 11.2794L11.356 9.77418C11.6113 9.72268 11.8314 9.56271 11.9593 9.33591L15.6961 2.70609Z" fill="currentColor"></path></svg>
              <div class="absolute inset-0 flex items-center justify-center text-[11px] text-white">${5 - idx}</div>
            </div>
            <div class="h-2.5 flex-grow overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div class="h-full bg-green-500" style="width: ${ratio * 100}%;"></div>
            </div>
          </div>`,
          )
          .join('')
      : '<div class="text-sm text-token-text-tertiary">Not enough ratings yet</div>';

  const startChatHtml = showStartChat
    ? `<div class="flex flex-grow flex-col items-center"><a target="_self" class="btn relative composer-submit-btn composer-submit-button-color h-12 w-full" href="/g/${aboutData.gizmo.short_url}"><div class="flex w-full gap-2 items-center justify-center">${CHAT_ICON_SVG}Start Chat</div></a></div>`
    : '';

  const dialogHtml = `<div id="gizmo-about-dialog" class="absolute inset-0" style="z-index:100001">
  <div data-state="open" class="fixed inset-0 bg-black/50 dark:bg-black/80" style="pointer-events: auto;">
    <div class="grid h-full w-full grid-cols-[10px_1fr_10px] grid-rows-[minmax(10px,_1fr)_auto_minmax(10px,_1fr)] overflow-y-auto md:grid-rows-[minmax(20px,_1fr)_auto_minmax(20px,_1fr)]" style="opacity: 1; transform: none;">
      <div role="dialog" id="gizmo-about-dialog-content" data-state="open" class="popover relative start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2 col-auto col-start-2 row-auto row-start-2 w-full rounded-xl bg-token-main-surface-primary text-start shadow-xl transition-all flex flex-col focus:outline-none max-w-md flex h-[calc(100vh-25rem)] min-h-[80vh] max-w-xl" tabindex="-1" style="pointer-events: auto;">
        <div class="flex-grow overflow-y-auto">
          <div class="relative flex h-full flex-col gap-2 overflow-hidden px-2 py-4">
            <div id="gizmo-about-dialog-inner-content" class="relative flex flex-grow flex-col gap-4 overflow-y-auto px-6 pb-20 pt-16">
              <div class="absolute top-0">
                <div class="fixed start-4 end-4 z-10 flex min-h-[64px] items-start justify-end gap-4 bg-gradient-to-b from-token-main-surface-primary to-transparent px-2">
                  <button id="gizmo-about-close-button" class="text-token-text-tertiary hover:text-token-text-tertiary">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.34315 6.34338L17.6569 17.6571M17.6569 6.34338L6.34315 17.6571" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                  </button>
                </div>
              </div>
              <div class="absolute bottom-[64px]">
                <div class="fixed start-4 end-4 z-10 flex min-h-[64px] items-end bg-gradient-to-t from-token-main-surface-primary to-transparent px-2">${startChatHtml}</div>
              </div>
              <div class="flex h-full flex-col items-center justify-center text-token-text-primary !h-fit">
                <div class="relative">
                  <div class="mb-3 h-12 w-12 !h-20 !w-20">
                    <div class="gizmo-shadow-stroke overflow-hidden rounded-full">
                      <img src="${aboutData.gizmo.display.profile_picture_url}" class="h-full w-full bg-token-main-surface-secondary" alt="GPT" width="80" height="80">
                    </div>
                  </div>
                </div>
                <div class="flex flex-col items-center gap-2">
                  <div class="text-center text-2xl font-medium">${name}</div>
                  <div class="flex items-center gap-1 text-token-text-tertiary">
                    <div class="mt-1 flex flex-row items-center space-x-1">
                      <div class="text-sm text-token-text-tertiary">By ${authorLink}</div>
                    </div>
                  </div>
                  <div class="max-w-md text-center text-sm font-normal text-token-text-primary">${aboutData.gizmo.display.description}</div>
                </div>
              </div>
              <div class="flex justify-center">${ratingHtml}${categoryHtml}${genericHtml}</div>
              <div class="flex flex-col">
                <div class="font-bold mt-6">Conversation Starters</div>
                <div class="mt-4 grid grid-cols-2 gap-x-1.5 gap-y-2">${startersHtml}</div>
              </div>
              <div class="flex flex-col">
                <div class="font-bold mt-6 mb-2">Capabilities</div>
                ${capabilitiesHtml}
              </div>
              <div class="flex flex-col">
                <div class="mb-2"><div class="font-bold mt-6">Ratings</div></div>
                ${ratingsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', dialogHtml);

  document.querySelector('#gizmo-about-close-button')?.addEventListener('click', () => {
    document.querySelector('#gizmo-about-dialog')?.remove();
  });

  document.body.addEventListener('click', (ev: MouseEvent) => {
    const dialogContent = document.querySelector('#gizmo-about-dialog-content') as HTMLElement | null;
    if (dialogContent && !isDescendant(dialogContent, ev.target)) {
      document.querySelector('#gizmo-about-dialog')?.remove();
    }
  });

  // "More by" section
  getGizmosByUser(aboutData?.gizmo?.author?.user_id).then((data: any) => {
    const items = data.items;
    if (!items || items.length === 0) return;

    const moreByHtml = `<div class="flex flex-col"><div class="mb-2"><div class="font-bold mt-6">More by ${aboutData.gizmo?.author?.display_name || ''}</div></div><div class="no-scrollbar group flex min-h-[104px] items-center space-x-2 overflow-x-auto overflow-y-hidden">
      ${items
        .map(
          (item: any) =>
            `<a href="/g/${item.gizmo.short_url}" class="h-fit min-w-fit-sp rounded-xl bg-token-main-surface-secondary px-1 py-4 md:px-3 md:py-4 lg:px-3"><div class="flex w-full flex-grow items-center gap-4 overflow-hidden"><div class="h-12 w-12 flex-shrink-0"><div class="gizmo-shadow-stroke overflow-hidden rounded-full"><img src="${item.gizmo.display?.profile_picture_url || ''}" class="h-full w-full bg-token-main-surface-secondary" alt="GPT" width="80" height="80"></div></div><div class="overflow-hidden text-ellipsis break-words"><span class="text-sm font-medium leading-tight line-clamp-2">${item.gizmo.display?.name || ''}</span><span class="text-xs line-clamp-3">${item.gizmo.display?.description || ''}</span><div class="mt-1 flex items-center gap-1 text-ellipsis whitespace-nowrap pe-1 text-xs text-token-text-tertiary"><div class="mt-1 flex flex-row items-center space-x-1"><div class="text-token-text-tertiary text-xs">By ${item.gizmo.author?.display_name || ''}</div></div><span class="text-[8px]">\u2022</span>${CONVERSATIONS_ICON_SVG.replace('icon-sm me-1', 'h-3 w-3')}${item.gizmo.vanity_metrics?.num_conversations_str || ''}</div></div></div></a>`,
        )
        .join('')}
    </div></div>`;

    document.querySelector('#gizmo-about-dialog-inner-content')?.insertAdjacentHTML('beforeend', moreByHtml);
  });
}

// ---------------------------------------------------------------------------
// Blurred list placeholder (non-subscriber fallback)
// ---------------------------------------------------------------------------

/**
 * Returns a blurred, non-interactive placeholder grid for non-subscribers.
 *
 * Original: `blurredList` (line 8636)
 */
export function gizmoBlurredList(): string {
  const makeCard = (name: string, desc: string, imgUrl: string) =>
    `<div class="flex flex-col w-full justify-start items-start gap-2 pe-3 pb-3" style="max-width: 25%;"><div class="flex flex-col w-full h-full justify-start items-start gap-2 p-4 cursor-pointer bg-black/50 hover:bg-black hover:shadow-xl rounded-xl"><div class="flex justify-center items-center w-24 h-24 rounded-md bg-gray-200"><img src="${imgUrl}" class="w-24 h-24 rounded-md border border-gray-300"></div><div class="text-lg font-bold">${name}</div><div class="text-sm" style="min-height:80px; white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">${desc}</div><div class="mt-1 flex items-center gap-1 text-token-text-tertiary"><div class="text-sm text-token-text-tertiary" style="white-space: break-spaces; overflow-wrap: break-word;display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;word-break:break-word;">By ChatGPT</div></div></div></div>`;

  // Return a simple blurred placeholder
  return `<div style="position:absolute;display: flex;flex-flow: wrap;justify-content: start;align-items: stretch;filter: blur(12px); pointer-events: none;">${makeCard('DALL\u00B7E', 'Let me turn your imagination into imagery', '')}${makeCard('Data Analysis', 'Drop in any files and I can help analyze and visualize your data', '')}${makeCard('ChatGPT Classic', 'The latest version of GPT-4 with no additional capabilities', '')}${makeCard('Game Time', 'I can quickly explain board games or card games to players of any age.', '')}</div>`;
}
