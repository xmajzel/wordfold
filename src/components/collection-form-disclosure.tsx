import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { spacing } from '@/theme/tokens';

export function CollectionFormDisclosure({ open, gap = spacing.sm, children }: PropsWithChildren<{ open: boolean; gap?: number }>) {
  const height = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) Keyboard.dismiss();
    wasOpen.current = open;
    progress.set(withTiming(open ? 1 : 0, { duration: 220, reduceMotion: ReduceMotion.System }));
  }, [open, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value * progress.value,
    opacity: progress.value,
  }));

  return <Animated.View
    style={[styles.container, animatedStyle]}
    pointerEvents={open ? 'auto' : 'none'}
    accessibilityElementsHidden={!open}
    importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
    <View collapsable={false} style={[styles.content, { paddingTop: gap }]} onLayout={(event) => height.set(event.nativeEvent.layout.height)}>
      {children}
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  content: { position: 'absolute', top: 0, left: 0, right: 0 },
});
