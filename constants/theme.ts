/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const Palette = {
  black: "#000000",
  white: "#FFFFFF",
  cream: "#FDFCF0",
  beige: "#F5E6D3",
  blue: "#99CCFF",
  pink: "#FFB6C1",
  green: "#98FB98",
  gold: "#FFD700",
  error: "#C62828",
  danger: "#FF4B4B",
  lavender: "#E6E6FA",

  // Dark mode specific
  darkBg: "#0E0C0A",
  darkSurface: "#1C1816",
  darkCard: "#252018",
  darkBorder: "#6B5D4D",
  darkText: "#E8D5B5",
  darkMuted: "rgba(232,213,181,0.5)",
  darkSkeleton: "rgba(232,213,181,0.08)",
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
    border: Palette.black,
    accent: Palette.blue,
    pink: Palette.pink,
    green: Palette.green,
    gold: Palette.gold,
    danger: Palette.danger,
    lavender: Palette.lavender,
    muted: "rgba(0,0,0,0.5)",
    highlight: Palette.blue,
    surface: Palette.cream,
    surfaceDark: Palette.beige,
    skeleton: "rgba(0,0,0,0.08)",
    vinyl: Palette.black,
    vinylRing: Palette.cream,
    // UI element colors for dynamic theming
    inputBg: "rgba(0,0,0,0.05)",
    placeholder: "rgba(0,0,0,0.3)",
    subtleBorder: "rgba(0,0,0,0.1)",
    subtleBg: "rgba(0,0,0,0.03)",
    buttonBg: "#FFF",
    pauseBarColor: "#000",
    playArrowColor: "#000",
  },
  dark: {
    text: Palette.darkText,
    background: Palette.darkBg,
    windowBg: Palette.darkSurface,
    tint: Palette.darkText,
    icon: Palette.darkText,
    tabIconDefault: "#8B7D6B",
    tabIconSelected: Palette.darkText,
    border: Palette.darkBorder,
    accent: Palette.blue,
    pink: Palette.pink,
    green: Palette.green,
    gold: Palette.gold,
    danger: Palette.danger,
    lavender: Palette.lavender,
    muted: Palette.darkMuted,
    highlight: Palette.blue,
    surface: Palette.darkCard,
    surfaceDark: Palette.darkSurface,
    skeleton: Palette.darkSkeleton,
    vinyl: Palette.darkText,
    vinylRing: Palette.darkSurface,
    // UI element colors for dynamic theming
    inputBg: "rgba(232,213,181,0.08)",
    placeholder: "rgba(232,213,181,0.3)",
    subtleBorder: "rgba(232,213,181,0.1)",
    subtleBg: "rgba(232,213,181,0.05)",
    buttonBg: Palette.darkCard,
    pauseBarColor: Palette.darkText,
    playArrowColor: "#000",
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



export const Fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  displayMedium: "PlayfairDisplay_500Medium",
  displaySemiBold: "PlayfairDisplay_600SemiBold",
  displayBold: "PlayfairDisplay_700Bold",
};
