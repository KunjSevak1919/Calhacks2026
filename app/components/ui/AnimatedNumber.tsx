import React, { useEffect, useState } from "react";
import { Text, StyleProp, TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { colors, font, type } from "../../theme";

type Props = {
  value: number | null | undefined;
  /** Decimal places — default 0 */
  decimals?: number;
  suffix?: string;
  prefix?: string;
  countUp?: boolean;
  style?: StyleProp<TextStyle>;
};

export default function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  countUp,
  style,
}: Props) {
  const reduce = useReducedMotion();
  const target = value != null && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState(countUp && !reduce ? 0 : target);

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

  const display =
    shown == null ? "—" : `${prefix}${shown.toFixed(decimals)}${suffix}`;

  return (
    <Text
      style={[
        { fontFamily: type.mono, fontSize: font.body, color: colors.text },
        style,
      ]}
    >
      {display}
    </Text>
  );
}
