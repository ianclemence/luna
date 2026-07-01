/**
 * amazon-service.ts
 *
 * Amazon Music streaming integration — exact port of Monochrome's api.js
 * (getAmazonMusicStreamUrl, fetchAmazonTrackApi, buildAmazonTrackLookupParams).
 *
 * Uses the amz.geeked.wtf API proxy to fetch encrypted FLAC streams
 * from Amazon Music's catalog.
 *
 * NOTE: Amazon Music streams are CENC-encrypted FLAC in MP4 containers.
 * In the web app, decryption happens via a Service Worker (sw-decrypter.js).
 * In React Native, we use expo-crypto for AES-CTR decryption.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { decryptStream } from './amazon-crypto';

const AMAZON_API_BASE = 'https://amz.geeked.wtf';
const AMAZON_TIMEOUT = 20000;
const AMAZON_RATE_LIMIT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const AMAZON_RATE_LIMITED_UNTIL_KEY = 'amazon-music-rate-limited-until';

// ─── Quality Mapping ─────────────────────────────────────────────────────────

export function getAmazonQuality(quality: string): string {
  const qualityMap: Record<string, string> = {
    HI_RES_LOSSLESS: 'UHD',
    HI_RES: 'UHD',
    LOSSLESS: 'HD',
    HIGH: 'SD_HIGH',
    LOW: 'SD_LOW',
    NORMAL: 'SD_MEDIUM',
  };
  return qualityMap[quality] || qualityMap[quality.toUpperCase()] || 'HD';
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AmazonStreamResult {
  url: string;
  sourceUrl: string;
  decryptionKey: string | null;
  keyId: string | null;
  quality: string;
  asin: string | null;
  mimeType: string | null;
  replayGain: {
    programLoudness: number;
    peakAmplitude: number;
  } | null;
}

interface TrackMetadata {
  title: string;
  name?: string;
  version?: string;
  artist: string | { name: string };
  artists?: Array<{ name: string; title?: string }> | string[];
  album: string | { title: string; name?: string };
  duration: number;
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

async function getAmazonRateLimitedUntil(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(AMAZON_RATE_LIMITED_UNTIL_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

async function isAmazonRateLimited(): Promise<boolean> {
  const until = await getAmazonRateLimitedUntil();
  return Date.now() < until;
}

async function setAmazonRateLimited(): Promise<void> {
  const until = Date.now() + AMAZON_RATE_LIMIT_DURATION_MS;
  try {
    await AsyncStorage.setItem(AMAZON_RATE_LIMITED_UNTIL_KEY, String(until));
  } catch {}
  console.warn('[Amazon] Rate limited for 30 minutes');
}

// ─── Track Metadata Helpers (matching Monochrome exactly) ────────────────────

function getAmazonTrackTitle(track: TrackMetadata): string {
  const title = String(track?.title || track?.name || '').trim();
  const version = String(track?.version || '').trim();
  return title && version ? `${title} (${version})` : title;
}

function getAmazonTrackArtist(track: TrackMetadata): string {
  if (Array.isArray(track?.artists) && track.artists.length > 0) {
    const artists = track.artists
      .map((artist) => (typeof artist === 'string' ? artist : artist?.name || artist?.title))
      .map((name) => String(name || '').trim())
      .filter(Boolean);
    if (artists.length > 0) return artists.join(', ');
  }
  if (typeof track?.artist === 'string') return track.artist.trim();
  if (track?.artist?.name) return String(track.artist.name).trim();
  return '';
}

function getAmazonTrackAlbum(track: TrackMetadata): string {
  if (typeof track?.album === 'string') return track.album.trim();
  return String(track?.album?.title || track?.album?.name || '').trim();
}

function getAmazonTrackDuration(track: TrackMetadata): number | null {
  const duration = Number(track?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  // Monochrome: if duration > 10000, it's in milliseconds — convert to seconds
  return duration > 10000 ? duration / 1000 : duration;
}

function buildAmazonTrackLookupParams(track: TrackMetadata, amazonQuality: string): URLSearchParams {
  const title = getAmazonTrackTitle(track);
  const artist = getAmazonTrackArtist(track);
  const album = getAmazonTrackAlbum(track);
  const duration = getAmazonTrackDuration(track);

  if (!title || !artist) {
    throw new Error('Amazon Music lookup requires a track title and artist');
  }

  const params = new URLSearchParams({
    track: title,
    duration: duration != null ? String(Math.round(duration)) : '',
    album,
    artist,
  });

  if (amazonQuality) {
    params.set('quality', amazonQuality);
  }

  return params;
}

// ─── Bypass Token / Turnstile ────────────────────────────────────────────────

const AMAZON_BYPASS_TOKEN_KEY = 'amazon-music-turnstile-bypass-token';
const AMAZON_TURNSTILE_JWT_KEY = 'amazon_turnstile_jwt';
const AMAZON_TURNSTILE_EXPIRY_KEY = 'amazon_turnstile_expiry';

async function getAmazonBypassToken(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(AMAZON_BYPASS_TOKEN_KEY)) || '';
  } catch {
    return '';
  }
}

async function getAmazonTurnstileJwt(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh) {
    try {
      const jwt = await AsyncStorage.getItem(AMAZON_TURNSTILE_JWT_KEY);
      const expiry = await AsyncStorage.getItem(AMAZON_TURNSTILE_EXPIRY_KEY);
      if (jwt && expiry && Date.now() < parseInt(expiry, 10)) {
        return jwt;
      }
    } catch {}
  }

  // In React Native, we can't solve Turnstile in a browser.
  // Return null — the caller will get 428 and skip Amazon.
  // To use Amazon Music, the user must provide a bypass token in settings.
  return null;
}

async function clearAmazonTurnstileJwt(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AMAZON_TURNSTILE_JWT_KEY);
    await AsyncStorage.removeItem(AMAZON_TURNSTILE_EXPIRY_KEY);
  } catch {}
}

// ─── API Call (matching Monochrome's fetchAmazonTrackApi) ────────────────────

async function fetchAmazonTrackApi(
  track: TrackMetadata,
  amazonQuality: string,
  { forceTurnstile = false } = {},
): Promise<Response | null> {
  const params = buildAmazonTrackLookupParams(track, amazonQuality);
  const headers: Record<string, string> = {};

  const bypassToken = (await getAmazonBypassToken()).trim();

  if (bypassToken && !forceTurnstile) {
    params.set('bypass_token', bypassToken);
  } else {
    const turnstileJwt = await getAmazonTurnstileJwt(forceTurnstile);
    if (!turnstileJwt) {
      return null;
    }
    headers['X-Turnstile-JWT'] = turnstileJwt;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AMAZON_TIMEOUT);

  try {
    const response = await fetch(
      `${AMAZON_API_BASE}/api/track/?${params.toString()}`,
      {
        method: 'GET',
        headers,
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    return response;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.warn('[Amazon] Request timed out');
    } else {
      console.warn('[Amazon] Request failed:', e.message);
    }
    return null;
  }
}

function getAmazonTrackApiPayload(data: any): any {
  if (data?.stream_url) return data;
  if (data?.data?.stream_url) return data.data;
  if (data?.track?.stream_url) return data.track;
  if (data?.result?.stream_url) return data.result;
  return data;
}

// ─── Main Stream Function ────────────────────────────────────────────────────

/**
 * Look up a track on Amazon Music via the community API proxy.
 * Returns stream URL + decryption key for CENC-encrypted FLAC.
 *
 * Exact port of Monochrome's getAmazonMusicStreamUrl().
 */
