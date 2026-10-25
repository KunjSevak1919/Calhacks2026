import React, { memo } from "react";
import { Pressable, Text } from "react-native";
import { useTheme } from "../ThemeContext";
import { font, type, radius, spacing } from "../theme";

export type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

function PrimaryButton({ title, onPress, disabled, accessibilityLabel }: PrimaryButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: radius.md,
        backgroundColor: colors.accent,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        paddingHorizontal: spacing.lg,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          color: colors.onAccent,
          fontSize: font.body,
          fontFamily: type.uiBold,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default memo(PrimaryButton);
