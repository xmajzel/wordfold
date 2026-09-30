import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { ActivityCalendar, MomentumCard, WordGarden } from './garden-view';
import { nextGardenTree, summarizeGarden, type ProgressEvent } from './model';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View, createAnimatedComponent: (component: unknown) => component },
  FadeIn: { duration: () => ({ reduceMotion: () => undefined }) }, ReduceMotion: { System: 'system' },
  useSharedValue: (value: unknown) => ({ value, set: jest.fn() }), useAnimatedStyle: () => ({}), withSpring: (value: unknown) => value,
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
const now = new Date('2026-09-30T12:00:00Z');
const events: ProgressEvent[] = Array.from({ length: 10 }, (_, i) => ({ type: 'rating', value: 'understood', occurred_at: `2026-09-${21 + i}T10:00:00Z`, practice_date: `2026-09-${21 + i}` }));

describe('Progress garden UI', () => {
  it('celebrates momentum and keeps the planting rule clear', async () => {
    const progress = summarizeGarden(events, now);
    const view = await render(<MomentumCard progress={progress}/>);
    view.getByText('10'); view.getByText('days of showing up');
    view.getByText('TODAY COMPLETE'); view.getByText('Personal best · 10 days');
    view.getByText('Next milestone · 20 days');
  });
  it('welcomes new and returning learners without a large zero', async () => {
    const view = await render(<MomentumCard progress={summarizeGarden([], now)}/>);
    view.getByText('Small beginnings.\nBeautiful growth.');
    expect(view.queryByText('0')).toBeNull();
    await view.rerender(<MomentumCard progress={summarizeGarden(events, new Date('2026-10-03T12:00:00Z'))}/>);
    view.getByText('Welcome back.'); view.getByText('Your garden kept everything you earned.');
  });
  it('locks repeated planting taps, reports failure and allows retry', async () => {
    let resolve: (value: null) => void = () => undefined;
    const plant = jest.fn().mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(nextGardenTree(events, now));
    const view = await render(<WordGarden progress={summarizeGarden(events, now)} plantTree={plant}/>);
    const button = view.getByTestId('plant-garden-tree');
    await fireEvent.press(button); await fireEvent.press(button);
    expect(plant).toHaveBeenCalledTimes(1);
    resolve(null);
    await waitFor(() => view.getByText('Plant your tree'));
    await fireEvent.press(button);
    await waitFor(() => view.getByRole('alert'));
    await fireEvent.press(button);
    await waitFor(() => expect(plant).toHaveBeenCalledTimes(3));
    const tree = nextGardenTree(events, now)!;
    await view.rerender(<WordGarden progress={summarizeGarden([...events, {type: 'garden_tree', value: '1', occurred_at: tree.plantedAt, practice_date: tree.earnedOn}], now)} plantTree={plant}/>);
    await waitFor(() => view.getByText('A new tree, grown from your practice.'));
    view.getByText('Tree 1 · 10 practice days');
  });
  it('announces date-specific activity when selecting a calendar cell', async () => {
    const view = await render(<ActivityCalendar progress={summarizeGarden(events, now)}/>);
    for (let index = 0; index < 9; index += 1) await fireEvent.press(view.getByRole('button', { name: 'Previous date' }));
    view.getByText('Sep 21, 2026 · 1 practice action');
    expect(view.getByRole('button', {name: 'Next date'})).toBeTruthy();
  });
});

it('keeps tree stories accessible in dark mode and clears a stale selection after sync', async () => {
  const scheme = jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
  try {
    const tree = nextGardenTree(events, now)!;
    const progress = summarizeGarden([...events, { type: 'garden_tree', value: '1', occurred_at: tree.plantedAt, practice_date: tree.earnedOn }], now);
    const view = await render(<WordGarden progress={progress} plantTree={async () => null}/>);
    await fireEvent.press(view.getByRole('button', { name: 'Tree 1, earned Sep 30, 2026. Show its story.' }));
    view.getByText('Tree 1 · 10 practice days');
    await view.rerender(<WordGarden progress={summarizeGarden([], now)} plantTree={async () => null}/>);
    expect(view.queryByText('Tree 1 · 10 practice days')).toBeNull();
    view.getByText('Your first ten practice days will grow a tree here.');
  } finally { scheme.mockRestore(); }
});
