import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  runOnJS,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius, shadow } from "../theme";

export type ImpactItem = {
  id: string;
  amount: number;
  label: string;
};

export type ImpactStripProps = {
  title: string;
  items: ImpactItem[];
};

function AnimatedAmount({ amount }: { amount: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 300 });
  }, [progress, reduceMotion]);

  useAnimatedReaction(
    () => progress.value,
    (value) => {
      runOnJS(setDisplay)(Math.round(value * amount * 100) / 100);
    },
    [amount]
  );

  return (
    <Text style={[styles.amount, { color: colors.good }]}>
      ${display.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </Text>
  );
}

function ImpactStrip({ title, items }: ImpactStripProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLabel={`${title}: ${items.map((i) => `${i.label} $${i.amount.toFixed(2)}`).join(", ")}`}
    >
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <View style={styles.row}>
        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <AnimatedAmount amount={item.amount} />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
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
    justifyContent: "space-between",
    gap: spacing.md,
  },
  item: {
    flex: 1,
  },
  amount: {
    fontSize: font.title,
    fontFamily: type.monoBold,
  },
  label: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginTop: spacing.xs,
  },
});

export default memo(ImpactStrip);
