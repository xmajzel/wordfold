import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import CollectionCardsScreen from '@/app/collection/[id]';
import type { Word } from '@/domain/types';

const mockBack = jest.fn();
const mockWordCard = jest.fn(({ word }: { word: Word }) => <Text>{word.term}</Text>);
let mockCollectionId = 'medical';
let mockWords: Word[] = [];

const baseWord: Word = {
  id: 'new', collectionId: 'medical', term: 'care', normalizedTerm: 'care',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK',
  partOfSpeech: 'noun', definition: 'Help for someone who is ill.', example: null, translation: 'starostlivosť',
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'new', knownStreak: 0, understoodStreak: 0,
  lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null, nextReviewAt: null,
  createdAt: '2026-09-28T10:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z',
};

jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => ({ id: mockCollectionId }),
}));
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: mockWords,
    collections: [{ id: 'medical', name: 'Medical care' }],
    activeCourseId: 'en-sk',
    learningConfirmations: 3,
  }),
}));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({ muted: '#777777', text: '#111111' }),
}));
jest.mock('@/components/screen', () => ({
  Screen: ({ children }: { children: ReactNode }) => {
    const { View } = jest.requireActual('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('@/components/word-card', () => ({
  WordCard: (props: { word: Word }) => mockWordCard(props),
}));
jest.mock('@/components/primary-button', () => ({
  PrimaryButton: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));

beforeEach(() => {
  mockBack.mockClear();
  mockWordCard.mockClear();
  mockCollectionId = 'medical';
  mockWords = [
    baseWord,
    { ...baseWord, id: 'learned', term: 'surgery', state: 'learned' },
    { ...baseWord, id: 'future', term: 'treatment', state: 'understood', nextReviewAt: '2027-01-01T00:00:00.000Z' },
    { ...baseWord, id: 'other-collection', term: 'desk', collectionId: 'other' },
    { ...baseWord, id: 'spanish', term: 'salud', sourceLanguageCode: 'es' },
  ];
});

it('shows every collection card regardless of due state without rating or recording a view', async () => {
  const view = await render(<CollectionCardsScreen/>);
  view.getByText('care');
  view.getByText('1 of 3');
  await fireEvent.press(view.getByRole('button', { name: 'Next' }));
  view.getByText('surgery');
  await fireEvent.press(view.getByRole('button', { name: 'Next' }));
  view.getByText('treatment');
  expect(view.queryByText('desk')).toBeNull();
  expect(view.queryByText('salud')).toBeNull();
  expect(mockWordCard.mock.calls.every(([props]) => !('onRate' in props) && !('markViewed' in props))).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: 'Done' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('explains an empty collection', async () => {
  mockWords = [];
  const view = await render(<CollectionCardsScreen/>);
  view.getByText('No cards in this collection');
  expect(mockWordCard).not.toHaveBeenCalled();
});
