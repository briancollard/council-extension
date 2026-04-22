/**
 * Custom DOM event type definitions.
 *
 * The main-world fetch interceptor (`content.main.start.js`) dispatches
 * `CustomEvent`s on `window` after intercepting ChatGPT API responses.
 * The isolated-world content script listens for these events to update
 * the extension's UI state.
 *
 * All events are fired via `window.dispatchEvent(new CustomEvent(name, { detail }))`.
 *
 * @see extension-source-beautified/scripts/content/content.main.start.js
 * @see docs/extraction-report.md "Intercepted Events"
 */

// ---------------------------------------------------------------------------
// Event detail interfaces
// ---------------------------------------------------------------------------

/**
 * Detail for `authReceived`.
 *
 * Dispatched when the user's identity is confirmed via `backend-api/me`.
 */
export interface AuthReceivedDetail {
  /** OpenAI user ID. */
  id: string;
  /** User's email address. */
  email?: string;
  /** Display name. */
  name?: string;
  /** Profile picture URL. */
  picture?: string;
  /** The Bearer access token from the Authorization header. */
  accessToken: string;
  /** Additional fields from the /me response. */
  [key: string]: unknown;
}

/**
 * Detail for `signoutReceived`.
 *
 * Dispatched on explicit sign-out or when the `/me` response indicates
 * the user is not logged in (anonymous / `ua-` prefixed ID).
 */
export interface SignoutReceivedDetail {
  /** Whether the signout API returned success. */
  success?: boolean;
  /** Additional fields from the response. */
  [key: string]: unknown;
}

/**
 * Detail for `historyLoadedReceived`.
 *
 * Dispatched when a page of conversation history is loaded from
 * `backend-api/conversations?limit=28&offset=N`.
 */
