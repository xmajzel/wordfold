import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import type { GardenProgress, GardenTree } from './model';

const treeArtwork = require('../../../assets/garden/tree.png');
const formatDate = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date.length === 10 ? `${date}T12:00:00` : date));

export function MomentumCard({ progress }: { progress: GardenProgress }) {
  const dark = useColorScheme() === 'dark';
  const warm = dark ? '#3E2B2A' : '#FFF0E5';
  const ink = dark ? '#FFE1C9' : '#713D2A';
  const quiet = dark ? '#E8B99F' : '#8E5C46';
  const streak = progress.currentStreak;
  const returning = progress.practiceDays > 0 && !streak;
  return <View style={[styles.momentum, { backgroundColor: warm, borderColor: dark ? '#654333' : '#F2D9C7' }]}>
    <View style={styles.momentumTop}>
      <AppText variant="caption" style={{ color: quiet }}>{progress.todayComplete ? 'TODAY COMPLETE' : returning ? 'ROOM TO BEGIN AGAIN' : 'YOUR MOMENTUM'}</AppText>
      <Ionicons name={progress.todayComplete ? 'checkmark-circle' : 'sunny-outline'} size={18} color={quiet} accessible={false}/>
    </View>
    <View style={styles.momentumBody}>
      <View style={styles.momentumCopy}>
        {streak > 0 ? <><AppText variant="display" style={[styles.streakNumber, { color: ink }]}>{streak}</AppText><AppText variant="heading" style={{ color: ink }}>{streak === 1 ? 'day' : 'days'} of showing up</AppText></>
          : <AppText variant="title" style={{ color: ink }}>{returning ? 'Welcome back.' : 'Small beginnings.\nBeautiful growth.'}</AppText>}
        <AppText variant="caption" style={{ color: quiet }}>{returning ? 'Your garden kept everything you earned.' : 'A little practice. Real momentum.'}</AppText>
      </View>
      <View style={[styles.flameHalo, { backgroundColor: dark ? '#51372C' : '#FFE3C6' }]} accessible={false}>
        <Ionicons name={streak ? 'flame' : 'flame-outline'} size={Math.min(74, 42 + streak * 2)} color={dark ? '#FFC080' : '#D97736'}/>
      </View>
    </View>
    <View style={[styles.momentumFooter, { borderTopColor: dark ? '#654333' : '#EBCFBB' }]}>
      <AppText variant="caption" style={{ color: quiet }}>Personal best · {progress.personalBest} {progress.personalBest === 1 ? 'day' : 'days'}</AppText>
      <AppText variant="caption" style={{ color: quiet }}>Next milestone · {progress.nextStreakMilestone} days</AppText>
    </View>
  </View>;
}

