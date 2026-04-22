/**
 * Popup script for Council extension.
 *
 * Responsibilities:
 * - Display version number from manifest
 * - Toggle Council enabled/disabled (persisted in chrome.storage)
 * - Update extension icon based on enabled state
 * - Enable/disable popup buttons when extension is toggled off
 * - Reload ChatGPT tabs on toggle change
 * - Email/password login to Council server
 */

// The API_URL is defined in messaging.ts but that runs in the service worker.
// Read API URL from storage (set by messaging.ts based on install type)
// Falls back to production URL
let API_URL = 'https://council-app-production.up.railway.app';
chrome.storage.local.get(['API_URL'], (data) => {
  if (data.API_URL) API_URL = data.API_URL;
});

// ---------------------------------------------------------------------------
// Icon paths
// ---------------------------------------------------------------------------

type IconSizeMap = Record<number, string>;
type ImageDataMap = Record<number, ImageData>;

const DEFAULT_ICON_PATH: IconSizeMap = {
  16: chrome.runtime.getURL('images/icon-16.png'),
  32: chrome.runtime.getURL('images/icon-32.png'),
  48: chrome.runtime.getURL('images/icon-48.png'),
  128: chrome.runtime.getURL('images/icon-128.png'),
};

const DISABLED_ICON_PATH: IconSizeMap = {
  16: chrome.runtime.getURL('images/icon-16-disabled.png'),
  32: chrome.runtime.getURL('images/icon-32-disabled.png'),
  48: chrome.runtime.getURL('images/icon-48-disabled.png'),
  128: chrome.runtime.getURL('images/icon-128-disabled.png'),
};

const CACHED_DEFAULT_ICON_IMAGE_DATA: ImageDataMap = {};
const CACHED_DISABLED_ICON_IMAGE_DATA: ImageDataMap = {};

// ---------------------------------------------------------------------------
// Icon preloading
// ---------------------------------------------------------------------------

async function preloadIconImages(paths: IconSizeMap, cache: ImageDataMap): Promise<void> {
  for (const key of Object.keys(paths)) {
    const size = Number(key);
    const url = paths[size]!;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      cache[size] = ctx.getImageData(0, 0, size, size);
    } catch (err) {
      console.error(`Error preloading icon ${url} for size ${size}:`, err);
      throw err;
    }
  }
}

async function preloadAllIcons(): Promise<void> {
  try {
    await preloadIconImages(DEFAULT_ICON_PATH, CACHED_DEFAULT_ICON_IMAGE_DATA);
    await preloadIconImages(DISABLED_ICON_PATH, CACHED_DISABLED_ICON_IMAGE_DATA);
  } catch (err) {
    console.error('Failed to preload all icons:', err);
  }
}

// ---------------------------------------------------------------------------
// Version number
// ---------------------------------------------------------------------------

function initializeVersionNumber(): void {
  const el = document.getElementById('version-number');
  if (el) {
    el.textContent = chrome.runtime.getManifest().version;
  }
}

// ---------------------------------------------------------------------------
// Enable / disable buttons
// ---------------------------------------------------------------------------

async function initializeButtons(): Promise<void> {
  const { settings } = await chrome.storage.local.get(['settings']);
  const { councilIsEnabled = true } = settings ?? {};

  const settingsBtn = document.getElementById('settings-button') as HTMLButtonElement | null;
  const managerBtn = document.getElementById('manager-button') as HTMLButtonElement | null;

  for (const btn of [settingsBtn, managerBtn]) {
    if (!btn) continue;
    btn.disabled = !councilIsEnabled;
    btn.style.opacity = councilIsEnabled ? '1' : '0.5';
    btn.style.setProperty('pointerEvents', councilIsEnabled ? 'auto' : 'none', 'important');
    btn.style.setProperty('cursor', councilIsEnabled ? 'pointer' : 'not-allowed', 'important');
  }
}

// ---------------------------------------------------------------------------
// Extension icon
// ---------------------------------------------------------------------------

