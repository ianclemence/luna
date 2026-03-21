import { Image } from "expo-image";
import { CheckCircle2, CloudDownload, Heart, Trash2, Volume2 } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import {
  Colors,
  FontSizes,
  Fonts,
  Palette,
  Spacing,
  Strokes,
} from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useFavorites } from "../hooks/use-favorites";
import { usePlayer } from "../hooks/use-player";
import { Track, musicService } from "../services/music-service";
import { storageService } from "../services/storage-service";
import { ThemedText } from "./themed-text";

interface TrackItemProps {
  track: Track;
  onPress: (track: Track) => void;
  showIndex?: boolean;
  index?: number;
  hideCover?: boolean;
  onRemove?: (track: Track) => void;
}

export const TrackItem = ({
  track,
  onPress,
  showIndex,
  index,
  hideCover,
  onRemove,
}: TrackItemProps) => {
  const { currentTrack } = usePlayer();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { isFavorite, toggleFavorite } = useFavorites();
  const [downloadStatus, setDownloadStatus] = useState<
    "none" | "pending" | "downloading" | "completed" | "error" | "cached"
  >("none");

  const checkDownloadStatus = useCallback(async () => {
    const metadata = await storageService.getDownloadMetadata(track.id);
    setDownloadStatus(metadata ? metadata.status : "none");
  }, [track.id]);

  useEffect(() => {
    checkDownloadStatus();
  }, [checkDownloadStatus]);

  useEffect(() => {
    const unsubscribe = storageService.subscribeToDownloads((downloads) => {
      const item = downloads.find((d) => d.id === track.id);
      setDownloadStatus(item ? item.status : "none");
    });
    return unsubscribe;
  }, [track.id]);

  const isCurrentTrack = currentTrack?.id === track.id;

  const getQualityLabel = (quality?: string) => {
    if (!quality) return null;
    if (quality.includes("HI_RES")) return "HI-RES";
    return null;
  };

  const qualityLabel = getQualityLabel(track.quality);
  const favorited = isFavorite("track", track.id);

  const translateX = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > 80) {
        // Swipe Right: Favorite
        runOnJS(toggleFavorite)("track", track);
        translateX.value = withSpring(0);
      } else if (e.translationX < -80 && onRemove) {
        // Swipe Left: Remove (if callback provided)
        runOnJS(onRemove)(track);
        translateX.value = withSpring(0);
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    backgroundColor: colors.background,
  }));

  const bgStyle = useAnimatedStyle(() => {
    const isRightSwipe = translateX.value > 0;
    return {
      opacity: translateX.value !== 0 ? 1 : 0,
      backgroundColor: isRightSwipe
        ? (favorited ? colors.border : "#FF4B4B22")
        : Palette.error + "22",
      alignItems: isRightSwipe ? "flex-start" as const : "flex-end" as const,
      paddingLeft: isRightSwipe ? Spacing.md : 0,
      paddingRight: translateX.value < 0 ? Spacing.md : 0,
    };
  });

  const heartStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? 1 : 0,
    display: translateX.value > 0 ? "flex" : "none",
  }));

  const trashStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < 0 ? 1 : 0,
    display: translateX.value < 0 ? "flex" : "none",
  }));

  return (
    <View style={{ position: "relative", overflow: "hidden" }}>
      {/* Background Action Reveal */}
      <Animated.View style={[styles.swipeBackground, bgStyle]}>
        <Animated.View style={heartStyle}>
          <Heart
            size={20}
            color={favorited ? colors.icon : "#FF4B4B"}
            fill={favorited ? "transparent" : "#FF4B4B"}
          />
        </Animated.View>
        <Animated.View style={trashStyle}>
          <Trash2 size={20} color={Palette.error} />
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.itemWrapper, animatedStyle]}>
          <TouchableOpacity 
            style={styles.container} 
            onPress={() => onPress(track)}
            activeOpacity={0.7}
          >
            {!hideCover ? (
              <Image
                source={{
                  uri: track.album.coverUrl || musicService.getCoverUrl(track),
                }}
                style={[styles.cover, { borderColor: colors.border }]}
                contentFit="cover"
                transition={200}
              />
            ) : (
              showIndex && (
                <View style={styles.indexContainer}>
                  <ThemedText style={[styles.indexText, { color: colors.icon }]}>
                    {index !== undefined ? String(index + 1).padStart(2, "0") : ""}
                  </ThemedText>
                </View>
              )
            )}
            <View
              style={[
                styles.mainContent,
                hideCover && !showIndex && { marginLeft: 0 },
              ]}
            >
              <View style={styles.details}>
                <View style={styles.titleRow}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={styles.title}
                    numberOfLines={1}
                  >
                    {track.title}
                  </ThemedText>
                  {track.explicit && (
                    <View
                      style={[styles.explicitBadge, { backgroundColor: colors.icon }]}
                    >
                      <ThemedText style={styles.explicitText}>E</ThemedText>
                    </View>
                  )}
                  {downloadStatus === "completed" && (
                    <View style={styles.downloadedBadge}>
                      <CheckCircle2
                        size={12}
                        color={Palette.success}
                        strokeWidth={2.5}
                      />
                    </View>
                  )}
                  {downloadStatus === "cached" && (
                    <View style={[styles.downloadedBadge, { opacity: 0.6 }]}>
                      <CloudDownload
                        size={12}
                        color={colors.icon}
                        strokeWidth={2.5}
                      />
                    </View>
                  )}
                </View>
                <View style={[styles.artistRow]}>
                  {qualityLabel && (
                    <View style={[styles.qualityBadge, { borderColor: colors.icon }]}>
                      <ThemedText
                        style={[styles.qualityText, { color: colors.icon }]}
                      >
                        {qualityLabel}
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText
                    style={[styles.artist, { color: colors.icon }]}
                    numberOfLines={1}
                  >
                    {track.artist.name}
                  </ThemedText>
                </View>
              </View>
              {isCurrentTrack && (
                <View style={styles.playingIndicator}>
                  <Volume2 size={16} color={colors.text} fill={colors.text} />
                </View>
              )}
              <View style={styles.rightContent}>
                <View style={styles.topRight}>
                  <TouchableOpacity
                    onPress={async () => {
                      if (favorited) {
                        await toggleFavorite("track", track);
                      } else {
                        await toggleFavorite("track", track);
                      }
                    }}
                    style={styles.heartButton}
                  >
                    <Heart
                      size={16}
                      color={favorited ? "#FF4B4B" : colors.icon}
                      fill={favorited ? "#FF4B4B" : "transparent"}
                      style={{ opacity: favorited ? 1 : 0.7 }}
                    />
                  </TouchableOpacity>
                  <ThemedText style={[styles.duration, { color: colors.icon }]}>
                    {musicService.formatDuration(track.duration)}
                  </ThemedText>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    alignItems: "center",
    paddingHorizontal: Spacing.md,
  },
  itemWrapper: {
    width: "100%",
  },
  swipeBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 0,
    backgroundColor: "#000",
    borderWidth: Strokes.hairline,
  },
  indexContainer: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.medium,
    opacity: 0.6,
  },
  mainContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: Spacing.md,
  },
  playingIndicator: {
    marginHorizontal: Spacing.md,
  },
  details: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.bold,
    flexShrink: 1,
  },
  explicitBadge: {
    width: 14,
    height: 14,
    borderRadius: 0,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
    opacity: 0.6,
    display: "flex",
  },
  explicitText: {
    fontSize: 8,
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 14,
  },
  downloadedBadge: {
    marginLeft: 6,
    opacity: 0.8,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  qualityBadge: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginRight: 8,
    opacity: 0.5,
  },
  qualityText: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1,
  },
  artist: {
    fontSize: FontSizes.small,
    fontFamily: Fonts.regular,
    opacity: 0.7,
    flexShrink: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rightContent: {
    alignItems: "flex-end",
    marginLeft: Spacing.sm,
    justifyContent: "center",
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  heartButton: {
    padding: 4,
    marginRight: 4,
  },
  duration: {
    fontSize: 11,
    opacity: 0.8,
    fontFamily: Fonts.medium,
  },
});
