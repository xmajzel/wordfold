import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInRight, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { LevelSelection, TopicSelection } from '@/components/preference-cards';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { cefrLevelDescriptions } from '@/data/cefr-levels';
import type { CefrLevel, ContentPackId, LearningPreferences } from '@/domain/types';
import { buildRecommendations, normalizeLearningPreferences, topicOptions } from '@/features/recommendations/selector';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

const STEP_COUNT = 4;

export default function OnboardingScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { words, onboardingComplete, completePersonalizedOnboarding } = useAppData();
  const [wasCompleteOnEntry] = useState(onboardingComplete === true);
  const [step, setStep] = useState(0);
  const [levels, setLevels] = useState<CefrLevel[]>([]);
  const [topics, setTopics] = useState<ContentPackId[]>([]);
  const [busy, setBusy] = useState(false);
  const preferences = useMemo(() => normalizeLearningPreferences({ levels, topics }), [levels, topics]);
  const preview = useMemo(() => buildRecommendations(
    preferences,
    words.map((word) => word.normalizedTerm),
    10,
  ), [preferences, words]);

  if (wasCompleteOnEntry) return <Redirect href="/(tabs)" />;

  const toggleLevel = (level: CefrLevel) => setLevels((current) => current.includes(level)
    ? current.filter((item) => item !== level)
    : normalizeLearningPreferences({ levels: [...current, level], topics: [] }).levels);
  const toggleTopic = (topic: ContentPackId) => setTopics((current) => current.includes(topic)
    ? current.filter((item) => item !== topic)
    : normalizeLearningPreferences({ levels: [], topics: [...current, topic] }).topics);
  const canContinue = step === 1 ? levels.length > 0 : step === 2 ? topics.length > 0 : step !== 3 || preview.length > 0;

  const continueFlow = async () => {
    if (step < STEP_COUNT - 1) {
      setStep((current) => current + 1);
      return;
    }
    setBusy(true);
    try {
      const count = await completePersonalizedOnboarding(preferences);
      router.replace({ pathname: '/onboarding-ready', params: { count: String(count) } } as never);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.topBar}>
        <AppText variant="label" style={{ color: theme.primary }}>Wordfold</AppText>
        <AppText variant="caption" style={{ color: theme.muted }}>Step {step + 1} of {STEP_COUNT}</AppText>
      </View>
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEP_COUNT, now: step + 1 }}>
        {Array.from({ length: STEP_COUNT }, (_, index) => <View
          key={index}
          style={[styles.progressSegment, { backgroundColor: index <= step ? theme.primary : theme.border }]}
        />)}
      </View>

      <Animated.View
        key={step}
        entering={FadeInRight.duration(260).reduceMotion(ReduceMotion.System)}
        style={styles.step}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
          {step === 0 ? <LanguageStep /> : null}
          {step === 1 ? <View style={styles.section}>
            <StepHeading eyebrow="YOUR STARTING POINT" title="Which levels feel right?" body="Choose one level or combine a few. You can change this later."/>
            <LevelSelection selected={levels} onToggle={toggleLevel}/>
            <AppText variant="caption" style={{ color: theme.muted }}>Levels set the difficulty boundary for every recommendation.</AppText>
          </View> : null}
          {step === 2 ? <View style={styles.section}>
            <StepHeading eyebrow="YOUR INTERESTS" title="What will you use English for?" body="Pick every area that matters. We will prioritize words that match."/>
            <TopicSelection selected={topics} onToggle={toggleTopic}/>
            <View style={[styles.note, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="sparkles-outline" color={theme.primary} size={20}/>
              <AppText variant="caption" style={styles.flex}>If a topic has too few words at your level, we fill the gap with useful general vocabulary at the same level.</AppText>
            </View>
          </View> : null}
          {step === 3 ? <ReviewStep preferences={preferences} preview={preview}/> : null}
        </ScrollView>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg), borderTopColor: theme.border }]}>
        {step > 0 ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to previous onboarding step"
          onPress={() => setStep((current) => current - 1)}
          style={({ pressed }) => [styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.75 : 1 }]}>
          <Ionicons name="arrow-back" color={theme.text} size={21}/>
        </Pressable> : null}
        <View style={styles.continueButton}><PrimaryButton
          label={step === STEP_COUNT - 1 ? 'Create my starter set' : 'Continue'}
          disabled={!canContinue}
          loading={busy}
          onPress={() => void continueFlow()}
          icon={step === STEP_COUNT - 1 ? <Ionicons name="sparkles" color="#FFFFFF" size={18}/> : undefined}
        /></View>
      </View>
    </Screen>
  );
}

