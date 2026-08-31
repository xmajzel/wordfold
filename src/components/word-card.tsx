import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PronunciationControls } from '@/components/pronunciation-controls';
import { StateBadge } from '@/components/state-badge';
import { languageLabel } from '@/domain/languages';
import type { LearningRating, Word } from '@/domain/types';
import { getNextReviewIntervalRange } from '@/features/learning/algorithm';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export const WordCard = memo(function WordCard({ word, collectionName, onRate, onRetryTranslation, sessionRating, translationStatus, compact = false, dense = false, showPronunciation = false }:
  { word: Word; collectionName?: string; onRate?(rating: LearningRating): void; onRetryTranslation?(): void; sessionRating?: LearningRating; translationStatus?: 'loading' | 'error'; compact?: boolean; dense?: boolean; showPronunciation?: boolean }) {
  const theme = useAppTheme();
  const [showTranslation, setShowTranslation] = useState(false);
  const nextReviewRange = getNextReviewIntervalRange(word);
  const hintLanguage = languageLabel(word.targetLanguageCode);

  if (compact) {
    return <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)} style={[styles.compactCard, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}><LinearGradient colors={[`${theme.primary}D9`, `${theme.accent}B8`]} style={styles.compactAccent}/><View style={styles.compactTitle}><AppText variant="heading" style={styles.compactWord}>{word.term}</AppText>{word.cefrLevel ? <CefrBadge level={word.cefrLevel}/> : null}<StateBadge state={word.state} /></View><AppText numberOfLines={2} style={{ color: theme.muted }}>{word.definition}</AppText>{collectionName ? <AppText variant="caption" style={{ color: theme.muted }}>{collectionName} · seen {word.viewCount}×</AppText> : null}</Animated.View>;
  }

  const rate = (rating: LearningRating) => {
    void Haptics.selectionAsync();
    if (rating === 'learned') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onRate?.(rating);
  };

  return (
    <Animated.View entering={FadeInDown.springify().damping(18).reduceMotion(ReduceMotion.System)} style={[styles.card, dense && styles.denseCard, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
      <LinearGradient colors={theme.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accentLine}/>
      <View style={styles.topRow}><StateBadge state={word.state}/><View style={styles.cardMeta}>{collectionName ? <AppText variant="caption" style={{ color: theme.muted }}>{collectionName}</AppText> : null}{word.cefrLevel ? <CefrBadge level={word.cefrLevel}/> : null}</View></View>
      <View style={styles.wordSection}><AppText variant="display" style={[styles.word, dense && styles.denseWord]}>{word.term}</AppText>{word.partOfSpeech ? <AppText variant="label" style={{ color: theme.accent }}>{word.partOfSpeech}</AppText> : null}{showPronunciation ? <PronunciationControls text={word.term} sourceLanguageCode={word.sourceLanguageCode} locale={word.sourcePronunciationLocale} catalogSenseId={word.catalogSenseId} compact={dense}/> : null}</View>
      <AppText numberOfLines={dense ? 2 : undefined} style={styles.definition}>{word.definition}</AppText>
      {word.example ? <View style={[styles.example, dense && styles.denseExample, { backgroundColor: theme.raised }]}><Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.primary}/><AppText accessibilityLabel={word.example} numberOfLines={dense ? 1 : undefined} style={styles.exampleText}>{word.example}</AppText></View> : null}
      {word.translation ? <Pressable accessibilityRole="button" accessibilityLabel={showTranslation ? `Hide ${hintLanguage} hint` : `Need a ${hintLanguage} hint?`} onPress={() => setShowTranslation((value) => !value)} style={({ pressed }) => [styles.hint, dense && styles.denseHint, { borderColor: theme.border, backgroundColor: theme.glass, transform: [{ scale: pressed ? 0.985 : 1 }] }]}><Ionicons name={showTranslation ? 'eye-off-outline' : 'eye-outline'} color={theme.primary} size={18}/><View style={styles.hintText}>{showTranslation ? <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}><AppText variant="label" style={{ color: theme.primary }}>{word.translation}</AppText><AppText variant="caption" style={{ color: theme.muted }}>Tap to hide the translation</AppText></Animated.View> : <AppText variant="label" style={{ color: theme.primary }}>Need a {hintLanguage} hint?</AppText>}</View></Pressable> : null}
      {!word.translation && translationStatus === 'loading' ? <View accessibilityRole="progressbar" accessibilityLabel={`Preparing ${hintLanguage} hint`} style={[styles.hint, dense && styles.denseHint, { borderColor: theme.border, backgroundColor: theme.glass }]}><ActivityIndicator color={theme.primary} size="small"/><AppText variant="label" style={{ color: theme.muted }}>Preparing {hintLanguage} hint…</AppText></View> : null}
      {!word.translation && translationStatus === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${hintLanguage} hint`} onPress={onRetryTranslation} style={({ pressed }) => [styles.hint, dense && styles.denseHint, { borderColor: theme.border, backgroundColor: theme.glass, opacity: pressed ? 0.75 : 1 }]}><Ionicons name="refresh-outline" color={theme.primary} size={18}/><View style={styles.hintText}><AppText variant="label" style={{ color: theme.primary }}>Retry {hintLanguage} hint</AppText><AppText variant="caption" style={{ color: theme.muted }}>Translation was not available</AppText></View></Pressable> : null}
      {sessionRating ? <SessionRatingStatus rating={sessionRating} dense={dense}/> : onRate ? <View style={[styles.ratingBlock, dense && styles.denseRatingBlock]}>
        <AppText variant="label" style={styles.ratingPrompt}>Swipe or tap</AppText>
        <View style={styles.actions}>
          <RecallButton dense={dense} icon="calendar-outline" label="Keep learning" detail={`Review in ${nextReviewRange.minDays}–${nextReviewRange.maxDays} days`} color={theme.primary} onPress={() => rate('understood')}/>
          <RecallButton dense={dense} icon="checkmark-circle-outline" label="I know this" detail="Stop reviews" color={theme.success} onPress={() => rate('learned')}/>
        </View>
      </View> : null}
    </Animated.View>
  );
});

function SessionRatingStatus({ rating, dense }: { rating: LearningRating; dense: boolean }) {
  const theme = useAppTheme();
  const learned = rating === 'learned';
  const color = learned ? theme.success : theme.primary;
  const detail = learned ? 'Reviews stopped' : 'Kept in learning';
  return <View
    accessible
    accessibilityRole="text"
    accessibilityLabel={`Rated this session. ${detail}.`}
    style={[styles.sessionRating, dense && styles.denseSessionRating, { backgroundColor: `${color}0D`, borderColor: `${color}52` }]}>
    <View aria-hidden style={[styles.sessionRatingIcon, dense && styles.denseSessionRatingIcon, { backgroundColor: `${color}1C` }]}><Ionicons name={learned ? 'checkmark-circle-outline' : 'calendar-outline'} color={color} size={dense ? 20 : 22}/></View>
    <View style={styles.sessionRatingText}><AppText variant="label">Rated this session</AppText><AppText variant="caption" style={{ color: theme.muted }}>{detail}</AppText></View>
  </View>;
}

function RecallButton({ icon, label, detail, color, onPress, dense }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  color: string;
  onPress(): void;
  dense: boolean;
}) {
  const theme = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${label}. ${detail}.`}
    onPress={onPress}
    style={({ pressed }) => [styles.action, dense && styles.denseAction, { borderColor: `${color}52`, backgroundColor: `${color}0D`, opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
    <View style={[styles.actionIcon, dense && styles.denseActionIcon, { backgroundColor: `${color}1C` }]}><Ionicons name={icon} color={color} size={dense ? 20 : 22}/></View>
    <AppText variant="caption" style={[styles.actionLabel, { color: theme.text }]}>{label}</AppText>
    <AppText variant="caption" style={[styles.actionDetail, { color: theme.muted }]}>{detail}</AppText>
  </Pressable>;
}

function CefrBadge({ level }: { level: NonNullable<Word['cefrLevel']> }) {
  const theme = useAppTheme();
  return <View style={[styles.cefrBadge, { backgroundColor: theme.primarySoft }]}><AppText variant="caption" style={{ color: theme.primary }}>{level}</AppText></View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radii.sheet, padding: spacing.xl, gap: spacing.xl, justifyContent: 'center', overflow: 'hidden', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 4 },
  denseCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs, justifyContent: 'flex-start' },
  accentLine: { position: 'absolute', top: 0, left: spacing.xxl, right: spacing.xxl, height: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, cefrBadge: { minWidth: 34, minHeight: 28, borderRadius: radii.pill, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  wordSection: { gap: spacing.xs, alignItems: 'center' }, word: { textAlign: 'center' }, denseWord: { fontSize: 34, lineHeight: 40 },
  definition: { fontSize: 18, lineHeight: 28, textAlign: 'center' },
  example: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.card, padding: spacing.lg }, denseExample: { padding: spacing.sm },
  exampleText: { flex: 1, fontStyle: 'italic' },
  hint: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radii.control, paddingHorizontal: spacing.md }, denseHint: { minHeight: 44 },
  hintText: { flex: 1 },
  ratingBlock: { gap: spacing.sm }, denseRatingBlock: { gap: spacing.xs }, ratingPrompt: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  sessionRating: { minHeight: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radii.control, paddingHorizontal: spacing.lg },
  denseSessionRating: { minHeight: 76 },
  sessionRatingIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  denseSessionRatingIcon: { width: 32, height: 32, borderRadius: 16 },
  sessionRatingText: { gap: 2 },
  action: { flex: 1, minHeight: 104, borderWidth: 1, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', gap: 2, padding: spacing.xs },
  denseAction: { minHeight: 76 },
  actionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  denseActionIcon: { width: 32, height: 32, borderRadius: 16, marginBottom: 0 },
  actionLabel: { fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  actionDetail: { textAlign: 'center' },
  compactCard: { borderRadius: radii.card, padding: spacing.lg, gap: spacing.sm, overflow: 'hidden', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 1 },
  compactAccent: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  compactTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, compactWord: { flex: 1 },
});
