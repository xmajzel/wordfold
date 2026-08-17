import { useColorScheme } from 'react-native';

import { palette } from '@/theme/tokens';

export function useAppTheme() {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? palette.dark : palette.light;
}
