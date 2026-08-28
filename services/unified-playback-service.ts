/**
 * unified-playback-service.ts
 *
 * Faithful port of Monochrome's Unified Playback API (`music-api.geeked.wtf`).
 * Monochrome's web app resolves Amazon Music ("amz"/"mono"), Mono, Qobuz and
 * Tidal all through a single envelope endpoint: `/api/v2/track/`. This replaces
 * the legacy `amz.geeked.wtf` and `track-api.monochrome.tf` services that Luna
 * previously pointed at.
 *
 * Reference implementation: D:\laragon\www\monochrome\js\api.js
 *   - getStreamUrl()                 (the stream cascade)
 *   - fetchUnifiedPlaybackEnvelope() (~line 2571)
 *   - getUnifiedPlaybackStreamUrl()  (~line 2724)
 *   - getAmazonDecryptionKey()       (~line 1997)
 *   - unifiedPlaybackSettings        (js/storage.js ~line 3169)
 *
 * NOTE: The web app exchanges a Cloudflare Turnstile token for an upgrade JWT
 * (getUnifiedTurnstileJwt). React Native cannot solve the browser challenge, so
 * Luna relies on the default/bearer API token (and, when provided, a stored
 * Turnstile JWT). Amazon CENC decryption is handled by amazon-crypto.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { decryptStream } from './amazon-crypto';
import { BROWSER_USER_AGENT, turnstileService } from './turnstile-service';
import { Track } from './types';

const ENABLED_KEY = 'unified-playback-enabled';
const API_BASE_URL_KEY = 'unified-playback-api-base-url';
const API_TOKEN_KEY = 'unified-playback-api-token';
const RATE_LIMITED_UNTIL_KEY = 'unified-playback-rate-limited-until';
const AUTH_BLOCKED_UNTIL_KEY = 'unified-playback-auth-blocked-until';
const REQUEST_TIMEOUT = 20000;
const RATE_LIMIT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const AUTH_BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Matches Monochrome's current default (web js/storage.js:3173). The legacy
// endpoints (amz.geeked.wtf, track-api.monochrome.tf, mono.geeked.wtf) are now
// only accepted if the user explicitly stores them (mirrors LEGACY_API_BASE_URLS).
const DEFAULT_API_BASE_URL = 'https://music-api.geeked.wtf';
const LEGACY_API_BASE_URLS = [
  'https://amz.geeked.wtf',
  'https://track-api.monochrome.tf',
  'https://mono.geeked.wtf',
];
const DEFAULT_API_TOKEN = 'amp_29b2lIr4mze4tK-P8QDOxfMZ9anCgJ9_uGTUks3nIyo';

const QUALITY_TOKENS: Record<string, string[]> = {
  DOLBY_ATMOS: ['DOLBY_ATMOS', 'ATMOS', 'EAC3_JOC'],
  HI_RES_LOSSLESS: [
    'HI_RES_LOSSLESS',
    'HIRES_LOSSLESS',
    'HIRESLOSSLESS',
    'HIFI_PLUS',
    'HI_RES_FLAC',
    'HI_RES',
    'HIRES',
    'MASTER',
    'MASTER_QUALITY',
    'MQA',
    'UHD',
    'ULTRAHD',
  ],
  LOSSLESS: ['LOSSLESS', 'HIFI', 'HD'],
  HIGH: ['HIGH', 'HIGH_QUALITY', 'SD', 'SD_HIGH', 'SD_MEDIUM'],
  LOW: ['LOW', 'LOW_QUALITY', 'LD', 'SD_LOW'],
};

export interface UnifiedPlaybackSettings {
  enabled: boolean;
  apiBaseUrl: string;
  apiToken: string;
}

export interface UnifiedPlaybackResult {
  url: string;
  sourceUrl: string;
  provider: string;
  quality: string;
  mimeType: string | null;
  decryptionKey?: string | null;
  keyId?: string | null;
  codec?: string | null;
  mediaMimeType?: string | null;
  isManifest?: boolean;
  programLoudness?: number;
  peakAmplitude?: number;
}

// ─── Settings (AsyncStorage-backed, mirroring web unifiedPlaybackSettings) ──

function normalizeQualityToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const token = String(value).trim().toUpperCase();
  for (const [quality, aliases] of Object.entries(QUALITY_TOKENS)) {
    if (aliases.includes(token)) return quality;
  }
  return null;
}

async function getIsEnabled(): Promise<boolean> {
  try {
    const value =
      (await AsyncStorage.getItem(ENABLED_KEY)) ?? (await AsyncStorage.getItem('amazon-music-enabled'));
    return value !== 'false';
  } catch {
    return true;
  }
}

async function getApiBaseUrl(): Promise<string> {
  try {
    const stored =
      (await AsyncStorage.getItem(API_BASE_URL_KEY)) ??
      (await AsyncStorage.getItem('amazon-music-api-base-url'));
    if (stored) {
      const clean = stored.replace(/\/+$/, '');
      if (!LEGACY_API_BASE_URLS.includes(clean)) return clean;
    }
    return DEFAULT_API_BASE_URL;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

async function getApiToken(): Promise<string> {
  try {
    return (
      (await AsyncStorage.getItem(API_TOKEN_KEY)) ??
      (await AsyncStorage.getItem('amazon-music-turnstile-bypass-token')) ??
      DEFAULT_API_TOKEN
    );
  } catch {
    return DEFAULT_API_TOKEN;
  }
}

let rateLimitedUntilCache = 0;
let authBlockedUntilCache = 0;

async function getRateLimitedUntil(): Promise<number> {
  if (rateLimitedUntilCache > 0) return rateLimitedUntilCache;
  try {
    const val = await AsyncStorage.getItem(RATE_LIMITED_UNTIL_KEY);
    rateLimitedUntilCache = val ? parseInt(val, 10) : 0;
    return rateLimitedUntilCache;
  } catch {
    return 0;
  }
}

async function isRateLimited(): Promise<boolean> {
  return Date.now() < (await getRateLimitedUntil());
}

async function setRateLimited(retryAfterSeconds?: number | string | null): Promise<void> {
  const parsed = Number(retryAfterSeconds);
  const until =
    Date.now() + (Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : RATE_LIMIT_DURATION_MS);
  rateLimitedUntilCache = until;
  try {
    await AsyncStorage.setItem(RATE_LIMITED_UNTIL_KEY, String(until));
  } catch {}
  console.warn(`[UnifiedPlayback] Rate limited until ${new Date(until).toISOString()}`);
}

async function clearRateLimited(): Promise<void> {
  rateLimitedUntilCache = 0;
  try {
    await AsyncStorage.removeItem(RATE_LIMITED_UNTIL_KEY);
  } catch {}
}

async function getAuthBlockedUntil(): Promise<number> {
  if (authBlockedUntilCache > 0) return authBlockedUntilCache;
  try {
    const val = await AsyncStorage.getItem(AUTH_BLOCKED_UNTIL_KEY);
    authBlockedUntilCache = val ? parseInt(val, 10) : 0;
    return authBlockedUntilCache;
  } catch {
    return 0;
  }
}

async function isAuthBlocked(): Promise<boolean> {
  return Date.now() < (await getAuthBlockedUntil());
}

async function setAuthBlocked(retryAfterMs: number = AUTH_BLOCK_DURATION_MS): Promise<void> {
  const until = Date.now() + retryAfterMs;
  authBlockedUntilCache = until;
  try {
    await AsyncStorage.setItem(AUTH_BLOCKED_UNTIL_KEY, String(until));
  } catch {}
}

async function clearAuthBlocked(): Promise<void> {
  authBlockedUntilCache = 0;
  try {
    await AsyncStorage.removeItem(AUTH_BLOCKED_UNTIL_KEY);
  } catch {}
}

// ─── Public settings API ─────────────────────────────────────────────────────

export async function getUnifiedPlaybackSettings(): Promise<UnifiedPlaybackSettings> {
  return {
    enabled: await getIsEnabled(),
    apiBaseUrl: await getApiBaseUrl(),
    apiToken: await getApiToken(),
  };
}

export async function setUnifiedPlaybackEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {}
  await clearAuthBlocked();
  await clearRateLimited();
}

export async function setUnifiedPlaybackApiBaseUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(API_BASE_URL_KEY, url?.trim() || DEFAULT_API_BASE_URL);
  } catch {}
  await clearAuthBlocked();
  await clearRateLimited();
}

export async function setUnifiedPlaybackApiToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(API_TOKEN_KEY, token?.trim() || '');
  } catch {}
  await clearAuthBlocked();
  await clearRateLimited();
}

// ─── Metadata helpers (matching Monochrome getAmazonTrack*) ──────────────────

interface UnifiedTrackMetadata {
  title: string;
  name?: string;
  version?: string;
  artist: string | { name: string } | ({ name?: string; title?: string } | string)[] | null;
  album?: string | { title?: string; name?: string } | null;
  isrc?: string | null;
  duration?: number;
}

function getTrackTitle(track: UnifiedTrackMetadata): string {
  const title = String(track?.title || track?.name || '').trim();
  const version = String(track?.version || '').trim();
  return title && version ? `${title} (${version})` : title;
}

function getTrackArtist(track: UnifiedTrackMetadata): string {
  if (Array.isArray(track?.artist)) {
    const names = track.artist
      .map((a) => (typeof a === 'string' ? a : a?.name || a?.title || ''))
      .map((n) => String(n).trim())
      .filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  if (typeof track?.artist === 'string') return track.artist.trim();
  if (track?.artist && typeof track.artist === 'object' && 'name' in track.artist) {
    return String(track.artist.name || '').trim();
  }
  return '';
}

function getTrackAlbum(track: UnifiedTrackMetadata): string {
  if (typeof track?.album === 'string') return track.album.trim();
  if (track?.album && typeof track.album === 'object') {
    return String(track.album.title || track.album.name || '').trim();
  }
  return '';
}

function getTrackDurationSeconds(track: UnifiedTrackMetadata): number | null {
  const duration = Number(track?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration > 10000 ? duration / 1000 : duration;
}

function buildLookupParams(track: UnifiedTrackMetadata, quality: string | null): URLSearchParams {
  const title = getTrackTitle(track);
  if (!title) {
    throw new Error('Unified Playback lookup requires a track title');
  }

  const params = new URLSearchParams({ track: title });
  const artist = getTrackArtist(track);
  const album = getTrackAlbum(track);
  const isrc = String(track?.isrc || '').trim().toUpperCase();
  const duration = getTrackDurationSeconds(track);

  if (artist) params.set('artist', artist);
  if (album) params.set('album', album);
  if (isrc) params.set('isrc', isrc);
  if (duration) params.set('duration', String(Math.round(duration)));
  params.set('intent', 'stream');

  const canonicalQuality = normalizeQualityToken(quality) || quality;
  if (canonicalQuality && canonicalQuality !== 'auto' && canonicalQuality !== 'ADAPTIVE') {
    params.set('quality', canonicalQuality);
  } else {
    params.set('quality', 'HI_RES_LOSSLESS');
  }

  return params;
}

// ─── Endpoint fetch (matching fetchUnifiedPlaybackEnvelope) ─────────────────

interface EnvelopeResource {
  url?: string;
  kind?: string;
  delivery?: string;
  source?: string;
  quality?: string;
  codec?: string;
  mime_type?: string;
  container?: string;
  lossless?: boolean | null;
  id?: string;
  [key: string]: unknown;
}

interface PlaybackEnvelope {
  schema_version?: string;
  playback?: EnvelopeResource[];
  selected_source?: string;
  quality_requested?: string;
  track?: { id?: string; duration_ms?: number };
  sources?: unknown;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchEnvelope(
  track: UnifiedTrackMetadata,
  quality: string | null,
): Promise<PlaybackEnvelope | null> {
  if (!(await getIsEnabled()) || (await isRateLimited()) || (await isAuthBlocked())) return null;

  const apiBaseUrl = (await getApiBaseUrl()).replace(/\/+$/, '');
  const apiToken = (await getApiToken()).trim();
  if (!apiToken) return null;

  const params = buildLookupParams(track, quality);

  for (let attempt = 0; attempt < 2; attempt++) {
    let turnstileJwt: string | null = null;
    if (attempt > 0) {
      // Force a fresh Turnstile challenge on retry
      turnstileJwt = await turnstileService.getJwt(apiBaseUrl, apiToken, true).catch(() => null);
    } else {
      // Use cached JWT if available, otherwise try to solve a challenge
      turnstileJwt = await turnstileService.getJwt(apiBaseUrl, apiToken).catch(() => null);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
      // Must match the UA used during the Turnstile exchange so the JWT
      // fingerprint check (if any) stays consistent.
      'User-Agent': BROWSER_USER_AGENT,
    };
    if (turnstileJwt) headers['X-Turnstile-JWT'] = turnstileJwt;

    let response: Response;
    try {
      response = await fetchWithTimeout(`${apiBaseUrl}/api/v2/track/?${params.toString()}`, {
        headers,
        method: 'GET',
      });
    } catch (error) {
      console.warn('[UnifiedPlayback] Request failed:', error);
      return null;
    }

    let envelope: PlaybackEnvelope | null = null;
    try {
      envelope = await response.json();
    } catch {}

    if ((response.status === 401 || response.status === 428) && attempt === 0) {
      await turnstileService.clearJwt();
      continue;
    }
    if (response.status === 429) {
      await setRateLimited(response.headers?.get?.('Retry-After'));
      return null;
    }
    if (response.status === 404 || response.status === 502) {
      console.warn('[UnifiedPlayback] Could not resolve the track:', envelope?.sources || envelope);
      return null;
    }
    if (response.status === 401 || response.status === 403 || response.status === 428) {
      await turnstileService.clearJwt();
      await setAuthBlocked();
      console.warn(`[UnifiedPlayback] Authorization failed: ${response.status}`);
      return null;
    }
    if (!response.ok) {
      console.warn(`[UnifiedPlayback] API failed: ${response.status}`);
      return null;
    }

    const schemaMajor = String(envelope?.schema_version || '').split('.')[0];
    if (schemaMajor !== '1' && schemaMajor !== '2') {
      console.warn('[UnifiedPlayback] Unsupported schema version:', envelope?.schema_version || 'missing');
      return null;
    }
    if (!envelope || !Array.isArray(envelope.playback) || envelope.playback.length === 0) {
      console.warn('[UnifiedPlayback] No playable resources:', envelope?.sources || envelope);
      return null;
    }
    return envelope;
  }
  return null;
}

function selectResource(envelope: PlaybackEnvelope): EnvelopeResource | null {
  if (!Array.isArray(envelope?.playback)) return null;
  return (
    envelope.playback.find(
      (resource: EnvelopeResource) =>
        resource &&
        typeof resource.url === 'string' &&
        !!resource.url &&
        (resource.kind === 'audio' || resource.kind === 'manifest') &&
        (resource.delivery === 'direct' || resource.delivery === 'dash' || resource.delivery === 'hls'),
    ) || null
  );
}

function getDecryptionKey(resource: EnvelopeResource): string | null {
  const r = resource as Record<string, any>;
  return (
    r?.decryption_key ||
    r?.decryptionKey ||
    r?.encryption?.key?.value ||
    r?.decryption?.key?.value ||
    r?.decryption?.key ||
    r?.drm?.decryption_key ||
    r?.drm?.decryptionKey ||
    null
  );
}

function getKeyId(resource: EnvelopeResource): string | null {
  const r = resource as Record<string, any>;
  return (
    r?.encryption?.key_id ||
    r?.encryption?.keyId ||
    r?.encryption?.key?.id ||
    r?.key_id ||
    r?.keyId ||
    null
  );
}

function getCodec(resource: EnvelopeResource): string | null {
  const source = String(resource?.source || '').toLowerCase();
  const quality = String(resource?.quality || '').toUpperCase();
  if (source === 'amazon' && /^(UHD|HD|HI_RES_LOSSLESS|LOSSLESS)(_|$)/.test(quality)) return 'flac';
  if (source === 'amazon' && /^(SD|HIGH|LOW)(_|$)/.test(quality)) return 'opus';
  return String(resource?.codec || '').toLowerCase() || null;
}

function isManifestResource(resource: EnvelopeResource): boolean {
  return (
    resource.kind === 'manifest' ||
    resource.delivery === 'dash' ||
    resource.delivery === 'hls' ||
    !!(
      resource.mime_type &&
      (String(resource.mime_type).includes('dash') || String(resource.mime_type).includes('mpegurl'))
    ) ||
    (typeof resource.url === 'string' &&
      (resource.url.includes('.mpd') ||
        resource.url.includes('.m3u8') ||
        resource.url.startsWith('data:application/dash+xml')))
  );
}

/** ReplayGain loudness data, mirroring Monochrome's getUnifiedPlaybackReplayGain. */
function getReplayGain(resource: EnvelopeResource): { programLoudness: number; peakAmplitude: number } | null {
  const r = resource as Record<string, any>;
  const rg = r?.replay_gain || r?.replayGain || null;
  const programLoudness = rg?.program_loudness_lufs ?? r?.program_loudness_lufs ?? null;
  const peakAmplitude = rg?.peak_amplitude_db ?? r?.peak_amplitude_db ?? null;
  if (programLoudness == null && peakAmplitude == null) return null;
  return {
    programLoudness: typeof programLoudness === 'number' ? programLoudness : parseFloat(programLoudness) || 0,
    peakAmplitude: typeof peakAmplitude === 'number' ? peakAmplitude : parseFloat(peakAmplitude) || 0,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve a playback URL from the Unified Playback API for the given track.
 * Mirrors Monochrome's getUnifiedPlaybackStreamUrl: selects the best resource,
 * maps the source (mono/amazon/qobuz/tidal) to a provider, and — for Amazon
 * CENC-encrypted FLAC — downloads + decrypts to a local file, matching the
 * existing Luna amazon-crypto path.
 */
export async function getUnifiedPlaybackStreamUrl(
  input: Track | UnifiedTrackMetadata,
  quality: string = 'HI_RES_LOSSLESS',
): Promise<UnifiedPlaybackResult | null> {
  try {
    const track: UnifiedTrackMetadata = {
      title: (input as any)?.title || (input as any)?.name || '',
      name: (input as any)?.title || (input as any)?.name || '',
      version: (input as any)?.version,
      artist: (input as any)?.artist || (input as any)?.artists || null,
      album: (input as any)?.album,
      isrc: (input as any)?.isrc,
      duration: (input as any)?.duration,
    };

    const canonicalQuality = normalizeQualityToken(quality) || quality || 'HI_RES_LOSSLESS';
    const envelope = await fetchEnvelope(track, canonicalQuality);
    if (!envelope) return null;

    const resource = selectResource(envelope);
    if (!resource) {
      console.warn('[UnifiedPlayback] No supported resource');
      return null;
    }

    await clearAuthBlocked();
    await clearRateLimited();

    const url = resource.url as string;
    const rawSource = String(resource?.source || envelope?.selected_source || '').toLowerCase();

    let provider: string;
    switch (rawSource) {
      case 'mono':
        provider = 'monochrome';
        break;
      case 'amazon':
        provider = 'amazon';
        break;
      case 'tidal':
        provider = 'tidal';
        break;
      case 'qobuz':
        provider = 'qobuz';
        break;
      default:
        provider = rawSource || 'amazon';
    }

    const baseMimeType = String(resource?.mime_type || '');
    const manifest = isManifestResource(resource);
    const codec = getCodec(resource);
    const decryptionKey = getDecryptionKey(resource);
    const keyId = getKeyId(resource);
    const replayGain = getReplayGain(resource);
    const mimeType = manifest
      ? 'application/dash+xml'
      : baseMimeType || (provider === 'monochrome' ? 'audio/flac' : 'audio/mp4');

    const baseResult: UnifiedPlaybackResult = {
      url,
      sourceUrl: url,
      provider,
      quality: String(resource?.quality || envelope?.quality_requested || canonicalQuality),
      mimeType,
      mediaMimeType: mimeType,
      codec,
      isManifest: manifest,
      decryptionKey: decryptionKey || undefined,
      keyId: keyId || undefined,
      programLoudness: replayGain?.programLoudness,
      peakAmplitude: replayGain?.peakAmplitude,
    };

    // Mono / direct source: return the URL as-is (single-use URL).
    if (rawSource === 'mono' || rawSource === 'monochrome') {
      return baseResult;
    }

    // Amazon CENC-encrypted FLAC: download + decrypt to a local file.
    if (provider === 'amazon' && decryptionKey) {
      const decrypted = await decryptStream(url, decryptionKey, keyId, codec);
      if (decrypted) {
        console.log('[UnifiedPlayback] Decrypted Amazon stream to local file');
        return { ...baseResult, url: decrypted, sourceUrl: url };
      }
    }

    return baseResult;
  } catch (error: any) {
    console.warn('[UnifiedPlayback] failed:', error?.message);
    return null;
  }
}
