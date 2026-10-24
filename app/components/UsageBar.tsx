import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radius } from "../theme";

interface Props {
  usage: number;
  height?: number;
  trackColor?: string;
}

export default function UsageBar({ usage, height = 6, trackColor }: Props) {
  const pct = Math.min(Math.max(usage, 0), 1);
  const fill = pct > 0.75 ? colors.warn : colors.good;

  return (
    <View
      style={[
        styles.track,
        { height, backgroundColor: trackColor ?? colors.surfaceSubtle },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${pct * 100}%` as `${number}%`,
            backgroundColor: fill,
            height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.sm,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    borderRadius: radius.sm,
  },
});
