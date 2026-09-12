import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import {
  englishContentSources,
  spanishContentSources,
  spanishReviewDisclosure,
  type ContentSourceNotice,
  wordNet3LicenseNotice,
} from '@/data/content-sources';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export default function SourcesScreen() {
  const theme = useAppTheme();
  return <Screen scroll>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close sources" onPress={() => router.back()} style={[styles.close, { backgroundColor: theme.surface }]}><Ionicons name="close" color={theme.text} size={22}/></Pressable>
      <AppText variant="title">Content sources</AppText>
      <View style={styles.close}/>
    </View>
    <AppText style={{ color: theme.muted }}>Licences, acknowledgements, and review disclosures for the bundled English and Spanish courses.</AppText>
    <SourceSection title="English course" sources={englishContentSources}/>
    <SourceSection title="Spanish course" sources={spanishContentSources}/>
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <AppText variant="heading">Spanish review disclosure</AppText>
      <AppText>{spanishReviewDisclosure}</AppText>
    </View>
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <AppText variant="heading">Complete WordNet 3.0 licence notice</AppText>
      <AppText variant="caption" style={{ color: theme.muted }}>{wordNet3LicenseNotice}</AppText>
    </View>
  </Screen>;
}

function SourceSection({ title, sources }: { title: string; sources: readonly ContentSourceNotice[] }) {
  const theme = useAppTheme();
  return <View style={styles.section}>
    <AppText variant="heading">{title}</AppText>
    {sources.map((source) => <Pressable
      key={source.id}
      accessibilityRole="link"
      accessibilityLabel={`Open source for ${source.title}`}
      onPress={() => void Linking.openURL(source.url)}
      style={({ pressed }) => [styles.sourceCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.76 : 1 }]}
    >
      <View style={styles.sourceHeading}><AppText variant="label" style={styles.flex}>{source.title}</AppText><Ionicons name="open-outline" color={theme.primary} size={18}/></View>
      <AppText variant="caption" style={{ color: theme.muted }}>{source.body}</AppText>
      {source.license ? <AppText variant="caption" style={{ color: theme.primary }}>{source.license}</AppText> : null}
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  sourceCard: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.sm },
  sourceHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  flex: { flex: 1 },
});
