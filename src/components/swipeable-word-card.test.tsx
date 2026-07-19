import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

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
  onEnd: jest.Mock<MockPan>;
  onFinalize: jest.Mock<MockPan>;
}

const mockPan = {} as MockPan;
mockPan.enabled = jest.fn(() => mockPan);
mockPan.activeOffsetX = jest.fn(() => mockPan);
mockPan.failOffsetY = jest.fn(() => mockPan);
mockPan.onBegin = jest.fn(() => mockPan);
mockPan.onUpdate = jest.fn(() => mockPan);
mockPan.onEnd = jest.fn(() => mockPan);
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
  return {
    __esModule: true,
    default: { View },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: jest.fn(() => 0),
    ReduceMotion: { System: 'system' },
    runOnJS: jest.fn((callback: (...args: unknown[]) => unknown) => callback),
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    useReducedMotion: jest.fn(() => false),
    useSharedValue: jest.fn((initialValue: number | boolean) => ({
      value: initialValue,
      get() { return this.value; },
      set(nextValue: number | boolean) { this.value = nextValue; },
    })),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

const word: Word = {
  id: 'word', collectionId: 'collection', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', partOfSpeech: 'noun',
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
