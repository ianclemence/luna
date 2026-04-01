import {
  createAudioPlayer,
  AudioPlayer as ExpoAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { musicService, Track } from "./music-service";
import { storageService } from "./storage-service";

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  queue: Track[];
  currentQueueIndex: number;
  shuffleActive: boolean;
  repeatMode: "off" | "one" | "all";
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
    repeatMode: "off",
  };
  private onStateChange: ((state: PlayerState) => void)[] = [];
  private updateInterval: any = null;
  private isShuffled: boolean = false;
  private originalQueue: Track[] = [];
  private isAdvancing: boolean = false;
  private advancingFromTrackId: string | null = null;
  private nextPlayer: ExpoAudioPlayer | null = null;
  private nextTrack: Track | null = null;
  private isPreBuffering: boolean = false;
  private retryCount: number = 0;

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

          // If there's a current track, we need to initialize the player with it
          // but not start playing it yet.
          if (this.state.currentTrack) {
            let sourceUrl = await storageService.getDownloadedTrackPath(
              this.state.currentTrack.id,
            );

            if (!sourceUrl) {
              sourceUrl = await musicService.getStreamUrl(
                this.state.currentTrack.id,
                this.state.currentTrack.provider,
              );
            }

            if (sourceUrl) {
              this.player = createAudioPlayer({ uri: sourceUrl });

              // Restore metadata for lock screen
              const track = this.state.currentTrack;
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
              if (typeof (this.player as any).setActiveForLockScreen === "function") {
                (this.player as any).setActiveForLockScreen(true, metadata);
              }
              
              (this.player as any).showNowPlayingNotification = true;

              // Restore position if available
              if (this.state.position > 0) {
                this.player.seekTo(this.state.position / 1000);
              }

              this.setupPlayerListeners();
              // Trigger an initial position update to sync the progress bar
              setTimeout(() => {
                this.updatePosition();
              }, 500);
            }
          }
          this.notifyStateChange();
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

  private setupPlayerListeners() {
    if (!this.player) return;

    this.player.addListener("playbackStatusUpdate", (status) => {
      if (!status) return;
      this.state.isPlaying = status.playing;
      this.state.position = status.currentTime * 1000;
      this.state.duration = status.duration * 1000;

      if (status.playing) {
        this.startPositionUpdate();
      } else {
        this.stopPositionUpdate();
      }
      this.notifyStateChange();
    });

    // Listen for remote media actions (from notification/lock screen)
    (this.player as any).addListener("next", () => this.skipToNext());
    (this.player as any).addListener("previous", () => this.skipToPrevious());

    (this.player as any).addListener("playbackFinish", () => {
      const finishedTrackId = this.state.currentTrack?.id ?? null;
      if (finishedTrackId && this.advancingFromTrackId === finishedTrackId) {
        return;
      }
      console.log("Playback finished, skipping to next track");
      this.state.isPlaying = false;
      this.notifyStateChange();
      if (!this.isAdvancing) {
        this.isAdvancing = true;
        this.advancingFromTrackId = finishedTrackId;
        this.skipToNext();
      }
    });

    // Add error listener
    (this.player as any).addListener("playbackError", async (error: any) => {
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
          console.log(`Re-fetched stream URL for ${track.title}. Resuming playback...`);
          this.player.replace({ uri: sourceUrl });
          this.player.play();
          return;
        }
      }

      console.error("Critical playback error after retry or no source available.");

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

  async playTrack(track: Track) {
    try {
      this.state.currentTrack = track;
      this.state.isPlaying = true; // Set playing early to update UI
      this.retryCount = 0; // Reset retry count for new track
      this.notifyStateChange();

      let sourceUrl = await storageService.getDownloadedTrackPath(track.id);

      if (!sourceUrl) {
        sourceUrl = await musicService.getStreamUrl(track.id, track.provider);
      }

      if (!sourceUrl) {
        console.error(
          "Failed to get stream URL or local path for track:",
          track.id,
        );
        // If we can't get a URL, skip to next track
        this.skipToNext();
        return;
      }

      if (this.player) {
        this.player.pause();
        this.player.replace({ uri: sourceUrl });
      } else {
        this.player = createAudioPlayer({ uri: sourceUrl });
        this.setupPlayerListeners();
      }

      // Add metadata for the system media notification
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

      // Enable the system notification and lock screen controls
      (this.player as any).showNowPlayingNotification = true;

      // Enable lock screen controls for sustained background playback (required for Android)
      if (typeof (this.player as any).setActiveForLockScreen === "function") {
        (this.player as any).setActiveForLockScreen(true, metadata);
      }

      this.player.play();

      // Ensure state is true and start position updates
      this.state.isPlaying = true;
      this.startPositionUpdate();
      this.notifyStateChange();

      // Reset position for new track
      this.state.position = 0;
      this.state.duration = 0;

      this.notifyStateChange();

      this.isAdvancing = false;
      this.advancingFromTrackId = null;

      // Add to history
      storageService.addToHistory(track);

      // Auto-cache the current track if not downloaded
      this.cacheCurrentTrack();
    } catch (error) {
      console.error("Error playing track:", error);
      this.skipToNext();
    }
  }

  private async cacheCurrentTrack() {
    if (this.state.currentTrack) {
      await musicService.cacheTrack(this.state.currentTrack);
    }
  }

  private async preBufferNextTrack() {
    if (this.isPreBuffering || this.state.queue.length === 0) return;

    const currentIndex = this.state.currentQueueIndex;
    let nextIndex = currentIndex + 1;

    if (nextIndex >= this.state.queue.length) {
      if (this.state.repeatMode === "all") {
        nextIndex = 0;
      } else {
        return;
      }
    }

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
          artist: track.artists?.map((a) => a.name).join(", ") || track.artist?.name || "Unknown Artist",
          album: track.album?.title || "Unknown Album",
          ...(artworkUrl ? { artwork: artworkUrl } : {}),
        };
        
        console.log(`Successfully pre-buffered: ${track.title}`);

        // Also cache the next track if not downloaded
        musicService.cacheTrack(track);
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

    // Initial update
    this.updatePosition();

    this.updateInterval = setInterval(() => {
      this.updatePosition();
    }, 500);
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
      const currentPos = this.player.currentTime;
      const currentDur = this.player.duration;

      if (typeof currentPos === "number" && !isNaN(currentPos)) {
        this.state.position = currentPos * 1000;
      }

      if (
        typeof currentDur === "number" &&
        !isNaN(currentDur) &&
        currentDur > 0
      ) {
        this.state.duration = currentDur * 1000;
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
        !this.isAdvancing &&
        this.state.repeatMode !== "one"
      ) {
        // If we've reached the absolute end and playbackFinish didn't fire
        if (this.state.position >= this.state.duration - 100) {
          console.log("Fallback skipToNext triggered from updatePosition");
          this.isAdvancing = true;
          this.skipToNext();
        }
      }

      // Trigger pre-buffering at 80% duration
      if (
        this.state.duration > 0 &&
        this.state.position > this.state.duration * 0.8 &&
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

      this.player.play();
      this.state.isPlaying = true;
      this.startPositionUpdate();
    }
    this.notifyStateChange();
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
  }

  async skipToNext(recursiveCount = 0): Promise<void> {
    if (this.state.queue.length === 0) return;

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

    // Repeat one: restart current track
    if (this.state.repeatMode === "one") {
      this.seekTo(0);
      this.player?.play();
      this.state.isPlaying = true;
      this.startPositionUpdate();
      this.notifyStateChange();
      this.isAdvancing = false;
      this.advancingFromTrackId = null;
      return;
    }

    const isLastTrack =
      this.state.currentQueueIndex >= this.state.queue.length - 1;

    if (!isLastTrack) {
      this.state.currentQueueIndex++;
    } else if (this.state.repeatMode === "all") {
      this.state.currentQueueIndex = 0;
    } else {
      // Repeat off and at the end: stop playback
      console.log("End of queue reached, stopping playback");
      this.state.isPlaying = false;
      this.player?.pause();
      this.notifyStateChange();
      this.isAdvancing = false;
      this.advancingFromTrackId = null;
      return;
    }

    const nextTrack = this.state.queue[this.state.currentQueueIndex];

    // Check for unavailable tracks (matching web app logic)
    if (nextTrack?.isUnavailable) {
      console.warn(`Track ${nextTrack.title} is unavailable, skipping...`);
      return this.skipToNext(recursiveCount + 1);
    }

    // Ensure we reset position and playing state before loading next
    this.state.position = 0;
    this.state.isPlaying = true;
    this.notifyStateChange();

    // Check if we have a pre-buffered player for this track
    if (this.nextPlayer && this.nextTrack?.id === nextTrack.id) {
      console.log(`Using pre-buffered player for gapless skip to: ${nextTrack.title}`);
      
      const oldPlayer = this.player;
      this.player = this.nextPlayer;
      this.state.currentTrack = nextTrack;
      this.state.isPlaying = true;
      
      this.setupPlayerListeners();
      this.player.play();
      
      // Cleanup old player
      if (oldPlayer) {
        oldPlayer.pause();
      }
      
      this.nextPlayer = null;
      this.nextTrack = null;
      
      // Start position updates and Notify
      this.startPositionUpdate();
      this.notifyStateChange();
      
      // Add to history
      storageService.addToHistory(nextTrack);
    } else {
      await this.playTrack(nextTrack);
    }
    this.isAdvancing = false;
    this.advancingFromTrackId = null;
  }

  async skipToPrevious(recursiveCount = 0): Promise<void> {
    if (this.state.queue.length === 0) return;

    // If more than 3 seconds in, restart track
    if (this.state.position > 3000) {
      this.seekTo(0);
      return;
    }

    if (recursiveCount > this.state.queue.length) {
      console.error("All tracks in queue are unavailable or blocked.");
      this.player?.pause();
      this.state.isPlaying = false;
      this.notifyStateChange();
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

    await this.playTrack(prevTrack);
  }

  setQueue(queue: Track[], startIndex: number = 0) {
    this.originalQueue = [...queue];
    this.state.queue = [...queue];
    this.state.currentQueueIndex = startIndex;
    this.state.shuffleActive = false; // Reset shuffle when setting new queue

    if (this.state.queue.length > 0) {
      this.playTrack(this.state.queue[this.state.currentQueueIndex]);
    }
  }

  async toggleShuffle() {
    this.state.shuffleActive = !this.state.shuffleActive;

    if (this.state.shuffleActive) {
      // Align with web app: originalQueue is already set in setQueue
      const currentTrack = this.state.currentTrack;

      // Extract all tracks except the current one from the original queue
      let tracksToShuffle = [...this.originalQueue];
      if (currentTrack) {
        tracksToShuffle = tracksToShuffle.filter(
          (t) => t.id !== currentTrack.id,
        );
      }

      // Shuffle the rest
      const shuffled = this.shuffleArray(tracksToShuffle);

      if (currentTrack) {
        this.state.queue = [currentTrack, ...shuffled];
        this.state.currentQueueIndex = 0;
      } else {
        this.state.queue = shuffled;
        this.state.currentQueueIndex = -1;
      }
    } else {
      // Restore original order
      const currentTrack = this.state.currentTrack;
      this.state.queue = [...this.originalQueue];
      if (currentTrack) {
        const currentIndex = this.state.queue.findIndex(
          (t) => t.id === currentTrack.id,
        );
        this.state.currentQueueIndex = currentIndex;
      }
    }
    this.notifyStateChange();
  }

  async toggleRepeat() {
    const modes: ("off" | "all" | "one")[] = ["off", "all", "one"];
    const currentIndex = modes.indexOf(this.state.repeatMode);
    this.state.repeatMode = modes[(currentIndex + 1) % modes.length];
    this.notifyStateChange();
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
    this.onStateChange.forEach((callback) => callback(this.state));

    if (saveState) {
      this.debouncedSaveState();
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
        repeatMode: this.state.repeatMode,
        originalQueue: this.originalQueue,
        position: this.state.position,
        duration: this.state.duration,
      });
    }, 1000); // Save state every 1 second
  }
}

export const audioPlayer = new AudioPlayerService();
