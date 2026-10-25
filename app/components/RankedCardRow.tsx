import React, { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";
import { cardArt, font, type, spacing, radius } from "../theme";
import type { RankedCard } from "../api";

export type RankedCardRowProps = {
  rank: number;
  card: RankedCard;
  isWinner?: boolean;
  dimmed?: boolean;
  onPress?: (card: RankedCard) => void;
};

// Map card_id to 2-letter initials
const INITIALS: Record<string, string> = {
  aurum: "AU",
  steady: "ST",
  zero: "ZI",
  spin: "SP",
  voyager: "VO",
  flexible: "FL",
  one: "PC",
};

function RankedCardRow({ rank, card, isWinner, dimmed, onPress }: RankedCardRowProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(dimmed ? 0.45 : 1);

  useEffect(() => {
    opacity.value = reduceMotion
      ? dimmed ? 0.45 : 1
      : withTiming(dimmed ? 0.45 : 1, { duration: 250 });
  }, [dimmed, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const art = cardArt[card.card_id];
  const initials = INITIALS[card.card_id] ?? card.name.slice(0, 2).toUpperCase();
  const gradColors: [string, string, string, string] = art
    ? art.gradient
    : ["#374151", "#1F2937", "#111827", "#1F2937"];

  return (
    <Animated.View
      style={[
        styles.row,
        { borderColor: colors.border },
        animatedStyle,
      ]}
    >
      {/* Card gradient dot */}
      <LinearGradient
        colors={gradColors}
        locations={[0, 0.38, 0.72, 1.0]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.dot}
      >
        <Text style={styles.dotText}>{initials}</Text>
      </LinearGradient>

      {/* Name + rate */}
      <View style={styles.main}>
        <Text style={[styles.name, { color: colors.text }]}>
          {card.name}
          {isWinner && (
            <Text style={[styles.bestSuffix, { color: colors.accent }]}> · Best</Text>
          )}
        </Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {card.rate_label}
        </Text>
      </View>

      {/* Values */}
      <View style={styles.values}>
        <Text style={[styles.reward, { color: colors.good }]}>
          +${card.reward.toFixed(2)}
        </Text>
        {card.interest > 0 ? (
          <Text style={[styles.interest, { color: colors.error }]}>
            −${card.interest.toFixed(2)} interest
          </Text>
        ) : (
          <Text style={[styles.noInterest, { color: colors.muted }]}>
            no interest
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dotText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: type.uiBold,
    letterSpacing: 0.03 * 10,
  },
  main: { flex: 1 },
  name: {
    fontSize: 14.5,
    fontFamily: type.uiBold,
    lineHeight: 1.2 * 14.5,
  },
  bestSuffix: {
    fontSize: 12,
    fontFamily: type.uiSemi,
  },
  sub: {
    fontSize: 12,
    fontFamily: type.uiSemi,
    marginTop: 1,
  },
  values: { alignItems: "flex-end" },
  reward: {
    fontSize: 13.5,
    fontFamily: type.uiBold,
    fontVariant: ["tabular-nums"],
  },
  interest: {
    fontSize: 13.5,
    fontFamily: type.uiBold,
    fontVariant: ["tabular-nums"],
  },
  noInterest: {
    fontSize: 12,
    fontFamily: type.uiSemi,
  },
});

export default memo(RankedCardRow);
