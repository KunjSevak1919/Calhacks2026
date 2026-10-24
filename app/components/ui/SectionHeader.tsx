import React from "react";
import { Text, StyleSheet, StyleProp, TextStyle, View, ViewStyle } from "react-native";
import { colors, font, type, spacing } from "../../theme";

type Props = {
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function SectionHeader({ label, style, textStyle }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.text, textStyle]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  text: {
    color: colors.muted,
    fontSize: font.label,
    fontFamily: type.uiMedium,
    letterSpacing: 0.8,
  },
});
