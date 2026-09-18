import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { SlidingFilterRow } from './sliding-filter-row';
import { StyleSheet } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import { FlippingSubtitle, SlidingFilterTabs } from './today-filter-motion';

let mockReducedMotion = false;
const mockAnimations: { target: number; shared: { value: number }; callback: (finished: boolean) => void }[] = [];
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View, Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, Text },
    ReduceMotion: { System: 'system' },
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (value: number) => React.useRef({ value, set(next: number | { target: number; callback: (finished: boolean) => void }) {
      if (typeof next === 'number') this.value = next;
      else mockAnimations.push({ ...next, shared: this });
    } }).current,
    useAnimatedStyle: (factory: () => object) => factory(),
    runOnJS: (callback: (...args: unknown[]) => void) => callback,
    withTiming: jest.fn((value: number, _config: unknown, callback?: (finished: boolean) => void) => callback ? { target: value, callback } : value),
    cancelAnimation: jest.fn(),
    interpolateColor: (value: number, _input: number[], colors: string[]) => colors[value >= 0.5 ? 1 : 0],
  };
});

beforeEach(() => { jest.clearAllMocks(); mockReducedMotion = false; mockAnimations.length = 0; });

async function finishAnimation() {
  const animation = mockAnimations.shift()!;
  animation.shared.value = animation.target;
  await act(() => animation.callback(true));
}

it('keeps one text layer and swaps labels only while the face is invisible', async () => {
  const view = await render(<FlippingSubtitle text="Showing all English words"/>);
  const slotHeight = StyleSheet.flatten(view.getByTestId('today-subtitle-slot').props.style).height;
  const target = 'Showing words in “NC1 Custom Collection with a long name”';
  await view.rerender(<FlippingSubtitle text={target}/>);
  expect(view.getAllByText(/^Showing /, { includeHiddenElements: true })).toHaveLength(1);
  expect(view.getByText('Showing all English words')).toBeTruthy();
  expect(mockAnimations).toHaveLength(1);
  expect(mockAnimations[0].target).toBe(-1);
  mockAnimations[0].shared.value = -0.5;
  await view.rerender(<FlippingSubtitle text={target}/>);
  expect(StyleSheet.flatten(view.getByTestId('today-subtitle-face').props.style).opacity).toBe(0.5);
  expect(view.queryByText(target)).toBeNull();
  await finishAnimation();
  await view.rerender(<FlippingSubtitle text={target}/>);
  expect(StyleSheet.flatten(view.getByTestId('today-subtitle-face', { includeHiddenElements: true }).props.style).opacity).toBe(0);
  expect(view.getAllByText(/^Showing /, { includeHiddenElements: true })).toHaveLength(1);
  expect(view.getByText(target, { includeHiddenElements: true })).toBeTruthy();
  expect(mockAnimations).toHaveLength(0);
  await fireEvent(view.getByTestId('today-subtitle-face', { includeHiddenElements: true }), 'layout');
  expect(mockAnimations[0].target).toBe(0);
  mockAnimations[0].shared.value = 0.5;
  await view.rerender(<FlippingSubtitle text={target}/>);
  expect(StyleSheet.flatten(view.getByTestId('today-subtitle-face').props.style).opacity).toBe(0.5);
  await finishAnimation();
  expect(view.getByLabelText(target).props.numberOfLines).toBe(1);
  expect(StyleSheet.flatten(view.getByTestId('today-subtitle-slot').props.style).height).toBe(slotHeight);
  expect(mockAnimations).toHaveLength(0);
});

it('coalesces rapid taps without restarting either visible phase', async () => {
  const view = await render(<FlippingSubtitle text="All"/>);
  await view.rerender(<FlippingSubtitle text="Personal"/>);
  const exit = mockAnimations[0];
  exit.shared.value = -0.5;
  await view.rerender(<FlippingSubtitle text="My words"/>);
  expect(mockAnimations).toHaveLength(1);
  expect(mockAnimations[0]).toBe(exit);
  expect(exit.shared.value).toBe(-0.5);
  await finishAnimation();
  expect(view.getByText('My words', { includeHiddenElements: true })).toBeTruthy();
  await fireEvent(view.getByTestId('today-subtitle-face', { includeHiddenElements: true }), 'layout');
  const enter = mockAnimations[0];
  enter.shared.value = 0.5;
  await view.rerender(<FlippingSubtitle text="NC1 lessons"/>);
  expect(mockAnimations).toHaveLength(1);
  expect(mockAnimations[0]).toBe(enter);
  expect(enter.shared.value).toBe(0.5);
  expect(view.getByText('My words', { includeHiddenElements: true })).toBeTruthy();
  await finishAnimation();
  expect(mockAnimations[0].target).toBe(-1);
  await finishAnimation();
  expect(view.getByText('NC1 lessons', { includeHiddenElements: true })).toBeTruthy();
  await fireEvent(view.getByTestId('today-subtitle-face', { includeHiddenElements: true }), 'layout');
  await finishAnimation();
  expect(mockAnimations).toHaveLength(0);
});

