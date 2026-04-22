/**
 * localStorage and sessionStorage helpers with the "sp/" key prefix
 * used by the original extension.
 *
 * All Council keys in web-accessible storage are prefixed with "sp/"
 * to avoid collisions with ChatGPT's own keys.
 *
 * Original source: content.isolated.end.js, various helpers
 */

const SP_PREFIX = 'sp/';

// ---------------------------------------------------------------------------
// localStorage  (persistent across sessions)
// ---------------------------------------------------------------------------

/**
 * Read a value from localStorage, automatically prepending the SP prefix.
 * Returns `null` when the key does not exist, otherwise parses JSON.
 */
export function spGet<T = unknown>(key: string): T | null {
  const raw = localStorage.getItem(`${SP_PREFIX}${key}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // If value is not JSON (legacy plain strings), return as-is.
    return raw as unknown as T;
  }
}

/**
 * Write a value to localStorage under the SP prefix, JSON-serialised.
 */
export function spSet(key: string, value: unknown): void {
  localStorage.setItem(`${SP_PREFIX}${key}`, JSON.stringify(value));
}

/**
 * Remove one or more SP-prefixed keys from localStorage.
 */
export function spRemove(...keys: string[]): void {
  for (const key of keys) {
    localStorage.removeItem(`${SP_PREFIX}${key}`);
  }
}

// ---------------------------------------------------------------------------
// sessionStorage (cleared when tab closes)
// ---------------------------------------------------------------------------

/**
 * Read a value from sessionStorage with the SP prefix.
 */
export function spSessionGet<T = unknown>(key: string): T | null {
  const raw = sessionStorage.getItem(`${SP_PREFIX}${key}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/**
 * Write a value to sessionStorage under the SP prefix, JSON-serialised.
 */
export function spSessionSet(key: string, value: unknown): void {
  sessionStorage.setItem(`${SP_PREFIX}${key}`, JSON.stringify(value));
}
