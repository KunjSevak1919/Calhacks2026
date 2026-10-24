import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Notification, NotificationKind } from "../api";
import { colors, spacing, radius, font } from "../theme";

interface Props {
  note: Notification;
  onApprove: () => void;
  onDismiss: () => void;
  loading?: boolean;
}

// Derive visual severity from the notification kind (severity isn't in the API).
function severityFor(kind: NotificationKind): "warn" | "info" | "ok" {
  switch (kind) {
    case "due":
    case "subscription":
    case "annual_fee":
      return "warn";
    case "credit":
      return "info";
    case "signup_bonus":
      return "ok";
  }
}

const ICON: Record<"warn" | "info" | "ok", keyof typeof Ionicons.glyphMap> = {
  warn: "warning-outline",
  info: "information-circle-outline",
  ok: "checkmark-circle-outline",
};

const ACCENT: Record<"warn" | "info" | "ok", string> = {
  warn: colors.amber,
  info: colors.blue,
  ok: colors.mint,
};

export default function NotificationCard({
  note,
  onApprove,
  onDismiss,
  loading,
}: Props) {
  const severity = severityFor(note.kind);
  const accent = ACCENT[severity];
  const icon = ICON[severity];

  // actions[0] = primary action label (approve)
  // actions[1] = secondary label (dismiss / keep / later)
  // If only one action it's an "acknowledge" — we still call approve on it.
  const primaryLabel = note.actions[0] ?? "Got it";
  const secondaryLabel = note.actions[1];
  const hasTwoActions = note.actions.length >= 2;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.header}>
        <Ionicons name={icon} size={18} color={accent} style={styles.icon} />
        <Text style={styles.title}>{note.title}</Text>
      </View>
      <Text style={styles.body}>{note.body}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: accent + "1A", borderColor: accent + "44" }, styles.primaryBtn]}
          onPress={onApprove}
          disabled={loading}
        >
          <Text style={[styles.btnText, { color: accent }]}>{primaryLabel}</Text>
        </TouchableOpacity>

        {hasTwoActions && (
          <TouchableOpacity
            style={[styles.btn, styles.dismissBtn]}
            onPress={onDismiss}
            disabled={loading}
          >
            <Text style={[styles.btnText, { color: colors.muted }]}>
              {secondaryLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  icon: { marginRight: spacing.xs },
  title: {
    color: colors.text,
    fontSize: font.md,
    fontWeight: "700",
    flex: 1,
  },
  body: {
    color: colors.muted,
    fontSize: font.sm,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  primaryBtn: { borderWidth: 1 },
  dismissBtn: { backgroundColor: colors.border },
  btnText: { fontSize: font.sm, fontWeight: "600" },
});
