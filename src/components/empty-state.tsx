import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { spacing } from '@/theme/tokens';

export function EmptyState({ title, message, actionLabel, actionVariant = 'primary', compactAction = false, onAction }: {
  title: string;
  message: string;
  actionLabel?: string;
  actionVariant?: 'primary' | 'secondary';
  compactAction?: boolean;
  onAction?(): void;
}) {
  const theme = useAppTheme();
  const action = actionLabel && onAction
    ? <PrimaryButton label={actionLabel} variant={actionVariant} onPress={onAction}/>
    : null;
  return <View style={styles.container}><Ionicons name="layers-outline" size={38} color={theme.primary} /><AppText variant="heading">{title}</AppText><AppText style={[styles.message, { color: theme.muted }]}>{message}</AppText>{action && compactAction ? <View testID="empty-state-compact-action" style={styles.compactAction}>{action}</View> : action}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  message: { textAlign: 'center' },
  compactAction: { width: '100%', maxWidth: 200 },
});
