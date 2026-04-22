/**
 * ChatGPT backend-api and related endpoint patterns.
 *
 * Original source: content.main.start.js URL matching patterns
 * and content.isolated.end.js API call targets.
 */

// --- Base URLs ---
export const CHATGPT_ORIGIN = 'https://chatgpt.com';
export const LEGACY_ORIGIN = 'https://chat.openai.com';

// --- Backend API (authenticated) ---
export const BACKEND_API_BASE = '/backend-api';

export const API = {
  // Auth / session
  SESSION: '/api/auth/session',
  SIGNOUT: '/api/auth/signout',
  ACCOUNTS_CHECK: '/backend-api/accounts/check',

  // Conversations
  CONVERSATION: '/backend-api/conversation', // POST = submit
  CONVERSATION_BY_ID: '/backend-api/conversation/', // GET /:id
  CONVERSATIONS: '/backend-api/conversations', // GET ?offset=&limit=
  CONVERSATION_SEARCH: '/backend-api/conversations/search',

  // Models
  MODELS: '/backend-api/models',

  // Gizmos / GPTs
  GIZMO_BY_ID: '/backend-api/gizmos/', // GET /:id
  GIZMO_DISCOVERY: '/backend-api/gizmos/discovery',
  GIZMO_SIDEBAR: '/backend-api/gizmos/sidebar',

  // User settings
  USER_SETTINGS: '/backend-api/settings/user',
  USER_SYSTEM_MESSAGE: '/backend-api/user_system_messages',
  CHAT_REQUIREMENTS: '/backend-api/sentinel/chat-requirements',

  // Sharing
  SHARE: '/backend-api/share/create',
  SHARE_BY_ID: '/backend-api/share/',

  // Projects
  PROJECTS: '/backend-api/projects',

  // Feedback
  FEEDBACK: '/backend-api/conversation/message_feedback',

  // Files
  FILES: '/backend-api/files',

  // Me
  ME: '/backend-api/me',

  // --- Public API ---
  PUBLIC_API: '/public-api',

  // --- AB testing ---
  AB_CHATGPT: 'ab.chatgpt.com',

  // --- Anon ---
  BACKEND_ANON: '/backend-anon',

  // --- GraphQL ---
  GRAPHQL: '/ces/v1/graphql',
} as const;

/**
 * URL substrings used by the fetch interceptor to decide which
 * responses to clone and dispatch as events.
 */
export const INTERCEPT_URL_PATTERNS = [
  'backend-api',
  'public-api',
  'api/auth',
  'ab.chatgpt.com',
  'backend-anon',
  'graphql',
] as const;
