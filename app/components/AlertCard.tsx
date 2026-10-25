import React, { memo, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius, shadow } from "../theme";
import type { Notification } from "../api";

export type AlertCardProps = {
  notification: Notification;
  onPrimary: (notification: Notification) => Promise<void>;
  onSecondary: (notification: Notification) => Promise<void>;
};

type Phase = "idle" | "done" | "collapsed";

type IoniconsName = keyof typeof Ionicons.glyphMap;

function iconConfig(kind: Notification["kind"]): {
  icon: IoniconsName;
  bg: string;
  color: string;
} {
  // Colors resolved per instance — we use a hook below
  return { icon: "alert-circle", bg: "", color: "" }; // placeholder; resolved in component
}

function AlertCard({ notification, onPrimary, onSecondary }: AlertCardProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handlePrimary = async () => {
    setPhase("done");
    await onPrimary(notification);
    timer.current = setTimeout(() => {
      if (!reduceMotion) {
        opacity.value = withTiming(0, { duration: 250 });
        scale.value = withTiming(0.97, { duration: 250 });
      } else {
        opacity.value = 0;
      }
      timer.current = setTimeout(() => setPhase("collapsed"), reduceMotion ? 0 : 260);
    }, 600);
  };

  const handleSecondary = async () => {
    await onSecondary(notification);
  };

  if (phase === "collapsed") return null;

  const primaryLabel = notification.actions[0] ?? "OK";
  const secondaryLabel = notification.actions[1] ?? "Later";
  const isCancelTrial =
    primaryLabel.toLowerCase().includes("cancel") ||
    primaryLabel.toLowerCase().includes("remove");

  // Icon + color based on kind
  let iconName: IoniconsName;
  let iconBg: string;
  let iconColor: string;
  switch (notification.kind) {
    case "due":
      iconName = "time-outline";
      iconBg = colors.warnFill;
      iconColor = colors.warn;
      break;
    case "subscription":
      iconName = "warning-outline";
      iconBg = colors.errorFill;
      iconColor = colors.error;
      break;
    case "annual_fee":
      iconName = "pricetag-outline";
      iconBg = colors.goodFill;
      iconColor = colors.good;
      break;
    case "credit":
      iconName = "pricetag-outline";
      iconBg = colors.goodFill;
      iconColor = colors.good;
      break;
    case "signup_bonus":
      iconName = "gift-outline";
      iconBg = colors.goodFill;
      iconColor = colors.good;
      break;
    default:
      iconName = "notifications-outline";
      iconBg = colors.surfaceSubtle;
      iconColor = colors.muted;
  }

  const cardBg = phase === "done" ? colors.goodFill : colors.surface;
  const cardBorder = phase === "done" ? "transparent" : colors.border;

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
        shadow.soft,
        animatedStyle,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconTile, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{notification.title}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{notification.body}</Text>
        </View>
      </View>

      {phase === "done" ? (
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.good} />
          <Text style={[styles.doneText, { color: colors.good }]}>Done</Text>
        </View>
      ) : (
        <View style={styles.actions}>
          {/* Primary button */}
          <Pressable
            onPress={handlePrimary}
            accessibilityLabel={`${primaryLabel}: ${notification.title}`}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: isCancelTrial ? colors.error : colors.accent,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.btnText, { color: isCancelTrial ? "#fff" : colors.onAccent }]}>
              {primaryLabel}
            </Text>
          </Pressable>
          {/* Secondary button */}
          <Pressable
            onPress={handleSecondary}
            accessibilityLabel={`${secondaryLabel}: ${notification.title}`}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: colors.surfaceSubtle,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>{secondaryLabel}</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: 16,
    fontFamily: type.uiBold,
    lineHeight: 1.35 * 16,
    letterSpacing: -0.01 * 16,
  },
  body: {
    fontSize: 13.5,
    fontFamily: type.uiSemi,
    lineHeight: 1.5 * 13.5,
    marginTop: 5,
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  doneText: {
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnText: {
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
});

export default memo(AlertCard);
