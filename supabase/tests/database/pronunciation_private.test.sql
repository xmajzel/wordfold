begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table(
  'public',
  'pronunciation_private_assets',
  'private pronunciation asset metadata exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.pronunciation_private_assets'::regclass),
  'private pronunciation assets have RLS enabled'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.pronunciation_private_assets',
    'SELECT, INSERT, UPDATE, DELETE'
  )
    and not has_table_privilege(
      'authenticated',
      'public.pronunciation_private_assets',
      'SELECT, INSERT, UPDATE, DELETE'
    ),
  'application roles cannot access private pronunciation metadata'
);

select ok(
  not has_table_privilege('powersync_role', 'public.pronunciation_private_assets', 'SELECT'),
  'PowerSync cannot read private pronunciation metadata'
);

select is(
  (
    select count(*)
    from pg_publication_tables
    where pubname = 'powersync'
      and tablename = 'pronunciation_private_assets'
  ),
  0::bigint,
  'private pronunciation metadata is absent from the PowerSync publication'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pronunciation_private_assets'
      and column_name in ('text', 'input_text', 'synthesis_text')
  ),
  0::bigint,
  'private pronunciation metadata has no raw synthesis text column'
);

select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'pron-private'
      and not public
      and file_size_limit = 1048576
      and allowed_mime_types = array['audio/mpeg']
  ),
  'pron-private is a private MP3-only bucket with a one-megabyte limit'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and ('anon' = any(roles) or 'authenticated' = any(roles))
      and (qual like '%pron-private%' or with_check like '%pron-private%')
  ),
  'application roles have no direct pron-private Storage policy'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_private_pronunciation(uuid,text,text,text,text,text,text,text,integer)',
    'EXECUTE'
  )
    and has_function_privilege(
      'service_role',
      'public.claim_private_pronunciation(uuid,text,text,text,text,text,text,text,integer)',
      'EXECUTE'
    ),
  'only the service role can claim private pronunciation generation'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000000a1', 'private-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'private-b@example.test');

select lives_ok(
  $$
    select public.authorize_private_pronunciation_request(
      '00000000-0000-4000-8000-0000000000b2',
      'en-US',
      repeat('f', 64),
      'cache_hit',
      0,
      20000,
      1000000,
      100000000
    )
  $$,
  'private authorization accepts the same configured maxima as the public endpoint'
);

create temporary table private_claim_a as
select public.claim_private_pronunciation(
  '00000000-0000-4000-8000-0000000000a1',
  'en-US',
  'azure',
  'en-US-AvaNeural',
  'Standard Neural S0',
  'audio-24khz-96kbitrate-mono-mp3',
  'azure-private-preview-v1',
  repeat('a', 64),
  120
) as value;

select ok(
  (select (value->>'claimed')::boolean from private_claim_a),
  'the first per-user private request owns the generation lease'
);

select is(
  (select value->>'objectKey' from private_claim_a),
  '00000000-0000-4000-8000-0000000000a1/azure-private-preview-v1/'
    || repeat('a', 64) || '.mp3',
  'the private object key is namespaced by its authenticated owner'
);

select lives_ok(
  $$
    select public.claim_private_pronunciation(
      '00000000-0000-4000-8000-0000000000b2',
      'en-US',
      'azure',
      'en-US-AvaNeural',
      'Standard Neural S0',
      'audio-24khz-96kbitrate-mono-mp3',
      'azure-private-preview-v1',
      repeat('a', 64),
      120
    )
  $$,
  'another owner can hold an isolated asset even for the same request hash'
);

select lives_ok(
  format(
    'select public.complete_private_pronunciation(%L, %L, %L, %L, 256)',
    '00000000-0000-4000-8000-0000000000a1',
    repeat('a', 64),
    (select value->>'leaseToken' from private_claim_a),
    repeat('b', 64)
  ),
  'the owning user and lease can complete private asset metadata'
);

select throws_ok(
  format(
    'select public.complete_private_pronunciation(%L, %L, %L, %L, 256)',
    '00000000-0000-4000-8000-0000000000b2',
    repeat('a', 64),
    (select value->>'leaseToken' from private_claim_a),
    repeat('c', 64)
  ),
  '55000',
  'private pronunciation lease is invalid or expired',
  'one owner cannot complete another owner''s lease'
);

select ok(
  (
    public.authorize_public_pronunciation_request(
      '00000000-0000-4000-8000-0000000000a1',
      '00001740-a:able',
      'en-US',
      repeat('d', 64),
      'generation',
      5,
      100,
      100,
      10
    )->>'allowed'
  )::boolean,
  'public generation enters the shared pronunciation budget ledger'
);

select is(
  public.authorize_private_pronunciation_request(
    '00000000-0000-4000-8000-0000000000a1',
    'sk-SK',
    repeat('e', 64),
    'generation',
    7,
    100,
    100,
    10
  )->>'reason',
  'global_budget_limited',
  'private generation observes public usage in the shared global budget'
);

select ok(
  exists (
    select 1
    from public.pronunciation_requests
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and request_scope = 'private'
      and catalog_sense_id is null
      and billed_characters = 0
  ),
  'private audit records contain identity and budget metadata but no catalog or raw text'
);

select is(
  public.delete_private_pronunciation_metadata(
    '00000000-0000-4000-8000-0000000000a1'
  ),
  1::bigint,
  'private metadata deletion is scoped to one owner'
);

select is(
  (
    select count(*)
    from public.pronunciation_private_assets
    where owner_user_id = '00000000-0000-4000-8000-0000000000a1'
  ),
  0::bigint,
  'the selected owner private asset metadata is removed'
);

select is(
  (
    select count(*)
    from public.pronunciation_private_assets
    where owner_user_id = '00000000-0000-4000-8000-0000000000b2'
  ),
  1::bigint,
  'another owner private asset metadata remains isolated'
);

select ok(
  exists (
    select 1
    from public.pronunciation_requests
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and request_scope = 'public'
  )
    and not exists (
      select 1
      from public.pronunciation_requests
      where user_id = '00000000-0000-4000-8000-0000000000a1'
        and request_scope = 'private'
    ),
  'opt-out deletion removes private audits without deleting public usage records'
);

select * from finish();

rollback;
