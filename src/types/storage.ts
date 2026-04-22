/**
 * Chrome storage schema type definitions.
 *
 * Defines the shape of data stored in `chrome.storage.sync`,
 * `chrome.storage.local`, `window.localStorage`, and
 * `window.sessionStorage` by the Council extension.
 *
 * @see extension-source-beautified/scripts/background/initialize.js
 *   — `initializeStorageOnInstall()` and `flushStorage()` for local/sync keys
 * @see extension-source-beautified/scripts/content/content.main.start.js
 *   — `sp/` namespaced keys in localStorage and sessionStorage
 * @see docs/extraction-report.md "Storage Schema"
 */

import type { Settings } from './settings';

// ---------------------------------------------------------------------------
// chrome.storage.sync
// ---------------------------------------------------------------------------

/**
 * Keys stored in `chrome.storage.sync`.
 *
 * Sync storage is used for small, cross-device values.
 * Note: `hashAcessToken` preserves the original typo from the extension.
 */
export interface ChromeSyncStorage {
  /** The ChatGPT Bearer access token (raw). */
  accessToken?: string;
  /**
   * Hashed access token sent as `Hat-Token` header to the Council API.
   *
   * Note: the key name preserves the original typo ("Acess" not "Access").
   */
  hashAcessToken?: string;
  /** Whether this user has been banned from the SP service. */
  isBanned?: boolean;
  /** OpenAI user ID (used to detect account switches). */
  openai_id?: string;
  /** Timestamp of the last user sync operation. */
  lastUserSync?: number;
}

// ---------------------------------------------------------------------------
// chrome.storage.local
// ---------------------------------------------------------------------------

