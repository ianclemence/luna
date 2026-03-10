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
import { useColorScheme } from "../../hooks/use-color-scheme";
import { usePlayer } from "../../hooks/use-player";
import {
  Album,
  musicService,
  Playlist,
  Track,
} from "../../services/music-service";

interface HomeData {
  newReleases: Album[];
  topTracks: Track[];
  featuredPlaylists: Playlist[];
  recommendations: Track[];
}

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState<HomeData>({
    newReleases: [],
    topTracks: [],
    featuredPlaylists: [],
    recommendations: [],
  });
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
      const homeData = await musicService.getHomeData();
      setData(homeData);
    } catch (error) {
      console.error("Failed to fetch home data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    setQueue(data.topTracks, data.topTracks.indexOf(track));
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

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="title" style={styles.greeting}>
          LUNA
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.icon }]}>
          Your minimalist music experience.
        </ThemedText>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            New Releases
          </ThemedText>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data.newReleases}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderCard({ item, type: "album" })}
            contentContainerStyle={styles.horizontalList}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Featured Playlists
          </ThemedText>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data.featuredPlaylists}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderCard({ item, type: "playlist" })}
            contentContainerStyle={styles.horizontalList}
          />
        </View>

        {data.recommendations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <ThemedText
                type="subtitle"
                style={[styles.sectionTitle, styles.sectionTitleInRow]}
              >
                Recommended Songs
              </ThemedText>
              <Pressable onPress={fetchHomeData}>
                <ThemedText style={styles.refreshText}>Refresh</ThemedText>
              </Pressable>
            </View>
            <View style={styles.recommendedGrid}>
              {data.recommendations.map((track, index) => (
                <View key={track.id} style={styles.gridItemWrapper}>
                  <TrackItem
                    track={track}
                    onPress={(t) =>
                      setQueue(
                        data.recommendations,
                        data.recommendations.indexOf(t),
                      )
                    }
                  />
                </View>
              ))}
            </View>
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
  sectionTitleInRow: {
    paddingHorizontal: 0,
    marginBottom: 0,
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
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  refreshText: {
    fontSize: FontSizes.caption,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Inter_600SemiBold",
  },
  recommendedGrid: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  gridItemWrapper: {
    width: "100%",
    marginBottom: Spacing.xs,
  },
});
