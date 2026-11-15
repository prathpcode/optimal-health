import { useColorScheme } from 'react-native';

import { palette, type Colors } from './tokens';

export * from './tokens';
export * from './motion';

export function useTheme(): { c: Colors; dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { c: dark ? palette.dark : palette.light, dark };
}
