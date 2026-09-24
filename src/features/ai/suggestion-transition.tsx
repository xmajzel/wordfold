import { useLayoutEffect, useRef, type PropsWithChildren } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut, Keyframe, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { spacing } from '@/theme/tokens';

const appear = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 6 }, { scale: 0.96 }] },
  75: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1.005 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
}).duration(250).reduceMotion(ReduceMotion.System);
const disappear = FadeOut.duration(160).reduceMotion(ReduceMotion.System);
const controlsAppear = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

export function SuggestionTransition({ suggestion, children }: PropsWithChildren<{ suggestion: boolean }>) {
  const height = useSharedValue(0);
  const measured = useRef(false);
  const active = useRef(suggestion);
  useLayoutEffect(() => { active.current = suggestion; }, [suggestion]);
  const containerStyle = useAnimatedStyle(() => ({ height: height.value }));
  const measure = (event: LayoutChangeEvent) => {
    // Ignore late layout events from the outgoing content.
    if (active.current !== suggestion) return;
    const nextHeight = event.nativeEvent.layout.height;
    if (!measured.current) { height.set(nextHeight); measured.current = true; }
    else height.set(withTiming(nextHeight, { duration: suggestion ? 250 : 180, reduceMotion: ReduceMotion.System }));
  };
  return <Animated.View style={[styles.container, containerStyle]}>
    <Animated.View key={suggestion ? 'suggestion' : 'controls'} collapsable={false}
      entering={suggestion ? appear : controlsAppear} exiting={disappear}
      onLayout={measure} style={styles.content}>
      {children}
    </Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  content: { position: 'absolute', top: 0, left: 0, right: 0, gap: spacing.sm },
});
