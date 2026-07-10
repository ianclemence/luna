import { Text, type TextProps } from "react-native";
import { useThemeContext } from "../contexts/theme-context";

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
  const { colors, isDark, fonts, palette } = useThemeContext();

  let color = colors.text;
  if (isDark && darkColor) color = darkColor;
  if (!isDark && lightColor) color = lightColor;

  return (
    <Text
      style={[
        { color },
        type === "default" ? { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, textTransform: "uppercase" as const, letterSpacing: 0.5 } : undefined,
        type === "defaultSemiBold" ? { fontFamily: fonts.monoBold, fontSize: 13, lineHeight: 18, textTransform: "uppercase" as const, letterSpacing: 0.5 } : undefined,
        type === "title" ? { fontFamily: fonts.displayBlack, fontSize: 36, lineHeight: 34, textTransform: "uppercase" as const, letterSpacing: -1 } : undefined,
        type === "subtitle" ? { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28, textTransform: "uppercase" as const, letterSpacing: -0.5 } : undefined,
        type === "link" ? { fontFamily: fonts.monoBold, fontSize: 13, lineHeight: 18, color: palette.accent, textTransform: "uppercase" as const, letterSpacing: 0.5 } : undefined,
        type === "phrase" ? { fontFamily: fonts.displayBold, fontSize: 20, lineHeight: 24, textTransform: "uppercase" as const } : undefined,
        type === "mono" ? { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14, textTransform: "uppercase" as const, letterSpacing: 1 } : undefined,
        type === "monoBold" ? { fontFamily: fonts.monoBold, fontSize: 11, lineHeight: 14, textTransform: "uppercase" as const, letterSpacing: 1 } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}
