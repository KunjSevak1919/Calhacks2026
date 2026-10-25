import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius, shadow } from "../theme";
import type { PaybackResponse } from "../api";

export type PaybackComparisonProps = {
  data: PaybackResponse;
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PaybackComparison({ data }: PaybackComparisonProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Payback comparison</Text>
      <View style={styles.row}>
        <View
          style={[styles.cell, { backgroundColor: colors.elevated }]}
          accessibilityLabel={`Pay in full: ${fmt(data.pay_in_full.interest)} interest, paid immediately`}
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>Pay in full</Text>
          <Text style={[styles.interest, { color: colors.good }]}>
            {fmt(data.pay_in_full.interest)} interest
          </Text>
          <Text style={[styles.months, { color: colors.textSecondary }]}>
            {data.pay_in_full.months === 1 ? "Paid immediately" : `${data.pay_in_full.months} months`}
          </Text>
        </View>
        <View
          style={[styles.cell, { backgroundColor: colors.elevated }]}
          accessibilityLabel={`Minimum only: ${fmt(data.minimum_only.interest)} interest over ${data.minimum_only.months} months`}
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>Minimum only</Text>
          <Text style={[styles.interest, { color: colors.error }]}>
            {fmt(data.minimum_only.interest)} interest
          </Text>
          <Text style={[styles.months, { color: colors.textSecondary }]}>
            {data.minimum_only.months} months
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  title: {
    fontSize: font.body,
    fontFamily: type.uiBold,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  cell: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  label: {
    fontSize: font.label,
    fontFamily: type.uiSemi,
  },
  interest: {
    fontSize: font.title,
    fontFamily: type.monoBold,
    marginTop: spacing.xs,
  },
  months: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginTop: spacing.xs,
  },
});

export default memo(PaybackComparison);
