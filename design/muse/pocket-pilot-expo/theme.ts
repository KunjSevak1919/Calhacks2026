/**
 * Pocket Pilot — design tokens.
 *
 * Single source of truth for colour. No component or screen in this project
 * hard-codes a colour: everything reads `theme.colors.*` through `useTheme()`.
 *
 * Contrast notes (WCAG AA, normal text >= 4.5:1):
 * - Light: primary #101613 on #F4F6F4 and on #FFFFFF, secondary #3F4A45,
 *   muted #5D6B64, accent #065F46, success #047857, warning #92400E,
 *   danger #B42318 all pass on their surfaces.
 * - Dark: primary #F2F5F3 on #0A100E, secondary #C2CCC8, muted #93A19C,
 *   accent #34D399, success #4ADE80, warning #FBBF24, danger #FCA5A5
 *   all pass on their surfaces.
 * - Card art is identical in both themes. Card text is white on the card
 *   gradients, darkened by `cardOverlay`, so it stays readable on every card.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorSchemeName = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  elevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
  track: string;
  skeletonBase: string;
  skeletonHighlight: string;
  shadow: string;
  transparent: string;
  cardText: string;
  cardTextSecondary: string;
  cardSheen: string;
  cardOverlay: string;
  tabBarBackground: string;
  tabBarBorder: string;
  tabInactive: string;
};

export type CardArt = {
  gradient: [string, string];
  /** Short decorative accent used only inside the card artwork. */
  accent: string;
};

const lightColors: ThemeColors = {
  background: '#F4F6F4',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  textPrimary: '#101613',
  textSecondary: '#3F4A45',
  textMuted: '#5D6B64',
  accent: '#065F46',
  onAccent: '#FFFFFF',
  success: '#047857',
  warning: '#92400E',
  danger: '#B42318',
  border: '#DDE5DF',
  track: '#E3EAE6',
  skeletonBase: '#E6ECE8',
  skeletonHighlight: '#F5F8F6',
  shadow: '#0F172A',
  transparent: 'transparent',
  cardText: '#FFFFFF',
  cardTextSecondary: 'rgba(255, 255, 255, 0.82)',
  cardSheen: 'rgba(255, 255, 255, 0.16)',
  cardOverlay: 'rgba(0, 0, 0, 0.18)',
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#DDE5DF',
  tabInactive: '#5D6B64',
};

const darkColors: ThemeColors = {
  background: '#0A100E',
  surface: '#131D1A',
  elevated: '#1A2622',
  textPrimary: '#F2F5F3',
  textSecondary: '#C2CCC8',
  textMuted: '#93A19C',
  accent: '#34D399',
  onAccent: '#06281F',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#FCA5A5',
  border: '#22302B',
  track: '#22302B',
  skeletonBase: '#1E2B26',
  skeletonHighlight: '#2A3A34',
  shadow: '#000000',
  transparent: 'transparent',
  cardText: '#FFFFFF',
  cardTextSecondary: 'rgba(255, 255, 255, 0.82)',
  cardSheen: 'rgba(255, 255, 255, 0.16)',
  cardOverlay: 'rgba(0, 0, 0, 0.18)',
  tabBarBackground: '#131D1A',
  tabBarBorder: '#22302B',
  tabInactive: '#93A19C',
};

/**
 * Original card art. No real bank, network, or app marks are used.
 * The same gradients are used in light and dark mode.
 */
export const cardArt: Record<string, CardArt> = {
  aurum: {
    gradient: ['#6B4A08', '#9C7A1A'],
    accent: '#E7C55A',
  },
  steady: {
    gradient: ['#0F2A4A', '#1E4E79'],
    accent: '#7FB0E0',
  },
  zero: {
    gradient: ['#1F2937', '#374151'],
    accent: '#9CA3AF',
  },
  spin: {
    gradient: ['#7C2D12', '#9A3412'],
    accent: '#FB923C',
  },
  voyager: {
    gradient: ['#0F3D3A', '#14665E'],
    accent: '#5EEAD4',
  },
  flexible: {
    gradient: ['#123B3A', '#1D5C57'],
    accent: '#5EEAD4',
  },
};

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export const fontSize = {
  caption: 12,
  bodySmall: 14,
  body: 16,
  subheading: 18,
  heading: 22,
  title: 28,
  display: 34,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const lineHeight = {
  caption: 16,
  bodySmall: 20,
  body: 24,
  subheading: 24,
  heading: 28,
  title: 34,
  display: 40,
} as const;

export const fontFamily = {
  // System sans keeps the project runnable with no font assets.
  // Swap these for loaded Manrope/Inter families via expo-font if desired.
  regular: 'System',
  medium: 'System',
  semibold: 'System',
  bold: 'System',
} as const;

export type ShadowToken = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type Theme = {
  colorScheme: ColorSchemeName;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  lineHeight: typeof lineHeight;
  fontFamily: typeof fontFamily;
  shadows: {
    card: ShadowToken;
    lift: ShadowToken;
    none: ShadowToken;
  };
  /** True when the OS "Reduce Motion" setting is on. Animations must honour it. */
  reduceMotion: boolean;
};

function buildTheme(scheme: ColorSchemeName, reduceMotion: boolean): Theme {
  const colors = scheme === 'light' ? lightColors : darkColors;
  const shadowColor = colors.shadow;
  return {
    colorScheme: scheme,
    colors,
    spacing,
    radius,
    fontSize,
    fontWeight,
    lineHeight,
    fontFamily,
    shadows: {
      card: {
        shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: scheme === 'light' ? 0.12 : 0.4,
        shadowRadius: 12,
        elevation: 4,
      },
      lift: {
        shadowColor,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: scheme === 'light' ? 0.18 : 0.5,
        shadowRadius: 24,
        elevation: 8,
      },
      none: {
        shadowColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      },
    },
    reduceMotion,
  };
}

type ThemeContextValue = {
  theme: Theme;
  /** 'system' follows the phone; 'light'/'dark' are manual overrides. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colorScheme: ColorSchemeName;
  reduceMotion: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialMode = 'system',
}: {
  children: ReactNode;
  initialMode?: ThemeMode;
}) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const colorScheme: ColorSchemeName =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: buildTheme(colorScheme, reduceMotion),
      mode,
      setMode,
      colorScheme,
      reduceMotion,
    }),
    [colorScheme, mode, reduceMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Use inside a component wrapped by <ThemeProvider>.
 * Returns the resolved theme, the current mode, and the override setter.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return value;
}

export const lightTheme = buildTheme('light', false);
export const darkTheme = buildTheme('dark', false);
