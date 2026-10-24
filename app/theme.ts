export const colors = {
  background: "#F6F7FB",
  surface: "#FFFFFF",
  surfaceSubtle: "#EEF1F6",
  border: "#E3E7EF",
  text: "#0F172A",
  muted: "#5B6475",
  primary: "#111827",
  onPrimary: "#FFFFFF",
  good: "#047857",
  goodFill: "#E7F7EF",
  warn: "#B45309",
  warnFill: "#FEF3E2",
  coach: "#4F46E5",
  coachFill: "#EEF0FF",

  // Aliases for screens not yet restyled — same tokens, old names.
  bg: "#F6F7FB",
  card: "#FFFFFF",
  mint: "#047857",
  amber: "#B45309",
  blue: "#4F46E5",
  danger: "#B45309",
} as const;

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
} as const;

export const font = {
  label: 13,
  body: 15,
  title: 17,
  screen: 22,
  hero: 32,
  // Aliases for screens not yet restyled
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

export const hit = {
  min: 44,
} as const;
