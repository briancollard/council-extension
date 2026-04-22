# Council Extension

Browser extension that syncs your conversations from **ChatGPT**, **Claude**, and **Gemini** into your [Council](https://joincouncil.app) account — one place for every thread, searchable and exportable.

**Developed and tested on Google Chrome.** The extension uses Manifest V3 and standard WebExtension APIs; it may work on other Chromium-based browsers (Edge, Brave, Arc) but has not been tested there. Firefox compatibility is unverified.

This repository contains the source code for the Council browser extension, published for transparency and technical review. See [License](#license) below.

---

## What it does

- **Captures conversations** from chatgpt.com, claude.ai, and gemini.google.com as you use them
- **Syncs them to your Council account** so every conversation — across every provider — lives in one place
- **Preserves artifacts** (code blocks, Claude artifacts, DALL·E images, file attachments)
- **Runs locally in your browser** — your provider sessions never leave your device; only the conversation content you opt to sync is sent to Council

## Install (unpacked, development)

The extension is currently distributed for alpha users via unpacked install while the Chrome Web Store listing is under review.

1. Download the latest `council-extension-<version>.zip` from the [Releases page](../../releases), or clone and build from source (see below).
2. Unzip into a folder of your choice.
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
6. Pin the Council icon to your toolbar.

### Sign in (separate from the web app)

The extension has its own sign-in flow. Even if you're already logged into Council in a browser tab, the extension needs its own session.

1. Click the Council extension icon in your toolbar.
2. Enter your Council email and password in the popup.
3. On success, the extension stores a session token scoped to the extension; sync will begin when you visit chatgpt.com, claude.ai, or gemini.google.com.
4. To sign out: click the icon → log out. This clears the extension's session without affecting your browser session.

You'll need an active Council account (https://joincouncil.app) and an alpha invite code to create one.

## Build from source

```bash
pnpm install
pnpm build
# built extension lives in dist/
```

Then load the `dist/` folder via **Load unpacked** in `chrome://extensions`.

### Requirements

- **Google Chrome** (primary target — tested here; other browsers unverified)
- Node.js 20+
- pnpm 9+

## How sync works

1. When you open a conversation on chatgpt.com / claude.ai / gemini.google.com, the extension's content script reads the conversation from the provider's own page (same data you see).
2. The extension sends the conversation body to your Council server (`https://council-app-production.up.railway.app` by default) over HTTPS, authenticated with a session token held in your browser's Council cookie.
3. Council stores the conversation under your account. You can view, search, branch, fork, compare, and export it from the Council web app.

No conversation is synced without your session being active. No provider credentials are captured or transmitted.

## Data & privacy

- **Provider session tokens stay on your device.** The extension reads conversation content the provider has already rendered; it never captures your ChatGPT/Claude/Gemini login credentials.
- **Conversation content is transmitted to your Council server.** That's the whole point — the sync only works if the content reaches Council.
- **Your Council sync tokens are encrypted at rest** on the Council server (AES-256-GCM, application-layer).
- **Analytics** in the extension (if any) mask personally-identifiable text and do not capture conversation content.

Full privacy policy: https://joincouncil.app/#/privacy

## License

This source is published under the **Business Source License 1.1** (BSL 1.1). See [LICENSE](./LICENSE) for full terms. In short:

- You may **view, install, audit, and use** the extension for non-production and personal use
- You may **not** use the source to offer a competing commercial service
- On 2030-04-22, this source automatically converts to Apache 2.0

If you're a security researcher, academic, or prospective customer/investor evaluating the code for diligence purposes, you're explicitly permitted to do so under this license.

## Questions / feedback

- Product & alpha access: https://joincouncil.app
- Security disclosures: please open a private security advisory on this repo's Security tab

---

*Council is built and maintained by Brian Collard.*
