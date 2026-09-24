import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { getCardLayerStyle, restingCardMotion, type CardStackMotion } from '@/components/card-stack-motion';
import { WordCardScrollContext } from '@/components/word-card-content';
import { AppText } from '@/components/app-text';
import type { LearningRating, Word } from '@/domain/types';
import { getNextReviewIntervalRange } from '@/features/learning/algorithm';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export const SWIPE_ACTIVE_OFFSET = 16;
export const SWIPE_DISTANCE_RATIO = 0.35;
export const SWIPE_FLING_DISTANCE_RATIO = 0.2;
export const SWIPE_FLING_VELOCITY = 900;

export function getSwipeRating(
  translationX: number,
  velocityX: number,
  cardWidth: number,
): LearningRating | null {
  'worklet';
  if (cardWidth <= 0 || translationX === 0) return null;
  const direction = translationX < 0 ? -1 : 1;
  const distance = Math.abs(translationX);
  const passedDistance = distance >= cardWidth * SWIPE_DISTANCE_RATIO;
  const passedFling = distance >= cardWidth * SWIPE_FLING_DISTANCE_RATIO
    && Math.abs(velocityX) >= SWIPE_FLING_VELOCITY
    && Math.sign(velocityX) === direction;
  if (!passedDistance && !passedFling) return null;
  return direction < 0 ? 'understood' : 'learned';
}

