/**
 * SuperAI class -- wraps the browser's experimental on-device AI APIs
 * (Gemini Nano Rewriter API, LanguageModel / Prompt API, LanguageDetector).
 *
 * Provides local AI features (prompt rewrite, language detection, prompt
 * completion) without sending data to a remote server.
 *
 * Original source: superAI.js (402 lines)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Minimal type shims for the experimental chrome AI APIs.
// These are not yet in @types/chrome.
// ---------------------------------------------------------------------------

type RewriteTone = 'as-is' | 'more-formal' | 'more-casual';
type RewriteLength = 'as-is' | 'shorter' | 'longer';

interface RewriteOptions {
  context?: string;
  tone?: RewriteTone;
  length?: RewriteLength;
}

interface DownloadProgressEvent {
  loaded: number;
  total: number;
}

interface DownloadProgressTarget {
  addEventListener(event: 'downloadprogress', cb: (e: DownloadProgressEvent) => void): void;
}

interface PromptCreateOptions {
  temperature?: number;
  topK?: number;
  expectedInputs?: Array<{ type: string; languages: string[] }>;
  expectedOutputs?: Array<{ type: string; languages: string[] }>;
  initialPrompts?: unknown[];
  systemPrompt?: string;
  signal?: AbortSignal;
  monitor?: (target: DownloadProgressTarget) => void;
}

interface PromptMessage {
  role?: string;
  content?: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface SuccessResult {
  ok: true;
  text: string;
  meta: Record<string, unknown>;
}

interface ErrorResult {
  ok: false;
  error: string;
  meta?: Record<string, unknown>;
}

interface StreamResult {
  ok: true;
  stream: ReadableStream;
  meta: Record<string, unknown>;
}

interface AppendResult {
  ok: true;
}

interface ParamsResult {
  ok: true;
  params: unknown;
}

type AIResult = SuccessResult | ErrorResult;
type AIStreamResult = StreamResult | ErrorResult;
type AIAppendResult = AppendResult | ErrorResult;
type AIParamsResult = ParamsResult | ErrorResult;

// ---------------------------------------------------------------------------
// SuperAI
// ---------------------------------------------------------------------------

export class SuperAI {
  // -- Rewriter session state --
  private _rewriteSession: any = null;
  private _rewriteCreating: Promise<any> | null = null;
  private _rewriteAvailability: string = 'unknown';
  private _rewriteDownloadProgress: Record<string, number> | null = null;
  private _rewriteLastUsedAt = 0;

  // -- Prompt session state --
  private _promptSession: any = null;
  private _promptCreating: Promise<any> | null = null;
  private _promptAvailability: string = 'unknown';
  private _promptDownloadProgress: Record<string, number> | null = null;
  private _promptLastUsedAt = 0;
  private _promptCreateSignature: string | null = null;

  // 5-minute session TTL
  private readonly _SESSION_TTL_MS = 5 * 60 * 1_000;

  // ===========================================================================
  // Rewriter API
  // ===========================================================================

  isRewriteSupported(): boolean {
    return typeof self !== 'undefined' && 'Rewriter' in self;
  }

  async rewriteAvailability(): Promise<string> {
    if (!this.isRewriteSupported()) return 'unsupported';
    try {
      this._rewriteAvailability = await (self as any).Rewriter.availability();
      return this._rewriteAvailability;
    } catch (e) {
      console.warn({ where: 'SuperAI.rewriteAvailability', error: String(e) });
      return 'unavailable';
    }
  }

  async rewrite({
    text,
    context = '',
    tone = 'as-is',
    length = 'as-is',
    forceRefresh = false,
  }: {
    text: string;
    context?: string;
    tone?: string;
    length?: string;
    forceRefresh?: boolean;
  }): Promise<AIResult> {
    try {
      if (!text || typeof text !== 'string' || !text.trim()) {
        return { ok: false, error: 'EMPTY_TEXT' };
      }

      if (!this.isRewriteSupported()) {
        return {
          ok: false,
          error:
            'Prompt Optimizer is only available in Chrome 137+. Go to chrome://flags/#rewriter-api-for-gemini-nano and set to Enabled',
        };
      }

      const availability = await this.rewriteAvailability();
      if (availability === 'unavailable') {
        return { ok: false, error: 'OPTIMIZER_UNAVAILABLE' };
      }

      const session = await this._ensureRewriteSession({ forceRefresh });
      const opts: RewriteOptions = {};
      const normalTone = this._normalizeTone(tone);
      const normalLength = this._normalizeLength(length);

      if (context && typeof context === 'string' && context.trim()) {
        opts.context = context.trim();
      }
      if (normalTone) opts.tone = normalTone;
      if (normalLength) opts.length = normalLength;

      const result = await session.rewrite(text, opts);
      this._rewriteLastUsedAt = Date.now();

      return {
        ok: true,
        text: typeof result === 'string' ? result : String(result),
        meta: {
          availability,
          usedOptions: { tone: normalTone, length: normalLength, hasContext: !!opts.context },
          downloadProgress: this._rewriteDownloadProgress,
        },
      };
    } catch (err) {
      console.warn({ where: 'SuperAI.rewrite', error: String(err) });
      return { ok: false, error: 'REWRITE_FAILED' };
    }
  }

  destroyRewrite(): void {
    try {
      if (this._rewriteSession && typeof this._rewriteSession.destroy === 'function') {
        this._rewriteSession.destroy();
      }
    } catch (e) {
      console.warn({ where: 'SuperAI.destroyRewrite', error: String(e) });
    } finally {
      this._rewriteSession = null;
      this._rewriteCreating = null;
    }
  }

  private async _ensureRewriteSession({ forceRefresh = false } = {}): Promise<any> {
    const isAlive = this._rewriteSession && Date.now() - this._rewriteLastUsedAt < this._SESSION_TTL_MS;

    if (!forceRefresh && isAlive) return this._rewriteSession;

    if (this._rewriteCreating) {
      try {
        return await this._rewriteCreating;
      } catch (e) {
        console.warn({ where: 'SuperAI._ensureRewriteSession', error: String(e) });
      }
    }

    const createOptions = {
      monitor: (target: DownloadProgressTarget) => {
        try {
          target.addEventListener('downloadprogress', (ev) => {
            const percent = Math.round((Number(ev.loaded) || 0) * 100);
            this._rewriteDownloadProgress = {
              loaded: Number(ev.loaded) || 0,
              total: Number(ev.total) || 1,
              percent,
            };
          });
        } catch (e) {
          console.warn({ where: 'SuperAI.rewrite.monitor.setup', error: String(e) });
        }
      },
    };

    this._rewriteCreating = (self as any).Rewriter.create(createOptions)
      .then((session: any) => {
        this._rewriteSession = session;
        this._rewriteLastUsedAt = Date.now();
        this._rewriteCreating = null;
        return session;
      })
      .catch((err: unknown) => {
        this._rewriteCreating = null;
        throw err;
      });

    return this._rewriteCreating;
  }

  private _normalizeTone(tone: string): RewriteTone {
    const t = String(tone || '')
      .trim()
      .toLowerCase();
    if (t === 'more-formal' || t === 'formal') return 'more-formal';
    if (t === 'more-casual' || t === 'casual') return 'more-casual';
    return 'as-is';
  }

  private _normalizeLength(length: string): RewriteLength {
    const l = String(length || '')
      .trim()
      .toLowerCase();
    if (l === 'shorter' || l === 'short') return 'shorter';
    if (l === 'longer' || l === 'long') return 'longer';
    return 'as-is';
  }

  // ===========================================================================
  // Prompt / LanguageModel API
  // ===========================================================================

  isPromptSupported(): boolean {
    if (typeof self === 'undefined') return false;
    return 'LanguageModel' in self || ((self as any).ai && (self as any).ai.languageModel);
  }

  async promptAvailability(opts: PromptCreateOptions = {}): Promise<string> {
    if (!this.isPromptSupported()) return 'unsupported';
    try {
      const ns = this._getLanguageModelNamespace();
      this._promptAvailability = await ns.availability(this._sanitizePromptCreateOptions(opts));
      return this._promptAvailability;
    } catch (e) {
      console.warn({ where: 'SuperAI.promptAvailability', error: String(e) });
      return 'unavailable';
    }
  }

  async prompt({
    prompt,
    createOptions = {},
    promptOptions = {},
    forceRefresh = false,
  }: {
    prompt: string | PromptMessage[];
    createOptions?: PromptCreateOptions;
    promptOptions?: Record<string, unknown>;
    forceRefresh?: boolean;
  }): Promise<AIResult> {
    try {
      const isArray = Array.isArray(prompt);
      const isEmpty = isArray && (!prompt.length || !prompt.some((p) => p && String(p.content || '').trim().length));

      if ((!isArray && (!prompt || !String(prompt).trim())) || isEmpty) {
        return { ok: false, error: 'EMPTY_PROMPT' };
      }

      if (!this.isPromptSupported()) {
        return {
          ok: false,
          error: 'Go to chrome://flags/#prompt-api-for-gemini-nano and set to Enabled',
        };
      }

      const availability = await this.promptAvailability(createOptions);
      if (availability === 'unavailable') {
        return { ok: false, error: 'PROMPT_UNAVAILABLE' };
      }

      const session = await this._ensurePromptSession({ forceRefresh, createOptions });
      const result = await session.prompt(prompt, promptOptions);
      this._promptLastUsedAt = Date.now();

      return {
        ok: true,
        text: typeof result === 'string' ? result : String(result),
        meta: {
          availability,
          usedCreateOptions: this._sanitizePromptCreateOptions(createOptions),
          downloadProgress: this._promptDownloadProgress,
        },
      };
    } catch (err) {
      console.warn({ where: 'SuperAI.prompt', error: String(err) });
      return { ok: false, error: 'PROMPT_FAILED' };
    }
  }

  async promptStreaming({
    prompt,
    createOptions = {},
    promptOptions = {},
    forceRefresh = false,
  }: {
    prompt: string | PromptMessage[];
    createOptions?: PromptCreateOptions;
    promptOptions?: Record<string, unknown>;
    forceRefresh?: boolean;
  }): Promise<AIStreamResult> {
    try {
      const isArray = Array.isArray(prompt);
      const isEmpty = isArray && (!prompt.length || !prompt.some((p) => p && String(p.content || '').trim().length));

      if ((!isArray && (!prompt || !String(prompt).trim())) || isEmpty) {
        return { ok: false, error: 'EMPTY_PROMPT' };
      }

      if (!this.isPromptSupported()) {
        return { ok: false, error: 'PROMPT_UNSUPPORTED' };
      }

      const availability = await this.promptAvailability(createOptions);
      if (availability === 'unavailable') {
        return { ok: false, error: 'PROMPT_UNAVAILABLE' };
      }

      const session = await this._ensurePromptSession({ forceRefresh, createOptions });
      const stream = await session.promptStreaming(prompt, promptOptions);
      this._promptLastUsedAt = Date.now();

      return {
        ok: true,
        stream,
        meta: {
          availability,
          usedCreateOptions: this._sanitizePromptCreateOptions(createOptions),
          downloadProgress: this._promptDownloadProgress,
        },
      };
    } catch (err) {
      console.warn({ where: 'SuperAI.promptStreaming', error: String(err) });
      return { ok: false, error: 'PROMPT_STREAM_FAILED' };
    }
  }

  async append(messages: PromptMessage[] = [], createOptions: PromptCreateOptions = {}): Promise<AIAppendResult> {
    try {
      if (!Array.isArray(messages) || messages.length === 0) {
        return { ok: false, error: 'EMPTY_MESSAGES' };
      }
      if (!this.isPromptSupported()) {
        return { ok: false, error: 'PROMPT_UNSUPPORTED' };
      }

      await this._ensurePromptSession({ forceRefresh: false, createOptions });
      await this._promptSession.append(messages);
      this._promptLastUsedAt = Date.now();
      return { ok: true };
    } catch (err) {
      console.warn({ where: 'SuperAI.append', error: String(err) });
      return { ok: false, error: 'PROMPT_APPEND_FAILED' };
    }
  }

  async promptParams(): Promise<AIParamsResult> {
    try {
      if (!this.isPromptSupported()) {
        return { ok: false, error: 'PROMPT_UNSUPPORTED' };
      }
      return { ok: true, params: await this._getLanguageModelNamespace().params() };
    } catch (err) {
      console.warn({ where: 'SuperAI.promptParams', error: String(err) });
      return { ok: false, error: 'PROMPT_PARAMS_FAILED' };
    }
  }

  destroyPrompt(): void {
    try {
      if (this._promptSession && typeof this._promptSession.destroy === 'function') {
        this._promptSession.destroy();
      }
    } catch (e) {
      console.warn({ where: 'SuperAI.destroyPrompt', error: String(e) });
    } finally {
      this._promptSession = null;
      this._promptCreating = null;
      this._promptCreateSignature = null;
    }
  }

  private async _ensurePromptSession({
    forceRefresh = false,
    createOptions = {},
  }: {
    forceRefresh?: boolean;
    createOptions?: PromptCreateOptions;
  } = {}): Promise<any> {
    const sanitized = this._sanitizePromptCreateOptions(createOptions);
    const signature = JSON.stringify(sanitized);

    const isAlive =
      this._promptSession &&
      Date.now() - this._promptLastUsedAt < this._SESSION_TTL_MS &&
      this._promptCreateSignature === signature;

    if (!forceRefresh && isAlive) return this._promptSession;

    if (this._promptCreating) {
      try {
        return await this._promptCreating;
      } catch (e) {
        console.warn({ where: 'SuperAI._ensurePromptSession', error: String(e) });
      }
    }

    const ns = this._getLanguageModelNamespace();
    const opts: any = {
      ...sanitized,
      monitor: (target: DownloadProgressTarget) => {
        try {
          target.addEventListener('downloadprogress', (ev) => {
            const percent = Math.round((Number(ev.loaded) || 0) * 100);
            this._promptDownloadProgress = {
              loaded: Number(ev.loaded) || 0,
              total: Number(ev.total) || 1,
              percent,
            };
          });
        } catch (e) {
          console.warn({ where: 'SuperAI.prompt.monitor.setup', error: String(e) });
        }
      },
    };

    this._promptCreating = ns
      .create(opts)
      .then((session: any) => {
        this._promptSession = session;
        this._promptCreateSignature = signature;
        this._promptLastUsedAt = Date.now();
        this._promptCreating = null;
        return session;
      })
      .catch((err: unknown) => {
        this._promptCreating = null;
        throw err;
      });

    return this._promptCreating;
  }

  private _getLanguageModelNamespace(): any {
    if (typeof self !== 'undefined' && (self as any).LanguageModel) {
      return (self as any).LanguageModel;
    }
    if (typeof self !== 'undefined' && (self as any).ai?.languageModel) {
      return (self as any).ai.languageModel;
    }
    throw new Error('LanguageModel API not available');
  }

  private _sanitizePromptCreateOptions(opts: PromptCreateOptions = {}): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const { temperature, topK, expectedInputs, expectedOutputs, initialPrompts, systemPrompt, signal } = opts;
    if (typeof temperature === 'number') out.temperature = temperature;
    if (typeof topK === 'number') out.topK = topK;
    if (Array.isArray(expectedInputs)) out.expectedInputs = expectedInputs;
    if (Array.isArray(expectedOutputs)) out.expectedOutputs = expectedOutputs;
    if (Array.isArray(initialPrompts)) out.initialPrompts = initialPrompts;
    if (typeof systemPrompt === 'string' && systemPrompt.trim()) out.systemPrompt = systemPrompt.trim();
    if (signal) out.signal = signal;
    return out;
  }

  // ===========================================================================
  // Language Detection
  // ===========================================================================

  async detectLanguage(text: string): Promise<string | null> {
    if (typeof self === 'undefined' || !('LanguageDetector' in self)) return null;
    try {
      if ((await (self as any).LanguageDetector.availability()) === 'unavailable') return null;
      const detector = await (self as any).LanguageDetector.create();
      const [result] = await detector.detect(String(text).slice(0, 4_000));
      detector.destroy?.();
      return result?.detectedLanguage ?? null;
    } catch {
      return null;
    }
  }

  async promptSameLanguage({
    prompt,
    createOptions = {},
    promptOptions = {},
    forceRefresh = false,
  }: {
    prompt: string | PromptMessage[];
    createOptions?: PromptCreateOptions;
    promptOptions?: Record<string, unknown>;
    forceRefresh?: boolean;
  }): Promise<AIResult> {
    const supportedLanguages = new Set(['en', 'ja', 'es']);
    let textForDetection = prompt;
    if (Array.isArray(prompt)) {
      textForDetection = prompt.map((m) => String(m.content || '')).join('\n');
    }

    const detected = await this.detectLanguage(textForDetection as string);
    const lang = supportedLanguages.has(detected ?? '') ? detected! : 'en';

    return this.prompt({
      prompt,
      createOptions: {
        ...createOptions,
        expectedInputs: [{ type: 'text', languages: ['en', lang] }],
        expectedOutputs: [{ type: 'text', languages: [lang] }],
      },
      promptOptions,
      forceRefresh,
    });
  }

  // ===========================================================================
  // Teardown
  // ===========================================================================

  destroy(): void {
    this.destroyRewrite();
    this.destroyPrompt();
  }
}

/** Singleton shared across the background service worker. */
export const superAI = new SuperAI();
