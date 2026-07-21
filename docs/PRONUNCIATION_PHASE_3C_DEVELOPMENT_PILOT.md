# Pronunciation Phase 3C: development pilot

Status: **development infrastructure deployed on July 21, 2026; first Azure request awaiting
separate approval**.

## Product-owner decision

Jozef is the budget owner. The approved server limits are:

- 20 requests per authenticated user per hour;
- 1,000 newly generated characters per authenticated user per day;
- 10,000 newly generated characters globally per day.

The product owner approves submitting the licensed CEFR-J/Octanove-derived catalog headwords to
Azure Speech and distributing the resulting synthetic pronunciation MP3s for this development
pilot, with the existing source attribution retained. This is not approval for a public production
release and is not represented as independent legal advice.

## Approved rollout boundary

- Deploy the three pending, ordered migrations to the linked development Supabase project.
- Deploy only the updated PowerSync sync configuration after the new word locale columns exist.
- Configure only the Azure Speech settings and the three approved pronunciation limits.
- Deploy only the authenticated `pronunciation-public` Edge Function with JWT verification enabled.
- Enable the client preview only in the ignored local app environment.
- Stop for separate immediate approval before the first request that can incur Azure usage.

No production rollout, private/manual cloud pronunciation, bulk generation, EAS build, or public
app feature enablement is approved by this decision.

## Deployment record

- Supabase migrations `20260721000000`, `20260721180000`, and `20260721180500` were applied to the
  linked development project. Remote history is aligned, database lint reports no errors, and
  table statistics report 8,300 catalog inputs with no pronunciation assets or requests.
- Only the PowerSync Sync Streams configuration was deployed. Its stored service connection was
  not overwritten; replication completed with zero lag and no errors. The word stream now includes
  both exact pronunciation-locale columns, and pronunciation backend tables remain unsynchronized.
- Exactly the three Azure Speech settings and three approved limit settings were added as Edge
  Function secrets. The fake-provider flag and endpoint were not configured.
- `pronunciation-public` version 1 is active with JWT verification enabled. An unauthenticated POST
  returned `401`; it could not reach Azure or consume provider characters.
- The preview flag is enabled only in the ignored local `.env`. No authenticated function request,
  Azure generation, public MP3, EAS build, or production app release has occurred.

## Rollback boundary

If the pilot fails, disable the local client flag and remove or invalidate the function's Azure
credential. Keep the additive multilingual word columns and server-owned pronunciation schema in
place unless a separately reviewed data migration is approved; destructive rollback is not part of
this pilot.
