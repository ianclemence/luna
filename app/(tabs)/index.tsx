import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  GridSkeleton,
  Skeleton,
  TrackSkeleton,
} from "../../components/skeleton-loader";
import { ThemedText } from "../../components/themed-text";
import { TrackItem } from "../../components/track-item";
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  Strokes,
} from "../../constants/theme";
import { useThemeContext } from "../../contexts/theme-context";
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
  const { toggleTheme } = useThemeContext(); // Use theme context hook

  // Removed theme debug logs

  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    setLoading(true);
    try {
      const [
        history,
        favorites,
        playlists,
        recentAlbums,
        recentPlaylists,
        recentMixes,
      ] = await Promise.all([
        storageService.getHistory(),
        storageService.getFavoriteTracks(),
        storageService.getFavorites("playlist"),
        storageService.getRecentAlbums(),
        storageService.getRecentPlaylists(),
        storageService.getRecentMixes(),
      ]);

      const hasActivity =
        history.length > 0 || favorites.length > 0 || playlists.length > 0;

      let seeds: Track[] = [];
      let jumpBackIn: (Track | Album | Playlist | any)[] = [];

      if (hasActivity) {
        // Jump Back In: Logic from web app (ui.js renderHomeRecent)
        // Combines albums, playlists, mixes, and history tracks
        const items: any[] = [];

        if (recentAlbums.length > 0)
          items.push(
            ...recentAlbums.slice(0, 4).map((i) => ({ ...i, _kind: "album" })),
          );
        if (recentPlaylists.length > 0)
          items.push(
            ...recentPlaylists
              .slice(0, 4)
              .map((i) => ({ ...i, _kind: "playlist" })),
          );
        if (recentMixes.length > 0)
          items.push(
            ...recentMixes.slice(0, 4).map((i) => ({ ...i, _kind: "mix" })),
          );

        // Add history tracks if we need more items or for variety
        if (history.length > 0)
          items.push(
            ...history.slice(0, 4).map((i) => ({ ...i, _kind: "track" })),
          );

        // Shuffle and limit to 5 as requested
        jumpBackIn = items.sort(() => Math.random() - 0.5).slice(0, 5);

        // Seeds for recommendations: Align with web app priority (Playlists > Favorites > History)
        // Since we don't have playlist tracks easily available, we use favorites and history
        const shuffle = (arr: any[]) =>
          [...arr].sort(() => Math.random() - 0.5);

        seeds = [
          ...shuffle(favorites).slice(0, 20),
          ...shuffle(history).slice(0, 10),
        ];
        seeds = shuffle(seeds).slice(0, 10);
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
    storageService.addToHistory(track);
  };

  const handleAlbumPress = (album: Album) => {
    storageService.addAlbumToHistory(album);
    router.push({
      pathname: "/album/[id]",
      params: { id: album.id },
    });
  };

  const handlePlaylistPress = (playlist: Playlist) => {
    storageService.addPlaylistToHistory(playlist);
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
        style={[styles.cardImage, { borderColor: colors.border }]}
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

  const handleMixPress = (mix: any) => {
    // Assuming mix has tracks or we fetch them
    if (mix.tracks) {
      setQueue(mix.tracks, 0);
      storageService.addMixToHistory(mix);
    }
  };

  const renderJumpBackInItem = (item: any, idx?: number) => {
    const kind = item._kind;

    if (kind === "track") {
      const trackJumpBackIn = data?.jumpBackIn?.filter(
        (i) => i._kind === "track",
      ) as Track[] | undefined;
      return (
        <View
          key={`jump-track-${item.id}-${idx}`}
          style={styles.gridItemWrapper}
        >
          <TrackItem
            track={item as Track}
            onPress={(t) => handleTrackPress(t, trackJumpBackIn || [])}
          />
        </View>
      );
    }

    return (
      <Pressable
        key={`${item.id || item.uuid}-${kind}-${idx}`}
        style={[
          styles.recentCard,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
        onPress={() => {
          if (kind === "album") handleAlbumPress(item as Album);
          else if (kind === "playlist") handlePlaylistPress(item as Playlist);
          else if (kind === "mix") handleMixPress(item);
        }}
      >
        <Image
          source={{ uri: item.coverUrl || item.imageUrl }}
          style={[styles.recentCardImage, { borderColor: colors.border }]}
        />
        <View style={styles.recentCardInfo}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {item.title}
          </ThemedText>
          <ThemedText
            style={[styles.cardSubtitle, { color: colors.icon }]}
            numberOfLines={1}
          >
            {kind.toUpperCase()}
          </ThemedText>
        </View>
      </Pressable>
    );
  };

  if (loading || !data) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Skeleton */}
          <View style={styles.header}>
            <Skeleton width={60} height={60} borderRadius={10} />
          </View>

          {/* Jump Back In Skeleton */}
          <View style={styles.section}>
            <Skeleton
              width={150}
              height={20}
              style={{ marginLeft: Spacing.xl, marginBottom: Spacing.lg }}
            />
            <View style={styles.tracksGrid}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.gridItemWrapper}>
                  <TrackSkeleton />
                </View>
              ))}
            </View>
          </View>

          {/* Suggested Skeleton */}
          <View style={styles.section}>
            <Skeleton
              width={180}
              height={20}
              style={{ marginLeft: Spacing.xl, marginBottom: Spacing.lg }}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {[1, 2, 3].map((i) => (
                <GridSkeleton key={i} />
              ))}
            </ScrollView>
          </View>
        </ScrollView>
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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={toggleTheme}>
            <Image
              source={require("../../assets/images/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Pressable>
        </View>

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
                  keyExtractor={(item, index) => `${item.id}-${index}`}
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
                  {data.trendingTracks.map((track, index) => (
                    <View
                      key={`trending-${track.id}-${index}`}
                      style={styles.gridItemWrapper}
                    >
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
                  keyExtractor={(item, index) => `${item.id}-${index}`}
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
                  {data.jumpBackIn.map((item, index) =>
                    renderJumpBackInItem(item, index),
                  )}
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
                  {data.recommendedTracks.map((track, index) => (
                    <View
                      key={`recommended-${track.id}-${index}`}
                      style={styles.gridItemWrapper}
                    >
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
                  keyExtractor={(item, index) => `${item.id}-${index}`}
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
  header: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
  },
  logo: {
    width: 60,
    height: 60,
  },
  section: {
    marginTop: Spacing.xxxl,
  },
  sectionTitle: {
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: FontSizes.phrase,
    fontFamily: Fonts.displaySemiBold,
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
  },
  cardTitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    fontFamily: Fonts.medium,
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
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: Strokes.hairline,
  },
  recentCardImage: {
    width: 48,
    height: 48,
    borderRadius: 0,
    backgroundColor: "#000",
    borderWidth: 1,
    marginRight: Spacing.md,
  },
  recentCardInfo: {
    flex: 1,
  },
});
