/**
 * deezer-service.ts
 *
 * Full Deezer public API client — no authentication required.
 * Used as a parallel catalog source alongside Tidal.
 *
 * API docs: https://developers.deezer.com/api
 */
import axios from 'axios';
import { DEEZER_API_BASE } from '../constants/api';
import type { Album, Artist, Playlist, Track } from './types';

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function makeCache<T>(maxSize: number) {
  const store = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
      return entry.data;
    },
    set(key: string, data: T) {
      if (store.size >= maxSize) {
        // Evict oldest
        const oldest = store.keys().next().value;
        if (oldest) store.delete(oldest);
      }
      store.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    },
  };
}

const searchCache = makeCache<any>(300);
const albumCache  = makeCache<Album>(200);
const artistCache = makeCache<Artist>(200);
const isrcCache   = makeCache<Track | null>(4000);

// ─── Raw Deezer shapes ───────────────────────────────────────────────────────

interface DeezerArtist {
  id: number;
  name: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
  picture?: string;
  nb_fan?: number;
}

interface DeezerAlbumSimple {
  id: number;
  title: string;
  cover_xl?: string;
  cover_big?: string;
  cover_medium?: string;
  cover?: string;
  release_date?: string;
  record_type?: string;
  nb_tracks?: number;
}

interface DeezerTrack {
  id: number;
  title: string;
  duration: number; // seconds
  isrc?: string;
  track_position?: number;
  disk_number?: number;
  release_date?: string;
  link?: string;
  explicit_lyrics?: boolean;
  artist: DeezerArtist;
  album: DeezerAlbumSimple;
  contributors?: DeezerArtist[];
}

interface DeezerAlbumFull extends DeezerAlbumSimple {
  artist: DeezerArtist;
  contributors?: DeezerArtist[];
  label?: string;
  genres?: { data: { id: number; name: string }[] };
  tracks?: { data: DeezerTrack[] };
  nb_tracks: number;
}

interface DeezerArtistFull extends DeezerArtist {
  nb_album?: number;
}

interface DeezerPlaylistFull {
  id: number;
  title: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
  picture?: string;
  nb_tracks: number;
  creator?: { name: string };
  tracks?: { data: DeezerTrack[] };
}

// ─── Transform helpers ───────────────────────────────────────────────────────

function bestArtistImage(a: DeezerArtist | DeezerArtistFull): string {
  return a.picture_xl || a.picture_big || a.picture_medium || a.picture || '';
}

function bestAlbumCover(a: DeezerAlbumSimple | DeezerAlbumFull): string {
  return a.cover_xl || a.cover_big || a.cover_medium || a.cover || '';
}

function contributorNames(track: DeezerTrack): string {
  if (track.contributors && track.contributors.length > 0) {
    return track.contributors.map((c) => c.name).join(', ');
  }
  return track.artist.name;
}

function transformTrack(t: DeezerTrack): Track {
  const artistName = contributorNames(t);
  return {
    id: `deezer:${t.id}`,
    title: t.title,
    artist: { id: `deezer:${t.artist.id}`, name: t.artist.name },
    artists: (t.contributors && t.contributors.length > 0
      ? t.contributors
      : [t.artist]
    ).map((a) => ({ id: `deezer:${a.id}`, name: a.name })),
    album: {
      id: `deezer:${t.album.id}`,
      title: t.album.title,
      coverUrl: bestAlbumCover(t.album),
    },
    duration: t.duration * 1000, // convert to ms
    provider: 'deezer',
    explicit: t.explicit_lyrics,
    trackNumber: t.track_position,
    releaseDate: t.release_date || t.album.release_date,
    isrc: t.isrc,
  };
}

function transformAlbum(a: DeezerAlbumSimple, artistName?: string): Album {
  const albumType = a.record_type === 'compile' ? 'compilation' : (a.record_type || 'album');
  return {
    id: `deezer:${a.id}`,
    title: a.title,
    artist: { id: '', name: artistName || '' },
    coverUrl: bestAlbumCover(a),
    provider: 'deezer',
    trackCount: a.nb_tracks,
    releaseDate: a.release_date,
  };
}

