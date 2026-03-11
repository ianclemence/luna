import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronLeft,
  MoreVertical,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../../components/themed-text";
import { TrackItem } from "../../../components/track-item";
import {
  Colors,
  Fonts,
  FontSizes,
  Radii,
  Spacing,
  Strokes,
} from "../../../constants/theme";
import { useBottomPadding } from "../../../hooks/use-bottom-padding";
import { useColorScheme } from "../../../hooks/use-color-scheme";
import { useFavorites } from "../../../hooks/use-favorites";
import { usePlayer } from "../../../hooks/use-player";
import { musicService, Playlist, Track } from "../../../services/music-service";
import { storageService } from "../../../services/storage-service";

export default function PlaylistDetail() {
  const { id, from } = useLocalSearchParams<{
    id: string;
    from?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation<any>();
  const bottomPadding = useBottomPadding();
  const [playlist, setPlaylist] = useState<
    (Playlist & { tracks: Track[] }) | null
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
  const { isFavorite, toggleFavorite, favoriteTracks } = useFavorites();

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchingTracks, setSearchingTracks] = useState(false);

  useEffect(() => {
    if (id) {
      fetchPlaylistData();
      checkDownloadStatus();
    }
  }, [id]);

  useEffect(() => {
    let interval: any;
    if (downloadStatus === "downloading") {
      interval = setInterval(() => {
        checkDownloadStatus();
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [downloadStatus]);

  const checkDownloadStatus = async () => {
    const metadata = await storageService.getDownloadMetadata(id as string);
    if (metadata) {
      setDownloadStatus(metadata.status as any);
      setDownloadProgress(metadata.progress);
    }
  };

  const fetchPlaylistData = async () => {
    setLoading(true);
    try {
      const data = await musicService.getPlaylist(id as string);
      setPlaylist(data as any);
      if (data) {
        setPlaylistTitle(data.title);
        setPlaylistDescription(data.description || "");
        setSelectedTracks((data as any).tracks || []);
      }
    } catch (error) {
      console.error("Failed to fetch playlist data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (track: Track) => {
    if (playlist?.tracks) {
      setQueue(playlist.tracks, playlist.tracks.indexOf(track));
      const { tracks, ...playlistData } = playlist;
      storageService.addPlaylistToHistory(playlistData);
    }
  };

  const handlePlayButtonPress = () => {
    if (!playlist || playlist.tracks.length === 0) return;

    const isPlaylistPlaying =
      currentTrack && playlist.tracks.some((t) => t.id === currentTrack.id);

    if (isPlaylistPlaying) {
      togglePlayPause();
    } else {
      setQueue(playlist.tracks, 0);
      const { tracks, ...playlistData } = playlist;
      storageService.addPlaylistToHistory(playlistData);
    }
  };

  const handleDownloadAction = async () => {
    if (!playlist) return;
    setMenuVisible(false);

    if (downloadStatus === "completed") {
      await musicService.removeDownload(playlist.id);
      setDownloadStatus("none");
      setDownloadProgress(0);
    } else if (downloadStatus === "downloading") {
      await musicService.cancelDownload(playlist.id);
      setDownloadStatus("pending");
    } else {
      setDownloadStatus("downloading");
      try {
        await musicService.downloadPlaylist(playlist);
        setDownloadStatus("completed");
        setDownloadProgress(1);
      } catch (error) {
        setDownloadStatus("error");
        console.error("Failed to download playlist:", error);
      }
    }
  };

  const handleEditAction = () => {
    setMenuVisible(false);
    setEditModalVisible(true);
  };

  const handleDeleteAction = async () => {
    if (!playlist) return;
    const success = await storageService.deleteUserPlaylist(playlist.id);
    if (success) {
      setMenuVisible(false);
      setEditModalVisible(false);
      router.back();
    }
  };

  const handleSavePlaylist = async () => {
    if (!playlistTitle.trim() || !playlist) return;

    const updatedPlaylist: Playlist & { tracks: Track[] } = {
      ...playlist,
      title: playlistTitle,
      description: playlistDescription,
      trackCount: selectedTracks.length,
      tracks: selectedTracks,
      imageUrl: selectedTracks[0]?.album?.coverUrl || playlist.imageUrl,
    };

    const success = await storageService.saveUserPlaylist(updatedPlaylist);
    if (success) {
      setEditModalVisible(false);
      fetchPlaylistData();
    }
  };

  const searchTracks = async (query: string) => {
    setTrackSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchingTracks(true);
    try {
      const results = await musicService.searchTracks(query);
      setSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setSearchingTracks(false);
    }
  };

  const toggleTrackSelection = (track: Track) => {
    setSelectedTracks((prev) => {
      const exists = prev.find((t) => t.id === track.id);
      if (exists) {
        return prev.filter((t) => t.id !== track.id);
      } else {
        return [...prev, track];
      }
    });
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

  if (!playlist) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ThemedText>Playlist not found</ThemedText>
      </SafeAreaView>
    );
  }

  const isPlaylistPlaying =
    currentTrack &&
    playlist.tracks.some((t) => t.id === currentTrack.id) &&
    isPlaying;

  const isPlaylistFavorite = isFavorite("playlist", id as string);
  const isLocalPlaylist = id?.startsWith("local:");

  const handleLibraryAction = async () => {
    if (!playlist) return;
    const removing = isPlaylistFavorite;
    await toggleFavorite("playlist", playlist);
    if (removing) {
      try {
        await musicService.removeDownload(playlist.id);
      } catch {}
    }
    setMenuVisible(false);
  };

  const toggleMenu = () => {
    if (!menuVisible) {
      checkDownloadStatus();
    }
    setMenuVisible(!menuVisible);
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    if (from === "search") {
      router.replace("/search");
    } else {
      router.replace("/");
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={handleBack} style={styles.iconButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <ThemedText
          type="defaultSemiBold"
          style={styles.headerTitle}
          numberOfLines={1}
        >
          {playlist.title}
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
                {!isLocalPlaylist && (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={handleLibraryAction}
                  >
                    <ThemedText
                      style={[
                        styles.menuText,
                        isPlaylistFavorite && { color: colors.text },
                        !isPlaylistFavorite && { opacity: 0.5 },
                      ]}
                    >
                      {isPlaylistFavorite
                        ? "Remove from library"
                        : "Add to library"}
                    </ThemedText>
                  </TouchableOpacity>
                )}

                {isLocalPlaylist && (
                  <>
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={handleEditAction}
                    >
                      <ThemedText style={[styles.menuText, { opacity: 0.5 }]}>
                        Edit Playlist
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={handleDeleteAction}
                    >
                      <ThemedText
                        style={[
                          styles.menuText,
                          { color: "#FF4B4B", opacity: 0.8 },
                        ]}
                      >
                        Delete Playlist
                      </ThemedText>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleDownloadAction}
                >
                  <ThemedText
                    style={[
                      styles.menuText,
                      downloadStatus === "completed" && { color: colors.text },
                      downloadStatus === "none" && { opacity: 0.5 },
                    ]}
                  >
                    {downloadStatus === "completed"
                      ? "Remove Download"
                      : downloadStatus === "downloading"
                        ? `Cancel Download (${Math.round(downloadProgress * 100)}%)`
                        : downloadStatus === "pending"
                          ? "Resume Download"
                          : "Download"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Edit Playlist Modal */}
        <Modal
          visible={editModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}>
            <View style={styles.editModalOverlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.editModalContainer,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <ThemedText
                      type="defaultSemiBold"
                      style={styles.modalTitle}
                    >
                      EDIT PLAYLIST
                    </ThemedText>
                    <TouchableOpacity
                      onPress={() => setEditModalVisible(false)}
                    >
                      <X size={20} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    style={styles.modalContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <ThemedText style={styles.inputLabel}>TITLE</ThemedText>
                    <View
                      style={[
                        styles.modalInputContainer,
                        { borderColor: colors.border },
                      ]}
                    >
                      <TextInput
                        style={[styles.modalInput, { color: colors.text }]}
                        value={playlistTitle}
                        onChangeText={setPlaylistTitle}
                        placeholder="Playlist Name"
                        placeholderTextColor={colors.muted}
                      />
                    </View>

                    <ThemedText style={styles.inputLabel}>
                      DESCRIPTION
                    </ThemedText>
                    <View
                      style={[
                        styles.modalInputContainer,
                        styles.textAreaContainer,
                        { borderColor: colors.border },
                      ]}
                    >
                      <TextInput
                        style={[
                          styles.modalInput,
                          styles.textArea,
                          { color: colors.text },
                        ]}
                        value={playlistDescription}
                        onChangeText={setPlaylistDescription}
                        placeholder="Description (optional)"
                        placeholderTextColor={colors.muted}
                        multiline
                      />
                    </View>

                    <ThemedText style={styles.inputLabel}>
                      ADD TRACKS
                    </ThemedText>
                    <View
                      style={[
                        styles.trackSearchContainer,
                        {
                          backgroundColor: colors.secondary,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Search
                        size={16}
                        color={colors.text}
                        style={styles.searchIcon}
                      />
                      <TextInput
                        style={[
                          styles.trackSearchInput,
                          { color: colors.text },
                        ]}
                        placeholder="Search for tracks..."
                        placeholderTextColor={colors.muted}
                        value={trackSearchQuery}
                        onChangeText={searchTracks}
                      />
                    </View>

                    {searchingTracks && (
                      <ActivityIndicator
                        size="small"
                        color={colors.text}
                        style={{ marginVertical: Spacing.md }}
                      />
                    )}

                    <View style={styles.searchResults}>
                      {(searchResults.length > 0
                        ? searchResults
                        : favoriteTracks.slice(0, 5)
                      ).map((track) => (
                        <TouchableOpacity
                          key={track.id}
                          style={[
                            styles.trackSelectButton,
                            selectedTracks.find((t) => t.id === track.id) && {
                              backgroundColor: colors.secondary,
                            },
                          ]}
                          onPress={() => toggleTrackSelection(track)}
                        >
                          <View style={{ flex: 1 }}>
                            <ThemedText
                              style={styles.trackSelectTitle}
                              numberOfLines={1}
                            >
                              {track.title}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.trackSelectArtist,
                                { color: colors.icon },
                              ]}
                              numberOfLines={1}
                            >
                              {track.artist.name}
                            </ThemedText>
                          </View>
                          {selectedTracks.find((t) => t.id === track.id) && (
                            <Plus
                              size={16}
                              color={colors.text}
                              style={{ transform: [{ rotate: "45deg" }] }}
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>

                    {selectedTracks.length > 0 && (
                      <>
                        <ThemedText style={styles.inputLabel}>
                          SELECTED ({selectedTracks.length})
                        </ThemedText>
                        <View style={styles.selectedTracks}>
                          {selectedTracks.map((track) => (
                            <View
                              key={track.id}
                              style={[
                                styles.selectedTrackItem,
                                { backgroundColor: colors.secondary },
                              ]}
                            >
                              <ThemedText
                                style={styles.selectedTrackText}
                                numberOfLines={1}
                              >
                                {track.title}
                              </ThemedText>
                              <TouchableOpacity
                                onPress={() => toggleTrackSelection(track)}
                              >
                                <X size={14} color={colors.text} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[
                        styles.saveButton,
                        { backgroundColor: colors.text },
                        !playlistTitle.trim() && { opacity: 0.5 },
                      ]}
                      onPress={handleSavePlaylist}
                      disabled={!playlistTitle.trim()}
                    >
                      <ThemedText
                        style={[
                          styles.saveButtonText,
                          { color: colors.background },
                        ]}
                      >
                        SAVE CHANGES
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Hero Section */}
        <View style={styles.hero}>
          {playlist.imageUrl || playlist.coverUrl ? (
            <Image
              source={{ uri: playlist.imageUrl || playlist.coverUrl }}
              style={styles.playlistImage}
            />
          ) : (
            <View
              style={[
                styles.playlistImage,
                {
                  backgroundColor: colors.secondary,
                  justifyContent: "center",
                  alignItems: "center",
                },
              ]}
            >
              <Music size={64} color={colors.icon} />
            </View>
          )}
          <View style={styles.heroOverlay}>
            <ThemedText type="title" style={styles.playlistTitle}>
              {playlist.title}
            </ThemedText>
            {playlist.description && (
              <ThemedText
                style={[styles.description, { color: colors.icon }]}
                numberOfLines={2}
              >
                {playlist.description}
              </ThemedText>
            )}
            <ThemedText style={[styles.playlistMeta, { color: colors.icon }]}>
              {playlist.trackCount} tracks
            </ThemedText>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[
                  styles.playButton,
                  { backgroundColor: isPlaylistPlaying ? "white" : "black" },
                ]}
                onPress={handlePlayButtonPress}
              >
                {isPlaylistPlaying ? (
                  <Pause size="20" color="black" fill="black" />
                ) : (
                  <Play size="20" color="white" fill="white" />
                )}
                <ThemedText
                  style={[
                    styles.playButtonText,
                    { color: isPlaylistPlaying ? "black" : "white" },
                  ]}
                >
                  {isPlaylistPlaying ? "Pause" : "Play"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Track List */}
        <View style={styles.trackList}>
          {playlist.tracks.map((track, index) => (
            <TrackItem
              key={`${track.id}-${index}-${playlist.id}`}
              track={track}
              onPress={handleTrackPress}
              hideCover={true}
              showIndex={true}
              index={index}
            />
          ))}
        </View>
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
  editModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  editModalContainer: {
    width: "100%",
    maxHeight: "80%",
    borderWidth: Strokes.thin,
    padding: Spacing.xl,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    borderRadius: Radii.modal,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontSize: FontSizes.phrase,
    fontFamily: Fonts.displayBold,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  modalContent: {
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    opacity: 0.6,
  },
  modalInputContainer: {
    borderWidth: Strokes.hairline,
    marginBottom: Spacing.lg,
  },
  textAreaContainer: {
    height: 80,
  },
  modalInput: {
    padding: Spacing.md,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    flex: 1,
  },
  textArea: {
    textAlignVertical: "top",
  },
  trackSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 40,
    borderWidth: Strokes.hairline,
    marginBottom: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
    opacity: 0.6,
  },
  trackSearchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.small,
  },
  searchResults: {
    marginBottom: Spacing.lg,
  },
  trackSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginBottom: 2,
  },
  trackSelectTitle: {
    fontSize: FontSizes.small,
    fontFamily: Fonts.medium,
  },
  trackSelectArtist: {
    fontSize: 10,
    opacity: 0.7,
  },
  selectedTracks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  selectedTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    maxWidth: 150,
  },
  selectedTrackText: {
    fontSize: 10,
    marginRight: 4,
  },
  modalActions: {
    gap: Spacing.md,
  },
  saveButton: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  saveButtonText: {
    fontFamily: Fonts.bold,
    letterSpacing: 2,
  },
  hero: {
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  playlistImage: {
    width: 260,
    height: 260,
    borderRadius: 0,
    marginBottom: Spacing.xl,
  },
  heroOverlay: {
    alignItems: "center",
    width: "100%",
  },
  playlistTitle: {
    fontSize: FontSizes.h2,
    textAlign: "center",
    marginBottom: Spacing.sm,
    fontFamily: Fonts.displayBold,
  },
  description: {
    fontSize: FontSizes.body,
    textAlign: "center",
    marginBottom: Spacing.m,
    paddingHorizontal: Spacing.m,
    fontFamily: Fonts.regular,
    opacity: 0.7,
  },
  playlistMeta: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.xl,
    fontFamily: Fonts.regular,
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
  trackList: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  scrollContent: {
    // paddingBottom is now dynamic via useBottomPadding
  },
});
