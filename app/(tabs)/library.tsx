import { useRouter } from "expo-router";
import { Disc, Heart, ListMusic } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TrackItem } from "../../components/track-item";
import {
  Colors,
  Fonts,
  FontSizes,
  Radii,
  Spacing,
  Strokes,
} from "../../constants/theme";
import { useBottomPadding } from "../../hooks/use-bottom-padding";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { Track } from "../../services/music-service";
import { storageService } from "../../services/storage-service";

export default function Library() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();
  const bottomPadding = useBottomPadding();
  const {
    favoriteTracks,
    favoriteAlbums,
    favoriteArtists,
    favoritePlaylists,
    loading: favoritesLoading,
  } = useFavorites();
  const { setQueue } = usePlayer();

  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    loadRecentTracks();
  }, []);

  const loadRecentTracks = async () => {
    setLoadingRecent(true);
    try {
      const history = await storageService.getHistory();
      setRecentTracks(history.slice(0, 10));
    } catch (error) {
      console.error("Failed to load recent tracks:", error);
    } finally {
      setLoadingRecent(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    setQueue(recentTracks, recentTracks.indexOf(track));
  };

  const handleClearHistory = async () => {
    await storageService.clearHistory();
    setRecentTracks([]);
  };

  const libraryItems = [
    {
      title: "Liked Tracks",
      icon: Heart,
      count: favoriteTracks.length,
      path: "/library/tracks",
    },
    {
      title: "Albums",
      icon: Disc,
      count: favoriteAlbums.length,
      path: "/library/albums",
    },
    {
      title: "Playlists",
      icon: ListMusic,
      count: favoritePlaylists.length,
      path: "/library/playlists",
    },
  ];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPadding },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>Library</Text>

        <View style={styles.grid}>
          {libraryItems.map((item) => (
            <Pressable
              key={item.path}
              onPress={() => router.push(item.path as any)}
              style={[
                styles.item,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <item.icon size={24} color={colors.text} />
              <Text style={[styles.itemTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              {favoritesLoading ? (
                <ActivityIndicator
                  size="small"
                  color={colors.text}
                  style={styles.loadingIndicator}
                />
              ) : (
                <Text style={[styles.itemCount, { color: colors.icon }]}>
                  {item.count}
                </Text>
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Recently Played
            </Text>
            <TouchableOpacity onPress={handleClearHistory}>
              <Text
                style={[
                  styles.clearButton,
                  { color: "#FF4B4B" }, // Red color
                ]}
              >
                CLEAR
              </Text>
            </TouchableOpacity>
          </View>
          {loadingRecent ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          ) : recentTracks.length > 0 ? (
            <View style={styles.recentList}>
              {recentTracks.map((track, index) => (
                <TrackItem
                  key={`recent-${track.id}-${index}`}
                  track={track}
                  onPress={() => handleTrackPress(track)}
                />
              ))}
            </View>
          ) : (
            <View
              style={[
                styles.placeholder,
                {
                  backgroundColor: colors.background,
                },
              ]}
            >
              <Text style={[styles.emptyText, { color: colors.icon }]}>
                Your recently played music will appear here
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: 160,
  },
  title: {
    fontFamily: Fonts.displayBold,
    fontSize: FontSizes.h1,
    marginBottom: Spacing.xl,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  item: {
    width: "47%",
    padding: Spacing.lg,
    borderRadius: Radii.card,
    borderWidth: Strokes.thin,
  },
  itemTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemCount: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.small,
    marginTop: Spacing.xs,
    opacity: 0.6,
  },
  loadingIndicator: {
    marginTop: Spacing.xs,
  },
  section: {
    marginTop: Spacing.xxl,
  },
  sectionTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: FontSizes.h2,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  clearButton: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.small,
    letterSpacing: 1,
  },
  recentList: {
    marginTop: -Spacing.md, // Offset track item padding
  },
  placeholder: {
    height: 150,
    borderRadius: Radii.card,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    opacity: 0.8,
  },
  emptyText: {
    marginTop: Spacing.sm,
    opacity: 0.6,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: FontSizes.caption,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
