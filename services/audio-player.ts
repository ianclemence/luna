import {
  createAudioPlayer,
  AudioPlayer as ExpoAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { musicService, Track } from "./music-service";
import { storageService } from "./storage-service";
import { listeningTracker } from "./listening-tracker";
import { scrobblerService } from "./scrobbler-service";

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  queue: Track[];
  currentQueueIndex: number;
  shuffleActive: boolean;
}

class AudioPlayerService {
  private player: ExpoAudioPlayer | null = null;
  private state: PlayerState = {
    currentTrack: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    queue: [],
    currentQueueIndex: -1,
    shuffleActive: false,
  };
  private onStateChange: ((state: PlayerState) => void)[] = [];
  private updateInterval: any = null;
  private isShuffled: boolean = false;
  private originalQueue: Track[] = [];
  private isAdvancing: boolean = false;
  private advancingFromTrackId: string | null = null;
  private skipToNextLock: boolean = false;
  private remoteListeners: { remove: () => void }[] = [];
  private nextPlayer: ExpoAudioPlayer | null = null;
  private nextTrack: Track | null = null;
  private isPreBuffering: boolean = false;
  private playbackSequence: number = 0;
  private retryCount: number = 0;
  private lastNotifiedPosition: number = 0;
  private positionUpdateThrottleMs: number = 1000;
  private pendingPositionNotify: boolean = false;
  private notifyThrottleTimer: any = null;

  async init() {
    try {
      // Set a timeout for the entire initialization process
      const initPromise = (async () => {
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
          allowsRecording: false,
          shouldPlayInBackground: true,
          shouldRouteThroughEarpiece: false,
        });

        // Restore player state
        const savedState = await storageService.getPlayerState();
        if (savedState) {
          this.state = {
            ...this.state,
            ...savedState,
            isPlaying: false, // Don't autoplay on restore
          };

          // Run background cache eviction
          musicService.enforceCacheLimit().catch(console.error);

          this.originalQueue = savedState.originalQueue || savedState.queue;

          this.notifyStateChange();

          // If there's a current track, we need to initialize the player with it
          // but not start playing it yet. Do this asynchronously to avoid blocking init().
          if (this.state.currentTrack) {
            (async () => {
              try {
                let sourceUrl = await storageService.getDownloadedTrackPath(
                  this.state.currentTrack!.id,
                );

                if (!sourceUrl) {
                  sourceUrl = await musicService.getStreamUrl(
                    this.state.currentTrack!.id,
                    this.state.currentTrack!.provider,
                  );
                }

                if (sourceUrl) {
                  this.player = createAudioPlayer({ uri: sourceUrl });

                  // Restore metadata for lock screen
                  const track = this.state.currentTrack!;
                  const artworkUrl = track.album?.coverUrl;

                  const metadata = {
                    title: track.title,
                    artist:
                      track.artists?.map((a) => a.name).join(", ") ||
                      track.artist?.name ||
                      "Unknown Artist",
                    albumTitle: track.album?.title || "Unknown Album",
                    ...(artworkUrl ? { artworkUrl } : {}),
                  };

                  (this.player as any).metadata = {
                    title: metadata.title,
                    artist: metadata.artist,
                    album: metadata.albumTitle,
                    ...(artworkUrl ? { artwork: artworkUrl } : {}),
                  };

                  // Enable lock screen controls for sustained background playback (required for Android)
                  if (
                    typeof (this.player as any).setActiveForLockScreen ===
                    "function"
                  ) {
                    (this.player as any).setActiveForLockScreen(true, metadata);
                  }

                  (this.player as any).showNowPlayingNotification = true;

                  // Restore position if available
                  if (this.state.position > 0) {
                    this.player.seekTo(this.state.position / 1000);
                  }

                  this.setupPlayerListeners(this.player);
                  // Trigger an initial position update to sync the progress bar
                  setTimeout(() => {
                    this.updatePosition();
                  }, 500);
                }
              } catch (e) {
                console.warn("Failed to restore player stream URL in background:", e);
              }
            })();
          }
        }
      })();

