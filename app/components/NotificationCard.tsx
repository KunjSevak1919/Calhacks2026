import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Notification } from "../api";
import { colors, spacing, radius, font } from "../theme";

interface Props {
  note: Notification;
  onApprove: () => void;
  onDismiss: () => void;
  loading?: boolean;
}

const severityIcon: Record<string, keyof typeof Ionicons.glyphMap> = {
  warn: "warning-outline",
  info: "information-circle-outline",
  ok: "checkmark-circle-outline",
};

const severityColor: Record<string, string> = {
  warn: colors.amber,
  info: colors.blue,
  ok: colors.mint,
};

export default function NotificationCard({ note, onApprove, onDismiss, loading }: Props) {
  const accent = severityColor[note.severity] ?? colors.blue;
  const icon = severityIcon[note.severity] ?? "information-circle-outline";

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.header}>
        <Ionicons name={icon} size={18} color={accent} style={styles.icon} />
        <Text style={styles.title}>{note.title}</Text>
      </View>
      <Text style={styles.body}>{note.body}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.approveBtn]}
          onPress={onApprove}
          disabled={loading}
        >
          <Text style={[styles.btnText, { color: colors.mint }]}>
            {note.kind === "subscription" ? "Cancel it" : "Do it"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.dismissBtn]}
          onPress={onDismiss}
          disabled={loading}
        >
          <Text style={[styles.btnText, { color: colors.muted }]}>Later</Text>
        </TouchableOpacity>
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
  icon: {
    marginRight: spacing.xs,
  },
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
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  approveBtn: {
    backgroundColor: colors.mint + "1A",
    borderWidth: 1,
    borderColor: colors.mint + "44",
  },
  dismissBtn: {
    backgroundColor: colors.border,
  },
  btnText: {
    fontSize: font.sm,
    fontWeight: "600",
  },
});
