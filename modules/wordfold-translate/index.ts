// Re-export the native module. On web, it will be resolved to WordfoldTranslateModule.web.ts
// and on native platforms to WordfoldTranslateModule.ts
export { default } from './src/WordfoldTranslateModule';
export * from './src/WordfoldTranslate.types';
