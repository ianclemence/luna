import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  Check,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Layout,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { LyricsView } from "../../components/lyrics-view";
import { MarqueeText } from "../../components/marquee-text";
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import {
  Colors,
  Fonts,
  FontSizes,
  Radii,
  Spacing,
  Strokes,
} from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { musicService, Playlist, Track } from "../../services/music-service";
import { storageService } from "../../services/storage-service";
import { showToast } from "../../services/toast-store";

const { width } = Dimensions.get("window");
const DISC_SIZE = width - (Spacing.xl * 2 + Spacing.md * 2);

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default function Player() {
  const router = useRouter();
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    position,
    duration,
    seekTo,
    queue,
    currentQueueIndex,
    setQueue,
    shuffleActive,
    repeatMode,
    toggleShuffle,
    toggleRepeat,
  } = usePlayer();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { isFavorite, toggleFavorite } = useFavorites();

  // Local state for the slider to prevent jumping/sticking during user interaction
  const [sliderValue, setSliderValue] = useState(position);
  const [isSliding, setIsSliding] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<
    "none" | "downloading" | "completed" | "error" | "pending"
  >("none");
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Playlist Modal State
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState<
    (Playlist & { tracks: Track[] })[]
  >([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const rotation = useSharedValue(0);
  const velocity = useSharedValue(0); // Degrees per second
  const isPlayingShared = useSharedValue(isPlaying);
  const coverOpacity = useSharedValue(1);
  const lastTrackId = useRef(currentTrack?.id);
  const RPM = 33.33;
  const targetVelocity = (RPM * 360) / 60; // Degrees per second
  const acceleration = 120; // Deg/s^2
  const friction = 60; // Deg/s^2

  useEffect(() => {
    isPlayingShared.value = isPlaying;
  }, [isPlaying, isPlayingShared]);

  // Use frame callback for smooth physics simulation
  useFrameCallback((frameInfo) => {
    "use worklet";
    const { timeSincePreviousFrame } = frameInfo;
    if (!timeSincePreviousFrame) return;

    const dt = timeSincePreviousFrame / 1000;

    if (isPlayingShared.value) {
      // Spin up
      if (velocity.value < targetVelocity) {
        velocity.value = Math.min(
          targetVelocity,
          velocity.value + acceleration * dt,
        );
      }
    } else {
      // Spin down (friction)
      if (velocity.value > 0) {
        velocity.value = Math.max(0, velocity.value - friction * dt);
      }
    }

    // Apply rotation
    if (velocity.value > 0) {
      rotation.value += velocity.value * dt;
    }
  }, true); // Keep active for deceleration

  useEffect(() => {
    const isNewTrack = lastTrackId.current !== currentTrack?.id;
    lastTrackId.current = currentTrack?.id;

    if (isNewTrack) {
      rotation.value = 0;
      // Trigger cross-fade for new artwork
      coverOpacity.value = 0;
      coverOpacity.value = withTiming(1, { duration: 400 });
    }
  }, [currentTrack?.id, rotation, coverOpacity]);

  const vinylStyle = useAnimatedStyle(() => {
    "use worklet";
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  const coverFadeStyle = useAnimatedStyle(() => {
    "use worklet";
    return {
      opacity: coverOpacity.value,
    };
  });

  const gesture = Gesture.Pan().onEnd((e) => {
    if (Math.abs(e.velocityX) > Math.abs(e.velocityY)) {
      if (e.translationX < -50) {
        runOnJS(skipToNext)();
      } else if (e.translationX > 50) {
        runOnJS(skipToPrevious)();
      }
    } else if (e.translationY > 100) {
      runOnJS(handleClose)();
    }
  });

  // Update slider value when position changes, but only if not sliding
  useEffect(() => {
    if (!isSliding) {
      setSliderValue(position);
    }
  }, [position, isSliding, setSliderValue]);

  const handleClose = () => {
    router.back();
  };

  const checkDownloadStatus = useCallback(async () => {
    if (!currentTrack) return;
    const isLocal = await storageService.isDownloaded(currentTrack.id);
    if (isLocal) {
      setDownloadStatus("completed");
      setDownloadProgress(1);
      return;
    }
    const metadata = await storageService.getDownloadMetadata(currentTrack.id);
    if (metadata) {
      if (metadata.status === "downloading" && metadata.progress >= 1) {
        setDownloadStatus("completed");
        setDownloadProgress(1);
      } else {
        setDownloadStatus(metadata.status as any);
        setDownloadProgress(metadata.progress || 0);
      }
    } else {
      setDownloadStatus("none");
      setDownloadProgress(0);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (currentTrack?.id) {
      checkDownloadStatus();
    }

    const unsubscribe = storageService.subscribeToDownloads(
      async (downloads) => {
        if (currentTrack) {
          // First check if it's already downloaded to be sure
          const isLocal = await storageService.isDownloaded(currentTrack.id);
          if (isLocal) {
            setDownloadStatus("completed");
            setDownloadProgress(1);
            return;
          }

          const metadata = downloads.find((d) => d.id === currentTrack.id);
          if (metadata) {
            // Handle the transition from downloading to completed
            if (metadata.status === "downloading" && metadata.progress >= 1) {
              // Download is complete but status hasn't updated yet
              setDownloadStatus("completed");
              setDownloadProgress(1);
            } else {
              setDownloadStatus(metadata.status as any);
              setDownloadProgress(metadata.progress || 0);
            }
          } else {
            setDownloadStatus("none");
            setDownloadProgress(0);
          }
        }
      },
    );

    return unsubscribe;
  }, [currentTrack, checkDownloadStatus]);

  useEffect(() => {
    let interval: any;
    if (downloadStatus === "downloading" && downloadProgress < 1) {
      interval = setInterval(() => {
        checkDownloadStatus();
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [downloadStatus, downloadProgress, checkDownloadStatus]);

  // Use a ref to store the last known track, providing stability during track transitions
  // and preventing the component from unmounting (which would reset the rotation)
  const lastTrackRef = useRef(currentTrack);
  useEffect(() => {
    if (currentTrack) {
      lastTrackRef.current = currentTrack;
    }
  }, [currentTrack]);

  const displayTrack = currentTrack || lastTrackRef.current;

  const coverUrl = React.useMemo(() => {
    if (!displayTrack) return "";
    return (
      displayTrack.album?.coverUrl ||
      musicService.getCoverUrl(displayTrack, "640") ||
      ""
    );
  }, [displayTrack]);

  const handleLibraryAction = async () => {
    if (!displayTrack) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isNowFavorite = await toggleFavorite("track", displayTrack);
    showToast(
      isNowFavorite ? "Added to library" : "Removed from library",
      isNowFavorite ? "success" : "info",
    );
    setMenuVisible(false);
  };

  const handleDownloadAction = async () => {
    if (!displayTrack) return;
    setMenuVisible(false);
    if (downloadStatus === "completed") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await musicService.removeDownload(displayTrack.id);
      setDownloadStatus("none");
      setDownloadProgress(0);
      showToast("Download removed", "info");
    } else if (downloadStatus === "downloading") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await musicService.cancelDownload(displayTrack.id);
      setDownloadStatus("none");
      setDownloadProgress(0);
      showToast("Download cancelled", "info");
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setDownloadStatus("downloading");
      showToast("Download started", "info");
      try {
        await musicService.downloadTrack(displayTrack);
        // Explicitly check status after download finishes
        await checkDownloadStatus();
        showToast("Download complete", "success");
      } catch {
        setDownloadStatus("error");
        showToast("Download failed", "error");
      }
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;

    const newPlaylist: Playlist & { tracks: Track[] } = {
      id: `local:${Date.now()}`,
      title: newPlaylistName.trim(),
      description: "",
      provider: "tidal",
      trackCount: 0,
      tracks: [],
      imageUrl: undefined,
    };

    const success = await storageService.saveUserPlaylist(newPlaylist);
    if (success) {
      setUserPlaylists((prev) => [...prev, newPlaylist]);
      setSelectedPlaylistIds((prev) => [...prev, newPlaylist.id]);
      setIsCreatingPlaylist(false);
      setNewPlaylistName("");
      showToast("Playlist created", "success");
    } else {
      showToast("Failed to create playlist", "error");
    }
  };

  const handleAddToPlaylist = async () => {
    if (!displayTrack) return;
    setMenuVisible(false);

    const playlists = await storageService.getUserPlaylists();
    setUserPlaylists(playlists);

    const containing = playlists
      .filter((p) => p.tracks?.some((t) => t.id === displayTrack.id))
      .map((p) => p.id);
    setSelectedPlaylistIds(containing);

    setPlaylistModalVisible(true);
  };

  const togglePlaylistSelection = (playlistId: string) => {
    setSelectedPlaylistIds((prev) => {
      if (prev.includes(playlistId)) {
        return prev.filter((id) => id !== playlistId);
      } else {
        return [...prev, playlistId];
      }
    });
  };

  const savePlaylistChanges = async () => {
    if (!displayTrack) return;

    try {
      // Process all playlists to ensure consistency
      for (const playlist of userPlaylists) {
        const isSelected = selectedPlaylistIds.includes(playlist.id);
        const isInPlaylist = playlist.tracks?.some(
          (t) => t.id === displayTrack.id,
        );

        if (isSelected && !isInPlaylist) {
          // Add to playlist
          const updatedTracks = [...(playlist.tracks || []), displayTrack];
          await storageService.saveUserPlaylist({
            ...playlist,
            tracks: updatedTracks,
            trackCount: updatedTracks.length,
            imageUrl: updatedTracks[0]?.album?.coverUrl || playlist.imageUrl,
          });
        } else if (!isSelected && isInPlaylist) {
          // Remove from playlist
          const updatedTracks =
            playlist.tracks?.filter((t) => t.id !== displayTrack.id) || [];
          await storageService.saveUserPlaylist({
            ...playlist,
            tracks: updatedTracks,
            trackCount: updatedTracks.length,
            imageUrl:
              updatedTracks.length > 0
                ? updatedTracks[0]?.album?.coverUrl
                : undefined,
          });
        }
      }

      setPlaylistModalVisible(false);
      showToast("Playlists updated", "success");
    } catch (error) {
      console.error("Failed to update playlists:", error);
      showToast("Failed to update playlists", "error");
    }
  };

  const toggleMenu = () => {
    if (!menuVisible) {
      checkDownloadStatus();
    }
    setMenuVisible(!menuVisible);
  };

  const getQualityLabel = (quality?: string) => {
    if (!quality) return null;
    if (quality.includes("HI_RES")) return "HI-RES";
    return null;
  };

  const qualityLabel = getQualityLabel(displayTrack?.quality);

  const upcomingTracks = queue.slice(
    currentQueueIndex + 1,
    currentQueueIndex + 6,
  );

  const playerContent = React.useMemo(() => {
    if (!displayTrack) return null;
    return (
      <>
        <View style={styles.mainContent}>
          {!showLyrics ? (
            <View style={styles.coverContainer as any}>
              <Animated.View
                {...({
                  sharedTransitionTag: `artwork-${displayTrack.id}`,
                } as any)}
                style={[styles.vinyl, vinylStyle]}
              >
                {/* Vinyl Disc Background */}
                <View
                  style={[
                    styles.vinylDisc,
                    {
                      backgroundColor: colors.vinyl,
                      borderColor: colors.vinylRing,
                    },
                  ]}
                />

                {/* Texture rings - vinyl grooves */}
                <View
                  style={[
                    styles.ring,
                    {
                      width: DISC_SIZE - 10,
                      height: DISC_SIZE - 10,
                      borderRadius: (DISC_SIZE - 10) / 2,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.ring,
                    {
                      width: DISC_SIZE * 0.85,
                      height: DISC_SIZE * 0.85,
                      borderRadius: (DISC_SIZE * 0.85) / 2,
                    },
                  ]}
                />

                {/* Additional groove rings for realistic vinyl texture */}
                {[0.7, 0.6, 0.5, 0.4, 0.35, 0.3, 0.25].map((ratio, index) => (
                  <View
                    key={`groove-${index}`}
                    style={[
                      styles.grooveRing,
                      {
                        width: DISC_SIZE * ratio,
                        height: DISC_SIZE * ratio,
                        borderRadius: (DISC_SIZE * ratio) / 2,
                        opacity: 0.15 + index * 0.02,
                      },
                    ]}
                  />
                ))}

                {/* Cover Image */}
                <Animated.View
                  style={[
                    styles.vinylCover,
                    { borderColor: colors.border },
                    coverFadeStyle,
                  ]}
                >
                  <Image
                    source={{ uri: coverUrl }}
                    style={styles.vinylCoverImage}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                </Animated.View>

                {/* Spindle hole with inner dot */}
                <View
                  style={[
                    styles.spindleHole,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.spindleInner,
                      { backgroundColor: colors.vinylRing },
                    ]}
                  />
                </View>

                {/* Quality badge as vinyl label */}
                {qualityLabel && (
                  <View
                    style={[
                      styles.vinylLabel,
                      { backgroundColor: colors.accent },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.vinylLabelText,
                        { color: colors.background },
                      ]}
                    >
                      {qualityLabel}
                    </ThemedText>
                  </View>
                )}
              </Animated.View>
            </View>
          ) : (
            <View
              style={[
                styles.coverContainer,
                { height: DISC_SIZE + Spacing.xl },
              ]}
            >
              <LyricsView
                track={displayTrack}
                position={position}
                onSeek={(time) => seekTo(time)}
              />
            </View>
          )}

          <View style={styles.info}>
            <View style={styles.titleRow}>
              <Animated.View
                {...({
                  sharedTransitionTag: `title-${displayTrack.id}`,
                  layout: Layout.springify(),
                } as any)}
                style={{ maxWidth: "80%" }}
              >
                <MarqueeText type="title" style={styles.title}>
                  {displayTrack.title}
                </MarqueeText>
              </Animated.View>
              <View style={styles.actionButtons}>
                {displayTrack.explicit && (
                  <View
                    style={[
                      styles.explicitBadge,
                      { backgroundColor: colors.icon },
                    ]}
                  >
                    <ThemedText style={styles.explicitText}>E</ThemedText>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.artistRow}>
              {qualityLabel && (
                <View
                  style={[styles.qualityBadge, { borderColor: colors.icon }]}
                >
                  <ThemedText
                    style={[styles.qualityText, { color: colors.text }]}
                  >
                    {qualityLabel}
                  </ThemedText>
                </View>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (displayTrack.artist?.id) {
                    router.push(`/artist/${displayTrack.artist.id}`);
                  }
                }}
              >
                <ThemedText
                  type="subtitle"
                  style={[styles.artist, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {displayTrack.artist.name}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {upcomingTracks.length > 0 && !showLyrics && (
          <View style={styles.queueSection}>
            <View style={styles.queueHeader}>
              <ThemedText type="subtitle" style={styles.queueTitle}>
                Up Next
              </ThemedText>
            </View>
            <View style={styles.queueGrid}>
              {upcomingTracks.map((track, index) => (
                <View
                  key={`${track.id}-${index}`}
                  style={styles.gridItemWrapper}
                >
                  <TrackItem
                    track={track}
                    onPress={(t) =>
                      setQueue(queue, currentQueueIndex + 1 + index)
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        )}
      </>
    );
  }, [
    displayTrack,
    showLyrics,
    position,
    queue,
    currentQueueIndex,
    vinylStyle,
    coverFadeStyle,
    coverUrl,
    qualityLabel,
    colors,
    seekTo,
    setQueue,
    upcomingTracks,
    router,
  ]);

  const playerControls = React.useMemo(
    () => (
      <View style={{ paddingHorizontal: Spacing.xl }}>
        <View style={styles.progressHeader}>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.progressContainer}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration}
            value={sliderValue}
            onValueChange={(value) => {
              setIsSliding(true);
              setSliderValue(value);
            }}
            onSlidingComplete={async (value) => {
              Haptics.selectionAsync();
              await seekTo(value);
              setIsSliding(false);
            }}
            minimumTrackTintColor={colors.text}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.text}
          />
          <View style={styles.timeLabels}>
            <ThemedText style={[styles.timeText, { color: colors.text }]}>
              {formatTime(isSliding ? sliderValue : position)}
            </ThemedText>
            <ThemedText style={[styles.timeText, { color: colors.text }]}>
              {formatTime(duration)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            onPress={toggleShuffle}
            style={[styles.secondaryButton, shuffleActive && { opacity: 1 }]}
          >
            <Shuffle
              size={20}
              color={shuffleActive ? colors.text : colors.icon}
            />
            {shuffleActive && (
              <View
                style={[styles.activeDot, { backgroundColor: colors.text }]}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={skipToPrevious}
            style={styles.primaryButton}
          >
            <SkipBack size={32} color={colors.text} fill={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
            {isPlaying ? (
              <Pause size={48} color={colors.text} fill={colors.text} />
            ) : (
              <Play size={48} color={colors.text} fill={colors.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={skipToNext} style={styles.primaryButton}>
            <SkipForward size={32} color={colors.text} fill={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleRepeat}
            style={[
              styles.secondaryButton,
              repeatMode !== "off" && { opacity: 1 },
            ]}
          >
            <Repeat
              size={20}
              color={repeatMode !== "off" ? colors.text : colors.icon}
            />
            {repeatMode !== "off" && (
              <View style={styles.activeDot}>
                {repeatMode === "one" && (
                  <ThemedText style={styles.repeatOneText}>1</ThemedText>
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    ),
    [
      duration,
      sliderValue,
      isSliding,
      position,
      colors,
      seekTo,
      shuffleActive,
      toggleShuffle,
      skipToPrevious,
      togglePlayPause,
      isPlaying,
      skipToNext,
      toggleRepeat,
      repeatMode,
    ],
  );

  if (!displayTrack) return null;

  return (
    <GestureDetector gesture={gesture}>
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.iconButton}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
          <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
            Now Playing
          </ThemedText>
          <TouchableOpacity onPress={toggleMenu} style={styles.iconButton}>
            <MoreVertical size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={toggleMenu}
        >
          <TouchableWithoutFeedback onPress={toggleMenu}>
            <View style={styles.menuOverlay}>
              <View
                style={[
                  styles.menuContainer,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleLibraryAction}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      isFavorite("track", displayTrack.id) && {
                        color: colors.text,
                      },
                      !isFavorite("track", displayTrack.id) && { opacity: 0.8 },
                    ]}
                  >
                    {isFavorite("track", displayTrack.id)
                      ? "Remove from library"
                      : "Add to library"}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleAddToPlaylist}
                >
                  <ThemedText style={[styles.menuText, { opacity: 0.8 }]}>
                    Add to Playlist
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleDownloadAction}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      downloadStatus === "completed" && { color: colors.text },
                      downloadStatus === "none" && { opacity: 0.5 },
                      downloadStatus === "downloading" && { color: "#FF4B4B" },
                    ]}
                  >
                    {downloadStatus === "completed"
                      ? "Remove Download"
                      : downloadStatus === "downloading"
                        ? `Cancel Download (${Math.round(downloadProgress * 100)}%)`
                        : downloadStatus === "pending"
                          ? "Resume Download"
                          : "Download"}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowLyrics(!showLyrics);
                    setMenuVisible(false);
                  }}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      showLyrics && { color: colors.text },
                      !showLyrics && { opacity: 0.5 },
                    ]}
                  >
                    {showLyrics ? "Hide Lyrics" : "Show Lyrics"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Playlist Selection Modal */}
        <Modal
          visible={playlistModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPlaylistModalVisible(false)}
        >
          <View style={styles.dialogOverlay}>
            <View
              style={[
                styles.modalContainer,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  maxHeight: "80%",
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
                  ADD TO PLAYLIST
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setPlaylistModalVisible(false)}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {isCreatingPlaylist ? (
                <View style={{ gap: Spacing.md, marginBottom: Spacing.md }}>
                  <View
                    style={[
                      styles.modalInputContainer,
                      { borderColor: colors.border },
                    ]}
                  >
                    <TextInput
                      style={[styles.modalInput, { color: colors.text }]}
                      placeholder="Playlist Name"
                      placeholderTextColor={colors.muted}
                      value={newPlaylistName}
                      onChangeText={setNewPlaylistName}
                      autoFocus
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-end",
                      gap: Spacing.lg,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setIsCreatingPlaylist(false);
                        setNewPlaylistName("");
                      }}
                    >
                      <ThemedText
                        style={[
                          styles.menuText,
                          { fontSize: 11, opacity: 0.6 },
                        ]}
                      >
                        CANCEL
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCreatePlaylist}>
                      <ThemedText
                        style={[
                          styles.menuText,
                          { fontSize: 11, color: colors.text },
                        ]}
                      >
                        CREATE
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[
                      styles.menuItem,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: Spacing.sm,
                        paddingVertical: Spacing.sm,
                        marginBottom: Spacing.sm,
                      },
                    ]}
                    onPress={() => setIsCreatingPlaylist(true)}
                  >
                    <View
                      style={[
                        styles.createIconContainer,
                        { borderColor: colors.text },
                      ]}
                    >
                      <Plus size={12} color={colors.text} />
                    </View>
                    <ThemedText
                      style={[
                        styles.menuText,
                        { fontSize: 12, textTransform: "none" },
                      ]}
                    >
                      New Playlist
                    </ThemedText>
                  </TouchableOpacity>

                  <ScrollView
                    style={{ marginVertical: Spacing.sm }}
                    showsVerticalScrollIndicator={false}
                  >
                    {userPlaylists.length === 0 ? (
                      <ThemedText
                        style={{
                          opacity: 0.5,
                          textAlign: "center",
                          padding: Spacing.md,
                          fontSize: 12,
                        }}
                      >
                        No playlists created yet
                      </ThemedText>
                    ) : (
                      userPlaylists.map((playlist) => {
                        const isSelected = selectedPlaylistIds.includes(
                          playlist.id,
                        );
                        return (
                          <TouchableOpacity
                            key={playlist.id}
                            style={[
                              styles.menuItem,
                              {
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingVertical: Spacing.sm,
                                paddingHorizontal: Spacing.xs,
                              },
                            ]}
                            onPress={() => togglePlaylistSelection(playlist.id)}
                          >
                            <ThemedText
                              style={[
                                styles.menuText,
                                {
                                  flex: 1,
                                  textTransform: "none",
                                  fontSize: 12,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {playlist.title}
                            </ThemedText>
                            {isSelected && (
                              <Check size={16} color={colors.text} />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>

                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      { backgroundColor: colors.text, marginTop: Spacing.md },
                      selectedPlaylistIds.length === 0 && { opacity: 0.5 },
                    ]}
                    onPress={savePlaylistChanges}
                    disabled={selectedPlaylistIds.length === 0}
                  >
                    <ThemedText
                      style={[
                        styles.saveButtonText,
                        { color: colors.background },
                      ]}
                    >
                      SAVE CHANGES
                    </ThemedText>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>

        {showLyrics ? (
          <View style={{ flex: 1 }}>{playerContent}</View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {playerContent}
          </ScrollView>
        )}
        {playerControls}
      </SafeAreaView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSizes.caption,
    textTransform: "uppercase",
    letterSpacing: 3,
    fontFamily: Fonts.semiBold,
    opacity: 0.6,
  },
  iconButton: {
    // padding: Spacing.sm,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  mainContent: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
  },
  coverContainer: {
    borderRadius: 0,
    padding: Spacing.md,
    backgroundColor: "transparent",
    marginBottom: Spacing.xl,
  },
  cover: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: 0,
  },
  vinyl: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  vinylDisc: {
    position: "absolute",
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    backgroundColor: "#1A1A1A",
    borderWidth: Strokes.regular,
    borderColor: "#2D2D2D",
  },
  grooveContainer: {
    position: "absolute",
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
  grooveRing: {
    position: "absolute",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.04)",
  },
  vinylCover: {
    width: DISC_SIZE * 0.45,
    height: DISC_SIZE * 0.45,
    borderRadius: (DISC_SIZE * 0.45) / 2,
    overflow: "hidden" as const,
    borderWidth: Strokes.thin,
    borderColor: "#1A1A1A",
  },
  vinylCoverImage: {
    width: "100%" as const,
    height: "100%" as const,
    borderRadius: (DISC_SIZE * 0.45) / 2,
    backgroundColor: "#222",
  },
  spindleHole: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FDFCF0",
    borderWidth: Strokes.thin,
    borderColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  spindleInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2D2D2D",
  },
  vinylLabel: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#8B4513",
    alignItems: "center",
    justifyContent: "center",
    top: DISC_SIZE * 0.22,
  },
  vinylLabelText: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.bold,
    color: "#FDFCF0",
    letterSpacing: 1,
  },
  info: {
    alignItems: "center",
    marginBottom: Spacing.xl,
    width: "100%",
    paddingHorizontal: Spacing.xl,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  actionButton: {
    padding: Spacing.sm,
  },
  title: {
    marginBottom: Spacing.sm,
    fontSize: FontSizes.h2,
    fontFamily: Fonts.displayBold,
  },
  explicitBadge: {
    width: 16,
    height: 16,
    borderRadius: 0,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    opacity: 0.5,
    marginBottom: Spacing.sm,
    display: "flex",
  },
  explicitText: {
    fontSize: 8,
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 16,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  qualityBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginRight: 8,
    opacity: 0.5,
  },
  qualityText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  artist: {
    textAlign: "center",
    opacity: 0.7,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: Spacing.xs,
    marginBottom: -Spacing.xs,
    height: 44, // Fixed height to prevent vertical jitter
    zIndex: 1,
  },
  lyricsToggle: {
    width: 44, // Fixed size to prevent horizontal layout shifts
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  progressContainer: {
    width: "100%",
    marginBottom: Spacing.xl,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  timeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xs,
  },
  timeText: {
    fontSize: FontSizes.small,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: Spacing.xl,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  menuContainer: {
    position: "absolute",
    top: 60,
    right: Spacing.xl,
    width: 180,
    borderWidth: 1,
    padding: Spacing.xs,
  },
  menuItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  menuText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  primaryButton: {
    padding: Spacing.md,
  },
  playButton: {
    padding: Spacing.md,
  },
  secondaryButton: {
    padding: Spacing.md,
    opacity: 0.6,
    alignItems: "center",
    justifyContent: "center",
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: "absolute",
    bottom: 8,
  },
  repeatOneText: {
    fontSize: 8,
    position: "absolute",
    top: -12,
    fontWeight: "bold",
  },
  queueSection: {
    width: "100%",
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xxxl,
  },
  queueHeader: {
    marginBottom: Spacing.lg,
    paddingHorizontal: 0,
  },
  queueTitle: {
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: FontSizes.phrase,
    fontFamily: Fonts.displaySemiBold,
  },
  queueGrid: {
    marginTop: Spacing.md,
  },
  modalContainer: {
    width: "100%",
    maxHeight: "80%",
    borderWidth: Strokes.thin,
    padding: Spacing.xl,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    borderRadius: Radii.modal,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontSize: FontSizes.phrase,
    fontFamily: Fonts.displayBold,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  modalInputContainer: {
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  modalInput: {
    padding: Spacing.md,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    flex: 1,
  },
  createIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    borderStyle: "dashed",
    opacity: 0.6,
  },
  saveButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  saveButtonText: {
    fontFamily: Fonts.bold,
    letterSpacing: 2,
  },
  gridItemWrapper: {
    paddingVertical: Spacing.xs,
  },
});
