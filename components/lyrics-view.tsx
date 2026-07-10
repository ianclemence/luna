import React from "react";
import { View } from "react-native";
import { useThemeContext } from "../contexts/theme-context";
import { ThemedText } from "./themed-text";

interface LyricsViewProps {
  lyrics: { time: number; text: string }[];
  currentTime: number;
}

export function LyricsView({ lyrics, currentTime }: LyricsViewProps) {
  const { palette, fonts } = useThemeContext();

  if (!lyrics || lyrics.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
        <ThemedText style={{ fontFamily: fonts.mono, fontSize: 12, color: palette.textMuted, letterSpacing: 2 }}>
          NO LYRICS AVAILABLE
        </ThemedText>
        <ThemedText style={{ fontFamily: fonts.mono, fontSize: 9, color: palette.textDim, letterSpacing: 1 }}>
          LYRICS MAY BE UNAVAILABLE FOR THIS TRACK
        </ThemedText>
      </View>
    );
  }

  const activeIndex = lyrics.findIndex((line, i) => {
    const nextTime = lyrics[i + 1]?.time ?? Infinity;
    return currentTime >= line.time && currentTime < nextTime;
  });

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      {lyrics.map((line, i) => {
        const isActive = i === activeIndex;
        return (
          <ThemedText
            key={i}
            style={{
              fontFamily: isActive ? fonts.displayBlack : fonts.mono,
              fontSize: isActive ? 20 : 12,
              color: isActive ? palette.accent : palette.white,
              opacity: isActive ? 1 : 0.3,
              textAlign: "center",
              marginVertical: 6,
              letterSpacing: isActive ? 0 : 1,
              textTransform: "uppercase",
            }}
          >
            {line.text}
          </ThemedText>
        );
      })}
    </View>
  );
}
