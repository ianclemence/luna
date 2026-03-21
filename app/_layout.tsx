import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
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
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Colors } from "../constants/theme";
import { ThemeProvider } from "../contexts/theme-context";
import { OfflineBanner } from "../components/offline-banner";
import { Toast } from "../components/toast";
import { BottomSheetProvider } from "../hooks/bottom-sheet-store";
import { useColorScheme } from "../hooks/use-color-scheme";
import { audioPlayer } from "../services/audio-player";
import { musicService } from "../services/music-service";

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
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutInner() {
  const colorScheme = useColorScheme() ?? "light";

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors[colorScheme].background }}
    >
      <RootLayoutContent />
    </GestureHandlerRootView>
  );
}

function RootLayoutContent() {
  const [appReady, setAppReady] = useState(false);
  const backgroundTaskInitialized = useRef(false);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    setAppReady(true);
    audioPlayer.init().catch((e) => {
      console.warn(e);
    });
  }, []);

  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {
      /* ignore error */
    });
  }, [fontsLoaded]);

  useEffect(() => {
    if (!fontsLoaded || backgroundTaskInitialized.current) return;
    backgroundTaskInitialized.current = true;
    musicService.initBackgroundFetch().catch((error) => {
      console.warn("BackgroundTask registration failed:", error);
    });
  }, [fontsLoaded]);

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
      <OfflineBanner />
      <Toast />
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}
