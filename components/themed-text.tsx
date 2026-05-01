import { StyleSheet, Text, type TextProps } from "react-native";
import { FontSizes, FontLineHeights, Palette, Fonts } from "../constants/theme";
import { useThemeColor } from "../hooks/use-theme-color";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | "default"
    | "title"
    | "defaultSemiBold"
    | "subtitle"
    | "link"
    | "phrase"
    | "mono"
    | "monoBold";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return (
    <Text
      style={[
        { color },
        type === "default" ? styles.default : undefined,
        type === "title" ? styles.title : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        type === "link" ? styles.link : undefined,
        type === "phrase" ? styles.phrase : undefined,
        type === "mono" ? styles.mono : undefined,
        type === "monoBold" ? styles.monoBold : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  defaultSemiBold: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    fontFamily: Fonts.monoBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: FontSizes.h2,
    lineHeight: FontLineHeights.h2,
    fontFamily: Fonts.displayBlack,
    textTransform: "uppercase",
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: FontSizes.h3,
    lineHeight: FontLineHeights.h3,
    fontFamily: Fonts.displayBold,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  link: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    color: Palette.accent,
    fontFamily: Fonts.monoBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  phrase: {
    fontSize: FontSizes.phrase,
    lineHeight: FontLineHeights.phrase,
    fontFamily: Fonts.displayBold,
    textTransform: "uppercase",
  },
  mono: {
    fontSize: FontSizes.small,
    lineHeight: FontLineHeights.small,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  monoBold: {
    fontSize: FontSizes.small,
    lineHeight: FontLineHeights.small,
    fontFamily: Fonts.monoBold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
