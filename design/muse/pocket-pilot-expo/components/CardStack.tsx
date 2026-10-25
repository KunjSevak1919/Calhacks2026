import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import type { CreditCardData } from '../types';
import CreditCard from './CreditCard';

export type CardStackProps = {
  cards: CreditCardData[];
  expanded: boolean;
  selectedCardId?: string;
  onCardPress: (card: CreditCardData) => void;
  onToggle: () => void;
};

const CARD_HEIGHT = 188;
const GAP = 12;
const PEEK = 20;

/**
 * Fan-out / collapse, spring physics (approx. 300ms, spring damping 20).
 * Collapsed: cards peek out by 20pt each, deeper cards slightly smaller.
 * Expanded: full vertical list with 12pt gaps.
 * A tapped card lifts (scale 1.03) via the `selected` state.
 * Reduce Motion: the progress value jumps instead of springing.
 */
function StackCard({
  card,
  index,
  total,
  progress,
  selected,
  onCardPress,
}: {
  card: CreditCardData;
  index: number;
  total: number;
  progress: SharedValue<number>;
  selected: boolean;
  onCardPress: (card: CreditCardData) => void;
}) {
  const { theme } = useTheme();
  const collapsedHeight = CARD_HEIGHT + (total - 1) * PEEK;
  const expandedHeight = total * CARD_HEIGHT + (total - 1) * GAP;

  const animatedStyle = useAnimatedStyle(() => {
    const y = interpolate(
      progress.value,
      [0, 1],
      [index * PEEK, index * (CARD_HEIGHT + GAP)],
    );
    const scale = interpolate(progress.value, [0, 1], [1 - index * 0.04, 1]) * (selected ? 1.03 : 1);
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      height: CARD_HEIGHT,
      transform: [{ translateY: y }, { scale }],
      zIndex: total - index,
      opacity: interpolate(progress.value, [0, 1], [1 - index * 0.15, 1]),
    };
  });

  const styles = StyleSheet.create({
    shadow: selected ? theme.shadows.lift : theme.shadows.card,
  });

  return (
    <Animated.View style={[animatedStyle, styles.shadow]}>
      <CreditCard
        card={card}
        selected={selected}
        onPress={onCardPress}
        accessibilityHint={selected ? 'Selected card' : 'Tap to expand this card'}
      />
    </Animated.View>
  );
}

function CardStack({ cards, expanded, selectedCardId, onCardPress, onToggle }: CardStackProps) {
  const { theme } = useTheme();
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = theme.reduceMotion
      ? (expanded ? 1 : 0)
      : withSpring(expanded ? 1 : 0, { damping: 20, stiffness: 180 });
  }, [expanded, progress, theme.reduceMotion]);

  const collapsedHeight = CARD_HEIGHT + (cards.length - 1) * PEEK;
  const expandedHeight = cards.length * CARD_HEIGHT + (cards.length - 1) * GAP;

  const containerStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [collapsedHeight, expandedHeight]),
  }));

  const styles = StyleSheet.create({
    toggle: {
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: theme.spacing.sm,
    },
    toggleText: {
      color: theme.colors.accent,
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
  });

  return (
    <View>
      <Animated.View style={containerStyle}>
        {cards.map((card, index) => (
          <StackCard
            key={card.id}
            card={card}
            index={index}
            total={cards.length}
            progress={progress}
            selected={selectedCardId === card.id}
            onCardPress={onCardPress}
          />
        ))}
      </Animated.View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse card stack' : 'Expand card stack'}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>{expanded ? 'Collapse cards' : 'See all cards'}</Text>
      </Pressable>
    </View>
  );
}

export default memo(CardStack);
