import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  Mic,
  MoreVertical,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
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
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
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
  const [downloadStatus, setDownloadStatus] = useState<
    "none" | "downloading" | "completed" | "pending" | "error"
  >("none");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const rotation = useSharedValue(0);
  const vinylStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  // Update slider value when position changes, but only if not sliding
  useEffect(() => {
    if (!isSliding) {
      setSliderValue(position);
    }
  }, [position, isSliding]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleClose = () => {
    router.back();
  };

  const checkDownloadStatus = async () => {
    if (!currentTrack) return;
    const metadata = await storageService.getDownloadMetadata(currentTrack.id);
    if (metadata) {
      setDownloadStatus(metadata.status);
      setDownloadProgress(metadata.progress || 0);
    } else {
      setDownloadStatus("none");
      setDownloadProgress(0);
    }
  };

  useEffect(() => {
    checkDownloadStatus();
  }, [currentTrack?.id]);

  useEffect(() => {
    if (isPlaying && position > 0) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 12000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [isPlaying, position]);

  if (!currentTrack) return null;

  const handleLibraryAction = async () => {
    if (!currentTrack) return;
    await toggleFavorite("track", currentTrack);
    setMenuVisible(false);
  };

  const handleDownloadAction = async () => {
    if (!currentTrack) return;
    setMenuVisible(false);
    if (downloadStatus === "completed") {
      await musicService.removeDownload(currentTrack.id);
      setDownloadStatus("none");
      setDownloadProgress(0);
    } else if (downloadStatus === "downloading") {
      await musicService.cancelDownload(currentTrack.id);
      setDownloadStatus("pending");
    } else if (downloadStatus === "pending") {
      try {
        setDownloadStatus("downloading");
        await musicService.downloadTrack(currentTrack);
        setDownloadStatus("completed");
        setDownloadProgress(1);
      } catch (e) {
        setDownloadStatus("error");
      }
    } else {
      try {
        setDownloadStatus("downloading");
        await musicService.downloadTrack(currentTrack);
        setDownloadStatus("completed");
        setDownloadProgress(1);
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

  const qualityLabel = getQualityLabel(currentTrack.quality);

  const upcomingTracks = queue.slice(
    currentQueueIndex + 1,
    currentQueueIndex + 6,
  );

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
                { backgroundColor: colors.background },
              ]}
            >
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleLibraryAction}
              >
                <ThemedText
                  style={[
                    styles.menuText,
                    isFavorite("track", currentTrack.id) && {
                      color: colors.text,
                    },
                    !isFavorite("track", currentTrack.id) && { opacity: 0.5 },
                  ]}
                >
                  {isFavorite("track", currentTrack.id)
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
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainContent}>
          <Animated.View
            sharedTransitionTag={`artwork-${currentTrack.id}`}
            layout={Layout.springify()}
            style={[
              styles.coverContainer,
              {
                backgroundColor: colors.background,
              },
            ]}
          >
            <Animated.View style={[styles.vinyl, vinylStyle]}>
              <View style={styles.vinylDisc} />
              <Image
                source={{
                  uri:
                    currentTrack.album.coverUrl ||
                    musicService.getCoverUrl(currentTrack, "640"),
                }}
                style={styles.vinylCover}
                contentFit="cover"
              />
            </Animated.View>
          </Animated.View>

          <View style={styles.info}>
            <View style={styles.titleRow}>
              <Animated.View
                sharedTransitionTag={`title-${currentTrack.id}`}
                layout={Layout.springify()}
                style={{ maxWidth: "80%" }}
              >
                <MarqueeText type="title" style={styles.title}>
                  {currentTrack.title}
                </MarqueeText>
              </Animated.View>
              {currentTrack.explicit && (
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
            <View style={styles.artistRow}>
              {qualityLabel && (
                <View
                  style={[styles.qualityBadge, { borderColor: colors.icon }]}
                >
                  <ThemedText
                    style={[styles.qualityText, { color: colors.icon }]}
                  >
                    {qualityLabel}
                  </ThemedText>
                </View>
              )}
              <ThemedText
                type="subtitle"
                style={[styles.artist, { color: colors.icon }]}
                numberOfLines={1}
              >
                {currentTrack.artist.name}
              </ThemedText>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={() => {}} style={styles.actionButton}>
                <Mic size={24} color={colors.icon} />
              </TouchableOpacity>
            </View>
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
              <ThemedText style={[styles.timeText, { color: colors.icon }]}>
                {formatTime(isSliding ? sliderValue : position)}
              </ThemedText>
              <ThemedText style={[styles.timeText, { color: colors.icon }]}>
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
              {shuffleActive && <View style={styles.activeDot} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={skipToPrevious}
              style={styles.primaryButton}
            >
              <SkipBack size={32} color={colors.text} fill={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={togglePlayPause}
              style={styles.playButton}
            >
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

        {upcomingTracks.length > 0 && (
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
      </ScrollView>
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
    borderWidth: 10,
    borderColor: "rgba(255,255,255,0.06)",
  },
  vinylCover: {
    width: DISC_SIZE * 0.45,
    height: DISC_SIZE * 0.45,
    borderRadius: (DISC_SIZE * 0.45) / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
  },
  info: {
    alignItems: "center",
    marginBottom: Spacing.xl,
    width: "100%",
    paddingHorizontal: Spacing.xl,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
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
    backgroundColor: Colors.light.text, // Will use theme color if needed
    position: "absolute",
    bottom: 8,
  },
  repeatOneText: {
    fontSize: 8,
    position: "absolute",
    top: -12,
    fontWeight: "bold",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: Spacing.xs,
    marginBottom: -Spacing.xs,
  },
  actionButton: {
    padding: Spacing.sm,
    opacity: 0.7,
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
