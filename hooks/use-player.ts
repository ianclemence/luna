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
    audioPlayer.skipToNext();
  }, []);

  const skipToPrevious = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    audioPlayer.skipToPrevious();
  }, []);

  const setQueue = useCallback((queue: Track[], startIndex: number = 0) => {
    audioPlayer.setQueue(queue, startIndex);
  }, []);

  const toggleShuffle = useCallback(() => {
    Haptics.selectionAsync();
    audioPlayer.toggleShuffle();
  }, []);

  const toggleRepeat = useCallback(() => {
    Haptics.selectionAsync();
    audioPlayer.toggleRepeat();
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
