/**
 * songlink-service.ts
 *
 * Cross-platform track ID resolver.
 * Primary: SongLink (odesli.co) — api.song.link/v1-alpha.1
 * Spotify fast path: custom resolve proxy — api.zarz.moe/v1/resolve
 * Fallback: IDHS (idonthavespotify.sjdonado.com) — 8 req/min
 *
 * Used to convert Deezer IDs → Tidal IDs for streaming, and
 * Spotify URLs → all platform IDs for playlist import.
 */
import axios from 'axios';
import {
  IDHS_API_BASE,
  SONGLINK_API_BASE,
  SONGLINK_RESOLVE_PROXY,
} from '../constants/api';
import type { TrackAvailability } from './types';

// ─── Rate limiter for IDHS (8 req/min) ──────────────────────────────────────

class RateLimiter {
  private queue: number[] = [];
  private readonly maxPerWindow: number;
  private readonly windowMs: number;

  constructor(maxPerWindow: number, windowMs: number) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    this.queue = this.queue.filter((t) => now - t < this.windowMs);
    if (this.queue.length >= this.maxPerWindow) {
      const waitMs = this.windowMs - (now - this.queue[0]) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.queue.push(Date.now());
  }
}

const idhsLimiter = new RateLimiter(8, 60_000);

// ─── SongLink response parsing ───────────────────────────────────────────────

interface SongLinkPlatformEntry {
  url: string;
}

function extractTidalIdFromUrl(url: string): string | undefined {
  const m = url.match(/tidal\.com\/(?:browse\/)?track\/(\d+)/i);
  return m?.[1];
}

function extractQobuzIdFromUrl(url: string): string | undefined {
  // /track/XXXXXXXX or trackId=XXXXXXXX in query
  let m = url.match(/\/track\/(\d+)/);
  if (m) return m[1];
  m = url.match(/trackId=(\d+)/);
  return m?.[1];
}

function extractDeezerIdFromUrl(url: string): string | undefined {
  const m = url.match(/deezer\.com\/(?:[a-z-]+\/)?track\/(\d+)/i);
  return m?.[1];
}

function extractSpotifyIdFromUrl(url: string): string | undefined {
  const m = url.match(/spotify\.com\/track\/([A-Za-z0-9]+)/);
  return m?.[1];
}

function buildAvailability(
  links: Record<string, SongLinkPlatformEntry>,
): TrackAvailability {
  const result: TrackAvailability = {
    tidal: false, qobuz: false, deezer: false, spotify: false,
  };

  if (links.tidal?.url) {
    result.tidal = true;
    result.tidalUrl = links.tidal.url;
    result.tidalId = extractTidalIdFromUrl(links.tidal.url);
  }
  if (links.qobuz?.url) {
    result.qobuz = true;
    result.qobuzUrl = links.qobuz.url;
    result.qobuzId = extractQobuzIdFromUrl(links.qobuz.url);
  }
  if (links.deezer?.url) {
    result.deezer = true;
    result.deezerUrl = links.deezer.url;
    result.deezerId = extractDeezerIdFromUrl(links.deezer.url);
  }
  if (links.spotify?.url) {
    result.spotify = true;
    result.spotifyId = extractSpotifyIdFromUrl(links.spotify.url);
  }

  return result;
}

// ─── SongLinkService ─────────────────────────────────────────────────────────

class SongLinkService {
  private cache = new Map<string, { data: TrackAvailability; expiresAt: number }>();
  private readonly cacheTtl = 30 * 60 * 1000; // 30 min

