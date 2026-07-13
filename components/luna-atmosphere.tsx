import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useThemeContext } from "../contexts/theme-context";

export function LunaAtmosphere() {
  const { atmosphere, material, motion, isDark } = useThemeContext();
  const { backgroundBase, primaryField, secondaryField, tertiaryField, bloomColor, bloomIntensity, vignetteColor, vignetteIntensity } = atmosphere;
  const { grainOpacity, scanlineOpacity } = material;

  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: motion.breathDuration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: motion.breathDuration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => { breath.value = 0; };
  }, [motion.breathDuration, breath]);

  const atmosphereStyle = useAnimatedStyle(() => ({
    opacity: 0.85 + breath.value * motion.breathIntensity,
  }));

  const tint = isDark ? "#ffffff" : "#000000";

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: backgroundBase }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, atmosphereStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="atm-primary" cx={`${primaryField.positionX}%`} cy={`${primaryField.positionY}%`} r={`${primaryField.radius}%`}>
              <Stop offset="0%" stopColor={primaryField.color} stopOpacity={primaryField.opacity} />
              <Stop offset="100%" stopColor={primaryField.color} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="atm-secondary" cx={`${secondaryField.positionX}%`} cy={`${secondaryField.positionY}%`} r={`${secondaryField.radius}%`}>
              <Stop offset="0%" stopColor={secondaryField.color} stopOpacity={secondaryField.opacity} />
              <Stop offset="100%" stopColor={secondaryField.color} stopOpacity={0} />
            </RadialGradient>
            {tertiaryField && (
              <RadialGradient id="atm-tertiary" cx={`${tertiaryField.positionX}%`} cy={`${tertiaryField.positionY}%`} r={`${tertiaryField.radius}%`}>
                <Stop offset="0%" stopColor={tertiaryField.color} stopOpacity={tertiaryField.opacity} />
                <Stop offset="100%" stopColor={tertiaryField.color} stopOpacity={0} />
              </RadialGradient>
            )}
            <RadialGradient id="atm-bloom" cx={`${primaryField.positionX}%`} cy={`${primaryField.positionY}%`} r="60%">
              <Stop offset="0%" stopColor={bloomColor} stopOpacity={bloomIntensity} />
              <Stop offset="100%" stopColor={bloomColor} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="atm-vignette" cx="50%" cy="50%" r="75%">
              <Stop offset="0%" stopColor={vignetteColor} stopOpacity={0} />
              <Stop offset="100%" stopColor={vignetteColor} stopOpacity={vignetteIntensity} />
            </RadialGradient>
            {grainOpacity > 0 && (
              <Pattern id="atm-grain" width={4} height={4} patternUnits="userSpaceOnUse">
                <Circle cx={1} cy={1} r={0.4} opacity={0.5} fill={tint} />
                <Circle cx={3} cy={3} r={0.3} opacity={0.35} fill={tint} />
                <Circle cx={3} cy={1} r={0.2} opacity={0.4} fill={tint} />
                <Circle cx={1} cy={3} r={0.25} opacity={0.3} fill={tint} />
              </Pattern>
            )}
            {scanlineOpacity > 0 && (
              <Pattern id="atm-scanlines" width={2} height={3} patternUnits="userSpaceOnUse">
                <Rect width={2} height={1} fill={tint} opacity={0.12} />
              </Pattern>
            )}
          </Defs>
          <Rect width="100%" height="100%" fill="url(#atm-primary)" />
          <Rect width="100%" height="100%" fill="url(#atm-secondary)" />
          {tertiaryField && <Rect width="100%" height="100%" fill="url(#atm-tertiary)" />}
          <Rect width="100%" height="100%" fill="url(#atm-bloom)" />
          <Rect width="100%" height="100%" fill="url(#atm-vignette)" />
          {grainOpacity > 0 && <Rect width="100%" height="100%" fill="url(#atm-grain)" opacity={grainOpacity} />}
          {scanlineOpacity > 0 && <Rect width="100%" height="100%" fill="url(#atm-scanlines)" opacity={scanlineOpacity} />}
        </Svg>
      </Animated.View>
    </View>
  );
}
