import { Image } from "expo-image";
import {
  Check,
  Disc,
  Download,
  Heart,
  ListMusic,
  Music,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "../../components/themed-text";
import { Fonts, Palette, Radii, Spacing } from "../../constants/theme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { musicService } from "../../services/music-service";
import { storageService } from "../../services/storage-service";
import { showToast } from "../../services/toast-store";

const POOLSUITE_COLORS = {
  bg: "#F5E6D3",
  windowBg: "#FDFCF0",
  black: "#000000",
  blue: "#99CCFF",
  pink: "#FFB6C1",
  headerCream: "#FEF9F3",
};

export default function Home() {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    position,
    duration,
    setQueue,
  } = usePlayer();

  const {
    isFavorite,
    toggleFavorite,
    favoriteTracks,
    favoriteAlbums,
    favoriteArtists,
    favoritePlaylists,
  } = useFavorites();

  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);

  useEffect(() => {
    const loadUserPlaylists = async () => {
      const playlists = await storageService.getUserPlaylists();
      setUserPlaylists(playlists);
    };
    loadUserPlaylists();
    return storageService.subscribeToUserPlaylists(setUserPlaylists);
  }, []);

  const favorited = currentTrack ? isFavorite("track", currentTrack.id) : false;

  const handleToggleFavorite = async () => {
    if (!currentTrack) return;
    await toggleFavorite("track", currentTrack);
  };

  // --- Search State ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    tracks: any[];
    albums: any[];
    artists: any[];
  }>({ tracks: [], albums: [], artists: [] });
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults({ tracks: [], albums: [], artists: [] });
      return;
    }
    setIsSearching(true);
    try {
      const results = await musicService.search(q);
      setSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentView === "search") {
        handleSearch(searchQuery);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, currentView, handleSearch]);

  // --------------------

  // --- Disc Animation Logic ---
  const rotation = useSharedValue(0);
  const velocity = useSharedValue(0);
  const isPlayingShared = useSharedValue(isPlaying);
  const lastTrackId = useRef(currentTrack?.id);

  useEffect(() => {
    isPlayingShared.value = isPlaying;
  }, [isPlaying]);

  const RPM = 33.33;
  const targetVelocity = (RPM * 360) / 60; // deg/sec
  const acceleration = 120; // deg/sec^2
  const friction = 60; // deg/sec^2

  useFrameCallback((frameInfo) => {
    "use worklet";
    const { timeSincePreviousFrame } = frameInfo;
    if (!timeSincePreviousFrame) return;

    const dt = timeSincePreviousFrame / 1000;

    // Determine if we should be spinning based on isPlaying
    if (isPlayingShared.value) {
      if (velocity.value < targetVelocity) {
        velocity.value = Math.min(
          targetVelocity,
          velocity.value + acceleration * dt,
        );
      }
    } else {
      if (velocity.value > 0) {
        velocity.value = Math.max(0, velocity.value - friction * dt);
      }
    }

    if (velocity.value > 0) {
      rotation.value += velocity.value * dt;
    }
  }, true);

  // Reset rotation on track change
  useEffect(() => {
    if (currentTrack?.id !== lastTrackId.current) {
      rotation.value = 0;
      lastTrackId.current = currentTrack?.id;
    }
  }, [currentTrack?.id, rotation]);

  const animatedDiscStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value % 360}deg` }],
    };
  });
  // -----------------------------

  const [downloadStatus, setDownloadStatus] = useState<
    "none" | "pending" | "downloading" | "completed" | "error" | "cached"
  >("none");

  const checkDownloadStatus = useCallback(async () => {
    if (!currentTrack) {
      setDownloadStatus("none");
      return;
    }
    const metadata = await storageService.getDownloadMetadata(currentTrack.id);
    setDownloadStatus(metadata ? metadata.status : "none");
  }, [currentTrack]);

  useEffect(() => {
    checkDownloadStatus();
  }, [checkDownloadStatus]);

  useEffect(() => {
    if (!currentTrack) return;
    const unsubscribe = storageService.subscribeToDownloads((downloads) => {
      const item = downloads.find((d) => d.id === currentTrack.id);
      setDownloadStatus(item ? item.status : "none");
    });
    return unsubscribe;
  }, [currentTrack]);

  const handleDownload = async () => {
    if (!currentTrack) return;
    if (downloadStatus === "completed" || downloadStatus === "cached") {
      showToast("Track already downloaded", "info");
      return;
    }
    try {
      await storageService.addToDownloadQueue(currentTrack);
      showToast("Added to download queue", "success");
    } catch (error) {
      showToast("Failed to start download", "error");
    }
  };

  const [currentView, setCurrentView] = useState<
    "hub" | "search" | "tracks" | "albums" | "artists" | "playlists"
  >("hub");

  const libraryItems = [
    {
      id: "search",
      title: "Search",
      icon: Search,
      count: null,
      color: "#99CCFF",
    },
    {
      id: "tracks",
      title: "Tracks",
      icon: Heart,
      count: favoriteTracks.length,
      color: "#FFB6C1",
    },
    {
      id: "albums",
      title: "Albums",
      icon: Disc,
      count: favoriteAlbums.length,
      color: "#FFD700",
    },
    {
      id: "artists",
      title: "Artists",
      icon: Users,
      count: favoriteArtists.length,
      color: "#98FB98",
    },
    {
      id: "playlists",
      title: "Playlists",
      icon: ListMusic,
      count: favoritePlaylists.length + userPlaylists.length,
      color: "#E6E6FA",
    },
  ];

  const [selectedAlbum, setSelectedAlbum] = useState<any>(null);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);

  const renderViewportContent = () => {
    if (selectedAlbum) return renderAlbumDetail(selectedAlbum);
    if (selectedArtist) return renderArtistDetail(selectedArtist);
    if (selectedPlaylist) return renderPlaylistDetail(selectedPlaylist);

    switch (currentView) {
      case "hub":
        return (
          <View style={styles.libraryGrid}>
            {libraryItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.libraryCard}
                activeOpacity={0.7}
                onPress={() => setCurrentView(item.id as any)}
              >
                <View
                  style={[
                    styles.libraryIconContainer,
                    { backgroundColor: item.color },
                  ]}
                >
                  <item.icon size={20} color={POOLSUITE_COLORS.black} />
                </View>
                <View style={styles.libraryTextContainer}>
                  <ThemedText style={styles.libraryItemTitle}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.libraryItemCount}>
                    {item.count !== null
                      ? `${item.count} ${item.count === 1 ? "item" : "items"}`
                      : "Explore Library"}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
      case "search":
        return renderSearchModule();
      case "tracks":
        return renderTracksModule(favoriteTracks, "FAVORITE TRACKS");
      case "albums":
        return renderAlbumsModule(favoriteAlbums, "FAVORITE ALBUMS");
      case "artists":
        return renderArtistsModule(favoriteArtists, "FAVORITE ARTISTS");
      case "playlists":
        return renderPlaylistsModule(
          [...favoritePlaylists, ...userPlaylists],
          "ALL PLAYLISTS",
        );
      default:
        return null;
    }
  };

  const renderSearchModule = () => (
    <View style={styles.moduleContainer}>
      <View style={styles.brutalistSearchBox}>
        <Search
          size={16}
          color={POOLSUITE_COLORS.black}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.brutalistInput}
          placeholder="SEARCH TERMINAL..."
          placeholderTextColor="rgba(0,0,0,0.3)"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
        {isSearching && (
          <ActivityIndicator size="small" color={POOLSUITE_COLORS.black} />
        )}
      </View>

      {searchResults.tracks.length > 0 && (
        <View style={styles.moduleSection}>
          {searchResults.tracks.map((track) => (
            <CompactTrackItem
              key={track.id}
              track={track}
              onPress={() =>
                setQueue(
                  searchResults.tracks,
                  searchResults.tracks.indexOf(track),
                )
              }
            />
          ))}
        </View>
      )}

      {searchResults.albums.length > 0 && (
        <View style={styles.moduleSection}>
          <View style={styles.compactGrid}>
            {searchResults.albums.map((album) => (
              <CompactGridItem
                key={album.id}
                item={album}
                onPress={() => setSelectedAlbum(album)}
              />
            ))}
          </View>
        </View>
      )}

      {!isSearching && searchQuery && searchResults.tracks.length === 0 && (
        <ThemedText style={styles.noResultsText}>
          NO DATA FOUND FOR: {searchQuery.toUpperCase()}
        </ThemedText>
      )}
    </View>
  );

  const renderTracksModule = (tracks: any[], title: string) => (
    <View style={styles.moduleContainer}>
      {tracks.length > 0 ? (
        tracks.map((track) => (
          <CompactTrackItem
            key={track.id}
            track={track}
            onPress={() => setQueue(tracks, tracks.indexOf(track))}
          />
        ))
      ) : (
        <View style={styles.emptyViewContainer}>
          <ThemedText style={styles.noResultsText}>
            DATABASE EMPTY: NO TRACKS FOUND
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderAlbumsModule = (albums: any[], title: string) => (
    <View style={styles.moduleContainer}>
      {albums.length > 0 ? (
        <View style={styles.compactGrid}>
          {albums.map((album) => (
            <CompactGridItem
              key={album.id}
              item={album}
              onPress={() => setSelectedAlbum(album)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyViewContainer}>
          <ThemedText style={styles.noResultsText}>
            DATABASE EMPTY: NO ALBUMS FOUND
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderArtistsModule = (artists: any[], title: string) => (
    <View style={styles.moduleContainer}>
      {artists.length > 0 ? (
        artists.map((artist) => (
          <TouchableOpacity
            key={artist.id}
            style={styles.compactListItem}
            onPress={() => setSelectedArtist(artist)}
          >
            <Image
              source={{ uri: artist.imageUrl || artist.coverUrl }}
              style={styles.compactArtistImage}
            />
            <ThemedText style={styles.compactItemTitle}>
              {artist.name.toUpperCase()}
            </ThemedText>
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.emptyViewContainer}>
          <ThemedText style={styles.noResultsText}>
            DATABASE EMPTY: NO ARTISTS FOUND
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderPlaylistsModule = (playlists: any[], title: string) => (
    <View style={styles.moduleContainer}>
      {playlists.length > 0 ? (
        playlists.map((playlist) => (
          <TouchableOpacity
            key={playlist.id}
            style={styles.compactListItem}
            onPress={() => setSelectedPlaylist(playlist)}
          >
            <View style={styles.compactPlaylistIcon}>
              <ListMusic size={16} color={POOLSUITE_COLORS.black} />
            </View>
            <View>
              <ThemedText style={styles.compactItemTitle}>
                {playlist.title.toUpperCase()}
              </ThemedText>
              <ThemedText style={styles.compactItemSubtitle}>
                {playlist.trackCount || 0}{" "}
                {playlist.trackCount === 1 ? "TRACK" : "TRACKS"}
              </ThemedText>
            </View>
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.emptyViewContainer}>
          <ThemedText style={styles.noResultsText}>
            DATABASE EMPTY: NO PLAYLISTS FOUND
          </ThemedText>
        </View>
      )}
    </View>
  );

  // Helper Components
  const CompactTrackItem = ({
    track,
    onPress,
  }: {
    track: any;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.compactTrackItem} onPress={onPress}>
      <View style={styles.compactTrackInfo}>
        <ThemedText style={styles.compactTrackTitle} numberOfLines={1}>
          {track.title.toUpperCase()}
        </ThemedText>
        <ThemedText style={styles.compactTrackArtist} numberOfLines={1}>
          {track.artist?.name.toUpperCase()}
        </ThemedText>
      </View>
      <ThemedText style={styles.compactTrackDuration}>
        {musicService.formatDuration(track.duration)}
      </ThemedText>
    </TouchableOpacity>
  );

  const CompactGridItem = ({
    item,
    onPress,
  }: {
    item: any;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.compactGridItem} onPress={onPress}>
      <Image
        source={{ uri: item.imageUrl || item.coverUrl }}
        style={styles.compactGridImage}
      />
      <ThemedText style={styles.compactGridTitle} numberOfLines={1}>
        {item.title.toUpperCase()}
      </ThemedText>
    </TouchableOpacity>
  );

  // Detail Views
  const [albumTracks, setAlbumTracks] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (selectedAlbum) {
      setLoadingDetail(true);
      musicService.getAlbumTracks(selectedAlbum.id).then((tracks) => {
        setAlbumTracks(tracks);
        setLoadingDetail(false);
      });
    }
    if (selectedPlaylist) {
      setLoadingDetail(true);
      storageService.getPlaylistTracks(selectedPlaylist.id).then((tracks) => {
        setAlbumTracks(tracks); // reuse same state for simplicity
        setLoadingDetail(false);
      });
    }
  }, [selectedAlbum, selectedPlaylist]);

  const renderAlbumDetail = (album: any) => (
    <View style={styles.moduleContainer}>
      <View style={styles.detailHeader}>
        <Image
          source={{ uri: album.imageUrl || album.coverUrl }}
          style={styles.detailImage}
        />
        <View style={styles.detailTextInfo}>
          <ThemedText style={styles.detailTitle}>
            {album.title.toUpperCase()}
          </ThemedText>
          <ThemedText style={styles.detailSubtitle}>
            {album.artist?.name.toUpperCase()}
          </ThemedText>
        </View>
      </View>
      <View style={styles.moduleSection}>
        {loadingDetail ? (
          <ActivityIndicator color={POOLSUITE_COLORS.black} />
        ) : (
          albumTracks.map((track) => (
            <CompactTrackItem
              key={track.id}
              track={track}
              onPress={() => setQueue(albumTracks, albumTracks.indexOf(track))}
            />
          ))
        )}
      </View>
    </View>
  );

  const renderPlaylistDetail = (playlist: any) => (
    <View style={styles.moduleContainer}>
      <View style={styles.detailHeader}>
        <View
          style={[
            styles.detailImage,
            styles.compactPlaylistIcon,
            { width: 80, height: 80 },
          ]}
        >
          <ListMusic size={40} color={POOLSUITE_COLORS.black} />
        </View>
        <View style={styles.detailTextInfo}>
          <ThemedText style={styles.detailTitle}>
            {playlist.title.toUpperCase()}
          </ThemedText>
          <ThemedText style={styles.detailSubtitle}>
            {playlist.trackCount || 0}{" "}
            {playlist.trackCount === 1 ? "TRACK" : "TRACKS"}
          </ThemedText>
        </View>
      </View>
      <View style={styles.moduleSection}>
        {loadingDetail ? (
          <ActivityIndicator color={POOLSUITE_COLORS.black} />
        ) : (
          albumTracks.map((track) => (
            <CompactTrackItem
              key={track.id}
              track={track}
              onPress={() => setQueue(albumTracks, albumTracks.indexOf(track))}
            />
          ))
        )}
      </View>
    </View>
  );

  const renderArtistDetail = (artist: any) => (
    <View style={styles.moduleContainer}>
      <View style={styles.detailHeader}>
        <Image
          source={{ uri: artist.imageUrl || artist.coverUrl }}
          style={[styles.detailImage, { borderRadius: 40 }]}
        />
        <View style={styles.detailTextInfo}>
          <ThemedText style={styles.detailTitle}>
            {artist.name.toUpperCase()}
          </ThemedText>
          <ThemedText style={styles.detailSubtitle}>ARTIST PROFILE</ThemedText>
        </View>
      </View>
      {/* For artist, we could show their top tracks or albums. For now just a placeholder. */}
      <ThemedText style={styles.noResultsText}>
        DISCOGRAPHY DATA LOADING...
      </ThemedText>
    </View>
  );

  const handleBack = () => {
    if (selectedAlbum) setSelectedAlbum(null);
    else if (selectedArtist) setSelectedArtist(null);
    else if (selectedPlaylist) setSelectedPlaylist(null);
    else setCurrentView("hub");
  };

  const getHeaderColor = () => {
    if (selectedAlbum || selectedArtist || selectedPlaylist) {
      const activeItem = libraryItems.find(
        (i) =>
          (selectedAlbum && i.id === "albums") ||
          (selectedArtist && i.id === "artists") ||
          (selectedPlaylist && i.id === "playlists"),
      );
      return activeItem?.color || POOLSUITE_COLORS.bg;
    }
    const currentItem = libraryItems.find((i) => i.id === currentView);
    return currentItem?.color || POOLSUITE_COLORS.bg;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: POOLSUITE_COLORS.bg }]}
    >
      {/* 0. App Level Header */}
      <View style={styles.appHeader}>
        <View style={styles.appHeaderLeft}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.appLogo}
          />
        </View>
        <ThemedText style={styles.appTitle}>LUNA</ThemedText>
      </View>

      {/* 2. Main Content View (Rounded Interaction Area) */}
      <View style={[styles.mainContentView, styles.roundedContainer]}>
        {/* Viewport Header */}
        <View
          style={[styles.viewportHeader, { backgroundColor: getHeaderColor() }]}
        >
          <ThemedText style={styles.viewportModeLabel}>
            MODE:{" "}
            {(selectedAlbum
              ? "ALBUM"
              : selectedArtist
                ? "ARTIST"
                : selectedPlaylist
                  ? "PLAYLIST"
                  : currentView
            ).toUpperCase()}
          </ThemedText>
          {(currentView !== "hub" ||
            selectedAlbum ||
            selectedArtist ||
            selectedPlaylist) && (
            <TouchableOpacity
              onPress={handleBack}
              style={styles.viewportBackButton}
            >
              <X size={14} color={POOLSUITE_COLORS.black} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {renderViewportContent()}
        </ScrollView>

        {/* Dithered Overlay Effect */}
        <View style={styles.ditherOverlay} pointerEvents="none" />
      </View>

      {/* 4. Track Info Section (Rounded) */}
      <View
        style={[
          styles.trackInfoSection,
          styles.roundedContainer,
          { padding: 0 }, // Remove default padding for internal layout
        ]}
      >
        <View style={styles.trackInfoContent}>
          {/* Metadata Display Box */}
          <View style={styles.metadataBox}>
            <View style={styles.metadataHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.metadataStatus}>
                  {currentTrack
                    ? `${currentTrack.title} by ${currentTrack.artist?.name || "Unknown"}`
                    : "[empty]"}
                </ThemedText>
              </View>
              <View style={styles.metadataIcons}>
                <TouchableOpacity onPress={handleToggleFavorite}>
                  <Heart
                    size={16}
                    color={favorited ? "#FF4B4B" : "#FFF"}
                    fill={favorited ? "#FF4B4B" : "transparent"}
                    style={{ opacity: favorited ? 1 : 0.7 }}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, Math.max(0, (position / (duration || 1)) * 100))}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.metadataDetails}>
              {currentTrack ? (
                <>
                  <ThemedText style={styles.metadataDetailText}>
                    {currentTrack.title.replace(/\s+/g, "")}.
                    {currentTrack.provider === "qobuz" ? "flac" : "m4a"}
                  </ThemedText>
                  <ThemedText style={styles.metadataDetailText}>
                    Audio file ({currentTrack.quality || "Hi-Res"})
                  </ThemedText>
                  <ThemedText style={styles.metadataDetailText}>
                    Duration:{" "}
                    {musicService.formatDuration(
                      duration || currentTrack.duration || 0,
                    )}
                  </ThemedText>
                  <ThemedText style={styles.metadataDetailText}>
                    {currentTrack.provider === "qobuz"
                      ? "96KHz 24 Bit"
                      : "44KHz 16 Bit"}{" "}
                    - Stereo
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={styles.metadataDetailText}>
                  Double-click a disc to begin your audio journey
                </ThemedText>
              )}
            </View>
            <View style={styles.metadataDither} pointerEvents="none" />
          </View>

          {/* Disc Container */}
          <View style={styles.discWrapper}>
            <Animated.View style={[styles.discContainer, animatedDiscStyle]}>
              {currentTrack ? (
                <Image
                  source={{
                    uri:
                      currentTrack.album?.coverUrl ||
                      musicService.getCoverUrl(currentTrack),
                  }}
                  style={styles.discImage}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={styles.emptyDisc}>
                  {/* Wavy lines placeholder */}
                  {[...Array(12)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.wavyLine,
                        {
                          top: 20 + i * 8,
                          transform: [
                            { rotate: i % 2 === 0 ? "2deg" : "-2deg" },
                          ],
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
              <View style={styles.discCenter} />
              <View style={styles.discCenterInner} />
            </Animated.View>
          </View>
        </View>

        {/* Hardware Controls Bar */}
        <View style={styles.hardwareControlsBar}>
          <View style={styles.playbackPod}>
            <TouchableOpacity
              style={[styles.hardwareBtn, styles.playBtnHardware]}
              onPress={togglePlayPause}
            >
              <View style={styles.playArrowIcon} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hardwareBtn, styles.pauseBtnHardware]}
              onPress={togglePlayPause}
            >
              <View style={styles.pauseBarsIcon}>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.hardwareBtn}
              onPress={skipToPrevious}
            >
              <SkipBack size={14} color="#000" fill="#000" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.hardwareBtn} onPress={skipToNext}>
              <SkipForward size={14} color="#000" fill="#000" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                styles.downloadBtnHardware,
                (downloadStatus === "completed" ||
                  downloadStatus === "cached") && {
                  backgroundColor: Palette.success,
                },
              ]}
              onPress={handleDownload}
            >
              {downloadStatus === "completed" || downloadStatus === "cached" ? (
                <Check size={16} color="#000" />
              ) : (
                <Download size={16} color="#000" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hardwareBtn, styles.addBtnHardware]}
            >
              <View style={styles.addIconRow}>
                <Plus size={10} color="#000" strokeWidth={3} />
                <Music size={12} color="#000" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  appHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: 14,
  },
  appHeaderLeft: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  appLogo: {
    width: 24,
    height: 24,
  },
  appTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    letterSpacing: 2,
    color: POOLSUITE_COLORS.black,
  },
  mainContentView: {
    flex: 1, // Let it fill the remaining space
    backgroundColor: POOLSUITE_COLORS.windowBg,
    marginBottom: 14,
  },
  viewportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: POOLSUITE_COLORS.bg,
    borderBottomWidth: 2,
    borderBottomColor: POOLSUITE_COLORS.black,
  },
  viewportModeLabel: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    letterSpacing: 1,
    color: POOLSUITE_COLORS.black,
  },
  viewportBackButton: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: POOLSUITE_COLORS.black,
    backgroundColor: POOLSUITE_COLORS.windowBg,
    justifyContent: "center",
    alignItems: "center",
  },
  roundedContainer: {
    borderRadius: Radii.m,
    borderWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
    overflow: "hidden",
  },
  contentScroll: {
    flex: 1,
  },
  contentScrollContainer: {
    padding: 16,
  },
  libraryGrid: {
    gap: 10,
  },
  libraryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: POOLSUITE_COLORS.windowBg,
    borderWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
    borderRadius: Radii.m,
    minHeight: 64,
  },
  libraryIconContainer: {
    width: 42,
    height: 42,
    borderRadius: Radii.sm,
    backgroundColor: POOLSUITE_COLORS.blue,
    borderWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
    justifyContent: "center",
    alignItems: "center",
  },
  libraryTextContainer: {
    marginLeft: 10,
    flex: 1,
  },
  libraryItemTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    textTransform: "uppercase",
    color: POOLSUITE_COLORS.black,
  },
  libraryItemCount: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: POOLSUITE_COLORS.black,
    opacity: 0.6,
  },
  // --- Viewport Module Styles ---
  moduleContainer: {
    flex: 1,
    gap: 16,
  },
  moduleSection: {
    gap: 10,
    marginTop: 8,
  },
  moduleSectionTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    letterSpacing: 1.5,
    opacity: 0.5,
    marginBottom: 4,
    color: POOLSUITE_COLORS.black,
  },
  brutalistSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1.5,
    borderColor: POOLSUITE_COLORS.black,
    borderRadius: Radii.sm,
    paddingHorizontal: 10,
    height: 38,
  },
  brutalistInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: POOLSUITE_COLORS.black,
    letterSpacing: 0.5,
  },
  compactTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  compactTrackInfo: {
    flex: 1,
    marginRight: 10,
  },
  compactTrackTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: POOLSUITE_COLORS.black,
  },
  compactTrackArtist: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    opacity: 0.6,
    color: POOLSUITE_COLORS.black,
  },
  compactTrackDuration: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    opacity: 0.4,
    color: POOLSUITE_COLORS.black,
  },
  compactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  compactGridItem: {
    width: "31%", // Roughly 3 columns
    gap: 6,
  },
  compactGridImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: Radii.sm,
    borderWidth: 1.5,
    borderColor: POOLSUITE_COLORS.black,
  },
  compactGridTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 9,
    textAlign: "center",
    color: POOLSUITE_COLORS.black,
  },
  compactListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  compactArtistImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: POOLSUITE_COLORS.black,
  },
  compactPlaylistIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.sm,
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: POOLSUITE_COLORS.black,
  },
  compactItemTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 12,
    color: POOLSUITE_COLORS.black,
  },
  compactItemSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    opacity: 0.5,
    color: POOLSUITE_COLORS.black,
  },
  emptyViewContainer: {
    flex: 1,
    height: 300,
    justifyContent: "center",
    alignItems: "center",
  },
  noResultsText: {
    fontFamily: Fonts.displayBold,
    fontSize: 11,
    textAlign: "center",
    opacity: 0.2,
    letterSpacing: 2,
    color: POOLSUITE_COLORS.black,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 10,
  },
  detailImage: {
    width: 80,
    height: 80,
    borderRadius: Radii.sm,
    borderWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
  },
  detailTextInfo: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 18,
    color: POOLSUITE_COLORS.black,
  },
  detailSubtitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 12,
    opacity: 0.6,
    color: POOLSUITE_COLORS.black,
  },
  ditherOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
    backgroundColor: "transparent",
  },
  trackInfoSection: {
    backgroundColor: POOLSUITE_COLORS.windowBg,
  },
  trackInfoContent: {
    flexDirection: "row",
    padding: 20,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20, // Add distance between Metadata Box and Disc
  },
  metadataBox: {
    flex: 1.2,
    backgroundColor: "#111",
    borderRadius: Radii.sm,
    padding: 12,
    height: 160,
    borderWidth: 1,
    borderColor: "#333",
    position: "relative",
    overflow: "hidden",
  },
  metadataHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metadataStatus: {
    color: "#FFF",
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metadataMainTitle: {
    color: "#FFF",
    fontFamily: Fonts.bold,
    fontSize: 16,
    textTransform: "uppercase",
  },
  metadataIcons: {
    alignItems: "flex-end",
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginVertical: 12,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#99CCFF", // Using the light blue for the progress
  },
  metadataDetails: {
    gap: 4,
  },
  metadataDetailText: {
    color: "#FFF",
    fontFamily: Fonts.regular,
    fontSize: 11,
    opacity: 0.9,
    lineHeight: 14,
  },
  metadataDither: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    opacity: 0.05,
    // We could add a pattern here if needed
  },
  discWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  discContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: POOLSUITE_COLORS.black,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  discImage: {
    width: "100%",
    height: "100%",
    borderRadius: 70,
  },
  emptyDisc: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FDFCF0",
    position: "relative",
  },
  wavyLine: {
    position: "absolute",
    left: -10,
    right: -10,
    height: 1,
    backgroundColor: "#000",
    opacity: 0.1,
  },
  discCenter: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FDFCF0",
    borderWidth: 1,
    borderColor: "#000",
    zIndex: 10,
  },
  discCenterInner: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#000",
    zIndex: 11,
  },
  hardwareControlsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 0,
  },
  playbackPod: {
    flex: 1, // Take full width
    flexDirection: "row",
    backgroundColor: POOLSUITE_COLORS.windowBg,
    borderWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
    borderRadius: Radii.m,
    padding: 2,
    gap: 2,
  },
  hardwareBtn: {
    flex: 1, // Distribute buttons evenly
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  playBtnHardware: {
    backgroundColor: "#99CCFF", // Light blue as in image
    borderColor: POOLSUITE_COLORS.black,
  },
  pauseBtnHardware: {
    backgroundColor: "#FFF",
    borderColor: POOLSUITE_COLORS.black,
  },
  downloadBtnHardware: {
    backgroundColor: "#FFF",
    borderColor: POOLSUITE_COLORS.black,
  },
  addBtnHardware: {
    backgroundColor: "#FFB6C1", // Pink as in image
    borderColor: POOLSUITE_COLORS.black,
  },
  addIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: -2,
  },
  playArrowIcon: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderTopColor: "transparent",
    borderBottomWidth: 6,
    borderBottomColor: "transparent",
    borderLeftWidth: 10,
    borderLeftColor: "#000",
  },
  pauseBarsIcon: {
    flexDirection: "row",
    gap: 3,
  },
  pauseBar: {
    width: 3,
    height: 12,
    backgroundColor: "#000",
  },
  downloadBtn: {
    width: 44,
    height: 36,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
    borderRadius: Radii.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  footerBar: {
    flexDirection: "row",
    height: 54,
    backgroundColor: "#FFF",
  },
  channelDropdown: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    borderRightWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
  },
  channelText: {
    fontSize: 11,
    fontFamily: Fonts.regular,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    width: 100,
  },
  speakerBtn: {
    width: 40,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
  },
  ditherPattern: {
    flex: 1,
    height: "100%",
    backgroundColor: "#DDD",
    // Pattern background
  },
});
