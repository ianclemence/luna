/**
 * turnstile-service.ts
 *
 * Solves Cloudflare Turnstile challenges in React Native by loading a
 * helper page from the Monochrome deployment (monochrome.tf). The helper
 * page renders the Turnstile widget on the whitelisted domain, solves
 * the challenge, and posts the token back via WebView messaging.
 *
 * The solved token is exchanged for a JWT via the Unified Playback API's
 * /api/auth/turnstile endpoint.
 *
 * Reference: D:\laragon\www\monochrome\js\api.js
 *   - loadTurnstile()                 (~line 2041)
 *   - getUnifiedTurnstileResponse()   (~line 2098)
 *   - getUnifiedTurnstileJwt()        (~line 2169)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TURNSTILE_JWT_KEY = 'unified-playback-turnstile-jwt';
const TURNSTILE_EXPIRY_KEY = 'unified-playback-turnstile-expiry';
const TURNSTILE_EXPIRY_LEEWAY_SECONDS = 15;
const TOKEN_EXCHANGE_TIMEOUT = 15000;
const CHALLENGE_TIMEOUT = 35000;

/**
 * The Unified Playback API edge bot-filters non-browser clients with a decoy
 * 400 "Missing cf_turnstile_response." before the challenge is ever verified.
 * Requests must carry a browser-like User-Agent to reach real verification
 * (verified against music-api.geeked.wtf; also send it on /api/v2/track/ so
 * the JWT fingerprint matches the exchange request).
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

export interface TurnstileMessage {
  type: 'token' | 'error' | 'expired' | 'timeout';
  token?: string;
  error?: string;
}

class TurnstileService {
  private jwt: string | null = null;
  private jwtExpiry = 0;
  private exchangePromise: Promise<string | null> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private resetFn: (() => void) | null = null;

  async init(): Promise<void> {
    await this.loadCachedJwt();
    this.scheduleRefresh();
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Get a valid Turnstile JWT. Returns cached JWT if still valid,
   * otherwise triggers a fresh challenge + exchange.
   */
  async getJwt(
    apiBaseUrl: string,
    apiToken: string,
    forceRefresh = false,
  ): Promise<string | null> {
    if (!forceRefresh) {
      const cached = await this.getCachedJwt();
      if (cached) return cached;
    }

    // Deduplicate concurrent exchange requests
    if (this.exchangePromise) return this.exchangePromise;

    this.exchangePromise = this.solveAndExchange(apiBaseUrl, apiToken);
    try {
      return await this.exchangePromise;
    } finally {
      this.exchangePromise = null;
    }
  }

  /**
   * Parse JWT expiry (seconds since epoch) from a JWT string.
   */
  getJwtExpiry(token: string): number {
    try {
      const encoded = token.split('.')[1];
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      return Number(JSON.parse(atob(padded)).exp || 0);
    } catch {
      return 0;
    }
  }

  async clearJwt(): Promise<void> {
    this.jwt = null;
    this.jwtExpiry = 0;
    this.cancelRefresh();
    try {
      await AsyncStorage.removeItem(TURNSTILE_JWT_KEY);
      await AsyncStorage.removeItem(TURNSTILE_EXPIRY_KEY);
    } catch {}
  }

  /**
   * Render a Turnstile challenge in a WebView and return the token.
   * This is called by the React component and passed a ref.
   */
  async solveChallenge(): Promise<string | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, CHALLENGE_TIMEOUT);

      // Store resolver — the React component will call resolveWithToken when done
      this._challengeResolve = (token: string | null) => {
        clearTimeout(timeout);
        resolve(token);
      };
    });
  }

  /**
   * Called by the React component when the Turnstile widget solves.
   */
  private _challengeResolve: ((token: string | null) => void) | null = null;

  resolveChallenge(token: string | null): void {
    if (this._challengeResolve) {
      this._challengeResolve(token);
      this._challengeResolve = null;
    }
  }

  /**
   * Set the reset function from the ReactNativeTurnstile component.
   */
  setResetFn(fn: () => void): void {
    this.resetFn = fn;
  }

  /**
   * Force-reset the Turnstile widget (e.g. on expiry).
   */
  resetWidget(): void {
    if (this.resetFn) this.resetFn();
  }

  /**
   * Handle a message from the Turnstile WebView.
   */
  handleWebViewMessage(message: TurnstileMessage): void {
    switch (message.type) {
      case 'token':
        this.resolveChallenge(message.token || null);
        break;
      case 'error':
        console.warn('[Turnstile] WebView error:', message.error);
        this.resolveChallenge(null);
        break;
      case 'expired':
        console.warn('[Turnstile] Token expired');
        this.resolveChallenge(null);
        break;
      case 'timeout':
        console.warn('[Turnstile] Challenge timed out');
        this.resolveChallenge(null);
        break;
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async solveAndExchange(
    apiBaseUrl: string,
    apiToken: string,
  ): Promise<string | null> {
    // 1. Solve the Turnstile challenge
    const token = await this.solveChallenge();
    if (!token) {
      console.warn('[Turnstile] Failed to solve challenge');
      return null;
    }

    // 2. Exchange token for JWT
    try {
      const url = `${apiBaseUrl.replace(/\/+$/, '')}/api/auth/turnstile`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': BROWSER_USER_AGENT,
        },
        // The FastAPI backend (music-api.geeked.wtf, OpenAPI schema
        // TurnstileVerifyRequest) requires the key `cf_turnstile_response`.
        // The web app's legacy `turnstile_token` key is NOT accepted.
        body: JSON.stringify({ cf_turnstile_response: token }),
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Turnstile] Exchange failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const jwt = String(data.access_token || data.jwt || data.token || '').trim();
      if (!jwt) {
        console.warn('[Turnstile] Exchange returned no JWT');
        return null;
      }

      // 3. Cache the JWT
      const expiry = this.getJwtExpiry(jwt) || Math.floor(Date.now() / 1000) + 60 * 60;
      this.jwt = jwt;
      this.jwtExpiry = expiry;

      try {
        await AsyncStorage.setItem(TURNSTILE_JWT_KEY, jwt);
        await AsyncStorage.setItem(TURNSTILE_EXPIRY_KEY, String(expiry));
      } catch {}

      this.scheduleRefresh();
      console.log('[Turnstile] JWT obtained and cached, expires:', new Date(expiry * 1000).toISOString());
      return jwt;
    } catch (error: any) {
      console.warn('[Turnstile] Exchange error:', error?.message);
      return null;
    }
  }

  private async loadCachedJwt(): Promise<void> {
    try {
      const jwt = await AsyncStorage.getItem(TURNSTILE_JWT_KEY);
      const expiry = Number((await AsyncStorage.getItem(TURNSTILE_EXPIRY_KEY)) || 0);
      if (jwt && expiry > Math.floor(Date.now() / 1000) + TURNSTILE_EXPIRY_LEEWAY_SECONDS) {
        this.jwt = jwt;
        this.jwtExpiry = expiry;
      } else {
        await this.clearJwt();
      }
    } catch {}
  }

  private async getCachedJwt(): Promise<string | null> {
    if (this.jwt && this.jwtExpiry > Math.floor(Date.now() / 1000) + TURNSTILE_EXPIRY_LEEWAY_SECONDS) {
      return this.jwt;
    }
    await this.loadCachedJwt();
    return this.jwt;
  }

  private scheduleRefresh(): void {
    this.cancelRefresh();
    if (!this.jwt || !this.jwtExpiry) return;

    const now = Math.floor(Date.now() / 1000);
    const refreshIn = Math.max(0, (this.jwtExpiry - TURNSTILE_EXPIRY_LEEWAY_SECONDS - now) * 1000);

    if (refreshIn <= 0) {
      // Already expired or about to expire — clear so next getJwt triggers refresh
      this.clearJwt();
      return;
    }

    this.refreshTimer = setTimeout(() => {
      console.log('[Turnstile] JWT nearing expiry, clearing cached value');
      this.clearJwt();
    }, refreshIn);
  }

  private cancelRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  destroy(): void {
    this.cancelRefresh();
  }
}

export const turnstileService = new TurnstileService();
