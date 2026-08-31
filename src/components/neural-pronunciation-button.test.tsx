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
      name: 'Play Ava · US English pronunciation',
    }));

    await waitFor(() => expect(screen.getByText('Preparing Ava…')).toBeTruthy());
    expect(screen.getByText('Tap to check again')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', {
      name: 'Check Ava · US English pronunciation',
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
      name: 'Play Ryan · UK English pronunciation',
    }));
    await waitFor(() => expect(screen.getByRole('button', {
      name: 'Stop Ryan · UK English pronunciation',
    })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', {
      name: 'Stop Ryan · UK English pronunciation',
    }));

    await waitFor(() => expect(mockStopPronunciation).toHaveBeenCalledTimes(1));
  });

  it('uses safe natural-voice error copy and reveals the phone fallback', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const onUnavailable = jest.fn();
    mockStartNeuralPronunciation.mockRejectedValue(new Error('file:///private/cache/token.mp3'));
    const screen = await render(<NeuralPronunciationButton
      catalogSenseId="sense-id"
      locale="en-US"
      onUnavailable={onUnavailable}
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Play Ava · US English pronunciation',
    }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Ava · US English did not play',
      expect.stringContaining('The phone voice fallback is now available.'),
    ));
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).not.toContain('file:///');
  });

  it('prevents cloud use for a downloaded guest pronunciation', async () => {
    mockStartNeuralPronunciation.mockResolvedValue({ status: 'started' });
    const screen = await render(<NeuralPronunciationButton
      catalogSenseId="sense-id"
      locale="en-US"
      offlineOnly
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Play Ava · US English pronunciation',
    }));

    await waitFor(() => expect(mockStartNeuralPronunciation).toHaveBeenCalledWith(
      'sense-id',
      'en-US',
      expect.any(Object),
      { cloudAllowed: false },
    ));
  });
});
