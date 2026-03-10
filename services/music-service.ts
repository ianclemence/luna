import { decode as atob } from "base-64";
import * as FileSystem from "expo-file-system";
import { apiService } from "./api-service";

export interface Track {
  id: string;
  title: string;
  artist: { id: string; name: string };
  artists: { id: string; name: string }[];
  album: { id: string; title: string; coverUrl?: string };
  duration: number;
  provider: "tidal" | "qobuz";
  quality?: string;
  explicit?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artist: { id: string; name: string };
  coverUrl?: string;
  provider: "tidal" | "qobuz";
  trackCount?: number;
  releaseDate?: string;
  similarAlbums?: Album[];
}

export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
  provider: "tidal" | "qobuz";
  biography?: string;
  socials?: any;
  similarArtists?: Artist[];
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  provider: "tidal" | "qobuz";
  trackCount?: number;
}

class MusicService {
  private currentProvider: "tidal" | "qobuz" = "tidal";

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

  async getHomeData(seeds: Track[] = []) {
    try {
      const [newReleases, topTracksData, featuredPlaylists] = await Promise.all(
        [
          this.search("New Releases"),
          this.search("Top Tracks"),
          this.search("Top Playlists"),
        ],
      );

      let topTracks = topTracksData;
      // If search for "Top Tracks" returned nothing, try a more generic fallback
      if (topTracks.tracks.length === 0) {
        topTracks = await this.search("Music");
      }

      let recommendations: Track[] = [];
      if (seeds.length > 0) {
        recommendations = await this.getRecommendedTracksForPlaylist(seeds);
      } else if (topTracks.tracks.length > 0) {
        // Seed recommendations with a few top tracks for home page
        recommendations = await this.getRecommendedTracksForPlaylist(
          topTracks.tracks.slice(0, 3),
        );
      }

      return {
        newReleases: newReleases.albums.slice(0, 10),
        topTracks: topTracks.tracks.slice(0, 10),
        featuredPlaylists: featuredPlaylists.playlists.slice(0, 10),
        recommendations:
          recommendations.length > 0
            ? recommendations
            : topTracks.tracks.length > 10
              ? topTracks.tracks.slice(10, 25)
              : topTracks.tracks,
      };
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

        const artist = this.transformTidalArtist(primaryData);
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
        let albumData = data;
        const tracksRaw = data.tracks?.items || data.items || [];

        // If the root object is missing artist or title, try to get it from the first track
        if ((!albumData.artist || !albumData.title) && tracksRaw.length > 0) {
          const firstTrack = tracksRaw[0].item || tracksRaw[0];
          if (firstTrack.album) {
            albumData = { ...albumData, ...firstTrack.album };
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
      console.warn(
        `Album fetch failed (likely 404 on all instances): ${albumId}`,
      );
      return null;
    }
  }

  async getPlaylist(playlistId: string, provider?: "tidal" | "qobuz") {
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

        const playlist = this.transformTidalPlaylist(data);
        let tracks = (data.tracks?.items || []).map((t: any) =>
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
      console.warn(`Playlist fetch failed: ${playlistId}`);
      return null;
    }
  }

  async getRecommendedTracksForPlaylist(tracks: Track[], limit: number = 20) {
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
            const url = await this.extractStreamUrlFromManifest(manifest);
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

  private async extractStreamUrlFromManifest(
    manifest: string,
  ): Promise<string | null> {
    try {
      const decoded = atob(manifest);

      // Handle DASH manifests (XML)
      if (decoded.includes("<MPD")) {
        // For mobile, we write the manifest to a temporary file with .mpd extension
        // This allows expo-audio/ExoPlayer to recognize it as DASH
        const fileName = `manifest_${Date.now()}.mpd`;
        const filePath = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(filePath, decoded);

        // Ensure it has file:// prefix for expo-audio if not already present
        return filePath.startsWith("file://") ? filePath : `file://${filePath}`;
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
