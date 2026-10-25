import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import type { MoneyKeptItem } from '../types';

export type ImpactStripProps = {
  title: string;
  items: MoneyKeptItem[];
};

/** One count-up number, driven by Reanimated. Jumps to the final value if Reduce Motion is on. */
function AnimatedAmount({ amount }: { amount: number }) {
  const { theme } = useTheme();
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = theme.reduceMotion ? 1 : withTiming(1, { duration: 300 });
  }, [progress, theme.reduceMotion]);

  useAnimatedReaction(
    () => progress.value,
    (value) => {
      runOnJS(setDisplay)(Math.round(value * amount * 100) / 100);
    },
    [amount],
  );

  const styles = StyleSheet.create({
    amount: {
      color: theme.colors.success,
      fontSize: theme.fontSize.subheading,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.subheading,
      fontVariant: ['tabular-nums'],
    },
  });

  return (
    <Text style={styles.amount}>
      ${display.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </Text>
  );
}

function ImpactStrip({ title, items }: ImpactStripProps) {
  const { theme } = useTheme();
  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      ...theme.shadows.card,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
      marginBottom: theme.spacing.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    item: {
      flex: 1,
    },
    label: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
      marginTop: theme.spacing.xs,
    },
  });

  return (
    <View style={styles.container} accessibilityLabel={`${title}: ${items.map((i) => `${i.label} $${i.amount.toFixed(2)}`).join(', ')}`}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <AnimatedAmount amount={item.amount} />
            <Text style={styles.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default memo(ImpactStrip);
