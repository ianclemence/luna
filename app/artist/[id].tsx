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
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import { Colors, FontSizes, Radii, Spacing } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import {
  Album,
  Artist,
  musicService,
  Track,
} from "../../services/music-service";

export default function ArtistDetail() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const router = useRouter();
  const [artist, setArtist] = useState<
    (Artist & { tracks: Track[]; albums: Album[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { setQueue } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    if (id) {
      fetchArtistData();
    }
  }, [id]);

  const fetchArtistData = async () => {
    setLoading(true);
    try {
      const data = await musicService.getArtist(id);
      setArtist(data as any);
    } catch (error) {
      console.error("Failed to fetch artist data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    if (artist?.tracks) {
      setQueue(artist.tracks, artist.tracks.indexOf(track));
    }
  };

  const handleAlbumPress = (album: Album) => {
    router.push({
      pathname: "/album/[id]",
      params: { id: album.id },
    });
  };

  const handleToggleFavorite = async () => {
    if (artist) {
      const { tracks, albums, ...artistData } = artist;
      await toggleFavorite("artist", artistData);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!artist) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ThemedText>Artist not found</ThemedText>
      </View>
    );
  }

  const isArtistFavorite = isFavorite("artist", artist.id);

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
            {artist.name}
          </ThemedText>
          <TouchableOpacity
            onPress={handleToggleFavorite}
            style={styles.iconButton}
          >
            <Heart
              size={24}
              color={isArtistFavorite ? colors.primary : colors.text}
              fill={isArtistFavorite ? colors.primary : "transparent"}
            />
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <Image
            source={{
              uri: artist.imageUrl || "https://via.placeholder.com/300",
            }}
            style={styles.artistImage}
          />
          <View style={styles.heroOverlay}>
            <ThemedText type="title" style={styles.artistName}>
              {artist.name}
            </ThemedText>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[styles.playButton, { backgroundColor: colors.primary }]}
                onPress={() =>
                  artist.tracks.length > 0 && handleTrackPress(artist.tracks[0])
                }
              >
                <Play size={20} color="white" fill="white" />
                <ThemedText style={styles.playButtonText}>Play</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Top Tracks */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Top Tracks
          </ThemedText>
          {artist.tracks.slice(0, 5).map((track) => (
            <TrackItem
              key={track.id}
              track={track}
              onPress={handleTrackPress}
            />
          ))}
        </View>

        {/* Albums */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Albums
          </ThemedText>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={artist.albums}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.albumCard}
                onPress={() => handleAlbumPress(item)}
              >
                <Image
                  source={{ uri: item.coverUrl }}
                  style={styles.albumImage}
                />
                <ThemedText
                  type="defaultSemiBold"
                  style={styles.albumTitle}
                  numberOfLines={1}
                >
                  {item.title}
                </ThemedText>
                <ThemedText style={[styles.albumYear, { color: colors.icon }]}>
                  {item.releaseDate?.split("-")[0]}
                </ThemedText>
              </Pressable>
            )}
            contentContainerStyle={styles.horizontalList}
          />
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
    height: 300,
    width: "100%",
    position: "relative",
  },
  artistImage: {
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.l,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  artistName: {
    color: "white",
    fontSize: 42,
    lineHeight: 48,
    marginBottom: Spacing.m,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.l,
    paddingVertical: Spacing.s,
    borderRadius: Radii.full,
  },
  playButtonText: {
    color: "white",
    fontWeight: "600",
    marginLeft: Spacing.s,
  },
  section: {
    paddingVertical: Spacing.l,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.m,
    marginBottom: Spacing.m,
  },
  horizontalList: {
    paddingHorizontal: Spacing.m,
  },
  albumCard: {
    width: 160,
    marginRight: Spacing.m,
  },
  albumImage: {
    width: 160,
    height: 160,
    borderRadius: Radii.m,
    marginBottom: Spacing.s,
  },
  albumTitle: {
    fontSize: FontSizes.s,
  },
  albumYear: {
    fontSize: FontSizes.xs,
  },
});
