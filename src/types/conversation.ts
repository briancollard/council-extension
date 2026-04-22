/**
 * Conversation and related data-model type definitions.
 *
 * These types model the ChatGPT conversation structure (as returned by the
 * `backend-api/conversation/{id}` endpoint) plus all Council-specific
 * entities stored on the Council API: folders, prompts, notes, custom
 * instruction profiles, and pinned messages.
 *
 * @see extension-source-beautified/scripts/background/initialize.js
 * @see extension-source-beautified/scripts/content/content.main.start.js
 * @see docs/extraction-report.md "Key Data Structures"
 */

// ---------------------------------------------------------------------------
// Message primitives
// ---------------------------------------------------------------------------

/** The role of a message author in a conversation. */
export type AuthorRole = 'user' | 'assistant' | 'system' | 'tool';

/** Author metadata attached to every message. */
export interface MessageAuthor {
  /** The role that produced this message. */
  role: AuthorRole;
  /** Optional display name (e.g. a GPT name for "tool" role). */
  name?: string;
  /** Additional metadata provided by the API. */
  metadata?: Record<string, unknown>;
}

/** The content block inside a message. */
export interface MessageContent {
  /**
   * Discriminator for the content format.
   * Known values: "text", "code", "execution_output", "tether_browsing_display",
   *               "tether_quote", "system_error", "multimodal_text".
   */
  content_type: string;
  /**
   * The actual payload.  For "text" this is `string[]`;
   * for "multimodal_text" it may contain image/file part objects.
   */
  parts: unknown[];
}

/** Metadata attached to a message (varies by author role and model). */
export interface MessageMetadata {
  /** Model slug that produced this message (e.g. "gpt-4o", "o1-preview"). */
  model_slug?: string;
  /** Unique identifier for the model configuration. */
  model_config_id?: string;
  /** Timestamp header echoed from the server. */
  timestamp_?: string;
  /** Message type discriminator used by the API. */
  message_type?: string;
  /** Status of the message (e.g. "finished_successfully"). */
  finish_details?: { type: string; stop_tokens?: number[] };
  /** Citations sourced during browsing. */
  citations?: unknown[];
  /** Gizmo (Custom GPT) ID associated with this message. */
  gizmo_id?: string;
  /** Catch-all for additional metadata fields. */
  [key: string]: unknown;
}

/** A single message inside a conversation. */
export interface Message {
  /** UUID of this message. */
  id: string;
  /** Who produced the message. */
  author: MessageAuthor;
  /** The structured content. */
  content: MessageContent;
  /** Unix timestamp (seconds) when the message was created. */
  create_time: number | null;
  /** Unix timestamp (seconds) when the message was last updated. */
  update_time?: number | null;
  /** Status: "finished_successfully", "in_progress", etc. */
  status?: string;
  /** Whether this message has been explicitly ended by the user. */
  end_turn?: boolean | null;
  /** Weight used for response ordering. */
  weight?: number;
  /** Per-message metadata (model info, citations, finish details). */
  metadata?: MessageMetadata;
  /** Recipient of this message (usually "all" or a tool name). */
  recipient?: string;
}

// ---------------------------------------------------------------------------
// Conversation tree
// ---------------------------------------------------------------------------

/** A node in the conversation's message tree. */
export interface MessageNode {
  /** The message data, or null for the synthetic root node. */
  message: Message | null;
  /** UUID of the parent node, or null for the root. */
  parent: string | null;
  /** UUIDs of child nodes (branches). */
  children: string[];
  /** Node ID (echoes the mapping key). */
  id?: string;
}

/** Mapping from message UUID to its tree node. */
export type MessageMapping = Record<string, MessageNode>;

/**
 * A full conversation as returned by the ChatGPT API, extended with
 * Council-specific fields.
 */
export interface Conversation {
  /** Human-readable title. */
  title: string;
  /** Unique conversation identifier (UUID). */
  conversation_id: string;
  /** UUID of the message node that is currently visible (leaf of active branch). */
  current_node: string;
  /** Unix timestamp (seconds) of creation. */
  create_time: number;
  /** Unix timestamp (seconds) of the most recent update. */
  update_time: number;
  /** Whether the conversation has been archived by the user. */
  is_archived: boolean;
  /** The message tree. Keys are message UUIDs. */
  mapping: MessageMapping;
  /** Gizmo (Custom GPT) ID if this conversation uses one. */
  gizmo_id?: string | null;
  /** Model slug used in this conversation. */
  default_model_slug?: string;

