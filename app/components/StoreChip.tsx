import React, { memo } from "react";
import { Pressable, Text } from "react-native";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius } from "../theme";

export type StoreChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

function StoreChip({ label, selected, onPress, accessibilityLabel }: StoreChipProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accent : colors.surface,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? colors.onAccent : colors.text,
          fontSize: font.body,
          fontFamily: type.uiSemi,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default memo(StoreChip);
