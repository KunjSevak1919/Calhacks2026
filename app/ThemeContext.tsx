import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightColors, darkColors, type ThemeColors } from "./theme";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThemeMode = "system" | "light" | "dark";

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  reduceMotion: boolean;
};

// ── Context ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "pp_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [reduceMotion, setReduceMotion] = useState(false);

  // Load persisted theme on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setThemeModeState(stored);
        }
      })
      .catch(() => {});
  }, []);

  // Track OS reduce-motion setting
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  }, []);

  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && systemScheme === "dark");

  const colors = isDark ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, isDark, themeMode, setTheme, reduceMotion }),
    [colors, isDark, themeMode, setTheme, reduceMotion]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside <ThemeProvider>");
  return ctx;
}
