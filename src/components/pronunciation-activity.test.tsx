import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { NeuralPronunciationButton } from './neural-pronunciation-button';
import { PrivatePronunciationButton } from './private-pronunciation-button';
import { PronunciationButton } from './pronunciation-button';

const mockStart = jest.fn();
const mockStop = jest.fn(async () => undefined);

jest.mock('@/features/pronunciation/pronunciation', () => ({
  startPronunciation: (...args: unknown[]) => mockStart(...args),
  startNeuralPronunciation: (...args: unknown[]) => mockStart(...args),
  startPrivateNeuralPronunciation: (...args: unknown[]) => mockStart(...args),
  stopPronunciation: () => mockStop(),
}));

jest.mock('@/features/pronunciation/cache-scope', () => ({
  usePronunciationCacheScope: () => ({ type: 'guest' }),
}));

const cases = [
  {
    name: 'phone', callbackIndex: 3,
    control: (active: boolean) => <PronunciationButton text="hello" locale="en-US" active={active}/>,
  },
  {
    name: 'natural', callbackIndex: 2,
    control: (active: boolean) => <NeuralPronunciationButton catalogSenseId="sense" locale="en-US" active={active}/>,
  },
  {
    name: 'private', callbackIndex: 3,
    control: (active: boolean) => <PrivatePronunciationButton text="hello" locale="en-US"
      scope={{ type: 'account', userId: 'reader' }} consentEnabled onReviewConsent={jest.fn()} active={active}/>,
  },
];

describe.each(cases)('$name pronunciation on inactive cards', ({ control, callbackIndex }) => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])('cancels playback and ignores stale callbacks after leaving (speaking: %s)', async (speaking) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let finish!: (value: { status: string }) => void;
    mockStart.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const screen = await render(control(false));
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();

    await screen.rerender(control(true));
    await fireEvent.press(screen.getByRole('button'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    const callbacks = mockStart.mock.calls[0][callbackIndex];
    if (speaking) await act(() => callbacks.onStart());

    await screen.rerender(control(false));
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toBeDisabled();
    await screen.rerender(control(true));
    await act(() => {
      callbacks.onStart();
      callbacks.onError(new Error('Late response from the previous card'));
      finish({ status: 'pending' });
    });

    expect(screen.getByRole('button', { name: /^Play / })).toBeEnabled();
    expect(alert).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});
