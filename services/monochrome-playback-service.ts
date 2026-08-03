/**
 * monochrome-playback-service.ts
 *
 * Monochrome Playback integration — exact port of Monochrome's api.js
 * (getMonochromePlaybackStreamUrl, setMonochromeRateLimit, session handling).
 *
 * In the web app, the session JWT is obtained by exchanging a Cloudflare
 * Turnstile response at {base}/auth/turnstile. React Native cannot solve the
 * Turnstile browser challenge natively, so instead the user pastes a session
 * token (grabbed from the web app's sessionStorage / DevTools) into settings.
 *
 * Requires a browser-like User-Agent or Cloudflare blocks the request (403/1010).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from './types';

const MONOCHROME_PLAYBACK_ENABLED_KEY = 'monochrome-playback-enabled';
const MONOCHROME_PLAYBACK_API_BASE_URL_KEY = 'monochrome-playback-api-base-url';
const MONOCHROME_PLAYBACK_SESSION_KEY = 'monochrome-playback-session';
const MONOCHROME_PLAYBACK_RATE_LIMITED_UNTIL_KEY = 'monochrome-playback-rate-limited-until';
const DEFAULT_API_BASE_URL = 'https://track-api.monochrome.tf';
const SESSION_EXPIRY_LEEWAY_SECONDS = 15;

// Cloudflare serves the API only to browser-ish user agents (else error 1010).
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 decoder (JWT payloads are small JSON; avoids Buffer/atob deps). */
function decodeBase64(input: string): string {
  const clean = input.replace(/=+$/, '');
  const lookup: Record<string, number> = {};
  for (let i = 0; i < BASE64_CHARS.length; i++) lookup[BASE64_CHARS[i]] = i;
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const value = lookup[clean[i]];
    if (value === undefined) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

export interface MonochromePlaybackSettings {
  enabled: boolean;
  apiBaseUrl: string;
  sessionToken: string;
}

export interface MonochromePlaybackResult {
  url: string;
  trackId: string | null;
  recordingId: string | null;
}

function getJwtExpiry(token: string): number {
  try {
    const encoded = token.split('.')[1];
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Number(JSON.parse(decodeBase64(padded)).exp || 0);
  } catch {
    return 0;
  }
}

// ─── Settings (AsyncStorage-backed, mirroring web's monochromePlaybackSettings) ──

async function isEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MONOCHROME_PLAYBACK_ENABLED_KEY)) !== 'false';
  } catch {
    return true;
  }
}

async function getApiBaseUrl(): Promise<string> {
  try {
    return (
      (await AsyncStorage.getItem(MONOCHROME_PLAYBACK_API_BASE_URL_KEY)) || DEFAULT_API_BASE_URL
    );
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

async function getSessionToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(MONOCHROME_PLAYBACK_SESSION_KEY);
    if (!token || !token.trim()) return null;
    const expiry = getJwtExpiry(token);
    if (expiry <= Math.floor(Date.now() / 1000) + SESSION_EXPIRY_LEEWAY_SECONDS) {
      await clearSessionToken();
      return null;
    }
    return token.trim();
  } catch {
    return null;
  }
}

async function clearSessionToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MONOCHROME_PLAYBACK_SESSION_KEY);
  } catch {}
}

async function getRateLimitedUntil(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(MONOCHROME_PLAYBACK_RATE_LIMITED_UNTIL_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

async function setRateLimited(retryAfterSeconds: number): Promise<void> {
  const until = Date.now() + (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : 30 * 1000);
  try {
    await AsyncStorage.setItem(MONOCHROME_PLAYBACK_RATE_LIMITED_UNTIL_KEY, String(until));
  } catch {}
  console.warn(`[MonochromePlayback] Rate limited until ${new Date(until).toISOString()}`);
}

// ─── Metadata Helpers (matching Monochrome's getAmazonTrack*) ─────────────────

function getTrackTitle(track: Track): string {
  const title = String(track?.title || (track as any)?.name || '').trim();
  const version = String((track as any)?.version || '').trim();
  return title && version ? `${title} (${version})` : title;
}

function getTrackArtist(track: Track): string {
  if (Array.isArray(track?.artists) && track.artists.length > 0) {
    const artists = track.artists
      .map((artist) => (typeof artist === 'string' ? artist : artist?.name || (artist as any)?.title))
      .map((name) => String(name || '').trim())
      .filter(Boolean);
    if (artists.length > 0) return artists.join(', ');
  }
  if (typeof (track as any)?.artist === 'string') return ((track as any).artist as string).trim();
  if (track?.artist?.name) return String(track.artist.name).trim();
  return '';
}

function getTrackDuration(track: Track): number | null {
  const duration = Number(track?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration > 10000 ? duration / 1000 : duration;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getMonochromePlaybackSettings(): Promise<MonochromePlaybackSettings> {
  return {
    enabled: await isEnabled(),
    apiBaseUrl: await getApiBaseUrl(),
    sessionToken: (await getSessionToken()) || '',
  };
}

export async function setMonochromePlaybackEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(MONOCHROME_PLAYBACK_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export async function setMonochromePlaybackApiBaseUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(MONOCHROME_PLAYBACK_API_BASE_URL_KEY, url || DEFAULT_API_BASE_URL);
  } catch {}
}

/** Paste a session JWT (from the web app's sessionStorage) into AsyncStorage. */
export async function setMonochromePlaybackSessionToken(token: string): Promise<void> {
  try {
    const trimmed = (token || '').trim();
    if (trimmed) {
      await AsyncStorage.setItem(MONOCHROME_PLAYBACK_SESSION_KEY, trimmed);
    } else {
      await AsyncStorage.removeItem(MONOCHROME_PLAYBACK_SESSION_KEY);
    }
  } catch {}
}

/**
 * Request a playback URL from Monochrome Playback for the given track.
 * Returns null when disabled, rate limited, missing/expired session, or failure.
 */
export async function getMonochromePlaybackStreamUrl(
  track: Track,
  options: { forceRefresh?: boolean } = {},
): Promise<MonochromePlaybackResult | null> {
  try {
    if (!(await isEnabled())) return null;
    if (Date.now() < (await getRateLimitedUntil())) return null;

    const title = getTrackTitle(track);
    const artist = getTrackArtist(track);
    if (!title || !artist) return null;

    const body: Record<string, unknown> = { song_name: title, artist };
    const isrc = String(track?.isrc || (track as any)?.isrc || '').trim();
    const duration = getTrackDuration(track);
    if (isrc) body.isrc = isrc;
    if (duration) body.duration = Math.round(duration);

    const apiBaseUrl = (await getApiBaseUrl()).replace(/\/+$/, '');

    for (let attempt = 0; attempt < 2; attempt++) {
      let sessionToken = await getSessionToken();
      if (!sessionToken && attempt === 0 && options.forceRefresh) {
        await clearSessionToken();
        continue;
      }
      if (!sessionToken) return null;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}/playback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
            'User-Agent': BROWSER_USER_AGENT,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 401 && attempt === 0) {
        await clearSessionToken();
        continue;
      }
      if (response.status === 429) {
        const retryAfter = response.headers?.get?.('Retry-After');
        await setRateLimited(Number(retryAfter));
        return null;
      }
      if (!response.ok) {
        console.warn(`[MonochromePlayback] request failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (!data?.url) {
        console.warn('[MonochromePlayback] returned no stream URL');
        return null;
      }

      return {
        url: data.url,
        trackId: data.track_id || null,
        recordingId: data.recording_id || null,
      };
    }
    return null;
  } catch (error) {
    console.warn('[MonochromePlayback] failed:', error);
    return null;
  }
}
