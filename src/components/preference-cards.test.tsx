import { fireEvent, render } from '@testing-library/react-native';

import { LevelSelection, TopicSelection } from './preference-cards';
import { palette } from '@/theme/tokens';

jest.mock('@/hooks/use-app-theme', () => ({ useAppTheme: () => jest.requireActual('@/theme/tokens').palette.light }));

describe('preference cards', () => {
  it('exposes selected CEFR levels and toggles the pressed card', async () => {
    const onToggle = jest.fn();
    const screen = await render(<LevelSelection selected={['A2']} onToggle={onToggle}/>);

    expect(screen.getByTestId('level-A2').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('level-A1').props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(screen.getByTestId('level-A1'));
    expect(onToggle).toHaveBeenCalledWith('A1');
  });

  it('supports multiple selected learning interests', async () => {
    const onToggle = jest.fn();
    const screen = await render(<TopicSelection selected={['spoken', 'academic']} onToggle={onToggle}/>);

    expect(screen.getByTestId('topic-spoken').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('topic-business').props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByTestId('topic-academic').props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByTestId('topic-business'));
    expect(onToggle).toHaveBeenCalledWith('business');
  });
});

it('makes unavailable levels visually distinct without fading their explanation', async () => {
  const onToggle = jest.fn();
  const screen = await render(<LevelSelection selected={['C2']} onToggle={onToggle} disabledLevels={{ C2: 'Currently unavailable' }}/>);
  const card = screen.getByTestId('level-C2');
  expect(card).toBeDisabled();
  expect(card.props.accessibilityState).toEqual({ checked: false, disabled: true });
  expect(card.props.accessibilityLabel).toBe('C2. Currently unavailable');
  expect(card).toHaveStyle({ backgroundColor: palette.light.canvas, borderStyle: 'dashed', borderColor: palette.light.muted, opacity: 1 });
  expect(screen.queryByTestId('level-C2-check')).toBeNull();
  expect(screen.getByTestId('level-C1-check')).toBeTruthy();
  await fireEvent.press(card);
  expect(onToggle).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('level-C1'));
  expect(onToggle).toHaveBeenCalledWith('C1');
});
