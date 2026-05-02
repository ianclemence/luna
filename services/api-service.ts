import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import {
  DEFAULT_TIDAL_INSTANCES,
  QOBUZ_API_BASE,
  STORAGE_KEYS,
  TIDAL_UPTIME_URLS,
} from "../constants/api";
import { hifiClient } from "./hifi-client";

interface Instance {
  url: string;
  version?: string;
}

interface GroupedInstances {
  api: Instance[];
  streaming: Instance[];
}

class APIService {
  private instances: GroupedInstances = DEFAULT_TIDAL_INSTANCES;
  private instancesLoaded = false;
  private hifiInitialized = false;

  constructor() {
    this.instances = DEFAULT_TIDAL_INSTANCES;
    this.hifiInitialized = false;
  }

  private async ensureHiFi() {
    if (!this.hifiInitialized) {
      await hifiClient.initialize();
      this.hifiInitialized = true;
    }
  }

  async loadInstances() {
    if (this.instancesLoaded) return this.instances;

    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.API_INSTANCES);
      if (cached) {
        try {
          const { timestamp, data } = JSON.parse(cached);
          // Only use cache if it's less than 15 minutes old AND has instances
          if (Date.now() - timestamp < 15 * 60 * 1000 && data.api?.length > 0) {
            this.instances = data;
            this.instancesLoaded = true;
            console.log(`[APIService] Loaded ${this.instances.api.length} API and ${this.instances.streaming.length} streaming instances from cache.`);
            return this.instances;
          }
        } catch (e) {
          console.warn("[APIService] Failed to parse cached instances:", e);
        }
      }

      const shuffledUrls = [...TIDAL_UPTIME_URLS].sort(
        () => Math.random() - 0.5,
      );
      let data = null;

      console.log("[APIService] Fetching fresh instances from uptime URLs...");
      for (const url of shuffledUrls) {
        try {
          const response = await axios.get(url, { timeout: 5000 });
          if (response.data && (response.data.api?.length > 0 || response.data.streaming?.length > 0)) {
            data = response.data;
            console.log(`[APIService] Successfully fetched instances from ${url}`);
            break;
          }
        } catch (error) {
          console.warn(`[APIService] Failed to fetch instances from ${url}:`, error);
        }
      }

