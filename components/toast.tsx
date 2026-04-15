import React, { useEffect, useState } from "react";
import { StyleSheet, Animated, View, Dimensions } from "react-native";
import { CheckCircle2, AlertCircle, Info } from "lucide-react-native";
import { Colors, Spacing, Fonts, Radii, Strokes, Palette } from "../constants/theme";
import { useColorScheme } from "../hooks/use-color-scheme";
import { ThemedText } from "./themed-text";
import { toastStore, ToastType } from "../services/toast-store";

const { width } = Dimensions.get("window");

export const Toast = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = toastStore.subscribe((state) => {
      if (state.visible) {
        setMessage(state.message);
        setType(state.type);
        setVisible(true);
        Animated.spring(animatedValue, {
          toValue: 1,
          useNativeDriver: true,
          tension: 40,
          friction: 7,
        }).start();
      } else {
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [animatedValue]);

  if (!visible) return null;

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={16} color={Palette.black} />;
      case "error":
        return <AlertCircle size={16} color={Palette.error} />;
      default:
        return <Info size={16} color={Palette.black} />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case "success":
        return Palette.green;
      case "error":
        return Palette.pink;
      default:
        return Palette.blue;
    }
  };

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [150, 0],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: Palette.black,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.content}>
        {getIcon()}
        <ThemedText style={styles.text}>{message.toUpperCase()}</ThemedText>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 120, // Above bottom player
    alignSelf: "center",
    maxWidth: width - 48,
    borderWidth: 2,
    borderRadius: Radii.m,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    zIndex: 10000,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  text: {
    color: Palette.black,
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
});
