import { Image } from "expo-image";
import { Pause, Play, SkipForward } from "lucide-react-native";
import React, { useEffect } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Reanimated, {
  Layout,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { Colors, FontSizes, Spacing, Strokes } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";
import { usePlayer } from "../hooks/use-player";
import { ThemedText } from "./themed-text";

import { useRouter } from "expo-router";

export const PlayerBar = () => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    skipToNext,
    position,
    duration,
  } = usePlayer();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();

  // Interpolated progress for smooth bar
  const animatedPosition = useSharedValue(position);
  const lastSyncTime = useSharedValue(Date.now());
  const isPlayingShared = useSharedValue(isPlaying);

  useEffect(() => {
    isPlayingShared.value = isPlaying;
    if (isPlaying) {
      lastSyncTime.value = Date.now();
    }
  }, [isPlaying, isPlayingShared, lastSyncTime]);

  useEffect(() => {
    animatedPosition.value = position;
    lastSyncTime.value = Date.now();
  }, [position, animatedPosition, lastSyncTime]);

  useFrameCallback((frameInfo) => {
    "use worklet";
    if (!isPlayingShared.value) return;

    const now = Date.now();
    const timeElapsed = now - lastSyncTime.value;
    animatedPosition.value = Math.min(duration, position + timeElapsed);
  }, true);

  const progressStyle = useAnimatedStyle(() => {
    const progress =
      duration > 0 ? (animatedPosition.value / duration) * 100 : 0;
    return {
      width: `${progress}%`,
    };
  });

  if (!currentTrack) return null;

  const coverUrl = currentTrack.album?.coverUrl;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          style={styles.content}
          onPress={() => router.push("/player")}
        >
          <View style={styles.coverContainer}>
            {coverUrl ? (
              <Image
                source={{ uri: coverUrl }}
                style={styles.coverImage}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  styles.coverPlaceholder,
                  { backgroundColor: colors.secondary },
                ]}
              />
            )}
            <View
              style={[
                styles.spindleHole,
                { backgroundColor: colors.background },
              ]}
            />
          </View>
          <Reanimated.View
            sharedTransitionTag={`title-${currentTrack.id}`}
            layout={Layout.springify()}
            style={styles.details}
          >
            <View style={styles.titleRow}>
              <ThemedText
                type="defaultSemiBold"
                style={styles.title}
                numberOfLines={1}
              >
                {currentTrack.title}
              </ThemedText>
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
            <ThemedText
              style={[styles.artist, { color: colors.icon }]}
              numberOfLines={1}
            >
              {currentTrack.artist.name}
            </ThemedText>
          </Reanimated.View>
        </TouchableOpacity>
      </View>
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={togglePlayPause}
          style={styles.controlButton}
        >
          {isPlaying ? (
            <Pause size={24} color={colors.text} fill={colors.text} />
          ) : (
            <Play size={24} color={colors.text} fill={colors.text} />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={skipToNext} style={styles.controlButton}>
          <SkipForward size={24} color={colors.text} fill={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Progress Bar between song bar and bottom navigation */}
      <View
        style={[
          styles.progressBarContainer,
          { backgroundColor: colors.border },
        ]}
      >
        <Reanimated.View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: colors.accent,
            },
            progressStyle,
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 0,
    paddingHorizontal: Spacing.md,
    borderRadius: 0,
    borderTopWidth: Strokes.hairline,
    borderBottomWidth: Strokes.hairline,
    position: "absolute",
    bottom: 80, // Align with tab bar (height is 80)
    left: 0,
    right: 0,
    zIndex: 10,
  },
  progressBarContainer: {
    position: "absolute",
    bottom: -4, // Positioned right below the song bar
    left: 0,
    right: 0,
    height: 4,
    zIndex: 11,
  },
  progressBarFill: {
    height: "100%",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 0,
    borderWidth: 1,
  },
  details: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: FontSizes.body,
    fontFamily: "Inter_600SemiBold",
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
  artist: {
    fontSize: FontSizes.small,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.6,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.md,
    borderLeftWidth: StyleSheet.hairline,
    borderLeftColor: "rgba(0,0,0,0.1)",
  },
  controlButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  coverContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
  },
  spindleHole: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: "center",
    top: 18, // (44 - 8) / 2
    zIndex: 2,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
});
