import React, { createContext, useContext } from "react";
import { useTheme as useThemeHook } from "../hooks/use-theme";

const ThemeContext = createContext<ReturnType<typeof useThemeHook> | null>(
  null,
);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeHook();

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}
