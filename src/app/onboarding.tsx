import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInLeft, FadeInRight, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { describeCatalogAvailability } from '@/components/catalog-availability';
import { CourseSelector } from '@/components/course-selector';
import { LevelSelection, TopicSelection } from '@/components/preference-cards';
import { PrimaryButton } from '@/components/primary-button';
import { PronunciationVoicePicker } from '@/components/pronunciation-voice-picker';
import { Screen } from '@/components/screen';
import { cefrLevelDescriptions } from '@/data/cefr-levels';
import { getCourseCatalogAvailability } from '@/data/course-catalog';
import { wordBelongsToCourse, type CourseDefinition, type CourseId } from '@/domain/courses';
import type { CefrLevel, ContentPackId, LearningPreferences, PronunciationVoicePreference } from '@/domain/types';
import { neuralPreviewFeatureEnabled, neuralVoiceLabel } from '@/features/pronunciation/cloud';
import { buildRecommendations, normalizeLearningPreferences, topicOptions } from '@/features/recommendations/selector';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { radii, spacing } from '@/theme/tokens';

export default function OnboardingScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const {
    words, onboardingComplete, activeCourse, activeCourseId, switchActiveCourse,
    completePersonalizedOnboarding, wordCapacity,
  } = useAppData();
  const [wasCompleteOnEntry] = useState(onboardingComplete === true);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [levels, setLevels] = useState<CefrLevel[]>([]);
  const [topics, setTopics] = useState<ContentPackId[]>([]);
  const [voicePreference, setVoicePreference] = useState<PronunciationVoicePreference>(activeCourseId === 'en-sk' ? 'neural-en-US' : 'device');
  const [busy, setBusy] = useState(false);
  const [switchingCourse, setSwitchingCourse] = useState(false);
  const showVoiceStep = activeCourse.capabilities.offlinePronunciation && Platform.OS !== 'web' && neuralPreviewFeatureEnabled();
  const showInterestsStep = activeCourse.capabilities.recommendations;
  const stepNames: readonly string[] = [
    'Language',
    ...(showVoiceStep ? ['Voice'] as const : []),
    'Levels',
    ...(showInterestsStep ? ['Interests'] as const : []),
    'Review',
  ];
  const stepCount = stepNames.length;
  const levelStep = stepNames.indexOf('Levels');
  const interestsStep = stepNames.indexOf('Interests');
  const reviewStep = stepNames.indexOf('Review');
  const preferences = useMemo(() => normalizeLearningPreferences({ levels, topics }), [levels, topics]);
  const previewLimit = wordCapacity.remaining === null ? 10 : Math.min(10, wordCapacity.remaining);
  const preview = useMemo(() => activeCourse.capabilities.recommendations ? buildRecommendations(
    preferences,
    words.filter((word) => wordBelongsToCourse(word, activeCourseId)).map((word) => word.normalizedTerm),
    previewLimit,
  ) : [], [activeCourse.capabilities.recommendations, activeCourseId, preferences, previewLimit, words]);

  if (wasCompleteOnEntry) return <Redirect href="/(tabs)" />;

  const toggleLevel = (level: CefrLevel) => setLevels((current) => current.includes(level)
    ? current.filter((item) => item !== level)
    : normalizeLearningPreferences({ levels: [...current, level], topics: [] }).levels);
  const toggleTopic = (topic: ContentPackId) => setTopics((current) => current.includes(topic)
    ? current.filter((item) => item !== topic)
    : normalizeLearningPreferences({ levels: [], topics: [...current, topic] }).topics);
  const canContinue = switchingCourse ? false : step === levelStep ? levels.length > 0
    : interestsStep >= 0 && step === interestsStep ? topics.length > 0
      : step !== reviewStep || !activeCourse.capabilities.recommendations || preview.length > 0 || previewLimit === 0;
  const maxValidStep = levels.length === 0 ? levelStep
    : showInterestsStep && (topics.length === 0 || (preview.length === 0 && previewLimit > 0)) ? interestsStep : reviewStep;
  const maxNavigableStep = Math.min(furthestStep, maxValidStep);

  const goToStep = (nextStep: number) => {
    if (nextStep < 0 || nextStep >= stepCount || nextStep > maxNavigableStep) return;
    setTransitionDirection(nextStep < step ? 'backward' : 'forward');
    setStep(nextStep);
  };

  const continueFlow = async () => {
    if (step < stepCount - 1) {
      const nextStep = step + 1;
      setTransitionDirection('forward');
      setFurthestStep((current) => Math.max(current, nextStep));
      setStep(nextStep);
      return;
    }
    setBusy(true);
    try {
      const count = await completePersonalizedOnboarding(
        preferences,
        showVoiceStep ? voicePreference : 'device',
      );
      router.replace({ pathname: '/onboarding-ready', params: { count: String(count) } } as never);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.topBar}>
        <LinearGradient colors={theme.primaryGradient} style={styles.logoMark}><AppText variant="label" style={styles.logoLetter}>W</AppText></LinearGradient>
        <View pointerEvents="none" style={styles.stepCounter}><AppText variant="caption" style={{ color: theme.muted }}>Step {step + 1} of {stepCount}</AppText></View>
      </View>
      <View style={styles.progress} accessibilityLabel={`Onboarding progress, step ${step + 1} of ${stepCount}`}>
        {stepNames.map((name, index) => {
          const unavailable = index > maxNavigableStep;
          const current = index === step;
          return <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={current ? `${name}, current step` : `Go to ${name}`}
            accessibilityState={{ disabled: unavailable || current }}
            disabled={unavailable || current}
            onPress={() => goToStep(index)}
            style={styles.progressTarget}
          >
            <View style={[styles.progressSegment, {
              backgroundColor: index <= step ? theme.primary : index <= maxNavigableStep ? theme.primarySoft : theme.border,
            }]}/>
          </Pressable>;
        })}
      </View>

      <Animated.View
        key={step}
        entering={(transitionDirection === 'backward' ? FadeInLeft : FadeInRight).duration(260).reduceMotion(ReduceMotion.System)}
        style={styles.step}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
          {step === 0 ? <LanguageStep
            value={activeCourseId}
            disabled={switchingCourse}
            onChange={(courseId) => {
              setLevels([]);
              setTopics([]);
              setVoicePreference(courseId === 'en-sk' ? 'neural-en-US' : 'device');
              setFurthestStep(0);
              setSwitchingCourse(true);
              void switchActiveCourse(courseId)
                .catch((error) => Alert.alert('Could not switch course', error instanceof Error ? error.message : 'Please try again.'))
                .finally(() => setSwitchingCourse(false));
            }}
          /> : null}
          {showVoiceStep && step === 1 ? <View style={styles.section}>
            <StepHeading
              eyebrow="YOUR VOICE"
              title="Who should pronounce your words?"
              body="Test each voice now. Natural voices download only the words you add and then work offline."
            />
            <PronunciationVoicePicker value={voicePreference} onChange={setVoicePreference}/>
            <AppText variant="caption" style={{ color: theme.muted }}>
              Small automatic downloads can use Wi-Fi or mobile data. Full level packs remain optional.
            </AppText>
          </View> : null}
          {step === levelStep ? <View style={styles.section}>
            <StepHeading eyebrow="YOUR STARTING POINT" title="Which levels feel right?" body="Choose one level or combine a few. You can change this later."/>
            <LevelSelection selected={levels} onToggle={toggleLevel}/>
            <AppText variant="caption" style={{ color: theme.muted }}>{activeCourse.capabilities.recommendations
              ? 'Levels set the difficulty boundary for every recommendation.'
              : describeCatalogAvailability(getCourseCatalogAvailability(activeCourseId))}</AppText>
          </View> : null}
          {interestsStep >= 0 && step === interestsStep ? <View style={styles.section}>
            <StepHeading eyebrow="YOUR INTERESTS" title={`What will you use ${activeCourse.sourceLanguageCode === 'en' ? 'English' : 'Spanish'} for?`} body="Pick every area that matters. We will prioritize words that match."/>
            <TopicSelection selected={topics} onToggle={toggleTopic}/>
            <View style={[styles.note, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="sparkles-outline" color={theme.primary} size={20}/>
              <AppText variant="caption" style={styles.flex}>If a topic has too few words at your level, we fill the gap with useful general vocabulary at the same level.</AppText>
            </View>
          </View> : null}
          {step === reviewStep ? <ReviewStep
            preferences={preferences}
            preview={preview}
            voicePreference={showVoiceStep ? voicePreference : 'device'}
            course={activeCourse}
          /> : null}
        </ScrollView>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg), borderTopColor: theme.border }]}>
        <View style={styles.footerButton}><PrimaryButton
          label="Back"
          variant="secondary"
          disabled={step === 0 || busy}
          onPress={() => goToStep(step - 1)}
          icon={<Ionicons name="arrow-back" color={theme.primary} size={18}/>}
        /></View>
        <View style={styles.continueButton}><PrimaryButton
          label={step === stepCount - 1 ? activeCourse.capabilities.recommendations ? 'Create my set' : 'Save my preferences' : 'Continue'}
          disabled={!canContinue}
          loading={busy}
          onPress={() => void continueFlow()}
          icon={step === stepCount - 1 ? <Ionicons name="sparkles" color="#FFFFFF" size={18}/> : undefined}
        /></View>
      </View>
    </Screen>
  );
}

