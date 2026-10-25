import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import type { AlertItem } from '../types';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';

export type AlertCardProps = {
  alert: AlertItem;
  onPrimary: (alert: AlertItem) => void;
  onSecondary: (alert: AlertItem) => void;
};

type Phase = 'idle' | 'done' | 'collapsed';

/**
 * Approve -> check -> collapse (250ms fade/scale, then collapse).
 * If `doneMessage` is set, the primary button first becomes a check and
 * shows that message, then the card collapses and `onPrimary` fires.
 * If no `doneMessage` is set (e.g. "See options"), primary fires immediately
 * with no collapse — the parent decides what happens next.
 */
function AlertCard({ alert, onPrimary, onSecondary }: AlertCardProps) {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handlePrimary = () => {
    if (!alert.doneMessage) {
      onPrimary(alert);
      return;
    }
    setPhase('done');
    timer.current = setTimeout(() => {
      if (!theme.reduceMotion) {
        opacity.value = withTiming(0, { duration: 250 });
        scale.value = withTiming(0.96, { duration: 250 });
      } else {
        opacity.value = 0;
      }
      timer.current = setTimeout(() => {
        setPhase('collapsed');
        onPrimary(alert);
      }, theme.reduceMotion ? 0 : 250);
    }, 900);
  };

  if (phase === 'collapsed') return null;

  const styles = StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
      ...theme.shadows.card,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.body,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
      marginTop: theme.spacing.sm,
    },
    done: {
      color: theme.colors.success,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
      marginTop: theme.spacing.md,
    },
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
    },
    action: { flex: 1 },
  });

  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      <Text style={styles.title}>{alert.title}</Text>
      <Text style={styles.body}>{alert.body}</Text>
      {phase === 'done' && alert.doneMessage ? (
        <Text style={styles.done}>✓ {alert.doneMessage}</Text>
      ) : (
        <View style={styles.actions}>
          <View style={styles.action}>
            <PrimaryButton
              title={alert.primaryLabel}
              onPress={handlePrimary}
              accessibilityLabel={`${alert.primaryLabel}: ${alert.title}`}
            />
          </View>
          <View style={styles.action}>
            <SecondaryButton
              title={alert.secondaryLabel}
              onPress={() => onSecondary(alert)}
              accessibilityLabel={`${alert.secondaryLabel}: ${alert.title}`}
            />
          </View>
        </View>
      )}
    </Animated.View>
  );
}

export default memo(AlertCard);
