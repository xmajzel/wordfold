# Spanish device pronunciation: launch scope and QA

## Approved pronunciation scope

The owner approved Phone / Elvira (es-ES) / Jorge (es-MX) for the A1–C2 course on 2026-09-14.
Jozef rated Elvira 30/30 acceptable for Spain and Erik rated Jorge 30/30 acceptable for Mexico,
with no wrong-locale flags. Additional listening review was explicitly waived by the owner.
This is owner approval with limited screening evidence; C2 has not been listening-reviewed.
The physical-device checks below remain unperformed evidence, not a request for another listening gate.

- Spain remains the default phone locale; Mexico is available when explicitly selected.
- Phone playback requires the exact installed locale, preferring an enhanced voice, and does not silently substitute another region.
- Public catalog playback uses the pinned regional Azure voice, with verified downloads for offline use.
- Private text retains the existing account consent, cleanup, and budget controls.
- English and Spanish preferences and audio manifests are separate.

## Generation and publication

The full A1–C2 Spanish audio catalog was generated and published on 2026-09-14: 6,689 Elvira
clips and 6,689 Jorge clips. Every stored file passed SHA-256, byte-length, MP3, 24 kHz, and mono
checks. The batch used 103,860 characters with no retries (estimated $3.1158 at the planning rate);
normal request limits were restored and the temporary generation account was removed.
`node scripts/build-pronunciation-catalog-sql.mjs --spanish --check` verifies the canonical Spanish
pronunciation inputs against the current A1–C2 course. Alternate terms sharing a concept use phone
playback when they differ from that concept's canonical audio text.
`node scripts/pronunciation-backfill.mjs plan --course es-sk --json` calculates the paid batch without
sending requests. Generation still requires explicit approval of that batch and its cost.
The Spanish runner uses a conservative $30/million-character planning rate and a $5 hard ceiling;
English retains its existing rate and $2 ceiling. Attempt accounting uses the selected plan's rate.

For future approved generation, the manifest tool supports `--course es-sk` for build, export,
verify, and publish. Spanish manifests must cover the entire pinned catalog with the selected voices.
After publication verification, set `assets/pronunciation/spanish-publication.json`'s `index` to the
verified publication's index descriptor (objectPath, sha256, byteLength). The current pin is
`30a48b8668314a2df9b568ee7615efe80cb0e001677b23d50a83d3b19ea960de`; its index and both shards
were downloaded again and verified after upload. An app release containing this pin is still required
for existing installations. English retains its existing immutable manifest.

The bundled Spanish Test voice clips use the same course sample as the phone voice:
“Hola. Aprender un idioma nuevo abre la puerta a nuevas ideas, lugares y conversaciones.”
The Elvira and Jorge clips were regenerated for this text; they have no new listening attestation
and are not additional C2 review evidence.

## Offline wording

Do not describe a device voice as offline merely because the locale appears in `Speech.getAvailableVoicesAsync()`. Expo Speech exposes voice identifier, language, name, and quality, but not the Android engine's network-required flag. Wordfold therefore says that offline availability depends on the device and must be tested in airplane mode.

Reference: [Expo Speech SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/speech/).

## Required physical-device evidence

These checks are release blockers. They must be run on representative physical devices and recorded with device model, OS version, speech engine, returned voice identifier/language/quality, connectivity state, spoken sample, observed result, and tester. Local automated tests are not physical-device evidence.

| Platform | Setup | Required observation | Status |
| --- | --- | --- | --- |
| Android | Exact `es-ES` voice installed, online | Spain Spanish sample plays; the selected voice reports exact `es-ES` | Not run |
| Android | `es-MX` installed but `es-ES` absent | Missing Spain voice guidance appears; no speech starts | Not run |
| Android | Exact `es-ES` installed, airplane mode | Record whether live playback and first-time file synthesis actually work; only then may this device/engine be called offline-capable | Not run |
| iOS | Exact `es-ES` voice installed, ringer on | Spain Spanish sample plays; selected voice reports exact `es-ES` | Not run |
| iOS | `es-MX` available but `es-ES` absent | Missing Spain voice guidance appears; no speech starts | Not run |
| iOS | Silent mode enabled | Confirm the documented no-audio behavior and that Wordfold's recovery guidance tells the user to disable silent mode | Not run |
| iOS | Exact `es-ES` installed, airplane mode, ringer on | Record whether live playback and first-time file synthesis actually work before making an offline claim | Not run |

For each successful playback, a Slovak-native Spanish reviewer should also rate:

- Spain Spanish region/accent is unmistakably correct;
- `r/rr`, `j/g`, `c/z`, stress, vowel clarity, and connected speech are acceptable;
- the sample and representative A1–C2 words are natural at rate `0.9` and pitch `1`;
- accessibility labels announce Spanish and Spain, and missing-voice instructions name the exact region.

The course sample is: “Hola. Aprender un idioma nuevo abre la puerta a nuevas ideas, lugares y conversaciones.” Additional native-speaker sign-off was waived by the owner; this sample has no new listening attestation.

## Browser limitations

Browser speech depends on the browser and operating-system voice inventory. Wordfold still requires an exact `es-ES` voice and shows missing-voice guidance otherwise, but it cannot install a browser voice, guarantee consistent voice quality, synthesize a reusable native audio file, or claim offline playback. Test at least current Safari and Chrome separately; results from one browser do not establish the other.