export interface HistoryLoadedReceivedDetail {
  /** Array of conversation summary objects. */
  items?: Array<{
    id: string;
    title: string;
    create_time: number;
    update_time: number;
    mapping?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  /** Total conversation count. */
  total?: number;
  /** Pagination limit. */
  limit?: number;
  /** Pagination offset. */
  offset?: number;
  /** GraphQL response shape (alternate). */
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Detail for `conversationSubmitted`.
 *
 * Dispatched when the user sends a new message via POST to
 * `backend-api/conversation`.
 */
export interface ConversationSubmittedDetail {
  /** If branching, the source conversation ID. */
  branchingFromConversationId?: string;
  /** The messages array from the POST body. */
  messages: Array<{
    id: string;
    author: { role: string };
    content: { content_type: string; parts: unknown[] };
    [key: string]: unknown;
  }>;
  /** The custom instruction that was prepended, if any. */
  instructions?: string | null;
}

/**
 * Detail for `conversationReceived`.
 *
 * Dispatched when a full conversation is fetched via GET
 * `backend-api/conversation/{id}`.
 */
export interface ConversationReceivedDetail {
  conversation: {
    conversation_id: string;
    title?: string;
    current_node?: string;
    create_time?: number;
    update_time?: number;
    mapping?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Detail for `conversationResponseEnded`.
 *
 * Dispatched after the streaming response for a conversation POST
 * completes (both `message_stream_complete` and `DONE` detected).
 */
export interface ConversationResponseEndedDetail {
  /** The conversation ID parsed from the stream. */
  conversationId: string | undefined;
  /** The title extracted from `title_generation` events. */
  conversationTitle: string;
}

/**
 * Detail for `conversationAsyncMessageReceived`.
 *
 * Dispatched when an async message status update completes
 * via `backend-api/conversation/{id}/async-status`.
 */
export interface ConversationAsyncMessageReceivedDetail {
  conversationId: string;
}

/**
 * Detail for `conversationRenameReceived`.
 *
 * Dispatched when a conversation title is changed via PATCH.
 */
export interface ConversationRenameReceivedDetail {
  conversationId: string;
  title: string;
}

/**
 * Detail for `conversationDeleteReceived`.
 *
 * Dispatched when a conversation is soft-deleted (is_visible = false).
 */
export interface ConversationDeleteReceivedDetail {
  conversationId: string;
}

/**
 * Detail for `conversationArchivedReceived`.
 *
 * Dispatched when a conversation is archived (is_archived = true).
 */
export interface ConversationArchivedReceivedDetail {
  conversationId: string;
}

/**
 * Detail for `conversationUnarchivedReceived`.
 *
 * Dispatched when a conversation is unarchived (is_archived = false).
 */
export interface ConversationUnarchivedReceivedDetail {
  conversationId: string;
}

/**
 * Detail for `conversationProjectUpdated`.
 *
 * Dispatched when a conversation is moved to/from a project via PATCH
 * with a `gizmo_id` field.
 */
export interface ConversationProjectUpdatedDetail {
  conversationId: string;
  gizmoId: string;
}

/**
 * Detail for `modelsReceived`.
 *
 * Dispatched when the available models list is returned from
 * `backend-api/models`.
 */
export interface ModelsReceivedDetail {
  models: Array<{
    slug: string;
    max_tokens?: number;
    title?: string;
    description?: string;
    tags?: string[];
    [key: string]: unknown;
  }>;
  /** The access token from the request headers. */
  accessToken: string | null;
  [key: string]: unknown;
}

/**
 * Detail for `gizmoReceived`.
 *
 * Dispatched when a single Gizmo (Custom GPT) is fetched via
 * `backend-api/gizmos/g-{id}`.
 */
export interface GizmoReceivedDetail {
  gizmo?: {
    id: string;
    display?: {
      name?: string;
      description?: string;
      profile_picture_url?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  tools?: unknown[];
  [key: string]: unknown;
}

/**
 * Detail for `gizmoNotFound`.
 *
 * Dispatched when a Gizmo request returns a "not found" error.
 * The detail is the original request URL string.
 */
export type GizmoNotFoundDetail = string;

/**
 * Detail for `gizmosBootstrapReceived`.
 *
 * Dispatched when the bootstrap Gizmo data is returned from
 * `backend-api/gizmos/bootstrap`.
 */
export interface GizmosBootstrapReceivedDetail {
  /** Pinned Gizmos. */
  gizmos?: Array<{
    gizmo?: { id: string; display?: Record<string, unknown> };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Detail for `gizmoDiscoveryReceived`.
 *
 * Dispatched when GPT Store discovery data is returned from
 * `public-api/gizmos/discovery`.
 */
export interface GizmoDiscoveryReceivedDetail {
  cuts?: Array<{
    info?: { id?: string; title?: string; description?: string };
    list?: { items?: unknown[] };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Detail for `gizmoSidebarUpdateReceived`.
 *
 * Dispatched when a Gizmo sidebar update is POSTed to
 * `backend-api/gizmos/g-{id}/sidebar`.
 */
export interface GizmoSidebarUpdateReceivedDetail {
  [key: string]: unknown;
}

/**
 * Detail for `userSettingsReceived`.
 *
 * Dispatched when user settings are fetched from
 * `backend-api/settings/user`.
 */
export interface UserSettingsReceivedDetail {
  /** The access token from the request headers. */
  accessToken: string | null;
  [key: string]: unknown;
}

/**
 * Detail for `subscriptionsReceived`.
 *
 * Dispatched when subscription status is returned from
 * `backend-api/subscriptions`.
 */
export interface SubscriptionsReceivedDetail {
  plan_type?: string;
  accountId?: string;
  [key: string]: unknown;
}

/**
 * Detail for `fileReceived`.
 *
 * Dispatched when a file download URL is returned from
 * `backend-api/files/{id}/download`.
 */
export interface FileReceivedDetail {
  data: {
    download_url?: string;
    status?: string;
    [key: string]: unknown;
  };
  fileId: string;
}

/**
 * Detail for `textdocsReceived`.
 *
 * Dispatched when text documents are fetched from
 * `backend-api/conversation/{id}/textdocs`.
 */
export interface TextdocsReceivedDetail {
  textdocs: unknown;
  conversationId: string;
}

/**
 * Detail for `projectsReceived`.
 *
 * Dispatched when project sidebar data is fetched from
 * `backend-api/gizmos/snorlax/sidebar`.
 */
export interface ProjectsReceivedDetail {
  cursor: string | null;
  responseData: unknown;
}

/**
 * Detail for `profileUpdatedReceived`.
 *
 * Dispatched when custom instructions (user system messages) are
 * updated via PATCH/POST to `backend-api/user_system_messages`.
 */
export interface ProfileUpdatedReceivedDetail {
  [key: string]: unknown;
}

/**
 * Detail for `deepResearchFinalMessageReceived`.
 *
 * Dispatched when a deep research task stream reaches its final message.
 */
export interface DeepResearchFinalMessageReceivedDetail {
  /* Empty — the event signals completion, no additional data. */
}

/**
 * Detail for `rgstrEventReceived`.
 *
 * Dispatched when an analytics registration event succeeds at
 * `ab.chatgpt.com/v1/rgstr`.
 */
export interface RgstrEventReceivedDetail {
  payload: string;
}

/**
 * Detail for `stopConversationReceived`.
 *
 * Dispatched when the user stops generation via
 * `backend-api/stop_conversation`.
 */
export interface StopConversationReceivedDetail {
  [key: string]: unknown;
}

/**
 * Detail for `deleteAllReceived`.
 *
 * Dispatched when all conversations are bulk-deleted via PATCH with
 * `is_visible = false` on `backend-api/conversations`.
 */
export interface DeleteAllReceivedDetail {
  [key: string]: unknown;
}

/**
 * Detail for `archivedAllReceived`.
 *
 * Dispatched when all conversations are bulk-archived via PATCH with
 * `is_archived = true` on `backend-api/conversations`.
 */
export interface ArchivedAllReceivedDetail {
  [key: string]: unknown;
}

/**
 * Detail for `accountReceived`.
 *
 * Dispatched when account/check data is returned from
 * `backend-api/accounts/check`.
 */
export interface AccountReceivedDetail {
  accounts?: Record<string, unknown>;
  accessToken: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Event name → detail mapping
// ---------------------------------------------------------------------------

/**
 * Maps each custom event name to its detail type.
 *
 * Use this with `window.addEventListener` and `window.dispatchEvent`
 * for type-safe event handling:
 *
 * ```ts
 * window.addEventListener('authReceived', ((e: CustomEvent<SPEventDetailMap['authReceived']>) => {
 *   console.log(e.detail.accessToken);
 * }) as EventListener);
 * ```
 */
export interface SPEventDetailMap {
  authReceived: AuthReceivedDetail;
  signoutReceived: SignoutReceivedDetail;
  historyLoadedReceived: HistoryLoadedReceivedDetail;
  conversationSubmitted: ConversationSubmittedDetail;
  conversationReceived: ConversationReceivedDetail;
  conversationResponseEnded: ConversationResponseEndedDetail;
  conversationAsyncMessageReceived: ConversationAsyncMessageReceivedDetail;
  conversationRenameReceived: ConversationRenameReceivedDetail;
  conversationDeleteReceived: ConversationDeleteReceivedDetail;
  conversationArchivedReceived: ConversationArchivedReceivedDetail;
  conversationUnarchivedReceived: ConversationUnarchivedReceivedDetail;
  conversationProjectUpdated: ConversationProjectUpdatedDetail;
  modelsReceived: ModelsReceivedDetail;
  gizmoReceived: GizmoReceivedDetail;
  gizmoNotFound: GizmoNotFoundDetail;
  gizmosBootstrapReceived: GizmosBootstrapReceivedDetail;
  gizmoDiscoveryReceived: GizmoDiscoveryReceivedDetail;
  gizmoSidebarUpdateReceived: GizmoSidebarUpdateReceivedDetail;
  userSettingsReceived: UserSettingsReceivedDetail;
  subscriptionsReceived: SubscriptionsReceivedDetail;
  fileReceived: FileReceivedDetail;
  textdocsReceived: TextdocsReceivedDetail;
  projectsReceived: ProjectsReceivedDetail;
  profileUpdatedReceived: ProfileUpdatedReceivedDetail;
  deepResearchFinalMessageReceived: DeepResearchFinalMessageReceivedDetail;
  rgstrEventReceived: RgstrEventReceivedDetail;
  stopConversationReceived: StopConversationReceivedDetail;
  deleteAllReceived: DeleteAllReceivedDetail;
  archivedAllReceived: ArchivedAllReceivedDetail;
  accountReceived: AccountReceivedDetail;
}

/** Union of all custom event names dispatched by the fetch interceptor. */
export type SPEventName = keyof SPEventDetailMap;

// ---------------------------------------------------------------------------
// Typed CustomEvent helper
// ---------------------------------------------------------------------------

/**
 * A strongly-typed CustomEvent for a specific SP event name.
 *
 * Usage:
 * ```ts
 * const event: SPCustomEvent<'authReceived'> = new CustomEvent('authReceived', {
 *   detail: { id: '...', accessToken: '...' },
 * });
 * ```
 */
export type SPCustomEvent<K extends SPEventName> = CustomEvent<SPEventDetailMap[K]>;

// ---------------------------------------------------------------------------
// Augment the global WindowEventMap for type-safe addEventListener
// ---------------------------------------------------------------------------

declare global {
  interface WindowEventMap {
    authReceived: CustomEvent<AuthReceivedDetail>;
    signoutReceived: CustomEvent<SignoutReceivedDetail>;
    historyLoadedReceived: CustomEvent<HistoryLoadedReceivedDetail>;
    conversationSubmitted: CustomEvent<ConversationSubmittedDetail>;
    conversationReceived: CustomEvent<ConversationReceivedDetail>;
    conversationResponseEnded: CustomEvent<ConversationResponseEndedDetail>;
    conversationAsyncMessageReceived: CustomEvent<ConversationAsyncMessageReceivedDetail>;
    conversationRenameReceived: CustomEvent<ConversationRenameReceivedDetail>;
    conversationDeleteReceived: CustomEvent<ConversationDeleteReceivedDetail>;
    conversationArchivedReceived: CustomEvent<ConversationArchivedReceivedDetail>;
    conversationUnarchivedReceived: CustomEvent<ConversationUnarchivedReceivedDetail>;
    conversationProjectUpdated: CustomEvent<ConversationProjectUpdatedDetail>;
    modelsReceived: CustomEvent<ModelsReceivedDetail>;
    gizmoReceived: CustomEvent<GizmoReceivedDetail>;
    gizmoNotFound: CustomEvent<GizmoNotFoundDetail>;
    gizmosBootstrapReceived: CustomEvent<GizmosBootstrapReceivedDetail>;
    gizmoDiscoveryReceived: CustomEvent<GizmoDiscoveryReceivedDetail>;
    gizmoSidebarUpdateReceived: CustomEvent<GizmoSidebarUpdateReceivedDetail>;
    userSettingsReceived: CustomEvent<UserSettingsReceivedDetail>;
    subscriptionsReceived: CustomEvent<SubscriptionsReceivedDetail>;
    fileReceived: CustomEvent<FileReceivedDetail>;
    textdocsReceived: CustomEvent<TextdocsReceivedDetail>;
    projectsReceived: CustomEvent<ProjectsReceivedDetail>;
    profileUpdatedReceived: CustomEvent<ProfileUpdatedReceivedDetail>;
    deepResearchFinalMessageReceived: CustomEvent<DeepResearchFinalMessageReceivedDetail>;
    rgstrEventReceived: CustomEvent<RgstrEventReceivedDetail>;
    stopConversationReceived: CustomEvent<StopConversationReceivedDetail>;
    deleteAllReceived: CustomEvent<DeleteAllReceivedDetail>;
    archivedAllReceived: CustomEvent<ArchivedAllReceivedDetail>;
    accountReceived: CustomEvent<AccountReceivedDetail>;
  }
}
