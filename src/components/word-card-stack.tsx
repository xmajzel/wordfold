import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  const synchronizedRevision = useSharedValue(0);
  const previousIndex = useRef(index);
  useLayoutEffect(() => {
    // Button navigation and a new batch may change the index without a gesture.
    // Animated transitions have already promoted the visible card on the UI thread.
    const fromIndex = previousIndex.current;
    previousIndex.current = index;
    runOnUI(() => {
      'worklet';
      const current = motion.get();
      // React may still be acknowledging an earlier swipe. Only synchronize
      // navigation that has not already advanced on the UI thread.
      if (current.revision === synchronizedRevision.get() && current.index === fromIndex && current.index !== index) {
        motion.set(restingCardMotion(index, current.width, current.height, current.revision));
      }
      synchronizedRevision.set(current.revision);
    })();
  }, [index, motion, synchronizedRevision]);
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
  const style = useAnimatedStyle(() => ({
    ...getCardLayerStyle(index, motion.value, reduceMotion),
    pointerEvents: index === motion.value.index ? 'auto' : 'none',
  } as const));
  return <Animated.View needsOffscreenAlphaCompositing style={[StyleSheet.absoluteFill, style]}
    aria-hidden={!active} accessibilityElementsHidden={!active}
    importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    testID={`word-stack-layer-${index}`}>
    {children}
  </Animated.View>;
}

const styles = StyleSheet.create({ stack: { flex: 1 } });
