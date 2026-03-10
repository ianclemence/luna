import { useRouter } from "expo-router";
import { Disc, Heart, ListMusic } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    loading,
  } = useFavorites();

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
          {libraryItems.map((item, index) => (
            <Pressable
              key={index}
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
              {loading ? (
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Recently Played
          </Text>
          <View
            style={[
              styles.placeholder,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={{ color: colors.icon, fontFamily: Fonts.regular }}>
                Your recently played music will appear here
              </Text>
            )}
          </View>
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
    borderStyle: "dashed",
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
    marginBottom: Spacing.lg,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  placeholder: {
    height: 150,
    borderRadius: Radii.card,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    opacity: 0.8,
  },
});
