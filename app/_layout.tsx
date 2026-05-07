import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_900Black } from "@expo-google-fonts/inter/900Black";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import {
    DarkTheme,
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
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors.background }}
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
    Inter_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    setAppReady(true);
    audioPlayer.init().catch((e) => {
      console.warn(e);
    });

    return () => {
      audioPlayer.cleanup().catch((e) => {
        console.warn("Failed to cleanup audio player:", e);
      });
    };
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

  // Dark theme only — Tactical Telemetry CRT Terminal
  const navigationTheme = React.useMemo(() => {
    return {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: Colors.tint,
        background: Colors.background,
        card: Colors.background,
        text: Colors.text,
        border: Colors.border,
        notification: Colors.tint,
      },
    };
  }, []);

  if (!fontsLoaded || !appReady) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <BottomSheetProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: Colors.background,
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </BottomSheetProvider>
      <OfflineBanner />
      <Toast />
      <StatusBar style="light" />
    </NavigationThemeProvider>
  );
}
