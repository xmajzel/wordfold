import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';

import type { Word } from '@/domain/types';

import {
  getSwipeRating,
  SWIPE_ACTIVE_OFFSET,
  SWIPE_VERTICAL_FAILURE_OFFSET,
  SwipeableWordCard,
} from './swipeable-word-card';

interface MockPan {
  enabled: jest.Mock<MockPan>;
  activeOffsetX: jest.Mock<MockPan>;
  failOffsetY: jest.Mock<MockPan>;
  onBegin: jest.Mock<MockPan>;
  onUpdate: jest.Mock<MockPan>;
  onEnd: jest.Mock<MockPan, [(event: { translationX: number; velocityX: number }) => void]>;
  onFinalize: jest.Mock<MockPan>;
}

const mockPan = {} as MockPan;
mockPan.enabled = jest.fn(() => mockPan);
mockPan.activeOffsetX = jest.fn(() => mockPan);
mockPan.failOffsetY = jest.fn(() => mockPan);
mockPan.onBegin = jest.fn(() => mockPan);
mockPan.onUpdate = jest.fn(() => mockPan);
mockPan.onEnd = jest.fn<MockPan, [(event: { translationX: number; velocityX: number }) => void]>(() => mockPan);
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
    useSharedValue: jest.fn((initialValue: number | boolean) => React.useRef({
      value: initialValue,
      get() { return this.value; },
      set(nextValue: number | boolean) { this.value = nextValue; },
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
      <SwipeableWordCard word={word} active disabled={false} onSwipe={onSwipe}
        nextCard={<Text>Next word</Text>}>
        <Text>Current word</Text>
      </SwipeableWordCard>,
    );
    await fireEvent(screen.getByTestId(`swipe-card-${word.id}`), 'layout', {
      nativeEvent: { layout: { width: 300 } },
    });
    const preview = screen.getByTestId('next-word-preview', { includeHiddenElements: true });
    expect(preview.props.pointerEvents).toBe('none');
    expect(screen.queryByText('Next word')).toBeNull();
    const end = mockPan.onEnd.mock.lastCall![0] as unknown as
      (event: { translationX: number; velocityX: number }) => void;
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
    expect(withTiming).toHaveBeenCalledWith(0,
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
      opacity: 0,
      transform: [{ translateX: 0 }, { rotate: '0deg' }],
    });
  });

  it.each(['tap', 'swipe'] as const)('holds a completed %s and its preview until the native viewport moves', async (input) => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
    const onSwipe = jest.fn();
    const card = (active: boolean, inViewport: boolean) => (
      <SwipeableWordCard word={word} active={active} inViewport={inViewport}
        disabled={!active} onSwipe={onSwipe} nextCard={<Text>Next word</Text>}>
        {(animateRating) => <Pressable accessibilityRole="button" onPress={() => animateRating('understood')}>
          <Text>Rate</Text>
        </Pressable>}
      </SwipeableWordCard>
    );
    const screen = await render(card(true, true));
    await fireEvent(screen.getByTestId(`swipe-card-${word.id}`), 'layout', {
      nativeEvent: { layout: { width: 300 } },
    });
    if (input === 'tap') await fireEvent.press(screen.getByRole('button'));
    else await act(() => mockPan.onEnd.mock.lastCall![0]({ translationX: -110, velocityX: 0 }));
    await act(() => jest.mocked(withTiming).mock.lastCall![2]!(true));
    const completedStyle = jest.mocked(useAnimatedStyle).mock.calls.at(-3)![0]();

    // React has selected the next word, but the native list is still on this row.
    await screen.rerender(card(false, true));
    expect(screen.getByTestId('next-word-preview', { includeHiddenElements: true })).toBeTruthy();
    expect(jest.mocked(useAnimatedStyle).mock.calls.at(-3)![0]()).toEqual(completedStyle);

    // Once the native list reaches the next row, this card may reset for revisiting.
    await screen.rerender(card(false, false));
    expect(screen.queryByTestId('next-word-preview', { includeHiddenElements: true })).toBeNull();
    expect(jest.mocked(useAnimatedStyle).mock.calls.at(-3)![0]()).toEqual({
      opacity: 1, transform: [{ translateX: 0 }, { rotate: '0deg' }],
    });
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it('shows matching overlays and yields vertical movement to the list', async () => {
    const screen = await render(
      <SwipeableWordCard word={word} active disabled={false} onSwipe={jest.fn()}>
        <Text>Word content</Text>
      </SwipeableWordCard>,
    );

    screen.getByText('KEEP LEARNING', { includeHiddenElements: true });
    screen.getByText('Review in 3–5 days', { includeHiddenElements: true });
    screen.getByText('I KNOW THIS', { includeHiddenElements: true });
    screen.getByText('Stop reviews', { includeHiddenElements: true });
    expect(mockPan.activeOffsetX).toHaveBeenCalledWith([-SWIPE_ACTIVE_OFFSET, SWIPE_ACTIVE_OFFSET]);
    expect(mockPan.failOffsetY).toHaveBeenCalledWith([-SWIPE_VERTICAL_FAILURE_OFFSET, SWIPE_VERTICAL_FAILURE_OFFSET]);
  });
});
