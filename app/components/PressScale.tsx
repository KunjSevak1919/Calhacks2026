import React from "react";
import { GestureResponderEvent, Pressable, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type Props = {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "switch";
};

export default function PressScale({
  children,
  onPress,
  style,
  disabled,
  accessibilityLabel,
  accessibilityRole = "button",
}: Props) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        if (!reduce) {
          scale.value = withSpring(0.97, { damping: 18, stiffness: 420, mass: 0.4 });
        }
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 380, mass: 0.4 });
      }}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}
