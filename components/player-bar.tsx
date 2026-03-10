import { Image } from "expo-image";
import { Pause, Play, SkipForward } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Colors, FontSizes, Spacing, Strokes } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";
import { usePlayer } from "../hooks/use-player";
import { ThemedText } from "./themed-text";

import { useRouter } from "expo-router";

export const PlayerBar = () => {
  const { currentTrack, isPlaying, togglePlayPause, skipToNext } = usePlayer();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();

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
          <ThemedText
            type="defaultSemiBold"
            style={styles.title}
            numberOfLines={1}
          >
            {currentTrack.title}
          </ThemedText>
          <ThemedText
            style={[styles.artist, { color: colors.icon }]}
            numberOfLines={1}
          >
            {currentTrack.artist.name}
          </ThemedText>
        </View>
      </TouchableOpacity>
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
    borderStyle: "dashed",
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
  title: {
    fontSize: FontSizes.body,
    fontFamily: "Inter_600SemiBold",
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
