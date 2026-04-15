import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import {
  Check,
  Disc,
  Download,
  FileUp,
  Heart,
  ListMusic,
  Music,
  Pencil,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MarqueeText } from "../../components/marquee-text";
import { HeroSkeleton, TrackSkeleton } from "../../components/skeleton-loader";
import { ThemedText } from "../../components/themed-text";
import { Colors, Fonts, Palette, Radii, Spacing } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { musicService } from "../../services/music-service";
import { playlistImporter } from "../../services/playlist-importer";
import { storageService } from "../../services/storage-service";
import { showToast } from "../../services/toast-store";

// --- Standalone Memoized Components ---

const CompactGridItem = React.memo(
  ({
    item,
    onPress,
    type = "album",
  }: {
    item: any;
    onPress: () => void;
    type?: "album" | "artist";
  }) => {
    const colorScheme = useColorScheme() ?? "light";
    const colors = Colors[colorScheme];

    return (
      <TouchableOpacity style={styles.compactGridItem} onPress={onPress}>
        <View>
          <Image
            source={{ uri: item.imageUrl || item.coverUrl }}
            style={[
              styles.compactGridImage,
              type === "artist" && { borderRadius: 40 },
            ]}
          />
        </View>
        <ThemedText style={styles.compactGridTitle} numberOfLines={1}>
          {(item.title || item.name)?.toUpperCase() ||
            (type === "artist" ? "UNKNOWN ARTIST" : "UNKNOWN ALBUM")}
        </ThemedText>
      </TouchableOpacity>
    );
  },
);

