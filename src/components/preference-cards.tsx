import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { cefrLevelDescriptions, cefrLevels } from '@/data/cefr-levels';
import type { CefrLevel, ContentPackId } from '@/domain/types';
import { topicOptions } from '@/features/recommendations/selector';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export function LevelSelection({ selected, onToggle }: {
  selected: CefrLevel[];
  onToggle(level: CefrLevel): void;
}) {
  return (
    <View style={styles.levelGrid}>
      {cefrLevels.map((level) => <PreferenceCard
        key={level}
        title={level}
        description={cefrLevelDescriptions[level]}
        selected={selected.includes(level)}
        onPress={() => onToggle(level)}
        testID={`level-${level}`}
        compact
      />)}
    </View>
  );
}

export function TopicSelection({ selected, onToggle }: {
  selected: ContentPackId[];
  onToggle(topic: ContentPackId): void;
}) {
  return (
    <View style={styles.topicList}>
      {topicOptions.map((topic) => <PreferenceCard
        key={topic.id}
        title={topic.title}
        description={topic.description}
        icon={topic.icon}
        selected={selected.includes(topic.id)}
        onPress={() => onToggle(topic.id)}
        testID={`topic-${topic.id}`}
      />)}
    </View>
  );
}

function PreferenceCard({ title, description, icon, selected, onPress, testID, compact = false }: {
  title: string;
  description: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress(): void;
  testID: string;
  compact?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        {
          backgroundColor: selected ? theme.primarySoft : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}>
      <View style={styles.cardHeader}>
        {icon ? <View style={[styles.icon, { backgroundColor: selected ? theme.primary : theme.primarySoft }]}>
          <Ionicons name={icon} color={selected ? '#FFFFFF' : theme.primary} size={21}/>
        </View> : null}
        <View style={styles.cardText}>
          <AppText variant={compact ? 'heading' : 'label'} style={{ color: selected ? theme.primary : theme.text }}>{title}</AppText>
          <AppText variant="caption" style={{ color: theme.muted }}>{description}</AppText>
        </View>
        <View style={[styles.check, { backgroundColor: selected ? theme.primary : 'transparent', borderColor: selected ? theme.primary : theme.border }]}>
          {selected ? <Ionicons name="checkmark" color="#FFFFFF" size={15}/> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  topicList: { gap: spacing.sm },
  card: { minHeight: 92, borderWidth: 1.5, borderRadius: radii.card, padding: spacing.md, justifyContent: 'center' },
  compactCard: { width: '48.5%', minHeight: 122 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardText: { flex: 1, gap: spacing.xs },
  icon: { width: 42, height: 42, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
