import React, { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius, shadow } from "../theme";
import type { Notification } from "../api";
import PrimaryButton from "./PrimaryButton";
import SecondaryButton from "./SecondaryButton";

export type AlertCardProps = {
  notification: Notification;
  onPrimary: (notification: Notification) => Promise<void>;
  onSecondary: (notification: Notification) => Promise<void>;
};

type Phase = "idle" | "done" | "collapsed";

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
        scale.value = withTiming(0.96, { duration: 250 });
      } else {
        opacity.value = 0;
      }
      timer.current = setTimeout(
        () => setPhase("collapsed"),
        reduceMotion ? 0 : 260
      );
    }, 600);
  };

  const handleSecondary = async () => {
    await onSecondary(notification);
  };

  if (phase === "collapsed") return null;

  const primaryLabel = notification.actions[0] ?? "OK";
  const secondaryLabel = notification.actions[1] ?? "Later";

  return (
    <Animated.View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, animatedStyle]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{notification.title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{notification.body}</Text>
      {phase === "done" ? (
        <Text style={[styles.done, { color: colors.good }]}>✓ Done</Text>
      ) : (
        <View style={styles.actions}>
          <View style={styles.action}>
            <PrimaryButton
              title={primaryLabel}
              onPress={handlePrimary}
              accessibilityLabel={`${primaryLabel}: ${notification.title}`}
            />
          </View>
          <View style={styles.action}>
            <SecondaryButton
              title={secondaryLabel}
              onPress={handleSecondary}
              accessibilityLabel={`${secondaryLabel}: ${notification.title}`}
            />
          </View>
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
    ...shadow.soft,
  },
  title: {
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
  body: {
    fontSize: font.body,
    fontFamily: type.uiMedium,
    marginTop: spacing.sm,
  },
  done: {
    fontSize: font.body,
    fontFamily: type.uiBold,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  action: { flex: 1 },
});

export default memo(AlertCard);
