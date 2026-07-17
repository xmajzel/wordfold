import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { StateBadge } from '@/components/state-badge';
import type { LearningRating, Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export const WordCard = memo(function WordCard({ word, collectionName, onRate, compact = false, actionsDisabled = false }:
  { word: Word; collectionName?: string; onRate?(rating: LearningRating): void; compact?: boolean; actionsDisabled?: boolean }) {
  const theme = useAppTheme();
  const [showTranslation, setShowTranslation] = useState(false);

  if (compact) {
    return <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)} style={[styles.compactCard, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}><LinearGradient colors={[`${theme.primary}D9`, `${theme.accent}B8`]} style={styles.compactAccent}/><View style={styles.compactTitle}><AppText variant="heading" style={styles.compactWord}>{word.term}</AppText>{word.cefrLevel ? <CefrBadge level={word.cefrLevel}/> : null}<StateBadge state={word.state} /></View><AppText numberOfLines={2} style={{ color: theme.muted }}>{word.definition}</AppText>{collectionName ? <AppText variant="caption" style={{ color: theme.muted }}>{collectionName} · seen {word.viewCount}×</AppText> : null}</Animated.View>;
  }

  const rate = (rating: LearningRating) => {
    void Haptics.selectionAsync();
    if (rating === 'learned') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onRate?.(rating);
  };

  return (
    <Animated.View entering={FadeInDown.springify().damping(18).reduceMotion(ReduceMotion.System)} style={[styles.card, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
      <LinearGradient colors={theme.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accentLine}/>
      <View style={styles.topRow}><StateBadge state={word.state}/><View style={styles.cardMeta}>{collectionName ? <AppText variant="caption" style={{ color: theme.muted }}>{collectionName}</AppText> : null}{word.cefrLevel ? <CefrBadge level={word.cefrLevel}/> : null}</View></View>
      <View style={styles.wordSection}><AppText variant="display" style={styles.word}>{word.term}</AppText>{word.partOfSpeech ? <AppText variant="label" style={{ color: theme.accent }}>{word.partOfSpeech}</AppText> : null}</View>
      <AppText style={styles.definition}>{word.definition}</AppText>
      {word.example ? <View style={[styles.example, { backgroundColor: theme.raised }]}><Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.primary}/><AppText style={styles.exampleText}>{word.example}</AppText></View> : null}
      {word.translation ? <Pressable accessibilityRole="button" onPress={() => setShowTranslation((value) => !value)} style={({ pressed }) => [styles.hint, { borderColor: theme.border, backgroundColor: theme.glass, transform: [{ scale: pressed ? 0.985 : 1 }] }]}><Ionicons name={showTranslation ? 'eye-off-outline' : 'eye-outline'} color={theme.primary} size={18}/><View style={styles.hintText}>{showTranslation ? <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}><AppText variant="label" style={{ color: theme.primary }}>{word.translation}</AppText><AppText variant="caption" style={{ color: theme.muted }}>Tap to hide the translation</AppText></Animated.View> : <AppText variant="label" style={{ color: theme.primary }}>Need a Slovak hint?</AppText>}</View></Pressable> : null}
      <View style={styles.trail}><AppText variant="caption" style={{ color: theme.muted }}>Seen {word.viewCount}×</AppText><AppText variant="caption" style={{ color: theme.muted }}>Missed {word.lapseCount}×</AppText></View>
      {onRate ? <View style={styles.actions}><RecallButton disabled={actionsDisabled} icon="refresh-outline" label="Again" color={theme.danger} onPress={() => rate('again')}/><RecallButton disabled={actionsDisabled} icon="trail-sign-outline" label="I understand" color={theme.accent} onPress={() => rate('understood')}/><RecallButton disabled={actionsDisabled} icon="checkmark-circle-outline" label="Learned" color={theme.success} onPress={() => rate('learned')}/></View> : null}
    </Animated.View>
  );
});

function RecallButton({ icon, label, color, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress(): void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, { borderColor: `${color}52`, backgroundColor: `${color}12`, opacity: disabled ? 0.45 : pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}><Ionicons name={icon} color={color} size={20}/><AppText variant="caption" style={{ color, textAlign: 'center' }}>{label}</AppText></Pressable>;
}

function CefrBadge({ level }: { level: NonNullable<Word['cefrLevel']> }) {
  const theme = useAppTheme();
  return <View style={[styles.cefrBadge, { backgroundColor: theme.primarySoft }]}><AppText variant="caption" style={{ color: theme.primary }}>{level}</AppText></View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radii.sheet, padding: spacing.xl, gap: spacing.xl, justifyContent: 'center', overflow: 'hidden', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 4 },
  accentLine: { position: 'absolute', top: 0, left: spacing.xxl, right: spacing.xxl, height: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, cefrBadge: { minWidth: 34, minHeight: 28, borderRadius: radii.pill, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  wordSection: { gap: spacing.xs, alignItems: 'center' }, word: { textAlign: 'center' },
  definition: { fontSize: 18, lineHeight: 28, textAlign: 'center' },
  example: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.card, padding: spacing.lg },
  exampleText: { flex: 1, fontStyle: 'italic' },
  hint: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radii.control, paddingHorizontal: spacing.md },
  hintText: { flex: 1 }, trail: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, minHeight: 62, borderWidth: 1, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xs },
  compactCard: { borderRadius: radii.card, padding: spacing.lg, gap: spacing.sm, overflow: 'hidden', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 1 },
  compactAccent: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  compactTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, compactWord: { flex: 1 },
});
