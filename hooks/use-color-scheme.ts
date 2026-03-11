import { useTheme } from './use-theme';

export function useColorScheme() {
  const { effectiveColorScheme } = useTheme();
  return effectiveColorScheme;
}