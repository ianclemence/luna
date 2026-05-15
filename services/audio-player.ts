import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
} from "react-native-track-player";

// Defensive constants for environments where native module might be missing (e.g. Expo Go)
const SafeCapability = Capability || ({} as any);
const SafeEvent = Event || ({} as any);

import { listeningTracker } from "./listening-tracker";
import { musicService, Track } from "./music-service";
import { scrobblerService } from "./scrobbler-service";
import { storageService } from "./storage-service";

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
  private isTrackPlayerReady = false;

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
  private saveStateTimer: any = null;
  private notifyThrottleTimer: any = null;

  private originalQueue: Track[] = [];
  private isAdvancing = false;
  private advancingFromTrackId: string | null = null;
  private skipToNextLock = false;

  private lastNotifiedPosition = 0;
  private positionUpdateThrottleMs = 1000;
  private pendingPositionNotify = false;

  private async setupTrackPlayer() {
    if (this.isTrackPlayerReady) return;

    try {
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
      });
    } catch (error: any) {
      const message = String(error?.message || "");

      if (
        !message.includes("already been initialized") &&
        !message.includes("The player has already been initialized")
      ) {
        console.warn("[AudioPlayer] Setup error:", error);
        return; // Don't crash the app if native player isn't available
      }
    }

    try {
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior:
            AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        },

        capabilities: [
          SafeCapability.Play,
          SafeCapability.Pause,
          SafeCapability.SkipToNext,
          SafeCapability.SkipToPrevious,
          SafeCapability.SeekTo,
          SafeCapability.Stop,
        ].filter(Boolean),

        compactCapabilities: [
          SafeCapability.SkipToPrevious,
          SafeCapability.Play,
          SafeCapability.Pause,
          SafeCapability.SkipToNext,
        ].filter(Boolean),

        notificationCapabilities: [
          SafeCapability.Play,
          SafeCapability.Pause,
          SafeCapability.SkipToNext,
          SafeCapability.SkipToPrevious,
          SafeCapability.SeekTo,
          SafeCapability.Stop,
        ].filter(Boolean),

        progressUpdateEventInterval: 1,
      });

      await TrackPlayer.setRepeatMode(RepeatMode.Queue);

      TrackPlayer.addEventListener(SafeEvent.PlaybackTrackChanged || "playback-track-changed", async () => {
        await this.syncCurrentTrackFromPlayer();
      });

      TrackPlayer.addEventListener(SafeEvent.PlaybackQueueEnded || "playback-queue-ended", async () => {
        if (!this.skipToNextLock) {
          await this.handleTrackCompletion();
        }
      });

      TrackPlayer.addEventListener(SafeEvent.PlaybackError || "playback-error", async (error) => {
        console.error("TrackPlayer playback error:", error);

        if (!this.skipToNextLock) {
          await this.skipToNext();
        }
      });

      this.isTrackPlayerReady = true;
    } catch (e) {
      console.warn("[AudioPlayer] Failed to set options (native module missing?):", e);
    }
  }

  async init() {
    try {
      await this.setupTrackPlayer();

      const savedState = await storageService.getPlayerState();

      if (savedState) {
        this.state = {
          ...this.state,
          ...savedState,
          isPlaying: false,
        };

        this.originalQueue = savedState.originalQueue || savedState.queue || [];

        if (this.state.queue.length > 0) {
          const safeIndex =
            this.state.currentQueueIndex >= 0
              ? this.state.currentQueueIndex
              : 0;

          await this.loadQueueIntoTrackPlayer(this.state.queue, safeIndex);

          if (this.state.position > 0) {
            await TrackPlayer.seekTo(this.state.position / 1000);
          }
        }

        this.notifyStateChange();
      }

      this.startPositionUpdate();

      musicService.enforceCacheLimit().catch(console.error);
    } catch (error) {
      console.error("AudioPlayer init error:", error);
    }
  }

  private getTrackArtist(track: Track): string {
    return (
      track.artists?.map((artist) => artist.name).join(", ") ||
      track.artist?.name ||
      "Unknown Artist"
    );
  }

  private async getPlayableUrl(track: Track): Promise<string | null> {
    let sourceUrl = await storageService.getDownloadedTrackPath(track.id);

    if (!sourceUrl) {
      sourceUrl = await musicService.getStreamUrl(track.id, track.provider);
    }

    const isMpdFileUri =
      typeof sourceUrl === "string" &&
      sourceUrl.startsWith("file://") &&
      sourceUrl.endsWith(".mpd");

    const trackHasLongDuration = (track.duration ?? 0) > 45000;

    if (sourceUrl && isMpdFileUri && trackHasLongDuration) {
      console.warn(
        `[AudioPlayer] Detected local MPD URI for long track ${track.title}. Retrying with skipManifest.`
      );

      const directUrl = await musicService.getStreamUrl(
        track.id,
        track.provider,
        "HI_RES_LOSSLESS",
        { skipManifest: true }
      );

      if (directUrl && !directUrl.startsWith("file://")) {
        sourceUrl = directUrl;
      }
    }

    return sourceUrl || null;
  }

  private async trackToPlayerItem(track: Track) {
    const sourceUrl = await this.getPlayableUrl(track);

    if (!sourceUrl) return null;

    return {
      id: track.id,
      url: sourceUrl,
      title: track.title,
      artist: this.getTrackArtist(track),
      album: track.album?.title || "Unknown Album",
      artwork: track.album?.coverUrl,
      duration: track.duration ? track.duration / 1000 : undefined,
    };
  }

  private async loadQueueIntoTrackPlayer(
    queue: Track[],
    startIndex: number = 0
  ) {
    await this.setupTrackPlayer();

    const items = [];

    for (const track of queue) {
      const item = await this.trackToPlayerItem(track);

      if (item) {
        items.push(item);
      }
    }

    await TrackPlayer.reset();

    if (items.length === 0) return;

    await TrackPlayer.add(items);

    const safeIndex =
      startIndex >= 0 && startIndex < items.length ? startIndex : 0;

    await TrackPlayer.skip(safeIndex);
  }

  private async syncCurrentTrackFromPlayer() {
    try {
      const index = await TrackPlayer.getCurrentTrack();

      if (typeof index !== "number") return;

      const track = this.state.queue[index];

      if (!track) return;

      this.state.currentQueueIndex = index;
      this.state.currentTrack = track;
      this.state.position = 0;
      this.state.duration = track.duration || 0;

      listeningTracker.onTrackStart(track);
      scrobblerService.updateNowPlaying(track);
      storageService.addToHistory(track);

      this.notifyStateChange();
    } catch (error) {
      console.error("Error syncing current track:", error);
    }
  }

  private async handleTrackCompletion() {
    const finishedTrackId = this.state.currentTrack?.id ?? null;

    if (finishedTrackId && this.advancingFromTrackId === finishedTrackId) {
      return;
    }

    this.isAdvancing = true;
    this.advancingFromTrackId = finishedTrackId;
    this.state.isPlaying = false;
    this.notifyStateChange();

    if (!this.skipToNextLock) {
      this.skipToNextLock = true;

      try {
        listeningTracker.onTrackEnd();
        await this.skipToNext();
      } finally {
        this.skipToNextLock = false;
        this.isAdvancing = false;
        this.advancingFromTrackId = null;
      }
    }
  }

  async playTrack(track: Track, recursiveCount = 0) {
    try {
      await this.setupTrackPlayer();

      if (recursiveCount > this.state.queue.length + 2) {
        console.error("Too many failed playback attempts.");
        this.state.isPlaying = false;
        this.notifyStateChange();
        return;
      }

      this.stopPositionUpdate();

      const sourceUrl = await this.getPlayableUrl(track);

      if (!sourceUrl) {
        console.error("Failed to get stream URL for track:", track.id);
        setTimeout(() => this.skipToNext(recursiveCount + 1), 0);
        return;
      }

      const existingIndex = this.state.queue.findIndex(
        (item) => item.id === track.id
      );

      if (existingIndex !== -1) {
        this.state.currentQueueIndex = existingIndex;
      } else {
        this.state.queue = [track];
        this.originalQueue = [track];
        this.state.currentQueueIndex = 0;
      }

      this.state.currentTrack = track;
      this.state.isPlaying = true;
      this.state.position = 0;
      this.state.duration = track.duration || 0;

      await this.loadQueueIntoTrackPlayer(
        this.state.queue,
        Math.max(this.state.currentQueueIndex, 0)
      );

      await TrackPlayer.play();

      this.state.isPlaying = true;
      this.isAdvancing = false;
      this.advancingFromTrackId = null;

      this.startPositionUpdate();
      this.notifyStateChange();

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

  private startPositionUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updatePosition().catch(console.error);

    this.updateInterval = setInterval(() => {
      this.updatePosition().catch(console.error);
    }, 1000);
  }

  private stopPositionUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private async updatePosition() {
    if (this.isAdvancing) return;

    try {
      const progress = await TrackPlayer.getProgress();
      const playbackState = await TrackPlayer.getState();

      const currentPosition = progress.position * 1000;
      const currentDuration = progress.duration * 1000;

      if (typeof currentPosition === "number" && !isNaN(currentPosition)) {
        this.state.position = currentPosition;
      }

      if (
        typeof currentDuration === "number" &&
        !isNaN(currentDuration) &&
        currentDuration > 0
      ) {
        const metadataDuration = this.state.currentTrack?.duration || 0;

        if (metadataDuration > 60000 && currentDuration < 45000) {
          this.state.duration = metadataDuration;
        } else {
          this.state.duration = currentDuration;
        }
      } else if (this.state.duration <= 0 && this.state.currentTrack?.duration) {
        this.state.duration = this.state.currentTrack.duration;
      }

      this.state.isPlaying = playbackState === State.Playing;

      listeningTracker.onTimeUpdate(progress.position, progress.duration);

      const threshold = 1000;

      if (
        this.state.duration > 0 &&
        this.state.position >= this.state.duration - threshold &&
        this.state.isPlaying &&
        !this.isAdvancing
      ) {
        this.isAdvancing = true;
        await this.handleTrackCompletion();
        return;
      }

      this.notifyStateChange(false);
    } catch (error) {
      console.error("Error updating position:", error);
    }
  }

  async togglePlayPause() {
    await this.setupTrackPlayer();

    const playbackState = await TrackPlayer.getState();

    if (playbackState === State.Playing) {
      await TrackPlayer.pause();

      this.state.isPlaying = false;
      this.stopPositionUpdate();
    } else {
      if (!this.state.currentTrack && this.state.queue.length > 0) {
        const safeIndex =
          this.state.currentQueueIndex >= 0
            ? this.state.currentQueueIndex
            : 0;

        this.state.currentQueueIndex = safeIndex;
        this.state.currentTrack = this.state.queue[safeIndex];
      }

      if (this.state.currentTrack) {
        await TrackPlayer.play();

        this.state.isPlaying = true;
        this.startPositionUpdate();
      }
    }

    this.notifyStateChange();
    this.immediatelySaveState();
  }

  async seekTo(positionMs: number) {
    await this.setupTrackPlayer();

    await TrackPlayer.seekTo(positionMs / 1000);

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

  async skipToNext(recursiveCount = 0, isManual = false): Promise<void> {
    if (this.state.queue.length === 0) return;

    try {
      await this.setupTrackPlayer();

      if (recursiveCount > this.state.queue.length) {
        console.error("All tracks in queue are unavailable or blocked.");

        await TrackPlayer.pause();

        this.state.isPlaying = false;
        this.isAdvancing = false;
        this.advancingFromTrackId = null;

        this.notifyStateChange();
        return;
      }

      if (!this.isAdvancing) {
        this.isAdvancing = true;
        this.advancingFromTrackId = this.state.currentTrack?.id ?? null;
      }

      const isLastTrack =
        this.state.currentQueueIndex >= this.state.queue.length - 1;

      this.state.currentQueueIndex = isLastTrack
        ? 0
        : this.state.currentQueueIndex + 1;

      const nextTrack = this.state.queue[this.state.currentQueueIndex];

      if (!nextTrack) {
        this.isAdvancing = false;
        this.advancingFromTrackId = null;
        return;
      }

      if (nextTrack.isUnavailable) {
        console.warn(`Track ${nextTrack.title} is unavailable, skipping...`);

        this.isAdvancing = false;
        this.advancingFromTrackId = null;

        setTimeout(() => this.skipToNext(recursiveCount + 1, isManual), 0);
        return;
      }

      await TrackPlayer.skip(this.state.currentQueueIndex);
      await TrackPlayer.play();

      this.state.currentTrack = nextTrack;
      this.state.position = 0;
      this.state.duration = nextTrack.duration || 0;
      this.state.isPlaying = true;

      if (isManual) {
        listeningTracker.onSkip();
      }

      this.isAdvancing = false;
      this.advancingFromTrackId = null;

      this.startPositionUpdate();
      this.notifyStateChange();
    } catch (error) {
      console.error("Error skipping to next track:", error);

      this.isAdvancing = false;
      this.advancingFromTrackId = null;
    }
  }

  async skipToPrevious(recursiveCount = 0): Promise<void> {
    if (this.state.queue.length === 0) return;

    try {
      await this.setupTrackPlayer();

      if (recursiveCount > this.state.queue.length) {
        console.error("All previous tracks are unavailable or blocked.");
        return;
      }

      if (this.state.position > 3000) {
        await this.seekTo(0);
        return;
      }

      const prevIndex =
        (this.state.currentQueueIndex - 1 + this.state.queue.length) %
        this.state.queue.length;

      this.state.currentQueueIndex = prevIndex;

      const prevTrack = this.state.queue[prevIndex];

      if (!prevTrack) return;

      if (prevTrack.isUnavailable) {
        return this.skipToPrevious(recursiveCount + 1);
      }

      await TrackPlayer.skip(prevIndex);
      await TrackPlayer.play();

      this.state.currentTrack = prevTrack;
      this.state.position = 0;
      this.state.duration = prevTrack.duration || 0;
      this.state.isPlaying = true;

      listeningTracker.onSkip();

      this.startPositionUpdate();
      this.notifyStateChange();
    } catch (error) {
      console.error("Error skipping to previous track:", error);
    }
  }

  setQueue(queue: Track[], startIndex: number = 0) {
    this.originalQueue = [...queue];
    this.state.queue = [...queue];
    this.state.currentQueueIndex = startIndex;
    this.state.shuffleActive = false;

    this.isAdvancing = false;
    this.advancingFromTrackId = null;
    this.skipToNextLock = false;

    this.notifyStateChange();

    if (this.state.queue.length > 0) {
      const safeIndex =
        startIndex >= 0 && startIndex < this.state.queue.length
          ? startIndex
          : 0;

      this.state.currentQueueIndex = safeIndex;

      this.loadQueueIntoTrackPlayer(this.state.queue, safeIndex)
        .then(() => {
          const track = this.state.queue[safeIndex];

          if (track) {
            return this.playTrack(track);
          }

          return undefined;
        })
        .catch(console.error);
    }
  }

  async toggleShuffle() {
    await this.setupTrackPlayer();

    this.state.shuffleActive = !this.state.shuffleActive;

    const currentTrack = this.state.queue[this.state.currentQueueIndex];

    if (this.state.shuffleActive) {
      if (this.state.queue.length > 0) {
        const remainingTracks = [...this.originalQueue].filter(
          (track) => track.id !== currentTrack?.id
        );

        this.shuffleArray(remainingTracks);

        if (currentTrack) {
          this.state.queue = [currentTrack, ...remainingTracks];
          this.state.currentQueueIndex = 0;
        } else {
          this.state.queue = remainingTracks;
          this.state.currentQueueIndex = 0;
        }
      }
    } else {
      this.state.queue = [...this.originalQueue];

      if (currentTrack) {
        const newIndex = this.state.queue.findIndex(
          (track) => track.id === currentTrack.id
        );

        if (newIndex !== -1) {
          this.state.currentQueueIndex = newIndex;
        }
      }
    }

    await this.loadQueueIntoTrackPlayer(
      this.state.queue,
      Math.max(this.state.currentQueueIndex, 0)
    );

    if (this.state.currentTrack && this.state.isPlaying) {
      await TrackPlayer.play();
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

    try {
      await TrackPlayer.pause();
    } catch (error) {
      console.error("Error pausing TrackPlayer during cleanup:", error);
    }

    this.onStateChange = [];
  }

  private shuffleArray<T>(array: T[]) {
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
      this.onStateChange = this.onStateChange.filter(
        (existingCallback) => existingCallback !== callback
      );
    };
  }

  private notifyStateChange(saveState: boolean = true) {
    if (saveState) {
      this.onStateChange.forEach((callback) => callback(this.state));
      this.debouncedSaveState();
      return;
    }

    const positionDelta = Math.abs(
      this.state.position - this.lastNotifiedPosition
    );

    if (positionDelta >= 500 || !this.pendingPositionNotify) {
      this.onStateChange.forEach((callback) => callback(this.state));
      this.lastNotifiedPosition = this.state.position;
      this.pendingPositionNotify = false;

      if (this.notifyThrottleTimer) {
        clearTimeout(this.notifyThrottleTimer);
        this.notifyThrottleTimer = null;
      }

      return;
    }

    if (!this.pendingPositionNotify && !this.notifyThrottleTimer) {
      this.pendingPositionNotify = true;

      this.notifyThrottleTimer = setTimeout(() => {
        this.onStateChange.forEach((callback) => callback(this.state));
        this.lastNotifiedPosition = this.state.position;
        this.pendingPositionNotify = false;
        this.notifyThrottleTimer = null;
      }, this.positionUpdateThrottleMs);
    }
  }

  private immediatelySaveState() {
    if (this.saveStateTimer) {
      clearTimeout(this.saveStateTimer);
    }

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

  private debouncedSaveState() {
    if (this.saveStateTimer) {
      clearTimeout(this.saveStateTimer);
    }

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
    }, 1000);
  }
}

export const audioPlayer = new AudioPlayerService();