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
    | (Artist & { tracks: Track[]; albums: Album[]; similarArtists?: Artist[] })
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [showFullBio, setShowFullBio] = useState(false);
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
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!artist) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ThemedText>Artist not found</ThemedText>
      </SafeAreaView>
    );
  }

  const isArtistFavorite = isFavorite("artist", artist.id);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Biography */}
        {artist.biography && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Biography
            </ThemedText>
            <View style={styles.bioContainer}>
              <ThemedText
                style={[styles.bioText, { color: colors.text }]}
                numberOfLines={showFullBio ? undefined : 4}
              >
                {artist.biography.replace(/<[^>]*>?/gm, "")}
              </ThemedText>
              <TouchableOpacity
                onPress={() => setShowFullBio(!showFullBio)}
                style={styles.showMoreButton}
              >
                <ThemedText
                  style={[styles.showMoreText, { color: colors.primary }]}
                >
                  {showFullBio ? "Show Less" : "Show More"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Similar Artists */}
        {artist.similarArtists && artist.similarArtists.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Similar Artists
            </ThemedText>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={artist.similarArtists}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.similarArtistCard}
                  onPress={() =>
                    router.push({
                      pathname: "/artist/[id]",
                      params: { id: item.id },
                    })
                  }
                >
                  <Image
                    source={{
                      uri: item.imageUrl || "https://via.placeholder.com/300",
                    }}
                    style={styles.similarArtistImage}
                  />
                  <ThemedText
                    type="defaultSemiBold"
                    style={styles.similarArtistName}
                    numberOfLines={1}
                  >
                    {item.name}
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
  bioContainer: {
    paddingHorizontal: Spacing.m,
  },
  bioText: {
    fontSize: FontSizes.s,
    lineHeight: 20,
    opacity: 0.8,
  },
  showMoreButton: {
    marginTop: Spacing.s,
  },
  showMoreText: {
    fontSize: FontSizes.s,
    fontWeight: "600",
  },
  similarArtistCard: {
    width: 120,
    marginRight: Spacing.m,
    alignItems: "center",
  },
  similarArtistImage: {
    width: 120,
    height: 120,
    borderRadius: Radii.full,
    marginBottom: Spacing.s,
  },
  similarArtistName: {
    fontSize: FontSizes.xs,
    textAlign: "center",
  },
});
