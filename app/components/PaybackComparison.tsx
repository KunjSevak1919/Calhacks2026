import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius } from "../theme";
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
    <View style={styles.row}>
      {/* Pay in full — good */}
      <View
        style={[styles.cell, { backgroundColor: colors.goodFill }]}
        accessibilityLabel={`Pay in full: ${fmt(data.pay_in_full.interest)} interest`}
      >
        <Text style={[styles.label, { color: colors.good }]}>PAY IN FULL</Text>
        <Text style={[styles.value, { color: colors.text }]}>{fmt(data.pay_in_full.interest)}</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {data.pay_in_full.months === 1 ? "No interest" : `${data.pay_in_full.months} months`}
        </Text>
      </View>

      {/* Minimum only — danger */}
      <View
        style={[styles.cell, { backgroundColor: colors.errorFill }]}
        accessibilityLabel={`Minimum only: ${fmt(data.minimum_only.interest)} interest over ${data.minimum_only.months} months`}
      >
        <Text style={[styles.label, { color: colors.error }]}>MIN ONLY</Text>
        <Text style={[styles.value, { color: colors.text }]}>{fmt(data.minimum_only.interest)}</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {data.minimum_only.months} months
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
  },
  label: {
    fontSize: 12,
    fontFamily: type.uiBold,
    letterSpacing: 0.05 * 12,
  },
  value: {
    fontSize: 21,
    fontFamily: type.monoBold,
    letterSpacing: -0.01 * 21,
    marginTop: 5,
    fontVariant: ["tabular-nums"],
  },
  sub: {
    fontSize: 12,
    fontFamily: type.uiSemi,
    lineHeight: 1.45 * 12,
    marginTop: 3,
  },
});

export default memo(PaybackComparison);
