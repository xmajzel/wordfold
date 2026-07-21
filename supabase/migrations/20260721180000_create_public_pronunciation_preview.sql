create table public.pronunciation_catalog_inputs (
  catalog_sense_id text primary key,
  text text not null check (length(trim(text)) between 1 and 200),
  source text not null check (source in ('cefr-j', 'octanove')),
  source_version text not null check (length(trim(source_version)) > 0),
  catalog_sha256 text not null check (catalog_sha256 ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pronunciation_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_sense_id text not null references public.pronunciation_catalog_inputs(catalog_sense_id),
  locale text not null check (locale in ('en-US', 'en-GB', 'sk-SK')),
  provider text not null check (provider = 'azure'),
  voice_id text not null check (length(trim(voice_id)) > 0),
  model_tier text not null check (model_tier = 'Standard Neural S0'),
  output_format text not null check (output_format = 'audio-24khz-96kbitrate-mono-mp3'),
  synthesis_version text not null check (synthesis_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  request_key text not null unique check (request_key ~ '^[a-f0-9]{64}$'),
  content_hash text not null unique check (content_hash = request_key),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer check (byte_length is null or byte_length between 101 and 1048576),
  object_key text not null unique check (
    object_key = synthesis_version || '/' || content_hash || '.mp3'
  ),
  status text not null check (status in ('pending', 'ready', 'failed')),
  failure_code text check (
    failure_code is null or failure_code in (
      'budget_limited',
      'provider_auth',
      'provider_rejected',
      'provider_timeout',
      'provider_unavailable',
      'invalid_audio',
      'storage_failed',
      'internal'
    )
  ),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and sha256 is null and byte_length is null and failure_code is null
      and lease_token is not null and lease_expires_at is not null)
    or (status = 'ready' and sha256 is not null and byte_length is not null and failure_code is null
      and lease_token is null and lease_expires_at is null)
    or (status = 'failed' and sha256 is null and byte_length is null and failure_code is not null
      and lease_token is null and lease_expires_at is null)
  )
);

create index pronunciation_assets_status_lease_idx
  on public.pronunciation_assets(status, lease_expires_at);

create table public.pronunciation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_sense_id text not null references public.pronunciation_catalog_inputs(catalog_sense_id),
  locale text not null check (locale in ('en-US', 'en-GB')),
  request_key text not null check (request_key ~ '^[a-f0-9]{64}$'),
  request_kind text not null check (request_kind in ('cache_hit', 'pending', 'generation')),
  billed_characters integer not null default 0 check (billed_characters between 0 and 200),
  outcome text not null check (
    outcome in ('allowed', 'rate_limited', 'user_budget_limited', 'global_budget_limited')
  ),
  created_at timestamptz not null default now(),
  check ((request_kind = 'generation' and outcome = 'allowed') or billed_characters = 0)
);

create index pronunciation_requests_user_time_idx
  on public.pronunciation_requests(user_id, created_at desc);

create index pronunciation_requests_global_time_idx
  on public.pronunciation_requests(created_at desc);

alter table public.pronunciation_catalog_inputs enable row level security;
alter table public.pronunciation_assets enable row level security;
alter table public.pronunciation_requests enable row level security;

revoke all on table public.pronunciation_catalog_inputs from public, anon, authenticated;
revoke all on table public.pronunciation_assets from public, anon, authenticated;
revoke all on table public.pronunciation_requests from public, anon, authenticated;
revoke all on table public.pronunciation_catalog_inputs from powersync_role;
revoke all on table public.pronunciation_assets from powersync_role;
revoke all on table public.pronunciation_requests from powersync_role;

grant select on table public.pronunciation_catalog_inputs to service_role;
grant select on table public.pronunciation_assets to service_role;

comment on table public.pronunciation_catalog_inputs is
  'Service-owned allowlist of canonical public catalog terms eligible for neural pronunciation.';
comment on table public.pronunciation_assets is
  'Service-owned immutable public neural pronunciation asset metadata; not synchronized.';
comment on table public.pronunciation_requests is
  'Bounded server-side pronunciation invocation and generation-budget audit records.';

