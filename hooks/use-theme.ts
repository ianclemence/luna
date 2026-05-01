/**
 * Luna OS — Theme Hook (Dark Mode Only)
 * Tactical Telemetry CRT Terminal — dark mode exclusivity.
 */

export type Theme = "dark";

export function useTheme() {
  return {
    theme: "dark" as Theme,
    systemColorScheme: "dark" as const,
    effectiveColorScheme: "dark" as const,
    toggleTheme: () => {},
    setTheme: () => {},
    isDarkMode: true,
  };
}
