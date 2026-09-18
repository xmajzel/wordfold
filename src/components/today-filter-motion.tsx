import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import type { LearningFilter } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { SlidingFilterRow } from '@/components/sliding-filter-row';

export function FlippingSubtitle({ text }: { text: string }) {
  const theme = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const lineHeight = Math.ceil(17 * fontScale);
  const [frame, setFrame] = useState<{ text: string; phase: 'idle' | 'exit' | 'swap' | 'enter'; revision: number }>({ text, phase: 'idle', revision: 0 });
  const progress = useSharedValue(0);
  const latestText = useRef(text);
  const animationVersion = useRef(0);

  const finishPhase = useCallback((version: number, phase: 'exit' | 'enter') => {
    if (animationVersion.current !== version) return;
    setFrame((current) => phase === 'exit'
      ? { text: latestText.current, phase: 'swap', revision: (current.revision ?? 0) + 1 }
      : { ...current, phase: 'idle' });
  }, []);

  if (reducedMotion && (frame.text !== text || frame.phase !== 'idle')) {
    setFrame({ ...frame, text, phase: 'idle' });
  } else if (!reducedMotion && frame.phase === 'idle' && frame.text !== text) {
    setFrame({ ...frame, phase: 'exit' });
  }

  useLayoutEffect(() => {
    latestText.current = text;
    if (reducedMotion) progress.set(0);
  }, [text, reducedMotion, progress]);

  useLayoutEffect(() => {
    if (reducedMotion || frame.phase === 'idle' || frame.phase === 'swap') return;
    const version = ++animationVersion.current;
    const phase = frame.phase;
    // Entry starts only after the newly mounted native text face reports layout.
    if (phase === 'enter') progress.set(1);
    progress.set(withTiming(phase === 'exit' ? -1 : 0, {
      duration: 125, reduceMotion: ReduceMotion.System,
    }, (finished) => {
      if (finished) runOnJS(finishPhase)(version, phase);
    }));
    return () => {
      animationVersion.current += 1;
      cancelAnimation(progress);
    };
  }, [frame, reducedMotion, progress, finishPhase]);

  const face = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : frame.phase === 'swap' ? 0 : 1 - Math.abs(progress.value),
    transform: [
      { perspective: 400 },
      { translateY: reducedMotion ? 0 : progress.value * lineHeight / 2 },
      { rotateX: `${reducedMotion ? 0 : -progress.value * 90}deg` },
    ],
  }));

  return <View testID="today-subtitle-slot" style={{ height: lineHeight, overflow: 'hidden' }}>
    <Animated.View
      key={frame.revision ?? 0}
      testID="today-subtitle-face"
      collapsable={false}
      renderToHardwareTextureAndroid={!reducedMotion && frame.phase !== 'idle'}
      onLayout={() => {
        if (frame.phase !== 'swap') return;
        setFrame((current) => current.phase === 'swap' && current.revision === frame.revision
          ? { ...current, phase: 'enter' }
          : current);
      }}
      style={[styles.subtitleFace, face]}>
      <AppText variant="caption" numberOfLines={1} ellipsizeMode="tail" accessibilityLabel={text} style={{ color: theme.muted }}>{reducedMotion ? text : frame.text}</AppText>
    </Animated.View>
  </View>;
}

export function SlidingFilterTabs({ options, selected, onSelect }: {
  options: { id: LearningFilter; label: string }[];
  selected: LearningFilter;
  onSelect(filter: LearningFilter): Promise<void>;
}) {
  return <SlidingFilterRow
    testID="today" style={{ flex: 1 }}
    options={options.map((option) => ({
      ...option,
      group: option.id === 'all' ? undefined : option.id.startsWith('collection:') ? 'Collections' : 'Difficulty',
      folder: option.id.startsWith('collection:'),
    }))}
    selected={selected} onSelect={onSelect}
  />;
}

const styles = StyleSheet.create({
  subtitleFace: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' },
});
