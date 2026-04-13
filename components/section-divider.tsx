import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Palette } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";

interface SectionDividerProps {
  variant?: "zigzag" | "kente" | "diamond" | "line";
  color?: string;
  height?: number;
}

export const SectionDivider = ({
  variant = "zigzag",
  color,
  height = 20,
}: SectionDividerProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor =
    color || (colorScheme === "dark" ? Palette.gold : Palette.sienna);

  if (variant === "line") {
    return (
      <View style={[styles.container, { height }]}>
        <View
          style={[styles.line, { backgroundColor: strokeColor, opacity: 0.3 }]}
        />
      </View>
    );
  }

  if (variant === "zigzag") {
    return (
      <View style={[styles.container, { height }]}>
        <Svg
          width="100%"
          height={height}
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
        >
          <Path
            d="M0 10 L12.5 2 L25 10 L37.5 2 L50 10 L62.5 2 L75 10 L87.5 2 L100 10"
            stroke={strokeColor}
            strokeWidth="2"
            fill="none"
            strokeLinecap="square"
            strokeLinejoin="miter"
            opacity="0.6"
          />
        </Svg>
      </View>
    );
  }

  if (variant === "diamond") {
    return (
      <View style={[styles.container, { height, alignItems: "center" }]}>
        <Svg width={60} height={height} viewBox="0 0 60 20">
          <Path
            d="M30 2 L58 10 L30 18 L2 10 Z"
            stroke={strokeColor}
            strokeWidth="2"
            fill="none"
            strokeLinejoin="miter"
          />
          <Path
            d="M30 6 L50 10 L30 14 L10 10 Z"
            stroke={strokeColor}
            strokeWidth="1"
            fill="none"
            strokeLinejoin="miter"
            opacity="0.4"
          />
        </Svg>
      </View>
    );
  }

  if (variant === "kente") {
    return (
      <View style={[styles.container, { height, flexDirection: "row" }]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.kenteStrip,
              {
                backgroundColor: i % 2 === 0 ? strokeColor : "transparent",
                opacity: i % 2 === 0 ? 0.4 : 0.15,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
  },
  line: {
    width: "100%",
    height: 1,
    marginVertical: 10,
  },
  kenteStrip: {
    flex: 1,
    height: "100%",
    borderWidth: 1,
    borderColor: "transparent",
  },
});
