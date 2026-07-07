import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from "axios";
import { decode as atob } from "base-64";
import * as BackgroundTask from "expo-background-task";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as TaskManager from "expo-task-manager";
import { apiService } from "./api-service";
import { getAmazonStream, decryptAmazonStream, AmazonStreamResult } from "./amazon-service";
import { lyricsService } from "./lyrics-service";
import { listeningTracker } from "./listening-tracker";
import { DownloadMetadata, DownloadStatus, storageService } from "./storage-service";
import { smartRecommendations } from "./smart-recommendations";
import { hifiClient } from "./hifi-client";
import { qobuzService } from "./qobuz-service";
import { settingsManager } from "../lib/settings";
import {
  Album,
  Artist,
  HomeData,
  LyricLine,
  LyricsData,
  Playlist,
  Track,
} from "./types";

const DOWNLOAD_TASK_NAME = "background-music-download";

export { Album, Artist, HomeData, LyricLine, LyricsData, Playlist, Track };

class MusicService {
  private skipArtistRecommendations = false;
  private cancelFlags: Set<string> = new Set();
  private activeDownloads: Map<string, FileSystem.DownloadResumable> =
    new Map();
  private isProcessingQueue = false;
  private backgroundTaskInitialized = false;

  // Stream cache (matching web app's streamCache)
  private streamCache = new Map<string, { url: string; quality: string; timestamp: number }>();
  private static STREAM_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private static STREAM_CACHE_MAX = 50;
  private static STREAM_CACHE_STORAGE_KEY = 'stream_cache';

  // 100 tracks at Hi-Res Lossless ~1GB.
  private readonly CACHE_LIMIT = 100;

  constructor() {
    // Load persisted stream cache from AsyncStorage
    this.loadStreamCache();

    // Periodic stream cache pruning (every 5 minutes, matching web app)
    setInterval(() => {
      this.pruneStreamCache();
    }, 1000 * 60 * 5);
  }

  private async loadStreamCache() {
    try {
      const raw = await AsyncStorage.getItem(MusicService.STREAM_CACHE_STORAGE_KEY);
      if (raw) {
        const entries: Array<[string, { url: string; quality: string; timestamp: number }]> = JSON.parse(raw);
        const now = Date.now();
        for (const [key, value] of entries) {
          if (now - value.timestamp < MusicService.STREAM_CACHE_TTL) {
            this.streamCache.set(key, value);
          }
        }
        console.log(`[MusicService] Loaded ${this.streamCache.size} cached stream URLs`);
      }
    } catch (e) {
      console.warn('[MusicService] Failed to load stream cache:', e);
    }
  }

