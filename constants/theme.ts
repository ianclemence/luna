/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const Colors = {
  light: {
    text: "#1A1A1A",
    background: "#FDFCF0", // Slightly warmer cream for elegant retro feel
    tint: "#000000",
    icon: "#1A1A1A",
    tabIconDefault: "#666666",
    tabIconSelected: "#1A1A1A",
    secondary: "#E6E2D3",
    border: "#1A1A1A",
    accent: "#8B4513", // Saddle Brown for editorial accent
    muted: "#999999",
  },
  dark: {
    text: "#FDFCF0",
    background: "#1A1A1A",
    tint: "#FDFCF0",
    icon: "#FDFCF0",
    tabIconDefault: "#999999",
    tabIconSelected: "#FDFCF0",
    secondary: "#2D2D2D",
    border: "#FDFCF0",
    accent: "#D4AF37", // Gold for dark mode elegance
    muted: "#666666",
  },
};

export const Palette = {
  black: "#1A1A1A",
  white: "#FDFCF0",
  cream: "#FDFCF0",
  charcoal: "#2D2D2D",
  gold: "#D4AF37",
  sienna: "#8B4513",
  slate: "#708090",
  success: "#2E7D32",
  warning: "#F57C00",
  error: "#C62828",
  primary: "#1A1A1A", // Brand primary (Charcoal)
};

export const FontSizes = {
  h1: 40, // Larger for editorial impact
  h2: 28,
  phrase: 22,
  button: 16,
  body: 16,
  small: 12,
  caption: 10,
};

export const Radii = {
  card: 0, // Sharp edges
  button: 0,
  modal: 0,
  input: 0,
  xs: 4,
  sm: 8,
  m: 12,
  l: 16,
  xl: 24,
  full: 9999,
};

export const Strokes = {
  hairline: 1,
  thin: 1.5,
  regular: 2,
  thick: 3,
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16, // More generous whitespace
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const Patterns = {
  dotted: {
    borderStyle: "solid" as const,
    borderWidth: 1.5,
  },
  dashed: {
    borderStyle: "solid" as const,
    borderWidth: 1.5,
  },
};

export const Shadows = {
  retro: {
    shadowColor: "#1A1A1A",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
};

export const Fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  displayMedium: "PlayfairDisplay_500Medium",
  displaySemiBold: "PlayfairDisplay_600SemiBold",
  displayBold: "PlayfairDisplay_700Bold",
};