/** A ChatGPT model descriptor cached locally. */
export interface CachedModel {
  slug: string;
  max_tokens?: number;
  title?: string;
  description?: string;
  tags?: string[];
  qualitative_properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Account data returned by `backend-api/accounts/check`. */
export interface OpenAIAccount {
  accounts?: Record<
    string,
    {
      account_id?: string;
      is_default?: boolean;
      processor?: Record<string, unknown>;
      [key: string]: unknown;
    }
  >;
  [key: string]: unknown;
}

/** Gizmo bootstrap data cached locally. */
export interface GizmosBootstrapData {
  gizmos?: Array<{
    gizmo?: { id: string; display?: Record<string, unknown> };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** Gizmo discovery (GPT Store) data cached locally. */
export interface GizmoDiscoveryData {
  cuts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Gizmo user action settings (keep/hide/pin preferences). */
export interface GizmoUserActionSettings {
  [gizmoId: string]: {
    pinned?: boolean;
    hidden?: boolean;
    kept?: boolean;
  };
}

/**
 * Keys stored in `chrome.storage.local`.
 *
 * Local storage holds the bulk of the extension's persisted state
 * including settings, cached API data, and sync bookkeeping.
 */
export interface ChromeLocalStorage {
  // -- Core settings -------------------------------------------------------
  /** The full settings object (60+ keys). */
  settings?: Settings;

  // -- API configuration ---------------------------------------------------
  /** Base URL for the Council API API. */
  API_URL?: string;
  /** Stripe payment link ID for the subscription flow. */
  STRIPE_PAYMENT_LINK_ID?: string;
  /** Stripe portal link ID for managing subscriptions. */
  STRIPE_PORTAL_LINK_ID?: string;

  // -- Models & AI ---------------------------------------------------------
  /** Cached list of available ChatGPT models. */
  models?: CachedModel[];
  /** The user's last selected model slug. */
  selecteModel?: string | null;

  // -- User & account data -------------------------------------------------
  /** Cached ChatGPT user settings from `backend-api/settings/user`. */
  openAIUserSettings?: Record<string, unknown>;
  /** Account data from `backend-api/accounts/check`. */
  account?: OpenAIAccount;
  /** Cached OpenAI account data (alias used in some code paths). */
  openaiAccount?: OpenAIAccount;

  // -- Gizmo (Custom GPT) caches ------------------------------------------
  /** Bootstrap data for pinned/recent Gizmos. */
  gizmosBootstrap?: GizmosBootstrapData;
  /** List of Gizmo IDs the user has pinned. */
  gizmosPinned?: string[];
  /** GPT Store discovery page data. */
  gizmoDiscovery?: GizmoDiscoveryData;
  /** Per-Gizmo user action settings (pin, hide, keep). */
  gizmoUserActionSettings?: GizmoUserActionSettings;

  // -- Manager UI state ----------------------------------------------------
  /** The last selected tab in the manager modal (e.g. "conversations", "prompts"). */
  managerModalCurrentTab?: string;

  // -- Counts & rate limits ------------------------------------------------
  /** Total number of synced conversations. */
  conversationCount?: number;
  /** ChatGPT message rate limit cap. */
  messageCap?: number;

  // -- Subscription --------------------------------------------------------
  /** Whether the user has an active SP subscription. */
  hasSubscription?: boolean;
  /** Timestamp of the last subscription check. */
  lastSubscriptionCheck?: number;

  // -- Custom instruction profiles -----------------------------------------
  /** List of custom instruction profiles (legacy key, now on server). */
  customInstructionProfiles?: Array<Record<string, unknown>>;

  // -- Conversation selection ----------------------------------------------
  /** The last conversation opened in the manager. */
  lastSelectedConversation?: string | null;

  // -- Newsletter & announcements ------------------------------------------
  /** IDs of newsletters the user has already read. */
  readNewsletterIds?: (string | number)[];

  // -- User input history --------------------------------------------------
  /** History of user inputs for up/down arrow recall. */
  userInputValueHistory?: string[];

  // -- Deal / review / invite reminders ------------------------------------
  /** Suppress the promotional deal banner. */
  dontShowDeal?: boolean;
  /** Timestamp of the last deal banner display. */
  lastDealTimestamp?: number;
  /** Suppress the review reminder. */
  dontShowReviewReminder?: boolean;
  /** Timestamp of the last review reminder. */
  lastReviewReminderTimestamp?: number;
  /** Suppress the invite reminder. */
  dontShowInviteReminder?: boolean;
  /** Timestamp of the last invite reminder. */
  lastInviteReminderTimestamp?: number;

  // -- Installation --------------------------------------------------------
  /** Timestamp of when the extension was first installed. */
  installDate?: number | null;

  // -- Catch-all -----------------------------------------------------------
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// window.localStorage (page-level, "sp/" namespace)
// ---------------------------------------------------------------------------

/**
 * Keys stored in `window.localStorage` by the content scripts.
 *
 * All Council keys use the `sp/` prefix to avoid collisions with
 * ChatGPT's own localStorage usage.
 */
export interface LocalStorageKeys {
  /**
   * Whether the user is currently logged in to ChatGPT.
   * Stored as the string `"true"` or `"false"`.
   */
  'sp/isLoggedIn': string;

  /**
   * Per-conversation message visibility toggle states.
   * JSON-serialized `Record<string, Record<string, boolean>>`:
   * `{ [conversationId]: { [messageId]: visible } }`.
   */
  'sp/allMessagesToggleState': string;

  /**
   * Whether Canvas mode is currently open.
   * Stored as a string.
   */
  'sp/canvasIsOpen': string;

  /**
   * Custom instruction text to prepend to the next user message.
   * Set by the instruction profile selector; consumed and cleared
   * by the fetch interceptor.
   */
  'sp/lastInstruction': string;

  /**
   * Cache mapping message IDs to the custom instruction that was
   * prepended when that message was sent.
   * JSON-serialized `Record<string, string>`.
   */
  'sp/instructionsCache': string;
}

/** Known `sp/` localStorage key names as a union type. */
export type LocalStorageKey = keyof LocalStorageKeys;

// ---------------------------------------------------------------------------
// window.sessionStorage (page-level, "sp/" namespace)
// ---------------------------------------------------------------------------

/**
 * Keys stored in `window.sessionStorage` by the content scripts.
 *
 * Session storage is cleared when the tab is closed, making it suitable
 * for per-session overrides.
 */
export interface SessionStorageKeys {
  /**
   * Model slug to override ChatGPT's model selection for this session.
   * Injected by the model switcher and consumed by the fetch interceptor.
   */
  'sp/selectedModel': string;
}

/** Known `sp/` sessionStorage key names as a union type. */
export type SessionStorageKey = keyof SessionStorageKeys;

// ---------------------------------------------------------------------------
// Type-safe storage access helpers
// ---------------------------------------------------------------------------

/**
 * Helper type for `chrome.storage.sync.get()` calls.
 *
 * Usage:
 * ```ts
 * const result = await chrome.storage.sync.get(['hashAcessToken']) as Pick<ChromeSyncStorage, 'hashAcessToken'>;
 * ```
 */
export type SyncStorageGet<K extends keyof ChromeSyncStorage> = Pick<ChromeSyncStorage, K>;

/**
 * Helper type for `chrome.storage.local.get()` calls.
 *
 * Usage:
 * ```ts
 * const result = await chrome.storage.local.get(['settings', 'models']) as Pick<ChromeLocalStorage, 'settings' | 'models'>;
 * ```
 */
export type LocalStorageGet<K extends keyof ChromeLocalStorage> = Pick<ChromeLocalStorage, K>;
