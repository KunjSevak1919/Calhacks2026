import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MoneyText from "../MoneyText";
import { colors, font, type, radius, spacing } from "../../theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  value: number | null | undefined;
  label: string;
  /** Defaults to colors.good */
  color?: string;
  /** Defaults to the color + low-opacity fill */
  fill?: string;
  prefix?: string;
  countUp?: boolean;
};

export default function StatTile({
  icon,
  value,
  label,
  color = colors.good,
  fill,
  prefix,
  countUp,
}: Props) {
  const bg = fill ?? color + "18";

  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
      <MoneyText
        value={value}
        countUp={countUp}
        prefix={prefix}
        style={{ fontSize: font.body, color, fontFamily: type.monoBold }}
      />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 4,
    minHeight: 88,
  },
  label: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    textAlign: "center",
  },
});