      // Wait for init or 5 second timeout
      await Promise.race([
        initPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AudioPlayer init timeout")), 5000),
        ),
      ]);
    } catch (error) {
      console.error("AudioPlayer init error:", error);
    }
  }

  private setupPlayerListeners(player: any) {
    if (!player) return;

    player.addListener("playbackStatusUpdate", (status: any) => {
      // CRITICAL: Only update state if this is still the active player
      if (player !== this.player || !status) return;

      this.state.isPlaying = status.playing;
      this.state.position = status.currentTime * 1000;
      
      const newDuration = status.duration * 1000;
      if (typeof newDuration === "number" && !isNaN(newDuration) && newDuration > 0) {
        // Defensive: Don't let a preview duration (29s) overwrite a healthy metadata duration (>60s)
        const metadataDur = this.state.currentTrack?.duration || 0;
        if (metadataDur > 60000 && newDuration < 45000) {
          this.state.duration = metadataDur;
        } else {
          this.state.duration = newDuration;
        }
      } else if (this.state.duration <= 0 && this.state.currentTrack?.duration) {
        this.state.duration = this.state.currentTrack.duration;
      }

      if (status.playing) {
        this.startPositionUpdate();
      } else {
        this.stopPositionUpdate();
      }

      // Check for completion using status.playing and current time vs duration
      const nearEndThreshold = 300; // ms
      if (
        !status.playing &&
        this.state.duration > 0 &&
        this.state.position >= this.state.duration - nearEndThreshold &&
        !this.isAdvancing
      ) {
        console.log("Track completion detected via status update");
        this.handleTrackCompletion();
      }

      this.notifyStateChange();
    });

    // Clean up any existing remote listeners before adding new ones
    this.remoteListeners.forEach((l) => l.remove());
    this.remoteListeners = [];

    // Listen for remote media actions (from notification/lock screen)
    const nextListener = player.addListener("next", () => this.skipToNext());
    const prevListener = player.addListener("previous", () =>
      this.skipToPrevious(),
    );
    this.remoteListeners.push(nextListener, prevListener);

    player.addListener('playbackFinish', () => {
  if (player !== this.player) return;

  // ✅ ADD: Detect premature finish (preview played instead of full track)
  const trackDuration = this.state.currentTrack?.duration ?? 0;
  const actualPosition = this.state.position;
  const endedEarly = trackDuration > 45000 && actualPosition < 35000;

  if (endedEarly) {
    console.warn(
      `[AudioPlayer] Track "${this.state.currentTrack?.title}" finished at ${actualPosition}ms ` +
      `but metadata says ${trackDuration}ms — preview was likely played. Retrying with skipManifest.`
    );
    // Re-play the same track forcing a non-DASH stream
    const track = this.state.currentTrack;
    if (track) {
      musicService.getStreamUrl(track.id, track.provider, 'LOSSLESS', { skipManifest: true })
        .then(url => {
          if (url && this.player) {
            this.player.replace({ uri: url });
            this.player.play();
          }
        })
        .catch(err => console.error('[AudioPlayer] Preview retry failed:', err));
    }
    return;
  }

  console.log('Playback finished event received');
  this.handleTrackCompletion();
});

    // Add error listener
    player.addListener("playbackError", async (error: any) => {
      // CRITICAL: Only handle errors if this is still the active player
      if (player !== this.player) return;

      console.error("Playback error:", error);

      const track = this.state.currentTrack;
      if (track && this.retryCount < 1) {
        console.log(`Retrying track ${track.title} (retry 1)...`);
        this.retryCount++;

        let sourceUrl = await storageService.getDownloadedTrackPath(track.id);
        if (!sourceUrl) {
          sourceUrl = await musicService.getStreamUrl(track.id, track.provider);
        }

        if (sourceUrl && this.player) {
          console.log(
            `Re-fetched stream URL for ${track.title}. Resuming playback...`,
          );
          this.player.replace({ uri: sourceUrl });
          this.player.play();
          return;
        }
      }

      console.error(
        "Critical playback error after retry or no source available.",
      );

      this.retryCount = 0;
      this.state.isPlaying = false;
      this.notifyStateChange();
      if (!this.isAdvancing) {
        this.isAdvancing = true;
        this.advancingFromTrackId = this.state.currentTrack?.id ?? null;
      }
      setTimeout(() => {
        this.skipToNext();
      }, 1000);
    });
  }

  private handleTrackCompletion() {
    const finishedTrackId = this.state.currentTrack?.id ?? null;
    if (finishedTrackId && this.advancingFromTrackId === finishedTrackId) {
      return;
    }

    console.log(
      "Handling track completion, current track:",
      this.state.currentTrack?.title,
    );

    // Set advancing state FIRST to prevent race conditions with skipToNext
    this.isAdvancing = true;
    this.advancingFromTrackId = finishedTrackId;

    this.state.isPlaying = false;
    this.notifyStateChange();

    if (!this.skipToNextLock) {
      this.skipToNextLock = true;
      listeningTracker.onTrackEnd();
      this.skipToNext().finally(() => {
        this.skipToNextLock = false;
      });
    }
  }

  async playTrack(track: Track, recursiveCount = 0) {
    try {
      this.stopPositionUpdate();

      if (this.notifyThrottleTimer) {
        clearTimeout(this.notifyThrottleTimer);
        this.notifyThrottleTimer = null;
      }

      if (this.nextPlayer && this.nextTrack?.id !== track.id) {
        this.nextPlayer.pause();
        this.nextPlayer.remove();
        this.nextPlayer = null;
        this.nextTrack = null;
      }

      this.playbackSequence++;
      const currentSequence = this.playbackSequence;

      this.state.currentTrack = track;
      this.state.isPlaying = true;
      this.state.position = 0;
      this.state.duration = track.duration || 0;
      this.retryCount = 0;
      this.notifyStateChange();

      // HEAL: If duration or release date is missing, fetch fresh metadata in background
      // Optimization: Only heal if duration is truly 0 or critical info is missing, AND it's not a local file.
      const isMissingYear = !track.releaseDate || track.releaseDate === "Unknown" || track.releaseDate === "";
      const needsHealing = (this.state.duration === 0 || isMissingYear) && !track.id.startsWith("local:");
      
      if (needsHealing) {
        // Add a 2s delay so it doesn't fight with the audio stream request
        setTimeout(() => {
          if (this.playbackSequence !== currentSequence) return;
          
          musicService.getFreshTrackMetadata(track.id).then((fresh) => {
            if (this.playbackSequence !== currentSequence) return;
          if (fresh) {
            let changed = false;
            if (fresh.duration > 0) {
              // Only "heal" if current duration is 0 OR if fresh duration is significantly different
              // BUT: Never heal to a 29s preview duration if we already have a long one.
              const currentDur = this.state.duration;
              // CRITICAL: Prevent "Preview" clobbering (Tidal/Qobuz previews are ~30s).
              // If we already have a long duration, or the "fresh" one is suspicious (< 45s), block the update.
              const isDowngradeToPreview = currentDur > 45000 && fresh.duration < 45000;
              const isSuspiciouslyShort = fresh.duration > 0 && fresh.duration < 45000;
              
              if (fresh.duration > 0 && !isDowngradeToPreview && !isSuspiciouslyShort) {
                if (currentDur === 0 || Math.abs(fresh.duration - currentDur) > 5000) {
                  console.log(`[AudioPlayer] Healed duration for ${track.title}: ${fresh.duration}ms (was ${currentDur}ms)`);
                  this.state.duration = fresh.duration;
                  changed = true;
                }
              } else if (isSuspiciouslyShort) {
                console.warn(`[AudioPlayer] Ignored suspicious "preview" duration (${fresh.duration}ms) from worker for ${track.title}`);
              }
            }
            if (fresh.releaseDate && !this.state.currentTrack?.releaseDate) {
              console.log(`[AudioPlayer] Healed release date for ${track.title}: ${fresh.releaseDate}`);
              if (this.state.currentTrack) {
                this.state.currentTrack.releaseDate = fresh.releaseDate;
                changed = true;
              }
            }
            if (changed) {
              this.notifyStateChange();
            }
          }
        }).catch(err => console.warn("[AudioPlayer] Failed to heal metadata:", err));
      }, 2000);
    }

      let sourceUrl = await storageService.getDownloadedTrackPath(track.id);

      if (!sourceUrl) {
        sourceUrl = await musicService.getStreamUrl(track.id, track.provider);
      }



// ✅ ADD: If the track has a known long duration but getStreamUrl returned
// a file:// MPD (which may be a preview), force a non-DASH retry.
const isMpdFileUri = sourceUrl.startsWith('file://') && sourceUrl.endsWith('.mpd');
const trackHasLongDuration = (track.duration ?? 0) > 45000;

if (isMpdFileUri && trackHasLongDuration) {
  console.warn(`[AudioPlayer] Detected local MPD URI for long track ${track.title} — retrying with skipManifest`);
  const directUrl = await musicService.getStreamUrl(
    track.id,
    track.provider,
    'HI_RES_LOSSLESS',
    { skipManifest: true }
  );
  if (directUrl && !directUrl.startsWith('file://')) {
    sourceUrl = directUrl;
    console.log(`[AudioPlayer] Switched to direct URL for ${track.title}: ${directUrl.substring(0, 60)}...`);
  }
}

      if (this.playbackSequence !== currentSequence) {
        console.log(`[AudioPlayer] Discarding stale playback request for ${track.title}`);
        return;
      }

      if (!sourceUrl) {
        console.error(
          "Failed to get stream URL or local path for track:",
          track.id,
        );
        // Use setTimeout to break the synchronous chain and prevent stack overflow
        setTimeout(() => this.skipToNext(recursiveCount + 1), 0);
        return;
      }

      if (this.player) {
        this.player.pause();
        this.player.replace({ uri: sourceUrl });
      } else {
        this.player = createAudioPlayer({ uri: sourceUrl });
      }

      this.setupPlayerListeners(this.player);

      const artworkUrl = track.album?.coverUrl;

      const metadata = {
        title: track.title,
        artist:
          track.artists?.map((a) => a.name).join(", ") ||
          track.artist?.name ||
          "Unknown Artist",
        albumTitle: track.album?.title || "Unknown Album",
        ...(artworkUrl ? { artworkUrl } : {}),
      };

      (this.player as any).metadata = {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.albumTitle,
        ...(artworkUrl ? { artwork: artworkUrl } : {}),
      };

      (this.player as any).showNowPlayingNotification = true;

      if (typeof (this.player as any).setActiveForLockScreen === "function") {
        (this.player as any).setActiveForLockScreen(true, metadata);
      }

      this.player.play();

      this.state.isPlaying = true;
      this.startPositionUpdate();

      this.isAdvancing = false;
      this.advancingFromTrackId = null;

      listeningTracker.onTrackStart(track);
      scrobblerService.updateNowPlaying(track);
      storageService.addToHistory(track);
    } catch (error) {
      console.error("Error playing track:", error);
      if (!this.isAdvancing) {
        setTimeout(() => this.skipToNext(recursiveCount + 1), 0);
      }
    }
  }

  private async preBufferNextTrack() {
    if (this.isPreBuffering || this.state.queue.length === 0) return;

    const currentIndex = this.state.currentQueueIndex;
    let nextIndex = (currentIndex + 1) % this.state.queue.length;

    const track = this.state.queue[nextIndex];
    if (!track || track.id === this.nextTrack?.id) return;

    this.isPreBuffering = true;
    console.log(`Pre-buffering next track: ${track.title}`);

    try {
      let sourceUrl = await storageService.getDownloadedTrackPath(track.id);
      if (!sourceUrl) {
        sourceUrl = await musicService.getStreamUrl(track.id, track.provider);
      }

      if (sourceUrl) {
        this.nextTrack = track;

        // Clean up previous next player if it exists
        if (this.nextPlayer) {
          this.nextPlayer.pause();
        }

        this.nextPlayer = createAudioPlayer({ uri: sourceUrl });

        // Add metadata for lock screen readiness
        const artworkUrl = track.album?.coverUrl;
        (this.nextPlayer as any).metadata = {
          title: track.title,
          artist:
            track.artists?.map((a) => a.name).join(", ") ||
            track.artist?.name ||
            "Unknown Artist",
          album: track.album?.title || "Unknown Album",
          ...(artworkUrl ? { artwork: artworkUrl } : {}),
        };

        console.log(`Successfully pre-buffered: ${track.title}`);
      }
    } catch (error) {
      console.error("Error pre-buffering next track:", error);
      this.nextTrack = null;
      this.nextPlayer = null;
    } finally {
      this.isPreBuffering = false;
    }
  }

  private startPositionUpdate() {
    if (this.updateInterval) clearInterval(this.updateInterval);

    this.updatePosition();

    this.updateInterval = setInterval(() => {
      this.updatePosition();
    }, 250);
  }

  private stopPositionUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private updatePosition() {
    if (!this.player || this.isAdvancing) return;

    try {
      // In expo-audio 1.1.1, currentTime and duration are properties on the player
      // We convert seconds to milliseconds for consistent state handling
      const currentPos = this.player.currentTime * 1000;
      const currentDur = this.player.duration * 1000;

      listeningTracker.onTimeUpdate(this.player.currentTime, this.player.duration);

      if (typeof currentPos === "number" && !isNaN(currentPos)) {
        this.state.position = currentPos;
      }

      if (
        typeof currentDur === "number" &&
        !isNaN(currentDur) &&
        currentDur > 0
      ) {
        // Defensive: If metadata says the track is long (> 60s) but the actual 
        // stream duration is short (< 45s), it's likely a preview.
        // We keep the metadata duration to prevent the UI from jumping to 0:29.
        const metadataDur = this.state.currentTrack?.duration || 0;
        if (metadataDur > 60000 && currentDur < 45000) {
          this.state.duration = metadataDur;
        } else {
          this.state.duration = currentDur;
        }
      } else if (this.state.duration <= 0 && this.state.currentTrack?.duration) {
        this.state.duration = this.state.currentTrack.duration;
      }

      // Fallback to status if available and values are 0/invalid
      if (this.state.position === 0 || this.state.duration === 0) {
        const status = (this.player as any).status;
        if (status) {
          if (
            this.state.position === 0 &&
            typeof status.currentTime === "number"
          ) {
            this.state.position = status.currentTime * 1000;
          }
          if (
            this.state.duration === 0 &&
            typeof status.duration === "number"
          ) {
            this.state.duration = status.duration * 1000;
          }
        }
      }

      // Fallback: check if we've reached the end and didn't trigger auto-advance
      const threshold = 1000; // 1 second before end
      if (
        this.state.duration > 0 &&
        this.state.position >= this.state.duration - threshold &&
        this.state.isPlaying &&
        !this.isAdvancing
      ) {
        // If we've reached the absolute end and playbackFinish didn't fire
        if (this.state.position >= this.state.duration - 100) {
          console.log("Fallback skipToNext triggered from updatePosition");
          this.isAdvancing = true;
          this.skipToNext();
        }
      }

      // Trigger pre-buffering 15 seconds before the track ends
      if (
        this.state.duration > 0 &&
        this.state.duration - this.state.position < 15000 &&
        !this.nextTrack &&
        !this.isPreBuffering
      ) {
        this.preBufferNextTrack();
      }

      this.notifyStateChange(false);
    } catch (error) {
      console.error("Error updating position:", error);
    }
  }

  async togglePlayPause() {
    if (!this.player) {
      // If we have a track but no player (e.g. restoration failed), try to play it
      if (this.state.currentTrack) {
        await this.playTrack(this.state.currentTrack);
        return;
      }
      return;
    }

    if (this.state.isPlaying) {
      this.player.pause();
      this.state.isPlaying = false;
      this.stopPositionUpdate();
      this.notifyStateChange();
      this.immediatelySaveState();
    } else {
      // If at end of track and repeat off, restart or go to next
      const nearEndThreshold = 500;
      const atEndPos =
        this.state.duration > 0 &&
        this.state.position >= this.state.duration - nearEndThreshold;

      if (atEndPos) {
        this.skipToNext();
        return;
      }

      try {
        await this.player.play();
        this.state.isPlaying = true;
        this.startPositionUpdate();
        this.notifyStateChange();
        this.immediatelySaveState();
      } catch (error) {
        console.error("Error resuming playback:", error);
        this.state.isPlaying = false;
        this.notifyStateChange();
      }
    }
  }

  async seekTo(positionMs: number) {
    if (!this.player) return;
    this.player.seekTo(positionMs / 1000);
    this.state.position = positionMs;
    if (
      this.state.duration > 0 &&
      positionMs < this.state.duration - 500 &&
      this.isAdvancing
    ) {
      this.isAdvancing = false;
      this.advancingFromTrackId = null;
    }
    this.notifyStateChange();
    this.immediatelySaveState();
  }

  private immediatelySaveState() {
    if (this.saveStateTimer) clearTimeout(this.saveStateTimer);
    storageService.savePlayerState({
      currentTrack: this.state.currentTrack,
      queue: this.state.queue,
      currentQueueIndex: this.state.currentQueueIndex,
      shuffleActive: this.state.shuffleActive,
      originalQueue: this.originalQueue,
      position: this.state.position,
      duration: this.state.duration,
    });
  }

  async skipToNext(recursiveCount = 0, isManual = false): Promise<void> {
    if (this.state.queue.length === 0) return;

    try {
      if (recursiveCount > this.state.queue.length) {
        console.error("All tracks in queue are unavailable or blocked.");
        this.player?.pause();
        this.state.isPlaying = false;
        this.notifyStateChange();
        this.isAdvancing = false;
        this.advancingFromTrackId = null;
        return;
      }

      if (!this.isAdvancing) {
        this.isAdvancing = true;
        this.advancingFromTrackId = this.state.currentTrack?.id ?? null;
      }

      const isLastTrack =
        this.state.currentQueueIndex >= this.state.queue.length - 1;

      if (!isLastTrack) {
        this.state.currentQueueIndex++;
      } else {
        // End of queue: cycle back to start (repeat is always on)
        this.state.currentQueueIndex = 0;
      }

      const nextTrack = this.state.queue[this.state.currentQueueIndex];

      // Check for unavailable tracks (matching web app logic)
      if (nextTrack?.isUnavailable) {
        console.warn(`Track ${nextTrack.title} is unavailable, skipping...`);
        this.isAdvancing = false;
        this.advancingFromTrackId = null;
        setTimeout(() => this.skipToNext(recursiveCount + 1, isManual), 0);
        return;
      }

      // Ensure we reset position and playing state before loading next
      this.state.position = 0;
      this.state.isPlaying = true;
      this.notifyStateChange();

      // Check if we have a pre-buffered player for this track
      if (this.nextPlayer && this.nextTrack?.id === nextTrack.id) {
        console.log(
          `Using pre-buffered player for gapless skip to: ${nextTrack.title}`,
        );

        const oldPlayer = this.player;
        this.player = this.nextPlayer;
        this.state.currentTrack = nextTrack;
        this.state.isPlaying = true;

        this.setupPlayerListeners(this.player);
        this.player.play();

        // Cleanup old player COMPLETELY to stop its listeners
        if (oldPlayer) {
          oldPlayer.pause();
          oldPlayer.remove();
        }

        this.nextPlayer = null;
        this.nextTrack = null;

        // Start position updates and Notify
        this.startPositionUpdate();
        this.notifyStateChange();

        // Add to history
        storageService.addToHistory(nextTrack);
        this.isAdvancing = false;
        this.advancingFromTrackId = null;
      } else {
        await this.playTrack(nextTrack, recursiveCount);
      }
      
      if (isManual) {
        listeningTracker.onSkip();
      }
    } catch (error) {
      console.error("Error skipping to next track:", error);
      this.isAdvancing = false;
      this.advancingFromTrackId = null;
    }
  }

  async skipToPrevious(recursiveCount = 0): Promise<void> {
    if (this.state.queue.length === 0) return;

    // If more than 3 seconds in, restart track (just seek, don't re-fetch URL)
    if (this.state.position > 3000) {
      this.seekTo(0);
      return;
    }

    const prevIndex =
      (this.state.currentQueueIndex - 1 + this.state.queue.length) %
      this.state.queue.length;

    this.state.currentQueueIndex = prevIndex;
    const prevTrack = this.state.queue[prevIndex];

    if (prevTrack?.isUnavailable) {
      return this.skipToPrevious(recursiveCount + 1);
    }

    listeningTracker.onSkip();
    await this.playTrack(prevTrack);
  }

  setQueue(queue: Track[], startIndex: number = 0) {
    this.originalQueue = [...queue];
    this.state.queue = [...queue];
    this.state.currentQueueIndex = startIndex;
    this.state.shuffleActive = false;

    // Clear advancing state when setting a new queue
    this.isAdvancing = false;
    this.advancingFromTrackId = null;
    this.skipToNextLock = false;

    // Notify state change immediately so usePlayer has fresh state
    this.notifyStateChange();

    if (this.state.queue.length > 0) {
      this.playTrack(this.state.queue[this.state.currentQueueIndex]);
    }
  }

  async toggleShuffle() {
    this.state.shuffleActive = !this.state.shuffleActive;

    if (this.state.shuffleActive) {
      if (this.state.queue.length > 0) {
        // Keep current track at index 0, shuffle the rest
        const currentTrack = this.state.queue[this.state.currentQueueIndex];
        const remainingTracks = [...this.originalQueue].filter(
          (t) => t.id !== currentTrack?.id,
        );

        // Fisher-Yates shuffle
        for (let i = remainingTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remainingTracks[i], remainingTracks[j]] = [
            remainingTracks[j],
            remainingTracks[i],
          ];
        }

        if (currentTrack) {
          this.state.queue = [currentTrack, ...remainingTracks];
          this.state.currentQueueIndex = 0;
        } else {
          this.state.queue = remainingTracks;
          this.state.currentQueueIndex = 0;
        }
      }
    } else {
      // Restore original queue order and find current track's index
      const currentTrack = this.state.queue[this.state.currentQueueIndex];
      this.state.queue = [...this.originalQueue];

      if (currentTrack) {
        const newIndex = this.state.queue.findIndex(
          (t) => t.id === currentTrack.id,
        );
        if (newIndex !== -1) {
          this.state.currentQueueIndex = newIndex;
        }
      }
    }

    this.notifyStateChange();
  }

  async cleanup() {
    this.stopPositionUpdate();
    scrobblerService.clearTimer();

    if (this.notifyThrottleTimer) {
      clearTimeout(this.notifyThrottleTimer);
      this.notifyThrottleTimer = null;
    }
    if (this.saveStateTimer) {
      clearTimeout(this.saveStateTimer);
      this.saveStateTimer = null;
    }

    if (this.nextPlayer) {
      this.nextPlayer.pause();
      this.nextPlayer.remove();
      this.nextPlayer = null;
    }
    this.nextTrack = null;
    this.isPreBuffering = false;

    // Clean up remote control listeners
    this.remoteListeners.forEach((listener) => listener.remove());
    this.remoteListeners = [];

    if (this.player) {
      if (typeof (this.player as any).clearLockScreenControls === "function") {
        (this.player as any).clearLockScreenControls();
      }
      this.player.pause();
      this.player.remove();
      this.player = null;
    }

    this.onStateChange = [];
  }

  private shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  subscribe(callback: (state: PlayerState) => void) {
    this.onStateChange.push(callback);
    callback(this.state);
    return () => {
      this.onStateChange = this.onStateChange.filter((c) => c !== callback);
    };
  }

  private notifyStateChange(saveState: boolean = true) {
    if (saveState) {
      this.onStateChange.forEach((callback) => callback(this.state));
      this.debouncedSaveState();
    } else {
      const positionDelta = Math.abs(
        this.state.position - this.lastNotifiedPosition,
      );

      if (positionDelta >= 500 || !this.pendingPositionNotify) {
        this.onStateChange.forEach((callback) => callback(this.state));
        this.lastNotifiedPosition = this.state.position;
        this.pendingPositionNotify = false;
        if (this.notifyThrottleTimer) {
          clearTimeout(this.notifyThrottleTimer);
          this.notifyThrottleTimer = null;
        }
      } else if (!this.pendingPositionNotify && !this.notifyThrottleTimer) {
        this.pendingPositionNotify = true;
        this.notifyThrottleTimer = setTimeout(() => {
          this.onStateChange.forEach((callback) => callback(this.state));
          this.lastNotifiedPosition = this.state.position;
          this.pendingPositionNotify = false;
          this.notifyThrottleTimer = null;
        }, this.positionUpdateThrottleMs);
      }
    }
  }

  private saveStateTimer: any = null;
  private debouncedSaveState() {
    if (this.saveStateTimer) clearTimeout(this.saveStateTimer);
    this.saveStateTimer = setTimeout(() => {
      storageService.savePlayerState({
        currentTrack: this.state.currentTrack,
        queue: this.state.queue,
        currentQueueIndex: this.state.currentQueueIndex,
        shuffleActive: this.state.shuffleActive,
        originalQueue: this.originalQueue,
        position: this.state.position,
        duration: this.state.duration,
      });
    }, 1000); // Save state every 1 second
  }
}

export const audioPlayer = new AudioPlayerService();
