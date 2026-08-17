import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing, typeScale } from '@/theme/tokens';

export function FormField({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const theme = useAppTheme();
  return <View style={styles.group}><AppText variant="label">{label}</AppText><TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? label} placeholderTextColor={theme.muted} selectionColor={theme.primary} style={[styles.input, { backgroundColor: theme.glass, borderColor: theme.border, color: theme.text }, props.multiline && styles.multiline, props.style]} />{hint ? <AppText variant="caption" style={{ color: theme.muted }}>{hint}</AppText> : null}</View>;
}

const styles = StyleSheet.create({ group: { gap: spacing.sm }, input: { minHeight: 48, borderWidth: 1, borderRadius: radii.control, paddingHorizontal: spacing.md, fontFamily: 'Inter_400Regular', fontSize: typeScale.body }, multiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' } });
