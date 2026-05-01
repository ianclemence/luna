import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Colors } from "../../constants/theme";

export default function TabLayout() {
  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
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
