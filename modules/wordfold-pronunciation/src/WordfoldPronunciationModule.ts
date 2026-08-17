import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { PronunciationFileOptions } from './WordfoldPronunciation.types';

declare class WordfoldPronunciationModule extends NativeModule<{}> {
  synthesizeToFile(options: PronunciationFileOptions): Promise<number>;
}

export default requireOptionalNativeModule<WordfoldPronunciationModule>('WordfoldPronunciation');
