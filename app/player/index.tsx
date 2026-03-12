import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  MoreVertical,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import Animated, {
  Easing,
  Layout,
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { LyricsView } from "../../components/lyrics-view";
import { MarqueeText } from "../../components/marquee-text";
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import { Colors, FontSizes, Spacing } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { musicService } from "../../services/music-service";
import { storageService } from "../../services/storage-service";

const { width, height } = Dimensions.get("window");
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

  const rotation = useSharedValue(0);
  const isPlayingShared = useSharedValue(isPlaying);
  const lastTrackId = useRef(currentTrack?.id);
  const RPM = 33.33;
  const degreesPerSecond = (RPM * 360) / 60; // Realistic vinyl speed (33 1/3 RPM)

  useEffect(() => {
    isPlayingShared.value = isPlaying;
  }, [isPlaying]);

  // Use frame callback if available (Reanimated 3+), otherwise fall back to withTiming
  // This handles the "Property 'useFrameCallback' doesn't exist" error if the environment is restricted
  const frameCallback = typeof useFrameCallback === "function" ? useFrameCallback((frameInfo) => {
    if (!isPlayingShared.value) return;
    const { timeSincePreviousFrame } = frameInfo;
    if (timeSincePreviousFrame) {
      rotation.value += (degreesPerSecond * timeSincePreviousFrame) / 1000;
    }
  }) : null;

  useEffect(() => {
    if (frameCallback) {
      frameCallback.setActive(isPlaying);
    } else if (isPlaying) {
      // Fallback for environments where useFrameCallback is missing
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, {
          duration: (360 / degreesPerSecond) * 1000,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = rotation.value % 360;
    }
  }, [isPlaying, frameCallback]);

  useEffect(() => {
    const isNewTrack = lastTrackId.current !== currentTrack?.id;
    lastTrackId.current = currentTrack?.id;

    if (isNewTrack) {
      rotation.value = 0;
    }
  }, [currentTrack?.id]);

  const vinylStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // Update slider value when position changes, but only if not sliding
  useEffect(() => {
    if (!isSliding) {
      setSliderValue(position);
    }
  }, [position, isSliding]);

  const handleClose = () => {
    router.back();
  };

  const checkDownloadStatus = async () => {
    if (!currentTrack) return;
    const isLocal = await storageService.isDownloaded(currentTrack.id);
    if (isLocal) {
      setDownloadStatus("completed");
      setDownloadProgress(1);
      return;
    }
    const metadata = await storageService.getDownloadMetadata(currentTrack.id);
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
  };

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
  }, [currentTrack?.id]);

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
  }, [downloadStatus, downloadProgress]);

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
    const alreadyFavorite = isFavorite("track", displayTrack.id);
    if (alreadyFavorite) {
      await toggleFavorite("track", displayTrack);
      try {
        await musicService.removeDownload(displayTrack.id);
      } catch {}
    } else {
      await toggleFavorite("track", displayTrack);
    }
    setMenuVisible(false);
  };

  const handleDownloadAction = async () => {
    if (!displayTrack) return;
    setMenuVisible(false);
    if (downloadStatus === "completed") {
      await musicService.removeDownload(displayTrack.id);
      setDownloadStatus("none");
      setDownloadProgress(0);
    } else if (downloadStatus === "downloading") {
      await musicService.cancelDownload(displayTrack.id);
      setDownloadStatus("none");
      setDownloadProgress(0);
    } else {
      setDownloadStatus("downloading");
      try {
        await musicService.downloadTrack(displayTrack);
        // Explicitly check status after download finishes
        await checkDownloadStatus();
      } catch (e) {
        setDownloadStatus("error");
      }
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
            <Animated.View
              sharedTransitionTag={`artwork-${displayTrack.id}`}
              style={[
                styles.coverContainer,
                {
                  backgroundColor: "transparent",
                },
              ]}
            >
              <Animated.View style={[styles.vinyl, vinylStyle]}>
                {/* Vinyl Disc Background */}
                <View style={styles.vinylDisc} />

                {/* Texture rings */}
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
                      width: DISC_SIZE * 0.8,
                      height: DISC_SIZE * 0.8,
                      borderRadius: (DISC_SIZE * 0.8) / 2,
                    },
                  ]}
                />

                {/* Cover Image */}
                <Image
                  source={{ uri: coverUrl }}
                  style={styles.vinylCover}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />

                {/* Spindle hole */}
                <View
                  style={[
                    styles.spindleHole,
                    { backgroundColor: colors.background },
                  ]}
                />
              </Animated.View>
            </Animated.View>
          ) : (
            <View
              style={[styles.coverContainer, { height: DISC_SIZE + Spacing.xl }]}
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
                sharedTransitionTag={`title-${displayTrack.id}`}
                layout={Layout.springify()}
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
                <View style={[styles.qualityBadge, { borderColor: colors.icon }]}>
                  <ThemedText
                    style={[styles.qualityText, { color: colors.text }]}
                  >
                    {qualityLabel}
                  </ThemedText>
                </View>
              )}
              <ThemedText
                type="subtitle"
                style={[styles.artist, { color: colors.text }]}
                numberOfLines={1}
              >
                {displayTrack.artist.name}
              </ThemedText>
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
                <View key={`${track.id}-${index}`} style={styles.gridItemWrapper}>
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
    duration,
    queue,
    currentQueueIndex,
    vinylStyle,
    coverUrl,
    qualityLabel,
     colors,
     seekTo,
     setQueue,
   ]);

  const playerControls = React.useMemo(() => (
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
  ), [
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
  ]);

  if (!displayTrack) return null;

  return (
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
          <View style={styles.modalOverlay}>
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
                    !isFavorite("track", displayTrack.id) && { opacity: 0.5 },
                  ]}
                >
                  {isFavorite("track", displayTrack.id)
                    ? "Remove from library"
                    : "Add to library"}
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
    fontFamily: "Inter_600SemiBold",
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
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
  vinylCover: {
    width: DISC_SIZE * 0.45,
    height: DISC_SIZE * 0.45,
    borderRadius: (DISC_SIZE * 0.45) / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#222",
  },
  spindleHole: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
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
    fontFamily: "PlayfairDisplay_700Bold",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
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
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "PlayfairDisplay_600SemiBold",
  },
  queueGrid: {
    marginTop: Spacing.md,
  },
  gridItemWrapper: {
    width: "100%",
    marginBottom: Spacing.xs,
  },
});