      if (data) {
        const grouped: GroupedInstances = {
          api:
            data.api?.filter(
              (i: Instance) => !i.url.includes("spotisaver.net"),
            ) || [],
          streaming:
            data.streaming?.filter(
              (i: Instance) => !i.url.includes("spotisaver.net"),
            ) || [],
        };
        
        // If we got API but no streaming, use API for streaming as fallback
        if (grouped.api.length > 0 && grouped.streaming.length === 0) {
          grouped.streaming = [...grouped.api];
        }

        // ONLY overwrite if we actually found usable instances
        if (grouped.api.length > 0) {
          this.instances = grouped;
          console.log(`[APIService] Updated instances: ${grouped.api.length} API, ${grouped.streaming.length} streaming.`);
          
          await AsyncStorage.setItem(
            STORAGE_KEYS.API_INSTANCES,
            JSON.stringify({
              timestamp: Date.now(),
              data: grouped,
            }),
          );
        } else {
          console.warn("[APIService] Fetched data contained no usable instances, sticking to defaults.");
        }
      } else {
        console.warn("[APIService] Could not fetch instances from any URL, using defaults.");
      }
    } catch (error) {
      console.error("[APIService] Critical error loading instances:", error);
    }

    this.instancesLoaded = true;
    return this.instances;
  }

  async fetchWithRetry(relativePath: string, options: any = {}) {
    const type = options.type || "api";

    // Search paths use monochrome-worker-specific query params (?s=, ?a=, ?al=, ?p=, ?q=)
    // that the Tidal native API does not understand — it returns empty results silently.
    // Always route search through the worker pool, never through HiFi direct.
    const isSearchPath = relativePath.startsWith('search/?') || relativePath.startsWith('/search/?');

    // 1. Try Direct HiFi Query First (if applicable, never for search)
    if (type !== "streaming" && !options.userInstancesOnly && !isSearchPath) {
      try {
        await this.ensureHiFi();
        const data = await hifiClient.query(relativePath, options.params);
        return data;
      } catch (err) {
        console.warn(`[APIService] Direct HiFi query failed for ${relativePath}, falling back to workers.`, err);
      }
    }

    // 2. Fallback to Worker Instances
    const instances = await this.loadInstances();
    let targetInstances = instances[type as keyof GroupedInstances];

    if (options.minVersion) {
      targetInstances = targetInstances.filter(
        (i) =>
          i.version && parseFloat(i.version) >= parseFloat(options.minVersion!),
      );
    }

    if (targetInstances.length === 0) {
      throw new Error(`No instances available for type: ${type}`);
    }

    const maxAttempts = targetInstances.length * 2;
    let lastError = null;
    let instanceIndex = Math.floor(Math.random() * targetInstances.length);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const instance = targetInstances[instanceIndex % targetInstances.length];
      const baseUrl = instance.url.endsWith("/")
        ? instance.url
        : `${instance.url}/`;
      const url = `${baseUrl}${relativePath.startsWith("/") ? relativePath.substring(1) : relativePath}`;

      try {
        const response = await axios.get(url, { signal: options.signal });
        if (response.data?.success === false) {
          console.warn(`Instance ${baseUrl} returned success: false, retrying...`);
          instanceIndex++;
          continue;
        }
        return response.data;
      } catch (error: any) {
        if (axios.isCancel(error) || error.name === "AbortError") throw error;
        const status = error.response?.status;
        if (status === 404 || status === 401 || status === 429 || status >= 500) {
          instanceIndex++;
          continue;
        }
        lastError = error;
        instanceIndex++;
      }
    }

    throw lastError || new Error(`All instances failed for: ${relativePath}`);
  }

  async getTidalTrending(type: "albums" | "tracks") {
    const path = type === "albums" ? "trending/?al=true" : "trending/?s=true";
    return this.fetchWithRetry(path, { minVersion: "2.3" });
  }

  async getTidalNewReleases() {
    return this.fetchWithRetry("new/", { minVersion: "2.3" });
  }

  async getHotExplore() {
    const response = await axios.get("https://hot.monochrome.tf/");
    return response.data;
  }

  // Tidal Methods
  async searchTidalTracks(query: string, options: any = {}) {
    return this.fetchWithRetry(`search/?s=${encodeURIComponent(query)}`, { signal: options.signal });
  }

  async searchTidalArtists(query: string, options: any = {}) {
    return this.fetchWithRetry(`search/?a=${encodeURIComponent(query)}`, { signal: options.signal });
  }

  async searchTidalAlbums(query: string, options: any = {}) {
    return this.fetchWithRetry(`search/?al=${encodeURIComponent(query)}`, { signal: options.signal });
  }

  async searchTidalPlaylists(query: string, options: any = {}) {
    return this.fetchWithRetry(`search/?p=${encodeURIComponent(query)}`, { signal: options.signal });
  }

  async getTidalTrackInfo(id: string, quality: string = "HI_RES_LOSSLESS") {
    return this.fetchWithRetry(`track/?id=${id}&quality=${quality}`, {
      type: "streaming",
    });
  }

  async getTidalAlbum(id: string, offset: number = 0) {
    const path =
      offset > 0
        ? `album/?id=${id}&offset=${offset}&limit=500`
        : `album/?id=${id}`;
    return this.fetchWithRetry(path);
  }

  async getTidalArtist(id: string) {
    return this.fetchWithRetry(`artist/?id=${id}`);
  }

  async getTidalArtistContent(id: string) {
    return this.fetchWithRetry(`artist/?f=${id}&skip_tracks=true`);
  }

  async getTidalPlaylist(id: string, offset: number = 0) {
    const path =
      offset > 0 ? `playlist/?id=${id}&offset=${offset}` : `playlist/?id=${id}`;
    return this.fetchWithRetry(path);
  }

  async getTidalMix(id: string) {
    return this.fetchWithRetry(`mix/?id=${id}`, {
      type: "api",
      minVersion: "2.3",
    });
  }

  async getTidalSimilarAlbums(id: string) {
    return this.fetchWithRetry(`album/similar/?id=${id}`, {
      minVersion: "2.3",
    });
  }

  async getTidalSimilarArtists(id: string) {
    return this.fetchWithRetry(`artist/similar/?id=${id}`, {
      minVersion: "2.3",
    });
  }

  async getTidalRecommendations(id: string) {
    return this.fetchWithRetry(`recommendations/?id=${id}`, {
      minVersion: "2.4",
    });
  }

  async getTidalArtistBiography(artistId: string) {
    try {
      // Trying V2 API first with the desktop token, as in luna's api.js
      const v2Url = `https://api.tidal.com/v2/artists/${artistId}/details?locale=en_US&countryCode=GB`;
      const v2Response = await axios.get(v2Url, {
        headers: {
          "X-Tidal-Token": "txNoH4kkV41MfH25",
        },
      });
      if (v2Response.data?.biography) {
        return { text: v2Response.data.biography };
      }

      // Fallback to V1 if V2 doesn't have it
      const url = `https://api.tidal.com/v1/artists/${artistId}/bio?locale=en_US&countryCode=GB`;
      const response = await axios.get(url, {
        headers: {
          "X-Tidal-Token": "txNoH4kkV41MfH25",
        },
      });
      return response.data;
    } catch (e: any) {
      if (e.response?.status !== 404) {
        console.warn("Failed to fetch Tidal biography:", e);
      }
      return null;
    }
  }

  async getTidalArtistSocials(artistName: string) {
    try {
      const searchUrl = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`;
      const searchRes = await axios.get(searchUrl, {
        headers: {
          "User-Agent":
            "Monochrome/2.0.0 ( https://github.com/monochrome-music/monochrome )",
        },
      });
      const searchData = searchRes.data;

      if (!searchData.artists || searchData.artists.length === 0) return [];

      const artist = searchData.artists[0];
      const mbid = artist.id;

      const detailsUrl = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`;
      const detailsRes = await axios.get(detailsUrl, {
        headers: {
          "User-Agent":
            "Monochrome/2.0.0 ( https://github.com/monochrome-music/monochrome )",
        },
      });
      const detailsData = detailsRes.data;

      const links = [];
      if (detailsData.relations) {
        for (const rel of detailsData.relations) {
          if (
            [
              "social network",
              "streaming",
              "official homepage",
              "youtube",
              "soundcloud",
              "bandcamp",
            ].includes(rel.type)
          ) {
            links.push({ type: rel.type, url: rel.url.resource });
          }
        }
      }
      return links;
    } catch (e) {
      console.warn("Failed to fetch artist socials:", e);
      return [];
    }
  }

  // Qobuz Methods
  async searchQobuzTracks(
    query: string,
    offset: number = 0,
    limit: number = 20,
  ) {
    const response = await axios.get(
      `${QOBUZ_API_BASE}/get-music?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`,
    );
    return response.data;
  }

  async searchQobuzArtists(
    query: string,
    offset: number = 0,
    limit: number = 20,
  ) {
    const response = await axios.get(
      `${QOBUZ_API_BASE}/get-artists?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`,
    );
    return response.data;
  }

  async searchQobuzAlbums(
    query: string,
    offset: number = 0,
    limit: number = 20,
  ) {
    const response = await axios.get(
      `${QOBUZ_API_BASE}/get-albums?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`,
    );
    return response.data;
  }

  async getQobuzAlbum(id: string) {
    const response = await axios.get(
      `${QOBUZ_API_BASE}/get-album?album_id=${id}`,
    );
    return response.data;
  }

  async getQobuzArtist(id: string) {
    const response = await axios.get(
      `${QOBUZ_API_BASE}/get-artist?artist_id=${id}`,
    );
    return response.data;
  }

  async getQobuzPlaylist(id: string) {
    const response = await axios.get(
      `${QOBUZ_API_BASE}/get-playlist?playlist_id=${id}`,
    );
    return response.data;
  }

  async getQobuzStreamUrl(id: string, quality: string = "7") {
    const response = await axios.get(
      `${QOBUZ_API_BASE}/download-music?track_id=${id}&quality=${quality}`,
    );
    return response.data;
  }
  /**
   * Recursively finds a section (like 'tracks', 'albums') in a nested API response.
   * Ported from luna-web/js/api.js
   */
  findSearchSection(source: any, key: string, visited: Set<any> = new Set()): any {
    if (!source || typeof source !== 'object') return;

    if (Array.isArray(source)) {
      for (const e of source) {
        const f = this.findSearchSection(e, key, visited);
        if (f) return f;
      }
      return;
    }

    if (visited.has(source)) return;
    visited.add(source);

    // If this object has 'items', it is a section container — return it
    if ('items' in source && Array.isArray(source.items)) return source;

    // If this object has the key directly (e.g. source.tracks), recurse into it
    if (key in source) {
      const f = this.findSearchSection(source[key], key, visited);
      if (f) return f;
    }

    // Otherwise explore all properties
    for (const v of Object.values(source)) {
      const f = this.findSearchSection(v, key, visited);
      if (f) return f;
    }
  }

  normalizeSearchResponse(data: any, key: string): any[] {
    const section = this.findSearchSection(data, key);
    return section?.items || [];
  }
}

export const apiService = new APIService();