export function WordGarden({ progress, plantTree }: { progress: GardenProgress; plantTree(): Promise<GardenTree | null> }) {
  const theme = useAppTheme();
  const dark = useColorScheme() === 'dark';
  const green = dark ? '#9ED2AB' : '#376B51';
  const [selected, setSelected] = useState<GardenTree | null>(null);
  const [planting, setPlanting] = useState(false);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plantingLock = useRef(false);
  const plant = async () => {
    if (plantingLock.current) return;
    plantingLock.current = true;
    setPlanting(true); setError(null); setCelebration(null);
    try {
      const tree = await plantTree();
      if (tree) { setSelected(tree); setCelebration('A new tree, grown from your practice.'); }
    } catch { setError('Your tree could not be planted. Please try again.'); }
    finally { plantingLock.current = false; setPlanting(false); }
  };
  const selectedTree = selected ? progress.trees.find((tree) => tree.ordinal === selected.ordinal) : null;
  const ready = progress.readyToPlant > 0;
  const visibleTrees = progress.trees.slice(-3);
  return <View style={styles.gardenGroup}>
    <View style={[styles.garden, { backgroundColor: dark ? '#22352F' : '#ECF4EC', borderColor: dark ? '#3F5848' : '#D6E5D7' }]}>
      <View style={styles.gardenTitle}><View style={styles.flex}><AppText variant="title" style={{ color: green }}>Your word garden</AppText><AppText variant="caption" style={{ color: green }}>Every tree is practice that stays with you.</AppText></View><Ionicons name="leaf-outline" color={green} size={22} accessible={false}/></View>
      <View style={styles.meadow}>
        <View style={[styles.ground, { backgroundColor: dark ? '#314B39' : '#DCEBD6' }]} accessible={false}/>
        {visibleTrees.length ? visibleTrees.map((tree, index) => <Pressable key={tree.ordinal} accessibilityRole="button" accessibilityLabel={`Tree ${tree.ordinal}, earned ${formatDate(tree.earnedOn)}. Show its story.`} onPress={() => { setSelected(tree); setCelebration(null); }} style={styles.treePlot}>
          <Animated.View entering={FadeIn.duration(500).reduceMotion(ReduceMotion.System)} style={styles.treeArt}>
            <Image source={treeArtwork} contentFit="contain" style={{ width: '100%', height: 142 + (index % 2) * 22 }} accessible={false}/>
          </Animated.View>
          <AppText variant="caption" style={{ color: green }}>Tree {tree.ordinal}</AppText>
        </Pressable>) : <View style={styles.emptyGarden}><Ionicons name="leaf" size={38} color={green} accessible={false}/><AppText variant="heading" style={{ color: green }}>A place for what you grow.</AppText><AppText variant="caption" style={[styles.center, { color: green }]}>Your first ten practice days will grow a tree here.</AppText></View>}
      </View>
      <View style={styles.gardenFooter}><AppText variant="label" style={{ color: green }}>{progress.trees.length} {progress.trees.length === 1 ? 'tree' : 'trees'} planted</AppText><AppText variant="caption" style={{ color: green }}>{progress.practiceDays} practice {progress.practiceDays === 1 ? 'day' : 'days'} · all languages</AppText></View>
      {progress.trees.length > 3 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.history} accessibilityLabel="All planted trees">{progress.trees.map((tree) => <Pressable key={tree.ordinal} onPress={() => { setSelected(tree); setCelebration(null); }} accessibilityRole="button" accessibilityLabel={`Tree ${tree.ordinal}, earned ${formatDate(tree.earnedOn)}`} style={[styles.historyTree, { borderColor: green }]}><Ionicons name="leaf-outline" size={16} color={green}/><AppText variant="caption" style={{ color: green }}>{tree.ordinal}</AppText></Pressable>)}</ScrollView>}
      {selectedTree && <View style={[styles.treeStory, { borderColor: dark ? '#3F5848' : '#D6E5D7' }]} accessibilityLiveRegion="polite"><AppText variant="label" style={{ color: green }}>Tree {selectedTree.ordinal} · {selectedTree.ordinal * 10} practice days</AppText><AppText variant="caption" style={{ color: green }}>Earned {formatDate(selectedTree.earnedOn)} · Planted {formatDate(selectedTree.plantedAt)}</AppText><AppText variant="caption" style={{ color: green }}>A lasting reminder of the days you returned.</AppText></View>}
      {celebration && selectedTree && <Animated.View entering={FadeIn.duration(400).reduceMotion(ReduceMotion.System)} accessibilityLiveRegion="polite"><AppText variant="label" style={[styles.center, { color: green }]}>{celebration}</AppText></Animated.View>}
    </View>
    <View style={[styles.nextTree, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.nextTreeTop}><View style={[styles.sprout, { backgroundColor: dark ? '#283E33' : '#EAF3E8' }]}><Ionicons name="leaf-outline" size={28} color={green} accessible={false}/></View><View style={styles.flex}><AppText variant="heading">{ready ? 'A tree is ready to plant' : 'Your next tree is growing'}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{ready ? `${progress.readyToPlant} earned ${progress.readyToPlant === 1 ? 'tree is' : 'trees are'} waiting for you.` : `${progress.daysTowardNextTree} of 10 practice days`}</AppText></View></View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 10, now: ready ? 10 : progress.daysTowardNextTree }} accessibilityLabel="Practice days toward your next tree" style={[styles.progressTrack, { backgroundColor: theme.raised }]}><View style={[styles.progressFill, { width: `${ready ? 100 : progress.daysTowardNextTree * 10}%`, backgroundColor: green }]}/></View>
      <AppText variant="caption" style={{ color: theme.muted }}>Rate a word or answer in Play to grow. Days add up, even with breaks.</AppText>
      {ready && <PrimaryButton testID="plant-garden-tree" label={planting ? 'Planting…' : 'Plant your tree'} onPress={() => void plant()} loading={planting} disabled={planting} icon={<Ionicons name="leaf" size={18} color={theme.onPrimary}/>}/>}
      {error && <AppText variant="caption" accessibilityRole="alert" style={{ color: theme.danger }}>{error}</AppText>}
    </View>
  </View>;
}

