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
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
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
  } = usePlayer();

  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = currentTrack ? isFavorite("track", currentTrack.id) : false;

  const handleToggleFavorite = async () => {
    if (!currentTrack) return;
    await toggleFavorite("track", currentTrack);
  };

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

  // Format time (mm:ss)
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const libraryItems = [
    { id: "search", title: "Search", icon: Search, count: null },
    { id: "tracks", title: "Tracks", icon: Heart, count: 124 },
    { id: "albums", title: "Albums", icon: Disc, count: 42 },
    { id: "artists", title: "Artists", icon: Users, count: 18 },
    { id: "playlists", title: "Playlists", icon: ListMusic, count: 12 },
  ];

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
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentScrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.libraryGrid}>
            {libraryItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.libraryCard}
                activeOpacity={0.7}
              >
                <View style={styles.libraryIconContainer}>
                  <item.icon size={18} color={POOLSUITE_COLORS.black} />
                </View>
                <View style={styles.libraryTextContainer}>
                  <ThemedText style={styles.libraryItemTitle}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.libraryItemCount}>
                    {item.count !== null
                      ? `${item.count} items`
                      : "Explore Library"}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
                    {formatTime(duration || currentTrack.duration || 0)}
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
    padding: 10,
    backgroundColor: POOLSUITE_COLORS.windowBg,
    borderWidth: 2,
    borderColor: POOLSUITE_COLORS.black,
    borderRadius: Radii.m,
  },
  libraryIconContainer: {
    width: 40,
    height: 40,
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
  },
  libraryItemCount: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    opacity: 0.6,
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
