import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Pause, Play } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../../components/themed-text";
import { TrackItem } from "../../../components/track-item";
import { Colors, FontSizes, Spacing } from "../../../constants/theme";
import { useColorScheme } from "../../../hooks/use-color-scheme";
import { usePlayer } from "../../../hooks/use-player";
import { musicService, Playlist, Track } from "../../../services/music-service";

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
  const { currentTrack, isPlaying, setQueue, togglePlayPause } = usePlayer();

  useEffect(() => {
    if (id) {
      fetchPlaylistData();
    }
  }, [id]);

  const fetchPlaylistData = async () => {
    setLoading(true);
    try {
      const data = await musicService.getPlaylist(id as string);
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

  const handlePlayButtonPress = () => {
    if (!playlist || playlist.tracks.length === 0) return;

    const isPlaylistPlaying =
      currentTrack && playlist.tracks.some((t) => t.id === currentTrack.id);

    if (isPlaylistPlaying) {
      togglePlayPause();
    } else {
      setQueue(playlist.tracks, 0);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!playlist) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ThemedText>Playlist not found</ThemedText>
      </SafeAreaView>
    );
  }

  const isPlaylistPlaying =
    currentTrack &&
    playlist.tracks.some((t) => t.id === currentTrack.id) &&
    isPlaying;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView stickyHeaderIndices={[0]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <ChevronLeft size={24} color={colors.text} />
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
                style={[
                  styles.playButton,
                  { backgroundColor: isPlaylistPlaying ? "white" : "black" },
                ]}
                onPress={handlePlayButtonPress}
              >
                {isPlaylistPlaying ? (
                  <Pause size={20} color="black" fill="black" />
                ) : (
                  <Play size={20} color="white" fill="white" />
                )}
                <ThemedText
                  style={[
                    styles.playButtonText,
                    { color: isPlaylistPlaying ? "black" : "white" },
                  ]}
                >
                  {isPlaylistPlaying ? "Pause" : "Play"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Track List */}
        <View style={styles.section}>
          {playlist.tracks.map((track, index) => (
            <TrackItem
              key={`${track.id}-${index}`}
              track={track}
              onPress={handleTrackPress}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    zIndex: 10,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  hero: {
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  playlistImage: {
    width: 260,
    height: 260,
    borderRadius: 0,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  heroOverlay: {
    alignItems: "center",
    width: "100%",
  },
  playlistTitle: {
    fontSize: FontSizes.h2,
    textAlign: "center",
    marginBottom: Spacing.sm,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  description: {
    fontSize: FontSizes.body,
    textAlign: "center",
    marginBottom: Spacing.m,
    paddingHorizontal: Spacing.m,
    fontFamily: "Inter_400Regular",
    opacity: 0.7,
  },
  playlistMeta: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.xl,
    fontFamily: "Inter_400Regular",
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "center",
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "black",
  },
  playButtonText: {
    color: "white",
    fontSize: FontSizes.button,
    fontFamily: "Inter_600SemiBold",
    marginLeft: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },
});
