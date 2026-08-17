import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({ label, onPress, variant = 'primary', disabled, loading, icon }:
  { label: string; onPress(): void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; loading?: boolean; icon?: ReactNode }) {
  const theme = useAppTheme();
  const color = variant === 'secondary' ? theme.primary : '#FFFFFF';
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = (value: number) => {
    scale.set(withSpring(value, { damping: 16, stiffness: 260, reduceMotion: ReduceMotion.System }));
  };
  const colors = variant === 'primary' ? theme.primaryGradient : variant === 'danger' ? [theme.danger, '#B63C61'] as const : [theme.surface, theme.surface] as const;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => press(0.97)}
      onPressOut={() => press(1)}
      style={[styles.button, variant === 'secondary' ? styles.outlined : styles.elevated, { opacity: disabled ? 0.45 : 1, borderColor: variant === 'secondary' ? theme.border : 'transparent', shadowColor: theme.shadow }, animatedStyle]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        {loading ? <ActivityIndicator color={color} /> : <View style={styles.content}>{icon}<AppText variant="label" style={{ color }}>{label}</AppText></View>}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderWidth: 1, borderRadius: radii.control, overflow: 'hidden' },
  outlined: { elevation: 0 },
  elevated: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 4 },
  fill: { flex: 1, minHeight: 48, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
});
