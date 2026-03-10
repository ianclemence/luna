import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Play, Pause, Clock, MoreVertical } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  ScrollView,
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
  Strokes,
} from "../../../constants/theme";
import { useColorScheme } from "../../../hooks/use-color-scheme";
import { usePlayer } from "../../../hooks/use-player";
import { Album, musicService, Track } from "../../../services/music-service";

export default function AlbumDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { currentTrack, isPlaying, playTrack, setQueue, togglePlayPause } = usePlayer();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchAlbumDetail();
    }
  }, [id]);

  const fetchAlbumDetail = async () => {
    setLoading(true);
    try {
      const data = await musicService.getAlbumById(id as string);
      setAlbum(data);
    } catch (error) {
      console.error("Failed to fetch album detail:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    if (album) {
      setQueue(album.tracks, album.tracks.indexOf(track));
    }
  };

  const handlePlayButtonPress = () => {
    if (!album || album.tracks.length === 0) return;

    const isAlbumPlaying = currentTrack && album.tracks.some(t => t.id === currentTrack.id);
    
    if (isAlbumPlaying) {
      togglePlayPause();
    } else {
      setQueue(album.tracks, 0);
    }
  };

  if (loading || !album) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ThemedText>Loading...</ThemedText>
      </View>
    );
  }

  const isAlbumPlaying = currentTrack && album.tracks.some(t => t.id === currentTrack.id) && isPlaying;

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
        data={album.tracks}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.heroSection}>
            <Image source={{ uri: album.coverUrl }} style={styles.coverImage} />
            <View style={styles.heroInfo}>
              <ThemedText type="title" style={styles.albumTitle}>
                {album.title}
              </ThemedText>
              <ThemedText
                style={[styles.artistName, { color: colors.primary }]}
              >
                {album.artist.name}
              </ThemedText>
              <ThemedText style={[styles.albumMeta, { color: colors.icon }]}>
                {album.releaseDate?.split("-")[0]} • {album.tracks.length} tracks
              </ThemedText>

              <TouchableOpacity
                style={[
                  styles.playButton,
                  isAlbumPlaying 
                    ? { backgroundColor: "white", borderColor: "black", borderWidth: 1 } 
                    : { backgroundColor: "black" }
                ]}
                onPress={handlePlayButtonPress}
              >
                {isAlbumPlaying ? (
                  <>
                    <Pause size={20} color="black" fill="black" />
                    <ThemedText style={[styles.playButtonText, { color: "black" }]}>Pause</ThemedText>
                  </>
                ) : (
                  <>
                    <Play size={20} color="white" fill="white" />
                    <ThemedText style={[styles.playButtonText, { color: "white" }]}>Play</ThemedText>
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
  albumTitle: {
    fontSize: FontSizes.xl,
    marginBottom: Spacing.xs,
  },
  artistName: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.md,
    marginBottom: Spacing.xs,
  },
  albumMeta: {
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