  private async saveStreamCache() {
    try {
      const entries = Array.from(this.streamCache.entries());
      await AsyncStorage.setItem(MusicService.STREAM_CACHE_STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('[MusicService] Failed to save stream cache:', e);
    }
  }

  private pruneStreamCache() {
    if (this.streamCache.size > MusicService.STREAM_CACHE_MAX) {
      const entries = Array.from(this.streamCache.entries());
      const toDelete = entries.slice(0, entries.length - MusicService.STREAM_CACHE_MAX);
      toDelete.forEach(([key]) => this.streamCache.delete(key));
      this.saveStreamCache();
    }
  }

  async initBackgroundFetch() {
    if (this.backgroundTaskInitialized) return;
    this.backgroundTaskInitialized = true;
    try {
      if (!TaskManager.isTaskDefined(DOWNLOAD_TASK_NAME)) {
        TaskManager.defineTask(DOWNLOAD_TASK_NAME, async () => {
          try {
            console.log("[BackgroundTask] Processing download queue...");
            await this.processDownloadQueue();
            return BackgroundTask.BackgroundTaskResult.Success;
          } catch (error) {
            console.error("[BackgroundTask] Error:", error);
            return BackgroundTask.BackgroundTaskResult.Failed;
          }
        });
      }

      await BackgroundTask.registerTaskAsync(DOWNLOAD_TASK_NAME, {
        minimumInterval: 60 * 15, // 15 minutes
      });
    } catch (error) {
      console.warn("BackgroundTask registration failed:", error);
    }
  }

  private async processDownloadQueue(): Promise<boolean> {
    if (this.isProcessingQueue) return false;
    this.isProcessingQueue = true;

    try {
      const allMetadata = await storageService.getAllDownloads();
      const pendingItems = allMetadata.filter(
        (m) => m.status === "downloading" || m.status === "pending",
      );

      if (pendingItems.length === 0) {
        this.isProcessingQueue = false;
        return false;
      }

      // Process one by one in background
      for (const item of pendingItems) {
        try {
          if (item.type === "track") {
            // Re-fetch track if needed (we might need the full track object)
            // For now, assume we have enough in 'item'
            await this.downloadTrack(
              item.item as Track,
              undefined,
              item.parentId,
            );
          } else if (item.type === "album") {
            await this.downloadAlbum(item.item as Album);
          } else if (item.type === "playlist") {
            await this.downloadPlaylist(item.item as Playlist);
          }
        } catch (e) {
          console.error(`Background download failed for ${item.id}:`, e);
        }
      }

      this.isProcessingQueue = false;
      return true;
    } catch (error) {
      console.error("Error processing download queue:", error);
      this.isProcessingQueue = false;
      return false;
    }
  }

  async getFreshTrackMetadata(trackId: string): Promise<Track | null> {
  try {
    const cleanId = trackId.replace(/^[tq]:/, "");
    await hifiClient.initialize();
    const data = await hifiClient.getTrackInfo(cleanId);
    console.log(`[MusicService] HiFi track info: isrc=${(data as any).isrc}, duration=${data.duration}`);
    const track = this.transformTidalTrack(data);
    return track;
  } catch (e) {
    console.error(`Failed to refresh metadata for track ${trackId}:`, e);
    return null;
  }
}

  async getLyrics(track: Track): Promise<LyricsData | null> {
    // Delegate to the multi-provider LyricsService (5-provider waterfall).
    // Results are cached in AsyncStorage for 24h by lyricsService itself.
    return lyricsService.getLyrics(track);
  }

  private parseLRC(lrcContent: string): LyricLine[] {
    if (!lrcContent) return [];
    const lines = lrcContent.split("\n").filter((line) => line.trim());
    return lines
      .map((line) => {
        const match = line.match(/\[(\d+):(\d+)\.(\d+)\]\s*(.+)/);
        if (match) {
          const [, minutes, seconds, centiseconds, text] = match;
          const timeInSeconds =
            parseInt(minutes) * 60 +
            parseInt(seconds) +
            parseInt(centiseconds) / 100;
          return { time: timeInSeconds, text: text.trim() };
        }
        return null;
      })
      .filter((line): line is LyricLine => line !== null);
  }

  private unwrapItems(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;

    // Unwrap { success: true, data: [...] } or { success: true, data: { items: [...] } }
    const root = data.data || data;
    if (Array.isArray(root)) return root;
    if (root && Array.isArray(root.items)) return root.items;

    // Fallback for other common patterns
    if (data.items && Array.isArray(data.items)) return data.items;
    if (data.albums && Array.isArray(data.albums)) return data.albums;
    if (data.tracks && Array.isArray(data.tracks)) return data.tracks;
    if (data.artists && Array.isArray(data.artists)) return data.artists;

    return [];
  }

  private async runTidalSearchWithTimeout<T>(promise: Promise<T>, timeoutMs = 1500): Promise<T | null> {
    let timeoutId: any;
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Tidal timeout")), timeoutMs);
    });
    return Promise.race([
      promise,
      timeoutPromise
    ]).then(val => {
      clearTimeout(timeoutId);
      return val;
    }).catch(() => {
      clearTimeout(timeoutId);
      return null;
    });
  }

  async search(
    query: string,
    options: { signal?: AbortSignal; provider?: string } = {},
  ) {
    try {
      const [qobuzData, tidalData] = await Promise.allSettled([
        qobuzService.search(query),
        this.runTidalSearchWithTimeout(
          apiService.searchUnified(query, { signal: options.signal, timeout: 1500 })
        )
      ]);

      const qobuz = qobuzData.status === "fulfilled" 
        ? qobuzData.value 
        : { tracks: [] as Track[], albums: [] as Album[], artists: [] as Artist[], playlists: [] as Playlist[] };
      
      let tidal: { tracks: Track[]; albums: Album[]; artists: Artist[]; playlists: Playlist[] } = {
        tracks: [],
        albums: [],
        artists: [],
        playlists: []
      };
      if (tidalData.status === "fulfilled" && tidalData.value) {
        const data = tidalData.value;
        tidal = {
          tracks: apiService.normalizeSearchResponse(data, 'tracks').items.map((t: any) => this.transformTidalTrack(t)),
          albums: this.deduplicateAlbums(
            apiService.normalizeSearchResponse(data, 'albums').items.map((a: any) => this.transformTidalAlbum(a))
          ),
          artists: apiService.normalizeSearchResponse(data, 'artists').items.map((a: any) => this.transformTidalArtist(a)),
          playlists: apiService.normalizeSearchResponse(data, 'playlists').items.map((p: any) => this.transformTidalPlaylist(p)),
        };
      }

      return {
        tracks: [...qobuz.tracks, ...tidal.tracks],
        albums: this.deduplicateAlbums([...qobuz.albums, ...tidal.albums]),
        artists: [...qobuz.artists, ...tidal.artists],
        playlists: [...qobuz.playlists, ...tidal.playlists],
      };
    } catch (error) {
      console.warn('[MusicService] Search failed, attempting Qobuz-only query:', error);
      return await qobuzService.search(query);
    }
  }

  async searchTracks(query: string) {
    try {
      const [qobuzRes, tidalRes] = await Promise.allSettled([
        qobuzService.search(query, 20),
        this.runTidalSearchWithTimeout(
          apiService.searchUnified(query, { timeout: 1500 })
        )
      ]);
      const qobuzItems = qobuzRes.status === "fulfilled" ? qobuzRes.value.tracks : [];
      const tidalItems = tidalRes.status === "fulfilled" && tidalRes.value
        ? apiService.normalizeSearchResponse(tidalRes.value, 'tracks').items.map((t: any) => this.transformTidalTrack(t))
        : [];
      return { items: [...qobuzItems, ...tidalItems] };
    } catch (e) {
      console.warn("[MusicService] Search tracks failed:", e);
      return { items: [] };
    }
  }

  async searchAlbums(query: string) {
    try {
      const [qobuzRes, tidalRes] = await Promise.allSettled([
        qobuzService.search(query, 20),
        this.runTidalSearchWithTimeout(
          apiService.searchUnified(query, { timeout: 1500 })
        )
      ]);
      const qobuzItems = qobuzRes.status === "fulfilled" ? qobuzRes.value.albums : [];
      const tidalItems = tidalRes.status === "fulfilled" && tidalRes.value
        ? apiService.normalizeSearchResponse(tidalRes.value, 'albums').items.map((a: any) => this.transformTidalAlbum(a))
        : [];
      return { items: this.deduplicateAlbums([...qobuzItems, ...tidalItems]) };
    } catch (e) {
      console.warn("Search albums failed:", e);
      return { items: [] };
    }
  }

  async searchArtists(query: string) {
    try {
      const [qobuzRes, tidalRes] = await Promise.allSettled([
        qobuzService.search(query, 20),
        this.runTidalSearchWithTimeout(
          apiService.searchUnified(query, { timeout: 1500 })
        )
      ]);
      const qobuzItems = qobuzRes.status === "fulfilled" ? qobuzRes.value.artists : [];
      const tidalItems = tidalRes.status === "fulfilled" && tidalRes.value
        ? apiService.normalizeSearchResponse(tidalRes.value, 'artists').items.map((a: any) => this.transformTidalArtist(a))
        : [];
      return { items: [...qobuzItems, ...tidalItems] };
    } catch (e) {
      console.warn("Search artists failed:", e);
      return { items: [] };
    }
  }

  async getHomeData(
    seeds: Track[] = [],
    jumpBackIn: (Track | Album | Playlist | any)[] = [],
  ) {
    try {
      if (seeds.length === 0 && jumpBackIn.length === 0) {
        const results = await Promise.allSettled([
          apiService.getTidalNewReleases(),
        ]);
        const newReleasesData =
          results[0].status === "fulfilled" ? results[0].value : null;

        const newAlbums = newReleasesData
          ? apiService.normalizeSearchResponse(newReleasesData, "albums").items.map((a: any) => this.transformTidalAlbum(a))
          : [];

        return {
          trendingAlbums: [],
          trendingTracks: [],
          newAlbums: newAlbums.slice(0, 10),
          // Fallbacks
          newReleases: newAlbums.slice(0, 10),
          topTracks: trendingTracks.slice(0, 10),
          featuredPlaylists: [],
          recommendations: [],
        };
      } else {
        // Active user: Jump Back In, Recommended Tracks, Recommended Albums
        const [recommendedTracks, recommendedAlbums] = await Promise.all([
          this.getRecommendedTracksForPlaylist(seeds.slice(0, 5), 20),
          this.getRecommendedAlbumsFromSeeds(seeds.slice(0, 5)),
        ]);

        return {
          jumpBackIn: jumpBackIn.length > 0 ? jumpBackIn : seeds.slice(0, 10),
          recommendedTracks,
          recommendedAlbums,
          // Fallbacks
          newReleases: [],
          topTracks: recommendedTracks.slice(0, 10),
          featuredPlaylists: [],
          recommendations: recommendedTracks,
        };
      }
    } catch (error) {
      console.error("Failed to fetch home data:", error);
      return {
        newReleases: [],
        topTracks: [],
        featuredPlaylists: [],
        recommendations: [],
      };
    }
  }

  async getRecommendedAlbumsFromSeeds(seeds: Track[]) {
    if (seeds.length === 0) return [];

    const albumIds = new Set(
      seeds.map((t) => t.album.id.replace(/^[tq]:/, "")),
    );
    const recommendedAlbums: Album[] = [];

    await Promise.all(
      Array.from(albumIds)
        .slice(0, 3)
        .map(async (id) => {
          const similar = await this.getSimilarAlbums(id);
          recommendedAlbums.push(...similar.slice(0, 4));
        }),
    );

    return recommendedAlbums.sort(() => Math.random() - 0.5).slice(0, 10);
  }

  async getTrackRecommendations(
    trackId: string,
  ) {
    try {
      const cleanId = trackId.replace(/^[tq]:/, "");
      const data = await apiService.getTidalRecommendations(cleanId);
      return this.unwrapItems(data).map((item: any) =>
        this.transformTidalTrack(item.track || item),
      );
    } catch (error) {
      console.error("Failed to fetch track recommendations:", error);
      return [];
    }
  }

  async getSimilarAlbums(
    albumId: string,
  ) {
    try {
      const cleanId = albumId.replace(/^[tq]:/, "");
      const data = await apiService.getTidalSimilarAlbums(cleanId);
      return this.unwrapItems(data).map((item: any) =>
        this.transformTidalAlbum(item),
      );
    } catch (error) {
      console.error("Failed to fetch similar albums:", error);
      return [];
    }
  }

  async getArtist(artistId: string) {
    try {
      if (artistId.startsWith("q:")) {
        const { artist, albums, tracks, biography } = await qobuzService.getArtist(artistId);
        const result = {
          ...artist,
          albums,
          eps: [],
          tracks,
          biography,
          socials: {},
          similarArtists: []
        };
        await storageService.saveMetadata(artistId, result);
        return result;
      }

      const cleanId = artistId.replace(/^[tq]:/, "");
      const [primaryData, contentData] = await Promise.all([
        apiService.getTidalArtist(cleanId),
        apiService.getTidalArtistContent(cleanId),
      ]);

        if (primaryData.success === false) {
          console.error("Failed to fetch artist from any instance");
          return null;
        }

        // Aligning with web app: unwrap data property if it exists, then unwrap artist property if it exists
        let artistRaw = primaryData.data || primaryData;
        artistRaw =
          artistRaw.artist ||
          (Array.isArray(artistRaw) ? artistRaw[0] : artistRaw);

        const scanForArtist = (value: any, visited = new Set()): any => {
          if (!value || typeof value !== "object" || visited.has(value))
            return null;
          visited.add(value);

          if (Array.isArray(value)) {
            for (const item of value) {
              const found = scanForArtist(item, visited);
              if (found) return found;
            }
            return null;
          }

          const item = value.item || value;
          if (item?.id && item?.name && (item?.picture || item?.cover))
            return item;

          for (const nested of Object.values(value)) {
            const found = scanForArtist(nested, visited);
            if (found) return found;
          }
          return null;
        };

        if (!artistRaw.name || (!artistRaw.picture && !artistRaw.cover)) {
          const foundArtist = scanForArtist(contentData);
          if (foundArtist) {
            artistRaw = { ...artistRaw, ...foundArtist };
          }
        }

        const artist = this.transformTidalArtist(artistRaw);
        const albumMap = new Map();
        const trackMap = new Map();

        const isTrack = (v: any) => v?.id && (v.title || v.name) && (v.duration || v.album);
        const isAlbum = (v: any) => v?.id && ("numberOfTracks" in v || v.type === "ALBUM" || v.type === "EP" || v.type === "SINGLE");

        const scan = (value: any, visited = new Set()) => {
          if (!value || typeof value !== "object" || visited.has(value)) return;
          visited.add(value);

          if (Array.isArray(value)) {
            value.forEach((item) => scan(item, visited));
            return;
          }

          const item = value.item || value;
          if (isAlbum(item)) albumMap.set(String(item.id), item);
          if (isTrack(item)) trackMap.set(String(item.id), item);

          Object.values(value).forEach((nested) => scan(nested, visited));
        };

        const entries = Array.isArray(contentData)
          ? contentData
          : [contentData.data || contentData];
        entries.forEach((entry) => scan(entry));

        // Attempt to find more albums via search (matching luna's logic)
        try {
          const searchResults = await this.search(artist.name, {
            provider: "tidal",
          });
          if (searchResults && searchResults.albums) {
            const numericArtistId = Number(cleanId);
            for (const album of searchResults.albums) {
              const albumId = album.id.replace("t:", "");
              // Since search results are already transformed, we check artist ID
              const matchesArtist =
                Number(album.artist?.id?.replace("t:", "")) === numericArtistId;
              if (matchesArtist && !albumMap.has(albumId)) {
                // If it's missing from the scan, we should add it.
                // However, since search result is transformed and scan result is raw, 
                // we'll just store the ID and we can handle it later or just re-fetch if needed.
                // For now, let's just add it to the map if we have the raw data available in the search result
                if (album._raw) {
                  albumMap.set(albumId, album._raw);
                }
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch additional albums via search:", e);
        }

        const rawReleases = Array.from(albumMap.values());
        const transformedReleases = rawReleases.map((a) => this.transformTidalAlbum(a));

        // Use the centralized deduplication logic
        const allReleases = this.deduplicateAlbums(transformedReleases).sort(
          (a, b) =>
            new Date(b.releaseDate || 0).getTime() -
            new Date(a.releaseDate || 0).getTime(),
        );

        const eps = allReleases.filter(
          (a: any) => a.type === "EP" || a.type === "SINGLE",
        );
        const albums = allReleases.filter((a) => !eps.includes(a));

        const topTracks = Array.from(trackMap.values())
          .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
          .slice(0, 15)
          .map((t) => this.transformTidalTrack(t));

        // Fetch bio, socials, and similar artists
        const [bio, socials, similarArtistsData] = await Promise.all([
          apiService.getTidalArtistBiography(cleanId),
          apiService.getTidalArtistSocials(artist.name),
          apiService.getTidalSimilarArtists(cleanId),
        ]);

        const similarArtists = this.unwrapItems(similarArtistsData).map(
          (item: any) => this.transformTidalArtist(item),
        );

        const result = {
          ...artist,
          albums,
          eps,
          tracks: topTracks,
          biography: bio?.text,
          socials: socials,
          similarArtists,
        };
        await storageService.saveMetadata(artistId, result);
        return result;
    } catch (error) {
      const cached = await storageService.getMetadata<any>(artistId);
      if (cached) return cached;
      console.warn(`Artist fetch failed: ${artistId}`, error);
      return null;
    }
  }

  async getAlbum(albumId: string) {
    try {
      if (albumId.startsWith("q:")) {
        const album = await qobuzService.getAlbum(albumId);
        const tracks = await qobuzService.getAlbumTracks(albumId);
        const result = {
          album,
          tracks,
          similarAlbums: []
        };
        await storageService.saveMetadata(albumId, result);
        return result;
      }

      const cleanId = albumId.replace(/^[tq]:/, "");
      const [data, similarAlbumsData] = await Promise.all([
        apiService.getTidalAlbum(cleanId),
        apiService.getTidalSimilarAlbums(cleanId).catch(() => ({ items: [] }))
      ]);
        if (data.success === false) {
          console.error("Failed to fetch album from any instance");
          return null;
        }

        // Aligning with web app: unwrap data property if it exists, then unwrap album property if it exists
        let albumData = data.data || data;
        albumData =
          albumData.album ||
          (Array.isArray(albumData) ? albumData[0] : albumData);

        const tracksRaw =
          albumData?.tracks?.items ||
          albumData?.items ||
          data.data?.tracks?.items ||
          data.data?.items ||
          [];

        // If the root object is missing artist or title, try to find it recursively (matching artist scan)
        const scanForAlbumMetadata = (value: any, visited = new Set()): any => {
          if (!value || typeof value !== "object" || visited.has(value))
            return null;
          visited.add(value);

          if (Array.isArray(value)) {
            for (const item of value) {
              const found = scanForAlbumMetadata(item, visited);
              if (found) return found;
            }
            return null;
          }

          const item = value.item || value;
          // Look for an object that has album-like properties and matches our ID
          if (
            item?.id &&
            String(item.id) === String(cleanId) &&
            item.title &&
            item.artist
          ) {
            return item;
          }

          // Also check nested track objects for their album info
          if (item?.album?.id && String(item.album.id) === String(cleanId)) {
            return item.album;
          }

          for (const nested of Object.values(value)) {
            const found = scanForAlbumMetadata(nested, visited);
            if (found) return found;
          }
          return null;
        };

        if (!albumData?.title || !albumData?.artist) {
          const foundAlbum = scanForAlbumMetadata(data);
          if (foundAlbum) {
            albumData = { ...(albumData || {}), ...foundAlbum };
          } else if (tracksRaw.length > 0) {
            const firstTrack = tracksRaw[0].item || tracksRaw[0];
            if (firstTrack.album) {
              albumData = { ...(albumData || {}), ...firstTrack.album };
            }
          }
        }

        const album = this.transformTidalAlbum(albumData || {});
        let tracks = tracksRaw.map((t: any) =>
          this.transformTidalTrack(t.item || t),
        );

        // Handle pagination if there are more tracks
        if (album.trackCount && album.trackCount > tracks.length) {
          let offset = tracks.length;
          const SAFE_MAX_TRACKS = 1000; // Limit for mobile performance

          while (
            tracks.length < album.trackCount &&
            tracks.length < SAFE_MAX_TRACKS
          ) {
            try {
              const nextData = await apiService.getTidalAlbum(cleanId, offset);
              const nextItems = nextData.tracks?.items || nextData.items || [];
              if (nextItems.length === 0) break;

              const preparedItems = nextItems.map((i: any) =>
                this.transformTidalTrack(i.item || i),
              );

              // Safeguard against loops
              if (tracks.length > 0 && preparedItems[0].id === tracks[0].id)
                break;

              tracks = tracks.concat(preparedItems);
              offset += preparedItems.length;
            } catch (error) {
              console.error(
                `Error fetching album tracks at offset ${offset}:`,
                error,
              );
              break;
            }
          }
        }

        // Fetch similar albums (matching luna's logic)
        // already fetched
        const similarAlbums = this.unwrapItems(similarAlbumsData).map(
          (item: any) => this.transformTidalAlbum(item),
        );

        const result = {
          ...album,
          tracks,
          similarAlbums,
        };
        await storageService.saveMetadata(albumId, result);
        return result;
    } catch {
      // First try to find in specific download metadata
      const metadata = await storageService.getDownloadMetadata(albumId);
      if (metadata && metadata.type === "album") {
        let tracks: Track[] = [];
        if (metadata.item?.tracks && Array.isArray(metadata.item.tracks)) {
          tracks = metadata.item.tracks as Track[];
        } else {
          const all = await storageService.getAllDownloads();
          tracks = all
            .filter(
              (d) =>
                d.type === "track" && d.item?.album?.id === String(albumId),
            )
            .map((d) => d.item as Track);
        }
        const first = tracks[0];
        if (first) {
          const album: Album = {
            id: albumId,
            title: first.album.title,
            artist: first.artist,
            coverUrl: first.album.coverUrl,
            provider: first.provider,
            trackCount: tracks.length,
          };
          return { ...album, tracks, similarAlbums: [] };
        }
      }

      // Final fallback to general metadata cache
      const cached = await storageService.getMetadata<any>(albumId);
      if (cached) return cached;

      return null;
    }
  }

  async getPlaylist(playlistId: string) {
    // Check if it's a user-created local playlist
    if (playlistId.startsWith("local:")) {
      const localPlaylist = await storageService.getUserPlaylist(playlistId);
      if (localPlaylist) {
        return {
          ...localPlaylist,
          tracks: localPlaylist.tracks || [],
          trackCount:
            localPlaylist.tracks?.length || localPlaylist.trackCount || 0,
        };
      }
      return null;
    }

    try {
      const cleanId = playlistId.replace(/^[tq]:/, "");
      const data = await apiService.getTidalPlaylist(cleanId);
        if (data.success === false) {
          console.error("Failed to fetch playlist from any instance");
          return null;
        }

        // Aligning with web app: unwrap data property if it exists, then unwrap playlist property if it exists
        let playlistData = data.data || data;
        playlistData =
          playlistData.playlist ||
          (Array.isArray(playlistData) ? playlistData[0] : playlistData);

        const tracksRaw =
          playlistData.tracks?.items ||
          playlistData.items ||
          data.data?.tracks?.items ||
          data.data?.items ||
          [];

        // Recursive scan for playlist info (matching album/artist scan)
        const scanForPlaylistMetadata = (
          value: any,
          visited = new Set(),
        ): any => {
          if (!value || typeof value !== "object" || visited.has(value))
            return null;
          visited.add(value);

          if (Array.isArray(value)) {
            for (const item of value) {
              const found = scanForPlaylistMetadata(item, visited);
              if (found) return found;
            }
            return null;
          }

          const item = value.item || value;
          // Look for an object that has playlist-like properties and matches our ID
          if (
            (item?.id || item?.uuid) &&
            String(item.id || item.uuid) === String(cleanId) &&
            item.title
          ) {
            return item;
          }

          for (const nested of Object.values(value)) {
            const found = scanForPlaylistMetadata(nested, visited);
            if (found) return found;
          }
          return null;
        };

        if (
          (!playlistData.title ||
            (!playlistData.image &&
              !playlistData.squareImage &&
              !playlistData.uuid)) &&
          tracksRaw.length > 0
        ) {
          const foundPlaylist = scanForPlaylistMetadata(data);
          if (foundPlaylist) {
            playlistData = { ...playlistData, ...foundPlaylist };
          }

          // If still missing, try search fallback (existing logic)
          if (
            !playlistData.title ||
            playlistData.title === "Unknown Playlist"
          ) {
            try {
              const searchResults = await this.search(
                playlistData.title || "Playlist",
                {
                  provider: "tidal",
                },
              );
              const found = searchResults.playlists.find(
                (p) => p.id.replace("t:", "") === cleanId,
              );
              if (found) {
                playlistData = { ...playlistData, ...found };
              }
            } catch (e) {
              console.warn(
                "Failed to fetch additional playlist info via search:",
                e,
              );
            }
          }
        }

        const playlist = this.transformTidalPlaylist(playlistData);
        let tracks = tracksRaw.map((t: any) =>
          this.transformTidalTrack(t.item || t),
        );

        // Handle pagination if there are more tracks
        if (playlist.trackCount && playlist.trackCount > tracks.length) {
          let offset = tracks.length;
          const SAFE_MAX_TRACKS = 1000;

          while (
            tracks.length < playlist.trackCount &&
            tracks.length < SAFE_MAX_TRACKS
          ) {
            try {
              const nextData = await apiService.getTidalPlaylist(
                cleanId,
                offset,
              );
              const nextItems = nextData.tracks?.items || nextData.items || [];
              if (nextItems.length === 0) break;

              const preparedItems = nextItems.map((i: any) =>
                this.transformTidalTrack(i.item || i),
              );

              if (tracks.length > 0 && preparedItems[0].id === tracks[0].id)
                break;

              tracks = tracks.concat(preparedItems);
              offset += preparedItems.length;
            } catch (error) {
              console.error(
                `Error fetching playlist tracks at offset ${offset}:`,
                error,
              );
              break;
            }
          }
        }

        const result = {
          ...playlist,
          tracks,
        };
        await storageService.saveMetadata(playlistId, result);
        return result;
    } catch {
      const metadata = await storageService.getDownloadMetadata(playlistId);
      if (metadata && metadata.type === "playlist") {
        let tracks: Track[] = [];
        if (metadata.item?.tracks && Array.isArray(metadata.item.tracks)) {
          tracks = metadata.item.tracks as Track[];
        }
        const base = metadata.item || {};
        const playlist: Playlist = {
          id: playlistId,
          title: base.title || "Offline Playlist",
          description: base.description,
          imageUrl: base.imageUrl,
          provider: base.provider || "tidal",
          trackCount: tracks.length,
        };
        return { ...playlist, tracks };
      }

      const cached = await storageService.getMetadata<any>(playlistId);
      if (cached) return cached;

      return null;
    }
  }

  async getRecommendedTracksForPlaylist(tracks: Track[], limit: number = 20) {
    if (this.skipArtistRecommendations) return [];
    if (tracks.length === 0) return [];

    const artistMap = new Map<
      string,
      { id: string; name: string; provider: string }
    >();
    for (const track of tracks) {
      if (track.artist)
        artistMap.set(track.artist.id, {
          ...track.artist,
          provider: track.provider,
        });
      if (track.artists) {
        for (const artist of track.artists) {
          artistMap.set(artist.id, { ...artist, provider: track.provider });
        }
      }
    }

    const artists = Array.from(artistMap.values());
    if (artists.length === 0) return [];

    const shuffledArtists = [...artists].sort(() => Math.random() - 0.5);
    const artistsToProcess = shuffledArtists.slice(0, 5);

    const recommendedTracks: Track[] = [];
    const seenTrackIds = new Set(tracks.map((t) => t.id));

    await Promise.all(
      artistsToProcess.map(async (artist) => {
        const artistData = await this.getArtist(
          artist.id,
          artist.provider as any,
        );
        if (artistData && (artistData as any).tracks) {
          const availableTracks = (artistData as any).tracks.filter(
            (t: Track) => !seenTrackIds.has(t.id),
          );
          const shuffled = availableTracks.sort(() => Math.random() - 0.5);
          recommendedTracks.push(...shuffled.slice(0, 4));
        }
      }),
    );

    return recommendedTracks.sort(() => Math.random() - 0.5).slice(0, limit);
  }

  async getAutoplayRecommendations(currentQueue: Track[], limit: number = 5): Promise<Track[]> {
    try {
      const [history, favorites, playlists] = await Promise.all([
        storageService.getHistory(),
        storageService.getFavorites("track"),
        storageService.getUserPlaylists(),
      ]);

      const recentQueueTracks = currentQueue.slice(
        Math.max(0, currentQueue.length - 10),
      );

      let potentialSeeds: Track[] = [];
      potentialSeeds.push(...recentQueueTracks);
      potentialSeeds.push(...favorites);
      potentialSeeds.push(...history);

      if (playlists && playlists.length > 0) {
        playlists.forEach((p) => {
          if (p.tracks) {
            potentialSeeds.push(...p.tracks);
          }
        });
      }

      const validSeeds = potentialSeeds.filter((t) => t && t.id);
      if (validSeeds.length === 0) return [];

      const seedMap = new Map<string, Track>();
      for (const t of validSeeds) {
        seedMap.set(t.id, t);
      }
      const uniqueSeeds = Array.from(seedMap.values());
      const shuffledSeeds = uniqueSeeds.sort(() => 0.5 - Math.random()).slice(0, 5);

      const recommendations = await this.getRecommendedTracksForPlaylist(shuffledSeeds, 20);

      const currentQueueIds = new Set(currentQueue.map((t) => t.id));
      let newTracks = recommendations.filter((t) => !currentQueueIds.has(t.id));

      newTracks = smartRecommendations.filterRecommendations(newTracks);
      newTracks = smartRecommendations.rankRecommendations(newTracks);

      return newTracks.slice(0, limit);
    } catch (error) {
      console.error("Failed to get autoplay recommendations:", error);
      return [];
    }
  }

  private deduplicateAlbums(albums: any[]) {
    const unique = new Map();
    for (const album of albums) {
      const key = JSON.stringify([album.title, album.numberOfTracks || 0]);
      if (unique.has(key)) {
        const existing = unique.get(key);
        if (album.explicit && !existing.explicit) {
          unique.set(key, album);
          continue;
        }
        if (!album.explicit && existing.explicit) continue;
        const existingTags = existing.mediaMetadata?.tags?.length || 0;
        const newTags = album.mediaMetadata?.tags?.length || 0;
        if (newTags > existingTags) unique.set(key, album);
      } else {
        unique.set(key, album);
      }
    }
    return Array.from(unique.values());
  }

  private async enrichTracksWithAlbumDates(tracks: any[], maxRequests = 10) {
    const albumIdsToFetch = Array.from(new Set(
      tracks.filter(t => !t.releaseDate && t.albumId).map(t => t.albumId)
    )).slice(0, maxRequests);

    if (albumIdsToFetch.length === 0) return tracks;

    const albumDateMap = new Map();
    await Promise.all(albumIdsToFetch.map(async (id) => {
      try {
        const albumData = await apiService.getTidalAlbum(id as string);
        if (albumData?.releaseDate) {
          albumDateMap.set(id, albumData.releaseDate);
        }
      } catch (e) { /* ignore */ }
    }));

    return tracks.map(track => {
      if (!track.releaseDate && albumDateMap.has(track.albumId)) {
        return { ...track, releaseDate: albumDateMap.get(track.albumId) };
      }
      return track;
    });
  }

  async getStreamUrl(
    trackId: string,
    providerId: "tidal" | "deezer" | "qobuz",
    preferredQuality: string = "HI_RES_LOSSLESS",
    options: { skipManifest?: boolean } = {},
  ) {
    // Normalize once so every provider branch can reuse the same cache key.
    const cacheKey = `stream_info_${trackId}_${preferredQuality}`;

    // Check stream cache first (matching web app's getStreamUrl cache check)
    const cached = this.streamCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < MusicService.STREAM_CACHE_TTL) {
      console.log(`[MusicService] Using cached stream URL for ${trackId}`);
      return cached.url;
    }

    const cleanId = trackId.replace(/^[tq]:/, "").replace("deezer:", "");

    // Step 0: Try Qobuz (primary source)
    if (providerId === "qobuz" || trackId.startsWith("q:")) {
      try {
        const qobuzUrl = await qobuzService.getStreamUrl(trackId, preferredQuality);
        if (qobuzUrl) {
          console.log(`[MusicService] Resolved Qobuz stream for ${trackId}`);
          this.streamCache.set(cacheKey, { url: qobuzUrl, quality: preferredQuality, timestamp: Date.now() });
          this.pruneStreamCache();
          this.saveStreamCache();
          return qobuzUrl;
        }
      } catch (e) {
        console.warn(`[MusicService] Qobuz stream failed for ${trackId}:`, e);
      }
    } else {
      // For Tidal/Deezer tracks, try to find an exact match on Qobuz via ISRC first!
      try {
        let isrc: string | undefined;
        if (providerId === "deezer") {
          isrc = await this.getDeezerTrackISRC(trackId) || undefined;
        } else {
          const trackInfo = await hifiClient.getTrackInfo(cleanId);
          isrc = (trackInfo as any)?.isrc;
        }

        if (isrc) {
          const qobuzSearch = await qobuzService.search(`isrc:${isrc}`, 1);
          if (qobuzSearch.tracks.length > 0) {
            const qobuzTrack = qobuzSearch.tracks[0];
            const qobuzUrl = await qobuzService.getStreamUrl(qobuzTrack.id, preferredQuality);
            if (qobuzUrl) {
              console.log(`[MusicService] Resolved track ${trackId} via Qobuz (ISRC Match: ${isrc})`);
              this.streamCache.set(cacheKey, { url: qobuzUrl, quality: preferredQuality, timestamp: Date.now() });
              this.pruneStreamCache();
              this.saveStreamCache();
              return qobuzUrl;
            }
          }
        }
      } catch (e) {
        console.warn(`[MusicService] Qobuz ISRC matching failed for ${trackId}:`, e);
      }
    }

    if (providerId === "deezer") {
      console.log(`[MusicService] Resolving Deezer track ${trackId}...`);

      // Try Deezer stream proxy (ISRC-based) — same as Monochrome
      try {
        const isrc = await this.getDeezerTrackISRC(trackId);
        if (isrc) {
          const formatMap: Record<string, string> = {
            HI_RES_LOSSLESS: 'FLAC',
            LOSSLESS: 'FLAC',
            HIGH: 'MP3_320',
            LOW: 'MP3_128',
          };
          const format = formatMap[preferredQuality] || 'FLAC';
          const proxyUrl = `https://dzr.tabs-vs-spaces.wtf/stream/?isrc=${encodeURIComponent(isrc)}&format=${encodeURIComponent(format)}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          const res = await fetch(proxyUrl, { method: 'HEAD', signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok || res.status === 405 || res.status === 501) {
            console.log(`[MusicService] Resolved Deezer ${trackId} via proxy (ISRC: ${isrc})`);
            this.streamCache.set(cacheKey, { url: proxyUrl, quality: preferredQuality, timestamp: Date.now() });
            this.pruneStreamCache();
            this.saveStreamCache();
            return proxyUrl;
          }
        }
      } catch (e) {
        console.warn(`[MusicService] Deezer proxy failed for ${trackId}:`, e);
      }

      return null;
    }

    // Step 1: Try Amazon Music (primary provider — matching Monochrome)
    try {
      const trackInfo = await hifiClient.getTrackInfo(cleanId);
      if (trackInfo) {
        const amazonResult = await getAmazonStream(
          {
            title: (trackInfo as any).title || '',
            artist: (trackInfo as any).artist?.name || (trackInfo as any).artists?.[0]?.name || '',
            album: (trackInfo as any).album?.title || '',
            duration: (trackInfo as any).duration || 0,
          },
          preferredQuality,
        );
        if (amazonResult) {
          console.log(`[MusicService] Got Amazon Music stream for ${trackId} (quality: ${amazonResult.quality})`);
          // If the stream is CENC-encrypted, decrypt it
          if (amazonResult.decryptionKey) {
            const decryptedPath = await decryptAmazonStream(
              amazonResult.url,
              amazonResult.decryptionKey,
              amazonResult.keyId,
            );
            if (decryptedPath) {
              console.log(`[MusicService] Decrypted Amazon stream for ${trackId}`);
              this.streamCache.set(cacheKey, { url: decryptedPath, quality: preferredQuality, timestamp: Date.now() });
              this.pruneStreamCache();
              this.saveStreamCache();
              return decryptedPath;
            }
          }
          // If no decryption needed (unencrypted stream), use directly
          this.streamCache.set(cacheKey, { url: amazonResult.url, quality: preferredQuality, timestamp: Date.now() });
          this.pruneStreamCache();
          this.saveStreamCache();
          return amazonResult.url;
        }
      }
    } catch (e) {
      console.warn(`[MusicService] Amazon Music failed for ${trackId}:`, e);
    }

    // Step 2: Try Deezer proxy (ISRC-based) — same as Monochrome
    const deezerUrl = await this.getDeezerStreamUrlViaProxy(cleanId, preferredQuality);
    if (deezerUrl) {
      console.log(`[MusicService] Resolved stream URL for ${trackId} via Deezer proxy`);
      this.streamCache.set(cacheKey, { url: deezerUrl, quality: preferredQuality, timestamp: Date.now() });
      this.pruneStreamCache();
      this.saveStreamCache();
      return deezerUrl;
    }

    // Step 3: Fall back to Tidal (returns PREVIEW for client-credentials tokens)
    const qualities = [preferredQuality, "LOSSLESS", "HIGH", "LOW"];
    const deduplicatedQualities = Array.from(new Set(qualities));

    for (const q of deduplicatedQualities) {
      try {
        const data = await apiService.getTidalTrackManifests(cleanId, q);
        const raw = data?.data?.data ?? data?.data ?? data;
        const attributes = raw?.attributes ?? {};

        // Worker path: uri is a signed CDN URL pointing to the manifest file
        const manifestUrl = attributes.uri;
        if (manifestUrl) {
          const url = await this.resolveTrackManifestsResponse(data, options.skipManifest);
          if (url) {
            console.log(`[MusicService] Resolved stream URL for ${trackId} with quality ${q} (worker)`);
            this.streamCache.set(cacheKey, { url, quality: q, timestamp: Date.now() });
            this.pruneStreamCache();
            this.saveStreamCache();
            return url;
          }
        }

        // HiFi path: manifest is inline base64, no uri
        const manifest = raw?.manifest;
        const manifestMimeType = raw?.manifestMimeType;
        if (manifest) {
          const presentation = attributes.trackPresentation ?? attributes.assetPresentation;
          if (presentation && presentation !== 'FULL') {
            console.warn(`[MusicService] Skipping non-FULL presentation: ${presentation}`);
            continue;
          }
          // Tidal API manifests are always base64-encoded (MIME type is "application/vnd.tidal.emu")
          const isBase64 = true;
          const url = await this.extractStreamUrlFromManifest(manifest, options.skipManifest, isBase64);
          if (url) {
            console.log(`[MusicService] Resolved stream URL for ${trackId} with quality ${q} (hifi)`);
            this.streamCache.set(cacheKey, { url, quality: q, timestamp: Date.now() });
            this.pruneStreamCache();
            this.saveStreamCache();
            return url;
          }
        }
      } catch (e) {
        console.warn(`[MusicService] Failed to get stream URL for ${trackId} quality ${q}:`, e);
      }
    }

    return null;
  }

  /**
   * Get ReplayGain normalization data for a track.
   * Returns track/album gain in dB and peak amplitudes.
   * Amazon: converts LUFS to ReplayGain dB via -14.0 - programLoudness.
   * Tidal: returns trackReplayGain/albumReplayGain directly.
   * Deezer: returns null (no RG data available from proxy).
   */
  async getReplayGain(
    trackId: string,
    providerId: "tidal" | "deezer" | "qobuz",
    preferredQuality: string = "HI_RES_LOSSLESS",
  ): Promise<{ trackGain: number; trackPeak: number; albumGain: number; albumPeak: number } | null> {
    if (providerId === "qobuz" || trackId.startsWith("q:")) {
      const rg = await qobuzService.getReplayGain(trackId);
      if (rg) return rg;
    }

    if (providerId === "deezer") return null;

    const cleanId = trackId.replace(/^[tq]:/, "");

    // Try Amazon first (has loudness data)
    try {
      const trackInfo = await hifiClient.getTrackInfo(cleanId);
      if (trackInfo) {
        const amazonResult = await getAmazonStream(
          {
            title: (trackInfo as any).title || '',
            artist: (trackInfo as any).artist?.name || (trackInfo as any).artists?.[0]?.name || '',
            album: (trackInfo as any).album?.title || '',
            duration: (trackInfo as any).duration || 0,
          },
          preferredQuality,
        );
        if (amazonResult?.replayGain) {
          const rg = amazonResult.replayGain;
          // Convert LUFS to ReplayGain dB: gain = -14.0 - programLoudness
          const trackGain = -14.0 - rg.programLoudness;
          // peakAmplitude is in dB, convert to linear
          const trackPeak = Math.pow(10, rg.peakAmplitude / 20);
          return {
            trackGain,
            trackPeak,
            albumGain: trackGain, // Amazon doesn't distinguish track/album
            albumPeak: trackPeak,
          };
        }
      }
    } catch (e) {
      console.warn(`[MusicService] Amazon RG failed for ${trackId}:`, e);
    }

    // Try Tidal directly
    try {
      const playbackInfo = await hifiClient.getPlaybackInfo(cleanId, preferredQuality);
      if (playbackInfo && (playbackInfo.trackReplayGain !== 0 || playbackInfo.albumReplayGain !== 0)) {
        return {
          trackGain: playbackInfo.trackReplayGain || 0,
          trackPeak: 1.0, // Tidal doesn't expose peak in our PlaybackInfo type
          albumGain: playbackInfo.albumReplayGain || 0,
          albumPeak: 1.0,
        };
      }
    } catch (e) {
      console.warn(`[MusicService] Tidal RG failed for ${trackId}:`, e);
    }

    return null;
  }

  /**
   * Get Deezer stream URL via proxy (matching web app's getDeezerStreamUrl).
   * Uses the same proxy endpoint as the web app: {baseUrl}/stream/?isrc=...&format=...
   */
  private async getDeezerStreamUrlViaProxy(
    tidalTrackId: string,
    preferredQuality: string,
  ): Promise<string | null> {
    try {
      // Step 1: Get ISRC from Tidal track info
      const trackInfo = await hifiClient.getTrackInfo(tidalTrackId);
      const isrc = (trackInfo as any).isrc;
      if (!isrc) {
        console.warn(`[MusicService] No ISRC found for track ${tidalTrackId}`);
        return null;
      }

      // Step 2: Map quality to Deezer format
      const formatMap: Record<string, string> = {
        HI_RES_LOSSLESS: 'FLAC',
        LOSSLESS: 'FLAC',
        HIGH: 'MP3_320',
        LOW: 'MP3_128',
      };
      const format = formatMap[preferredQuality] || 'FLAC';

      // Step 3: Call Deezer proxy endpoint (same as web app)
      const baseUrl = 'https://dzr.tabs-vs-spaces.wtf';
      const streamUrl = `${baseUrl}/stream/?isrc=${encodeURIComponent(isrc)}&format=${encodeURIComponent(format)}`;

      // Verify the URL works with a HEAD request (12s timeout, matching web app)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(streamUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok || res.status === 405 || res.status === 501) {
        return streamUrl;
      }
      console.warn(`[MusicService] Deezer proxy returned ${res.status} for ISRC ${isrc}`);
      return null;
    } catch (e: any) {
      console.warn(`[MusicService] Deezer proxy failed for track ${tidalTrackId}:`, e.message);
      return null;
    }
  }

  /**
   * Get ISRC from a Deezer track ID using the public Deezer API.
   * Monochrome uses ISRC-based matching for Deezer streams.
   */
  private async getDeezerTrackISRC(deezerTrackId: string): Promise<string | null> {
    try {
      const id = deezerTrackId.replace(/^deezer:/, '');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`https://api.deezer.com/2.0/track/${id}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const data = await res.json() as any;
      return data.isrc || null;
    } catch (e: any) {
      console.warn(`[MusicService] Deezer ISRC lookup failed for ${deezerTrackId}:`, e.message);
      return null;
    }
  }

  /**
   * Processes the /trackManifests/ response (web-aligned).
   * The endpoint returns { attributes: { uri, formats } } where uri is a signed
   * CDN URL pointing to the actual manifest file. We fetch it and extract the
   * audio stream URL — matching the web's normalizeTrackManifestResponse().
   */
  private async resolveTrackManifestsResponse(
  apiResponse: any,
  skipDASH?: boolean,
): Promise<string | null> {
  const raw = apiResponse?.data?.data ?? apiResponse?.data ?? apiResponse;
  const attributes = raw?.attributes ?? {};
  const manifestUrl = attributes.uri;

  if (!manifestUrl) return null;

  // ✅ ADD: Reject preview clips before even fetching the manifest
  const presentation = attributes.trackPresentation ?? attributes.assetPresentation;
  if (presentation && presentation !== 'FULL') {
    console.warn(`[MusicService] Skipping non-FULL manifest (presentation=${presentation}) for track`);
    return null;
  }

  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) return null;

  const manifestText = await manifestResponse.text();
  return await this.extractStreamUrlFromManifest(manifestText, skipDASH, false);
}

  async cacheTrack(track: Track): Promise<void> {
    try {
      // Check if already downloaded or cached
      const isAvailable = await storageService.isDownloaded(track.id);
      if (isAvailable) return;

      await this.downloadTrack(track, undefined, undefined, "cached");
      await this.enforceCacheLimit();
    } catch (error) {
      console.warn(`Failed to cache track ${track.id}:`, error);
    }
  }

  async enforceCacheLimit(): Promise<void> {
    try {
      const allDownloads = await storageService.getAllDownloads();

      // Filter only auto-cached tracks (never delete user manual downloads)
      const cachedTracks = allDownloads.filter(
        (d) => d.status === "cached" && d.type === "track",
      );

      if (cachedTracks.length <= this.CACHE_LIMIT) return;

      // Sort by addedAt ascending (oldest first)
      const sortedTracks = cachedTracks.sort((a, b) => a.addedAt - b.addedAt);

      // Number of tracks to delete to get back to the limit
      const itemsToDeleteCount = sortedTracks.length - this.CACHE_LIMIT;
      const tracksToDelete = sortedTracks.slice(0, itemsToDeleteCount);

      if (tracksToDelete.length > 0) {
        console.log(
          `Enforcing cache limit: deleting ${tracksToDelete.length} old cached tracks`,
        );

        for (const track of tracksToDelete) {
          // removeDownload already handles deleting from expo-file-system and removing metadata
          await this.removeDownload(track.id);
        }
      }
    } catch (error) {
      console.error("Failed to enforce cache limit:", error);
    }
  }

  async downloadTrack(
    track: Track,
    onProgress?: (progress: number) => void,
    parentId?: string,
    status: DownloadStatus = "downloading",
  ): Promise<void> {
    try {
      // Check if already downloaded
      const isDownloaded = await storageService.isDownloaded(track.id);
      if (isDownloaded && status !== "cached") return;
      if (isDownloaded && status === "cached") {
        // If already downloaded, no need to cache
        return;
      }

      // Initialize metadata IMMEDIATELY
      const minifiedItem = storageService.getMinifiedItem("track", track);
      const metadata: DownloadMetadata = {
        id: track.id,
        type: "track",
        status: status,
        progress: 0,
        addedAt: Date.now(),
        item: minifiedItem,
        parentId,
      };
      await storageService.saveDownloadMetadata(metadata);

      const settings = await settingsManager.getSettings();
      const preferredQuality = settings.downloadQuality;

      const streamUrl = await this.getStreamUrl(
        track.id,
        track.provider as any,
        preferredQuality,
        { skipManifest: true },
      );
      
      console.log(`[Download] Stream URL for ${track.title}: ${streamUrl?.substring(0, 60)}`);
      if (!streamUrl)
        throw new Error(
          `Failed to get stream URL for ${track.title} even with fallbacks.`,
        );

      const downloadDir = new Directory(Paths.document, "downloads");
      const fileName = `${track.id.replace(/:/g, "_")}.mp3`;
      const file = new File(downloadDir, fileName);

      // Ensure directory exists
      if (!downloadDir.exists) {
        downloadDir.create();
      }

      // Proactively check if destination file exists and delete it to avoid "Destination already exists" error
      if (file.exists) {
        try {
          file.delete();
        } catch (e) {
          console.warn(`Failed to delete existing file ${file.uri}:`, e);
        }
      }

      // Start download using resumable download for progress tracking
      const key = parentId || track.id;
      const downloadResumable = FileSystem.createDownloadResumable(
        streamUrl,
        file.uri,
        {},
        async (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;

          // Update metadata with current progress
          const currentMetadata = await storageService.getDownloadMetadata(
            track.id,
          );
          if (currentMetadata && currentMetadata.status === "downloading") {
            currentMetadata.progress = progress;
            await storageService.saveDownloadMetadata(currentMetadata);
          }

          if (onProgress) {
            onProgress(progress);
          }
        },
      );

      this.activeDownloads.set(key, downloadResumable);
      const result = await downloadResumable.downloadAsync();
      this.activeDownloads.delete(key);

      if (result && result.uri) {
        // Get fresh metadata to avoid stale data
        const freshMetadata = await storageService.getDownloadMetadata(
          track.id,
        );
        if (freshMetadata) {
          freshMetadata.status = "completed";
          freshMetadata.progress = 1;
          freshMetadata.localPath = result.uri;
          await storageService.saveDownloadMetadata(freshMetadata);
        }
      } else {
        throw new Error("Download failed");
      }
    } catch (error) {
      const key = parentId || track.id;
      if (this.cancelFlags.has(key)) {
        return;
      }
      console.error(`Failed to download track ${track.id}:`, error);
      const metadata = await storageService.getDownloadMetadata(track.id);
      if (metadata) {
        metadata.status = "error";
        await storageService.saveDownloadMetadata(metadata);
      }
      throw error;
    } finally {
      const key = parentId || track.id;
      if (key === track.id && this.cancelFlags.has(key)) {
        this.cancelFlags.delete(key);
      }
    }
  }

  async downloadAlbum(album: Album): Promise<void> {
    try {
      const albumData = await this.getAlbum(album.id);
      if (!albumData || !albumData.tracks)
        throw new Error("Failed to fetch album tracks");

      const minifiedAlbum = storageService.getMinifiedItem("album", album);
      const minifiedTracks = albumData.tracks.map((t) =>
        storageService.getMinifiedItem("track", t),
      );
      await storageService.saveDownloadMetadata({
        id: album.id,
        type: "album",
        status: "downloading",
        progress: 0,
        addedAt: Date.now(),
        item: { ...minifiedAlbum, tracks: minifiedTracks },
      });

      let completedCount = 0;
      for (const track of albumData.tracks) {
        try {
          if (this.cancelFlags.has(album.id)) break;
          await this.downloadTrack(track, undefined, album.id);
          completedCount++;
          await storageService.saveDownloadMetadata({
            id: album.id,
            type: "album",
            status: "downloading",
            progress: completedCount / albumData.tracks.length,
            addedAt: Date.now(),
            item: { ...minifiedAlbum, tracks: minifiedTracks },
          });
        } catch (e) {
          if (this.cancelFlags.has(album.id)) break;
          console.error(
            `Failed to download track ${track.id} in album ${album.id}:`,
            e,
          );
        }
      }

      const wasCancelled = this.cancelFlags.has(album.id);
      if (wasCancelled) {
        this.cancelFlags.delete(album.id);
        return;
      }
      await storageService.saveDownloadMetadata({
        id: album.id,
        type: "album",
        status: "completed",
        progress: 1,
        addedAt: Date.now(),
        item: { ...minifiedAlbum, tracks: minifiedTracks },
      });
    } catch (error) {
      console.error(`Failed to download album ${album.id}:`, error);
      throw error;
    }
  }

  async downloadPlaylist(playlist: Playlist): Promise<void> {
    try {
      const playlistData = await this.getPlaylist(
        playlist.id,
        playlist.provider as any,
      );
      if (!playlistData || !playlistData.tracks)
        throw new Error("Failed to fetch playlist tracks");

      const minifiedPlaylist = storageService.getMinifiedItem(
        "playlist",
        playlist,
      );
      const minifiedTracks = playlistData.tracks.map((t) =>
        storageService.getMinifiedItem("track", t),
      );
      await storageService.saveDownloadMetadata({
        id: playlist.id,
        type: "playlist",
        status: "downloading",
        progress: 0,
        addedAt: Date.now(),
        item: { ...minifiedPlaylist, tracks: minifiedTracks },
      });

      let completedCount = 0;
      for (const track of playlistData.tracks) {
        try {
          if (this.cancelFlags.has(playlist.id)) break;
          await this.downloadTrack(track, undefined, playlist.id);
          completedCount++;
          await storageService.saveDownloadMetadata({
            id: playlist.id,
            type: "playlist",
            status: "downloading",
            progress: completedCount / playlistData.tracks.length,
            addedAt: Date.now(),
            item: { ...minifiedPlaylist, tracks: minifiedTracks },
          });
        } catch (e) {
          if (this.cancelFlags.has(playlist.id)) break;
          console.error(
            `Failed to download track ${track.id} in playlist ${playlist.id}:`,
            e,
          );
        }
      }

      const wasCancelled = this.cancelFlags.has(playlist.id);
      if (wasCancelled) {
        this.cancelFlags.delete(playlist.id);
        return;
      }
      await storageService.saveDownloadMetadata({
        id: playlist.id,
        type: "playlist",
        status: "completed",
        progress: 1,
        addedAt: Date.now(),
        item: { ...minifiedPlaylist, tracks: minifiedTracks },
      });
    } catch (error) {
      console.error(`Failed to download playlist ${playlist.id}:`, error);
      throw error;
    }
  }

  async getPlaylistSyncStatus(
    playlistId: string,
  ): Promise<{ isSynced: boolean; missingTrackIds: string[] }> {
    try {
      const metadata = await storageService.getDownloadMetadata(playlistId);
      if (!metadata || metadata.status !== "completed") {
        return { isSynced: true, missingTrackIds: [] }; // Not a downloaded playlist
      }

      const playlistData = await this.getPlaylist(playlistId);
      if (!playlistData || !playlistData.tracks) {
        return { isSynced: true, missingTrackIds: [] };
      }

      const missingTrackIds: string[] = [];
      for (const track of playlistData.tracks) {
        const isTrackDownloaded = await storageService.isDownloaded(track.id);
        if (!isTrackDownloaded) {
          missingTrackIds.push(track.id);
        }
      }

      return {
        isSynced: missingTrackIds.length === 0,
        missingTrackIds,
      };
    } catch (error) {
      console.error("Error checking playlist sync status:", error);
      return { isSynced: true, missingTrackIds: [] };
    }
  }

  async syncPlaylistDownloads(playlistId: string): Promise<void> {
    try {
      const { isSynced, missingTrackIds } =
        await this.getPlaylistSyncStatus(playlistId);
      if (isSynced) return;

      const playlistData = await this.getPlaylist(playlistId);
      if (!playlistData || !playlistData.tracks) return;

      const missingTracks = playlistData.tracks.filter((t) =>
        missingTrackIds.includes(t.id),
      );

      // Update metadata to downloading
      const metadata = await storageService.getDownloadMetadata(playlistId);
      if (metadata) {
        metadata.status = "downloading";
        metadata.progress =
          (playlistData.tracks.length - missingTracks.length) /
          playlistData.tracks.length;
        await storageService.saveDownloadMetadata(metadata);
      }

      let completedCount = playlistData.tracks.length - missingTracks.length;
      for (const track of missingTracks) {
        try {
          if (this.cancelFlags.has(playlistId)) break;
          await this.downloadTrack(track, undefined, playlistId);
          completedCount++;

          if (metadata) {
            metadata.progress = completedCount / playlistData.tracks.length;
            await storageService.saveDownloadMetadata(metadata);
          }
        } catch (e) {
          console.error(`Failed to sync track ${track.id}:`, e);
        }
      }

      if (metadata && !this.cancelFlags.has(playlistId)) {
        metadata.status = "completed";
        metadata.progress = 1;
        await storageService.saveDownloadMetadata(metadata);
      }
    } catch (error) {
      console.error("Failed to sync playlist downloads:", error);
    }
  }

  async removeDownload(id: string): Promise<void> {
    try {
      const metadata = await storageService.getDownloadMetadata(id);
      if (!metadata) return;

      if (metadata.type === "track") {
        if (metadata.localPath) {
          const file = new File(metadata.localPath);
          if (file.exists) {
            file.delete();
          }
        }
        await storageService.removeDownloadMetadata(id);
      } else if (metadata.type === "album") {
        const all = await storageService.getAllDownloads();
        const tracks = all.filter(
          (d) =>
            d.type === "track" &&
            (d.item?.album?.id === String(id) || d.parentId === id),
        );
        for (const t of tracks) {
          if (t.localPath) {
            const file = new File(t.localPath);
            if (file.exists) {
              file.delete();
            }
          }
          await storageService.removeDownloadMetadata(t.id);
        }
        await storageService.removeDownloadMetadata(id);
      } else if (metadata.type === "playlist") {
        const all = await storageService.getAllDownloads();
        const tracks = all.filter(
          (d) => d.type === "track" && d.parentId === id,
        );
        for (const t of tracks) {
          if (t.localPath) {
            const file = new File(t.localPath);
            if (file.exists) {
              file.delete();
            }
          }
          await storageService.removeDownloadMetadata(t.id);
        }
        await storageService.removeDownloadMetadata(id);
      }
    } catch (error) {
      console.error(`Failed to remove download ${id}:`, error);
    }
  }

  async cancelDownload(id: string): Promise<void> {
    try {
      this.cancelFlags.add(id);

      // Cancel active track download if any
      const activeDownload = this.activeDownloads.get(id);
      if (activeDownload) {
        try {
          await activeDownload.cancelAsync();
          this.activeDownloads.delete(id);
        } catch (e) {
          console.warn(`Failed to cancel active download for ${id}:`, e);
        }
      }

      const meta = await storageService.getDownloadMetadata(id);
      if (meta) {
        if (meta.type === "album" || meta.type === "playlist") {
          // For albums/playlists, we need to cancel any active child track downloads
          const allDownloads = await storageService.getAllDownloads();
          const children = allDownloads.filter((d) => d.parentId === id);
          for (const child of children) {
            this.cancelFlags.add(child.id);
            const childDownload = this.activeDownloads.get(child.id);
            if (childDownload) {
              try {
                await childDownload.cancelAsync();
                this.activeDownloads.delete(child.id);
              } catch (e) {
                console.warn(
                  `Failed to cancel child download ${child.id} for parent ${id}:`,
                  e,
                );
              }
            }
          }
        }

        await this.removeDownload(id);
        try {
          await storageService.removeFavorite(meta.type, id);
        } catch {}
      } else {
        // Fallback for cases where metadata might be missing but we have children
        try {
          const all = await storageService.getAllDownloads();
          const children = all.filter(
            (d) => d.type === "track" && d.parentId === id,
          );
          for (const t of children) {
            this.cancelFlags.add(t.id);
            const childDownload = this.activeDownloads.get(t.id);
            if (childDownload) {
              try {
                await childDownload.cancelAsync();
                this.activeDownloads.delete(t.id);
              } catch (e) {}
            }

            if (t.localPath) {
              const file = new File(t.localPath);
              if (file.exists) {
                file.delete();
              }
            }
            await storageService.removeDownloadMetadata(t.id);
          }
          await storageService.removeDownloadMetadata(id);
          try {
            await storageService.removeFavorite("album", id);
          } catch {}
          try {
            await storageService.removeFavorite("playlist", id);
          } catch {}
        } catch {}
      }
    } catch (e) {
      console.error(`Error in cancelDownload for ${id}:`, e);
    }
  }

  /**
   * Extracts a playable stream URL from a Tidal manifest.
   *
   * Handles three manifest formats returned by the monochrome workers:
   *   1. DASH/MPD XML   — extracts the <BaseURL> CDN URL directly (lossless/hi-res)
   *   2. JSON { urls }  — returns the first URL (AAC/LOW quality)
   *   3. Plain URL      — regex fallback
   *
   * `isBase64` controls whether to attempt base64 decoding first.
   * Pass false when the input is already a decoded string (from resolveTrackManifestsResponse).
   *
   * Note: Unlike the web which creates a Blob URL for browser DASH playback,
   * mobile extracts the raw CDN URL so expo-audio can play it directly.
   */
  async extractStreamUrlFromManifest(
    manifest: string | object,
    skipDASH?: boolean,
    isBase64: boolean = true,
  ): Promise<string | null> {
    if (!manifest) return null;

    try {
      // Handle already-parsed object manifest
      if (typeof manifest === "object") {
        const m = manifest as any;
        if (m.urls && Array.isArray(m.urls) && m.urls.length > 0) return m.urls[0];
        if (m.url) return m.url;
        return null;
      }

      let decoded: string;
      if (isBase64) {
        try {
          decoded = atob(manifest as string);
        } catch {
          decoded = manifest as string; // not base64 — use as-is
        }
      } else {
        decoded = manifest as string;
      }

      // DASH/MPD manifest — try to extract direct URL from BaseURL first,
      // only fall back to writing .mpd file for ExoPlayer if no direct URL found.
      if (decoded.includes('<MPD')) {
  if (skipDASH) return null;

  // Try to extract direct stream URL from BaseURL element
  const baseUrlMatch = decoded.match(/<BaseURL>([^<]+)<\/BaseURL>/);
  if (baseUrlMatch && baseUrlMatch[1].startsWith('http')) {
    return baseUrlMatch[1];
  }

  // Reject preview MPDs by duration attribute
  const durationMatch = decoded.match(/mediaPresentationDuration="PT(\d+)S"/);
  if (durationMatch) {
    const durationSeconds = parseInt(durationMatch[1], 10);
    if (durationSeconds <= 30) {
      console.warn(`[MusicService] Rejecting MPD with preview duration: ${durationSeconds}s`);
      return null;
    }
  }

  // No direct BaseURL found — expo-audio cannot play adaptive DASH manifests.
  // Return null so the caller falls back to lower quality tiers.
  console.warn('[MusicService] DASH manifest has no BaseURL — falling back to lower quality');
  return null;
}

      // JSON manifest — { urls: [...] } (AAC/LOW quality)
      try {
        const parsed = JSON.parse(decoded);
        if (parsed?.urls && Array.isArray(parsed.urls) && parsed.urls.length > 0) {
          return parsed.urls[0];
        }
        if (parsed?.url) return parsed.url;
      } catch {
        // Not JSON — try URL regex
        const match = decoded.match(/https?:\/\/[\w\-.~:?#[@!$&'()*+,;=%/]+/);
        return match ? match[0] : null;
      }
    } catch (error) {
      console.error("Failed to decode manifest:", error);
    }
    return null;
  }

  getCoverUrl(coverIdOrTrack: string | any, sizeOrProvider: string = "320", maybeSize?: string) {
    let coverId: string | undefined;
    let albumId: string | undefined;
    let provider: string;
    let size: string;

    if (typeof coverIdOrTrack === "string") {
      // New path: getCoverUrl("abc-def-123", "tidal", "320")
      coverId = coverIdOrTrack;
      provider = sizeOrProvider || "tidal";
      size = maybeSize || "320";
    } else {
      // Legacy path: getCoverUrl(track, "320")
      const track = coverIdOrTrack;
      coverId = track.cover || track.album?.cover;
      albumId = track.album?.id || track.id;
      provider = track.provider || "tidal";
      size = sizeOrProvider || "320";
    }

    const id = String(coverId || albumId || "");
    if (!id || id === "undefined" || id === "null" || id === "0")
      return undefined;

    if (id.startsWith("http")) return id;

    if (provider === "deezer") {
      const cleanId = id.replace("deezer:", "");
      if (cleanId.startsWith("http")) return cleanId;
      return `https://e-cdns-images.dzcdn.net/images/cover/${cleanId}/${size}x${size}.jpg`;
    } else {
      const cleanId = id.replace("t:", "");
      const path = cleanId.includes("-") ? cleanId.replace(/-/g, "/") : cleanId;
      return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
    }
  }

  getShareUrl(track: Track) {
    const cleanId = track.id.replace(/^[tq]:/, "").replace("deezer:", "");
    if (track.provider === "tidal") {
      return `https://tidal.com/track/${cleanId}`;
    } else if (track.provider === "deezer") {
      return `https://www.deezer.com/track/${cleanId}`;
    } else {
      return `https://tidal.com/track/${cleanId}`;
    }
  }

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  private parseIsoDuration(iso: string | undefined): number | undefined {
    if (!iso || typeof iso !== "string") return undefined;
    const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
    const hours = parseInt(m[1] || "0", 10);
    const minutes = parseInt(m[2] || "0", 10);
    const seconds = parseInt(m[3] || "0", 10);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  private transformTidalTrack(track: any): Track {
    const mainArtist = track.artist ||
      (Array.isArray(track.artists) && track.artists.length > 0
        ? track.artists[0]
        : null) || { id: "0", name: "Unknown Artist" };

    const albumId = track.album?.id || track.albumId || "0";
    const albumTitle = track.album?.title || "Unknown Album";

    const cleanTitle = (track.title || "Unknown Title")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();
    const cleanAlbumTitle = (albumTitle || "Unknown Album")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();

    const trackId = track.id || track.trackId;
    let duration = track.duration;

    if (typeof duration === "string" && duration.startsWith("PT")) {
      duration = this.parseIsoDuration(duration) || 0;
    } else if (typeof duration === "number") {
      if (duration > 0 && duration < 36000) {
        duration = duration * 1000;
      }
    } else {
      duration = 0;
    }

    return {
      id: `t:${trackId}`,
      title: cleanTitle,
      artist: { id: `t:${mainArtist.id}`, name: mainArtist.name || "Unknown Artist" },
      artists: (track.artists || [mainArtist]).map((a: any) => ({
        id: `t:${a.id}`,
        name: a.name || "Unknown Artist",
      })),
      album: {
        id: `t:${albumId}`,
        title: cleanAlbumTitle,
        coverUrl: this.getCoverUrl(track.album?.cover || track.cover || albumId, "tidal"),
      },
      duration,
      provider: "tidal",
      quality: track.audioQuality || track.quality,
      explicit: !!track.explicit,
      trackNumber: track.trackNumber,
      releaseDate: track.releaseDate || track.album?.releaseDate,
      isUnavailable: track.allowStreaming === false,
      isrc: track.isrc,
      _raw: track,
    } as Track;
  }

  private transformTidalAlbum(album: any): Album {
    const mainArtist = album.artist ||
      (Array.isArray(album.artists) && album.artists.length > 0
        ? album.artists[0]
        : null) || { id: "0", name: "Unknown" };

    const cleanTitle = (album.title || "Unknown Album")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();

    return {
      id: `t:${album.id}`,
      title: cleanTitle,
      artist: { id: `t:${mainArtist.id}`, name: mainArtist.name },
      coverUrl: this.getCoverUrl(album.cover || album.id, "tidal"),
      provider: "tidal",
      trackCount: album.numberOfTracks,
      releaseDate: album.releaseDate,
      type: album.type || album.productType || "ALBUM",
      explicit: !!album.explicit,
      _raw: album,
    };
  }

  private transformTidalArtist(artist: any): Artist {
    const imageId = artist.picture || artist.cover || artist.id;
    if (!imageId) {
      return {
        id: `t:${artist.id}`,
        name: artist.name || "Unknown Artist",
        provider: "tidal",
      };
    }

    let imageUrl;
    if (typeof imageId === "string" && imageId.startsWith("http")) {
      imageUrl = imageId;
    } else {
      const id = String(imageId).replace("t:", "");
      const path = id.includes("-") ? id.replace(/-/g, "/") : id;
      imageUrl = `https://resources.tidal.com/images/${path}/320x320.jpg`;
    }

    return {
      id: `t:${artist.id}`,
      name: artist.name || "Unknown Artist",
      imageUrl: imageUrl,
      provider: "tidal",
    };
  }

  private transformTidalPlaylist(playlist: any): Playlist {
    const imageId =
      playlist.squareImage ||
      playlist.image ||
      (Array.isArray(playlist.images) && playlist.images.length > 0
        ? playlist.images[0]
        : null) ||
      playlist.uuid ||
      playlist.id;

    let imageUrl;
    if (!imageId) {
      imageUrl = undefined;
    } else if (typeof imageId === "string" && imageId.startsWith("http")) {
      imageUrl = imageId;
    } else {
      const id = String(imageId).replace("t:", "");
      const path = id.includes("-") ? id.replace(/-/g, "/") : id;
      imageUrl = `https://resources.tidal.com/images/${path}/320x320.jpg`;
    }

    return {
      id: `t:${playlist.uuid || playlist.id}`,
      title: playlist.title || "Unknown Playlist",
      description: playlist.description,
      imageUrl: imageUrl,
      provider: "tidal",
      trackCount: playlist.numberOfTracks,
    };
  }
}

export const musicService = new MusicService();
