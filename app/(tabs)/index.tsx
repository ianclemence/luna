import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import { Colors, FontSizes, Spacing, Strokes } from "../../constants/theme";
import { useBottomPadding } from "../../hooks/use-bottom-padding";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { usePlayer } from "../../hooks/use-player";
import {
  Album,
  HomeData,
  musicService,
  Playlist,
  Track,
} from "../../services/music-service";
import { storageService } from "../../services/storage-service";

export default function Home() {
  const router = useRouter();
  const bottomPadding = useBottomPadding();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { setQueue } = usePlayer();

  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    setLoading(true);
    try {
      const history = await storageService.getHistory();
      const favorites = await storageService.getFavoriteTracks();
      const playlists = await storageService.getFavorites("playlist");

      const hasActivity =
        history.length > 0 || favorites.length > 0 || playlists.length > 0;

      let seeds: Track[] = [];
      let jumpBackIn: Track[] = [];

      if (hasActivity) {
        // Jump Back In: Most recent history first
        jumpBackIn = [...history].slice(0, 10);

        // Seeds for recommendations: Shuffle history and favorites
        seeds = [
          ...history.sort(() => Math.random() - 0.5),
          ...favorites.sort(() => Math.random() - 0.5),
        ].slice(0, 10);
      }

      const homeData = await musicService.getHomeData(seeds, jumpBackIn);
      setData(homeData);
    } catch (error) {
      console.error("Failed to fetch home data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track, trackList: Track[]) => {
    setQueue(trackList, trackList.indexOf(track));
  };

  const handleAlbumPress = (album: Album) => {
    router.push({
      pathname: "/album/[id]",
      params: { id: album.id },
    });
  };

  const handlePlaylistPress = (playlist: Playlist) => {
    router.push({
      pathname: "/playlist/[id]",
      params: { id: playlist.id },
    });
  };

  const renderCard = ({
    item,
    type,
  }: {
    item: Album | Playlist;
    type: "album" | "playlist";
  }) => (
    <Pressable
      style={[
        styles.card,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
      onPress={() =>
        type === "album"
          ? handleAlbumPress(item as Album)
          : handlePlaylistPress(item as Playlist)
      }
    >
      <Image
        source={{ uri: (item as any).coverUrl || (item as any).imageUrl }}
        style={styles.cardImage}
      />
      <ThemedText
        type="defaultSemiBold"
        style={styles.cardTitle}
        numberOfLines={1}
      >
        {item.title}
      </ThemedText>
      <ThemedText
        style={[styles.cardSubtitle, { color: colors.icon }]}
        numberOfLines={1}
      >
        {type === "album" ? (item as Album).artist?.name : "Playlist"}
      </ThemedText>
    </Pressable>
  );

  if (loading || !data) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color={colors.text} />
      </SafeAreaView>
    );
  }

  const isFirstTime = !data.jumpBackIn;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      >
        <ThemedText type="title" style={styles.greeting}>
          LUNA
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.icon }]}>
          Your minimalist music experience.
        </ThemedText>

        {isFirstTime ? (
          <>
            {/* Trending Albums */}
            {data.trendingAlbums && data.trendingAlbums.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Trending Albums
                </ThemedText>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={data.trendingAlbums}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => renderCard({ item, type: "album" })}
                  contentContainerStyle={styles.horizontalList}
                />
              </View>
            )}

            {/* Trending Tracks */}
            {data.trendingTracks && data.trendingTracks.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Trending Tracks
                </ThemedText>
                <View style={styles.tracksGrid}>
                  {data.trendingTracks.map((track) => (
                    <View key={track.id} style={styles.gridItemWrapper}>
                      <TrackItem
                        track={track}
                        onPress={(t) =>
                          handleTrackPress(t, data.trendingTracks!)
                        }
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* New Albums */}
            {data.newAlbums && data.newAlbums.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  New Albums
                </ThemedText>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={data.newAlbums}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => renderCard({ item, type: "album" })}
                  contentContainerStyle={styles.horizontalList}
                />
              </View>
            )}
          </>
        ) : (
          <>
            {/* Jump Back In */}
            {data.jumpBackIn && data.jumpBackIn.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Jump Back In
                </ThemedText>
                <View style={styles.tracksGrid}>
                  {data.jumpBackIn.map((track) => (
                    <View key={track.id} style={styles.gridItemWrapper}>
                      <TrackItem
                        track={track}
                        onPress={(t) => handleTrackPress(t, data.jumpBackIn!)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Recommended Tracks */}
            {data.recommendedTracks && data.recommendedTracks.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Recommended Tracks
                </ThemedText>
                <View style={styles.tracksGrid}>
                  {data.recommendedTracks.map((track) => (
                    <View key={track.id} style={styles.gridItemWrapper}>
                      <TrackItem
                        track={track}
                        onPress={(t) =>
                          handleTrackPress(t, data.recommendedTracks!)
                        }
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Recommended Albums */}
            {data.recommendedAlbums && data.recommendedAlbums.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Recommended Albums
                </ThemedText>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={data.recommendedAlbums}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => renderCard({ item, type: "album" })}
                  contentContainerStyle={styles.horizontalList}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: 180,
  },
  greeting: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    textTransform: "uppercase",
    fontSize: FontSizes.h1,
    fontFamily: "PlayfairDisplay_700Bold",
    letterSpacing: 4,
  },
  subtitle: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    opacity: 0.6,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: FontSizes.caption,
    fontFamily: "Inter_400Regular",
  },
  section: {
    marginTop: Spacing.xxxl,
  },
  sectionTitle: {
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: FontSizes.phrase,
    fontFamily: "PlayfairDisplay_600SemiBold",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  horizontalList: {
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: 180,
    marginHorizontal: Spacing.sm,
    borderRadius: 0,
    borderWidth: Strokes.hairline,
    padding: Spacing.md,
    backgroundColor: "transparent",
  },
  cardImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 0,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  cardTitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    fontFamily: "Inter_500Medium",
  },
  cardSubtitle: {
    fontSize: FontSizes.small,
    marginTop: 4,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tracksContainer: {
    paddingHorizontal: Spacing.lg,
  },
  tracksGrid: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  gridItemWrapper: {
    width: "100%",
    marginBottom: Spacing.xs,
  },
});
