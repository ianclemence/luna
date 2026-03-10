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
import { Artist } from "../../services/music-service";

export default function LikedArtists() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { favoriteArtists } = useFavorites();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredArtists = useMemo(() => {
    return favoriteArtists.filter((artist) =>
      artist.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [favoriteArtists, searchQuery]);

  const handleArtistPress = (artist: Artist) => {
    router.push({
      pathname: "/artist/[id]",
      params: { id: artist.id },
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
          ARTISTS
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
          placeholder="Search artists..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredArtists}
        numColumns={3}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <Pressable
            style={styles.artistCard}
            onPress={() => handleArtistPress(item)}
          >
            <Image
              source={{
                uri: item.imageUrl || "https://via.placeholder.com/150",
              }}
              style={styles.artistImage}
            />
            <ThemedText
              type="defaultSemiBold"
              style={styles.artistName}
              numberOfLines={1}
            >
              {item.name}
            </ThemedText>
          </Pressable>
        )}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={{ color: colors.icon }}>
              {searchQuery
                ? "No artists match your search"
                : "No liked artists yet"}
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
    justifyContent: "flex-start",
    gap: Spacing.md,
  },
  artistCard: {
    width: "30%",
    marginBottom: Spacing.lg,
    alignItems: "center",
  },
  artistImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 0,
    borderWidth: Strokes.hairline,
    borderColor: "rgba(0,0,0,0.1)",
  },
  artistName: {
    fontSize: FontSizes.small,
    marginTop: Spacing.sm,
    textAlign: "center",
    fontFamily: Fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: "center",
  },
});
