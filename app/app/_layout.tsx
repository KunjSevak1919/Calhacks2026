import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { api } from "../api";
import { requestPermission, registerCategories } from "../notificationService";
// Importing this module installs the foreground handler as a side-effect.
import "../notificationService";

export default function RootLayout() {
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
            // For every interaction — including a plain tap on the banner —
            // open the app on the Alerts tab so the list refreshes.
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

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
