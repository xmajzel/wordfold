import { fireEvent, render } from '@testing-library/react-native';

import { CourseSelector } from './course-selector';

describe('CourseSelector', () => {
  it('exposes both supported courses as accessible radio choices', async () => {
    const onChange = jest.fn();
    const screen = await render(<CourseSelector value="en-sk" onChange={onChange}/>);

    expect(screen.getByRole('radio', { name: 'Slovak → English' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Slovak → Spanish' }).props.accessibilityState.checked).toBe(false);

    await fireEvent.press(screen.getByRole('radio', { name: 'Slovak → Spanish' }));

    expect(onChange).toHaveBeenCalledWith('es-sk');
  });
});
