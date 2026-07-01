import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import {
  DEFAULT_TIDAL_INSTANCES,
  STORAGE_KEYS,
  TIDAL_UPTIME_URLS,
} from "../constants/api";
import { hifiClient } from "./hifi-client";
import { APICache } from "./api-cache";

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
  private blacklist: Map<string, number> = new Map(); // url -> expiry timestamp
  public cache = new APICache({ maxSize: 200, ttl: 1000 * 60 * 30 });

  constructor() {
    this.instances = DEFAULT_TIDAL_INSTANCES;
    this.hifiInitialized = false;

    // Periodic cache cleanup (every 5 minutes, matching web app)
    setInterval(async () => {
      await this.cache.clearExpired();
    }, 1000 * 60 * 5);
  }

  private async ensureHiFi() {
    if (!this.hifiInitialized) {
      await hifiClient.initialize();
      this.hifiInitialized = true;
    }
  }

  async loadInstances() {
  if (this.instancesLoaded) return this.instances;

  const mergeWithDefaults = (defaults: Instance[], fetched: Instance[]): Instance[] => {
    const map = new Map(defaults.map((i) => [i.url, i]));
    fetched.forEach((i) => map.set(i.url, i));
    return Array.from(map.values());
  };

  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.API_INSTANCES);
    if (cached) {
      try {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < 15 * 60 * 1000 && data.api?.length > 0) {
          this.instances = {
            api: mergeWithDefaults(DEFAULT_TIDAL_INSTANCES.api, data.api || []),
            streaming: mergeWithDefaults(DEFAULT_TIDAL_INSTANCES.streaming, data.streaming || []),
          };
          this.instancesLoaded = true;
          console.log(`[APIService] Loaded ${this.instances.api.length} API and ${this.instances.streaming.length} streaming instances from cache.`);
          return this.instances;
        }
      } catch (e) {
        console.warn("[APIService] Failed to parse cached instances:", e);
      }
    }

    const shuffledUrls = [...TIDAL_UPTIME_URLS].sort(() => Math.random() - 0.5);
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
      const isBlocked = (i: Instance) => {
        const url = i.url.toLowerCase();
        return (
          url.includes("spotisaver.net") ||
          url.includes(".squid.wtf") ||
          url.includes("arran.monochrome.tf")
        );
      };

      const fetched: GroupedInstances = {
        api: data.api?.filter((i: Instance) => !isBlocked(i)) || [],
        streaming: data.streaming?.filter((i: Instance) => !isBlocked(i)) || [],
      };

      if (fetched.api.length > 0 && fetched.streaming.length === 0) {
        fetched.streaming = [...fetched.api];
      }

      this.instances = {
        api: mergeWithDefaults(DEFAULT_TIDAL_INSTANCES.api, fetched.api),
        streaming: mergeWithDefaults(DEFAULT_TIDAL_INSTANCES.streaming, fetched.streaming),
      };
      console.log(`[APIService] Updated instances: ${this.instances.api.length} API, ${this.instances.streaming.length} streaming.`);

      if (fetched.api.length > 0) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.API_INSTANCES,
          JSON.stringify({
            timestamp: Date.now(),
            data: fetched,
          }),
        );
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

  // Path 1: HiFi Client (authenticated Tidal API — same approach as web app).
  if (type !== "streaming" && !options.skipHiFi) {
    try {
      await this.ensureHiFi();

      // Map worker-style paths to native Tidal API v1 equivalents
      const trackInfoMatch = relativePath.match(/^track\/?\?id=(\d+)/);
      const trackManifestMatch = relativePath.match(/^trackManifests\/?\?id=(\d+)&quality=([^&]+)/);
      const albumMatch = relativePath.match(/^album\/?\?id=(\d+)/);
      const artistMatch = relativePath.match(/^artist\/?\?id=(\d+)/);
      const searchQMatch = relativePath.match(/^search\/?\?q=([^&]+)/);
      const searchScopeMatch = relativePath.match(/^search\/?\?(?:s|a|al|p|v)=([^&]+)/);

      if (trackManifestMatch) {
        const [, id, quality] = trackManifestMatch;
        const normalizedQuality = quality === "FLAC_HIRES" ? "HI_RES_LOSSLESS" : quality;
        console.log(`[APIService] HiFi: getPlaybackInfo for track ${id} quality=${normalizedQuality}`);
        const result = await hifiClient.getPlaybackInfo(id, normalizedQuality);
        if (result?.assetPresentation === "FULL") {
          console.log(`[APIService] HiFi: FULL playback info obtained for track ${id}`);
          return {
            data: {
              data: {
                id,
                attributes: {
                  uri: null,
                  trackPresentation: result.assetPresentation,
                  formats: [result.audioQuality],
                },
                manifest: result.manifest,
                manifestMimeType: result.manifestMimeType,
                audioQuality: result.audioQuality,
                trackReplayGain: result.trackReplayGain,
                albumReplayGain: result.albumReplayGain,
              }
            }
          };
        } else {
          console.warn(`[APIService] HiFi returned non-FULL presentation: ${result?.assetPresentation}`);
        }
      } else if (trackInfoMatch) {
        const [, id] = trackInfoMatch;
        console.log(`[APIService] HiFi: getTrackInfo for track ${id}`);
        const result = await hifiClient.getTrackInfo(id);
        if (result?.id) {
          console.log(`[APIService] HiFi: Track info obtained, isrc=${(result as any).isrc}`);
          return { data: result };
        }
      } else if (albumMatch) {
        const [, id] = albumMatch;
        const result = await hifiClient.query(`/albums/${id}/tracks`, { countryCode: "US" });
        if (result) return { data: result };
      } else if (artistMatch) {
        const [, id] = artistMatch;
        const result = await hifiClient.query(`/artists/${id}`, { countryCode: "US" });
        if (result) return { data: result };
      } else if (searchQMatch) {
        // Unified search: /search/?q=... — routes to Tidal v1 search API
        const [, query] = searchQMatch;
        const result = await hifiClient.query('/search', { query: decodeURIComponent(query), limit: 25, countryCode: "US" });
        if (result) return { data: result };
      } else if (searchScopeMatch) {
        // Scoped search fallback: /search/?s=, /search/?a=, etc.
        const [, query] = searchScopeMatch;
        const result = await hifiClient.query('/search', { query: decodeURIComponent(query), limit: 25, countryCode: "US" });
        if (result) return { data: result };
      }
    } catch (err: any) {
      console.warn(`[APIService] HiFi failed for ${relativePath}, falling back to workers:`, err.message);
    }
  }

  // Path 2: Worker instances fallback (existing logic)
  const instances = await this.loadInstances();
  let targetInstances = instances[type as keyof GroupedInstances];

  if (options.minVersion) {
    targetInstances = targetInstances.filter(
      (i) => i.version && parseFloat(i.version) >= parseFloat(options.minVersion!),
    );
  }

  if (targetInstances.length === 0) {
    throw new Error(`No instances available for type: ${type}`);
  }

  // Filter out blacklisted instances
  const now = Date.now();
  targetInstances = targetInstances.filter(i => {
    const expiry = this.blacklist.get(i.url);
    if (expiry && now < expiry) return false;
    if (expiry) this.blacklist.delete(i.url);
    return true;
  });

  if (targetInstances.length === 0) {
    // All blacklisted — panic mode, clear and retry all
    this.blacklist.clear();
    targetInstances = instances[type as keyof GroupedInstances];
  }

  const maxAttempts = targetInstances.length * 2;
  let lastError = null;
  let instanceIndex = Math.floor(Math.random() * targetInstances.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const instance = targetInstances[instanceIndex % targetInstances.length];
    const baseUrl = instance.url.endsWith("/") ? instance.url : `${instance.url}/`;
    const url = `${baseUrl}${relativePath.startsWith("/") ? relativePath.substring(1) : relativePath}`;

    try {
      const response = await axios.get(url, {
        signal: options.signal,
        timeout: options.timeout || 8000,
      });
      if (response.data?.success === false) {
        console.warn(`[APIService] Instance ${baseUrl} returned success: false, retrying...`);
        instanceIndex++;
        continue;
      }
      console.log(`[APIService] Success: ${url}`);
      return response.data;
    } catch (error: any) {
      if (axios.isCancel(error) || error.name === "AbortError") throw error;
      const status = error.response?.status;
      const isNetworkError =
        !error.response ||
        error.code === "ECONNABORTED" ||
        error.message.includes("timeout") ||
        error.message.includes("Network Error");

      if (status === 429) {
        console.warn(`[APIService] Rate limit hit on ${instance.url}. Trying next instance...`);
        instanceIndex++;
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      if (status === 401) {
        // Check for Tidal subStatus 11002 (invalid/expired token) — skip instance like web app
        const errorData = error.response?.data;
        if (errorData?.subStatus === 11002) {
          console.warn(`[APIService] Auth failed (subStatus 11002) on ${instance.url}. Trying next instance...`);
          instanceIndex++;
          continue;
        }
      }

      if (status === 404 || status === 403 || status === 401 || status >= 500 || isNetworkError) {
        console.warn(`Instance ${baseUrl} failed (${status || error.code}), blacklisting for 30s...`);
        this.blacklist.set(instance.url, Date.now() + 30000);
        instanceIndex++;
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }
      lastError = error;
      instanceIndex++;
    }
  }

  // If all instances failed, try refreshing from uptime workers (matching web app)
  try {
    this.instancesLoaded = false;
    const refreshedInstances = await this.loadInstances();
    const refreshedTarget = refreshedInstances[type as keyof GroupedInstances];
    if (refreshedTarget && refreshedTarget.length > 0) {
      // Try ALL refreshed instances (matching web app's getInstances(true) retry)
      for (let i = 0; i < refreshedTarget.length; i++) {
        const refreshInstance = refreshedTarget[i];
        const baseUrl = refreshInstance.url.endsWith("/") ? refreshInstance.url : `${refreshInstance.url}/`;
        const url = `${baseUrl}${relativePath.startsWith("/") ? relativePath.substring(1) : relativePath}`;
        try {
          const response = await axios.get(url, { signal: options.signal, timeout: options.timeout || 8000 });
          if (response.data?.success === false) continue;
          return response.data;
        } catch (e: any) {
          if (axios.isCancel(e) || e.name === "AbortError") throw e;
          continue;
        }
      }
    }
  } catch (refreshError) {
    console.warn("[APIService] Instance refresh also failed:", refreshError);
  }

  throw lastError || new Error(`All instances failed for: ${relativePath}`);
}

  async getTidalTrending(type: "albums" | "tracks") {
    const path = type === "albums" ? "trending/?al=true" : "trending/?s=true";
    return this.fetchWithRetry(path);
  }

  async getTidalNewReleases() {
    return this.fetchWithRetry("new/");
  }

  // ─── Search Methods ──────────────────────────────────────────────────────

  /**
   * Unified search: single /search/?q= call (matching web app's search()).
   * Returns ALL categories (tracks, albums, artists, playlists, videos) in one response.
   */
  async searchUnified(query: string, options: any = {}) {
    const cached = await this.cache.get('search_all', query);
    if (cached) return cached;

    const response = await this.fetchWithRetry(`search/?q=${encodeURIComponent(query)}`, { signal: options.signal });
    // fetchWithRetry may return data directly (HiFi path) or axios response
    const data = response?.data !== undefined ? response.data : response;
    // Cache the raw response (before normalization), matching web app's approach
    await this.cache.set('search_all', query, data);
    return data;
  }

  async getTidalTrackManifests(id: string, quality: string = "HI_RES_LOSSLESS") {
    const formatMap: Record<string, string[]> = {
      HI_RES_LOSSLESS: ["FLAC_HIRES"],
      LOSSLESS: ["FLAC"],
      HIGH: ["AACLC"],
      LOW: ["HEAACV1"],
    };
    const formats = formatMap[quality] || ["FLAC"];
    let urlStr = `trackManifests/?id=${encodeURIComponent(id)}&quality=${encodeURIComponent(quality)}&adaptive=false`;
    for (const f of formats) {
      urlStr += `&formats=${encodeURIComponent(f)}`;
    }
    const result = await this.fetchWithRetry(urlStr, { type: 'api' });
  
  const presentation = result?.data?.attributes?.trackPresentation 
    ?? result?.attributes?.trackPresentation;
  if (presentation) {
    console.log(`[APIService] trackManifests for ${id}: presentation=${presentation}, quality=${quality}`);
  }
  if (presentation && presentation !== 'FULL') {
    console.warn(`[APIService] Worker returned ${presentation} manifest for track ${id} — this worker may be unauthenticated`);
  }

  return result;
  }

  async getTidalTrackInfo(id: string, quality: string = "HI_RES_LOSSLESS") {
    // Legacy endpoint — used as fallback for v2.2 instances that don't support trackManifests.
    // Returns { manifest: "base64...", manifestMimeType, trackId, ... } inline.
    return this.fetchWithRetry(`track/?id=${id}&quality=${quality}`, {
      type: "api",
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

  normalizeSearchResponse(data: any, key: string): { items: any[]; limit: number; offset: number; totalNumberOfItems: number } {
    const section = this.findSearchSection(data, key);
    const items = section?.items ?? [];
    return {
      items,
      limit: section?.limit ?? items.length,
      offset: section?.offset ?? 0,
      totalNumberOfItems: section?.totalNumberOfItems ?? items.length,
    };
  }
}

export const apiService = new APIService();

// ─── Re-export new services for single-import convenience ────────────────────
export { lyricsService } from './lyrics-service';
