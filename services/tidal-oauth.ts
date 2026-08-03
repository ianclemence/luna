import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchTidalWithFallback } from './tidal-net';

const TIDAL_CLIENT_ID = 'txNoH4kkV41MfH25';
const TIDAL_CLIENT_SECRET = 'dQjy0MinCEvxi1O4UmxvxWnDjt4cgHBPw8ll6nYBk98=';

const TIDAL_AUTH_URL = 'https://login.tidal.com/authorize';
const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';

const STORAGE_KEYS = {
  TIDAL_REFRESH_TOKEN: 'luna-tidal-refresh-token',
  TIDAL_ACCESS_TOKEN: 'luna-tidal-access-token',
  TIDAL_TOKEN_EXPIRY: 'luna-tidal-token-expiry',
  TIDAL_USER: 'luna-tidal-user',
};

export interface TidalUser {
  id: number;
  username: string;
  email: string;
  countryCode: string;
  subscription?: {
    type: string;
    status: string;
  };
}

export interface TidalAuthState {
  isAuthenticated: boolean;
  user: TidalUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number;
}

// ─── PKCE Helpers ────────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    array[i] = Math.floor(Math.random() * chars.length);
  }
  return Array.from(array, (byte) => chars[byte]).join('');
}

async function sha256(plain: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    plain,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return hash;
}

function base64UrlEncode(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCEChallenge() {
  const codeVerifier = generateRandomString(64);
  const digest = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(digest);
  return { codeVerifier, codeChallenge };
}

// ─── Token Exchange ──────────────────────────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const params = new URLSearchParams({
    client_id: TIDAL_CLIENT_ID,
    client_secret: TIDAL_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  const response = await fetchTidalWithFallback(TIDAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const params = new URLSearchParams({
    client_id: TIDAL_CLIENT_ID,
    client_secret: TIDAL_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'playback user.read collection.read',
  });

  const response = await fetchTidalWithFallback(TIDAL_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`)}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

async function fetchTidalUser(accessToken: string): Promise<TidalUser> {
  const response = await fetchTidalWithFallback(
    'https://api.tidal.com/v1/users/me?countryCode=US',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.status}`);
  }

  return response.json();
}

// ─── Auth Manager ────────────────────────────────────────────────────────────

class TidalAuthManager {
  private state: TidalAuthState = {
    isAuthenticated: false,
    user: null,
    accessToken: null,
    refreshToken: null,
    tokenExpiry: 0,
  };
  private refreshPromise: Promise<string | null> | null = null;

  getState(): TidalAuthState {
    return { ...this.state };
  }

  async initialize(): Promise<void> {
    try {
      const [refreshToken, accessToken, expiryStr, userStr] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.TIDAL_REFRESH_TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.TIDAL_ACCESS_TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.TIDAL_TOKEN_EXPIRY),
        AsyncStorage.getItem(STORAGE_KEYS.TIDAL_USER),
      ]);

      if (refreshToken) this.state.refreshToken = refreshToken;
      if (accessToken) this.state.accessToken = accessToken;
      if (expiryStr) this.state.tokenExpiry = parseInt(expiryStr, 10);
      if (userStr) this.state.user = JSON.parse(userStr);

      this.state.isAuthenticated = !!refreshToken;

      // Refresh if token expired
      if (this.state.isAuthenticated && (!accessToken || Date.now() >= this.state.tokenExpiry)) {
        await this.getAccessToken();
      }
    } catch (e) {
      console.warn('[TidalAuth] Failed to initialize:', e);
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (this.state.accessToken && Date.now() < this.state.tokenExpiry) {
      return this.state.accessToken;
    }

    if (!this.state.refreshToken) return null;

    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const result = await refreshAccessToken(this.state.refreshToken!);
        this.state.accessToken = result.accessToken;
        this.state.refreshToken = result.refreshToken;
        this.state.tokenExpiry = Date.now() + (result.expiresIn - 60) * 1000;

        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.TIDAL_ACCESS_TOKEN, result.accessToken),
          AsyncStorage.setItem(STORAGE_KEYS.TIDAL_REFRESH_TOKEN, result.refreshToken),
          AsyncStorage.setItem(STORAGE_KEYS.TIDAL_TOKEN_EXPIRY, this.state.tokenExpiry.toString()),
        ]);

        return result.accessToken;
      } catch (e) {
        console.error('[TidalAuth] Token refresh failed:', e);
        await this.logout();
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Start Tidal OAuth login flow.
   * Opens browser for user login, waits for callback, exchanges code for tokens.
   */
  async login(): Promise<boolean> {
    try {
      const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
      const redirectUri = Linking.createURL('tidal-callback');

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: TIDAL_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'playback user.read collection.read',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        state: generateRandomString(32),
      });

      const authUrl = `${TIDAL_AUTH_URL}?${params.toString()}`;

      // Open browser for login
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type !== 'success') {
        console.log('[TidalAuth] Login cancelled by user');
        return false;
      }

      // Extract code from callback URL
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUri);
      const user = await fetchTidalUser(tokens.accessToken);

      this.state = {
        isAuthenticated: true,
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: Date.now() + (tokens.expiresIn - 60) * 1000,
      };

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.TIDAL_REFRESH_TOKEN, tokens.refreshToken),
        AsyncStorage.setItem(STORAGE_KEYS.TIDAL_ACCESS_TOKEN, tokens.accessToken),
        AsyncStorage.setItem(STORAGE_KEYS.TIDAL_TOKEN_EXPIRY, this.state.tokenExpiry.toString()),
        AsyncStorage.setItem(STORAGE_KEYS.TIDAL_USER, JSON.stringify(user)),
      ]);

      console.log(`[TidalAuth] Logged in as ${user.username} (${user.countryCode})`);
      return true;
    } catch (e) {
      console.error('[TidalAuth] Login failed:', e);
      return false;
    }
  }

  async logout(): Promise<void> {
    this.state = {
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: 0,
    };

    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.TIDAL_REFRESH_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEYS.TIDAL_ACCESS_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEYS.TIDAL_TOKEN_EXPIRY),
      AsyncStorage.removeItem(STORAGE_KEYS.TIDAL_USER),
    ]);

    console.log('[TidalAuth] Logged out');
  }
}

export const tidalAuth = new TidalAuthManager();
