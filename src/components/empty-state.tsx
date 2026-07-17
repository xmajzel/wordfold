import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { spacing } from '@/theme/tokens';

export function EmptyState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?(): void }) {
  const theme = useAppTheme();
  return <View style={styles.container}><Ionicons name="layers-outline" size={38} color={theme.primary} /><AppText variant="heading">{title}</AppText><AppText style={[styles.message, { color: theme.muted }]}>{message}</AppText>{actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}</View>;
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl }, message: { textAlign: 'center' } });
