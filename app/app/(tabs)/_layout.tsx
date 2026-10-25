import { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../ThemeContext";
import { font, type, shadow } from "../../theme";
import { api } from "../../api";

type IoniconsName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  focused,
  name,
  outlineName,
  activeColor,
  inactiveColor,
}: {
  focused: boolean;
  name: IoniconsName;
  outlineName: IoniconsName;
  activeColor: string;
  inactiveColor: string;
}) {
  return (
    <Ionicons
      name={focused ? name : outlineName}
      size={22}
      color={focused ? activeColor : inactiveColor}
    />
  );
}

function AlertsTabIcon({
  focused,
  activeColor,
  inactiveColor,
  badge,
  badgeColor,
}: {
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
  badge: number;
  badgeColor: string;
}) {
  return (
    <View>
      <Ionicons
        name={focused ? "notifications" : "notifications-outline"}
        size={22}
        color={focused ? activeColor : inactiveColor}
      />
      {badge > 0 && (
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </View>
  );
}

// The pill tab bar is ~406px wide (430 – 12 margin on each side).
// On desktop, keep it centered instead of letting it stretch edge-to-edge.
const PILL_WIDTH = 406;

export default function TabLayout() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    api.notifications()
      .then((list) => setNotifCount(list.length))
      .catch(() => {});
  }, []);

  const isDesktop = width >= 900;
  const hMargin = isDesktop ? Math.max(12, (width - PILL_WIDTH) / 2) : 12;

  const tabBarStyle = {
    position: "absolute" as const,
    bottom: 12,
    left: hMargin,
    right: hMargin,
    height: 68,
    borderRadius: 28,
    backgroundColor: colors.tabBarBackground,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    borderWidth: 1,
    borderColor: colors.tabBarBorder,
    ...shadow.stack,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontFamily: type.uiBold,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Wallet",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name="wallet"
              outlineName="wallet-outline"
              activeColor={colors.accent}
              inactiveColor={colors.tabInactive}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pick"
        options={{
          title: "Pay",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name="flash"
              outlineName="flash-outline"
              activeColor={colors.accent}
              inactiveColor={colors.tabInactive}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="visa"
        options={{
          title: "One Card",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name="card"
              outlineName="card-outline"
              activeColor={colors.accent}
              inactiveColor={colors.tabInactive}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ focused }) => (
            <AlertsTabIcon
              focused={focused}
              activeColor={colors.accent}
              inactiveColor={colors.tabInactive}
              badge={notifCount}
              badgeColor={colors.error}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Ask",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name="chatbubble-ellipses"
              outlineName="chatbubble-ellipses-outline"
              activeColor={colors.accent}
              inactiveColor={colors.tabInactive}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: font.xs,
    fontFamily: type.uiBold,
    lineHeight: 17,
  },
});
