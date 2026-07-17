# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Android testing and EAS build quota

Treat Expo EAS cloud builds as quota-limited.

Never start `eas build`, `eas submit`, or another remote Expo build merely because the user says
"implement", "test", or "verify". Obtain explicit approval immediately before every remote build.

Use this verification order:

1. Run tests, lint, TypeScript, Expo Doctor, and a local Expo export.
2. Use Expo Go when the behavior does not require custom native modules or native branding.
3. Prefer a local Android build and direct device installation for complete native testing.
4. Use an EAS cloud build only for an explicitly approved release candidate or when local building is
   unavailable.

When proposing EAS, clearly state that it consumes the project's limited monthly build quota.
