import { Pressable } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeMode } from "../../ThemeContext";
import { font, type } from "../../theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

function tabIcon(
  focused: boolean,
  name: IoniconsName,
  outlineName: IoniconsName,
  activeColor: string,
  inactiveColor: string
) {
  return (
    <Ionicons
      name={focused ? name : outlineName}
      size={22}
      color={focused ? activeColor : inactiveColor}
    />
  );
}

const THEME_CYCLE: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const THEME_ICON: Record<ThemeMode, IoniconsName> = {
  system: "phone-portrait-outline",
  light: "sunny-outline",
  dark: "moon-outline",
};

export default function TabLayout() {
  const { colors, themeMode, setTheme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: font.label,
          fontFamily: type.uiSemi,
          marginTop: 2,
        },
        headerStyle: { backgroundColor: colors.tabBarBackground },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: type.uiBold, fontSize: font.title },
        headerRight: () => (
          <Pressable
            onPress={() => setTheme(THEME_CYCLE[themeMode])}
            hitSlop={12}
            style={{ marginRight: 16 }}
            accessibilityLabel={`Switch theme (current: ${themeMode})`}
          >
            <Ionicons
              name={THEME_ICON[themeMode]}
              size={22}
              color={colors.muted}
            />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Wallet",
          tabBarIcon: ({ focused }) =>
            tabIcon(focused, "wallet", "wallet-outline", colors.text, colors.tabInactive),
        }}
      />
      <Tabs.Screen
        name="pick"
        options={{
          title: "Pick Card",
          tabBarIcon: ({ focused }) =>
            tabIcon(focused, "card", "card-outline", colors.text, colors.tabInactive),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ focused }) =>
            tabIcon(focused, "notifications", "notifications-outline", colors.text, colors.tabInactive),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarActiveTintColor: colors.coach,
          tabBarIcon: ({ focused }) =>
            tabIcon(focused, "chatbubble-ellipses", "chatbubble-ellipses-outline", colors.coach, colors.tabInactive),
        }}
      />
      <Tabs.Screen
        name="visa"
        options={{
          title: "One Card",
          tabBarActiveTintColor: colors.warn,
          tabBarIcon: ({ focused }) =>
            tabIcon(focused, "flash", "flash-outline", colors.warn, colors.tabInactive),
        }}
      />
    </Tabs>
  );
}
