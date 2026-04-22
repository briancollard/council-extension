import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Council',
  version: '0.2.0',
  description: 'Multi-LLM conversation manager — unified threads across providers',
  default_locale: 'en',

  permissions: ['storage', 'unlimitedStorage', 'contextMenus', 'cookies', 'notifications', 'alarms'],
  optional_permissions: ['activeTab', 'tabs'],
  host_permissions: [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
    'https://*.google.com/*',
    'https://council-app-production.up.railway.app/*',
    'https://api.council.dev/*',
    'https://*.council.dev/*',
  ],

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  content_scripts: [
    // ChatGPT
    {
      matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      js: ['src/content/main-world/fetch-interceptor.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      js: ['src/content/isolated-world/index.ts'],
      run_at: 'document_start',
    },
    {
      matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
      css: ['src/styles/global.css'],
      js: ['src/content/isolated-world/app.ts'],
      run_at: 'document_end',
    },
    // Claude
    {
      matches: ['https://claude.ai/*'],
      js: ['src/content/claude/fetch-interceptor.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://claude.ai/*'],
      js: ['src/content/claude/sync.ts'],
      run_at: 'document_end',
    },
    // Gemini
    {
      matches: ['https://gemini.google.com/*'],
      js: ['src/content/gemini/fetch-interceptor.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://gemini.google.com/*'],
      js: ['src/content/gemini/sync.ts'],
      run_at: 'document_end',
    },
    // Council web app — bridge for extension <-> web app communication
    {
      matches: ['https://council-app-production.up.railway.app/*', 'https://*.council.dev/*'],
      js: ['src/content/council/bridge.ts'],
      run_at: 'document_end',
    },
  ],

  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'images/icon-16.png',
      '32': 'images/icon-32.png',
      '48': 'images/icon-48.png',
      '128': 'images/icon-128.png',
    },
  },

  icons: {
    '16': 'images/icon-16.png',
    '32': 'images/icon-32.png',
    '48': 'images/icon-48.png',
    '128': 'images/icon-128.png',
  },

  commands: {
    _execute_action: {
      suggested_key: {
        default: 'Ctrl+Shift+U',
        mac: 'Command+Shift+U',
      },
    },
  },

  omnibox: {
    keyword: 'council',
  },

  externally_connectable: {
    matches: ['https://council-app-production.up.railway.app/*', 'https://*.council.dev/*'],
  },

  web_accessible_resources: [
    {
      resources: ['_locales/*/*.json', 'icons/*', 'images/*', 'sounds/*'],
      matches: [
        'https://chatgpt.com/*',
        'https://chat.openai.com/*',
        'https://claude.ai/*',
        'https://gemini.google.com/*',
      ],
    },
  ],
});
