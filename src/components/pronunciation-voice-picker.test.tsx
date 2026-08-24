import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { PronunciationVoicePicker } from './pronunciation-voice-picker';

const mockPlayBundledVoiceSample = jest.fn(async (_locale: string) => undefined);
const mockPreloadBundledVoiceSamples = jest.fn(async () => undefined);
const mockPhoneVoiceText = jest.fn();
const mockSampleText = 'Hello! Learning a new language opens the door to new ideas, new places, and new conversations.';

jest.mock('@/features/pronunciation/voice-samples', () => ({
  BUNDLED_VOICE_SAMPLE_TEXT: 'Hello! Learning a new language opens the door to new ideas, new places, and new conversations.',
  playBundledVoiceSample: (locale: string) => mockPlayBundledVoiceSample(locale),
  preloadBundledVoiceSamples: () => mockPreloadBundledVoiceSamples(),
}));

jest.mock('@/components/pronunciation-button', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PronunciationButton: ({ idleLabel, text }: { idleLabel: string; text: string }) => {
      mockPhoneVoiceText(text);
      return <Pressable accessibilityRole="button" accessibilityLabel={idleLabel}><Text>{idleLabel}</Text></Pressable>;
    },
  };
});

describe('PronunciationVoicePicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers all three voices and changes the selected preference', async () => {
    const onChange = jest.fn();
    const screen = await render(<PronunciationVoicePicker value="neural-en-US" onChange={onChange}/>);

    expect(screen.getByRole('radio', { name: 'Choose Ava · US English' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Choose Ryan · UK English' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Choose Phone voice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test phone voice' })).toBeTruthy();
    expect(mockPhoneVoiceText).toHaveBeenCalledWith(mockSampleText);

    await fireEvent.press(screen.getByRole('radio', { name: 'Choose Ryan · UK English' }));
    expect(onChange).toHaveBeenCalledWith('neural-en-GB');
  });

  it('prepares and plays a natural voice sample', async () => {
    const screen = await render(<PronunciationVoicePicker value="neural-en-US" onChange={jest.fn()}/>);

    await fireEvent.press(screen.getByRole('button', { name: 'Test Ryan · UK English' }));
    await waitFor(() => expect(mockPlayBundledVoiceSample).toHaveBeenCalledWith('en-GB'));
  });
});
