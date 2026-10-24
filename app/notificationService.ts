/**
 * notificationService.ts
 * All expo-notifications logic lives here so the rest of the app stays clean.
 * Importing this module at app startup (via _layout.tsx) installs the
 * foreground handler immediately — before any component renders.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Notification as PilotNotification } from "./api";

// ── Foreground handler ────────────────────────────────────────────────────
// Show notifications even when the app is in the foreground.
// This runs at module-import time so it's always registered.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Category identifiers must not contain '-' or ':' (expo-notifications docs).
export const categoryId = (noteId: string) => noteId.replace(/[-:]/g, "_");

// ── Permission ────────────────────────────────────────────────────────────

export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Android 13+ requires an explicit notification channel before requesting.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("pocketpilot", {
      name: "Pocket Pilot Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
      lightColor: "#3DDC97",
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ── Category registration ─────────────────────────────────────────────────
// One category per notification ID, carrying that notification's exact
// action labels from the server.

export async function registerCategories(
  notes: PilotNotification[]
): Promise<void> {
  if (Platform.OS === "web") return;

  for (const note of notes) {
    const actions: Notifications.NotificationAction[] = [];

    // First action → approve
    if (note.actions.length >= 1) {
      const label = note.actions[0];
      actions.push({
        identifier: "approve",
        buttonTitle: label,
        options: {
          isDestructive: ["Cancel trial", "Cancel"].includes(label),
          isAuthenticationRequired: false,
          opensAppToForeground: true,
        },
      });
    }

    // Second action → dismiss
    if (note.actions.length >= 2) {
      actions.push({
        identifier: "dismiss",
        buttonTitle: note.actions[1],
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: false,
        },
      });
    }

    await Notifications.setNotificationCategoryAsync(
      categoryId(note.id),
      actions
    );
  }
}

// ── Schedule demo notifications ───────────────────────────────────────────
// Each notification fires 3 s after the previous one.

export async function scheduleDemoNotifications(
  notes: PilotNotification[]
): Promise<void> {
  if (Platform.OS === "web") return;

  // Clear any previously scheduled demo notifications first.
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: note.title,
        body: note.body,
        // Link this notification to its registered action category.
        categoryIdentifier: categoryId(note.id),
        // Carry the server ID so the response listener can call approve/dismiss.
        data: { noteId: note.id },
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3 * (i + 1),
      },
    });
  }
}
