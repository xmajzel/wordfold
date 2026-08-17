alter table public.pronunciation_requests
  drop constraint pronunciation_requests_locale_check;

alter table public.pronunciation_requests
  add constraint pronunciation_requests_locale_check
    check (locale in ('en-US', 'en-GB', 'sk-SK'));

alter table public.pronunciation_requests
  add column request_scope text not null default 'public'
    check (request_scope in ('public', 'private'));

alter table public.pronunciation_requests
  alter column catalog_sense_id drop not null;

alter table public.pronunciation_requests
  add constraint pronunciation_requests_scope_identity_check check (
    (request_scope = 'public' and catalog_sense_id is not null)
    or (request_scope = 'private' and catalog_sense_id is null)
  );

comment on table public.pronunciation_requests is
  'Bounded server-side public and private pronunciation invocation and generation-budget audit records; private rows never contain synthesis text.';

create table public.pronunciation_private_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  locale text not null check (locale in ('en-US', 'en-GB', 'sk-SK')),
  provider text not null check (provider = 'azure'),
  voice_id text not null check (length(trim(voice_id)) > 0),
  model_tier text not null check (model_tier = 'Standard Neural S0'),
  output_format text not null check (output_format = 'audio-24khz-96kbitrate-mono-mp3'),
  synthesis_version text not null check (synthesis_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  request_key text not null check (request_key ~ '^[a-f0-9]{64}$'),
  content_hash text not null check (content_hash = request_key),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer check (byte_length is null or byte_length between 101 and 1048576),
  object_key text not null unique check (
    object_key = owner_user_id::text || '/' || synthesis_version || '/' || content_hash || '.mp3'
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
  last_accessed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, request_key),
  check (expires_at > last_accessed_at),
  check (
    (status = 'pending' and sha256 is null and byte_length is null and failure_code is null
      and lease_token is not null and lease_expires_at is not null)
    or (status = 'ready' and sha256 is not null and byte_length is not null and failure_code is null
      and lease_token is null and lease_expires_at is null)
    or (status = 'failed' and sha256 is null and byte_length is null and failure_code is not null
      and lease_token is null and lease_expires_at is null)
  )
);

create index pronunciation_private_assets_owner_expiry_idx
  on public.pronunciation_private_assets(owner_user_id, expires_at);

create index pronunciation_private_assets_status_lease_idx
  on public.pronunciation_private_assets(status, lease_expires_at);

alter table public.pronunciation_private_assets enable row level security;

revoke all on table public.pronunciation_private_assets from public, anon, authenticated;
revoke all on table public.pronunciation_private_assets from powersync_role;
grant select on table public.pronunciation_private_assets to service_role;

comment on table public.pronunciation_private_assets is
  'Service-owned per-user neural pronunciation metadata. Synthesis text is intentionally never persisted.';

create function public.claim_private_pronunciation(
  p_owner_user_id uuid,
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
  v_asset public.pronunciation_private_assets%rowtype;
  v_claimed boolean := false;
  v_lease_token uuid;
begin
  if p_owner_user_id is null
    or p_locale is null
    or p_locale not in ('en-US', 'en-GB', 'sk-SK')
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
    raise exception 'invalid private pronunciation claim' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text, 1));
  v_lease_token := gen_random_uuid();
  insert into public.pronunciation_private_assets (
    owner_user_id,
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
    p_owner_user_id,
    p_locale,
    p_provider,
    p_voice_id,
    p_model_tier,
    p_output_format,
    p_synthesis_version,
    p_request_key,
    p_request_key,
    p_owner_user_id::text || '/' || p_synthesis_version || '/' || p_request_key || '.mp3',
    'pending',
    v_lease_token,
    clock_timestamp() + make_interval(secs => p_lease_seconds)
  )
  on conflict (owner_user_id, request_key) do nothing
  returning * into v_asset;

  if found then
    v_claimed := true;
  else
    select *
    into v_asset
    from public.pronunciation_private_assets
    where owner_user_id = p_owner_user_id
      and request_key = p_request_key
    for update;

    if v_asset.owner_user_id is distinct from p_owner_user_id
      or v_asset.locale is distinct from p_locale
      or v_asset.provider is distinct from p_provider
      or v_asset.voice_id is distinct from p_voice_id
      or v_asset.model_tier is distinct from p_model_tier
      or v_asset.output_format is distinct from p_output_format
      or v_asset.synthesis_version is distinct from p_synthesis_version then
      raise exception 'private pronunciation request identity collision' using errcode = '22000';
    end if;

    if v_asset.status = 'failed'
      or (v_asset.status = 'pending' and v_asset.lease_expires_at <= clock_timestamp()) then
      v_lease_token := gen_random_uuid();
      update public.pronunciation_private_assets
      set status = 'pending',
          sha256 = null,
          byte_length = null,
          failure_code = null,
          lease_token = v_lease_token,
          lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
          last_accessed_at = clock_timestamp(),
          expires_at = clock_timestamp() + interval '30 days',
          updated_at = clock_timestamp()
      where id = v_asset.id
      returning * into v_asset;
      v_claimed := true;
    elsif v_asset.status = 'ready' then
      update public.pronunciation_private_assets
      set last_accessed_at = clock_timestamp(),
          expires_at = clock_timestamp() + interval '30 days',
          updated_at = clock_timestamp()
      where id = v_asset.id
      returning * into v_asset;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_asset.id,
    'ownerUserId', v_asset.owner_user_id,
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

