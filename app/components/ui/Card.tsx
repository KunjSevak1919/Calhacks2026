import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { colors, radius, shadow } from "../../theme";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Colored left border accent (pass a CSS color string) */
  accent?: string;
};

export default function Card({ children, style, accent }: Props) {
  return (
    <View
      style={[
        styles.card,
        accent != null && { borderLeftWidth: 3, borderLeftColor: accent },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    ...shadow.soft,
  },
});
