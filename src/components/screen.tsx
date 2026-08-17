import { useEffect, type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/use-app-theme';
import { spacing } from '@/theme/tokens';

export function Screen({ children, scroll = false, style, ...props }: PropsWithChildren<ViewProps & { scroll?: boolean }>) {
  const theme = useAppTheme();
  const content = scroll
    ? <ScrollView contentContainerStyle={[styles.scroll, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View {...props} style={[styles.content, style]}>{children}</View>;
  return <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.canvas }]}><AuroraBackground />{content}</SafeAreaView>;
}

function AuroraBackground() {
  const theme = useAppTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withRepeat(withTiming(1, { duration: 9000, reduceMotion: ReduceMotion.System }), -1, true));
    return () => cancelAnimation(progress);
  }, [progress]);
  const firstStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-18, 24]) },
      { translateY: interpolate(progress.value, [0, 1], [0, 38]) },
    ],
  }));
  const secondStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [22, -26]) },
      { translateY: interpolate(progress.value, [0, 1], [18, -18]) },
    ],
  }));

  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><LinearGradient colors={theme.aurora} style={StyleSheet.absoluteFill}/><Animated.View style={[styles.orb, styles.orbOne, { backgroundColor: `${theme.primary}24` }, firstStyle]}/><Animated.View style={[styles.orb, styles.orbTwo, { backgroundColor: `${theme.accent}22` }, secondStyle]}/></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  orb: { position: 'absolute', width: 280, height: 280, borderRadius: 140 },
  orbOne: { top: -80, right: -100 },
  orbTwo: { bottom: 70, left: -130 },
});
