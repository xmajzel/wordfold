alter table public.pronunciation_private_assets
  add column cleanup_token uuid,
  add column cleanup_expires_at timestamptz;

alter table public.pronunciation_private_assets
  add constraint pronunciation_private_assets_cleanup_lease_check check (
    (cleanup_token is null and cleanup_expires_at is null)
    or (cleanup_token is not null and cleanup_expires_at is not null)
  );

create index pronunciation_private_assets_cleanup_expiry_idx
  on public.pronunciation_private_assets(expires_at, cleanup_expires_at);

comment on column public.pronunciation_private_assets.cleanup_token is
  'Service-only lease token used while the corresponding private Storage object is being deleted.';

comment on column public.pronunciation_private_assets.cleanup_expires_at is
  'Expiry for a private pronunciation cleanup lease; stale leases may be reclaimed by a later cleanup run.';

create or replace function public.claim_private_pronunciation(
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
  v_response_status text;
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

    if v_asset.cleanup_token is null then
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
  end if;

  v_response_status := case
    when v_asset.cleanup_token is not null then 'deleting'
    else v_asset.status
  end;

  return jsonb_build_object(
    'id', v_asset.id,
    'ownerUserId', v_asset.owner_user_id,
    'status', v_response_status,
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

create function public.claim_expired_private_pronunciations(
  p_limit integer default 100,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cleanup_token uuid := gen_random_uuid();
  v_assets jsonb;
begin
  if p_limit is null
    or p_lease_seconds is null
    or p_limit not between 1 and 100
    or p_lease_seconds not between 60 and 600 then
    raise exception 'invalid private pronunciation cleanup claim' using errcode = '22023';
  end if;

  with candidates as (
    select id
    from public.pronunciation_private_assets
    where expires_at <= clock_timestamp()
      and (
        cleanup_token is null
        or cleanup_expires_at <= clock_timestamp()
      )
    order by expires_at, id
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.pronunciation_private_assets as asset
    set cleanup_token = v_cleanup_token,
        cleanup_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        updated_at = clock_timestamp()
    from candidates
    where asset.id = candidates.id
    returning
      asset.id,
      asset.owner_user_id,
      asset.request_key,
      asset.object_key,
      asset.synthesis_version
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'ownerUserId', owner_user_id,
        'requestKey', request_key,
        'objectKey', object_key,
        'synthesisVersion', synthesis_version
      )
      order by object_key
    ),
    '[]'::jsonb
  )
  into v_assets
  from claimed;

  return jsonb_build_object(
    'cleanupToken', v_cleanup_token,
    'assets', v_assets
  );
end;
$$;

create function public.finalize_expired_private_pronunciations(
  p_asset_ids uuid[],
  p_cleanup_token uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if p_asset_ids is null
    or p_cleanup_token is null
    or cardinality(p_asset_ids) not between 1 and 100
    or array_position(p_asset_ids, null) is not null then
    raise exception 'invalid private pronunciation cleanup finalization' using errcode = '22023';
  end if;

  delete from public.pronunciation_private_assets
  where id = any(p_asset_ids)
    and cleanup_token = p_cleanup_token;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create function public.release_expired_private_pronunciations(
  p_asset_ids uuid[],
  p_cleanup_token uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released bigint;
begin
  if p_asset_ids is null
    or p_cleanup_token is null
    or cardinality(p_asset_ids) not between 1 and 100
    or array_position(p_asset_ids, null) is not null then
    raise exception 'invalid private pronunciation cleanup release' using errcode = '22023';
  end if;

  update public.pronunciation_private_assets
  set cleanup_token = null,
      cleanup_expires_at = null,
      updated_at = clock_timestamp()
  where id = any(p_asset_ids)
    and cleanup_token = p_cleanup_token;
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

create function public.prune_pronunciation_requests(p_limit integer default 1000)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'invalid pronunciation request prune limit' using errcode = '22023';
  end if;

  with expired as (
    select id
    from public.pronunciation_requests
    where created_at < clock_timestamp() - interval '30 days'
    order by created_at, id
    for update skip locked
    limit p_limit
  )
  delete from public.pronunciation_requests as request
  using expired
  where request.id = expired.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.claim_expired_private_pronunciations(integer, integer)
  from public, anon, authenticated, powersync_role;
revoke execute on function public.finalize_expired_private_pronunciations(uuid[], uuid)
  from public, anon, authenticated, powersync_role;
revoke execute on function public.release_expired_private_pronunciations(uuid[], uuid)
  from public, anon, authenticated, powersync_role;
revoke execute on function public.prune_pronunciation_requests(integer)
  from public, anon, authenticated, powersync_role;

grant execute on function public.claim_expired_private_pronunciations(integer, integer)
  to service_role;
grant execute on function public.finalize_expired_private_pronunciations(uuid[], uuid)
  to service_role;
grant execute on function public.release_expired_private_pronunciations(uuid[], uuid)
  to service_role;
grant execute on function public.prune_pronunciation_requests(integer)
  to service_role;
