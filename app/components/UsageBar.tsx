import React, { memo, useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../ThemeContext";

export type UsageBarProps = {
  /** 0–1. Above 0.30 the bar turns amber (warning). */
  value?: number;
  /** @deprecated use value */
  usage?: number;
  /** Override for use on dark card art where the accent is the card's own colour. */
  barColor?: string;
  trackColor?: string;
  height?: number;
  testID?: string;
};

function UsageBar({ value, usage, barColor, trackColor, height = 6, testID }: UsageBarProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  const rawValue = value ?? usage ?? 0;
  const clamped = Math.max(0, Math.min(1, rawValue));
  const overThreshold = clamped > 0.3;
  const fill = barColor ?? (overThreshold ? colors.warn : colors.accent);

  useEffect(() => {
    if (width <= 0) return;
    progress.value = reduceMotion ? clamped : withTiming(clamped, { duration: 250 });
  }, [width, clamped, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ width: progress.value * width }));

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }}
      accessibilityLabel={`Credit usage ${Math.round(clamped * 100)} percent${overThreshold ? ", above 30 percent" : ""}`}
      style={{
        height,
        borderRadius: 3,
        backgroundColor: trackColor ?? colors.track,
        overflow: "hidden",
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[{ height, borderRadius: 3, backgroundColor: fill }, animatedStyle]}
      />
    </View>
  );
}

export default memo(UsageBar);
