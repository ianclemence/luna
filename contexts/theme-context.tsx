import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ThemeID,
  THEMES,
  THEME_NAMES,
  getNextTheme,
  type ThemeDefinition,
  type PaletteTokens,
  type ColorTokens,
  type RadiiTokens,
  type FontTokens,
} from "../constants/themes";

const THEME_STORAGE_KEY = "luna_theme_id";

interface ThemeContextValue {
  themeId: ThemeID;
  theme: ThemeDefinition;
  palette: PaletteTokens;
  colors: ColorTokens;
  radii: RadiiTokens;
  fonts: FontTokens;
  isDark: boolean;
  themeName: string;
  cycleTheme: () => void;
  setTheme: (id: ThemeID) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeID>("tactical");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored && stored in THEMES) {
        setThemeId(stored as ThemeID);
      }
      setLoaded(true);
    }).catch(() => {
      setLoaded(true);
    });
  }, []);

  const setTheme = useCallback((id: ThemeID) => {
    setThemeId(id);
    AsyncStorage.setItem(THEME_STORAGE_KEY, id).catch(() => {});
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme(getNextTheme(themeId));
  }, [themeId, setTheme]);

  const value = useMemo<ThemeContextValue>(() => {
    const t = THEMES[themeId];
    return {
      themeId,
      theme: t,
      palette: t.palette,
      colors: t.colors,
      radii: t.radii,
      fonts: t.fonts,
      isDark: t.isDark,
      themeName: THEME_NAMES[themeId],
      cycleTheme,
      setTheme,
    };
  }, [themeId, cycleTheme, setTheme]);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
