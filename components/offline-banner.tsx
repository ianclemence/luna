import React, { useEffect, useState } from "react";
import { StyleSheet, Animated, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { WifiOff } from "lucide-react-native";
import { Spacing, Fonts } from "../constants/theme";
import { ThemedText } from "./themed-text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(false);
  const insets = useSafeAreaInsets();
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false;
      setIsOffline(offline);
      
      Animated.timing(animatedValue, {
        toValue: offline ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    return () => unsubscribe();
  }, [animatedValue]);

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 0],
  });

  if (!isOffline && animatedValue === (0 as any)) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: "#FF4B4B",
          paddingTop: insets.top + Spacing.xs,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.content}>
        <WifiOff size={16} color="white" style={styles.icon} />
        <ThemedText style={styles.text}>OFFLINE MODE • PLAYING FROM LOCAL STORAGE</ThemedText>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: Spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: Spacing.sm,
  },
  text: {
    color: "white",
    fontSize: 10,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
  },
});
