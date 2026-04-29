/**
 * Background service worker entry point.
 *
 * Original source: background.js (the service_worker registered in manifest.json)
 *
 * Initialises all background modules:
 *  - messaging   : chrome.runtime.onMessage router + install/update handlers
 *  - context-menu: right-click context menus
 *  - auto-sync   : periodic provider sync (every 2 minutes)
 */

import { initializeMessaging, API_URL } from './messaging';
import { initializeContextMenu } from './context-menu';
import { runAutoSync } from './auto-sync';

const SYNC_ALARM_NAME = 'council-periodic-sync';
const SYNC_INTERVAL_MINUTES = 5;

console.log('[Council] Background service worker started');

initializeMessaging();
initializeContextMenu();

// ---------------------------------------------------------------------------
// Initial sync on startup (if auth token exists)
// ---------------------------------------------------------------------------
(async () => {
  // Check cookie first, then storage (matches getAuthToken priority)
  let hasAuth = false;
  try {
    const cookie = await chrome.cookies.get({ url: API_URL, name: 'council_token' });
    if (cookie?.value) hasAuth = true;
  } catch {
    // cookies API not available
  }
  if (!hasAuth) {
    // chrome.storage.local (not sync) — bearer tokens shouldn't propagate
    // across devices via Chrome Sync (gemini-review 4 medium).
    const data = await chrome.storage.local.get(['councilBearerToken']);
    if (data.councilBearerToken) hasAuth = true;
  }

  if (hasAuth) {
    console.log('[Council] Found auth token — triggering auto-sync...');
    setTimeout(runAutoSync, 3000);
  } else {
    console.log('[Council] No auth token — skipping auto-sync. Sign in via extension popup.');
  }
})();

// ---------------------------------------------------------------------------
// Periodic sync via Chrome Alarms API (survives service worker restarts)
// ---------------------------------------------------------------------------
chrome.alarms.create(SYNC_ALARM_NAME, {
  periodInMinutes: SYNC_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME || alarm.name === 'council-catchup-sync') {
    console.log(`[Council] ${alarm.name === 'council-catchup-sync' ? 'Catchup' : 'Periodic'} sync triggered`);
    runAutoSync().catch((err) => console.error('[Council] Sync failed:', err));
  }
});

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Council] Extension installed');
  // Ensure alarm is set on fresh install
  chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Council] Browser started');
});

// ---------------------------------------------------------------------------
// Manual re-sync trigger (from popup or web app)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'COUNCIL_RESYNC') {
    console.log('[Council] Manual re-sync triggered');
    runAutoSync()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true; // async response
  }
});

// External messages from the web app (via externally_connectable)
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'COUNCIL_RESYNC') {
    console.log('[Council] External re-sync triggered from web app');
    runAutoSync()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg?.type === 'COUNCIL_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
});

// Persistent port connections for live sync progress
const syncProgressPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name === 'council-sync-progress') {
    syncProgressPorts.add(port);
    port.onDisconnect.addListener(() => syncProgressPorts.delete(port));
  }
});

/** Broadcast sync progress to all connected web app tabs */
function broadcastSyncProgress(data: Record<string, unknown>) {
  for (const port of syncProgressPorts) {
    try {
      port.postMessage({ type: 'SYNC_PROGRESS', ...data });
    } catch {
      syncProgressPorts.delete(port);
    }
  }
}

// Make available globally for auto-sync to call
(globalThis as Record<string, unknown>).__councilBroadcast = broadcastSyncProgress;
