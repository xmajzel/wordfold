import { useLayoutEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, useReducedMotion, runOnUI, type SharedValue } from 'react-native-reanimated';

import { getCardLayerStyle, restingCardMotion, type CardStackMotion } from '@/components/card-stack-motion';
import { SwipeableWordCard } from '@/components/swipeable-word-card';
import type { LearningRating, Word } from '@/domain/types';

/** Stable sibling layers: the revealed card becomes active without being replaced. */
export function WordCardStack({ words, index, isRated, onRate, onNavigate, renderWord, renderEnd }: {
  words: Word[];
  index: number;
  isRated(word: Word): boolean;
  onRate(word: Word, rating: LearningRating): void;
  onNavigate(fromIndex: number, toIndex: number): void;
  renderWord(word: Word, active: boolean, rate: (rating: LearningRating) => void): ReactNode;
  renderEnd(): ReactNode;
}) {
  const motion = useSharedValue(restingCardMotion(index));
  useLayoutEffect(() => {
    // Button navigation and a new batch may change the index without a gesture.
    // Animated transitions have already promoted the visible card on the UI thread.
    runOnUI(() => {
      'worklet';
      const current = motion.get();
      if (current.index !== index) motion.set(restingCardMotion(index, current.width, current.height));
    })();
  }, [index, motion]);
  const indices = [index - 1, index, index + 1].filter((item) => item >= 0 && item <= words.length);

  return <View style={styles.stack} testID="word-card-stack">
    {indices.map((item) => {
      const word = words[item];
      const active = item === index;
      return <CardLayer key={word ? `${word.id}-${item}` : 'batch-end'}
        index={item} currentIndex={index} motion={motion}>
        <SwipeableWordCard word={word} active={active} disabled={!word || isRated(word)}
          canGoBack={item > 0} canGoNext={item < words.length}
          stackMotion={motion} cardIndex={item}
          onSwipe={(rating) => { if (word) onRate(word, rating); }}
          onNavigate={(direction) => onNavigate(item, item + (direction === 'next' ? 1 : -1))}>
          {(rate) => word ? renderWord(word, active, rate) : renderEnd()}
        </SwipeableWordCard>
      </CardLayer>;
    })}
  </View>;
}

function CardLayer({ index, currentIndex, motion, children }: {
  index: number;
  currentIndex: number;
  motion: SharedValue<CardStackMotion>;
  children: ReactNode;
}) {
  const active = index === currentIndex;
  const reduceMotion = useReducedMotion();
  const style = useAnimatedStyle(() => getCardLayerStyle(index, motion.value, reduceMotion));
  return <Animated.View needsOffscreenAlphaCompositing style={[StyleSheet.absoluteFill, style]}
    pointerEvents={active ? 'auto' : 'none'}
    aria-hidden={!active} accessibilityElementsHidden={!active}
    importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    testID={`word-stack-layer-${index}`}>
    {children}
  </Animated.View>;
}

const styles = StyleSheet.create({ stack: { flex: 1 } });
