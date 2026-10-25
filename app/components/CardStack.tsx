import React, { memo, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";
import { font, type, spacing, shadow } from "../theme";
import type { CardInfo } from "../api";
import CreditCard from "./CreditCard";

export type CardStackProps = {
  cards: CardInfo[];
  expanded: boolean;
  selectedCardId?: string;
  onCardPress: (card: CardInfo) => void;
  onToggle: () => void;
};

const CARD_HEIGHT = 188;
const GAP = 12;
const PEEK = 20;

function StackCard({
  card,
  index,
  total,
  progress,
  selected,
  onCardPress,
}: {
  card: CardInfo;
  index: number;
  total: number;
  progress: SharedValue<number>;
  selected: boolean;
  onCardPress: (card: CardInfo) => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const y = interpolate(
      progress.value,
      [0, 1],
      [index * PEEK, index * (CARD_HEIGHT + GAP)]
    );
    const scale =
      interpolate(progress.value, [0, 1], [1 - index * 0.04, 1]) *
      (selected ? 1.03 : 1);
    return {
      position: "absolute" as const,
      left: 0,
      right: 0,
      height: CARD_HEIGHT,
      transform: [{ translateY: y }, { scale }],
      zIndex: total - index,
      opacity: interpolate(progress.value, [0, 1], [1 - index * 0.15, 1]),
    };
  });

  return (
    <Animated.View style={[animatedStyle, selected ? shadow.stack : shadow.soft]}>
      <CreditCard
        card={card}
        selected={selected}
        onPress={onCardPress}
        accessibilityHint={selected ? "Selected card" : "Tap to select this card"}
      />
    </Animated.View>
  );
}

function CardStack({ cards, expanded, selectedCardId, onCardPress, onToggle }: CardStackProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? expanded ? 1 : 0
      : withSpring(expanded ? 1 : 0, { damping: 20, stiffness: 180 });
  }, [expanded, progress, reduceMotion]);

  const collapsedHeight = CARD_HEIGHT + (cards.length - 1) * PEEK;
  const expandedHeight = cards.length * CARD_HEIGHT + (cards.length - 1) * GAP;

  const containerStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [collapsedHeight, expandedHeight]),
  }));

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
        accessibilityLabel={expanded ? "Collapse card stack" : "Expand card stack"}
        style={styles.toggle}
      >
        <Text style={[styles.toggleText, { color: colors.accent }]}>
          {expanded ? "Collapse cards" : "See all cards"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  toggleText: {
    fontSize: font.body,
    fontFamily: type.uiSemi,
  },
});

export default memo(CardStack);
