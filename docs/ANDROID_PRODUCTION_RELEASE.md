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
  client variables. Google Play product setup, custom SMTP, and Cloudflare Pages remain governed by
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

Cloudflare Pages must publish only `site/`, never the internal `docs/` directory. Expected URLs:

- `https://wordfold.app/privacy/`
- `https://wordfold.app/account-deletion/`

Create a Cloudflare Pages project connected to the `xmajzel/wordfold` GitHub repository. Select `main` as the production branch, no framework preset, `exit 0` as the build command, and `site` as the build output directory relative to the repository root. Keep automatic deployments enabled. Add `wordfold.app` as the custom domain. An apex domain requires the domain's nameservers to point to Cloudflare; preserve the existing MX, SPF, DKIM, DMARC, and other DNS records used by `support@wordfold.app` and `feedback.wordfold.app` when moving DNS.

After the site is on `main`, verify the production deployment, both HTTPS URLs, and automatic deployment from a subsequent `main` change. Then update the in-app legal URLs, remove the GitHub Pages workflow, and use the live Cloudflare URLs in the Play Console privacy and account-deletion fields. Complete Data Safety consistently with the published policy and installed SDK behavior. Submitted feedback and its notification email are separate from cloud account deletion; handle identifiable feedback deletion requests sent to support before claiming that associated data has been removed.

## Android pronunciation acceptance

The project owner completed the physical Android acceptance pass on August 27, 2026. The verified
flows include the Ava, Ryan, and Phone voice onboarding tests; automatic initial-word and newly
added catalog-word downloads; restart persistence; airplane-mode playback; natural-voice failure
with the compact Phone voice fallback; and signed-in private-pronunciation consent and deletion.
The owner also confirmed the approved Azure budget notifications. iOS remains deferred because no
physical iOS device is currently available and is not a blocker for the Android-first release.

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
