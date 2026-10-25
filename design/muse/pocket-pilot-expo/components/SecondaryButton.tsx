import React, { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

export type SecondaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Outlined button. Minimum height 48pt, radius 16. */
function SecondaryButton({ title, onPress, disabled, accessibilityLabel }: SecondaryButtonProps) {
  const { theme } = useTheme();
  const styles = StyleSheet.create({
    button: {
      minHeight: 48,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      opacity: disabled ? 0.5 : 1,
    },
    text: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
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

export default memo(SecondaryButton);
