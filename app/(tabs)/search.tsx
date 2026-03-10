import { useRouter } from "expo-router";
import { Search as SearchIcon } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
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
import { useColorScheme } from "../../hooks/use-color-scheme";
import { usePlayer } from "../../hooks/use-player";
import {
  Album,
  Artist,
  musicService,
  Playlist,
  Track,
} from "../../services/music-service";

interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

export default function Search() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({
    tracks: [],
    albums: [],
    artists: [],
    playlists: [],
  });
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { setQueue } = usePlayer();

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.trim()) {
        performSearch(query);
      } else {
        setResults({ tracks: [], albums: [], artists: [], playlists: [] });
        setHasSearched(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const performSearch = async (q: string) => {
    setLoading(true);
    try {
      const searchResults = await musicService.search(q);
      setResults(searchResults);
      setHasSearched(true);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    setQueue(results.tracks, results.tracks.indexOf(track));
  };

  const handleItemPress = (item: any, type: string) => {
    if (type === "artist") {
      router.push({
        pathname: "/artist/[id]",
        params: { id: item.id },
      });
    } else if (type === "album") {
      router.push({
        pathname: "/album/[id]",
        params: { id: item.id },
      });
    } else if (type === "playlist") {
      router.push({
        pathname: "/playlist/[id]",
        params: { id: item.id },
      });
    }
  };

  const groupItems = (data: any[]) => {
    const grouped = [];
    for (let i = 0; i < data.length; i += 2) {
      grouped.push(data.slice(i, i + 2));
    }
    return grouped;
  };

  const sections = [
    { title: "Tracks", data: results.tracks, type: "track" },
    { title: "Albums", data: groupItems(results.albums), type: "album" },
    {
      title: "Playlists",
      data: groupItems(results.playlists),
      type: "playlist",
    },
  ].filter((section) => section.data.length > 0);

  const renderItem = ({ item, section }: { item: any; section: any }) => {
    if (section.type === "track") {
      return (
        <View style={styles.itemWrapper}>
          <TrackItem track={item} onPress={handleTrackPress} />
        </View>
      );
    }

    if (section.type === "artist") {
      return (
        <View style={styles.itemWrapper}>
          <Pressable
            style={styles.artistItem}
            onPress={() => handleItemPress(item, "artist")}
          >
            <View style={styles.artistImageContainer}>
              <Image
                source={{ uri: item.imageUrl || item.coverUrl }}
                style={styles.artistImage}
              />
              <View
                style={[styles.artistTag, { backgroundColor: colors.text }]}
              >
                <Text
                  style={[styles.artistTagText, { color: colors.background }]}
                >
                  ARTIST
                </Text>
              </View>
            </View>
            <View style={styles.artistContent}>
              <Text style={[styles.artistName, { color: colors.text }]}>
                {item.name}
              </Text>
              <View
                style={[
                  styles.artistUnderline,
                  { backgroundColor: colors.border },
                ]}
              />
            </View>
          </Pressable>
        </View>
      );
    }

    if (section.type === "album" || section.type === "playlist") {
      return (
        <View style={styles.gridRow}>
          {item.map((subItem: any) => (
            <Pressable
              key={subItem.id}
              style={[styles.gridCard, { borderColor: colors.border }]}
              onPress={() => handleItemPress(subItem, section.type)}
            >
              <Image
                source={{ uri: subItem.imageUrl || subItem.coverUrl }}
                style={styles.gridCardImage}
              />
              <Text
                style={[styles.gridCardTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {subItem.title}
              </Text>
              <Text style={[styles.gridCardSubtitle, { color: colors.icon }]}>
                {section.type === "album"
                  ? subItem.artist?.name || "Unknown Artist"
                  : `${subItem.trackCount || 0} TRACKS`}
              </Text>
            </Pressable>
          ))}
          {item.length === 1 && <View style={styles.gridCardSpacer} />}
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Search</Text>
      </View>

      <View
        style={[
          styles.searchBox,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      >
        <SearchIcon
          size={20}
          color={colors.text}
          style={styles.searchIcon}
          strokeWidth={Strokes.regular}
        />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Search tracks, artists, albums..."
          placeholderTextColor={colors.text}
          value={query}
          onChangeText={setQuery}
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) =>
            Array.isArray(item)
              ? item.map((i) => i.id).join("-")
              : item.id || `item-${index}`
          }
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <Text
              style={[
                styles.sectionHeader,
                { color: colors.text, backgroundColor: colors.background },
              ]}
            >
              {title}
            </Text>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            query && hasSearched && !loading ? (
              <View style={styles.center}>
                <Text style={[styles.emptyText, { color: colors.text }]}>
                  No results found
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  title: {
    fontFamily: Fonts.displayBold,
    fontSize: FontSizes.h1,
    textTransform: "uppercase",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    height: 50,
    borderRadius: Radii.input,
    borderWidth: Strokes.thin,
    borderStyle: "dashed",
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    letterSpacing: 0.5,
  },
  list: {
    paddingBottom: 180,
  },
  sectionHeader: {
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: FontSizes.phrase,
    fontFamily: "PlayfairDisplay_600SemiBold",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.xxl,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    fontStyle: "italic",
  },
  itemWrapper: {
    paddingHorizontal: Spacing.xl,
  },
  // Artist Item Styling
  artistItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  artistImageContainer: {
    position: "relative",
  },
  artistImage: {
    width: 70,
    height: 70,
    borderWidth: Strokes.hairline,
    borderColor: "rgba(0,0,0,0.1)",
  },
  artistTag: {
    position: "absolute",
    bottom: -Spacing.xs,
    right: -Spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  artistTagText: {
    fontSize: 8,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
  artistContent: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  artistName: {
    fontFamily: "PlayfairDisplay_600SemiBold",
    fontSize: FontSizes.body,
    letterSpacing: 0.5,
  },
  artistUnderline: {
    height: 1,
    marginTop: 4,
    width: "40%",
  },

  // Grid Styling (Albums/Playlists)
  gridRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.xl - Spacing.sm, // Compensate for card margin
    marginBottom: Spacing.md,
  },
  gridCard: {
    flex: 1,
    marginHorizontal: Spacing.sm,
    borderRadius: 0,
    borderWidth: Strokes.hairline,
    padding: Spacing.md,
    backgroundColor: "transparent",
  },
  gridCardImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 0,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  gridCardTitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    fontFamily: "Inter_500Medium",
  },
  gridCardSubtitle: {
    fontSize: FontSizes.small,
    marginTop: 4,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gridCardSpacer: {
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
});
