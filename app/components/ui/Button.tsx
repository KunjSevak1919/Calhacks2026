import React from "react";
import { Text, StyleSheet, StyleProp, ViewStyle, ActivityIndicator } from "react-native";
import PressScale from "../PressScale";
import { colors, radius, font, type, hit } from "../../theme";

type Variant = "primary" | "secondary" | "ghost";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  accessibilityLabel,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <PressScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.onPrimary : colors.text}
        />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    minHeight: hit.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: { opacity: 0.45 },

  label: {
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },
  primaryLabel: { color: colors.onPrimary },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: colors.muted },
});
