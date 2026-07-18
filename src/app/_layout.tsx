import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';

import { AppDataProvider, useAppData } from '@/providers/app-data-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { LaunchScreen } from '@/components/launch-screen';
import { getNotificationWordTarget } from '@/features/reminders/notification-navigation';
import { palette } from '@/theme/tokens';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
  SplashScreen.setOptions({ duration: 200, fade: true });
}

function NotificationObserver() {
  const { noteNotificationOpen } = useAppData();
  const handledNotificationIds = useRef(new Set<string>());
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const redirect = (notification: Notifications.Notification) => {
      const notificationId = notification.request.identifier;
      if (handledNotificationIds.current.has(notificationId)) return;
      handledNotificationIds.current.add(notificationId);
      const target = getNotificationWordTarget(notification);
      void noteNotificationOpen(target?.wordId ?? null);
      if (target) router.push(target.href);
      Notifications.clearLastNotificationResponse();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => redirect(response.notification));
    return () => subscription.remove();
  }, [noteNotificationOpen]);
  return null;
}

function Navigation() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {Platform.OS === 'web' ? null : <NotificationObserver />}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colorScheme === 'dark' ? palette.dark.canvas : palette.light.canvas } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding-ready" options={{ gestureEnabled: false }} />
        <Stack.Screen name="preferences" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal' }} />
        <Stack.Screen name="word/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="word/[id]" />
        <Stack.Screen name="level/[level]" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Inter_400Regular, Inter_600SemiBold });
  return <AuthProvider><AppDataProvider><AppReadyGate fontsLoaded={fontsLoaded}/></AppDataProvider></AuthProvider>;
}

function AppReadyGate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { onboardingComplete } = useAppData();
  const [releaseLaunch, setReleaseLaunch] = useState(false);
  const [showLaunch, setShowLaunch] = useState(true);
  const ready = fontsLoaded && onboardingComplete !== null;
  const nativeSplashHidden = useRef(false);
  const finishLaunch = useCallback(() => setShowLaunch(false), []);

  useEffect(() => {
    if (!ready || nativeSplashHidden.current) return;
    nativeSplashHidden.current = true;
    if (Platform.OS === 'web') {
      void Promise.resolve().then(() => setReleaseLaunch(true));
      return;
    }
    void SplashScreen.hideAsync().catch(() => undefined).finally(() => setReleaseLaunch(true));
  }, [ready]);

  return (
    <View style={styles.root}>
      {ready ? <Navigation /> : null}
      {showLaunch ? <LaunchScreen ready={releaseLaunch} onFinish={finishLaunch}/> : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: palette.light.canvas } });
