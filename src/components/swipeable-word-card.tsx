import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import type { LearningRating, Word } from '@/domain/types';
import { getNextReviewIntervalRange } from '@/features/learning/algorithm';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export const SWIPE_ACTIVE_OFFSET = 16;
export const SWIPE_VERTICAL_FAILURE_OFFSET = 12;
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
}: PropsWithChildren<{
  word: Word;
  active: boolean;
  disabled: boolean;
  onSwipe(rating: LearningRating): void;
}>) {
  const theme = useAppTheme();
  const reduceMotion = useReducedMotion();
  const screenReaderEnabled = useScreenReaderEnabled();
  const [cardWidth, setCardWidth] = useState(0);
  const translationX = useSharedValue(0);
  const committed = useSharedValue(false);
  const thresholdHapticSent = useSharedValue(false);
  const nextReviewRange = getNextReviewIntervalRange(word);
  const gestureEnabled = active && !disabled && !screenReaderEnabled;

  const triggerThresholdHaptic = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const finishSwipe = useCallback((rating: LearningRating) => {
    onSwipe(rating);
    requestAnimationFrame(() => {
      translationX.set(0);
      committed.set(false);
      thresholdHapticSent.set(false);
    });
  }, [committed, onSwipe, thresholdHapticSent, translationX]);

  useEffect(() => {
    if (active) return;
    translationX.set(0);
    committed.set(false);
    thresholdHapticSent.set(false);
  }, [active, committed, thresholdHapticSent, translationX]);

  const pan = Gesture.Pan()
    .enabled(gestureEnabled)
    .activeOffsetX([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET])
    .failOffsetY([-SWIPE_VERTICAL_FAILURE_OFFSET, SWIPE_VERTICAL_FAILURE_OFFSET])
    .onBegin(() => {
      committed.set(false);
      thresholdHapticSent.set(false);
    })
    .onUpdate((event) => {
      translationX.set(event.translationX);
      const threshold = cardWidth * SWIPE_DISTANCE_RATIO;
      if (!thresholdHapticSent.get() && threshold > 0 && Math.abs(event.translationX) >= threshold) {
        thresholdHapticSent.set(true);
        runOnJS(triggerThresholdHaptic)();
      }
    })
    .onEnd((event) => {
      const rating = getSwipeRating(event.translationX, event.velocityX, cardWidth);
      if (!rating) {
        translationX.set(withSpring(0, {
          damping: 18,
          stiffness: 240,
          reduceMotion: ReduceMotion.System,
        }));
        return;
      }
      if (!thresholdHapticSent.get()) {
        thresholdHapticSent.set(true);
        runOnJS(triggerThresholdHaptic)();
      }
      committed.set(true);
      const direction = event.translationX < 0 ? -1 : 1;
      const exitDistance = Math.max(cardWidth + 100, 420);
      translationX.set(withTiming(direction * exitDistance, {
        duration: reduceMotion ? 70 : 180,
        reduceMotion: ReduceMotion.System,
      }, (finished) => {
        if (finished) runOnJS(finishSwipe)(rating);
      }));
    })
    .onFinalize((_event, success) => {
      if (!success && !committed.get()) {
        translationX.set(withSpring(0, {
          damping: 18,
          stiffness: 240,
          reduceMotion: ReduceMotion.System,
        }));
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const width = Math.max(cardWidth, 280);
    const rotation = reduceMotion
      ? 0
      : interpolate(translationX.value, [-width, 0, width], [-5, 0, 5], Extrapolation.CLAMP);
    return { transform: [{ translateX: translationX.value }, { rotate: `${rotation}deg` }] };
  });
  const keepLearningStyle = useAnimatedStyle(() => {
    const threshold = Math.max(cardWidth * SWIPE_DISTANCE_RATIO, 96);
    return {
      opacity: interpolate(
        translationX.value,
        [-threshold, -SWIPE_ACTIVE_OFFSET, 0],
        [1, 0, 0],
        Extrapolation.CLAMP,
      ),
    };
  });
  const knowThisStyle = useAnimatedStyle(() => {
    const threshold = Math.max(cardWidth * SWIPE_DISTANCE_RATIO, 96);
    return {
      opacity: interpolate(
        translationX.value,
        [0, SWIPE_ACTIVE_OFFSET, threshold],
        [0, 0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(event) => setCardWidth(Math.round(event.nativeEvent.layout.width))}
        style={[styles.card, cardStyle]}
        testID={`swipe-card-${word.id}`}>
        {children}
        <SwipeOverlay
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
        />
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
