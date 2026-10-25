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
  gradient: [string, string];
  accent: string;
};

// ── Light palette ─────────────────────────────────────────────────────────────

export const lightColors: ThemeColors = {
  background: "#F4F6F4",
  surface: "#FFFFFF",
  elevated: "#FFFFFF",
  surfaceSubtle: "#EEF1F6",
  text: "#101613",
  textSecondary: "#3F4A45",
  muted: "#5D6B64",
  primary: "#111827",
  onPrimary: "#FFFFFF",
  accent: "#065F46",
  onAccent: "#FFFFFF",
  good: "#047857",
  goodFill: "#E7F7EF",
  warn: "#B45309",
  warnFill: "#FEF3E2",
  coach: "#4F46E5",
  coachFill: "#EEF0FF",
  error: "#B42318",
  errorFill: "#FEE2E2",
  border: "#DDE5DF",
  track: "#E3EAE6",
  skeletonBase: "#E6ECE8",
  skeletonHighlight: "#F5F8F6",
  cardText: "#FFFFFF",
  cardTextSecondary: "rgba(255,255,255,0.82)",
  cardSheen: "rgba(255,255,255,0.16)",
  cardOverlay: "rgba(0,0,0,0.18)",
  tabBarBackground: "#FFFFFF",
  tabBarBorder: "#DDE5DF",
  tabInactive: "#5D6B64",
};

// ── Dark palette ──────────────────────────────────────────────────────────────

export const darkColors: ThemeColors = {
  background: "#0A100E",
  surface: "#131D1A",
  elevated: "#1A2622",
  surfaceSubtle: "#1A2622",
  text: "#F2F5F3",
  textSecondary: "#C2CCC8",
  muted: "#93A19C",
  primary: "#F2F5F3",
  onPrimary: "#101613",
  accent: "#34D399",
  onAccent: "#06281F",
  good: "#4ADE80",
  goodFill: "#052E16",
  warn: "#FBBF24",
  warnFill: "#451A03",
  coach: "#818CF8",
  coachFill: "#1E1B4B",
  error: "#FCA5A5",
  errorFill: "#450A0A",
  border: "#22302B",
  track: "#22302B",
  skeletonBase: "#1E2B26",
  skeletonHighlight: "#2A3A34",
  cardText: "#FFFFFF",
  cardTextSecondary: "rgba(255,255,255,0.82)",
  cardSheen: "rgba(255,255,255,0.16)",
  cardOverlay: "rgba(0,0,0,0.18)",
  tabBarBackground: "#131D1A",
  tabBarBorder: "#22302B",
  tabInactive: "#93A19C",
};

// ── Card art (same in both themes) ────────────────────────────────────────────

export const cardArt: Record<string, CardArt> = {
  aurum: { gradient: ["#6B4A08", "#9C7A1A"], accent: "#E7C55A" },
  steady: { gradient: ["#0F2A4A", "#1E4E79"], accent: "#7FB0E0" },
  zero: { gradient: ["#1F2937", "#374151"], accent: "#9CA3AF" },
  spin: { gradient: ["#7C2D12", "#9A3412"], accent: "#FB923C" },
  voyager: { gradient: ["#0F3D3A", "#14665E"], accent: "#5EEAD4" },
  flexible: { gradient: ["#123B3A", "#1D5C57"], accent: "#5EEAD4" },
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
  md: 14,
  lg: 14,
  xl: 20,
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
  mono: "IBMPlexMono_500Medium",
  monoSemi: "IBMPlexMono_600SemiBold",
  monoBold: "IBMPlexMono_700Bold",
} as const;

export const shadow = {
  soft: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  stack: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;

export const hit = { min: 44 } as const;

// ── Backward-compat flat `colors` export (screens updated incrementally) ──────

/** @deprecated Use useTheme().colors instead once a screen is redesigned. */
export const colors = lightColors;
