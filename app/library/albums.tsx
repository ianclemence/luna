import { useRouter } from "expo-router";
import { ChevronLeft, Filter, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
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
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { Album } from "../../services/music-service";

export default function LikedAlbums() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { favoriteAlbums } = useFavorites();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAlbums = useMemo(() => {
    return favoriteAlbums.filter(
      (album) =>
        album.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        album.artist.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [favoriteAlbums, searchQuery]);

  const handleAlbumPress = (album: Album) => {
    router.push({
      pathname: "/album/[id]",
      params: { id: album.id },
    });
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
        <TouchableOpacity style={styles.iconButton}>
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
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.albumCard}
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
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={{ color: colors.icon }}>
              {searchQuery
                ? "No albums match your search"
                : "No liked albums yet"}
            </ThemedText>
          </View>
        }
      />
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
    padding: Spacing.xs,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    borderWidth: Strokes.thin,
    borderStyle: "dashed",
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
  },
  albumImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: Radii.card,
    borderWidth: Strokes.hairline,
    borderColor: "rgba(0,0,0,0.1)",
  },
  albumTitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.sm,
    fontFamily: Fonts.bold,
  },
  albumArtist: {
    fontSize: FontSizes.small,
    marginTop: 2,
    opacity: 0.7,
    fontFamily: Fonts.regular,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: "center",
  },
});
