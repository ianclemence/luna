/**
 * Multi-Scrobbler Service — Luna
 *
 * Coordinator that fans out scrobble events concurrently to all configured
 * scrobbling services: Last.fm, Libre.fm, ListenBrainz, and Maloja.
 *
 * Each service is independently enabled/authenticated and failures are
 * isolated so that one failing scrobbler never blocks the others.
 */

import { LastFmScrobbler } from "./lastfm-scrobbler";
import { LibreFmScrobbler } from "./librefm-scrobbler";
import { ListenBrainzScrobbler } from "./listenbrainz-scrobbler";
import { MalojaScrobbler } from "./maloja-scrobbler";
import { Track } from "./types";

class ScrobblerService {
  readonly lastfm = new LastFmScrobbler();
  readonly librefm = new LibreFmScrobbler();
  readonly listenbrainz = new ListenBrainzScrobbler();
  readonly maloja = new MalojaScrobbler();

  /**
   * All registered scrobbler instances. Extend this array when new
   * scrobbling backends are added.
   */
  private get scrobblers() {
    return [this.lastfm, this.librefm, this.listenbrainz, this.maloja];
  }

  /**
   * Call when a new track starts playing. Fans out updateNowPlaying to all
   * enabled scrobblers concurrently and starts scrobble timers.
   */
  async updateNowPlaying(track: Track): Promise<void> {
    console.log("[MultiScrobbler] Now playing:", track.title);
    await Promise.allSettled(
      this.scrobblers.map((s) => s.updateNowPlaying(track))
    );
  }

  /**
   * Call when playback stops or the user skips before a scrobble fires.
   * Cancels any pending scrobble timers on all scrobblers.
   */
  onPlaybackStop(): void {
    this.scrobblers.forEach((s) => s.onPlaybackStop?.());
  }

  /** Returns true if at least one scrobbler is currently active. */
  isAnyActive(): boolean {
    return (
      this.lastfm.isAuthenticated() ||
      this.librefm.isAuthenticated() ||
      this.listenbrainz.isEnabled() ||
      this.maloja.isEnabled()
    );
  }
}

export const scrobblerService = new ScrobblerService();
