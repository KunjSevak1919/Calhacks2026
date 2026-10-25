import React, { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

export type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Accent filled button. Minimum height 48pt, radius 16. */
function PrimaryButton({ title, onPress, disabled, accessibilityLabel }: PrimaryButtonProps) {
  const { theme } = useTheme();
  const styles = StyleSheet.create({
    button: {
      minHeight: 48,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      opacity: disabled ? 0.5 : 1,
    },
    text: {
      color: theme.colors.onAccent,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.body,
    },
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.button, pressed && !disabled && { opacity: 0.85 }]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

export default memo(PrimaryButton);
