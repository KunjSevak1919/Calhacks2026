import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { cardArt, font, type, spacing, radius, shadow } from "../theme";
import type { CardInfo } from "../api";

export type CreditCardProps = {
  card: CardInfo;
  onPress?: (card: CardInfo) => void;
  selected?: boolean;
  accessibilityHint?: string;
  compact?: boolean;
};

const DISPLAY_NAME = "KUNJ";

function fmtBal(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtLimit(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtPct(usage: number) {
  return Math.round(usage * 100) + "% USED";
}

function CreditCard({ card, onPress, selected, accessibilityHint, compact }: CreditCardProps) {
  const art = cardArt[card.id];
  const gradient: [string, string, string, string] = art
    ? art.gradient
    : [card.color, card.color, card.color, card.color];
  const textColor = art?.textColor ?? "#fff";

  const content = compact ? (
    // Collapsed strip — only name + % used, no text bleed
    <LinearGradient
      colors={gradient}
      locations={[0, 0.38, 0.72, 1.0]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.7 }}
      style={styles.strip}
    >
      <Text style={[styles.stripName, { color: textColor }]} numberOfLines={1}>
        {card.name}
      </Text>
      <Text style={[styles.stripPct, { color: textColor }]}>
        {fmtPct(card.usage)}
      </Text>
    </LinearGradient>
  ) : (
    <LinearGradient
      colors={gradient}
      locations={[0, 0.38, 0.72, 1.0]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      {/* Diagonal sheen */}
      <LinearGradient
        colors={["transparent", "rgba(255,255,255,0.22)", "rgba(255,255,255,0.04)", "transparent"]}
        locations={[0, 0.45, 0.58, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Top-right ring sheen */}
      <View style={styles.ringSheen} pointerEvents="none" />

      {/* Top row: name + label + last4 */}
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: textColor }]}>{card.name}</Text>
          <Text style={[styles.cardPerk, { color: textColor, opacity: 0.78 }]} numberOfLines={1}>
            {card.label.toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.last4, { color: textColor, opacity: 0.85 }]}>
          ••{card.last4}
        </Text>
      </View>

      {/* Mid: EMV chip + contactless */}
      <View style={styles.midRow}>
        <View style={styles.emvChip} />
        <Ionicons name="radio-outline" size={22} color={textColor} style={{ opacity: 0.85 }} />
      </View>

      {/* Balance */}
      <View style={styles.balSection}>
        <View style={styles.balRow}>
          <Text style={[styles.balAmt, { color: textColor }]}>{fmtBal(card.balance)}</Text>
          <Text style={[styles.balOf, { color: textColor, opacity: 0.85 }]}>
            {" "}of {fmtLimit(card.limit)}
          </Text>
        </View>
        <View style={styles.footRow}>
          <Text style={[styles.footText, { color: textColor, opacity: 0.9 }]}>{DISPLAY_NAME}</Text>
          <Text style={[styles.footText, { color: textColor, opacity: 0.9 }]}>{fmtPct(card.usage)}</Text>
        </View>
      </View>
    </LinearGradient>
  );

  if (!onPress) {
    return (
      <View
        style={compact ? styles.stripOuter : [styles.cardOuter, selected && shadow.stack]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(card)}
      accessibilityRole="button"
      accessibilityLabel={`${card.name} ending in ${card.last4}, balance ${fmtBal(card.balance)} of ${fmtLimit(card.limit)}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [
        compact ? styles.stripOuter : styles.cardOuter,
        !compact && (selected ? shadow.stack : shadow.soft),
        pressed && { opacity: 0.92 },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: radius.xl,
    minHeight: 208,
  },
  gradient: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: "hidden",
    justifyContent: "space-between",
    minHeight: 208,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 1,
  },
  cardName: {
    fontSize: 16.5,
    fontFamily: type.uiBold,
    letterSpacing: -0.01 * 16.5,
  },
  cardPerk: {
    fontSize: 11,
    fontFamily: type.uiBold,
    letterSpacing: 0.07 * 11,
    marginTop: 2,
  },
  last4: {
    fontSize: 13.5,
    fontFamily: type.uiBold,
    fontVariant: ["tabular-nums"],
  },
  midRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    position: "relative",
    zIndex: 1,
  },
  emvChip: {
    width: 40,
    height: 30,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
  },
  balSection: {
    marginTop: "auto",
    position: "relative",
    zIndex: 1,
  },
  balRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "nowrap",
  },
  balAmt: {
    fontSize: 30,
    fontFamily: type.monoBold,
    letterSpacing: -0.02 * 30,
    fontVariant: ["tabular-nums"],
  },
  balOf: {
    fontSize: 13,
    fontFamily: type.uiSemi,
  },
  footRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  footText: {
    fontSize: 11.5,
    fontFamily: type.uiBold,
    letterSpacing: 0.06 * 11.5,
    textTransform: "uppercase",
  },
  ringSheen: {
    position: "absolute",
    right: -46,
    top: -56,
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 26,
    borderColor: "rgba(255,255,255,0.09)",
  },

  // Compact strip
  stripOuter: {
    borderRadius: radius.xl,
    height: 52,
    overflow: "hidden",
  },
  strip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  stripName: {
    fontSize: 14,
    fontFamily: type.uiBold,
    flex: 1,
  },
  stripPct: {
    fontSize: 12,
    fontFamily: type.uiBold,
    letterSpacing: 0.04 * 12,
    textTransform: "uppercase",
  },
});

export default memo(CreditCard);
