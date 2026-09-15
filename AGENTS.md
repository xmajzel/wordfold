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

## Store publishing and update notifications

Read `docs/ANDROID_PRODUCTION_RELEASE.md` (especially **App updates**) before publishing.
Every Android store publish request includes a version bump without a separate reminder.
Follow the release guide’s **Publish checklist**: advance the matching app/package version
and choose an Android version code above all previously uploaded builds before building.
Google Play publishing alone does not activate the app's update prompt: an authorized production
release workflow must also update and verify the Supabase release policy.

1. Verify that the store release is live and available to all intended users. An uploaded build,
   release in review, or incomplete staged rollout is not sufficient. Use the released binary's
   actual `android.versionCode`, not its version name or an assumed local config value, and verify
   that its EAS channel is `production`.
2. Explicitly target production Supabase project `ygmvphfkkjwwqmbddqhe`; do not assume the CLI's
   currently linked project is production. Confirm `public.app_release_policies` exists; if it is
   missing, apply its migration through the authorized migration workflow, not unrelated migrations.
3. Read the existing policy for application `com.jozefmajzel.wordfold`, platform `android`, channel
   `production`. Update `latest_build` to the verified released build and refresh the message.
   Preserve `minimum_supported_build` and the store URL by default; for a missing policy, use
   minimum build `1` and the verified Wordfold Google Play listing. Never copy the release guide's
   example thresholds blindly. Raising the minimum forces updates and requires an explicit user
   request; ordinary publishing must only produce an optional update prompt.
4. Read back the policy through the public REST endpoint used by the app, verifying the app,
   platform, channel, latest build, and minimum build. Confirm that a supported older build would
   receive an optional prompt and the latest build would receive none. Do not claim device testing
   unless it was actually performed.
5. Include policy activation and verification in the publishing handoff. Do not declare the release
   workflow complete while this step is outstanding; if store availability is pending, report it.

For a manually published release, verify the live build before activating its policy. OTA-only
JavaScript updates do not advance this native store-build policy. Never put credentials in these
instructions or command output.
