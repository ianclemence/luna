import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from "expo-audio";
import { listeningTracker } from "./listening-tracker";
import { musicService, Track } from "./music-service";
import { scrobblerService } from "./scrobbler-service";
import { storageService } from "./storage-service";
import { settingsManager } from "../lib/settings";

// Safely import expo-media-control
let MediaControl: any = null;
let PlaybackState: any = {
  NONE: 0,
  STOPPED: 1,
  PLAYING: 2,
  PAUSED: 3,
  BUFFERING: 4,
  ERROR: 5,
};
let Command: any = {
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  NEXT_TRACK: 'nextTrack',
  PREVIOUS_TRACK: 'previousTrack',
  SKIP_FORWARD: 'skipForward',
  SKIP_BACKWARD: 'skipBackward',
  SEEK: 'seek',
};

try {
  const MediaControlModule = require("expo-media-control");
  if (MediaControlModule) {
    MediaControl = MediaControlModule.MediaControl;
    if (MediaControlModule.PlaybackState) PlaybackState = MediaControlModule.PlaybackState;
    if (MediaControlModule.Command) Command = MediaControlModule.Command;
  }
} catch (e) {
  // Silent fail or warning - will be handled in init
  console.log("[AudioPlayer] Native MediaControl not available (likely Expo Go)");
}

