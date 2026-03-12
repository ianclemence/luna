import axios from "axios";
import { decode as atob } from "base-64";
import * as BackgroundTask from "expo-background-task";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as TaskManager from "expo-task-manager";
import { apiService } from "./api-service";
import { DownloadMetadata, storageService } from "./storage-service";
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
  private currentProvider: "tidal" | "qobuz" = "tidal";
  private skipArtistRecommendations = true;
  private cancelFlags: Set<string> = new Set();
  private activeDownloads: Map<string, FileSystem.DownloadResumable> =
    new Map();
  private isProcessingQueue = false;
  private backgroundTaskInitialized = false;

  constructor() {
  }

  async initBackgroundFetch() {
    if (this.backgroundTaskInitialized) return;
    this.backgroundTaskInitialized = true;
    try {
      if (!TaskManager.isTaskDefined(DOWNLOAD_TASK_NAME)) {
        TaskManager.defineTask(DOWNLOAD_TASK_NAME, async () => {
          try {
            console.log("[BackgroundTask] Processing download queue...");
            const hasMore = await this.processDownloadQueue();
            return hasMore
              ? BackgroundTask.BackgroundTaskResult.NewData
              : BackgroundTask.BackgroundTaskResult.NoData;
          } catch (error) {
            console.error("[BackgroundTask] Error:", error);
            return BackgroundTask.BackgroundTaskResult.Failed;
          }
        });
      }

      await BackgroundTask.registerTaskAsync(DOWNLOAD_TASK_NAME, {
        minimumInterval: 60 * 15, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });
    } catch (error) {
      console.warn("BackgroundTask registration failed:", error);
    }
  }

  private async processDownloadQueue(): Promise<boolean> {
    if (this.isProcessingQueue) return false;
    this.isProcessingQueue = true;

    try {
      const allMetadata = await storageService.getAllDownloadMetadata();
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
  async getLyrics(track: Track): Promise<LyricsData | null> {
    try {
      // Check cache first
      const cached = await storageService.getLyrics(track.id);
      if (cached) return cached;

      const artist = track.artists
        ? track.artists.map((a) => a.name).join(", ")
        : track.artist?.name || "";
      const title = track.title || "";
      const album = track.album?.title || "";
      const duration = track.duration ? Math.round(track.duration) : null;

      if (!title || !artist) {
        console.warn("Missing required fields for LRCLIB");
        return null;
      }

      const params: any = {
        track_name: title,
        artist_name: artist,
      };

      if (album) params.album_name = album;
      if (duration) params.duration = duration.toString();

      const response = await axios.get("https://lrclib.net/api/get", {
        params,
      });

      if (response.status === 200 && response.data) {
        const data = response.data;
        let lyricsData: LyricsData | null = null;

        if (data.syncedLyrics) {
          lyricsData = {
            trackId: track.id,
            lines: this.parseLRC(data.syncedLyrics),
            provider: "LRCLIB",
            source: "synced",
          };
        } else if (data.plainLyrics) {
          lyricsData = {
            trackId: track.id,
            lines: data.plainLyrics.split("\n").map((text: string) => ({
              time: 0,
              text: text.trim(),
            })),
            provider: "LRCLIB",
            source: "plain",
          };
        }

        if (lyricsData) {
          await storageService.saveLyrics(track.id, lyricsData);
          return lyricsData;
        }
      }
    } catch (error) {
      console.warn("LRCLIB fetch failed:", error);
    }

    return null;
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

  setProvider(provider: "tidal" | "qobuz") {
    this.currentProvider = provider;
  }

  getProvider() {
    return this.currentProvider;
  }

  async search(
    query: string,
    options: { provider?: "tidal" | "qobuz"; signal?: AbortSignal } = {},
  ) {
    const provider = options.provider || this.currentProvider;

    try {
      if (provider === "qobuz") {
        const [tracksData, albumsData, artistsData] = await Promise.all([
          apiService.searchQobuzTracks(query, 0, 20),
          apiService.searchQobuzAlbums(query, 0, 20),
          apiService.searchQobuzArtists(query, 0, 20),
        ]);

        return {
          tracks: (tracksData.data?.tracks?.items || []).map((track: any) =>
            this.transformQobuzTrack(track),
          ),
          albums: (albumsData.data?.albums?.items || []).map((album: any) =>
            this.transformQobuzAlbum(album),
          ),
          artists: (artistsData.data?.artists?.items || []).map((artist: any) =>
            this.transformQobuzArtist(artist),
          ),
          playlists: [], // Qobuz doesn't support playlist search in this API
        };
      } else {
        const [tracksData, albumsData, artistsData, playlistsData] =
          await Promise.all([
            apiService.searchTidalTracks(query, { signal: options.signal }),
            apiService.searchTidalAlbums(query, { signal: options.signal }),
            apiService.searchTidalArtists(query, { signal: options.signal }),
            apiService.searchTidalPlaylists(query, { signal: options.signal }),
          ]);

        return {
          tracks: (
            this.findSearchSection(tracksData, "tracks")?.items || []
          ).map((track: any) => this.transformTidalTrack(track)),
          albums: (
            this.findSearchSection(albumsData, "albums")?.items || []
          ).map((album: any) => this.transformTidalAlbum(album)),
          artists: (
            this.findSearchSection(artistsData, "artists")?.items || []
          ).map((artist: any) => this.transformTidalArtist(artist)),
          playlists: (
            this.findSearchSection(playlistsData, "playlists")?.items || []
          ).map((playlist: any) => this.transformTidalPlaylist(playlist)),
        };
      }
    } catch (error) {
      if (axios.isCancel(error)) throw error;
      console.error("Search failed:", error);
      return { tracks: [], albums: [], artists: [], playlists: [] };
    }
  }

  async getHomeData(
    seeds: Track[] = [],
    jumpBackIn: (Track | Album | Playlist | any)[] = [],
  ) {
    try {
      if (seeds.length === 0 && jumpBackIn.length === 0) {
        const results = await Promise.allSettled([
          apiService.getHotExplore(),
          apiService.getTidalNewReleases(),
        ]);
        const hotData =
          results[0].status === "fulfilled" ? results[0].value : null;
        const newReleasesData =
          results[1].status === "fulfilled" ? results[1].value : null;

        const trendingAlbums = (hotData?.top_albums || []).map((a: any) =>
          this.transformTidalAlbum(a),
        );

        const trendingTracks = (hotData?.top_tracks || []).map((t: any) =>
          this.transformTidalTrack(t),
        );

        const newAlbums = newReleasesData
          ? (
              this.findSearchSection(newReleasesData, "albums")?.items || []
            ).map((a: any) => this.transformTidalAlbum(a))
          : [];

        return {
          trendingAlbums: trendingAlbums.slice(0, 10),
          trendingTracks: trendingTracks.slice(0, 10),
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

  async searchTracks(
    query: string,
    options: { provider?: "tidal" | "qobuz" } = {},
  ) {
    const results = await this.search(query, options);
    return results.tracks;
  }

  async getTrackRecommendations(
    trackId: string,
    provider: "tidal" | "qobuz" = "tidal",
  ) {
    try {
      const cleanId = trackId.replace(/^[tq]:/, "");
      if (provider === "tidal") {
        const data = await apiService.getTidalRecommendations(cleanId);
        const items = data.items || data || [];
        return items.map((item: any) =>
          this.transformTidalTrack(item.track || item),
        );
      }
      return []; // Qobuz doesn't have a direct recommendations endpoint in our API yet
    } catch (error) {
      console.error("Failed to fetch track recommendations:", error);
      return [];
    }
  }

  async getSimilarAlbums(
    albumId: string,
    provider: "tidal" | "qobuz" = "tidal",
  ) {
    try {
      const cleanId = albumId.replace(/^[tq]:/, "");
      if (provider === "tidal") {
        const data = await apiService.getTidalSimilarAlbums(cleanId);
        const items = data.items || data.albums || data || [];
        return items.map((item: any) => this.transformTidalAlbum(item));
      }
      return [];
    } catch (error) {
      console.error("Failed to fetch similar albums:", error);
      return [];
    }
  }

  async getArtist(artistId: string, provider?: "tidal" | "qobuz") {
    try {
      const effectiveProvider =
        provider || (artistId.startsWith("q:") ? "qobuz" : "tidal");
      const cleanId = artistId.replace(/^[tq]:/, "");
      if (effectiveProvider === "tidal") {
        const [primaryData, contentData] = await Promise.all([
          apiService.getTidalArtist(cleanId),
          apiService.getTidalArtistContent(cleanId),
        ]);

        if (primaryData.success === false) {
          console.error("Failed to fetch artist from any instance");
          return null;
        }

        // Aligning with luna's fallback logic for missing artist metadata
        let artistRaw = primaryData;
        const scanForArtist = (value: any, visited = new Set()) => {
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

        const isTrack = (v: any) => v?.id && v.duration && v.album;
        const isAlbum = (v: any) => v?.id && "numberOfTracks" in v;

        const scan = (value: any, visited = new Set()) => {
          if (!value || typeof value !== "object" || visited.has(value)) return;
          visited.add(value);

          if (Array.isArray(value)) {
            value.forEach((item) => scan(item, visited));
            return;
          }

          const item = value.item || value;
          if (isAlbum(item)) albumMap.set(item.id, item);
          if (isTrack(item)) trackMap.set(item.id, item);

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
              const matchesArtist =
                Number(album.artist?.id?.replace("t:", "")) === numericArtistId;
              if (matchesArtist && !albumMap.has(albumId)) {
                // We'll use the already transformed album if possible, or re-transform
                // For simplicity here, we just use the search result which is already transformed
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch additional albums via search:", e);
        }

        const rawReleases = Array.from(albumMap.values());
        const allReleases = rawReleases
          .map((a) => this.transformTidalAlbum(a))
          .sort(
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

        const similarArtists = (
          similarArtistsData.items ||
          similarArtistsData ||
          []
        ).map((item: any) => this.transformTidalArtist(item));

        return {
          ...artist,
          albums,
          eps,
          tracks: topTracks,
          biography: bio?.text,
          socials: socials,
          similarArtists,
        };
      } else {
        const data = await apiService.getQobuzArtist(cleanId);
        return {
          ...this.transformQobuzArtist(data),
          tracks: (data.tracks?.items || []).map((t: any) =>
            this.transformQobuzTrack(t),
          ),
          albums: (data.albums?.items || []).map((a: any) =>
            this.transformQobuzAlbum(a),
          ),
        };
      }
    } catch (error: any) {
      console.warn(`Artist fetch failed: ${artistId}`);
      return null;
    }
  }

  async getAlbum(albumId: string, provider?: "tidal" | "qobuz") {
    try {
      const effectiveProvider =
        provider || (albumId.startsWith("q:") ? "qobuz" : "tidal");
      const cleanId = albumId.replace(/^[tq]:/, "");
      if (effectiveProvider === "tidal") {
        const data = await apiService.getTidalAlbum(cleanId);
        if (data.success === false) {
          console.error("Failed to fetch album from any instance");
          return null;
        }

        // Aligning with luna's fallback logic for missing metadata
        let albumData = data.data || data;
        const tracksRaw =
          albumData.tracks?.items ||
          albumData.items ||
          data.data?.tracks?.items ||
          data.data?.items ||
          [];

        // If the root object is missing artist or title, try to find it recursively (matching artist scan)
        const scanForAlbumMetadata = (value: any, visited = new Set()) => {
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

        if (!albumData.title || !albumData.artist) {
          const foundAlbum = scanForAlbumMetadata(data);
          if (foundAlbum) {
            albumData = { ...albumData, ...foundAlbum };
          } else if (tracksRaw.length > 0) {
            const firstTrack = tracksRaw[0].item || tracksRaw[0];
            if (firstTrack.album) {
              albumData = { ...albumData, ...firstTrack.album };
            }
          }
        }

        const album = this.transformTidalAlbum(albumData);
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
        const similarAlbumsData =
          await apiService.getTidalSimilarAlbums(cleanId);
        const similarAlbums = (
          similarAlbumsData.items ||
          similarAlbumsData.albums ||
          similarAlbumsData ||
          []
        ).map((item: any) => this.transformTidalAlbum(item));

        return {
          ...album,
          tracks,
          similarAlbums,
        };
      } else {
        const data = await apiService.getQobuzAlbum(cleanId);
        return {
          ...this.transformQobuzAlbum(data),
          tracks: (data.tracks?.items || []).map((t: any) =>
            this.transformQobuzTrack(t),
          ),
        };
      }
    } catch (error: any) {
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
      return null;
    }
  }

  async getPlaylist(playlistId: string, provider?: "tidal" | "qobuz") {
    // Check if it's a user-created local playlist
    if (playlistId.startsWith("local:")) {
      return storageService.getUserPlaylist(playlistId);
    }

    try {
      const effectiveProvider =
        provider || (playlistId.startsWith("q:") ? "qobuz" : "tidal");
      const cleanId = playlistId.replace(/^[tq]:/, "");
      if (effectiveProvider === "tidal") {
        const data = await apiService.getTidalPlaylist(cleanId);
        if (data.success === false) {
          console.error("Failed to fetch playlist from any instance");
          return null;
        }

        // Aligning with luna's fallback logic for missing playlist metadata
        let playlistData = data.data || data;
        const tracksRaw =
          playlistData.tracks?.items ||
          playlistData.items ||
          data.data?.tracks?.items ||
          data.data?.items ||
          [];

        // Recursive scan for playlist info (matching album/artist scan)
        const scanForPlaylistMetadata = (value: any, visited = new Set()) => {
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

        return {
          ...playlist,
          tracks,
        };
      } else {
        const data = await apiService.getQobuzPlaylist(cleanId);
        return {
          ...this.transformQobuzPlaylist(data),
          tracks: (data.tracks?.items || []).map((t: any) =>
            this.transformQobuzTrack(t),
          ),
        };
      }
    } catch (error: any) {
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

  private findSearchSection(data: any, key: string): any {
    if (!data || typeof data !== "object") return null;
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = this.findSearchSection(item, key);
        if (found) return found;
      }
      return null;
    }
    if ("items" in data && Array.isArray(data.items)) return data;
    if (key in data) return this.findSearchSection(data[key], key);
    for (const value of Object.values(data)) {
      const found = this.findSearchSection(value, key);
      if (found) return found;
    }
    return null;
  }

  async getStreamUrl(
    trackId: string,
    provider: "tidal" | "qobuz",
    quality: string = "HI_RES_LOSSLESS",
    options: { skipManifest?: boolean } = {},
  ) {
    if (provider === "qobuz") {
      try {
        const response = await apiService.getQobuzStreamUrl(
          trackId.replace("q:", ""),
        );
        // Handle both { success: true, data: { url: "..." } } and { url: "..." }
        const data = response.data || response;
        return data.url || null;
      } catch (error) {
        console.warn(
          `Failed to get Qobuz stream URL for track ${trackId}:`,
          error,
        );
        return null;
      }
    } else {
      const qualities = [quality, "LOSSLESS", "HIGH", "LOW"];
      const cleanId = trackId.replace("t:", "");

      for (const q of qualities) {
        try {
          const rawResponse = await apiService.getTidalTrackInfo(cleanId, q);

          // Unwrap { version, data } if present (matching luna's normalizeTrackResponse)
          const data = rawResponse.data || rawResponse;

          // Handle both cases: OriginalTrackUrl at root or inside data
          if (data.originalTrackUrl || data.OriginalTrackUrl) {
            return data.originalTrackUrl || data.OriginalTrackUrl;
          }

          // Handle manifest in different locations
          const manifest = data.manifest || data.info?.manifest;
          if (manifest) {
            const url = await this.extractStreamUrlFromManifest(
              manifest,
              options.skipManifest,
            );
            if (url) return url;
          }

          // Fallback if the response is direct (some instances might do this)
          if (data.url) return data.url;
        } catch (error) {
          console.warn(
            `Failed to get stream URL for track ${trackId} with quality ${q}, trying next...`,
          );
        }
      }
      return null;
    }
  }

  async downloadTrack(
    track: Track,
    onProgress?: (progress: number) => void,
    parentId?: string,
  ): Promise<void> {
    try {
      if (!parentId) {
        try {
          await storageService.ensureFavorite("track", track);
        } catch {}
      }
      // Check if already downloaded
      const isDownloaded = await storageService.isDownloaded(track.id);
      if (isDownloaded) return;

      // Initialize metadata as downloading IMMEDIATELY
      const minifiedItem = storageService.getMinifiedItem("track", track);
      const metadata: DownloadMetadata = {
        id: track.id,
        type: "track",
        status: "downloading",
        progress: 0,
        addedAt: Date.now(),
        item: minifiedItem,
        parentId,
      };
      await storageService.saveDownloadMetadata(metadata);

      const streamUrl = await this.getStreamUrl(
        track.id,
        track.provider as any,
        "HI_RES_LOSSLESS",
        { skipManifest: true },
      );
      if (!streamUrl)
        throw new Error(
          "Failed to get stream URL or track is DASH only (not downloadable)",
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
      try {
        await storageService.ensureFavorite("album", album);
      } catch {}
      const albumData = await this.getAlbum(album.id, album.provider as any);
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
      try {
        await storageService.ensureFavorite("playlist", playlist);
      } catch {}
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

  private async extractStreamUrlFromManifest(
    manifest: string,
    skipDASH?: boolean,
  ): Promise<string | null> {
    try {
      const decoded = atob(manifest);

      // Handle DASH manifests (XML)
      if (decoded.includes("<MPD")) {
        if (skipDASH) return null;

        // For mobile, we write the manifest to a temporary file with .mpd extension
        // This allows expo-audio/ExoPlayer to recognize it as DASH
        const fileName = `manifest_${Date.now()}.mpd`;
        const file = new File(Paths.cache, fileName);
        await file.write(decoded);

        // Ensure it has file:// prefix for expo-audio if not already present
        return file.uri.startsWith("file://") ? file.uri : `file://${file.uri}`;
      }

      try {
        const parsed = JSON.parse(decoded);
        if (parsed?.urls?.[0]) {
          return parsed.urls[0];
        }
      } catch {
        const match = decoded.match(/https?:\/\/[\w\-.~:?#[@!$&'()*+,;=%/]+/);
        return match ? match[0] : null;
      }
    } catch (error) {
      console.error("Failed to decode manifest:", error);
    }
    return null;
  }

  getCoverUrl(track: Track | any, size: string = "320") {
    // If we have a direct cover ID (as in luna's getCoverUrl)
    let coverId = track.cover || track.album?.cover;
    const albumId = track.album?.id || track.id;
    const provider = track.provider || "tidal";

    const id = String(coverId || albumId);
    if (!id || id === "undefined" || id === "null" || id === "0")
      return undefined;

    if (id.startsWith("http")) return id;

    if (provider === "qobuz") {
      const cleanId = id.replace("q:", "");
      return `https://static.qobuz.com/images/covers/${cleanId.slice(-2)}/${cleanId.slice(-4, -2)}/${cleanId}_${size}.jpg`;
    } else {
      // For Tidal, if we don't have a cover ID, we use the album ID as a fallback
      const cleanId = id.replace("t:", "");
      // Tidal cover IDs can be UUIDs (with dashes) or simple IDs
      const path = cleanId.includes("-") ? cleanId.replace(/-/g, "/") : cleanId;
      return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
    }
  }

  getShareUrl(track: Track) {
    const cleanId = track.id.replace(/^[tq]:/, "");
    if (track.provider === "tidal") {
      return `https://tidal.com/track/${cleanId}`;
    } else {
      return `https://www.qobuz.com/track/${cleanId}`;
    }
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  private transformTidalTrack(track: any): Track {
    const mainArtist = track.artist ||
      (Array.isArray(track.artists) && track.artists.length > 0
        ? track.artists[0]
        : null) || { id: "0", name: "Unknown" };

    const albumId = track.album?.id || "0";
    const albumTitle = track.album?.title || "Unknown Album";

    // Remove provider names from title and album title if present
    const cleanTitle = (track.title || "Unknown Title")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();
    const cleanAlbumTitle = (albumTitle || "Unknown Album")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();

    return {
      id: `t:${track.id}`,
      title: cleanTitle,
      artist: { id: `t:${mainArtist.id}`, name: mainArtist.name },
      artists: (track.artists || []).map((a: any) => ({
        id: `t:${a.id}`,
        name: a.name,
      })),
      album: {
        id: `t:${albumId}`,
        title: cleanAlbumTitle,
        coverUrl: this.getCoverUrl({
          provider: "tidal",
          album: { id: albumId, cover: track.album?.cover || track.cover },
        } as any),
      },
      duration: track.duration || 0,
      provider: "tidal",
      quality: track.audioQuality,
      explicit: track.explicit === true || track.explicitLyrics === true,
    };
  }

  private transformQobuzTrack(track: any): Track {
    const mainArtist = track.performer ||
      track.artist || { id: "0", name: "Unknown" };
    const albumId = track.album?.id || "0";
    const albumTitle = track.album?.title || "Unknown Album";

    // Remove provider names from title and album title if present
    const cleanTitle = (track.title || "Unknown Title")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();
    const cleanAlbumTitle = (albumTitle || "Unknown Album")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();

    return {
      id: `q:${track.id}`,
      title: cleanTitle,
      artist: { id: `q:${mainArtist.id}`, name: mainArtist.name },
      artists: (track.artists || [mainArtist]).map((a: any) => ({
        id: `q:${a.id}`,
        name: a.name,
      })),
      album: {
        id: `q:${albumId}`,
        title: cleanAlbumTitle,
        coverUrl: this.getCoverUrl({
          provider: "qobuz",
          album: { id: albumId },
        } as any),
      },
      duration: track.duration || 0,
      provider: "qobuz",
      explicit: track.explicit === true || track.explicitLyrics === true,
    };
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
      coverUrl: this.getCoverUrl({
        provider: "tidal",
        album: { id: album.id, cover: album.cover },
      } as any),
      provider: "tidal",
      trackCount: album.numberOfTracks,
      releaseDate: album.releaseDate,
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

  private transformQobuzAlbum(album: any): Album {
    const mainArtist = album.artist || { id: "0", name: "Unknown" };

    const cleanTitle = (album.title || "Unknown Album")
      .replace(/\s*(TIDAL|QOBUZ)\s*/gi, " ")
      .trim();

    return {
      id: `q:${album.id}`,
      title: cleanTitle,
      artist: { id: `q:${mainArtist.id}`, name: mainArtist.name },
      coverUrl: this.getCoverUrl({
        provider: "qobuz",
        album: { id: album.id },
      } as any),
      provider: "qobuz",
      trackCount: album.tracks_count,
      releaseDate: album.released_at
        ? new Date(album.released_at * 1000).toISOString()
        : undefined,
    };
  }

  private transformQobuzPlaylist(playlist: any): Playlist {
    return {
      id: `q:${playlist.id}`,
      title: playlist.name || playlist.title || "Unknown Playlist",
      description: playlist.description,
      imageUrl:
        playlist.image?.large ||
        playlist.image?.medium ||
        playlist.image?.small ||
        playlist.picture ||
        (Array.isArray(playlist.images) && playlist.images.length > 0
          ? playlist.images[0]
          : null),
      provider: "qobuz",
      trackCount: playlist.tracks_count || playlist.numberOfTracks,
    };
  }

  private transformQobuzArtist(artist: any): Artist {
    const name =
      typeof artist.name === "string"
        ? artist.name
        : artist.name?.display || "Unknown Artist";

    const imageUrl =
      artist.image?.large ||
      artist.image?.medium ||
      artist.image?.small ||
      artist.picture ||
      (artist.images?.portrait
        ? `https://static.qobuz.com/images/artists/covers/large/${artist.images.portrait.hash}.${artist.images.portrait.format}`
        : null);

    return {
      id: `q:${artist.id}`,
      name: name,
      imageUrl: imageUrl,
      provider: "qobuz",
    };
  }
}

export const musicService = new MusicService();
