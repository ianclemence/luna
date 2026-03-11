import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Appearance, AppState } from "react-native";

export type Theme = "light" | "dark" | "auto";

const THEME_STORAGE_KEY = "app_theme_preference";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("auto");
  const [systemColorScheme, setSystemColorScheme] = useState<"light" | "dark">(
    "light",
  );

  // Load saved theme preference on mount
  useEffect(() => {
    loadThemePreference();

    // Listen for system color scheme changes
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        updateSystemColorScheme();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Update system color scheme when appearance changes
  useEffect(() => {
    updateSystemColorScheme();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (
        savedTheme &&
        (savedTheme === "light" ||
          savedTheme === "dark" ||
          savedTheme === "auto")
      ) {
        setTheme(savedTheme as Theme);
      }
    } catch (error) {
      console.error("Failed to load theme preference:", error);
    }
  };

  const updateSystemColorScheme = () => {
    const colorScheme = Appearance.getColorScheme();
    setSystemColorScheme(colorScheme || "light");
  };

  const saveThemePreference = async (newTheme: Theme) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
      setTheme(newTheme);
    } catch (error) {
      console.error("Failed to save theme preference:", error);
    }
  };

  const toggleTheme = () => {
    if (theme === "auto") {
      // If auto, switch to opposite of current system theme
      const oppositeTheme = systemColorScheme === "light" ? "dark" : "light";
      saveThemePreference(oppositeTheme);
    } else {
      // If manual, switch to the other manual theme
      const newTheme = theme === "light" ? "dark" : "light";
      saveThemePreference(newTheme);
    }
  };

  // Get the effective color scheme (accounting for auto theme)
  const getEffectiveColorScheme = (): "light" | "dark" => {
    if (theme === "auto") {
      return systemColorScheme;
    }
    return theme;
  };

  // Get the effective color scheme
  const effectiveColorScheme = getEffectiveColorScheme();
  const isDarkMode = effectiveColorScheme === "dark";

  // Removed theme debug logs

  // Return a memoized object to ensure reference changes when theme changes
  return {
    theme,
    systemColorScheme,
    effectiveColorScheme,
    toggleTheme,
    setTheme: saveThemePreference,
    isDarkMode,
  };
}