it('waits for the replacement native face to mount before revealing it', async () => {
  const view = await render(<FlippingSubtitle text="All"/>);
  const original = view.getByTestId('today-subtitle-face');
  const staleLayout = original.props.onLayout;
  await view.rerender(<FlippingSubtitle text="Personal"/>);
  await finishAnimation();
  const replacement = view.getByTestId('today-subtitle-face', { includeHiddenElements: true });
  expect(replacement).not.toBe(original);
  expect(mockAnimations).toHaveLength(0);
  await act(() => staleLayout());
  expect(mockAnimations).toHaveLength(0);
  await view.rerender(<FlippingSubtitle text="My words"/>);
  expect(StyleSheet.flatten(view.getByTestId('today-subtitle-face', { includeHiddenElements: true }).props.style).opacity).toBe(0);
  expect(mockAnimations).toHaveLength(0);
  await fireEvent(replacement, 'layout');
  expect(mockAnimations).toHaveLength(1);
  expect(mockAnimations[0].target).toBe(0);
});

it('ignores stale completion callbacks after Reduce Motion interrupts a flip', async () => {
  const view = await render(<FlippingSubtitle text="All"/>);
  await view.rerender(<FlippingSubtitle text="Personal"/>);
  const cancelled = mockAnimations.shift()!;
  mockReducedMotion = true;
  await view.rerender(<FlippingSubtitle text="NC1 lessons"/>);
  await act(() => cancelled.callback(true));
  expect(view.getByText('NC1 lessons')).toBeTruthy();
  expect(StyleSheet.flatten(view.getByTestId('today-subtitle-face').props.style).opacity).toBe(1);
  expect(mockAnimations).toHaveLength(0);
});

it('changes subtitle immediately without scheduling flips under Reduce Motion', async () => {
  mockReducedMotion = true;
  const view = await render(<FlippingSubtitle text="Showing all English words"/>);
  await view.rerender(<FlippingSubtitle text="Showing personal words"/>);
  expect(view.getByLabelText('Showing personal words')).toBeTruthy();
  expect(withTiming).not.toHaveBeenCalled();
});

const options = [
  { id: 'all' as const, label: 'All' },
  { id: 'personal' as const, label: 'Personal' },
  { id: 'collection:lessons' as const, label: 'NC1 Custom Collection' },
];

it('moves the pill to measured chip coordinates and widths while retaining the scroller', async () => {
  const onSelect = jest.fn(async () => undefined);
  const view = await render(<SlidingFilterTabs options={options} selected="all" onSelect={onSelect}/>);
  const scroller = view.getByTestId('today-filter-scroll');
  for (const [label, x, width] of [['All', 0, 44], ['Personal', 52, 96], ['NC1 Custom Collection', 156, 220]] as const) {
    await fireEvent(view.getByRole('tab', { name: `Show ${label} words` }), 'layout', { nativeEvent: { layout: { x, y: 0, width, height: 44 } } });
  }
  await fireEvent.press(view.getByRole('tab', { name: 'Show NC1 Custom Collection words' }));
  expect(onSelect).toHaveBeenCalledWith('collection:lessons');
  await view.rerender(<SlidingFilterTabs options={options} selected="collection:lessons" onSelect={onSelect}/>);
  // A second render observes the final values supplied by the immediate animation mock.
  await view.rerender(<SlidingFilterTabs options={options} selected="collection:lessons" onSelect={onSelect}/>);
  expect(StyleSheet.flatten(view.getByTestId('today-selection-pill').props.style)).toMatchObject({ width: 220, transform: [{ translateX: 156 }] });
  expect(view.getByTestId('today-filter-scroll')).toBe(scroller);
  expect(withTiming).toHaveBeenCalledWith(156, { duration: 250, reduceMotion: 'system' });
  await view.rerender(<SlidingFilterTabs options={options} selected="personal" onSelect={onSelect}/>);
  await view.rerender(<SlidingFilterTabs options={options} selected="all" onSelect={onSelect}/>);
  await view.rerender(<SlidingFilterTabs options={options} selected="all" onSelect={onSelect}/>);
  expect(StyleSheet.flatten(view.getByTestId('today-selection-pill').props.style)).toMatchObject({ width: 44, transform: [{ translateX: 0 }] });
});