  // -- Council extensions -----------------------------------------------
  /** Whether this conversation is marked as a favorite (SP feature). */
  is_favorite?: boolean;
  /** SP folder ID that this conversation belongs to, if any. */
  folder?: string | null;
  /** SP folder color (denormalized for sidebar rendering). */
  folder_color?: string;
  /** SP-synced project (Gizmo) ID. */
  project_gizmo_id?: string | null;
}

/** Lightweight conversation summary used in list views. */
export interface ConversationSummary {
  id: string;
  title: string;
  create_time: number;
  update_time: number;
  is_archived?: boolean;
  is_favorite?: boolean;
  folder?: string | null;
  gizmo_id?: string | null;
}

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

/** Image data embedded in a folder icon. */
export interface FolderImage {
  /** Base64-encoded image data. */
  base64: string;
  /** MIME type (e.g. "image/png"). */
  type: string;
  /** Original filename. */
  name: string;
}

/** Profile association for a conversation folder. */
export interface FolderProfile {
  /** Custom instruction profile ID to activate when entering this folder. */
  id: string;
}

/**
 * A folder used to organize conversations or prompts.
 *
 * Folders are stored on the Council API and support nesting via
 * `parent_folder_id`.
 */
export interface Folder {
  /** Unique folder identifier (server-generated). */
  id: string | number;
  /** Display name. */
  name: string;
  /** Hex color code (e.g. "#4a90d9"). */
  color: string;
  /**
   * Parent folder ID. `0` (or `"0"`) means root level.
   * A string UUID means this is a sub-folder.
   */
  parent_folder_id: string | number;
  /** Optional folder icon image. */
  image?: FolderImage;
  /** Optional associated custom instruction profile. */
  profile?: FolderProfile;
  /** Optional folder description / note. */
  description?: string;
  /** Server-managed creation timestamp. */
  created_at?: string;
  /** Server-managed update timestamp. */
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** A file attachment associated with a prompt. */
export interface PromptFile {
  /** Original filename. */
  name: string;
  /** Server-generated file ID. */
  id?: string | number;
  /** MIME type. */
  type?: string;
  /** Base64-encoded contents (for local display). */
  base64?: string;
}

/**
 * A user-created prompt template.
 *
 * Prompts support multi-step chains where each step is a separate message
 * sent sequentially with a configurable delay.
 */
export interface Prompt {
  /** Unique prompt identifier (server-generated). */
  id: string | number;
  /** Display title. */
  title: string;
  /**
   * Ordered list of prompt steps. Each string is the text of one step.
   * Supports `{{variable}}` template placeholders.
   */
  steps: string[];
  /** Delay in milliseconds between sending consecutive steps. */
  steps_delay: number;
  /** Tag IDs or tag strings associated with this prompt. */
  tags: (string | number)[];
  /** Language of the prompt content. */
  language: { name: string; code: string };
  /** Category label (user-defined or from community). */
  category?: string;
  /** Whether this prompt is marked as a favorite. */
  is_favorite: boolean;
  /** Whether this prompt is shared publicly in the community. */
  is_public?: boolean;
  /** Folder ID this prompt belongs to, if any. */
  folder_id?: string | number | null;
  /** Folder alias (alternate key used in some API responses). */
  folder?: string | number | null;
  /** File attachments for this prompt. */
  files?: PromptFile[];
  /** Model slug to force when running this prompt. */
  model_slug?: string;
  /** The original instruction text (legacy single-step field). */
  instruction?: string;
  /** Number of times this prompt has been used. */
  use_count?: number;
  /** Server-managed creation timestamp. */
  created_at?: string;
  /** Server-managed update timestamp. */
  updated_at?: string;
}

/** A single step within a prompt chain (expanded form for the executor). */
export interface PromptStep {
  /** The text content of this step. */
  text: string;
  /** 0-based index of this step in the chain. */
  index: number;
  /** Total number of steps in the chain. */
  total: number;
}

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

/**
 * A note attached to a conversation.
 *
 * Notes are stored on the Council API and linked via `conversation_id`.
 */
export interface Note {
  /** Server-generated note identifier. */
  id: string | number;
  /** The conversation this note is linked to. */
  conversation_id: string;
  /** Display name / title of the note. */
  name?: string;
  /** The note body (plain text or markdown). */
  text?: string;
  /** Alias for text used in some API responses. */
  content?: string;
  /** ISO timestamp of creation. */
  created_at: string;
  /** ISO timestamp of last update. */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Custom Instruction Profile
// ---------------------------------------------------------------------------

/**
 * Known tool slugs that can be disabled in a custom instruction profile.
 *
 * The original extension references these in the profile editor UI.
 */
export type DisableableTool =
  | 'browser'
  | 'python'
  | 'canmore'
  | 'chatgpt_voice'
  | 'advanced_voice'
  | 'connector_search'
  | string;

/**
 * A custom instruction profile that can prepend system/user messages
 * and disable specific ChatGPT tools.
 */
export interface CustomInstructionProfile {
  /** Server-generated profile identifier. */
  id: string | number;
  /** Display name of the profile. */
  name: string;
  /** Whether this profile is currently active. Only one can be enabled. */
  enabled: boolean;
  /**
   * The "What would you like ChatGPT to know about you?" text.
   * Injected as a system-level instruction.
   */
  about_user_message: string;
  /**
   * The "How would you like ChatGPT to respond?" text.
   * Injected as a model-behavior instruction.
   */
  about_model_message: string;
  /** List of tool slugs to disable when this profile is active. */
  disabled_tools: DisableableTool[];
  /** Server-managed creation timestamp. */
  created_at?: string;
  /** Server-managed update timestamp. */
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Pinned Message
// ---------------------------------------------------------------------------

/**
 * A bookmarked / pinned message within a conversation.
 *
 * Pinned messages are stored on the Council API and shown in the
 * Pinned Messages manager tab.
 */
export interface PinnedMessage {
  /** Server-generated pinned message identifier. */
  id: string | number;
  /** The conversation containing this message. */
  conversation_id: string;
  /** The UUID of the pinned message within the conversation's mapping. */
  message_id: string;
  /** A short preview of the pinned message content. */
  content_preview?: string;
  /** The full message text (denormalized for display). */
  message?: string;
  /** ISO timestamp of when the message was pinned. */
  pinned_at?: string;
  /** ISO timestamp alias used in some API responses. */
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Gizmo (Custom GPT) info
// ---------------------------------------------------------------------------

/** Author information for a Gizmo (Custom GPT). */
export interface GizmoAuthor {
  /** Author's user ID. */
  user_id?: string;
  /** Display name. */
  display_name?: string;
  /** Link to the author's profile or website. */
  link_to?: string;
  /** Whether this author is verified. */
  is_verified?: boolean;
}

/**
 * A Gizmo (Custom GPT) as returned by the ChatGPT API and extended by SP.
 *
 * SP syncs Gizmo data to its backend for folder assignment and discovery.
 */
export interface GizmoInfo {
  /** The Gizmo resource wrapper. */
  gizmo?: {
    /** Unique Gizmo ID (e.g. "g-abc123"). */
    id: string;
    /** Internal organization ID. */
    organization_id?: string;
    /** Short identifier. */
    short_url?: string;
    /** Display info. */
    display?: {
      name?: string;
      description?: string;
      welcome_message?: string;
      prompt_starters?: string[];
      profile_pic_id?: string;
      profile_picture_url?: string;
      categories?: string[];
    };
    /** Author info. */
    author?: GizmoAuthor;
    /** Creation timestamp. */
    created_at?: string;
    /** Last update timestamp. */
    updated_at?: string;
    /** Sharing configuration. */
    share_recipient?: string;
    /** Tags for categorization. */
    tags?: string[];
  };
  /** Tool definitions available to this Gizmo. */
  tools?: Array<{ id: string; type: string; [key: string]: unknown }>;
  /** Files associated with this Gizmo's knowledge base. */
  files?: Array<{ id: string; name: string; [key: string]: unknown }>;
  /** Product features enabled. */
  product_features?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Paginated API response wrapper
// ---------------------------------------------------------------------------

/** Generic paginated response from the Council API. */
export interface PaginatedResponse<T> {
  /** The items for the current page. */
  results: T[];
  /** Total number of items across all pages. */
  count: number;
  /** URL for the next page, or null. */
  next: string | null;
  /** URL for the previous page, or null. */
  previous: string | null;
}

// ---------------------------------------------------------------------------
// Gallery Image (used in the image gallery feature)
// ---------------------------------------------------------------------------

/** An image stored in the SP gallery. */
export interface GalleryImage {
  /** Server-generated image identifier. */
  id: string | number;
  /** Display name. */
  name?: string;
  /** The image URL. */
  url?: string;
  /** Download URL. */
  download_url?: string;
  /** Data URI for local display. */
  data_uri?: string;
  /** Category label. */
  category?: string;
  /** Whether the image is publicly shared. */
  is_public?: boolean;
  /** Conversation ID this image came from. */
  conversation_id?: string;
  /** Message ID this image came from. */
  message_id?: string;
  /** ISO timestamp. */
  created_at?: string;
}
