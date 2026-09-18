import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export function AiHeading({ children }: PropsWithChildren) {
  const theme = useAppTheme();
  return <View style={styles.heading}>
    <Ionicons name="sparkles-outline" size={22} color={theme.aiAccent} accessible={false}/>
    <AppText variant="label" style={styles.headingText}>{children}</AppText>
  </View>;
}

export function AiSurface({ children }: PropsWithChildren) {
  const theme = useAppTheme();
  return <LinearGradient colors={theme.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.frame}>
    <View style={[styles.card, { backgroundColor: theme.aiSurface }]}>{children}</View>
  </LinearGradient>;
}

export function AiButton({ label, onPress, disabled, loading, action = 'generate' }: {
  label: string; onPress(): void; disabled?: boolean; loading?: boolean; action?: 'generate' | 'accept' | 'discard';
}) {
  const theme = useAppTheme();
  const color = action === 'discard' ? theme.muted : theme.aiAccent;
  const content = <View style={[styles.buttonContent, { backgroundColor: theme.aiSurface }]}>
    {loading ? <ActivityIndicator color={color}/> : <>
      <Ionicons accessible={false} name={action === 'accept' ? 'checkmark-circle-outline' : action === 'discard' ? 'close-circle-outline' : 'sparkles-outline'} size={22} color={color}/>
      <AppText variant="label" style={[styles.buttonLabel, { color }]}>{label}</AppText>
    </>}
  </View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
    disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
    {action === 'generate' ? <LinearGradient colors={theme.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonFrame}>{content}</LinearGradient>
      : <View style={[styles.buttonFrame, { backgroundColor: action === 'accept' ? theme.aiAccent : theme.border }]}>{content}</View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingText: { flex: 1 },
  frame: { padding: 1.5, borderRadius: radii.card },
  card: { borderRadius: radii.card - 1.5, padding: spacing.lg, gap: spacing.lg },
  button: { minHeight: 48, borderRadius: radii.control, overflow: 'hidden' },
  buttonFrame: { padding: 1, borderRadius: radii.control },
  buttonContent: { minHeight: 46, borderRadius: radii.control - 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonLabel: { flexShrink: 1, textAlign: 'center' },
});
