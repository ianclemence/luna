import { storageService } from "./storage-service";
import { Track } from "./types";

const DEFAULT_API_URL = "https://api.listenbrainz.org";

function getArtistName(track: Track): string {
  if (track.artist?.name) return track.artist.name;
  if (track.artists && track.artists.length > 0) {
    const first = track.artists[0];
    return typeof first === "string" ? first : (first as any).name || "Unknown Artist";
  }
  return "Unknown Artist";
}

export class ListenBrainzScrobbler {
  private currentTrack: Track | null = null;
  private scrobbleTimer: any = null;
  private hasScrobbled = false;
  private isScrobbling = false;

  private apiUrl = DEFAULT_API_URL;
  private token: string | null = null;
  private enabled = false;

  constructor() {
    this.loadConfig();
  }

  private async loadConfig() {
    const config = await storageService.getItem("listenbrainz_config");
    if (config) {
      this.token = config.token || null;
      this.enabled = config.enabled || false;
      this.apiUrl = config.apiUrl || DEFAULT_API_URL;
    }
  }

  async setConfig(token: string, enabled = true, apiUrl?: string) {
    this.token = token;
    this.enabled = enabled;
    this.apiUrl = (apiUrl || DEFAULT_API_URL).replace(/\/1\/?$/, "");
    await storageService.setItem("listenbrainz_config", {
      token,
      enabled,
      apiUrl: this.apiUrl,
    });
  }

  isEnabled() {
    return this.enabled && !!this.token;
  }

  private getBaseUrl() {
    return this.apiUrl.replace(/\/1\/?$/, "");
  }

  private buildMetadata(track: Track) {
    const artistName = getArtistName(track);
    const payload: Record<string, any> = {
      artist_name: artistName,
      track_name: track.title,
      additional_info: {
        submission_client: "Luna",
        submission_client_version: "1.0.0",
      },
    };

    if (track.album?.title) payload.release_name = track.album.title;
    if (track.duration) payload.additional_info.duration = Math.floor(track.duration / 1000);

    return payload;
  }

  private async submitListen(listenType: string, track: Track, timestamp?: number) {
    if (!this.isEnabled()) return;

    const metadata = this.buildMetadata(track);
    const payload: Record<string, any> = { track_metadata: metadata };
    if (timestamp) payload.listened_at = timestamp;

    const body = { listen_type: listenType, payload: [payload] };
    const baseUrl = this.getBaseUrl();

    try {
      const response = await fetch(`${baseUrl}/1/submit-listens`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`ListenBrainz API Error ${response.status}: ${text}`);
      }

      console.log(`[ListenBrainz] Submitted ${listenType}: ${track.title}`);
    } catch (error) {
      console.error("[ListenBrainz] Submission failed:", error);
    }
  }

  async updateNowPlaying(track: Track) {
    if (!this.isEnabled()) return;

    this.currentTrack = track;
    if (!this.isScrobbling) this.hasScrobbled = false;
    this.clearTimer();

    await this.submitListen("playing_now", track);

    // Scrobble at 50% or 4 minutes, whichever is shorter
    const delay = Math.min(track.duration / 2, 240000);
    this.scrobbleTimer = setTimeout(() => this.scrobble(), delay);
  }

  private async scrobble() {
    if (!this.isEnabled() || !this.currentTrack || this.hasScrobbled) return;

    this.isScrobbling = true;
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      await this.submitListen("single", this.currentTrack, timestamp);
      this.hasScrobbled = true;
      console.log("[ListenBrainz] Scrobbled:", this.currentTrack.title);
    } finally {
      this.isScrobbling = false;
    }
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
