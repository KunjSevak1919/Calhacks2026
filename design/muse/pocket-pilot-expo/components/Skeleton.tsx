import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';

export type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

/**
 * Shimmer: a highlight band sweeps left to right (900ms, repeating).
 * Reduce Motion: static, no sweep. This is a continuous-loop loading
 * indicator, so it is intentionally outside the 150–350ms interaction range.
 */
function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  const { theme } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(-100);

  useEffect(() => {
    if (theme.reduceMotion || containerWidth <= 0) {
      translateX.value = 0;
      return;
    }
    translateX.value = withRepeat(
      withTiming(containerWidth + 100, { duration: 900 }),
      -1,
      false,
    );
  }, [containerWidth, theme.reduceMotion, translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const styles = StyleSheet.create({
    container: {
      width,
      height,
      borderRadius: borderRadius ?? theme.radius.sm,
      backgroundColor: theme.colors.skeletonBase,
      overflow: 'hidden',
    },
    shimmer: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 100,
      backgroundColor: theme.colors.skeletonHighlight,
      opacity: 0.7,
    },
  });

  return (
    <View
      style={[styles.container, style]}
      accessibilityLabel="Loading"
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      {!theme.reduceMotion && <Animated.View style={[styles.shimmer, shimmerStyle]} />}
    </View>
  );
}

export default memo(Skeleton);
