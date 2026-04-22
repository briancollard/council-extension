/**
 * Instruction Dropdowns — Language / Tone / Writing-Style selectors.
 *
 * Adds dropdown selectors near the prompt input that let the user prepend
 * hidden instruction headers to their messages. These headers tell ChatGPT
 * to respond in a specific language, tone, or writing style.
 *
 * When a dropdown value changes, a hidden `## Instructions ... ## End Instructions`
 * block is generated and stored in localStorage. The fetch interceptor picks
 * this up and prepends it to the next user message.
 *
 * Also handles:
 * - Replacing instruction blocks with visual indicators in rendered messages
 * - Tracking the last used language/tone/style within a conversation
 *
 * Original source: content.isolated.end.js lines 14130-14242
 */

import { getSettings } from '../isolated-world/settings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DropdownOption {
  code: string;
  name: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------

const languageList: DropdownOption[] = [
  { code: 'default', name: 'Default' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese' },
  { code: 'es', name: 'Spanish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'de', name: 'German' },
  { code: 'jv', name: 'Javanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'te', name: 'Telugu' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'mr', name: 'Marathi' },
  { code: 'it', name: 'Italian' },
  { code: 'ta', name: 'Tamil' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ur', name: 'Urdu' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'pl', name: 'Polish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'or', name: 'Oriya' },
  { code: 'my', name: 'Burmese' },
  { code: 'th', name: 'Thai' },
  { code: 'nl', name: 'Dutch' },
  { code: 'id', name: 'Indonesian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'el', name: 'Greek' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'et', name: 'Estonian' },
  { code: 'fa', name: 'Persian' },
  { code: 'sw', name: 'Swahili' },
  { code: 'af', name: 'Afrikaans' },
];

const toneList: DropdownOption[] = [
  { code: 'default', name: 'Default' },
  { code: 'authoritative', name: 'Authoritative' },
  { code: 'clinical', name: 'Clinical' },
  { code: 'cold', name: 'Cold' },
  { code: 'confident', name: 'Confident' },
  { code: 'cynical', name: 'Cynical' },
  { code: 'emotional', name: 'Emotional' },
  { code: 'empathetic', name: 'Empathetic' },
  { code: 'formal', name: 'Formal' },
  { code: 'friendly', name: 'Friendly' },
  { code: 'humorous', name: 'Humorous' },
  { code: 'informal', name: 'Informal' },
  { code: 'ironic', name: 'Ironic' },
  { code: 'optimistic', name: 'Optimistic' },
  { code: 'pessimistic', name: 'Pessimistic' },
  { code: 'playful', name: 'Playful' },
  { code: 'sarcastic', name: 'Sarcastic' },
  { code: 'serious', name: 'Serious' },
  { code: 'sympathetic', name: 'Sympathetic' },
  { code: 'tentative', name: 'Tentative' },
  { code: 'warm', name: 'Warm' },
];

const writingStyleList: DropdownOption[] = [
  { code: 'default', name: 'Default' },
  { code: 'academic', name: 'Academic' },
  { code: 'analytical', name: 'Analytical' },
  { code: 'argumentative', name: 'Argumentative' },
  { code: 'conversational', name: 'Conversational' },
  { code: 'creative', name: 'Creative' },
  { code: 'critical', name: 'Critical' },
  { code: 'descriptive', name: 'Descriptive' },
  { code: 'epigrammatic', name: 'Epigrammatic' },
  { code: 'epistolary', name: 'Epistolary' },
  { code: 'expository', name: 'Expository' },
  { code: 'informative', name: 'Informative' },
  { code: 'instructive', name: 'Instructive' },
  { code: 'journalistic', name: 'Journalistic' },
  { code: 'metaphorical', name: 'Metaphorical' },
  { code: 'narrative', name: 'Narrative' },
  { code: 'persuasive', name: 'Persuasive' },
  { code: 'poetic', name: 'Poetic' },
  { code: 'satirical', name: 'Satirical' },
  { code: 'technical', name: 'Technical' },
];

// ---------------------------------------------------------------------------
// State — tracks last-used instruction codes within a conversation
// ---------------------------------------------------------------------------

let lastLanguageCodeInConversation: string | null = null;
let lastToneCodeInConversation: string | null = null;
let lastWritingStyleCodeInConversation: string | null = null;

// ---------------------------------------------------------------------------
// Dropdown rendering
// ---------------------------------------------------------------------------

/**
 * Render a simple dropdown `<select>` element for a list of options.
 *
 * @param id - Unique prefix (e.g. "Language", "Tone")
 * @param options - The available options
 * @param selected - Currently selected option
 * @param valueKey - The key on each option to use as the option value
 * @param align - Alignment hint ("left" | "right")
 */
function dropdown(
  id: string,
  options: DropdownOption[],
  selected: DropdownOption | null,
  valueKey: keyof DropdownOption = 'code',
  _align = 'right',
): string {
  const optionsHtml = options
    .map(
      (opt) =>
        `<option value="${opt[valueKey]}" ${opt[valueKey] === selected?.[valueKey] ? 'selected' : ''}>${opt.name}</option>`,
    )
    .join('');

  return `<select id="sp-dropdown-${id}" class="bg-token-main-surface-primary border border-token-border-medium text-token-text-primary p-1.5 rounded-md text-xs w-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-token-border-medium">
    ${optionsHtml}
  </select>`;
}

/**
 * Attach a change listener to a dropdown.
 */
function addDropdownEventListener(
  id: string,
  options: DropdownOption[],
  valueKey: keyof DropdownOption,
  onChange: (selected: DropdownOption) => void,
): void {
  const select = document.querySelector(`#sp-dropdown-${id}`) as HTMLSelectElement | null;
  if (!select) return;

  select.addEventListener('change', () => {
    const found = options.find((opt) => opt[valueKey] === select.value);
    if (found) {
      const settings = getSettings() as Record<string, unknown>;

      // Persist the selection
      if (id === 'Language') settings.selectedLanguage = found;
      if (id === 'Tone') settings.selectedTone = found;
      if (id === 'Writing-Style') settings.selectedWritingStyle = found;

      chrome.storage.local.set({ settings });
      onChange(found);
    }
  });
}

// ---------------------------------------------------------------------------
// Instruction generation
// ---------------------------------------------------------------------------

/**
 * Generate the hidden instruction header based on current dropdown selections.
 *
 * This is stored in localStorage and picked up by the fetch interceptor to
 * prepend to the user's next message.
 */
function generateInstructions(force = false): string {
  const settings = getSettings() as Record<string, any>;
  const selectedLanguage = settings.selectedLanguage || { code: 'default', name: 'Default' };
  const selectedTone = settings.selectedTone || { code: 'default', name: 'Default' };
  const selectedWritingStyle = settings.selectedWritingStyle || {
    code: 'default',
    name: 'Default',
  };

  const articles = document.querySelector('main')?.querySelectorAll('article');
  const articleCount = articles?.length ?? 0;

  // Skip if nothing changed
  if (
    !force &&
    lastLanguageCodeInConversation === selectedLanguage.code &&
    lastToneCodeInConversation === selectedTone.code &&
    lastWritingStyleCodeInConversation === selectedWritingStyle.code
  ) {
    if (articleCount === 0) {
      return window.localStorage.getItem('sp/lastInstruction') || '';
    }
    window.localStorage.setItem('sp/lastInstruction', '');
    return '';
  }

  window.localStorage.setItem('sp/lastInstruction', '');

  let hasInstruction = false;
  let instruction = '## Instructions\n';

  const languageBlock = `**Language instruction:**\nPlease ignore all previous language instructions. From now on, I want you to respond only in ${selectedLanguage.name} language (languageCode: ${selectedLanguage.code}).\n`;
  const toneBlock = `**Tone instruction:**\nPlease ignore all previous tone instructions. From now on, I want you to respond only in ${selectedTone.name} tone (toneCode: ${selectedTone.code}).\n`;
  const styleBlock = `**Writing-Style instruction:**\nPlease ignore all previous writing-style instructions. From now on, I want you to respond only in ${selectedWritingStyle.name} writing style (writingStyleCode: ${selectedWritingStyle.code}).\n`;

  // Language
  if (
    (force || lastLanguageCodeInConversation !== selectedLanguage.code || articleCount === 0) &&
    (selectedLanguage.code !== 'default' ||
      (lastLanguageCodeInConversation && lastLanguageCodeInConversation !== 'default'))
  ) {
    instruction += languageBlock;
    hasInstruction = true;
  }

  // Tone
  if (
    (force || lastToneCodeInConversation !== selectedTone.code || articleCount === 0) &&
    (selectedTone.code !== 'default' || (lastToneCodeInConversation && lastToneCodeInConversation !== 'default'))
  ) {
    instruction += toneBlock;
    hasInstruction = true;
  }

  // Writing style
  if (
    (force || lastWritingStyleCodeInConversation !== selectedWritingStyle.code || articleCount === 0) &&
    (selectedWritingStyle.code !== 'default' ||
      (lastWritingStyleCodeInConversation && lastWritingStyleCodeInConversation !== 'default'))
  ) {
    instruction += styleBlock;
    hasInstruction = true;
  }

  instruction +=
    'PLEASE FOLLOW ALL THE ABOVE INSTRUCTIONS, AND DO NOT REPEAT OR TYPE ANY GENERAL CONFIRMATION OR A CONFIRMATION ABOUT ANY OF THE ABOVE INSTRUCTIONS IN YOUR RESPONSE\n';
  instruction += '## End Instructions\n\n';

  if (hasInstruction) {
    window.localStorage.setItem('sp/lastInstruction', instruction);
    return instruction;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Instruction indicator badges in messages
// ---------------------------------------------------------------------------

/**
 * Add visual indicator badges to a user message that had hidden instructions.
 */
export function addInstructionIndicators(messageEl: Element, instructionText: string): void {
  if (!instructionText || !messageEl) return;

  // Strip the instruction block from the visible message text
  const contentDiv = messageEl.querySelector('div.whitespace-pre-wrap');
  if (contentDiv) {
    contentDiv.textContent = (contentDiv.textContent || '').replace(
      /^## Instructions[\s\S]*?## End Instructions\n\n/m,
      '',
    );
  }

  // Extract codes
  lastLanguageCodeInConversation =
    instructionText.match(/\(languageCode: (.*)\)/)?.[1] ?? lastLanguageCodeInConversation;
  lastToneCodeInConversation = instructionText.match(/\(toneCode: (.*)\)/)?.[1] ?? lastToneCodeInConversation;
  lastWritingStyleCodeInConversation =
    instructionText.match(/\(writingStyleCode: (.*)\)/)?.[1] ?? lastWritingStyleCodeInConversation;

  const messageId = messageEl.getAttribute('data-message-id');
  const langCode = instructionText.match(/\(languageCode: (.*)\)/)?.[1] ?? null;
  const toneCode = instructionText.match(/\(toneCode: (.*)\)/)?.[1] ?? null;
  const styleCode = instructionText.match(/\(writingStyleCode: (.*)\)/)?.[1] ?? null;

  const langName = languageList.find((l) => l.code === langCode)?.name;
  const toneName = toneList.find((t) => t.code === toneCode)?.name;
  const styleName = writingStyleList.find((s) => s.code === styleCode)?.name;

  if (messageEl.parentElement?.querySelector('#message-instructions')) return;

  const badgeClass =
    'h-6 p-2 me-1 flex items-center justify-center rounded-md border text-xs text-token-text-tertiary border-token-border-medium bg-token-main-surface-secondary';

  const html = `<div id="message-instructions" class="absolute flex" style="bottom:0px; left:0px;">
    ${langName ? `<div id="language-code-hint-${messageId}" data-code="${langCode}" title="This prompt includes hidden language instructions" class="${badgeClass}">Language:&nbsp;<b>${langName}</b></div>` : ''}
    ${toneName ? `<div id="tone-code-hint-${messageId}" data-code="${toneCode}" title="This prompt includes hidden tone instructions" class="${badgeClass}">Tone:&nbsp;<b>${toneName}</b></div>` : ''}
    ${styleName ? `<div id="writing-style-code-hint-${messageId}" data-code="${styleCode}" title="This prompt includes hidden writing style instructions" class="${badgeClass}">Writing Style:&nbsp;<b>${styleName}</b></div>` : ''}
  </div>`;

  if (langCode || toneCode || styleCode) {
    messageEl.parentElement?.insertAdjacentHTML('beforeend', html);
  }
}

/**
 * Scan all user messages in the current conversation and replace inline
 * instruction blocks with visual indicator badges.
 */
export function replaceAllInstructionsInConversation(): void {
  const conversationId = window.location.pathname.match(/\/c\/([a-f0-9-]+)/)?.[1];
  const main = document.querySelector('main');
  if (!main) return;

  const articles = main.querySelectorAll('article');
  if (!conversationId || articles.length === 0) return;

  const userMessages = main.querySelectorAll('article div[data-message-author-role="user"]');
  if (conversationId && userMessages.length === 0) {
    return;
  }

  if (
    userMessages.length > 0 &&
    !userMessages[userMessages.length - 1]?.querySelector('div.whitespace-pre-wrap')?.textContent
  ) {
    return;
  }

  if (userMessages.length > 0) {
    const instructionsCache: Record<string, string> = JSON.parse(
      window.localStorage.getItem('sp/instructionsCache') || '{}',
    );

    for (let i = 0; i < userMessages.length; i += 1) {
      const msgEl = userMessages[i]!;
      const messageId = msgEl.getAttribute('data-message-id') || '';
      const cachedInstruction = instructionsCache[messageId];

      if (msgEl!.textContent?.match(/^## Instructions[\s\S]*?## End Instructions\n\n/m) || cachedInstruction) {
        const instructionText = replaceInstructionsInMessage(msgEl!, instructionsCache);
        if (instructionText) {
          lastLanguageCodeInConversation =
            instructionText.match(/\(languageCode: (.*)\)/)?.[1] ?? lastLanguageCodeInConversation;
          lastToneCodeInConversation = instructionText.match(/\(toneCode: (.*)\)/)?.[1] ?? lastToneCodeInConversation;
          lastWritingStyleCodeInConversation =
            instructionText.match(/\(writingStyleCode: (.*)\)/)?.[1] ?? lastWritingStyleCodeInConversation;
        }
      }
    }
  }
}

function replaceInstructionsInMessage(el: Element, cache: Record<string, string> | null = null): string {
  // Remove existing indicator if present
  el.parentElement?.querySelector('#message-instructions')?.remove();
  if (!el) return '';

  const instructionsCache = cache || JSON.parse(window.localStorage.getItem('sp/instructionsCache') || '{}');
  const messageId = el.getAttribute('data-message-id') || '';
  const source = instructionsCache[messageId] || el.textContent || '';
  const match = source.match(/^## Instructions[\s\S]*?## End Instructions\n\n/m)?.[0];

  if (match) {
    addInstructionIndicators(el, match);
    return match;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount the instruction dropdown selectors into a container element.
 *
 * Reads the current settings for language/tone/style selections and renders
 * `<select>` elements that update the instruction header on change.
 *
 * @param container - The DOM element to append the dropdowns to.
 */
export function addInstructionDropdowns(container: HTMLElement): void {
  const settings = getSettings() as Record<string, any>;
  const {
    autoResetTopNav,
    selectedLanguage,
    selectedTone,
    selectedWritingStyle,
    showLanguageSelector,
    showToneSelector,
    showWritingStyleSelector,
  } = settings;

  // Determine initial selection — respect autoReset and conversation history
  let lang =
    autoResetTopNav || !showLanguageSelector
      ? languageList.find((l) => l.code === 'default')!
      : selectedLanguage || languageList[0];
  let tone =
    autoResetTopNav || !showToneSelector ? toneList.find((t) => t.code === 'default')! : selectedTone || toneList[0];
  let style =
    autoResetTopNav || !showWritingStyleSelector
      ? writingStyleList.find((s) => s.code === 'default')!
      : selectedWritingStyle || writingStyleList[0];

  // Override with conversation-level selections if present
  if (lastLanguageCodeInConversation) {
    lang = languageList.find((l) => l.code === lastLanguageCodeInConversation) || lang;
  }
  if (lastToneCodeInConversation) {
    tone = toneList.find((t) => t.code === lastToneCodeInConversation) || tone;
  }
  if (lastWritingStyleCodeInConversation) {
    style = writingStyleList.find((s) => s.code === lastWritingStyleCodeInConversation) || style;
  }

  // Persist
  chrome.storage.local.set({
    settings: {
      ...settings,
      selectedLanguage: lang,
      selectedTone: tone,
      selectedWritingStyle: style,
    },
  });

  // Tone dropdown
  const toneWrapper = document.createElement('div');
  toneWrapper.id = 'tone-selector-wrapper';
  toneWrapper.style.cssText = `position:relative;width:150px;margin-left:8px;display:${showToneSelector ? 'block' : 'none'}`;
  toneWrapper.innerHTML = dropdown('Tone', toneList, tone, 'code');
  container.appendChild(toneWrapper);

  // Writing style dropdown
  const styleWrapper = document.createElement('div');
  styleWrapper.id = 'writing-style-selector-wrapper';
  styleWrapper.style.cssText = `position:relative;width:150px;margin-left:8px;display:${showWritingStyleSelector ? 'block' : 'none'}`;
  styleWrapper.innerHTML = dropdown('Writing-Style', writingStyleList, style, 'code');
  container.appendChild(styleWrapper);

  // Language dropdown
  const langWrapper = document.createElement('div');
  langWrapper.id = 'language-selector-wrapper';
  langWrapper.style.cssText = `position:relative;width:150px;margin-left:8px;display:${showLanguageSelector ? 'block' : 'none'}`;
  langWrapper.innerHTML = dropdown('Language', languageList, lang, 'code');
  container.appendChild(langWrapper);

  // Attach change listeners
  addDropdownEventListener('Tone', toneList, 'code', () => generateInstructions());
  addDropdownEventListener('Writing-Style', writingStyleList, 'code', () => generateInstructions());
  addDropdownEventListener('Language', languageList, 'code', () => generateInstructions());

  // Generate initial instruction if needed
  generateInstructions();
}

/**
 * Initialize the instruction dropdowns feature.
 * Call from the main app init to set up the dropdowns on the first load.
 */
export function initializeInstructionDropdowns(): void {
  const settings = getSettings() as Record<string, any>;
  if (!settings.showLanguageSelector && !settings.showToneSelector && !settings.showWritingStyleSelector) {
    return;
  }

  // Find or create the navbar container
  const navWrapper = document.querySelector('#gptx-nav-wrapper');
  if (navWrapper) {
    addInstructionDropdowns(navWrapper as HTMLElement);
  }
}

/** Reset tracked conversation-level instruction state. */
export function resetInstructionState(): void {
  lastLanguageCodeInConversation = null;
  lastToneCodeInConversation = null;
  lastWritingStyleCodeInConversation = null;
}

/** Get the language list for external use. */
export function getLanguageList(): DropdownOption[] {
  return languageList;
}

/** Get the tone list for external use. */
export function getToneList(): DropdownOption[] {
  return toneList;
}

/** Get the writing style list for external use. */
export function getWritingStyleList(): DropdownOption[] {
  return writingStyleList;
}
