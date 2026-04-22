/**
 * Custom event names dispatched from the MAIN world fetch interceptor
 * and consumed by the ISOLATED world event bridge.
 *
 * Original source: content.main.start.js
 * These correspond to the ~30 CustomEvent types fired by the patched fetch().
 */
export const SP_EVENTS = {
  // --- Auth & Session ---
  AUTH_RECEIVED: 'authReceived',
  SIGNOUT_RECEIVED: 'signoutReceived',
  SESSION_RECEIVED: 'sessionReceived',

  // --- Account ---
  ACCOUNT_RECEIVED: 'accountReceived',
  SUBSCRIPTIONS_RECEIVED: 'subscriptionsReceived',

  // --- Conversation lifecycle ---
  CONVERSATION_SUBMITTED: 'conversationSubmitted',
  CONVERSATION_RECEIVED: 'conversationReceived',
  CONVERSATION_RESPONSE_ENDED: 'conversationResponseEnded',
  CONVERSATION_DELETE_RECEIVED: 'conversationDeleteReceived',
  CONVERSATION_RENAME_RECEIVED: 'conversationRenameReceived',
  CONVERSATION_ARCHIVED_RECEIVED: 'conversationArchivedReceived',
  CONVERSATION_UNARCHIVED_RECEIVED: 'conversationUnarchivedReceived',
  CONVERSATION_PROJECT_UPDATED: 'conversationProjectUpdated',
  CONVERSATION_ASYNC_MESSAGE_RECEIVED: 'conversationAsyncMessageReceived',
  STOP_CONVERSATION_RECEIVED: 'stopConversationReceived',

  // --- Bulk conversation actions ---
  ARCHIVED_ALL_RECEIVED: 'archivedAllReceived',
  DELETE_ALL_RECEIVED: 'deleteAllReceived',

  // --- History ---
  HISTORY_LOADED_RECEIVED: 'historyLoadedReceived',
  HISTORY_SEARCH_RECEIVED: 'historySearchReceived',

  // --- Models ---
  MODELS_RECEIVED: 'modelsReceived',

  // --- Gizmos / GPTs ---
  GIZMO_RECEIVED: 'gizmoReceived',
  GIZMO_NOT_FOUND: 'gizmoNotFound',
  GIZMOS_BOOTSTRAP_RECEIVED: 'gizmosBootstrapReceived',
  GIZMO_DISCOVERY_RECEIVED: 'gizmoDiscoveryReceived',
  GIZMO_SIDEBAR_UPDATE_RECEIVED: 'gizmoSidebarUpdateReceived',
  GIZMO_SIDEBAR_RECEIVED: 'gizmoSidebarReceived',

  // --- User settings & instructions ---
  USER_SETTINGS_RECEIVED: 'userSettingsReceived',
  PROFILE_UPDATED_RECEIVED: 'profileUpdatedReceived',
  USER_SYSTEM_MESSAGE_UPDATED: 'userSystemMessageUpdated',
  CHAT_REQUIREMENTS_RECEIVED: 'chatRequirementsReceived',

  // --- Files & Textdocs ---
  FILE_RECEIVED: 'fileReceived',
  TEXTDOCS_RECEIVED: 'textdocsReceived',
  FILE_UPLOAD_RECEIVED: 'fileUploadReceived',

  // --- Sharing ---
  SHARE_CREATED: 'shareCreated',
  SHARE_RECEIVED: 'shareReceived',

  // --- Deep Research ---
  DEEP_RESEARCH_FINAL_MESSAGE_RECEIVED: 'deepResearchFinalMessageReceived',

  // --- Projects ---
  PROJECTS_RECEIVED: 'projectsReceived',
  PROJECT_CONVERSATIONS_RECEIVED: 'projectConversationsReceived',

  // --- Misc ---
  CONVERSATION_LIMIT_RECEIVED: 'conversationLimitReceived',
  FEEDBACK_RECEIVED: 'feedbackReceived',
  ACCOUNTS_CHECK_RECEIVED: 'accountsCheckReceived',
  ME_RECEIVED: 'meReceived',
  GRAPHQL_RECEIVED: 'graphqlReceived',
  RGSTR_EVENT_RECEIVED: 'rgstrEventReceived',

  // --- Legacy aliases (kept for event-bridge compat) ---
  CONVERSATION_DELETED: 'conversationDeleted',
  CONVERSATION_RENAMED: 'conversationRenamed',
  CONVERSATION_ARCHIVED: 'conversationArchived',
} as const;

export type SPEventName = (typeof SP_EVENTS)[keyof typeof SP_EVENTS];
