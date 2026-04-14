import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, MoreVertical, Pause, Play } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import { RichBio } from "../../../components/rich-bio";
import {
  HeroSkeleton,
  Skeleton,
  TrackSkeleton,
} from "../../../components/skeleton-loader";
import { ThemedText } from "../../../components/themed-text";
import { TrackItem } from "../../../components/track-item";
import { Colors, Fonts, FontSizes, Spacing } from "../../../constants/theme";
import { useBottomPadding } from "../../../hooks/use-bottom-padding";
import { useColorScheme } from "../../../hooks/use-color-scheme";
import { useFavorites } from "../../../hooks/use-favorites";
import { usePlayer } from "../../../hooks/use-player";
import {
  Album,
  Artist,
  musicService,
  Track,
} from "../../../services/music-service";
import { showToast } from "../../../services/toast-store";

export default function ArtistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const bottomPadding = useBottomPadding();
  const [artist, setArtist] = useState<
    (Artist & { tracks: Track[]; albums: Album[]; eps?: Album[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { currentTrack, isPlaying, setQueue, togglePlayPause } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();

  const fetchArtistData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await musicService.getArtist(id as string);
      setArtist(data as any);
      if (data?.imageUrl) {
        // Dynamic theming could be implemented here if theme-context supported setting a temporary theme
      }
    } catch (error) {
      console.error("Failed to fetch artist data:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchArtistData();
    }
  }, [id, fetchArtistData]);

  const handleTrackPress = (track: Track) => {
    if (artist?.tracks) {
      setQueue(artist.tracks, artist.tracks.indexOf(track));
    }
  };

  const handlePlayButtonPress = () => {
    if (!artist || !artist.tracks || artist.tracks.length === 0) return;

    const isArtistPlaying =
      currentTrack && artist.tracks.some((t) => t.id === currentTrack.id);

    if (isArtistPlaying) {
      togglePlayPause();
    } else {
      setQueue(artist.tracks, 0);
    }
  };

  const toggleMenu = () => setMenuVisible(!menuVisible);

  const isArtistFavorite = artist ? isFavorite("artist", artist.id) : false;

  const handleLibraryAction = async () => {
    if (!artist) return;
    const isNowFavorite = await toggleFavorite("artist", artist);
    showToast(
      isNowFavorite ? "Added to library" : "Removed from library",
      isNowFavorite ? "success" : "info",
    );
    setMenuVisible(false);
  };

  const handleArtistMix = () => {
    // Artist mix logic - for now just play top tracks shuffled
    if (!artist || !artist.tracks || artist.tracks.length === 0) return;
    const shuffled = [...artist.tracks].sort(() => Math.random() - 0.5);
    setQueue(shuffled, 0);
    showToast(`Starting ${artist.name} Mix`, "success");
    setMenuVisible(false);
  };

  const handleDownloadDiscography = async () => {
    if (!artist || !artist.tracks || artist.tracks.length === 0) return;
    showToast(`Starting Discography Download`, "info");
    try {
      // In a real implementation, we would queue all tracks for download
      // For now, we'll just download the top tracks
      for (const track of artist.tracks.slice(0, 20)) {
        await musicService.downloadTrack(track);
      }
      showToast(`Discography Download Complete`, "success");
    } catch (error) {
      console.error("Failed to download discography:", error);
      showToast(`Discography Download Failed`, "error");
    }
    setMenuVisible(false);
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.header}>
          <Skeleton width={40} height={40} />
          <Skeleton width="40%" height={20} />
          <Skeleton width={40} height={40} />
        </View>
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <HeroSkeleton />
          <View style={styles.section}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TrackSkeleton key={i} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!artist) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ThemedText style={styles.emptyText}>Artist not found</ThemedText>
      </SafeAreaView>
    );
  }

  const isArtistPlaying =
    currentTrack &&
    artist.tracks?.some((t) => t.id === currentTrack.id) &&
    isPlaying;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
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
          {artist.name}
        </ThemedText>
        <TouchableOpacity onPress={toggleMenu} style={styles.iconButton}>
          <MoreVertical size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
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
                {!isArtistFavorite && (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={handleLibraryAction}
                  >
                    <ThemedText style={styles.menuText}>
                      ADD TO LIBRARY
                    </ThemedText>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleArtistMix}
                >
                  <ThemedText style={styles.menuText}>ARTIST MIX</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleDownloadDiscography}
                >
                  <ThemedText style={styles.menuText}>
                    DOWNLOAD DISCOGRAPHY
                  </ThemedText>
                </TouchableOpacity>

                {isArtistFavorite && (
                  <>
                    <View
                      style={[
                        styles.menuSeparator,
                        { backgroundColor: colors.border, opacity: 0.1 },
                      ]}
                    />
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={handleLibraryAction}
                    >
                      <ThemedText
                        style={[styles.menuText, { color: "#FF4B4B" }]}
                      >
                        REMOVE FROM LIBRARY
                      </ThemedText>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <View style={styles.hero}>
          <Image
            source={{
              uri: artist.imageUrl || "https://via.placeholder.com/300",
            }}
            style={styles.artistImage}
          />
          <View style={styles.heroOverlay}>
            <ThemedText type="title" style={styles.artistNameTitle}>
              {artist.name}
            </ThemedText>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[
                  styles.playButton,
                  { backgroundColor: isArtistPlaying ? "white" : "black" },
                ]}
                onPress={handlePlayButtonPress}
              >
                {isArtistPlaying ? (
                  <Pause size={20} color="black" fill="black" />
                ) : (
                  <Play size={20} color="white" fill="white" />
                )}
                <ThemedText
                  style={[
                    styles.playButtonText,
                    { color: isArtistPlaying ? "black" : "white" },
                  ]}
                >
                  {isArtistPlaying ? "Pause" : "Play"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Bio */}
        {artist.biography && (
          <View style={styles.bioSection}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Biography
            </ThemedText>
            <TouchableOpacity onPress={() => setBioExpanded(!bioExpanded)}>
              <RichBio
                text={artist.biography}
                numberOfLines={bioExpanded ? undefined : 3}
              />
              {!bioExpanded && artist.biography.length > 150 && (
                <ThemedText style={[styles.readMore, { color: colors.text }]}>
                  Read More
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Top Tracks */}
        {artist.tracks && artist.tracks.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Top Tracks
            </ThemedText>
            {artist.tracks.slice(0, 5).map((track, index) => (
              <TrackItem
                key={`${track.id}-${index}`}
                track={track}
                onPress={handleTrackPress}
                hideCover={false}
                showIndex={true}
                index={index + 1}
              />
            ))}
          </View>
        )}

        {/* Albums */}
        {artist.albums && artist.albums.length > 0 && (
          <View style={styles.albumSection}>
            <ThemedText
              type="subtitle"
              style={[styles.sectionTitle, { paddingHorizontal: Spacing.xl }]}
            >
              Albums
            </ThemedText>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={artist.albums}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.albumCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => router.push(`/album/${item.id}`)}
                >
                  <Image
                    source={{
                      uri: item.coverUrl || "https://via.placeholder.com/300",
                    }}
                    style={styles.albumCardImage}
                  />
                  <ThemedText
                    type="defaultSemiBold"
                    style={styles.albumCardTitle}
                    numberOfLines={1}
                  >
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    style={[styles.albumCardYear, { color: colors.icon }]}
                  >
                    {item.releaseDate?.split("-")[0]}
                  </ThemedText>
                </Pressable>
              )}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {/* EPs & Singles */}
        {artist.eps && artist.eps.length > 0 && (
          <View style={styles.albumSection}>
            <ThemedText
              type="subtitle"
              style={[styles.sectionTitle, { paddingHorizontal: Spacing.xl }]}
            >
              EPs & Singles
            </ThemedText>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={artist.eps}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.albumCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => router.push(`/album/${item.id}`)}
                >
                  <Image
                    source={{
                      uri: item.coverUrl || "https://via.placeholder.com/300",
                    }}
                    style={styles.albumCardImage}
                  />
                  <ThemedText
                    type="defaultSemiBold"
                    style={styles.albumCardTitle}
                    numberOfLines={1}
                  >
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    style={[styles.albumCardYear, { color: colors.icon }]}
                  >
                    {item.releaseDate?.split("-")[0]}
                  </ThemedText>
                </Pressable>
              )}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {/* Similar Artists */}
        {artist.similarArtists && artist.similarArtists.length > 0 && (
          <View style={styles.similarSection}>
            <ThemedText
              type="subtitle"
              style={[styles.sectionTitle, { paddingHorizontal: Spacing.xl }]}
            >
              Similar Artists
            </ThemedText>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={artist.similarArtists}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.similarArtistCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => router.push(`/artist/${item.id}`)}
                >
                  <Image
                    source={{
                      uri: item.imageUrl || "https://via.placeholder.com/300",
                    }}
                    style={styles.similarArtistImage}
                  />
                  <ThemedText
                    type="defaultSemiBold"
                    style={styles.similarArtistName}
                    numberOfLines={1}
                  >
                    {item.name}
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
    fontFamily: Fonts.semiBold,
    opacity: 0.6,
    flex: 1,
    textAlign: "center",
    marginHorizontal: Spacing.md,
  },
  iconButton: {},
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  menuContainer: {
    position: "absolute",
    top: 60,
    right: Spacing.xl,
    width: 200,
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
  hero: {
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  artistImage: {
    width: 260,
    height: 260,
    borderRadius: 130, // Circle for artists
    marginBottom: Spacing.xl,
  },
  heroOverlay: {
    alignItems: "center",
    width: "100%",
  },
  artistNameTitle: {
    fontSize: FontSizes.h2,
    textAlign: "center",
    marginBottom: Spacing.xl,
    fontFamily: Fonts.displayBold,
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
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: 0,
    minWidth: 160,
    borderWidth: 1,
    borderColor: "black",
  },
  playButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    marginLeft: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: FontSizes.phrase,
    marginBottom: Spacing.lg,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bioSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  bioText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    lineHeight: 24,
    opacity: 0.7,
  },
  readMore: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.small,
    marginTop: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  albumSection: {
    marginBottom: Spacing.xxl,
  },
  horizontalList: {
    paddingHorizontal: Spacing.xl,
  },
  albumCard: {
    width: 160,
    marginRight: Spacing.lg,
    padding: Spacing.sm,
    borderWidth: 1,
  },
  albumCardImage: {
    width: "100%",
    aspectRatio: 1,
    marginBottom: Spacing.sm,
  },
  albumCardTitle: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
  },
  albumCardYear: {
    fontSize: FontSizes.small,
    opacity: 0.5,
  },
  similarSection: {
    marginBottom: Spacing.xxl,
  },
  similarArtistCard: {
    width: 140,
    marginRight: Spacing.lg,
    alignItems: "center",
  },
  similarArtistImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: Spacing.sm,
  },
  similarArtistName: {
    fontSize: FontSizes.small,
    fontFamily: Fonts.semiBold,
    textAlign: "center",
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
});
