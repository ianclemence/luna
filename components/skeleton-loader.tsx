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
import { Colors, Radii } from "../constants/theme";
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
  const colors = Colors[colorScheme];
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const skeletonColor = (colors as any).skeleton || "rgba(0,0,0,0.08)";

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width || "100%",
          height: height || 20,
          borderRadius: borderRadius ?? Radii.xs,
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
    <Skeleton
      width={24}
      height={12}
      borderRadius={Radii.xs}
      style={{ marginRight: 12 }}
    />
    <View style={styles.trackDetails}>
      <Skeleton
        width="70%"
        height={14}
        borderRadius={Radii.xs}
        style={{ marginBottom: 6 }}
      />
      <Skeleton width="40%" height={10} borderRadius={Radii.xs} />
    </View>
    <Skeleton width={32} height={12} borderRadius={Radii.xs} />
  </View>
);

export const GridSkeleton = () => (
  <View style={styles.gridSkeleton}>
    <View style={styles.gridImageContainer}>
      <Skeleton width="100%" height="100%" borderRadius={Radii.sm} />
    </View>
    <Skeleton
      width="90%"
      height={14}
      borderRadius={Radii.xs}
      style={{ marginTop: 8, alignSelf: "center" }}
    />
  </View>
);

export const HeroSkeleton = ({ borderRadius }: { borderRadius?: number }) => (
  <View style={styles.heroSkeleton}>
    <View
      style={[
        styles.heroImageContainer,
        borderRadius !== undefined && { borderRadius },
      ]}
    >
      <Skeleton
        width={180}
        height={180}
        borderRadius={borderRadius ?? Radii.m}
      />
    </View>
    <Skeleton
      width="60%"
      height={24}
      borderRadius={Radii.sm}
      style={{ marginTop: 24, marginBottom: 12 }}
    />
    <Skeleton width="30%" height={16} borderRadius={Radii.xs} />
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    width: "100%",
    height: "100%",
  },
  trackSkeleton: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 0,
    alignItems: "center",
  },
  trackDetails: {
    flex: 1,
  },
  gridSkeleton: {
    width: "31%",
    marginBottom: 16,
  },
  gridImageContainer: {
    width: "100%",
    aspectRatio: 1,
  },
  heroSkeleton: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  heroImageContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
  },
});
