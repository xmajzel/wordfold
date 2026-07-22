begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table('public', 'pronunciation_catalog_inputs', 'public pronunciation catalog allowlist exists');
select has_table('public', 'pronunciation_assets', 'public pronunciation asset metadata exists');
select has_table('public', 'pronunciation_requests', 'public pronunciation request audit exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.pronunciation_catalog_inputs'::regclass),
  'catalog pronunciation inputs have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pronunciation_assets'::regclass),
  'pronunciation assets have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pronunciation_requests'::regclass),
  'pronunciation requests have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.pronunciation_catalog_inputs', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'public.pronunciation_catalog_inputs', 'SELECT, INSERT, UPDATE, DELETE'),
  'application roles cannot access the catalog pronunciation allowlist'
);
select ok(
  not has_table_privilege('anon', 'public.pronunciation_assets', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'public.pronunciation_assets', 'SELECT, INSERT, UPDATE, DELETE'),
  'application roles cannot access pronunciation asset metadata'
);
select ok(
  not has_table_privilege('anon', 'public.pronunciation_requests', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'public.pronunciation_requests', 'SELECT, INSERT, UPDATE, DELETE'),
  'application roles cannot access pronunciation request audits'
);

select ok(
  not has_table_privilege('powersync_role', 'public.pronunciation_catalog_inputs', 'SELECT')
    and not has_table_privilege('powersync_role', 'public.pronunciation_assets', 'SELECT')
    and not has_table_privilege('powersync_role', 'public.pronunciation_requests', 'SELECT'),
  'PowerSync cannot read server-owned pronunciation tables'
);

select is(
  (
    select count(*)
    from pg_publication_tables
    where pubname = 'powersync'
      and tablename in ('pronunciation_catalog_inputs', 'pronunciation_assets', 'pronunciation_requests')
  ),
  0::bigint,
  'server-owned pronunciation tables are absent from the PowerSync publication'
);

select is(
  (select count(*) from public.pronunciation_catalog_inputs),
  8300::bigint,
  'the deterministic migration seeds all public CEFR pronunciation inputs'
);
select is(
  (select count(distinct catalog_sha256) from public.pronunciation_catalog_inputs),
  1::bigint,
  'all seeded pronunciation inputs identify one exact catalog build'
);

select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'pron-public'
      and public
      and file_size_limit = 1048576
      and allowed_mime_types = array['audio/mpeg']
  ),
  'pron-public is a public MP3-only bucket with a one-megabyte limit'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_public_pronunciation(text,text,text,text,text,text,text,text,integer)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.claim_public_pronunciation(text,text,text,text,text,text,text,text,integer)',
      'EXECUTE'
    ),
  'only the service role can claim pronunciation generation'
);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000091', 'pronunciation-test@example.test');

create temporary table pronunciation_test_claim as
select public.claim_public_pronunciation(
  '00001740-a:able',
  'en-US',
  'azure',
  'en-US-AvaNeural',
  'Standard Neural S0',
  'audio-24khz-96kbitrate-mono-mp3',
  'azure-public-preview-v1',
  repeat('a', 64),
  120
) as value;

select ok(
  (select (value->>'claimed')::boolean from pronunciation_test_claim),
  'the first canonical request owns the generation lease'
);
select is(
  (
    public.claim_public_pronunciation(
      '00001740-a:able',
      'en-US',
      'azure',
      'en-US-AvaNeural',
      'Standard Neural S0',
      'audio-24khz-96kbitrate-mono-mp3',
      'azure-public-preview-v1',
      repeat('a', 64),
      120
    )->>'claimed'
  )::boolean,
  false,
  'a concurrent canonical request cannot claim the same generation'
);

select throws_ok(
  $$
    select public.complete_public_pronunciation(
      repeat('a', 64),
      '00000000-0000-4000-8000-000000000099',
      repeat('b', 64),
      256
    )
  $$,
  '55000',
  'pronunciation lease is invalid or expired',
  'a different lease token cannot complete the asset'
);

select lives_ok(
  format(
    'select public.complete_public_pronunciation(%L, %L, %L, 256)',
    repeat('a', 64),
    (select value->>'leaseToken' from pronunciation_test_claim),
    repeat('b', 64)
  ),
  'the owning lease can complete validated asset metadata'
);

select is(
  (select status from public.pronunciation_assets where request_key = repeat('a', 64)),
  'ready',
  'completed pronunciation metadata is ready and immutable-addressed'
);

select ok(
  (
    public.authorize_public_pronunciation_request(
      '00000000-0000-4000-8000-000000000091',
      '00001740-a:able',
      'en-US',
      repeat('a', 64),
      'generation',
      5,
      1,
      100,
      1000
    )->>'allowed'
  )::boolean,
  'the first bounded generation request is authorized'
);

select is(
  public.authorize_public_pronunciation_request(
    '00000000-0000-4000-8000-000000000091',
    '00001740-a:able',
    'en-US',
    repeat('a', 64),
    'cache_hit',
    0,
    1,
    100,
    1000
  )->>'reason',
  'rate_limited',
  'the hourly invocation limit fails closed before another provider request'
);

select is(
  (select sum(billed_characters) from public.pronunciation_requests),
  5::bigint,
  'denied requests do not consume generation character budget'
);

update public.pronunciation_requests
set created_at = clock_timestamp() - interval '31 days'
where outcome = 'allowed';

select ok(
  (
    public.authorize_public_pronunciation_request(
      '00000000-0000-4000-8000-000000000091',
      '00001740-a:able',
      'en-US',
      repeat('a', 64),
      'cache_hit',
      0,
      10,
      100,
      1000
    )->>'allowed'
  )::boolean,
  'a later request triggers bounded audit retention without consuming generation budget'
);

select is(
  (select count(*) from public.pronunciation_requests where created_at < clock_timestamp() - interval '30 days'),
  0::bigint,
  'pronunciation request audit retention is bounded to thirty days'
);

select lives_ok(
  $$
    select public.authorize_public_pronunciation_request(
      '00000000-0000-4000-8000-000000000091',
      '00001740-a:able',
      'en-GB',
      repeat('b', 64),
      'cache_hit',
      0,
      20000,
      125000,
      125000
    )
  $$,
  'the approved temporary bulk limit is accepted by the budget gate'
);

select throws_ok(
  $$
    select public.authorize_public_pronunciation_request(
      '00000000-0000-4000-8000-000000000091',
      '00001740-a:able',
      'en-GB',
      repeat('c', 64),
      'cache_hit',
      0,
      20001,
      125000,
      125000
    )
  $$,
  '22023',
  'invalid pronunciation budget request',
  'hourly limits above the approved bulk ceiling fail closed'
);

select * from finish();

rollback;