async function updateExtensionIcon(disabled = false): Promise<void> {
  await initializeButtons();

  const cache = disabled ? CACHED_DISABLED_ICON_IMAGE_DATA : CACHED_DEFAULT_ICON_IMAGE_DATA;

  if ([16, 32, 48, 128].every((size) => cache[size])) {
    await chrome.action.setIcon({ imageData: cache as Record<string, ImageData> });
  } else {
    const paths = disabled ? DISABLED_ICON_PATH : DEFAULT_ICON_PATH;
    await chrome.action.setIcon({ path: paths as Record<string, string> });
  }
}

// ---------------------------------------------------------------------------
// Council switch
// ---------------------------------------------------------------------------

async function initializeCouncilSwitch(): Promise<void> {
  const toggle = document.getElementById('council-switch') as HTMLInputElement | null;

  if (toggle) {
    const { settings } = await chrome.storage.local.get(['settings']);
    const { councilIsEnabled = true } = settings ?? {};
    toggle.checked = councilIsEnabled;
  }

  toggle?.addEventListener('change', async (e) => {
    const { settings } = await chrome.storage.local.get(['settings']);
    const isEnabled = (e.target as HTMLInputElement).checked;

    await chrome.storage.local.set({
      settings: { ...settings, councilIsEnabled: isEnabled },
    });

    await updateExtensionIcon(!isEnabled);

    // Reload all ChatGPT tabs so the change takes effect
    chrome.tabs.query({ url: 'https://chatgpt.com/*' }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) chrome.tabs.reload(tab.id);
      });
    });

    window.close();
  });
}

// ---------------------------------------------------------------------------
// Tab update listener -- keep icon in sync
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const { settings } = await chrome.storage.local.get(['settings']);
    const { councilIsEnabled = true } = settings ?? {};
    await updateExtensionIcon(!councilIsEnabled);
  }
});

// ---------------------------------------------------------------------------
// Auth — reads council_token cookie set by web app login (zero-friction)
// Falls back to popup login form if no cookie found
// ---------------------------------------------------------------------------

