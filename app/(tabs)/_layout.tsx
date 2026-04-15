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