export function ActivityCalendar({ progress }: { progress: GardenProgress }) {
  const theme = useAppTheme();
  const dark = useColorScheme() === 'dark';
  const colors = dark ? ['#322D48', '#524776', '#7162A1', '#9685C6', '#C3B4ED'] : ['#EFEDF7', '#DCD5F2', '#B8A9E1', '#947ECC', '#6A50AC'];
  const [selected, setSelected] = useState<string | null>(null);
  const day = progress.activity.find((item) => item.date === selected) ?? progress.activity.filter((item) => !item.future).at(-1)!;
  const dayIndex = progress.activity.findIndex((item) => item.date === day.date);
  const level = (count: number) => count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4;
  return <View style={[styles.calendar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.gardenTitle}><AppText variant="heading" style={styles.flex}>Days you came back</AppText><AppText variant="caption" style={{ color: theme.muted }}>13 weeks</AppText></View>
    <AppText variant="caption" style={{ color: theme.muted }}>A little practice leaves a mark.</AppText>
    <View accessibilityRole="image" accessibilityLabel={`13 weeks of practice, ${progress.activity.filter((item) => item.count > 0).length} active days. Use the date controls below to explore.`} style={styles.calendarGrid}><View style={styles.weekdayLabels}>{['M', '', 'W', '', 'F', '', ''].map((label, index) => <View key={index} style={styles.weekday}><AppText variant="caption" style={{ color: theme.muted }}>{label}</AppText></View>)}</View>{Array.from({ length: 13 }, (_, week) => <View key={week} style={styles.calendarWeek}>{progress.activity.slice(week * 7, week * 7 + 7).map((item) => <View key={item.date} accessible={false} style={[styles.calendarDay, { backgroundColor: item.future ? 'transparent' : colors[level(item.count)], borderColor: item.date === day.date ? theme.primary : 'transparent', borderWidth: 1.5 }]}/>)}</View>)}</View>
    <View style={styles.calendarKey}><AppText variant="caption" style={{ color: theme.muted }}>Less</AppText>{colors.map((color) => <View key={color} style={[styles.keyCell, { backgroundColor: color }]} accessible={false}/>)}<AppText variant="caption" style={{ color: theme.muted }}>More</AppText></View>
    <View style={styles.dateNavigator}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous date" disabled={dayIndex === 0} onPress={() => setSelected(progress.activity[dayIndex - 1].date)} style={styles.dateButton}><Ionicons name="chevron-back" size={20} color={dayIndex === 0 ? theme.border : theme.primary}/></Pressable>
      <AppText variant="caption" accessibilityLiveRegion="polite" style={[styles.flex, styles.center, { color: theme.muted }]}>{formatDate(day.date)} · {day.count} {day.count === 1 ? 'practice action' : 'practice actions'}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Next date" disabled={dayIndex === progress.activity.length - 1 || progress.activity[dayIndex + 1]?.future} onPress={() => setSelected(progress.activity[dayIndex + 1].date)} style={styles.dateButton}><Ionicons name="chevron-forward" size={20} color={progress.activity[dayIndex + 1]?.future ? theme.border : theme.primary}/></Pressable>
    </View>
    <AppText variant="caption" style={{ color: theme.muted }}>{progress.practiceActions} practice {progress.practiceActions === 1 ? 'action' : 'actions'} across all languages. Ratings and Play answers count; card views do not.</AppText>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 }, center: { textAlign: 'center' },
  momentum: { padding: spacing.lg, borderRadius: radii.card, borderWidth: 1, gap: spacing.md },
  momentumTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  momentumBody: { flexDirection: 'row', alignItems: 'center', gap: 12 }, momentumCopy: { flex: 1, gap: 6 },
  streakNumber: { fontSize: 60, lineHeight: 68 }, flameHalo: { width: 80, height: 92, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  momentumFooter: { borderTopWidth: 1, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  gardenGroup: { gap: spacing.md }, garden: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  gardenTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meadow: { minHeight: 202, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginHorizontal: -12, paddingBottom: 12 },
  ground: { position: 'absolute', bottom: 6, left: 0, right: 0, height: 44, borderRadius: 100 },
  treePlot: { flex: 1, minHeight: 184, justifyContent: 'flex-end', alignItems: 'center', gap: 4 }, treeArt: { width: '120%', maxWidth: 154, alignItems: 'center' },
  emptyGarden: { flex: 1, alignItems: 'center', gap: 12, padding: 16, paddingBottom: 22 },
  gardenFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  history: { gap: 8 }, historyTree: { minHeight: 44, minWidth: 52, paddingHorizontal: 12, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  treeStory: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
  nextTree: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md }, nextTreeTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, sprout: { width: 48, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4 },
  calendar: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.sm }, calendarGrid: { flexDirection: 'row', gap: 3, marginVertical: 8 },
  weekdayLabels: { width: 14, gap: 3 }, weekday: { flex: 1, alignItems: 'center', justifyContent: 'center' }, calendarWeek: { flex: 1, gap: 3 }, calendarDay: { aspectRatio: 1, borderRadius: 3 },
  dateNavigator: { flexDirection: 'row', alignItems: 'center', gap: 4 }, dateButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  calendarKey: { flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }, keyCell: { width: 10, height: 10, borderRadius: 2 },
});
