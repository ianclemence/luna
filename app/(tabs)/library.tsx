import { useRouter } from "expo-router";
import { Disc, Filter, Heart, ListMusic, Users } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TrackItem } from "../../components/track-item";
import { Skeleton } from "../../components/skeleton-loader";
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
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadUserPlaylists = async () => {
      const playlists = await storageService.getUserPlaylists();
      if (mounted) setUserPlaylists(playlists);
    };
    loadUserPlaylists();
    const unsubscribe = storageService.subscribeToUserPlaylists(
      (playlists) => {
        setUserPlaylists(playlists);
      },
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [sortBy, setSortBy] = useState<"recent" | "title" | "artist">("recent");
  const [menuVisible, setMenuVisible] = useState(false);

  const loadRecentTracks = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const history = await storageService.getHistory();
      setRecentTracks(history);
    } catch (error) {
      console.error("Failed to load recent tracks:", error);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecentTracks();

    const unsubscribe = storageService.subscribeToHistory((history) => {
      setRecentTracks(history);
    });

    return unsubscribe;
  }, [loadRecentTracks]);

  const sortedRecentTracks = useMemo(() => {
    const tracks = [...recentTracks];
    if (sortBy === "recent") return tracks.slice(0, 10);

    const sorted = tracks.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "artist")
        return a.artist.name.localeCompare(b.artist.name);
      return 0;
    });
    return sorted;
  }, [recentTracks, sortBy]);

  const handleTrackPress = (track: Track) => {
    setQueue(recentTracks, recentTracks.indexOf(track));
  };

  const handleClearHistory = async () => {
    await storageService.clearHistory();
    setRecentTracks([]);
  };

  const libraryItems = [
    {
      title: "Tracks",
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
      title: "Artists",
      icon: Users,
      count: favoriteArtists.length,
      path: "/library/artists",
    },
    {
      title: "Playlists",
      icon: ListMusic,
      count: favoritePlaylists.length + userPlaylists.length,
      path: "/library/playlists",
    },
  ];
  // State for menu positioning
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: Spacing.xl });
  const filterRef = React.useRef<any>(null);

  const handleOpenMenu = () => {
    // Get the position of the filter button
    filterRef.current?.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
      setMenuPosition({
        top: pageY + height + Spacing.xs,
        right: Spacing.xl,
      });
      setMenuVisible(true);
    });
  };

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
        showsVerticalScrollIndicator={false}
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
                <Skeleton width={30} height={12} style={{ marginTop: Spacing.xs }} />
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
            <View style={{ flexDirection: "row", gap: Spacing.lg }}>
              <TouchableOpacity ref={filterRef} onPress={handleOpenMenu} hitSlop={10}>
                <Filter
                  size={18}
                  color={sortBy === "recent" ? colors.icon : colors.text}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sort Menu Modal */}
          <Modal
            visible={menuVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setMenuVisible(false)}
          >
            <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
              <View style={styles.modalOverlay}>
                <View
                  style={[
                    styles.menuContainer,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      top: menuPosition.top,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setSortBy("recent");
                      setMenuVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.menuText,
                        { color: colors.text },
                        sortBy !== "recent" && { opacity: 0.5 },
                      ]}
                    >
                      RECENT
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setSortBy("title");
                      setMenuVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.menuText,
                        { color: colors.text },
                        sortBy !== "title" && { opacity: 0.5 },
                      ]}
                    >
                      TITLE (A-Z)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setSortBy("artist");
                      setMenuVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.menuText,
                        { color: colors.text },
                        sortBy !== "artist" && { opacity: 0.5 },
                      ]}
                    >
                      ARTIST (A-Z)
                    </Text>
                  </TouchableOpacity>
                  
                  {recentTracks.length > 0 && (
                    <>
                      <View style={[styles.menuSeparator, { backgroundColor: colors.border, opacity: 0.1 }]} />
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                          handleClearHistory();
                          setMenuVisible(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.menuText,
                            { color: "#FF4B4B" },
                          ]}
                        >
                          CLEAR HISTORY
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

          {loadingRecent ? (
            <View style={styles.recentList}>
              {[...Array(5)].map((_, i) => (
                <View key={`skeleton-${i}`} style={{ paddingVertical: 12 }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Skeleton width={48} height={48} borderRadius={4} />
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Skeleton width="60%" height={14} style={{ marginBottom: 8 }} />
                        <Skeleton width="40%" height={10} />
                      </View>
                   </View>
                </View>
              ))}
            </View>
          ) : sortedRecentTracks.length > 0 ? (
            <View style={styles.recentList}>
              {sortedRecentTracks.map((track, index) => (
                <TrackItem
                  key={`recent-${track.id}-${index}-${sortBy}`}
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
    fontFamily: Fonts.regular,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  menuContainer: {
    position: "absolute",
    top: 300,
    right: Spacing.xl,
    width: 180,
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
    fontSize: 12,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
  menuSeparator: {
    height: 1,
    marginVertical: Spacing.xs,
    marginHorizontal: Spacing.md,
  },
});
