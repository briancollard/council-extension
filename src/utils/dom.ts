/**
 * DOM helper utilities.
 *
 * Provides type-safe wrappers around common DOM operations used
 * throughout the content scripts.
 *
 * Original source: scattered across content.isolated.end.js
 */

/**
 * Type-safe querySelector that returns the element typed to the
 * selector's implied element type, or `null` if not found.
 */
export function qs<K extends keyof HTMLElementTagNameMap>(
  selector: K,
  root?: ParentNode,
): HTMLElementTagNameMap[K] | null;
export function qs<E extends HTMLElement = HTMLElement>(selector: string, root?: ParentNode): E | null;
export function qs(selector: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(selector);
}

/**
 * Type-safe querySelectorAll returning a real Array instead of NodeList.
 */
export function qsa<K extends keyof HTMLElementTagNameMap>(selector: K, root?: ParentNode): HTMLElementTagNameMap[K][];
export function qsa<E extends HTMLElement = HTMLElement>(selector: string, root?: ParentNode): E[];
export function qsa(selector: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Shorthand for document.createElement with optional attributes and children.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (string | Node)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else if (key === 'textContent') {
        el.textContent = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }

  return el;
}

/**
 * Returns a Promise that resolves when an element matching `selector`
 * appears in the DOM (or resolves immediately if it already exists).
 *
 * Uses a MutationObserver under the hood. Automatically disconnects
 * after resolution or timeout.
 *
 * @param selector  CSS selector to watch for
 * @param root      Observation root (default: document.body)
 * @param timeout   Max milliseconds to wait (default: 10 000)
 */
export function waitForElement<E extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document.body,
  timeout = 10_000,
): Promise<E | null> {
  const existing = root.querySelector<E>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const observer = new MutationObserver(() => {
      const el = root.querySelector<E>(selector);
      if (el) {
        observer.disconnect();
        if (timer !== undefined) clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(root instanceof Document ? root.documentElement : root, {
      childList: true,
      subtree: true,
    });

    timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}