create function public.complete_private_pronunciation(
  p_owner_user_id uuid,
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
  v_asset public.pronunciation_private_assets%rowtype;
begin
  if p_owner_user_id is null or p_request_key is null or p_lease_token is null
    or p_sha256 is null or p_byte_length is null
    or p_request_key !~ '^[a-f0-9]{64}$'
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_byte_length not between 101 and 1048576 then
    raise exception 'invalid private pronunciation asset metadata' using errcode = '22023';
  end if;

  update public.pronunciation_private_assets
  set status = 'ready',
      sha256 = p_sha256,
      byte_length = p_byte_length,
      failure_code = null,
      lease_token = null,
      lease_expires_at = null,
      last_accessed_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '30 days',
      updated_at = clock_timestamp()
  where owner_user_id = p_owner_user_id
    and request_key = p_request_key
    and status = 'pending'
    and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp()
  returning * into v_asset;

  if not found then
    raise exception 'private pronunciation lease is invalid or expired' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'id', v_asset.id,
    'ownerUserId', v_asset.owner_user_id,
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

create function public.fail_private_pronunciation(
  p_owner_user_id uuid,
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
  if p_owner_user_id is null or p_request_key is null or p_lease_token is null
    or p_failure_code is null or p_request_key !~ '^[a-f0-9]{64}$'
    or p_failure_code not in (
      'budget_limited',
      'provider_auth',
      'provider_rejected',
      'provider_timeout',
      'provider_unavailable',
      'invalid_audio',
      'storage_failed',
      'internal'
    ) then
    raise exception 'invalid private pronunciation failure code' using errcode = '22023';
  end if;

  update public.pronunciation_private_assets
  set status = 'failed',
      sha256 = null,
      byte_length = null,
      failure_code = p_failure_code,
      lease_token = null,
      lease_expires_at = null,
      last_accessed_at = clock_timestamp(),
      expires_at = clock_timestamp() + interval '30 days',
      updated_at = clock_timestamp()
  where owner_user_id = p_owner_user_id
    and request_key = p_request_key
    and status = 'pending'
    and lease_token = p_lease_token;

  if not found then
    raise exception 'private pronunciation lease is invalid' using errcode = '55000';
  end if;
end;
$$;

create function public.authorize_private_pronunciation_request(
  p_user_id uuid,
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
    or p_locale is null
    or p_locale not in ('en-US', 'en-GB', 'sk-SK')
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
    or p_user_hourly_request_limit not between 1 and 20000
    or p_user_daily_character_limit not between 1 and 1000000
    or p_global_daily_character_limit not between 1 and 100000000 then
    raise exception 'invalid private pronunciation budget request' using errcode = '22023';
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
    outcome,
    request_scope
  ) values (
    p_user_id,
    null,
    p_locale,
    p_request_key,
    p_request_kind,
    case when v_outcome = 'allowed' then p_billed_characters else 0 end,
    v_outcome,
    'private'
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'allowed', v_outcome = 'allowed',
    'reason', case when v_outcome = 'allowed' then null else v_outcome end,
    'requestId', v_request_id
  );
end;
$$;

create function public.delete_private_pronunciation_metadata(p_owner_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if p_owner_user_id is null then
    raise exception 'invalid private pronunciation owner' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text, 1));
  delete from public.pronunciation_private_assets
  where owner_user_id = p_owner_user_id;
  get diagnostics v_deleted = row_count;

  delete from public.pronunciation_requests
  where user_id = p_owner_user_id
    and request_scope = 'private';

  return v_deleted;
end;
$$;

revoke execute on function public.claim_private_pronunciation(
  uuid, text, text, text, text, text, text, text, integer
) from public, anon, authenticated;
revoke execute on function public.complete_private_pronunciation(uuid, text, uuid, text, integer)
  from public, anon, authenticated;
revoke execute on function public.fail_private_pronunciation(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.authorize_private_pronunciation_request(
  uuid, text, text, text, integer, integer, integer, integer
) from public, anon, authenticated;
revoke execute on function public.delete_private_pronunciation_metadata(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_private_pronunciation(
  uuid, text, text, text, text, text, text, text, integer
) to service_role;
grant execute on function public.complete_private_pronunciation(uuid, text, uuid, text, integer)
  to service_role;
grant execute on function public.fail_private_pronunciation(uuid, text, uuid, text)
  to service_role;
grant execute on function public.authorize_private_pronunciation_request(
  uuid, text, text, text, integer, integer, integer, integer
) to service_role;
grant execute on function public.delete_private_pronunciation_metadata(uuid)
  to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'pron-private',
  'pron-private',
  false,
  1048576,
  array['audio/mpeg']
);
