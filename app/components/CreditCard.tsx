import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../ThemeContext";
import { cardArt, font, type, spacing, radius, shadow } from "../theme";
import type { CardInfo } from "../api";
import UsageBar from "./UsageBar";

export type CreditCardProps = {
  card: CardInfo;
  onPress?: (card: CardInfo) => void;
  selected?: boolean;
  accessibilityHint?: string;
};

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function CreditCard({ card, onPress, selected, accessibilityHint }: CreditCardProps) {
  const { colors } = useTheme();
  const art = cardArt[card.id];
  const gradient: [string, string] = art
    ? art.gradient
    : [card.color, card.color];
  const barColor = art?.accent;

  const note =
    card.annual_fee > 0
      ? `$${card.annual_fee}/yr fee`
      : card.usage_tip ?? null;

  const dueLabel = card.due
    ? `Due ${new Date(card.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "No payment due";

  const content = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.cardOverlay }]} pointerEvents="none" />
      {/* Sheen circles */}
      <View
        style={{ position: "absolute", top: -48, right: -32, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.cardSheen }}
        pointerEvents="none"
      />
      <View
        style={{ position: "absolute", bottom: -64, left: -24, width: 140, height: 140, borderRadius: 70, backgroundColor: colors.cardSheen }}
        pointerEvents="none"
      />
      {/* Top row */}
      <View style={styles.row}>
        <Text style={[styles.name, { color: colors.cardText }]}>{card.name}</Text>
        <Text style={[styles.last4, { color: colors.cardTextSecondary }]}>••{card.last4}</Text>
      </View>
      {/* Bottom section */}
      <View>
        <Text style={[styles.balanceLabel, { color: colors.cardTextSecondary }]}>Balance</Text>
        <Text style={[styles.balance, { color: colors.cardText }]}>
          {fmt(card.balance)} of {fmt(card.limit)}
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <UsageBar value={card.usage} barColor={barColor} />
        </View>
        <Text style={[styles.meta, { color: colors.cardTextSecondary }]}>
          {card.label} · {card.apr}% APR · {dueLabel}
          {note ? ` · ${note}` : ""}
        </Text>
      </View>
    </LinearGradient>
  );

  if (!onPress) {
    return <View style={[styles.pressable, selected && shadow.stack]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => onPress(card)}
      accessibilityRole="button"
      accessibilityLabel={`${card.name} ending in ${card.last4}, balance ${fmt(card.balance)} of ${fmt(card.limit)}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [styles.pressable, selected ? shadow.stack : shadow.soft, pressed && { opacity: 0.92 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.xl,
    minHeight: 188,
  },
  gradient: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: "hidden",
    justifyContent: "space-between",
    minHeight: 188,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  name: {
    fontSize: font.title,
    fontFamily: type.uiBold,
  },
  last4: {
    fontSize: font.body,
    fontFamily: type.uiMedium,
  },
  balanceLabel: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
  },
  balance: {
    fontSize: font.screen,
    fontFamily: type.monoBold,
  },
  meta: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginTop: spacing.sm,
  },
});

export default memo(CreditCard);