function LanguageStep() {
  const theme = useAppTheme();
  return <View style={styles.section}>
    <View style={styles.heroMark}><LinearGradient colors={theme.primaryGradient} style={styles.heroGradient}><AppText variant="title" style={styles.heroLetter}>W</AppText></LinearGradient></View>
    <StepHeading eyebrow="WELCOME" title="Keep useful words close." body="Build a small vocabulary practice around your level, work, studies, and everyday life." centered/>
    <View style={[styles.languageCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.languageIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name="language-outline" color={theme.primary} size={26}/></View>
      <View style={styles.flex}><AppText variant="heading">English → Slovak</AppText><AppText variant="caption" style={{ color: theme.muted }}>Definitions stay in English. Slovak translation waits behind a hint.</AppText></View>
      <Ionicons name="checkmark-circle" color={theme.success} size={24}/>
    </View>
    <View style={[styles.privacyRow, { backgroundColor: theme.primarySoft }]}><Ionicons name="phone-portrait-outline" color={theme.primary} size={19}/><AppText variant="caption" style={styles.flex}>Your words and progress stay on this device.</AppText></View>
  </View>;
}

function StepHeading({ eyebrow, title, body, centered = false }: { eyebrow: string; title: string; body: string; centered?: boolean }) {
  const theme = useAppTheme();
  return <View style={[styles.heading, centered && styles.center]}>
    <AppText variant="caption" style={{ color: theme.primary }}>{eyebrow}</AppText>
    <AppText variant="display" style={centered ? styles.centerText : undefined}>{title}</AppText>
    <AppText style={[centered && styles.centerText, { color: theme.muted }]}>{body}</AppText>
  </View>;
}

function ReviewStep({ preferences, preview }: { preferences: LearningPreferences; preview: ReturnType<typeof buildRecommendations> }) {
  const theme = useAppTheme();
  const topicNames = topicOptions.filter((topic) => preferences.topics.includes(topic.id)).map((topic) => topic.title);
  return <View style={styles.section}>
    <StepHeading eyebrow="YOUR PLAN" title="A focused start, made for you." body="We will add a small starter set now. Your choices can be edited at any time."/>
    <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <SummaryRow icon="language-outline" label="Language" value="English → Slovak"/>
      <View style={[styles.divider, { backgroundColor: theme.border }]}/>
      <SummaryRow icon="speedometer-outline" label="Levels" value={preferences.levels.map((level) => `${level} · ${cefrLevelDescriptions[level]}`).join('\n')}/>
      <View style={[styles.divider, { backgroundColor: theme.border }]}/>
      <SummaryRow icon="heart-outline" label="Interests" value={topicNames.join('\n')}/>
    </View>
    <View>
      <AppText variant="heading">Your first {preview.length} words</AppText>
      <AppText style={{ color: theme.muted }}>A preview of the vocabulary waiting for you.</AppText>
    </View>
    <View style={styles.previewGrid}>{preview.slice(0, 6).map(({ entry }) => <View key={entry.id} style={[styles.wordChip, { backgroundColor: theme.primarySoft }]}><AppText variant="label" style={{ color: theme.primary }}>{entry.term}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{entry.level}</AppText></View>)}</View>
    <AppText variant="caption" style={{ color: theme.muted }}>Existing words are never removed. Future recommendations will follow the same preferences.</AppText>
  </View>;
}

function SummaryRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const theme = useAppTheme();
  return <View style={styles.summaryRow}><View style={[styles.summaryIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name={icon} color={theme.primary} size={20}/></View><View style={styles.flex}><AppText variant="caption" style={{ color: theme.muted }}>{label}</AppText><AppText variant="label">{value}</AppText></View></View>;
}

const styles = StyleSheet.create({
  screen: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 0 },
  topBar: { minHeight: 48, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  step: { flex: 1 },
  stepContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  section: { gap: spacing.lg },
  heading: { gap: spacing.sm },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },
  heroMark: { alignItems: 'center', marginTop: spacing.lg },
  heroGradient: { width: 76, height: 76, borderRadius: 25, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  heroLetter: { color: '#FFFFFF' },
  languageCard: { minHeight: 112, borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  languageIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  privacyRow: { minHeight: 48, borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  note: { borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  footer: { borderTopWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', gap: spacing.sm },
  backButton: { width: 52, height: 52, borderWidth: 1, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  continueButton: { flex: 1 },
  summaryCard: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  summaryIcon: { width: 40, height: 40, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordChip: { minHeight: 48, borderRadius: radii.control, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
