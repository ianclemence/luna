import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useThemeContext } from "../contexts/theme-context";

export type ToastType = "success" | "error" | "info";

interface ToastData {
  message: string;
  type: ToastType;
}

let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let setToastFn: ((data: ToastData | null) => void) | null = null;

export function showToast(message: string, type: ToastType = "info") {
  if (toastTimeout) clearTimeout(toastTimeout);
  setToastFn?.({ message, type });
  toastTimeout = setTimeout(() => {
    setToastFn?.(null);
  }, 2500);
}

export function Toast() {
  const { palette } = useThemeContext();
  const [toast, setToast] = React.useState<ToastData | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setToastFn = setToast;
    return () => {
      setToastFn = null;
    };
  }, []);

  useEffect(() => {
    if (toast) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [toast, opacity]);

  if (!toast && opacity.__getValue() === 0) return null;

  const bgColor =
    toast?.type === "success" ? palette.terminalGreen :
    toast?.type === "error" ? palette.accentBright :
    palette.compartment;

  const textColor =
    toast?.type === "success" ? palette.black :
    toast?.type === "error" ? palette.white :
    palette.white;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          backgroundColor: bgColor,
          borderColor: palette.border,
          shadowColor: "#000",
        },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {toast?.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  text: {
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