it('remeasures the selected pill when a collection label or font size changes', async () => {
  const onSelect = jest.fn(async () => undefined);
  const view = await render(<SlidingFilterTabs options={options} selected="collection:lessons" onSelect={onSelect}/>);
  const tab = view.getByRole('tab', { name: 'Show NC1 Custom Collection words' });
  await fireEvent(tab, 'layout', { nativeEvent: { layout: { x: 156, y: 0, width: 220, height: 44 } } });
  await fireEvent(tab, 'layout', { nativeEvent: { layout: { x: 220, y: 0, width: 330, height: 58 } } });
  await view.rerender(<SlidingFilterTabs options={options} selected="collection:lessons" onSelect={onSelect}/>);
  expect(StyleSheet.flatten(view.getByTestId('today-selection-pill').props.style)).toMatchObject({ width: 330, height: 58, transform: [{ translateX: 220 }] });
});


it('labels collection and difficulty groups without adding extra selectable filters', async () => {
  const onSelect = jest.fn(async () => undefined);
  const view = await render(<SlidingFilterTabs options={[
    { id: 'all', label: 'All' }, { id: 'collection:work', label: 'Work' },
    { id: 'personal', label: 'No level' }, { id: 'C2', label: 'C2' },
  ]} selected="collection:work" onSelect={onSelect}/>);
  view.getByText('Collections');
  expect(view.getAllByText('Difficulty')).toHaveLength(1);
  expect(view.getAllByRole('tab')).toHaveLength(4);
  expect(view.getByRole('tab', { name: 'Show Work words' }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(view.getByRole('tab', { name: 'Show No level words' }));
  expect(onSelect).toHaveBeenCalledWith('personal');
});


it('animates independent collection and difficulty highlights through rapid selections', async () => {
  function LibraryFilters() {
    const [collection, setCollection] = useState('all');
    const [difficulty, setDifficulty] = useState('all');
    return <>
      <SlidingFilterRow testID="collections" options={[
        { id: 'all', label: 'All collections' }, { id: 'work', label: 'Work with a long name', folder: true },
      ]} selected={collection} onSelect={setCollection}/>
      <SlidingFilterRow testID="difficulty" options={[
        { id: 'all', label: 'All levels' }, { id: 'none', label: 'No level' }, { id: 'C2', label: 'C2' },
      ]} selected={difficulty} onSelect={setDifficulty}/>
    </>;
  }
  const view = await render(<LibraryFilters/>);
  for (const [label, x, width] of [
    ['All collections', 0, 140], ['Work with a long name', 148, 220],
    ['All levels', 0, 100], ['No level', 108, 90], ['C2', 206, 44],
  ] as const) {
    await fireEvent(view.getByRole('tab', { name: `Show ${label} words` }), 'layout', { nativeEvent: { layout: { x, y: 0, width, height: 44 } } });
  }
  const collectionsScroll = view.getByTestId('collections-filter-scroll');
  const difficultyScroll = view.getByTestId('difficulty-filter-scroll');
  await fireEvent.press(view.getByRole('tab', { name: 'Show Work with a long name words' }));
  await fireEvent.press(view.getByRole('tab', { name: 'Show No level words' }));
  await fireEvent.press(view.getByRole('tab', { name: 'Show C2 words' }));
  await fireEvent.press(view.getByRole('tab', { name: 'Show All levels words' }));
  await fireEvent.press(view.getByRole('tab', { name: 'Show C2 words' }));
  await view.rerender(<LibraryFilters/>);
  expect(view.getByRole('tab', { name: 'Show Work with a long name words' }).props.accessibilityState.selected).toBe(true);
  expect(view.getByRole('tab', { name: 'Show C2 words' }).props.accessibilityState.selected).toBe(true);
  expect(StyleSheet.flatten(view.getByTestId('collections-selection-pill').props.style)).toMatchObject({ width: 220, transform: [{ translateX: 148 }] });
  expect(StyleSheet.flatten(view.getByTestId('difficulty-selection-pill').props.style)).toMatchObject({ width: 44, transform: [{ translateX: 206 }] });
  expect(withTiming).toHaveBeenCalledWith(206, { duration: 250, reduceMotion: 'system' });
  expect(view.getByTestId('collections-filter-scroll')).toBe(collectionsScroll);
  expect(view.getByTestId('difficulty-filter-scroll')).toBe(difficultyScroll);
});
