import { StyleSheet, Text, type TextProps } from 'react-native';
import { FontSizes, FontLineHeights, Palette, Fonts } from '../constants/theme';
import { useThemeColor } from '../hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'phrase';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        type === 'phrase' ? styles.phrase : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    fontFamily: Fonts.regular,
  },
  defaultSemiBold: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    fontFamily: Fonts.semiBold,
  },
  title: {
    fontSize: FontSizes.h2,
    lineHeight: FontLineHeights.h2,
    fontFamily: Fonts.displayBold,
  },
  subtitle: {
    fontSize: FontSizes.h3,
    lineHeight: FontLineHeights.h3,
    fontFamily: Fonts.bold,
  },
  link: {
    fontSize: FontSizes.body,
    lineHeight: FontLineHeights.body,
    color: Palette.blue,
    fontFamily: Fonts.bold,
  },
  phrase: {
    fontSize: FontSizes.phrase,
    lineHeight: FontLineHeights.phrase,
    fontFamily: Fonts.displayMedium,
  },
});