type MediaControlEvent = any;

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
  private player: AudioPlayer | null = null;
  private isMediaControlEnabled = false;
  private prefetchedUrl: { trackId: string, url: string } | null = null;

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

  private mediaControlListener: (() => void) | null = null;

  private async setupMediaControls() {
    if (this.isMediaControlEnabled || !MediaControl) return;

    try {
      await MediaControl.enableMediaControls({
        capabilities: [
          Command.PLAY,
          Command.PAUSE,
          Command.STOP,
          Command.NEXT_TRACK,
          Command.PREVIOUS_TRACK,
          Command.SKIP_FORWARD,
          Command.SKIP_BACKWARD,
          Command.SEEK,
        ],
        compactCapabilities: [
          Command.PREVIOUS_TRACK,
          Command.PLAY,
          Command.NEXT_TRACK,
        ],
        notification: {
          color: "#1976D2",
        },
      });

      this.mediaControlListener = MediaControl.addListener(
        (event: MediaControlEvent) => {
          console.log("[AudioPlayerService] MediaControl event received:", JSON.stringify(event));
          console.log("[AudioPlayerService] Command.NEXT_TRACK is:", Command.NEXT_TRACK);
          console.log("[AudioPlayerService] Matches NEXT_TRACK?", event.command === Command.NEXT_TRACK);
          switch (event.command) {
            case Command.PLAY:
              console.log("[AudioPlayerService] Command PLAY matched");
              this.play();
              break;
            case Command.PAUSE:
              console.log("[AudioPlayerService] Command PAUSE matched");
              this.pause();
              break;
            case Command.STOP:
              console.log("[AudioPlayerService] Command STOP matched");
              this.player?.pause();
              break;
            case Command.NEXT_TRACK:
              console.log("[AudioPlayerService] Command NEXT_TRACK matched! Skipping to next track...");
              this.skipToNext(0, true);
              break;
            case Command.PREVIOUS_TRACK:
              console.log("[AudioPlayerService] Command PREVIOUS_TRACK matched");
              this.skipToPrevious();
              break;
            case Command.SKIP_FORWARD:
              console.log("[AudioPlayerService] Command SKIP_FORWARD matched");
              const currentPosForward = this.player ? this.player.currentTime * 1000 : this.state.position;
              this.seekTo(currentPosForward + (event.data?.interval || 15) * 1000);
              break;
            case Command.SKIP_BACKWARD:
              console.log("[AudioPlayerService] Command SKIP_BACKWARD matched");
              const currentPosBackward = this.player ? this.player.currentTime * 1000 : this.state.position;
              this.seekTo(Math.max(0, currentPosBackward - (event.data?.interval || 15) * 1000));
              break;
            case Command.SEEK:
              console.log("[AudioPlayerService] Command SEEK matched");
              if (typeof event.data?.position === "number") {
                this.seekTo(event.data.position * 1000);
              }
              break;
            default:
              console.log("[AudioPlayerService] No matching command in switch:", event.command);
          }
        }
      );

      this.isMediaControlEnabled = true;
    } catch (error) {
      console.warn("[AudioPlayer] Failed to setup media controls:", error);
    }
  }

  async init() {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });

      if (MediaControl) {
        await MediaControl.resetControls().catch(() => {});
      }

      await this.setupMediaControls();

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

          const track = this.state.queue[safeIndex];
          if (track) {
            await this.preparePlayer(track);
            if (this.state.position > 0) {
              this.player?.seekTo(this.state.position / 1000);
            }
          }
        }

        this.updateMediaControlState();
        this.notifyStateChange();
      }

      this.startPositionUpdate();

      musicService.enforceCacheLimit().catch(console.error);
    } catch (error) {
      console.error("AudioPlayer init error:", error);
    }
  }

  private async preparePlayer(track: Track) {
    const sourceUrl = await this.getPlayableUrl(track);
    if (!sourceUrl) return;

    if (this.player) {
      this.player.replace(sourceUrl);
    } else {
      this.player = createAudioPlayer(sourceUrl);
      
      // Listen for playback events
      this.player.addListener("playbackStatusUpdate", (status) => {
        if (this.state.isPlaying !== status.playing) {
          this.state.isPlaying = status.playing;
          this.updateMediaControlState();
          this.notifyStateChange();
        }

        if (status.didJustFinish) {
          this.handleTrackCompletion();
        }
      });
    }

    this.state.currentTrack = track;
    this.state.duration = track.duration || 0;
    
    await this.updateMediaControlMetadata(track);
    this.updateMediaControlState();
  }

  private async updateMediaControlMetadata(track: Track) {
    if (!this.isMediaControlEnabled) return;

    await MediaControl.updateMetadata({
      title: track.title,
      artist: this.getTrackArtist(track),
      album: track.album?.title || "Unknown Album",
      artwork: { uri: track.album?.coverUrl || musicService.getCoverUrl(track) || "" },
      duration: track.duration ? track.duration / 1000 : 0,
    });
  }

  private updateMediaControlState() {
    if (!this.isMediaControlEnabled || !this.player) return;

    const state = this.state.isPlaying
      ? PlaybackState.PLAYING
      : PlaybackState.PAUSED;

    MediaControl.updatePlaybackState(
      state,
      this.state.position / 1000,
      this.state.isPlaying ? (this.player.playbackRate || 1.0) : 0.0
    );
  }

  private getTrackArtist(track: Track): string {
    return (
      track.artists?.map((artist) => artist.name).join(", ") ||
      track.artist?.name ||
      "Unknown Artist"
    );
  }

  private async getPlayableUrl(track: Track): Promise<string | null> {
    if (this.prefetchedUrl?.trackId === track.id) {
      const url = this.prefetchedUrl.url;
      this.prefetchedUrl = null;
      return url;
    }
    return this.resolveStreamUrl(track);
  }

  private async resolveStreamUrl(track: Track): Promise<string | null> {
    let sourceUrl = await storageService.getDownloadedTrackPath(track.id);

    if (!sourceUrl) {
      const settings = await settingsManager.getSettings();
      sourceUrl = await musicService.getStreamUrl(track.id, track.provider as any, settings.streamingQuality);
    }

    const isMpdFileUri =
      typeof sourceUrl === "string" &&
      sourceUrl.startsWith("file://") &&
      sourceUrl.endsWith(".mpd");

    const trackHasLongDuration = (track.duration ?? 0) > 45000;

    if (sourceUrl && isMpdFileUri && trackHasLongDuration) {
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

  private async prefetchNextTrack() {
    if (this.state.queue.length === 0) return;

    const nextIndex = this.state.currentQueueIndex + 1;
    if (nextIndex >= this.state.queue.length) return; // End of queue

    const nextTrack = this.state.queue[nextIndex];
    if (!nextTrack || nextTrack.isUnavailable) return;
    
    // Don't prefetch if we already have it
    if (this.prefetchedUrl?.trackId === nextTrack.id) return;

    try {
      const sourceUrl = await this.resolveStreamUrl(nextTrack);
      if (sourceUrl) {
        this.prefetchedUrl = { trackId: nextTrack.id, url: sourceUrl };
      }
    } catch (error) {
      console.warn("[AudioPlayer] Failed to prefetch next track:", error);
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
    this.updateMediaControlState();
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
      if (recursiveCount > this.state.queue.length + 2) {
        console.error("Too many failed playback attempts.");
        this.state.isPlaying = false;
        this.notifyStateChange();
        return;
      }

      this.stopPositionUpdate();

      await this.preparePlayer(track);
      
      if (!this.player) {
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

      this.player.play();
      this.state.isPlaying = true;
      this.state.position = 0;

      this.updateMediaControlState();
      this.startPositionUpdate();
      this.notifyStateChange();

      listeningTracker.onTrackStart(track);
      scrobblerService.updateNowPlaying(track);
      storageService.addToHistory(track);

      // Fire off prefetch for the next track in the queue to ensure gapless/background progression
      this.prefetchNextTrack();
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

    this.updatePosition();

    this.updateInterval = setInterval(() => {
      this.updatePosition();
    }, 1000);
  }

  private stopPositionUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private updatePosition() {
    if (this.isAdvancing || !this.player) return;

    try {
      const currentPosition = this.player.currentTime * 1000;
      const currentDuration = this.player.duration * 1000;

      if (typeof currentPosition === "number" && !isNaN(currentPosition)) {
        this.state.position = currentPosition;
      }

      if (
        typeof currentDuration === "number" &&
        !isNaN(currentDuration) &&
        currentDuration > 0
      ) {
        this.state.duration = currentDuration;
      }

      listeningTracker.onTimeUpdate(this.player.currentTime, this.player.duration);

      this.notifyStateChange(false);
      this.updateMediaControlState();
    } catch (error) {
      console.error("Error updating position:", error);
    }
  }

  async play() {
    if (!this.player) {
      if (!this.state.currentTrack && this.state.queue.length > 0) {
        const safeIndex = Math.max(0, this.state.currentQueueIndex);
        const track = this.state.queue[safeIndex];
        if (track) {
          await this.preparePlayer(track);
        }
      }
    }

    if (this.player && !this.player.playing) {
      this.player.play();
      this.state.isPlaying = true;
      this.notifyStateChange();
      this.immediatelySaveState();
      this.updateMediaControlState();
    }
  }

  async pause() {
    if (this.player && this.player.playing) {
      this.player.pause();
      this.state.isPlaying = false;
      this.notifyStateChange();
      this.immediatelySaveState();
      this.updateMediaControlState();
    }
  }

  async togglePlayPause() {
    if (!this.player) return;

    if (this.player.playing) {
      this.player.pause();
      this.state.isPlaying = false;
    } else {
      if (!this.state.currentTrack && this.state.queue.length > 0) {
        const safeIndex = Math.max(0, this.state.currentQueueIndex);
        const track = this.state.queue[safeIndex];
        if (track) {
          await this.preparePlayer(track);
        }
      }

      if (this.player) {
        this.player.play();
        this.state.isPlaying = true;
      }
    }

    this.updateMediaControlState();
    this.notifyStateChange();
    this.immediatelySaveState();
  }

  async seekTo(positionMs: number) {
    if (!this.player) return;

    this.player.seekTo(positionMs / 1000);
    this.state.position = positionMs;

    this.notifyStateChange();
    this.immediatelySaveState();
    this.updateMediaControlState();
  }

  async skipToNext(recursiveCount = 0, isManual = false): Promise<void> {
    console.log("[AudioPlayerService] skipToNext called - queue length:", this.state.queue.length, "current index:", this.state.currentQueueIndex, "recursiveCount:", recursiveCount, "isManual:", isManual);
    if (this.state.queue.length === 0) {
      console.log("[AudioPlayerService] skipToNext returned early because queue is empty!");
      return;
    }

    try {
      if (recursiveCount > this.state.queue.length) {
        console.log("[AudioPlayerService] skipToNext reached limit: pausing player");
        this.player?.pause();
        this.state.isPlaying = false;
        this.notifyStateChange();
        return;
      }

      const isLastTrack =
        this.state.currentQueueIndex >= this.state.queue.length - 1;

      this.state.currentQueueIndex = isLastTrack
        ? 0
        : this.state.currentQueueIndex + 1;

      const nextTrack = this.state.queue[this.state.currentQueueIndex];

      if (!nextTrack) return;

      if (nextTrack.isUnavailable) {
        return this.skipToNext(recursiveCount + 1, isManual);
      }

      await this.playTrack(nextTrack);

      if (isManual) {
        listeningTracker.onSkip();
      }
    } catch (error) {
      console.error("Error skipping to next track:", error);
    }
  }

  async skipToPrevious(): Promise<void> {
    if (this.state.queue.length === 0) return;

    try {
      const currentPos = this.player ? this.player.currentTime * 1000 : this.state.position;
      console.log("[AudioPlayerService] skipToPrevious - Native position:", currentPos, "State position:", this.state.position);

      if (currentPos > 3000) {
        console.log("[AudioPlayerService] skipToPrevious - Seeks to 0 (position > 3000)");
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
        // Simple skip back, could be improved with recursion like skipToNext
        return;
      }

      await this.playTrack(prevTrack);
      listeningTracker.onSkip();
    } catch (error) {
      console.error("Error skipping to previous track:", error);
    }
  }

  setQueue(queue: Track[], startIndex: number = 0) {
    this.originalQueue = [...queue];
    this.state.queue = [...queue];
    this.state.currentQueueIndex = startIndex;
    this.state.shuffleActive = false;

    this.notifyStateChange();

    if (this.state.queue.length > 0) {
      const safeIndex =
        startIndex >= 0 && startIndex < this.state.queue.length
          ? startIndex
          : 0;

      const track = this.state.queue[safeIndex];
      if (track) {
        this.playTrack(track).catch(console.error);
      }
    }
  }

  async toggleShuffle() {
    this.state.shuffleActive = !this.state.shuffleActive;
    const currentTrack = this.state.currentTrack;

    if (this.state.shuffleActive) {
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

    this.notifyStateChange();
  }

  async cleanup() {
    this.stopPositionUpdate();
    scrobblerService.clearTimer();

    if (this.notifyThrottleTimer) {
      clearTimeout(this.notifyThrottleTimer);
    }

    if (this.saveStateTimer) {
      clearTimeout(this.saveStateTimer);
    }

    this.player?.pause();
    
    if (this.mediaControlListener) {
      this.mediaControlListener();
      this.mediaControlListener = null;
    }
    
    if (this.isMediaControlEnabled && MediaControl) {
      await MediaControl.disableMediaControls();
    }
    this.isMediaControlEnabled = false;

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
      this.immediatelySaveState();
      this.saveStateTimer = null;
    }, 5000);
  }
}

export const audioPlayer = new AudioPlayerService();