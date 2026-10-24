import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "../../theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

function icon(focused: boolean, name: IoniconsName, outlineName: IoniconsName) {
  return <Ionicons name={focused ? name : outlineName} size={22} color={focused ? colors.mint : colors.muted} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
        },
        tabBarActiveTintColor: colors.mint,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: font.xs, fontWeight: "600", marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Wallet",
          tabBarIcon: ({ focused }) => icon(focused, "wallet", "wallet-outline"),
        }}
      />
      <Tabs.Screen
        name="pick"
        options={{
          title: "Pick Card",
          tabBarIcon: ({ focused }) => icon(focused, "card", "card-outline"),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ focused }) => icon(focused, "notifications", "notifications-outline"),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
              size={22}
              color={focused ? colors.blue : colors.muted}
            />
          ),
          tabBarActiveTintColor: colors.blue,
        }}
      />
    </Tabs>
  );
}
