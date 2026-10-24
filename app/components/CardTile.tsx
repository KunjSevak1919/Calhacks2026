import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { CardInfo } from "../api";
import UsageBar from "./UsageBar";
import { colors, spacing, radius, font } from "../theme";

interface Props {
  card: CardInfo;
  onPress?: () => void;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export default function CardTile({ card, onPress }: Props) {
  const bg = card.color || colors.card;
  const fg = card.text_color || "#ffffff";
  const daysUntilDue = card.due
    ? Math.ceil((new Date(card.due).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.tile, { backgroundColor: bg }]}>
      {/* Header row */}
      <View style={styles.row}>
        <Text style={[styles.name, { color: fg }]} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={[styles.last4, { color: fg + "99" }]}>•••• {card.last4}</Text>
      </View>

      {/* Balance */}
      <Text style={[styles.balance, { color: fg }]}>{usd(card.balance)}</Text>
      <Text style={[styles.limit, { color: fg + "AA" }]}>of {usd(card.limit)} limit</Text>

      {/* Usage bar */}
      <View style={styles.barWrap}>
        <UsageBar usage={card.usage} height={5} />
      </View>

      {/* Footer row */}
      <View style={styles.row}>
        <Text style={[styles.meta, { color: fg + "CC" }]}>
          {pct(card.usage)} used · {card.apr.toFixed(1)}% APR
        </Text>
        {daysUntilDue !== null && (
          <Text
            style={[
              styles.due,
              { color: daysUntilDue <= 7 ? colors.amber : fg + "AA" },
            ]}
          >
            Due in {daysUntilDue}d
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: font.lg,
    fontWeight: "700",
    flex: 1,
  },
  last4: {
    fontSize: font.sm,
    fontWeight: "500",
    marginLeft: spacing.sm,
  },
  balance: {
    fontSize: font.hero,
    fontWeight: "800",
    marginTop: spacing.md,
    letterSpacing: -1,
  },
  limit: {
    fontSize: font.sm,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  barWrap: {
    marginBottom: spacing.md,
  },
  meta: {
    fontSize: font.xs,
  },
  due: {
    fontSize: font.xs,
    fontWeight: "600",
  },
});
