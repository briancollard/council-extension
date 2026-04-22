/**
 * Prompt template variable persistence layer.
 *
 * Manages `{{variable_name}}` placeholder values — stored in
 * chrome.storage.local (or localStorage fallback) under keys
 * prefixed with `sp/pv/`.  Each variable holds an array of up
 * to 5 recent values used as suggestions.
 *
 * Original source: content.isolated.end.js lines 13613-13820
 */

// ---------------------------------------------------------------------------
// Constants & cache
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'sp/pv/';
const MAX_VALUES = 5;
const IN_MEMORY_CACHE = new Map<string, string[]>();
let CACHE_WARMED = false;
const HAS_CHROME_STORAGE = typeof chrome !== 'undefined' && !!chrome?.storage?.local;

// ---------------------------------------------------------------------------
// Name sanitisation helpers
// ---------------------------------------------------------------------------

/** Sanitize a variable name to a safe storage key suffix. */
export function sanitizePVName(name = ''): string {
  return String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\\/]+/g, '')
    .replace(/[^a-zA-Z0-9\-_]/g, '_');
}

function buildPVKey(name: string): string {
  return `${KEY_PREFIX}${sanitizePVName(name)}`;
}

function extractPVNameFromKey(key: string): string {
  return key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;
}

/** Deduplicate, stringify and cap an array at MAX_VALUES entries. */
function normalizePVArray(arr: unknown): string[] {
  const raw = (Array.isArray(arr) ? arr : []).map((v) => String(v));
  const unique: string[] = [];
  for (const v of raw) {
    if (!unique.includes(v)) unique.push(v);
  }
  return unique.slice(0, MAX_VALUES);
}

// ---------------------------------------------------------------------------
// Low-level chrome.storage / localStorage wrappers
// ---------------------------------------------------------------------------

async function chromeGetAll(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (items) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('chromeGetAll error', err);
        reject(err);
      } else {
        resolve(items || {});
      }
    });
  });
}

async function chromeGet(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (items) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('chromeGet error', err);
        reject(err);
      } else {
        resolve(items?.[key]);
      }
    });
  });
}

async function chromeSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('chromeSet error', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function chromeRemove(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove([key], () => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('chromeRemove error', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function localStorageGetAll(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    try {
      const raw = localStorage.getItem(key);
      result[key] = raw ? JSON.parse(raw) : undefined;
    } catch {
      // skip non-JSON values
    }
  }
  return result;
}

function localStorageGet(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch (err) {
    console.warn('localStorageGet error', err);
    return undefined;
  }
}

function localStorageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('localStorageSet error', err);
    throw err;
  }
}

function localStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('localStorageRemove error', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cache warming
// ---------------------------------------------------------------------------

/**
 * Populate IN_MEMORY_CACHE from storage on first access.
 * Also registers a chrome.storage.onChanged listener to keep
 * the cache in sync.
 */
async function warmCacheIfNeeded(): Promise<void> {
  if (CACHE_WARMED) return;
  try {
    const all = HAS_CHROME_STORAGE ? await chromeGetAll() : localStorageGetAll();
    Object.entries(all).forEach(([key, value]) => {
      if (key.startsWith(KEY_PREFIX) && Array.isArray(value)) {
        IN_MEMORY_CACHE.set(key, normalizePVArray(value));
      }
    });
    CACHE_WARMED = true;

    // Keep cache in sync with storage changes
    if (HAS_CHROME_STORAGE && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        for (const [key, change] of Object.entries(changes)) {
          if (!key.startsWith(KEY_PREFIX)) continue;
          if (Object.prototype.hasOwnProperty.call(change, 'newValue')) {
            IN_MEMORY_CACHE.set(key, normalizePVArray(change.newValue));
          } else {
            IN_MEMORY_CACHE.delete(key);
          }
        }
      });
    }
  } catch (err) {
    console.warn('warmCacheIfNeeded error', err);
  }
}

// ---------------------------------------------------------------------------
// Internal persist / erase
// ---------------------------------------------------------------------------

async function persist(key: string, values: string[]): Promise<void> {
  const normalised = normalizePVArray(values);
  IN_MEMORY_CACHE.set(key, normalised);
  if (HAS_CHROME_STORAGE) {
    await chromeSet(key, normalised);
  } else {
    localStorageSet(key, normalised);
  }
}

async function erase(key: string): Promise<void> {
  IN_MEMORY_CACHE.delete(key);
  if (HAS_CHROME_STORAGE) {
    await chromeRemove(key);
  } else {
    localStorageRemove(key);
  }
}

