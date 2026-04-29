/**
 * Isolated-world bootstrap script.
 *
 * In the original extension this file injects the main-world script
 * into the page. With CRXJS that injection is handled automatically
 * by the manifest's `world: "MAIN"` declaration, so this file simply
 * logs and performs any early isolated-world setup.
 *
 * Runs at document_start (before any DOM is available).
 *
 * Original source: content.isolated.start.js
 */

console.log('[SP Clone] Isolated-world bootstrap loaded (document_start)');

// Bridge: receive live ChatGPT GraphQL persisted-query hash captured by the
// main-world fetch interceptor and stash it in chrome.storage so the
// background sync can use the current hash instead of a hardcoded fallback.
window.addEventListener('council:graphql-hash', (e: Event) => {
  const detail = (e as CustomEvent).detail as { hash?: string; capturedAt?: number };
  if (!detail?.hash) return;
  try {
    chrome.storage.local.set({
      chatgptGraphqlHash: detail.hash,
      chatgptGraphqlHashCapturedAt: detail.capturedAt ?? Date.now(),
    });
  } catch {
    // chrome.storage may be unavailable in some contexts — skip silently
  }
});
