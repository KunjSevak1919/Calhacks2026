import React, { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import type { FundingOption } from '../types';

export const FUNDING_OPTIONS: { id: FundingOption; label: string }[] = [
  { id: 'credit', label: 'Credit' },
  { id: 'debit', label: 'Debit' },
  { id: 'installments', label: '4 Installments' },
];

export type FundingChipProps = {
  selected: FundingOption;
  onSelect: (option: FundingOption) => void;
};

/**
 * Segmented funding control. A sliding indicator (spring, ~250ms) moves
 * between equal-width segments. Reduce Motion jumps it to the new segment.
 * Each segment is a 44pt touch target.
 */
function FundingChip({ selected, onSelect }: FundingChipProps) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  const selectedIndex = FUNDING_OPTIONS.findIndex((o) => o.id === selected);
  const index = useSharedValue(selectedIndex);

  useEffect(() => {
    index.value = theme.reduceMotion
      ? selectedIndex
      : withSpring(selectedIndex, { damping: 22, stiffness: 260 });
  }, [selectedIndex, index, theme.reduceMotion]);

  const segmentWidth = width > 0 ? width / FUNDING_OPTIONS.length : 0;
  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: index.value * segmentWidth }],
  }));

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: theme.colors.track,
      borderRadius: theme.radius.full,
      padding: 4,
      position: 'relative',
    },
    indicator: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.card,
    },
    segment: {
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: theme.radius.full,
    },
    label: {
      fontSize: theme.fontSize.bodySmall,
      fontWeight: theme.fontWeight.semibold,
      lineHeight: theme.lineHeight.bodySmall,
    },
  });

  return (
    <View
      style={styles.container}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="radiogroup"
    >
      <Animated.View style={[styles.indicator, indicatorStyle]} pointerEvents="none" />
      {FUNDING_OPTIONS.map((option) => {
        const isSelected = option.id === selected;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            accessibilityRole="radio"
            accessibilityLabel={`Pay with ${option.label}`}
            accessibilityState={{ selected: isSelected }}
            style={styles.segment}
          >
            <Text
              style={[
                styles.label,
                { color: isSelected ? theme.colors.textPrimary : theme.colors.textMuted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(FundingChip);
