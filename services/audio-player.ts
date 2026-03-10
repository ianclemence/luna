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

  async init() {
    try {
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
        this.originalQueue = savedState.originalQueue || savedState.queue;

        // If there's a current track, we need to initialize the player with it
        // but not start playing it yet.
        if (this.state.currentTrack) {
          const streamUrl = await musicService.getStreamUrl(
            this.state.currentTrack.id,
            this.state.currentTrack.provider,
          );
          if (streamUrl) {
            this.player = createAudioPlayer({ uri: streamUrl });
            // We can't easily get duration until it starts loading,
            // but we can at least ensure the player exists for togglePlayPause
            this.setupPlayerListeners();
          }
        }
        this.notifyStateChange();
      }
    } catch (error) {
      console.error("Failed to set audio mode or restore state:", error);
    }
  }

  private setupPlayerListeners() {
    if (!this.player) return;

    this.player.addListener("playbackStatusUpdate", (status) => {
      if (status.playing !== undefined) {
        this.state.isPlaying = status.playing;
        this.notifyStateChange();
      }
    });
  }

  async playTrack(track: Track) {
    try {
      this.state.currentTrack = track;
      this.notifyStateChange();

      const streamUrl = await musicService.getStreamUrl(
        track.id,
        track.provider,
      );
      if (!streamUrl) {
        console.error("Failed to get stream URL for track:", track.id);
        return;
      }

      if (this.player) {
        this.player.pause();
        this.player.replace({ uri: streamUrl });
      } else {
        this.player = createAudioPlayer({ uri: streamUrl });
        this.setupPlayerListeners();
      }

      this.player.play();
      this.state.isPlaying = true;

      this.startPositionUpdate();
      this.notifyStateChange();

      // Add to history
      storageService.addToHistory(track);
    } catch (error) {
      console.error("Error playing track:", error);
    }
  }

  private startPositionUpdate() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.updateInterval = setInterval(() => {
      if (this.player) {
        this.state.position = this.player.currentTime * 1000;
        this.state.duration = this.player.duration * 1000;

        // Check if finished (expo-audio might have a better way, but currentTime >= duration works)
        if (
          this.state.duration > 0 &&
          this.state.position >= this.state.duration - 100
        ) {
          this.skipToNext();
        }

        this.notifyStateChange();
      }
    }, 500);
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
    } else {
      // If we're at 0, ensure we start updates
      if (this.state.position === 0) {
        this.startPositionUpdate();
      }
      this.player.play();
      this.state.isPlaying = true;
    }
    this.notifyStateChange();
  }

  async seekTo(positionMs: number) {
    if (!this.player) return;
    this.player.seekTo(positionMs / 1000);
    this.state.position = positionMs;
    this.notifyStateChange();
  }

  async skipToNext() {
    if (this.state.queue.length === 0) return;

    if (this.state.repeatMode === "one") {
      this.seekTo(0);
      this.player?.play();
      this.state.isPlaying = true;
      this.notifyStateChange();
      return;
    }

    const nextIndex =
      (this.state.currentQueueIndex + 1) % this.state.queue.length;

    // If at the end and repeat is off, stop
    if (nextIndex === 0 && this.state.repeatMode === "off") {
      this.state.isPlaying = false;
      this.player?.pause();
      this.notifyStateChange();
      return;
    }

    this.state.currentQueueIndex = nextIndex;
    await this.playTrack(this.state.queue[nextIndex]);
  }

  async skipToPrevious() {
    if (this.state.queue.length === 0) return;

    // If more than 3 seconds in, restart track
    if (this.state.position > 3000) {
      this.seekTo(0);
      return;
    }

    const prevIndex =
      (this.state.currentQueueIndex - 1 + this.state.queue.length) %
      this.state.queue.length;
    this.state.currentQueueIndex = prevIndex;
    await this.playTrack(this.state.queue[prevIndex]);
  }

  setQueue(queue: Track[], startIndex: number = 0) {
    this.originalQueue = [...queue];
    if (this.state.shuffleActive) {
      const shuffled = this.shuffleArray([...queue]);
      // Find the new index of the track that was at startIndex
      const currentTrack = queue[startIndex];
      const newIndex = shuffled.findIndex((t) => t.id === currentTrack.id);
      this.state.queue = shuffled;
      this.state.currentQueueIndex = newIndex;
    } else {
      this.state.queue = queue;
      this.state.currentQueueIndex = startIndex;
    }

    if (this.state.queue.length > 0) {
      this.playTrack(this.state.queue[this.state.currentQueueIndex]);
    }
  }

  async toggleShuffle() {
    this.state.shuffleActive = !this.state.shuffleActive;

    if (this.state.shuffleActive) {
      this.originalQueue = [...this.state.queue];
      const currentTrack = this.state.currentTrack;
      const shuffled = this.shuffleArray([...this.state.queue]);

      if (currentTrack) {
        // Keep current track at the top or just find its new index
        const currentIndex = shuffled.findIndex(
          (t) => t.id === currentTrack.id,
        );
        this.state.currentQueueIndex = currentIndex;
      }
      this.state.queue = shuffled;
    } else {
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

  private notifyStateChange() {
    this.onStateChange.forEach((callback) => callback(this.state));
    // Save state on every change
    storageService.savePlayerState({
      currentTrack: this.state.currentTrack,
      queue: this.state.queue,
      currentQueueIndex: this.state.currentQueueIndex,
      shuffleActive: this.state.shuffleActive,
      repeatMode: this.state.repeatMode,
      originalQueue: this.originalQueue,
    });
  }
}

export const audioPlayer = new AudioPlayerService();
