import { Tabs } from "expo-router";
import { Home, Library, Search } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import { HapticTab } from "../../components/haptic-tab";
import { PlayerBar } from "../../components/player-bar";
import { Colors, Fonts, Strokes } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.muted,
          tabBarButton: HapticTab,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: Strokes.hairline,
            borderTopColor: colors.border,
            elevation: 0,
            height: 80,
            paddingBottom: 20,
            paddingTop: 8,
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
          },
          tabBarHideOnKeyboard: false,
          tabBarLabelStyle: {
            fontFamily: Fonts.bold,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1.2,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <Home size={24} color={color} strokeWidth={Strokes.regular} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color }) => (
              <Search size={24} color={color} strokeWidth={Strokes.regular} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ color }) => (
              <Library size={24} color={color} strokeWidth={Strokes.regular} />
            ),
          }}
        />
        <Tabs.Screen
          name="album/[id]"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="playlist/[id]"
          options={{
            href: null,
          }}
        />
      </Tabs>
      <PlayerBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
