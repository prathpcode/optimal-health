import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// One place for haptic vocabulary. Failures (web, simulators) are ignored.

const run = (fn: () => Promise<unknown>) => {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
};

export const haptic = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  shutter: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  select: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
