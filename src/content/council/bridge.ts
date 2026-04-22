/**
 * Council web app bridge — runs on Council web app pages.
 * Stores the extension ID in localStorage so the web app can
 * send messages via externally_connectable.
 */

localStorage.setItem('council-extension-id', chrome.runtime.id);
console.log('[Council] Extension bridge active, id:', chrome.runtime.id);
