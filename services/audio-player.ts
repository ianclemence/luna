import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { listeningTracker } from "./listening-tracker";
import { musicService, Track } from "./music-service";
import { replayGainService } from "./replay-gain";
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

export type RepeatMode = "off" | "one" | "all";

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  queue: Track[];
  currentQueueIndex: number;
  shuffleActive: boolean;
  repeatMode: RepeatMode;
  volume: number;
}

class AudioPlayerService {
  private player: AudioPlayer | null = null;
  private isMediaControlEnabled = false;
  private resolvedUrls = new Map<string, string>();
  private cacheOrder: string[] = [];
  private loadingTrackId: string | null = null;

  // Preload cache (matching web app's preloadCache)
  private preloadCache = new Map<string, string>();
  private preloadAbortController: AbortController | null = null;
  private preloadCheckInterval: any = null;

  // Gapless playback: pre-loaded player for next track
  private preloadedPlayer: AudioPlayer | null = null;
  private preloadedTrackId: string | null = null;
  private playbackSequence = 0;

  // ReplayGain
  private currentRgValues: { trackGain: number; trackPeak: number; albumGain: number; albumPeak: number } | null = null;

  private cacheResolvedUrl(trackId: string, url: string) {
    if (this.resolvedUrls.has(trackId)) {
      this.cacheOrder = this.cacheOrder.filter((id) => id !== trackId);
    }
    this.resolvedUrls.set(trackId, url);
    this.cacheOrder.push(trackId);

    // Keep sliding-window of last 50 tracks to prevent memory leaks while keeping history hot (matching web app)
    if (this.cacheOrder.length > 50) {
      const oldestId = this.cacheOrder.shift();
      if (oldestId) {
        this.resolvedUrls.delete(oldestId);
        console.log("[AudioPlayerService] Evicted oldest resolved URL from cache:", oldestId);
      }
    }
  }

