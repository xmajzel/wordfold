import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SuggestionPanel } from './suggestion-panel';
import { AiError } from './client';
const mockGenerate = jest.fn();
let mockUser: { id: string } | null = { id: 'user-a' };
const card = { definition: 'Keep trying despite difficulty.', translation: 'húževnatosť', example: 'Her tenacity helped her finish the very difficult project.', partOfSpeech: 'noun' };
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./client', () => ({ ...jest.requireActual('./client'), fetchAiBalance: async () => ({ balance: 10 }), generateSuggestion: (...args: unknown[]) => mockGenerate(...args) }));
jest.mock('@/components/primary-button', () => ({ PrimaryButton: ({ label, onPress, disabled, loading }: any) => {
  const { Pressable, Text } = jest.requireActual('react-native'); return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}><Text>{label}</Text></Pressable>;
} }));
const props = { term: 'tenacity', sourceLanguageCode: 'en', targetLanguageCode: 'sk', onUse: jest.fn() };
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); mockUser = { id: 'user-a' }; mockGenerate.mockResolvedValue({ status: 'completed', balance: 9, suggestion: card }); });
it('generates only on request and lets the user edit before applying', async () => {
  const view = await render(<SuggestionPanel {...props}/>);
  await waitFor(() => expect(view.getByText('AI suggestions · 10 credits remaining')).toBeTruthy());
  expect(mockGenerate).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('Suggest with AI · 1 credit'));
  await waitFor(() => expect(view.getByDisplayValue('húževnatosť')).toBeTruthy());
  expect(props.onUse).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText('AI translation'), 'vytrvalosť');
  await fireEvent.press(view.getByText('Use this suggestion'));
  await waitFor(() => expect(props.onUse).toHaveBeenCalledWith({ ...card, translation: 'vytrvalosť' }));
});
it('persists the request before spending and reuses it after a lost response and remount', async () => {
  mockGenerate.mockRejectedValueOnce(new AiError('unavailable'));
  const view = await render(<SuggestionPanel {...props}/>);
  await waitFor(() => expect(view.getByText('AI suggestions · 10 credits remaining')).toBeTruthy());
  await fireEvent.press(view.getByText('Suggest with AI · 1 credit'));
  await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  const id = mockGenerate.mock.calls[0][0];
  await view.unmount();
  const second = await render(<SuggestionPanel {...props}/>);
  await waitFor(() => expect(second.getByText('Retry AI request · no extra credit')).toBeTruthy());
  await fireEvent.press(second.getByText('Retry AI request · no extra credit'));
  await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2));
  expect(mockGenerate.mock.calls[1][0]).toBe(id);
});
it('does not expose an old account suggestion after switching accounts during generation', async () => {
  let finish!: (value: unknown) => void;
  mockGenerate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const view = await render(<SuggestionPanel {...props}/>);
  await waitFor(() => expect(view.getByText('AI suggestions · 10 credits remaining')).toBeTruthy());
  await fireEvent.press(view.getByText('Suggest with AI · 1 credit'));
  await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  mockUser = { id: 'user-b' }; await view.rerender(<SuggestionPanel {...props}/>);
  await act(async () => finish({ status: 'completed', balance: 9, suggestion: card }));
  expect(view.queryByText('Review AI suggestion')).toBeNull();
  expect(props.onUse).not.toHaveBeenCalled();
});
it('shows sign-in for guests without contacting AI', async () => {
  mockUser = null; const view = await render(<SuggestionPanel {...props}/>);
  expect(view.getByText('Sign in for AI suggestions')).toBeTruthy(); expect(mockGenerate).not.toHaveBeenCalled();
});