const CompactTrackItem = React.memo(
  ({
    track,
    onPress,
    isCurrentTrack,
    onToggleLibrary,
    isFavoriteTrack,
    isDownloaded,
    index,
  }: {
    track: any;
    onPress: () => void;
    isCurrentTrack?: boolean;
    onToggleLibrary: (type: string, item: any) => void;
    isFavoriteTrack: boolean;
    isDownloaded?: boolean;
    index?: number;
  }) => {
    const colorScheme = useColorScheme() ?? "light";
    const colors = Colors[colorScheme];

    return (
      <TouchableOpacity style={styles.compactTrackItem} onPress={onPress}>
        <ThemedText style={styles.compactTrackNumber}>
          {index !== undefined ? String(index + 1).padStart(2, "0") : "--"}
        </ThemedText>

        <View style={styles.compactTrackInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ThemedText style={styles.compactTrackTitle} numberOfLines={1}>
              {track.title?.toUpperCase() || "UNKNOWN TITLE"}
            </ThemedText>
            {isDownloaded && (
              <View style={styles.smallDownloadedBadge}>
                <Check size={8} color={Palette.black} strokeWidth={3} />
              </View>
            )}
          </View>
          <ThemedText style={styles.compactTrackArtist} numberOfLines={1}>
            {track.artist?.name?.toUpperCase() || "UNKNOWN ARTIST"}
          </ThemedText>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => onToggleLibrary("track", track)}
            hitSlop={8}
          >
            <Heart
              size={14}
              color={isFavoriteTrack ? "#FF4B4B" : colors.text}
              fill={isFavoriteTrack ? "#FF4B4B" : "transparent"}
            />
          </TouchableOpacity>
          <ThemedText style={styles.compactTrackDuration}>
            {musicService.formatDuration(track.duration || 0)}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  },
);

const ToolbarRibbon = React.memo(
  ({
    type,
    item,
    onDownload,
    onLike,
    onEdit,
    onDelete,
    favorited,
    downloadDisabled,
    downloadProgress,
    isDownloaded,
  }: {
    type: "album" | "playlist" | "artist";
    item: any;
    onDownload?: () => void;
    onLike: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    favorited: boolean;
    downloadDisabled?: boolean;
    downloadProgress?: number;
    isDownloaded?: boolean;
  }) => {
    const isLocal = type === "playlist" && item.id.startsWith("local:");
    const colorScheme = useColorScheme() ?? "light";
    const colors = Colors[colorScheme];

    return (
      <View style={styles.toolbarRibbon}>
        {type === "playlist" && isLocal && onEdit && (
          <TouchableOpacity style={styles.toolbarItem} onPress={onEdit}>
            <Pencil size={12} color={colors.text} />
            <ThemedText style={styles.toolbarText}>EDIT</ThemedText>
          </TouchableOpacity>
        )}

        {onDownload && (
          <View
            style={[
              styles.toolbarDownloadItem,
              downloadDisabled && styles.toolbarItemDisabled,
              isDownloaded && styles.toolbarDownloadItemDownloaded,
            ]}
          >
            <TouchableOpacity
              style={styles.toolbarDownloadInner}
              onPress={downloadDisabled ? undefined : onDownload}
            >
              {isDownloaded ? (
                <>
                  <Check size={12} color={colors.text} />
                  <ThemedText style={styles.toolbarText}>DOWNLOADED</ThemedText>
                </>
              ) : (
                <>
                  <Download
                    size={12}
                    color={downloadDisabled ? "rgba(0,0,0,0.3)" : colors.text}
                  />
                  <ThemedText
                    style={[
                      styles.toolbarText,
                      downloadDisabled && styles.toolbarTextDisabled,
                    ]}
                  >
                    DOWNLOAD
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>
            {downloadProgress !== undefined &&
              downloadProgress > 0 &&
              downloadProgress < 1 && (
                <View
                  style={[
                    styles.toolbarDownloadProgress,
                    { width: `${downloadProgress * 100}%` },
                  ]}
                />
              )}
          </View>
        )}

        {type === "album" && onLike && (
          <TouchableOpacity
            style={[
              styles.toolbarItem,
              favorited && styles.toolbarItemFavorited,
            ]}
            onPress={onLike}
          >
            <Heart
              size={12}
              color={favorited ? colors.text : colors.text}
              fill={favorited ? colors.text : "transparent"}
            />
            <ThemedText
              style={[
                styles.toolbarText,
                favorited && styles.toolbarTextFavorited,
              ]}
            >
              {favorited ? "UNLIKE" : "LIKE"}
            </ThemedText>
          </TouchableOpacity>
        )}

        {type === "playlist" && isLocal && onDelete && (
          <TouchableOpacity
            style={[styles.toolbarItem, { borderRightWidth: 0 }]}
            onPress={onDelete}
          >
            <Trash2 size={12} color="#FF4B4B" />
            <ThemedText style={[styles.toolbarText, { color: "#FF4B4B" }]}>
              DELETE
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
    );
  },
);

const PlaybackInfoSection = React.memo(
  ({
    currentTrack,
    favorited,
    onToggleFavorite,
    position,
    duration,
    animatedDiscStyle,
    downloadStatus,
    downloadProgress,
    onDownload,
    onPlayPause,
    onNext,
    onPrev,
    onAddToPlaylist,
  }: {
    currentTrack: any;
    favorited: boolean;
    onToggleFavorite: () => void;
    position: number;
    duration: number;
    animatedDiscStyle: any;
    downloadStatus: string;
    downloadProgress?: number;
    onDownload: () => void;
    onPlayPause: () => void;
    onNext: () => void;
    onPrev: () => void;
    onAddToPlaylist?: () => void;
  }) => {
    const colorScheme = useColorScheme() ?? "light";
    const colors = Colors[colorScheme];

    return (
      <View
        style={[
          styles.trackInfoSection,
          styles.roundedContainer,
          { padding: 0 },
        ]}
      >
        <View style={styles.trackInfoContent}>
          <View style={styles.metadataBox}>
            <View style={styles.metadataHeader}>
              <View style={{ flex: 1 }}>
                {currentTrack ? (
                  <>
                    <MarqueeText
                      style={styles.metadataStatus}
                      lightColor="#FFF"
                      duration={10000}
                      marqueeDelay={2000}
                    >
                      {currentTrack.title || "UNKNOWN"}
                    </MarqueeText>
                    <ThemedText style={styles.metadataArtist} numberOfLines={1}>
                      {currentTrack.artist?.name || "Unknown"}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.metadataStatus}>[empty]</ThemedText>
                )}
              </View>
              <View style={styles.metadataIcons}>
                <TouchableOpacity onPress={onToggleFavorite}>
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
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            </View>

            <View style={styles.metadataDetails}>
              {currentTrack ? (
                <>
                  <ThemedText
                    style={styles.metadataDetailText}
                    numberOfLines={1}
                  >
                    {(currentTrack.title || "UNKNOWN").replace(/\s+/g, "")}.
                    {currentTrack.provider === "qobuz" ? "flac" : "m4a"}
                  </ThemedText>
                  <ThemedText
                    style={styles.metadataDetailText}
                    numberOfLines={1}
                  >
                    Audio file ({currentTrack.quality || "Hi-Res"})
                  </ThemedText>
                  <ThemedText
                    style={styles.metadataDetailText}
                    numberOfLines={1}
                  >
                    Duration:{" "}
                    {musicService.formatDuration(
                      duration || currentTrack.duration || 0,
                    )}
                  </ThemedText>
                  <ThemedText
                    style={styles.metadataDetailText}
                    numberOfLines={1}
                  >
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

        <View style={styles.hardwareControlsBar}>
          <View style={styles.playbackPod}>
            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                styles.playBtnHardware,
                { backgroundColor: colors.accent },
              ]}
              onPress={onPlayPause}
            >
              <View style={styles.playArrowIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.hardwareBtn, styles.pauseBtnHardware]}
              onPress={onPlayPause}
            >
              <View style={styles.pauseBarsIcon}>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.hardwareBtn} onPress={onPrev}>
              <SkipBack size={14} color={colors.text} fill={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.hardwareBtn} onPress={onNext}>
              <SkipForward size={14} color={colors.text} fill={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                styles.downloadBtnHardware,
                (downloadStatus === "completed" ||
                  downloadStatus === "cached") && {
                  backgroundColor: colors.green,
                },
              ]}
              onPress={onDownload}
            >
              {downloadStatus === "completed" || downloadStatus === "cached" ? (
                <Check size={16} color={colors.text} />
              ) : (
                <Download size={16} color={colors.text} />
              )}
              {downloadProgress > 0 && downloadProgress < 1 && (
                <View
                  style={[
                    styles.downloadProgressBar,
                    { width: `${downloadProgress * 100}%` },
                  ]}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                styles.addBtnHardware,
                { backgroundColor: colors.pink },
              ]}
              onPress={onAddToPlaylist}
              disabled={!currentTrack}
            >
              <View style={styles.addIconRow}>
                <Plus size={10} color={colors.text} strokeWidth={3} />
                <Music size={12} color={colors.text} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  },
);

export default function Home() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

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

  const derivedArtists = useMemo(() => {
    const artistMap = new Map<string, any>();

    // Helper to get image from favoriteArtists if available
    const getArtistImage = (id: string) => {
      const fav = (favoriteArtists || []).find((fa) => fa.id === id);
      return fav?.imageUrl || fav?.coverUrl;
    };

    (favoriteTracks || []).forEach((track) => {
      if (track.artist && track.artist.id) {
        const artistId = track.artist.id;
        const existing = artistMap.get(artistId);
        const imageUrl =
          track.artist.imageUrl ||
          track.artist.picture ||
          track.artist.cover ||
          getArtistImage(artistId);

        if (!existing || (!existing.imageUrl && imageUrl)) {
          artistMap.set(artistId, {
            ...track.artist,
            imageUrl,
          });
        }
      }
    });

    (favoriteAlbums || []).forEach((album) => {
      if (album.artist && album.artist.id) {
        const artistId = album.artist.id;
        const existing = artistMap.get(artistId);
        const imageUrl =
          album.artist.imageUrl ||
          album.artist.picture ||
          album.artist.cover ||
          getArtistImage(artistId);

        if (!existing || (!existing.imageUrl && imageUrl)) {
          artistMap.set(artistId, {
            ...album.artist,
            imageUrl,
          });
        }
      }
    });

    return Array.from(artistMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [favoriteTracks, favoriteAlbums, favoriteArtists]);

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
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<Set<string>>(
    new Set(),
  );

  const refreshDownloadedTracks = useCallback(async () => {
    const downloads = await storageService.getAllDownloads();
    const completedIds = downloads
      .filter((d) => d.status === "completed" || d.status === "cached")
      .map((d) => d.id);
    setDownloadedTrackIds(new Set(completedIds));
  }, []);

  useEffect(() => {
    refreshDownloadedTracks();
    const unsubscribe = storageService.subscribeToDownloads(() => {
      refreshDownloadedTracks();
    });
    return unsubscribe;
  }, [refreshDownloadedTracks]);

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
    "library" | "search" | "tracks" | "albums" | "artists" | "playlists"
  >("library");

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
      count: derivedArtists.length,
      color: colors.green,
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
  const [isSelectingPlaylist, setIsSelectingPlaylist] = useState(false);
  const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<any>(null);

  const [artistData, setArtistData] = useState<any>(null);
  const [loadingArtist, setLoadingArtist] = useState(false);

  useEffect(() => {
    if (selectedArtist) {
      setLoadingArtist(true);
      musicService
        .getArtist(selectedArtist.id)
        .then((data) => {
          setArtistData(data);
          setLoadingArtist(false);
        })
        .catch((err) => {
          console.error("Failed to fetch artist data:", err);
          setLoadingArtist(false);
        });
    } else {
      setArtistData(null);
    }
  }, [selectedArtist]);

  // --- Playlist Management State ---
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null,
  );
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [importMode, setImportMode] = useState(false);
  const [importFile, setImportFile] = useState<{
    name: string;
    uri: string;
  } | null>(null);
  const [strictArtistMatch, setStrictArtistMatch] = useState(false);
  const [albumMatch, setAlbumMatch] = useState(false);
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingItemId, setDownloadingItemId] = useState<string | null>(
    null,
  );
  const [downloadingItemProgress, setDownloadingItemProgress] = useState(0);
  // ---------------------------------

  const handleToggleLibrary = useCallback(
    async (type: any, item: any) => {
      const isNowFavorite = await toggleFavorite(type, item);
      showToast(
        isNowFavorite ? "Added to library" : "Removed from library",
        isNowFavorite ? "success" : "info",
      );
    },
    [toggleFavorite],
  );

  const handleDownloadItem = useCallback(async (type: any, item: any) => {
    const metadata = await storageService.getDownloadMetadata(item.id);
    const currentStatus = metadata ? (metadata.status as any) : "none";

    if (currentStatus === "completed") {
      await musicService.removeDownload(item.id);
      showToast("Download removed", "info");
    } else if (currentStatus === "downloading") {
      await musicService.cancelDownload(item.id);
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadingItemId(null);
      setDownloadingItemProgress(0);
      showToast("Download cancelled", "info");
    } else {
      showToast("Download started", "info");
      setIsDownloading(true);
      setDownloadProgress(0.1);
      setDownloadingItemId(item.id);
      setDownloadingItemProgress(0.1);

      try {
        if (type === "album") {
          await musicService.downloadAlbum(item);
        } else if (type === "playlist") {
          await musicService.downloadPlaylist(item);
        }
        setDownloadProgress(1);
        setDownloadingItemProgress(1);
        setTimeout(() => {
          setIsDownloading(false);
          setDownloadProgress(0);
          setDownloadingItemId(null);
          setDownloadingItemProgress(0);
        }, 1000);
        showToast("Download complete", "success");
      } catch (error) {
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadingItemId(null);
        setDownloadingItemProgress(0);
        showToast("Download failed", "error");
      }
    }
  }, []);

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/*", "application/csv", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setImportFile({ name: file.name, uri: file.uri });
        if (!playlistTitle) {
          // Remove extension
          setPlaylistTitle(file.name.replace(/\.[^/.]+$/, ""));
        }
      }
    } catch (err) {
      console.warn("File pick error", err);
    }
  }, [playlistTitle]);

  const handleSavePlaylist = useCallback(
    async (existingPlaylist?: any) => {
      if (!playlistTitle.trim()) return;
      setIsSavingPlaylist(true);

      try {
        if (importMode && !editingPlaylistId) {
          if (!importFile) {
            showToast("Please select a file to import", "error");
            setIsSavingPlaylist(false);
            return;
          }
          showToast("Importing playlist...", "info");
          try {
            const content = await FileSystem.readAsStringAsync(importFile.uri);
            await playlistImporter.startImport(
              playlistTitle,
              playlistDescription,
              content,
              { strictArtistMatch, albumMatch },
            );
            showToast("Import complete", "success");
            setIsCreatingPlaylist(false);
          } catch (e) {
            console.error("Import failed", e);
            showToast("Import failed", "error");
          }
        } else if (existingPlaylist) {
          const updated = {
            ...existingPlaylist,
            title: playlistTitle,
            description: playlistDescription,
          };
          await storageService.saveUserPlaylist(updated);
          if (selectedPlaylist?.id === existingPlaylist.id) {
            setSelectedPlaylist(updated);
          }
          showToast("Playlist updated", "success");
          setEditingPlaylistId(null);
        } else {
          const newPlaylist = {
            id: `local:${Date.now()}`,
            title: playlistTitle,
            description: playlistDescription,
            trackCount: 0,
            tracks: [],
            provider: "local",
          };
          await storageService.saveUserPlaylist(newPlaylist as any);
          showToast("Playlist created", "success");
          setIsCreatingPlaylist(false);
        }
        setPlaylistTitle("");
        setPlaylistDescription("");
        setImportFile(null);
      } catch (error) {
        showToast("Failed to save playlist", "error");
      } finally {
        setIsSavingPlaylist(false);
      }
    },
    [
      playlistTitle,
      playlistDescription,
      importMode,
      editingPlaylistId,
      importFile,
      strictArtistMatch,
      albumMatch,
      selectedPlaylist,
    ],
  );

  const handleDeletePlaylist = useCallback(async (playlistId: string) => {
    try {
      await storageService.deleteUserPlaylist(playlistId);
      await storageService.removeFavorite("playlist", playlistId);
      setSelectedPlaylist(null);
      showToast("Playlist deleted", "success");
    } catch (error) {
      showToast("Failed to delete playlist", "error");
    }
  }, []);

  const handleAddToPlaylist = useCallback(() => {
    if (!currentTrack) return;
    setIsSelectingPlaylist(true);
    setTrackToAddToPlaylist(currentTrack);
  }, [currentTrack]);

  const handleSelectPlaylistToAddTrack = useCallback(
    async (playlist: any) => {
      if (!trackToAddToPlaylist) return;
      try {
        const existingTrack = playlist.tracks?.find(
          (t: any) => t.id === trackToAddToPlaylist.id,
        );
        if (existingTrack) {
          showToast("Track already in playlist", "info");
        } else {
          const updatedPlaylist = {
            ...playlist,
            tracks: [...(playlist.tracks || []), trackToAddToPlaylist],
            trackCount: (playlist.trackCount || 0) + 1,
          };
          await storageService.saveUserPlaylist(updatedPlaylist);
          showToast(`Added to ${playlist.title}`, "success");
        }
        setIsSelectingPlaylist(false);
        setTrackToAddToPlaylist(null);
      } catch (error) {
        showToast("Failed to add track", "error");
      }
    },
    [trackToAddToPlaylist],
  );
  // -------------------------

  const getActiveHeaderInfo = useCallback(() => {
    if (selectedAlbum)
      return { title: "ALBUM", icon: Disc, color: colors.highlight };
    if (selectedArtist)
      return { title: "ARTIST", icon: Users, color: colors.green };
    if (selectedPlaylist)
      return { title: "PLAYLIST", icon: ListMusic, color: "#E6E6FA" };
    if (isSelectingPlaylist)
      return { title: "SELECT PLAYLIST", icon: ListMusic, color: "#E6E6FA" };

    const currentItem = libraryItems.find((i) => i.id === currentView);
    return {
      title: (currentView === "library"
        ? "LIBRARY"
        : currentView
      ).toUpperCase(),
      icon: currentView === "library" ? Music : currentItem?.icon,
      color: currentItem?.color || colors.background,
    };
  }, [
    selectedAlbum,
    selectedArtist,
    selectedPlaylist,
    isSelectingPlaylist,
    currentView,
    libraryItems,
    colors,
  ]);

  const renderSearchModule = useCallback(
    () => (
      <ScrollView
        style={styles.moduleContainer}
        contentContainerStyle={{ gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brutalistSearchBox}>
          <Search size={16} color={colors.text} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.brutalistInput}
            placeholder="Search tracks, artists, and albums"
            placeholderTextColor="rgba(0,0,0,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>

        {isSearching && (
          <View style={styles.moduleSection}>
            {[...Array(5)].map((_, i) => (
              <TrackSkeleton key={`skeleton-${i}`} />
            ))}
          </View>
        )}

        {!isSearching && searchQuery && (
          <>
            {/* In your Library */}
            {(() => {
              const libTracks = searchResults.tracks.filter((t) =>
                isFavorite("track", t.id),
              );
              const libAlbums = searchResults.albums.filter((a) =>
                isFavorite("album", a.id),
              );
              const libArtists = searchResults.artists.filter((ar) =>
                isFavorite("artist", ar.id),
              );
              if (
                libTracks.length === 0 &&
                libAlbums.length === 0 &&
                libArtists.length === 0
              )
                return null;
              return (
                <View>
                  <ThemedText style={styles.artistCVSectionTitle}>
                    In your Library
                  </ThemedText>
                  {libTracks.slice(0, 3).map((track, idx) => (
                    <CompactTrackItem
                      key={`lib-t-${track.id}-${idx}`}
                      track={track}
                      index={idx}
                      isCurrentTrack={currentTrack?.id === track.id}
                      onPress={() => setQueue(libTracks, idx)}
                      onToggleLibrary={handleToggleLibrary}
                      isFavoriteTrack={true}
                      isDownloaded={downloadedTrackIds.has(track.id)}
                    />
                  ))}
                  <View style={[styles.compactGrid, { marginTop: 8 }]}>
                    {libAlbums.slice(0, 4).map((album, idx) => (
                      <CompactGridItem
                        key={`lib-a-${album.id}-${idx}`}
                        item={album}
                        onPress={() => setSelectedAlbum(album)}
                      />
                    ))}
                  </View>
                  <View style={[styles.compactGrid, { marginTop: 8 }]}>
                    {libArtists.slice(0, 4).map((artist, idx) => (
                      <CompactGridItem
                        key={`lib-ar-${artist.id}-${idx}`}
                        item={artist}
                        type="artist"
                        onPress={() => setSelectedArtist(artist)}
                      />
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Tracks */}
            {searchResults.tracks.length > 0 && (
              <View>
                <ThemedText style={styles.artistCVSectionTitle}>
                  Tracks
                </ThemedText>
                {searchResults.tracks.map((track, idx) => (
                  <CompactTrackItem
                    key={`t-${track.id}-${idx}`}
                    track={track}
                    index={idx}
                    isCurrentTrack={currentTrack?.id === track.id}
                    onPress={() => setQueue(searchResults.tracks, idx)}
                    onToggleLibrary={handleToggleLibrary}
                    isFavoriteTrack={isFavorite("track", track.id)}
                    isDownloaded={downloadedTrackIds.has(track.id)}
                  />
                ))}
              </View>
            )}

            {/* Albums */}
            {searchResults.albums.length > 0 && (
              <View>
                <ThemedText style={styles.artistCVSectionTitle}>
                  Albums
                </ThemedText>
                <View style={styles.compactGrid}>
                  {searchResults.albums.map((album, idx) => (
                    <CompactGridItem
                      key={`al-${album.id}-${idx}`}
                      item={album}
                      onPress={() => setSelectedAlbum(album)}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Artists */}
            {searchResults.artists.length > 0 && (
              <View>
                <ThemedText style={styles.artistCVSectionTitle}>
                  Artists
                </ThemedText>
                <View style={styles.compactGrid}>
                  {searchResults.artists.map((artist, idx) => (
                    <CompactGridItem
                      key={`ar-${artist.id}-${idx}`}
                      item={artist}
                      type="artist"
                      onPress={() => setSelectedArtist(artist)}
                    />
                  ))}
                </View>
              </View>
            )}

            {searchResults.tracks.length === 0 &&
              searchResults.albums.length === 0 &&
              searchResults.artists.length === 0 && (
                <ThemedText style={styles.noResultsText}>
                  NO DATA FOUND FOR: {searchQuery.toUpperCase()}
                </ThemedText>
              )}
          </>
        )}
      </ScrollView>
    ),
    [
      searchQuery,
      isSearching,
      searchResults,
      currentTrack,
      handleToggleLibrary,
      isFavorite,
      setQueue,
      setSelectedAlbum,
      setSelectedArtist,
      colors,
      downloadedTrackIds,
    ],
  );

  const renderTracksModule = useCallback(
    (tracks: any[], title: string) => (
      <View style={styles.moduleContainer}>
        {tracks.length > 0 ? (
          tracks.map((track, idx) => (
            <CompactTrackItem
              key={`${track.id}-${idx}`}
              track={track}
              index={idx}
              isCurrentTrack={currentTrack?.id === track.id}
              onPress={() => setQueue(tracks, idx)}
              onToggleLibrary={handleToggleLibrary}
              isFavoriteTrack={isFavorite("track", track.id)}
              isDownloaded={downloadedTrackIds.has(track.id)}
            />
          ))
        ) : (
          <View style={styles.emptyViewContainer}>
            <ThemedText style={styles.noResultsText}>
              NO TRACKS FOUND
            </ThemedText>
          </View>
        )}
      </View>
    ),
    [
      currentTrack,
      handleToggleLibrary,
      isFavorite,
      setQueue,
      downloadedTrackIds,
    ],
  );

  const renderAlbumsModule = useCallback(
    (albums: any[], title: string) => (
      <View style={styles.moduleContainer}>
        {albums.length > 0 ? (
          <View style={styles.compactGrid}>
            {albums.map((album, idx) => (
              <CompactGridItem
                key={`${album.id}-${idx}`}
                item={album}
                onPress={() => setSelectedAlbum(album)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyViewContainer}>
            <ThemedText style={styles.noResultsText}>
              NO ALBUMS FOUND
            </ThemedText>
          </View>
        )}
      </View>
    ),
    [],
  );

  const renderArtistsModule = useCallback(
    (artists: any[], title: string) => (
      <View style={styles.moduleContainer}>
        {artists.length > 0 ? (
          <View style={styles.compactGrid}>
            {artists.map((artist, idx) => (
              <CompactGridItem
                key={`${artist.id}-${idx}`}
                item={artist}
                type="artist"
                onPress={() => setSelectedArtist(artist)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyViewContainer}>
            <ThemedText style={styles.noResultsText}>
              NO ARTISTS FOUND
            </ThemedText>
          </View>
        )}
      </View>
    ),
    [setSelectedArtist],
  );

  const renderInlinePlaylistForm = useCallback(
    (playlists: any[]) => {
      const existing = editingPlaylistId
        ? playlists.find((p) => p.id === editingPlaylistId) || selectedPlaylist
        : undefined;

      return (
        <View style={styles.inlineFormContainer}>
          <View style={styles.inlineFormHeader}>
            <ThemedText style={styles.inlineFormTitle}>
              {editingPlaylistId
                ? "EDIT PLAYLIST"
                : importMode
                  ? "IMPORT PLAYLIST"
                  : "NEW PLAYLIST"}
            </ThemedText>
          </View>

          <View style={styles.inlineInputGroup}>
            <ThemedText style={styles.inlineInputLabel}>TITLE</ThemedText>
            <TextInput
              style={styles.brutalistInput}
              placeholder="Enter playlist name..."
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={playlistTitle}
              onChangeText={setPlaylistTitle}
              autoFocus
            />
          </View>

          <View style={styles.inlineInputGroup}>
            <ThemedText style={styles.inlineInputLabel}>DESCRIPTION</ThemedText>
            <TextInput
              style={[styles.brutalistInput, { height: 60 }]}
              placeholder="Description (optional)"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={playlistDescription}
              onChangeText={setPlaylistDescription}
              multiline
            />
          </View>

          {importMode && !editingPlaylistId && (
            <>
              <TouchableOpacity
                style={styles.inlineFilePicker}
                onPress={handlePickFile}
              >
                <ThemedText style={styles.inlineFilePickerText}>
                  {importFile
                    ? importFile.name.toUpperCase()
                    : "SELECT .CSV FILE"}
                </ThemedText>
              </TouchableOpacity>

              <View style={styles.inlineToggleRow}>
                <ThemedText style={styles.inlineToggleLabel}>
                  STRICT ARTIST MATCH
                </ThemedText>
                <TouchableOpacity
                  style={[
                    styles.inlineCheckbox,
                    strictArtistMatch && styles.inlineCheckboxChecked,
                  ]}
                  onPress={() => setStrictArtistMatch(!strictArtistMatch)}
                >
                  {strictArtistMatch && <Check size={10} color={colors.text} />}
                </TouchableOpacity>
              </View>

              <View style={styles.inlineToggleRow}>
                <ThemedText style={styles.inlineToggleLabel}>
                  MATCH ALBUM NAME
                </ThemedText>
                <TouchableOpacity
                  style={[
                    styles.inlineCheckbox,
                    albumMatch && styles.inlineCheckboxChecked,
                  ]}
                  onPress={() => setAlbumMatch(!albumMatch)}
                >
                  {albumMatch && <Check size={10} color={colors.text} />}
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.inlineFormActions}>
            <TouchableOpacity
              style={[
                styles.inlineFormButton,
                { backgroundColor: colors.accent },
              ]}
              onPress={() => handleSavePlaylist(existing)}
              disabled={isSavingPlaylist}
            >
              {isSavingPlaylist ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <ThemedText style={styles.inlineFormButtonText}>
                  {editingPlaylistId
                    ? "UPDATE"
                    : importMode
                      ? "IMPORT"
                      : "CREATE"}
                </ThemedText>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.inlineFormButton,
                { backgroundColor: colors.windowBg },
              ]}
              onPress={() => {
                setIsCreatingPlaylist(false);
                setEditingPlaylistId(null);
                setPlaylistTitle("");
                setPlaylistDescription("");
                setImportFile(null);
                setImportMode(false);
              }}
            >
              <ThemedText style={styles.inlineFormButtonText}>
                CANCEL
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [
      editingPlaylistId,
      selectedPlaylist,
      importMode,
      playlistTitle,
      playlistDescription,
      handlePickFile,
      importFile,
      strictArtistMatch,
      albumMatch,
      handleSavePlaylist,
      isSavingPlaylist,
    ],
  );

  const renderPlaylistsModule = useCallback(
    (
      playlists: any[],
      title: string,
      selectionMode?: boolean,
      onSelectPlaylist?: (playlist: any) => void,
      trackToAdd?: any,
    ) => (
      <View style={styles.moduleContainer}>
        {/* Inline Playlist Creation/Editing */}
        {(isCreatingPlaylist || editingPlaylistId) &&
          renderInlinePlaylistForm(playlists)}

        {playlists.length > 0 ? (
          playlists.map((playlist, idx) => {
            const isTrackInPlaylist = trackToAdd
              ? playlist.tracks?.some((t: any) => t.id === trackToAdd.id)
              : false;
            return (
              <TouchableOpacity
                key={`${playlist.id}-${idx}`}
                style={styles.compactListItem}
                onPress={() =>
                  selectionMode && onSelectPlaylist
                    ? onSelectPlaylist(playlist)
                    : setSelectedPlaylist(playlist)
                }
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1,
                    gap: 12,
                  }}
                >
                  <View style={styles.compactPlaylistIcon}>
                    <ListMusic size={16} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={styles.compactItemTitle}
                      numberOfLines={1}
                    >
                      {playlist.title.toUpperCase()}
                    </ThemedText>
                    <ThemedText
                      style={styles.compactItemSubtitle}
                      numberOfLines={1}
                    >
                      {playlist.trackCount || 0}{" "}
                      {playlist.trackCount === 1 ? "TRACK" : "TRACKS"}
                    </ThemedText>
                  </View>
                  {selectionMode && isTrackInPlaylist && (
                    <View style={styles.playlistCheckmark}>
                      <Check size={14} color={colors.text} strokeWidth={3} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyViewContainer}>
            <ThemedText style={styles.noResultsText}>
              NO PLAYLISTS FOUND
            </ThemedText>
          </View>
        )}
      </View>
    ),
    [
      isCreatingPlaylist,
      editingPlaylistId,
      renderInlinePlaylistForm,
      setSelectedPlaylist,
      isSelectingPlaylist,
      handleSelectPlaylistToAddTrack,
      trackToAddToPlaylist,
      colors,
    ],
  );

  const renderViewportContent = useCallback(() => {
    if (selectedAlbum) return renderAlbumDetail(selectedAlbum);
    if (selectedArtist) return renderArtistDetail(selectedArtist);
    if (selectedPlaylist) return renderPlaylistDetail(selectedPlaylist);
    if (isSelectingPlaylist) {
      return renderPlaylistsModule(
        [...favoritePlaylists, ...userPlaylists],
        "SELECT PLAYLIST",
        true,
        handleSelectPlaylistToAddTrack,
        trackToAddToPlaylist,
      );
    }

    switch (currentView) {
      case "library":
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
                  <item.icon size={20} color={colors.text} />
                </View>
                <View style={styles.libraryTextContainer}>
                  <ThemedText style={styles.libraryItemTitle}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.libraryItemCount}>
                    {item.count !== null
                      ? `${item.count} ${item.count === 1 ? "ITEM" : "ITEMS"}`
                      : "EXPLORE LIBRARY"}
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
        return renderArtistsModule(derivedArtists, "FAVORITE ARTISTS");
      case "playlists":
        return renderPlaylistsModule(
          [...favoritePlaylists, ...userPlaylists],
          "ALL PLAYLISTS",
        );
      default:
        return null;
    }
  }, [
    selectedAlbum,
    renderAlbumDetail,
    selectedArtist,
    renderArtistDetail,
    selectedPlaylist,
    renderPlaylistDetail,
    currentView,
    libraryItems,
    renderSearchModule,
    renderTracksModule,
    favoriteTracks,
    renderAlbumsModule,
    favoriteAlbums,
    renderArtistsModule,
    favoriteArtists,
    renderPlaylistsModule,
    favoritePlaylists,
    userPlaylists,
    isSelectingPlaylist,
    handleSelectPlaylistToAddTrack,
    trackToAddToPlaylist,
  ]);

  // Detail Views
  const [albumTracks, setAlbumTracks] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const vinylTranslateX = useSharedValue(0);

  useEffect(() => {
    if (selectedAlbum && !loadingDetail) {
      vinylTranslateX.value = withDelay(
        500,
        withSpring(25, { damping: 20, stiffness: 40 }),
      );
    } else {
      vinylTranslateX.value = 0;
    }
  }, [selectedAlbum, loadingDetail, vinylTranslateX]);

  const vinylStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: vinylTranslateX.value }],
    };
  });

  const textAnimationStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: vinylTranslateX.value }],
    };
  });

  useEffect(() => {
    if (selectedAlbum) {
      setLoadingDetail(true);
      musicService
        .getAlbum(selectedAlbum.id, selectedAlbum.provider)
        .then((data: any) => {
          setAlbumTracks(data.tracks || []);
          setLoadingDetail(false);
        })
        .catch((err) => {
          console.error("Failed to fetch album tracks:", err);
          setLoadingDetail(false);
        });
    }
    if (selectedPlaylist) {
      setLoadingDetail(true);
      musicService
        .getPlaylist(selectedPlaylist.id, selectedPlaylist.provider)
        .then((data: any) => {
          if (selectedPlaylist && data) {
            setAlbumTracks(data.tracks || []);
          } else {
            setAlbumTracks([]);
          }
          setLoadingDetail(false);
        })
        .catch((err) => {
          console.error("Failed to fetch playlist tracks:", err);
          setLoadingDetail(false);
        });
    } else {
      setAlbumTracks([]);
    }
  }, [selectedAlbum, selectedPlaylist]);

  const renderAlbumDetail = useCallback(
    (album: any) => (
      <View style={styles.moduleContainer}>
        <View style={styles.detailHeader}>
          <View style={styles.vinylContainer}>
            <Animated.View style={[styles.vinylDisc, vinylStyle]}>
              {[...Array(6)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.vinylGroove,
                    {
                      width: `${100 - i * 15}%`,
                      height: `${100 - i * 15}%`,
                    },
                  ]}
                />
              ))}
              <View
                style={[
                  styles.vinylGroove,
                  {
                    width: 4,
                    height: 4,
                    backgroundColor: "rgba(255,255,255,0.1)",
                  },
                ]}
              />
            </Animated.View>
            <Image
              source={{ uri: album.imageUrl || album.coverUrl }}
              style={styles.detailImage}
            />
          </View>
          <Animated.View style={[styles.detailTextInfo, textAnimationStyle]}>
            <ThemedText style={styles.detailTitle}>
              {album.title?.toUpperCase() || "UNKNOWN ALBUM"}
            </ThemedText>
            <ThemedText style={styles.detailSubtitle}>
              {album.artist?.name?.toUpperCase() || "UNKNOWN ARTIST"}
            </ThemedText>
          </Animated.View>
        </View>

        <View style={styles.moduleSection}>
          {loadingDetail ? (
            <View style={{ gap: 0 }}>
              {[...Array(6)].map((_, i) => (
                <TrackSkeleton key={i} />
              ))}
            </View>
          ) : albumTracks && albumTracks.length > 0 ? (
            albumTracks.map((track, idx) => (
              <CompactTrackItem
                key={`${track.id}-${idx}`}
                track={track}
                index={idx}
                isCurrentTrack={currentTrack?.id === track.id}
                onPress={() => setQueue(albumTracks, idx)}
                onToggleLibrary={handleToggleLibrary}
                isFavoriteTrack={isFavorite("track", track.id)}
                isDownloaded={downloadedTrackIds.has(track.id)}
              />
            ))
          ) : (
            <View style={styles.emptyViewContainer}>
              <ThemedText style={styles.noResultsText}>
                NO TRACKS FOUND
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    ),
    [
      loadingDetail,
      albumTracks,
      currentTrack,
      handleToggleLibrary,
      isFavorite,
      setQueue,
      vinylStyle,
      textAnimationStyle,
      downloadedTrackIds,
    ],
  );

  const renderPlaylistDetail = useCallback(
    (playlist: any) => (
      <View style={styles.moduleContainer}>
        {editingPlaylistId === playlist.id ? (
          renderInlinePlaylistForm([])
        ) : (
          <>
            <View style={styles.detailHeader}>
              <View
                style={[
                  styles.detailImage,
                  styles.compactPlaylistIcon,
                  { width: 80, height: 80 },
                ]}
              >
                <ListMusic size={40} color={colors.text} />
              </View>
              <View style={styles.detailTextInfo}>
                <ThemedText style={styles.detailTitle}>
                  {playlist.title?.toUpperCase() || "UNKNOWN PLAYLIST"}
                </ThemedText>
                <ThemedText style={styles.detailSubtitle}>
                  {playlist.description
                    ? playlist.description.toUpperCase()
                    : `${playlist.trackCount || 0} ${playlist.trackCount === 1 ? "TRACK" : "TRACKS"}`}
                </ThemedText>
              </View>
            </View>

            <View style={styles.moduleSection}>
              {loadingDetail ? (
                <View style={{ gap: 0 }}>
                  {[...Array(6)].map((_, i) => (
                    <TrackSkeleton key={i} />
                  ))}
                </View>
              ) : albumTracks && albumTracks.length > 0 ? (
                albumTracks.map((track, idx) => (
                  <CompactTrackItem
                    key={`${track.id}-${idx}`}
                    track={track}
                    index={idx}
                    isCurrentTrack={currentTrack?.id === track.id}
                    onPress={() => setQueue(albumTracks, idx)}
                    onToggleLibrary={handleToggleLibrary}
                    isFavoriteTrack={isFavorite("track", track.id)}
                    isDownloaded={downloadedTrackIds.has(track.id)}
                  />
                ))
              ) : (
                <View style={styles.emptyViewContainer}>
                  <ThemedText style={styles.noResultsText}>
                    NO TRACKS FOUND
                  </ThemedText>
                </View>
              )}
            </View>
          </>
        )}
      </View>
    ),
    [
      editingPlaylistId,
      renderInlinePlaylistForm,
      loadingDetail,
      albumTracks,
      currentTrack,
      handleToggleLibrary,
      isFavorite,
      setQueue,
      downloadedTrackIds,
    ],
  );

  const renderArtistDetail = useCallback(
    (artist: any) => (
      <View style={styles.moduleContainer}>
        {loadingArtist ? (
          <HeroSkeleton borderRadius={90} />
        ) : artistData ? (
          <View style={styles.artistCVContainer}>
            {/* Header: Image and Name (Centered) */}
            <View style={styles.artistCVHeader}>
              <Image
                source={{ uri: artistData.imageUrl || artistData.coverUrl }}
                style={styles.artistCVImage}
              />
              <ThemedText style={[styles.detailTitle, { textAlign: "center" }]}>
                {artistData.name?.toUpperCase()}
              </ThemedText>
            </View>

            {/* Content: Tracks and Albums (Full Width) */}
            <View style={styles.artistCVContent}>
              {/* Popular Tracks */}
              {artistData.tracks && artistData.tracks.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <ThemedText style={styles.artistCVSectionTitle}>
                    Popular Tracks
                  </ThemedText>
                  {artistData.tracks
                    .slice(0, 5)
                    .map((track: any, idx: number) => (
                      <CompactTrackItem
                        key={`${track.id}-${idx}`}
                        track={track}
                        index={idx}
                        isCurrentTrack={currentTrack?.id === track.id}
                        onPress={() => setQueue(artistData.tracks, idx)}
                        onToggleLibrary={handleToggleLibrary}
                        isFavoriteTrack={isFavorite("track", track.id)}
                        isDownloaded={downloadedTrackIds.has(track.id)}
                      />
                    ))}
                </View>
              )}

              {/* In the Library */}
              {(() => {
                const libraryTracks = favoriteTracks.filter(
                  (t) =>
                    t.artist?.id === artistData.id ||
                    t.artist?.name === artistData.name,
                );
                const libraryAlbums = favoriteAlbums.filter(
                  (a) =>
                    a.artist?.id === artistData.id ||
                    a.artist?.name === artistData.name,
                );

                if (libraryTracks.length === 0 && libraryAlbums.length === 0)
                  return null;

                return (
                  <View style={{ marginBottom: 24 }}>
                    <ThemedText style={styles.artistCVSectionTitle}>
                      In the Library
                    </ThemedText>
                    {libraryTracks
                      .slice(0, 3)
                      .map((track: any, idx: number) => (
                        <CompactTrackItem
                          key={`lib-${track.id}-${idx}`}
                          track={track}
                          index={idx}
                          isCurrentTrack={currentTrack?.id === track.id}
                          onPress={() => setQueue(libraryTracks, idx)}
                          onToggleLibrary={handleToggleLibrary}
                          isFavoriteTrack={true}
                          isDownloaded={downloadedTrackIds.has(track.id)}
                        />
                      ))}
                    <View style={[styles.compactGrid, { marginTop: 8 }]}>
                      {libraryAlbums
                        .slice(0, 4)
                        .map((album: any, idx: number) => (
                          <CompactGridItem
                            key={`lib-alb-${album.id}-${idx}`}
                            item={album}
                            onPress={() => setSelectedAlbum(album)}
                          />
                        ))}
                    </View>
                  </View>
                );
              })()}

              {/* Albums */}
              {artistData.albums && artistData.albums.length > 0 && (
                <View>
                  <ThemedText style={styles.artistCVSectionTitle}>
                    Albums
                  </ThemedText>
                  <View style={styles.compactGrid}>
                    {artistData.albums
                      .slice(0, 8)
                      .map((album: any, idx: number) => (
                        <CompactGridItem
                          key={`${album.id}-${idx}`}
                          item={album}
                          onPress={() => setSelectedAlbum(album)}
                        />
                      ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.emptyViewContainer}>
            <ThemedText style={styles.noResultsText}>
              FAILED TO LOAD ARTIST DATA
            </ThemedText>
          </View>
        )}
      </View>
    ),
    [
      loadingArtist,
      artistData,
      currentTrack,
      handleToggleLibrary,
      isFavorite,
      setQueue,
      setSelectedAlbum,
      favoriteTracks,
      favoriteAlbums,
      downloadedTrackIds,
    ],
  );

  const handleBack = useCallback(() => {
    if (editingPlaylistId || isCreatingPlaylist) {
      setEditingPlaylistId(null);
      setIsCreatingPlaylist(false);
      return;
    }
    if (isSelectingPlaylist) {
      setIsSelectingPlaylist(false);
      setTrackToAddToPlaylist(null);
      return;
    }
    if (selectedAlbum) setSelectedAlbum(null);
    else if (selectedArtist) setSelectedArtist(null);
    else if (selectedPlaylist) setSelectedPlaylist(null);
    else setCurrentView("library");
  }, [
    editingPlaylistId,
    isCreatingPlaylist,
    isSelectingPlaylist,
    selectedAlbum,
    selectedArtist,
    selectedPlaylist,
  ]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
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
          style={[
            styles.viewportHeader,
            { backgroundColor: getActiveHeaderInfo().color },
          ]}
        >
          {/* Background Stripes */}
          <View style={styles.viewportStripesContainer} pointerEvents="none">
            <View style={styles.viewportStripe} />
            <View style={styles.viewportStripe} />
            <View style={styles.viewportStripe} />
            <View style={styles.viewportStripe} />
          </View>

          {/* Status Bar / Download Progress */}
          {isDownloading && (
            <View style={styles.viewportStatusBar}>
              <View
                style={[
                  styles.viewportProgressBar,
                  { width: `${downloadProgress * 100}%` },
                ]}
              />
            </View>
          )}

          <View
            style={[
              styles.viewportHeaderLeft,
              { backgroundColor: getActiveHeaderInfo().color },
            ]}
          >
            {(() => {
              const { icon: HeaderIcon } = getActiveHeaderInfo();
              return (
                HeaderIcon && (
                  <HeaderIcon
                    size={12}
                    color={colors.text}
                    style={{ marginRight: 6 }}
                  />
                )
              );
            })()}
            <ThemedText style={styles.viewportModeLabel}>
              {getActiveHeaderInfo().title}
            </ThemedText>
          </View>
          {currentView !== "library" ||
          selectedAlbum ||
          selectedArtist ||
          selectedPlaylist ||
          isSelectingPlaylist ? (
            <View
              style={[
                styles.viewportHeaderRight,
                { backgroundColor: getActiveHeaderInfo().color },
              ]}
            >
              <TouchableOpacity
                onPress={handleBack}
                style={[
                  styles.viewportBackButton,
                  { backgroundColor: getActiveHeaderInfo().color },
                ]}
              >
                <X size={14} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : (
            /* Empty placeholder to keep title centered or layout consistent if needed, 
               but here we just want the stripes to continue or be masked at the end */
            <View
              style={[
                styles.viewportHeaderRight,
                { backgroundColor: getActiveHeaderInfo().color },
              ]}
            />
          )}
        </View>

        {/* Action Toolbar Ribbon (Fixed at top of viewport) */}
        {selectedAlbum || selectedPlaylist ? (
          <ToolbarRibbon
            type={selectedAlbum ? "album" : "playlist"}
            item={selectedAlbum || selectedPlaylist}
            favorited={isFavorite(
              (selectedAlbum ? "album" : "playlist") as any,
              (selectedAlbum || selectedPlaylist).id,
            )}
            onLike={() => {
              const item = selectedAlbum || selectedPlaylist;
              const type = selectedAlbum ? "album" : "playlist";
              handleToggleLibrary(type, item);
            }}
            onDownload={() => {
              const item = selectedAlbum || selectedPlaylist;
              const type = selectedAlbum ? "album" : "playlist";
              handleDownloadItem(type, item);
            }}
            downloadDisabled={
              selectedPlaylist &&
              (selectedPlaylist.tracks?.length === 0 ||
                selectedPlaylist.trackCount === 0)
            }
            downloadProgress={
              (selectedAlbum || selectedPlaylist)?.id === downloadingItemId
                ? downloadingItemProgress
                : 0
            }
            isDownloaded={
              selectedAlbum
                ? albumTracks.length > 0 &&
                  albumTracks.every((t: any) => downloadedTrackIds.has(t.id))
                : selectedPlaylist
                  ? selectedPlaylist.tracks?.length > 0 &&
                    selectedPlaylist.tracks?.every((t: any) =>
                      downloadedTrackIds.has(t.id),
                    )
                  : false
            }
            onEdit={
              selectedPlaylist?.id?.startsWith("local:")
                ? () => {
                    setEditingPlaylistId(selectedPlaylist.id);
                    setPlaylistTitle(selectedPlaylist.title);
                    setPlaylistDescription(selectedPlaylist.description || "");
                  }
                : undefined
            }
            onDelete={
              selectedPlaylist?.id?.startsWith("local:")
                ? () => handleDeletePlaylist(selectedPlaylist.id)
                : undefined
            }
          />
        ) : (
          currentView === "playlists" &&
          !isCreatingPlaylist &&
          !editingPlaylistId && (
            <View style={styles.toolbarRibbon}>
              <TouchableOpacity
                style={styles.toolbarItem}
                onPress={() => {
                  setPlaylistTitle("");
                  setPlaylistDescription("");
                  setImportMode(false);
                  setIsCreatingPlaylist(true);
                }}
              >
                <Plus size={12} color={colors.text} />
                <ThemedText style={styles.toolbarText}>NEW PLAYLIST</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolbarItem, { borderRightWidth: 0 }]}
                onPress={() => {
                  setPlaylistTitle("");
                  setPlaylistDescription("");
                  setImportMode(true);
                  setIsCreatingPlaylist(true);
                }}
              >
                <FileUp size={12} color={colors.text} />
                <ThemedText style={styles.toolbarText}>IMPORT CSV</ThemedText>
              </TouchableOpacity>
            </View>
          )
        )}

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
      <PlaybackInfoSection
        currentTrack={currentTrack}
        favorited={favorited}
        onToggleFavorite={handleToggleFavorite}
        position={position}
        duration={duration}
        animatedDiscStyle={animatedDiscStyle}
        downloadStatus={downloadStatus}
        downloadProgress={downloadProgress}
        onDownload={handleDownload}
        onPlayPause={togglePlayPause}
        onNext={skipToNext}
        onPrev={skipToPrevious}
        onAddToPlaylist={handleAddToPlaylist}
      />
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
    color: Palette.black,
  },
  mainContentView: {
    flex: 1, // Let it fill the remaining space
    backgroundColor: Palette.cream,
    marginBottom: 14,
  },
  viewportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    backgroundColor: Palette.beige,
    borderBottomWidth: 2,
    borderBottomColor: Palette.black,
    position: "relative",
  },
  viewportStripesContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  viewportStripe: {
    width: "100%",
    height: 1,
    backgroundColor: Palette.black,
    marginVertical: 1,
    opacity: 0.8,
  },
  viewportHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 1,
  },
  viewportHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 1,
  },
  viewportModeLabel: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    letterSpacing: 1,
    color: Palette.black,
  },
  viewportBackButton: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Palette.black,
    backgroundColor: Palette.cream,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  roundedContainer: {
    borderRadius: Radii.m,
    borderWidth: 2,
    borderColor: Palette.black,
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
    backgroundColor: Palette.cream,
    borderWidth: 2,
    borderColor: Palette.black,
    borderRadius: Radii.m,
    minHeight: 64,
  },
  libraryIconContainer: {
    width: 42,
    height: 42,
    borderRadius: Radii.sm,
    backgroundColor: Palette.blue,
    borderWidth: 1,
    borderColor: Palette.black,
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
    color: Palette.black,
  },
  libraryItemCount: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    color: Palette.black,
    opacity: 0.5,
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
    color: Palette.black,
  },
  brutalistSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: Palette.black,
    borderRadius: Radii.sm,
    paddingHorizontal: 10,
    height: 38,
  },
  brutalistInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Palette.black,
    letterSpacing: 0.5,
  },
  compactTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  compactTrackNumber: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    opacity: 0.3,
    width: 24,
    color: Palette.black,
  },
  compactTrackInfo: {
    flex: 1,
    marginRight: 10,
  },
  compactTrackTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Palette.black,
  },
  compactTrackArtist: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    opacity: 0.6,
    color: Palette.black,
  },
  compactTrackDuration: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    opacity: 0.4,
    color: Palette.black,
  },
  smallDownloadedBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Palette.green,
    borderWidth: 1,
    borderColor: Palette.black,
    justifyContent: "center",
    alignItems: "center",
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
    borderWidth: 1,
    borderColor: Palette.black,
  },
  compactGridTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    textAlign: "center",
    color: Palette.black,
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
    borderWidth: 1,
    borderColor: Palette.black,
  },
  compactPlaylistIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.sm,
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Palette.black,
  },
  compactItemTitle: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Palette.black,
  },
  compactItemSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    opacity: 0.5,
    color: Palette.black,
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
    color: Palette.black,
  },
  // --- Inline Form Styles ---
  inlineFormContainer: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: Palette.black,
    borderRadius: Radii.sm,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  inlineFormTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    letterSpacing: 1,
    color: Palette.black,
    opacity: 0.6,
  },
  inlineFormHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  inlineModeSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: Radii.xs,
    padding: 2,
    borderWidth: 1,
    borderColor: Palette.black,
  },
  inlineModeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.xs,
  },
  inlineModeBtnActive: {
    backgroundColor: Palette.black,
  },
  inlineModeText: {
    fontFamily: Fonts.displayBold,
    fontSize: 8,
    color: Palette.black,
  },
  inlineModeTextActive: {
    color: "#FFF",
  },
  inlineInputGroup: {
    gap: 4,
  },
  inlineInputLabel: {
    fontFamily: Fonts.displayBold,
    fontSize: 8,
    letterSpacing: 0.5,
    color: Palette.black,
    opacity: 0.5,
  },
  inlineFilePicker: {
    height: 36,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Palette.black,
    borderRadius: Radii.xs,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  inlineFilePickerText: {
    fontFamily: Fonts.displayBold,
    fontSize: 9,
    color: Palette.black,
    opacity: 0.6,
  },
  inlineFormActions: {
    flexDirection: "row",
    gap: 8,
  },
  inlineFormButton: {
    flex: 1,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Palette.black,
    borderRadius: Radii.xs,
  },
  inlineFormButtonText: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    color: Palette.black,
  },
  inlineToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  inlineToggleLabel: {
    fontFamily: Fonts.displayBold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: Palette.black,
    opacity: 0.7,
  },
  inlineCheckbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: Palette.black,
    borderRadius: 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  inlineCheckboxChecked: {
    backgroundColor: Palette.green,
  },
  // --- Inline Action Styles ---
  inlineActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineActionBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  detailActions: {
    flexDirection: "row",
    gap: 10,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 0,
  },
  toolbarRibbon: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderBottomWidth: 1,
    borderColor: Palette.black,
    justifyContent: "space-between",
  },
  toolbarItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.1)",
    gap: 6,
  },
  toolbarItemDisabled: {
    opacity: 0.4,
  },
  toolbarItemFavorited: {
    backgroundColor: Palette.pink,
  },
  toolbarTextFavorited: {
    color: Palette.black,
  },
  toolbarDownloadItem: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  toolbarDownloadInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  toolbarDownloadProgress: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: Palette.green,
  },
  toolbarDownloadItemDownloaded: {
    backgroundColor: Palette.green,
  },
  toolbarText: {
    fontFamily: Fonts.displayBold,
    fontSize: 9,
    letterSpacing: 1,
    color: Palette.black,
  },
  toolbarTextDisabled: {
    color: "rgba(0,0,0,0.3)",
  },
  viewportStatusBar: {
    position: "absolute",
    bottom: -2,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(0,0,0,0.1)",
    zIndex: 10,
  },
  // --- Artist CV Styles ---
  artistCVContainer: {
    paddingTop: 16,
    gap: 32,
  },
  artistCVHeader: {
    alignItems: "center",
    gap: 16,
  },
  artistCVContent: {
    flex: 1,
    width: "100%",
  },
  artistCVImage: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: Palette.black,
  },
  artistCVBio: {
    fontFamily: Fonts.regular,
    fontSize: 10,
    lineHeight: 14,
    color: Palette.black,
    opacity: 0.8,
  },
  artistCVSectionTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    color: Palette.black,
  },
  // -------------------------
  viewportProgressBar: {
    height: "100%",
    backgroundColor: Palette.black,
  },
  detailImage: {
    width: 80,
    height: 80,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Palette.black,
    backgroundColor: "#FFF",
    zIndex: 2,
  },
  // --- Vinyl Animation Styles ---
  vinylContainer: {
    width: 80,
    height: 80,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  vinylDisc: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
    borderWidth: 1,
    borderColor: "#222",
  },
  vinylGroove: {
    position: "absolute",
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  // -----------------------------
  detailTextInfo: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 18,
    color: Palette.black,
  },
  detailSubtitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 12,
    opacity: 0.6,
    color: Palette.black,
  },
  ditherOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
    backgroundColor: "transparent",
  },
  trackInfoSection: {
    backgroundColor: Palette.cream,
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
  },
  metadataArtist: {
    color: "#FFF",
    fontFamily: Fonts.regular,
    fontSize: 11,
    opacity: 0.7,
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
    borderWidth: 1,
    borderColor: Palette.black,
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
    backgroundColor: Palette.cream,
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
    backgroundColor: Palette.cream,
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
    backgroundColor: Palette.cream,
    borderWidth: 2,
    borderColor: Palette.black,
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
    backgroundColor: Palette.blue, // Light blue as in image
    borderColor: Palette.black,
  },
  pauseBtnHardware: {
    backgroundColor: "#FFF",
    borderColor: Palette.black,
  },
  downloadBtnHardware: {
    backgroundColor: "#FFF",
    borderColor: Palette.black,
    overflow: "hidden",
  },
  downloadProgressBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: Palette.green,
  },
  addBtnHardware: {
    backgroundColor: Palette.pink, // Pink as in image
    borderColor: Palette.black,
  },
  playlistCheckmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Palette.green,
    borderWidth: 1,
    borderColor: Palette.black,
    justifyContent: "center",
    alignItems: "center",
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
    borderWidth: 1,
    borderColor: Palette.black,
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
    borderColor: Palette.black,
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
    borderColor: Palette.black,
  },
  ditherPattern: {
    flex: 1,
    height: "100%",
    backgroundColor: "#DDD",
    // Pattern background
  },
});
