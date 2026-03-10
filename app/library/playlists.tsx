import { useRouter } from "expo-router";
import { ChevronLeft, Music, Plus, Search, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { musicService, Playlist, Track } from "../../services/music-service";
import { storageService } from "../../services/storage-service";

export default function LikedPlaylists() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const bottomPadding = useBottomPadding();
  const {
    favoritePlaylists,
    favoriteTracks,
    loading: favoritesLoading,
  } = useFavorites();
  const [searchQuery, setSearchQuery] = useState("");
  const [userPlaylists, setUserPlaylists] = useState<
    (Playlist & { tracks: Track[] })[]
  >([]);
  const [loadingUserPlaylists, setLoadingUserPlaylists] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<
    (Playlist & { tracks: Track[] }) | null
  >(null);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchingTracks, setSearchingTracks] = useState(false);

  useEffect(() => {
    loadUserPlaylists();
  }, []);

  const loadUserPlaylists = async () => {
    setLoadingUserPlaylists(true);
    const playlists = await storageService.getUserPlaylists();
    setUserPlaylists(playlists);
    setLoadingUserPlaylists(false);
  };

  const allPlaylists = useMemo(() => {
    const combined = [...userPlaylists, ...favoritePlaylists];
    return combined.filter(
      (playlist, index, self) =>
        index === self.findIndex((p) => p.id === playlist.id),
    );
  }, [userPlaylists, favoritePlaylists]);

  const filteredPlaylists = useMemo(() => {
    return allPlaylists.filter((playlist) =>
      playlist.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [allPlaylists, searchQuery]);

  const handlePlaylistPress = (playlist: any) => {
    router.push({
      pathname: "/playlist/[id]",
      params: { id: playlist.id },
    });
  };

  const openCreateModal = () => {
    setEditingPlaylist(null);
    setPlaylistTitle("");
    setPlaylistDescription("");
    setSelectedTracks([]);
    setModalVisible(true);
  };

  const handleSavePlaylist = async () => {
    if (!playlistTitle.trim()) return;

    const newPlaylist: Playlist & { tracks: Track[] } = {
      id: editingPlaylist?.id || `local:${Date.now()}`,
      title: playlistTitle,
      description: playlistDescription,
      provider: "tidal", // Default or local
      trackCount: selectedTracks.length,
      tracks: selectedTracks,
      imageUrl: selectedTracks[0]?.album?.coverUrl,
    };

    const success = await storageService.saveUserPlaylist(newPlaylist);
    if (success) {
      setModalVisible(false);
      loadUserPlaylists();
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
          PLAYLISTS
        </ThemedText>
        <TouchableOpacity style={styles.iconButton} onPress={openCreateModal}>
          <Plus size={24} color={colors.text} />
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
          placeholder="Search playlists..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredPlaylists}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.playlistCard,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
            onPress={() => handlePlaylistPress(item)}
          >
            <View
              style={[
                styles.playlistImageContainer,
                { backgroundColor: colors.secondary },
              ]}
            >
              {item.imageUrl || item.coverUrl ? (
                <Image
                  source={{ uri: item.imageUrl || item.coverUrl }}
                  style={styles.playlistImage}
                />
              ) : (
                <Music size={32} color={colors.icon} />
              )}
            </View>
            <ThemedText
              type="defaultSemiBold"
              style={styles.playlistTitle}
              numberOfLines={1}
            >
              {item.title}
            </ThemedText>
            <ThemedText
              style={[styles.playlistSubtitle, { color: colors.icon }]}
            >
              {item.trackCount} tracks
            </ThemedText>
          </TouchableOpacity>
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {favoritesLoading || loadingUserPlaylists ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
                {searchQuery
                  ? "No playlists match your search"
                  : "No playlists yet"}
              </ThemedText>
            )}
          </View>
        }
      />

      {/* Create Playlist Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalContainer,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.modalHeader}>
                  <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
                    {editingPlaylist ? "EDIT PLAYLIST" : "NEW PLAYLIST"}
                  </ThemedText>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <X size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.modalContent}
                  showsVerticalScrollIndicator={false}
                >
                  <ThemedText style={styles.inputLabel}>TITLE</ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      { color: colors.text, borderColor: colors.border },
                    ]}
                    value={playlistTitle}
                    onChangeText={setPlaylistTitle}
                    placeholder="Playlist Name"
                    placeholderTextColor={colors.muted}
                  />

                  <ThemedText style={styles.inputLabel}>DESCRIPTION</ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      styles.textArea,
                      { color: colors.text, borderColor: colors.border },
                    ]}
                    value={playlistDescription}
                    onChangeText={setPlaylistDescription}
                    placeholder="Description (optional)"
                    placeholderTextColor={colors.muted}
                    multiline
                  />

                  <ThemedText style={styles.inputLabel}>ADD TRACKS</ThemedText>
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
                      style={[styles.trackSearchInput, { color: colors.text }]}
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
                    {editingPlaylist ? "SAVE CHANGES" : "SAVE PLAYLIST"}
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
  columnWrapper: {
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  playlistCard: {
    flex: 1,
    marginBottom: Spacing.lg,
    borderRadius: 0,
    borderWidth: Strokes.hairline,
    padding: Spacing.md,
  },
  playlistImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 0,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  playlistImage: {
    width: "100%",
    height: "100%",
  },
  playlistTitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
    fontFamily: "Inter_500Medium",
  },
  playlistSubtitle: {
    fontSize: FontSizes.small,
    marginTop: 4,
    opacity: 0.5,
    fontFamily: Fonts.regular,
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContainer: {
    width: "100%",
    maxHeight: "80%",
    borderWidth: Strokes.thin,
    padding: Spacing.xl,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
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
  modalInput: {
    borderWidth: Strokes.hairline,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    width: "100%",
  },
  textArea: {
    height: 80,
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
  saveButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  saveButtonText: {
    fontFamily: Fonts.bold,
    letterSpacing: 2,
  },
});
