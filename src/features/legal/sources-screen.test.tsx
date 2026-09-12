import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import SourcesScreen from '@/app/sources';
import {
  englishContentSources,
  spanishContentSources,
  spanishReviewDisclosure,
  wordNet3LicenseNotice,
} from '@/data/content-sources';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    ReduceMotion: { System: 'system' },
    cancelAnimation: jest.fn(),
    interpolate: jest.fn((_value: number, _input: number[], output: number[]) => output[0]),
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    useSharedValue: jest.fn((initialValue: number) => ({ value: initialValue, set(nextValue: number) { this.value = nextValue; } })),
    withRepeat: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

describe('content sources screen', () => {
  it('shows both courses, required acknowledgements, licences, and the approved disclosure', async () => {
    const view = await render(<SourcesScreen/>);
    view.getByText('English course');
    view.getByText('Spanish course');
    for (const source of [...englishContentSources, ...spanishContentSources]) {
      view.getByText(source.title);
      view.getByText(source.body);
      if (source.license) expect(view.getAllByText(source.license).length).toBeGreaterThan(0);
    }
    view.getByText(spanishReviewDisclosure);
    view.getByText(wordNet3LicenseNotice);
  });

  it('opens source links from their attribution cards', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const view = await render(<SourcesScreen/>);
    await fireEvent.press(view.getByRole('link', { name: 'Open source for CEFR-J Wordlist 1.6' }));
    expect(openUrl).toHaveBeenCalledWith('https://www.cefr-j.org/download.html');
    openUrl.mockRestore();
  });
});
