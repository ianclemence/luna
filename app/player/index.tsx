import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  Heart,
  Pause,
  Play,
  Repeat,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react-native";
import React from "react";
import {
  Dimensions,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MarqueeText } from "../../components/marquee-text";
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import { Colors, FontSizes, Spacing } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { musicService } from "../../services/music-service";

const { width, height } = Dimensions.get("window");

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
  } = usePlayer();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { isFavorite, toggleFavorite } = useFavorites();

  if (!currentTrack) return null;

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleClose = () => {
    router.back();
  };

  const handleShare = async () => {
    if (!currentTrack) return;
    const url = musicService.getShareUrl(currentTrack);
    try {
      await Share.share({
        message: `Check out ${currentTrack.title} by ${currentTrack.artist.name} on LUNA`,
        url: url,
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const getQualityLabel = (quality?: string) => {
    if (!quality) return null;
    if (quality.includes("HI_RES")) return "HI-RES";
    return null;
  };

  const qualityLabel = getQualityLabel(currentTrack.quality);
  const favorited = isFavorite("track", currentTrack.id);

  const upcomingTracks = queue.slice(
    currentQueueIndex + 1,
    currentQueueIndex + 6,
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
        <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
          Now Playing
        </ThemedText>
        <TouchableOpacity onPress={handleShare} style={styles.closeButton}>
          <Share2 size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainContent}>
          <View
            style={[
              styles.coverContainer,
              {
                backgroundColor: colors.background,
              },
            ]}
          >
            <Image
              source={{
                uri:
                  currentTrack.album.coverUrl ||
                  musicService.getCoverUrl(currentTrack, "640"),
              }}
              style={styles.cover}
              contentFit="cover"
            />
          </View>

          <View style={styles.info}>
            <View style={styles.titleRow}>
              <MarqueeText type="title" style={styles.title}>
                {currentTrack.title}
              </MarqueeText>
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
              <TouchableOpacity
                onPress={() => toggleFavorite("track", currentTrack)}
                style={styles.actionButton}
              >
                <Heart
                  size={24}
                  color={favorited ? "#FF4B4B" : colors.icon}
                  fill={favorited ? "#FF4B4B" : "transparent"}
                />
              </TouchableOpacity>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration}
              value={position}
              onSlidingComplete={seekTo}
              minimumTrackTintColor={colors.text}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.text}
            />
            <View style={styles.timeLabels}>
              <ThemedText style={[styles.timeText, { color: colors.icon }]}>
                {formatTime(position)}
              </ThemedText>
              <ThemedText style={[styles.timeText, { color: colors.icon }]}>
                {formatTime(duration)}
              </ThemedText>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity style={styles.secondaryButton}>
              <Shuffle size={20} color={colors.icon} />
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
            <TouchableOpacity style={styles.secondaryButton}>
              <Repeat size={20} color={colors.icon} />
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
  closeButton: {
    padding: Spacing.sm,
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
    width: width - (Spacing.xl * 2 + Spacing.md * 2),
    height: width - (Spacing.xl * 2 + Spacing.md * 2),
    borderRadius: 0,
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
  primaryButton: {
    padding: Spacing.md,
  },
  playButton: {
    padding: Spacing.md,
  },
  secondaryButton: {
    padding: Spacing.md,
    opacity: 0.6,
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
