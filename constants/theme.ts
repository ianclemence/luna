/**
 * Luna OS — Tactical Telemetry & CRT Terminal Theme
 * Industrial Brutalist design system. Dark mode exclusively.
 * Zero border-radius. Monospace dominance. Aviation red accents.
 */

export const Palette = {
  // CRT Substrate
  black: "#0A0A0A",
  surface: "#121212",
  surfaceElevated: "#1A1A1A",
  compartment: "#1E1E1E",

  // Phosphor Text
  white: "#EAEAEA",
  textMuted: "#888888",
  textDim: "#555555",

  // Aviation / Hazard Red
  accent: "#E61919",
  accentBright: "#FF2A2A",

  // Terminal Green (single-purpose only)
  terminalGreen: "#4AF626",

  // Local/device tracks accent
  accentLocal: "#26B0F6",

  // Structural
  border: "#2A2A2A",
  borderBright: "#3A3A3A",
  skeleton: "rgba(234,234,234,0.06)",
};

export const Colors = {
  text: Palette.white,
  background: Palette.black,
  windowBg: Palette.surface,
  tint: Palette.white,
  icon: Palette.white,
  tabIconDefault: Palette.textMuted,
  tabIconSelected: Palette.white,
  border: Palette.border,
  borderBright: Palette.borderBright,
  accent: Palette.accent,
  accentBright: Palette.accentBright,
  green: Palette.terminalGreen,
  danger: Palette.accentBright,
  muted: Palette.textMuted,
  dim: Palette.textDim,
  highlight: Palette.accent,
  surface: Palette.surface,
  surfaceElevated: Palette.surfaceElevated,
  compartment: Palette.compartment,
  skeleton: Palette.skeleton,
  inputBg: "rgba(234,234,234,0.05)",
  placeholder: "rgba(234,234,234,0.25)",
  subtleBorder: "rgba(234,234,234,0.08)",
  subtleBg: "rgba(234,234,234,0.03)",
  buttonBg: Palette.compartment,
};

export const FontSizes = {
  hero: 48,
  h1: 52,
  h2: 36,
  h3: 24,
  phrase: 20,
  sectionTitle: 16,
  button: 14,
  body: 13,
  small: 11,
  caption: 10,
  micro: 8,
};

export const FontLineHeights = {
  hero: 46,
  h1: 50,
  h2: 34,
  h3: 28,
  phrase: 24,
  sectionTitle: 20,
  button: 18,
  body: 18,
  small: 14,
  caption: 12,
  micro: 10,
};

export const Radii = {
  card: 0,
  button: 0,
  modal: 0,
  input: 0,
  xs: 0,
  sm: 0,
  m: 0,
  l: 0,
  xl: 0,
  full: 0,
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
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const Fonts = {
  // Monospace — Micro-typography (data, telemetry, labels, metadata, nav)
  mono: "JetBrainsMono_400Regular",
  monoBold: "JetBrainsMono_700Bold",

  // Display — Macro-typography (massive structural headers)
  displayBlack: "Inter_900Black",
  displayBold: "Inter_700Bold",

  // Body — General text
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};
