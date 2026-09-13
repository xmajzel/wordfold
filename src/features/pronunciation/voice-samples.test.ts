import { playBundledVoiceSample } from './voice-samples';

const mockPlayFile = jest.fn(async (..._args: unknown[]) => undefined);
const mockPrepare = jest.fn(async (): Promise<void> => undefined);
jest.mock('expo-asset', () => ({ Asset: { loadAsync: jest.fn(async () => [{ localUri: 'file:///sample.mp3' }]) } }));
jest.mock('@/features/pronunciation/audio-player', () => ({
  playPronunciationFile: (...args: unknown[]) => mockPlayFile(...args),
  preparePronunciationFilePlayback: () => mockPrepare(),
}));

beforeEach(() => jest.clearAllMocks());

it('passes playback events and cancellation to the audio player', async () => {
  const callbacks = { onStart: jest.fn() };
  const request = new AbortController();
  await playBundledVoiceSample('en-US', callbacks, request.signal);
  expect(mockPlayFile).toHaveBeenCalledWith('file:///sample.mp3', callbacks, request.signal);
});

it('does not begin playback if the picker was left during preparation', async () => {
  let finish!: () => void;
  mockPrepare.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const request = new AbortController();
  const operation = playBundledVoiceSample('en-GB', {}, request.signal);
  request.abort();
  finish();
  await operation;
  expect(mockPlayFile).not.toHaveBeenCalled();
});
