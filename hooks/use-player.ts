import { useState, useEffect } from 'react';
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
  });

  useEffect(() => {
    const unsubscribe = audioPlayer.subscribe((newState) => {
      setState({ ...newState });
    });
    return unsubscribe;
  }, []);

  const playTrack = async (track: Track) => {
    await audioPlayer.playTrack(track);
  };

  const togglePlayPause = async () => {
    await audioPlayer.togglePlayPause();
  };

  const seekTo = async (position: number) => {
    await audioPlayer.seekTo(position);
  };

  const skipToNext = async () => {
    await audioPlayer.skipToNext();
  };

  const skipToPrevious = async () => {
    await audioPlayer.skipToPrevious();
  };

  const setQueue = (queue: Track[], startIndex: number = 0) => {
    audioPlayer.setQueue(queue, startIndex);
  };

  const toggleShuffle = async () => {
    await audioPlayer.toggleShuffle();
  };

  const toggleRepeat = async () => {
    await audioPlayer.toggleRepeat();
  };

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
