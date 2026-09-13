import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';

import type { Word } from '@/domain/types';

import {
  getSwipeRating,
  SWIPE_ACTIVE_OFFSET,
  SwipeableWordCard,
} from './swipeable-word-card';

interface MockPan {
  enabled: jest.Mock<MockPan>;
  minDistance: jest.Mock<MockPan>;
  onBegin: jest.Mock<MockPan>;
  onUpdate: jest.Mock<MockPan, [(event: { translationX: number; translationY: number }) => void]>;
  onEnd: jest.Mock<MockPan, [(event: { translationX: number; velocityX: number; translationY?: number; velocityY?: number }) => void]>;
  onFinalize: jest.Mock<MockPan>;
}

const mockPan = {} as MockPan;
mockPan.enabled = jest.fn(() => mockPan);
mockPan.minDistance = jest.fn(() => mockPan);
mockPan.onBegin = jest.fn(() => mockPan);
mockPan.onUpdate = jest.fn<MockPan, [(event: { translationX: number; translationY: number }) => void]>(() => mockPan);
mockPan.onEnd = jest.fn<MockPan, [(event: { translationX: number; velocityX: number; translationY?: number; velocityY?: number }) => void]>(() => mockPan);
mockPan.onFinalize = jest.fn(() => mockPan);

jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    Gesture: { Pan: jest.fn(() => mockPan) },
    GestureDetector: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: jest.fn(() => 0),
    ReduceMotion: { System: 'system' },
    runOnJS: jest.fn((callback: (...args: unknown[]) => unknown) => callback),
    runOnUI: jest.fn((callback: (...args: unknown[]) => unknown) => callback),
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    useReducedMotion: jest.fn(() => false),
    useSharedValue: jest.fn((initialValue: unknown) => React.useRef({
      value: initialValue,
      get() { return this.value; },
      set(nextValue: unknown) { this.value = nextValue; },
    }).current),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

const word: Word = {
  id: 'word', collectionId: 'collection', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: null,
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'understood',
  understoodStreak: 1, lapseCount: 0, viewCount: 2,
  lastViewedAt: '2026-07-17T10:00:00.000Z', lastRatedAt: '2026-07-17T10:00:00.000Z',
  nextReviewAt: '2026-07-20T10:00:00.000Z', createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-17T10:00:00.000Z',
};

