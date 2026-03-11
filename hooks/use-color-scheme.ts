import { useThemeContext } from "../contexts/theme-context";

export function useColorScheme() {
  const { effectiveColorScheme } = useThemeContext();

  return effectiveColorScheme;
}
