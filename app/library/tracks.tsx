import { useRouter } from "expo-router";
import { ChevronLeft, Filter, Search } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TrackSkeleton } from "../../components/skeleton-loader";
import { ThemedText } from "../../components/themed-text";
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

export default function LikedTracks() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const bottomPadding = useBottomPadding();
  const { favoriteTracks, loading } = useFavorites();
  const { setQueue } = usePlayer();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "added-newest" | "added-oldest" | "title" | "artist" | "album"
  >("added-newest");
  const [menuVisible, setMenuVisible] = useState(false);

  const filteredTracks = useMemo(() => {
    let result = favoriteTracks.filter(
      (track) =>
        track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        track.artist.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    // Apply sorting
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "added-newest":
          return (b.addedAt || 0) - (a.addedAt || 0);
        case "added-oldest":
          return (a.addedAt || 0) - (b.addedAt || 0);
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        case "artist":
          return (a.artist?.name || "").localeCompare(b.artist?.name || "");
        case "album": {
          const albumA = a.album?.title || "";
          const albumB = b.album?.title || "";
          const albumCompare = albumA.localeCompare(albumB);
          if (albumCompare !== 0) return albumCompare;
          return (a.trackNumber || 0) - (b.trackNumber || 0);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [favoriteTracks, searchQuery, sortBy]);

  const handleTrackPress = useCallback((track: Track) => {
    setQueue(filteredTracks, filteredTracks.indexOf(track));
  }, [filteredTracks, setQueue]);

  const renderItem = useCallback(({ item }: { item: Track }) => (
    <TrackItem track={item} onPress={handleTrackPress} />
  ), [handleTrackPress]);

  const keyExtractor = useCallback((item: Track) => item.id, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: 72, // Typical height of TrackItem
    offset: 72 * index,
    index,
  }), []);

  const toggleMenu = () => setMenuVisible(!menuVisible);

  const handleSortChange = (type: typeof sortBy) => {
    setSortBy(type);
    setMenuVisible(false);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
          TRACKS
        </ThemedText>
        <TouchableOpacity style={styles.iconButton} onPress={toggleMenu}>
          <Filter size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.searchContainer,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      >
        <Search size={18} color={colors.text} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search tracks..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredTracks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={true}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {loading ? (
              <View style={{ width: "100%" }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <TrackSkeleton key={i} />
                ))}
              </View>
            ) : (
              <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
                {searchQuery ? "No tracks match your search" : "No tracks yet"}
              </ThemedText>
            )}
          </View>
        }
      />

      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={toggleMenu}
      >
        <TouchableWithoutFeedback onPress={toggleMenu}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.menuContainer,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleSortChange("added-newest")}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      { color: colors.text },
                      sortBy !== "added-newest" && { opacity: 0.5 },
                    ]}
                  >
                    DATE ADDED (NEWEST)
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleSortChange("added-oldest")}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      { color: colors.text },
                      sortBy !== "added-oldest" && { opacity: 0.5 },
                    ]}
                  >
                    DATE ADDED (OLDEST)
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleSortChange("title")}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      { color: colors.text },
                      sortBy !== "title" && { opacity: 0.5 },
                    ]}
                  >
                    TITLE (A-Z)
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleSortChange("artist")}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      { color: colors.text },
                      sortBy !== "artist" && { opacity: 0.5 },
                    ]}
                  >
                    ARTIST (A-Z)
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleSortChange("album")}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      { color: colors.text },
                      sortBy !== "album" && { opacity: 0.5 },
                    ]}
                  >
                    ALBUM (A-Z)
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.phrase,
    fontFamily: Fonts.displayBold,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  iconButton: {
    // padding: Spacing.xs,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    borderWidth: Strokes.thin,
    borderRadius: Radii.input,
  },
  searchIcon: {
    marginRight: Spacing.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: "center",
  },
  emptyText: {
    marginTop: Spacing.sm,
    opacity: 0.6,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  menuContainer: {
    position: "absolute",
    top: 60,
    right: Spacing.xl,
    width: 200,
    borderWidth: Strokes.thin,
    padding: Spacing.xs,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  menuSeparator: {
    height: 1,
    marginVertical: Spacing.xs,
    marginHorizontal: Spacing.md,
  },
  menuText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
