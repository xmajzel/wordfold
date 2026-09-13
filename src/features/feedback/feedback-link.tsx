import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/components/app-text';
import type { Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { spacing } from '@/theme/tokens';
import { rememberFeedbackOrigin } from './context';

export function FeedbackLink({ screen, word, label = 'Send feedback', iconOnly = false }: { screen: string; word?: Word; label?: string; iconOnly?: boolean }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    onPress={() => router.push({ pathname: '/feedback', params: { origin: rememberFeedbackOrigin(screen, word) } } as never)}
    style={({ pressed }) => [styles.link, iconOnly && styles.iconOnly, { opacity: pressed ? 0.7 : 1 }]}>
    <Ionicons name="chatbubble-outline" size={18} color={theme.primary}/>
    {!iconOnly ? <AppText variant="caption" style={{ color: theme.primary, flexShrink: 1 }}>{label}</AppText> : null}
  </Pressable>;
}

const styles = StyleSheet.create({ iconOnly: { width: 44, flexShrink: 0, justifyContent: 'center' }, link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm } });
