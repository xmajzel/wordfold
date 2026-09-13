import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FeedbackScreen from '@/app/feedback';
import { FeedbackLink } from './feedback-link';
import { getFeedbackOrigin, rememberFeedbackOrigin } from './context';
import { feedbackQueue } from './service';
import type { Word } from '@/domain/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockOrigin: string | undefined;
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() }, useLocalSearchParams: () => ({ origin: mockOrigin }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('@/providers/app-data-provider', () => ({ useAppData: () => ({ activeCourse: { sourceLanguageCode: 'en', targetLanguageCode: 'sk' } }) }));
jest.mock('./service', () => ({ feedbackConfigured: true, getFeedbackInstallationId: async () => '22222222-2222-4222-8222-222222222222', feedbackQueue: { enqueue: jest.fn(), list: jest.fn(), flush: jest.fn(), remove: jest.fn() } }));
jest.mock('@/components/screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/primary-button', () => ({ PrimaryButton: ({ label, onPress, loading }: { label: string; onPress(): void; loading?: boolean }) => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={loading}><Text>{label}</Text></Pressable>;
} }));

beforeEach(() => {
  jest.clearAllMocks(); mockOrigin = undefined;
  jest.mocked(feedbackQueue.list).mockResolvedValue([]);
  jest.mocked(feedbackQueue.flush).mockResolvedValue([]);
  jest.mocked(feedbackQueue.enqueue).mockResolvedValue(undefined);
});

it('allows a guest to submit general feedback and return to the previous screen', async () => {
  const view = await render(<FeedbackScreen/>);
  await fireEvent.changeText(view.getByLabelText('What happened, and what did you expect?'), 'The animation flickers.');
  await fireEvent.press(view.getByRole('button', { name: 'Send feedback' }));
  await waitFor(() => expect(view.getByText('Feedback sent')).toBeTruthy());
  expect(feedbackQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ message: 'The animation flickers.', contactEmail: '' }));
  await fireEvent.press(view.getByRole('button', { name: 'Done' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('validates descriptions without losing typed text', async () => {
  const view = await render(<FeedbackScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Send feedback' }));
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(feedbackQueue.enqueue).not.toHaveBeenCalled();
});

it('captures a word snapshot without putting private text in navigation parameters', async () => {
  const word = { id: 'word-1', term: 'hello', definition: 'A greeting', translation: 'ahoj', example: null,
    catalogSenseId: 'sense-1', source: 'manual', sourceLanguageCode: 'en', targetLanguageCode: 'sk' } as Word;
  const link = await render(<FeedbackLink screen="today" word={word} label="Report this word"/>);
  await fireEvent.press(link.getByRole('button', { name: 'Report this word' }));
  const route = mockPush.mock.calls[0][0];
  expect(JSON.stringify(route)).not.toContain('hello');
  mockOrigin = route.params.origin;
  word.translation = 'changed after opening';
  expect(getFeedbackOrigin(mockOrigin).word?.translation).toBe('ahoj');
  const view = await render(<FeedbackScreen/>);
  expect(view.getByText('Hint: ahoj')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Send feedback' }));
  await waitFor(() => expect(feedbackQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ category: 'content', message: '', context: expect.objectContaining({ word: expect.objectContaining({ translation: 'ahoj' }) }) })));
});

it('keeps offline submission visible and distinguishes it from delivery', async () => {
  mockOrigin = rememberFeedbackOrigin('settings');
  jest.mocked(feedbackQueue.enqueue).mockImplementation(async (report) => {
    jest.mocked(feedbackQueue.list).mockResolvedValue([{ report }]);
    jest.mocked(feedbackQueue.flush).mockResolvedValue([{ report }]);
  });
  const view = await render(<FeedbackScreen/>);
  await fireEvent.changeText(view.getByLabelText('What happened, and what did you expect?'), 'An offline report.');
  await fireEvent.press(view.getByRole('button', { name: 'Send feedback' }));
  await waitFor(() => expect(view.getByText('Saved — waiting to send')).toBeTruthy());
  expect(view.queryByText('Feedback sent')).toBeNull();
});
