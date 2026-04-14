import { Tabs } from "expo-router";
import { Home, Library, Search } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Colors, Strokes } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Tabs
        screenOptions={{
          tabBarStyle: { display: "none" },
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
        <Tabs.Screen
          name="artist/[id]"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
