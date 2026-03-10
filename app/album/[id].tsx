import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Heart, Play } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import { Colors, FontSizes, Spacing, Strokes } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { Album, musicService, Track } from "../../services/music-service";

export default function AlbumDetail() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const router = useRouter();
  const [album, setAlbum] = useState<
    (Album & { tracks: Track[]; similarAlbums?: Album[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { setQueue } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    if (id) {
      fetchAlbumData();
    }
  }, [id]);

  const fetchAlbumData = async () => {
    setLoading(true);
    try {
      const data = await musicService.getAlbum(id);
      setAlbum(data as any);
    } catch (error) {
      console.error("Failed to fetch album data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    if (album?.tracks) {
      setQueue(album.tracks, album.tracks.indexOf(track));
    }
  };

  const handleToggleFavorite = async () => {
    if (album) {
      const { tracks, ...albumData } = album;
      await toggleFavorite("album", albumData);
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

  if (!album) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ThemedText>Album not found</ThemedText>
      </SafeAreaView>
    );
  }

  const isAlbumFavorite = isFavorite("album", album.id);

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
          <ThemedText
            type="defaultSemiBold"
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {album.title}
          </ThemedText>
          <TouchableOpacity
            onPress={handleToggleFavorite}
            style={styles.iconButton}
          >
            <Heart
              size={24}
              color={isAlbumFavorite ? colors.primary : colors.text}
              fill={isAlbumFavorite ? colors.primary : "transparent"}
            />
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <Image
            source={{
              uri: album.coverUrl || "https://via.placeholder.com/300",
            }}
            style={styles.albumImage}
          />
          <View style={styles.heroOverlay}>
            <ThemedText type="title" style={styles.albumTitle}>
              {album.title}
            </ThemedText>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/artist/[id]",
                  params: { id: album.artist.id },
                })
              }
            >
              <ThemedText
                style={[styles.artistName, { color: colors.primary }]}
              >
                {album.artist.name}
              </ThemedText>
            </TouchableOpacity>
            <ThemedText style={[styles.albumMeta, { color: colors.icon }]}>
              {album.releaseDate?.split("-")[0]} • {album.tracks.length} tracks
            </ThemedText>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[styles.playButton, { backgroundColor: colors.primary }]}
                onPress={() =>
                  album.tracks.length > 0 && handleTrackPress(album.tracks[0])
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
          {album.tracks.map((track, index) => (
            <TrackItem
              key={`${track.id}-${index}`}
              track={track}
              onPress={handleTrackPress}
            />
          ))}
        </View>

        {/* Similar Albums */}
        {album.similarAlbums && album.similarAlbums.length > 0 && (
          <View style={styles.similarSection}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Similar Albums
            </ThemedText>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={album.similarAlbums}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.similarAlbumCard}
                  onPress={() =>
                    router.push({
                      pathname: "/album/[id]",
                      params: { id: item.id },
                    })
                  }
                >
                  <Image
                    source={{
                      uri: item.coverUrl || "https://via.placeholder.com/300",
                    }}
                    style={styles.similarAlbumImage}
                  />
                  <ThemedText
                    type="defaultSemiBold"
                    style={styles.similarAlbumTitle}
                    numberOfLines={1}
                  >
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    style={[styles.similarAlbumArtist, { color: colors.icon }]}
                    numberOfLines={1}
                  >
                    {item.artist.name}
                  </ThemedText>
                </Pressable>
              )}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}
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
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    zIndex: 10,
    borderBottomWidth: Strokes.hairline,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerTitle: {
    fontSize: FontSizes.caption,
    flex: 1,
    textAlign: "center",
    marginHorizontal: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontFamily: "Inter_600SemiBold",
    opacity: 0.6,
  },
  iconButton: {
    padding: Spacing.sm,
  },
  hero: {
    padding: Spacing.xl,
    alignItems: "center",
    borderBottomWidth: Strokes.hairline,
    borderBottomColor: "rgba(0,0,0,0.1)",
    marginBottom: Spacing.xl,
  },
  albumImage: {
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
  albumTitle: {
    fontSize: FontSizes.h2,
    textAlign: "center",
    marginBottom: Spacing.sm,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  artistName: {
    fontSize: FontSizes.body,
    fontFamily: "Inter_600SemiBold",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  albumMeta: {
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
    paddingBottom: Spacing.xl,
  },
  similarSection: {
    paddingVertical: Spacing.xl,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: FontSizes.caption,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontFamily: "Inter_600SemiBold",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    opacity: 0.6,
  },
  horizontalList: {
    paddingHorizontal: Spacing.xl,
  },
  similarAlbumCard: {
    width: 160,
    marginRight: Spacing.xl,
  },
  similarAlbumImage: {
    width: 160,
    height: 160,
    borderRadius: 0,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  similarAlbumTitle: {
    fontSize: FontSizes.body,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  similarAlbumArtist: {
    fontSize: FontSizes.small,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.6,
  },
});
