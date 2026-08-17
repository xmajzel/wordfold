import WordfoldTranslate from '../../../modules/wordfold-translate';

export async function translateEnglishToSlovak(text: string) {
  if (!WordfoldTranslate?.translate) {
    throw new Error('On-device translation needs a Wordfold development build.');
  }
  return WordfoldTranslate.translate(text, 'en', 'sk');
}
