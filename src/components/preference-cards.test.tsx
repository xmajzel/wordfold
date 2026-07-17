import { fireEvent, render } from '@testing-library/react-native';

import { LevelSelection, TopicSelection } from './preference-cards';

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
