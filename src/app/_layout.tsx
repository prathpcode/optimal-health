import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BackendProvider } from '@/lib/backend';
import { onPhoto, useTheme } from '@/theme';

export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const { c, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.card, text: c.text, primary: c.text, border: c.hairline } };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <BackendProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
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
          </Stack>
        </ThemeProvider>
      </BackendProvider>
    </GestureHandlerRootView>
  );
}