async function initializeAuthSection(): Promise<void> {
  const loginForm = document.getElementById('login-form');
  const loggedInView = document.getElementById('logged-in-view');
  const emailInput = document.getElementById('login-email') as HTMLInputElement | null;
  const passwordInput = document.getElementById('login-password') as HTMLInputElement | null;
  const loginBtn = document.getElementById('login-btn') as HTMLButtonElement | null;
  const loginError = document.getElementById('login-error');
  const loggedInUser = document.getElementById('logged-in-user');
  const signoutBtn = document.getElementById('signout-btn') as HTMLButtonElement | null;

  if (
    !loginForm ||
    !loggedInView ||
    !emailInput ||
    !passwordInput ||
    !loginBtn ||
    !loginError ||
    !loggedInUser ||
    !signoutBtn
  )
    return;

  function showLoggedIn(userDisplay: string): void {
    loginForm!.style.display = 'none';
    loggedInView!.style.display = 'block';
    loggedInUser!.textContent = userDisplay;
  }

  function showLoggedOut(): void {
    loginForm!.style.display = 'block';
    loggedInView!.style.display = 'none';
    emailInput!.value = '';
    passwordInput!.value = '';
    loginError!.style.display = 'none';
    loginError!.textContent = '';
  }

  // --- Check auth: cookie first, then storage ---

  let hasAuth = false;

  // Try reading council_token cookie (set by web app login)
  try {
    const cookie = await chrome.cookies.get({ url: API_URL, name: 'council_token' });
    if (cookie?.value) {
      // Validate token by calling /api/auth/me
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${cookie.value}` },
      });
      if (res.ok) {
        const user = await res.json();
        showLoggedIn(user.name || user.email || 'Connected');
        hasAuth = true;
      }
    }
  } catch {
    // Cookie API or network not available
  }

  // Fall back to stored token
  if (!hasAuth) {
    const data = await chrome.storage.sync.get(['councilBearerToken', 'councilUserDisplay']);
    if (data.councilBearerToken) {
      showLoggedIn(data.councilUserDisplay || 'Signed in');
      hasAuth = true;
    }
  }

  if (!hasAuth) {
    showLoggedOut();
  }

  // --- Login handler (fallback if no cookie) ---

  async function handleLogin(): Promise<void> {
    const email = emailInput!.value.trim();
    const password = passwordInput!.value;

    if (!email || !password) {
      loginError!.textContent = 'Email and password are required';
      loginError!.style.display = 'block';
      return;
    }

    loginBtn!.disabled = true;
    loginBtn!.textContent = 'Signing in...';
    loginError!.style.display = 'none';

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const body = await res.json();

      if (!res.ok) {
        loginError!.textContent = body.error || 'Login failed';
        loginError!.style.display = 'block';
        loginBtn!.disabled = false;
        loginBtn!.textContent = 'Sign in';
        return;
      }

      const userDisplay = body.user?.name || body.user?.email || email;
      await chrome.storage.sync.set({
        councilBearerToken: body.token,
        councilUserDisplay: userDisplay,
      });

      showLoggedIn(userDisplay);
      chrome.runtime.sendMessage({ type: 'COUNCIL_RESYNC' });
    } catch {
      loginError!.textContent = 'Could not connect to server';
      loginError!.style.display = 'block';
      loginBtn!.disabled = false;
      loginBtn!.textContent = 'Sign in';
    }
  }

  loginBtn.addEventListener('click', handleLogin);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passwordInput!.focus();
  });

  signoutBtn.addEventListener('click', async () => {
    await chrome.storage.sync.remove(['councilBearerToken', 'councilUserDisplay']);
    // Also clear the cookie
    try {
      await chrome.cookies.remove({ url: API_URL, name: 'council_token' });
    } catch {}
    showLoggedOut();
  });
}

// ---------------------------------------------------------------------------
// Sync status
// ---------------------------------------------------------------------------

async function initializeSyncStatus(): Promise<void> {
  const chatgptDot = document.getElementById('sync-chatgpt-dot');
  const chatgptStatus = document.getElementById('sync-chatgpt-status');
  const claudeDot = document.getElementById('sync-claude-dot');
  const claudeStatus = document.getElementById('sync-claude-status');
  const geminiDot = document.getElementById('sync-gemini-dot');
  const geminiStatus = document.getElementById('sync-gemini-status');
  const syncNowBtn = document.getElementById('sync-now-btn');

  if (!chatgptDot || !chatgptStatus || !claudeDot || !claudeStatus || !geminiDot || !geminiStatus) return;

  // Fetch sync status counts from Council server
  const syncCounts = await fetchSyncStatus();

  function formatCounts(providerKey: string): string {
    const stats = syncCounts?.providers[providerKey];
    if (!stats || (stats.conversations === 0 && stats.messages === 0)) return '';
    return ` · ${stats.conversations.toLocaleString()} convos · ${stats.messages.toLocaleString()} msgs`;
  }

  // Helper to apply server-side connection error state
  const connStatus = syncCounts?.connections;

  function applyConnectionError(
    provider: string,
    dotEl: HTMLElement,
    statusEl: HTMLElement,
    providerLabel: string,
  ): boolean {
    const conn = connStatus?.[provider];
    if (!conn) return false;
    if (conn.status === 'token_expired') {
      dotEl.style.background = '#f97316'; // orange
      statusEl.textContent = `Session expired — sign in to ${providerLabel}`;
      statusEl.style.color = '#f97316';
      return true;
    }
    if (conn.status === 'error') {
      dotEl.style.background = '#ef4444'; // red
      statusEl.textContent = conn.lastError || 'Sync error';
      statusEl.style.color = '#ef4444';
      return true;
    }
    return false;
  }

  // Check ChatGPT session
  try {
    if (!applyConnectionError('chatgpt', chatgptDot, chatgptStatus, 'ChatGPT')) {
      const chatgptCookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
      const hasSession = chatgptCookies.some(
        (c) => c.name === '__Secure-next-auth.session-token' || c.name === '__Secure-next-auth.callback-url',
      );
      if (hasSession) {
        chatgptDot.style.background = '#22c55e';
        const lastSync = await chrome.storage.local.get(['lastSync_chatgpt']);
        const ago = lastSync.lastSync_chatgpt ? timeAgo(lastSync.lastSync_chatgpt * 1000) : 'never';
        chatgptStatus.textContent = `Connected${formatCounts('chatgpt')} · synced ${ago}`;
      } else {
        chatgptDot.style.background = '#ef4444';
        chatgptStatus.textContent = 'Not connected — open chatgpt.com';
      }
    }
  } catch {
    chatgptStatus.textContent = 'Unable to check';
  }

  // Check Claude session
  try {
    if (!applyConnectionError('claude', claudeDot, claudeStatus, 'Claude')) {
      const claudeCookies = await chrome.cookies.getAll({ domain: 'claude.ai' });
      const hasSession = claudeCookies.some((c) => c.name === 'sessionKey');
      if (hasSession) {
        claudeDot.style.background = '#22c55e';
        const lastSync = await chrome.storage.local.get(['lastSync_claude']);
        const ago = lastSync.lastSync_claude ? timeAgo(lastSync.lastSync_claude * 1000) : 'never';
        claudeStatus.textContent = `Connected${formatCounts('claude')} · synced ${ago}`;
      } else {
        claudeDot.style.background = '#ef4444';
        claudeStatus.textContent = 'Not connected — open claude.ai';
      }
    }
  } catch {
    claudeStatus.textContent = 'Unable to check';
  }

  // Check Gemini session — try multiple cookie names and domains
  try {
    if (!applyConnectionError('gemini', geminiDot, geminiStatus, 'Gemini')) {
      const googleCookies = await chrome.cookies.getAll({ domain: '.google.com' });
      const geminiCookies = await chrome.cookies.getAll({ url: 'https://gemini.google.com' });
      const allCookies = [...googleCookies, ...geminiCookies];
      const hasSession = allCookies.some(
        (c) => c.name === '__Secure-1PSID' || c.name === '__Secure-1PSIDTS' || c.name === 'SID' || c.name === 'HSID',
      );
      if (hasSession) {
        geminiDot.style.background = '#22c55e';
        const lastSync = await chrome.storage.local.get(['lastSync_gemini']);
        const ago = lastSync.lastSync_gemini ? timeAgo(lastSync.lastSync_gemini * 1000) : 'never';
        geminiStatus.textContent = `Connected${formatCounts('gemini')} · synced ${ago}`;
      } else {
        geminiDot.style.background = '#666';
        geminiStatus.textContent = 'Not connected — sign in to gemini.google.com';
      }
    }
  } catch {
    geminiStatus.textContent = 'Unable to check';
  }

  // Sync Now button
  syncNowBtn?.addEventListener('click', () => {
    syncNowBtn.textContent = 'Syncing...';
    syncNowBtn.setAttribute('disabled', 'true');
    chrome.runtime.sendMessage({ type: 'COUNCIL_RESYNC' }, () => {
      setTimeout(() => {
        syncNowBtn.textContent = 'Sync Now';
        syncNowBtn.removeAttribute('disabled');
        initializeSyncStatus(); // Refresh status
      }, 5000);
    });
  });
}

// ---------------------------------------------------------------------------
// Fetch sync status from Council server
// ---------------------------------------------------------------------------

interface ProviderStats {
  conversations: number;
  messages: number;
  images: number;
  artifacts: number;
}

interface ConnectionStatus {
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface SyncStatusResponse {
  providers: Record<string, ProviderStats>;
  connections?: Record<string, ConnectionStatus>;
}

async function fetchSyncStatus(): Promise<SyncStatusResponse | null> {
  // Try cookie auth first, then stored token
  let token: string | null = null;
  try {
    const cookie = await chrome.cookies.get({ url: API_URL, name: 'council_token' });
    if (cookie?.value) token = cookie.value;
  } catch {
    /* no cookie */
  }
  if (!token) {
    const data = await chrome.storage.sync.get(['councilBearerToken']);
    if (data.councilBearerToken) token = data.councilBearerToken;
  }
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/sync/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as SyncStatusResponse;
  } catch {
    return null;
  }
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

preloadAllIcons();
initializeVersionNumber();
initializeCouncilSwitch();
initializeButtons();
initializeAuthSection();
initializeSyncStatus();
