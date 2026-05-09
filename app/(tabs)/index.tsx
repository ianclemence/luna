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
  Pause,
  Pencil,
  Plus,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
import { Colors, Fonts, Palette, Spacing } from "../../constants/theme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { musicService } from "../../services/music-service";
import { playlistImporter } from "../../services/playlist-importer";
import { storageService } from "../../services/storage-service";
import { showToast } from "../../services/toast-store";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
    return (
      <TouchableOpacity style={styles.compactGridItem} onPress={onPress}>
        <View>
          <Image
            source={{ uri: item.imageUrl || item.coverUrl }}
            style={[
              styles.compactGridImage,
              { borderColor: Palette.border },
            ]}
          />
        </View>
        <ThemedText
          style={[styles.compactGridTitle, { color: Palette.white }]}
          numberOfLines={1}
        >
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
    downloadStatus,
    downloadProgress,
    index,
    onRemove,
  }: {
    track: any;
    onPress: () => void;
    isCurrentTrack?: boolean;
    onToggleLibrary: (type: string, item: any) => void;
    isFavoriteTrack: boolean;
    isDownloaded?: boolean;
    downloadProgress?: number;
    downloadStatus?: string;
    index?: number;
    onRemove?: (track: any) => void;
  }) => {
    const isExplicit = track.explicit || track.explicitLyrics;
    const quality = track.audioQuality || track.quality;
    const isHiRes = quality === "HI_RES_LOSSLESS" || quality === "MASTER";

    return (
      <TouchableOpacity style={styles.compactTrackItem} onPress={onPress}>
        {isCurrentTrack ? (
          <View style={styles.currentTrackIndicator}>
            <Pause size={12} color={Palette.accent} fill={Palette.accent} />
          </View>
        ) : (
          <ThemedText
            style={[styles.compactTrackNumber, { color: Palette.textDim }]}
          >
            {index !== undefined ? String(index + 1).padStart(2, "0") : "--"}
          </ThemedText>
        )}

        <View style={styles.compactTrackInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ThemedText
              style={[
                styles.compactTrackTitle,
                { color: isCurrentTrack ? Palette.accent : Palette.white },
              ]}
              numberOfLines={1}
            >
              {track.title?.toUpperCase() || "UNKNOWN TITLE"}
            </ThemedText>
            {isExplicit && (
              <View style={styles.explicitBadge}>
                <ThemedText style={styles.explicitBadgeText}>E</ThemedText>
              </View>
            )}
            {isHiRes && (
              <View style={styles.qualityBadge}>
                <ThemedText style={styles.qualityBadgeText}>HI-RES</ThemedText>
              </View>
            )}
            {isDownloaded && (
              <View style={styles.smallDownloadedBadge}>
                <Check size={8} color={Palette.black} strokeWidth={3} />
              </View>
            )}
          </View>
          <ThemedText
            style={[
              styles.compactTrackArtist,
              { color: isCurrentTrack ? Palette.accent : Palette.textMuted },
            ]}
            numberOfLines={1}
          >
            {track.artist?.name?.toUpperCase() || "UNKNOWN ARTIST"}
          </ThemedText>
          {downloadStatus === "downloading" && (
            <View style={styles.downloadProgressBarContainer}>
              <View style={[styles.downloadProgressBarFill, { width: `${(downloadProgress || 0) * 100}%` }]} />
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {onRemove ? (
            <TouchableOpacity onPress={() => onRemove(track)} hitSlop={8}>
              <X size={14} color={Palette.accentBright} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => onToggleLibrary("track", track)}
                hitSlop={8}
                style={[
                  styles.compactTrackHeartBox,
                  {
                    backgroundColor: isFavoriteTrack ? Palette.accent : "transparent",
                    borderColor: isFavoriteTrack ? Palette.accent : Palette.border,
                    borderWidth: isFavoriteTrack ? 0 : 1,
                  }
                ]}
              >
                <Heart
                  size={10}
                  color={isFavoriteTrack ? Palette.black : Palette.textDim}
                  fill={isFavoriteTrack ? Palette.black : "transparent"}
                />
              </TouchableOpacity>
              <ThemedText
                style={[
                  styles.compactTrackDuration,
                  { color: isCurrentTrack ? Palette.accent : Palette.textDim },
                ]}
              >
                {musicService.formatDuration(track.duration || 0)}
              </ThemedText>
            </>
          )}
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
    isDownloading,
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
    isDownloading?: boolean;
  }) => {
    const isLocal = type === "playlist" && item.id.startsWith("local:");

    return (
      <View
        style={[
          styles.toolbarRibbon,
          { backgroundColor: Palette.surface, borderColor: Palette.border },
        ]}
      >
        {type === "album" && onLike && (
          <TouchableOpacity
            style={[
              styles.toolbarItem,
              { borderRightColor: Palette.border },
              favorited && { backgroundColor: Palette.accent },
            ]}
            onPress={onLike}
          >
            <Heart
              size={12}
              color={favorited ? Palette.white : Palette.textMuted}
              fill={favorited ? Palette.white : "transparent"}
            />
            <ThemedText
              style={[
                styles.toolbarText,
                { color: Palette.textMuted },
                favorited && { color: Palette.white },
              ]}
            >
              {favorited ? "LIKED" : "LIKE"}
            </ThemedText>
          </TouchableOpacity>
        )}

        {type === "playlist" && isLocal && onEdit && (
          <TouchableOpacity style={[styles.toolbarItem, { borderRightColor: Palette.border }]} onPress={onEdit}>
            <Pencil size={12} color={Palette.textMuted} />
            <ThemedText style={[styles.toolbarText, { color: Palette.textMuted }]}>
              EDIT
            </ThemedText>
          </TouchableOpacity>
        )}

        {onDownload && (
          <View
            style={[
              styles.toolbarDownloadItem,
              downloadDisabled && styles.toolbarItemDisabled,
              { borderRightColor: Palette.border },
              isDownloaded && { backgroundColor: Palette.terminalGreen },
            ]}
          >
            <TouchableOpacity
              style={styles.toolbarDownloadInner}
              onPress={downloadDisabled ? undefined : onDownload}
            >
              {isDownloaded ? (
                <>
                  <Check size={12} color={Palette.black} />
                  <ThemedText
                    style={[styles.toolbarText, { color: Palette.black }]}
                  >
                    DOWNLOADED
                  </ThemedText>
                </>
              ) : isDownloading ? (
                <>
                  <ActivityIndicator size={10} color={Palette.accent} />
                  <ThemedText
                    style={[
                      styles.toolbarText,
                      { color: Palette.accent },
                    ]}
                  >
                    DOWNLOADING...
                  </ThemedText>
                </>
              ) : (
                <>
                  <Download
                    size={12}
                    color={downloadDisabled ? Palette.textDim : Palette.textMuted}
                  />
                  <ThemedText
                    style={[
                      styles.toolbarText,
                      { color: Palette.textMuted },
                      downloadDisabled && { color: Palette.textDim },
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

        {type === "playlist" && isLocal && onDelete && (
          <TouchableOpacity
            style={[styles.toolbarItem, { borderRightWidth: 0 }]}
            onPress={onDelete}
          >
            <Trash2 size={12} color={Palette.accentBright} />
            <ThemedText style={[styles.toolbarText, { color: Palette.accentBright }]}>
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
    isPlaying,
    shuffleActive,
    onToggleShuffle,
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
    isPlaying: boolean;
    shuffleActive: boolean;
    onToggleShuffle: () => void;
  }) => {
    return (
      <View
        style={[
          styles.trackInfoSection,
          {
            backgroundColor: Palette.surface,
            borderColor: Palette.border,
            borderWidth: 1,
            paddingTop: 12,
            paddingBottom: 0,
          },
        ]}
      >
        <View style={styles.nowPlayingHeader}>
          <ThemedText style={styles.nowPlayingLabel}>/// NOW PLAYING</ThemedText>
          <ThemedText style={[styles.nowPlayingStatus, { color: Palette.textMuted }]}>
            STATUS: <ThemedText style={{ color: Palette.accent }}>{isPlaying ? "PLAYING" : "PAUSE"}</ThemedText>
          </ThemedText>
        </View>

        <View style={styles.trackInfoContent}>
          <View style={styles.metadataBox}>
            <View style={styles.metadataHeader}>
              <View style={{ flex: 1 }}>
                {currentTrack ? (
                  <>
                    <MarqueeText
                      style={[styles.metadataTitle, { color: Palette.white }]}
                      darkColor={Palette.white}
                      duration={10000}
                      marqueeDelay={2000}
                    >
                      {currentTrack.title || "UNKNOWN"}
                    </MarqueeText>
                    <ThemedText style={[styles.metadataArtist, { color: Palette.accent }]} numberOfLines={1}>
                      {currentTrack.artist?.name || "Unknown"}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.metadataTitle}>[EMPTY]</ThemedText>
                )}
              </View>
              <View style={styles.metadataIcons}>
                <TouchableOpacity onPress={onToggleFavorite}>
                  <Heart
                    size={16}
                    color={favorited ? Palette.accent : Palette.textMuted}
                    fill={favorited ? Palette.accent : "transparent"}
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
                    backgroundColor: Palette.accent,
                  },
                ]}
              />
            </View>

            <View style={styles.progressTimeRow}>
              <ThemedText style={styles.progressTime}>
                {musicService.formatDuration(position)}
              </ThemedText>
              <ThemedText style={styles.progressTime}>
                {musicService.formatDuration(duration)}
              </ThemedText>
            </View>

            <View style={styles.metadataDetails}>
              {currentTrack ? (
                <>
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>FILE</ThemedText>
                    <ThemedText style={styles.metadataValue} numberOfLines={1}>
                      : {(currentTrack.title || "UNKNOWN").replace(/\s+/g, "")}.{currentTrack.provider === "qobuz" ? "flac" : "m4a"}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>FORMAT</ThemedText>
                    <ThemedText style={styles.metadataValue}>
                      : AUDIO FILE ({currentTrack.quality || "LOSSLESS"})
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>DURATION</ThemedText>
                    <ThemedText style={styles.metadataValue}>
                      : {musicService.formatDuration(duration || currentTrack.duration || 0)}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>SAMPLE RATE</ThemedText>
                    <ThemedText style={styles.metadataValue}>
                      : {currentTrack.provider === "qobuz" ? "96KHZ" : "44KHZ"}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>BIT DEPTH</ThemedText>
                    <ThemedText style={styles.metadataValue}>
                      : {currentTrack.provider === "qobuz" ? "24 BIT" : "16 BIT"}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>CHANNELS</ThemedText>
                    <ThemedText style={styles.metadataValue}>: STEREO</ThemedText>
                  </View>
                </>
              ) : (
                <ThemedText style={styles.metadataValue}>
                  SEARCH AND PLAY ANY TRACK TO BEGIN
                </ThemedText>
              )}
            </View>
          </View>

          <View style={styles.discWrapper}>
            <View style={{ position: "absolute", top: 10, left: 10, width: 12, height: 12, borderTopWidth: 1, borderLeftWidth: 1, borderColor: Palette.textDim }} />
            <View style={{ position: "absolute", top: 10, right: 10, width: 12, height: 12, borderTopWidth: 1, borderRightWidth: 1, borderColor: Palette.textDim }} />
            <View style={{ position: "absolute", bottom: 10, left: 10, width: 12, height: 12, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: Palette.textDim }} />
            <View style={{ position: "absolute", bottom: 10, right: 10, width: 12, height: 12, borderBottomWidth: 1, borderRightWidth: 1, borderColor: Palette.textDim }} />
            
            <Animated.View
              style={[styles.discContainer, animatedDiscStyle, { borderColor: Palette.border }]}
            >
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
                <View style={[styles.emptyDisc, { backgroundColor: Palette.compartment }]}>
                  <Music size={32} color={Palette.textDim} />
                </View>
              )}
              <View
                style={[styles.discCenter, { backgroundColor: Palette.surface, borderColor: Palette.border }]}
              />
              <View style={[styles.discCenterInner, { backgroundColor: Palette.textDim }]} />
            </Animated.View>
          </View>
        </View>

        {/* Hardware Controls Bar */}
        <View style={styles.hardwareControlsBar}>
          {/* Top Row: Functional Buttons */}
          <View style={styles.hwButtonsRow}>
            <TouchableOpacity
              style={[styles.hardwareBtn, { backgroundColor: Palette.accent }]}
              onPress={onPlayPause}
            >
              {isPlaying ? (
                <View style={styles.pauseBarsIcon}>
                  <View style={[styles.pauseBar, { backgroundColor: Palette.black }]} />
                  <View style={[styles.pauseBar, { backgroundColor: Palette.black }]} />
                </View>
              ) : (
                <View style={[styles.playArrowIcon, { borderLeftColor: Palette.black }]} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                { backgroundColor: Palette.compartment },
                shuffleActive && { backgroundColor: Palette.accent },
              ]}
              onPress={onToggleShuffle}
            >
              <Shuffle size={16} color={shuffleActive ? Palette.black : Palette.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hardwareBtn, { backgroundColor: Palette.compartment }]}
              onPress={onPrev}
            >
              <SkipBack size={16} color={Palette.white} fill={Palette.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hardwareBtn, { backgroundColor: Palette.compartment }]}
              onPress={onNext}
            >
              <SkipForward size={16} color={Palette.white} fill={Palette.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                { backgroundColor: Palette.compartment, overflow: 'hidden' },
                downloadStatus === "completed" && { backgroundColor: Palette.terminalGreen },
              ]}
              onPress={onDownload}
            >
              {downloadProgress > 0 && downloadProgress < 1 && (
                <View 
                  style={{ 
                    position: 'absolute', 
                    left: 0, 
                    top: 0, 
                    bottom: 0, 
                    width: `${downloadProgress * 100}%`, 
                    backgroundColor: 'rgba(0, 255, 65, 0.3)' 
                  }} 
                />
              )}
              {downloadStatus === "completed" ? (
                <Check size={16} color={Palette.black} />
              ) : downloadStatus === "downloading" ? (
                <ActivityIndicator size="small" color={Palette.accent} />
              ) : (
                <Download size={16} color={Palette.white} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hardwareBtn, { backgroundColor: Palette.accent, borderRightWidth: 0 }]}
              onPress={onAddToPlaylist}
              disabled={!currentTrack}
            >
              <Plus size={16} color={Palette.black} />
            </TouchableOpacity>
          </View>

          {/* Bottom Row: Labels */}
          <View style={styles.hwLabelsRow}>
            {["PLAY", "SHUFFLE", "PREV", "NEXT", "DOWNLOAD", "ADD TO"].map((label, idx) => (
              <View key={label} style={[styles.hwLabelBox, idx === 5 && { borderRightWidth: 0 }]}>
                <ThemedText style={styles.hwBtnLabel}>[ {label} ]</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  },
);

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
    shuffleActive,
    toggleShuffle,
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
  const [currentView, setCurrentView] = useState<
    "library" | "search" | "tracks" | "albums" | "artists" | "playlists"
  >("library");

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      setIsSearching(false);
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

  const [downloadMap, setDownloadMap] = useState<Record<string, any>>({});
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<Set<string>>(
    new Set(),
  );

  const refreshDownloadedTracks = useCallback(async () => {
    const downloads = await storageService.getAllDownloads();
    const completedIds = downloads
      .filter((d) => d.status === "completed")
      .map((d) => d.id);
    setDownloadedTrackIds(new Set(completedIds));
  }, []);

  useEffect(() => {
    refreshDownloadedTracks();
    const unsubscribe = storageService.subscribeToDownloads((downloads) => {
      refreshDownloadedTracks();
      const map: Record<string, any> = {};
      downloads.forEach((d) => {
        map[d.id] = { status: d.status, progress: d.progress };
      });
      setDownloadMap(map);
    });
    return unsubscribe;
  }, [refreshDownloadedTracks]);

  const downloadStatus = currentTrack ? (downloadMap[currentTrack.id]?.status || "none") : "none";
  const downloadProgress = currentTrack ? (downloadMap[currentTrack.id]?.progress || 0) : 0;

  const handleDownload = async () => {
    if (!currentTrack) return;
    if (downloadStatus === "completed") {
      await musicService.removeDownload(currentTrack.id);
      showToast("Download removed", "info");
      return;
    }
    try {
      await musicService.downloadTrack(currentTrack);
      showToast("Download started", "info");
    } catch (error) {
      showToast("Failed to start download", "error");
    }
  };




  const libraryItems = [
    {
      id: "search",
      title: "Search",
      subtitle: "EXPLORE LIBRARY",
      icon: Search,
      count: null,
      color: Palette.accent,
    },
    {
      id: "tracks",
      title: "Tracks",
      subtitle: "AUDIO FILES",
      icon: Heart,
      count: favoriteTracks.length,
      color: Palette.accent,
    },
    {
      id: "albums",
      title: "Albums",
      subtitle: "COLLECTIONS",
      icon: Disc,
      count: favoriteAlbums.length,
      color: Palette.accent,
    },
    {
      id: "artists",
      title: "Artists",
      subtitle: "ALL ARTISTS",
      icon: Users,
      count: favoriteArtists.length,
      color: Palette.accent,
    },
    {
      id: "playlists",
      title: "Playlists",
      subtitle: "USER PLAYLISTS",
      icon: ListMusic,
      count: favoritePlaylists.length + userPlaylists.length,
      color: Palette.accent,
    },
  ];

  const [selectedAlbum, setSelectedAlbum] = useState<any>(null);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
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

  // Reset scroll position when view changes
  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [selectedAlbum, selectedArtist, selectedPlaylist, currentView, isSelectingPlaylist]);

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
  const [strictArtistMatch, setStrictArtistMatch] = useState(true);
  const [albumMatch, setAlbumMatch] = useState(true);
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [isItemDownloading, setIsItemDownloading] = useState(false);
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
      setIsItemDownloading(false);
      showToast("Download cancelled", "info");
    } else {
      setIsItemDownloading(true);
      showToast("Download started", "info");
      try {
        if (type === "album") {
          await musicService.downloadAlbum(item);
        } else if (type === "playlist") {
          await musicService.downloadPlaylist(item);
        }
        showToast("Download complete", "success");
      } catch (error) {
        showToast("Download failed", "error");
      } finally {
        setIsItemDownloading(false);
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

  const handleRemoveTrackFromPlaylist = useCallback(
    async (trackToRemove: any) => {
      if (!selectedPlaylist) return;
      try {
        const updatedTracks = (selectedPlaylist.tracks || []).filter(
          (t: any) => t.id !== trackToRemove.id,
        );
        const updatedPlaylist = {
          ...selectedPlaylist,
          tracks: updatedTracks,
          trackCount: updatedTracks.length,
        };
        await storageService.saveUserPlaylist(updatedPlaylist);
        setSelectedPlaylist(updatedPlaylist);
        setAlbumTracks(updatedTracks);
        showToast("Track removed from playlist", "success");
      } catch (error) {
        showToast("Failed to remove track", "error");
      }
    },
    [selectedPlaylist],
  );

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
            tracks: [...(playlist.tracks || []), { ...trackToAddToPlaylist }],
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
      return {
        title: selectedAlbum.title?.toUpperCase() || "ALBUM",
        icon: Disc,
        color: Palette.accent,
      };
    if (selectedArtist)
      return {
        title: selectedArtist.name?.toUpperCase() || "ARTIST",
        icon: Users,
        color: Palette.accent,
      };
    if (selectedPlaylist)
      return {
        title: selectedPlaylist.title?.toUpperCase() || "PLAYLIST",
        icon: ListMusic,
        color: Palette.accent,
      };
    if (isSelectingPlaylist)
      return {
        title: "SELECT PLAYLIST",
        icon: ListMusic,
        color: Palette.accent,
      };

    const currentItem = libraryItems.find((i) => i.id === currentView);
    return {
      title: (currentView === "library"
        ? "LIBRARY"
        : currentView
      ).toUpperCase(),
      icon: currentView === "library" ? Music : currentItem?.icon,
      color: currentItem?.color || Palette.surface,
    };
  }, [
    selectedAlbum,
    selectedArtist,
    selectedPlaylist,
    isSelectingPlaylist,
    currentView,
    libraryItems,
  ]);

  const renderSearchModule = useCallback(
    () => (
      <ScrollView
        style={styles.moduleContainer}
        contentContainerStyle={{ gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.brutalistSearchBox,
            { backgroundColor: Colors.inputBg, borderColor: Palette.border },
          ]}
        >
          <Search size={16} color={Palette.white} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.brutalistInput, { color: Palette.white }]}
            placeholder="SEARCH TRACKS, ARTISTS, AND ALBUMS"
            placeholderTextColor={Colors.placeholder}
            value={searchQuery}
            onChangeText={(text) => setSearchQuery(text.toUpperCase())}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
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
                  <ThemedText
                    style={[
                      styles.artistCVSectionTitle,
                      { color: Palette.white },
                    ]}
                  >
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
                      downloadStatus={downloadMap[track.id]?.status}
                      downloadProgress={downloadMap[track.id]?.progress}
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
                <ThemedText
                  style={[styles.artistCVSectionTitle, { color: Palette.white }]}
                >
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
                    downloadStatus={downloadMap[track.id]?.status}
                    downloadProgress={downloadMap[track.id]?.progress}
                  />
                ))}
              </View>
            )}

            {/* Albums */}
            {searchResults.albums.length > 0 && (
              <View>
                <ThemedText
                  style={[styles.artistCVSectionTitle, { color: Palette.white }]}
                >
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
                <ThemedText
                  style={[styles.artistCVSectionTitle, { color: Palette.white }]}
                >
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
                <ThemedText
                  style={[styles.noResultsText, { color: Palette.white }]}
                >
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
              downloadStatus={downloadMap[track.id]?.status}
              downloadProgress={downloadMap[track.id]?.progress}
            />
          ))
        ) : (
          <View style={styles.emptyViewContainer}>
            <ThemedText style={[styles.noResultsText, { color: Palette.white }]}>
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
            <ThemedText style={[styles.noResultsText, { color: Palette.white }]}>
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
            <ThemedText style={[styles.noResultsText, { color: Palette.white }]}>
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
        <View
          style={[
            styles.inlineFormContainer,
            { backgroundColor: Colors.subtleBg, borderColor: Palette.border },
          ]}
        >
          <View style={styles.inlineFormHeader}>
            <ThemedText
              style={[styles.inlineFormTitle, { color: Palette.white }]}
            >
              {editingPlaylistId
                ? "EDIT PLAYLIST"
                : importMode
                  ? "IMPORT PLAYLIST"
                  : "NEW PLAYLIST"}
            </ThemedText>
          </View>

          <View style={styles.inlineInputGroup}>
            <ThemedText
              style={[styles.inlineInputLabel, { color: Palette.white }]}
            >
              TITLE
            </ThemedText>
            <TextInput
              style={[styles.brutalistInput, { color: Palette.white }]}
              placeholder="Enter playlist name..."
              placeholderTextColor={Colors.placeholder}
              value={playlistTitle}
              onChangeText={setPlaylistTitle}
              autoFocus
            />
          </View>

          <View style={styles.inlineInputGroup}>
            <ThemedText
              style={[styles.inlineInputLabel, { color: Palette.white }]}
            >
              DESCRIPTION
            </ThemedText>
            <TextInput
              style={[
                styles.brutalistInput,
                { height: 60, color: Palette.white },
              ]}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.placeholder}
              value={playlistDescription}
              onChangeText={setPlaylistDescription}
              multiline
            />
          </View>

          {importMode && !editingPlaylistId && (
            <>
              <TouchableOpacity
                style={[
                  styles.inlineFilePicker,
                  { borderColor: Palette.border },
                ]}
                onPress={handlePickFile}
              >
                <ThemedText
                  style={[styles.inlineFilePickerText, { color: Palette.white }]}
                >
                  {importFile
                    ? importFile.name.toUpperCase()
                    : "SELECT .CSV FILE"}
                </ThemedText>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.inlineFormActions}>
            <TouchableOpacity
              style={[
                styles.inlineFormButton,
                { backgroundColor: Palette.accent, borderColor: Palette.border },
              ]}
              onPress={() => handleSavePlaylist(existing)}
              disabled={isSavingPlaylist}
            >
              {isSavingPlaylist ? (
                <ActivityIndicator size="small" color={Palette.white} />
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
                {
                  backgroundColor: Colors.buttonBg,
                  borderColor: Palette.border,
                },
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
              <ThemedText
                style={[styles.inlineFormButtonText, { color: Palette.white }]}
              >
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
                style={[
                  styles.compactListItem,
                ]}
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
                  <View
                    style={[
                      styles.compactPlaylistIcon,
                      {
                        backgroundColor: Colors.subtleBg,
                        borderColor: Palette.border,
                      },
                    ]}
                  >
                    <ListMusic size={16} color={Palette.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={[styles.compactItemTitle, { color: Palette.white }]}
                      numberOfLines={1}
                    >
                      {playlist.title.toUpperCase()}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.compactItemSubtitle,
                        { color: Palette.white },
                      ]}
                      numberOfLines={1}
                    >
                      {playlist.trackCount || 0}{" "}
                      {playlist.trackCount === 1 ? "TRACK" : "TRACKS"}
                    </ThemedText>
                  </View>
                  {selectionMode && isTrackInPlaylist && (
                    <View style={styles.playlistCheckmark}>
                      <Check size={14} color={Palette.white} strokeWidth={3} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyViewContainer}>
            <ThemedText style={[styles.noResultsText, { color: Palette.white }]}>
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
    ],
  );


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
    let isMounted = true;

    // Reset tracks immediately when album/playlist changes to avoid stale data flash
    if (selectedAlbum || selectedPlaylist) {
      setAlbumTracks([]);
      setLoadingDetail(true);
    }

    if (selectedAlbum) {
      musicService
        .getAlbum(selectedAlbum.id, selectedAlbum.provider)
        .then((data: any) => {
          if (isMounted) {
            setAlbumTracks(data.tracks || []);
            setLoadingDetail(false);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch album tracks:", err);
          if (isMounted) setLoadingDetail(false);
        });
    } else if (selectedPlaylist) {
      musicService
        .getPlaylist(selectedPlaylist.id, selectedPlaylist.provider)
        .then((data: any) => {
          if (isMounted) {
            if (data) {
              setAlbumTracks(data.tracks || []);
            } else {
              setAlbumTracks([]);
            }
            setLoadingDetail(false);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch playlist tracks:", err);
          if (isMounted) setLoadingDetail(false);
        });
    } else {
      setAlbumTracks([]);
      setLoadingDetail(false);
    }

    return () => {
      isMounted = false;
    };
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
              style={[styles.detailImage, { borderColor: Palette.border }]}
            />
          </View>
          <Animated.View style={[styles.detailTextInfo, textAnimationStyle]}>
            <ThemedText style={[styles.detailTitle, { color: Palette.white }]}>
              {album.title?.toUpperCase() || "UNKNOWN ALBUM"}
            </ThemedText>
            <ThemedText style={[styles.detailSubtitle, { color: Palette.white }]}>
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
                downloadStatus={downloadMap[track.id]?.status}
                downloadProgress={downloadMap[track.id]?.progress}
              />
            ))
          ) : (
            <View style={styles.emptyViewContainer}>
              <ThemedText
                style={[styles.noResultsText, { color: Palette.white }]}
              >
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
          <>
            {renderInlinePlaylistForm([])}
            <View style={styles.moduleSection}>
              {playlist.tracks && playlist.tracks.length > 0 ? (
                playlist.tracks.map((track: any, idx: number) => (
                  <CompactTrackItem
                    key={`${track.id}-${idx}`}
                    track={track}
                    index={idx}
                    isCurrentTrack={currentTrack?.id === track.id}
                    onPress={() => {}}
                    onToggleLibrary={handleToggleLibrary}
                    isFavoriteTrack={isFavorite("track", track.id)}
                    isDownloaded={downloadedTrackIds.has(track.id)}
                    downloadStatus={downloadMap[track.id]?.status}
                    downloadProgress={downloadMap[track.id]?.progress}
                    onRemove={handleRemoveTrackFromPlaylist}
                  />
                ))
              ) : (
                <View style={styles.emptyViewContainer}>
                  <ThemedText
                    style={[styles.noResultsText, { color: Palette.white }]}
                  >
                    NO TRACKS IN PLAYLIST
                  </ThemedText>
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.detailHeader}>
              <View
                style={[
                  styles.detailImage,
                  styles.compactPlaylistIcon,
                  {
                    width: 80,
                    height: 80,
                    borderColor: Palette.border,
                    backgroundColor: Colors.subtleBg,
                  },
                ]}
              >
                <ListMusic size={40} color={Palette.white} />
              </View>
              <View style={styles.detailTextInfo}>
                <ThemedText
                  style={[styles.detailTitle, { color: Palette.white }]}
                >
                  {playlist.title?.toUpperCase() || "UNKNOWN PLAYLIST"}
                </ThemedText>
                <ThemedText
                  style={[styles.detailSubtitle, { color: Palette.white }]}
                >
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
                    downloadStatus={downloadMap[track.id]?.status}
                    downloadProgress={downloadMap[track.id]?.progress}
                  />
                ))
              ) : (
                <View style={styles.emptyViewContainer}>
                  <ThemedText
                    style={[styles.noResultsText, { color: Palette.white }]}
                  >
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
      handleRemoveTrackFromPlaylist,
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
                style={[styles.artistCVImage, { borderColor: Palette.border }]}
              />
              <ThemedText
                style={[
                  styles.detailTitle,
                  { textAlign: "center", color: Palette.white },
                ]}
              >
                {artistData.name?.toUpperCase()}
              </ThemedText>
              <TouchableOpacity
                style={[
                  styles.fanButton,
                  {
                    backgroundColor: isFavorite("artist", artistData.id)
                      ? Palette.accent
                      : Palette.surface,
                    borderColor: Palette.border,
                  },
                ]}
                onPress={() => handleToggleLibrary("artist", artistData)}
              >
                <ThemedText
                  style={[
                    styles.fanButtonText,
                    {
                      color: isFavorite("artist", artistData.id)
                        ? Palette.black
                        : Palette.white,
                    },
                  ]}
                >
                  {isFavorite("artist", artistData.id)
                    ? "ALREADY A FAN"
                    : "I'M A FAN"}
                </ThemedText>
              </TouchableOpacity>
            </View>


            {/* Content: Tracks and Albums (Full Width) */}
            <View style={styles.artistCVContent}>
              {/* Popular Tracks */}
              {artistData.tracks && artistData.tracks.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <ThemedText
                    style={[
                      styles.artistCVSectionTitle,
                      { color: Palette.white },
                    ]}
                  >
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
                        downloadStatus={downloadMap[track.id]?.status}
                        downloadProgress={downloadMap[track.id]?.progress}
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
                    <ThemedText
                      style={[
                        styles.artistCVSectionTitle,
                        { color: Palette.white },
                      ]}
                    >
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
                          downloadStatus={downloadMap[track.id]?.status}
                          downloadProgress={downloadMap[track.id]?.progress}
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
                  <ThemedText
                    style={[
                      styles.artistCVSectionTitle,
                      { color: Palette.white },
                    ]}
                  >
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
            <ThemedText style={[styles.noResultsText, { color: Palette.white }]}>
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
      downloadMap,
    ],
  );

  const handleBack = useCallback(() => {
    if (editingPlaylistId || isCreatingPlaylist) {
      setEditingPlaylistId(null);
      setIsCreatingPlaylist(false);
      return true;
    }
    if (isSelectingPlaylist) {
      setIsSelectingPlaylist(false);
      setTrackToAddToPlaylist(null);
      return true;
    }
    if (selectedAlbum) {
      setSelectedAlbum(null);
      return true;
    }
    if (selectedArtist) {
      setSelectedArtist(null);
      return true;
    }
    if (selectedPlaylist) {
      setSelectedPlaylist(null);
      return true;
    }
    if (currentView !== "library") {
      setCurrentView("library");
      return true;
    }
    return false;
  }, [
    editingPlaylistId,
    isCreatingPlaylist,
    isSelectingPlaylist,
    selectedAlbum,
    selectedArtist,
    selectedPlaylist,
    currentView,
  ]);

  const backGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-60, 60])
    .failOffsetY([-40, 40])
    .onEnd((event) => {
      // Swipe right-to-left (translationX < -60) or left-to-right (translationX > 60)
      if (
        Math.abs(event.translationX) > 60 &&
        Math.abs(event.translationY) < 40
      ) {
        handleBack();
      }
    });

  const renderViewportContent = useCallback(() => {
    if (selectedAlbum) return renderAlbumDetail(selectedAlbum);
    if (selectedArtist) return renderArtistDetail(selectedArtist);
    if (selectedPlaylist) return renderPlaylistDetail(selectedPlaylist);
    if (isSelectingPlaylist) {
      const allSelectPlaylists = [...favoritePlaylists, ...userPlaylists];
      const uniqueSelectPlaylists = allSelectPlaylists.filter(
        (playlist, index, self) =>
          index === self.findIndex((p) => p.id === playlist.id),
      );
      return renderPlaylistsModule(
        uniqueSelectPlaylists,
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
            {libraryItems.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.libraryRow,
                  {
                    backgroundColor: Palette.surface,
                    borderBottomColor: Palette.border,
                    borderBottomWidth: index === libraryItems.length - 1 ? 0 : 1,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => setCurrentView(item.id as any)}
              >
                {/* Col 1: Index/Plus */}
                <View style={styles.libColIndex}>
                  <ThemedText style={styles.libraryRowIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </ThemedText>
                  <Plus size={10} color={Palette.textMuted} strokeWidth={3} />
                </View>

                {/* Col 2: Icon Box */}
                <View style={styles.libColIcon}>
                  <View
                    style={[
                      styles.libraryRowIconContainer,
                      {
                        backgroundColor:
                          item.id === "tracks" ? Palette.accent : Palette.white,
                      },
                    ]}
                  >
                    {item.id === "search" && (
                      <Search size={20} color={Palette.black} />
                    )}
                    {item.id === "tracks" && (
                      <Heart size={20} color={Palette.black} fill={Palette.black} />
                    )}
                    {item.id === "albums" && (
                      <Disc size={20} color={Palette.black} />
                    )}
                    {item.id === "artists" && (
                      <Users size={20} color={Palette.black} />
                    )}
                    {item.id === "playlists" && (
                      <ListMusic size={20} color={Palette.black} />
                    )}
                  </View>
                </View>

                {/* Col 3: Title/Subtitle */}
                <View style={styles.libColInfo}>
                  <ThemedText style={styles.libraryItemTitle}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.libraryItemSubtitle}>
                    {item.subtitle}
                  </ThemedText>
                </View>

                {/* Col 4: Count */}
                <View style={styles.libColCount}>
                  <ThemedText
                    style={[styles.libraryItemCount, { color: Palette.textDim }]}
                  >
                    [{" "}
                    {item.count !== null
                      ? `${item.count} ITEM${item.count !== 1 ? "S" : ""}`
                      : "ALL CONTENT"}{" "}
                    ]
                  </ThemedText>
                </View>

                {/* Col 5: Arrow */}
                <View style={styles.libColArrow}>
                  <ThemedText
                    style={[styles.libraryRowArrow, { color: Palette.accent }]}
                  >
                    {"->"}
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
        const allPlaylists = [...favoritePlaylists, ...userPlaylists];
        const uniquePlaylists = allPlaylists.filter(
          (playlist, index, self) =>
            index === self.findIndex((p) => p.id === playlist.id),
        );
        return renderPlaylistsModule(uniquePlaylists, "ALL PLAYLISTS");
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
  return (
    <GestureDetector gesture={backGesture}>
      <SafeAreaView
        style={[styles.container, { backgroundColor: Palette.black }]}
      >
        {/* Brutalist App Header */}
        <View style={styles.appHeader}>
          <View style={styles.headerTopRow}>
            {/* Left Box: ASCII Brackets and Unit Info */}
            <View style={styles.headerTopLeft}>
              <View style={{ alignItems: "center", marginRight: 8 }}>
                <ThemedText style={[styles.headerSystemInfo, { lineHeight: 12 }]}>┌ + ┐</ThemedText>
                <ThemedText style={[styles.headerSystemInfo, { lineHeight: 12 }]}>└ ─ ┘</ThemedText>
              </View>
              <View>
                <ThemedText style={styles.headerSystemInfo}>AUDIO / UNIT</ThemedText>
                <ThemedText style={styles.headerSystemInfo}>LUNA PLAYER v2.0</ThemedText>
              </View>
            </View>
            
            {/* Center Crosshair */}
            <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: -1 }}>
               <Plus size={16} color={Palette.textDim} strokeWidth={1} />
            </View>

            {/* Right Box: Logo */}
            <View style={styles.headerTopRight}>
              <ThemedText style={styles.headerTitle}>LUNA®</ThemedText>
            </View>
          </View>
          
          <View style={styles.headerBottomRow}>
            <ThemedText style={styles.headerSubtitle}>
              LUNA MUSIC INTERFACE
            </ThemedText>
            <View style={{ alignItems: "flex-end" }}>
              <ThemedText style={styles.headerClock}>
                CLOCK {currentTime.toLocaleTimeString('en-US', { hour12: false })}
              </ThemedText>
              <ThemedText style={[styles.headerClock, { letterSpacing: 2, marginTop: 4, fontSize: 8 }]}>
                ||||| | |||| || ||| | |||||
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.viewportHeader}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <ThemedText style={[styles.viewportTitle, { flex: 1, marginRight: 12 }]} numberOfLines={1}>
              {getActiveHeaderInfo().title}
            </ThemedText>
            {(currentView !== "library" || selectedAlbum || selectedArtist || selectedPlaylist || isSelectingPlaylist) ? (
              <TouchableOpacity
                onPress={handleBack}
                style={styles.viewportIndexCloseButton}
              >
                <X size={16} color={Palette.black} strokeWidth={3} />
              </TouchableOpacity>
            ) : (
              <View style={styles.viewportTitleIndex}>
                <ThemedText style={styles.viewportTitleIndexLabel}>// INDEX</ThemedText>
                <ThemedText style={styles.viewportTitleIndexNum}>01</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* 2. Main Content View */}
        <View
          style={[
            styles.mainContentView,
            { backgroundColor: Palette.surface, borderColor: Palette.border, borderWidth: 1 },
          ]}
        >

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
                downloadMap[(selectedAlbum || selectedPlaylist)?.id]?.progress || 0
              }
              isDownloaded={
                selectedAlbum
                  ? (downloadMap[selectedAlbum.id]?.status === "completed") || (albumTracks.length > 0 &&
                    albumTracks.every((t: any) => downloadedTrackIds.has(t.id)))
                  : selectedPlaylist
                    ? (downloadMap[selectedPlaylist.id]?.status === "completed") || (selectedPlaylist.tracks?.length > 0 &&
                      selectedPlaylist.tracks?.every((t: any) =>
                        downloadedTrackIds.has(t.id),
                      ))
                    : false
              }
              isDownloading={isItemDownloading}
              onEdit={
                selectedPlaylist?.id?.startsWith("local:")
                  ? () => {
                      setEditingPlaylistId(selectedPlaylist.id);
                      setPlaylistTitle(selectedPlaylist.title);
                      setPlaylistDescription(
                        selectedPlaylist.description || "",
                      );
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
              <View
                style={[
                  styles.toolbarRibbon,
                  {
                    backgroundColor: Colors.inputBg,
                    borderColor: Palette.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.toolbarItem}
                  onPress={() => {
                    setPlaylistTitle("");
                    setPlaylistDescription("");
                    setImportMode(false);
                    setIsCreatingPlaylist(true);
                  }}
                >
                  <Plus size={12} color={Palette.white} />
                  <ThemedText
                    style={[styles.toolbarText, { color: Palette.white }]}
                  >
                    NEW PLAYLIST
                  </ThemedText>
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
                  <FileUp size={12} color={Palette.white} />
                  <ThemedText
                    style={[styles.toolbarText, { color: Palette.white }]}
                  >
                    IMPORT CSV
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )
          )}

          <ScrollView
            ref={scrollViewRef}
            style={styles.contentScroll}
            contentContainerStyle={[styles.contentScrollContainer, { flexGrow: 1 }]}
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
          isPlaying={isPlaying}
          shuffleActive={shuffleActive}
          onToggleShuffle={toggleShuffle}
        />
      </SafeAreaView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.md,
  },
  appHeader: {
    marginBottom: Spacing.md,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    paddingBottom: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  headerTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerSystemInfo: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textDim,
  },
  headerTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerTitle: {
    fontFamily: Fonts.displayBlack,
    fontSize: 14,
    color: Palette.white,
    letterSpacing: 2,
  },
  headerBadge: {
    backgroundColor: Palette.white,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  headerBadgeText: {
    fontFamily: Fonts.monoBold,
    fontSize: 10,
    color: Palette.black,
  },
  headerBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
  },
  headerClock: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.white,
  },
  viewportHeader: {
    paddingBottom: 0,
  },
  viewportTitle: {
    fontFamily: Fonts.displayBlack,
    fontSize: 48,
    color: Palette.white,
    lineHeight: 52,
    letterSpacing: -2,
    marginTop: -8,
  },
  viewportTitleIndex: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: 8,
  },
  viewportTitleIndexLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
  },
  viewportTitleIndexNum: {
    fontFamily: Fonts.displayBlack,
    fontSize: 24,
    color: Palette.white,
  },
  viewportIndexCloseButton: {
    width: 24,
    height: 24,
    backgroundColor: Palette.accent,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  mainContentView: {
    flex: 1,
    marginBottom: 16,
  },
  contentScroll: {
    flex: 1,
  },
  contentScrollContainer: {
    padding: 0,
  },
  libraryGrid: {
    flexDirection: "column",
    paddingVertical: 0,
  },
  libraryRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  libColIndex: {
    width: 40,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Palette.border,
    gap: 4,
  },
  libColIcon: {
    width: 60,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Palette.border,
  },
  libColInfo: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Palette.border,
  },
  libColCount: {
    width: 100,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Palette.border,
  },
  libColArrow: {
    width: 40,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  libraryRowIndex: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textDim,
  },
  libraryRowIconContainer: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  libraryItemTitle: {
    fontFamily: Fonts.displayBlack,
    fontSize: 18,
    color: Palette.white,
    letterSpacing: -0.5,
  },
  libraryItemSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    marginTop: 1,
    color: Palette.textDim,
  },
  libraryItemCount: {
    fontFamily: Fonts.mono,
    fontSize: 9,
  },
  libraryRowArrow: {
    fontFamily: Fonts.mono,
    fontSize: 14,
  },
  compactTrackHeartBox: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  // --- Viewport Module Styles ---
  moduleContainer: {
    flex: 1,
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  moduleSection: {
    gap: 0,
  },
  moduleSectionTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    letterSpacing: 1.5,
    opacity: 0.5,
    marginBottom: 8,
    color: Palette.white,
  },
  brutalistSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: 8,
    height: 36,
  },
  brutalistInput: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.white,
    letterSpacing: 0.5,
  },
  compactTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  compactTrackNumber: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    opacity: 0.5,
    width: 24,
    color: Palette.white,
  },
  compactTrackInfo: {
    flex: 1,
    marginRight: 10,
  },
  compactTrackTitle: {
    fontFamily: Fonts.monoBold,
    fontSize: 12,
    color: Palette.white,
    textTransform: "uppercase",
  },
  compactTrackArtist: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    opacity: 0.6,
    color: Palette.textMuted,
    textTransform: "uppercase",
    marginTop: 2,
  },
  compactTrackDuration: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    opacity: 0.6,
    color: Palette.textMuted,
  },
  smallDownloadedBadge: {
    width: 14,
    height: 14,
    backgroundColor: Palette.terminalGreen,
    borderWidth: 1,
    borderColor: Palette.black,
    justifyContent: "center",
    alignItems: "center",
  },
  currentTrackIndicator: {
    width: 24,
    height: 24,
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
    borderWidth: 1,
    borderColor: Palette.border,
  },
  compactGridTitle: {
    fontFamily: Fonts.monoBold,
    fontSize: 10,
    textAlign: "center",
    color: Palette.white,
    textTransform: "uppercase",
  },
  compactListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  compactArtistImage: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  compactPlaylistIcon: {
    width: 36,
    height: 36,
    backgroundColor: Palette.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Palette.border,
  },
  compactItemTitle: {
    fontFamily: Fonts.monoBold,
    fontSize: 12,
    color: Palette.white,
    textTransform: "uppercase",
  },
  compactItemSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
    textTransform: "uppercase",
    marginTop: 2,
  },
  emptyViewContainer: {
    flex: 1,
    height: 300,
    justifyContent: "center",
    alignItems: "center",
  },
  noResultsText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    textAlign: "center",
    letterSpacing: 2,
    color: Palette.textMuted,
    textTransform: "uppercase",
  },
  // --- Inline Form Styles ---
  // --- Inline Form Styles ---
  inlineFormContainer: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  inlineFormTitle: {
    fontFamily: Fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: Palette.textMuted,
  },
  inlineFormHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  inlineModeSwitch: {
    flexDirection: "row",
    backgroundColor: Palette.compartment,
    padding: 2,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  inlineModeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  inlineModeBtnActive: {
    backgroundColor: Palette.accent,
  },
  inlineModeText: {
    fontFamily: Fonts.monoBold,
    fontSize: 8,
    color: Palette.textMuted,
  },
  inlineModeTextActive: {
    color: Palette.black,
  },
  inlineInputGroup: {
    gap: 4,
  },
  inlineInputLabel: {
    fontFamily: Fonts.monoBold,
    fontSize: 8,
    letterSpacing: 0.5,
    color: Palette.textDim,
  },
  inlineFilePicker: {
    height: 36,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Palette.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Palette.compartment,
  },
  inlineFilePickerText: {
    fontFamily: Fonts.monoBold,
    fontSize: 9,
    color: Palette.textMuted,
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
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  inlineFormButtonText: {
    fontFamily: Fonts.monoBold,
    fontSize: 10,
    color: Palette.white,
  },
  inlineToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  inlineToggleLabel: {
    fontFamily: Fonts.monoBold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: Palette.textMuted,
  },
  inlineCheckbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: Palette.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Palette.compartment,
  },
  inlineCheckboxChecked: {
    backgroundColor: Palette.accent,
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
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
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
    backgroundColor: Palette.surface,
    borderBottomWidth: 1,
    borderColor: Palette.border,
    justifyContent: "space-between",
  },
  toolbarItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: Palette.border,
    gap: 6,
  },
  toolbarItemDisabled: {
    opacity: 0.4,
  },
  toolbarItemFavorited: {
    backgroundColor: Palette.accent,
  },
  toolbarTextFavorited: {
    color: Palette.black,
  },
  toolbarDownloadItem: {
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    borderRightWidth: 1,
    borderRightColor: Palette.border,
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
    backgroundColor: Palette.terminalGreen,
  },
  toolbarDownloadItemDownloaded: {
    backgroundColor: Palette.terminalGreen,
  },
  toolbarText: {
    fontFamily: Fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1,
    color: Palette.textMuted,
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
    borderColor: Palette.border,
  },
  artistCVBio: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    lineHeight: 14,
    color: Palette.textDim,
  },
  artistCVSectionTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    color: Palette.white,
  },
  fanButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  fanButtonText: {
    fontFamily: Fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: Palette.white,
  },
  // -------------------------
  viewportProgressBar: {
    height: "100%",
    backgroundColor: Palette.accent,
  },
  detailImage: {
    width: 80,
    height: 80,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
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
    backgroundColor: Palette.surface,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
    borderWidth: 1,
    borderColor: Palette.border,
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
    fontFamily: Fonts.displayBlack,
    fontSize: 18,
    color: Palette.white,
    textTransform: "uppercase",
  },
  detailSubtitle: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Palette.textMuted,
    textTransform: "uppercase",
  },
  ditherOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
    backgroundColor: "transparent",
  },
  trackInfoSection: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  nowPlayingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  nowPlayingLabel: {
    fontFamily: Fonts.monoBold,
    fontSize: 12,
    color: Palette.white,
    letterSpacing: 1,
  },
  nowPlayingStatus: {
    fontFamily: Fonts.monoBold,
    fontSize: 10,
    color: Palette.terminalGreen,
  },
  trackInfoContent: {
    padding: 12,
    gap: 12,
    flexDirection: "row",
  },
  metadataBox: {
    flex: 1,
    backgroundColor: Palette.surface,
    padding: 8,
    position: "relative",
  },
  metadataHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metadataTitle: {
    color: Palette.white,
    fontFamily: Fonts.displayBlack,
    fontSize: 20,
    textTransform: "uppercase",
    lineHeight: 22,
  },
  metadataArtist: {
    color: Palette.textMuted,
    fontFamily: Fonts.mono,
    fontSize: 12,
    textTransform: "uppercase",
    marginTop: 4,
  },
  metadataIcons: {
    alignItems: "flex-end",
    paddingLeft: 8,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: Palette.compartment,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Palette.accent,
  },
  progressTimeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressTime: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
  },
  metadataDetails: {
    gap: 4,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: Palette.textDim,
    paddingTop: 12,
  },
  metadataRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  metadataLabel: {
    color: Palette.textDim,
    fontFamily: Fonts.mono,
    fontSize: 10,
    width: 80,
  },
  metadataValue: {
    color: Palette.textMuted,
    fontFamily: Fonts.mono,
    fontSize: 10,
    flex: 1,
  },
  albumArtLabel: {
    fontFamily: Fonts.monoBold,
    fontSize: 10,
    color: Palette.textMuted,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  discWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderLeftWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.compartment,
  },
  discContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  discImage: {
    width: "100%",
    height: "100%",
    borderRadius: 100,
  },
  emptyDisc: {
    width: "100%",
    height: "100%",
    backgroundColor: Palette.compartment,
    justifyContent: "center",
    alignItems: "center",
  },
  discCenter: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    zIndex: 10,
  },
  discCenterInner: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.textDim,
    zIndex: 11,
  },
  explicitBadge: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  explicitBadgeText: {
    fontFamily: Fonts.monoBold,
    fontSize: 7,
    color: Palette.white,
  },
  qualityBadge: {
    height: 14,
    paddingHorizontal: 4,
    backgroundColor: Palette.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  qualityBadgeText: {
    fontFamily: Fonts.monoBold,
    fontSize: 7,
    color: Palette.black,
  },

  hardwareControlsBar: {
    height: 60,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  hwButtonsRow: {
    flexDirection: "row",
    height: 40,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  hwLabelsRow: {
    flexDirection: "row",
    height: 20,
    backgroundColor: Palette.surface,
  },
  hwLabelBox: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: Palette.border,
  },
  hardwareBtn: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderColor: Palette.border,
    overflow: "hidden",
  },
  hwBtnIconContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  hwBtnLabelContainer: {
    paddingVertical: 4,
    borderTopWidth: 1,
    borderColor: Palette.border,
    alignItems: "center",
    backgroundColor: Palette.surface,
  },
  hwBtnLabel: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    color: Palette.textMuted,
  },
  playlistCheckmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Palette.terminalGreen,
    borderWidth: 1,
    borderColor: Palette.border,
    justifyContent: "center",
    alignItems: "center",
  },
  playArrowIcon: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderTopColor: "transparent",
    borderBottomWidth: 6,
    borderBottomColor: "transparent",
    borderLeftWidth: 10,
    borderLeftColor: Palette.white,
  },
  pauseBarsIcon: {
    flexDirection: "row",
    gap: 4,
  },
  pauseBar: {
    width: 4,
    height: 12,
    backgroundColor: Palette.white,
  },
  addIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerBar: {
    flexDirection: "row",
    height: 48,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  footerSection: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  footerLabel: {
    fontFamily: Fonts.monoBold,
    fontSize: 8,
    color: Palette.textDim,
    marginBottom: 2,
  },
  footerMeter: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    color: Palette.white,
  },
  footerValue: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    color: Palette.textMuted,
  },
  secureBadge: {
    marginTop: 2,
  },
  secureBadgeText: {
    fontFamily: Fonts.monoBold,
    fontSize: 8,
    color: Palette.terminalGreen,
  },
  copyrightBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  copyrightText: {
    fontFamily: Fonts.mono,
    fontSize: 8,
    color: Palette.textDim,
  },
});

