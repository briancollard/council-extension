/**
 * Settings type definitions for Council.
 *
 * Derived from the original extension's `initializeStorageOnInstall()` in
 * `background/initialize.js` which defines the complete default settings
 * object written to `chrome.storage.local.settings`.
 *
 * @see extension-source-beautified/scripts/background/initialize.js lines 43-160
 */

// ---------------------------------------------------------------------------
// Helper / selector option types
// ---------------------------------------------------------------------------

/** Language selector option (used for instruction language, prompt language, speech-to-text). */
export interface LanguageOption {
  /** BCP-47 language code, or "default" / "all" / "select" for sentinel values. */
  code: string;
  /** Human-readable name shown in the dropdown. */
  name: string;
  [key: string]: unknown;
}

/** Tone selector option (e.g. "Professional", "Casual", "Default"). */
export interface ToneOption {
  code: string;
  name: string;
  /** Short explanation of the tone's effect, shown as a tooltip. */
  description: string;
}

/** Writing-style selector option. */
export interface WritingStyleOption {
  code: string;
  name: string;
  /** Short explanation of the style's effect, shown as a tooltip. */
  description: string;
}

/** Sort-by option used in Manager sidebars (conversations, notes, prompts). */
export interface SortByOption {
  /** Human-readable label. */
  name: string;
  /** API / storage key, e.g. "updated_at", "created_at", "title". */
  code: string;
  [key: string]: unknown;
}

/** Tag filter option used in the prompt manager. */
export interface TagFilterOption {
  name: string;
  code: string;
  [key: string]: unknown;
}

/** View mode for manager grids / lists. */
export type ViewMode = 'grid' | 'list';

/** Rewrite tone option values. */
export type RewriteTone = 'as-is' | 'more-formal' | 'more-casual' | 'more-friendly' | 'more-professional';

/** Rewrite length option values. */
export type RewriteLength = 'as-is' | 'shorter' | 'longer';

/** Rewrite context presets. */
export type RewriteContext = 'clarity' | 'grammar' | 'tone' | 'conciseness' | 'custom';

// ---------------------------------------------------------------------------
// Main Settings interface
// ---------------------------------------------------------------------------

/**
 * Complete settings object stored under `chrome.storage.local.settings`.
 *
 * Every key listed here has a default value defined in `DEFAULT_SETTINGS`.
 * The original extension reads these with destructuring defaults, so missing
 * keys gracefully fall back.
 */
export interface Settings {
  // -- Core extension state ------------------------------------------------
  /** Master on/off toggle for the extension. */
  councilIsEnabled: boolean;
  /** Auto-reload ChatGPT tabs when the extension updates. */
  autoReloadOnUpdate: boolean;
  /** Animate the favicon with a spinning indicator during generation. */
  animateFavicon: boolean;
  /** Suppress the "how to move prompts" helper tooltip in the prompt manager. */
  dontShowPromptManagerMoveHelper: boolean;

  // -- Input behavior ------------------------------------------------------
  /** Up/Down arrow keys cycle through prompt history in the input box. */
  promptHistoryUpDownKey: boolean;
  /** Enable "copy mode" — clicking a message copies it to clipboard. */
  copyMode: boolean;
  /** Reset the top navigation bar to default on page load. */
  autoResetTopNav: boolean;
  /** Show the star button for quick-access favorite prompts beside input. */
  showFavoritePromptsButton: boolean;
  /** Submit the prompt when Enter is pressed (Shift+Enter for newline). */
  submitPromptOnEnter: boolean;
  /** Enable {{variable}} template substitution in prompts. */
  promptTemplate: boolean;
  /** Auto-click the "Continue generating" button when it appears. */
  autoClick: boolean;

  // -- UI visibility -------------------------------------------------------
  /** Hide the newsletter banner in ChatGPT's sidebar. */
  hideNewsletter: boolean;
  /** Hide the release-note banner after extension updates. */
  hideReleaseNote: boolean;
  /** Hide the "new version available" notification. */
  hideUpdateNotification: boolean;

