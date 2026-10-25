import React, { memo } from "react";
import { Pressable, Text } from "react-native";
import { useTheme } from "../ThemeContext";
import { font, type, radius, spacing } from "../theme";

export type SecondaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

function SecondaryButton({ title, onPress, disabled, accessibilityLabel }: SecondaryButtonProps) {
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
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        paddingHorizontal: spacing.lg,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: font.body,
          fontFamily: type.uiSemi,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default memo(SecondaryButton);
