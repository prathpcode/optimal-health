import { router } from 'expo-router';

/** Leave a screen. With nothing underneath (opened directly, or a second tap landing mid-transition) it goes Home instead of dispatching a back nobody handles. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
