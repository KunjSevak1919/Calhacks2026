import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';

export type UsageBarProps = {
  /** 0–1. Above 0.30 the bar turns amber (warning). */
  value: number;
  /** Override for use on dark card art, where the accent is the card's own colour. */
  barColor?: string;
  testID?: string;
};

/**
 * Fills on load (250ms). If Reduce Motion is on, it jumps straight to the value.
 * Colour is never the only signal: callers also show the percentage as text.
 */
function UsageBar({ value, barColor, testID }: UsageBarProps) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, value));
  const overThreshold = clamped > 0.3;
  const fill = barColor ?? (overThreshold ? theme.colors.warning : theme.colors.accent);

  useEffect(() => {
    if (width <= 0) return;
    progress.value = theme.reduceMotion
      ? clamped
      : withTiming(clamped, { duration: 250 });
  }, [width, clamped, progress, theme.reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: progress.value * width,
  }));

  const styles = StyleSheet.create({
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.track,
      overflow: 'hidden',
    },
    fill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: fill,
    },
  });

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }}
      accessibilityLabel={`Credit usage ${Math.round(clamped * 100)} percent${overThreshold ? ', above 30 percent' : ''}`}
      style={styles.track}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.fill, animatedStyle]} />
    </View>
  );
}

export default memo(UsageBar);
