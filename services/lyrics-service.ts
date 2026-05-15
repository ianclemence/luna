/**
 * lyrics-service.ts
 *
 * Multi-provider lyrics engine — tries 5 sources in priority order:
 *  1. LRCLIB /api/get   (exact match — lrclib.net)
 *  2. LRCLIB /api/search (fuzzy match — same source, different endpoint)
 *  3. Paxsenix/Spotify  (line-synced — lyrics.paxsenix.org)
 *  4. Paxsenix/Apple Music (line-synced — lyrics.paxsenix.org)
 *  5. Paxsenix/Netease  (line-synced + CJK — lyrics.paxsenix.org)
 *
 * Results cached in AsyncStorage for 24 hours.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { LRCLIB_BASE, PAXSENIX_LYRICS_BASE, STORAGE_KEYS } from '../constants/api';
import type { LyricLine, LyricsData, Track } from './types';
import { cleanTitle, normalizeArtist, titlesMatch, artistsMatch } from '../lib/matching';
import { containsJapanese, japaneseToRomaji } from '../lib/romaji';

// ─── LRC parser ──────────────────────────────────────────────────────────────

/** Parse [mm:ss.xx] or [mm:ss.xxx] LRC timestamps into seconds. */
function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  // Matches [mm:ss.xx] or [mm:ss.xxx]
  const pattern = /\[(\d{1,2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;
  // Metadata tags to skip (mostly)
  const metaPattern = /^\[(ar|ti|al|by|offset|length|re|ve):/i;

  for (const raw of lrc.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // Preserve background vocal tags or other specialized tags by attaching to previous line
    if (line.startsWith('[') && !pattern.test(line) && !metaPattern.test(line) && lines.length > 0) {
      lines[lines.length - 1].text += '\n' + line;
      continue;
    }

    if (metaPattern.test(line)) continue;

    const m = line.match(pattern);
    if (m) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const centis  = parseInt(m[3], 10);
      // normalise centiseconds/milliseconds → fractional seconds
      const frac = m[3].length === 3 ? centis / 1000 : centis / 100;
      const time = minutes * 60 + seconds + frac;
      let text = m[4].trim();

      // Add Romaji if Japanese detected
      if (containsJapanese(text)) {
        const romaji = japaneseToRomaji(text);
        if (romaji !== text) {
          text = `${text}\n${romaji}`;
        }
      }

      if (text) lines.push({ time, text });
    }
  }
  return lines;
}

/** Pick best result from LRCLIB search by duration proximity (±10 s). */
function pickBestLRCLIBResult(
  results: any[],
  durationSec: number | null,
): any | null {
  if (!results.length) return null;
  const TOLERANCE = 10;

  // Prefer synced + duration-match
  const synced = results.filter((r) => r.syncedLyrics);
  const plain  = results.filter((r) => r.plainLyrics && !r.syncedLyrics);

  function inTolerance(r: any) {
    if (!durationSec || !r.duration) return true;
    return Math.abs(r.duration - durationSec) <= TOLERANCE;
  }

  return (
    synced.find(inTolerance) ||
    synced[0] ||
    plain.find(inTolerance) ||
    plain[0] ||
    results[0]
  );
}

/** Instrumental track detector. */
function isInstrumental(title: string): boolean {
  return /(?:^|[\s\[(\-])(?:instrumental|inst\.?)(?:[\s\])]|$)/i.test(title);
}

// ─── Response builder ────────────────────────────────────────────────────────

function buildLyricsData(
  trackId: string,
  lines: LyricLine[],
  provider: string,
  source: 'synced' | 'plain',
): LyricsData {
  return { trackId, lines, provider, source };
}

// ─── Cache ───────────────────────────────────────────────────────────────────

interface LyricsCacheEntry {
  data: LyricsData;
  cachedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const memoryCache = new Map<string, LyricsCacheEntry>();

function memCacheKey(track: Track): string {
  return `${track.id}:${track.title}:${track.artist?.name}`;
}

async function loadFromStorage(trackId: string): Promise<LyricsData | null> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEYS.LYRICS_CACHE}:${trackId}`);
    if (!raw) return null;
    const { data, cachedAt }: LyricsCacheEntry = JSON.parse(raw);
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

async function saveToStorage(trackId: string, data: LyricsData): Promise<void> {
  try {
    const entry: LyricsCacheEntry = { data, cachedAt: Date.now() };
    await AsyncStorage.setItem(
      `${STORAGE_KEYS.LYRICS_CACHE}:${trackId}`,
      JSON.stringify(entry),
    );
  } catch { /* non-fatal */ }
}

// ─── Individual provider fetchers ────────────────────────────────────────────

/** Provider 1: LRCLIB exact match via /api/get */
async function fetchLRCLIBExact(
  trackId: string,
  title: string,
  artist: string,
  album: string | undefined,
  durationSec: number | null,
): Promise<LyricsData | null> {
  try {
    const params: Record<string, string> = {
      track_name: title,
      artist_name: artist,
    };
    if (album) params.album_name = album;
    if (durationSec) params.duration = String(Math.round(durationSec));

    const res = await axios.get(`${LRCLIB_BASE}/get`, { params, timeout: 8000 });
    if (res.status !== 200 || !res.data) return null;

    if (res.data.syncedLyrics) {
      const lines = parseLRC(res.data.syncedLyrics);
      if (lines.length) return buildLyricsData(trackId, lines, 'LRCLIB', 'synced');
    }
    if (res.data.plainLyrics) {
      const lines = res.data.plainLyrics
        .split('\n')
        .filter((l: string) => l.trim())
        .map((text: string) => ({ time: 0, text: text.trim() }));
      if (lines.length) return buildLyricsData(trackId, lines, 'LRCLIB', 'plain');
    }
  } catch (e: any) {
    if (e.response?.status !== 404) {
      console.warn('[Lyrics/LRCLIB-exact] failed:', e.message);
    }
  }
  return null;
}

/** Provider 2: LRCLIB fuzzy search via /api/search */
async function fetchLRCLIBSearch(
  trackId: string,
  title: string,
  artist: string,
  durationSec: number | null,
): Promise<LyricsData | null> {
  // Try original title, then simplified
  const queries = [
    `${artist} ${title}`,
    `${normalizeArtist(artist)} ${cleanTitle(title)}`,
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  for (const q of queries) {
    try {
      const res = await axios.get(`${LRCLIB_BASE}/search`, {
        params: { q },
        timeout: 8000,
      });
      if (res.status !== 200 || !Array.isArray(res.data) || !res.data.length) continue;

      const best = pickBestLRCLIBResult(res.data, durationSec);
      if (!best) continue;

      if (best.syncedLyrics) {
        const lines = parseLRC(best.syncedLyrics);
        if (lines.length) return buildLyricsData(trackId, lines, 'LRCLIB Search', 'synced');
      }
      if (best.plainLyrics) {
        const lines = best.plainLyrics
          .split('\n')
          .filter((l: string) => l.trim())
          .map((text: string) => ({ time: 0, text: text.trim() }));
        if (lines.length) return buildLyricsData(trackId, lines, 'LRCLIB Search', 'plain');
      }
    } catch (e: any) {
      console.warn('[Lyrics/LRCLIB-search] failed:', e.message);
    }
  }
  return null;
}

// ─── Paxsenix helpers ────────────────────────────────────────────────────────

interface PaxsenixSearchResult {
  trackId?: string;   // Spotify
  videoId?: string;   // YouTube
  id?: string | number; // Netease, Apple Music
  hash?: string;      // Kugou
  name?: string;
  title?: string;
  artistName?: string;
  author?: string;
  duration?: string | number;
}

function parseClockDuration(val: string | number | undefined): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const parts = String(val).split(':').map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function scorePaxsenixResult(
  candidate: PaxsenixSearchResult,
  title: string,
  artist: string,
  durationSec: number | null,
): number {
  const ct = (candidate.title || candidate.name || '').toLowerCase();
  const ca = (candidate.artistName || candidate.author || '').toLowerCase();

  let score = 0;
  if (titlesMatch(title, ct)) score += 50;
  if (artistsMatch(artist, ca)) score += 60;

  if (durationSec) {
    const cd = parseClockDuration(candidate.duration);
    if (cd && Math.abs(cd - durationSec) <= 10) score += 20;
  }
  return score;
}

function parsePaxsenixLyrics(raw: any, trackId: string, provider: string): LyricsData | null {
  // raw can be: string (LRC), { lyrics: "..." }, { content: [...] }, { lyrics_text: "..." }
  let text: string | null = null;

  if (typeof raw === 'string') {
    text = raw.trim();
  } else if (raw?.lyrics && typeof raw.lyrics === 'string') {
    text = raw.lyrics.trim();
  } else if (raw?.lyrics_text && typeof raw.lyrics_text === 'string') {
    text = raw.lyrics_text.trim();
  } else if (raw?.plain_lyrics && typeof raw.plain_lyrics === 'string') {
    text = raw.plain_lyrics.trim();
  } else if (raw?.lyricsText && typeof raw.lyricsText === 'string') {
    text = raw.lyricsText.trim();
  }

  if (!text) return null;

  // Try as LRC first
  const syncedLines = parseLRC(text);
  if (syncedLines.length) {
    return buildLyricsData(trackId, syncedLines, provider, 'synced');
  }

  // Plain fallback
  const plainLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t) => ({ time: 0, text: t }));

  if (plainLines.length) {
    return buildLyricsData(trackId, plainLines, provider, 'plain');
  }

  return null;
}

async function fetchPaxsenix(
  trackId: string,
  searchEndpoint: string,
  lyricsEndpoint: string,
  idField: string,
  title: string,
  artist: string,
  durationSec: number | null,
  providerName: string,
): Promise<LyricsData | null> {
  try {
    // Step 1: search for the track
    const searchRes = await axios.get(`${PAXSENIX_LYRICS_BASE}${searchEndpoint}`, {
      params: { q: `${title} ${artist}` },
      timeout: 10000,
    });

    let results: PaxsenixSearchResult[] = [];
    if (Array.isArray(searchRes.data)) {
      results = searchRes.data;
    } else if (searchRes.data?.result?.songs) {
      // Netease format
      results = searchRes.data.result.songs.map((s: any) => ({
        id: s.id, name: s.name,
        artistName: s.artists?.map((a: any) => a.name).join(', '),
      }));
    }

    if (!results.length) return null;

    // Step 2: pick best match
    let best = results[0];
    if (results.length > 1) {
      let bestScore = -1;
      for (const r of results) {
        const s = scorePaxsenixResult(r, title, artist, durationSec);
        if (s > bestScore) { bestScore = s; best = r; }
      }
    }

    const id = (best as any)[idField] ?? best.id ?? best.trackId ?? best.videoId ?? best.hash;
    if (!id) return null;

    // Step 3: fetch lyrics by ID
    const lyricsRes = await axios.get(`${PAXSENIX_LYRICS_BASE}${lyricsEndpoint}`, {
      params: { id: String(id) },
      timeout: 10000,
    });

    return parsePaxsenixLyrics(lyricsRes.data, trackId, providerName);
  } catch (e: any) {
    console.warn(`[Lyrics/${providerName}] failed:`, e.message);
    return null;
  }
}

/** Provider 3: Paxsenix → Spotify lyrics */
async function fetchPaxsenixSpotify(
  trackId: string,
  title: string,
  artist: string,
  durationSec: number | null,
): Promise<LyricsData | null> {
  return fetchPaxsenix(
    trackId,
    '/spotify/search',
    '/spotify/lyrics',
    'trackId',
    title,
    artist,
    durationSec,
    'Paxsenix/Spotify',
  );
}

/** Provider 4: Paxsenix → Apple Music lyrics */
async function fetchPaxsenixApple(
  trackId: string,
  title: string,
  artist: string,
  durationSec: number | null,
): Promise<LyricsData | null> {
  return fetchPaxsenix(
    trackId,
    '/apple/search',
    '/apple/lyrics',
    'id',
    title,
    artist,
    durationSec,
    'Paxsenix/Apple Music',
  );
}

/** Provider 5: Paxsenix → Netease lyrics (best for CJK) */
async function fetchPaxsenixNetease(
  trackId: string,
  title: string,
  artist: string,
  durationSec: number | null,
): Promise<LyricsData | null> {
  try {
    // Netease search returns a different shape
    const searchRes = await axios.get(`${PAXSENIX_LYRICS_BASE}/netease/search`, {
      params: { q: `${title} ${artist}` },
      timeout: 10000,
    });

    const songs: any[] =
      searchRes.data?.result?.songs || searchRes.data?.songs || searchRes.data || [];
    if (!Array.isArray(songs) || !songs.length) return null;

    const best = songs[0]; // Netease ordering is usually reliable
    const id = best.id;
    if (!id) return null;

    const lyricsRes = await axios.get(`${PAXSENIX_LYRICS_BASE}/netease/lyrics`, {
      params: { id: String(id) },
      timeout: 10000,
    });

    const lrc = lyricsRes.data?.lrc?.lyric || lyricsRes.data?.lyric || lyricsRes.data;
    if (!lrc || typeof lrc !== 'string') return null;

    const syncedLines = parseLRC(lrc);
    if (syncedLines.length) return buildLyricsData(trackId, syncedLines, 'Paxsenix/Netease', 'synced');

    const plainLines = lrc.split('\n').filter((l: string) => l.trim())
      .map((text: string) => ({ time: 0, text: text.trim() }));
    if (plainLines.length) return buildLyricsData(trackId, plainLines, 'Paxsenix/Netease', 'plain');
  } catch (e: any) {
    console.warn('[Lyrics/Netease] failed:', e.message);
  }
  return null;
}

// ─── LyricsService ───────────────────────────────────────────────────────────

class LyricsService {
  /**
   * Fetch lyrics for a track using a 5-provider waterfall.
   * Results are cached in AsyncStorage for 24 hours.
   */
  async getLyrics(track: Track): Promise<LyricsData | null> {
    const memKey = memCacheKey(track);

    // 1. Memory cache
    const mem = memoryCache.get(memKey);
    if (mem && Date.now() - mem.cachedAt < CACHE_TTL_MS) return mem.data;

    // 2. AsyncStorage cache
    const stored = await loadFromStorage(track.id);
    if (stored) {
      memoryCache.set(memKey, { data: stored, cachedAt: Date.now() });
      return stored;
    }

    const title      = track.title || '';
    const artist     = track.artists?.map((a) => a.name).join(', ') || track.artist?.name || '';
    const album      = track.album?.title;
    const durationSec = track.duration ? track.duration / 1000 : null;

    if (!title || !artist) return null;

    if (isInstrumental(title)) {
      console.log(`[LyricsService] Track "${title}" marked as instrumental, skipping.`);
      return buildLyricsData(track.id, [{ time: 0, text: 'Instrumental' }], 'Heuristic', 'plain');
    }

    // 3. Try providers in order
    const providers: Array<() => Promise<LyricsData | null>> = [
      () => fetchLRCLIBExact(track.id, title, artist, album, durationSec),
      () => fetchLRCLIBSearch(track.id, title, artist, durationSec),
      () => fetchPaxsenixSpotify(track.id, title, artist, durationSec),
      () => fetchPaxsenixApple(track.id, title, artist, durationSec),
      () => fetchPaxsenixNetease(track.id, title, artist, durationSec),
    ];

    for (const fetch of providers) {
      const result = await fetch();
      if (result && result.lines.length > 0) {
        console.log(`[LyricsService] Got lyrics from ${result.provider} for "${title}"`);
        memoryCache.set(memKey, { data: result, cachedAt: Date.now() });
        await saveToStorage(track.id, result);
        return result;
      }
    }

    console.warn(`[LyricsService] No lyrics found for "${title}" — ${artist}`);
    return null;
  }

  /** Clear cached lyrics for a track (e.g. when user manually refreshes). */
  async clearCache(trackId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${STORAGE_KEYS.LYRICS_CACHE}:${trackId}`);
      for (const [k] of memoryCache) {
        if (k.startsWith(trackId)) memoryCache.delete(k);
      }
    } catch { /* non-fatal */ }
  }
}

export const lyricsService = new LyricsService();
