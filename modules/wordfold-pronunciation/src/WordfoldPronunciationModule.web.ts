import { NativeModule, registerWebModule } from 'expo';

import type { PronunciationFileOptions } from './WordfoldPronunciation.types';

class WordfoldPronunciationModule extends NativeModule<{}> {
  async synthesizeToFile(_options: PronunciationFileOptions): Promise<number> {
    throw new Error('Pronunciation file synthesis is available only in Android and iOS development builds.');
  }
}

export default registerWebModule(WordfoldPronunciationModule, 'WordfoldPronunciationModule');
