import React, { memo, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, radius } from "../theme";
import type { RankedCard } from "../api";

export type RankedCardRowProps = {
  rank: number;
  card: RankedCard;
  isWinner?: boolean;
  dimmed?: boolean;
  onPress?: (card: RankedCard) => void;
};

function fmt2(n: number) {
  return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toFixed(2);
}

function RankedCardRow({ rank, card, isWinner, dimmed, onPress }: RankedCardRowProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(dimmed ? 0.55 : 1);

  useEffect(() => {
    opacity.value = reduceMotion
      ? dimmed ? 0.55 : 1
      : withTiming(dimmed ? 0.55 : 1, { duration: 250 });
  }, [dimmed, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const content = (
    <Animated.View
      style={[
        styles.row,
        {
          backgroundColor: isWinner ? colors.elevated : colors.surface,
          borderColor: isWinner ? colors.accent : colors.border,
        },
        animatedStyle,
      ]}
    >
      <View
        style={[
          styles.rankBadge,
          { backgroundColor: isWinner ? colors.accent : colors.track },
        ]}
      >
        <Text style={[styles.rankText, { color: isWinner ? colors.onAccent : colors.textSecondary }]}>
          {rank}
        </Text>
      </View>
      <View style={styles.main}>
        <Text style={[styles.name, { color: colors.text }]}>
          {card.name} ••{card.last4}
        </Text>
        <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>
          {card.rate_label}
        </Text>
      </View>
      <View style={styles.values}>
        <Text style={[styles.reward, { color: colors.good }]}>
          +${card.reward.toFixed(2)} rewards
        </Text>
        {card.interest > 0 && (
          <Text style={[styles.interest, { color: colors.error }]}>
            −${card.interest.toFixed(2)} interest
          </Text>
        )}
        <Text style={[styles.net, { color: colors.textSecondary }]}>
          {fmt2(card.net)} net
        </Text>
      </View>
    </Animated.View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={() => onPress(card)}
      accessibilityRole="button"
      accessibilityLabel={`${card.name}, ${card.reward.toFixed(2)} rewards, net ${card.net.toFixed(2)}`}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 72,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    fontSize: font.body,
    fontFamily: type.uiBold,
  },
  main: { flex: 1 },
  name: {
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },
  rateLabel: {
    fontSize: font.label,
    fontFamily: type.uiMedium,
    marginTop: 2,
  },
  values: { alignItems: "flex-end" },
  reward: {
    fontSize: font.label,
    fontFamily: type.monoBold,
  },
  interest: {
    fontSize: font.label,
    fontFamily: type.monoSemi,
  },
  net: {
    fontSize: font.label,
    fontFamily: type.monoSemi,
  },
});

export default memo(RankedCardRow);
