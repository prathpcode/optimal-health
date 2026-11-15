import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CelebrationLayer } from '@/components/Celebration';
import { BackendProvider } from '@/lib/backend';
import { usePresenceHeartbeat } from '@/lib/community';
import { onPhoto, useTheme } from '@/theme';

export const unstable_settings = { anchor: '(tabs)' };

/** Tells the backend you have the app open, so rooms can show who's online (live mode only). */
function Presence() {
  usePresenceHeartbeat();
  return null;
}

export default function RootLayout() {
  const { c, dark } = useTheme();
  const [fontsLoaded, fontsError] = useFonts({ 'Geist-Regular': require('@/assets/fonts/Geist-Regular.ttf'), 'Geist-SemiBold': require('@/assets/fonts/Geist-SemiBold.ttf') });
  const base = dark ? DarkTheme : DefaultTheme;
  const sheet = (detents: number[]) =>
    ({
      presentation: 'formSheet',
      sheetAllowedDetents: detents,
      sheetInitialDetentIndex: 0,
      sheetGrabberVisible: true,
      sheetCornerRadius: 28,
      contentStyle: { backgroundColor: c.card },
    }) as const;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.card, text: c.text, primary: c.text, border: c.hairline } };

  if (!fontsLoaded && !fontsError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <BackendProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="profile" />
            {/* Plain stack screens with a fade, not modals: replacing scan with result then cross-fades inside one
                navigation controller instead of dismissing one modal and presenting another (which flashes Home). */}
            <Stack.Screen name="scan" options={{ animation: 'fade', gestureEnabled: false, contentStyle: { backgroundColor: onPhoto.black } }} />
            <Stack.Screen
              name="result/[id]"
              options={{ animation: 'fade', animationDuration: 260, gestureEnabled: false, contentStyle: { backgroundColor: onPhoto.black } }}
            />
            <Stack.Screen
              name="dish/[scanId]/[itemId]"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.62, 0.95],
                sheetInitialDetentIndex: 0,
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
                contentStyle: { backgroundColor: c.card },
              }}
            />
            {/* Together: rooms and challenges are pushed screens; picking and joining are sheets like the dish sheet. */}
            <Stack.Screen name="community/[slug]" />
            <Stack.Screen name="challenge/[id]" />
            <Stack.Screen name="post/[slug]/[id]" />
            <Stack.Screen name="rooms" />
            <Stack.Screen name="item/[slug]/[id]" />
            <Stack.Screen name="compose/[slug]" options={sheet([0.75, 0.95])} />
            <Stack.Screen name="challenge/new" options={sheet([0.85])} />
            <Stack.Screen name="challenge/how/[id]" options={sheet([0.7, 0.95])} />
            <Stack.Screen name="challenge/invite/[id]" options={sheet([0.75, 0.95])} />
            <Stack.Screen name="join/[slug]" options={sheet([0.5])} />
            <Stack.Screen name="share/[scanId]" options={sheet([0.75, 0.95])} />
          </Stack>
          <CelebrationLayer />
          <Presence />
        </ThemeProvider>
      </BackendProvider>
    </GestureHandlerRootView>
  );
}