function LanguageStep({ value, onChange, disabled }: { value: CourseId; onChange(courseId: CourseId): void; disabled: boolean }) {
  const theme = useAppTheme();
  return <View style={styles.section}>
    <View style={styles.heroMark}><LinearGradient colors={theme.primaryGradient} style={styles.heroGradient}><AppText variant="title" style={styles.heroLetter}>W</AppText></LinearGradient></View>
    <StepHeading eyebrow="WELCOME" title="Keep useful words close." body="Build a small vocabulary practice around your level, work, studies, and everyday life." centered/>
    <CourseSelector value={value} onChange={onChange} disabled={disabled}/>
    <View style={[styles.privacyRow, { backgroundColor: theme.primarySoft }]}><Ionicons name="library-outline" color={theme.primary} size={19}/><AppText variant="caption" style={styles.flex}>Switch courses any time. Neither library nor its progress is removed.</AppText></View>
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

function ReviewStep({ preferences, preview, voicePreference, course }: {
  preferences: LearningPreferences;
  preview: ReturnType<typeof buildRecommendations>;
  voicePreference: PronunciationVoicePreference;
  course: CourseDefinition;
}) {
  const theme = useAppTheme();
  const topicNames = topicOptions.filter((topic) => preferences.topics.includes(topic.id)).map((topic) => topic.title);
  const availability = getCourseCatalogAvailability(course.id);
  return <View style={styles.section}>
    <StepHeading eyebrow="YOUR PLAN" title="A focused start, made for you." body={course.capabilities.recommendations
      ? 'We will add a small starter set now. Your choices can be edited at any time.'
      : availability.total > 0
        ? 'Choose Spanish words from the library to start practicing. No catalog words are added automatically.'
        : 'Your Spanish course is ready for manual and imported words. Your choices can be edited at any time.'}/>
    <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <SummaryRow icon="language-outline" label="Language" value={course.directionLabel}/>
      <View style={[styles.divider, { backgroundColor: theme.border }]}/>
      <SummaryRow
        icon="volume-high-outline"
        label="Preferred voice"
        value={voicePreference === 'neural-en-US' ? neuralVoiceLabel('en-US')
          : voicePreference === 'neural-en-GB' ? neuralVoiceLabel('en-GB') : 'Phone voice'}
      />
      <View style={[styles.divider, { backgroundColor: theme.border }]}/>
      <SummaryRow icon="speedometer-outline" label="Levels" value={preferences.levels.map((level) => `${level} · ${cefrLevelDescriptions[level]}`).join('\n')}/>
      {course.capabilities.recommendations ? <>
        <View style={[styles.divider, { backgroundColor: theme.border }]}/>
        <SummaryRow icon="heart-outline" label="Interests" value={topicNames.join('\n')}/>
      </> : null}
    </View>
    <View>
      <AppText variant="heading">{preview.length > 0 ? `Your first ${preview.length} words` : 'Your preferences are ready'}</AppText>
      <AppText style={{ color: theme.muted }}>{preview.length > 0
        ? 'These words will be added to your library.'
        : course.capabilities.recommendations
          ? 'Your current library is full. Unlock unlimited words later to add recommendations.'
          : availability.total > 0
            ? `Browse Library → Discover and choose a level with entries. ${describeCatalogAvailability(availability)} Words are added only when you choose them.`
            : 'Add Spanish words manually or import them. The built-in A1–C2 catalog stays hidden until every entry has approved provenance and independent editorial review.'}</AppText>
    </View>
    {voicePreference === 'device' || preview.length === 0 ? null : <View style={[styles.note, { backgroundColor: theme.primarySoft }]}>
      <Ionicons name="cloud-download-outline" color={theme.primary} size={20}/>
      <AppText variant="caption" style={styles.flex}>
        {preview.length === 1 ? 'This word will' : `Your first ${preview.length} words will`} be ready to hear offline in {voicePreference === 'neural-en-US' ? 'Ava’s' : 'Ryan’s'} voice.
      </AppText>
    </View>}
    <View style={styles.previewGrid}>{preview.map(({ entry }) => <View key={entry.id} style={[styles.wordChip, { backgroundColor: theme.primarySoft }]}><AppText variant="label" style={{ color: theme.primary }}>{entry.term}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{entry.level}</AppText></View>)}</View>
    <AppText variant="caption" style={{ color: theme.muted }}>Existing words are never removed. Future recommendations will follow the same preferences.</AppText>
  </View>;
}

function SummaryRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const theme = useAppTheme();
  return <View style={styles.summaryRow}><View style={[styles.summaryIcon, { backgroundColor: theme.primarySoft }]}><Ionicons name={icon} color={theme.primary} size={20}/></View><View style={styles.flex}><AppText variant="caption" style={{ color: theme.muted }}>{label}</AppText><AppText variant="label">{value}</AppText></View></View>;
}

const styles = StyleSheet.create({
  screen: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 0 },
  topBar: { minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  logoMark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-3deg' }] },
  logoLetter: { color: '#FFFFFF' },
  stepCounter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  progress: { height: 20, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  progressTarget: { flex: 1, height: 44, marginVertical: -12, justifyContent: 'center' },
  progressSegment: { height: 3, borderRadius: 2 },
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
  footerButton: { flex: 1 },
  continueButton: { flex: 1 },
  summaryCard: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  summaryIcon: { width: 40, height: 40, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordChip: { minHeight: 48, borderRadius: radii.control, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
