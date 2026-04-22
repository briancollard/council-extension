/**
 * Default settings for the extension.
 *
 * Re-exports DEFAULT_SETTINGS from the shared types package so that
 * consumers only need one import path.
 *
 * TODO: Import from @sp-clone/types once the types package is published.
 *       For now we define a minimal inline default object.
 */

export interface SPSettings {
  autoSync: boolean;
  theme: 'system' | 'light' | 'dark';
  enableFloatingButtons: boolean;
  enableMinimap: boolean;
  enableFolders: boolean;
  enableSearch: boolean;
  enableGallery: boolean;
  enableNotes: boolean;
  enablePins: boolean;
  enablePromptManager: boolean;
  enableExport: boolean;
  enableKeyboardShortcuts: boolean;
  enableSpeech: boolean;
  enableModelSwitcher: boolean;
  enableCustomInstructionProfiles: boolean;
  enableGptStore: boolean;
  enableShare: boolean;
  customConversationWidth: number | null;
  fontSize: number;
  chatEndedAutoSave: boolean;
}

export const DEFAULT_SETTINGS: SPSettings = {
  autoSync: true,
  theme: 'system',
  enableFloatingButtons: true,
  enableMinimap: true,
  enableFolders: true,
  enableSearch: true,
  enableGallery: true,
  enableNotes: true,
  enablePins: true,
  enablePromptManager: true,
  enableExport: true,
  enableKeyboardShortcuts: true,
  enableSpeech: false,
  enableModelSwitcher: true,
  enableCustomInstructionProfiles: true,
  enableGptStore: true,
  enableShare: true,
  customConversationWidth: null,
  fontSize: 16,
  chatEndedAutoSave: false,
};
