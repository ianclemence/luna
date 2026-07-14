/**
 * Luna OS — Theme Hook
 * Reads from the multi-theme context provider.
 */

import { useThemeContext } from "../contexts/theme-context";

export type Theme = "dark" | "light";

export function useTheme() {
  const ctx = useThemeContext();
  return {
    theme: (ctx.isDark ? "dark" : "light") as Theme,
    systemColorScheme: (ctx.isDark ? "dark" : "light") as const,
    effectiveColorScheme: (ctx.isDark ? "dark" : "light") as const,
    toggleTheme: ctx.cycleTheme,
    setTheme: ctx.setTheme,
    isDarkMode: ctx.isDark,
    themeId: ctx.themeId,
    themeName: ctx.themeName,
  };
}
