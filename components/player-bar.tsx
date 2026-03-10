import { Image } from "expo-image";
import { Pause, Play, SkipForward } from "lucide-react-native";
import React, { useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
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
    skipToPrevious,
    position,
    duration,
  } = usePlayer();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();

  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only set responder for horizontal swipes with enough velocity or distance
        return Math.abs(gestureState.dx) > 20;
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 100) {
          // Swipe Right -> Previous
          Animated.timing(pan, {
            toValue: { x: 500, y: 0 },
            duration: 200,
            useNativeDriver: true,
          }).start(async () => {
            await skipToPrevious();
            pan.setValue({ x: 0, y: 0 });
          });
        } else if (gestureState.dx < -100) {
          // Swipe Left -> Next
          Animated.timing(pan, {
            toValue: { x: -500, y: 0 },
            duration: 200,
            useNativeDriver: true,
          }).start(async () => {
            await skipToNext();
            pan.setValue({ x: 0, y: 0 });
          });
        } else {
          // Spring back
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  if (!currentTrack) return null;

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
      <Animated.View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          transform: [{ translateX: pan.x }],
        }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.content}
          onPress={() => router.push("/player")}
        >
          <Image
            source={{ uri: currentTrack.album.coverUrl }}
            style={styles.cover}
            contentFit="cover"
          />
          <View style={styles.details}>
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
          </View>
        </TouchableOpacity>
      </Animated.View>
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
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${duration > 0 ? (position / duration) * 100 : 0}%` },
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
    backgroundColor: "#000000",
    zIndex: 11,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
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
    borderColor: "rgba(0,0,0,0.1)",
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
});
