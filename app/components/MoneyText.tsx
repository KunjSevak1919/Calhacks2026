import React, { useEffect, useState } from "react";
import { StyleProp, Text, TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { usd } from "../format";
import { colors, font, type } from "../theme";

type Props = {
  value: number | undefined | null;
  style?: StyleProp<TextStyle>;
  countUp?: boolean;
  prefix?: string;
};

export default function MoneyText({ value, style, countUp, prefix = "" }: Props) {
  const reduce = useReducedMotion();
  const target = value != null && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState(countUp && !reduce ? 0 : target);

  useEffect(() => {
    if (target == null) {
      setShown(null);
      return;
    }
    if (!countUp || reduce) {
      setShown(target);
      return;
    }
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
    <Text style={[{ fontFamily: type.monoBold, fontSize: font.hero, color: colors.text }, style]}>
      {prefix}
      {usd(shown)}
    </Text>
  );
}