create function public.claim_public_pronunciation(
  p_catalog_sense_id text,
  p_locale text,
  p_provider text,
  p_voice_id text,
  p_model_tier text,
  p_output_format text,
  p_synthesis_version text,
  p_request_key text,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.pronunciation_assets%rowtype;
  v_claimed boolean := false;
  v_lease_token uuid;
begin
  if p_catalog_sense_id is null
    or p_locale is null
    or p_locale not in ('en-US', 'en-GB')
    or p_voice_id is null
    or length(trim(p_voice_id)) = 0
    or p_synthesis_version is null
    or p_request_key is null
    or p_lease_seconds is null
    or p_provider is distinct from 'azure'
    or p_model_tier is distinct from 'Standard Neural S0'
    or p_output_format is distinct from 'audio-24khz-96kbitrate-mono-mp3'
    or p_synthesis_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_request_key !~ '^[a-f0-9]{64}$'
    or p_lease_seconds not between 10 and 300 then
    raise exception 'invalid pronunciation claim' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.pronunciation_catalog_inputs
    where catalog_sense_id = p_catalog_sense_id
      and enabled
  ) then
    raise exception 'catalog pronunciation input not found' using errcode = '22023';
  end if;

  v_lease_token := gen_random_uuid();
  insert into public.pronunciation_assets (
    catalog_sense_id,
    locale,
    provider,
    voice_id,
    model_tier,
    output_format,
    synthesis_version,
    request_key,
    content_hash,
    object_key,
    status,
    lease_token,
    lease_expires_at
  ) values (
    p_catalog_sense_id,
    p_locale,
    p_provider,
    p_voice_id,
    p_model_tier,
    p_output_format,
    p_synthesis_version,
    p_request_key,
    p_request_key,
    p_synthesis_version || '/' || p_request_key || '.mp3',
    'pending',
    v_lease_token,
    clock_timestamp() + make_interval(secs => p_lease_seconds)
  )
  on conflict (request_key) do nothing
  returning * into v_asset;

  if found then
    v_claimed := true;
  else
    select *
    into v_asset
    from public.pronunciation_assets
    where request_key = p_request_key
    for update;

    if v_asset.locale is distinct from p_locale
      or v_asset.provider is distinct from p_provider
      or v_asset.voice_id is distinct from p_voice_id
      or v_asset.model_tier is distinct from p_model_tier
      or v_asset.output_format is distinct from p_output_format
      or v_asset.synthesis_version is distinct from p_synthesis_version then
      raise exception 'pronunciation request identity collision' using errcode = '22000';
    end if;

    if v_asset.status = 'failed'
      or (v_asset.status = 'pending' and v_asset.lease_expires_at <= clock_timestamp()) then
      v_lease_token := gen_random_uuid();
      update public.pronunciation_assets
      set catalog_sense_id = p_catalog_sense_id,
          status = 'pending',
          sha256 = null,
          byte_length = null,
          failure_code = null,
          lease_token = v_lease_token,
          lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
          updated_at = clock_timestamp()
      where id = v_asset.id
      returning * into v_asset;
      v_claimed := true;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_asset.id,
    'status', v_asset.status,
    'claimed', v_claimed,
    'leaseToken', case when v_claimed then v_asset.lease_token else null end,
    'requestKey', v_asset.request_key,
    'contentHash', v_asset.content_hash,
    'sha256', v_asset.sha256,
    'byteLength', v_asset.byte_length,
    'objectKey', v_asset.object_key,
    'locale', v_asset.locale,
    'synthesisVersion', v_asset.synthesis_version
  );
end;
$$;

create function public.complete_public_pronunciation(
  p_request_key text,
  p_lease_token uuid,
  p_sha256 text,
  p_byte_length integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.pronunciation_assets%rowtype;
begin
  if p_request_key is null or p_lease_token is null or p_sha256 is null or p_byte_length is null
    or p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_length not between 101 and 1048576 then
    raise exception 'invalid pronunciation asset metadata' using errcode = '22023';
  end if;

  update public.pronunciation_assets
  set status = 'ready',
      sha256 = p_sha256,
      byte_length = p_byte_length,
      failure_code = null,
      lease_token = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  where request_key = p_request_key
    and status = 'pending'
    and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp()
  returning * into v_asset;

  if not found then
    raise exception 'pronunciation lease is invalid or expired' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'id', v_asset.id,
    'status', v_asset.status,
    'requestKey', v_asset.request_key,
    'contentHash', v_asset.content_hash,
    'sha256', v_asset.sha256,
    'byteLength', v_asset.byte_length,
    'objectKey', v_asset.object_key,
    'locale', v_asset.locale,
    'synthesisVersion', v_asset.synthesis_version
  );
end;
$$;