  private getCached(key: string): TrackAvailability | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.cache.delete(key); return null; }
    return entry.data;
  }

  private setCached(key: string, data: TrackAvailability) {
    if (this.cache.size > 500) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { data, expiresAt: Date.now() + this.cacheTtl });
  }

  /** Resolve any music URL (Deezer, Tidal, Spotify, Qobuz…) to all platforms. */
  async checkAvailabilityFromUrl(url: string): Promise<TrackAvailability | null> {
    const cached = this.getCached(url);
    if (cached) return cached;

    try {
      const res = await axios.get(`${SONGLINK_API_BASE}/links`, {
        params: { url, userCountry: 'US' },
        timeout: 12000,
      });
      const links: Record<string, SongLinkPlatformEntry> =
        res.data?.linksByPlatform || {};
      const result = buildAvailability(links);
      this.setCached(url, result);
      return result;
    } catch (e: any) {
      console.warn('[SongLink] checkAvailabilityFromUrl failed:', e.message);
      return null;
    }
  }

  /**
   * Resolve a Spotify URL using the fast custom proxy (api.zarz.moe),
   * falling back to SongLink if the proxy fails.
   */
  async checkAvailabilityFromSpotify(spotifyTrackId: string): Promise<TrackAvailability | null> {
    const cacheKey = `spotify:${spotifyTrackId}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Try the fast resolve proxy first
    try {
      const res = await axios.post(
        SONGLINK_RESOLVE_PROXY,
        { url: `https://open.spotify.com/track/${spotifyTrackId}` },
        { timeout: 8000 },
      );
      if (res.data?.success && res.data?.songUrls) {
        const keyMap: Record<string, string> = {
          Tidal: 'tidal', Qobuz: 'qobuz', Deezer: 'deezer', Spotify: 'spotify',
          YouTubeMusic: 'youtubeMusic', YouTube: 'youtube', AmazonMusic: 'amazonMusic',
        };
        const links: Record<string, SongLinkPlatformEntry> = {};
        for (const [k, v] of Object.entries(keyMap)) {
          const raw = (res.data.songUrls as any)[k];
          if (raw) {
            const u = typeof raw === 'string' ? raw : (Array.isArray(raw) ? raw[0] : null);
            if (u) links[v] = { url: u };
          }
        }
        if (Object.keys(links).length > 0) {
          const result = buildAvailability(links);
          this.setCached(cacheKey, result);
          return result;
        }
      }
    } catch (e: any) {
      console.warn('[SongLink] Resolve proxy failed, falling back to SongLink:', e.message);
    }

    // Fallback: standard SongLink
    const spotifyUrl = `https://open.spotify.com/track/${spotifyTrackId}`;
    const result = await this.checkAvailabilityFromUrl(spotifyUrl);
    if (result) this.setCached(cacheKey, result);
    return result;
  }

  /** Get the Tidal track ID for a given Deezer track ID. */
  async getTidalIdFromDeezer(deezerTrackId: string): Promise<string | null> {
    const rawId = deezerTrackId.replace(/^deezer:/, '');
    const url = `https://www.deezer.com/track/${rawId}`;
    const availability = await this.checkAvailabilityFromUrl(url);
    return availability?.tidalId ?? null;
  }

  /** Get the Tidal track ID for a Spotify track ID. */
  async getTidalIdFromSpotify(spotifyTrackId: string): Promise<string | null> {
    const availability = await this.checkAvailabilityFromSpotify(spotifyTrackId);
    return availability?.tidalId ?? null;
  }

  /**
   * IDHS fallback: "I Don't Have Spotify".
   * Use when SongLink fails. Rate-limited to 8 req/min.
   * Supports: spotify URL → tidal/deezer, deezer URL → spotify/tidal
   */
  async checkAvailabilityViaIDHS(
    url: string,
    adapters: ('tidal' | 'deezer' | 'spotify')[] = ['tidal', 'deezer'],
  ): Promise<TrackAvailability | null> {
    await idhsLimiter.acquire();
    try {
      const res = await axios.post(
        `${IDHS_API_BASE}/search?v=1`,
        { link: url, adapters },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 },
      );
      const links: { type: string; url: string; notAvailable?: boolean }[] =
        res.data?.links || [];

      const result: TrackAvailability = {
        tidal: false, qobuz: false, deezer: false, spotify: false,
      };

      for (const link of links) {
        if (link.notAvailable) continue;
        const type = (link.type || '').toLowerCase();
        if (type === 'tidal') {
          result.tidal = true;
          result.tidalUrl = link.url;
          result.tidalId = extractTidalIdFromUrl(link.url);
        } else if (type === 'deezer') {
          result.deezer = true;
          result.deezerUrl = link.url;
          result.deezerId = extractDeezerIdFromUrl(link.url);
        } else if (type === 'spotify') {
          result.spotify = true;
          result.spotifyId = extractSpotifyIdFromUrl(link.url);
        }
      }

      return result;
    } catch (e: any) {
      console.warn('[IDHS] Request failed:', e.message);
      return null;
    }
  }

  /**
   * Resolve a Deezer track to a Tidal ID, with IDHS as fallback.
   * This is the main method called by MusicService when it needs to
   * play a Deezer-catalogued track via Tidal.
   */
  async resolveDeezerToTidal(deezerTrackId: string): Promise<string | null> {
    const rawId = deezerTrackId.replace(/^deezer:/, '');

    // Primary: SongLink
    const tidalId = await this.getTidalIdFromDeezer(rawId);
    if (tidalId) {
      console.log(`[SongLink] Deezer ${rawId} → Tidal ${tidalId}`);
      return tidalId;
    }

    // Fallback: IDHS
    console.warn(`[SongLink] SongLink failed for Deezer ${rawId}, trying IDHS...`);
    const idhsResult = await this.checkAvailabilityViaIDHS(
      `https://www.deezer.com/track/${rawId}`,
      ['tidal'],
    );
    if (idhsResult?.tidalId) {
      console.log(`[IDHS] Deezer ${rawId} → Tidal ${idhsResult.tidalId}`);
      return idhsResult.tidalId;
    }

    console.warn(`[SongLink] Could not resolve Deezer ${rawId} to Tidal`);
    return null;
  }
}

export const songlinkService = new SongLinkService();
