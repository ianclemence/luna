import { useRouter } from "expo-router";
import { ChevronLeft, Filter, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../components/themed-text";
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
import { Album } from "../../services/music-service";

export default function LikedAlbums() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const bottomPadding = useBottomPadding();
  const { favoriteAlbums, loading } = useFavorites();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "added-newest" | "added-oldest" | "title" | "artist"
  >("added-newest");
  const [menuVisible, setMenuVisible] = useState(false);

  const filteredAlbums = useMemo(() => {
    let result = favoriteAlbums.filter(
      (album) =>
        album.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        album.artist.name.toLowerCase().includes(searchQuery.toLowerCase()),
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
        default:
          return 0;
      }
    });

    return result;
  }, [favoriteAlbums, searchQuery, sortBy]);

  const handleAlbumPress = (album: Album) => {
    router.push({
      pathname: "/album/[id]",
      params: { id: album.id },
    });
  };

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
          ALBUMS
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
          placeholder="Search albums..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredAlbums}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.albumCard,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
            onPress={() => handleAlbumPress(item)}
          >
            <Image source={{ uri: item.coverUrl }} style={styles.albumImage} />
            <ThemedText
              type="defaultSemiBold"
              style={styles.albumTitle}
              numberOfLines={1}
            >
              {item.title}
            </ThemedText>
            <ThemedText
              style={[styles.albumArtist, { color: colors.icon }]}
              numberOfLines={1}
            >
              {item.artist.name}
            </ThemedText>
          </Pressable>
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
                {searchQuery
                  ? "No albums match your search"
                  : "No liked albums yet"}
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
                    sortBy === "added-newest" && { color: colors.text },
                    sortBy !== "added-newest" && { opacity: 0.5 },
                  ]}
                >
                  Date Added (Newest)
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleSortChange("added-oldest")}
              >
                <ThemedText
                  style={[
                    styles.menuText,
                    sortBy === "added-oldest" && { color: colors.text },
                    sortBy !== "added-oldest" && { opacity: 0.5 },
                  ]}
                >
                  Date Added (Oldest)
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleSortChange("title")}
              >
                <ThemedText
                  style={[
                    styles.menuText,
                    sortBy === "title" && { color: colors.text },
                    sortBy !== "title" && { opacity: 0.5 },
                  ]}
                >
                  Title (A-Z)
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleSortChange("artist")}
              >
                <ThemedText
                  style={[
                    styles.menuText,
                    sortBy === "artist" && { color: colors.text },
                    sortBy !== "artist" && { opacity: 0.5 },
                  ]}
                >
                  Artist (A-Z)
                </ThemedText>
              </TouchableOpacity>
            </View>
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
  columnWrapper: {
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  albumCard: {
    flex: 1,
    marginBottom: Spacing.lg,
    borderRadius: 0,
    borderWidth: Strokes.hairline,
    padding: Spacing.md,
  },
  albumImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 0,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  albumTitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    fontFamily: "Inter_500Medium",
  },
  albumArtist: {
    fontSize: FontSizes.small,
    marginTop: 4,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    fontFamily: "Inter_400Regular",
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
  menuText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  menuDivider: {
    height: Strokes.hairline,
    opacity: 0.2,
    marginHorizontal: Spacing.md,
  },
});
