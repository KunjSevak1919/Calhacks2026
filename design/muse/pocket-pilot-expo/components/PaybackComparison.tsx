import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { PaybackComparisonData } from '../types';
import { formatMoney } from '../types';

export type PaybackComparisonProps = {
  data: PaybackComparisonData;
};

/** Side-by-side payback comparison. Interest is always shown as text, not colour alone. */
function PaybackComparison({ data }: PaybackComparisonProps) {
  const { theme } = useTheme();
  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
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
      gap: theme.spacing.md,
    },
    cell: {
      flex: 1,
      backgroundColor: theme.colors.elevated,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
    },
    label: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.caption,
    },
    interest: {
      fontSize: theme.fontSize.subheading,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.subheading,
      fontVariant: ['tabular-nums'],
      marginTop: theme.spacing.xs,
    },
    months: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
      marginTop: theme.spacing.xs,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payback comparison</Text>
      <View style={styles.row}>
        <View style={styles.cell} accessibilityLabel={`${data.fullLabel}: ${formatMoney(data.fullInterest)} interest`}>
          <Text style={styles.label}>{data.fullLabel}</Text>
          <Text style={[styles.interest, { color: theme.colors.success }]}>
            {formatMoney(data.fullInterest)} interest
          </Text>
          <Text style={styles.months}>Paid in full</Text>
        </View>
        <View style={styles.cell} accessibilityLabel={`${data.minimumLabel}: ${formatMoney(data.minimumInterest)} interest over ${data.minimumMonths} months`}>
          <Text style={styles.label}>{data.minimumLabel}</Text>
          <Text style={[styles.interest, { color: theme.colors.danger }]}>
            {formatMoney(data.minimumInterest)} interest
          </Text>
          <Text style={styles.months}>{data.minimumMonths} months</Text>
        </View>
      </View>
    </View>
  );
}

export default memo(PaybackComparison);
