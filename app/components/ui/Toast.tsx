/**
 * Imperative toast — show via ref:
 *   const toast = useRef<ToastHandle>(null);
 *   toast.current?.show("Approved", "good");
 */
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  useReducedMotion,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, type, radius, spacing } from "../../theme";

type Variant = "good" | "warn" | "info";

export interface ToastHandle {
  show: (message: string, variant?: Variant) => void;
}

const ICON: Record<Variant, keyof typeof Ionicons.glyphMap> = {
  good: "checkmark-circle",
  warn: "warning",
  info: "information-circle",
};

const COLOR: Record<Variant, string> = {
  good: colors.good,
  warn: colors.warn,
  info: colors.coach,
};

const FILL: Record<Variant, string> = {
  good: colors.goodFill,
  warn: colors.warnFill,
  info: colors.coachFill,
};

const Toast = forwardRef<ToastHandle>(function Toast(_, ref) {
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<Variant>("good");
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const reduce = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    translateY.value = reduce
      ? -80
      : withTiming(-80, { duration: 220 });
    opacity.value = reduce
      ? 0
      : withTiming(0, { duration: 220 });
  };

  useImperativeHandle(ref, () => ({
    show(msg: string, v: Variant = "good") {
      if (timerRef.current) clearTimeout(timerRef.current);
      runOnJS(setMessage)(msg);
      runOnJS(setVariant)(v);
      translateY.value = reduce
        ? 0
        : withSpring(0, { damping: 16, stiffness: 200, mass: 0.6 });
      opacity.value = reduce ? 1 : withTiming(1, { duration: 160 });
      timerRef.current = setTimeout(() => {
        hide();
      }, 2200);
    },
  }));

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: FILL[variant], borderColor: COLOR[variant] + "44" },
        anim,
      ]}
      pointerEvents="none"
    >
      <Ionicons name={ICON[variant]} size={16} color={COLOR[variant]} />
      <Text style={[styles.text, { color: COLOR[variant] }]}>{message}</Text>
    </Animated.View>
  );
});

export default Toast;

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    zIndex: 200,
    // shadow
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  text: {
    fontSize: font.body,
    fontFamily: type.uiSemi,
    flex: 1,
  },
});
