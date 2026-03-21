import * as Haptics from 'expo-haptics';
import { useState, useEffect, useCallback } from 'react';
import { audioPlayer, PlayerState } from '../services/audio-player';
import { Track } from '../services/music-service';

export function usePlayer() {
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    queue: [],
    currentQueueIndex: -1,
    shuffleActive: false,
    repeatMode: "off",
  });

  useEffect(() => {
    const unsubscribe = audioPlayer.subscribe((newState) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, []);

  const playTrack = useCallback(async (track: Track) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await audioPlayer.playTrack(track);
  }, []);

  const togglePlayPause = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await audioPlayer.togglePlayPause();
  }, []);

  const seekTo = useCallback(async (position: number) => {
    // We don't necessarily want haptics for every tiny seek update, 
    // but maybe for the final seek completion.
    await audioPlayer.seekTo(position);
  }, []);

  const skipToNext = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await audioPlayer.skipToNext();
  }, []);

  const skipToPrevious = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await audioPlayer.skipToPrevious();
  }, []);

  const setQueue = useCallback((queue: Track[], startIndex: number = 0) => {
    audioPlayer.setQueue(queue, startIndex);
  }, []);

  const toggleShuffle = useCallback(async () => {
    Haptics.selectionAsync();
    await audioPlayer.toggleShuffle();
  }, []);

  const toggleRepeat = useCallback(async () => {
    Haptics.selectionAsync();
    await audioPlayer.toggleRepeat();
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
    toggleRepeat,
  };
}
