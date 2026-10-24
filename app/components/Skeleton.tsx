import React, { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors, radius } from "../theme";

type Props = {
  width?: number | `${number}%`;
  height: number;
  r?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Skeleton({ width = "100%", height, r = radius.md, style }: Props) {
  const reduce = useReducedMotion();
  const opacity = useSharedValue(0.7);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (reduce) {
      opacity.value = 0.7;
      return;
    }
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [reduce, opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: r,
          backgroundColor: colors.surfaceSubtle,
        },
        anim,
        style,
      ]}
    />
  );
}
