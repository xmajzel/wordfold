import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { PrivatePronunciationButton } from './private-pronunciation-button';

const mockStartPrivatePronunciation = jest.fn();
const mockStopPronunciation = jest.fn(async () => undefined);

jest.mock('@/features/pronunciation/pronunciation', () => ({
  startPrivateNeuralPronunciation: (...args: unknown[]) => mockStartPrivatePronunciation(...args),
  stopPronunciation: () => mockStopPronunciation(),
}));

const scope = {
  type: 'account' as const,
  userId: '00000000-0000-4000-8000-0000000000a1',
};

describe('PrivatePronunciationButton', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('opens disclosure without sending text while consent is off', async () => {
    const review = jest.fn();
    const screen = await render(<PrivatePronunciationButton
      text="súkromné slovo"
      locale="sk-SK"
      scope={scope}
      consentEnabled={false}
      onReviewConsent={review}
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Review cloud neural pronunciation for Slovak · Slovakia',
    }));

    expect(review).toHaveBeenCalledTimes(1);
    expect(mockStartPrivatePronunciation).not.toHaveBeenCalled();
  });

  it('requests exact text only after consent and keeps pending generation retryable', async () => {
    mockStartPrivatePronunciation.mockResolvedValue({
      status: 'pending', retryAfterSeconds: 2,
    });
    const screen = await render(<PrivatePronunciationButton
      text="súkromné slovo"
      locale="sk-SK"
      scope={scope}
      consentEnabled
      onReviewConsent={jest.fn()}
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Play Slovak · Slovakia private neural pronunciation',
    }));
    await waitFor(() => expect(screen.getByText('Preparing cloud neural voice…')).toBeTruthy());
    expect(mockStartPrivatePronunciation).toHaveBeenCalledWith(
      'súkromné slovo', 'sk-SK', scope, expect.any(Object),
    );
    await fireEvent.press(screen.getByRole('button', {
      name: 'Check Slovak · Slovakia private neural pronunciation',
    }));
    await waitFor(() => expect(mockStartPrivatePronunciation).toHaveBeenCalledTimes(2));
  });

  it('does not expose raw provider or file errors', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockStartPrivatePronunciation.mockRejectedValue(
      new Error('https://private.example/token?secret=raw'),
    );
    const screen = await render(<PrivatePronunciationButton
      text="private"
      locale="en-US"
      scope={scope}
      consentEnabled
      onReviewConsent={jest.fn()}
    />);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Play English · United States private neural pronunciation',
    }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Cloud neural voice did not play',
      expect.stringContaining('The device voice option remains available.'),
    ));
    expect(alert.mock.calls[0][1]).not.toContain('private.example');
  });
});
