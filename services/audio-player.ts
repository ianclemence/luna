import {
  createAudioPlayer,
  AudioPlayer as ExpoAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { musicService, Track } from "./music-service";

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  queue: Track[];
  currentQueueIndex: number;
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
  };
  private onStateChange: ((state: PlayerState) => void)[] = [];
  private updateInterval: any = null;

  async init() {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        allowsRecording: false,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: false,
      });
    } catch (error) {
      console.error("Failed to set audio mode:", error);
    }
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
        // Toast notification could be good here
        return;
      }

      console.log(
        `Starting playback for ${track.title} (${track.id}) with URL: ${streamUrl}`,
      );

      if (this.player) {
        this.player.pause();
        // expo-audio players are SharedObjects, we should ideally reuse or replace source
        this.player.replace({ uri: streamUrl });
      } else {
        this.player = createAudioPlayer({ uri: streamUrl });
      }

      this.player.play();

      this.state.currentTrack = track;
      this.state.isPlaying = true;
      this.state.duration = this.player.duration * 1000; // convert to ms for consistency

      this.startPositionUpdate();
      this.notifyStateChange();

      // Add to history
      storageService.addToHistory(track);

      // Handle track finish
      this.player.addListener("playbackStatusUpdate", (status) => {
        if (status.playing !== undefined) {
          this.state.isPlaying = status.playing;
          this.notifyStateChange();
        }
      });
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
    if (!this.player) return;

    if (this.state.isPlaying) {
      this.player.pause();
      this.state.isPlaying = false;
    } else {
      this.player.play();
      this.state.isPlaying = true;
    }
    this.notifyStateChange();
  }

  async seekTo(positionMs: number) {
    if (!this.player) return;
    this.player.currentTime = positionMs / 1000;
    this.state.position = positionMs;
    this.notifyStateChange();
  }

  async skipToNext() {
    if (this.state.queue.length === 0) return;
    const nextIndex =
      (this.state.currentQueueIndex + 1) % this.state.queue.length;
    this.state.currentQueueIndex = nextIndex;
    await this.playTrack(this.state.queue[nextIndex]);
  }

  async skipToPrevious() {
    if (this.state.queue.length === 0) return;
    const prevIndex =
      (this.state.currentQueueIndex - 1 + this.state.queue.length) %
      this.state.queue.length;
    this.state.currentQueueIndex = prevIndex;
    await this.playTrack(this.state.queue[prevIndex]);
  }

  setQueue(queue: Track[], startIndex: number = 0) {
    this.state.queue = queue;
    this.state.currentQueueIndex = startIndex;
    if (queue.length > 0) {
      this.playTrack(queue[startIndex]);
    }
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
  }
}

export const audioPlayer = new AudioPlayerService();
