import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useTheme } from "../ThemeContext";
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { api } from "../api";
import { supabase } from "../lib/supabase";
import { requestPermission, registerCategories } from "../notificationService";
// Importing this module installs the foreground handler as a side-effect (native only).
import "../notificationService";
import { ThemeProvider } from "../ThemeContext";

// SplashScreen APIs are no-ops / emit warnings on web — skip them entirely.
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  // On web, render immediately — the browser handles font loading via CSS and
  // there is no splash screen to hide. fontsReady starts true on web.
  // On native, wait for fonts but give up after 2 s so a slow CDN can't
  // block the app indefinitely; system fonts are a fine fallback.
  const [fontsReady, setFontsReady] = useState(Platform.OS === "web");

  useEffect(() => {
    if (fontsLoaded) setFontsReady(true);
  }, [fontsLoaded]);

  // 2-second hard deadline — native only (web starts as true already).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const t = setTimeout(() => setFontsReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Hide the native splash in a finally so it always runs even if something
  // throws. Never call this on web — SplashScreen is not available there.
  useEffect(() => {
    if (!fontsReady || Platform.OS === "web") return;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  // Sign in to Supabase silently on app start, then seed the saved debt_guard.
  // Never blocks rendering — all errors are swallowed after a single console.log.
  useEffect(() => {
    if (!supabase) return;
    const password = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
    if (!password) return;
    (async () => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: "demo@pocketpilot.app",
          password,
        });
        if (error) { console.log("Supabase sign-in:", error.message); return; }
        const userId = data.user?.id;
        if (!userId) return;
        const { data: settings } = await supabase
          .from("user_settings")
          .select("debt_guard")
          .eq("user_id", userId)
          .maybeSingle();
        if (settings?.debt_guard != null) {
          api.setSettings(settings.debt_guard as boolean).catch(() => {});
        }
      } catch (e) {
        console.log("Supabase init:", e);
      }
    })();
  }, []);

  useEffect(() => {
    // expo-notifications is not available on web — registering listeners there
    // prints a console warning and does nothing useful, so skip entirely.
    if (Platform.OS === "web") return;

    // 1. Ask for permission (shows system dialog on first launch).
    requestPermission();

    // 2. Pre-fetch notifications so we can register their action categories.
    api.notifications().then(registerCategories).catch(() => {});

    // 3. Response listener: fires when the user taps a notification or one of
    //    its action buttons (approve / dismiss).
    const sub = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const data = response.notification.request.content.data as
          | { noteId?: string }
          | undefined;
        const noteId = data?.noteId;
        const action = response.actionIdentifier;

        if (noteId) {
          try {
            if (action === "approve") await api.approve(noteId);
            else if (action === "dismiss") await api.dismiss(noteId);
          } catch {
            // Best-effort; the Alerts list will resync on focus.
          }
        }

        router.push("/(tabs)/notifications");
      }
    );

    return () => sub.remove();
  }, []);

  // Block the very first render only on native while fonts are loading.
  // On web fontsReady is already true so this never returns null.
  if (!fontsReady) return null;

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

// Inner shell — inside ThemeProvider so it can read the theme background color.
// Covers the full window in the theme background so no white edges appear on
// desktop web when the app content doesn't fill the entire viewport.
function AppShell() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
