import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { cefrLevels } from '@/data/cefr-levels';
import type { CourseId } from '@/domain/courses';
import type { LearningFilter, Word } from '@/domain/types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import { ActivityPreview } from './activity-preview';
import { playSelection, scopedPlayWords, type PlayActivity, type PlayConfig } from './model';

const activities = [
  { value: 'cards', label: 'Word cards', description: 'Read, listen, explore.' },
  { value: 'recall', label: 'Flashcards', description: 'Think, flip, remember.' },
  { value: 'matching', label: 'Match pairs', description: 'Find what belongs together.' },
  { value: 'sentence', label: 'Fill the gap', description: 'Bring a sentence to life.' },
] satisfies { value: PlayActivity; label: string; description: string }[];
const statuses = [{ value: 'all', label: 'All', icon: 'layers-outline' }, { value: 'learning', label: 'Still learning', icon: 'refresh-outline' }, { value: 'learned', label: 'Learned', icon: 'checkmark-circle-outline' }] as const;
const activityIcons: Record<PlayActivity, keyof typeof Ionicons.glyphMap> = { cards: 'reader-outline', recall: 'albums-outline', matching: 'git-compare-outline', sentence: 'create-outline', surprise: 'sparkles-outline' };
const wordCount = (count: number) => `${count} ${count === 1 ? 'word' : 'words'}`;