create function public.fail_public_pronunciation(
  p_request_key text,
  p_lease_token uuid,
  p_failure_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_key is null or p_lease_token is null or p_failure_code is null or p_failure_code not in (
    'budget_limited',
    'provider_auth',
    'provider_rejected',
    'provider_timeout',
    'provider_unavailable',
    'invalid_audio',
    'storage_failed',
    'internal'
  ) then
    raise exception 'invalid pronunciation failure code' using errcode = '22023';
  end if;

  update public.pronunciation_assets
  set status = 'failed',
      sha256 = null,
      byte_length = null,
      failure_code = p_failure_code,
      lease_token = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  where request_key = p_request_key
    and status = 'pending'
    and lease_token = p_lease_token;

  if not found then
    raise exception 'pronunciation lease is invalid' using errcode = '55000';
  end if;
end;
$$;

create function public.authorize_public_pronunciation_request(
  p_user_id uuid,
  p_catalog_sense_id text,
  p_locale text,
  p_request_key text,
  p_request_kind text,
  p_billed_characters integer,
  p_user_hourly_request_limit integer,
  p_user_daily_character_limit integer,
  p_global_daily_character_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hourly_requests bigint;
  v_user_daily_characters bigint;
  v_global_daily_characters bigint;
  v_outcome text := 'allowed';
  v_request_id uuid;
begin
  if p_user_id is null
    or p_catalog_sense_id is null
    or p_locale is null
    or p_locale not in ('en-US', 'en-GB')
    or p_request_key is null
    or p_request_kind is null
    or p_billed_characters is null
    or p_user_hourly_request_limit is null
    or p_user_daily_character_limit is null
    or p_global_daily_character_limit is null
    or p_request_key !~ '^[a-f0-9]{64}$'
    or p_request_kind not in ('cache_hit', 'pending', 'generation')
    or p_billed_characters not between 0 and 200
    or (p_request_kind = 'generation' and p_billed_characters = 0)
    or (p_request_kind <> 'generation' and p_billed_characters <> 0)
    or p_user_hourly_request_limit not between 1 and 1000
    or p_user_daily_character_limit not between 1 and 1000000
    or p_global_daily_character_limit not between 1 and 100000000 then
    raise exception 'invalid pronunciation budget request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(2147483000);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  delete from public.pronunciation_requests
  where created_at < clock_timestamp() - interval '30 days';

  select count(*)
  into v_hourly_requests
  from public.pronunciation_requests
  where user_id = p_user_id
    and created_at >= clock_timestamp() - interval '1 hour';

  if v_hourly_requests >= p_user_hourly_request_limit then
    v_outcome := 'rate_limited';
  elsif p_request_kind = 'generation' then
    select coalesce(sum(billed_characters), 0)
    into v_user_daily_characters
    from public.pronunciation_requests
    where user_id = p_user_id
      and outcome = 'allowed'
      and created_at >= date_trunc('day', clock_timestamp());

    select coalesce(sum(billed_characters), 0)
    into v_global_daily_characters
    from public.pronunciation_requests
    where outcome = 'allowed'
      and created_at >= date_trunc('day', clock_timestamp());

    if v_user_daily_characters + p_billed_characters > p_user_daily_character_limit then
      v_outcome := 'user_budget_limited';
    elsif v_global_daily_characters + p_billed_characters > p_global_daily_character_limit then
      v_outcome := 'global_budget_limited';
    end if;
  end if;

  insert into public.pronunciation_requests (
    user_id,
    catalog_sense_id,
    locale,
    request_key,
    request_kind,
    billed_characters,
    outcome
  ) values (
    p_user_id,
    p_catalog_sense_id,
    p_locale,
    p_request_key,
    p_request_kind,
    case when v_outcome = 'allowed' then p_billed_characters else 0 end,
    v_outcome
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'allowed', v_outcome = 'allowed',
    'reason', case when v_outcome = 'allowed' then null else v_outcome end,
    'requestId', v_request_id
  );
end;
$$;

revoke execute on function public.claim_public_pronunciation(
  text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated;
revoke execute on function public.complete_public_pronunciation(text, uuid, text, integer)
  from public, anon, authenticated;
revoke execute on function public.fail_public_pronunciation(text, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.authorize_public_pronunciation_request(
  uuid, text, text, text, text, integer, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.claim_public_pronunciation(
  text, text, text, text, text, text, text, text, integer
) to service_role;
grant execute on function public.complete_public_pronunciation(text, uuid, text, integer)
  to service_role;
grant execute on function public.fail_public_pronunciation(text, uuid, text)
  to service_role;
grant execute on function public.authorize_public_pronunciation_request(
  uuid, text, text, text, text, integer, integer, integer, integer
) to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'pron-public',
  'pron-public',
  true,
  1048576,
  array['audio/mpeg']
);
