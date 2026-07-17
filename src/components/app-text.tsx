import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { typeScale } from '@/theme/tokens';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

export function AppText({ children, variant = 'body', style, ...props }: PropsWithChildren<TextProps & { variant?: Variant }>) {
  const theme = useAppTheme();
  return <Text {...props} style={[styles.base, styles[variant], { color: theme.text }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  base: { fontFamily: 'Inter_400Regular' },
  display: { fontFamily: 'Fraunces_600SemiBold', fontSize: typeScale.display, lineHeight: 46 },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: typeScale.heading, lineHeight: 34 },
  heading: { fontFamily: 'Inter_600SemiBold', fontSize: typeScale.headingSmall, lineHeight: 26 },
  body: { fontSize: typeScale.body, lineHeight: 24 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: typeScale.bodySmall, lineHeight: 20 },
  caption: { fontFamily: 'Inter_400Regular', fontSize: typeScale.caption, lineHeight: 17 },
});
