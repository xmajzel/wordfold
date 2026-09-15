# Wordfold Android production release

## Scope

The initial release uses the final Android package `com.jozefmajzel.wordfold`, a separate free-tier Supabase production project, and a separate free-tier PowerSync production instance. The existing development services and personal VPS are not modified.

Free services may pause after inactivity. Check both services before Play review, internal-track testing, or promotion, and upgrade only when real usage requires it.

## Current production state

- Supabase project `Wordfold Production` is active in Frankfurt (`eu-central-1`) with ref `ygmvphfkkjwwqmbddqhe`.
- All committed migrations are applied. The account-deletion and public/private pronunciation
  Edge Functions, including scheduled private-audio cleanup, are deployed and production-tested.
- Email/password signup, email confirmation, an eight-character password minimum, and `wordfold://account` redirects are configured.
- The production Supabase URL and publishable key are configured in EAS. Both pronunciation flags
  were enabled for the approved Android release candidate on August 27, 2026: public catalog audio
  is available offline, while private cloud pronunciation remains account-bound and explicit opt-in.
- Database and PowerSync-role passwords are stored in macOS Keychain items named `wordfold-production-supabase-db` and `wordfold-production-powersync-role`; they are not stored in the repository.
- The production EAS environment contains the Supabase, PowerSync, RevenueCat, and pronunciation
  client variables. Google Play product setup, custom SMTP, and GitHub Pages remain governed by
  the external release checklist below.

## Required production configuration

Configure these public values in the EAS `production` environment:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-production-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-production-publishable-key
EXPO_PUBLIC_POWERSYNC_URL=https://your-production-instance.powersync.com
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=your-revenuecat-android-public-sdk-key
EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED=true
EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED=true
```

All `EXPO_PUBLIC_` values are embedded in the app. Never put database passwords, the Supabase service-role key, SMTP credentials, PowerSync admin/replication credentials, or Azure credentials in them.

## Supabase

1. Create a production project in the intended region.
2. Apply every committed migration and run the database tests and linter.
3. Verify the deployed `account-delete`, public pronunciation, private pronunciation, and private
   pronunciation cleanup Edge Functions required by the release.
4. Enable email/password authentication and email confirmation.
5. Add `wordfold://account` to allowed authentication redirects.
6. Configure custom SMTP before opening registration to the public. Supabase's default SMTP is limited to project-team addresses, currently two messages per hour, and is not a production delivery service.
7. Configure the dedicated PowerSync replication role password outside Git.

## PowerSync

1. Create a production instance separate from development.
2. Connect it to the production Supabase database with the dedicated read-only replication role.
3. Apply and validate `powersync/sync-config.yaml` against production.
4. Do not overwrite the ignored/local CLI link to the development instance.
5. Verify two different accounts cannot read one another's collections, words, or learning events.

## Google Play and RevenueCat

1. Create the Play application using `com.jozefmajzel.wordfold`.
2. Create a non-consumable one-time product named `wordfold_lifetime`; never consume it.
3. In RevenueCat, add the Android app and Play credentials, attach the product to entitlement `unlimited_words`, and add it to the current offering.
4. Configure anonymous purchase transfer/restore behavior deliberately and test restoration with the same Google Play account.
5. Confirm the generated Android manifest contains `com.android.vending.BILLING` and MainActivity uses `singleTop`, allowing payment verification apps to return to the purchase flow.

## Legal pages and Play Console

GitHub Pages publishes only `site/`, never the internal `docs/` directory. Expected URLs:

- `https://xmajzel.github.io/wordfold/privacy/`
- `https://xmajzel.github.io/wordfold/account-deletion/`

Enable GitHub Pages with GitHub Actions, publish the workflow from `main`, verify both URLs, and use them in the Play Console privacy and account-deletion fields. Complete Data Safety consistently with the published policy and installed SDK behavior.

## Android pronunciation acceptance

The project owner completed the physical Android acceptance pass on August 27, 2026. The verified
flows include the Ava, Ryan, and Phone voice onboarding tests; automatic initial-word and newly
added catalog-word downloads; restart persistence; airplane-mode playback; natural-voice failure
with the compact Phone voice fallback; and signed-in private-pronunciation consent and deletion.
The owner also confirmed the approved Azure budget notifications. iOS remains deferred because no
physical iOS device is currently available and is not a blocker for the Android-first release.

## App updates