describe('SwipeableWordCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps deliberate left and right swipes to the visible actions', () => {
    expect(getSwipeRating(-106, 0, 300)).toBe('understood');
    expect(getSwipeRating(106, 0, 300)).toBe('learned');
    expect(getSwipeRating(-104, 0, 300)).toBeNull();
    expect(getSwipeRating(60, 901, 300)).toBe('learned');
    expect(getSwipeRating(60, -901, 300)).toBeNull();
  });

  it.each([
    [-110, 'understood', false],
    [110, 'learned', false],
    [-110, 'understood', true],
    [110, 'learned', true],
  ] as const)('reveals the next card and submits once (x=%i, rating=%s, reduced motion=%s)', async (translationX, rating, reducedMotion) => {
    jest.mocked(useReducedMotion).mockReturnValue(reducedMotion);
    const onSwipe = jest.fn();
    const screen = await render(
      <SwipeableWordCard word={word} active disabled={false} onSwipe={onSwipe}>
        <Text>Current word</Text>
      </SwipeableWordCard>,
    );
    await fireEvent(screen.getByTestId(`swipe-card-${word.id}`), 'layout', {
      nativeEvent: { layout: { width: 300, height: 600 } },
    });
    const end = mockPan.onEnd.mock.lastCall![0] as unknown as
      (event: { translationX: number; velocityX: number; translationY?: number; velocityY?: number }) => void;
    await act(() => end({ translationX, velocityX: 0 }));
    expect(onSwipe).not.toHaveBeenCalled();
    expect(jest.mocked(withTiming).mock.lastCall![1]?.duration).toBe(reducedMotion ? 70 : 140);
    const finish = jest.mocked(withTiming).mock.lastCall![2]!;
    await act(() => finish(true));
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith(rating);
    await act(() => end({ translationX, velocityX: 0 }));
    expect(withTiming).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['understood', false],
    ['learned', false],
    ['understood', true],
    ['learned', true],
  ] as const)('fades a %s tap before submitting, including repeated input (reduced motion=%s)', async (rating, reducedMotion) => {
    jest.mocked(useReducedMotion).mockReturnValue(reducedMotion);
    const onSwipe = jest.fn();
    const screen = await render(
      <SwipeableWordCard word={word} active disabled={false} onSwipe={onSwipe}>
        {(animateRating) => <Pressable accessibilityRole="button" onPress={() => animateRating(rating)}>
          <Text>Rate</Text>
        </Pressable>}
      </SwipeableWordCard>,
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(withTiming).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0, opacity: 0 }),
      { duration: reducedMotion ? 70 : 220, reduceMotion: 'system' }, expect.any(Function));
    expect(onSwipe).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button'));
    await act(() => mockPan.onEnd.mock.lastCall![0]({ translationX: -110, velocityX: 0 }));
    expect(withTiming).toHaveBeenCalledTimes(1);
    await act(() => jest.mocked(withTiming).mock.lastCall![2]!(true));
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith(rating);
    // Completing the fade must not restore the outgoing card before the handoff.
    const cardStyle = jest.mocked(useAnimatedStyle).mock.calls.at(-3)![0]();
    expect(cardStyle).toEqual({
      zIndex: 0, opacity: 0,
      transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }],
    });
  });

  it.each([
    [-220, 'next'], [220, 'previous'],
  ] as const)('navigates vertically without rating (%i → %s), even on a rated card', async (translationY, direction) => {
    const onSwipe = jest.fn();
    const onNavigate = jest.fn();
    const screen = await render(<SwipeableWordCard word={word} active disabled canGoBack canGoNext
      onSwipe={onSwipe} onNavigate={onNavigate}><Text>Word</Text></SwipeableWordCard>);
    await fireEvent(screen.getByTestId('swipe-card-word'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 600 } },
    });
    await act(() => mockPan.onEnd.mock.lastCall![0]({ translationX: 20, velocityX: 0, translationY, velocityY: 0 }));
    expect(onNavigate).not.toHaveBeenCalled();
    await act(() => jest.mocked(withTiming).mock.lastCall![2]!(true));
    expect(onNavigate).toHaveBeenCalledWith(direction);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it.each([-30, 220])('springs back for a short skip or a back gesture on the first card (%i)', async (translationY) => {
    const onNavigate = jest.fn();
    const screen = await render(<SwipeableWordCard word={word} active disabled={false} canGoNext
      onSwipe={jest.fn()} onNavigate={onNavigate}><Text>Word</Text></SwipeableWordCard>);
    await fireEvent(screen.getByTestId('swipe-card-word'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 600 } },
    });
    await act(() => mockPan.onEnd.mock.lastCall![0]({ translationX: 0, velocityX: 0, translationY, velocityY: 0 }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('locks a diagonal gesture to its initial vertical axis and never rates it', async () => {
    const onSwipe = jest.fn();
    const onNavigate = jest.fn();
    const screen = await render(<SwipeableWordCard word={word} active disabled={false} canGoNext
      onSwipe={onSwipe} onNavigate={onNavigate}><Text>Word</Text></SwipeableWordCard>);
    await fireEvent(screen.getByTestId('swipe-card-word'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 600 } },
    });
    await act(() => mockPan.onUpdate.mock.lastCall![0]({ translationX: 5, translationY: -25 }));
    await act(() => mockPan.onEnd.mock.lastCall![0]({ translationX: 280, velocityX: 1200, translationY: -220, velocityY: -900 }));
    await act(() => jest.mocked(withTiming).mock.lastCall![2]!(true));
    expect(onNavigate).toHaveBeenCalledWith('next');
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('allows the end card to go back and ignores a cancelled completion', async () => {
    const onNavigate = jest.fn();
    const screen = await render(<SwipeableWordCard active disabled canGoBack
      onSwipe={jest.fn()} onNavigate={onNavigate}><Text>End of batch</Text></SwipeableWordCard>);
    await fireEvent(screen.getByTestId('swipe-card-end'), 'layout', {
      nativeEvent: { layout: { width: 300, height: 600 } },
    });
    await act(() => mockPan.onEnd.mock.lastCall![0]({ translationX: 0, velocityX: 0, translationY: 220, velocityY: 0 }));
    const finish = jest.mocked(withTiming).mock.lastCall![2]!;
    await act(() => finish(false));
    expect(onNavigate).not.toHaveBeenCalled();
    await act(() => finish(true));
    expect(onNavigate).toHaveBeenCalledWith('previous');
  });

  it('shows matching overlays and accepts gestures in both axes', async () => {
    const screen = await render(
      <SwipeableWordCard word={word} active disabled={false} onSwipe={jest.fn()}>
        <Text>Word content</Text>
      </SwipeableWordCard>,
    );

    screen.getByText('KEEP LEARNING', { includeHiddenElements: true });
    screen.getByText('Review in 3–5 days', { includeHiddenElements: true });
    screen.getByText('I KNOW THIS', { includeHiddenElements: true });
    screen.getByText('Stop reviews', { includeHiddenElements: true });
    expect(mockPan.minDistance).toHaveBeenCalledWith(SWIPE_ACTIVE_OFFSET);
  });
});
