import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { useColorScheme } from '@/components/useColorScheme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    async function registerPush() {
      try {
        const settings = await Notifications.getPermissionsAsync();
        if (!settings.granted) {
          const req = await Notifications.requestPermissionsAsync();
          if (!req.granted) return;
        }
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        await SecureStore.setItemAsync("expoPushToken", token);

        // Best-effort: upload token to the backend.
        // Requires an authenticated user session; if auth isn't available yet, we silently skip.
        try {
          const { geoFetch } = await import("@/lib/api");
          await geoFetch("/v1/users/push-token", {
            method: "POST",
            body: JSON.stringify({ expoPushToken: token }),
          });
        } catch {
          // ignore
        }
      } catch {
        // Non-fatal: app should still work without push notifications.
      }
    }
    registerPush();
  }, []);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowList: true,
      }),
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const signalId = response?.notification?.request?.content?.data?.signalId;
      if (signalId) {
        router.push(`/event/${signalId}` as any);
      }
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
