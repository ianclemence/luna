import { useEffect } from "react";
import { useTheme } from "./use-theme";

export function useColorScheme() {
  const { effectiveColorScheme } = useTheme();

  // Debug: Log color scheme changes
  useEffect(() => {
    console.log(
      "useColorScheme hook - effectiveColorScheme:",
      effectiveColorScheme,
    );
  }, [effectiveColorScheme]);

  return effectiveColorScheme;
}
