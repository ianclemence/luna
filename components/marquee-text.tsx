import React from "react";
import { StyleSheet, type TextProps } from "react-native";
import TextTicker from "react-native-text-ticker";
import { FontSizes, FontLineHeights, Fonts } from "../constants/theme";
import { useThemeColor } from "../hooks/use-theme-color";

export type MarqueeTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | "default"
    | "title"
    | "defaultSemiBold"
    | "subtitle"
    | "link"
    | "phrase";
  duration?: number;
  loop?: boolean;
  repeatSpacer?: number;
  marqueeDelay?: number;
};

export function MarqueeText({
  style,
  lightColor,
  darkColor,
  type = "default",
  duration = 10000,
  loop = true,
  repeatSpacer = 50,
  marqueeDelay = 3000,
  children,
  ...rest
}: MarqueeTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return (
    <TextTicker
      style={[
        { color },
        type === "default" ? styles.default : undefined,
        type === "title" ? styles.title : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        type === "link" ? styles.link : undefined,
        type === "phrase" ? styles.phrase : undefined,
        style,
      ]}
      duration={duration}
      loop={loop}
      bounce={false}
      repeatSpacer={repeatSpacer}
      marqueeDelay={marqueeDelay}
      {...rest}
    >
      {children}
    </TextTicker>
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    fontFamily: Fonts.regular,
  },
  defaultSemiBold: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    fontFamily: Fonts.bold,
  },
  title: {
    fontSize: FontSizes.h2,
    lineHeight: FontLineHeights.h2,
    fontFamily: Fonts.displayBold,
  },
  subtitle: {
    fontSize: FontSizes.h3,
    lineHeight: FontLineHeights.h3,
    fontFamily: Fonts.bold,
  },
  link: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    fontFamily: Fonts.bold,
  },
  phrase: {
    fontSize: FontSizes.phrase,
    lineHeight: FontLineHeights.phrase,
    fontFamily: Fonts.displayMedium,
  },
});
