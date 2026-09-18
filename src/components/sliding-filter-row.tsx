import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { cancelAnimation, interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { spacing, typeScale } from '@/theme/tokens';

const transition = { duration: 250, reduceMotion: ReduceMotion.System };

export interface FilterOption<T extends string> {
  id: T;
  label: string;
  group?: string;
  folder?: boolean;
  accessibilityLabel?: string;
}

export function SlidingFilterRow<T extends string>({ options, selected, onSelect, testID, accessibilityLabel, itemRole = 'tab', style }: {
  options: FilterOption<T>[];
  selected: T;
  onSelect(filter: T): void | Promise<void>;
  testID: string;
  accessibilityLabel?: string;
  itemRole?: 'tab' | 'button';
  style?: StyleProp<ViewStyle>;
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

  return <ScrollView testID={`${testID}-filter-scroll`} horizontal style={style} accessibilityLabel={accessibilityLabel} accessibilityRole={itemRole === 'tab' ? 'tablist' : undefined} showsHorizontalScrollIndicator={false}>
    <View style={styles.tabs}>
      {options.map(({ id }) => layouts[id] ? <View key={`surface-${id}`} pointerEvents="none" style={[styles.surface, { left: layouts[id].x, width: layouts[id].width, height: layouts[id].height, backgroundColor: theme.surface, borderColor: theme.border }]}/> : null)}
      <Animated.View testID={`${testID}-selection-pill`} pointerEvents="none" style={[styles.pill, { backgroundColor: theme.primary, opacity: target ? 1 : 0 }, pill]}/>
      {options.map((option, index) => {
        const group = option.group;
        const startsGroup = group && group !== options[index - 1]?.group;
        return <Fragment key={option.id}>
          {startsGroup ? <View style={[styles.groupLabel, { borderLeftColor: theme.border }]}><AppText variant="caption" style={{ color: theme.muted }}>{group}</AppText></View> : null}
          <FilterTab itemRole={itemRole} option={option} selected={selected === option.id} onSelect={onSelect} onLayout={(layout) => measure(option.id, layout)}/>
        </Fragment>;
      })}
    </View>
  </ScrollView>;
}

function FilterTab<T extends string>({ option, selected, onSelect, onLayout, itemRole }: {
  option: FilterOption<T>;
  itemRole: 'tab' | 'button';
  selected: boolean;
  onSelect(filter: T): void | Promise<void>;
  onLayout(layout: LayoutRectangle): void;
}) {
  const theme = useAppTheme();
  const progress = useSharedValue(selected ? 1 : 0);
  useLayoutEffect(() => {
    progress.set(withTiming(selected ? 1 : 0, transition));
    return () => cancelAnimation(progress);
  }, [selected, progress]);
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(progress.value, [0, 1], [theme.text, '#FFFFFF']) }));
  return <Pressable accessibilityRole={itemRole} accessibilityLabel={option.accessibilityLabel ?? `Show ${option.label} words`} accessibilityState={{ selected }} aria-selected={selected} onPress={() => void onSelect(option.id)} onLayout={(event) => onLayout(event.nativeEvent.layout)} style={styles.tab}>
    {option.folder ? <Ionicons name="folder-outline" size={16} color={selected ? '#FFFFFF' : theme.text} aria-hidden/> : null}
    <Animated.Text numberOfLines={1} ellipsizeMode="tail" style={[styles.label, labelStyle]}>{option.label}</Animated.Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm, position: 'relative' },
  surface: { position: 'absolute', top: 0, borderRadius: 22, borderWidth: 1 },
  pill: { position: 'absolute', top: 0, left: 0, borderRadius: 22 },
  groupLabel: { alignSelf: 'center', borderLeftWidth: 1, paddingLeft: spacing.md, marginLeft: spacing.xs },
  tab: { flexDirection: 'row', gap: spacing.xs, minWidth: 44, maxWidth: 220, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'transparent', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', fontSize: typeScale.bodySmall, lineHeight: 20 },
});