  // -- Audio ---------------------------------------------------------------
  /** Play a sound when the assistant finishes responding. */
  chatEndedSound: boolean;

  // -- Layout --------------------------------------------------------------
  /** Enable a custom conversation content width. */
  customConversationWidth: boolean;
  /** Conversation content width as a percentage (20-100). */
  conversationWidth: number;

  // -- Instruction selectors -----------------------------------------------
  /** Show the language selector dropdown in the input area. */
  showLanguageSelector: boolean;
  /** Show the tone selector dropdown in the input area. */
  showToneSelector: boolean;
  /** Show the writing-style selector dropdown in the input area. */
  showWritingStyleSelector: boolean;
  /** Currently selected instruction language. */
  selectedLanguage: LanguageOption;
  /** Currently selected instruction tone. */
  selectedTone: ToneOption;
  /** Currently selected instruction writing style. */
  selectedWritingStyle: WritingStyleOption;

  // -- Manager sort / view state -------------------------------------------
  /** Sort order for the notes manager. */
  selectedNotesSortBy: SortByOption;
  /** View mode for the notes manager. */
  selectedNotesView: ViewMode;
  /** Sort order for the conversations manager. */
  selectedConversationsManagerSortBy: SortByOption;
  /** Sort order for the prompts manager. */
  selectedPromptsManagerSortBy: SortByOption;
  /** Tag filter for the prompts manager. */
  selectedPromptsManagerTag: TagFilterOption;
  /** Language filter for the prompts manager. */
  selectedPromptsManagerLanguage: TagFilterOption;
  /** Language pre-selected in the prompt editor's language dropdown. */
  selectedPromptEditorLanguage: LanguageOption;

  // -- Speech-to-text ------------------------------------------------------
  /** Auto-continue generating when the model indicates more content. */
  autoContinueWhenPossible: boolean;
  /** Auto-speak (TTS) the assistant's response when it finishes. */
  autoSpeak: boolean;
  /** Enable Alt-key shortcut for speech-to-text dictation. */
  enableSpeechToTextShortkey: boolean;
  /** Language used by the browser's speech recognition API. */
  speechToTextLanguage: LanguageOption;
  /** Show interim (partial) results during speech recognition. */
  speechToTextInterimResults: boolean;
  /** Auto-submit the prompt when the Alt key is released after dictation. */
  autoSubmitWhenReleaseAlt: boolean;

  // -- Sidebar / layout sizing ---------------------------------------------
  /** Width in pixels of the manager's left sidebar. */
  managerSidebarWidth: number;
  /** Exclude conversations that are inside folders from the default list. */
  excludeConvInFolders: boolean;

  // -- Sidebar UI toggles --------------------------------------------------
  /** Show the "Notes" button in ChatGPT's left sidebar. */
  showSidebarNoteButton: boolean;
  /** Show the "Folders" button in ChatGPT's left sidebar. */
  showSidebarFolderButton: boolean;
  /** Show memory toggle buttons in the input area. */
  showMemoryTogglesInInput: boolean;
  /** Show the "Re-run last prompt chain" button. */
  showRerunLastPromptChainButton: boolean;
  /** Show the AI prompt rewriter button in the input area. */
  showPromptRewriterButtonInInput: boolean;

  // -- Prompt rewriter settings --------------------------------------------
  /** Tone setting for prompt rewriting. */
  rewriteTone: RewriteTone | string;
  /** Length setting for prompt rewriting. */
  rewriteLength: RewriteLength | string;
  /** Context preset for prompt rewriting. */
  selectedRewriteContext: RewriteContext | string;
  /** Custom rewrite context text (used when selectedRewriteContext is "custom"). */
  customRewriteContext: string;

