import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { PlayActivity } from './model';

// Small native illustrations stay crisp in both themes, without loading remote artwork.
export function ActivityPreview({ activity, selected }: { activity: PlayActivity; selected: boolean }) {
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const lift = useSharedValue(0);
  useEffect(() => {
    if (selected && !reducedMotion) lift.set(withSequence(withTiming(-4, { duration: 140 }), withTiming(0, { duration: 220 })));
    else lift.set(0);
    return () => cancelAnimation(lift);
  }, [lift, reducedMotion, selected]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  const line = (width: number, accent = false) => <View style={{ width, height: 4, borderRadius: 2, backgroundColor: accent ? theme.primary : theme.border }}/>;
  const card = { backgroundColor: theme.surface, borderColor: theme.border };
  return <View aria-hidden accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.canvas, { backgroundColor: theme.primarySoft }]}>
    <Animated.View style={[styles.drawing, motion]}>
      {activity === 'cards' ? <>
        <View style={[styles.backCard, card, { transform: [{ rotate: '-9deg' }] }]}/>
        <View style={[styles.word, card]}>
          <View style={styles.wordHeading}><AppText allowFontScaling={false} style={styles.term}>hello</AppText><Ionicons name="volume-high" size={15} color={theme.primary}/></View>
          <AppText allowFontScaling={false} style={[styles.phonetic, { color: theme.muted }]}>/həˈləʊ/</AppText>
          {line(55, true)}{line(39)}
        </View>
      </> : activity === 'recall' ? <>
        <View style={[styles.flipBack, card]}><Ionicons name="checkmark" size={23} color={theme.success}/></View>
        <View style={[styles.flipFront, card]}><AppText allowFontScaling={false} style={styles.term}>hello</AppText><View style={styles.flipRule}/></View>
        <View style={[styles.turn, { backgroundColor: theme.primary }]}><Ionicons name="sync" size={16} color={theme.onPrimary}/></View>
      </> : activity === 'matching' ? <View style={styles.match}>
        <View style={[styles.connector, { backgroundColor: theme.primary }]}/>
        {[0, 1, 2, 3].map((index) => <View key={index} style={[styles.tile, card, (index === 0 || index === 3) && { borderColor: theme.primary, backgroundColor: theme.surface }]}>
          {index === 0 || index === 3 ? <Ionicons name="checkmark" size={13} color={theme.primary}/> : line(23)}
        </View>)}
      </View> : <View style={[styles.sentence, card]}>
        <View style={styles.sentenceLine}>{line(21)}{line(31)}</View>
        <View style={styles.sentenceLine}>{line(13)}<View style={[styles.blank, { borderColor: theme.primary }]}/>{line(16)}</View>
        <View style={[styles.answer, { backgroundColor: theme.primary }]}><AppText allowFontScaling={false} style={[styles.answerText, { color: theme.onPrimary }]}>hello</AppText><Ionicons name="arrow-up" size={11} color={theme.onPrimary}/></View>
      </View>}
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  canvas: { height: 90, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  drawing: { width: 118, height: 78, alignItems: 'center', justifyContent: 'center' },
  backCard: { position: 'absolute', width: 77, height: 62, borderWidth: 1, borderRadius: 8, left: 15, top: 10 },
  word: { width: 86, padding: 9, gap: 5, borderWidth: 1, borderRadius: 9, transform: [{ rotate: '4deg' }] },
  wordHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  term: { fontFamily: 'Fraunces_600SemiBold', fontSize: 15, lineHeight: 18 },
  phonetic: { fontSize: 8, lineHeight: 10 },
  flipBack: { position: 'absolute', width: 55, height: 58, borderWidth: 1, borderRadius: 8, right: 8, top: 6, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '13deg' }] },
  flipFront: { width: 60, height: 62, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', left: -16, transform: [{ rotate: '-12deg' }] },
  flipRule: { width: 24, height: 3, borderRadius: 2, backgroundColor: '#A99EE4', marginTop: 8 },
  turn: { position: 'absolute', right: 22, bottom: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  match: { width: 108, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  tile: { width: 43, height: 26, borderWidth: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  connector: { position: 'absolute', width: 68, height: 3, top: 31, left: 20, transform: [{ rotate: '30deg' }] },
  sentence: { width: 102, borderRadius: 9, borderWidth: 1, padding: 10, gap: 8, transform: [{ rotate: '-4deg' }] },
  sentenceLine: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  blank: { width: 35, height: 9, borderBottomWidth: 2 },
  answer: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  answerText: { fontSize: 10, lineHeight: 12 },
});
