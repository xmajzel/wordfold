// A local development opt-in, never a substitute for catalog release approval.
// Keep the original flag name compatible with existing local installations;
// it also enables independently AI-reviewed supplemental levels.
export const spanishA1PreviewEnabled = typeof __DEV__ !== 'undefined' && __DEV__
  && process.env.EXPO_PUBLIC_SPANISH_A1_PREVIEW_ENABLED === 'true';
