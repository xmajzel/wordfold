# Pronunciation Phase 5B private client

Status: **implemented locally, feature-flagged off, and not deployed** (July 23, 2026).

## User behavior

- Device pronunciation remains available and unchanged.
- Exact public catalog words continue using the existing public neural path.
- Signed-in native users see a private neural option for manual or edited words only when the
  displayed text is 1–200 characters and its exact locale is `en-US`, `en-GB`, or `sk-SK`.
- With consent off, the option opens a disclosure screen and sends no synthesis request.
- After explicit opt-in, a tap requests only the displayed text and locale from the authenticated
  `pronunciation-private` function. Word creation, editing, importing, synchronization, and app
  startup never generate private audio.
- Device and cloud voices remain separate labeled choices. Neither silently falls back to the
  other.
- Web remains device-only for this private preview.

The client gate is:

```text
EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED=false
```

It must remain false until Phase 5A is deployed to the development project and the legal/privacy
release gates are explicitly approved.

## Consent and opt-out

Consent is local, versioned, and keyed by a SHA-256 digest of the authenticated account ID. It is
not stored in the application database or PowerSync. A changed disclosure version fails closed and
requires consent again.

Turning the feature off first writes a `deletion_pending` state, which immediately prevents new
cloud requests. The client then clears only the private neural cache and invokes authenticated
`DELETE pronunciation-private`. If local or server deletion fails, the feature stays off and the
Settings screen exposes a retry action. Successful deletion removes the local consent record.

Manual sign-out and automatic account transitions already clear the parent account pronunciation
cache. Sign-out does not itself revoke the account's persisted opt-in or request server deletion;
those actions remain explicit and separate.

## Private cache boundary

- Files live under the existing hashed account cache namespace and the pinned
  `azure-private-preview-v1` synthesis version.
- Local lookup uses a SHA-256 digest of synthesis version, exact text, and exact locale.
- The descriptor stores only the input hash and verified asset metadata. It does not store raw
  synthesis text, the 60-second signed URL, or its token.
- Downloads use atomic temporary files and require the expected MP3 signature, exact byte length,
  and SHA-256 before playback.
- Corrupt files and descriptors are removed. Private files participate in the existing 64 MiB
  pronunciation cache limit.

The implementation uses the Expo SDK 56 `File` and `Directory` API:
<https://docs.expo.dev/versions/v56.0.0/sdk/filesystem/>.

## Strict client response checks

The client accepts only the backend's pinned version, locale, MIME type, byte bounds, UUID/hash
formats, and 60-second expiry. A signed URL must use the configured Supabase origin and the exact
current-account path:

```text
/storage/v1/object/sign/pron-private/{userId}/azure-private-preview-v1/{contentHash}.mp3
```

Only one non-empty `token` query parameter is accepted. The URL is consumed for the immediate
verified download and is never persisted.

## Files

- `src/features/pronunciation/private-cloud.ts`
- `src/features/pronunciation/private-cache.ts`
- `src/features/pronunciation/private-consent.tsx`
- `src/features/pronunciation/private-consent-provider.tsx`
- `src/components/private-pronunciation-button.tsx`
- `src/app/private-pronunciation.tsx`
- Targeted orchestration, control, Settings, layout, environment, and test updates

No database migration, PowerSync change, backend contract change, dependency, remote deployment,
real Azure request, or EAS build is part of Phase 5B.

## Local verification

- All 63 Jest suites (279 tests) pass, including strict private response/URL validation,
  account-specific consent transitions, consent-off request blocking, deletion retry, verified
  cache reuse/corruption handling, signed-token/raw-text non-persistence, playback orchestration,
  Settings state, and disclosure behavior.
- TypeScript, Expo lint, offline-manifest verification, and Android/iOS/web Expo export pass.
- Expo Doctor remains at the pre-existing 19/21 baseline: an existing CLI dependency carries a
  second React copy, and React Native Directory has incomplete metadata for Quick SQLite and the
  two local native modules.
- No remote Supabase deployment, real Azure request, physical-device Phase 5B test, or EAS build
  was performed.

## Remaining release gates

- Deploy and validate Phase 5A/5B only after explicit approval.
- Update the product privacy policy and confirm the Microsoft DPA before user text leaves a device.
- Deploy and schedule the locally implemented Phase 5C removal of expired database metadata and
  private Storage objects.
- Set production monitoring and complete remote two-account isolation testing.
- Verify the native experience on physical Android and iOS devices. iOS remains deferred until a
  device is available.
- Keep Spanish, German, and Greek on device speech until their provider voices and backend support
  are separately approved.