// ---------------------------------------------------------------------------
// Public CRUD API
// ---------------------------------------------------------------------------

/** Get stored values for a prompt variable (array of up to 5 strings). */
export async function getPromptVariable(name: string): Promise<string[]> {
  try {
    await warmCacheIfNeeded();
    const key = buildPVKey(name);
    if (IN_MEMORY_CACHE.has(key)) return IN_MEMORY_CACHE.get(key)!.slice();
    const raw = HAS_CHROME_STORAGE ? await chromeGet(key) : localStorageGet(key);
    const values = normalizePVArray(Array.isArray(raw) ? raw : []);
    IN_MEMORY_CACHE.set(key, values);
    return values.slice();
  } catch (err) {
    console.warn('getPromptVariable error', err);
    return [];
  }
}

/** Set the full array of values for a prompt variable. */
export async function setPromptVariable(name: string, values: string[]): Promise<boolean> {
  try {
    await warmCacheIfNeeded();
    const key = buildPVKey(name);
    await persist(key, values);
    return true;
  } catch (err) {
    console.warn('setVariable error', err);
    return false;
  }
}

/** Add a value to the front of a prompt variable's suggestion list. */
export async function addPromptVariableValue(name: string, value: string): Promise<string[]> {
  try {
    await warmCacheIfNeeded();
    const key = buildPVKey(name);
    const current = await getPromptVariable(name);
    const str = String(value);
    const filtered = current.filter((v) => v !== str);
    filtered.unshift(str);
    const normalised = normalizePVArray(filtered);
    await persist(key, normalised);
    return normalised.slice();
  } catch (err) {
    console.warn('addValue error', err);
    return [];
  }
}

/** Replace an old value with a new value in a prompt variable's list. */
export async function updatePromptVariableValue(name: string, oldValue: string, newValue: string): Promise<string[]> {
  try {
    await warmCacheIfNeeded();
    const key = buildPVKey(name);
    const filtered = (await getPromptVariable(name)).filter((v) => v !== String(oldValue));
    filtered.unshift(String(newValue));
    const normalised = normalizePVArray(filtered);
    await persist(key, normalised);
    return normalised.slice();
  } catch (err) {
    console.warn('updateValue error', err);
    return [];
  }
}

/** Remove a specific value from a prompt variable's list. */
export async function removePromptVariableValue(name: string, value: string): Promise<string[]> {
  try {
    await warmCacheIfNeeded();
    const key = buildPVKey(name);
    const filtered = (await getPromptVariable(name)).filter((v) => v !== String(value));
    await persist(key, filtered);
    return filtered.slice();
  } catch (err) {
    console.warn('removeValue error', err);
    return [];
  }
}

/** Delete an entire prompt variable (all values). */
export async function deletePromptVariable(name: string): Promise<boolean> {
  try {
    await warmCacheIfNeeded();
    const key = buildPVKey(name);
    await erase(key);
    return true;
  } catch (err) {
    console.warn('deleteVariable error', err);
    return false;
  }
}

/** List all prompt variable names. */
export async function listPromptVariables(): Promise<string[]> {
  try {
    await warmCacheIfNeeded();
    if (IN_MEMORY_CACHE.size > 0) {
      return Array.from(IN_MEMORY_CACHE.keys())
        .filter((k) => k.startsWith(KEY_PREFIX))
        .map(extractPVNameFromKey);
    }
    const all = HAS_CHROME_STORAGE ? await chromeGetAll() : localStorageGetAll();
    return Object.keys(all)
      .filter((k) => k.startsWith(KEY_PREFIX))
      .map(extractPVNameFromKey);
  } catch (err) {
    console.warn('listVariables error', err);
    return [];
  }
}

/** Get all prompt variables as a map of name → values. */
export async function getAllPromptVariables(): Promise<Record<string, string[]>> {
  try {
    await warmCacheIfNeeded();
    const names = await listPromptVariables();
    const result: Record<string, string[]> = {};
    for (const name of names) {
      result[name] = await getPromptVariable(name);
    }
    return result;
  } catch (err) {
    console.warn('getAllVariables error', err);
    return {};
  }
}

/** Check whether a prompt variable has any stored values. */
export async function pvExists(name: string): Promise<boolean> {
  return (await getPromptVariable(name)).length > 0;
}

/** Get the number of stored values for a prompt variable. */
export async function pvSize(name: string): Promise<number> {
  return (await getPromptVariable(name)).length;
}
