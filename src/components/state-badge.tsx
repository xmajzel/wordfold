import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import type { LearningState } from '@/domain/types';
import { radii, spacing, stateColors } from '@/theme/tokens';

const labels: Record<LearningState, string> = {
  new: 'New',
  cannot_remember: 'Needs practice',
  understood: 'Getting there',
  learned: 'Learned',
};

const icons: Record<LearningState, keyof typeof Ionicons.glyphMap> = {
  new: 'sparkles-outline',
  cannot_remember: 'refresh-outline',
  understood: 'trail-sign-outline',
  learned: 'checkmark-circle-outline',
};

export function StateBadge({ state }: { state: LearningState }) {
  const color = stateColors[state];
  return <View style={[styles.badge, { backgroundColor: `${color}18`, borderColor: `${color}2E` }]}><Ionicons name={icons[state]} color={color} size={14} /><AppText variant="caption" style={{ color }}>{labels[state]}</AppText></View>;
}

const styles = StyleSheet.create({ badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1 } });
