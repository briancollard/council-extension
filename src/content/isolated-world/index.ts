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
