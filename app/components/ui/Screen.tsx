import React from "react";
import {
  ScrollView,
  RefreshControl,
  StyleProp,
  ViewStyle,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme";

type Props = {
  children: React.ReactNode;
  /** Pull-to-refresh — pass `refreshing` and `onRefresh` together */
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Extra style applied to the inner scroll content container */
  contentStyle?: StyleProp<ViewStyle>;
  /** Skip the ScrollView wrapper (for screens with their own FlatList) */
  noScroll?: boolean;
};

export default function Screen({
  children,
  refreshing,
  onRefresh,
  style,
  contentStyle,
  noScroll,
}: Props) {
  if (noScroll) {
    return (
      <SafeAreaView style={[styles.safe, style]} edges={["top"]}>
        {children}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, style]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        refreshControl={
          onRefresh != null ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.good}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
});
