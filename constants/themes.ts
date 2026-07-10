/**
 * Luna OS — Multi-Theme System
 * Four distinct visual directions, each a complete palette + tokens set.
 */

export type ThemeID = "console" | "canvas" | "afternoon-drive" | "midnight-radio" | "blossom";

export const THEME_ORDER: ThemeID[] = ["console", "canvas", "afternoon-drive", "midnight-radio", "blossom"];

export const THEME_NAMES: Record<ThemeID, string> = {
  "console": "CONSOLE",
  "canvas": "CANVAS",
  "afternoon-drive": "AFTERNOON DRIVE",
  "midnight-radio": "MIDNIGHT RADIO",
  "blossom": "BLOSSOM",
};

// ─── Palette Shapes ──────────────────────────────────────────────

export interface PaletteTokens {
  black: string;
  surface: string;
  surfaceElevated: string;
  compartment: string;
  white: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentBright: string;
  terminalGreen: string;
  accentLocal: string;
  border: string;
  borderBright: string;
  skeleton: string;
}

export interface ColorTokens {
  text: string;
  background: string;
  windowBg: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  border: string;
  borderBright: string;
  accent: string;
  accentBright: string;
  green: string;
  danger: string;
  muted: string;
  dim: string;
  highlight: string;
  surface: string;
  surfaceElevated: string;
  compartment: string;
  skeleton: string;
  inputBg: string;
  placeholder: string;
  subtleBorder: string;
  subtleBg: string;
  buttonBg: string;
}

export interface RadiiTokens {
  card: number;
  button: number;
  modal: number;
  input: number;
  xs: number;
  sm: number;
  m: number;
  l: number;
  xl: number;
  full: number;
}

export interface FontTokens {
  mono: string;
  monoBold: string;
  displayBlack: string;
  displayBold: string;
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}

export interface ThemeDefinition {
  id: ThemeID;
  palette: PaletteTokens;
  colors: ColorTokens;
  radii: RadiiTokens;
  fonts: FontTokens;
  isDark: boolean;
}

// ─── Font Token Sets ─────────────────────────────────────────────

