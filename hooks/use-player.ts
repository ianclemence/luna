import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { audioPlayer, PlayerState } from "../services/audio-player";
import { Track } from "../services/music-service";

export function usePlayer() {
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    queue: [],
    currentQueueIndex: -1,
    shuffleActive: false,
  });

  useEffect(() => {
    const unsubscribe = audioPlayer.subscribe((newState) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, []);

  const playTrack = useCallback((track: Track) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    audioPlayer.playTrack(track);
  }, []);

  const togglePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    audioPlayer.togglePlayPause();
  }, []);

  const seekTo = useCallback((position: number) => {
    audioPlayer.seekTo(position);
  }, []);

  const skipToNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic UI: Update state immediately if we have a queue
    if (state.queue.length > 0) {
      const nextIndex = (state.currentQueueIndex + 1) % state.queue.length;

      setState((prev) => ({
        ...prev,
        currentQueueIndex: nextIndex,
        currentTrack: prev.queue[nextIndex],
        position: 0,
        isPlaying: true,
      }));
    }

    audioPlayer.skipToNext(0, true);
  }, [state.queue, state.currentQueueIndex]);

  const skipToPrevious = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic UI: Restart track if more than 3s, else go back
    if (state.position > 3000) {
      setState((prev) => ({ ...prev, position: 0 }));
    } else if (state.queue.length > 0) {
      const prevIndex =
        (state.currentQueueIndex - 1 + state.queue.length) % state.queue.length;
      setState((prev) => ({
        ...prev,
        currentQueueIndex: prevIndex,
        currentTrack: prev.queue[prevIndex],
        position: 0,
        isPlaying: true,
      }));
    }

    audioPlayer.skipToPrevious();
  }, [state.queue, state.currentQueueIndex, state.position]);

  const setQueue = useCallback((queue: Track[], startIndex: number = 0) => {
    audioPlayer.setQueue(queue, startIndex);
  }, []);

  const toggleShuffle = useCallback(() => {
    Haptics.selectionAsync();
    audioPlayer.toggleShuffle();
  }, []);

  return {
    ...state,
    playTrack,
    togglePlayPause,
    seekTo,
    skipToNext,
    skipToPrevious,
    setQueue,
    toggleShuffle,
  };
}
