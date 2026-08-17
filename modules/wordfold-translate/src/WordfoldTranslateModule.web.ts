import { registerWebModule, NativeModule } from 'expo';

// WordfoldTranslateModule is not available on the web platform.
class WordfoldTranslateModule extends NativeModule<{}> {
  async translate(): Promise<string> {
    throw new Error('On-device translation is available in Android and iOS development builds.');
  }
}

export default registerWebModule(WordfoldTranslateModule, 'WordfoldTranslateModule');
