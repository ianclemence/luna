import { storageService } from "./storage-service";
import { Track } from "./types";

function getArtistName(track: Track): string {
  if (track.artist?.name) return track.artist.name;
  if (track.artists && track.artists.length > 0) {
    const first = track.artists[0];
    return typeof first === "string" ? first : (first as any).name || "Unknown Artist";
  }
  return "Unknown Artist";
}

export class MalojaScrobbler {
  private apiUrl: string | null = null;
  private apiKey: string | null = null;
  private enabled = false;

  private currentTrack: Track | null = null;
  private scrobbleTimer: any = null;
  private hasScrobbled = false;

  constructor() {
    this.loadConfig();
  }

  private async loadConfig() {
    const config = await storageService.getItem("maloja_config");
    if (config) {
      this.apiUrl = config.apiUrl || null;
      this.apiKey = config.apiKey || null;
      this.enabled = config.enabled || false;
    }
  }

  async setConfig(apiUrl: string, apiKey: string, enabled = true) {
    // Normalise: remove trailing slash
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.enabled = enabled;
    await storageService.setItem("maloja_config", { apiUrl: this.apiUrl, apiKey, enabled });
  }

  isEnabled() {
    return this.enabled && !!this.apiUrl && !!this.apiKey;
  }

  private async submitScrobble(track: Track, timestamp: number) {
    if (!this.isEnabled()) return;

    const artistName = getArtistName(track);
    const body = {
      title: track.title,
      artists: [artistName],
      album: track.album?.title || undefined,
      duration: track.duration ? Math.floor(track.duration / 1000) : undefined,
      time: timestamp,
    };

    try {
      const response = await fetch(`${this.apiUrl}/apis/mlj_1/newscrobble`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Maloja API Error ${response.status}: ${text}`);
      }

      console.log("[Maloja] Scrobbled:", track.title);
    } catch (error) {
      console.error("[Maloja] Scrobble failed:", error);
    }
  }

  async updateNowPlaying(track: Track) {
    if (!this.isEnabled()) return;

    this.currentTrack = track;
    this.hasScrobbled = false;
    this.clearTimer();

    // Scrobble at 50% or 4 minutes, whichever is shorter
    const delay = Math.min(track.duration / 2, 240000);
    this.scrobbleTimer = setTimeout(() => this.scrobble(), delay);
  }

  private async scrobble() {
    if (!this.isEnabled() || !this.currentTrack || this.hasScrobbled) return;

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      await this.submitScrobble(this.currentTrack, timestamp);
      this.hasScrobbled = true;
    } catch (e) {}
  }

  clearTimer() {
    if (this.scrobbleTimer) {
      clearTimeout(this.scrobbleTimer);
      this.scrobbleTimer = null;
    }
  }

  onPlaybackStop() {
    this.clearTimer();
  }
}
