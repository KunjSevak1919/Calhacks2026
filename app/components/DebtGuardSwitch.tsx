import React, { memo, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius } from "../theme";

export type DebtGuardSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  explainer?: string;
  label?: string;
};

function DebtGuardSwitch({
  value,
  onValueChange,
  explainer,
  label = "Debt Guard",
}: DebtGuardSwitchProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);

  // Capture colors in vars for worklet closure
  const trackOff = colors.track;
  const trackOn = colors.accent;

  useEffect(() => {
    progress.value = reduceMotion
      ? value ? 1 : 0
      : withSpring(value ? 1 : 0, { damping: 22, stiffness: 260 });
  }, [value, progress, reduceMotion]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: reduceMotion
      ? value ? trackOn : trackOff
      : interpolateColor(progress.value, [0, 1], [trackOff, trackOn]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reduceMotion
          ? value ? 22 : 0
          : interpolate(progress.value, [0, 1], [0, 22]),
      },
    ],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={() => onValueChange(!value)}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        style={styles.row}
      >
        {/* Shield icon tile */}
        <View style={[styles.iconTile, { backgroundColor: colors.goodFill }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
        </View>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Animated.View style={[styles.track, trackStyle]}>
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: colors.surface },
              thumbStyle,
            ]}
          />
        </Animated.View>
      </Pressable>
      {explainer ? (
        <Text style={[styles.explainer, { color: colors.muted }]}>{explainer}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  label: {
    fontSize: 15.5,
    fontFamily: type.uiBold,
    flex: 1,
  },
  track: {
    width: 54,
    height: 32,
    borderRadius: 999,
    padding: 3,
    justifyContent: "center",
  },
  thumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
  explainer: {
    fontSize: 13,
    fontFamily: type.uiSemi,
    lineHeight: 1.5 * 13,
    marginTop: spacing.xs,
    marginLeft: 42 + spacing.md,
  },
});

export default memo(DebtGuardSwitch);