  // -- Message display -----------------------------------------------------
  /** Show a timestamp on each message. */
  showMessageTimestamp: boolean;
  /** Show character/word count on each message. */
  showMessageCharWordCount: boolean;
  /** Show the conversation creation date in the sidebar list. */
  showConversationTimestampInSidebar: boolean;
  /** Show indicator icons (folder, favorite, note) in the sidebar list. */
  showConversationIndicatorsInSidebar: boolean;
  /** Show the custom instruction profile selector button. */
  showCustomInstructionProfileSelector: boolean;

  // -- GPT / Gizmo features ------------------------------------------------
  /** Auto-create a folder when opening a Custom GPT for the first time. */
  autoFolderCustomGPTs: boolean;
  /** Show Council folders in ChatGPT's native left sidebar. */
  showFoldersInLeftSidebar: boolean;
  /** Sync Gizmo (GPT) data to the Council backend. */
  syncGizmos: boolean;
  /** Enable side-by-side voice mode (experimental). */
  sidebysideVoice: boolean;
  /** Show the conversation minimap on the right side. */
  showMiniMap: boolean;
  /** Override ChatGPT's model switcher dropdown with Council's version. */
  overrideModelSwitcher: boolean;

  // -- Sync ----------------------------------------------------------------
  /** Sync ChatGPT Projects data to the Council backend. */
  syncProjects: boolean;
  /** Include assistant responses when syncing conversation history. */
  syncHistoryResponses: boolean;

  // -- Auto-actions --------------------------------------------------------
  /** Trigger end-of-conversation event based on the stream event. */
  triggerEndOfConvOnEvent: boolean;

  /** Auto-delete old conversations after N days. */
  autoDelete: boolean;
  /** Number of days after which conversations are auto-deleted. */
  autoDeleteNumDays: number;
  /** Exclude conversations inside folders from auto-delete. */
  autoDeleteExcludeFolders: boolean;

  /** Auto-archive old conversations after N days. */
  autoArchive: boolean;
  /** Number of days after which conversations are auto-archived. */
  autoArchiveNumDays: number;
  /** Exclude conversations inside folders from auto-archive. */
  autoArchiveExcludeFolders: boolean;

  // -- Message visibility --------------------------------------------------
  /** Auto-hide old messages in long conversations. */
  autoHideOldMessages: boolean;
  /** Number of total messages required before auto-hiding kicks in. */
  autoHideOldMessagesThreshold: number;
  /** Number of most recent messages to keep visible. */
  autoHideOldMessagesRecent: number;
  /** Show per-message show/hide toggle buttons. */
  showMessageVisibilityToggleButtons: boolean;

  // -- Date dividers -------------------------------------------------------
  /** Show date divider lines between messages from different days. */
  showDateDividersInConversation: boolean;

  // -- Auto-summarize / auto-split -----------------------------------------
  /** Auto-summarize long conversations (experimental). */
  autoSummarize: boolean;

  /** Auto-split long prompts into chunks. */
  autoSplit: boolean;
  /** Character limit at which auto-split kicks in. */
  autoSplitLimit: number;
  /** Initial prompt sent before the first chunk. */
  autoSplitInitialPrompt: string;
  /** Prompt template sent with each subsequent chunk. */
  autoSplitChunkPrompt: string;

