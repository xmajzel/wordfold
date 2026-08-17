import { fireEvent, render } from '@testing-library/react-native';

import { LanguageSelector } from './language-selector';

describe('LanguageSelector', () => {
  it('selects a language with its default pronunciation locale', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <LanguageSelector
        label="Learning language"
        languageCode="en"
        pronunciationLocale="en-US"
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Learning language: Spanish' }));

    expect(onChange).toHaveBeenCalledWith('es', 'es-ES');
  });

  it('allows a regional accent to be selected independently', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <LanguageSelector
        label="Learning language"
        languageCode="en"
        pronunciationLocale="en-US"
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Learning language pronunciation: United Kingdom' }));

    expect(onChange).toHaveBeenCalledWith('en', 'en-GB');
  });
});
