import React from "react";
import { StyleSheet, View, Animated, Easing } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { Colors } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";

interface SyncIndicatorProps {
  isSyncing?: boolean;
  needsSync?: boolean;
  size?: number;
  color?: string;
}

export const SyncIndicator = ({
  isSyncing = false,
  needsSync = false,
  size = 16,
  color,
}: SyncIndicatorProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColors = Colors[colorScheme];
  const spinValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
      spinValue.stopAnimation();
    }
  }, [isSyncing, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (!isSyncing && !needsSync) return null;

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <RefreshCw
          size={size}
          color={color || (needsSync ? "#FF4B4B" : themeColors.icon)}
        />
      </Animated.View>
      {needsSync && !isSyncing && (
        <View style={[styles.dot, { backgroundColor: "#FF4B4B" }]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  dot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "white",
  },
});
