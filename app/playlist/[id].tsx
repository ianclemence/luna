import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, MoreVertical, Play } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import { Colors, FontSizes, Radii, Spacing } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { usePlayer } from "../../hooks/use-player";
import { musicService, Playlist, Track } from "../../services/music-service";

export default function PlaylistDetail() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const router = useRouter();
  const [playlist, setPlaylist] = useState<
    (Playlist & { tracks: Track[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { setQueue } = usePlayer();

  useEffect(() => {
    if (id) {
      fetchPlaylistData();
    }
  }, [id]);

  const fetchPlaylistData = async () => {
    setLoading(true);
    try {
      const data = await musicService.getPlaylist(id);
      setPlaylist(data as any);
    } catch (error) {
      console.error("Failed to fetch playlist data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    if (playlist?.tracks) {
      setQueue(playlist.tracks, playlist.tracks.indexOf(track));
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ThemedText>Playlist not found</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView stickyHeaderIndices={[0]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <ThemedText
            type="defaultSemiBold"
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {playlist.title}
          </ThemedText>
          <TouchableOpacity style={styles.iconButton}>
            <MoreVertical size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <Image
            source={{
              uri: playlist.imageUrl || "https://via.placeholder.com/300",
            }}
            style={styles.playlistImage}
          />
          <View style={styles.heroOverlay}>
            <ThemedText type="title" style={styles.playlistTitle}>
              {playlist.title}
            </ThemedText>
            {playlist.description && (
              <ThemedText
                style={[styles.description, { color: colors.icon }]}
                numberOfLines={2}
              >
                {playlist.description}
              </ThemedText>
            )}
            <ThemedText style={[styles.playlistMeta, { color: colors.icon }]}>
              {playlist.trackCount} tracks
            </ThemedText>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[styles.playButton, { backgroundColor: colors.primary }]}
                onPress={() =>
                  playlist.tracks.length > 0 &&
                  handleTrackPress(playlist.tracks[0])
                }
              >
                <Play size={20} color="white" fill="white" />
                <ThemedText style={styles.playButtonText}>Play</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Track List */}
        <View style={styles.section}>
          {playlist.tracks.map((track) => (
            <TrackItem
              key={track.id}
              track={track}
              onPress={handleTrackPress}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.m,
    paddingVertical: Spacing.s,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: FontSizes.m,
    flex: 1,
    textAlign: "center",
    marginHorizontal: Spacing.m,
  },
  iconButton: {
    padding: Spacing.s,
  },
  hero: {
    padding: Spacing.l,
    alignItems: "center",
  },
  playlistImage: {
    width: 240,
    height: 240,
    borderRadius: Radii.l,
    marginBottom: Spacing.l,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  heroOverlay: {
    alignItems: "center",
  },
  playlistTitle: {
    fontSize: 28,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.s,
    paddingHorizontal: Spacing.m,
  },
  playlistMeta: {
    fontSize: 14,
    marginBottom: Spacing.l,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.m,
    borderRadius: Radii.full,
  },
  playButtonText: {
    color: "white",
    fontWeight: "600",
    marginLeft: Spacing.s,
    fontSize: 16,
  },
  section: {
    paddingVertical: Spacing.m,
  },
});
