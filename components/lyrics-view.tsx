import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { useThemeContext } from "../contexts/theme-context";
import {
  LyricLine,
  LyricsData,
  musicService,
  Track,
} from "../services/music-service";
import { Skeleton } from "./skeleton-loader";
import { ThemedText } from "./themed-text";

interface LyricsViewProps {
  track: Track;
  position: number;
  onSeek: (timeMs: number) => void;
}

interface LyricLineItemProps {
  item: LyricLine;
  index: number;
  activeIndex: number;
  onSeek: (timeMs: number) => void;
}

const LyricLineItem = React.memo(
  ({ item, index, activeIndex, onSeek }: LyricLineItemProps) => {
    const { palette, fonts } = useThemeContext();
    const isActive = index === activeIndex;

    return (
      <TouchableOpacity
        onPress={() => onSeek(item.time * 1000)}
        activeOpacity={0.7}
        style={[styles.lineItem, isActive && styles.activeLineItem]}
      >
        <ThemedText
          style={{
            color: isActive ? palette.accent : palette.white,
            opacity: isActive ? 1 : 0.3,
            fontFamily: isActive ? fonts.displayBlack : fonts.mono,
            fontSize: isActive ? 20 : 12,
            lineHeight: isActive ? 40 : 30,
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          {item.text}
        </ThemedText>
      </TouchableOpacity>
    );
  },
);
LyricLineItem.displayName = "LyricLineItem";

export const LyricsView: React.FC<LyricsViewProps> = ({
  track,
  position,
  onSeek,
}) => {
  const { palette, fonts } = useThemeContext();
  const [lyrics, setLyrics] = useState<LyricsData | null>(() =>
    musicService.peekCachedLyrics(track)
  );
  const [loading, setLoading] = useState(() => !musicService.peekCachedLyrics(track));
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const cached = musicService.peekCachedLyrics(track);
    if (cached) {
      setLyrics(cached);
      setLoading(false);
      return;
    }

    const fetchLyrics = async () => {
      setLoading(true);
      try {
        const data = await musicService.getLyrics(track);
        setLyrics(data);
      } catch (error) {
        console.error("Failed to fetch lyrics:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLyrics();
  }, [track]);

  useEffect(() => {
    if (!lyrics || lyrics.source !== "synced") return;
    const currentPositionSeconds = position / 1000;
    const index = lyrics.lines.findLastIndex(
      (line) => currentPositionSeconds >= line.time,
    );
    if (index !== activeIndex) {
      setActiveIndex(index);
      if (index !== -1) {
        flatListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      }
    }
  }, [position, lyrics, activeIndex]);

  const renderItem = useCallback(
    ({ item, index }: { item: LyricLine; index: number }) => (
      <LyricLineItem
        item={item}
        index={index}
        activeIndex={activeIndex}
        onSeek={onSeek}
      />
    ),
    [activeIndex, onSeek],
  );

  const keyExtractor = useCallback(
    (_: any, index: number) => index.toString(),
    [],
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingHorizontal: 24, alignItems: "flex-start" }]}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton
            key={i}
            width={`${40 + Math.random() * 50}%`}
            height={24}
            style={{ marginBottom: 24 }}
          />
        ))}
      </View>
    );
  }

  if (!lyrics || lyrics.lines.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={{ fontFamily: fonts.mono, fontSize: 12, color: palette.textMuted, letterSpacing: 2, marginTop: 8 }}>
          [ NO LYRICS AVAILABLE ]
        </ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={lyrics.lines}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      initialNumToRender={15}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews={true}
      onScrollToIndexFailed={(info) => {
        const wait = new Promise((resolve) => setTimeout(resolve, 500));
        wait.then(() => {
          flatListRef.current?.scrollToIndex({
            index: info.index,
            animated: true,
          });
        });
      }}
    />
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  lineItem: {
    marginVertical: 12,
    paddingHorizontal: 12,
  },
  activeLineItem: {
    marginVertical: 16,
  },
});
