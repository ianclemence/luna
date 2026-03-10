import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Pause, Play } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../../components/themed-text";
import { TrackItem } from "../../../components/track-item";
import {
  Colors,
  Fonts,
  FontSizes,
  Radii,
  Spacing,
} from "../../../constants/theme";
import { useColorScheme } from "../../../hooks/use-color-scheme";
import { usePlayer } from "../../../hooks/use-player";
import { musicService, Playlist, Track } from "../../../services/music-service";

export default function PlaylistDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { currentTrack, isPlaying, setQueue, togglePlayPause } = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchPlaylistDetail();
    }
  }, [id]);

  const fetchPlaylistDetail = async () => {
    setLoading(true);
    try {
      const data = await musicService.getPlaylist(id as string);
      setPlaylist(data);
    } catch (error) {
      console.error("Failed to fetch playlist detail:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    if (playlist) {
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

  if (loading || !playlist) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ThemedText>Loading...</ThemedText>
      </View>
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
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={playlist.tracks}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.heroSection}>
            <Image
              source={{
                uri: playlist.imageUrl || playlist.tracks[0]?.coverUrl,
              }}
              style={styles.coverImage}
            />
            <View style={styles.heroInfo}>
              <ThemedText type="title" style={styles.playlistTitle}>
                {playlist.title}
              </ThemedText>
              <ThemedText style={[styles.playlistMeta, { color: colors.icon }]}>
                {playlist.tracks.length} tracks
              </ThemedText>

              <TouchableOpacity
                style={[
                  styles.playButton,
                  isPlaylistPlaying
                    ? {
                        backgroundColor: "white",
                        borderColor: "black",
                        borderWidth: 1,
                      }
                    : { backgroundColor: "black" },
                ]}
                onPress={handlePlayButtonPress}
              >
                {isPlaylistPlaying ? (
                  <>
                    <Pause size={20} color="black" fill="black" />
                    <ThemedText
                      style={[styles.playButtonText, { color: "black" }]}
                    >
                      Pause
                    </ThemedText>
                  </>
                ) : (
                  <>
                    <Play size={20} color="white" fill="white" />
                    <ThemedText
                      style={[styles.playButtonText, { color: "white" }]}
                    >
                      Play
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            index={index}
            onPress={() => handleTrackPress(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 56,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  heroSection: {
    flexDirection: "row",
    padding: Spacing.lg,
    alignItems: "center",
  },
  coverImage: {
    width: 140,
    height: 140,
    borderRadius: Radii.md,
    backgroundColor: "#222",
  },
  heroInfo: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  playlistTitle: {
    fontSize: FontSizes.xl,
    marginBottom: Spacing.xs,
  },
  playlistMeta: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.full,
    alignSelf: "flex-start",
  },
  playButtonText: {
    fontFamily: Fonts.bold,
    marginLeft: Spacing.xs,
    textTransform: "uppercase",
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
});
