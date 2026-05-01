/**
 * Luna OS — Theme Color Hook
 * Tactical Telemetry CRT Terminal — single dark theme.
 */

import { Colors } from "@/constants/theme";

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors,
) {
  // Always use dark color if provided, otherwise use the Colors token
  if (props.dark) {
    return props.dark;
  }
  return Colors[colorName];
}
