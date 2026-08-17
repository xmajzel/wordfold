import { fireEvent, render } from '@testing-library/react-native';

import { AppSwitch } from './app-switch';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    interpolateColor: jest.fn((value: number, _input: number[], output: string[]) => output[value >= 0.5 ? 1 : 0]),
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    useSharedValue: jest.fn((initialValue: number) => ({
      value: initialValue,
      set(nextValue: number) { this.value = nextValue; },
    })),
    withSpring: jest.fn((value: number) => value),
  };
});

describe('AppSwitch', () => {
  it('exposes its state and requests the opposite value when pressed', async () => {
    const onValueChange = jest.fn();
    const screen = await render(
      <AppSwitch accessibilityLabel="Enable reminders" value={false} onValueChange={onValueChange} />,
    );
    const control = screen.getByRole('switch', { name: 'Enable reminders' });

    expect(control.props.accessibilityState).toEqual({ checked: false, disabled: false });
    await fireEvent.press(control);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does not change while disabled', async () => {
    const onValueChange = jest.fn();
    const screen = await render(
      <AppSwitch disabled accessibilityLabel="Enable pack" value onValueChange={onValueChange} />,
    );
    const control = screen.getByRole('switch', { name: 'Enable pack' });

    expect(control.props.accessibilityState).toEqual({ checked: true, disabled: true });
    await fireEvent.press(control);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
