/**
 * Luna OS — Theme Color Hook
 * Reads from the multi-theme context provider.
 */

import { useThemeContext } from "../contexts/theme-context";
import type { ColorTokens } from "../constants/themes";

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof ColorTokens,
) {
  const { colors, isDark } = useThemeContext();
  if (isDark && props.dark) {
    return props.dark;
  }
  if (!isDark && props.light) {
    return props.light;
  }
  return colors[colorName];
}
