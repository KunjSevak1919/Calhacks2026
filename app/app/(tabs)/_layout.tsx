import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, type } from "../../theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

function icon(focused: boolean, name: IoniconsName, outlineName: IoniconsName, color: string) {
  return (
    <Ionicons
      name={focused ? name : outlineName}
      size={22}
      color={focused ? color : colors.muted}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: font.label,
          fontFamily: type.uiSemi,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Wallet",
          tabBarIcon: ({ focused }) =>
            icon(focused, "wallet", "wallet-outline", colors.text),
        }}
      />
      <Tabs.Screen
        name="pick"
        options={{
          title: "Pick Card",
          tabBarIcon: ({ focused }) =>
            icon(focused, "card", "card-outline", colors.text),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ focused }) =>
            icon(focused, "notifications", "notifications-outline", colors.text),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarIcon: ({ focused }) =>
            icon(focused, "chatbubble-ellipses", "chatbubble-ellipses-outline", colors.coach),
          tabBarActiveTintColor: colors.coach,
        }}
      />
      <Tabs.Screen
        name="visa"
        options={{
          title: "One Card",
          tabBarIcon: ({ focused }) =>
            icon(focused, "flash", "flash-outline", colors.warn),
          tabBarActiveTintColor: colors.warn,
        }}
      />
    </Tabs>
  );
}