const FONTS_TACTICAL: FontTokens = {
  mono: "JetBrainsMono_400Regular",
  monoBold: "JetBrainsMono_700Bold",
  displayBlack: "Inter_900Black",
  displayBold: "Inter_700Bold",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

const FONTS_FIELD_JOURNAL: FontTokens = {
  mono: "CourierPrime_400Regular",
  monoBold: "CourierPrime_700Bold",
  displayBlack: "CrimsonPro_800ExtraBold",
  displayBold: "CrimsonPro_700Bold",
  regular: "Kalam_400Regular",
  medium: "Kalam_400Regular",
  semiBold: "Kalam_700Bold",
  bold: "Kalam_700Bold",
};

const FONTS_AFTERNOON_DRIVE: FontTokens = {
  mono: "IBMPlexMono_400Regular",
  monoBold: "IBMPlexMono_600SemiBold",
  displayBlack: "PlayfairDisplay_900Black",
  displayBold: "PlayfairDisplay_700Bold",
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semiBold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
};

const FONTS_MIDNIGHT_RADIO: FontTokens = {
  mono: "JetBrainsMono_400Regular",
  monoBold: "JetBrainsMono_700Bold",
  displayBlack: "CormorantGaramond_700Bold",
  displayBold: "CormorantGaramond_600SemiBold",
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semiBold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold",
};

const FONTS_BLOSSOM: FontTokens = {
  mono: "IBMPlexMono_400Regular",
  monoBold: "IBMPlexMono_600SemiBold",
  displayBlack: "PlayfairDisplay_900Black",
  displayBold: "PlayfairDisplay_700Bold",
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semiBold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
};

// ─── Theme 0: Tactical (current CRT Terminal) ────────────────────

const CONSOLE: ThemeDefinition = {
  id: "console",
  isDark: true,
  palette: {
    black: "#0A0A0A",
    surface: "#121212",
    surfaceElevated: "#1A1A1A",
    compartment: "#1E1E1E",
    white: "#EAEAEA",
    textMuted: "#888888",
    textDim: "#555555",
    accent: "#E61919",
    accentBright: "#FF2A2A",
    terminalGreen: "#4AF626",
    accentLocal: "#26B0F6",
    border: "#2A2A2A",
    borderBright: "#3A3A3A",
    skeleton: "rgba(234,234,234,0.06)",
  },
  colors: {
    text: "#EAEAEA",
    background: "#0A0A0A",
    windowBg: "#121212",
    tint: "#EAEAEA",
    icon: "#EAEAEA",
    tabIconDefault: "#888888",
    tabIconSelected: "#EAEAEA",
    border: "#2A2A2A",
    borderBright: "#3A3A3A",
    accent: "#E61919",
    accentBright: "#FF2A2A",
    green: "#4AF626",
    danger: "#FF2A2A",
    muted: "#888888",
    dim: "#555555",
    highlight: "#E61919",
    surface: "#121212",
    surfaceElevated: "#1A1A1A",
    compartment: "#1E1E1E",
    skeleton: "rgba(234,234,234,0.06)",
    inputBg: "rgba(234,234,234,0.05)",
    placeholder: "rgba(234,234,234,0.25)",
    subtleBorder: "rgba(234,234,234,0.08)",
    subtleBg: "rgba(234,234,234,0.03)",
    buttonBg: "#1E1E1E",
  },
  radii: {
    card: 0, button: 0, modal: 0, input: 0,
    xs: 0, sm: 0, m: 0, l: 0, xl: 0, full: 0,
  },
  fonts: FONTS_TACTICAL,
};

// ─── Theme 1: Field Journal ──────────────────────────────────────

const CANVAS: ThemeDefinition = {
  id: "canvas",
  isDark: false,
  palette: {
    black: "#2C2416",
    surface: "#EDE6DD",
    surfaceElevated: "#E5DCD1",
    compartment: "#DDD3C6",
    white: "#2C2416",
    textMuted: "#8B7D6B",
    textDim: "#A69882",
    accent: "#C75B39",
    accentBright: "#E06A45",
    terminalGreen: "#3B7A57",
    accentLocal: "#5B8FA8",
    border: "#C4B6A4",
    borderBright: "#A89A88",
    skeleton: "rgba(44,36,22,0.06)",
  },
  colors: {
    text: "#2C2416",
    background: "#F5F0EB",
    windowBg: "#EDE6DD",
    tint: "#2C2416",
    icon: "#2C2416",
    tabIconDefault: "#8B7D6B",
    tabIconSelected: "#2C2416",
    border: "#C4B6A4",
    borderBright: "#A89A88",
    accent: "#C75B39",
    accentBright: "#E06A45",
    green: "#3B7A57",
    danger: "#E06A45",
    muted: "#8B7D6B",
    dim: "#A69882",
    highlight: "#F2D98B",
    surface: "#EDE6DD",
    surfaceElevated: "#E5DCD1",
    compartment: "#DDD3C6",
    skeleton: "rgba(44,36,22,0.06)",
    inputBg: "rgba(44,36,22,0.05)",
    placeholder: "rgba(44,36,22,0.3)",
    subtleBorder: "rgba(44,36,22,0.1)",
    subtleBg: "rgba(44,36,22,0.03)",
    buttonBg: "#DDD3C6",
  },
  radii: {
    card: 0, button: 0, modal: 0, input: 0,
    xs: 0, sm: 0, m: 0, l: 0, xl: 0, full: 0,
  },
  fonts: FONTS_FIELD_JOURNAL,
};

// ─── Theme 2: Afternoon Drive ────────────────────────────────────

const AFTERNOON_DRIVE: ThemeDefinition = {
  id: "afternoon-drive",
  isDark: false,
  palette: {
    black: "#3D2E1F",
    surface: "#D4C5B5",
    surfaceElevated: "#C9BAA9",
    compartment: "#BFB0A0",
    white: "#3D2E1F",
    textMuted: "#8A7B6A",
    textDim: "#A09282",
    accent: "#6B9B8A",
    accentBright: "#7FB5A3",
    terminalGreen: "#6B9B8A",
    accentLocal: "#D4845A",
    border: "#B5A593",
    borderBright: "#9E8E7C",
    skeleton: "rgba(61,46,31,0.06)",
  },
  colors: {
    text: "#3D2E1F",
    background: "#E8DDD3",
    windowBg: "#D4C5B5",
    tint: "#3D2E1F",
    icon: "#3D2E1F",
    tabIconDefault: "#8A7B6A",
    tabIconSelected: "#3D2E1F",
    border: "#B5A593",
    borderBright: "#9E8E7C",
    accent: "#6B9B8A",
    accentBright: "#7FB5A3",
    green: "#6B9B8A",
    danger: "#D4845A",
    muted: "#8A7B6A",
    dim: "#A09282",
    highlight: "#D4845A",
    surface: "#D4C5B5",
    surfaceElevated: "#C9BAA9",
    compartment: "#BFB0A0",
    skeleton: "rgba(61,46,31,0.06)",
    inputBg: "rgba(61,46,31,0.05)",
    placeholder: "rgba(61,46,31,0.3)",
    subtleBorder: "rgba(61,46,31,0.1)",
    subtleBg: "rgba(61,46,31,0.03)",
    buttonBg: "#BFB0A0",
  },
  radii: {
    card: 12, button: 12, modal: 16, input: 8,
    xs: 4, sm: 6, m: 8, l: 12, xl: 16, full: 9999,
  },
  fonts: FONTS_AFTERNOON_DRIVE,
};

// ─── Theme 3: Midnight Radio ─────────────────────────────────────

const MIDNIGHT_RADIO: ThemeDefinition = {
  id: "midnight-radio",
  isDark: true,
  palette: {
    black: "#0D0D12",
    surface: "#151520",
    surfaceElevated: "#1C1C2A",
    compartment: "#1F1F30",
    white: "#E8E4E0",
    textMuted: "#6B6880",
    textDim: "#4A4760",
    accent: "#E84855",
    accentBright: "#FF5A67",
    terminalGreen: "#3AAFA9",
    accentLocal: "#F9A826",
    border: "#2A2838",
    borderBright: "#3A3848",
    skeleton: "rgba(232,228,224,0.06)",
  },
  colors: {
    text: "#E8E4E0",
    background: "#0D0D12",
    windowBg: "#151520",
    tint: "#E8E4E0",
    icon: "#E8E4E0",
    tabIconDefault: "#6B6880",
    tabIconSelected: "#E8E4E0",
    border: "#2A2838",
    borderBright: "#3A3848",
    accent: "#E84855",
    accentBright: "#FF5A67",
    green: "#3AAFA9",
    danger: "#FF5A67",
    muted: "#6B6880",
    dim: "#4A4760",
    highlight: "#E84855",
    surface: "#151520",
    surfaceElevated: "#1C1C2A",
    compartment: "#1F1F30",
    skeleton: "rgba(232,228,224,0.06)",
    inputBg: "rgba(232,228,224,0.05)",
    placeholder: "rgba(232,228,224,0.25)",
    subtleBorder: "rgba(232,228,224,0.08)",
    subtleBg: "rgba(232,228,224,0.03)",
    buttonBg: "#1F1F30",
  },
  radii: {
    card: 8, button: 8, modal: 12, input: 6,
    xs: 2, sm: 4, m: 6, l: 8, xl: 12, full: 9999,
  },
  fonts: FONTS_MIDNIGHT_RADIO,
};

// ─── Theme 4: Blossom ───────────────────────────────────────────

const BLOSSOM: ThemeDefinition = {
  id: "blossom",
  isDark: true,
  palette: {
    black: "#1E1018",
    surface: "#2A1825",
    surfaceElevated: "#352030",
    compartment: "#402838",
    white: "#F0D0DC",
    textMuted: "#9A7080",
    textDim: "#7A5068",
    accent: "#E83A6F",
    accentBright: "#FF4D7A",
    terminalGreen: "#5ABFBF",
    accentLocal: "#D4A855",
    border: "#4A2838",
    borderBright: "#5A3848",
    skeleton: "rgba(240,208,220,0.06)",
  },
  colors: {
    text: "#F0D0DC",
    background: "#1E1018",
    windowBg: "#2A1825",
    tint: "#F0D0DC",
    icon: "#F0D0DC",
    tabIconDefault: "#9A7080",
    tabIconSelected: "#F0D0DC",
    border: "#4A2838",
    borderBright: "#5A3848",
    accent: "#E83A6F",
    accentBright: "#FF4D7A",
    green: "#5ABFBF",
    danger: "#FF4D7A",
    muted: "#9A7080",
    dim: "#7A5068",
    highlight: "#E83A6F",
    surface: "#2A1825",
    surfaceElevated: "#352030",
    compartment: "#402838",
    skeleton: "rgba(240,208,220,0.06)",
    inputBg: "rgba(240,208,220,0.05)",
    placeholder: "rgba(240,208,220,0.25)",
    subtleBorder: "rgba(240,208,220,0.08)",
    subtleBg: "rgba(240,208,220,0.03)",
    buttonBg: "#402838",
  },
  radii: {
    card: 6, button: 6, modal: 8, input: 4,
    xs: 2, sm: 4, m: 6, l: 8, xl: 12, full: 9999,
  },
  fonts: FONTS_BLOSSOM,
};

// ─── Registry ────────────────────────────────────────────────────

export const THEMES: Record<ThemeID, ThemeDefinition> = {
  "console": CONSOLE,
  "canvas": CANVAS,
  "afternoon-drive": AFTERNOON_DRIVE,
  "midnight-radio": MIDNIGHT_RADIO,
  "blossom": BLOSSOM,
};

export function getNextTheme(current: ThemeID): ThemeID {
  const idx = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
}
