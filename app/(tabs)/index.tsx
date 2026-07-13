import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  Disc,
  Download,
  FileDown,
  FileUp,
  HardDrive,
  Heart,
  ListMusic,
  Mic,
  Music,
  Pause,
  Pencil,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
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
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { MarqueeText } from "../../components/marquee-text";
import { HeroSkeleton, TrackSkeleton } from "../../components/skeleton-loader";
import { ThemedText } from "../../components/themed-text";
import { LyricsView } from "../../components/lyrics-view";
import { LunaAtmosphere } from "../../components/luna-atmosphere";
import { useThemeContext } from "../../contexts/theme-context";
import { Colors, Fonts, Palette, Spacing } from "../../constants/theme";
import { useFavorites } from "../../hooks/use-favorites";
import { usePlayer } from "../../hooks/use-player";
import { musicService } from "../../services/music-service";
import { playlistImporter, generateCSV, generateM3U, generateXSPF, generateXML } from "../../services/playlist-importer";
import { importAudioFile } from "../../services/local-media-service";
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
    const { palette: Palette, fonts: Fonts } = useThemeContext();
    const hasImage = !!(item.imageUrl || item.coverUrl);
    const firstLetter = (item.name || item.title || "?")[0].toUpperCase();

    return (
      <TouchableOpacity style={styles.compactGridItem} onPress={onPress}>
        <View>
          {hasImage ? (
            <Image
              source={{ uri: item.imageUrl || item.coverUrl }}
              style={[
                styles.compactGridImage,
                {
                  borderColor: Palette.border,
                  borderRadius: type === "artist" ? 9999 : 4,
                },
              ]}
            />
          ) : (
            <View
              style={[
                styles.compactGridImage,
                {
                  backgroundColor: Palette.surface || "#1A1A1A",
                  borderColor: Palette.border,
                  borderRadius: type === "artist" ? 9999 : 4,
                  justifyContent: "center",
                  alignItems: "center",
                },
              ]}
            >
              <ThemedText
                style={{
                  fontFamily: Fonts.monoBold,
                  fontSize: 24,
                  color: Palette.accent || "#0070ef",
                }}
              >
                {firstLetter}
              </ThemedText>
            </View>
          )}
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
CompactGridItem.displayName = "CompactGridItem";

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
    const { palette: Palette, fonts: Fonts } = useThemeContext();
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
              <View style={[styles.explicitBadge, { borderColor: Palette.border, backgroundColor: Palette.surface }]}>
                <ThemedText style={[styles.explicitBadgeText, { color: Palette.white }]}>E</ThemedText>
              </View>
            )}
            {isHiRes && (
              <View style={[styles.qualityBadge, { backgroundColor: Palette.accent }]}>
                <ThemedText style={[styles.qualityBadgeText, { color: Palette.black }]}>HI-RES</ThemedText>
              </View>
            )}
            {isDownloaded && (
              <View style={[styles.smallDownloadedBadge, { backgroundColor: Palette.terminalGreen, borderColor: Palette.black }]}>
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
CompactTrackItem.displayName = "CompactTrackItem";

const ToolbarRibbon = React.memo(
  ({
    type,
    item,
    onDownload,
    onLike,
    onEdit,
    onDelete,
    onExport,
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
    onExport?: () => void;
    favorited: boolean;
    downloadDisabled?: boolean;
    downloadProgress?: number;
    isDownloaded?: boolean;
    isDownloading?: boolean;
  }) => {
    const { palette: Palette, fonts: Fonts } = useThemeContext();
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

        {type === "playlist" && isLocal && onExport && (
          <TouchableOpacity style={[styles.toolbarItem, { borderRightColor: Palette.border }]} onPress={onExport}>
            <FileUp size={12} color={Palette.textMuted} />
            <ThemedText style={[styles.toolbarText, { color: Palette.textMuted }]}>
              EXPORT
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
ToolbarRibbon.displayName = "ToolbarRibbon";

const PlaybackInfoSection = React.memo(
  ({
    currentTrack,
    favorited,
    onToggleFavorite,
    position,
    duration,
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
    onShowLyrics,
    repeatMode,
    onToggleRepeat,
  }: {
    currentTrack: any;
    favorited: boolean;
    onToggleFavorite: () => void;
    position: number;
    duration: number;
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
    onShowLyrics?: () => void;
    repeatMode: string;
    onToggleRepeat: () => void;
  }) => {
    const { palette: Palette, fonts: Fonts } = useThemeContext();
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
          <ThemedText style={[styles.nowPlayingLabel, { color: Palette.white }]}>{'/// NOW PLAYING'}</ThemedText>
          <TouchableOpacity
            style={[styles.lyricsButton, { borderColor: Palette.border, backgroundColor: Palette.compartment }]}
            onPress={onShowLyrics}
            disabled={!currentTrack}
            activeOpacity={0.7}
          >
            <Mic size={10} color={currentTrack ? Palette.accent : Palette.textDim} />
            <ThemedText style={[styles.nowPlayingStatus, { color: currentTrack ? Palette.accent : Palette.textDim }]}>
              LYRICS
            </ThemedText>
          </TouchableOpacity>
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
                  <ThemedText style={[styles.metadataTitle, { color: Palette.white }]}>{'[EMPTY]'}</ThemedText>
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

            <View style={[styles.progressBarContainer, { backgroundColor: Palette.compartment, borderColor: Palette.border }]}>
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
              <ThemedText style={[styles.progressTime, { color: Palette.textMuted }]}>
                {musicService.formatDuration(position)}
              </ThemedText>
              <ThemedText style={[styles.progressTime, { color: Palette.textMuted }]}>
                {musicService.formatDuration(duration)}
              </ThemedText>
            </View>

            <View style={[styles.metadataDetails, { borderTopColor: Palette.textDim }]}>
              {currentTrack ? (
                <>
                  <View style={styles.metadataRow}>
                    <ThemedText style={[styles.metadataLabel, { color: Palette.textDim }]}>FILE</ThemedText>
                    <ThemedText style={[styles.metadataValue, { color: Palette.textMuted }]} numberOfLines={1}>
                      : {(currentTrack.title || "UNKNOWN").replace(/\s+/g, "")}.{currentTrack.provider === "qobuz" ? "flac" : "m4a"}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={[styles.metadataLabel, { color: Palette.textDim }]}>FORMAT</ThemedText>
                    <ThemedText style={[styles.metadataValue, { color: Palette.textMuted }]}>
                      : AUDIO FILE ({currentTrack.quality || "LOSSLESS"})
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={[styles.metadataLabel, { color: Palette.textDim }]}>DURATION</ThemedText>
                    <ThemedText style={[styles.metadataValue, { color: Palette.textMuted }]}>
                      : {musicService.formatDuration(duration || currentTrack.duration || 0)}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={[styles.metadataLabel, { color: Palette.textDim }]}>SAMPLE RATE</ThemedText>
                    <ThemedText style={[styles.metadataValue, { color: Palette.textMuted }]}>
                      : {currentTrack.maximumSamplingRate ? `${currentTrack.maximumSamplingRate} KHZ` : "—"}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={[styles.metadataLabel, { color: Palette.textDim }]}>BIT DEPTH</ThemedText>
                    <ThemedText style={[styles.metadataValue, { color: Palette.textMuted }]}>
                      : {currentTrack.maximumBitDepth ? `${currentTrack.maximumBitDepth} BIT` : "—"}
                    </ThemedText>
                  </View>
                  <View style={styles.metadataRow}>
                    <ThemedText style={[styles.metadataLabel, { color: Palette.textDim }]}>CHANNELS</ThemedText>
                    <ThemedText style={[styles.metadataValue, { color: Palette.textMuted }]}>
                      : {currentTrack.maximumChannelCount === 2 ? "STEREO" : currentTrack.maximumChannelCount ? `${currentTrack.maximumChannelCount}.0` : "—"}
                    </ThemedText>
                  </View>
                </>
              ) : (
                <ThemedText style={[styles.metadataValue, { color: Palette.textMuted }]}>
                  SEARCH AND PLAY ANY TRACK TO BEGIN
                </ThemedText>
              )}
            </View>
          </View>

          <View style={[styles.discWrapper, { borderColor: Palette.border, backgroundColor: Palette.compartment }]}>
            <View style={{ position: "absolute", top: 10, left: 10, width: 12, height: 12, borderTopWidth: 1, borderLeftWidth: 1, borderColor: Palette.textDim }} />
            <View style={{ position: "absolute", top: 10, right: 10, width: 12, height: 12, borderTopWidth: 1, borderRightWidth: 1, borderColor: Palette.textDim }} />
            <View style={{ position: "absolute", bottom: 10, left: 10, width: 12, height: 12, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: Palette.textDim }} />
            <View style={{ position: "absolute", bottom: 10, right: 10, width: 12, height: 12, borderBottomWidth: 1, borderRightWidth: 1, borderColor: Palette.textDim }} />
            
            <Animated.View
              style={[styles.discContainer, { borderColor: Palette.border }]}
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
        <View style={[styles.hardwareControlsBar, { borderTopColor: Palette.border }]}>
          {/* Top Row: Functional Buttons */}
          <View style={[styles.hwButtonsRow, { borderBottomColor: Palette.border }]}>
            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                { backgroundColor: Palette.compartment, overflow: 'hidden' },
                downloadStatus === "completed" && { backgroundColor: Palette.terminalGreen },
                currentTrack?.localUri && { opacity: 0.3 },
              ]}
              onPress={onDownload}
              disabled={!!currentTrack?.localUri}
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
              style={[styles.hardwareBtn, { backgroundColor: Palette.compartment }]}
              onPress={onNext}
            >
              <SkipForward size={16} color={Palette.white} fill={Palette.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.hardwareBtn,
                { backgroundColor: Palette.compartment },
                repeatMode !== "off" && { backgroundColor: Palette.accent },
              ]}
              onPress={onToggleRepeat}
            >
              {repeatMode === "one" ? (
                <Repeat1 size={16} color={repeatMode !== "off" ? Palette.black : Palette.white} />
              ) : (
                <Repeat size={16} color={repeatMode !== "off" ? Palette.black : Palette.white} />
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
          <View style={[styles.hwLabelsRow, { backgroundColor: Palette.surface }]}>
            {["DOWNLOAD", "SHUFFLE", "PREV", "PLAY", "NEXT", "REPEAT", "ADD TO"].map((label, idx) => (
              <View key={label} style={[styles.hwLabelBox, idx === 6 && { borderRightWidth: 0 }]}>
                <ThemedText style={[styles.hwBtnLabel, { color: Palette.textMuted }]}>{`[ ${label} ]`}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  },
);
PlaybackInfoSection.displayName = "PlaybackInfoSection";

export default function Home() {
  const { palette: Palette, colors: Colors, fonts: Fonts, cycleTheme, themeName } = useThemeContext();

  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    seekTo,
    position,
    duration,
    setQueue,
    shuffleActive,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
  } = usePlayer();

  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [showDeletePlaylistModal, setShowDeletePlaylistModal] = useState(false);
  const [localTracks, setLocalTracks] = useState<any[]>([]);
  const [showClearLocalModal, setShowClearLocalModal] = useState(false);

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

  useEffect(() => {
    if (selectedPlaylist && userPlaylists.length > 0) {
      const updated = userPlaylists.find((p) => p.id === selectedPlaylist.id);
      if (updated && updated !== selectedPlaylist) {
        setSelectedPlaylist(updated);
      }
    }
  }, [userPlaylists, selectedPlaylist]);

  useEffect(() => {
    storageService.getLocalTracks().then(setLocalTracks);
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
    if (!currentTrack || currentTrack.localUri) return;
    if (downloadStatus === "completed") {
      await musicService.removeDownload(currentTrack.id);
      showToast("Download removed", "info");
      return;
    }
    try {
      await musicService.downloadTrack(currentTrack);
      showToast("Download started", "info");
    } catch {
      showToast("Failed to start download", "error");
    }
  };




  const libraryItems = useMemo(() => [
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
  ], [favoriteTracks.length, favoriteAlbums.length, favoriteArtists.length, favoritePlaylists.length, userPlaylists.length, Palette]);

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
        .getArtist(selectedArtist.id, selectedArtist.name)
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
  const prevPlaylistIdRef = useRef<string | null>(null);
  useEffect(() => {
    const playlistId = selectedPlaylist?.id ?? null;
    const prevId = prevPlaylistIdRef.current;
    const isNavigatingPlaylist = prevId !== playlistId;
    prevPlaylistIdRef.current = playlistId;

    if (selectedAlbum || selectedArtist || isSelectingPlaylist) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    } else if (isNavigatingPlaylist) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [selectedAlbum, selectedArtist, selectedPlaylist?.id, currentView, isSelectingPlaylist]);

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
  const [strictArtistMatch] = useState(true);
  const [albumMatch] = useState(true);
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [isItemDownloading, setIsItemDownloading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [playlistSortMode, setPlaylistSortMode] = useState<"recent" | "alpha" | "manual">("recent");
  // ---------------------------------

  // Subscribe to playlist importer progress
  useEffect(() => {
    const unsubscribe = playlistImporter.subscribe((progress) => {
      if (progress.total > 0) {
        setImportProgress(progress.current / progress.total);
      }
      if (progress.status === "completed") {
        setImportProgress(0);
        setIsImporting(false);
        showToast("Import complete", "success");
      } else if (progress.status === "cancelled") {
        setImportProgress(0);
        setIsImporting(false);
        showToast("Import cancelled", "info");
      } else if (progress.status === "failed") {
        setImportProgress(0);
        setIsImporting(false);
        showToast("Import failed — playlist may be too large", "error");
      }
    });
    return unsubscribe;
  }, []);

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
      if (type === "playlist") {
        setIsItemDownloading(true);
        showToast("Syncing playlist...", "info");
        try {
          await musicService.syncPlaylistDownloads(item.id);
          showToast("Playlist synced", "success");
        } catch {
          showToast("Sync failed", "error");
        } finally {
          setIsItemDownloading(false);
        }
      } else {
        await musicService.removeDownload(item.id);
        showToast("Download removed", "info");
      }
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
          const localCount = (item.tracks || []).filter((t: any) => t.localUri).length;
          await musicService.downloadPlaylist(item, localCount);
        }
        showToast("Download complete", "success");
      } catch {
        showToast("Download failed", "error");
      } finally {
        setIsItemDownloading(false);
      }
    }
  }, []);

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/*",
          "application/csv",
          "application/vnd.ms-excel",
          "audio/x-mpegurl",
          "application/xspf+xml",
          "application/json",
        ],
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

  const handleImportLocalFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.assets || result.assets.length === 0) return;

      const imported: any[] = [];
      for (const file of result.assets) {
        const track = await importAudioFile(file.uri, file.name);
        if (track) imported.push(track);
      }

      if (imported.length > 0) {
        const updated = [...localTracks, ...imported];
        setLocalTracks(updated);
        await storageService.saveLocalTracks(updated);
        showToast(`Imported ${imported.length} track(s)`, "success");
      }
    } catch (err) {
      console.warn("Local import error", err);
      showToast("Failed to import file", "error");
    }
  }, [localTracks]);

  const handleClearLocalTracks = useCallback(async () => {
    setLocalTracks([]);
    await storageService.saveLocalTracks([]);
    setShowClearLocalModal(false);
    showToast("Local tracks cleared", "success");
  }, []);

  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const handleDownloadAllFavorites = useCallback(async () => {
    const pending = favoriteTracks.filter((t) => !downloadedTrackIds.has(t.id));
    if (pending.length === 0) {
      showToast("All favorites already downloaded", "info");
      return;
    }
    setIsDownloadingAll(true);
    showToast(`Downloading ${pending.length} tracks...`, "info");
    let completed = 0;
    for (const track of pending) {
      try {
        await musicService.downloadTrack(track);
        completed++;
      } catch {
        // skip individual failures
      }
    }
    setIsDownloadingAll(false);
    await refreshDownloadedTracks();
    showToast(`Downloaded ${completed}/${pending.length} tracks`, "success");
  }, [favoriteTracks, downloadedTrackIds, refreshDownloadedTracks]);

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
          showToast("Import started", "info");
          setIsImporting(true);
          setImportProgress(0);
          try {
            const content = await FileSystem.readAsStringAsync(importFile.uri);
            await playlistImporter.startImport(
              playlistTitle,
              playlistDescription,
              content,
              { strictArtistMatch, albumMatch },
              importFile.name,
            );
            // startImport returns immediately (processing is async)
            // completion is handled by the playlistImporter subscription
            setIsCreatingPlaylist(false);
          } catch (e) {
            console.error("Import failed", e);
            showToast("Import failed", "error");
            setIsImporting(false);
            setImportProgress(0);
          }
        } else if (existingPlaylist) {
          const updated = {
            ...existingPlaylist,
            title: playlistTitle,
            description: playlistDescription,
          };
          const saved = await storageService.saveUserPlaylist(updated);
          if (!saved) {
            showToast("Failed to update playlist", "error");
            setIsSavingPlaylist(false);
            return;
          }
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
          const saved = await storageService.saveUserPlaylist(newPlaylist as any);
          if (!saved) {
            showToast("Failed to create playlist", "error");
            setIsSavingPlaylist(false);
            return;
          }
          showToast("Playlist created", "success");
          setIsCreatingPlaylist(false);
        }
        setPlaylistTitle("");
        setPlaylistDescription("");
        setImportFile(null);
      } catch {
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
    } catch {
      showToast("Failed to delete playlist", "error");
    }
  }, []);

  const handleExportPlaylist = useCallback(
    async (format: "csv" | "m3u" | "xspf" | "xml") => {
      if (!selectedPlaylist) return;
      try {
        const playlist = await storageService.getUserPlaylist(selectedPlaylist.id);
        if (!playlist) {
          showToast("Playlist not found", "error");
          return;
        }

        let content: string;
        let filename: string;

        switch (format) {
          case "csv":
            content = generateCSV(playlist, playlist.tracks);
            filename = `${playlist.title || "playlist"}.csv`;
            break;
          case "m3u":
            content = generateM3U(playlist, playlist.tracks);
            filename = `${playlist.title || "playlist"}.m3u`;
            break;
          case "xspf":
            content = generateXSPF(playlist, playlist.tracks);
            filename = `${playlist.title || "playlist"}.xspf`;
            break;
          case "xml":
            content = generateXML(playlist, playlist.tracks);
            filename = `${playlist.title || "playlist"}.xml`;
            break;
          default:
            showToast("Unsupported format", "error");
            return;
        }

        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, content);

        showToast(`Exported to ${filename}`, "success");
      } catch (e) {
        console.error("Export failed:", e);
        showToast("Export failed", "error");
      }
    },
    [selectedPlaylist],
  );

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
        const saved = await storageService.saveUserPlaylist(updatedPlaylist);
        if (!saved) {
          showToast("Failed to remove track", "error");
          return;
        }
        setSelectedPlaylist(updatedPlaylist);
        setAlbumTracks(updatedTracks);
        showToast("Track removed from playlist", "success");
      } catch {
        showToast("Failed to remove track", "error");
      }
    },
    [selectedPlaylist],
  );

  const handleAddToPlaylist = useCallback(() => {
    if (!currentTrack) return;
    setSelectedAlbum(null);
    setSelectedArtist(null);
    setSelectedPlaylist(null);
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
          const saved = await storageService.saveUserPlaylist(updatedPlaylist);
          if (!saved) {
            showToast("Failed to add track to playlist", "error");
            return;
          }
          showToast(`Added to ${playlist.title}`, "success");
        }
        setIsSelectingPlaylist(false);
        setTrackToAddToPlaylist(null);
      } catch {
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
    Palette,
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
      downloadMap,
      Palette,
      Colors,
      Fonts,
    ],
  );

  const renderTracksModule = useCallback(
    (tracks: any[], local: any[], title: string) => {
      const hasLocal = local.length > 0;
      const hasFavorites = tracks.length > 0;
      if (!hasLocal && !hasFavorites) {
        return (
          <View style={styles.moduleContainer}>
            <View style={styles.emptyViewContainer}>
              <ThemedText style={[styles.noResultsText, { color: Palette.white }]}>
                NO TRACKS FOUND
              </ThemedText>
            </View>
          </View>
        );
      }
      return (
        <View style={styles.moduleContainer}>
          {hasLocal && (
            <>
              <ThemedText style={[styles.artistCVSectionTitle, { color: Palette.white }]}>
                DEVICE ({local.length})
              </ThemedText>
              {local.map((track, idx) => (
                <CompactTrackItem
                  key={`local-${track.id}`}
                  track={{ ...track, local: true }}
                  index={idx}
                  isCurrentTrack={currentTrack?.id === track.id}
                  onPress={() => setQueue(local, idx)}
                  onToggleLibrary={handleToggleLibrary}
                  isFavoriteTrack={isFavorite("track", track.id)}
                  isDownloaded={downloadedTrackIds.has(track.id)}
                  downloadStatus={downloadMap[track.id]?.status}
                  downloadProgress={downloadMap[track.id]?.progress}
                />
              ))}
            </>
          )}
          {hasFavorites && (
            <>
              <ThemedText style={[styles.artistCVSectionTitle, { color: Palette.white }]}>
                FAVORITE ({tracks.length})
              </ThemedText>
              {tracks.map((track, idx) => (
                <CompactTrackItem
                  key={`fav-${track.id}`}
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
              ))}
            </>
          )}
        </View>
      );
    },
    [
      currentTrack,
      handleToggleLibrary,
      isFavorite,
      setQueue,
      downloadedTrackIds,
      downloadMap,
      Palette,
      Colors,
      Fonts,
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
    [Palette, Colors, Fonts],
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
    [setSelectedArtist, Palette, Colors, Fonts],
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
                  { borderColor: Palette.border, backgroundColor: Palette.compartment },
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
                ((importMode && !editingPlaylistId && !importFile) || !playlistTitle.trim()) && { opacity: 0.4 },
              ]}
              onPress={() => handleSavePlaylist(existing)}
              disabled={isSavingPlaylist || (importMode && !editingPlaylistId && !importFile) || !playlistTitle.trim()}
            >
              {isSavingPlaylist && importMode && !editingPlaylistId ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator size={10} color={Palette.black} />
                  <ThemedText style={[styles.inlineFormButtonText, { color: Palette.white }]}>
                    IMPORTING...
                  </ThemedText>
                </View>
              ) : isSavingPlaylist ? (
                <ActivityIndicator size="small" color={Palette.white} />
              ) : (
                <ThemedText style={[styles.inlineFormButtonText, { color: Palette.white }]}>
                  {editingPlaylistId
                    ? "UPDATE"
                    : importMode
                      ? "IMPORT"
                      : "CREATE"}
                </ThemedText>
              )}
              {isImporting && importMode && !editingPlaylistId && importProgress > 0 && importProgress < 1 && (
                <View style={[styles.toolbarDownloadProgress, { width: `${importProgress * 100}%` }]} />
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
      handleSavePlaylist,
      isSavingPlaylist,
      isImporting,
      importProgress,
      Palette,
      Colors,
      Fonts,
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
      Palette,
      Colors,
      Fonts,
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
        .getAlbum(selectedAlbum.id, selectedAlbum.title, selectedAlbum.artist?.name)
        .then((data: any) => {
          if (isMounted) {
            setAlbumTracks(data?.tracks || []);
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
            setAlbumTracks(data?.tracks || []);
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
              {(album.artist?.name || album.artists?.map((a: any) => a.name).join(", "))?.toUpperCase() || "UNKNOWN ARTIST"}
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
      downloadMap,
      Palette,
      Colors,
      Fonts,
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
      downloadMap,
      Palette,
      Colors,
      Fonts,
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
              {artistData.imageUrl || artistData.coverUrl ? (
                <Image
                  source={{ uri: artistData.imageUrl || artistData.coverUrl }}
                  style={[styles.artistCVImage, { borderColor: Palette.border }]}
                />
              ) : (
                <View
                  style={[
                    styles.artistCVImage,
                    {
                      borderColor: Palette.border,
                      backgroundColor: Palette.surface || "#1A1A1A",
                      justifyContent: "center",
                      alignItems: "center",
                    },
                  ]}
                >
                  <ThemedText
                    style={{
                      fontFamily: Fonts.monoBold,
                      fontSize: 48,
                      color: Palette.accent || "#0070ef",
                    }}
                  >
                    {(artistData.name || "?")[0].toUpperCase()}
                  </ThemedText>
                </View>
              )}
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
              {(() => {
                // Exclude albums already shown in the "In the Library" section above
                const libraryAlbumIds = new Set(
                  favoriteAlbums
                    .filter(
                      (a) =>
                        a.artist?.id === artistData.id ||
                        a.artist?.name === artistData.name
                    )
                    .map((a) => a.id)
                );
                const nonLibraryAlbums = (artistData.albums || []).filter(
                  (a: any) => !libraryAlbumIds.has(a.id)
                );
                if (nonLibraryAlbums.length === 0) return null;
                return (
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
                      {nonLibraryAlbums.map((album: any, idx: number) => (
                        <CompactGridItem
                          key={`${album.id}-${idx}`}
                          item={album}
                          onPress={() => setSelectedAlbum(album)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })()}
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
      Palette,
      Colors,
      Fonts,
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
      const sortedSelectPlaylists = [...uniqueSelectPlaylists].sort((a, b) => {
        if (playlistSortMode === "recent") {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        } else if (playlistSortMode === "alpha") {
          return (a.title || "").localeCompare(b.title || "");
        }
        return 0;
      });
      return renderPlaylistsModule(
        sortedSelectPlaylists,
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
                <View style={[styles.libColIndex, { borderRightColor: Palette.border }]}>
                  <ThemedText style={[styles.libraryRowIndex, { color: Palette.textDim }]}>
                    {String(index + 1).padStart(2, "0")}
                  </ThemedText>
                  <Plus size={10} color={Palette.white} strokeWidth={3} />
                </View>

                {/* Col 2: Icon Box */}
                <View style={[styles.libColIcon, { borderRightColor: Palette.border }]}>
                  <View
                    style={[
                      styles.libraryRowIconContainer,
                      {
                        backgroundColor:
                          item.id === "tracks" ? Palette.accent : Palette.compartment,
                      },
                    ]}
                  >
                    {item.id === "search" && (
                      <Search size={20} color={Palette.white} />
                    )}
                    {item.id === "tracks" && (
                      <Heart size={20} color={Palette.black} fill={Palette.black} />
                    )}
                    {item.id === "albums" && (
                      <Disc size={20} color={Palette.white} />
                    )}
                    {item.id === "artists" && (
                      <Users size={20} color={Palette.white} />
                    )}
                    {item.id === "playlists" && (
                      <ListMusic size={20} color={Palette.white} />
                    )}
                  </View>
                </View>

                {/* Col 3: Title/Subtitle */}
                <View style={[styles.libColInfo, { borderRightColor: Palette.border }]}>
                  <ThemedText style={[styles.libraryItemTitle, { color: Palette.white }]}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={[styles.libraryItemSubtitle, { color: Palette.textDim }]}>
                    {item.subtitle}
                  </ThemedText>
                </View>

                {/* Col 4: Count */}
                <View style={[styles.libColCount, { borderRightColor: Palette.border }]}>
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
        return renderTracksModule(favoriteTracks, localTracks, "TRACKS");
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
        const sortedPlaylists = [...uniquePlaylists].sort((a, b) => {
          if (playlistSortMode === "recent") {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          } else if (playlistSortMode === "alpha") {
            return (a.title || "").localeCompare(b.title || "");
          }
          return 0; // manual: keep insertion order
        });
        return renderPlaylistsModule(sortedPlaylists, "ALL PLAYLISTS");
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
    localTracks,
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
    playlistSortMode,
  ]);
  return (
    <GestureDetector gesture={backGesture}>
      <SafeAreaView
        style={[styles.container, { backgroundColor: Palette.background }]}
      >
        <LunaAtmosphere />
        {/* Brutalist App Header */}
        <View style={styles.appHeader}>
        <View style={[styles.headerTopRow, { borderBottomColor: Palette.border }]}>
            {/* Left Box: ASCII Brackets and Unit Info */}
            <View style={styles.headerTopLeft}>
              <View style={{ alignItems: "center", marginRight: 8 }}>
                <ThemedText style={[styles.headerSystemInfo, { lineHeight: 12, color: Palette.textDim }]}>┌ + ┐</ThemedText>
                <ThemedText style={[styles.headerSystemInfo, { lineHeight: 12, color: Palette.textDim }]}>└ ─ ┘</ThemedText>
              </View>
              <View>
                <ThemedText style={[styles.headerSystemInfo, { color: Palette.textDim }]}>AUDIO / UNIT</ThemedText>
                <ThemedText style={[styles.headerSystemInfo, { color: Palette.textDim }]}>LUNA MUSIC</ThemedText>
              </View>
            </View>
            
            {/* Center Crosshair */}
            <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: -1 }}>
               <Plus size={16} color={Palette.textDim} strokeWidth={1} />
            </View>

            {/* Right Box: Logo */}
            <View style={styles.headerTopRight}>
              <TouchableOpacity onPress={cycleTheme} activeOpacity={0.7}>
                <ThemedText style={[styles.headerTitle, { color: Palette.accent }]}>LUNA®</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.headerBottomRow}>
            <ThemedText style={[styles.headerSubtitle, { color: Palette.textMuted }]}>
              {themeName}
            </ThemedText>
            <View style={{ alignItems: "flex-end" }}>
              <ThemedText style={[styles.headerClock, { color: Palette.white }]}>
                CLOCK {currentTime.toLocaleTimeString('en-US', { hour12: false })}
              </ThemedText>
              <ThemedText style={[styles.headerClock, { color: Palette.white, letterSpacing: 2, marginTop: 4, fontSize: 8 }]}>
                ||||| | |||| || ||| | |||||
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.viewportHeader}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <ThemedText style={[styles.viewportTitle, { flex: 1, marginRight: 12, color: Palette.white }]} numberOfLines={1}>
              {getActiveHeaderInfo().title}
            </ThemedText>
            {(currentView !== "library" || selectedAlbum || selectedArtist || selectedPlaylist || isSelectingPlaylist) ? (
              <TouchableOpacity
                onPress={handleBack}
                style={[styles.viewportIndexCloseButton, { backgroundColor: Palette.accent }]}
              >
                <X size={16} color={Palette.black} strokeWidth={3} />
              </TouchableOpacity>
            ) : (
              <View style={styles.viewportTitleIndex}>
                <ThemedText style={[styles.viewportTitleIndexLabel, { color: Palette.textMuted }]}>{'// INDEX'}</ThemedText>
                <ThemedText style={[styles.viewportTitleIndexNum, { color: Palette.white }]}>01</ThemedText>
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
              onExport={
                selectedPlaylist?.id?.startsWith("local:")
                  ? () => handleExportPlaylist("csv")
                  : undefined
              }
              onDelete={
                selectedPlaylist?.id?.startsWith("local:")
                  ? () => setShowDeletePlaylistModal(true)
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
                  style={[styles.toolbarItem, { borderRightColor: Palette.border }]}
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
                <View
                  style={[styles.toolbarDownloadItem, { borderRightColor: Palette.border }]}
                >
                  <TouchableOpacity
                    style={styles.toolbarDownloadInner}
                    onPress={isImporting ? () => {
                      playlistImporter.cancelImport();
                    } : () => {
                      setPlaylistTitle("");
                      setPlaylistDescription("");
                      setImportMode(true);
                      setIsCreatingPlaylist(true);
                    }}
                  >
                    {isImporting ? (
                      <>
                        <X size={10} color={Palette.accent} />
                        <ThemedText
                          style={[styles.toolbarText, { color: Palette.accent }]}
                        >
                          CANCEL
                        </ThemedText>
                      </>
                    ) : (
                      <>
                        <FileDown size={12} color={Palette.white} />
                        <ThemedText
                          style={[styles.toolbarText, { color: Palette.white }]}
                        >
                          IMPORT
                        </ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                  {isImporting && importProgress > 0 && importProgress < 1 && (
                    <View
                      style={[
                        styles.toolbarDownloadProgress,
                        { width: `${importProgress * 100}%` },
                      ]}
                    />
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.toolbarItem, { borderRightWidth: 0 }]}
                  onPress={() => {
                    const modes: ("recent" | "alpha" | "manual")[] = ["recent", "alpha", "manual"];
                    const nextIdx = (modes.indexOf(playlistSortMode) + 1) % modes.length;
                    setPlaylistSortMode(modes[nextIdx]);
                  }}
                >
                  <ArrowDownUp size={12} color={Palette.white} />
                  <ThemedText
                    style={[styles.toolbarText, { color: Palette.white }]}
                  >
                    {playlistSortMode === "recent" ? "RECENT" : playlistSortMode === "alpha" ? "A–Z" : "CUSTOM"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )
          )}

          {currentView === "tracks" && (
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
                style={[styles.toolbarItem, { borderRightColor: Palette.border }]}
                onPress={handleImportLocalFile}
              >
                <HardDrive size={12} color={Palette.white} />
                <ThemedText style={[styles.toolbarText, { color: Palette.white }]}>
                  DEVICE
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolbarItem, { borderRightColor: Palette.border }]}
                onPress={handleDownloadAllFavorites}
                disabled={isDownloadingAll || favoriteTracks.length === 0}
              >
                <Download size={12} color={isDownloadingAll || favoriteTracks.length === 0 ? Palette.textDim : Palette.white} />
                <ThemedText
                  style={[
                    styles.toolbarText,
                    { color: isDownloadingAll || favoriteTracks.length === 0 ? Palette.textDim : Palette.white },
                  ]}
                >
                  {isDownloadingAll ? "DL'ING..." : "DOWNLOAD"}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolbarItem, { borderRightWidth: 0 }]}
                onPress={() => setShowClearLocalModal(true)}
                disabled={localTracks.length === 0}
              >
                <Trash2 size={12} color={localTracks.length === 0 ? Palette.textDim : Palette.accentBright} />
                <ThemedText style={[styles.toolbarText, { color: localTracks.length === 0 ? Palette.textDim : Palette.accentBright }]}>
                  CLEAR
                </ThemedText>
              </TouchableOpacity>
            </View>
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
          onShowLyrics={() => setShowLyricsModal(true)}
          repeatMode={repeatMode}
          onToggleRepeat={toggleRepeat}
        />

        {/* Lyrics Modal */}
        <Modal
          visible={showLyricsModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowLyricsModal(false)}
          statusBarTranslucent
        >
          <Pressable
            style={styles.lyricsModalOverlay}
            onPress={() => setShowLyricsModal(false)}
          >
            <Pressable style={[styles.lyricsModalContainer, { backgroundColor: Palette.surface, borderColor: Palette.border }]} onPress={(e) => e.stopPropagation()}>
              {/* Corner Brackets */}
              <View style={[styles.lyricsCornerTL, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerTR, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerBL, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerBR, { borderColor: Palette.accent }]} />

              {/* Modal Header */}
              <View style={[styles.lyricsModalHeader, { borderBottomColor: Palette.border, backgroundColor: Palette.surface }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Mic size={12} color={Palette.accent} />
                  <ThemedText style={[styles.lyricsModalTitle, { color: Palette.white }]}>
                    {'/// LYRICS'}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  onPress={() => setShowLyricsModal(false)}
                  style={[styles.lyricsCloseButton, { backgroundColor: Palette.accent }]}
                  hitSlop={8}
                >
                  <X size={14} color={Palette.white} strokeWidth={3} />
                </TouchableOpacity>
              </View>

              {/* Track Info Sub-header */}
              {currentTrack && (
                <View style={[styles.lyricsTrackInfo, { borderBottomColor: Palette.border, backgroundColor: Palette.compartment }]}>
                  <ThemedText style={[styles.lyricsTrackTitle, { color: Palette.white }]} numberOfLines={1}>
                    {currentTrack.title?.toUpperCase() || "UNKNOWN"}
                  </ThemedText>
                  <ThemedText style={[styles.lyricsTrackArtist, { color: Palette.accent }]} numberOfLines={1}>
                    {currentTrack.artist?.name?.toUpperCase() || "UNKNOWN ARTIST"}
                  </ThemedText>
                </View>
              )}

              {/* Lyrics Content */}
              <View style={[styles.lyricsContentArea, { backgroundColor: Palette.compartment }]}>
                {currentTrack ? (
                  <LyricsView
                    track={currentTrack}
                    position={position}
                    onSeek={(timeMs) => {
                      seekTo(timeMs);
                    }}
                  />
                ) : (
                  <View style={styles.lyricsEmptyState}>
                    <Mic size={32} color={Palette.textDim} />
                    <ThemedText style={[styles.lyricsEmptyText, { color: Palette.textMuted }]}>
                      [ NO TRACK SELECTED ]
                    </ThemedText>
                    <ThemedText style={[styles.lyricsEmptySubtext, { color: Palette.textDim }]}>
                      PLAY A TRACK TO VIEW LYRICS
                    </ThemedText>
                  </View>
                )}
              </View>

              {/* Scanline Overlay */}
              <View style={styles.lyricsScanline} pointerEvents="none" />
            </Pressable>
          </Pressable>
        </Modal>

        {/* Delete Playlist Confirmation Modal */}
        <Modal
          visible={showDeletePlaylistModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowDeletePlaylistModal(false)}
          statusBarTranslucent
        >
          <Pressable
            style={styles.lyricsModalOverlay}
            onPress={() => setShowDeletePlaylistModal(false)}
          >
            <Pressable style={[styles.deleteModalContainer, { backgroundColor: Palette.surface, borderColor: Palette.border }]} onPress={(e) => e.stopPropagation()}>
              {/* Corner Brackets */}
              <View style={[styles.lyricsCornerTL, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerTR, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerBL, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerBR, { borderColor: Palette.accent }]} />

              {/* Modal Header */}
              <View style={[styles.lyricsModalHeader, { borderBottomColor: Palette.border, backgroundColor: Palette.surface }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <AlertTriangle size={12} color={Palette.accentBright} />
                  <ThemedText style={[styles.lyricsModalTitle, { color: Palette.white }]}>
                    {'/// CONFIRM DELETE'}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  onPress={() => setShowDeletePlaylistModal(false)}
                  style={[styles.lyricsCloseButton, { backgroundColor: Palette.accent }]}
                  hitSlop={8}
                >
                  <X size={14} color={Palette.white} strokeWidth={3} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <View style={styles.deleteModalBody}>
                <ThemedText style={[styles.deleteModalText, { color: Palette.white }]}>
                  ARE YOU SURE YOU WANT TO DELETE THIS PLAYLIST?
                </ThemedText>
                <ThemedText style={[styles.deleteModalSubtext, { color: Palette.textMuted }]}>
                  THIS ACTION CANNOT BE UNDONE.
                </ThemedText>

                {/* Buttons */}
                <View style={styles.deleteModalButtons}>
                  <TouchableOpacity
                    style={[styles.deleteCancelButton, { backgroundColor: Palette.compartment, borderColor: Palette.border }]}
                    onPress={() => setShowDeletePlaylistModal(false)}
                  >
                    <ThemedText style={[styles.deleteCancelText, { color: Palette.white }]}>CANCEL</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deleteConfirmButton, { backgroundColor: Palette.accentBright }]}
                    onPress={() => {
                      if (selectedPlaylist?.id) {
                        handleDeletePlaylist(selectedPlaylist.id);
                      }
                      setShowDeletePlaylistModal(false);
                    }}
                  >
                    <Trash2 size={12} color={Palette.white} />
                    <ThemedText style={[styles.deleteConfirmText, { color: Palette.white }]}>DELETE</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Clear Local Tracks Confirmation Modal */}
        <Modal
          visible={showClearLocalModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowClearLocalModal(false)}
          statusBarTranslucent
        >
          <Pressable
            style={styles.lyricsModalOverlay}
            onPress={() => setShowClearLocalModal(false)}
          >
            <Pressable style={[styles.deleteModalContainer, { backgroundColor: Palette.surface, borderColor: Palette.border }]} onPress={(e) => e.stopPropagation()}>
              <View style={[styles.lyricsCornerTL, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerTR, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerBL, { borderColor: Palette.accent }]} />
              <View style={[styles.lyricsCornerBR, { borderColor: Palette.accent }]} />

              <View style={[styles.lyricsModalHeader, { borderBottomColor: Palette.border, backgroundColor: Palette.surface }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <AlertTriangle size={12} color={Palette.accentBright} />
                  <ThemedText style={[styles.lyricsModalTitle, { color: Palette.white }]}>
                    {'/// CLEAR DEVICE TRACKS'}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  onPress={() => setShowClearLocalModal(false)}
                  style={[styles.lyricsCloseButton, { backgroundColor: Palette.accent }]}
                  hitSlop={8}
                >
                  <X size={14} color={Palette.white} strokeWidth={3} />
                </TouchableOpacity>
              </View>

              <View style={styles.deleteModalBody}>
                <ThemedText style={[styles.deleteModalText, { color: Palette.white }]}>
                  REMOVE ALL {localTracks.length} IMPORTED TRACKS FROM THE LIBRARY?
                </ThemedText>
                <ThemedText style={[styles.deleteModalSubtext, { color: Palette.textMuted }]}>
                  FILES WILL REMAIN ON YOUR DEVICE.
                </ThemedText>

                <View style={styles.deleteModalButtons}>
                  <TouchableOpacity
                    style={[styles.deleteCancelButton, { backgroundColor: Palette.compartment, borderColor: Palette.border }]}
                    onPress={() => setShowClearLocalModal(false)}
                  >
                    <ThemedText style={[styles.deleteCancelText, { color: Palette.white }]}>KEEP</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deleteConfirmButton, { backgroundColor: Palette.accentBright }]}
                    onPress={handleClearLocalTracks}
                  >
                    <Trash2 size={12} color={Palette.white} />
                    <ThemedText style={[styles.deleteConfirmText, { color: Palette.white }]}>CLEAR ALL</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
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
    borderWidth: 1,
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
  // --- Lyrics Modal Styles ---
  lyricsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.compartment,
  },
  lyricsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.md,
  },
  lyricsModalContainer: {
    width: "100%",
    height: Dimensions.get("window").height * 0.75,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    overflow: "hidden",
  },
  lyricsCornerTL: {
    position: "absolute",
    top: -1,
    left: -1,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: Palette.accent,
    zIndex: 10,
  },
  lyricsCornerTR: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: Palette.accent,
    zIndex: 10,
  },
  lyricsCornerBL: {
    position: "absolute",
    bottom: -1,
    left: -1,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: Palette.accent,
    zIndex: 10,
  },
  lyricsCornerBR: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: Palette.accent,
    zIndex: 10,
  },
  lyricsModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    backgroundColor: Palette.black,
  },
  lyricsModalTitle: {
    fontFamily: Fonts.monoBold,
    fontSize: 12,
    color: Palette.white,
    letterSpacing: 1,
  },
  lyricsCloseButton: {
    width: 28,
    height: 28,
    backgroundColor: Palette.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  lyricsTrackInfo: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    backgroundColor: Palette.compartment,
  },
  lyricsTrackTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    color: Palette.white,
    letterSpacing: 0.5,
  },
  lyricsTrackArtist: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.accent,
    marginTop: 2,
    letterSpacing: 1,
  },
  lyricsContentArea: {
    flex: 1,
    backgroundColor: Palette.black,
  },
  lyricsEmptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  lyricsEmptyText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Palette.textMuted,
    letterSpacing: 2,
  },
  lyricsEmptySubtext: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    color: Palette.textDim,
    letterSpacing: 1,
  },
  lyricsScanline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    opacity: 0.03,
    backgroundImage: undefined,
  },
  deleteModalContainer: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    overflow: "hidden",
  },
  deleteModalBody: {
    padding: 20,
    alignItems: "center",
  },
  deleteModalText: {
    fontFamily: Fonts.monoBold,
    fontSize: 12,
    color: Palette.white,
    letterSpacing: 1,
    textAlign: "center",
    lineHeight: 20,
  },
  deleteModalSubtext: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.textMuted,
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 8,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    width: "100%",
  },
  deleteCancelButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.compartment,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  deleteCancelText: {
    fontFamily: Fonts.monoBold,
    fontSize: 11,
    color: Palette.white,
    letterSpacing: 1,
  },
  deleteConfirmButton: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Palette.accentBright,
  },
  deleteConfirmText: {
    fontFamily: Fonts.monoBold,
    fontSize: 11,
    color: Palette.white,
    letterSpacing: 1,
  },
});