function transformArtist(a: DeezerArtist | DeezerArtistFull): Artist {
  return {
    id: `deezer:${a.id}`,
    name: a.name,
    imageUrl: bestArtistImage(a),
    provider: 'deezer',
  };
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function deezerGet<T>(path: string, params: Record<string, any> = {}): Promise<T> {
  const url = `${DEEZER_API_BASE}${path}`;
  const response = await axios.get<T>(url, { params, timeout: 10000 });
  if ((response.data as any)?.error) {
    const err = (response.data as any).error;
    throw new Error(`Deezer API error ${err.code}: ${err.message}`);
  }
  return response.data;
}

// ─── DeezerService ───────────────────────────────────────────────────────────

class DeezerService {

  /** Full search: tracks, albums, artists, playlists in parallel. */
  async search(query: string, limits = { tracks: 20, albums: 10, artists: 10, playlists: 5 }) {
    const cacheKey = `search:${query}:${JSON.stringify(limits)}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const [tracksRes, albumsRes, artistsRes, playlistsRes] = await Promise.allSettled([
      limits.tracks > 0
        ? deezerGet<{ data: DeezerTrack[] }>('/search/track', { q: query, limit: limits.tracks })
        : Promise.resolve({ data: [] as DeezerTrack[] }),
      limits.albums > 0
        ? deezerGet<{ data: (DeezerAlbumSimple & { artist: DeezerArtist })[] }>('/search/album', { q: query, limit: limits.albums })
        : Promise.resolve({ data: [] }),
      limits.artists > 0
        ? deezerGet<{ data: DeezerArtist[] }>('/search/artist', { q: query, limit: limits.artists })
        : Promise.resolve({ data: [] }),
      limits.playlists > 0
        ? deezerGet<{ data: any[] }>('/search/playlist', { q: query, limit: limits.playlists })
        : Promise.resolve({ data: [] }),
    ]);

    const result = {
      tracks:    tracksRes.status   === 'fulfilled' ? (tracksRes.value.data   || []).map(transformTrack)  : [],
      albums:    albumsRes.status   === 'fulfilled' ? (albumsRes.value.data   || []).map((a: any) => transformAlbum(a, a.artist?.name)) : [],
      artists:   artistsRes.status  === 'fulfilled' ? (artistsRes.value.data  || []).map(transformArtist) : [],
      playlists: playlistsRes.status === 'fulfilled' ? (playlistsRes.value.data || []).map((p: any): Playlist => ({
        id: `deezer:${p.id}`,
        title: p.title,
        imageUrl: p.picture_xl || p.picture_big || p.picture_medium || p.picture || '',
        provider: 'deezer',
        trackCount: p.nb_tracks,
      })) : [],
    };

    searchCache.set(cacheKey, result);
    return result;
  }

  /** Search tracks only (used for quick suggestions). */
  async searchTracks(query: string, limit = 20): Promise<Track[]> {
    const cacheKey = `tracks:${query}:${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const res = await deezerGet<{ data: DeezerTrack[] }>('/search/track', { q: query, limit });
    const tracks = (res.data || []).map(transformTrack);
    searchCache.set(cacheKey, tracks);
    return tracks;
  }

  /** Look up a track by ISRC — critical for cross-service deduplication. */
  async searchByISRC(isrc: string): Promise<Track | null> {
    if (!isrc) return null;
    const cached = isrcCache.get(isrc);
    if (cached !== null) return cached; // null is a valid "not found" cache

    try {
      const res = await deezerGet<{ data: DeezerTrack[] }>('/search/track', {
        q: `isrc:${isrc}`,
        limit: 1,
      });
      const track = res.data?.[0] ? transformTrack(res.data[0]) : null;
      isrcCache.set(isrc, track);
      return track;
    } catch (e) {
      console.warn(`[Deezer] ISRC lookup failed for ${isrc}:`, e);
      isrcCache.set(isrc, null);
      return null;
    }
  }

  /** Get full album with track list. */
  async getAlbum(rawId: string): Promise<Album & { tracks: Track[] } | null> {
    const id = rawId.replace(/^deezer:/, '');
    const cacheKey = `album:${id}`;
    const cached = albumCache.get(cacheKey) as any;
    if (cached) return cached;

    try {
      const album = await deezerGet<DeezerAlbumFull>(`/album/${id}`);
      const artistName = album.artist.name;
      const coverUrl = bestAlbumCover(album);

      const tracks: Track[] = (album.tracks?.data || []).map((t, i) =>
        transformTrack({ ...t, album: { ...album, cover_xl: coverUrl } as any })
      );

      const result = {
        id: `deezer:${album.id}`,
        title: album.title,
        artist: { id: `deezer:${album.artist.id}`, name: artistName },
        coverUrl,
        provider: 'deezer' as const,
        trackCount: album.nb_tracks,
        releaseDate: album.release_date,
        tracks,
      };

      albumCache.set(cacheKey, result as any);
      return result;
    } catch (e) {
      console.warn(`[Deezer] getAlbum failed for ${id}:`, e);
      return null;
    }
  }

  /** Get artist with discography. */
  async getArtist(rawId: string): Promise<Artist & { albums: Album[] } | null> {
    const id = rawId.replace(/^deezer:/, '');
    const cacheKey = `artist:${id}`;
    const cached = artistCache.get(cacheKey) as any;
    if (cached) return cached;

    try {
      const [artistData, albumsData] = await Promise.allSettled([
        deezerGet<DeezerArtistFull>(`/artist/${id}`),
        deezerGet<{ data: (DeezerAlbumSimple & { artist: DeezerArtist })[] }>(`/artist/${id}/albums`, { limit: 100 }),
      ]);

      if (artistData.status !== 'fulfilled') return null;
      const a = artistData.value;

      const albums = albumsData.status === 'fulfilled'
        ? (albumsData.value.data || []).map((alb) => transformAlbum(alb, a.name))
        : [];

      const result = {
        ...transformArtist(a),
        albums,
      };

      artistCache.set(cacheKey, result as any);
      return result;
    } catch (e) {
      console.warn(`[Deezer] getArtist failed for ${id}:`, e);
      return null;
    }
  }

  /** Get playlist with tracks. */
  async getPlaylist(rawId: string): Promise<Playlist & { tracks: Track[] } | null> {
    const id = rawId.replace(/^deezer:/, '');
    try {
      const pl = await deezerGet<DeezerPlaylistFull>(`/playlist/${id}`);
      const imageUrl = pl.picture_xl || pl.picture_big || pl.picture_medium || pl.picture || '';
      return {
        id: `deezer:${pl.id}`,
        title: pl.title,
        imageUrl,
        provider: 'deezer',
        trackCount: pl.nb_tracks,
        tracks: (pl.tracks?.data || []).map(transformTrack),
      };
    } catch (e) {
      console.warn(`[Deezer] getPlaylist failed for ${id}:`, e);
      return null;
    }
  }

  /** Get a single track by numeric Deezer ID. */
  async getTrack(rawId: string): Promise<Track | null> {
    const id = rawId.replace(/^deezer:/, '');
    try {
      const t = await deezerGet<DeezerTrack>(`/track/${id}`);
      return transformTrack(t);
    } catch (e) {
      console.warn(`[Deezer] getTrack failed for ${id}:`, e);
      return null;
    }
  }

  /** Extract raw numeric Deezer ID from namespaced Luna ID or raw string. */
  extractRawId(id: string): string {
    return id.replace(/^deezer:/, '');
  }
}

export const deezerService = new DeezerService();
