import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors, FontSizes, Spacing } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";
import {
    LyricLine,
    LyricsData,
    musicService,
    Track,
} from "../services/music-service";
import { ThemedText } from "./themed-text";

interface LyricsViewProps {
  track: Track;
  position: number;
  onSeek: (timeMs: number) => void;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  track,
  position,
  onSeek,
}) => {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
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
  }, [track.id]);

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
          viewPosition: 0.3,
        });
      }
    }
  }, [position, lyrics, activeIndex]);

  const renderItem = ({ item, index }: { item: LyricLine; index: number }) => {
    const isActive = index === activeIndex;

    return (
      <TouchableOpacity
        onPress={() => onSeek(item.time * 1000)}
        activeOpacity={0.7}
        style={styles.lineItem}
      >
        <ThemedText
          style={[
            styles.lineText,
            isActive && {
              color: colors.primary,
              fontWeight: "bold",
              fontSize: FontSizes.lg,
            },
            !isActive && { opacity: 0.4 },
          ]}
        >
          {item.text}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!lyrics || lyrics.lines.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText style={{ opacity: 0.5 }}>No lyrics available</ThemedText>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={lyrics.lines}
      keyExtractor={(_, index) => index.toString()}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
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
    paddingVertical: Spacing.xl * 2,
    paddingHorizontal: Spacing.lg,
  },
  lineItem: {
    marginVertical: Spacing.sm,
  },
  lineText: {
    fontSize: FontSizes.md,
    lineHeight: 30,
    textAlign: "center",
  },
});
