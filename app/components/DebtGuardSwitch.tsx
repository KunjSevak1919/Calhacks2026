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

  useEffect(() => {
    progress.value = reduceMotion
      ? value ? 1 : 0
      : withSpring(value ? 1 : 0, { damping: 22, stiffness: 260 });
  }, [value, progress, reduceMotion]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: reduceMotion
      ? value
        ? colors.accent
        : colors.track
      : interpolateColor(progress.value, [0, 1], [colors.track, colors.accent]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reduceMotion
          ? value ? 20 : 0
          : interpolate(progress.value, [0, 1], [0, 20]),
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
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Animated.View style={[styles.track, trackStyle]}>
          <Animated.View
            style={[styles.thumb, { backgroundColor: colors.surface }, thumbStyle]}
          />
        </Animated.View>
      </Pressable>
      {explainer ? (
        <Text style={[styles.explainer, { color: colors.textSecondary }]}>{explainer}</Text>
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
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
  },
  label: {
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 2,
    justifyContent: "center",
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  explainer: {
    fontSize: font.body,
    fontFamily: type.uiMedium,
    marginTop: spacing.sm,
  },
});

export default memo(DebtGuardSwitch);
