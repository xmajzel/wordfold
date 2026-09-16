import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutRectangle } from 'react-native';
import Animated, { cancelAnimation, interpolateColor, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import type { LearningFilter } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { spacing, typeScale } from '@/theme/tokens';

const transition = { duration: 250, reduceMotion: ReduceMotion.System };

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

interface FilterOption { id: LearningFilter; label: string }

export function SlidingFilterTabs({ options, selected, onSelect }: {
  options: FilterOption[];
  selected: LearningFilter;
  onSelect(filter: LearningFilter): Promise<void>;
}) {
  const theme = useAppTheme();
  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
  const target = layouts[selected];
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(44);
  const positioned = useRef(false);

  useLayoutEffect(() => {
    if (!target) return;
    const animate = positioned.current;
    x.set(animate ? withTiming(target.x, transition) : target.x);
    width.set(animate ? withTiming(target.width, transition) : target.width);
    height.set(animate ? withTiming(target.height, transition) : target.height);
    positioned.current = true;
    return () => { cancelAnimation(x); cancelAnimation(width); cancelAnimation(height); };
  }, [target, x, width, height]);

  const pill = useAnimatedStyle(() => ({ width: width.value, height: height.value, transform: [{ translateX: x.value }] }));
  const measure = (id: string, layout: LayoutRectangle) => setLayouts((current) => {
    const previous = current[id];
    if (previous && previous.x === layout.x && previous.width === layout.width && previous.height === layout.height) return current;
    return { ...current, [id]: layout };
  });

  return <ScrollView testID="today-filter-scroll" horizontal style={styles.scroll} accessibilityRole="tablist" showsHorizontalScrollIndicator={false}>
    <View style={styles.tabs}>
      {options.map(({ id }) => layouts[id] ? <View key={`surface-${id}`} pointerEvents="none" style={[styles.surface, { left: layouts[id].x, width: layouts[id].width, height: layouts[id].height, backgroundColor: theme.surface, borderColor: theme.border }]}/> : null)}
      <Animated.View testID="today-selection-pill" pointerEvents="none" style={[styles.pill, { backgroundColor: theme.primary, opacity: target ? 1 : 0 }, pill]}/>
      {options.map((option) => <FilterTab key={option.id} option={option} selected={selected === option.id} onSelect={onSelect} onLayout={(layout) => measure(option.id, layout)}/>)}
    </View>
  </ScrollView>;
}

function FilterTab({ option, selected, onSelect, onLayout }: {
  option: FilterOption;
  selected: boolean;
  onSelect(filter: LearningFilter): Promise<void>;
  onLayout(layout: LayoutRectangle): void;
}) {
  const theme = useAppTheme();
  const progress = useSharedValue(selected ? 1 : 0);
  useLayoutEffect(() => {
    progress.set(withTiming(selected ? 1 : 0, transition));
    return () => cancelAnimation(progress);
  }, [selected, progress]);
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(progress.value, [0, 1], [theme.text, '#FFFFFF']) }));
  return <Pressable accessibilityRole="tab" accessibilityLabel={`Show ${option.label} words`} accessibilityState={{ selected }} aria-selected={selected} onPress={() => void onSelect(option.id)} onLayout={(event) => onLayout(event.nativeEvent.layout)} style={styles.tab}>
    <Animated.Text numberOfLines={1} style={[styles.label, labelStyle]}>{option.label}</Animated.Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  subtitleFace: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' },
  scroll: { flex: 1 },
  tabs: { flexDirection: 'row', gap: spacing.sm, position: 'relative' },
  surface: { position: 'absolute', top: 0, borderRadius: 22, borderWidth: 1 },
  pill: { position: 'absolute', top: 0, left: 0, borderRadius: 22 },
  tab: { minWidth: 44, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'transparent', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: typeScale.bodySmall, lineHeight: 20 },
});
