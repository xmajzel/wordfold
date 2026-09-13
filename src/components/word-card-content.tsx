import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';

import { spacing } from '@/theme/tokens';

export const WordCardScrollContext = createContext<{
  pan: PanGesture;
  setContentScrollable(scrollable: boolean): void;
} | null>(null);

/** Keep actions outside this viewport, and let overflowing text own vertical gestures. */
export function WordCardContent({ children, dense }: PropsWithChildren<{ dense: boolean }>) {
  const coordination = useContext(WordCardScrollContext);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const scrollable = viewportHeight > 0 && contentHeight > viewportHeight + 1;
  const setContentScrollable = coordination?.setContentScrollable;
  useEffect(() => {
    setContentScrollable?.(scrollable);
    return () => setContentScrollable?.(false);
  }, [scrollable, setContentScrollable]);

  const content = <ScrollView
    testID="word-card-content"
    style={styles.viewport}
    contentContainerStyle={[styles.content, dense && styles.denseContent]}
    scrollEnabled={scrollable}
    bounces={false}
    directionalLockEnabled
    nestedScrollEnabled
    onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
    onContentSizeChange={(_width, height) => setContentHeight(height)}
  >{children}</ScrollView>;

  if (!coordination) return content;
  const native = Gesture.Native().enabled(scrollable).simultaneousWithExternalGesture(coordination.pan);
  return <GestureDetector gesture={native}>{content}</GestureDetector>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  denseContent: { gap: spacing.sm },
});