  private state: PlayerState = {
    currentTrack: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    queue: [],
    currentQueueIndex: -1,
    shuffleActive: false,
    repeatMode: "off",
    volume: 1.0,
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

        // Restore volume
        try {
          const storedVol = await AsyncStorage.getItem("player_volume");
          if (storedVol !== null) {
            this.state.volume = parseFloat(storedVol) || 1.0;
          }
        } catch {}

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

      // Start preload check interval (every 2 seconds, matching web app)
      this.preloadCheckInterval = setInterval(() => {
        this.checkPreloadConditions();
      }, 2000);

      musicService.enforceCacheLimit().catch(console.error);
    } catch (error) {
      console.error("AudioPlayer init error:", error);
    }
  }

  private async preparePlayer(track: Track): Promise<boolean> {
    const sourceUrl = await this.getPlayableUrl(track);
    if (!sourceUrl) return false;

    try {
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
      
      // Fetch and apply ReplayGain
      this.currentRgValues = track.replayGain || null;
      if (!this.currentRgValues) {
        // Fetch RG data in background (non-blocking)
        musicService.getReplayGain(track.id, track.provider as any).then((rg) => {
          if (rg && this.state.currentTrack?.id === track.id) {
            this.currentRgValues = rg;
            this.applyReplayGain();
          }
        }).catch(() => {});
      }
      await this.applyReplayGain();

      await this.updateMediaControlMetadata(track);
      this.updateMediaControlState();
      return true;
    } catch (error) {
      console.error("[AudioPlayerService] Error preparing player:", error);
      return false;
    }
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
    // Check preload cache first (matching web app's tryStartPreloadedTrackImmediately)
    const preloadedUrl = this.preloadCache.get(track.id);
    if (preloadedUrl) {
      console.log("[AudioPlayer] Using preloaded URL for track:", track.title);
      this.preloadCache.delete(track.id);
      return preloadedUrl;
    }

    if (this.resolvedUrls.has(track.id)) {
      const url = this.resolvedUrls.get(track.id)!;
      console.log("[AudioPlayer] Using cached/prefetched URL for track:", track.title);
      return url;
    }
    const url = await this.resolveStreamUrl(track);
    if (url) {
      this.cacheResolvedUrl(track.id, url);
    }
    return url;
  }

  private async resolveStreamUrl(track: Track): Promise<string | null> {
    // Check if downloaded track exists (works offline)
    let sourceUrl = await storageService.getDownloadedTrackPath(track.id);
    if (sourceUrl) return sourceUrl;

    // Check network connectivity before attempting stream resolution
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.warn("[AudioPlayer] Offline — cannot resolve stream URL for:", track.title);
      return null;
    }

    const settings = await settingsManager.getSettings();
    sourceUrl = await musicService.getStreamUrl(track.id, track.provider as any, settings.streamingQuality, { track });

    // Handle manifest: prefix (base64-encoded manifest from Zarz endpoints)
    if (sourceUrl && sourceUrl.startsWith("manifest:")) {
      const base64Manifest = sourceUrl.slice("manifest:".length);
      try {
        sourceUrl = await musicService.extractStreamUrlFromManifest(base64Manifest, false, true);
      } catch (e) {
        console.warn("[AudioPlayer] Failed to resolve manifest:", e);
        return null;
      }
    }

    return sourceUrl || null;
  }

  private async prefetchSurroundingTracks() {
    if (this.state.queue.length <= 1) return;

    const currentIndex = this.state.currentQueueIndex;

    // Prefetch Next Track (matching web app: only 1 track ahead)
    const nextIndex = (currentIndex + 1) % this.state.queue.length;
    const nextTrack = this.state.queue[nextIndex];
    if (nextTrack && !nextTrack.isUnavailable && nextIndex !== currentIndex) {
      this.preloadTrack(nextTrack).catch((err) =>
        console.warn("[AudioPlayer] Failed to preload next track:", err)
      );
    }
  }

  private async preloadTrack(track: Track) {
    if (this.preloadCache.has(track.id)) return;
    if (this.resolvedUrls.has(track.id)) return;

    try {
      const sourceUrl = await this.resolveStreamUrl(track);
      if (sourceUrl) {
        this.preloadCache.set(track.id, sourceUrl);
        this.cacheResolvedUrl(track.id, sourceUrl);
        console.log("[AudioPlayer] Preloaded track URL successfully:", track.title);

        // Create a pre-loaded AudioPlayer for gapless handoff
        this.createPreloadedPlayer(sourceUrl, track);
      }
    } catch (error) {
      console.warn(`[AudioPlayer] Failed to preload track ${track.title}:`, error);
    }
  }

  private async createPreloadedPlayer(sourceUrl: string, track: Track) {
    try {
      // Clean up any existing preloaded player
      if (this.preloadedPlayer) {
        try { this.preloadedPlayer.pause(); } catch {}
        this.preloadedPlayer = null;
      }

      const prePlayer = createAudioPlayer(sourceUrl);
      this.preloadedPlayer = prePlayer;
      this.preloadedTrackId = track.id;
      console.log("[AudioPlayer] Created pre-loaded player for:", track.title);
    } catch (error) {
      console.warn("[AudioPlayer] Failed to create pre-loaded player:", error);
      this.preloadedPlayer = null;
      this.preloadedTrackId = null;
    }
  }

  private async checkPreloadConditions() {
    if (!this.player || !this.state.isPlaying || !this.state.currentTrack) return;

    try {
      const currentTime = this.player.currentTime || 0;
      const duration = this.player.duration || 0;
      const timeRemaining = duration - currentTime;

      // Preload if we are in last 30 seconds of song (matching web app)
      if (duration > 0 && timeRemaining <= 30) {
        this.prefetchSurroundingTracks();
      }
    } catch (error) {
      // Ignore position read errors
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
      this.playbackSequence++;

      try {
        listeningTracker.onTrackEnd();

        if (this.state.repeatMode === "one" && finishedTrackId) {
          const track = this.state.queue.find((t) => t.id === finishedTrackId);
          if (track) {
            await this.playTrack(track);
            return;
          }
        }

        // Gapless: try to use the preloaded player for immediate handoff
        const nextIndex = this.state.currentQueueIndex + 1;
        const nextTrack = this.state.queue[nextIndex >= this.state.queue.length ? 0 : nextIndex];

        if (nextTrack && this.preloadedPlayer && this.preloadedTrackId === nextTrack.id) {
          const seq = this.playbackSequence;
          console.log("[AudioPlayer] Gapless handoff to preloaded player:", nextTrack.title);

          // Swap players: preloaded becomes active
          this.preloadedPlayer.addListener("playbackStatusUpdate", (status) => {
            if (this.playbackSequence !== seq) return;
            if (this.state.isPlaying !== status.playing) {
              this.state.isPlaying = status.playing;
              this.updateMediaControlState();
              this.notifyStateChange();
            }
            if (status.didJustFinish) {
              this.handleTrackCompletion();
            }
          });

          // Clean up old player
          if (this.player) {
            try { this.player.pause(); } catch {}
            this.player = null;
          }

          this.player = this.preloadedPlayer;
          this.preloadedPlayer = null;
          this.preloadedTrackId = null;

          this.state.currentQueueIndex = nextIndex >= this.state.queue.length ? 0 : nextIndex;
          this.state.currentTrack = nextTrack;
          this.state.duration = nextTrack.duration || 0;
          this.state.position = 0;

          // Apply ReplayGain to the new player
          this.currentRgValues = nextTrack.replayGain || null;
          await this.applyReplayGain();

          this.player.play();
          this.state.isPlaying = true;

          await this.updateMediaControlMetadata(nextTrack);
          this.updateMediaControlState();
          this.startPositionUpdate();
          this.notifyStateChange();

          listeningTracker.onTrackStart(nextTrack);
          scrobblerService.updateNowPlaying(nextTrack);
          storageService.addToHistory(nextTrack);

          // Preload the next track after gapless handoff
          this.prefetchSurroundingTracks();
          return;
        }

        await this.skipToNext();
      } finally {
        this.skipToNextLock = false;
        this.isAdvancing = false;
        this.advancingFromTrackId = null;
      }
    }
  }

  async playTrack(track: Track, recursiveCount = 0) {
    console.log("[AudioPlayerService] playTrack requested for:", track.title);
    this.loadingTrackId = track.id;

    try {
      if (recursiveCount > this.state.queue.length + 2) {
        console.error("Too many failed playback attempts.");
        this.state.isPlaying = false;
        this.notifyStateChange();
        return;
      }

      this.stopPositionUpdate();

      // Check preload cache first (matching web app's tryStartPreloadedTrackImmediately)
      const preloadedUrl = this.preloadCache.get(track.id);
      if (preloadedUrl) {
        console.log("[AudioPlayerService] Using preloaded URL for:", track.title);
        this.cacheResolvedUrl(track.id, preloadedUrl);
        this.preloadCache.delete(track.id);
      }

      const prepared = await this.preparePlayer(track);
      
      if (this.loadingTrackId !== track.id) {
        console.log("[AudioPlayerService] playTrack cancelled because a newer track was requested:", track.title);
        return;
      }
      
      if (!prepared) {
        console.error("[AudioPlayerService] playTrack failed because player preparation failed.");
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

      // Fire off preload for surrounding tracks in the queue to ensure gapless/background progression
      this.prefetchSurroundingTracks();
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

  async setVolume(volume: number) {
    this.state.volume = Math.max(0, Math.min(1, volume));
    await AsyncStorage.setItem("player_volume", String(this.state.volume));
    await this.applyReplayGain();
    this.notifyStateChange();
  }

  private async applyReplayGain() {
    if (!this.player) return;
    const effectiveVolume = await replayGainService.calculateGain(
      this.currentRgValues,
      this.state.volume,
    );
    this.player.volume = effectiveVolume;
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

      if (isLastTrack && this.state.repeatMode === "off") {
        const settings = await settingsManager.getSettings();
        if (settings.autoplayEnabled || settings.radioEnabled) {
          console.log("[AudioPlayerService] Last track reached, fetching autoplay recommendations...");
          const recommendations = await musicService.getAutoplayRecommendations(this.state.queue, 5);
          if (recommendations && recommendations.length > 0) {
            this.addToQueue(recommendations);
            this.state.currentQueueIndex = this.state.currentQueueIndex + 1;
            const nextTrack = this.state.queue[this.state.currentQueueIndex];
            if (nextTrack) {
              await this.playTrack(nextTrack);
              return;
            }
          }
        }

        this.player?.pause();
        this.state.isPlaying = false;
        this.notifyStateChange();
        return;
      }

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

  addToQueue(tracks: Track | Track[]) {
    const newTracks = Array.isArray(tracks) ? tracks : [tracks];
    this.state.queue.push(...newTracks);
    this.originalQueue.push(...newTracks);
    this.notifyStateChange();
    this.immediatelySaveState();
  }

  setQueue(queue: Track[], startIndex: number = 0) {
    this.originalQueue = [...queue];
    this.state.queue = [...queue];
    this.state.currentQueueIndex = startIndex;
    this.state.shuffleActive = false;

    // Clear preloaded player since queue changed
    if (this.preloadedPlayer) {
      try { this.preloadedPlayer.pause(); } catch {}
      this.preloadedPlayer = null;
      this.preloadedTrackId = null;
    }
    this.preloadCache.clear();

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

    // Clear preloaded player since queue order changed
    if (this.preloadedPlayer) {
      try { this.preloadedPlayer.pause(); } catch {}
      this.preloadedPlayer = null;
      this.preloadedTrackId = null;
    }
    this.preloadCache.clear();

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

  toggleRepeat() {
    const modes: RepeatMode[] = ["off", "one", "all"];
    const currentIndex = modes.indexOf(this.state.repeatMode);
    this.state.repeatMode = modes[(currentIndex + 1) % modes.length];
    this.notifyStateChange();
  }

  async cleanup() {
    this.stopPositionUpdate();
    scrobblerService.onPlaybackStop();

    if (this.notifyThrottleTimer) {
      clearTimeout(this.notifyThrottleTimer);
    }

    if (this.saveStateTimer) {
      clearTimeout(this.saveStateTimer);
    }

    this.player?.pause();
    
    if (this.preloadedPlayer) {
      try { this.preloadedPlayer.pause(); } catch {}
      this.preloadedPlayer = null;
    }

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
      repeatMode: this.state.repeatMode,
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