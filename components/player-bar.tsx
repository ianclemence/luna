import { Image } from "expo-image";
import { Pause, Play, SkipForward } from "lucide-react-native";
import React, { useCallback, useEffect } from "react";
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

  const rotation = useSharedValue(0);
  const velocity = useSharedValue(0);
  const isPlayingShared = useSharedValue(isPlaying);
  const vinylPausedByUser = useSharedValue(false);
  const RPM = 15;
  const targetVelocity = (RPM * 360) / 60;
  const acceleration = 60;
  const friction = 40;

  useEffect(() => {
    isPlayingShared.value = isPlaying;
  }, [isPlaying, isPlayingShared]);

  const pauseVinyl = useCallback(() => {
    vinylPausedByUser.value = true;
  }, [vinylPausedByUser]);

  const resumeVinyl = useCallback(() => {
    vinylPausedByUser.value = false;
  }, [vinylPausedByUser]);

  useEffect(() => {
    if (isPlaying && !vinylPausedByUser.value) {
      vinylPausedByUser.value = false;
    }
  }, [isPlaying, vinylPausedByUser]);

  useFrameCallback((frameInfo) => {
    "use worklet";
    const { timeSincePreviousFrame } = frameInfo;
    if (!timeSincePreviousFrame) return;

    const dt = timeSincePreviousFrame / 1000;
    const shouldSpin = isPlayingShared.value && !vinylPausedByUser.value;

    if (shouldSpin) {
      if (velocity.value < targetVelocity) {
        velocity.value = Math.min(
          targetVelocity,
          velocity.value + acceleration * dt,
        );
      }
    } else {
      if (velocity.value > 0) {
        velocity.value = Math.max(0, velocity.value - friction * dt);
      }
    }

    if (velocity.value > 0) {
      rotation.value += velocity.value * dt;
    }
  }, true);

  const vinylStyle = useAnimatedStyle(() => {
    "use worklet";
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
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
          <Reanimated.View style={[styles.miniVinyl, vinylStyle]}>
            <View
              style={[styles.miniVinylDisc, { borderColor: colors.vinylRing }]}
            >
              <View style={styles.miniVinylCover}>
                {coverUrl ? (
                  <Image
                    source={{ uri: coverUrl }}
                    style={styles.miniVinylCoverImage}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.miniVinylPlaceholder,
                      { backgroundColor: colors.vinyl },
                    ]}
                  />
                )}
              </View>
              <View
                style={[
                  styles.miniSpindle,
                  { backgroundColor: colors.background },
                ]}
              />
            </View>
          </Reanimated.View>
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
          onPress={() => {
            if (isPlaying) {
              pauseVinyl();
            } else {
              resumeVinyl();
            }
            togglePlayPause();
          }}
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
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${duration > 0 ? (position / duration) * 100 : 0}%`,
              backgroundColor: colors.accent,
            },
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
  miniVinyl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  miniVinylDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  miniVinylCover: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  miniVinylCoverImage: {
    width: "100%",
    height: "100%",
  },
  miniVinylPlaceholder: {
    width: "100%",
    height: "100%",
  },
  miniSpindle: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
