import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cardArt, useTheme } from '../theme';
import type { CreditCardData } from '../types';
import { formatMoneyWhole } from '../types';
import UsageBar from './UsageBar';

export type CreditCardProps = {
  card: CreditCardData;
  /** When true the card renders at full height; collapsed stack cards use a shorter frame. */
  onPress?: (card: CreditCardData) => void;
  selected?: boolean;
  /** Accessibility hint is supplied by the parent when the card is interactive. */
  accessibilityHint?: string;
};

/**
 * Original card art: gradient + sheen + a soft dark overlay for text contrast.
 * No real bank, network, or app marks are used. Card art is the same in both themes.
 */
function CreditCard({ card, onPress, selected, accessibilityHint }: CreditCardProps) {
  const { theme } = useTheme();
  const art = cardArt[card.id];
  const styles = StyleSheet.create({
    pressable: {
      borderRadius: theme.radius.xl,
      minHeight: 188,
    },
    gradient: {
      flex: 1,
      borderRadius: theme.radius.xl,
      padding: theme.spacing.xl,
      overflow: 'hidden',
      justifyContent: 'space-between',
      minHeight: 188,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.cardOverlay,
    },
    sheen: {
      position: 'absolute',
      top: -48,
      right: -32,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: theme.colors.cardSheen,
    },
    sheenSmall: {
      position: 'absolute',
      bottom: -64,
      left: -24,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: theme.colors.cardSheen,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    name: {
      color: theme.colors.cardText,
      fontSize: theme.fontSize.subheading,
      fontWeight: theme.fontWeight.bold,
      lineHeight: theme.lineHeight.subheading,
    },
    last4: {
      color: theme.colors.cardTextSecondary,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.bodySmall,
    },
    balanceLabel: {
      color: theme.colors.cardTextSecondary,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
    },
    balance: {
      color: theme.colors.cardText,
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.extrabold,
      lineHeight: theme.lineHeight.title,
      fontVariant: ['tabular-nums'],
    },
    meta: {
      color: theme.colors.cardTextSecondary,
      fontSize: theme.fontSize.caption,
      fontWeight: theme.fontWeight.medium,
      lineHeight: theme.lineHeight.caption,
      marginTop: theme.spacing.sm,
    },
    usage: {
      marginTop: theme.spacing.md,
    },
  });

  const content = (
    <LinearGradient colors={art.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <View style={styles.overlay} pointerEvents="none" />
      <View style={styles.sheen} pointerEvents="none" />
      <View style={styles.sheenSmall} pointerEvents="none" />
      <View style={styles.row}>
        <Text style={styles.name}>{card.name}</Text>
        <Text style={styles.last4}>••{card.last4}</Text>
      </View>
      <View>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balance}>
          {formatMoneyWhole(card.balance)} of {formatMoneyWhole(card.limit)}
        </Text>
        <View style={styles.usage}>
          <UsageBar value={card.utilization} barColor={art.accent} />
        </View>
        <Text style={styles.meta}>
          {card.rewardLabel} · {card.apr}% APR · Due {card.dueDate}
          {card.note ? ` · ${card.note}` : ''}
        </Text>
      </View>
    </LinearGradient>
  );

  if (!onPress) {
    return <View style={styles.pressable}>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => onPress(card)}
      accessibilityRole="button"
      accessibilityLabel={`${card.name} ending in ${card.last4}, balance ${formatMoneyWhole(card.balance)} of ${formatMoneyWhole(card.limit)}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.92 }]}
    >
      {content}
    </Pressable>
  );
}

export default memo(CreditCard);
