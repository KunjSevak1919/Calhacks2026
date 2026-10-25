import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../theme';

export type DebtGuardSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** One-line explainer, shown under the switch. */
  explainer?: string;
  label?: string;
};

/**
 * Custom switch so the track colour morphs (accent when on) and the thumb
 * springs across (~250ms). A native Switch would also be acceptable;
 * this version matches the design's track/thumb sizing exactly.
 * 44pt touch target is provided by the surrounding Pressable row.
 */
function DebtGuardSwitch({ value, onValueChange, explainer, label = 'Debt Guard' }: DebtGuardSwitchProps) {
  const { theme } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = theme.reduceMotion
      ? (value ? 1 : 0)
      : withSpring(value ? 1 : 0, { damping: 22, stiffness: 260 });
  }, [value, progress, theme.reduceMotion]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: theme.reduceMotion
      ? (value ? theme.colors.accent : theme.colors.track)
      : interpolateColor(progress.value, [0, 1], [theme.colors.track, theme.colors.accent]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: theme.reduceMotion
          ? (value ? 20 : 0)
          : interpolate(progress.value, [0, 1], [0, 20]),
      },
    ],
  }));

  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 44,
    },
    label: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.body,
    },
    track: {
      width: 52,
      height: 32,
      borderRadius: 16,
      padding: 2,
      justifyContent: 'center',
    },
    thumb: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.card,
    },
    explainer: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
      marginTop: theme.spacing.sm,
    },
  });

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onValueChange(!value)}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        style={styles.row}
      >
        <Text style={styles.label}>{label}</Text>
        <Animated.View style={[styles.track, trackStyle]}>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </Animated.View>
      </Pressable>
      {explainer ? <Text style={styles.explainer}>{explainer}</Text> : null}
    </View>
  );
}

export default memo(DebtGuardSwitch);
