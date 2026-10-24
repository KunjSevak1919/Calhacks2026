/**
 * Money — safe dollar-amount display.
 * Shows "—" for null / undefined / NaN.
 * Uses IBM Plex Mono; defaults to hero size (32).
 */
import React, { useEffect, useState } from "react";
import { Text, StyleProp, TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { colors, font, type } from "../../theme";

type Props = {
  value: number | null | undefined;
  /** Animate from 0 to value on mount / value change */
  countUp?: boolean;
  /** Prepended before the formatted amount, e.g. "+" */
  prefix?: string;
  style?: StyleProp<TextStyle>;
};

function fmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export default function Money({ value, countUp, prefix = "", style }: Props) {
  const reduce = useReducedMotion();
  const target = value != null && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState<number | null>(
    countUp && !reduce ? (target != null ? 0 : null) : target
  );

  useEffect(() => {
    if (target == null) { setShown(null); return; }
    if (!countUp || reduce) { setShown(target); return; }
    setShown(0);
    const start = performance.now();
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, countUp, reduce]);

  return (
    <Text
      style={[
        { fontFamily: type.monoBold, fontSize: font.hero, color: colors.text },
        style,
      ]}
    >
      {prefix}{fmt(shown)}
    </Text>
  );
}
