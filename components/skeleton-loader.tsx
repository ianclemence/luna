import React, { useEffect } from "react";
import { DimensionValue, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "../hooks/use-color-scheme";

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

export const Skeleton = ({
  width,
  height,
  borderRadius,
  style,
}: SkeletonProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const skeletonColor = colorScheme === "dark" ? "#2A2A2A" : "#E1E2D3";

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width || "100%",
          height: height || 20,
          borderRadius: borderRadius || 0,
          backgroundColor: skeletonColor,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

export const TrackSkeleton = () => (
  <View style={styles.trackSkeleton}>
    <Skeleton width={48} height={48} borderRadius={0} />
    <View style={styles.trackDetails}>
      <Skeleton width="60%" height={14} style={{ marginBottom: 8 }} />
      <Skeleton width="40%" height={10} />
    </View>
  </View>
);

export const GridSkeleton = () => (
  <View style={styles.gridSkeleton}>
    <Skeleton width="100%" height={160} borderRadius={0} />
    <Skeleton
      width="80%"
      height={14}
      style={{ marginTop: 12, marginBottom: 6 }}
    />
    <Skeleton width="50%" height={10} />
  </View>
);

export const HeroSkeleton = () => (
  <View style={styles.heroSkeleton}>
    <Skeleton width={200} height={200} borderRadius={0} />
    <Skeleton
      width="70%"
      height={24}
      style={{ marginTop: 24, marginBottom: 12 }}
    />
    <Skeleton width="40%" height={16} />
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    width: "100%",
    height: "100%",
  },
  trackSkeleton: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  trackDetails: {
    marginLeft: 12,
    flex: 1,
  },
  gridSkeleton: {
    width: "47%",
    marginBottom: 24,
  },
  heroSkeleton: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
});
