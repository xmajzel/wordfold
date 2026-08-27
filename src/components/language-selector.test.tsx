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

  it('can withhold an unreviewed regional locale', async () => {
    const screen = await render(
      <LanguageSelector
        label="Learning language"
        languageCode="es"
        pronunciationLocale="es-ES"
        allowedLanguageCodes={['es']}
        allowedPronunciationLocales={['es-ES']}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Learning language pronunciation: Spain' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Learning language pronunciation: Mexico' })).toBeNull();
  });
});