export function SwipeableWordCard({
  word,
  active,
  disabled,
  onSwipe,
  children,
  onNavigate,
  canGoBack = false,
  canGoNext = false,
  stackMotion,
  cardIndex = 0,
}: {
  word?: Word;
  active: boolean;
  disabled: boolean;
  onSwipe(rating: LearningRating): void;
  onNavigate?(direction: 'next' | 'previous'): void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  stackMotion?: SharedValue<CardStackMotion>;
  cardIndex?: number;
  children: ReactNode | ((animateRating: (rating: LearningRating) => void) => ReactNode);
}) {
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const screenReaderEnabled = useScreenReaderEnabled();
  const [contentScrollable, setContentScrollable] = useState(false);
  const localMotion = useSharedValue(restingCardMotion(cardIndex));
  const motion = stackMotion ?? localMotion;
  const axis = useSharedValue<'x' | 'y' | null>(null);
  const committed = useSharedValue(false);
  const ratingSubmitted = useSharedValue(false);
  const thresholdHapticSent = useSharedValue(false);
  const nextReviewRange = word ? getNextReviewIntervalRange(word) : null;
  // Pre-mounted stack cards must be ready as soon as the UI thread reveals them.
  // The shared index below prevents gestures on any other card.
  const gestureEnabled = (active || !!stackMotion) && !screenReaderEnabled;

  const triggerThresholdHaptic = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const finishSwipe = useCallback((rating: LearningRating) => {
    onSwipe(rating);
  }, [onSwipe]);

  useAnimatedReaction(
    () => disabled,
    (ratingDisabled) => {
      // Once React acknowledges the rating, its disabled prop owns the lock.
      // A later resumed attempt can then reuse this mounted card.
      if (ratingDisabled) ratingSubmitted.set(false);
    },
  );

  useAnimatedReaction(
    () => stackMotion ? motion.value.index === cardIndex : active,
    (visible) => {
      if (visible) return;
      // Reset on the same thread as promotion, including rapid back navigation.
      committed.set(false);
      axis.set(null);
      thresholdHapticSent.set(false);
    },
  );

  const promote = (targetIndex: number) => {
    'worklet';
    const current = motion.get();
    motion.set(restingCardMotion(targetIndex, current.width, current.height, current.revision + 1));
  };

  const animateRating = (rating: LearningRating, fade = false) => {
    'worklet';
    const current = motion.get();
    if ((!stackMotion && !active) || disabled || !word || ratingSubmitted.get()
      || committed.get() || current.index !== cardIndex) return;
    committed.set(true);
    const direction = rating === 'understood' ? -1 : 1;
    motion.set(withTiming({ ...current,
      x: fade ? 0 : direction * Math.max(current.width + 100, 420),
      y: 0, opacity: fade ? 0 : 1,
    }, {
      duration: reduceMotion ? 70 : fade ? 220 : 140,
      reduceMotion: ReduceMotion.System,
    }, (finished) => {
      if (!finished) return;
      ratingSubmitted.set(true);
      promote(cardIndex + 1);
      runOnJS(finishSwipe)(rating);
    }));
  };

  const animateButtonRating = (rating: LearningRating) => {
    runOnUI(animateRating)(rating, true);
  };

  const springBack = () => {
    'worklet';
    const current = motion.get();
    motion.set(withSpring(restingCardMotion(cardIndex, current.width, current.height, current.revision), {
      damping: 18, stiffness: 240, reduceMotion: ReduceMotion.System,
    }));
  };

  const navigate = (direction: 'next' | 'previous') => {
    onNavigate?.(direction);
  };

  const pan = Gesture.Pan()
    .enabled(gestureEnabled)
    .minDistance(SWIPE_ACTIVE_OFFSET)
    .onBegin(() => {
      if (committed.get()) return;
      axis.set(null);
      thresholdHapticSent.set(false);
    })
    .onUpdate((event) => {
      const current = motion.get();
      if (committed.get() || current.index !== cardIndex) return;
      if (!axis.get()) {
        if (Math.max(Math.abs(event.translationX), Math.abs(event.translationY)) < SWIPE_ACTIVE_OFFSET) return;
        axis.set(Math.abs(event.translationX) > Math.abs(event.translationY) ? 'x' : 'y');
      }
      if (axis.get() === 'y') {
        if (contentScrollable) return;
        const backward = event.translationY > 0;
        const allowed = backward ? canGoBack : canGoNext;
        // Positive Y pulls the previous layer down; the current layer stays still.
        motion.set({ ...current, x: 0, y: allowed ? event.translationY : 0 });
      } else {
        const ratingDisabled = disabled || ratingSubmitted.get();
        motion.set({ ...current, x: ratingDisabled ? event.translationX * 0.15 : event.translationX, y: 0 });
        const threshold = current.width * SWIPE_DISTANCE_RATIO;
        if (!ratingDisabled && !thresholdHapticSent.get() && threshold > 0 && Math.abs(event.translationX) >= threshold) {
          thresholdHapticSent.set(true);
          runOnJS(triggerThresholdHaptic)();
        }
      }
    })
    .onEnd((event) => {
      const current = motion.get();
      if (committed.get() || current.index !== cardIndex) return;
      const vertical = axis.get() === 'y' || (axis.get() === null && Math.abs(event.translationY) > Math.abs(event.translationX));
      if (vertical) {
        if (contentScrollable) { springBack(); return; }
        const direction = event.translationY < 0 ? 'next' : 'previous';
        const allowed = direction === 'next' ? canGoNext : canGoBack;
        const deliberate = getSwipeRating(event.translationY, event.velocityY, current.height);
        if (!allowed || !deliberate || !onNavigate) { springBack(); return; }
        committed.set(true);
        runOnJS(triggerThresholdHaptic)();
        motion.set(withTiming({ ...current, x: 0,
          y: (direction === 'next' ? -1 : 1) * (current.height + 100),
        }, {
          duration: reduceMotion ? 70 : 180,
          reduceMotion: ReduceMotion.System,
        }, (finished) => {
          if (!finished) return;
          promote(cardIndex + (direction === 'next' ? 1 : -1));
          runOnJS(navigate)(direction);
        }));
        return;
      }
      const rating = getSwipeRating(event.translationX, event.velocityX, current.width);
      if (disabled || ratingSubmitted.get() || !rating) { springBack(); return; }
      if (!thresholdHapticSent.get()) {
        thresholdHapticSent.set(true);
        runOnJS(triggerThresholdHaptic)();
      }
      animateRating(rating);
    })
    .onFinalize((_event, success) => {
      if (!success && !committed.get() && motion.get().index === cardIndex) springBack();
    });

  // Fail vertical pans before activation so reading never skips an overflowing word.
  if (contentScrollable) pan.activeOffsetX([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET])
    .failOffsetY([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET]);

  const cardStyle = useAnimatedStyle(() => stackMotion ? {} : getCardLayerStyle(cardIndex, motion.value, reduceMotion));
  const keepLearningStyle = useAnimatedStyle(() => {
    const threshold = Math.max(motion.value.width * SWIPE_DISTANCE_RATIO, 96);
    return {
      opacity: interpolate(
        motion.value.index === cardIndex ? motion.value.x : 0,
        [-threshold, -SWIPE_ACTIVE_OFFSET, 0],
        [1, 0, 0],
        Extrapolation.CLAMP,
      ),
    };
  });
  const knowThisStyle = useAnimatedStyle(() => {
    const threshold = Math.max(motion.value.width * SWIPE_DISTANCE_RATIO, 96);
    return {
      opacity: interpolate(
        motion.value.index === cardIndex ? motion.value.x : 0,
        [0, SWIPE_ACTIVE_OFFSET, threshold],
        [0, 0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        needsOffscreenAlphaCompositing
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          const height = Math.round(event.nativeEvent.layout.height);
          runOnUI(() => {
            'worklet';
            const current = motion.get();
            if (current.width !== width || current.height !== height) motion.set({ ...current, width, height });
          })();
        }}
        style={[styles.card, cardStyle]}
        testID={`swipe-card-${word?.id ?? 'end'}`}>
        <WordCardScrollContext.Provider value={{ pan, setContentScrollable }}>
          {typeof children === 'function' ? children(animateButtonRating) : children}
        </WordCardScrollContext.Provider>
        {nextReviewRange ? <><SwipeOverlay
          align="right"
          color={theme.primary}
          detail={`Review in ${nextReviewRange.minDays}–${nextReviewRange.maxDays} days`}
          icon="calendar-outline"
          label="Keep learning"
          style={keepLearningStyle}
          testID="keep-learning-swipe-overlay"
        />
        <SwipeOverlay
          align="left"
          color={theme.success}
          detail="Stop reviews"
          icon="checkmark-circle-outline"
          label="I know this"
          style={knowThisStyle}
          testID="know-this-swipe-overlay"
        /></> : null}
      </Animated.View>
    </GestureDetector>
  );
}

function SwipeOverlay({ align, color, detail, icon, label, style, testID }: {
  align: 'left' | 'right';
  color: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  style: object;
  testID: string;
}) {
  return (
    <Animated.View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.overlay,
        align === 'left' ? styles.overlayLeft : styles.overlayRight,
        { backgroundColor: `${color}F2`, borderColor: color },
        style,
      ]}
      testID={testID}>
      <View style={styles.overlayTitle}>
        <Ionicons name={icon} color="#FFFFFF" size={22}/>
        <AppText variant="label" style={styles.overlayLabel}>{label.toLocaleUpperCase('en')}</AppText>
      </View>
      <AppText variant="caption" style={styles.overlayDetail}>{detail}</AppText>
    </Animated.View>
  );
}

function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (mounted) setEnabled(value);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: spacing.xxl,
    zIndex: 10,
    minWidth: 150,
    borderWidth: 2,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  overlayLeft: { left: spacing.lg },
  overlayRight: { right: spacing.lg },
  overlayTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  overlayLabel: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold' },
  overlayDetail: { color: '#FFFFFF', textAlign: 'center' },
});