The app includes `expo-updates`, using fingerprint runtime compatibility and separate
`preview` and `production` EAS channels. Compatible updates download at launch without
blocking startup and apply on the next cold start. Native changes still require a new
store binary. See [Expo SDK 56 Updates](https://docs.expo.dev/versions/v56.0.0/sdk/updates/).

Apply `20260913120000_create_app_release_policies.sql` to the intended Supabase project
before announcing releases. Its public table is readable by guests and signed-in users;
only trusted administrators can write it. It is deliberately unseeded. A missing row
means no store prompt; deleting a row revokes its policy on the next successful check.

After a store release is available to all intended users, upsert its policy through the
Supabase SQL editor. Example only: replace build numbers with verified released builds.

```sql
insert into public.app_release_policies
  (application_id, platform, channel, latest_build, minimum_supported_build, message, store_url)
values
  ('com.jozefmajzel.wordfold', 'android', 'production', 6, 5,
   'A new version of Wordfold is available.',
   'https://play.google.com/store/apps/details?id=com.jozefmajzel.wordfold')
on conflict (application_id, platform, channel) do update set
  latest_build = excluded.latest_build,
  minimum_supported_build = excluded.minimum_supported_build,
  message = excluded.message,
  store_url = excluded.store_url;
```

Builds below `latest_build` receive a prompt with a 24-hour reminder option. Builds below
`minimum_supported_build` receive a non-dismissible update dialog. Reserve that threshold
for releases that must replace unsupported versions, and raise it only after full store
availability, including supported device/OS coverage. This is a client UI gate, not a
server API security boundary. Vocabulary and queued sync data are preserved.

Checks run at startup and on foreground (at most once per minute). Requests time out
after five seconds. A failed request preserves the last validated cached policy; without
a cache the app remains usable offline. Invalid responses never replace the cache.
The required dialog includes a retry action so a revoked policy can be refreshed.

Policies are scoped by application ID, platform, and EAS channel. Builds without an EAS
channel use `preview`; development and web bypass the gate. Preview builds must use the
intended non-production Supabase environment. For future iOS releases, use monotonically
increasing integer `ios.buildNumber` values and a verified `apps.apple.com` listing URL;
unknown/non-integer native builds skip the gate. No iOS policy is preconfigured.

The first binary containing this implementation must be installed through the store;
older binaries cannot acquire the update mechanism remotely. Increment `android.versionCode`
before that release. Regenerate ignored native folders from app config before a local
build; existing generated folders may still have updates disabled. Cloud builds use
the checked-in config when native folders are excluded from the upload.

For compatible OTA releases, use `eas update --channel production --environment production`
with the same native runtime and public environment as the installed binary. Test on
the preview channel first. Do not automatically reload during a learning session.
Publishing OTA updates is a separate release action; EAS service usage limits still apply.

Verify optional, required, dismissed, offline, and revoked policies with a release-mode
preview build against a test policy. Verify a compatible preview OTA download followed
by a cold restart before the first production rollout. Expo Go does not exercise this
native release flow.

## Publish checklist

Every request to publish a new Android store build includes the version bump; the owner
must not need to request it separately.

1. Inspect the current source and the highest version code already uploaded to Google Play.
2. Before building, increment `expo.version` in `app.json` and the matching `version` in
   `package.json` (use the next patch version unless another version was requested).
   Set `expo.android.versionCode` higher than every previously uploaded build, including drafts.
3. Run the applicable checks below, then build the signed production bundle. Regenerate
   ignored native folders when building directly from them.
4. Verify the generated binary's package, version name, version code, and `production`
   EAS channel before uploading. Publish to the track requested by the owner.
5. Confirm Google Play shows the release available to all intended testers/users.
6. Activate and read back the optional production update policy as required by `AGENTS.md`
   and **App updates** above. Preserve the minimum supported build and store URL.
7. Report the published version/build, verification results, and update-policy status.

## Verification order

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm exec expo-doctor
pnpm exec expo export --platform android
pnpm db:reset
pnpm db:test
pnpm db:lint
pnpm powersync:validate
```

Then run a local Android build and physical-device checks. Actual billing requires a Google Play internal-track installation. Do not run `eas build`, `eas submit`, or another quota-consuming remote build without explicit approval immediately before the command.

### Accepted Expo Doctor posture for the Spanish A1 release

On 11 September 2026, Expo Doctor passed 17 of 22 checks. The owner reviewed and
accepted the five reported checks for this release as consequences of 15 Expo SDK 56
packages being one patch version behind the currently recommended SDK 56 set. No
affected defect has been observed in Wordfold's validated flows. Updating now would
change the lockfile and require another native rebuild, so dependency alignment is
deliberately deferred rather than mixed into the Spanish A1 release candidate.

Run `pnpm exec expo install --check` before the next SDK bump, then align and
native-validate the Expo packages as one deliberate dependency update. This acceptance
does not waive new Doctor findings or regressions found during release-candidate
validation.
