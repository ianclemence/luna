import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { PlayfairDisplay_500Medium } from "@expo-google-fonts/playfair-display/500Medium";
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display/700Bold";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Colors } from "../constants/theme";
import { ThemeProvider } from "../contexts/theme-context";
import { BottomSheetProvider } from "../hooks/bottom-sheet-store";
import { useColorScheme } from "../hooks/use-color-scheme";
import { audioPlayer } from "../services/audio-player";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore error */
});

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: "transparent" }}
      >
        <ThemeProvider>
          <RootLayoutContent />
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function RootLayoutContent() {
  const [appReady, setAppReady] = useState(false);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        await audioPlayer.init();
      } catch (e) {
        console.warn(e);
      } finally {
        setAppReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (fontsLoaded && appReady) {
      SplashScreen.hideAsync().catch(() => {
        /* ignore error */
      });
    }
  }, [fontsLoaded, appReady]);

  const colorScheme = useColorScheme();

  // Create dynamic navigation theme based on current color scheme
  const navigationTheme = React.useMemo(() => {
    return colorScheme === "dark"
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            primary: Colors.dark.tint,
            background: Colors.dark.background,
            card: Colors.dark.background,
            text: Colors.dark.text,
            border: Colors.dark.border,
            notification: Colors.dark.tint,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            primary: Colors.light.tint,
            background: Colors.light.background,
            card: Colors.light.background,
            text: Colors.light.text,
            border: Colors.light.border,
            notification: Colors.light.tint,
          },
        };
  }, [colorScheme]);

  if (!fontsLoaded || !appReady) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <BottomSheetProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: Colors[colorScheme].background,
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="player/index"
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", headerShown: true }}
          />
        </Stack>
      </BottomSheetProvider>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}
