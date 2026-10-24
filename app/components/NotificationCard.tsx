import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PressScale from "./PressScale";
import { Notification, NotificationKind } from "../api";
import { colors, spacing, radius, font, type, shadow, hit } from "../theme";

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
  warn: "warning",
  info: "information-circle",
  ok: "checkmark-circle",
};

const ACCENT: Record<"warn" | "info" | "ok", string> = {
  warn: colors.warn,
  info: colors.coach,
  ok: colors.good,
};

const FILL: Record<"warn" | "info" | "ok", string> = {
  warn: colors.warnFill,
  info: colors.coachFill,
  ok: colors.goodFill,
};

export default function NotificationCard({
  note,
  onApprove,
  onDismiss,
  loading,
}: Props) {
  const severity = severityFor(note.kind);
  const accent = ACCENT[severity];
  const fill = FILL[severity];
  const icon = ICON[severity];

  const primaryLabel = note.actions[0] ?? "Got it";
  const secondaryLabel = note.actions[1];
  const hasTwoActions = note.actions.length >= 2;

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: fill }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={styles.title} numberOfLines={2}>{note.title}</Text>
      </View>

      {/* Body */}
      <Text style={styles.body}>{note.body}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        {loading ? (
          <ActivityIndicator color={accent} style={{ marginVertical: 4 }} />
        ) : (
          <>
            <PressScale
              onPress={onApprove}
              disabled={loading}
              accessibilityLabel={primaryLabel}
              style={[styles.btn, { backgroundColor: fill, borderColor: accent + "44" }]}
            >
              <Text style={[styles.btnText, { color: accent }]}>{primaryLabel}</Text>
            </PressScale>

            {hasTwoActions && (
              <PressScale
                onPress={onDismiss}
                disabled={loading}
                accessibilityLabel={secondaryLabel}
                style={[styles.btn, styles.dismissBtn]}
              >
                <Text style={[styles.btnText, { color: colors.muted }]}>
                  {secondaryLabel}
                </Text>
              </PressScale>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderLeftWidth: 3,
    ...shadow.soft,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  title: {
    color: colors.text,
    fontSize: font.body,
    fontFamily: type.uiSemi,
    flex: 1,
    lineHeight: 22,
  },
  body: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.ui,
    lineHeight: 20,
    marginBottom: spacing.lg,
    paddingLeft: 32 + spacing.md,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    minHeight: hit.min,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  dismissBtn: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: "transparent",
  },
  btnText: {
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },
});
