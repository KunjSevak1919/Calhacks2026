import React, { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

export type StoreChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

/** Pill chip, 44pt minimum touch target. Used for stores and Coach suggestions. */
function StoreChip({ label, selected, onPress, accessibilityLabel }: StoreChipProps) {
  const { theme } = useTheme();
  const styles = StyleSheet.create({
    chip: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.full,
      borderWidth: 1,
      borderColor: selected ? theme.colors.accent : theme.colors.border,
      backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    text: {
      color: selected ? theme.colors.onAccent : theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

export default memo(StoreChip);
