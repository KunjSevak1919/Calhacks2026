import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  runOnJS,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { font, type, spacing, radius } from "../theme";

export type ImpactItem = {
  id: string;
  amount: number;
  label: string;
};

export type ImpactStripProps = {
  title: string;
  items: ImpactItem[];
};

const TEXT_COLOR = "#EAF7F0";
const TEXT_MUTED = "rgba(234,247,240,0.75)";

function AnimatedTotal({ total }: { total: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 600 });
  }, [progress, reduceMotion]);

  useAnimatedReaction(
    () => progress.value,
    (v) => {
      runOnJS(setDisplay)(Math.round(v * total * 100) / 100);
    },
    [total]
  );

  return (
    <Text style={styles.total}>
      ${display.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </Text>
  );
}

function AnimatedAmount({ amount }: { amount: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 400 });
  }, [progress, reduceMotion]);

  useAnimatedReaction(
    () => progress.value,
    (v) => {
      runOnJS(setDisplay)(Math.round(v * amount * 100) / 100);
    },
    [amount]
  );

  return (
    <Text style={styles.rowValue}>
      ${display.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </Text>
  );
}

function ImpactStrip({ title, items }: ImpactStripProps) {
  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <LinearGradient
      colors={["#0D5C40", "#083D2A"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={styles.container}
    >
      {/* Ring sheen */}
      <View style={styles.ring} pointerEvents="none" />

      <View style={styles.headerRow}>
        <View style={{ flex: 1, zIndex: 1 }}>
          <Text style={styles.label}>{title.toUpperCase()}</Text>
          <AnimatedTotal total={total} />
        </View>
        <View style={[styles.dataRows, { zIndex: 1 }]}>
          {items.map((item) => (
            <View key={item.id} style={styles.dataRow}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <AnimatedAmount amount={item.amount} />
            </View>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: "hidden",
    position: "relative",
  },
  ring: {
    position: "absolute",
    right: -30,
    top: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 22,
    borderColor: "rgba(255,255,255,0.07)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontFamily: type.uiBold,
    letterSpacing: 0.09 * 12,
    color: TEXT_COLOR,
    opacity: 0.85,
  },
  total: {
    fontSize: 36,
    fontFamily: type.monoBold,
    letterSpacing: -0.02 * 36,
    color: TEXT_COLOR,
    marginTop: 6,
    marginBottom: 0,
    fontVariant: ["tabular-nums"],
  },
  dataRows: {
    flex: 1,
    gap: 7,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 13.5,
    fontFamily: type.uiSemi,
    color: TEXT_MUTED,
  },
  rowValue: {
    fontSize: 13.5,
    fontFamily: type.uiBold,
    color: TEXT_COLOR,
    fontVariant: ["tabular-nums"],
  },
});

export default memo(ImpactStrip);
