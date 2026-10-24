import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radius } from "../theme";

interface Props {
  usage: number; // 0–1
  height?: number;
}

export default function UsageBar({ usage, height = 6 }: Props) {
  const pct = Math.min(Math.max(usage, 0), 1);
  const fill = pct > 0.75 ? colors.amber : pct > 0.5 ? colors.blue : colors.mint;

  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${pct * 100}%` as `${number}%`, backgroundColor: fill, height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    borderRadius: radius.sm,
  },
});
