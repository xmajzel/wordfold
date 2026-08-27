# Spanish device pronunciation: launch scope and QA

## Launch contract

- The approved Slovak → Spanish course pronunciation locale is `es-ES`.
- `es-MX` remains implemented only for backward-compatible playback of previously stored vocabulary. It is not selectable for new or edited Spanish course words until it passes its own device and native-speaker quality gate.
- Wordfold compares canonicalized BCP 47 locale tags and selects only an installed exact match. An `es-MX`, generic `es`, or any non-Spanish voice must never satisfy an `es-ES` request.
- Among exact matches, an enhanced system voice is preferred. Wordfold does not substitute another region or language when no exact voice is installed.
- Spanish does not use the English neural voices or English offline pronunciation packs. It uses the phone voice selected by the operating system.

The device path retains native file synthesis, per-user/guest caching, the 64 MiB cache limit, invalid-file cleanup, and a single live-speech fallback after cached-file playback or synthesis fails. Web uses live browser speech and does not use the native file cache.

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

The course sample is: “Hola. Aprender un idioma nuevo abre la puerta a nuevas ideas, lugares y conversaciones.” Its copy and rendered voice both require native-speaker sign-off before release.

## Browser limitations

Browser speech depends on the browser and operating-system voice inventory. Wordfold still requires an exact `es-ES` voice and shows missing-voice guidance otherwise, but it cannot install a browser voice, guarantee consistent voice quality, synthesize a reusable native audio file, or claim offline playback. Test at least current Safari and Chrome separately; results from one browser do not establish the other.
