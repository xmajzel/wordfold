import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { PronunciationVoicePicker } from './pronunciation-voice-picker';
import type { DevicePronunciationCallbacks } from '@/features/pronunciation/device-speech';
import englishSamples from '../../assets/pronunciation/voice-samples/manifest.json';
import spanishSamples from '../../assets/pronunciation/voice-samples/manifest-spanish.json';

const mockPlaySample = jest.fn();
const mockStartPhone = jest.fn();
const mockStopPhone = jest.fn(async (): Promise<void> => undefined);
jest.mock('@/features/pronunciation/voice-samples', () => ({
  BUNDLED_VOICE_SAMPLE_TEXT: jest.requireActual('@/features/pronunciation/voice-samples').BUNDLED_VOICE_SAMPLE_TEXT,
  playBundledVoiceSample: (...args: unknown[]) => mockPlaySample(...args),
  preloadBundledVoiceSamples: jest.fn(async () => undefined),
}));
jest.mock('@/features/pronunciation/audio-player', () => ({
  playPronunciationFile: jest.fn(),
  preparePronunciationFilePlayback: jest.fn(),
}));
jest.mock('@/features/pronunciation/pronunciation', () => ({
  startPronunciation: (...args: unknown[]) => mockStartPhone(...args),
  stopPronunciation: () => mockStopPhone(),
}));
jest.mock('@/features/pronunciation/device-speech', () => ({
  openAndroidVoiceInstaller: jest.fn(), resolveExactDeviceVoice: jest.fn(),
}));
jest.mock('@/features/pronunciation/cache-scope', () => ({ usePronunciationCacheScope: () => ({ type: 'guest' }) }));

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it.each([
  { language: 'en', locale: 'en-US', label: /Play English .* device pronunciation/, manifest: englishSamples },
  { language: 'es', locale: 'es-ES', label: /Play Spanish .* device pronunciation/, manifest: spanishSamples },
])('uses the same words for every $language voice preview', async ({ language, locale, label, manifest }) => {
  mockStartPhone.mockResolvedValueOnce({ status: 'started' });
  const view = await render(<PronunciationVoicePicker value="device" onChange={jest.fn()} sourceLanguageCode={language} pronunciationLocale={locale}/>);
  await fireEvent.press(view.getByRole('button', { name: label }));
  expect(mockStartPhone).toHaveBeenCalledTimes(1);
  const [text, requestedLocale] = mockStartPhone.mock.calls[0];
  expect(requestedLocale).toBe(locale);
  for (const sample of manifest.samples) expect(text).toBe(sample.text);
});

it('shows preparing then playing and locks both competing voices until completion', async () => {
  let callbacks!: DevicePronunciationCallbacks;
  let finish!: () => void;
  mockPlaySample.mockImplementation((_locale, events) => {
    callbacks = events;
    return new Promise<void>((resolve) => { finish = resolve; });
  });
  const view = await render(<PronunciationVoicePicker value="neural-en-US" onChange={jest.fn()}/>);
  const ava = () => view.getByRole('button', { name: 'Test Ava · US English' });
  const ryan = () => view.getByRole('button', { name: 'Test Ryan · UK English' });
  const phone = () => view.getByRole('button', { name: /Play English .* device pronunciation/ });
  expect(phone()).toHaveStyle({ alignSelf: 'flex-start' });
  await fireEvent.press(ava());
  view.getByText('Preparing sample…');
  expect(ryan()).toBeDisabled();
  expect(phone()).toBeDisabled();
  await act(() => callbacks.onStart?.());
  view.getByText('Playing…');
  expect(view.queryByText('Preparing sample…')).toBeNull();
  await act(() => finish());
  expect(ryan()).not.toBeDisabled();
  expect(phone()).not.toBeDisabled();
});

it('locks recorded voices during phone preparation and playback, and unlocks after stop', async () => {
  let callbacks!: DevicePronunciationCallbacks;
  mockStartPhone.mockImplementation(async (_text, _locale, _scope, events) => {
    callbacks = events;
    return { status: 'started' };
  });
  const view = await render(<PronunciationVoicePicker value="device" onChange={jest.fn()}/>);
  await fireEvent.press(view.getByRole('button', { name: /Play English .* device pronunciation/ }));
  expect(view.getByRole('button', { name: 'Test Ava · US English' })).toBeDisabled();
  await act(() => callbacks.onStart?.());
  expect(view.getByRole('button', { name: 'Test Ryan · UK English' })).toBeDisabled();
  let finishStop!: () => void;
  mockStopPhone.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStop = resolve; }));
  await fireEvent.press(view.getByRole('button', { name: /Stop English/ }));
  view.getByText('Stopping…');
  expect(view.getByRole('button', { name: 'Test Ava · US English' })).toBeDisabled();
  await act(() => finishStop());
  expect(mockStopPhone).toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'Test Ava · US English' })).not.toBeDisabled();
});

it('cancels a pending sample when leaving the picker', async () => {
  mockPlaySample.mockImplementation(() => new Promise(() => {}));
  const view = await render(<PronunciationVoicePicker value="device" onChange={jest.fn()}/>);
  await fireEvent.press(view.getByRole('button', { name: 'Test Ava · US English' }));
  const signal = mockPlaySample.mock.calls[0][2] as AbortSignal;
  await view.unmount();
  expect(signal.aborted).toBe(true);
});

it('unlocks controls after a sample error and still allows voice selection', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockPlaySample.mockRejectedValueOnce(new Error('Could not load sample'));
  const onChange = jest.fn();
  const view = await render(<PronunciationVoicePicker value="device" onChange={onChange}/>);
  await fireEvent.press(view.getByRole('button', { name: 'Test Ava · US English' }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(view.getByRole('button', { name: 'Test Ryan · UK English' })).not.toBeDisabled();
  await fireEvent.press(view.getByRole('radio', { name: 'Choose Ryan · UK English' }));
  expect(onChange).toHaveBeenCalledWith('neural-en-GB');
});

it('offers only the exact Spanish phone voice when requested', async () => {
  const view = await render(<PronunciationVoicePicker value="device" onChange={jest.fn()} sourceLanguageCode="es" pronunciationLocale="es-ES"/>);
  expect(view.queryByRole('radio', { name: 'Choose Ava · US English' })).toBeNull();
  view.getByRole('radio', { name: 'Choose Phone voice · Spanish · Spain' });
  view.getByText('Test Spanish · Spain phone voice');
});

it('offers only Spanish neural voices and plays the selected regional sample', async () => {
  mockPlaySample.mockResolvedValue(undefined);
  const onChange = jest.fn();
  const view = await render(<PronunciationVoicePicker value="device" onChange={onChange} sourceLanguageCode="es" pronunciationLocale="es-ES"/>);
  expect(view.queryByText('Ava · US English')).toBeNull();
  await fireEvent.press(view.getByRole('radio', { name: 'Choose Jorge · Mexico Spanish' }));
  expect(onChange).toHaveBeenCalledWith('neural-es-MX');
  await fireEvent.press(view.getByRole('button', { name: 'Test Elvira · Spain Spanish' }));
  expect(mockPlaySample).toHaveBeenCalledWith('es-ES', expect.any(Object), expect.anything());
});
