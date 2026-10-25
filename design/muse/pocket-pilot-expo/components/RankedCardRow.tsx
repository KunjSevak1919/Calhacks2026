import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import type { RankedCard } from '../types';

export type RankedCardRowProps = {
  rank: number;
  ranked: RankedCard;
  isWinner?: boolean;
  /** Non-winners dim slightly when a winner is highlighted. */
  dimmed?: boolean;
  onPress?: (ranked: RankedCard) => void;
};

function RankedCardRow({ rank, ranked, isWinner, dimmed, onPress }: RankedCardRowProps) {
  const { theme } = useTheme();
  const opacity = useSharedValue(dimmed ? 0.55 : 1);

  useEffect(() => {
    opacity.value = theme.reduceMotion
      ? (dimmed ? 0.55 : 1)
      : withTiming(dimmed ? 0.55 : 1, { duration: 250 });
  }, [dimmed, opacity, theme.reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: isWinner ? theme.colors.elevated : theme.colors.surface,
      borderWidth: 1,
      borderColor: isWinner ? theme.colors.accent : theme.colors.border,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.lg,
      minHeight: 72,
    },
    rank: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isWinner ? theme.colors.accent : theme.colors.track,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rankText: {
      color: isWinner ? theme.colors.onAccent : theme.colors.textSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
    },
    main: { flex: 1 },
    name: {
      color: theme.colors.textPrimary,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.body,
    },
    reason: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
      marginTop: 2,
    },
    values: { alignItems: 'flex-end' },
    reward: {
      color: theme.colors.success,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.bodySmall,
      fontVariant: ['tabular-nums'],
    },
    interest: {
      color: theme.colors.danger,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
      fontVariant: ['tabular-nums'],
    },
    net: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
    },
  });

  const content = (
    <Animated.View style={[styles.row, animatedStyle]}>
      <View style={styles.rank}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <View style={styles.main}>
        <Text style={styles.name}>
          {ranked.card.name} ••{ranked.card.last4}
        </Text>
        <Text style={styles.reason}>{ranked.reason}</Text>
      </View>
      <View style={styles.values}>
        <Text style={styles.reward}>{ranked.rewardText} rewards</Text>
        <Text style={styles.interest}>{ranked.interestText} interest</Text>
        <Text style={styles.net}>{ranked.netText}</Text>
      </View>
    </Animated.View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={() => onPress(ranked)}
      accessibilityRole="button"
      accessibilityLabel={`${ranked.card.name}, ${ranked.rewardText} rewards, ${ranked.interestText} interest`}
    >
      {content}
    </Pressable>
  );
}

export default memo(RankedCardRow);
