import { useRouter } from "expo-router";
import { ChevronLeft, Filter, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
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
import { GridSkeleton } from "../../components/skeleton-loader";
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
import { Artist } from "../../services/music-service";

export default function LikedArtists() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const bottomPadding = useBottomPadding();
  const { favoriteArtists, loading } = useFavorites();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "added-newest">("name");
  const [menuVisible, setMenuVisible] = useState(false);

  const filteredArtists = useMemo(() => {
    let result = favoriteArtists.filter((artist) =>
      artist.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    // Apply sorting
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "added-newest":
          return (b.addedAt || 0) - (a.addedAt || 0);
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        default:
          return 0;
      }
    });

    return result;
  }, [favoriteArtists, searchQuery, sortBy]);

  const handleArtistPress = (artist: Artist) => {
    router.push(`/artist/${artist.id}`);
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
          ARTISTS
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
          placeholder="Search artists..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredArtists}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <Pressable
            style={styles.artistCard}
            onPress={() => handleArtistPress(item)}
          >
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.artistImage}
              />
            </View>
            <ThemedText
              type="defaultSemiBold"
              style={styles.artistName}
              numberOfLines={1}
            >
              {item.name}
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
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                {[1, 2, 3, 4].map((i) => (
                  <GridSkeleton key={i} />
                ))}
              </View>
            ) : (
              <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
                {searchQuery
                  ? "No artists match your search"
                  : "No liked artists yet"}
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
                onPress={() => handleSortChange("name")}
              >
                <ThemedText
                  style={[
                    styles.menuText,
                    sortBy === "name" && { color: colors.text },
                    sortBy !== "name" && { opacity: 0.5 },
                  ]}
                >
                  Name (A-Z)
                </ThemedText>
              </TouchableOpacity>
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
  artistCard: {
    flex: 1,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 1000, // Large value to ensure circle
    overflow: "hidden",
    backgroundColor: "#000",
  },
  artistImage: {
    width: "100%",
    height: "100%",
  },
  artistName: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  emptyContainer: {
    paddingVertical: 100,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
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
  menuText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