  // -- Catch-all for unknown future settings -------------------------------
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

/**
 * Complete default settings object.
 *
 * Mirrors the literal values from `initializeStorageOnInstall()` in the
 * original extension's `background/initialize.js`.
 */
export const DEFAULT_SETTINGS: Settings = {
  // Core
  councilIsEnabled: true,
  autoReloadOnUpdate: true,
  animateFavicon: false,
  dontShowPromptManagerMoveHelper: false,

  // Input
  promptHistoryUpDownKey: true,
  copyMode: false,
  autoResetTopNav: true,
  showFavoritePromptsButton: true,
  submitPromptOnEnter: true,
  promptTemplate: true,
  autoClick: false,

  // UI visibility
  hideNewsletter: true,
  hideReleaseNote: true,
  hideUpdateNotification: false,

  // Audio
  chatEndedSound: false,

  // Layout
  customConversationWidth: false,
  conversationWidth: 50,

  // Instruction selectors
  showLanguageSelector: false,
  showToneSelector: false,
  showWritingStyleSelector: false,
  selectedLanguage: { code: 'default', name: 'Default' },
  selectedTone: {
    code: 'default',
    name: 'Default',
    description: 'No specific tone instruction',
  },
  selectedWritingStyle: {
    code: 'default',
    name: 'Default',
    description: 'No specific writing style instruction',
  },

  // Manager sort / view
  selectedNotesSortBy: { name: 'Update date', code: 'updated_at' },
  selectedNotesView: 'grid',
  selectedConversationsManagerSortBy: { name: 'Update date', code: 'updated_at' },
  selectedPromptsManagerSortBy: { name: 'Update date', code: 'updated_at' },
  selectedPromptsManagerTag: { name: 'All', code: 'all' },
  selectedPromptsManagerLanguage: { name: 'All', code: 'all' },
  selectedPromptEditorLanguage: { name: 'Select', code: 'select' },

  // Speech-to-text
  autoContinueWhenPossible: true,
  autoSpeak: false,
  enableSpeechToTextShortkey: true,
  speechToTextLanguage: { name: 'English (United Kingdom)', code: 'en-GB' },
  speechToTextInterimResults: true,
  autoSubmitWhenReleaseAlt: false,

  // Sidebar / layout sizing
  managerSidebarWidth: 220,
  excludeConvInFolders: false,

  // Sidebar UI
  showSidebarNoteButton: true,
  showSidebarFolderButton: true,
  showMemoryTogglesInInput: true,
  showRerunLastPromptChainButton: true,
  showPromptRewriterButtonInInput: true,

  // Prompt rewriter
  rewriteTone: 'as-is',
  rewriteLength: 'as-is',
  selectedRewriteContext: 'clarity',
  customRewriteContext: '',

  // Message display
  showMessageTimestamp: false,
  showMessageCharWordCount: false,
  showConversationTimestampInSidebar: true,
  showConversationIndicatorsInSidebar: true,
  showCustomInstructionProfileSelector: true,

  // GPT / Gizmo features
  autoFolderCustomGPTs: false,
  showFoldersInLeftSidebar: false,
  syncGizmos: false,
  sidebysideVoice: false,
  showMiniMap: false,
  overrideModelSwitcher: false,

  // Sync
  syncProjects: false,
  syncHistoryResponses: true,

  // Auto-actions
  triggerEndOfConvOnEvent: false,
  autoDelete: false,
  autoDeleteNumDays: 7,
  autoDeleteExcludeFolders: true,
  autoArchive: false,
  autoArchiveNumDays: 7,
  autoArchiveExcludeFolders: true,

  // Message visibility
  autoHideOldMessages: false,
  autoHideOldMessagesThreshold: 10,
  autoHideOldMessagesRecent: 2,
  showMessageVisibilityToggleButtons: false,

  // Date dividers
  showDateDividersInConversation: false,

  // Auto-summarize / auto-split
  autoSummarize: false,
  autoSplit: false,
  autoSplitLimit: 24_000,
  autoSplitInitialPrompt: `Act like a document/text loader until you load and remember the content of the next text/s or document/s.
There might be multiple files, each file is marked by name in the format ### DOCUMENT NAME.
I will send them to you in chunks. Each chunk starts will be noted as [START CHUNK x/TOTAL], and the end of this chunk will be noted as [END CHUNK x/TOTAL], where x is the number of current chunks, and TOTAL is the number of all chunks I will send you.
I will split the message in chunks, and send them to you one by one. For each message follow the instructions at the end of the message.
Let's begin:

`,
  autoSplitChunkPrompt: `Reply with OK: [CHUNK x/TOTAL]
Don't reply with anything else!`,
};
