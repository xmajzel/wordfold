import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { PronunciationButton } from './pronunciation-button';

const mockStartPronunciation = jest.fn();
const mockStopPronunciation = jest.fn(async () => undefined);

jest.mock('@/features/pronunciation/device-speech', () => ({
  openAndroidVoiceInstaller: jest.fn(async () => true),
  resolveExactDeviceVoice: jest.fn(async () => null),
}));

jest.mock('@/features/pronunciation/pronunciation', () => ({
  startPronunciation: (...args: unknown[]) => mockStartPronunciation(...args),
  stopPronunciation: () => mockStopPronunciation(),
}));

jest.mock('@/features/pronunciation/cache-scope', () => ({
  usePronunciationCacheScope: () => ({ type: 'guest' }),
}));

describe('PronunciationButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => jest.restoreAllMocks());

  it('exposes preparation, playing, and stop behavior accessibly', async () => {
    mockStartPronunciation.mockImplementation(async (_text, _locale, _scope, callbacks) => {
      callbacks.onStart();
      return { status: 'started', voice: { identifier: 'voice' } };
    });
    const screen = await render(<PronunciationButton text="hola" locale="es-MX"/>);

    await fireEvent.press(screen.getByRole('button', { name: 'Play Spanish · Mexico device pronunciation for hola' }));

    await waitFor(() => expect(mockStartPronunciation).toHaveBeenCalledWith(
      'hola', 'es-MX', { type: 'guest' }, expect.objectContaining({ onStart: expect.any(Function), onDone: expect.any(Function) }),
    ));
    expect(screen.getByRole('button', { name: 'Stop Spanish · Mexico device pronunciation' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Stop Spanish · Mexico device pronunciation' }));
    await waitFor(() => expect(mockStopPronunciation).toHaveBeenCalledTimes(1));
  });

  it('shows an honest missing exact-voice message instead of speaking a fallback', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockStartPronunciation.mockResolvedValue({ status: 'missing_voice' });
    const screen = await render(<PronunciationButton text="hola" locale="es-MX"/>);

    await fireEvent.press(screen.getByRole('button', { name: 'Play Spanish · Mexico device pronunciation for hola' }));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('Spanish · Mexico voice is not installed');
    expect(alert.mock.calls[0][1]).toEqual(expect.stringContaining('will not substitute'));
  });

  it('reports speech-engine failures and returns to idle', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockStartPronunciation.mockRejectedValue(new Error('Speech engine unavailable'));
    const screen = await render(<PronunciationButton text="hello" locale="en-US"/>);

    await fireEvent.press(screen.getByRole('button', { name: 'Play English · United States device pronunciation for hello' }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Pronunciation did not play', expect.stringContaining('Speech engine unavailable'),
    ));
    expect(screen.getByRole('button', { name: 'Play English · United States device pronunciation for hello' })).toBeTruthy();
  });
});
