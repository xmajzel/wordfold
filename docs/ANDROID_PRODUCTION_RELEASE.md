# Wordfold Android production release

## Scope

The initial release uses the final Android package `com.jozefmajzel.wordfold`, a separate free-tier Supabase production project, and a separate free-tier PowerSync production instance. The existing development services and personal VPS are not modified.

Free services may pause after inactivity. Check both services before Play review, internal-track testing, or promotion, and upgrade only when real usage requires it.

## Current production state

- Supabase project `Wordfold Production` is active in Frankfurt (`eu-central-1`) with ref `ygmvphfkkjwwqmbddqhe`.
- All committed migrations are applied and the `account-delete` Edge Function is deployed.
- Email/password signup, email confirmation, an eight-character password minimum, and `wordfold://account` redirects are configured.
- The production Supabase URL, publishable key, and disabled pronunciation-preview flags are configured in EAS.
- Database and PowerSync-role passwords are stored in macOS Keychain items named `wordfold-production-supabase-db` and `wordfold-production-powersync-role`; they are not stored in the repository.
- PowerSync, RevenueCat/Google Play, custom SMTP, and GitHub Pages still require the external setup described below. The PowerSync and RevenueCat EAS variables must be added after those services exist.

## Required production configuration

Configure these public values in the EAS `production` environment:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-production-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-production-publishable-key
EXPO_PUBLIC_POWERSYNC_URL=https://your-production-instance.powersync.com
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=your-revenuecat-android-public-sdk-key
EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED=false
EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED=false
```

All `EXPO_PUBLIC_` values are embedded in the app. Never put database passwords, the Supabase service-role key, SMTP credentials, PowerSync admin/replication credentials, or Azure credentials in them.

## Supabase

1. Create a production project in the intended region.
2. Apply every committed migration and run the database tests and linter.
3. Deploy the `account-delete` Edge Function and other public functions required by the release. Keep private Azure pronunciation disabled.
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
