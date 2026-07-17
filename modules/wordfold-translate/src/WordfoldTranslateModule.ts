import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class WordfoldTranslateModule extends NativeModule<{}> {
  translate(text: string, sourceCode: string, targetCode: string): Promise<string>;
}

export default requireOptionalNativeModule<WordfoldTranslateModule>('WordfoldTranslate');
