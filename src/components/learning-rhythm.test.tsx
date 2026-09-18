import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ReduceMotion, withSpring, withTiming } from 'react-native-reanimated';
import { LearningRhythmChoice, LearningRhythmIntroduction } from './learning-rhythm';
import LearningRhythmScreen from '@/app/learning-rhythm';

const mockSave = jest.fn(async (_count: number) => undefined);
const mockBack = jest.fn();
let mockIntroduced = false;
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }));
jest.mock('@/providers/app-data-provider', () => ({ useAppData: () => ({
  onboardingComplete: true, rhythmIntroduced: mockIntroduced, learningConfirmations: 3,
  activeCourse: { sourceLanguageCode: 'es' }, saveLearningRhythm: mockSave,
}) }));
jest.mock('@/components/screen', () => ({ Screen: jest.requireActual('react-native').View }));
jest.mock('react-native-reanimated', () => {
  const transition = { delay: () => transition, duration: () => transition, reduceMotion: () => transition };
  return { __esModule: true, default: { View: jest.requireActual('react-native').View, createAnimatedComponent: (component: unknown) => component }, useAnimatedStyle: (factory: () => object) => factory(), useSharedValue: (value: number) => ({ value, set: jest.fn() }), cancelAnimation: jest.fn(), withTiming: jest.fn((value: number) => value), withSpring: jest.fn((value: number) => value), FadeInDown: transition, ReduceMotion: { System: 'system' } };
});
beforeEach(() => { jest.clearAllMocks(); mockIntroduced = false; });
afterEach(() => jest.restoreAllMocks());

it('shows all three accessible choices with the matching illustration', async () => {
  const onChange = jest.fn();
  const screen = await render(<LearningRhythmChoice value={3} onChange={onChange}/>);
  expect(screen.getByLabelText('3 separate reviews of the same word, then learned. Reviews stop.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: '1 confirmation' }));
  expect(onChange).toHaveBeenCalledWith(1);
  await screen.rerender(<LearningRhythmChoice value={1} onChange={onChange}/>);
  expect(screen.getByLabelText('1 separate review of the same word, then learned. Reviews stop.')).toBeTruthy();
  expect(screen.getByText('One “I know this” stops reviews.')).toBeTruthy();
});

it('does not save a settings draft until Save, and Close discards it', async () => {
  const screen = await render(<LearningRhythmScreen/>);
  await fireEvent.press(screen.getByRole('radio', { name: '2 confirmations' }));
  expect(mockSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(mockBack).toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save learning rhythm' }));
  expect(mockSave).toHaveBeenCalledWith(2);
});

it('keeps the introduction visible after a failed save and hides it only when acknowledged', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockSave.mockRejectedValueOnce(new Error('Storage unavailable'));
  const screen = await render(<LearningRhythmIntroduction/>);
  await fireEvent.press(screen.getByRole('radio', { name: '2 confirmations' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not save learning rhythm', 'Storage unavailable'));
  expect(screen.getByText('Words you already know stay learned.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
  expect(mockSave).toHaveBeenLastCalledWith(2);
  mockIntroduced = true;
  await screen.rerender(<LearningRhythmIntroduction/>);
  expect(screen.queryByText('New in Wordfold')).toBeNull();
});

it('saves the latest choice after rapid direction changes', async () => {
  const screen = await render(<LearningRhythmScreen/>);
  for (const name of ['1 confirmation', '3 confirmations, recommended', '2 confirmations']) {
    await fireEvent.press(screen.getByRole('radio', { name }));
  }
  expect(screen.getByRole('radio', { name: '2 confirmations' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('2 separate reviews of the same word, then learned. Reviews stop.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save learning rhythm' }));
  expect(mockSave).toHaveBeenCalledWith(2);
});

it('ignores the already selected choice and disabled choices', async () => {
  const onChange = jest.fn();
  const screen = await render(<LearningRhythmChoice value={3} onChange={onChange}/>);
  await fireEvent.press(screen.getByRole('radio', { name: '3 confirmations, recommended' }));
  expect(onChange).not.toHaveBeenCalled();
  await screen.rerender(<LearningRhythmChoice value={3} onChange={onChange} disabled/>);
  await fireEvent.press(screen.getByRole('radio', { name: '1 confirmation' }));
  expect(onChange).not.toHaveBeenCalled();
});


it('respects system reduced motion for artwork, highlights, and press feedback', async () => {
  const screen = await render(<LearningRhythmChoice value={3} onChange={jest.fn()}/>);
  await screen.rerender(<LearningRhythmChoice value={1} onChange={jest.fn()}/>);
  const option = screen.getByRole('radio', { name: '2 confirmations' });
  await fireEvent(option, 'pressIn');
  await fireEvent(option, 'pressOut');
  expect(withTiming).toHaveBeenCalledWith(1, { duration: 200, reduceMotion: ReduceMotion.System });
  for (const [, config] of jest.mocked(withTiming).mock.calls) {
    expect(config?.reduceMotion).toBe(ReduceMotion.System);
  }
  expect(withSpring).toHaveBeenCalledWith(0.95, expect.objectContaining({ reduceMotion: ReduceMotion.System }));
  expect(withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ reduceMotion: ReduceMotion.System }));
});
