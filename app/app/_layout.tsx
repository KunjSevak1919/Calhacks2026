import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import {
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from "@expo-google-fonts/ibm-plex-mono";
import { api } from "../api";
import { requestPermission, registerCategories } from "../notificationService";
// Importing this module installs the foreground handler as a side-effect.
import "../notificationService";

// Keep the native splash visible until fonts are ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });

  // Hide splash as soon as fonts are ready.
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  useEffect(() => {
    // 1. Ask for permission (no-op on web; shows system dialog on first launch).
    requestPermission();

    // 2. Pre-fetch notifications so we can register their categories up front.
    //    Failures are silenced — the app works fine without categories.
    api
      .notifications()
      .then(registerCategories)
      .catch(() => {});

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
            if (action === "approve") {
              await api.approve(noteId);
            } else if (action === "dismiss") {
              await api.dismiss(noteId);
            }
          } catch {
            // Best-effort; the Alerts list will resync on focus.
          }
        }

        // Always navigate to Alerts tab when the user interacts with a notification.
        router.push("/(tabs)/notifications");
      }
    );

    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