export async function getAmazonStream(
  track: TrackMetadata,
  quality: string = 'HI_RES_LOSSLESS',
): Promise<AmazonStreamResult | null> {
  try {
    if (await isAmazonRateLimited()) {
      return null;
    }

    const amazonQuality = getAmazonQuality(quality);

    let response = await fetchAmazonTrackApi(track, amazonQuality);
    if (response && (response.status === 401 || response.status === 428)) {
      await clearAmazonTurnstileJwt();
      response = await fetchAmazonTrackApi(track, amazonQuality, { forceTurnstile: true });
    }
    if (!response) return null;

    if (response.status === 403) {
      await setAmazonRateLimited();
      return null;
    }

    if (!response.ok) {
      console.warn(`[Amazon] API returned ${response.status}`);
      return null;
    }

    const rawData = await response.json();
    const data = getAmazonTrackApiPayload(rawData);

    if (!data?.stream_url) {
      console.warn('[Amazon] No stream_url in response:', Object.keys(data));
      return null;
    }

    const decryptionKey =
      data?.decryption_key ||
      data?.decryptionKey ||
      data?.decryption?.key ||
      data?.drm?.decryption_key ||
      data?.drm?.decryptionKey ||
      null;

    return {
      url: data.stream_url,
      sourceUrl: data.stream_url,
      decryptionKey,
      keyId: data.key_id || data.keyId || null,
      quality: data.quality_selected || amazonQuality,
      asin: data.asin || data.id || null,
      mimeType: data.mime_type || null,
      replayGain: data.replay_gain
        ? {
            programLoudness: data.replay_gain.program_loudness_lufs ?? -14,
            peakAmplitude: data.replay_gain.peak_amplitude_db ?? 0,
          }
        : null,
    };
  } catch (e: any) {
    console.warn('[Amazon] Stream failed:', e.message);
    return null;
  }
}

/**
 * Attempt to decrypt a CENC-encrypted Amazon Music FLAC stream.
 * Returns a local file URI pointing to the decrypted audio.
 */
export async function decryptAmazonStream(
  encryptedUrl: string,
  decryptionKey: string,
  keyId: string | null,
): Promise<string | null> {
  try {
    return await decryptStream(encryptedUrl, decryptionKey, keyId);
  } catch (e: any) {
    console.warn('[Amazon] Decryption failed:', e.message);
    return null;
  }
}
