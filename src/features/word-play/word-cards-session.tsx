import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { WordCard } from '@/components/word-card';
import type { Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { spacing } from '@/theme/tokens';

export function WordCardsSession({ words }: { words: Word[] }) {
  const { collections, learningConfirmations } = useAppData();
  const { height } = useWindowDimensions();
  const theme = useAppTheme();
  const [index, setIndex] = useState(0);
  const word = words[index];
  return <>
    <AppText variant="caption" style={{ color: theme.muted }}>Word cards · review without changing progress</AppText>
    <Animated.View key={word.id} entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)} style={styles.card}>
      <WordCard word={word} confirmations={learningConfirmations} collectionName={collections.find((item) => item.id === word.collectionId)?.name} dense={height < 700} showPronunciation/>
    </Animated.View>
    <View style={styles.navigation}>
      <PrimaryButton label="Previous" variant="secondary" disabled={index === 0} onPress={() => setIndex((current) => Math.max(0, current - 1))}/>
      <AppText variant="caption" style={[styles.position, { color: theme.muted }]}>{index + 1} of {words.length}</AppText>
      <PrimaryButton label={index === words.length - 1 ? 'Done' : 'Next'} onPress={() => index === words.length - 1 ? router.dismissTo('/(tabs)/play' as never) : setIndex((current) => Math.min(words.length - 1, current + 1))}/>
    </View>
  </>;
}
const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 0 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingBottom: spacing.md },
  position: { flexShrink: 1, textAlign: 'center' },
});
