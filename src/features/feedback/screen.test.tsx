import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FeedbackScreen from '@/app/feedback';
import FeedbackHistoryScreen from '@/app/feedback-history';
import { Alert } from 'react-native';
import { feedbackFixture } from './fixtures';
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
jest.mock('./service', () => ({ feedbackConfigured: true, getFeedbackInstallationId: async () => '22222222-2222-4222-8222-222222222222', feedbackQueue: { enqueue: jest.fn(), list: jest.fn(), history: jest.fn(), flush: jest.fn(), remove: jest.fn() } }));
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
  jest.mocked(feedbackQueue.history).mockResolvedValue([]);
});

it('allows a guest to submit general feedback and return to the previous screen', async () => {
  const view = await render(<FeedbackScreen/>);
  await fireEvent.changeText(view.getByLabelText('What happened, and what did you expect?'), 'The animation flickers.');
  await fireEvent.press(view.getByRole('button', { name: 'Send feedback' }));
  await waitFor(() => expect(view.getByText('Feedback sent')).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'View my feedback' }));
  expect(mockPush).toHaveBeenCalledWith('/feedback-history');
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


it('opens general feedback from the compact accessible icon', async () => {
  const view = await render(<FeedbackLink screen="today" label="Help improve Wordfold" iconOnly/>);
  expect(view.queryByText('Help improve Wordfold')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Help improve Wordfold' }));
  const route = mockPush.mock.calls[0][0];
  expect(route.pathname).toBe('/feedback');
  expect(getFeedbackOrigin(route.params.origin)).toEqual(expect.objectContaining({ screen: 'today' }));
});

it('opens history without submitting or clearing an unfinished draft', async () => {
  const view = await render(<FeedbackScreen/>);
  await fireEvent.changeText(view.getByLabelText('What happened, and what did you expect?'), 'Keep this draft.');
  await fireEvent.press(view.getByRole('button', { name: 'My feedback' }));
  expect(mockPush).toHaveBeenCalledWith('/feedback-history');
  expect(feedbackQueue.enqueue).not.toHaveBeenCalled();
  expect(view.getByDisplayValue('Keep this draft.')).toBeTruthy();
});

it('shows the history empty state and returns to the feedback form', async () => {
  const view = await render(<FeedbackHistoryScreen/>);
  await waitFor(() => expect(view.getByText('No feedback yet. Reports you submit will appear here.')).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'Back to feedback' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('shows submitted content, dates, and distinct sent, waiting, and rejected statuses', async () => {
  jest.mocked(feedbackQueue.history).mockResolvedValue([
    { report: feedbackFixture({ id: 'sent', message: 'Sent message' }), submittedAt: '2026-09-15T12:00:00Z', sentAt: '2026-09-15T12:01:00Z' },
    { report: feedbackFixture({ id: 'waiting', message: 'Waiting message' }), submittedAt: null },
    { report: feedbackFixture({ id: 'rejected', message: 'Rejected message' }), submittedAt: '2026-09-15T11:00:00Z', error: 'Please correct this report.' },
  ]);
  const view = await render(<FeedbackHistoryScreen/>);
  await waitFor(() => expect(view.getByText('Sent message')).toBeTruthy());
  expect(view.getByText('Sent')).toBeTruthy();
  expect(view.getByText('Waiting to send')).toBeTruthy();
  expect(view.getByText('Needs attention')).toBeTruthy();
  expect(view.getByText('Submission date unavailable')).toBeTruthy();
  expect(view.getByText(`Submitted ${new Date('2026-09-15T12:00:00Z').toLocaleString()}`)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Try sending saved feedback' }));
  await waitFor(() => expect(feedbackQueue.flush).toHaveBeenCalledTimes(1));
});

it('does not show an empty history when storage fails', async () => {
  jest.mocked(feedbackQueue.history).mockRejectedValue(new Error('storage failure'));
  const view = await render(<FeedbackHistoryScreen/>);
  await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
  expect(view.queryByText('No feedback yet. Reports you submit will appear here.')).toBeNull();
});

it('removes a sent report locally only after confirmation', async () => {
  const report = feedbackFixture();
  jest.mocked(feedbackQueue.history).mockResolvedValue([{ report, submittedAt: null, sentAt: '2026-09-15T12:01:00Z' }]);
  jest.mocked(feedbackQueue.remove).mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  try {
    const view = await render(<FeedbackHistoryScreen/>);
    await waitFor(() => expect(view.getByText('Sent')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Remove feedback from this device' }));
    expect(feedbackQueue.remove).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][1]).toContain('submitted report remains');
    jest.mocked(feedbackQueue.history).mockResolvedValue([]);
    alert.mock.calls[0][2]?.find((button) => button.text === 'Remove')?.onPress?.();
    await waitFor(() => expect(feedbackQueue.remove).toHaveBeenCalledWith(report.id));
  } finally { alert.mockRestore(); }
});
