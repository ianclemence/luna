import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, MoreVertical, Pause, Play } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../../components/themed-text";
import { TrackItem } from "../../../components/track-item";
import { Colors, FontSizes, Spacing, Strokes } from "../../../constants/theme";
import { useBottomPadding } from "../../../hooks/use-bottom-padding";
import { useColorScheme } from "../../../hooks/use-color-scheme";
import { useFavorites } from "../../../hooks/use-favorites";
import { usePlayer } from "../../../hooks/use-player";
import { Album, musicService, Track } from "../../../services/music-service";
import { storageService } from "../../../services/storage-service";

export default function AlbumDetail() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();
  const router = useRouter();
  const bottomPadding = useBottomPadding();
  const [album, setAlbum] = useState<
    (Album & { tracks: Track[]; similarAlbums?: Album[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<
    "none" | "downloading" | "completed" | "error"
  >("none");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { currentTrack, isPlaying, setQueue, togglePlayPause } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();

  useEffect(() => {
    if (id) {
      fetchAlbumData();
      checkDownloadStatus();
    }
  }, [id]);

  const checkDownloadStatus = async () => {
    const metadata = await storageService.getDownloadMetadata(id as string);
    if (metadata) {
      setDownloadStatus(metadata.status as any);
      setDownloadProgress(metadata.progress);
    }
  };

  const fetchAlbumData = async () => {
    setLoading(true);
    try {
      const data = await musicService.getAlbum(id as string);
      setAlbum(data as any);
    } catch (error) {
      console.error("Failed to fetch album data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    if (album?.tracks) {
      setQueue(album.tracks, album.tracks.indexOf(track));
      const { tracks, similarAlbums, ...albumData } = album;
      storageService.addAlbumToHistory(albumData);
    }
  };

  const handlePlayButtonPress = () => {
    if (!album || album.tracks.length === 0) return;

    const isAlbumPlaying =
      currentTrack && album.tracks.some((t) => t.id === currentTrack.id);

    if (isAlbumPlaying) {
      togglePlayPause();
    } else {
      setQueue(album.tracks, 0);
      const { tracks, similarAlbums, ...albumData } = album;
      storageService.addAlbumToHistory(albumData);
    }
  };

  const handleToggleFavorite = async () => {
    if (album) {
      const { tracks, ...albumData } = album;
      await toggleFavorite("album", albumData);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.text} />
      </SafeAreaView>
    );
  }

  if (!album) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ThemedText>Album not found</ThemedText>
      </SafeAreaView>
    );
  }

  const isAlbumFavorite = isFavorite("album", album.id);
  const isAlbumPlaying =
    currentTrack &&
    album.tracks.some((t) => t.id === currentTrack.id) &&
    isPlaying;

  const handleLibraryAction = async () => {
    await toggleFavorite("album", album);
    setMenuVisible(false);
  };

  const handleDownloadAction = async () => {
    if (!album) return;
    setMenuVisible(false);

    if (downloadStatus === "completed") {
      await musicService.removeDownload(album.id);
      setDownloadStatus("none");
      setDownloadProgress(0);
    } else {
      setDownloadStatus("downloading");
      try {
        await musicService.downloadAlbum(album);
        setDownloadStatus("completed");
        setDownloadProgress(1);
      } catch (error) {
        setDownloadStatus("error");
        console.error("Failed to download album:", error);
      }
    }
  };

  const toggleMenu = () => {
    if (!menuVisible) {
      checkDownloadStatus();
    }
    setMenuVisible(!menuVisible);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <ThemedText
          type="defaultSemiBold"
          style={styles.headerTitle}
          numberOfLines={1}
        >
          {album.title}
        </ThemedText>
        <TouchableOpacity onPress={toggleMenu} style={styles.iconButton}>
          <MoreVertical size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPadding },
        ]}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
      >
        {/* Dropdown Menu Modal */}
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
                  onPress={handleLibraryAction}
                >
                  <ThemedText style={styles.menuText}>
                    {isAlbumFavorite ? "Remove from library" : "Add to library"}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleDownloadAction}
                >
                  <ThemedText style={styles.menuText}>
                    {downloadStatus === "completed"
                      ? "Remove Download"
                      : downloadStatus === "downloading"
                        ? `Downloading (${Math.round(downloadProgress * 100)}%)`
                        : "Download"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Hero Section */}
        <View style={styles.hero}>
          <Image
            source={{
              uri: album.coverUrl || "https://via.placeholder.com/300",
            }}
            style={styles.albumImage}
          />
          <View style={styles.heroOverlay}>
            <ThemedText type="title" style={styles.albumTitle}>
              {album.title}
            </ThemedText>
            <ThemedText style={[styles.artistName, { color: colors.primary }]}>
              {album.artist.name}
            </ThemedText>
            <ThemedText style={[styles.albumMeta, { color: colors.icon }]}>
              {album.releaseDate?.split("-")[0]} • {album.tracks.length} tracks
            </ThemedText>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[
                  styles.playButton,
                  { backgroundColor: isAlbumPlaying ? "white" : "black" },
                ]}
                onPress={handlePlayButtonPress}
              >
                {isAlbumPlaying ? (
                  <Pause size={20} color="black" fill="black" />
                ) : (
                  <Play size={20} color="white" fill="white" />
                )}
                <ThemedText
                  style={[
                    styles.playButtonText,
                    { color: isAlbumPlaying ? "black" : "white" },
                  ]}
                >
                  {isAlbumPlaying ? "Pause" : "Play"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Track List */}
        <View style={styles.section}>
          {album.tracks.map((track, index) => (
            <TrackItem
              key={`${track.id}-${index}-${album.id}`}
              track={track}
              onPress={handleTrackPress}
              hideCover={true}
              showIndex={true}
              index={index}
            />
          ))}
        </View>

        {/* Similar Albums */}
        {album.similarAlbums && album.similarAlbums.length > 0 && (
          <View style={styles.similarSection}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Similar Albums
            </ThemedText>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={album.similarAlbums}
              keyExtractor={(item, index) =>
                `similar-${item.id}-${index}-${album.id}`
              }
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.similarAlbumCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/album/[id]",
                      params: { id: item.id },
                    })
                  }
                >
                  <Image
                    source={{
                      uri: item.coverUrl || "https://via.placeholder.com/300",
                    }}
                    style={styles.similarAlbumImage}
                  />
                  <ThemedText
                    type="defaultSemiBold"
                    style={styles.similarAlbumTitle}
                    numberOfLines={1}
                  >
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    style={[styles.similarAlbumArtist, { color: colors.icon }]}
                    numberOfLines={1}
                  >
                    {item.artist.name}
                  </ThemedText>
                </Pressable>
              )}
              contentContainerStyle={styles.horizontalList}
            />
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: FontSizes.caption,
    textTransform: "uppercase",
    letterSpacing: 3,
    fontFamily: "Inter_600SemiBold",
    opacity: 0.6,
    flex: 1,
    textAlign: "center",
    marginHorizontal: Spacing.md,
  },
  iconButton: {
    // padding: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  menuContainer: {
    position: "absolute",
    top: 60,
    right: Spacing.xl,
    width: 180,
    borderWidth: 1,
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
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  menuDivider: {
    height: 1,
    opacity: 0.2,
    marginHorizontal: Spacing.md,
  },
  hero: {
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  albumImage: {
    width: 260,
    height: 260,
    borderRadius: 0,
    marginBottom: Spacing.xl,
  },
  heroOverlay: {
    alignItems: "center",
    width: "100%",
  },
  albumTitle: {
    fontSize: FontSizes.h2,
    textAlign: "center",
    marginBottom: Spacing.sm,
    fontFamily: "PlayfairDisplay_700Bold",
  },
  artistName: {
    fontSize: FontSizes.body,
    fontFamily: "Inter_600SemiBold",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  albumMeta: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.xl,
    fontFamily: "Inter_400Regular",
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "center",
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "black",
  },
  playButtonText: {
    color: "white",
    fontSize: FontSizes.button,
    fontFamily: "Inter_600SemiBold",
    marginLeft: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  similarSection: {
    paddingVertical: Spacing.xl,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: FontSizes.caption,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontFamily: "Inter_600SemiBold",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    opacity: 0.6,
  },
  horizontalList: {
    paddingHorizontal: Spacing.xl,
  },
  scrollContent: {
    // paddingBottom is now dynamic via useBottomPadding
  },
  similarAlbumCard: {
    width: 180,
    marginRight: Spacing.md,
    borderRadius: 0,
    borderWidth: Strokes.hairline,
    padding: Spacing.md,
  },
  similarAlbumImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 0,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  similarAlbumTitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    fontFamily: "Inter_500Medium",
  },
  similarAlbumArtist: {
    fontSize: FontSizes.small,
    marginTop: 4,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
