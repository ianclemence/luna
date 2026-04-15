/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const Palette = {
  black: "#000000",
  white: "#FFFFFF",
  cream: "#FDFCF0",
  beige: "#F5E6D3",
  softCream: "#FEF9F3",
  blue: "#99CCFF",
  pink: "#FFB6C1",
  green: "#98FB98",
  charcoal: "#2D2D2D",
  gold: "#FFD700",
  sienna: "#8B4513",
  slate: "#708090",
  success: "#2E7D32",
  warning: "#F57C00",
  error: "#C62828",
};

export const Colors = {
  light: {
    text: Palette.black,
    background: Palette.beige,
    windowBg: Palette.cream,
    tint: Palette.black,
    icon: Palette.black,
    tabIconDefault: "#666666",
    tabIconSelected: Palette.black,
    secondary: Palette.softCream,
    border: Palette.black,
    accent: Palette.blue,
    pink: Palette.pink,
    green: Palette.green,
    gold: Palette.gold,
    muted: "rgba(0,0,0,0.5)",
    highlight: Palette.blue,
    surface: Palette.cream,
    surfaceDark: Palette.beige,
    skeleton: "rgba(0,0,0,0.08)",
    vinyl: Palette.black,
    vinylRing: Palette.cream,
  },
  dark: {
    // Keeping dark same as light for now as requested
    text: Palette.black,
    background: Palette.beige,
    windowBg: Palette.cream,
    tint: Palette.black,
    icon: Palette.black,
    tabIconDefault: "#666666",
    tabIconSelected: Palette.black,
    secondary: Palette.softCream,
    border: Palette.black,
    accent: Palette.blue,
    pink: Palette.pink,
    green: Palette.green,
    gold: Palette.gold,
    muted: "rgba(0,0,0,0.5)",
    highlight: Palette.blue,
    surface: Palette.cream,
    surfaceDark: Palette.beige,
    skeleton: "rgba(0,0,0,0.08)",
    vinyl: Palette.black,
    vinylRing: Palette.cream,
  },
};

export const FontSizes = {
  h1: 52,
  h2: 36,
  h3: 24,
  phrase: 20,
  button: 14,
  body: 14,
  small: 11,
  caption: 10,
};

export const FontLineHeights = {
  h1: 58,
  h2: 42,
  h3: 30,
  phrase: 26,
  button: 18,
  body: 20,
  small: 14,
  caption: 12,
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
  adinkra: {
    zigzag: {
      borderStyle: "solid" as const,
      borderWidth: 2,
      borderColor: Palette.gold,
    },
    star: {
      borderStyle: "solid" as const,
      borderWidth: 2,
      borderColor: Palette.sienna,
    },
    spiral: {
      borderStyle: "solid" as const,
      borderWidth: 2,
      borderColor: Palette.gold,
    },
  },
  kente: {
    block: {
      borderWidth: 2,
      borderColor: Palette.sienna,
    },
    strip: {
      borderWidth: 4,
      borderColor: Palette.gold,
    },
  },
  mudcloth: {
    circle: {
      borderWidth: 3,
      borderColor: Palette.charcoal,
    },
    diamond: {
      borderWidth: 2,
      borderColor: Palette.sienna,
    },
  },
  textures: {
    noise: {
      opacity: 0.03,
    },
    linen: {
      opacity: 0.02,
    },
    geometric: {
      opacity: 0.015,
    },
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
  subtle: {
    shadowColor: "#000000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 0,
    elevation: 2,
  },
  elevated: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  vinyl: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
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
