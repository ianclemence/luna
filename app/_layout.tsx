// ─── Fonts ───────────────────────────────────────────────────────
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_900Black } from "@expo-google-fonts/inter/900Black";
import { CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond/600SemiBold";
import { CormorantGaramond_700Bold } from "@expo-google-fonts/cormorant-garamond/700Bold";

import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider as NavigationThemeProvider,
} from "expo-router/react-navigation";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, useThemeContext } from "../contexts/theme-context";
import { OfflineBanner } from "../components/offline-banner";
import { Toast } from "../components/toast";
import { BottomSheetProvider } from "../hooks/bottom-sheet-store";
import TurnstileWidget from "../components/turnstile-widget";
import { audioPlayer } from "../services/audio-player";
import { eqService } from "../services/eq-service";
import { musicService } from "../services/music-service";
import { tidalAuth } from "../services/tidal-oauth";
import { turnstileService } from "../services/turnstile-service";

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootLayoutContent />
    </GestureHandlerRootView>
  );
}

function RootLayoutContent() {
  const { colors, isDark } = useThemeContext();
  const [initRan, setInitRan] = useState(false);
  const backgroundTaskInitialized = useRef(false);
  const [fontsLoaded] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
  });

  useEffect(() => {
    Promise.resolve().then(() => setInitRan(true));
    audioPlayer.init().catch((e) => {
      console.warn(e);
    });
    tidalAuth.initialize().catch((e) => {
      console.warn('[TidalAuth] Init failed:', e);
    });
    turnstileService.init().catch((e) => {
      console.warn('[Turnstile] Init failed:', e);
    });
    eqService.init().catch((e) => {
      console.warn('[EQ] Init failed:', e);
    });

    return () => {
      turnstileService.destroy();
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

  const navigationTheme = React.useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.tint,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
        notification: colors.tint,
      },
    };
  }, [colors, isDark]);

  if (!fontsLoaded || !initRan) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <BottomSheetProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: colors.background,
              },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <TurnstileWidget />
        </BottomSheetProvider>
        <OfflineBanner />
        <Toast />
        <StatusBar style={isDark ? "light" : "dark"} />
      </GestureHandlerRootView>
    </NavigationThemeProvider>
  );
}
