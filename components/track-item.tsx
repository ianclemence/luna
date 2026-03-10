import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Heart } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Colors, FontSizes, Fonts, Spacing, Strokes } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";
import { useFavorites } from "../hooks/use-favorites";
import { Track, musicService } from "../services/music-service";
import { ThemedText } from "./themed-text";

interface TrackItemProps {
  track: Track;
  onPress: (track: Track) => void;
}

export const TrackItem = ({ track, onPress }: TrackItemProps) => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { isFavorite, toggleFavorite } = useFavorites();

  const getQualityLabel = (quality?: string) => {
    if (!quality) return null;
    if (quality.includes("HI_RES")) return "HI-RES";
    if (quality.includes("LOSSLESS")) return "LOSSLESS";
    return null;
  };

  const qualityLabel = getQualityLabel(track.quality);
  const favorited = isFavorite(track.id);

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(track)}>
      <Image
        source={{
          uri: track.album.coverUrl || musicService.getCoverUrl(track),
        }}
        style={[styles.cover, { borderColor: colors.border }]}
        contentFit="cover"
        transition={200}
      />
      <View style={[styles.mainContent, { borderBottomColor: colors.border }]}>
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
          </View>
          <View style={styles.artistRow}>
            {qualityLabel && qualityLabel !== "LOSSLESS" && (
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
        <View style={styles.rightContent}>
          <View style={styles.topRight}>
            <TouchableOpacity
              onPress={() => toggleFavorite(track)}
              style={styles.heartButton}
            >
              <Heart
                size={14}
                color={favorited ? "#FF4B4B" : colors.icon}
                fill={favorited ? "#FF4B4B" : "transparent"}
                style={{ opacity: favorited ? 1 : 0.4 }}
              />
            </TouchableOpacity>
            <ThemedText style={[styles.duration, { color: colors.icon }]}>
              {musicService.formatDuration(track.duration)}
            </ThemedText>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 0,
    backgroundColor: "#000",
    borderWidth: Strokes.hairline,
  },
  mainContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: Spacing.md,
    borderBottomWidth: Strokes.hairline,
    paddingBottom: Spacing.sm,
    borderStyle: "dashed",
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
  },
  explicitText: {
    fontSize: 8,
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 14,
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
    fontSize: 10,
    opacity: 0.5,
    fontFamily: Fonts.regular,
  },
});