export function PlaySetup({ config, onChange, words, courseId, courseName, collections, ready, onStart, inTab = false }: {
  config: PlayConfig; onChange(config: PlayConfig): void; words: Word[]; courseId: CourseId; courseName: string;
  collections: { id: string; name: string }[]; ready: boolean; onStart(): void; inTab?: boolean;
}) {
  const theme = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [positions, setPositions] = useState<Partial<Record<'words' | 'include' | 'length', number>>>({});
  const [destination, setDestination] = useState<{ section: 'words' | 'include' | 'length' } | null>(null);
  const scrollMetrics = useRef({ height: 0, content: 0, offset: 0 });
  const cueVisible = useRef(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const cueOpacity = useSharedValue(0);
  const cueStyle = useAnimatedStyle(() => ({ opacity: cueOpacity.value }));
  useEffect(() => {
    cueOpacity.set(reducedMotion ? Number(canScrollDown) : withTiming(Number(canScrollDown), { duration: 160 }));
    return () => cancelAnimation(cueOpacity);
  }, [canScrollDown, cueOpacity, reducedMotion]);
  const updateScrollMetrics = (update: Partial<typeof scrollMetrics.current>) => {
    Object.assign(scrollMetrics.current, update);
    const { height, content, offset } = scrollMetrics.current;
    const visible = height > 0 && content - height - Math.max(0, offset) > 16;
    // Scroll events must not rerender all activity cards and vocabulary counts.
    if (visible !== cueVisible.current) {
      cueVisible.current = visible;
      setCanScrollDown(visible);
    }
  };
  const measureSection = (section: 'words' | 'include' | 'length', y: number) =>
    setPositions((current) => current[section] === y ? current : { ...current, [section]: y });
  const stacked = width < 360 || fontScale > 1.2;
  const [collectionPicker, setCollectionPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [showLevels, setShowLevels] = useState(false);
  const selection = useMemo(() => playSelection(words, courseId, config), [words, courseId, config]);
  const isCollection = config.filter.startsWith('collection:');
  const isLevel = config.filter !== 'all' && !isCollection;
  const needsLevel = showLevels && !isLevel;
  useEffect(() => {
    if (!destination || collectionPicker || (destination.section !== 'words' && needsLevel)) return;
    const position = positions[destination.section];
    if (position === undefined || (destination.section === 'include' && positions.words === undefined)) return;
    // Wait for the selected source's layout before moving, including modal dismissal.
    const frame = requestAnimationFrame(() => {
      const y = position + (destination.section === 'include' ? positions.words! : 0);
      const { content, height } = scrollMetrics.current;
      scrollRef.current?.scrollTo({ y: Math.min(Math.max(0, content - height), Math.max(0, y - spacing.sm)), animated: !reducedMotion });
      setDestination(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [destination, positions, collectionPicker, needsLevel, reducedMotion, config.filter]);
  const revealNext = () => {
    const next = (['words', 'include', 'length'] as const).find((section) => {
      if (needsLevel && section !== 'words') return false;
      const y = positions[section];
      return y !== undefined && y + (section === 'include' ? positions.words ?? 0 : 0) > scrollMetrics.current.offset + spacing.md;
    });
    if (next) setDestination({ section: next });
    else scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
  };
  const chooseActivity = (activity: PlayActivity) => { onChange({ ...config, activity }); setDestination({ section: 'words' }); };
  const sourceKind = showLevels || isLevel ? 'level' : isCollection ? 'collection' : 'all';
  const activity = activities.find((item) => item.value === config.activity)?.label ?? 'Surprise me';
  const source = config.filter === 'all' ? 'All vocabulary' : config.filter === 'personal' ? 'No level'
    : isCollection ? collections.find((item) => `collection:${item.id}` === config.filter)?.name ?? 'Collection unavailable' : config.filter;
  const counts = (filter: LearningFilter, status: PlayConfig['status'] = 'all') => scopedPlayWords(words, courseId, { ...config, filter, status }).length;
  const supportNote = config.activity === 'sentence' ? `${selection.supported.length} of ${selection.scoped.length} words have a suitable example sentence.`
    : `${selection.supported.length} of ${selection.scoped.length} words can form clear translation pairs.`;
  const noWords = !selection.scoped.length;
  const emptyMessage = needsLevel ? 'Choose a level to continue.' : !ready ? 'Your vocabulary is getting ready.'
    : noWords ? `No ${config.status === 'learned' ? 'learned words' : config.status === 'learning' ? 'words in progress' : 'words'} in ${source}.`
    : config.activity === 'sentence' ? 'No suitable example sentences here.' : 'Match pairs needs at least two words with distinct, short translations.';
  const openCollections = () => { setQuery(''); setCollectionPicker(true); };
  const chooseSource = (filter: LearningFilter) => { onChange({ ...config, filter }); setShowLevels(false); setDestination({ section: 'include' }); };
  const selectedStyle = (selected: boolean) => ({ borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface });
  const mark = (selected: boolean) => <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? theme.primary : theme.muted}/>;
  const collectionOptions = useMemo(() => !collectionPicker ? [] : collections.map((collection) => ({
    ...collection,
    selection: playSelection(words, courseId, { ...config, filter: `collection:${collection.id}`, status: 'all' }),
  })), [collectionPicker, collections, words, courseId, config]);

  return <>
    <ScrollView ref={scrollRef} testID="play-setup-scroll" style={styles.scroll} contentContainerStyle={styles.content}
      scrollEventThrottle={16}
      onLayout={({ nativeEvent }) => updateScrollMetrics({ height: nativeEvent.layout.height })}
      onContentSizeChange={(_width, height) => updateScrollMetrics({ content: height })}
      onScroll={({ nativeEvent }) => updateScrollMetrics({ offset: nativeEvent.contentOffset.y })}
      onScrollBeginDrag={() => setDestination(null)}>
      <View style={styles.intro}><AppText variant="title">Your words. Your way.</AppText><AppText variant="caption" style={{ color: theme.muted }}>{courseName} · No timer, no rush.</AppText></View>
      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Pick your activity</AppText>
        <View style={styles.grid}>
          {activities.map((item) => {
            const selected = config.activity === item.value;
            return <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityHint={item.description} aria-checked={selected} accessibilityState={{ checked: selected }}
              onPress={() => chooseActivity(item.value)}
              style={({ pressed }) => [styles.activity, stacked ? styles.activityRow : styles.activityGrid, selectedStyle(selected), { opacity: pressed ? 0.85 : 1 }]}>
              <View style={stacked ? styles.rowPreview : undefined}><ActivityPreview activity={item.value} selected={selected}/></View>
              <View style={styles.activityCopy}><View style={styles.activityTitle}><AppText variant="label" style={styles.flex}>{item.label}</AppText>{mark(selected)}</View>
                <AppText variant="caption" style={{ color: theme.muted }}>{item.description}</AppText></View>
            </Pressable>;
          })}
        </View>
        <Pressable accessibilityRole="radio" accessibilityLabel="Surprise me" aria-checked={config.activity === 'surprise'} accessibilityState={{ checked: config.activity === 'surprise' }} onPress={() => chooseActivity('surprise')}
          style={[styles.surprise, selectedStyle(config.activity === 'surprise')]}>
          <Ionicons name="sparkles-outline" size={22} color={theme.primary}/><View style={styles.flex}><AppText variant="label">Surprise me</AppText><AppText variant="caption" style={{ color: theme.muted }}>A different challenge each visit</AppText></View>{mark(config.activity === 'surprise')}
        </Pressable>
      </View>

      <View testID="play-words-section" onLayout={({ nativeEvent }) => measureSection('words', nativeEvent.layout.y)} style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">Which words?</AppText>
        <View style={[styles.sourcePanel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          {[
            { value: 'all', label: 'All vocabulary', detail: wordCount(counts('all')), icon: 'library-outline' as const, action: () => chooseSource('all') },
            { value: 'collection', label: 'A collection', detail: isCollection ? source : 'Choose from your library', icon: 'folder-open-outline' as const, action: openCollections },
            { value: 'level', label: 'A level', detail: isLevel ? source : 'Choose a CEFR level', icon: 'layers-outline' as const, action: () => setShowLevels(true) },
          ].map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label} aria-checked={sourceKind === item.value} accessibilityState={{ checked: sourceKind === item.value }} onPress={item.action}
            style={[styles.sourceRow, { backgroundColor: sourceKind === item.value ? theme.primarySoft : 'transparent' }]}>
            <Ionicons name={item.icon} size={21} color={theme.primary}/><View style={styles.flex}><AppText variant="label">{item.label}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{item.detail}</AppText></View>
            {mark(sourceKind === item.value)}
          </Pressable>)}
        </View>
        {sourceKind === 'level' ? <View style={styles.chips}>
          {[...cefrLevels, 'personal' as const].map((level) => {
            const count = counts(level);
            const label = level === 'personal' ? 'No level' : level;
            return <Pressable key={level} accessibilityRole="radio" accessibilityLabel={`${label}, ${wordCount(count)}`} aria-checked={config.filter === level} accessibilityState={{ checked: config.filter === level, disabled: count === 0 }} disabled={count === 0}
              onPress={() => chooseSource(level)} style={[styles.chip, selectedStyle(config.filter === level), { opacity: count ? 1 : 0.5 }]}><AppText variant="label">{label} · {count}</AppText></Pressable>;
          })}
        </View> : null}
        {!needsLevel ? <View testID="play-include-section" style={styles.section} onLayout={({ nativeEvent }) => measureSection('include', nativeEvent.layout.y)}>
          <AppText variant="caption" style={{ color: theme.muted }}>Include</AppText>
          <View style={[styles.statusChoices, stacked && styles.statusChoicesStacked]}>{statuses.map((item) => {
            const count = counts(config.filter, item.value);
            return <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={`${item.label}, ${wordCount(count)}`} aria-checked={config.status === item.value} accessibilityState={{ checked: config.status === item.value }} onPress={() => { onChange({ ...config, status: item.value }); setDestination({ section: 'length' }); }}
              style={[styles.statusChoice, stacked && styles.statusChoiceStacked, selectedStyle(config.status === item.value)]}>
                <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.statusIconRow}>
                  <Ionicons name={item.icon} size={20} color={config.status === item.value ? theme.primary : theme.muted}/>
                  <AppText variant="label" style={{ color: config.status === item.value ? theme.primary : theme.muted }}>{count}</AppText>
                </View>
                <AppText variant="caption" style={[styles.statusLabel, stacked && styles.statusLabelStacked]}>{item.label}</AppText>
              </Pressable>;
          })}</View>
        </View> : null}
      </View>

      {!needsLevel ? <View testID="play-length-section" onLayout={({ nativeEvent }) => measureSection('length', nativeEvent.layout.y)} style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">How much today?</AppText>
        <View style={[styles.lengths, stacked && styles.lengthsStacked]}>
          {[{ value: 'quick' as const, label: 'Quick 10', description: 'A short practice', count: playSelection(words, courseId, { ...config, length: 'quick' }).count, icon: 'flash-outline' as const },
            { value: 'all' as const, label: 'All words', description: 'The whole selection', count: selection.supported.length, icon: 'albums-outline' as const }].map((item) =>
            <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityHint={`${item.description}, ${wordCount(item.count)}`} aria-checked={config.length === item.value} accessibilityState={{ checked: config.length === item.value }}
              onPress={() => onChange({ ...config, length: item.value })} style={[styles.length, stacked && { flexBasis: 'auto' }, selectedStyle(config.length === item.value)]}>
              <View style={styles.activityTitle}><Ionicons name={item.icon} size={22} color={theme.primary}/>{mark(config.length === item.value)}</View>
              <AppText variant="label">{item.label}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{item.description} · {wordCount(item.count)}</AppText>
            </Pressable>)}
        </View>
        {selection.supported.length < selection.scoped.length ? <AppText variant="caption" style={{ color: theme.muted }}>{supportNote}</AppText> : null}
      </View> : null}
    </ScrollView>

    <SafeAreaView testID="play-setup-footer" edges={inTab ? [] : ['bottom']} style={styles.footer}>
      <Animated.View testID="play-scroll-cue" style={cueStyle} pointerEvents={canScrollDown ? 'auto' : 'none'}
        accessibilityElementsHidden={!canScrollDown} importantForAccessibility={canScrollDown ? 'auto' : 'no-hide-descendants'} aria-hidden={!canScrollDown}>
        <Pressable accessibilityRole="button" accessibilityLabel="More options below" disabled={!canScrollDown} onPress={revealNext} style={styles.scrollCue}>
          <AppText variant="caption" style={{ color: theme.primary }}>More options below</AppText>
          <Ionicons name="chevron-down" size={18} color={theme.primary} accessible={false}/>
        </Pressable>
      </Animated.View>
      <View style={[styles.practicePanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.practiceSummary}>
          <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.practiceIcon, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name={activityIcons[config.activity]} size={22} color={theme.primary}/>
          </View>
          <View style={styles.practiceCopy}>
            <AppText variant="label">{activity} · {wordCount(needsLevel ? 0 : selection.count)}</AppText>
            {selection.count > 0 && !needsLevel && ready ? <AppText variant="caption" style={{ color: theme.muted }}>{source} · {config.status === 'all' ? 'All stages' : statuses.find((item) => item.value === config.status)!.label}</AppText> : null}
          </View>
        </View>
      {selection.count > 0 && !needsLevel && ready ? null : <View style={styles.empty}>
        <AppText accessibilityLiveRegion="polite" variant="caption" style={{ color: theme.muted }}>{emptyMessage}</AppText>
        {!needsLevel && ready ? <Pressable accessibilityRole="button" accessibilityLabel={noWords ? counts('all') ? 'Show all words' : 'Open Library' : 'Try Word cards'} onPress={() => noWords && !counts('all') ? router.navigate('/(tabs)/library' as never) : noWords ? onChange({ ...config, filter: counts(config.filter) ? config.filter : 'all', status: 'all' }) : onChange({ ...config, activity: 'cards' })} style={styles.fix}>
          <AppText variant="label" style={{ color: theme.primary }}>{noWords ? counts('all') ? 'Show all words' : 'Open Library' : 'Try Word cards'}</AppText><Ionicons name="arrow-forward" size={16} color={theme.primary}/>
        </Pressable> : null}
      </View>}
      <PrimaryButton label="Start practice" icon={<Ionicons name="play" size={17} color={theme.onPrimary} accessible={false}/>} disabled={!ready || !selection.count || needsLevel} onPress={onStart}/>
      </View>
    </SafeAreaView>

    <Modal visible={collectionPicker} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setCollectionPicker(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => setCollectionPicker(false)}/>
        <SafeAreaView edges={['bottom']} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.canvas }]}>
          <View style={styles.sheetHeader}><AppText variant="heading" style={styles.flex}>Your collections</AppText><Pressable accessibilityRole="button" accessibilityLabel="Close collection picker" onPress={() => setCollectionPicker(false)} style={styles.close}><Ionicons name="close" size={24} color={theme.text}/></Pressable></View>
          <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name="search" size={20} color={theme.muted}/><TextInput accessibilityLabel="Search collections" placeholder="Find a collection" placeholderTextColor={theme.muted} value={query} onChangeText={setQuery} autoCorrect={false} style={[styles.searchInput, { color: theme.text }]}/></View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.pickerList} contentContainerStyle={styles.options}>
            {collectionOptions.filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`${item.name}, ${wordCount(item.selection.scoped.length)}`} aria-checked={config.filter === `collection:${item.id}`} accessibilityState={{ checked: config.filter === `collection:${item.id}` }}
              onPress={() => { chooseSource(`collection:${item.id}`); setCollectionPicker(false); }} style={[styles.collection, selectedStyle(config.filter === `collection:${item.id}`)]}>
              <Ionicons name="folder-outline" size={22} color={item.selection.supported.length ? theme.primary : theme.muted}/><View style={styles.flex}><AppText variant="label">{item.name}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{item.selection.scoped.length === 0 ? 'No words in this language' : !item.selection.supported.length ? `No words ready for ${activity}` : wordCount(item.selection.scoped.length)}</AppText></View>{mark(config.filter === `collection:${item.id}`)}
            </Pressable>)}
            {!collections.length ? <AppText style={{ color: theme.muted }}>No collections yet. You can create one in Library, or practise All vocabulary.</AppText> : !collectionOptions.some((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ? <AppText style={{ color: theme.muted }}>No collections match “{query.trim()}”. Try another name.</AppText> : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  scroll: { flex: 1 }, content: { gap: spacing.xl, paddingBottom: spacing.xl }, intro: { gap: spacing.xs, paddingTop: spacing.sm },
  section: { gap: spacing.md }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  activity: { padding: spacing.sm, borderWidth: 1.5, borderRadius: radii.card, gap: spacing.sm }, activityGrid: { width: '48.5%', flexGrow: 1 },
  activityRow: { width: '100%', flexDirection: 'row', alignItems: 'center' }, rowPreview: { width: 118 }, activityCopy: { flex: 1, gap: spacing.xs },
  activityTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs }, flex: { flex: 1 },
  surprise: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderRadius: radii.control },
  sourcePanel: { borderWidth: 1, borderRadius: radii.control, padding: spacing.xs, gap: spacing.xs }, sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 10, minHeight: 60 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center', borderWidth: 1, borderRadius: radii.pill },
  lengths: { flexDirection: 'row', gap: spacing.sm }, lengthsStacked: { flexDirection: 'column' }, length: { flexGrow: 1, flexBasis: 0, padding: spacing.md, gap: spacing.xs, borderWidth: 1.5, borderRadius: radii.control },
  statusChoices: { flexDirection: 'row', gap: spacing.sm }, statusChoicesStacked: { flexDirection: 'column' },
  statusChoice: { flex: 1, minHeight: 68, borderWidth: 1, borderRadius: radii.control, padding: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  statusChoiceStacked: { flex: 0, flexDirection: 'row', minHeight: 48, justifyContent: 'flex-start', gap: spacing.md },
  statusIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, statusLabel: { textAlign: 'center' }, statusLabelStacked: { flex: 1, textAlign: 'left' },
  scrollCue: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  footer: { paddingTop: spacing.xs, paddingBottom: spacing.sm },
  practicePanel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.md, gap: spacing.md },
  practiceSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  practiceIcon: { width: 40, height: 40, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  practiceCopy: { flex: 1, gap: spacing.xs }, empty: { gap: spacing.xs }, fix: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }, sheet: { maxHeight: '85%', borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: spacing.lg, gap: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.control, paddingHorizontal: spacing.md }, searchInput: { flex: 1, minHeight: 48, fontFamily: 'Inter_400Regular', fontSize: 16 },
  pickerList: { flexGrow: 0 }, options: { gap: spacing.sm, paddingBottom: spacing.sm }, collection: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 64, borderWidth: 1, borderRadius: radii.control },
});
