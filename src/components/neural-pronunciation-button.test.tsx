import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { NeuralPronunciationButton } from './neural-pronunciation-button';

const mockStartNeuralPronunciation = jest.fn();
const mockStopPronunciation = jest.fn(async () => undefined);

jest.mock('@/features/pronunciation/pronunciation', () => ({
  startNeuralPronunciation: (...args: unknown[]) => mockStartNeuralPronunciation(...args),
  stopPronunciation: () => mockStopPronunciation(),
}));

describe('NeuralPronunciationButton', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('makes a pending generation visibly retryable', async () => {
    mockStartNeuralPronunciation.mockResolvedValue({ status: 'pending', retryAfterSeconds: 3 });
    const screen = await render(<NeuralPronunciationButton
      catalogSenseId="sense-id"
      locale="en-US"
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Play English · United States neural pronunciation preview',
    }));

    await waitFor(() => expect(screen.getByText('Preparing neural voice…')).toBeTruthy());
    expect(screen.getByText('Tap to check again')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', {
      name: 'Check English · United States neural pronunciation preview',
    }));
    await waitFor(() => expect(mockStartNeuralPronunciation).toHaveBeenCalledTimes(2));
  });

  it('shows playback and lets the user stop it', async () => {
    mockStartNeuralPronunciation.mockImplementation(async (_sense, _locale, callbacks) => {
      callbacks.onStart();
      return { status: 'started' };
    });
    const screen = await render(<NeuralPronunciationButton
      catalogSenseId="sense-id"
      locale="en-GB"
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Play English · United Kingdom neural pronunciation preview',
    }));
    await waitFor(() => expect(screen.getByRole('button', {
      name: 'Stop English · United Kingdom neural pronunciation',
    })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', {
      name: 'Stop English · United Kingdom neural pronunciation',
    }));

    await waitFor(() => expect(mockStopPronunciation).toHaveBeenCalledTimes(1));
  });

  it('uses safe neural error copy and leaves device voice as an explicit choice', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockStartNeuralPronunciation.mockRejectedValue(new Error('file:///private/cache/token.mp3'));
    const screen = await render(<NeuralPronunciationButton
      catalogSenseId="sense-id"
      locale="en-US"
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Play English · United States neural pronunciation preview',
    }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Neural voice did not play',
      expect.stringContaining('The device voice option remains available.'),
    ));
    expect(alert.mock.calls[0][1]).not.toContain('file:///');
  });
});
