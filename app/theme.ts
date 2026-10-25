// ── Token types ───────────────────────────────────────────────────────────────

export type ThemeColors = {
  // Surfaces
  background: string;
  surface: string;
  elevated: string;
  surfaceSubtle: string;
  // Text
  text: string;
  textSecondary: string;
  muted: string;
  // Brand / interactive
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  // Semantic
  good: string;
  goodFill: string;
  warn: string;
  warnFill: string;
  coach: string;
  coachFill: string;
  error: string;
  errorFill: string;
  // Structural
  border: string;
  track: string;
  skeletonBase: string;
  skeletonHighlight: string;
  // Card canvas
  cardText: string;
  cardTextSecondary: string;
  cardSheen: string;
  cardOverlay: string;
  // Tab bar
  tabBarBackground: string;
  tabBarBorder: string;
  tabInactive: string;
};

export type CardArt = {
  gradient: [string, string, string, string];
  textColor: string;
};

// ── Light palette ─────────────────────────────────────────────────────────────

export const lightColors: ThemeColors = {
  background: "#F2F4F1",
  surface: "#FFFFFF",
  elevated: "#FFFFFF",
  surfaceSubtle: "#E9EFE9",
  text: "#0D1F15",
  textSecondary: "#43564B",
  muted: "#43564B",
  primary: "#0A6B4E",
  onPrimary: "#FFFFFF",
  accent: "#0A6B4E",
  onAccent: "#FFFFFF",
  good: "#0A6B4E",
  goodFill: "#E2F1EA",
  warn: "#8A5A00",
  warnFill: "#FBF0D7",
  coach: "#4F46E5",
  coachFill: "#EEF0FF",
  error: "#B33727",
  errorFill: "#FBEAE7",
  border: "rgba(13,31,21,0.09)",
  track: "#E9EFE9",
  skeletonBase: "#E9EFE9",
  skeletonHighlight: "#F2F4F1",
  cardText: "#FFFFFF",
  cardTextSecondary: "rgba(255,255,255,0.82)",
  cardSheen: "rgba(255,255,255,0.22)",
  cardOverlay: "rgba(0,0,0,0.15)",
  tabBarBackground: "rgba(255,255,255,0.86)",
  tabBarBorder: "rgba(13,31,21,0.09)",
  tabInactive: "#43564B",
};

// ── Dark palette ──────────────────────────────────────────────────────────────

export const darkColors: ThemeColors = {
  background: "#0A0F0C",
  surface: "#141C17",
  elevated: "#1D2821",
  surfaceSubtle: "#1E2A23",
  text: "#EDF4EF",
  textSecondary: "#A9BCB0",
  muted: "#A9BCB0",
  primary: "#3ECF9B",
  onPrimary: "#052418",
  accent: "#3ECF9B",
  onAccent: "#052418",
  good: "#3ECF9B",
  goodFill: "#143327",
  warn: "#F0B45C",
  warnFill: "#2D2110",
  coach: "#818CF8",
  coachFill: "#1E1B4B",
  error: "#FF8D7E",
  errorFill: "#301711",
  border: "rgba(237,244,239,0.11)",
  track: "#1E2A23",
  skeletonBase: "#1E2A23",
  skeletonHighlight: "#2A3A34",
  cardText: "#FFFFFF",
  cardTextSecondary: "rgba(255,255,255,0.82)",
  cardSheen: "rgba(255,255,255,0.18)",
  cardOverlay: "rgba(0,0,0,0.25)",
  tabBarBackground: "rgba(16,22,18,0.88)",
  tabBarBorder: "rgba(237,244,239,0.11)",
  tabInactive: "#A9BCB0",
};

// ── Card art (same in both themes) ────────────────────────────────────────────

export const cardArt: Record<string, CardArt> = {
  aurum:   { gradient: ["#F0CD7E", "#D9A94F", "#BD8527", "#E5C169"], textColor: "#38260A" },
  steady:  { gradient: ["#24467E", "#16294E", "#0B1830", "#16294E"], textColor: "#E9EFFA" },
  zero:    { gradient: ["#43484F", "#26292E", "#131518", "#26292E"], textColor: "#ECEEF1" },
  spin:    { gradient: ["#FFA05C", "#F26F2E", "#D34E12", "#F26F2E"], textColor: "#FFF5EC" },
  voyager: { gradient: ["#17685D", "#0C453D", "#052924", "#0C453D"], textColor: "#E2F3EE" },
  one:     { gradient: ["#2A3B32", "#131A16", "#1D2F27", "#131A16"], textColor: "#E7F2EC" },
};

// ── Spacing / radius / font / type / shadow / hit (CLAUDE.md tokens) ─────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 22,
  xl: 24,
  full: 999,
} as const;

export const font = {
  label: 13,
  body: 15,
  title: 17,
  screen: 22,
  hero: 32,
  // Aliases
  xs: 13,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 22,
} as const;

export const type = {
  ui: "Manrope_400Regular",
  uiMedium: "Manrope_500Medium",
  uiSemi: "Manrope_600SemiBold",
  uiBold: "Manrope_700Bold",
  mono: "Manrope_600SemiBold",
  monoSemi: "Manrope_700Bold",
  monoBold: "Manrope_800ExtraBold",
} as const;

export const shadow = {
  soft: {
    shadowColor: "#0A140E",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 4,
  },
  stack: {
    shadowColor: "#0A140E",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 8,
  },
} as const;

export const hit = { min: 44 } as const;

// ── Backward-compat flat `colors` export ──────────────────────────────────────

/** @deprecated Use useTheme().colors instead. */
export const colors = lightColors;
