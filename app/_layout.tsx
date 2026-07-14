// ─── Tactical fonts (existing) ───────────────────────────────────
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_900Black } from "@expo-google-fonts/inter/900Black";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";

// ─── Field Journal fonts ─────────────────────────────────────────
import { Kalam_400Regular } from "@expo-google-fonts/kalam/400Regular";
import { Kalam_700Bold } from "@expo-google-fonts/kalam/700Bold";
import { CrimsonPro_700Bold } from "@expo-google-fonts/crimson-pro/700Bold";
import { CrimsonPro_800ExtraBold } from "@expo-google-fonts/crimson-pro/800ExtraBold";
import { CourierPrime_400Regular } from "@expo-google-fonts/courier-prime/400Regular";
import { CourierPrime_700Bold } from "@expo-google-fonts/courier-prime/700Bold";

// ─── Afternoon Drive fonts ───────────────────────────────────────
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display/700Bold";
import { PlayfairDisplay_900Black } from "@expo-google-fonts/playfair-display/900Black";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono/600SemiBold";

// ─── Midnight Radio fonts ────────────────────────────────────────
import { SpaceGrotesk_400Regular } from "@expo-google-fonts/space-grotesk/400Regular";
import { SpaceGrotesk_500Medium } from "@expo-google-fonts/space-grotesk/500Medium";
import { SpaceGrotesk_600SemiBold } from "@expo-google-fonts/space-grotesk/600SemiBold";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk/700Bold";
import { CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond/600SemiBold";
import { CormorantGaramond_700Bold } from "@expo-google-fonts/cormorant-garamond/700Bold";

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

import { ThemeProvider, useThemeContext } from "../contexts/theme-context";
import { OfflineBanner } from "../components/offline-banner";
import { Toast } from "../components/toast";
import { BottomSheetProvider } from "../hooks/bottom-sheet-store";
import { audioPlayer } from "../services/audio-player";
import { musicService } from "../services/music-service";
import { tidalAuth } from "../services/tidal-oauth";

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
  const [appReady, setAppReady] = useState(false);
  const backgroundTaskInitialized = useRef(false);
  const [fontsLoaded] = useFonts({
    // Tactical
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    // Field Journal
    Kalam_400Regular,
    Kalam_700Bold,
    CrimsonPro_700Bold,
    CrimsonPro_800ExtraBold,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
    // Afternoon Drive
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
    // Midnight Radio
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
  });

  useEffect(() => {
    setAppReady(true);
    audioPlayer.init().catch((e) => {
      console.warn(e);
    });
    tidalAuth.initialize().catch((e) => {
      console.warn('[TidalAuth] Init failed:', e);
    });
    musicService.autoMigrateTidalIfNeeded().catch((e) => {
      console.warn('[Migration] Auto-migrate failed:', e);
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

  if (!fontsLoaded || !appReady) return null;

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
        </BottomSheetProvider>
        <OfflineBanner />
        <Toast />
        <StatusBar style={isDark ? "light" : "dark"} />
      </GestureHandlerRootView>
    </NavigationThemeProvider>
  );
}
