import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import {
  Fonts,
  FontSizes,
  Palette,
  Radii,
  Shadows,
  Spacing,
  Strokes,
} from "../../constants/theme";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  onHide: () => void;
}

export function Toast({ message, type = "success", onHide }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onHide();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onHide]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return "check-circle";
      case "error":
        return "error";
      case "info":
        return "info";
    }
  };

  const getColors = () => {
    switch (type) {
      case "success":
        return { bg: Palette.pastelGreen, text: Palette.success };
      case "error":
        return { bg: "#FFEBEB", text: Palette.error };
      case "info":
        return { bg: Palette.pastelBlue, text: "#1967D2" };
    }
  };

  const colors = getColors();

  return (
    <Animated.View
      entering={FadeInUp.springify()}
      exiting={FadeOutUp}
      style={[styles.container, { backgroundColor: colors.bg }]}
    >
      <MaterialIcons name={getIcon() as any} size={24} color={colors.text} />
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: Spacing.xl,
    right: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radii.card,
    borderWidth: Strokes.regular,
    borderColor: "#000000",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    ...Shadows.brutalist,
    zIndex: 1000,
    elevation: 10,
  },
  text: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    flex: 1,
  },
});
