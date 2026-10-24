import React from "react";
import { Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import PressScale from "../PressScale";
import { colors, font, type, hit } from "../../theme";

type ChipVariant = "default" | "good" | "warn" | "coach" | "active";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ChipVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const BG: Record<ChipVariant, string> = {
  default: colors.surfaceSubtle,
  good: colors.goodFill,
  warn: colors.warnFill,
  coach: colors.coachFill,
  active: colors.primary,
};

const FG: Record<ChipVariant, string> = {
  default: colors.muted,
  good: colors.good,
  warn: colors.warn,
  coach: colors.coach,
  active: colors.onPrimary,
};

export default function Chip({
  label,
  onPress,
  variant = "default",
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { backgroundColor: BG[variant] }, style]}
    >
      <Text style={[styles.label, { color: FG[variant] }]}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 99,
    paddingHorizontal: 14,
    minHeight: hit.min,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },
});
