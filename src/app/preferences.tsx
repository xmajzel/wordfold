import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { LevelSelection, TopicSelection } from '@/components/preference-cards';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import type { CefrLevel, ContentPackId } from '@/domain/types';
import { languageLabel } from '@/domain/languages';
import { normalizeLearningPreferences } from '@/features/recommendations/selector';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { spacing } from '@/theme/tokens';

export default function PreferencesScreen() {
  const theme = useAppTheme();
  const { activeCourse, learningPreferences, saveLearningPreferences } = useAppData();
  const learnedLanguage = languageLabel(activeCourse.sourceLanguageCode);
  const [levels, setLevels] = useState<CefrLevel[]>(learningPreferences.levels);
  const [topics, setTopics] = useState<ContentPackId[]>(learningPreferences.topics);
  const [saving, setSaving] = useState(false);
  const toggleLevel = (level: CefrLevel) => setLevels((current) => normalizeLearningPreferences({
    levels: current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
    topics: [],
  }).levels);
  const toggleTopic = (topic: ContentPackId) => setTopics((current) => normalizeLearningPreferences({
    levels: [],
    topics: current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
  }).topics);

  const save = async () => {
    setSaving(true);
    try {
      await saveLearningPreferences({ levels, topics: activeCourse.capabilities.recommendations ? topics : [] });
      Alert.alert('Preferences saved', activeCourse.capabilities.recommendations
        ? 'Future recommendations will use your updated choices.'
        : `Your ${learnedLanguage} level filters are ready. Manual and imported words keep all existing progress.`, [{ text: 'Done', onPress: () => router.back() }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close learning preferences" onPress={() => router.back()} style={[styles.close, { backgroundColor: theme.surface }]}><Ionicons name="close" color={theme.text} size={22}/></Pressable>
        <AppText variant="heading" numberOfLines={1} style={styles.headerTitle}>Learning preferences</AppText>
        <View style={styles.close}/>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.section}><View><AppText variant="heading">{learnedLanguage} levels</AppText><AppText style={{ color: theme.muted }}>{activeCourse.capabilities.recommendations ? 'Recommendations always stay inside these levels.' : 'Study filters stay inside these levels when your words have CEFR labels.'}</AppText></View><LevelSelection selected={levels} onToggle={toggleLevel}/></View>
        {activeCourse.capabilities.recommendations ? <View style={styles.section}><View><AppText variant="heading">Your interests</AppText><AppText style={{ color: theme.muted }}>We prioritize matching words where the catalog has them.</AppText></View><TopicSelection selected={topics} onToggle={toggleTopic}/></View> : <View style={styles.section}>
          <AppText variant="heading">Spanish recommendations are gated</AppText>
          <AppText style={{ color: theme.muted }}>The planned A1–C2 catalog will use original or licensed content with independent level, definition, example, and Slovak-hint review. Instituto Cervantes remains a qualitative reference only.</AppText>
        </View>}
        <AppText variant="caption" style={{ color: theme.muted }}>Changing these choices never removes words or learning history already in your library.</AppText>
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: theme.border }]}><PrimaryButton label="Save preferences" loading={saving} disabled={levels.length === 0 || (activeCourse.capabilities.recommendations && topics.length === 0)} onPress={() => void save()}/></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 0 },
  header: { minHeight: 68, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, paddingHorizontal: spacing.sm, textAlign: 'center' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.md },
  footer: { borderTopWidth: 1, padding: spacing.lg },
});
