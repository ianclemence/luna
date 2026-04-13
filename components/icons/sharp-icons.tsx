import React from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { Colors, Strokes } from "../../constants/theme";
import { useColorScheme } from "../../hooks/use-color-scheme";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const PlayIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const fillColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 4L20 12L6 20V4Z"
        fill={fillColor}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const PauseIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const fillColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="5"
        y="4"
        width="5"
        height="16"
        fill={fillColor}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="14"
        y="4"
        width="5"
        height="16"
        fill={fillColor}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const SkipForwardIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const fillColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4L15 12L5 20V4Z"
        fill={fillColor}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="17"
        y="4"
        width="3"
        height="16"
        fill={fillColor}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const SkipBackIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const fillColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 4L9 12L19 20V4Z"
        fill={fillColor}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="4"
        y="4"
        width="3"
        height="16"
        fill={fillColor}
        stroke={fillColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const HeartIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21L10.55 19.7C5.4 15.1 2 12.1 2 8.5C2 5.4 4.42 3 7.5 3C9.24 3 10.91 3.8 12 5.08C13.09 3.8 14.76 3 16.5 3C19.58 3 22 5.4 22 8.5C22 12.1 18.6 15.1 13.45 19.7L12 21Z"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
        fill="none"
      />
    </Svg>
  );
};

export const HeartFilledIcon = ({ size = 24, color }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const fillColor = color || Colors[colorScheme].accent;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21L10.55 19.7C5.4 15.1 2 12.1 2 8.5C2 5.4 4.42 3 7.5 3C9.24 3 10.91 3.8 12 5.08C13.09 3.8 14.76 3 16.5 3C19.58 3 22 5.4 22 8.5C22 12.1 18.6 15.1 13.45 19.7L12 21Z"
        fill={fillColor}
      />
    </Svg>
  );
};

export const ShuffleIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 3H21V8"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M4 20L21 3"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M21 16V21H16"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M15 15L21 21"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M4 4L10 10"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const RepeatIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 1L21 5L17 9"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M3 11V9C3 7.9 3.9 7 5 7H21"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M7 23L3 19L7 15"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M21 13V15C21 16.1 20.1 17 19 17H3"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const ChevronRightIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6L15 12L9 18"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const ChevronLeftIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6L9 12L15 18"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const ListIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="4"
        y="4"
        width="4"
        height="4"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="4"
        y="10"
        width="4"
        height="4"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="4"
        y="16"
        width="4"
        height="4"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Path
        d="M12 6H20"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
      />
      <Path
        d="M12 12H20"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
      />
      <Path
        d="M12 18H20"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
      />
    </Svg>
  );
};

export const GridIcon = ({ size = 24, color, strokeWidth = Strokes.thin }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].text;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3"
        y="3"
        width="7"
        height="7"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="14"
        y="3"
        width="7"
        height="7"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="3"
        y="14"
        width="7"
        height="7"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <Rect
        x="14"
        y="14"
        width="7"
        height="7"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const ZigzagDivider = ({ size = 24, color }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].accent;

  return (
    <Svg width="100%" height={size} viewBox="0 0 100 10" preserveAspectRatio="none">
      <Path
        d="M0 5 L10 0 L20 5 L30 0 L40 5 L50 0 L60 5 L70 0 L80 5 L90 0 L100 5"
        stroke={strokeColor}
        strokeWidth="2"
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
};

export const DiamondPattern = ({ size = 24, color }: IconProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const strokeColor = color || Colors[colorScheme].accent;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L22 12L12 22L2 12Z"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinejoin="miter"
        fill="none"
      />
      <Path
        d="M12 6L18 12L12 18L6 12Z"
        stroke={strokeColor}
        strokeWidth="1"
        strokeLinejoin="miter"
        fill="none"
        opacity="0.5"
      />
    </Svg>
  );
};
