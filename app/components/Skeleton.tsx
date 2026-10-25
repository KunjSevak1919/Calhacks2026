import React, { memo, useEffect, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";
import { radius as radii } from "../theme";

export type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  /** @deprecated use borderRadius */
  r?: number;
  style?: ViewStyle;
};

function Skeleton({ width = "100%", height = 16, borderRadius, r, style }: SkeletonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(-100);

  useEffect(() => {
    if (reduceMotion || containerWidth <= 0) {
      translateX.value = 0;
      return;
    }
    translateX.value = withRepeat(
      withTiming(containerWidth + 100, { duration: 900 }),
      -1,
      false
    );
  }, [containerWidth, reduceMotion, translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      accessibilityLabel="Loading"
      style={[
        {
          width: width as any,
          height,
          borderRadius: borderRadius ?? r ?? radii.sm,
          backgroundColor: colors.skeletonBase,
          overflow: "hidden",
        },
        style,
      ]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {!reduceMotion && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              width: 100,
              backgroundColor: colors.skeletonHighlight,
              opacity: 0.7,
            },
            shimmerStyle,
          ]}
        />
      )}
    </View>
  );
}

export default memo(Skeleton);
